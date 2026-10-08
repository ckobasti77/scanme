import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  FAIR_PRE_EVENT_CATEGORIES,
  fairIsPreEvent,
  type FairPreEventCategory,
} from "../lib/fair-contract";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, requireFairEvent } from "./lib/fairCatalog";
import { bumpFairCount, fairScanCountKey, fairScanCountKeys } from "./lib/fairCountShards";
import { FAIR_RATING_FIELDS, fairAudienceVoteKey, fairFavoriteKey, fairRatingCountKey, fairRatingSumKey } from "./lib/fairInteractions";
import { fairTimeKeys } from "./lib/fairScans";
import { fairSponsoredCountKeys } from "./lib/fairSponsored";
import { fairPreEventSummaryView } from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — P1 (Aleksa, 8. 10. 2026): pre-event data.
//
// Everything a visitor writes before the event's startsAt (fairIsPreEvent) is
// pre-event: stored, but in no counter, analytics, report, dashboard, export
// or public number (the write paths skip the counters; the readers start at
// startsAt). Here the admin sees how much of it exists per kind and can
// delete it: „Resetuj pre-event podatke“.
//
// - Only the visitor data of ONE event and only rows from before its start:
//   leads (+ their outbox rows), survey answers, ratings, Glas publike votes,
//   brand favorites, passport stamps, sponsored actions, traffic rows, unique
//   scans and scan rows. Never the catalog (exhibitors, participations,
//   brands, models, stands), the QR inventory, cards or /r/[cardCode], the
//   consents, forms and settings, fairVisitors (one row serves every event;
//   the 16 Nov purge deletes it) or a shared collection's public link.
// - Rows written before P1 were counted: their counter share is subtracted
//   in the same transaction as the delete. A row flagged `preEvent` never was.
// - A unique scan whose visitor scanned the model again during the fair is
//   fair data and stays. One written before P1 had its unique count on the
//   pre-event scan: the count moves to the visitor's first fair scan (day and
//   hour buckets; the all-time count is unchanged). Likewise a pre-P1 stamp of
//   a visitor who scanned the model during the fair moves to the fair instead
//   of being deleted.
// - Admin only. `dryRun` (default) returns the counts per kind; the real run
//   needs the event's slug typed back and deletes in bounded batches through
//   the scheduler. Idempotent: a second run finds nothing.
// - DEV/CLI: `npx convex run fairPreEvent:previewPreEventReset
//   '{"eventSlug":"..."}'` is the read-only dry run (no CLI delete exists).
// =============================================================================

/** Rows counted per kind in the overview / dry run ("200+"). */
export const FAIR_PRE_EVENT_PREVIEW_CAP = 200;
/** Rows deleted per transaction (each may move up to eight counter shards). */
export const FAIR_PRE_EVENT_BATCH_SIZE = 100;
/** Outbox rows of one lead (confirmation + follow-up; spare for safety). */
const LEAD_DELIVERIES_CAP = 10;
/** Unique rows per transaction (a pre-P1 one may read the model's scans around the start). */
const UNIQUE_BATCH_SIZE = 25;
/** Scan rows of one model read on each side of the start to settle a pre-P1 unique scan. */
const MIXED_SCAN_LOOKUP_CAP = 100;

/** Deletion order; an outbox row goes together with its lead. */
type ResetCategory = Exclude<FairPreEventCategory, "email_deliveries">;
const RESET_ORDER = FAIR_PRE_EVENT_CATEGORIES.filter((category): category is ResetCategory => category !== "email_deliveries");

/** A unique scan is pre-event while its visitor has not scanned the model again during the fair. */
function preEventUnique(row: Doc<"fairUniqueScans">, startsAt: number) {
  return fairIsPreEvent(row.lastScannedAt, { startsAt });
}

async function leadDeliveries(ctx: QueryCtx, leadId: Id<"fairLeads">) {
  return ctx.db
    .query("fairEmailDeliveries")
    .withIndex("by_leadId_and_kind", (q) => q.eq("leadId", leadId))
    .take(LEAD_DELIVERIES_CAP);
}

