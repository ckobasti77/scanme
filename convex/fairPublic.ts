import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import {
  FAIR_MAX_MODEL_IDS_PER_READ,
  type FairPublicEvent,
  type FairPublicEventMap,
  type FairPublicMapStand,
  type FairPublicModel,
  type FairSpecificationGroup,
} from "../lib/fair-contract";
import { deriveFairCapabilities, getFairEntitlements } from "../lib/fair-entitlements";
import { fairAudienceResult, fairModelQuestions, fairPassportState, fairVoteThreshold } from "./lib/fairInteractions";
import {
  fairAudienceQuestionView,
  fairAudienceResultView,
  fairPassportCatalogEntryView,
  fairPublicEventMapView,
  fairPublicEventView,
  fairPublicModelView,
  fairSurveyView,
} from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — B2 public, read-only catalog resolver (BACKEND-HANDOFF
// §6, §7 fairPublic). No identity, no PII, no rating aggregate, no write:
//  - these are queries, so opening a model page or a garage card can never
//    record a scan (the only scan writer is cards.resolveAndRecord);
//  - nothing here returns contacts, report emails, lead notes, QR codes,
//    package tier strings or counters — the frontend renders the
//    server-derived `capabilities` (lib/fair-entitlements.ts) only.
// Visitor-specific state (my rating, my vote, my passport) goes through the
// same-origin POST gateway in app/api/fair/** (B3, convex/fairInteractions.ts),
// never through here. B3 adds the audience questions and their public
// (≥5-vote) results, the published survey structure (never its results) and
// the passport catalog.
//
// Visibility: a model is public while it is `published` — the same gate the
// /r resolver uses. A `draft` event is not public (getEventBySlug → null).
// =============================================================================

// Bounded child reads (technical caps, not business rules).
const EVENT_DAYS_CAP = 31;
const QUESTIONS_PER_MODEL_CAP = 50;
const SNAPSHOT_ITEMS_CAP = 500;
const MAP_MODELS_CAP = 500;
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
    // B3: a question counts while it is `published` (admin publish/close);
    // a query cannot read the clock, so the per-day list is
    // listAudienceQuestionsForModel({ dateKey }) and the vote checks the window.
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

/**
 * M1 — the event map: every non-withdrawn stand with at least one published
 * model, its `mapLocationId` (lib/fair-map geometry) and safe exhibitor /
 * brand / model names. One bounded read of the event's models plus one read
 * per distinct stand, participation, business and brand. A query: showing
 * the map can never write (no impression, no analytics).
 */
export const getEventMap = query({
  args: { eventSlug: v.string() },
  returns: v.union(fairPublicEventMapView, v.null()),
  handler: async (ctx, args): Promise<FairPublicEventMap | null> => {
    const event = await eventBySlug(ctx, args.eventSlug);
    if (!event || event.status === "draft") return null;
    const models = (
      await ctx.db
        .query("fairEventModels")
        .withIndex("by_eventId_and_standId", (q) => q.eq("eventId", event._id))
        .take(MAP_MODELS_CAP)
    )
      .filter((model) => model.status === "published")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, "sr"));
    const stand = memo((id: Id<"fairStands">) => ctx.db.get(id));
    const participation = memo((id: Id<"fairParticipations">) => ctx.db.get(id));
    const business = memo((id: Id<"businesses">) => ctx.db.get(id));
    const brand = memo((id: Id<"brands">) => ctx.db.get(id));

    const stands = new Map<string, FairPublicMapStand>();
    for (const model of models) {
      const [standRow, participationRow, brandRow] = await Promise.all([stand(model.standId), participation(model.participationId), brand(model.brandId)]);
      if (!standRow || standRow.status === "withdrawn" || !participationRow || !brandRow) continue;
      const businessRow = await business(participationRow.businessId);
      if (!businessRow) continue;
      let entry = stands.get(standRow._id);
      if (!entry) {
        entry = {
          standId: standRow._id,
          mapLocationId: standRow.mapLocationId,
          code: standRow.code,
          displayName: standRow.displayName,
          exhibitorName: businessRow.name,
          brands: [],
        };
        stands.set(standRow._id, entry);
      }
      let brandEntry = entry.brands.find((row) => row.brandId === brandRow._id);
      if (!brandEntry) {
        brandEntry = { brandId: brandRow._id, brandName: brandRow.name, models: [] };
        entry.brands.push(brandEntry);
      }
      brandEntry.models.push({ id: model._id, slug: model.slug, displayName: model.displayName, ...(model.variant ? { variant: model.variant } : {}) });
    }
    return {
      eventId: event._id,
      stands: [...stands.values()].sort((a, b) => a.code.localeCompare(b.code, "sr", { numeric: true })),
    };
  },
});

