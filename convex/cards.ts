import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { cardSplitterItem, cardTargetKind, deviceCategory } from "./schema";
import { requireBusinessAccess } from "./lib/access";
import { rateLimiter } from "./lib/rateLimits";
import { generateCode, normalizeCode } from "./lib/codes";
import { serviceMetricDateKey } from "./lib/serviceMetrics";
import { isSafePublicDestination, requireText } from "./lib/validation";
import { fmt, getDict } from "../lib/i18n";

// =============================================================================
// TASK-14 — Cards: the printed /r/[cardCode] resolver and its management.
//
// A card is the only thing printed on physical material; it identifies the
// TABLE. Retargeting inserts an immutable cardTargets row and re-points
// cards.currentTargetId — printed cards never change, the target does, and the
// immutable rows are the audit trail (RFC-001 §2.4 C.9).
//
// resolveAndRecord is called by the Next.js route handler app/r/[cardCode]
// with a requestId the HANDLER generated (crypto.randomUUID). No browser ever
// supplies a requestId or any idempotency token — RFC §1.e audited the Links
// endpoints where client-supplied UUIDs let anyone inflate counters, and every
// new endpoint closes that hole. The requestId's job here is replay-dedupe of
// the handler's own retries (by_requestId), and the per-IP-hash rate limiter
// bounds direct floods. Residual, accepted: like every public Convex function,
// a determined caller can invoke this directly against the deployment URL and
// fabricate scan stats — scan counts are non-monetary statistics, and the
// limiter prices the flood; the SECURITY properties (guest identity, quota)
// never depend on these counters.
// =============================================================================

const dict = getDict("memories");

// Retries for the birthday-paradox-improbable code collision at insert.
const CODE_INSERT_ATTEMPTS = 5;

// -----------------------------------------------------------------------------
// Guest-key minting (RFC §2.6): 256 bits from the CSPRNG, base64url. Possession
// of this string IS the guest capability; it is stored verbatim on the guest
// row and looked up via by_spaceId_and_guestKey. The Next layer wraps it in an
// HMAC cookie; Convex itself never does crypto with it.
// -----------------------------------------------------------------------------

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64URL[b0 >> 2];
    out += B64URL[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += B64URL[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += B64URL[b2 & 63];
  }
  return out;
}

function generateGuestKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

// -----------------------------------------------------------------------------
// Card management (host/admin, requireBusinessAccess-gated)
// -----------------------------------------------------------------------------

// The desired-target argument shape shared by createCard and retargetCard. The
// per-kind reference requirements are enforced by validateTargetSpec below.
// splitterItems is meaningful only for kind === "splitter" (TASK-37).
const cardTargetSpecValidator = v.object({
  kind: cardTargetKind,
  spaceId: v.optional(v.id("memoriesSpaces")),
  eventId: v.optional(v.id("events")),
  serviceProfileId: v.optional(v.id("serviceProfiles")),
  url: v.optional(v.string()),
  splitterItems: v.optional(v.array(cardSplitterItem)),
});

type SplitterItemSpec = {
  kind: Exclude<Doc<"cardTargets">["kind"], "splitter">;
  label: string;
  spaceId?: Id<"memoriesSpaces">;
  eventId?: Id<"events">;
  serviceProfileId?: Id<"serviceProfiles">;
  url?: string;
};

type CardTargetSpec = {
  kind: Doc<"cardTargets">["kind"];
  spaceId?: Id<"memoriesSpaces">;
  eventId?: Id<"events">;
  serviceProfileId?: Id<"serviceProfiles">;
  url?: string;
  splitterItems?: SplitterItemSpec[];
};

// TASK-37 (RFC-002 §2.4): the bare splitter's button count bounds. Two is the
// point of a splitter; eight keeps the page one thumb-length of buttons.
const SPLITTER_ITEMS_MIN = 2;
const SPLITTER_ITEMS_MAX = 8;

// Does a stored Links destination URL lead into Memories (/m/[code])? Any
// host counts on purpose: the deployment cannot enumerate its own domains
// here, and a false refusal at card creation is loud and explainable, while a
// missed one is a silent per-table quota leak (RFC-002 §2.4). Destination
// URLs are absolute https by the write gate, so `new URL` always parses the
// stored value.
function isMemoriesDestinationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname === "/m" || url.pathname.startsWith("/m/");
  } catch {
    return false;
  }
}

