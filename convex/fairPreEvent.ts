import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, fairEventByCode } from "./lib/fairCatalog";
import { bumpFairCount, fairScanCountKeys } from "./lib/fairCountShards";
import { FAIR_RATING_FIELDS, fairAudienceVoteKey, fairFavoriteKey, fairRatingCountKey, fairRatingSumKey } from "./lib/fairInteractions";
import { scheduleFairBrandPassportSync } from "./lib/fairPassportSync";
import { fairAnalyticsCutoff } from "./lib/fairPreEvent";
import { fairTimeKeys } from "./lib/fairScans";
import { fairSponsoredCountKeys, syncFairSponsoredSnapshot } from "./lib/fairSponsored";

// =============================================================================
// Pre-event access (JOVAN-DELTA 2026-10-08b).
//
// 1. alignFuturePackageActivations: a catalog imported before the change has
//    packages that start on 9 Oct; this moves every future activation to now,
//    so the packages are in force at once (the import now clamps by itself).
// 2. "Resetuj pre-event podatke": everything visitors created before the
//    event's analytics cutoff (its opening, lib/fairPreEvent.ts) is deleted
//    and its share is taken back out of the counters (fairMetricCountShards),
//    exactly as the writers added it. Dry run = previewPreEventReset; the
//    reset needs the typed word RESETUJ and the counts the admin saw.
//    Never touched: catalog, QR links, passports, questions, surveys, lead
//    settings, report runs, visitors (fairVisitors are shared by events) and
//    anything after the cutoff.
// =============================================================================

export const FAIR_PRE_EVENT_CATEGORIES = [
  "leads",
  "survey_responses",
  "ratings",
  "audience_votes",
  "brand_favorites",
  "passport_stamps",
  "sponsored_events",
  "traffic_events",
  "share_collections",
  "unique_scans",
  "scan_events",
] as const;
export type FairPreEventCategory = (typeof FAIR_PRE_EVENT_CATEGORIES)[number];

/** Rows deleted per transaction (as fairRetention). */
export const FAIR_PRE_EVENT_BATCH_SIZE = 200;
/** The dry run counts at most this many rows per category ("1000+" in the admin). */
export const FAIR_PRE_EVENT_PREVIEW_CAP = 1000;
export const FAIR_PRE_EVENT_CONFIRM_WORD = "RESETUJ";

const countsValidator = v.object(Object.fromEntries(FAIR_PRE_EVENT_CATEGORIES.map((category) => [category, v.number()])) as Record<FairPreEventCategory, ReturnType<typeof v.number>>);
type Counts = Record<FairPreEventCategory, number>;

/** The pre-event rows of one category, oldest first, at most `limit`. */
async function preEventRows(ctx: QueryCtx, event: Doc<"fairEvents">, category: FairPreEventCategory, limit: number) {
  const cutoff = fairAnalyticsCutoff(event);
  const eventId = event._id;
  // Tables without an event+time index are read by creation time, this event only.
  switch (category) {
    case "leads":
      return ctx.db.query("fairLeads").withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", eventId).lt("createdAt", cutoff)).take(limit);
    case "survey_responses":
      return ctx.db.query("fairSurveyResponses").withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff)).filter((q) => q.eq(q.field("eventId"), eventId)).take(limit);
    case "ratings":
      return ctx.db.query("fairRatings").withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff)).filter((q) => q.eq(q.field("eventId"), eventId)).take(limit);
    case "audience_votes":
      return ctx.db.query("fairAudienceVotes").withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff)).filter((q) => q.eq(q.field("eventId"), eventId)).take(limit);
    case "brand_favorites":
      return ctx.db.query("fairBrandFavoriteVotes").withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff)).filter((q) => q.eq(q.field("eventId"), eventId)).take(limit);
    case "passport_stamps":
      return ctx.db.query("fairPassportStamps").withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff)).filter((q) => q.eq(q.field("eventId"), eventId)).take(limit);
    case "sponsored_events":
      return ctx.db.query("fairSponsoredEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", eventId).lt("occurredAt", cutoff)).take(limit);
    case "traffic_events":
      return ctx.db.query("fairTrafficEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", eventId).lt("occurredAt", cutoff)).take(limit);
    case "share_collections":
      return ctx.db.query("fairShareCollections").withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", eventId).lt("createdAt", cutoff)).take(limit);
    case "unique_scans":
      return ctx.db.query("fairUniqueScans").withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff)).filter((q) => q.eq(q.field("eventId"), eventId)).take(limit);
    case "scan_events":
      return ctx.db.query("fairScanEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", eventId).lt("occurredAt", cutoff)).take(limit);
  }
}

