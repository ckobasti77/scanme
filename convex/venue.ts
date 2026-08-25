import { ConvexError, v } from "convex/values";
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
import { requireServiceEditorAccess } from "./lib/access";
import { optionalText, requireSlug, requireText } from "./lib/validation";
import { venueBlockValidator, venueDesignValidator } from "./lib/venueValidators";
import { clampBlockList, type VenueBlock } from "../lib/venue-blocks";
import type { ReservationProps } from "../lib/venue-blocks";
import { fmt, getDict } from "../lib/i18n";
import { normalizeEmail, normalizePhone } from "./lib/validation";

// =============================================================================
// TASK-08 — Venue backend: event lifecycle, draft/publish, public queries.
//
// The write/read backend for ScanMe Venue. No React, no routes — everything here
// is provable with convex-test. The lifecycle state machine (RFC-001 §2.2), the
// draft/publish contract (RFC-001 §1.d, §2.4), the access + entitlement gates
// (§2.9), and the render-ready public queries (§2.7). The block model and its
// validators are TASK-07 (lib/venue-blocks.ts, convex/lib/venueValidators.ts);
// this file imports them and normalizes on write exactly the way
// convex/scanMeLinks.ts imports lib/scanme-links-design.ts.
//
// Two invariants carry this module:
//   1. NO QUERY READS THE WALL CLOCK. Event status is materialized into the DB
//      by the scheduled `goLive`/`endEvent` mutations and the reconcile cron;
//      the public queries read only the stored `status` field. This is required
//      by convex/_generated/ai/guidelines.md.
//   2. `publishDraft` is the ONLY writer of any published-content field on
//      `venueEventConfigs`. ScanMe Links has three out-of-band writers
//      (RFC §1.d); Venue must not inherit that ambiguity. The required
//      non-optional `publishedRevision` is initialized to 0 at row creation
//      (createEvent/duplicateEvent) and thereafter written only by publishDraft.
// =============================================================================

const dict = getDict("venue-editor");
// Guest-facing copy (the public page surface) — used by submitReservation,
// whose errors render on the public reservation form, not in the editor.
const venueDict = getDict("venue");

// "arhiva" is the reserved archive-listing segment of /[business]/venue/arhiva
// (RFC §2.7); an event may never claim it as its own slug.
const RESERVED_EVENT_SLUGS = new Set(["arhiva"]);

// Reconcile-cron batch size: bounded per sweep, self-healing on the next tick.
const RECONCILE_BATCH = 100;

// The pure block model types storage ids as `string`; the schema/validators
// brand them `Id<"_storage">` (a compile-time-only brand). Cast at the boundary
// — the validator still checks the runtime shape (see venueValidators.test.ts).
type StoredBlocks = Doc<"venueEventConfigs">["draftBlocks"];
const asPureBlocks = (blocks: unknown): VenueBlock[] =>
  (blocks ?? []) as unknown as VenueBlock[];
const asStoredBlocks = (blocks: VenueBlock[]): StoredBlocks =>
  blocks as unknown as StoredBlocks;

// -----------------------------------------------------------------------------
// Shared loaders / gates
// -----------------------------------------------------------------------------

// Load an event + its 1:1 config + the venue profile, enforcing editor access.
// Every editor mutation funnels through here so the access check can never be
// forgotten (RFC §2.9).
async function loadEventForEditor(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError(dict.eventNotFound);
  const config = await ctx.db
    .query("venueEventConfigs")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
  if (!config) throw new ConvexError(dict.configNotFound);
  const profile = await ctx.db.get(config.venueProfileId);
  if (!profile) throw new ConvexError(dict.configNotFound);
  await requireServiceEditorAccess(ctx, profile, ["scanme_venue"]);
  return { event, config, profile };
}

// The entitlement gate (RFC §2.9, STEP 3): the Venue plan's `allowedBlockKeys`
// is enforced server-side, in the same transaction as the gated write, at both
// saveDraft and publishDraft. The client never transmits its own limits.
//
// Venue tiers are an open question (RFC §5 Q1). Until they are decided the plan
// catalog leaves `allowedBlockKeys` empty, so this gate is intentionally
// PERMISSIVE: an unset or empty allow-list — and the no-entitlement case — mean
// "all blocks allowed", because forbidding every block before tiers exist would
// make the product unusable. It only restricts once a non-empty allow-list
// resolves (e.g. via an entitlement `overrides.allowedBlockKeys`).
async function assertBlocksAllowedByPlan(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  blocks: VenueBlock[],
) {
  const entitlement = await getEntitlement(ctx, businessId, "scanme_venue");
  const allowed = entitlement?.limits.allowedBlockKeys;
  if (!allowed || allowed.length === 0) return; // unset/empty ⇒ all allowed
  const allowedSet = new Set(allowed);
  for (const block of blocks) {
    if (!allowedSet.has(block.type)) {
      throw new ConvexError(fmt(dict.blockNotAllowed, { block: block.type }));
    }
  }
}

