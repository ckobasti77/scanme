import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fairIsPreEvent, type FairLeadActivityGroup, type FairPackageTier } from "../../lib/fair-contract";
import { fairLeadActivityAvailable, fairLeadActivityShared } from "../../lib/fair-entitlements";
import { fairParticipationModels } from "../fairAnalytics";
import type { FairFollowUpLeadFacts } from "./fairFollowUp";
import { fairExhibitorName, fairModelFullName } from "./fairLeads";

// =============================================================================
// Sajam automobila 2026 — Admin UX A8: one visitor next to one exhibitor
// (ADMIN-UX §7, §12.4; MASTER §4, §8, §12, §13). Admin/internal only.
//
// - A "pair" is (the visitor's email in lower case, the exhibitor's
//   participation): the unit of the one post-fair follow-up.
// - The activity next to a lead is read by the visitor prefix of each raw
//   table (bounded `take`), then kept ONLY for the models of the lead's
//   exhibitor. The result never carries the visitor id, hash, request id or
//   anything about another exhibitor.
// - P1: pre-event leads and activity (before the event's startsAt,
//   fairIsPreEvent) are never part of a pair, a follow-up or the activity
//   that goes next to a lead.
// =============================================================================

type Ctx = QueryCtx | MutationCtx;

/** Leads of one exhibitor read to find a pair (A0 §5: take(500) by participation). */
export const FAIR_PAIR_LEADS_SCAN = 500;
/** Rows read per visitor and raw table for the activity next to a lead. */
export const FAIR_ACTIVITY_ROWS_CAP = 200;
const SURVEY_RESPONSES_CAP = 50;
const PASSPORT_MEMBERS_CAP = 41;
const BRANDS_CAP = 20;

/** The exhibitor's exhibited models (stands → models, the B6 helper), by id. */
export async function fairExhibitorModels(ctx: Ctx, participationId: Id<"fairParticipations">) {
  const participation = await ctx.db.get(participationId);
  if (!participation) return new Map<Id<"fairEventModels">, Doc<"fairEventModels">>();
  const { models } = await fairParticipationModels(ctx, participation);
  return new Map(models.map((model) => [model._id, model]));
}

/** The event's start for a participation (P1 boundary); 0 when the event is gone. */
export async function fairParticipationEventStartsAt(ctx: Ctx, participationId: Id<"fairParticipations">): Promise<number> {
  const participation = await ctx.db.get(participationId);
  const event = participation ? await ctx.db.get(participation.eventId) : null;
  return event?.startsAt ?? 0;
}

/** Every lead of the pair (email compared in lower case), oldest first. P1: from the event's start on. */
export async function fairPairLeads(ctx: Ctx, participationId: Id<"fairParticipations">, recipient: string): Promise<Doc<"fairLeads">[]> {
  const email = recipient.trim().toLowerCase();
  const startsAt = await fairParticipationEventStartsAt(ctx, participationId);
  const rows = await ctx.db
    .query("fairLeads")
    .withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", participationId).gte("createdAt", startsAt))
    .take(FAIR_PAIR_LEADS_SCAN);
  return rows.filter((row) => row.email?.trim().toLowerCase() === email);
}

/** Exhibitor models the visitor(s) rated, only where the model's package has ratings. P1: never a pre-event rating. */
async function ratedModelNames(ctx: Ctx, visitorIds: readonly Id<"fairVisitors">[], models: Map<Id<"fairEventModels">, Doc<"fairEventModels">>, startsAt: number) {
  const names: string[] = [];
  for (const visitorId of visitorIds) {
    const ratings = await ctx.db
      .query("fairRatings")
      .withIndex("by_visitorId_and_eventModelId", (q) => q.eq("visitorId", visitorId))
      .take(FAIR_ACTIVITY_ROWS_CAP);
    for (const rating of ratings) {
      if (!fairActivityCounts(rating.updatedAt, rating.preEvent, startsAt)) continue;
      const model = models.get(rating.eventModelId);
      if (model && fairLeadActivityShared(model.packageTier, "ratings")) names.push(fairModelFullName(model));
    }
  }
  return names;
}

/** The merge values of one pair (FAIR_FOLLOW_UP_FIELDS), from its leads, the exhibitor's models and the visitor's ratings. */
export async function fairPairFollowUpFacts(
  ctx: Ctx,
  input: { participationId: Id<"fairParticipations">; leads: readonly Doc<"fairLeads">[]; eventTitle: string | null },
): Promise<FairFollowUpLeadFacts> {
  const models = await fairExhibitorModels(ctx, input.participationId);
  const leads = [...input.leads].sort((a, b) => a.createdAt - b.createdAt);
  const newest = leads[leads.length - 1];
  const visitorIds = [...new Set(leads.map((lead) => lead.visitorId))].slice(0, 5);
  return {
    leads: leads.flatMap((lead) => {
      const model = models.get(lead.eventModelId);
      return model ? [{ kind: lead.kind, modelName: fairModelFullName(model) }] : [];
    }),
    contactName: newest?.contactName ?? null,
    exhibitorName: await fairExhibitorName(ctx, input.participationId),
    eventTitle: input.eventTitle,
    ratedModelNames: await ratedModelNames(ctx, visitorIds, models, await fairParticipationEventStartsAt(ctx, input.participationId)),
  };
}

