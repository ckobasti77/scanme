import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import {
  FAIR_GARAGE_ROTATION_INTERVAL_MS,
  FAIR_MAP_ROTATION_INTERVAL_MS,
  FAIR_MAX_MODEL_IDS_PER_READ,
  type FairLeadFormView,
  type FairPublicEvent,
  type FairPublicEventMap,
  type FairPublicMapExhibitor,
  type FairPublicMapStand,
  type FairPublicModel,
  type FairSpecificationGroup,
  type FairSponsoredModelCard,
  type FairSponsoredRotationView,
} from "../lib/fair-contract";
import { deriveFairCapabilities, getFairEntitlements } from "../lib/fair-entitlements";
import { fairAudienceResult, fairModelQuestions, fairPassportState, fairQuestionOpen, fairVoteThreshold } from "./lib/fairInteractions";
import { fairActiveConsent, fairExhibitorName, fairLeadConfig, fairLeadsEnabled, fairRenderConsentText } from "./lib/fairLeads";
import { FAIR_SPONSORED_ITEMS_CAP, fairActiveSponsoredSnapshot, fairSponsoredItems, fairSponsoredVisual } from "./lib/fairSponsored";
import {
  fairAudienceQuestionView,
  fairAudienceResultView,
  fairLeadFormView,
  fairLeadKind,
  fairPassportCatalogEntryView,
  fairPublicEventMapView,
  fairPublicEventView,
  fairPublicModelView,
  fairSponsoredRotationView,
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
// the passport catalog. B4 adds the lead form (contact rule and the consent
// text; never a lead or contact value). B5 adds the two sponsored rotation
// projections (published Advanced snapshot; never an impression).
//
// Visibility: a model is public while it is `published` — the same gate the
// /r resolver uses. A `draft` event is not public (getEventBySlug → null).
// =============================================================================

// Bounded child reads (technical caps, not business rules).
const EVENT_DAYS_CAP = 31;
const QUESTIONS_PER_MODEL_CAP = 50;
// B7: the same cap publish enforces (a snapshot never holds more items).
const SNAPSHOT_ITEMS_CAP = FAIR_SPONSORED_ITEMS_CAP;
const MAP_MODELS_CAP = 500;
const MAP_PARTICIPATIONS_CAP = 300;
const MAP_STANDS_CAP = 500;
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

/**
 * The model page read. A page view is NOT a scan: this query cannot write.
 * P2 (RN info): a model of a draft event is not public, as getEventBySlug.
 */
export const getModelBySlug = query({
  args: { eventSlug: v.string(), modelSlug: v.string() },
  returns: v.union(fairPublicModelView, v.null()),
  handler: async (ctx, args): Promise<PublicModel | null> => {
    const event = await eventBySlug(ctx, args.eventSlug);
    if (!event || event.status === "draft" || !args.modelSlug || args.modelSlug.length > SLUG_MAX) return null;
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
 * M1/N3 — the event map. N3 (odluka vlasnika 8. 10.): EVERY exhibitor is on
 * the map, also without a published car. P2 (RN N4): only what is public —
 * an `active` participation and an `active` stand; a draft or withdrawn one
 * is never shown:
 *  - `stands`: every active stand of an active participation,
 *    with its `mapLocationId` (lib/fair-map geometry; exhibitors may share
 *    one), the exhibitor's name, logo, website and category, and the
 *    stand's published models by brand (possibly none);
 *  - `exhibitorsWithoutLocation`: active participations without such a
 *    stand, with the zone the organizer names (if any).
 * Bounded reads of the event's participations, stands and models plus one
 * read per distinct business, account and brand. No contact, package or
 * counter. A query: showing the map can never write (no impression, no
 * analytics).
 */
export const getEventMap = query({
  args: { eventSlug: v.string() },
  returns: v.union(fairPublicEventMapView, v.null()),
  handler: async (ctx, args): Promise<FairPublicEventMap | null> => {
    const event = await eventBySlug(ctx, args.eventSlug);
    if (!event || event.status === "draft") return null;
    const [participationRows, standRows, modelRows] = await Promise.all([
      ctx.db.query("fairParticipations").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).take(MAP_PARTICIPATIONS_CAP),
      ctx.db.query("fairStands").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).take(MAP_STANDS_CAP),
      ctx.db.query("fairEventModels").withIndex("by_eventId_and_standId", (q) => q.eq("eventId", event._id)).take(MAP_MODELS_CAP),
    ]);
    const business = memo((id: Id<"businesses">) => ctx.db.get(id));
    const account = memo((id: Id<"accounts">) => ctx.db.get(id));
    const brand = memo((id: Id<"brands">) => ctx.db.get(id));

    // The public face of each active participation (no contact, no package).
    const exhibitors = new Map<Id<"fairParticipations">, { face: FairPublicMapExhibitor; zoneId?: Doc<"fairParticipations">["mapZoneId"] }>();
    for (const row of participationRows) {
      if (row.status !== "active") continue;
      const [businessRow, accountRow] = await Promise.all([business(row.businessId), account(row.accountId)]);
      if (!businessRow) continue;
      const logoUrl = businessRow.logoStorageId ? ((await ctx.storage.getUrl(businessRow.logoStorageId)) ?? businessRow.logoUrl) : businessRow.logoUrl;
      exhibitors.set(row._id, {
        face: {
          participationId: row._id,
          exhibitorName: businessRow.name,
          ...(logoUrl ? { logoUrl } : {}),
          ...(accountRow?.websiteUrl ? { websiteUrl: accountRow.websiteUrl } : {}),
          ...(row.category ? { category: row.category } : {}),
        },
        zoneId: row.mapZoneId,
      });
    }

    const stands = new Map<Id<"fairStands">, FairPublicMapStand>();
    for (const row of standRows) {
      const exhibitor = row.status === "active" ? exhibitors.get(row.participationId) : undefined;
      if (!exhibitor) continue;
      stands.set(row._id, { ...exhibitor.face, standId: row._id, mapLocationId: row.mapLocationId, code: row.code, displayName: row.displayName, brands: [] });
    }

    const published = modelRows
      .filter((model) => model.status === "published")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName, "sr"));
    for (const model of published) {
      const entry = stands.get(model.standId);
      const brandRow = entry ? await brand(model.brandId) : null;
      if (!entry || !brandRow) continue;
      let brandEntry = entry.brands.find((row) => row.brandId === brandRow._id);
      if (!brandEntry) {
        brandEntry = { brandId: brandRow._id, brandName: brandRow.name, models: [] };
        entry.brands.push(brandEntry);
      }
      brandEntry.models.push({ id: model._id, slug: model.slug, displayName: model.displayName, ...(model.variant ? { variant: model.variant } : {}) });
    }

    const placed = new Set([...stands.values()].map((stand) => stand.participationId));
    return {
      eventId: event._id,
      stands: [...stands.values()].sort((a, b) => a.code.localeCompare(b.code, "sr", { numeric: true }) || a.exhibitorName.localeCompare(b.exhibitorName, "sr")),
      exhibitorsWithoutLocation: [...exhibitors.values()]
        .filter((row) => !placed.has(row.face.participationId))
        .map((row) => ({ ...row.face, ...(row.zoneId ? { zoneId: row.zoneId } : {}) }))
        .sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr")),
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
 * today. `openAt` (the caller's clock; queries never read it) also keeps a
 * question of another day that is open at that moment, e.g. one the admin
 * opened early with "Otvori odmah" (JOVAN-DELTA 2026-10-08b). Votes are
 * refused outside a question's own window anyway.
 */
export const listAudienceQuestionsForModel = query({
  args: { eventModelId: v.string(), dateKey: v.optional(v.string()), openAt: v.optional(v.number()) },
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
      if (args.dateKey !== undefined && day.dateKey !== args.dateKey && !(args.openAt !== undefined && fairQuestionOpen(question, args.openAt))) continue;
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

// -----------------------------------------------------------------------------
// B4 — lead form (`Zainteresovan sam` / `Probna vožnja`)
// -----------------------------------------------------------------------------

/**
 * What the lead bottom sheet needs: whether the form is offered, the contact
 * rule and the server-rendered consent text (exhibitor named) with its
 * version. Without an ACTIVE consent the state is `consent_not_configured` —
 * the form must not collect contacts (production gate, MASTER §8, §13). Like
 * `capabilities`, it reads the stored package (a query never reads the
 * clock); submitLead judges the package in force at the moment of the submit.
 * K3: while FAIR_LEADS_ENABLED is not "true" every model and kind is
 * `leads_disabled` (closed, nothing read). No PII: no lead, contact or
 * visitor data is read here.
 */
export const getLeadForm = query({
  args: { eventModelId: v.string(), kind: fairLeadKind },
  returns: fairLeadFormView,
  handler: async (ctx, args): Promise<FairLeadFormView> => {
    const base = { eventModelId: args.eventModelId, kind: args.kind };
    if (!fairLeadsEnabled()) return { ...base, state: "leads_disabled" };
    const model = await publishedModel(ctx, args.eventModelId);
    if (!model) return { ...base, state: "unavailable" };
    const rights = getFairEntitlements(model.packageTier);
    const config = await fairLeadConfig(ctx, model._id, args.kind);
    if (!(args.kind === "interest" ? rights.interest : rights.testDrive) || !config?.enabled) return { ...base, state: "unavailable" };
    const consent = await fairActiveConsent(ctx, model.eventId, args.kind);
    const exhibitorName = await fairExhibitorName(ctx, model.participationId);
    if (!consent || !exhibitorName) return { ...base, state: "consent_not_configured" };
    return {
      ...base,
      state: "open",
      contactRequirement: config.contactRequirement,
      ...(config.preferredContact ? { preferredContact: config.preferredContact } : {}),
      consent: { version: consent.version, text: fairRenderConsentText(consent.text, exhibitorName) },
    };
  },
});

// -----------------------------------------------------------------------------
// B5 — sponsored rotation (map/display 12 s, garage 8 s)
// -----------------------------------------------------------------------------

/**
 * One read of the event's published Advanced snapshot (manual or, A9, automatic; MASTER §10,
 * HANDOFF §5.7, JOVAN-DELTA §2). Items keep snapshot order; the client picks
 * the active one with
 * `getFairRotationSlot({ epochMs, nowMs, intervalMs, itemCount: items.length })`
 * (lib/fair-client/rotation-slot.ts), so every map and display shows the same
 * model at the same moment. `epochMs` = the snapshot's `publishedAt`.
 * A model withdrawn after the publish is skipped (never shown publicly).
 * Photo fallback: brand logo, then the neutral event placeholder — never
 * another vehicle's photo. A query: showing the rotation never writes (no
 * impression, no analytics, no visitor).
 */
async function sponsoredRotation(ctx: QueryCtx, eventSlug: string, surface: "map" | "garage"): Promise<FairSponsoredRotationView | null> {
  const event = await eventBySlug(ctx, eventSlug);
  if (!event || event.status === "draft") return null;
  const snapshot = await fairActiveSponsoredSnapshot(ctx, event._id);
  if (!snapshot || snapshot.publishedAt === undefined) return null;
  const brand = memo((id: Id<"brands">) => ctx.db.get(id));
  const stand = memo((id: Id<"fairStands">) => ctx.db.get(id));
  const threshold = fairVoteThreshold(event);

  const items: FairSponsoredModelCard[] = [];
  for (const item of await fairSponsoredItems(ctx, snapshot._id)) {
    const model = await ctx.db.get(item.eventModelId);
    if (!model || model.status !== "published") continue;
    const [brandRow, standRow] = await Promise.all([brand(model.brandId), stand(model.standId)]);
    if (!brandRow || !standRow) continue;
    const { visual, photoUrl, brandLogoUrl } = await fairSponsoredVisual(ctx, model, brandRow);
    let audienceResult: FairSponsoredModelCard["audienceResult"];
    if (surface === "map" && item.audienceQuestionId) {
      const question = await ctx.db.get(item.audienceQuestionId);
      if (question && question.status !== "draft" && question.eventModelId === model._id) {
        audienceResult = {
          questionId: question._id,
          prompt: question.prompt,
          options: [...question.options].sort((a, b) => a.order - b.order).map((option) => ({ id: option.id, label: option.label, order: option.order })),
          result: await fairAudienceResult(ctx, question, threshold),
        };
      }
    }
    items.push({
      eventModelId: model._id,
      eventId: event._id,
      eventSlug: event.slug,
      slug: model.slug,
      brandId: brandRow._id,
      brandName: brandRow.name,
      displayName: model.displayName,
      ...(model.variant ? { variant: model.variant } : {}),
      priceText: model.priceText,
      visual,
      ...(photoUrl ? { photoUrl } : {}),
      ...(brandLogoUrl ? { brandLogoUrl } : {}),
      standMapLocationId: standRow.mapLocationId,
      order: item.order,
      ...(audienceResult ? { audienceResult } : {}),
    });
  }
  return {
    surface,
    eventId: event._id,
    snapshotId: snapshot._id,
    version: snapshot.version,
    dayKey: snapshot.dayKey,
    seed: snapshot.seed,
    epochMs: snapshot.publishedAt,
    intervalMs: surface === "map" ? FAIR_MAP_ROTATION_INTERVAL_MS : FAIR_GARAGE_ROTATION_INTERVAL_MS,
    items,
  };
}

/** Map and fair displays: 12 s slot, model + the admin-chosen question result (`waiting_for_minimum` below 5 votes) + stand. No voting here. */
export const getSponsoredMapRotation = query({
  args: { eventSlug: v.string() },
  returns: v.union(fairSponsoredRotationView, v.null()),
  handler: async (ctx, args) => sponsoredRotation(ctx, args.eventSlug, "map"),
});

/** Garage sponsored strip: 8 s slot, photo/fallback + name; `Pogledaj` / `Dodaj u garažu` go through POST /api/fair/sponsored-action. */
export const getSponsoredGarageRotation = query({
  args: { eventSlug: v.string() },
  returns: v.union(fairSponsoredRotationView, v.null()),
  handler: async (ctx, args) => sponsoredRotation(ctx, args.eventSlug, "garage"),
});
