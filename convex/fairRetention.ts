import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { FAIR_PII_PURGE_AT_MS, FAIR_PURGE_CATEGORIES, type FairPurgeCategory, type FairPurgeMode, type FairPurgeTrigger } from "../lib/fair-contract";
import { requireAdmin } from "./lib/access";
import { fairPurgeCategory, fairPurgeCategoryProgress, fairPurgeMode, fairPurgeRunStatus, fairPurgeTrigger } from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — B7 retention: the 16 Nov 2026 PII purge
// (BACKEND-HANDOFF §5.6, MASTER §13, V2 §9).
//
// - Starts by itself: the "fair pii purge" cron calls purgeTick every 15 min;
//   before FAIR_PII_PURGE_AT_MS it only resumes a stalled dry run.
// - Bounded: one transaction deletes at most FAIR_PURGE_BATCH_SIZE rows, then
//   schedules the next one (purgeContinue).
// - Order (FAIR_PURGE_CATEGORIES): outbox → leads → every visitor-linkable raw
//   row → fairVisitors last, so no row ever points at a deleted one.
// - Retry-safe: progress (category position, row counts) is committed with
//   each batch. A failed batch rolls back as a whole; a lost continuation is
//   picked up by the next cron tick from the last committed batch. Deleting
//   is idempotent (rows are always taken from the start of the table).
// - Never touched: fairMetricCountShards (anonymous counts/sums), frozen
//   report datasets, catalog, configuration and templates.
// - Audit (fairPurgeRuns): start, end, category, row counts, status. Nothing
//   that identifies a visitor, a lead or a contact.
// - Preview: previewPurge/getRetentionOverview count up to a cap per
//   category; a dry run walks every table in the same batches and only counts.
// =============================================================================

/** Rows deleted (or counted) per transaction. */
export const FAIR_PURGE_BATCH_SIZE = 200;
/** Preview reads at most this many rows per category ("200+" in the admin tab). */
export const FAIR_PURGE_PREVIEW_CAP = 200;
/** A running run untouched this long lost its continuation; the cron resumes it. */
export const FAIR_PURGE_STALL_MS = 10 * 60 * 1000;

type PurgeTable =
  | "fairEmailDeliveries"
  | "fairLeads"
  | "fairSurveyResponses"
  | "fairRatings"
  | "fairAudienceVotes"
  | "fairBrandFavoriteVotes"
  | "fairPassportStamps"
  | "fairSponsoredEvents"
  | "fairTrafficEvents"
  | "fairShareCollections"
  | "fairUniqueScans"
  | "fairScanEvents"
  | "fairVisitors";

/** Category → table. fairEmailDeliveries includes daily_report rows (their recipient is an address). */
export const FAIR_PURGE_TABLES: Record<FairPurgeCategory, PurgeTable> = {
  email_deliveries: "fairEmailDeliveries",
  leads: "fairLeads",
  survey_responses: "fairSurveyResponses",
  ratings: "fairRatings",
  audience_votes: "fairAudienceVotes",
  brand_favorites: "fairBrandFavoriteVotes",
  passport_stamps: "fairPassportStamps",
  sponsored_actions: "fairSponsoredEvents",
  traffic_events: "fairTrafficEvents",
  share_collections: "fairShareCollections",
  unique_scans: "fairUniqueScans",
  scan_events: "fairScanEvents",
  visitors: "fairVisitors",
};

const runId = v.id("fairPurgeRuns");

const purgeRunView = v.object({
  runId,
  mode: fairPurgeMode,
  trigger: fairPurgeTrigger,
  status: fairPurgeRunStatus,
  startedAt: v.number(),
  updatedAt: v.number(),
  finishedAt: v.optional(v.number()),
  batches: v.number(),
  totalRows: v.number(),
  categories: v.array(fairPurgeCategoryProgress),
});