// A fresh event slug: valid slug format, not the reserved "arhiva", and unique
// within the business.
async function resolveNewEventSlug(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  rawSlug: string,
) {
  const slug = requireSlug(rawSlug);
  if (RESERVED_EVENT_SLUGS.has(slug)) {
    throw new ConvexError(fmt(dict.eventSlugReserved, { slug }));
  }
  const existing = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_slug", (q) =>
      q.eq("businessId", businessId).eq("slug", slug),
    )
    .unique();
  if (existing) throw new ConvexError(dict.eventSlugTaken);
  return slug;
}

// -----------------------------------------------------------------------------
// STEP 1 — Lifecycle state machine (RFC §2.2)
//   draft → scheduled → live → ended → archived
// -----------------------------------------------------------------------------

export const createEvent = mutation({
  args: {
    venueProfileId: v.id("serviceProfiles"),
    slug: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.venueProfileId);
    if (!profile) throw new ConvexError(dict.configNotFound);
    await requireServiceEditorAccess(ctx, profile, ["scanme_venue"]);
    const slug = await resolveNewEventSlug(ctx, profile.businessId, args.slug);
    const title = requireText(args.title, "Naziv događaja", 1, 120);
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      businessId: profile.businessId,
      slug,
      title,
      status: "draft",
      lifecycleRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
    // The 1:1 config starts empty and unpublished. `publishedRevision` is a
    // required field initialized to 0 here; every published-content field stays
    // unset until publishDraft writes it.
    await ctx.db.insert("venueEventConfigs", {
      eventId,
      venueProfileId: profile._id,
      hasUnpublishedChanges: false,
      draftRevision: 0,
      publishedRevision: 0,
      updatedAt: now,
    });
    return { eventId, slug };
  },
});

// "Duplicate the previous event's design" (RFC §2.2): copies the source config's
// published* into the new config's draft* and stamps `duplicatedFromEventId`.
// This is the "change only what is event-specific" flow the owner uses weekly.
export const duplicateEvent = mutation({
  args: {
    sourceEventId: v.id("events"),
    slug: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceEventId);
    if (!source) throw new ConvexError(dict.eventNotFound);
    const sourceConfig = await ctx.db
      .query("venueEventConfigs")
      .withIndex("by_eventId", (q) => q.eq("eventId", source._id))
      .unique();
    if (!sourceConfig) throw new ConvexError(dict.configNotFound);
    const profile = await ctx.db.get(sourceConfig.venueProfileId);
    if (!profile) throw new ConvexError(dict.configNotFound);
    await requireServiceEditorAccess(ctx, profile, ["scanme_venue"]);

    const slug = await resolveNewEventSlug(ctx, source.businessId, args.slug);
    const title = requireText(args.title, "Naziv događaja", 1, 120);
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      businessId: source.businessId,
      slug,
      title,
      status: "draft",
      lifecycleRevision: 0,
      duplicatedFromEventId: source._id,
      createdAt: now,
      updatedAt: now,
    });
    // Copy published* → draft*. The new event is unpublished (draftRevision 1,
    // dirty flag set); `publishedRevision` is the initial 0 and no
    // published-content field is written outside publishDraft.
    await ctx.db.insert("venueEventConfigs", {
      eventId,
      venueProfileId: profile._id,
      draftDisplayName: sourceConfig.publishedDisplayName,
      draftDesign: sourceConfig.publishedDesign,
      draftBlocks: sourceConfig.publishedBlocks,
      draftLogoStorageId: sourceConfig.publishedLogoStorageId,
      draftBackgroundImageStorageId:
        sourceConfig.publishedBackgroundImageStorageId,
      draftBackgroundVideoStorageId:
        sourceConfig.publishedBackgroundVideoStorageId,
      hasUnpublishedChanges: true,
      draftRevision: 1,
      publishedRevision: 0,
      updatedAt: now,
    });
    return { eventId, slug };
  },
});