// -----------------------------------------------------------------------------
// B3 — Glas publike, survey structure and passport catalog
// -----------------------------------------------------------------------------

type AudienceQuestion = Infer<typeof fairAudienceQuestionView>;

async function publishedModel(ctx: QueryCtx, rawId: string) {
  const id = ctx.db.normalizeId("fairEventModels", rawId);
  const model = id ? await ctx.db.get(id) : null;
  return model && model.status === "published" ? model : null;
}

/**
 * Published questions of a model, in day then `sortOrder` order. `dateKey`
 * (Europe/Belgrade `YYYY-MM-DD`) narrows to one fair day — the frontend passes
 * today. Votes are refused outside a question's own window anyway.
 */
export const listAudienceQuestionsForModel = query({
  args: { eventModelId: v.string(), dateKey: v.optional(v.string()) },
  returns: v.array(fairAudienceQuestionView),
  handler: async (ctx, args): Promise<AudienceQuestion[]> => {
    const model = await publishedModel(ctx, args.eventModelId);
    if (!model || getFairEntitlements(model.packageTier).audienceQuestionsPerDay === 0) return [];
    const days = new Map<string, { dateKey: string; sortOrder: number }>();
    const out: Array<{ question: AudienceQuestion; daySort: number }> = [];
    for (const question of await fairModelQuestions(ctx, model._id)) {
      if (question.status !== "published") continue;
      let day = days.get(question.eventDayId);
      if (!day) {
        const row = await ctx.db.get(question.eventDayId);
        if (!row) continue;
        day = { dateKey: row.dateKey, sortOrder: row.sortOrder };
        days.set(question.eventDayId, day);
      }
      if (args.dateKey !== undefined && day.dateKey !== args.dateKey) continue;
      out.push({
        daySort: day.sortOrder,
        question: {
          id: question._id,
          eventModelId: model._id,
          dateKey: day.dateKey,
          prompt: question.prompt,
          options: [...question.options].sort((a, b) => a.order - b.order).map((option) => ({ id: option.id, label: option.label, order: option.order })),
          order: question.sortOrder,
        },
      });
    }
    return out
      .sort((a, b) => a.daySort - b.daySort || a.question.order - b.question.order)
      .map((row) => row.question);
  },
});

/**
 * Public result of a published or closed question: `waiting_for_minimum`
 * (no percentage) below five votes, whole-number percentages from five. The
 * visitor's own choice comes only from the POST gateway.
 */
export const getAudienceQuestionResult = query({
  args: { questionId: v.string() },
  returns: v.union(fairAudienceResultView, v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("fairAudienceQuestions", args.questionId);
    const question = id ? await ctx.db.get(id) : null;
    if (!question || question.status === "draft") return null;
    const model = await ctx.db.get(question.eventModelId);
    const event = model && model.status === "published" ? await ctx.db.get(model.eventId) : null;
    if (!event) return null;
    return fairAudienceResult(ctx, question, fairVoteThreshold(event));
  },
});

/** The published survey version of an Advanced model (structure only; results are never public). */
export const getSurveyForModel = query({
  args: { eventModelId: v.string() },
  returns: v.union(fairSurveyView, v.null()),
  handler: async (ctx, args) => {
    const model = await publishedModel(ctx, args.eventModelId);
    if (!model || !getFairEntitlements(model.packageTier).survey) return null;
    const survey = await ctx.db
      .query("fairSurveys")
      .withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", model._id).eq("status", "published"))
      .first();
    if (!survey) return null;
    return {
      surveyId: survey._id,
      eventModelId: model._id,
      version: survey.version,
      ...(survey.title ? { title: survey.title } : {}),
      questions: [...survey.questions]
        .sort((a, b) => a.order - b.order)
        .map((question) => ({
          id: question.id,
          prompt: question.prompt,
          kind: question.kind,
          options: [...question.options].sort((a, b) => a.order - b.order),
          order: question.order,
        })),
    };
  },
});

/**
 * Every published brand passport of one event: brand, frozen eligible models
 * and their stands' map locations (map marker). Personal N/M comes from the
 * POST gateway (fairInteractions.getMyPassportProgress).
 */
export const getPassportCatalog = query({
  args: { eventSlug: v.string() },
  returns: v.union(v.object({ eventId: v.string(), catalog: v.array(fairPassportCatalogEntryView) }), v.null()),
  handler: async (ctx, args) => {
    const event = await eventBySlug(ctx, args.eventSlug);
    if (!event || event.status === "draft") return null;
    const state = await fairPassportState(ctx, event, null);
    return { eventId: state.eventId, catalog: state.catalog };
  },
});