// RFC-002 §2.4, the hard condition: Memories behind a Links-page splitter is
// BLOCKED (the frozen Links render cannot emit a card-aware Memories link, so
// a guest arriving that way would mint with no cardId and the per-table quota
// would silently die). A card pointing at a scanme_links profile whose
// destinations contain ANY /m/… link — draft or published, in any state,
// because a draft is one click from published and states flip after the card
// exists — is refused at creation with the two-pattern message. Loud at mint
// time, never a silent quota leak at scan time.
async function assertLinksPageCannotReachMemories(
  ctx: MutationCtx | QueryCtx,
  profile: Doc<"serviceProfiles">,
) {
  if (profile.type !== "scanme_links") return;
  const destinations = await ctx.db
    .query("serviceDestinations")
    .withIndex("by_serviceProfileId", (q) =>
      q.eq("serviceProfileId", profile._id),
    )
    .take(500);
  for (const destination of destinations) {
    if (
      isMemoriesDestinationUrl(destination.draftUrl) ||
      (destination.publishedUrl &&
        isMemoriesDestinationUrl(destination.publishedUrl))
    ) {
      throw new ConvexError(dict.cardLinksMemoriesBlocked);
    }
  }
}

// Validate one non-splitter target against the card's business: the referenced
// space/event/profile must belong to it (a host must never point their card
// into another tenant), and external URLs must pass the shared safe-
// destination gate. Returns exactly the fields the cardTargets row stores for
// that kind. Shared verbatim between a direct card target and each bare-
// splitter button (TASK-37), so the two can never drift.
async function validateBaseTargetSpec(
  ctx: MutationCtx | QueryCtx,
  businessId: Id<"businesses">,
  spec: Omit<SplitterItemSpec, "label">,
): Promise<Pick<Doc<"cardTargets">, "spaceId" | "eventId" | "serviceProfileId" | "url"> & { kind: SplitterItemSpec["kind"] }> {
  switch (spec.kind) {
    case "memories_space": {
      if (!spec.spaceId) throw new ConvexError(dict.cardTargetInvalid);
      const space = await ctx.db.get(spec.spaceId);
      if (!space) throw new ConvexError(dict.cardTargetInvalid);
      if (space.businessId !== businessId) {
        throw new ConvexError(dict.cardBusinessMismatch);
      }
      return { kind: spec.kind, spaceId: space._id };
    }
    case "venue":
      // Resolves to the business's own /venue page at scan time; no reference.
      return { kind: spec.kind };
    case "event": {
      if (!spec.eventId) throw new ConvexError(dict.cardTargetInvalid);
      const event = await ctx.db.get(spec.eventId);
      if (!event) throw new ConvexError(dict.cardTargetInvalid);
      if (event.businessId !== businessId) {
        throw new ConvexError(dict.cardBusinessMismatch);
      }
      return { kind: spec.kind, eventId: event._id };
    }
    case "service_page": {
      if (!spec.serviceProfileId) throw new ConvexError(dict.cardTargetInvalid);
      const profile = await ctx.db.get(spec.serviceProfileId);
      if (!profile) throw new ConvexError(dict.cardTargetInvalid);
      if (profile.businessId !== businessId) {
        throw new ConvexError(dict.cardBusinessMismatch);
      }
      await assertLinksPageCannotReachMemories(ctx, profile);
      return { kind: spec.kind, serviceProfileId: profile._id };
    }
    case "url": {
      if (!spec.url || !isSafePublicDestination(spec.url)) {
        throw new ConvexError(dict.cardUrlUnsafe);
      }
      return { kind: spec.kind, url: spec.url };
    }
  }
}