async function preEventCounts(ctx: QueryCtx, event: Doc<"fairEvents">): Promise<Counts> {
  const out = {} as Counts;
  for (const category of FAIR_PRE_EVENT_CATEGORIES) out[category] = (await preEventRows(ctx, event, category, FAIR_PRE_EVENT_PREVIEW_CAP)).length;
  return out;
}

/** Deletes one row and takes its share back out of the counters it bumped. */
async function removePreEventRow(ctx: MutationCtx, event: Doc<"fairEvents">, category: FairPreEventCategory, row: { _id: Id<TableNames> }) {
  switch (category) {
    case "leads": {
      const lead = row as Doc<"fairLeads">;
      // Queued confirmation/follow-up rows go with the lead; a scheduled send then finds nothing.
      for (const delivery of await ctx.db.query("fairEmailDeliveries").withIndex("by_leadId_and_kind", (q) => q.eq("leadId", lead._id)).take(10)) {
        await ctx.db.delete(delivery._id);
      }
      break;
    }
    case "ratings": {
      const rating = row as Doc<"fairRatings">;
      for (const field of FAIR_RATING_FIELDS) {
        const value = rating[field];
        if (value === undefined) continue;
        await bumpFairCount(ctx, fairRatingCountKey(field, rating.eventModelId), -1);
        await bumpFairCount(ctx, fairRatingSumKey(field, rating.eventModelId), -value);
      }
      break;
    }
    case "audience_votes": {
      const vote = row as Doc<"fairAudienceVotes">;
      await bumpFairCount(ctx, fairAudienceVoteKey(vote.questionId, vote.optionId), -1);
      break;
    }
    case "brand_favorites": {
      const favorite = row as Doc<"fairBrandFavoriteVotes">;
      const passport = await ctx.db
        .query("fairPassportConfigs")
        .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", event._id).eq("brandId", favorite.brandId))
        .first();
      if (passport) await bumpFairCount(ctx, fairFavoriteKey(passport._id, favorite.eventModelId), -1);
      break;
    }
    case "sponsored_events": {
      const action = row as Doc<"fairSponsoredEvents">;
      for (const key of fairSponsoredCountKeys(action.kind, action.eventModelId, action)) await bumpFairCount(ctx, key, -1);
      break;
    }
    case "unique_scans": {
      const unique = row as Doc<"fairUniqueScans">;
      const model = await ctx.db.get(unique.eventModelId);
      if (model) {
        const ids = { eventModelId: model._id, standId: model.standId };
        for (const key of fairScanCountKeys("scan_unique", ids, fairTimeKeys(unique.firstScannedAt))) await bumpFairCount(ctx, key, -1);
      }
      break;
    }
    case "scan_events": {
      const scan = row as Doc<"fairScanEvents">;
      // Admin scans never bumped a counter (lib/fairScans.ts).
      if (!scan.isAdminExcluded) {
        for (const key of fairScanCountKeys("scan_total", { eventModelId: scan.eventModelId, standId: scan.standId }, scan)) await bumpFairCount(ctx, key, -1);
      }
      break;
    }
    default:
      break;
  }
  await ctx.db.delete(row._id);
}

/** One bounded transaction of the reset; true when rows may remain. */
async function resetBatch(ctx: MutationCtx, event: Doc<"fairEvents">): Promise<{ deleted: number; more: boolean }> {
  let budget = FAIR_PRE_EVENT_BATCH_SIZE;
  let deleted = 0;
  for (const category of FAIR_PRE_EVENT_CATEGORIES) {
    if (budget <= 0) return { deleted, more: true };
    const rows = await preEventRows(ctx, event, category, budget);
    for (const row of rows) await removePreEventRow(ctx, event, category, row);
    deleted += rows.length;
    budget -= rows.length;
  }
  return { deleted, more: budget <= 0 };
}

