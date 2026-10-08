import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fairReportMetrics } from "../lib/fair-entitlements";
import type { FairReportMetric } from "../lib/fair-contract";
import { requireAdmin } from "./lib/access";
import { fairAdminError } from "./lib/fairCatalog";
import { fairScanCountKey, readFairCount } from "./lib/fairCountShards";
import { fairAudienceOptionCounts, fairModelSurveys, fairModelTierAt, fairRatingSummary } from "./lib/fairInteractions";
import { fairExhibitorName } from "./lib/fairLeads";
import {
  FAIR_REPORT_MODELS_CAP,
  FAIR_REPORT_ROWS_CAP,
  FAIR_REPORT_STANDS_CAP,
  fairReportModelRaw,
  fairReportStand,
  fairWindowHourKeys,
  type FairReportModelRaw,
} from "./lib/fairReportDataset";

// =============================================================================
// Sajam automobila 2026 — B6 analytics reads (BACKEND-HANDOFF §7
// fairAnalytics, §10; MASTER §12). INTERNAL ONLY: the scheduled report build
// (convex/fairReports.ts) calls them one model at a time, so every read stays
// in its own bounded transaction. Nothing here returns a visitor id, hash or
// contact; the organizer/lead-export scopes additionally require an admin.
//
// Sources (all anonymous except where noted, all indexed and capped):
//   scans      fairMetricCountShards scan_* day/hour buckets (B2)
//   ratings    rating_count/sum_* (B3; cumulative)
//   Glas pub.  audience_votes:* per option (B3; per question of that day)
//   sponsored  sponsored_<kind>:model:<id>:<dateKey> (B5; garage only)
//   leads      fairLeads by model+createdAt — COUNTED only, never returned
//   survey     fairSurveyResponses by survey+submittedAt — aggregated only
// Isolation: a model is read only when it belongs to the requested
// participation, and the day only when it belongs to the model's event.
// =============================================================================

const DAYS_CAP = 60;
const QUESTIONS_PER_DAY_CAP = 10;
const PARTICIPATIONS_CAP = 500;

const dayView = v.object({
  _id: v.id("fairEventDays"),
  dateKey: v.string(),
  label: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  sortOrder: v.number(),
});

async function eventDays(ctx: QueryCtx, eventId: Id<"fairEvents">) {
  const days = await ctx.db
    .query("fairEventDays")
    .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", eventId))
    .take(DAYS_CAP);
  return days.sort((a, b) => a.sortOrder - b.sortOrder || a.dateKey.localeCompare(b.dateKey));
}

function dayOut(day: Doc<"fairEventDays">) {
  return { _id: day._id, dateKey: day.dateKey, label: day.label, startsAt: day.startsAt, endsAt: day.endsAt, sortOrder: day.sortOrder };
}

/** The participation's exhibited (non-draft) models, stand by stand, capped. */
export async function fairParticipationModels(ctx: QueryCtx | MutationCtx, participation: Doc<"fairParticipations">) {
  const stands = await ctx.db
    .query("fairStands")
    .withIndex("by_eventId_and_participationId", (q) => q.eq("eventId", participation.eventId).eq("participationId", participation._id))
    .take(FAIR_REPORT_STANDS_CAP);
  const models: Doc<"fairEventModels">[] = [];
  let truncated = false;
  for (const stand of stands) {
    const rows = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_standId", (q) => q.eq("eventId", participation.eventId).eq("standId", stand._id))
      .take(FAIR_REPORT_MODELS_CAP + 1);
    for (const model of rows) {
      // Defence in depth: a stand row never mixes exhibitors.
      if (model.participationId !== participation._id || model.status === "draft") continue;
      if (models.length >= FAIR_REPORT_MODELS_CAP) {
        truncated = true;
        break;
      }
      models.push(model);
    }
  }
  return { stands, models, truncated };
}

/**
 * Everything the build needs besides the per-model numbers: event, day, the
 * previous fair day (by sortOrder) and the participation's stands with their
 * all-time total/unique. Null when the day and participation are not of the
 * same event.
 */