// Validate a desired card target. Non-splitter kinds go straight through
// validateBaseTargetSpec; a splitter validates each button the same way (the
// validator's item union has no "splitter", so nesting is impossible by
// construction) plus its label.
async function validateTargetSpec(
  ctx: MutationCtx | QueryCtx,
  businessId: Id<"businesses">,
  spec: CardTargetSpec,
): Promise<Pick<Doc<"cardTargets">, "kind" | "spaceId" | "eventId" | "serviceProfileId" | "url" | "splitterItems">> {
  if (spec.kind !== "splitter") {
    return await validateBaseTargetSpec(ctx, businessId, {
      kind: spec.kind,
      spaceId: spec.spaceId,
      eventId: spec.eventId,
      serviceProfileId: spec.serviceProfileId,
      url: spec.url,
    });
  }
  const items = spec.splitterItems ?? [];
  if (items.length < SPLITTER_ITEMS_MIN || items.length > SPLITTER_ITEMS_MAX) {
    throw new ConvexError(
      fmt(dict.cardSplitterItemsInvalid, {
        min: SPLITTER_ITEMS_MIN,
        max: SPLITTER_ITEMS_MAX,
      }),
    );
  }
  const splitterItems: NonNullable<Doc<"cardTargets">["splitterItems"]> = [];
  for (const item of items) {
    const label = requireText(item.label, "Naziv dugmeta", 1, 40);
    const fields = await validateBaseTargetSpec(ctx, businessId, item);
    splitterItems.push({ ...fields, label });
  }
  return { kind: "splitter", splitterItems };
}