// draft → scheduled (and reschedule). Validates times, requires a published
// config, forbids overlap with another scheduled/live event, cancels any prior
// scheduled functions, bumps `lifecycleRevision`, and schedules goLive/endEvent
// carrying that revision (the OCC guard for the timed flips).
export const scheduleEvent = mutation({
  args: {
    eventId: v.id("events"),
    startsAt: v.number(),
    endsAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { event, config } = await loadEventForEditor(ctx, args.eventId);
    if (event.status !== "draft" && event.status !== "scheduled") {
      throw new ConvexError(dict.scheduleWrongStatus);
    }
    if (
      !Number.isFinite(args.startsAt) ||
      !Number.isFinite(args.endsAt)
    ) {
      throw new ConvexError(dict.scheduleTimesRequired);
    }
    if (args.startsAt >= args.endsAt) {
      throw new ConvexError(dict.scheduleTimesOrder);
    }
    // A published config revision must exist before an event can go public.
    if (config.publishedAt === undefined) {
      throw new ConvexError(dict.schedulePublishRequired);
    }
    await assertNoOverlap(ctx, event, args.startsAt, args.endsAt);

    // Cancel any functions from a prior schedule so a stale flip can never fire.
    if (event.scheduledGoLiveId) {
      await ctx.scheduler.cancel(event.scheduledGoLiveId);
    }
    if (event.scheduledEndId) {
      await ctx.scheduler.cancel(event.scheduledEndId);
    }
    const nextRevision = event.lifecycleRevision + 1;
    const scheduledGoLiveId = await ctx.scheduler.runAt(
      args.startsAt,
      internal.venue.goLive,
      { eventId: event._id, expectedRevision: nextRevision },
    );
    const scheduledEndId = await ctx.scheduler.runAt(
      args.endsAt,
      internal.venue.endEvent,
      { eventId: event._id, expectedRevision: nextRevision },
    );
    const now = Date.now();
    await ctx.db.patch(event._id, {
      status: "scheduled",
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      lifecycleRevision: nextRevision,
      scheduledGoLiveId,
      scheduledEndId,
      updatedAt: now,
    });
    return { lifecycleRevision: nextRevision };
  },
});

// Overlap check: another scheduled/live event of the same business whose
// [startsAt, endsAt) intersects the proposed window.
async function assertNoOverlap(
  ctx: MutationCtx,
  event: Doc<"events">,
  startsAt: number,
  endsAt: number,
) {
  for (const status of ["scheduled", "live"] as const) {
    const others = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", event.businessId).eq("status", status),
      )
      .take(100);
    for (const other of others) {
      if (other._id === event._id) continue;
      if (other.startsAt === undefined || other.endsAt === undefined) continue;
      if (other.startsAt < endsAt && startsAt < other.endsAt) {
        throw new ConvexError(dict.scheduleOverlap);
      }
    }
  }
}

// ended → archived: manual owner action. Writes the selected media list to
// `eventArchiveItems` and stamps `archivedAt`.
export const archiveEvent = mutation({
  args: {
    eventId: v.id("events"),
    mediaAssetIds: v.optional(v.array(v.id("mediaAssets"))),
  },
  handler: async (ctx, args) => {
    const { event } = await loadEventForEditor(ctx, args.eventId);
    if (event.status !== "ended") {
      throw new ConvexError(dict.archiveNotEnded);
    }
    const now = Date.now();
    const mediaAssetIds = args.mediaAssetIds ?? [];
    let order = 0;
    for (const mediaAssetId of mediaAssetIds) {
      const asset = await ctx.db.get(mediaAssetId);
      if (!asset || asset.businessId !== event.businessId) {
        throw new ConvexError(dict.archiveAssetInvalid);
      }
      await ctx.db.insert("eventArchiveItems", {
        eventId: event._id,
        mediaAssetId,
        order,
        createdAt: now,
      });
      order += 1;
    }
    await ctx.db.patch(event._id, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { archivedAt: now, itemCount: mediaAssetIds.length };
  },
});

// --- Scheduler-run timed transitions (idempotent) ---------------------------
//
// Each no-ops unless `lifecycleRevision` matches what it was scheduled with AND
// the status is the expected predecessor. A stale flip (after a reschedule bumps
// the revision, or after the transition already happened) is a silent no-op; it
// never forces a transition. This is the `expectedDraftRevision` OCC idea
// applied to time.

type TransitionOutcome = {
  changed: boolean;
  reason: "ok" | "missing" | "status" | "revision" | "liveConflict";
};

async function applyGoLive(
  ctx: MutationCtx,
  eventId: Id<"events">,
  expectedRevision: number,
  opts: { assertSingleLive: boolean },
): Promise<TransitionOutcome> {
  const event = await ctx.db.get(eventId);
  if (!event) return { changed: false, reason: "missing" };
  if (event.status !== "scheduled") return { changed: false, reason: "status" };
  if (event.lifecycleRevision !== expectedRevision) {
    return { changed: false, reason: "revision" };
  }
  // Single-live invariant: at most one live event per business.
  const otherLive = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", event.businessId).eq("status", "live"),
    )
    .first();
  if (otherLive && otherLive._id !== eventId) {
    if (opts.assertSingleLive) throw new ConvexError(dict.liveConflict);
    return { changed: false, reason: "liveConflict" };
  }
  await ctx.db.patch(eventId, { status: "live", updatedAt: Date.now() });
  return { changed: true, reason: "ok" };
}

async function applyEndEvent(
  ctx: MutationCtx,
  eventId: Id<"events">,
  expectedRevision: number,
): Promise<TransitionOutcome> {
  const event = await ctx.db.get(eventId);
  if (!event) return { changed: false, reason: "missing" };
  if (event.status !== "live") return { changed: false, reason: "status" };
  if (event.lifecycleRevision !== expectedRevision) {
    return { changed: false, reason: "revision" };
  }
  await ctx.db.patch(eventId, { status: "ended", updatedAt: Date.now() });
  return { changed: true, reason: "ok" };
}