/** Dry run of "Resetuj pre-event podatke": rows per category (capped) and the cutoff. */
export const previewPreEventReset = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({ cutoff: v.number(), counts: countsValidator, total: v.number(), capped: v.boolean() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) fairAdminError("FAIR_EVENT_NOT_FOUND");
    const counts = await preEventCounts(ctx, event);
    const values = Object.values(counts);
    return {
      cutoff: fairAnalyticsCutoff(event),
      counts,
      total: values.reduce((sum, value) => sum + value, 0),
      capped: values.some((value) => value >= FAIR_PRE_EVENT_PREVIEW_CAP),
    };
  },
});

/**
 * "Resetuj pre-event podatke": needs the typed word RESETUJ and the counts of
 * the dry run the admin confirmed (FAIR_PRE_EVENT_RESET_STALE when the data
 * changed since). Deletes in bounded batches; the rest continues by itself.
 */
export const resetPreEventData = mutation({
  args: { eventId: v.id("fairEvents"), confirm: v.string(), expected: countsValidator },
  returns: v.object({ deleted: v.number(), continuing: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.confirm.trim() !== FAIR_PRE_EVENT_CONFIRM_WORD) fairAdminError("FAIR_PRE_EVENT_RESET_CONFIRM");
    const event = await ctx.db.get(args.eventId);
    if (!event) fairAdminError("FAIR_EVENT_NOT_FOUND");
    const counts = await preEventCounts(ctx, event);
    if (FAIR_PRE_EVENT_CATEGORIES.some((category) => counts[category] !== args.expected[category])) fairAdminError("FAIR_PRE_EVENT_RESET_STALE");
    const now = Date.now();
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: "fair_pre_event_reset",
      detail: { eventId: event._id, cutoff: fairAnalyticsCutoff(event), counts },
      now,
    });
    const { deleted, more } = await resetBatch(ctx, event);
    if (more) await ctx.scheduler.runAfter(0, internal.fairPreEvent.resetPreEventContinue, { eventId: event._id });
    return { deleted, continuing: more };
  },
});

export const resetPreEventContinue = internalMutation({
  args: { eventId: v.id("fairEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const { more } = await resetBatch(ctx, event);
    if (more) await ctx.scheduler.runAfter(0, internal.fairPreEvent.resetPreEventContinue, { eventId: event._id });
    return null;
  },
});

/**
 * One-off for a catalog imported before the change (DEV; a no-op on a fresh
 * prod import): every package activation still in the future starts now. The
 * brands' automatic passports and the sponsored snapshot follow, as after an
 * upgrade. `npx convex run fairPreEvent:alignFuturePackageActivations '{"dryRun":true}'`.
 */
export const alignFuturePackageActivations = internalMutation({
  args: { dryRun: v.boolean(), eventCode: v.optional(v.string()) },
  returns: v.object({ models: v.array(v.string()), activationsMoved: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let modelRows: Doc<"fairEventModels">[];
    if (args.eventCode !== undefined) {
      const event = await fairEventByCode(ctx, args.eventCode);
      if (!event) throw new Error("fair_pre_event_event_missing");
      modelRows = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).take(1000);
    } else {
      modelRows = await ctx.db.query("fairEventModels").take(1000);
    }
    const models: string[] = [];
    let activationsMoved = 0;
    const touched = new Map<Id<"fairEvents">, Set<Id<"brands">>>();
    for (const model of modelRows) {
      if (model.packageActivatedAt <= now) continue;
      const future = await ctx.db
        .query("fairPackageActivations")
        .withIndex("by_eventModelId_and_activatedAt", (q) => q.eq("eventModelId", model._id).gt("activatedAt", now))
        .take(20);
      models.push(model.externalKey);
      activationsMoved += future.length;
      if (args.dryRun) continue;
      for (const row of future) await ctx.db.patch(row._id, { activatedAt: now });
      await ctx.db.patch(model._id, { packageActivatedAt: now, updatedAt: now });
      const brands = touched.get(model.eventId) ?? new Set<Id<"brands">>();
      brands.add(model.brandId);
      touched.set(model.eventId, brands);
    }
    for (const [eventId, brands] of touched) {
      for (const brandId of brands) await scheduleFairBrandPassportSync(ctx, eventId, brandId, now);
      await syncFairSponsoredSnapshot(ctx, eventId, now);
    }
    return { models, activationsMoved };
  },
});