// Mint a card for a business, optionally with its initial target. The cardCode
// is generated here (insert-retry on the by_cardCode index — Convex indexes do
// not enforce uniqueness, so the check-and-insert runs in this serializable
// transaction) and never changes afterwards: reprints are new cards.
export const createCard = mutation({
  args: {
    businessId: v.id("businesses"),
    label: v.string(),
    target: v.optional(cardTargetSpecValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await requireBusinessAccess(ctx, args.businessId);
    const label = requireText(args.label, "Oznaka kartice", 1, 80);
    const now = Date.now();

    let cardCode: string | null = null;
    for (let attempt = 0; attempt < CODE_INSERT_ATTEMPTS; attempt += 1) {
      const candidate = generateCode();
      const taken = await ctx.db
        .query("cards")
        .withIndex("by_cardCode", (q) => q.eq("cardCode", candidate))
        .unique();
      if (!taken) {
        cardCode = candidate;
        break;
      }
    }
    if (!cardCode) throw new ConvexError(dict.cardCodeGenerationFailed);

    const cardId = await ctx.db.insert("cards", {
      businessId: args.businessId,
      cardCode,
      label,
      status: "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });

    let targetId: Id<"cardTargets"> | undefined;
    if (args.target) {
      const fields = await validateTargetSpec(ctx, args.businessId, args.target);
      targetId = await ctx.db.insert("cardTargets", {
        cardId,
        ...fields,
        createdByUserId: user._id,
        createdAt: now,
      });
      await ctx.db.patch(cardId, { currentTargetId: targetId, updatedAt: now });
    }

    return { cardId, cardCode, targetId: targetId ?? null };
  },
});

// Retargeting (RFC §2.4 C.9): INSERT a new immutable cardTargets row and patch
// cards.currentTargetId. Existing rows are never edited or deleted — they are
// the audit trail, and pointing currentTargetId at an older row is rollback.
export const retargetCard = mutation({
  args: {
    cardId: v.id("cards"),
    target: cardTargetSpecValidator,
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new ConvexError(dict.cardNotFound);
    const { user } = await requireBusinessAccess(ctx, card.businessId);
    const fields = await validateTargetSpec(ctx, card.businessId, args.target);
    const now = Date.now();
    const targetId = await ctx.db.insert("cardTargets", {
      cardId: card._id,
      ...fields,
      createdByUserId: user._id,
      createdAt: now,
    });
    await ctx.db.patch(card._id, { currentTargetId: targetId, updatedAt: now });
    return { targetId };
  },
});

// -----------------------------------------------------------------------------
// TASK-18 STEP 3 — table cards for a Memories space. The host mints a labelled
// batch (one per table), lists them with scan counts, and disables one.
// Retargeting is retargetCard above; print-ready artwork is out of scope — this
// produces codes and their /r/[cardCode] URLs only.
// -----------------------------------------------------------------------------

const MINT_BATCH_MAX = 50;

// The card-minting loop, shared by the host mutation and the dev seed
// (convex/memoriesDevSeed.ts) so both run one implementation. Each card is
// labelled `${prefix} ${startIndex + i}` and targets the space; a code
// collision retries within this transaction.
export async function mintSpaceCards(
  ctx: MutationCtx,
  params: {
    space: Doc<"memoriesSpaces">;
    count: number;
    startIndex: number;
    prefix: string;
    userId: Id<"users">;
    now: number;
  },
) {
  const { space, count, startIndex, prefix, userId, now } = params;
  const created: Array<{
    cardId: Id<"cards">;
    cardCode: string;
    label: string;
  }> = [];
  for (let i = 0; i < count; i += 1) {
    let cardCode: string | null = null;
    for (let attempt = 0; attempt < CODE_INSERT_ATTEMPTS; attempt += 1) {
      const candidate = generateCode();
      const taken = await ctx.db
        .query("cards")
        .withIndex("by_cardCode", (q) => q.eq("cardCode", candidate))
        .unique();
      if (!taken) {
        cardCode = candidate;
        break;
      }
    }
    if (!cardCode) throw new ConvexError(dict.cardCodeGenerationFailed);
    const label = `${prefix} ${startIndex + i}`;
    const cardId = await ctx.db.insert("cards", {
      businessId: space.businessId,
      cardCode,
      label,
      status: "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });
    const targetId = await ctx.db.insert("cardTargets", {
      cardId,
      kind: "memories_space",
      spaceId: space._id,
      createdByUserId: userId,
      createdAt: now,
    });
    await ctx.db.patch(cardId, { currentTargetId: targetId, updatedAt: now });
    created.push({ cardId, cardCode, label });
  }
  return { created };
}

// Mint `count` cards for a space (host/admin, requireBusinessAccess-gated).
// Bounded by MINT_BATCH_MAX.
export const mintCardsForSpace = mutation({
  args: {
    spaceId: v.id("memoriesSpaces"),
    count: v.number(),
    startIndex: v.optional(v.number()),
    labelPrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    const { user } = await requireBusinessAccess(ctx, space.businessId);
    if (
      !Number.isInteger(args.count) ||
      args.count < 1 ||
      args.count > MINT_BATCH_MAX
    ) {
      throw new ConvexError(dict.cardMintCountInvalid);
    }
    const startIndex =
      args.startIndex !== undefined && Number.isInteger(args.startIndex)
        ? Math.max(1, args.startIndex)
        : 1;
    const prefix = requireText(args.labelPrefix ?? "Sto", "Oznaka", 1, 40);
    return await mintSpaceCards(ctx, {
      space,
      count: args.count,
      startIndex,
      prefix,
      userId: user._id,
      now: Date.now(),
    });
  },
});

// The space's cards with their scan counts and how many guests scanned each —
// the per-card statistics the host panel ranks by activity. Bounded reads.
export const listSpaceCards = query({
  args: { spaceId: v.id("memoriesSpaces") },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    await requireBusinessAccess(ctx, space.businessId);
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_businessId", (q) => q.eq("businessId", space.businessId))
      .take(500);
    const rows: Array<{
      cardId: Id<"cards">;
      cardCode: string;
      label: string;
      status: Doc<"cards">["status"];
      totalScans: number;
      guestCount: number;
    }> = [];
    for (const card of cards) {
      if (!card.currentTargetId) continue;
      const target = await ctx.db.get(card.currentTargetId);
      if (target?.kind !== "memories_space" || target.spaceId !== space._id) {
        continue;
      }
      const guests = await ctx.db
        .query("memoriesGuests")
        .withIndex("by_cardId", (q) => q.eq("cardId", card._id))
        .take(500);
      rows.push({
        cardId: card._id,
        cardCode: card.cardCode,
        label: card.label,
        status: card.status,
        totalScans: card.totalScans,
        guestCount: guests.length,
      });
    }
    rows.sort((a, b) => b.totalScans - a.totalScans);
    return rows;
  },
});

// Disable a card: scanning it stops resolving (the resolver requires
// status === "active"). The code and its scan history stay recorded.
export const disableCard = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new ConvexError(dict.cardNotFound);
    await requireBusinessAccess(ctx, card.businessId);
    if (card.status !== "disabled") {
      await ctx.db.patch(card._id, { status: "disabled", updatedAt: Date.now() });
    }
    return { disabled: true as const };
  },
});

// -----------------------------------------------------------------------------
// The resolver (public; called by app/r/[cardCode]/route.ts)
// -----------------------------------------------------------------------------

type ResolveOutcome =
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "venue"; businessSlug: string }
  | { kind: "event"; businessSlug: string; eventSlug: string }
  | { kind: "service_page"; slug: string }
  | { kind: "url"; url: string }
  | {
      kind: "memories_space";
      code: string;
      // null when guest creation was rate-limited: the guest still reaches
      // /m/[code], just without a minted identity (no Set-Cookie).
      guestKey: string | null;
    }
  // TASK-37: the handler 302s to the bare splitter page /r/[cardCode]/izbor;
  // cardCode is returned normalized so the redirect URL is canonical.
  | { kind: "splitter"; cardCode: string };