// scheduled → live. Rejects a second live event for the business (RFC §2.2).
export const goLive = internalMutation({
  args: { eventId: v.id("events"), expectedRevision: v.number() },
  handler: async (ctx, args) => {
    return await applyGoLive(ctx, args.eventId, args.expectedRevision, {
      assertSingleLive: true,
    });
  },
});

// live → ended.
export const endEvent = internalMutation({
  args: { eventId: v.id("events"), expectedRevision: v.number() },
  handler: async (ctx, args) => {
    return await applyEndEvent(ctx, args.eventId, args.expectedRevision);
  },
});

// Reconcile cron (RFC §2.2): every 15 minutes, sweep for flips the scheduler
// missed (e.g. lost scheduled function). Operates on the CURRENT materialized
// state — it passes each event's own current `lifecycleRevision`, so the OCC
// guard is satisfied for live rows while status + time bounds still gate the
// flip. Overdue live events are ended first (freeing the single-live slot),
// then overdue scheduled events go live. Defensive: a live-conflict is skipped,
// never thrown, so one wedged event cannot abort the sweep.
export const reconcileEventLifecycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let ended = 0;
    let wentLive = 0;

    const liveDue = await ctx.db
      .query("events")
      .withIndex("by_status_and_endsAt", (q) =>
        q.eq("status", "live").lte("endsAt", now),
      )
      .take(RECONCILE_BATCH);
    for (const event of liveDue) {
      if (event.endsAt === undefined) continue;
      const outcome = await applyEndEvent(ctx, event._id, event.lifecycleRevision);
      if (outcome.changed) ended += 1;
    }

    const scheduledDue = await ctx.db
      .query("events")
      .withIndex("by_status_and_startsAt", (q) =>
        q.eq("status", "scheduled").lte("startsAt", now),
      )
      .take(RECONCILE_BATCH);
    for (const event of scheduledDue) {
      if (event.startsAt === undefined) continue;
      const outcome = await applyGoLive(ctx, event._id, event.lifecycleRevision, {
        assertSingleLive: false,
      });
      if (outcome.changed) wentLive += 1;
    }

    return { ended, wentLive };
  },
});

// -----------------------------------------------------------------------------
// STEP 2 — Draft/publish contract (RFC §1.d, §2.4)
// -----------------------------------------------------------------------------

// Draft writer: normalizes blocks on write (never trusts client input) via
// clampBlockList — exactly the way scanMeLinks' saveDraft calls
// normalizeDesignForPreset — enforces the entitlement gate, bumps
// `draftRevision`, and sets the dirty flag. An omitted arg leaves that field
// unchanged; an explicit `null` on a storage-id field clears it.
export const saveDraft = mutation({
  args: {
    eventId: v.id("events"),
    displayName: v.optional(v.string()),
    design: v.optional(venueDesignValidator),
    blocks: v.optional(v.array(venueBlockValidator)),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    backgroundImageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    backgroundVideoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const { event, config } = await loadEventForEditor(ctx, args.eventId);
    const now = Date.now();
    const patch: Partial<Doc<"venueEventConfigs">> = {
      hasUnpublishedChanges: true,
      draftRevision: config.draftRevision + 1,
      updatedAt: now,
    };
    if (args.displayName !== undefined) {
      patch.draftDisplayName = optionalText(args.displayName, 120);
    }
    if (args.design !== undefined) {
      patch.draftDesign = args.design;
    }
    if (args.blocks !== undefined) {
      const clamped = clampBlockList(asPureBlocks(args.blocks));
      await assertBlocksAllowedByPlan(ctx, event.businessId, clamped);
      patch.draftBlocks = asStoredBlocks(clamped);
    }
    if (args.logoStorageId !== undefined) {
      patch.draftLogoStorageId = args.logoStorageId;
    }
    if (args.backgroundImageStorageId !== undefined) {
      patch.draftBackgroundImageStorageId = args.backgroundImageStorageId;
    }
    if (args.backgroundVideoStorageId !== undefined) {
      patch.draftBackgroundVideoStorageId = args.backgroundVideoStorageId;
    }
    await ctx.db.patch(config._id, patch);
    return {
      draftRevision: config.draftRevision + 1,
      hasUnpublishedChanges: true,
    };
  },
});

