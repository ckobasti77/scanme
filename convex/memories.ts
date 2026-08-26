import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getEntitlement } from "./lib/entitlements";
import { requireBusinessAccess } from "./lib/access";
import { rateLimiter } from "./lib/rateLimits";
import { normalizeCode } from "./lib/codes";
import {
  generateUploadUrl,
  getUrl as storageGetUrl,
  remove as storageRemove,
} from "./lib/storage";
import { serviceMetricDateKey } from "./lib/serviceMetrics";
import { optionalText } from "./lib/validation";
import { fmt, getDict } from "../lib/i18n";
import { CONSENT_VERSION } from "../lib/i18n/sr/consent";

// =============================================================================
// TASK-14 — Memories: guest identity, sessions (nights), and the upload quota.
//
// This module answers "who is this person, and may they upload?". It contains
// NO image handling — the sharp transform lives in the TASK-15 route handler
// (app/api/m/[code]/process) and its Convex half in convex/memoriesPipeline.ts.
// A reservation here is a quota slot (a `reserved` memoriesPhotos row) plus,
// since TASK-15, the storage upload URL the client PUTs the original to; the
// pipeline later attaches the actual media to the slot.
//
// Identity model (RFC-001 §2.6): the card identifies the TABLE, the cookie
// identifies the PERSON. `guestKey` is a 256-bit bearer capability minted by
// the card resolver (convex/cards.ts); possession is the capability. Public
// functions take { code, guestKey } and look up by_spaceId_and_guestKey — the
// cookie's HMAC is verified at the Next.js layer, so these functions stay
// deterministic and cacheable with no crypto.
//
// THE QUOTA IS A SOFT LIMIT AND EXPLICITLY NOT A SECURITY BOUNDARY. Minting new
// guests is intentionally cheap (clear your cookie, scan again, be someone
// new); that residual is accepted by design and throttled only by the rate
// limiter. The single property that matters is that forging a SPECIFIC other
// guest's access requires their key. Do not "harden" this with SMS, email,
// accounts, or fingerprinting.
//
// Two invariants carried over from convex/venue.ts:
//   1. NO QUERY READS THE WALL CLOCK. Session and space state is materialized
//      by mutations, the scheduler, and the crons; queries read stored status.
//   2. Every limit is enforced server-side in the same transaction as the
//      write it gates (RFC §2.9).
//
// THE RESERVATION CONTRACT (TASK-16). A reservation is minted ONCE per
// intended photo and the returned `photoId` is the unit of intent for its
// whole lifetime:
//   - A retry NEVER calls reserveUpload again. Re-uploading against the
//     guest's own existing `reserved` or `processing` row is legal and is what
//     `renewUploadUrl` exists for (Convex upload URLs are short-lived and
//     single-use, so every retry needs a fresh one — against the SAME slot).
//     A second reservation for the same intended photo is a client bug: it
//     double-counts the guest's quota for one picture.
//   - When the client gives up on an upload for good, `releaseReservation`
//     frees the `reserved` slot immediately — the guest gets the quota back
//     now, not when the 24h reaper runs. Without it, a guest whose uploads
//     stalled when the phone locked is told they used their quota on photos
//     that never arrived.
// =============================================================================

const dict = getDict("memories");

// Sweep batch sizes: bounded per run, self-healing on the next tick.
const SWEEP_BATCH = 100;
// One day in ms — the retention cutoff arithmetic (TASK-20 STEP 2).
const DAY_MS = 24 * 60 * 60 * 1000;
// A space with no active entitlement (never paid, or expired) still gets swept:
// it keeps photos no longer than the shortest paid tier, never forever.
const RETENTION_DEFAULT_DAYS = 30;
// The purge does more work per row than a tombstone sweep (three storage
// deletes + the asset doc + archive pins), so it walks smaller batches.
const PURGE_BATCH = 25;
// A processed asset pinned into more Venue archives than this is not a real
// scenario; the wipe still deletes every pin it reads (RFC §2.10).
const ARCHIVE_PIN_READ_CAP = 100;
// A `reserved` row the client never followed up on is purged after 24 hours
// (RFC §2.9); its quota slot frees automatically because quota is an index
// count of live rows.
const RESERVED_TTL_MS = 24 * 60 * 60 * 1000;
// Admin grants are additive and bounded; the effective limit is additionally
// capped so the quota count's `.take()` stays a bounded read.
const GRANT_MAX = 500;
const EFFECTIVE_LIMIT_CAP = 500;
// Recurring nights: a photo taken before this Belgrade hour belongs to the
// previous night (RFC §2.4 C.5). Default 6 → a 01:00 photo is "yesterday".
const DEFAULT_NIGHT_CUTOFF_HOUR = 6;
// Bounded read for quota adjustments; rows are rare (hand-written grants).
const ADJUSTMENTS_READ_CAP = 50;

// -----------------------------------------------------------------------------
// Night/date helpers. serviceMetricDateKey is the existing Belgrade dateKey
// helper (convex/lib/serviceMetrics.ts) — reused, not copied a fourth time
// (RFC §1.f found three copies platform-wide).
// -----------------------------------------------------------------------------

export function sessionDateKey(timestamp: number, cutoffHour: number) {
  // Shifting the clock back by the cutoff puts everything before HH:00 Belgrade
  // on the previous calendar day, which IS the "night it belongs to".
  return serviceMetricDateKey(timestamp - cutoffHour * 60 * 60 * 1000);
}

// The next instant at which Belgrade local time reads cutoffHour:00:00. Seconds
// precision; a DST transition can skew one night's close by an hour, which the
// stale-session sweep corrects on its next tick.
function nextCutoffInstant(now: number, cutoffHour: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const secondsIntoDay =
    // Intl emits "24" for midnight in some engines' h23 handling; normalize.
    ((Number(values.hour) % 24) * 60 + Number(values.minute)) * 60 +
    Number(values.second);
  const target = cutoffHour * 60 * 60;
  const delta =
    (target - secondsIntoDay + 24 * 60 * 60) % (24 * 60 * 60) || 24 * 60 * 60;
  return now + delta * 1000;
}

// -----------------------------------------------------------------------------
// Shared loaders
// -----------------------------------------------------------------------------