// -----------------------------------------------------------------------------
// Activity next to a lead (getLeadDetail, PII export)
// -----------------------------------------------------------------------------

export type FairLeadActivity = {
  /** Package of the lead's model at the moment of the lead: decides what goes to the exhibitor. */
  tierAtLead: FairPackageTier;
  scans?: { shared: boolean; capped: boolean; items: { eventModelId: Id<"fairEventModels">; firstAt: number; lastAt: number; count: number }[] };
  ratings?: {
    shared: boolean;
    capped: boolean;
    items: { eventModelId: Id<"fairEventModels">; at: number; overall?: number; appearance?: number; specifications?: number; price?: number }[];
  };
  audienceVotes?: { shared: boolean; capped: boolean; items: { eventModelId: Id<"fairEventModels">; at: number; prompt: string; answer: string }[] };
  surveyAnswers?: {
    shared: boolean;
    capped: boolean;
    items: { eventModelId: Id<"fairEventModels">; at: number; answers: { prompt: string; kind: "yes_no" | "single_choice"; answer: string }[] }[];
  };
  passport?: {
    shared: boolean;
    capped: boolean;
    items: { brandId: Id<"brands">; required: number | null; stamps: { eventModelId: Id<"fairEventModels">; at: number }[]; favoriteModelId?: Id<"fairEventModels"> }[];
  };
  sponsoredActions?: { shared: boolean; capped: boolean; items: { eventModelId: Id<"fairEventModels">; kind: "open_model" | "garage_add"; at: number }[] };
};

/** P1: a row of the fair itself — written (last) at or after the event's start and not a pre-event row. */
function fairActivityCounts(at: number, preEvent: boolean | undefined, startsAt: number) {
  return preEvent !== true && !fairIsPreEvent(at, { startsAt });
}

/** A group exists when at least one exhibitor model's package has the feature (never a fake 0). */
function groupState(group: FairLeadActivityGroup, tierAtLead: FairPackageTier, models: Map<Id<"fairEventModels">, Doc<"fairEventModels">>) {
  const available = [...models.values()].some((model) => fairLeadActivityAvailable(model.packageTier, group));
  return available ? { shared: fairLeadActivityShared(tierAtLead, group) } : null;
}

/**
 * One visitor's activity on the models of ONE exhibitor. Each raw table is
 * read by the visitor prefix (bounded), then filtered to `models`; other
 * exhibitors' rows are dropped before anything is returned.
 */