// The ONLY writer of published-content fields on venueEventConfigs. Because
// blocks are an embedded array, publish is ONE OCC-guarded patch — no per-row
// loop, no partial state (unlike the destinations copy in scanMeLinks). Takes
// `expectedDraftRevision`, throws on mismatch, re-checks the entitlement gate,
// copies draft* → published*, sets `publishedRevision = draftRevision`, clears
// the dirty flag, stamps `publishedAt`. `draftRevision` is not advanced.
export const publishDraft = mutation({
  args: {
    eventId: v.id("events"),
    expectedDraftRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const { event, config } = await loadEventForEditor(ctx, args.eventId);
    if (config.draftRevision !== args.expectedDraftRevision) {
      throw new ConvexError(dict.draftChanged);
    }
    await assertBlocksAllowedByPlan(
      ctx,
      event.businessId,
      asPureBlocks(config.draftBlocks),
    );
    const now = Date.now();
    await ctx.db.patch(config._id, {
      publishedDisplayName: config.draftDisplayName,
      publishedDesign: config.draftDesign,
      publishedBlocks: config.draftBlocks,
      publishedLogoStorageId: config.draftLogoStorageId,
      publishedBackgroundImageStorageId: config.draftBackgroundImageStorageId,
      publishedBackgroundVideoStorageId: config.draftBackgroundVideoStorageId,
      hasUnpublishedChanges: false,
      publishedRevision: config.draftRevision,
      publishedAt: now,
      updatedAt: now,
    });
    return { publishedAt: now, publishedRevision: config.draftRevision };
  },
});

// -----------------------------------------------------------------------------
// STEP 4 — Public queries (unauthenticated; published data only; never the clock)
// -----------------------------------------------------------------------------

type VenuePageView = {
  event: {
    slug: string;
    title: string;
    status: Doc<"events">["status"];
    startsAt: number | null;
    endsAt: number | null;
  };
  displayName: string;
  design: Doc<"venueEventConfigs">["publishedDesign"] | null;
  blocks: NonNullable<Doc<"venueEventConfigs">["publishedBlocks"]>;
  logoUrl: string | null;
  backgroundImageUrl: string | null;
  backgroundVideoUrl: string | null;
};

// Build the render-ready view model from PUBLISHED state only. Returns null when
// the event was never published. Top-level media (logo, background image/video)
// is resolved to signed URLs here — mirroring publicLinksView exactly — so the
// route reads fields directly. Storage ids embedded inside blocks are left as
// ids for the block renderers (TASK-09) to resolve, and soft-hidden blocks
// (base.visible === false) are dropped so hidden content never leaves the server.
async function publishedVenuePageView(
  ctx: QueryCtx,
  event: Doc<"events">,
  config: Doc<"venueEventConfigs">,
): Promise<VenuePageView | null> {
  if (config.publishedAt === undefined) return null;
  const business = await ctx.db.get(event.businessId);
  if (!business) return null;

  // undefined logo ⇒ inherit the business logo; explicit null ⇒ no logo; an id
  // ⇒ the event's own logo (same rule as publicLinksView).
  const usesBusinessLogo = config.publishedLogoStorageId === undefined;
  const logoStorageId = usesBusinessLogo
    ? business.logoStorageId
    : config.publishedLogoStorageId;
  const logoUrl = logoStorageId
    ? await ctx.storage.getUrl(logoStorageId)
    : usesBusinessLogo
      ? business.logoUrl ?? null
      : null;
  const backgroundImageUrl = config.publishedBackgroundImageStorageId
    ? await ctx.storage.getUrl(config.publishedBackgroundImageStorageId)
    : null;
  const backgroundVideoUrl = config.publishedBackgroundVideoStorageId
    ? await ctx.storage.getUrl(config.publishedBackgroundVideoStorageId)
    : null;

  const blocks = (config.publishedBlocks ?? []).filter(
    (block) => block.base.visible !== false,
  );

  return {
    event: {
      slug: event.slug,
      title: event.title,
      status: event.status,
      startsAt: event.startsAt ?? null,
      endsAt: event.endsAt ?? null,
    },
    displayName: config.publishedDisplayName ?? business.name,
    design: config.publishedDesign ?? null,
    blocks,
    logoUrl,
    backgroundImageUrl,
    backgroundVideoUrl,
  };
}

async function businessBySlug(ctx: QueryCtx, businessSlug: string) {
  return await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", businessSlug))
    .unique();
}

async function venueProfileForBusiness(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
) {
  return await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", businessId).eq("type", "scanme_venue"),
    )
    .unique();
}

async function configForEvent(ctx: QueryCtx, eventId: Id<"events">) {
  return await ctx.db
    .query("venueEventConfigs")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
}

// /[business]/venue — the single live event's published page, or null (so the
// route can render the pre/ended state or 404). Reads the materialized `live`
// status via by_businessId_and_status; NEVER the wall clock.
export const publicVenueView = query({
  args: { businessSlug: v.string() },
  handler: async (ctx, args): Promise<VenuePageView | null> => {
    const business = await businessBySlug(ctx, args.businessSlug);
    if (!business) return null;
    const liveEvent = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id).eq("status", "live"),
      )
      .first();
    if (!liveEvent) return null;
    const config = await configForEvent(ctx, liveEvent._id);
    if (!config) return null;
    return await publishedVenuePageView(ctx, liveEvent, config);
  },
});