// THE guest-minting path (RFC-001 §2.6 / RFC-002 §2.4): rate-limit, then
// insert a memoriesGuests row attributed to the TABLE (guest.cardId). Shared
// by the direct memories_space resolve and the splitter's card-aware /m hop
// (resolveSplitterMemories) so "the same minting path" is literal — every
// route from a printed card into Memories runs THIS function or none.
// Returns null when guest creation was rate-limited: the guest still reaches
// /m/[code], just without a minted identity.
async function mintSpaceGuest(
  ctx: MutationCtx,
  params: {
    spaceId: Id<"memoriesSpaces">;
    cardId: Id<"cards">;
    ipKey: string;
    now: number;
  },
): Promise<string | null> {
  const minting = await rateLimiter.limit(ctx, "guestCreate", {
    key: params.ipKey,
  });
  if (!minting.ok) return null;
  // The person: a fresh 256-bit bearer key. The card is attributed as the
  // TABLE (guest.cardId) so per-card stats survive re-cookieing; quota is per
  // guest, statistics per card (RFC §2.6).
  const guestKey = generateGuestKey();
  await ctx.db.insert("memoriesGuests", {
    spaceId: params.spaceId,
    guestKey,
    cardId: params.cardId,
    photoCount: 0,
    firstSeenAt: params.now,
    lastSeenAt: params.now,
    updatedAt: params.now,
  });
  return guestKey;
}