async function spaceByCode(ctx: QueryCtx, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  return await ctx.db
    .query("memoriesSpaces")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

async function guestByKey(
  ctx: QueryCtx,
  spaceId: Id<"memoriesSpaces">,
  guestKey: string,
) {
  return await ctx.db
    .query("memoriesGuests")
    .withIndex("by_spaceId_and_guestKey", (q) =>
      q.eq("spaceId", spaceId).eq("guestKey", guestKey),
    )
    .unique();
}

// -----------------------------------------------------------------------------
// STEP 3 — Sessions (nights). Photos always hang off a session, so galleries,
// quota and stats share one shape (RFC §2.4 C.5).
// -----------------------------------------------------------------------------

// one_off: exactly ONE session, created at activation, closed by the scheduler
// at windowEndAt. The core is shared so a space's provisioner (TASK-18's
// createCelebration) can open the session SYNCHRONOUSLY, in the same
// transaction as the space, rather than scheduling a follow-up mutation — the
// wedding's night exists the instant the space does. Idempotent: an existing
// session is returned, never duplicated.
export async function openOneOffSessionForSpace(
  ctx: MutationCtx,
  space: Doc<"memoriesSpaces">,
  now: number,
) {
  if (space.mode !== "one_off") throw new ConvexError(dict.spaceNotFound);
  const existing = await ctx.db
    .query("memoriesSessions")
    .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", space._id))
    .first();
  if (existing) return { sessionId: existing._id, created: false };

  // A one-off's key is its calendar date (the wedding's date), not a
  // cutoff-shifted night — the window bounds are authoritative for it.
  const dateKey = serviceMetricDateKey(space.windowStartAt ?? now);
  const sessionId = await ctx.db.insert("memoriesSessions", {
    spaceId: space._id,
    dateKey,
    status: "open",
    openedAt: now,
    photoCount: 0,
    guestCount: 0,
    updatedAt: now,
  });
  if (space.windowEndAt !== undefined) {
    const scheduledCloseId = await ctx.scheduler.runAt(
      space.windowEndAt,
      internal.memories.closeSession,
      { sessionId },
    );
    await ctx.db.patch(sessionId, { scheduledCloseId });
  }
  return { sessionId, created: true };
}

// The activation hook — the dev seed and any future scheduler-driven activation
// call it; reserveUpload never creates a one_off session. Wraps the shared core.
export const openOneOffSession = internalMutation({
  args: { spaceId: v.id("memoriesSpaces") },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    return await openOneOffSessionForSpace(ctx, space, Date.now());
  },
});

// Scheduler-run close. Idempotent: a session that is already closed (manually,
// or by the stale-session sweep) is a silent no-op — a stale scheduled close
// never reopens or re-closes anything.
export const closeSession = internalMutation({
  args: { sessionId: v.id("memoriesSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "open") return { closed: false };
    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "closed",
      closedAt: now,
      updatedAt: now,
    });
    return { closed: true };
  },
});

// recurring: tonight's session is lazily get-or-created by the first
// reservation of the night. Reading the clock here is legal (mutation, not
// query); the computed dateKey is the cutoff-shifted Belgrade night. Creation
// schedules the close at the next cutoff, with the sweep cron as backstop.
// Concurrent first-reservations cannot double-create: Convex mutations are
// serializable, so the loser's OCC retry sees the winner's row.
async function getOrCreateRecurringSession(
  ctx: MutationCtx,
  space: Doc<"memoriesSpaces">,
  now: number,
) {
  const cutoffHour = space.nightCutoffHour ?? DEFAULT_NIGHT_CUTOFF_HOUR;
  const dateKey = sessionDateKey(now, cutoffHour);
  const existing = await ctx.db
    .query("memoriesSessions")
    .withIndex("by_spaceId_and_dateKey", (q) =>
      q.eq("spaceId", space._id).eq("dateKey", dateKey),
    )
    .unique();
  if (existing) return existing;

  const sessionId = await ctx.db.insert("memoriesSessions", {
    spaceId: space._id,
    dateKey,
    status: "open",
    openedAt: now,
    photoCount: 0,
    guestCount: 0,
    updatedAt: now,
  });
  const scheduledCloseId = await ctx.scheduler.runAt(
    nextCutoffInstant(now, cutoffHour),
    internal.memories.closeSession,
    { sessionId },
  );
  await ctx.db.patch(sessionId, { scheduledCloseId });
  return (await ctx.db.get(sessionId))!;
}

// -----------------------------------------------------------------------------
// STEP 4 — The quota reservation. THE enforcement point (RFC §2.9).
// -----------------------------------------------------------------------------

// The guest's effective limit: the plan tier's photosPerGuest plus every
// matching additive grant. Additive-only keeps this pure arithmetic — a
// "reset" is a grant equal to what the guest already used, and deletions
// refund automatically because the count below only sees live rows.
// `sessionId` may be null (TASK-17's guestSpaceView asks before tonight's
// session exists); a null session matches only session-unscoped grants.
async function effectivePhotoLimit(
  ctx: QueryCtx,
  space: Doc<"memoriesSpaces">,
  sessionId: Id<"memoriesSessions"> | null,
  guestId: Id<"memoriesGuests">,
  basePhotosPerGuest: number,
) {
  const adjustments = await ctx.db
    .query("quotaAdjustments")
    .withIndex("by_spaceId_and_createdAt", (q) => q.eq("spaceId", space._id))
    .take(ADJUSTMENTS_READ_CAP);
  let limit = basePhotosPerGuest;
  for (const adjustment of adjustments) {
    const sessionMatches =
      adjustment.sessionId === undefined ||
      (sessionId !== null && adjustment.sessionId === sessionId);
    const guestMatches =
      adjustment.guestId === undefined || adjustment.guestId === guestId;
    if (sessionMatches && guestMatches) limit += adjustment.extraPhotos;
  }
  return Math.min(limit, EFFECTIVE_LIMIT_CAP);
}