// /[business]/venue/[event] — a specific event's published page, or null.
export const publicEventView = query({
  args: { businessSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args): Promise<VenuePageView | null> => {
    const business = await businessBySlug(ctx, args.businessSlug);
    if (!business) return null;
    const event = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_slug", (q) =>
        q.eq("businessId", business._id).eq("slug", args.eventSlug),
      )
      .unique();
    if (!event) return null;
    const config = await configForEvent(ctx, event._id);
    if (!config) return null;
    return await publishedVenuePageView(ctx, event, config);
  },
});

type ArchivedEventView = {
  slug: string;
  title: string;
  startsAt: number | null;
  endsAt: number | null;
  archivedAt: number | null;
  items: Array<{
    id: Id<"eventArchiveItems">;
    order: number;
    fullUrl: string | null;
    thumbUrl: string | null;
    width: number;
    height: number;
  }>;
};

// /[business]/venue/arhiva — the archive list, newest first, each event with its
// ordered archive items resolved to URLs. Bounded per business.
export const archivedEvents = query({
  args: { businessSlug: v.string() },
  handler: async (ctx, args): Promise<ArchivedEventView[]> => {
    const business = await businessBySlug(ctx, args.businessSlug);
    if (!business) return [];
    const events = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_startsAt", (q) =>
        q.eq("businessId", business._id),
      )
      .order("desc")
      .take(200);
    const archived = events.filter((event) => event.status === "archived");

    const views: ArchivedEventView[] = [];
    for (const event of archived) {
      const itemRows = await ctx.db
        .query("eventArchiveItems")
        .withIndex("by_eventId_and_order", (q) => q.eq("eventId", event._id))
        .take(240);
      const items: ArchivedEventView["items"] = [];
      for (const row of itemRows) {
        const asset = await ctx.db.get(row.mediaAssetId);
        if (!asset || asset.status !== "ready") continue;
        const full = asset.variants.webp;
        const thumb = asset.variants.thumb;
        items.push({
          id: row._id,
          order: row.order,
          fullUrl: await ctx.storage.getUrl(full.ref as Id<"_storage">),
          thumbUrl: await ctx.storage.getUrl(thumb.ref as Id<"_storage">),
          width: full.width,
          height: full.height,
        });
      }
      views.push({
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt ?? null,
        endsAt: event.endsAt ?? null,
        archivedAt: event.archivedAt ?? null,
        items,
      });
    }
    return views;
  },
});

// -----------------------------------------------------------------------------
// TASK-10 — the editor's read model.
//
// One query feeds the standalone Venue editor (components/venue/editor/**),
// mirroring scanMeLinks.editorBySlug: resolve the business by slug, gate
// through requireServiceEditorAccess, and return the DRAFT state of the event
// the owner is editing. Access failure returns null (the loader renders a
// friendly screen instead of a crashed page — the Links precedent). This is
// the only editor read; every editor write still goes through saveDraft /
// publishDraft above.
// -----------------------------------------------------------------------------

// The editing target: the live event first (tweaks during the night), else the
// soonest scheduled one, else the most recently created draft. Ended/archived
// events are not edited — duplicateEvent is the flow for reusing them.
async function editorTargetEvent(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
): Promise<Doc<"events"> | null> {
  const live = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", businessId).eq("status", "live"),
    )
    .first();
  if (live) return live;

  const scheduled = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", businessId).eq("status", "scheduled"),
    )
    .take(100);
  let soonest: Doc<"events"> | null = null;
  for (const event of scheduled) {
    if (event.startsAt === undefined) continue;
    if (!soonest || event.startsAt < (soonest.startsAt ?? Infinity)) {
      soonest = event;
    }
  }
  if (soonest) return soonest;

  const drafts = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", businessId).eq("status", "draft"),
    )
    .take(100);
  let newest: Doc<"events"> | null = null;
  for (const event of drafts) {
    if (!newest || event.createdAt > newest.createdAt) newest = event;
  }
  return newest;
}