const previewView = v.object({
  purgeAt: v.number(),
  capPerCategory: v.number(),
  categories: v.array(v.object({ category: fairPurgeCategory, count: v.number(), capped: v.boolean() })),
});

/** Rows of one category in creation order, optionally after a dry-run cursor. */
async function readBatch(ctx: QueryCtx, table: PurgeTable, limit: number, after?: number) {
  if (after === undefined) return await ctx.db.query(table).take(limit);
  return await ctx.db
    .query(table)
    .withIndex("by_creation_time", (q) => q.gt("_creationTime", after))
    .take(limit);
}

function runView(run: Doc<"fairPurgeRuns">) {
  return {
    runId: run._id,
    mode: run.mode,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    ...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
    batches: run.batches,
    totalRows: run.categories.reduce((sum, entry) => sum + entry.rows, 0),
    categories: run.categories,
  };
}

async function previewCounts(ctx: QueryCtx) {
  const categories = [];
  for (const category of FAIR_PURGE_CATEGORIES) {
    const rows = await ctx.db.query(FAIR_PURGE_TABLES[category]).take(FAIR_PURGE_PREVIEW_CAP + 1);
    categories.push({ category, count: Math.min(rows.length, FAIR_PURGE_PREVIEW_CAP), capped: rows.length > FAIR_PURGE_PREVIEW_CAP });
  }
  return { purgeAt: FAIR_PII_PURGE_AT_MS, capPerCategory: FAIR_PURGE_PREVIEW_CAP, categories };
}

async function recentRuns(ctx: QueryCtx) {
  return (await ctx.db.query("fairPurgeRuns").order("desc").take(10)).map(runView);
}

async function runningRun(ctx: QueryCtx, mode: FairPurgeMode) {
  return await ctx.db
    .query("fairPurgeRuns")
    .withIndex("by_mode_and_status", (q) => q.eq("mode", mode).eq("status", "running"))
    .first();
}

async function piiRemains(ctx: QueryCtx) {
  for (const category of FAIR_PURGE_CATEGORIES) {
    if (await ctx.db.query(FAIR_PURGE_TABLES[category]).first()) return true;
  }
  return false;
}

/**
 * One transaction of a run: up to FAIR_PURGE_BATCH_SIZE rows across the
 * categories in order. A category is done only when a read returns fewer rows
 * than asked (its table is empty in execute mode, fully counted in dry_run).
 * Commits the progress and schedules the next transaction.
 */
async function advanceRun(ctx: MutationCtx, run: Doc<"fairPurgeRuns">, now: number) {
  const categories = run.categories.map((entry) => ({ ...entry }));
  let position = run.position;
  let cursor = run.cursorCreationTime;
  let budget = FAIR_PURGE_BATCH_SIZE;
  while (budget > 0 && position < categories.length) {
    const entry = categories[position];
    if (entry.status === "pending") {
      entry.status = "running";
      entry.startedAt = now;
    }
    const asked = budget;
    const rows = await readBatch(ctx, FAIR_PURGE_TABLES[entry.category], asked, run.mode === "dry_run" ? cursor : undefined);
    if (run.mode === "execute") {
      for (const row of rows) await ctx.db.delete(row._id);
    }
    entry.rows += rows.length;
    budget -= rows.length;
    if (rows.length < asked) {
      entry.status = "done";
      entry.finishedAt = now;
      position += 1;
      cursor = undefined;
    } else if (run.mode === "dry_run") {
      cursor = rows[rows.length - 1]._creationTime;
    }
  }
  const completed = position >= categories.length;
  await ctx.db.patch(run._id, {
    categories,
    position,
    cursorCreationTime: cursor,
    batches: run.batches + 1,
    updatedAt: now,
    ...(completed ? { status: "completed" as const, finishedAt: now } : {}),
  });
  if (!completed) await ctx.scheduler.runAfter(0, internal.fairRetention.purgeContinue, { runId: run._id });
  return completed;
}