// Resolve a printed card to its redirect target and record the scan. One
// mutation, one transaction: the scan event, the daily rollup, the card total
// and (for memories targets) the guest row all commit or roll back together.
//
// Statistics are idempotent on requestId (by_requestId): a transport retry of
// the same handler invocation records ONE cardScanEvents row and one count.
// Guest minting is deliberately NOT keyed to the requestId — the /r/ handler
// cannot see the path-scoped guest cookie, so every completed memories scan
// mints a fresh identity; the guest UI's localStorage mirror restores the
// original one (RFC §2.6), and abandoned rows are empty and rate-limited.
export const resolveAndRecord = mutation({
  args: {
    cardCode: v.string(),
    requestId: v.string(),
    deviceCategory: v.optional(deviceCategory),
    // HMAC/salted hash of the caller IP, computed by the Next handler purely as
    // a rate-limit key. The raw IP never reaches Convex and nothing persists it
    // beyond the limiter's transient bucket state (GDPR §2.10).
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResolveOutcome> => {
    // Absent ipHash (a direct API caller bypassing the handler) collapses into
    // one shared bucket, so unkeyed floods throttle collectively.
    const ipKey = args.ipHash ?? "shared";
    const allowed = await rateLimiter.limit(ctx, "cardResolve", { key: ipKey });
    if (!allowed.ok) return { kind: "rate_limited" };

    const cardCode = normalizeCode(args.cardCode);
    if (!cardCode) return { kind: "invalid" };
    const card = await ctx.db
      .query("cards")
      .withIndex("by_cardCode", (q) => q.eq("cardCode", cardCode))
      .unique();
    if (!card || card.status !== "active" || !card.currentTargetId) {
      return { kind: "invalid" };
    }
    const target = await ctx.db.get(card.currentTargetId);
    if (!target) return { kind: "invalid" };

    const now = Date.now();
    const duplicate = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (!duplicate) {
      await ctx.db.insert("cardScanEvents", {
        cardId: card._id,
        requestId: args.requestId,
        occurredAt: now,
        targetKind: target.kind,
        deviceCategory: args.deviceCategory,
      });
      // Bots are recorded as events but never counted — the same suppression
      // the Links pipeline applies to its totals.
      if (args.deviceCategory !== "bot") {
        await ctx.db.patch(card._id, {
          totalScans: card.totalScans + 1,
          updatedAt: now,
        });
        const dateKey = serviceMetricDateKey(now);
        const daily = await ctx.db
          .query("dailyCardMetrics")
          .withIndex("by_cardId_and_dateKey", (q) =>
            q.eq("cardId", card._id).eq("dateKey", dateKey),
          )
          .unique();
        if (daily) {
          await ctx.db.patch(daily._id, {
            scans: daily.scans + 1,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("dailyCardMetrics", {
            cardId: card._id,
            dateKey,
            scans: 1,
            updatedAt: now,
          });
        }
      }
    }

    switch (target.kind) {
      case "venue": {
        const business = await ctx.db.get(card.businessId);
        if (!business) return { kind: "invalid" };
        return { kind: "venue", businessSlug: business.slug };
      }
      case "event": {
        if (!target.eventId) return { kind: "invalid" };
        const event = await ctx.db.get(target.eventId);
        if (!event) return { kind: "invalid" };
        const business = await ctx.db.get(event.businessId);
        if (!business) return { kind: "invalid" };
        return {
          kind: "event",
          businessSlug: business.slug,
          eventSlug: event.slug,
        };
      }
      case "service_page": {
        if (!target.serviceProfileId) return { kind: "invalid" };
        const profile = await ctx.db.get(target.serviceProfileId);
        if (!profile) return { kind: "invalid" };
        return { kind: "service_page", slug: profile.slug };
      }
      case "url": {
        // Re-validated at resolve time (defence in depth over the write gate):
        // a URL that has become unsafe under a tightened policy stops resolving.
        if (!target.url || !isSafePublicDestination(target.url)) {
          return { kind: "invalid" };
        }
        return { kind: "url", url: target.url };
      }
      case "memories_space": {
        if (!target.spaceId) return { kind: "invalid" };
        const space = await ctx.db.get(target.spaceId);
        if (!space) return { kind: "invalid" };
        const guestKey = await mintSpaceGuest(ctx, {
          spaceId: space._id,
          cardId: card._id,
          ipKey,
          now,
        });
        return { kind: "memories_space", code: space.code, guestKey };
      }
      case "splitter":
        // The scan is recorded above (one physical scan, targetKind
        // "splitter"); choosing a button is NOT another scan. The Memories
        // button goes through resolveSplitterMemories — never a client link
        // to /m/[code] (RFC-002 §2.4).
        return { kind: "splitter", cardCode: card.cardCode };
    }
  },
});

// -----------------------------------------------------------------------------
// TASK-37 — the bare splitter (RFC-002 §2.4): one card, several services.
// -----------------------------------------------------------------------------

type SplitterButton = {
  label: string;
  // Relative for internal destinations, absolute https for kind "url". The
  // Memories button's href is the card-aware server hop /r/[cardCode]/m —
  // NEVER a client link to /m/[code], which would mint a guest with no cardId
  // and silently kill the per-table quota (RFC-002 §2.4).
  href: string;
  external: boolean;
};

type SplitterView =
  | { status: "invalid" }
  | { status: "ok"; businessName: string; buttons: SplitterButton[] };

// The bare splitter page's read model (app/r/[cardCode]/izbor). Public and
// read-only: it exposes the labels and slugs the printed card already leads
// to, and the abusable surfaces around it are rate-limited mutations (the
// /r/ resolve before it, the /m hop after it) — a query cannot consume
// limiter tokens, and there is nothing here worth flooding for.
export const getSplitterView = query({
  args: { cardCode: v.string() },
  handler: async (ctx, args): Promise<SplitterView> => {
    const cardCode = normalizeCode(args.cardCode);
    if (!cardCode) return { status: "invalid" };
    const card = await ctx.db
      .query("cards")
      .withIndex("by_cardCode", (q) => q.eq("cardCode", cardCode))
      .unique();
    if (!card || card.status !== "active" || !card.currentTargetId) {
      return { status: "invalid" };
    }
    const target = await ctx.db.get(card.currentTargetId);
    if (target?.kind !== "splitter" || !target.splitterItems) {
      return { status: "invalid" };
    }
    const business = await ctx.db.get(card.businessId);
    if (!business) return { status: "invalid" };

    const buttons: SplitterButton[] = [];
    for (const item of target.splitterItems) {
      switch (item.kind) {
        case "memories_space": {
          if (!item.spaceId) continue;
          const space = await ctx.db.get(item.spaceId);
          if (!space) continue;
          buttons.push({
            label: item.label,
            href: `/r/${cardCode}/m?space=${space.code}`,
            external: false,
          });
          break;
        }
        case "venue":
          buttons.push({
            label: item.label,
            href: `/${business.slug}/venue`,
            external: false,
          });
          break;
        case "event": {
          if (!item.eventId) continue;
          const event = await ctx.db.get(item.eventId);
          if (!event) continue;
          buttons.push({
            label: item.label,
            href: `/${business.slug}/venue/${event.slug}`,
            external: false,
          });
          break;
        }
        case "service_page": {
          if (!item.serviceProfileId) continue;
          const profile = await ctx.db.get(item.serviceProfileId);
          if (!profile) continue;
          buttons.push({
            label: item.label,
            href: `/${profile.slug}`,
            external: false,
          });
          break;
        }
        case "url": {
          // Re-validated at read time (defence in depth over the write gate),
          // exactly as the direct url resolve does.
          if (!item.url || !isSafePublicDestination(item.url)) continue;
          buttons.push({ label: item.label, href: item.url, external: true });
          break;
        }
      }
    }
    if (buttons.length === 0) return { status: "invalid" };
    return { status: "ok", businessName: business.name, buttons };
  },
});

type SplitterMemoriesOutcome =
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "memories_space"; code: string; guestKey: string | null };

// The card-aware second hop (RFC-002 §2.4): the splitter's Memories button
// lands on app/r/[cardCode]/m, whose handler calls THIS mutation — the same
// guest-minting path as the direct memories_space resolve (mintSpaceGuest),
// so the guest is created WITH the card's cardId and the table survives.
//
// Rate limiting mirrors cardResolve (ip-hash-keyed token bucket, same size)
// but on its OWN bucket: a room's memories entry now spends one cardResolve
// token at scan and one splitterMemoriesHop token at the button tap, so
// sharing cardResolve's bucket would double-spend it and halve the room burst
// TASK-25 sized it for. guestCreate is still spent exactly once per guest —
// here, not at scan time (the splitter scan mints nothing; §2.4's rejected
// pre-minting alternative explains why).
//
// No scan-statistics recording on purpose: the physical scan was recorded by
// resolveAndRecord; a button tap is not a second scan, and requestId-style
// idempotency exists only to protect statistics.
export const resolveSplitterMemories = mutation({
  args: {
    cardCode: v.string(),
    spaceCode: v.string(),
    // Same contract as resolveAndRecord: a salted hash computed by the Next
    // handler purely as a rate-limit key; the raw IP never reaches Convex.
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SplitterMemoriesOutcome> => {
    const ipKey = args.ipHash ?? "shared";
    const allowed = await rateLimiter.limit(ctx, "splitterMemoriesHop", {
      key: ipKey,
    });
    if (!allowed.ok) return { kind: "rate_limited" };

    const cardCode = normalizeCode(args.cardCode);
    const spaceCode = normalizeCode(args.spaceCode);
    if (!cardCode || !spaceCode) return { kind: "invalid" };
    const card = await ctx.db
      .query("cards")
      .withIndex("by_cardCode", (q) => q.eq("cardCode", cardCode))
      .unique();
    if (!card || card.status !== "active" || !card.currentTargetId) {
      return { kind: "invalid" };
    }
    const target = await ctx.db.get(card.currentTargetId);
    if (target?.kind !== "splitter" || !target.splitterItems) {
      return { kind: "invalid" };
    }

    // The hop mints ONLY for a space this splitter actually offers — without
    // this, any splitter card would be an open minting oracle attributing
    // foreign spaces' guests to its own table.
    let space: Doc<"memoriesSpaces"> | null = null;
    for (const item of target.splitterItems) {
      if (item.kind !== "memories_space" || !item.spaceId) continue;
      const candidate = await ctx.db.get(item.spaceId);
      if (candidate?.code === spaceCode) {
        space = candidate;
        break;
      }
    }
    if (!space) return { kind: "invalid" };

    const guestKey = await mintSpaceGuest(ctx, {
      spaceId: space._id,
      cardId: card._id,
      ipKey,
      now: Date.now(),
    });
    return { kind: "memories_space", code: space.code, guestKey };
  },
});