/** Pre-event rows of one kind, counted up to the cap. */
async function countCategory(ctx: QueryCtx, event: Doc<"fairEvents">, category: FairPreEventCategory) {
  const startsAt = event.startsAt;
  const take = FAIR_PRE_EVENT_PREVIEW_CAP + 1;
  const counted = (rows: number, capped = rows > FAIR_PRE_EVENT_PREVIEW_CAP) => ({ count: Math.min(rows, FAIR_PRE_EVENT_PREVIEW_CAP), capped });
  switch (category) {
    case "email_deliveries": {
      const leads = await ctx.db
        .query("fairLeads")
        .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id).lt("createdAt", startsAt))
        .take(take);
      let rows = 0;
      for (const lead of leads.slice(0, FAIR_PRE_EVENT_PREVIEW_CAP)) rows += (await leadDeliveries(ctx, lead._id)).length;
      return counted(rows, leads.length > FAIR_PRE_EVENT_PREVIEW_CAP || rows > FAIR_PRE_EVENT_PREVIEW_CAP);
    }
    case "leads":
      return counted((await ctx.db.query("fairLeads").withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id).lt("createdAt", startsAt)).take(take)).length);
    case "survey_responses":
      return counted((await ctx.db.query("fairSurveyResponses").withIndex("by_eventId_and_submittedAt", (q) => q.eq("eventId", event._id).lt("submittedAt", startsAt)).take(take)).length);
    case "ratings":
      return counted((await ctx.db.query("fairRatings").withIndex("by_eventId_and_updatedAt", (q) => q.eq("eventId", event._id).lt("updatedAt", startsAt)).take(take)).length);
    case "audience_votes":
      return counted((await ctx.db.query("fairAudienceVotes").withIndex("by_eventId_and_updatedAt", (q) => q.eq("eventId", event._id).lt("updatedAt", startsAt)).take(take)).length);
    case "brand_favorites":
      return counted((await ctx.db.query("fairBrandFavoriteVotes").withIndex("by_eventId_and_updatedAt", (q) => q.eq("eventId", event._id).lt("updatedAt", startsAt)).take(take)).length);
    case "passport_stamps": {
      const rows = await ctx.db
        .query("fairPassportStamps")
        .withIndex("by_eventId_and_scannedAt", (q) => q.eq("eventId", event._id).lt("scannedAt", startsAt))
        .take(take);
      // A stamp whose visitor scanned the model during the fair moves there (not deleted).
      let rowsToDelete = 0;
      for (const row of rows.slice(0, FAIR_PRE_EVENT_PREVIEW_CAP)) {
        const unique = await ctx.db
          .query("fairUniqueScans")
          .withIndex("by_visitorId_and_eventModelId", (q) => q.eq("visitorId", row.visitorId).eq("eventModelId", row.eventModelId))
          .unique();
        if (!unique || preEventUnique(unique, startsAt)) rowsToDelete += 1;
      }
      return counted(rowsToDelete, rows.length > FAIR_PRE_EVENT_PREVIEW_CAP);
    }
    case "sponsored_actions":
      return counted((await ctx.db.query("fairSponsoredEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", event._id).lt("occurredAt", startsAt)).take(take)).length);
    case "traffic_events":
      return counted((await ctx.db.query("fairTrafficEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", event._id).lt("occurredAt", startsAt)).take(take)).length);
    case "unique_scans": {
      const rows = await ctx.db
        .query("fairUniqueScans")
        .withIndex("by_eventId_and_firstScannedAt", (q) => q.eq("eventId", event._id).lt("firstScannedAt", startsAt))
        .take(take);
      return counted(rows.slice(0, FAIR_PRE_EVENT_PREVIEW_CAP).filter((row) => preEventUnique(row, startsAt)).length, rows.length > FAIR_PRE_EVENT_PREVIEW_CAP);
    }
    case "scan_events":
      return counted((await ctx.db.query("fairScanEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", event._id).lt("occurredAt", startsAt)).take(take)).length);
  }
}