export async function fairVisitorActivity(
  ctx: Ctx,
  input: {
    visitorId: Id<"fairVisitors">;
    eventId: Id<"fairEvents">;
    tierAtLead: FairPackageTier;
    models: Map<Id<"fairEventModels">, Doc<"fairEventModels">>;
    /** Rows read per raw table (default FAIR_ACTIVITY_ROWS_CAP); the PII export reads fewer per visitor. */
    cap?: number;
    /** Only these groups (default: all); the PII export reads only the groups that go to the exhibitor. */
    groups?: ReadonlySet<FairLeadActivityGroup>;
  },
): Promise<FairLeadActivity> {
  const { visitorId, eventId, tierAtLead, models } = input;
  const cap = Math.max(1, Math.min(FAIR_ACTIVITY_ROWS_CAP, input.cap ?? FAIR_ACTIVITY_ROWS_CAP));
  const own = (eventModelId: Id<"fairEventModels">) => models.has(eventModelId);
  // P1: pre-event activity never goes next to a lead.
  const startsAt = (await ctx.db.get(eventId))?.startsAt ?? 0;
  const fair = (at: number, preEvent?: boolean) => fairActivityCounts(at, preEvent, startsAt);
  const groupFor = (group: FairLeadActivityGroup) => (input.groups && !input.groups.has(group) ? null : groupState(group, tierAtLead, models));
  const activity: FairLeadActivity = { tierAtLead };

  const scans = groupFor("scans");
  if (scans) {
    const rows = await ctx.db.query("fairUniqueScans").withIndex("by_visitorId_and_eventModelId", (q) => q.eq("visitorId", visitorId)).take(cap);
    activity.scans = {
      ...scans,
      capped: rows.length >= cap,
      items: rows.filter((row) => own(row.eventModelId) && fair(row.lastScannedAt, row.preEvent)).map((row) => ({ eventModelId: row.eventModelId, firstAt: row.firstScannedAt, lastAt: row.lastScannedAt, count: row.totalScanCount })),
    };
  }

  const ratings = groupFor("ratings");
  if (ratings) {
    const rows = await ctx.db.query("fairRatings").withIndex("by_visitorId_and_eventModelId", (q) => q.eq("visitorId", visitorId)).take(cap);
    activity.ratings = {
      ...ratings,
      capped: rows.length >= cap,
      items: rows.filter((row) => own(row.eventModelId) && fair(row.updatedAt, row.preEvent)).map((row) => ({
        eventModelId: row.eventModelId,
        at: row.updatedAt,
        ...(row.overall !== undefined ? { overall: row.overall } : {}),
        ...(row.appearance !== undefined ? { appearance: row.appearance } : {}),
        ...(row.specifications !== undefined ? { specifications: row.specifications } : {}),
        ...(row.price !== undefined ? { price: row.price } : {}),
      })),
    };
  }

  const votes = groupFor("audienceVotes");
  if (votes) {
    const rows = await ctx.db.query("fairAudienceVotes").withIndex("by_visitorId_and_questionId", (q) => q.eq("visitorId", visitorId)).take(cap);
    const items: NonNullable<FairLeadActivity["audienceVotes"]>["items"] = [];
    for (const row of rows) {
      if (!own(row.eventModelId) || !fair(row.updatedAt, row.preEvent)) continue;
      const question = await ctx.db.get(row.questionId);
      if (!question || question.eventModelId !== row.eventModelId) continue;
      const option = question.options.find((entry) => entry.id === row.optionId);
      items.push({ eventModelId: row.eventModelId, at: row.updatedAt, prompt: question.prompt, answer: option?.label ?? "—" });
    }
    activity.audienceVotes = { ...votes, capped: rows.length >= cap, items };
  }

  const surveys = groupFor("surveyAnswers");
  if (surveys) {
    const rows = await ctx.db.query("fairSurveyResponses").withIndex("by_visitorId_and_surveyId", (q) => q.eq("visitorId", visitorId)).take(Math.min(cap, SURVEY_RESPONSES_CAP));
    const items: NonNullable<FairLeadActivity["surveyAnswers"]>["items"] = [];
    for (const row of rows) {
      if (!own(row.eventModelId) || !fair(row.submittedAt)) continue;
      const survey = await ctx.db.get(row.surveyId);
      if (!survey || survey.eventModelId !== row.eventModelId) continue;
      const answers = row.answers.flatMap((answer) => {
        const question = survey.questions.find((entry) => entry.id === answer.questionId);
        if (!question) return [];
        const label = question.kind === "single_choice" ? question.options.find((option) => option.id === answer.value)?.label ?? "—" : answer.value;
        return [{ prompt: question.prompt, kind: question.kind, answer: label }];
      });
      items.push({ eventModelId: row.eventModelId, at: row.submittedAt, answers });
    }
    activity.surveyAnswers = { ...surveys, capped: rows.length >= Math.min(cap, SURVEY_RESPONSES_CAP), items };
  }

  const passport = groupFor("passport");
  if (passport) {
    const brandIds = [...new Set([...models.values()].map((model) => model.brandId))].slice(0, BRANDS_CAP);
    const items: NonNullable<FairLeadActivity["passport"]>["items"] = [];
    let capped = false;
    for (const brandId of brandIds) {
      const stamps = await ctx.db
        .query("fairPassportStamps")
        .withIndex("by_visitorId_and_eventId_and_brandId", (q) => q.eq("visitorId", visitorId).eq("eventId", eventId).eq("brandId", brandId))
        .take(PASSPORT_MEMBERS_CAP);
      const favorite = await ctx.db
        .query("fairBrandFavoriteVotes")
        .withIndex("by_visitorId_and_eventId_and_brandId", (q) => q.eq("visitorId", visitorId).eq("eventId", eventId).eq("brandId", brandId))
        .first();
      const ownStamps = stamps.filter((row) => own(row.eventModelId) && fair(row.scannedAt));
      const ownFavorite = favorite && own(favorite.eventModelId) && fair(favorite.updatedAt, favorite.preEvent) ? favorite.eventModelId : undefined;
      if (!ownStamps.length && !ownFavorite) continue;
      capped ||= stamps.length >= PASSPORT_MEMBERS_CAP;
      const config = await ctx.db.query("fairPassportConfigs").withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", eventId).eq("brandId", brandId)).unique();
      const members = config
        ? await ctx.db.query("fairPassportEligibleModels").withIndex("by_passportConfigId_and_status", (q) => q.eq("passportConfigId", config._id).eq("status", "required")).take(PASSPORT_MEMBERS_CAP)
        : null;
      items.push({
        brandId,
        required: members ? members.length : null,
        stamps: ownStamps.map((row) => ({ eventModelId: row.eventModelId, at: row.scannedAt })),
        ...(ownFavorite ? { favoriteModelId: ownFavorite } : {}),
      });
    }
    activity.passport = { ...passport, capped, items };
  }

  const sponsored = groupFor("sponsoredActions");
  if (sponsored) {
    const rows = await ctx.db.query("fairSponsoredEvents").withIndex("by_visitorId_and_occurredAt", (q) => q.eq("visitorId", visitorId)).take(cap);
    activity.sponsoredActions = {
      ...sponsored,
      capped: rows.length >= cap,
      items: rows.filter((row) => row.eventId === eventId && own(row.eventModelId) && fair(row.occurredAt, row.preEvent)).map((row) => ({ eventModelId: row.eventModelId, kind: row.kind, at: row.occurredAt })),
    };
  }
  return activity;
}