// Reserve one upload slot. The count and the insert happen IN THE SAME
// TRANSACTION: Convex mutations are serializable with OCC retry, so two
// concurrent reservations cannot both observe n−1 live rows and both insert —
// the loser retries against the winner's committed row. `reserved` rows count
// toward the quota (they ARE live rows), so a client opening ten parallel
// uploads cannot bypass the limit.
//
// Why not @convex-dev/rate-limiter for the quota: it models rates per period;
// this is a lifetime cap with admin grants and delete-refunds. Why not a
// counter document: deletes and moderation would need drift-prone decrements;
// counting ≤ ~20 live rows through by_sessionId_and_guestId is cheap and
// self-healing. (The limiter IS used above this, for burst throttling only.)
//
// Since TASK-15 the reservation also returns `uploadUrl` — the Convex storage
// upload URL (RFC §2.8 step 1, minted through the convex/lib/storage.ts
// wrapper) the client PUTs the original JPEG to before calling
// POST /api/m/[code]/process with { photoId, storageId }. Since TASK-16 it
// also returns the entitlement's `maxImageDimension`, so the client's
// bandwidth-UX downscale (lib/memories-client) never hardcodes the plan
// dimension. RESERVE ONCE PER PHOTO: retries go through renewUploadUrl below,
// never through a second reservation (see the module header).
export const reserveUpload = mutation({
  args: {
    code: v.string(),
    guestKey: v.string(),
    visibility: v.optional(
      v.union(v.literal("everyone"), v.literal("host_only")),
    ),
  },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    const guest = await guestByKey(ctx, space._id, args.guestKey);
    if (!guest) throw new ConvexError(dict.guestNotFound);

    // Burst throttle per guest (abuse economics, not the quota).
    const burst = await rateLimiter.limit(ctx, "reserveUpload", {
      key: guest._id,
    });
    if (!burst.ok) throw new ConvexError(dict.rateLimited);

    // Upload window (RFC §2.9): the space must be active and the session open.
    // one_off additionally re-checks its window against the clock — legal in a
    // mutation, and a belt over the scheduler-materialized session state.
    if (space.status !== "active") throw new ConvexError(dict.spaceNotActive);
    const now = Date.now();
    let session: Doc<"memoriesSessions">;
    if (space.mode === "one_off") {
      if (space.windowStartAt !== undefined && now < space.windowStartAt) {
        throw new ConvexError(dict.windowNotOpen);
      }
      if (space.windowEndAt !== undefined && now > space.windowEndAt) {
        throw new ConvexError(dict.windowClosed);
      }
      const only = await ctx.db
        .query("memoriesSessions")
        .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", space._id))
        .first();
      if (!only) throw new ConvexError(dict.sessionMissing);
      session = only;
    } else {
      session = await getOrCreateRecurringSession(ctx, space, now);
    }
    if (session.status !== "open") throw new ConvexError(dict.sessionClosed);

    // Entitlement, resolved WITH the spaceId so a space-scoped plan wins over
    // the business subscription (RFC §2.3). No active entitlement ⇒ the space
    // was never (or is no longer) paid for ⇒ no uploads.
    const entitlement = await getEntitlement(
      ctx,
      space.businessId,
      "scanme_memories",
      space._id,
    );
    if (!entitlement) throw new ConvexError(dict.notActivated);

    const limit = await effectivePhotoLimit(
      ctx,
      space,
      session._id,
      guest._id,
      entitlement.limits.photosPerGuest,
    );
    if (limit <= 0) {
      throw new ConvexError(fmt(dict.quotaReached, { limit }));
    }

    // The count: the guest's LIVE rows in this session — reserved, processing,
    // ready and hidden all count; only deleted tombstones refund. The filter
    // runs before `.take`, so tombstones can never crowd live rows out of the
    // window; the read is bounded by the guest's own activity in one night.
    const liveRows = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_sessionId_and_guestId", (q) =>
        q.eq("sessionId", session._id).eq("guestId", guest._id),
      )
      .filter((q) => q.neq(q.field("status"), "deleted"))
      .take(limit + 1);
    if (liveRows.length >= limit) {
      throw new ConvexError(fmt(dict.quotaReached, { limit }));
    }

    // The slot. `cardId` is denormalized from the guest (the TABLE the person
    // scanned) so per-card statistics survive a guest re-cookieing. Visibility:
    // the guest's choice only counts when the host allows it.
    const visibility =
      space.guestVisibilityChoice && args.visibility !== undefined
        ? args.visibility
        : space.defaultVisibility;
    const photoId = await ctx.db.insert("memoriesPhotos", {
      spaceId: space._id,
      sessionId: session._id,
      guestId: guest._id,
      cardId: guest.cardId,
      visibility,
      status: "reserved",
      createdAt: now,
      updatedAt: now,
    });
    // Consent (RFC §2.10): uploading is the affirmative act, and this mutation
    // IS the upload's admission — stamping the current notice version here, in
    // the same transaction as the slot, means the act and its record cannot
    // drift apart. The TASK-17 screen renders the notice (same CONSENT_VERSION
    // module) above the upload control, so what is stamped is what was read.
    await ctx.db.patch(guest._id, {
      lastSeenAt: now,
      updatedAt: now,
      ...(guest.consentVersion === CONSENT_VERSION
        ? {}
        : { consentVersion: CONSENT_VERSION, consentAt: now }),
    });

    return {
      photoId,
      limit,
      remaining: limit - liveRows.length - 1,
      uploadUrl: await generateUploadUrl(ctx),
      maxImageDimension: entitlement.limits.maxImageDimension,
    };
  },
});

// Load a photo through the (space, guest) pair, masking a missing photo, a
// photo of another space, and a photo of another guest as one identical error
// — existence is never disclosed across guests (same masking as deleteMyPhoto
// and the pipeline's loadOwnedPhoto).
async function ownedPhoto(
  ctx: MutationCtx,
  code: string,
  guestKey: string,
  photoId: Id<"memoriesPhotos">,
) {
  const space = await spaceByCode(ctx, code);
  if (!space) throw new ConvexError(dict.spaceNotFound);
  const guest = await guestByKey(ctx, space._id, guestKey);
  if (!guest) throw new ConvexError(dict.guestNotFound);
  const photo = await ctx.db.get(photoId);
  if (!photo || photo.spaceId !== space._id || photo.guestId !== guest._id) {
    throw new ConvexError(dict.photoNotFound);
  }
  return { space, guest, photo };
}

