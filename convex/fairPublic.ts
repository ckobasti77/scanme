import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import {
  FAIR_MAX_MODEL_IDS_PER_READ,
  type FairPublicEvent,
  type FairPublicModel,
  type FairSpecificationGroup,
} from "../lib/fair-contract";
import { deriveFairCapabilities } from "../lib/fair-entitlements";
import { fairPublicEventView, fairPublicModelView } from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — B2 public, read-only catalog resolver (BACKEND-HANDOFF
// §6, §7 fairPublic). No identity, no PII, no rating aggregate, no write:
//  - these are queries, so opening a model page or a garage card can never
//    record a scan (the only scan writer is cards.resolveAndRecord);
//  - nothing here returns contacts, report emails, lead notes, QR codes,
//    package tier strings or counters — the frontend renders the
//    server-derived `capabilities` (lib/fair-entitlements.ts) only.
// Visitor-specific state (my rating, my vote, my passport) goes through the
// same-origin POST gateway in app/api/fair/** (B3), never through here.
//
// Visibility: a model is public while it is `published` — the same gate the
// /r resolver uses. A `draft` event is not public (getEventBySlug → null).
// =============================================================================

// Bounded child reads (technical caps, not business rules).
const EVENT_DAYS_CAP = 31;
const QUESTIONS_PER_MODEL_CAP = 50;
const SNAPSHOT_ITEMS_CAP = 500;
const SLUG_MAX = 120;

type PublicEvent = Infer<typeof fairPublicEventView>;
type PublicModel = Infer<typeof fairPublicModelView>;

async function publicEventView(ctx: QueryCtx, event: Doc<"fairEvents">): Promise<FairPublicEvent> {
  const days = await ctx.db
    .query("fairEventDays")
    .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event._id))
    .take(EVENT_DAYS_CAP);
  return {
    id: event._id,
    code: event.code,
    slug: event.slug,
    title: event.title,
    venueName: event.venueName,
    timezone: event.timezone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    garagePriority: event.garagePriority,
    days: days
      .map((day) => ({
        id: day._id,
        dateKey: day.dateKey,
        label: day.label,
        startsAt: day.startsAt,
        endsAt: day.endsAt,
        sortOrder: day.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** Groups and orders specifications on the server (JOVAN-DELTA §3). */
function specificationGroups(specifications: Doc<"fairEventModels">["specifications"]): FairSpecificationGroup[] {
  const groups = new Map<string, FairSpecificationGroup>();
  for (const item of specifications) {
    let group = groups.get(item.groupId);
    if (!group) {
      group = { id: item.groupId, label: item.groupLabel, order: item.groupOrder, items: [] };
      groups.set(item.groupId, group);
    }
    group.items.push({ id: item.id, label: item.label, value: item.value, order: item.order, isHighlight: item.isHighlight });
  }
  // Array sort is stable: equal orders keep stored order.
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({ ...group, items: group.items.sort((a, b) => a.order - b.order) }));
}

/** Per-call memo so a garage read touches each shared row once. */
function memo<K, V>(load: (key: K) => Promise<V>) {
  const cache = new Map<K, Promise<V>>();
  return (key: K) => {
    let hit = cache.get(key);
    if (!hit) {
      hit = load(key);
      cache.set(key, hit);
    }
    return hit;
  };
}

function projector(ctx: QueryCtx) {
  const event = memo((id: Id<"fairEvents">) => ctx.db.get(id));
  const participation = memo((id: Id<"fairParticipations">) => ctx.db.get(id));
  const business = memo((id: Id<"businesses">) => ctx.db.get(id));
  const brand = memo((id: Id<"brands">) => ctx.db.get(id));
  const stand = memo((id: Id<"fairStands">) => ctx.db.get(id));
  // Models in the event's published sponsored snapshot (B5 writes it).
  const sponsored = memo(async (eventId: Id<"fairEvents">) => {
    const snapshot = await ctx.db
      .query("fairSponsoredSnapshots")
      .withIndex("by_eventId_and_status", (q) => q.eq("eventId", eventId).eq("status", "published"))
      .first();
    if (!snapshot) return new Set<string>();
    const items = await ctx.db
      .query("fairSponsoredSnapshotItems")
      .withIndex("by_snapshotId_and_order", (q) => q.eq("snapshotId", snapshot._id))
      .take(SNAPSHOT_ITEMS_CAP);
    return new Set<string>(items.map((item) => item.eventModelId));
  });

  return async function project(model: Doc<"fairEventModels">): Promise<FairPublicModel | null> {
    if (model.status !== "published") return null;
    const [eventRow, participationRow, brandRow, standRow] = await Promise.all([
      event(model.eventId),
      participation(model.participationId),
      brand(model.brandId),
      stand(model.standId),
    ]);
    if (!eventRow || !participationRow || !brandRow || !standRow) return null;
    const businessRow = await business(participationRow.businessId);
    if (!businessRow) return null;

    // Capability facts (B3/B4/B5 own the writers; absent rows = not offered).
    // B3 narrows audience questions to the current fair day.
    const [questions, survey, interest, testDrive, sponsoredIds] = await Promise.all([
      ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", model._id))
        .take(QUESTIONS_PER_MODEL_CAP),
      ctx.db
        .query("fairSurveys")
        .withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", model._id).eq("status", "published"))
        .first(),
      ctx.db
        .query("fairLeadConfigs")
        .withIndex("by_eventModelId_and_leadKind", (q) => q.eq("eventModelId", model._id).eq("leadKind", "interest"))
        .first(),
      ctx.db
        .query("fairLeadConfigs")
        .withIndex("by_eventModelId_and_leadKind", (q) => q.eq("eventModelId", model._id).eq("leadKind", "test_drive"))
        .first(),
      sponsored(model.eventId),
    ]);
    const photoUrl = model.photoUrl ?? (model.photoStorageId ? await ctx.storage.getUrl(model.photoStorageId) : null) ?? undefined;

    return {
      id: model._id,
      eventId: eventRow._id,
      eventSlug: eventRow.slug,
      eventTitle: eventRow.title,
      participationId: participationRow._id,
      exhibitorName: businessRow.name,
      brandId: brandRow._id,
      brandName: brandRow.name,
      standId: standRow._id,
      standMapLocationId: standRow.mapLocationId,
      slug: model.slug,
      displayName: model.displayName,
      ...(model.variant ? { variant: model.variant } : {}),
      priceText: model.priceText,
      specificationGroups: specificationGroups(model.specifications),
      ...(photoUrl ? { photoUrl } : {}),
      capabilities: deriveFairCapabilities(model.packageTier, {
        hasOpenAudienceQuestions: questions.some((question) => question.status === "published"),
        hasPublishedSurvey: survey !== null,
        inPublishedSponsoredSnapshot: sponsoredIds.has(model._id),
        interestLeadEnabled: interest?.enabled === true,
        testDriveLeadEnabled: testDrive?.enabled === true,
      }),
    };
  };
}

async function eventBySlug(ctx: QueryCtx, slug: string) {
  if (!slug || slug.length > SLUG_MAX) return null;
  return ctx.db
    .query("fairEvents")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
}

/** Public event shell data (days in Europe/Belgrade). Draft events are not public. */
export const getEventBySlug = query({
  args: { slug: v.string() },
  returns: v.union(fairPublicEventView, v.null()),
  handler: async (ctx, args): Promise<PublicEvent | null> => {
    const event = await eventBySlug(ctx, args.slug);
    if (!event || event.status === "draft") return null;
    return publicEventView(ctx, event);
  },
});

/** The model page read. A page view is NOT a scan: this query cannot write. */
export const getModelBySlug = query({
  args: { eventSlug: v.string(), modelSlug: v.string() },
  returns: v.union(fairPublicModelView, v.null()),
  handler: async (ctx, args): Promise<PublicModel | null> => {
    const event = await eventBySlug(ctx, args.eventSlug);
    if (!event || !args.modelSlug || args.modelSlug.length > SLUG_MAX) return null;
    const model = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_slug", (q) => q.eq("eventId", event._id).eq("slug", args.modelSlug))
      .first();
    return model ? projector(ctx)(model) : null;
  },
});

/**
 * Cards for the ids a local garage holds (both events). At most
 * FAIR_MAX_MODEL_IDS_PER_READ ids; unknown, malformed or unpublished ids are
 * skipped (a garage may outlive a withdrawn model). Input order is kept.
 */
export const getModelsByIds = query({
  args: { ids: v.array(v.string()) },
  returns: v.array(fairPublicModelView),
  handler: async (ctx, args): Promise<PublicModel[]> => {
    if (args.ids.length > FAIR_MAX_MODEL_IDS_PER_READ) {
      throw new ConvexError({ code: "INVALID_INPUT", details: { max: FAIR_MAX_MODEL_IDS_PER_READ } });
    }
    const project = projector(ctx);
    const out: PublicModel[] = [];
    for (const raw of new Set(args.ids)) {
      const id = ctx.db.normalizeId("fairEventModels", raw);
      const model = id ? await ctx.db.get(id) : null;
      const view = model ? await project(model) : null;
      if (view) out.push(view);
    }
    return out;
  },
});