export const editorBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await businessBySlug(ctx, requireSlug(args.slug));
    if (!business) return null;
    const profile = await venueProfileForBusiness(ctx, business._id);
    if (!profile) return null;
    let access;
    try {
      access = await requireServiceEditorAccess(ctx, profile, ["scanme_venue"]);
    } catch {
      return null;
    }

    const event = await editorTargetEvent(ctx, business._id);
    const config = event ? await configForEvent(ctx, event._id) : null;

    // Draft logo semantics mirror the published side: undefined ⇒ inherit the
    // business logo; explicit null ⇒ no logo; an id ⇒ the event's own logo.
    let draftLogoUrl: string | null = null;
    let draftBackgroundImageUrl: string | null = null;
    let draftBackgroundVideoUrl: string | null = null;
    if (config) {
      const usesBusinessLogo = config.draftLogoStorageId === undefined;
      const logoStorageId = usesBusinessLogo
        ? business.logoStorageId
        : config.draftLogoStorageId;
      draftLogoUrl = logoStorageId
        ? await ctx.storage.getUrl(logoStorageId)
        : usesBusinessLogo
          ? business.logoUrl ?? null
          : null;
      draftBackgroundImageUrl = config.draftBackgroundImageStorageId
        ? await ctx.storage.getUrl(config.draftBackgroundImageStorageId)
        : null;
      draftBackgroundVideoUrl = config.draftBackgroundVideoStorageId
        ? await ctx.storage.getUrl(config.draftBackgroundVideoStorageId)
        : null;
    }

    return {
      businessId: business._id,
      businessName: business.name,
      businessSlug: business.slug,
      editorRole: access.role,
      profileStatus: profile.status,
      event:
        event && config
          ? {
              id: event._id,
              slug: event.slug,
              title: event.title,
              status: event.status,
              startsAt: event.startsAt ?? null,
              endsAt: event.endsAt ?? null,
              draftDisplayName: config.draftDisplayName ?? null,
              draftDesign: config.draftDesign ?? null,
              draftBlocks: config.draftBlocks ?? [],
              draftRevision: config.draftRevision,
              publishedRevision: config.publishedRevision,
              publishedAt: config.publishedAt ?? null,
              hasUnpublishedChanges: config.hasUnpublishedChanges,
              draftLogoUrl,
              draftBackgroundImageUrl,
              draftBackgroundVideoUrl,
            }
          : null,
    };
  },
});

// -----------------------------------------------------------------------------
// TASK-09 — the render layer's read path and the reservation write.
//
// publicVenuePageState is the /[slug]/venue route's single source of truth for
// the three lifecycle states (RFC §2.2: before / live / after). The route must
// NEVER 404 for a business that owns Venue — a printed card points there
// forever — and "before" must carry the upcoming event's published content, so
// the state machine below is a read-only extension of the public surface.
// Like every public query here it reads materialized `status`, never the clock.
// -----------------------------------------------------------------------------

type VenueLifecycleState =
  | { kind: "inactive" }
  | { kind: "live"; view: VenuePageView }
  | { kind: "before"; view: VenuePageView | null }
  | {
      kind: "after";
      lastEvent: {
        slug: string;
        title: string;
        startsAt: number | null;
        endsAt: number | null;
      } | null;
    };

type VenuePageState = {
  businessName: string;
  logoUrl: string | null;
  hasArchive: boolean;
  state: VenueLifecycleState;
};

// /[business]/venue — resolve the page state. Returns null ONLY when the
// business does not exist or owns no Venue profile (→ segment 404). Resolution:
// live event → "live"; soonest scheduled event → "before" (with its published
// view); most recent ended/archived event → "after"; a venue with no events at
// all → "before" with a null view (the empty state). A paused profile or
// business renders the graceful "inactive" state rather than 404.
export const publicVenuePageState = query({
  args: { businessSlug: v.string() },
  handler: async (ctx, args): Promise<VenuePageState | null> => {
    const business = await businessBySlug(ctx, args.businessSlug);
    if (!business) return null;
    const profile = await venueProfileForBusiness(ctx, business._id);
    if (!profile) return null;

    const logoUrl = business.logoStorageId
      ? await ctx.storage.getUrl(business.logoStorageId)
      : business.logoUrl ?? null;
    const anyArchived = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id).eq("status", "archived"),
      )
      .first();
    const base = {
      businessName: business.name,
      logoUrl,
      hasArchive: anyArchived !== null,
    };

    if (profile.status !== "active" || business.status === "inactive") {
      return { ...base, state: { kind: "inactive" } };
    }

    const liveEvent = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id).eq("status", "live"),
      )
      .first();
    if (liveEvent) {
      const config = await configForEvent(ctx, liveEvent._id);
      const view = config
        ? await publishedVenuePageView(ctx, liveEvent, config)
        : null;
      if (view) return { ...base, state: { kind: "live", view } };
    }

    // "before": the soonest scheduled event (bounded — a business has at most a
    // handful of scheduled events; the overlap guard forbids stacking them).
    const scheduled = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id).eq("status", "scheduled"),
      )
      .take(100);
    let next: Doc<"events"> | null = null;
    for (const event of scheduled) {
      if (event.startsAt === undefined) continue;
      if (!next || event.startsAt < (next.startsAt ?? Number.POSITIVE_INFINITY)) {
        next = event;
      }
    }
    if (next) {
      const config = await configForEvent(ctx, next._id);
      const view = config ? await publishedVenuePageView(ctx, next, config) : null;
      return { ...base, state: { kind: "before", view } };
    }

    // "after": the most recent ended/archived event.
    const recent = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_startsAt", (q) =>
        q.eq("businessId", business._id),
      )
      .order("desc")
      .take(100);
    const last =
      recent.find(
        (event) => event.status === "ended" || event.status === "archived",
      ) ?? null;
    if (last) {
      return {
        ...base,
        state: {
          kind: "after",
          lastEvent: {
            slug: last.slug,
            title: last.title,
            startsAt: last.startsAt ?? null,
            endsAt: last.endsAt ?? null,
          },
        },
      };
    }

    return { ...base, state: { kind: "before", view: null } };
  },
});