// TASK-16 STEP 0 — the retry half of the reservation contract. A retry never
// re-reserves; what it needs is a FRESH upload URL for the slot it already
// holds. Legal on the guest's own `reserved` row (the PUT never landed or
// failed) and `processing` row (a pipeline run crashed between claim and
// commit — the re-upload supersedes the pinned original via uploadContext,
// which deletes the superseded blob). Deliberately NO quota read and NO
// session/window re-check: the reservation was the admission; a retry only
// completes what was already admitted.
//
// The idempotent tail mirrors uploadContext: a row whose commit already landed
// (the client lost the response — phone locked mid-confirmation) answers
// `alreadyReady`, so the client marks the photo saved instead of failing.
export const renewUploadUrl = mutation({
  args: {
    code: v.string(),
    guestKey: v.string(),
    photoId: v.id("memoriesPhotos"),
  },
  handler: async (ctx, args) => {
    // Burst throttle in its own bucket: a retry loop on a dying hall network
    // legitimately renews often, and must not starve fresh reservations.
    const { guest, photo } = await ownedPhoto(
      ctx,
      args.code,
      args.guestKey,
      args.photoId,
    );
    const burst = await rateLimiter.limit(ctx, "renewUploadUrl", {
      key: guest._id,
    });
    if (!burst.ok) throw new ConvexError(dict.rateLimited);

    // `hidden` only exists downstream of a commit (host moderation of a ready
    // photo) — from the uploader's side that upload DID succeed.
    if (photo.status === "ready" || photo.status === "hidden") {
      return { alreadyReady: true as const };
    }
    if (photo.status !== "reserved" && photo.status !== "processing") {
      // `deleted`: the slot is gone (tombstoned); nothing to retry against.
      throw new ConvexError(dict.photoNotFound);
    }
    return {
      alreadyReady: false as const,
      uploadUrl: await generateUploadUrl(ctx),
    };
  },
});

// TASK-16 STEP 0 — the give-up half. Frees a `reserved` slot IMMEDIATELY when
// the client abandons an upload for good (definitive server refusal, a decode
// failure after reserving, or the guest removing a pending item) — the quota
// slot refunds now because the quota is an index count of live rows, and the
// row is hard-deleted exactly as the 24h reaper would have done.
//
// Only the owning guest (masked lookup above), and only a row that is still
// nothing but a reservation: status `reserved`, no committed asset, no pinned
// original. `processing` is refused — a pipeline run may be in flight and its
// pinned original belongs to the reaper's crash protocol; `ready`/`hidden`
// are refused — the slot is legitimately used by a committed photo (deleting
// that is deleteMyPhoto's job, a tombstone with different semantics).
export const releaseReservation = mutation({
  args: {
    code: v.string(),
    guestKey: v.string(),
    photoId: v.id("memoriesPhotos"),
  },
  handler: async (ctx, args) => {
    const { photo } = await ownedPhoto(
      ctx,
      args.code,
      args.guestKey,
      args.photoId,
    );
    if (
      photo.status !== "reserved" ||
      photo.mediaAssetId !== undefined ||
      photo.originalStorageId !== undefined
    ) {
      throw new ConvexError(dict.releaseUnavailable);
    }
    await ctx.db.delete(photo._id);
    return { released: true };
  },
});

// Guest deletes their own photo. A tombstone, not a hard delete — the purge
// machinery (pipeline task) owns blob+doc removal; a `reserved` row carries no
// blob yet either way. The quota slot refunds automatically: the reservation
// count above only sees non-deleted rows.
export const deleteMyPhoto = mutation({
  args: {
    code: v.string(),
    guestKey: v.string(),
    photoId: v.id("memoriesPhotos"),
  },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    const guest = await guestByKey(ctx, space._id, args.guestKey);
    if (!guest) throw new ConvexError(dict.guestNotFound);
    const photo = await ctx.db.get(args.photoId);
    // Ownership: the same "photo not found" for a missing photo and a photo
    // belonging to someone else — existence is never disclosed across guests.
    if (!photo || photo.spaceId !== space._id || photo.guestId !== guest._id) {
      throw new ConvexError(dict.photoNotFound);
    }
    if (photo.status === "deleted") return { deleted: false };
    const now = Date.now();
    await ctx.db.patch(photo._id, {
      status: "deleted",
      deletedReason: "guest",
      updatedAt: now,
    });
    return { deleted: true };
  },
});

// TASK-17 STEP 6 — the guest's per-photo visibility choice. Only when the
// space allows it (guestVisibilityChoice), only the owning guest (masked
// lookup), and only on live un-moderated rows: reserved/processing/ready.
// hidden (host moderation) and deleted rows answer photoNotFound — the same
// non-disclosure as every other guest mutation.
export const setMyPhotoVisibility = mutation({
  args: {
    code: v.string(),
    guestKey: v.string(),
    photoId: v.id("memoriesPhotos"),
    visibility: v.union(v.literal("everyone"), v.literal("host_only")),
  },
  handler: async (ctx, args) => {
    const { space, photo } = await ownedPhoto(
      ctx,
      args.code,
      args.guestKey,
      args.photoId,
    );
    if (!space.guestVisibilityChoice) {
      throw new ConvexError(dict.visibilityLocked);
    }
    if (
      photo.status !== "reserved" &&
      photo.status !== "processing" &&
      photo.status !== "ready"
    ) {
      throw new ConvexError(dict.photoNotFound);
    }
    if (photo.visibility !== args.visibility) {
      await ctx.db.patch(photo._id, {
        visibility: args.visibility,
        updatedAt: Date.now(),
      });
    }
    return { visibility: args.visibility };
  },
});

// The guest's own photos (/m/[code]/moje). A wrong guestKey yields an EMPTY
// list — never an error, never another guest's rows: the lookup is by the
// composite (spaceId, guestKey) index, so there is nothing to leak. No wall
// clock, no storage URLs (no media exists before the pipeline task).
export const myPhotos = query({
  args: { code: v.string(), guestKey: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space) return [];
    const guest = await guestByKey(ctx, space._id, args.guestKey);
    if (!guest) return [];
    const rows = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_guestId", (q) => q.eq("guestId", guest._id))
      .filter((q) => q.neq(q.field("status"), "deleted"))
      .take(200);
    return rows.map((photo) => ({
      photoId: photo._id,
      sessionId: photo.sessionId,
      status: photo.status,
      visibility: photo.visibility,
      createdAt: photo.createdAt,
    }));
  },
});

// -----------------------------------------------------------------------------
// TASK-17 — the guest screens' read models (/m/[code], /moje, /galerija).
// Same invariants as everything above: NO query reads the wall clock (one_off
// window position is the CLIENT's UX comparison; enforcement stays in
// reserveUpload), and visibility filters run inside the query so host_only
// bytes never leave the server for anyone but their owner.
// -----------------------------------------------------------------------------

// The latest session of a space. dateKey is "YYYY-MM-DD" (lexicographic =
// chronological), so descending-first is the newest night. If it is `open`, it
// IS tonight (the scheduler/sweep closes stale ones); if closed, tonight has
// not started — for a recurring active space that still means "open for the
// first upload" (reserveUpload get-or-creates the night).
async function latestSession(
  ctx: QueryCtx,
  spaceId: Id<"memoriesSpaces">,
) {
  return await ctx.db
    .query("memoriesSessions")
    .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", spaceId))
    .order("desc")
    .first();
}