type Summary = Infer<typeof fairPreEventSummaryView>;

export async function fairPreEventSummary(ctx: QueryCtx, event: Doc<"fairEvents">): Promise<Summary> {
  const categories: Summary["categories"] = [];
  for (const category of FAIR_PRE_EVENT_CATEGORIES) categories.push({ category, ...(await countCategory(ctx, event, category)) });
  return {
    eventId: event._id,
    eventSlug: event.slug,
    startsAt: event.startsAt,
    capPerCategory: FAIR_PRE_EVENT_PREVIEW_CAP,
    total: categories.reduce((sum, row) => sum + row.count, 0),
    capped: categories.some((row) => row.capped),
    categories,
  };
}

// -----------------------------------------------------------------------------
// Deleting (with the counter share of rows written before P1)
// -----------------------------------------------------------------------------

async function unbump(ctx: MutationCtx, keys: readonly string[], delta = -1) {
  for (const key of keys) await bumpFairCount(ctx, key, delta);
}

/**
 * A unique scan written before P1 (counted on its pre-event first scan) whose
 * visitor scanned the model again during the fair: the day/hour unique count
 * moves to the first fair scan, pre-event scans leave its total. Not found
 * within the bounded read: left as it is.
 */
async function settleMixedUnique(ctx: MutationCtx, row: Doc<"fairUniqueScans">, startsAt: number) {
  const own = (scan: Doc<"fairScanEvents">) => scan.visitorId === row.visitorId && !scan.isAdminExcluded;
  const firstFair = (
    await ctx.db
      .query("fairScanEvents")
      .withIndex("by_eventModelId_and_occurredAt", (q) => q.eq("eventModelId", row.eventModelId).gte("occurredAt", startsAt))
      .take(MIXED_SCAN_LOOKUP_CAP)
  ).find(own);
  if (!firstFair) return;
  const preScans = (
    await ctx.db
      .query("fairScanEvents")
      .withIndex("by_eventModelId_and_occurredAt", (q) => q.eq("eventModelId", row.eventModelId).lt("occurredAt", startsAt))
      .take(MIXED_SCAN_LOOKUP_CAP)
  ).filter(own).length;
  const model = await ctx.db.get(row.eventModelId);
  const scopes: ["model" | "stand", string][] = [["model", row.eventModelId], ...(model ? [["stand", model.standId] as ["stand", string]] : [])];
  const from = fairTimeKeys(row.firstScannedAt);
  for (const [scope, id] of scopes) {
    await unbump(ctx, [fairScanCountKey("scan_unique", scope, id, from.dateKey), fairScanCountKey("scan_unique", scope, id, from.hourKey)]);
    await unbump(ctx, [fairScanCountKey("scan_unique", scope, id, firstFair.dateKey), fairScanCountKey("scan_unique", scope, id, firstFair.hourKey)], 1);
  }
  await ctx.db.patch(row._id, { firstScannedAt: firstFair.occurredAt, totalScanCount: Math.max(1, row.totalScanCount - preScans) });
}

type Page = { deleted: number; isDone: boolean; continueCursor: string };