// -----------------------------------------------------------------------------
// submitReservation — the reservation block's backend (RFC §2.4 C.14), the one
// write on the public surface. Validated against the PUBLISHED block's field
// config, capacity-capped, deadline-checked, and rate-limited — all inside one
// serializable transaction, so two concurrent submissions can never both pass
// the capacity check (same OCC argument as the Memories quota, RFC §2.9).
// -----------------------------------------------------------------------------

// In-transaction rate limit: at most this many submissions per event per
// minute. An index-range count inside the mutation's own transaction — not a
// cross-transaction window scan, so it admits no races (RFC §2.9).
const RESERVATION_RATE_LIMIT_PER_MINUTE = 15;
const RESERVATION_RATE_WINDOW_MS = 60_000;
// Capacity reads are bounded: past this many rows the event is treated as full.
const RESERVATION_READ_CAP = 2000;
const RESERVATION_MAX_PARTY_SIZE = 500;

export const submitReservation = mutation({
  args: {
    businessSlug: v.string(),
    eventSlug: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    partySize: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const business = await businessBySlug(ctx, args.businessSlug);
    if (!business) throw new ConvexError(venueDict.reservationUnavailable);
    const event = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_slug", (q) =>
        q.eq("businessId", business._id).eq("slug", args.eventSlug),
      )
      .unique();
    if (!event) throw new ConvexError(venueDict.reservationUnavailable);
    if (event.status === "ended" || event.status === "archived") {
      throw new ConvexError(venueDict.reservationClosed);
    }
    const config = await configForEvent(ctx, event._id);
    // Only a PUBLISHED, visible reservation block accepts submissions — the
    // client never gets to pick its own field config.
    const reservationBlock = (config?.publishedBlocks ?? []).find(
      (block) => block.type === "reservation" && block.base.visible !== false,
    );
    if (!reservationBlock || reservationBlock.type !== "reservation") {
      throw new ConvexError(venueDict.reservationUnavailable);
    }
    const props = reservationBlock.props as ReservationProps;

    const now = Date.now();
    if (props.deadline !== undefined && now > props.deadline) {
      throw new ConvexError(venueDict.reservationDeadlinePassed);
    }

    // Rate limit: recent submissions for this event, counted in-transaction.
    const recent = await ctx.db
      .query("venueReservations")
      .withIndex("by_eventId_and_createdAt", (q) =>
        q
          .eq("eventId", event._id)
          .gte("createdAt", now - RESERVATION_RATE_WINDOW_MS),
      )
      .take(RESERVATION_RATE_LIMIT_PER_MINUTE);
    if (recent.length >= RESERVATION_RATE_LIMIT_PER_MINUTE) {
      throw new ConvexError(venueDict.reservationRateLimited);
    }

    // Honour the block's field config: enabled fields are validated, disabled
    // fields are dropped and never stored.
    const fields = props.fields;
    let name = "";
    if (fields.name) {
      name = (args.name ?? "").trim().replace(/\s+/g, " ");
      if (name.length === 0 || name.length > 120) {
        throw new ConvexError(venueDict.reservationNameRequired);
      }
    }
    const phone =
      fields.phone && args.phone?.trim() ? normalizePhone(args.phone) : undefined;
    const email =
      fields.email && args.email?.trim() ? normalizeEmail(args.email) : undefined;
    let partySize: number | undefined;
    if (fields.partySize && args.partySize !== undefined) {
      if (
        !Number.isInteger(args.partySize) ||
        args.partySize < 1 ||
        args.partySize > RESERVATION_MAX_PARTY_SIZE
      ) {
        throw new ConvexError(venueDict.reservationPartySizeInvalid);
      }
      partySize = args.partySize;
    }
    const note =
      fields.note && args.note ? optionalText(args.note, 500) : undefined;

    // Capacity: total seats (each reservation counts partySize, or 1 when the
    // field is off/absent). Counted and inserted in the same transaction.
    if (props.capacity !== undefined) {
      const existing = await ctx.db
        .query("venueReservations")
        .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id))
        .take(RESERVATION_READ_CAP);
      const used = existing.reduce((sum, row) => sum + (row.partySize ?? 1), 0);
      const requested = partySize ?? 1;
      if (
        existing.length >= RESERVATION_READ_CAP ||
        used + requested > props.capacity
      ) {
        throw new ConvexError(venueDict.reservationFull);
      }
    }

    await ctx.db.insert("venueReservations", {
      eventId: event._id,
      name,
      phone,
      email,
      partySize,
      note,
      createdAt: now,
    });
    return { ok: true as const };
  },
});