// Signed variant URLs + intrinsic dimensions for a committed photo. Null while
// no asset exists (reserved/processing) or a blob is gone (purge race) — the
// UI renders those through the live queue, never as broken images.
async function photoImage(ctx: QueryCtx, photo: Doc<"memoriesPhotos">) {
  if (!photo.mediaAssetId) return null;
  const asset = await ctx.db.get(photo.mediaAssetId);
  if (!asset || asset.status !== "ready") return null;
  const thumbUrl = await storageGetUrl(
    ctx,
    asset.variants.thumb.ref as Id<"_storage">,
  );
  const avifUrl = await storageGetUrl(
    ctx,
    asset.variants.avif.ref as Id<"_storage">,
  );
  const webpUrl = await storageGetUrl(
    ctx,
    asset.variants.webp.ref as Id<"_storage">,
  );
  if (!thumbUrl || !avifUrl || !webpUrl) return null;
  return {
    thumbUrl,
    avifUrl,
    webpUrl,
    width: asset.variants.webp.width,
    height: asset.variants.webp.height,
    thumbWidth: asset.variants.thumb.width,
    thumbHeight: asset.variants.thumb.height,
  };
}

// Everything the landing needs in one read: the space's materialized state,
// the host's brand, whether an entitlement resolves (state 7), the latest
// session's photo count (the one social-proof line), and — when the caller
// holds a valid guestKey — that guest's limit/remaining, computed with the
// exact arithmetic reserveUpload enforces. A wrong guestKey yields guest:null,
// never an error: the landing still renders, it just cannot upload.
export const guestSpaceView = query({
  args: { code: v.string(), guestKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space) return null;
    const business = await ctx.db.get(space.businessId);
    const businessLogoUrl = business?.logoStorageId
      ? await storageGetUrl(ctx, business.logoStorageId)
      : (business?.logoUrl ?? null);
    const entitlement = await getEntitlement(
      ctx,
      space.businessId,
      "scanme_memories",
      space._id,
    );
    const session = await latestSession(ctx, space._id);
    const openSession = session && session.status === "open" ? session : null;

    let guest: {
      limit: number;
      remaining: number;
      consentVersion: string | null;
      // STEP 1 — the re-prompt signal: true when the guest has not yet accepted
      // the CURRENT consent version (never accepted, or accepted an older one
      // whose meaning has since changed). The upload notice is always on screen
      // (RFC §2.10), but the landing uses this to mark it as *updated* for a
      // returning guest, so a bumped notice is visibly re-shown before the next
      // upload. reserveUpload re-stamps the version in the same act.
      needsConsent: boolean;
    } | null = null;
    if (args.guestKey) {
      const guestRow = await guestByKey(ctx, space._id, args.guestKey);
      if (guestRow) {
        const limit = entitlement
          ? await effectivePhotoLimit(
              ctx,
              space,
              openSession?._id ?? null,
              guestRow._id,
              entitlement.limits.photosPerGuest,
            )
          : 0;
        let used = 0;
        if (openSession && limit > 0) {
          const liveRows = await ctx.db
            .query("memoriesPhotos")
            .withIndex("by_sessionId_and_guestId", (q) =>
              q.eq("sessionId", openSession._id).eq("guestId", guestRow._id),
            )
            .filter((q) => q.neq(q.field("status"), "deleted"))
            .take(limit + 1);
          used = liveRows.length;
        }
        guest = {
          limit,
          remaining: Math.max(0, limit - used),
          consentVersion: guestRow.consentVersion ?? null,
          needsConsent: guestRow.consentVersion !== CONSENT_VERSION,
        };
      }
    }

    return {
      spaceName: space.name,
      businessName: business?.name ?? space.name,
      businessLogoUrl,
      status: space.status,
      mode: space.mode,
      windowStartAt: space.windowStartAt ?? null,
      windowEndAt: space.windowEndAt ?? null,
      defaultVisibility: space.defaultVisibility,
      guestVisibilityChoice: space.guestVisibilityChoice,
      publicGalleryEnabled: space.publicGalleryEnabled,
      entitled: entitlement !== null,
      retentionDays: entitlement?.limits.retentionDays ?? null,
      session: session
        ? {
            id: session._id,
            status: session.status,
            photoCount: session.photoCount,
          }
        : null,
      guest,
    };
  },
});

// The guest's own photos with signed variant URLs (/m/[code]/moje and the
// landing's "tonight" strip). ONLY committed rows (`ready`, plus `hidden` —
// still the guest's own photo, host moderation hides it from galleries, not
// from its owner): reserved/processing rows are the live queue's to render
// honestly, and an abandoned reservation from a dead tab must not haunt this
// list as an eternal "processing". Wrong guestKey ⇒ empty list, same masking
// as myPhotos.
export const myPhotosView = query({
  args: { code: v.string(), guestKey: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space) return [];
    const guest = await guestByKey(ctx, space._id, args.guestKey);
    if (!guest) return [];
    const rows = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_guestId", (q) => q.eq("guestId", guest._id))
      .order("desc")
      .take(200);
    const photos: Array<{
      photoId: Id<"memoriesPhotos">;
      sessionId: Id<"memoriesSessions">;
      visibility: Doc<"memoriesPhotos">["visibility"];
      createdAt: number;
      image: NonNullable<Awaited<ReturnType<typeof photoImage>>>;
    }> = [];
    for (const photo of rows) {
      if (photo.status !== "ready" && photo.status !== "hidden") continue;
      const image = await photoImage(ctx, photo);
      if (!image) continue;
      photos.push({
        photoId: photo._id,
        sessionId: photo.sessionId,
        visibility: photo.visibility,
        createdAt: photo.createdAt,
        image,
      });
    }
    return photos;
  },
});

// The shared gallery (/m/[code]/galerija). TASK-20 STEP 0 split the old single
// query in two: this one is the header + the host's publicGalleryEnabled gate
// (null → the page 404s), and publicGalleryPage below is the paginated photo
// grid. The split exists because the grid must be a real cursor-paginated read
// — the whole night, not a capped 150-row slice — and usePaginatedQuery needs a
// query that returns ONLY the pagination shape. No guest attribution of any
// kind leaves the server: photoId, timestamps, and image URLs only.
export const publicGalleryMeta = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space || !space.publicGalleryEnabled || space.status === "archived") {
      return null;
    }
    const business = await ctx.db.get(space.businessId);
    return {
      spaceName: space.name,
      businessName: business?.name ?? space.name,
      businessLogoUrl: business?.logoStorageId
        ? await storageGetUrl(ctx, business.logoStorageId)
        : (business?.logoUrl ?? null),
    };
  },
});