export const reportContext = internalQuery({
  args: { participationId: v.id("fairParticipations"), eventDayId: v.id("fairEventDays") },
  returns: v.union(
    v.null(),
    v.object({
      event: v.object({ _id: v.id("fairEvents"), title: v.string(), slug: v.string() }),
      day: dayView,
      previousDay: v.union(v.null(), dayView),
      participationId: v.id("fairParticipations"),
      exhibitorName: v.string(),
      reportRecipientEmail: v.union(v.null(), v.string()),
      stands: v.array(fairReportStand),
      modelIds: v.array(v.id("fairEventModels")),
      modelsTruncated: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const [participation, day] = await Promise.all([ctx.db.get(args.participationId), ctx.db.get(args.eventDayId)]);
    if (!participation || !day || participation.eventId !== day.eventId) return null;
    const event = await ctx.db.get(day.eventId);
    if (!event) return null;
    const days = await eventDays(ctx, event._id);
    const previous = days.filter((row) => row.sortOrder < day.sortOrder).at(-1) ?? null;
    const { stands, models, truncated } = await fairParticipationModels(ctx, participation);
    const standRows = [];
    for (const stand of stands) {
      standRows.push({
        standId: stand._id,
        code: stand.code,
        displayName: stand.displayName,
        total: await readFairCount(ctx, fairScanCountKey("scan_total", "stand", stand._id)),
        unique: await readFairCount(ctx, fairScanCountKey("scan_unique", "stand", stand._id)),
      });
    }
    return {
      event: { _id: event._id, title: event.title, slug: event.slug },
      day: dayOut(day),
      previousDay: previous ? dayOut(previous) : null,
      participationId: participation._id,
      exhibitorName: (await fairExhibitorName(ctx, participation._id)) ?? "—",
      reportRecipientEmail: participation.reportRecipientEmail ?? null,
      stands: standRows,
      modelIds: models.map((model) => model._id),
      modelsTruncated: truncated,
    };
  },
});

async function leadCounts(ctx: QueryCtx, eventModelId: Id<"fairEventModels">, start: number, end: number) {
  // An empty window (a fair day that ends before the event's start, P1) reads nothing.
  const rows = start >= end ? [] : await ctx.db
    .query("fairLeads")
    .withIndex("by_eventModelId_and_createdAt", (q) => q.eq("eventModelId", eventModelId).gte("createdAt", start).lt("createdAt", end))
    .take(FAIR_REPORT_ROWS_CAP + 1);
  const capped = rows.length > FAIR_REPORT_ROWS_CAP;
  const counted = rows.slice(0, FAIR_REPORT_ROWS_CAP);
  return {
    interest: { count: counted.filter((row) => row.kind === "interest").length, capped },
    testDrive: { count: counted.filter((row) => row.kind === "test_drive").length, capped },
  };
}

async function dayScans(ctx: QueryCtx, eventModelId: Id<"fairEventModels">, dateKey: string) {
  return {
    total: await readFairCount(ctx, fairScanCountKey("scan_total", "model", eventModelId, dateKey)),
    unique: await readFairCount(ctx, fairScanCountKey("scan_unique", "model", eventModelId, dateKey)),
  };
}

async function daySponsored(ctx: QueryCtx, eventModelId: Id<"fairEventModels">, dateKey: string) {
  return {
    openModel: await readFairCount(ctx, `sponsored_open_model:model:${eventModelId}:${dateKey}`),
    garageAdd: await readFairCount(ctx, `sponsored_garage_add:model:${eventModelId}:${dateKey}`),
  };
}

async function surveyAggregates(ctx: QueryCtx, eventModelId: Id<"fairEventModels">, start: number, end: number) {
  const out: NonNullable<FairReportModelRaw["surveys"]> = [];
  const versions = (await fairModelSurveys(ctx, eventModelId)).filter((survey) => survey.status !== "draft").sort((a, b) => a.version - b.version);
  for (const survey of versions) {
    const responses = start >= end ? [] : await ctx.db
      .query("fairSurveyResponses")
      .withIndex("by_surveyId_and_submittedAt", (q) => q.eq("surveyId", survey._id).gte("submittedAt", start).lt("submittedAt", end))
      .take(FAIR_REPORT_ROWS_CAP + 1);
    if (!responses.length && survey.status !== "published") continue;
    const counted = responses.slice(0, FAIR_REPORT_ROWS_CAP);
    const tally = new Map<string, number>();
    for (const response of counted) {
      for (const answer of response.answers) {
        const key = `${answer.questionId}\u0000${answer.value}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }
    out.push({
      surveyId: survey._id,
      version: survey.version,
      ...(survey.title !== undefined ? { title: survey.title } : {}),
      responses: counted.length,
      capped: responses.length > FAIR_REPORT_ROWS_CAP,
      questions: [...survey.questions]
        .sort((a, b) => a.order - b.order)
        .map((question) => {
          const values =
            question.kind === "yes_no"
              ? [{ value: "yes" }, { value: "no" }]
              : [...question.options].sort((a, b) => a.order - b.order).map((option) => ({ value: option.id, label: option.label }));
          return {
            questionId: question.id,
            prompt: question.prompt,
            kind: question.kind,
            answers: values.map((entry) => ({ ...entry, count: tally.get(`${question.id}\u0000${entry.value}`) ?? 0 })),
          };
        }),
    });
  }
  return out;
}

/**
 * One model's numbers for one fair day, read only for the groups its package
 * has at the end of that day (`fairReportMetrics`). `previous` carries the
 * like-for-like values of the previous fair day for the comparison. Null when
 * the model is not the participation's or the day is not the model's event.
 */
export const modelDayRaw = internalQuery({
  args: {
    eventModelId: v.id("fairEventModels"),
    participationId: v.id("fairParticipations"),
    eventDayId: v.id("fairEventDays"),
    previousEventDayId: v.optional(v.id("fairEventDays")),
  },
  returns: v.union(v.null(), fairReportModelRaw),
  handler: async (ctx, args) => {
    const model = await ctx.db.get(args.eventModelId);
    if (!model || model.participationId !== args.participationId) return null;
    const day = await ctx.db.get(args.eventDayId);
    if (!day || day.eventId !== model.eventId) return null;
    const tier = await fairModelTierAt(ctx, model, day.endsAt - 1);
    const metrics = fairReportMetrics(tier);
    // P1: raw rows (leads, survey answers) count only from the event's start;
    // pre-event writes never reach a counter key in the first place.
    const fairFrom = (await ctx.db.get(model.eventId))?.startsAt ?? 0;
    const wants = (metric: FairReportMetric, list: readonly FairReportMetric[] = metrics) => list.includes(metric);

    const raw: FairReportModelRaw = {
      eventModelId: model._id,
      displayName: model.displayName,
      ...(model.variant !== undefined ? { variant: model.variant } : {}),
      standId: model.standId,
      sortOrder: model.sortOrder,
      tier,
    };
    if (wants("model_scans")) raw.scans = await dayScans(ctx, model._id, day.dateKey);
    if (wants("hourly_scans")) {
      raw.hourly = [];
      for (const hourKey of fairWindowHourKeys(day.startsAt, day.endsAt)) {
        raw.hourly.push({
          hourKey,
          total: await readFairCount(ctx, fairScanCountKey("scan_total", "model", model._id, hourKey)),
          unique: await readFairCount(ctx, fairScanCountKey("scan_unique", "model", model._id, hourKey)),
        });
      }
    }
    if (wants("interest") || wants("test_drive")) {
      const leads = await leadCounts(ctx, model._id, Math.max(day.startsAt, fairFrom), day.endsAt);
      if (wants("interest")) raw.interest = leads.interest;
      if (wants("test_drive")) raw.testDrive = leads.testDrive;
    }
    if (wants("rating_overall") || wants("rating_dimensions")) {
      raw.ratings = (await fairRatingSummary(ctx, model._id)).map((row) => ({ field: row.field, count: row.count, average: row.average }));
    }
    if (wants("audience")) {
      const questions = await ctx.db
        .query("fairAudienceQuestions")
        .withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", model._id).eq("eventDayId", day._id))
        .take(QUESTIONS_PER_DAY_CAP);
      raw.audience = [];
      for (const question of questions.filter((row) => row.status !== "draft").sort((a, b) => a.sortOrder - b.sortOrder)) {
        const { options, counts } = await fairAudienceOptionCounts(ctx, question);
        raw.audience.push({
          questionId: question._id,
          prompt: question.prompt,
          status: question.status,
          totalVotes: counts.reduce((sum, count) => sum + count, 0),
          options: options.map((option, index) => ({ optionId: option.id, label: option.label, count: counts[index] })),
        });
      }
    }
    if (wants("survey")) raw.surveys = await surveyAggregates(ctx, model._id, Math.max(day.startsAt, fairFrom), day.endsAt);
    if (wants("sponsored_garage")) raw.sponsored = await daySponsored(ctx, model._id, day.dateKey);

    if (args.previousEventDayId && wants("day_comparison")) {
      const previousDay = await ctx.db.get(args.previousEventDayId);
      if (previousDay && previousDay.eventId === model.eventId && previousDay._id !== day._id) {
        const previousTier = await fairModelTierAt(ctx, model, previousDay.endsAt - 1);
        const before = fairReportMetrics(previousTier);
        const previous: NonNullable<FairReportModelRaw["previous"]> = { tier: previousTier };
        if (wants("model_scans", before)) previous.scans = await dayScans(ctx, model._id, previousDay.dateKey);
        if (wants("interest", before) || wants("test_drive", before)) {
          const leads = await leadCounts(ctx, model._id, Math.max(previousDay.startsAt, fairFrom), previousDay.endsAt);
          if (wants("interest", before)) previous.interest = leads.interest;
          if (wants("test_drive", before)) previous.testDrive = leads.testDrive;
        }
        if (wants("sponsored_garage", before)) previous.sponsored = await daySponsored(ctx, model._id, previousDay.dateKey);
        raw.previous = previous;
      }
    }
    return raw;
  },
});

// -----------------------------------------------------------------------------
// Organizer aggregate (admin only): event-wide sums, no exhibitor split
// -----------------------------------------------------------------------------

export const organizerScope = internalQuery({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    eventTitle: v.string(),
    eventSlug: v.string(),
    days: v.array(dayView),
    standIds: v.array(v.id("fairStands")),
    participationIds: v.array(v.id("fairParticipations")),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) fairAdminError("FAIR_EVENT_NOT_FOUND");
    const participations = await ctx.db
      .query("fairParticipations")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id))
      .take(PARTICIPATIONS_CAP);
    const standIds: Id<"fairStands">[] = [];
    for (const participation of participations) {
      const stands = await ctx.db
        .query("fairStands")
        .withIndex("by_eventId_and_participationId", (q) => q.eq("eventId", event._id).eq("participationId", participation._id))
        .take(FAIR_REPORT_STANDS_CAP);
      standIds.push(...stands.map((stand) => stand._id));
    }
    return {
      eventTitle: event.title,
      eventSlug: event.slug,
      days: (await eventDays(ctx, event._id)).map(dayOut),
      standIds,
      participationIds: participations.map((row) => row._id),
    };
  },
});

/** One stand's scans for each requested Belgrade day (stand buckets = every model of the stand). */
export const organizerStandDays = internalQuery({
  args: { standId: v.id("fairStands"), dateKeys: v.array(v.string()) },
  returns: v.array(v.object({ dateKey: v.string(), total: v.number(), unique: v.number() })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const out = [];
    for (const dateKey of args.dateKeys.slice(0, DAYS_CAP)) {
      out.push({
        dateKey,
        total: await readFairCount(ctx, fairScanCountKey("scan_total", "stand", args.standId, dateKey)),
        unique: await readFairCount(ctx, fairScanCountKey("scan_unique", "stand", args.standId, dateKey)),
      });
    }
    return out;
  },
});

/** Lead COUNTS of one participation per day window (never a contact). */
export const organizerParticipationLeads = internalQuery({
  args: { participationId: v.id("fairParticipations"), windows: v.array(v.object({ start: v.number(), end: v.number() })) },
  returns: v.array(v.object({ interest: v.number(), testDrive: v.number() })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    // P1: never a pre-event lead, whatever window the caller passes.
    const participation = await ctx.db.get(args.participationId);
    const event = participation ? await ctx.db.get(participation.eventId) : null;
    const fairFrom = event?.startsAt ?? 0;
    const out = [];
    for (const window of args.windows.slice(0, DAYS_CAP)) {
      const start = Math.max(window.start, fairFrom);
      const rows = start >= window.end ? [] : await ctx.db
        .query("fairLeads")
        .withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", args.participationId).gte("createdAt", start).lt("createdAt", window.end))
        .take(FAIR_REPORT_ROWS_CAP);
      out.push({ interest: rows.filter((row) => row.kind === "interest").length, testDrive: rows.filter((row) => row.kind === "test_drive").length });
    }
    return out;
  },
});