/** One page of one kind: deletes its pre-event rows and returns where to go on. */
async function resetPage(ctx: MutationCtx, event: Doc<"fairEvents">, category: ResetCategory, cursor: string | null): Promise<Page> {
  const startsAt = event.startsAt;
  const opts = { numItems: FAIR_PRE_EVENT_BATCH_SIZE, cursor };
  let deleted = 0;
  switch (category) {
    case "leads": {
      const page = await ctx.db.query("fairLeads").withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id).lt("createdAt", startsAt)).paginate(opts);
      for (const lead of page.page) {
        for (const delivery of await leadDeliveries(ctx, lead._id)) await ctx.db.delete(delivery._id);
        await ctx.db.delete(lead._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "survey_responses": {
      const page = await ctx.db.query("fairSurveyResponses").withIndex("by_eventId_and_submittedAt", (q) => q.eq("eventId", event._id).lt("submittedAt", startsAt)).paginate(opts);
      for (const row of page.page) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "ratings": {
      const page = await ctx.db.query("fairRatings").withIndex("by_eventId_and_updatedAt", (q) => q.eq("eventId", event._id).lt("updatedAt", startsAt)).paginate(opts);
      for (const row of page.page) {
        if (row.preEvent !== true) {
          for (const field of FAIR_RATING_FIELDS) {
            const value = row[field];
            if (value === undefined) continue;
            await bumpFairCount(ctx, fairRatingCountKey(field, row.eventModelId), -1);
            await bumpFairCount(ctx, fairRatingSumKey(field, row.eventModelId), -value);
          }
        }
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "audience_votes": {
      const page = await ctx.db.query("fairAudienceVotes").withIndex("by_eventId_and_updatedAt", (q) => q.eq("eventId", event._id).lt("updatedAt", startsAt)).paginate(opts);
      for (const row of page.page) {
        if (row.preEvent !== true) await unbump(ctx, [fairAudienceVoteKey(row.questionId, row.optionId)]);
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "brand_favorites": {
      const page = await ctx.db.query("fairBrandFavoriteVotes").withIndex("by_eventId_and_updatedAt", (q) => q.eq("eventId", event._id).lt("updatedAt", startsAt)).paginate(opts);
      for (const row of page.page) {
        if (row.preEvent !== true) {
          const passport = await ctx.db
            .query("fairPassportConfigs")
            .withIndex("by_eventId_and_brandId", (q) => q.eq("eventId", row.eventId).eq("brandId", row.brandId))
            .first();
          if (passport) await unbump(ctx, [fairFavoriteKey(passport._id, row.eventModelId)]);
        }
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "passport_stamps": {
      const page = await ctx.db.query("fairPassportStamps").withIndex("by_eventId_and_scannedAt", (q) => q.eq("eventId", event._id).lt("scannedAt", startsAt)).paginate(opts);
      for (const row of page.page) {
        // Before P1 a fair scan did not move an earlier stamp: if the visitor scanned the model during the fair, the stamp moves there.
        const unique = await ctx.db
          .query("fairUniqueScans")
          .withIndex("by_visitorId_and_eventModelId", (q) => q.eq("visitorId", row.visitorId).eq("eventModelId", row.eventModelId))
          .unique();
        if (unique && !preEventUnique(unique, startsAt)) {
          await ctx.db.patch(row._id, { scannedAt: unique.lastScannedAt });
          continue;
        }
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "sponsored_actions": {
      const page = await ctx.db.query("fairSponsoredEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", event._id).lt("occurredAt", startsAt)).paginate(opts);
      for (const row of page.page) {
        if (row.preEvent !== true) await unbump(ctx, fairSponsoredCountKeys(row.kind, row.eventModelId, { dateKey: row.dateKey, hourKey: row.hourKey }));
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "traffic_events": {
      const page = await ctx.db.query("fairTrafficEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", event._id).lt("occurredAt", startsAt)).paginate(opts);
      for (const row of page.page) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "unique_scans": {
      const page = await ctx.db
        .query("fairUniqueScans")
        .withIndex("by_eventId_and_firstScannedAt", (q) => q.eq("eventId", event._id).lt("firstScannedAt", startsAt))
        .paginate({ numItems: UNIQUE_BATCH_SIZE, cursor });
      for (const row of page.page) {
        // Scanned again during the fair: fair data, kept (a pre-P1 row is settled on its first fair scan).
        if (!preEventUnique(row, startsAt)) {
          if (row.preEvent !== true) await settleMixedUnique(ctx, row, startsAt);
          continue;
        }
        if (row.preEvent !== true) {
          const time = fairTimeKeys(row.firstScannedAt);
          const model = await ctx.db.get(row.eventModelId);
          await unbump(
            ctx,
            model
              ? fairScanCountKeys("scan_unique", { eventModelId: row.eventModelId, standId: model.standId }, time)
              : [undefined, time.dateKey, time.hourKey].map((bucket) => fairScanCountKey("scan_unique", "model", row.eventModelId, bucket)),
          );
        }
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
    case "scan_events": {
      const page = await ctx.db.query("fairScanEvents").withIndex("by_eventId_and_occurredAt", (q) => q.eq("eventId", event._id).lt("occurredAt", startsAt)).paginate(opts);
      for (const row of page.page) {
        if (row.preEvent !== true && !row.isAdminExcluded) {
          await unbump(ctx, fairScanCountKeys("scan_total", { eventModelId: row.eventModelId, standId: row.standId }, { dateKey: row.dateKey, hourKey: row.hourKey }));
        }
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      return { deleted, isDone: page.isDone, continueCursor: page.continueCursor };
    }
  }
}

/** One transaction of a reset run: one page of one kind, then the next page or kind is scheduled. */
export const resetPreEventBatch = internalMutation({
  args: {
    eventId: v.id("fairEvents"),
    actorUserId: v.id("users"),
    position: v.number(),
    cursor: v.union(v.string(), v.null()),
    deleted: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const category = RESET_ORDER[args.position];
    if (!event || category === undefined) return null;
    const page = await resetPage(ctx, event, category, args.cursor);
    const deleted = args.deleted + page.deleted;
    const position = page.isDone ? args.position + 1 : args.position;
    if (position < RESET_ORDER.length) {
      await ctx.scheduler.runAfter(0, internal.fairPreEvent.resetPreEventBatch, {
        eventId: event._id,
        actorUserId: args.actorUserId,
        position,
        cursor: page.isDone ? null : page.continueCursor,
        deleted,
      });
    } else {
      await writeAdminAudit(ctx, {
        actorUserId: args.actorUserId,
        action: "fair_pre_event_reset_completed",
        detail: { eventId: event._id, eventCode: event.code, startsAt: event.startsAt, deleted },
        now: Date.now(),
      });
    }
    return null;
  },
});

// -----------------------------------------------------------------------------
// Admin (`Događaji → Pregled`) and DEV/CLI
// -----------------------------------------------------------------------------

/** How many pre-event rows exist per kind (admin overview). */
export const getPreEventSummary = query({
  args: { eventId: v.id("fairEvents") },
  returns: fairPreEventSummaryView,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return fairPreEventSummary(ctx, await requireFairEvent(ctx, args.eventId));
  },
});

/**
 * „Resetuj pre-event podatke“. `dryRun` (default true) only counts. The real
 * run needs `confirmSlug` equal to the event's slug, writes an audit row and
 * starts the batches; the counts it returns are those before the delete.
 */
export const resetPreEventData = mutation({
  args: { eventId: v.id("fairEvents"), dryRun: v.optional(v.boolean()), confirmSlug: v.optional(v.string()) },
  returns: v.object({ dryRun: v.boolean(), started: v.boolean(), summary: fairPreEventSummaryView }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const summary = await fairPreEventSummary(ctx, event);
    if (args.dryRun ?? true) return { dryRun: true, started: false, summary };
    if ((args.confirmSlug ?? "").trim() !== event.slug) fairAdminError("FAIR_RESET_CONFIRMATION_MISMATCH");
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: "fair_pre_event_reset_started",
      detail: { eventId: event._id, eventCode: event.code, startsAt: event.startsAt, total: summary.total, capped: summary.capped },
      now: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.fairPreEvent.resetPreEventBatch, { eventId: event._id, actorUserId: admin._id, position: 0, cursor: null, deleted: 0 });
    return { dryRun: false, started: true, summary };
  },
});

/** Read-only dry run for the CLI (DEV): the same counts as the admin overview. */
export const previewPreEventReset = internalQuery({
  args: { eventSlug: v.string() },
  returns: v.union(v.null(), fairPreEventSummaryView),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("fairEvents")
      .withIndex("by_slug", (q) => q.eq("slug", args.eventSlug))
      .first();
    return event ? fairPreEventSummary(ctx, event) : null;
  },
});