// STEP 0 — the paginated public grid. The FIX for the two defects of the old
// `.take(150)` shape:
//   1. No silent truncation. A night with 442 `everyone` photos returns all
//      442 across pages via the documented Convex cursor pattern, not a
//      capped 150 with no "load more".
//   2. Visibility is resolved by the INDEX, not a post-cap filter. The read
//      keys straight into (sessionId, "ready", "everyone") via
//      by_sessionId_and_status_and_visibility, so a `host_only`-heavy tail can
//      never crowd `everyone` photos out of the page — every row the cursor
//      walks is already public. host_only bytes never leave the server.
// The only remaining post-read skip is a NULL image (an asset purged between
// the row read and hydration — a rare race), never a visibility decision.
export const publicGalleryPage = query({
  args: { code: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space || !space.publicGalleryEnabled || space.status === "archived") {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const session = await latestSession(ctx, space._id);
    if (!session) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_sessionId_and_status_and_visibility", (q) =>
        q
          .eq("sessionId", session._id)
          .eq("status", "ready")
          .eq("visibility", "everyone"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page: Array<{
      photoId: Id<"memoriesPhotos">;
      createdAt: number;
      image: NonNullable<Awaited<ReturnType<typeof photoImage>>>;
    }> = [];
    for (const photo of result.page) {
      const image = await photoImage(ctx, photo);
      if (!image) continue;
      page.push({ photoId: photo._id, createdAt: photo.createdAt, image });
    }
    return { ...result, page };
  },
});

// STEP 0 — the HOST night gallery grid. The host reviews a night's committed
// photos (both visibilities — the host is allowed to see host_only ones), also
// cursor-paginated so a 442-photo night is fully reachable rather than capped.
// Gated by requireBusinessAccess (host membership OR admin), so it is the one
// gallery read that carries attribution-free host access to the whole night.
export const hostSessionGallery = query({
  args: {
    sessionId: v.id("memoriesSessions"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return { page: [], isDone: true, continueCursor: "" };
    const space = await ctx.db.get(session.spaceId);
    if (!space) return { page: [], isDone: true, continueCursor: "" };
    await requireBusinessAccess(ctx, space.businessId);
    const result = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_sessionId_and_status", (q) =>
        q.eq("sessionId", session._id).eq("status", "ready"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page: Array<{
      photoId: Id<"memoriesPhotos">;
      visibility: Doc<"memoriesPhotos">["visibility"];
      createdAt: number;
      image: NonNullable<Awaited<ReturnType<typeof photoImage>>>;
    }> = [];
    for (const photo of result.page) {
      const image = await photoImage(ctx, photo);
      if (!image) continue;
      page.push({
        photoId: photo._id,
        visibility: photo.visibility,
        createdAt: photo.createdAt,
        image,
      });
    }
    return { ...result, page };
  },
});

// -----------------------------------------------------------------------------
// quotaAdjustments — the host/admin grant that raises (or, by granting what was
// used, effectively resets) a guest's limit. ADDITIVE ONLY, so enforcement
// stays pure arithmetic and deletions refund automatically (RFC §2.4 C.11).
// -----------------------------------------------------------------------------

export const grantQuota = mutation({
  args: {
    spaceId: v.id("memoriesSpaces"),
    sessionId: v.optional(v.id("memoriesSessions")),
    guestId: v.optional(v.id("memoriesGuests")),
    extraPhotos: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    const { user } = await requireBusinessAccess(ctx, space.businessId);
    if (
      !Number.isInteger(args.extraPhotos) ||
      args.extraPhotos < 1 ||
      args.extraPhotos > GRANT_MAX
    ) {
      throw new ConvexError(dict.grantInvalid);
    }
    if (args.sessionId) {
      const session = await ctx.db.get(args.sessionId);
      if (!session || session.spaceId !== space._id) {
        throw new ConvexError(dict.grantScopeMismatch);
      }
    }
    if (args.guestId) {
      const guest = await ctx.db.get(args.guestId);
      if (!guest || guest.spaceId !== space._id) {
        throw new ConvexError(dict.grantScopeMismatch);
      }
    }
    const adjustmentId = await ctx.db.insert("quotaAdjustments", {
      spaceId: space._id,
      sessionId: args.sessionId,
      guestId: args.guestId,
      extraPhotos: args.extraPhotos,
      reason: optionalText(args.reason, 200),
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
    return { adjustmentId };
  },
});

// -----------------------------------------------------------------------------
// STEP 5 — Cron sweeps (wired in convex/crons.ts). TASK-15 extended the
// reservation purge to `processing` rows and their pinned originals — the
// reaper half of the reserve→commit protocol (RFC §2.8, risk #2). TASK-20 adds
// the retention sweep and the deleted-tombstone blob purge below.
// -----------------------------------------------------------------------------

// Backstop for scheduler loss: close any open session whose time has passed —
// a recurring session whose night key is no longer tonight's, or a one_off
// session past its window end. Mirrors venue.reconcileEventLifecycle.
export const sweepStaleSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const open = await ctx.db
      .query("memoriesSessions")
      .withIndex("by_status_and_openedAt", (q) => q.eq("status", "open"))
      .take(SWEEP_BATCH);
    let closed = 0;
    for (const session of open) {
      const space = await ctx.db.get(session.spaceId);
      let stale = false;
      if (!space) {
        stale = true;
      } else if (space.mode === "one_off") {
        stale = space.windowEndAt !== undefined && now > space.windowEndAt;
      } else {
        const cutoffHour = space.nightCutoffHour ?? DEFAULT_NIGHT_CUTOFF_HOUR;
        stale = session.dateKey !== sessionDateKey(now, cutoffHour);
      }
      if (stale) {
        await ctx.db.patch(session._id, {
          status: "closed",
          closedAt: now,
          updatedAt: now,
        });
        closed += 1;
      }
    }
    return { closed };
  },
});

// Purge the pipeline's failure modes older than 24 hours (RFC §2.8/§2.9,
// TASK-15): `reserved` rows whose client never uploaded (no blob exists —
// hard-delete the doc), and `processing` rows whose pipeline run crashed
// between claim and commit — delete the pinned original blob through the
// storage wrapper, then the doc. Quota slots refund automatically in both
// cases because the quota is an index count of live rows. A crash therefore
// costs storage for one day, not forever. The mediaAssetId guard is the
// belt against ever deleting a row the commit already attached media to
// (commit flips to `ready` in the same transaction, so it cannot occur).
export const purgeStaleReservations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RESERVED_TTL_MS;
    const staleReserved = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_status_and_updatedAt", (q) =>
        q.eq("status", "reserved").lte("updatedAt", cutoff),
      )
      .take(SWEEP_BATCH);
    let purged = 0;
    for (const photo of staleReserved) {
      if (
        photo.originalStorageId === undefined &&
        photo.mediaAssetId === undefined
      ) {
        await ctx.db.delete(photo._id);
        purged += 1;
      }
    }

    const staleProcessing = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_status_and_updatedAt", (q) =>
        q.eq("status", "processing").lte("updatedAt", cutoff),
      )
      .take(SWEEP_BATCH);
    let purgedProcessing = 0;
    for (const photo of staleProcessing) {
      if (photo.mediaAssetId !== undefined) continue;
      if (photo.originalStorageId !== undefined) {
        await storageRemove(ctx, photo.originalStorageId);
      }
      await ctx.db.delete(photo._id);
      purgedProcessing += 1;
    }

    return { purged, purgedProcessing };
  },
});