async function startRun(ctx: MutationCtx, mode: FairPurgeMode, trigger: FairPurgeTrigger, now: number) {
  const id = await ctx.db.insert("fairPurgeRuns", {
    mode,
    trigger,
    status: "running",
    startedAt: now,
    updatedAt: now,
    position: 0,
    batches: 0,
    categories: FAIR_PURGE_CATEGORIES.map((category) => ({ category, rows: 0, status: "pending" as const })),
  });
  await advanceRun(ctx, (await ctx.db.get(id))!, now);
  return id;
}

/** A dry run counts every row the purge would delete, in the same batches, and deletes nothing. */
async function startDryRunOnce(ctx: MutationCtx, trigger: FairPurgeTrigger) {
  const existing = await runningRun(ctx, "dry_run");
  if (existing) return { runId: existing._id, created: false };
  return { runId: await startRun(ctx, "dry_run", trigger, Date.now()), created: true };
}

// -----------------------------------------------------------------------------
// Scheduler and cron (internal)
// -----------------------------------------------------------------------------

export const purgeContinue = internalMutation({
  args: { runId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return null;
    await advanceRun(ctx, run, Date.now());
    return null;
  },
});

/**
 * The cron entry (every 15 min). Before 16 Nov 00:00 (Belgrade) it never
 * deletes. From then on it starts the execute run, resumes it if its
 * continuation was lost, and — once done — starts a new run if any PII row
 * appeared afterwards (e.g. a report email queued by hand), so the purge
 * leaves no PII behind.
 */
export const purgeTick = internalMutation({
  args: {},
  returns: v.object({
    status: v.union(v.literal("not_due"), v.literal("running"), v.literal("resumed"), v.literal("clean"), v.literal("started")),
    runId: v.optional(runId),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const stalledDryRun = await runningRun(ctx, "dry_run");
    if (stalledDryRun && now - stalledDryRun.updatedAt >= FAIR_PURGE_STALL_MS) await advanceRun(ctx, stalledDryRun, now);
    if (now < FAIR_PII_PURGE_AT_MS) return { status: "not_due" as const };

    const running = await runningRun(ctx, "execute");
    if (running) {
      if (now - running.updatedAt < FAIR_PURGE_STALL_MS) return { status: "running" as const, runId: running._id };
      await advanceRun(ctx, running, now);
      return { status: "resumed" as const, runId: running._id };
    }
    if (!(await piiRemains(ctx))) return { status: "clean" as const };
    return { status: "started" as const, runId: await startRun(ctx, "execute", "cron", now) };
  },
});

// -----------------------------------------------------------------------------
// DEV/CLI (internal): `npx convex run fairRetention:previewPurge`,
// `fairRetention:startDryRun`, `fairRetention:listPurgeRuns`. None deletes.
// -----------------------------------------------------------------------------

export const previewPurge = internalQuery({
  args: {},
  returns: previewView,
  handler: async (ctx) => previewCounts(ctx),
});

export const startDryRun = internalMutation({
  args: {},
  returns: v.object({ runId, created: v.boolean() }),
  handler: async (ctx) => startDryRunOnce(ctx, "cli"),
});

export const listPurgeRuns = internalQuery({
  args: {},
  returns: v.array(purgeRunView),
  handler: async (ctx) => recentRuns(ctx),
});

// -----------------------------------------------------------------------------
// Admin (`Događaji → Retention`): preview, dry run and the audit. There is no
// admin "delete now": deletion only ever starts from the dated cron.
// -----------------------------------------------------------------------------

export const getRetentionOverview = query({
  args: {},
  returns: v.object({ preview: previewView, runs: v.array(purgeRunView) }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return { preview: await previewCounts(ctx), runs: await recentRuns(ctx) };
  },
});

export const startPurgeDryRun = mutation({
  args: {},
  returns: v.object({ runId, created: v.boolean() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return startDryRunOnce(ctx, "admin");
  },
});