// =============================================================================
// TASK-20 — GDPR retention & deletion (RFC-001 §2.9 retention, §2.10 deletion).
//
// The whole design in one sentence: EVERY deletion path — a daily retention
// sweep, a guest deleting one photo, a guest wiping everything, the host or
// admin removing a photo, a space wipe — does nothing but mark a row `deleted`
// (a tombstone); the purge sweep is the only code that removes bytes, and it
// removes them the SAME way for every reason. Nothing is special-cased. So the
// two hard rules of this task are structural, not conditional branches:
//   1. A photo whose bytes still exist after purge is a failure. purgePhotoBytes
//      deletes all three processed variants AND any pinned original THROUGH the
//      storage wrapper, then the docs — a tombstone that never reaches here is
//      the bug, and the purge cron guarantees it always does.
//   2. The guest's wipe beats the host's archive pin. That is not a rule written
//      into the wipe; it is purgePhotoBytes deleting the eventArchiveItems that
//      reference the purged photo's asset. Retention, host delete, and admin
//      delete beat the pin by the exact same line — uniformly.
// =============================================================================

// Idempotent storage delete: a purge that re-touches an already-gone blob (a
// retried batch, a double-scheduled sweep resolved by OCC) must not abort the
// whole batch and strand other tombstones. A genuine leak still shows up: the
// tests assert the _storage table is empty, not that delete was called.
async function safeStorageRemove(ctx: MutationCtx, ref: Id<"_storage">) {
  try {
    await storageRemove(ctx, ref);
  } catch {
    // Already deleted — the purge is meant to be idempotent.
  }
}

// THE one place a photo's bytes die (see the block header). Called only by the
// purge sweep, once per tombstone.
async function purgePhotoBytes(ctx: MutationCtx, photo: Doc<"memoriesPhotos">) {
  if (photo.mediaAssetId) {
    // The archive pins referencing this photo's processed asset. Deleting them
    // is what makes any wipe win over a host-curated Venue archive: a photo the
    // host pinned into an event archive disappears from there too. archiveEvent
    // pins by mediaAssetId (no sourcePhotoId), so we match on the asset id.
    const assetId = photo.mediaAssetId;
    const pins = await ctx.db
      .query("eventArchiveItems")
      .withIndex("by_mediaAssetId", (q) => q.eq("mediaAssetId", assetId))
      .take(ARCHIVE_PIN_READ_CAP);
    for (const pin of pins) await ctx.db.delete(pin._id);

    const asset = await ctx.db.get(assetId);
    if (asset) {
      // The three variants ARE the photo. Delete every blob before the doc.
      await safeStorageRemove(ctx, asset.variants.avif.ref as Id<"_storage">);
      await safeStorageRemove(ctx, asset.variants.webp.ref as Id<"_storage">);
      await safeStorageRemove(ctx, asset.variants.thumb.ref as Id<"_storage">);
      await ctx.db.delete(asset._id);
    }
  }
  // A row tombstoned while still reserved/processing pins an undeleted original.
  if (photo.originalStorageId) {
    await safeStorageRemove(ctx, photo.originalStorageId);
  }
  await ctx.db.delete(photo._id);
}

// The purge sweep (RFC §2.9): walk `deleted` tombstones and funnel each through
// purgePhotoBytes. Batched with scheduler continuations — never one giant
// transaction. Because purgePhotoBytes deletes each row, the next run's
// identical query naturally advances to the next tombstones (no cursor needed);
// concurrent sweeps (the daily cron plus an immediate one from a wipe) are
// serialized by Convex's OCC, so a doubly-read tombstone retries rather than
// double-deleting. Wired daily in convex/crons.ts and scheduled immediately by
// the guest/host/space deletions below.
export const purgeSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tombstones = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_status_and_updatedAt", (q) => q.eq("status", "deleted"))
      .take(PURGE_BATCH);
    for (const photo of tombstones) {
      await purgePhotoBytes(ctx, photo);
    }
    if (tombstones.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.memories.purgeSweep, {});
    }
    return { purged: tombstones.length };
  },
});

// STEP 2 — the daily retention entry point (cron). One continuation step per
// batch of spaces: resolve each space's plan retentionDays (30/90/365; an
// unentitled space falls back to the shortest tier), compute its cutoff, and
// hand the space off to retentionSweepSpace. Reading the clock is legal here
// (a mutation, not a query). Spaces are enumerated by the built-in creation
// index via .paginate() so a large tenant base is walked, not capped.
export const retentionSweep = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const spacesPage = await ctx.db
      .query("memoriesSpaces")
      .paginate({ numItems: SWEEP_BATCH, cursor: args.cursor ?? null });
    const now = Date.now();
    for (const space of spacesPage.page) {
      const entitlement = await getEntitlement(
        ctx,
        space.businessId,
        "scanme_memories",
        space._id,
      );
      const retentionDays =
        entitlement?.limits.retentionDays ?? RETENTION_DEFAULT_DAYS;
      await ctx.scheduler.runAfter(0, internal.memories.retentionSweepSpace, {
        spaceId: space._id,
        cutoff: now - retentionDays * DAY_MS,
        cursor: null,
      });
    }
    if (!spacesPage.isDone) {
      await ctx.scheduler.runAfter(0, internal.memories.retentionSweep, {
        cursor: spacesPage.continueCursor,
      });
    }
    return { spaces: spacesPage.page.length };
  },
});

// STEP 2 — one space's retention pass. Range-scan by_spaceId_and_createdAt for
// rows at/older than the cutoff and tombstone the live ones (reason
// "retention"), feeding the purge. Batched via .paginate(): patching status
// leaves createdAt unchanged, so the cursor position is stable and a run never
// re-reads what it just marked. On the last page, hand the fresh tombstones to
// an immediate purge rather than waiting up to a day for the purge cron.
export const retentionSweepSpace = internalMutation({
  args: {
    spaceId: v.id("memoriesSpaces"),
    cutoff: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const photosPage = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_spaceId_and_createdAt", (q) =>
        q.eq("spaceId", args.spaceId).lte("createdAt", args.cutoff),
      )
      .paginate({ numItems: SWEEP_BATCH, cursor: args.cursor });
    const now = Date.now();
    let tombstoned = 0;
    for (const photo of photosPage.page) {
      if (photo.status === "deleted") continue;
      await ctx.db.patch(photo._id, {
        status: "deleted",
        deletedReason: "retention",
        updatedAt: now,
      });
      tombstoned += 1;
    }
    if (!photosPage.isDone) {
      await ctx.scheduler.runAfter(0, internal.memories.retentionSweepSpace, {
        spaceId: args.spaceId,
        cutoff: args.cutoff,
        cursor: photosPage.continueCursor,
      });
    } else if (tombstoned > 0) {
      await ctx.scheduler.runAfter(0, internal.memories.purgeSweep, {});
    }
    return { tombstoned };
  },
});

// -----------------------------------------------------------------------------
// STEP 3 — deletion on request. Every mutation here TOMBSTONES and (for the
// immediate paths) schedules the shared purge; none touches a blob directly.
// -----------------------------------------------------------------------------

// The guest's own erasure ("obriši sve moje slike" on /m/[code]/moje). Public,
// guest-key gated with the same non-disclosure masking as every other guest
// call. It kicks off a batched internal wipe and schedules an immediate purge —
// so the guest's photos, quota grants, guest row, AND any archive pins are gone
// promptly, not on the daily cron.
export const wipeMyPhotos = mutation({
  args: { code: v.string(), guestKey: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    const guest = await guestByKey(ctx, space._id, args.guestKey);
    if (!guest) throw new ConvexError(dict.guestNotFound);
    await ctx.scheduler.runAfter(0, internal.memories.wipeGuestBatch, {
      guestId: guest._id,
    });
    return { started: true as const };
  },
});

// The batched guest wipe. Tombstones the guest's live photos (reason
// "gdpr_wipe") across all nights in bounded batches; on the terminal batch it
// deletes the guest's quota grants and the guest row itself (a re-scanning
// guest starting fresh is acceptable by design — RFC §2.10) and schedules the
// purge. The archive-pin deletion is deliberately NOT here: it happens in
// purgePhotoBytes, so the wipe beats the pin by the shared machinery.
export const wipeGuestBatch = internalMutation({
  args: { guestId: v.id("memoriesGuests") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const photos = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_guestId", (q) => q.eq("guestId", args.guestId))
      .filter((q) => q.neq(q.field("status"), "deleted"))
      .take(SWEEP_BATCH);
    for (const photo of photos) {
      await ctx.db.patch(photo._id, {
        status: "deleted",
        deletedReason: "gdpr_wipe",
        updatedAt: now,
      });
    }
    if (photos.length === SWEEP_BATCH) {
      // More live photos remain — finish tombstoning them before touching the
      // grants and guest row, so a crash mid-wipe never half-erases identity.
      await ctx.scheduler.runAfter(0, internal.memories.wipeGuestBatch, {
        guestId: args.guestId,
      });
      return { tombstoned: photos.length, done: false as const };
    }
    const grants = await ctx.db
      .query("quotaAdjustments")
      .withIndex("by_guestId", (q) => q.eq("guestId", args.guestId))
      .take(SWEEP_BATCH);
    for (const grant of grants) await ctx.db.delete(grant._id);
    const guest = await ctx.db.get(args.guestId);
    if (guest) await ctx.db.delete(guest._id);
    await ctx.scheduler.runAfter(0, internal.memories.purgeSweep, {});
    return { tombstoned: photos.length, done: true as const };
  },
});

// Host/admin per-photo delete (RFC §2.9 moderation, §2.10). requireBusinessAccess
// admits an active member of the space's tenant OR an admin, so this one
// mutation is both the host's and the admin's "delete any photo". Tombstone
// (reason "host") + immediate purge — the same machinery as everything else.
export const hostDeletePhoto = mutation({
  args: { photoId: v.id("memoriesPhotos") },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) throw new ConvexError(dict.photoNotFound);
    const space = await ctx.db.get(photo.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    await requireBusinessAccess(ctx, space.businessId);
    if (photo.status === "deleted") return { deleted: false };
    await ctx.db.patch(photo._id, {
      status: "deleted",
      deletedReason: "host",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.memories.purgeSweep, {});
    return { deleted: true };
  },
});

// Space/event wipe (RFC §2.10). Host or admin erases an entire space's photos —
// batched tombstone → shared purge, exactly like the guest wipe but scoped to a
// space rather than a guest. Leaves sessions/guests intact (a wipe of the
// PHOTOS, not the installation); business offboarding, which also removes those,
// composes on top of this.
export const wipeSpacePhotos = mutation({
  args: { spaceId: v.id("memoriesSpaces") },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    await requireBusinessAccess(ctx, space.businessId);
    await ctx.scheduler.runAfter(0, internal.memories.wipeSpaceBatch, {
      spaceId: args.spaceId,
      cursor: null,
    });
    return { started: true as const };
  },
});

export const wipeSpaceBatch = internalMutation({
  args: {
    spaceId: v.id("memoriesSpaces"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const photosPage = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_spaceId_and_createdAt", (q) =>
        q.eq("spaceId", args.spaceId),
      )
      .paginate({ numItems: SWEEP_BATCH, cursor: args.cursor });
    const now = Date.now();
    for (const photo of photosPage.page) {
      if (photo.status === "deleted") continue;
      await ctx.db.patch(photo._id, {
        status: "deleted",
        deletedReason: "host",
        updatedAt: now,
      });
    }
    if (!photosPage.isDone) {
      await ctx.scheduler.runAfter(0, internal.memories.wipeSpaceBatch, {
        spaceId: args.spaceId,
        cursor: photosPage.continueCursor,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.memories.purgeSweep, {});
    }
    return { done: photosPage.isDone };
  },
});
