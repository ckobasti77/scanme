import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isFairLeadEmail, type FairPackageTier, type FairReportFormat } from "../lib/fair-contract";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError } from "./lib/fairCatalog";
import { fairModelTierAt } from "./lib/fairInteractions";
import { fairExhibitorName, fairModelFullName, scheduleFairEmailSend } from "./lib/fairLeads";
import { fairReportFormat, fairReportStatus } from "./lib/fairValidators";
import {
  assembleFairDailyDataset,
  fairDailyDataset,
  fairTiersHaveDailyReport,
  type FairDailyDataset,
  type FairDailyDatasetContext,
  type FairReportModelRaw,
} from "./lib/fairReportDataset";
import {
  FAIR_REPORT_MIME,
  fairDailyReportDocument,
  fairDailyReportFileName,
  fairLeadsDocument,
  fairOrganizerDocument,
  fairReportFileSlug,
  fairReportStamp,
  renderFairReport,
  type FairLeadExportRow,
  type FairOrganizerDay,
} from "./lib/fairReportFiles";
import { fairParticipationModels } from "./fairAnalytics";
import { chunkBytes } from "./menuExport";

// =============================================================================
// Sajam automobila 2026 — B6 report runs (BACKEND-HANDOFF §5.6, §7
// fairReports, §11 B6; MASTER §12, §13). One run = one exhibitor
// participation × one fair day × one file format.
//
// Lifecycle (fairReportRuns.status):
//   queued → building → pending_review → approved → sent | failed
//   - the cron (every 15 min) queues a run for every active participation
//     with a daily-report package once its day has closed (fairEventDays
//     .endsAt), and the build runs at once → the dataset is ready well inside
//     the 60 minutes MASTER §12 requires;
//   - building freezes the dataset on the row and stores the rendered file;
//   - NOTHING is sent automatically: `sendReportRun` refuses every status but
//     `approved`, and only an admin's `approveReportRun` sets it;
//   - sending goes through the B4 outbox (fairEmailDeliveries, kind
//     daily_report, dedupeKey fair-report/<runId>/<n> = Resend
//     Idempotency-Key); the claim re-checks the approval right before delivery;
//   - resend (from `sent`), retry (from `failed`) and a corrected version
//     (`correctionOfReportRunId`, a new run through the same review) exist.
// Files are downloadable only by an admin. The PII lead export and the
// organizer aggregate are separate artifacts, never part of a report.
// =============================================================================

export const FAIR_DAILY_REPORT_FORMAT: FairReportFormat = "pdf";
/** The cron only backfills days that closed within this window (no surprise rebuild of old days). */
const SWEEP_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVENTS_CAP = 20;
const SWEEP_CREATES_CAP = 100;
const DAYS_CAP = 60;
const PARTICIPATIONS_CAP = 500;
const RUNS_PER_DAY_CAP = 300;
const LIST_CAP = 500;
const LEAD_EXPORT_PAGE = 200;
const LEAD_EXPORT_CAP = 5000;

type Ctx = QueryCtx | MutationCtx;

// Explicit shapes of the internal calls the actions make (breaks the
// api ↔ module type cycle; the validators in fairAnalytics.ts are the source).
type BuildClaim = { participationId: Id<"fairParticipations">; eventDayId: Id<"fairEventDays">; format: FairReportFormat };
type DayView = { _id: Id<"fairEventDays">; dateKey: string; label: string; startsAt: number; endsAt: number; sortOrder: number };
type ReportContext = {
  event: FairDailyDatasetContext["event"];
  day: DayView;
  previousDay: DayView | null;
  participationId: Id<"fairParticipations">;
  exhibitorName: string;
  reportRecipientEmail: string | null;
  stands: FairDailyDataset["stands"];
  modelIds: Id<"fairEventModels">[];
  modelsTruncated: boolean;
};
type OrganizerScope = {
  eventTitle: string;
  eventSlug: string;
  days: DayView[];
  standIds: Id<"fairStands">[];
  participationIds: Id<"fairParticipations">[];
};

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

async function insertReportRun(
  ctx: MutationCtx,
  input: {
    eventId: Id<"fairEvents">;
    day: Doc<"fairEventDays">;
    participationId: Id<"fairParticipations">;
    format: FairReportFormat;
    correctionOfReportRunId?: Id<"fairReportRuns">;
    now: number;
  },
): Promise<Id<"fairReportRuns">> {
  const runId = await ctx.db.insert("fairReportRuns", {
    eventId: input.eventId,
    eventDayId: input.day._id,
    participationId: input.participationId,
    status: "queued",
    dataThrough: input.day.endsAt,
    format: input.format,
    ...(input.correctionOfReportRunId ? { correctionOfReportRunId: input.correctionOfReportRunId } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  });
  await ctx.scheduler.runAfter(0, internal.fairReports.buildReportRun, { reportRunId: runId });
  return runId;
}

/** Does at least one of the participation's models have a daily report at `at`? */
async function participationHasDailyReport(ctx: Ctx, participation: Doc<"fairParticipations">, at: number): Promise<boolean> {
  const { models } = await fairParticipationModels(ctx, participation);
  const tiers: FairPackageTier[] = [];
  for (const model of models) tiers.push(await fairModelTierAt(ctx, model, at));
  return fairTiersHaveDailyReport(tiers);
}

function reportDedupeKey(runId: Id<"fairReportRuns">, sendCount: number) {
  return `fair-report/${runId}/${sendCount}`;
}

async function latestDelivery(ctx: Ctx, run: Doc<"fairReportRuns">) {
  if (!run.sendCount) return null;
  return ctx.db
    .query("fairEmailDeliveries")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", reportDedupeKey(run._id, run.sendCount!)))
    .unique();
}

async function requireRun(ctx: Ctx, reportRunId: Id<"fairReportRuns">) {
  const run = await ctx.db.get(reportRunId);
  if (!run) fairAdminError("FAIR_REPORT_NOT_FOUND");
  return run;
}

/** Queues one outbox delivery of the run's stored file (the run must already be sendable). */
async function queueReportDelivery(ctx: MutationCtx, run: Doc<"fairReportRuns">, recipientArg: string | undefined, now: number) {
  const inFlight = await latestDelivery(ctx, run);
  if (inFlight?.status === "queued") fairAdminError("FAIR_REPORT_STATUS", { status: "sending" });
  const participation = await ctx.db.get(run.participationId);
  const recipient = (recipientArg ?? run.recipient ?? participation?.reportRecipientEmail ?? "").trim().toLowerCase();
  if (!recipient || !isFairLeadEmail(recipient)) fairAdminError("FAIR_REPORT_RECIPIENT_MISSING");
  if (!run.storageId || !run.dataset) fairAdminError("FAIR_REPORT_STATUS", { status: run.status });
  const sendCount = (run.sendCount ?? 0) + 1;
  const deliveryId = await ctx.db.insert("fairEmailDeliveries", {
    dedupeKey: reportDedupeKey(run._id, sendCount),
    reportRunId: run._id,
    kind: "daily_report",
    recipient,
    status: "queued",
    scheduledFor: now,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(run._id, { sendCount, recipient, error: undefined, updatedAt: now });
  await scheduleFairEmailSend(ctx, deliveryId, now, now);
  return deliveryId;
}

// -----------------------------------------------------------------------------
// Cron: queue the closed day's runs (convex/crons.ts, every 15 minutes)
// -----------------------------------------------------------------------------

export const sweepDailyReports = internalMutation({
  args: {},
  returns: v.object({ created: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let more = false;
    outer: for (const status of ["published", "live", "ended"] as const) {
      const events = await ctx.db
        .query("fairEvents")
        .withIndex("by_status_and_startsAt", (q) => q.eq("status", status))
        .take(SWEEP_EVENTS_CAP);
      for (const event of events) {
        const days = await ctx.db
          .query("fairEventDays")
          .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event._id))
          .take(DAYS_CAP);
        for (const day of days) {
          if (day.endsAt > now || now - day.endsAt > SWEEP_LOOKBACK_MS) continue;
          const participations = await ctx.db
            .query("fairParticipations")
            .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id))
            .take(PARTICIPATIONS_CAP);
          for (const participation of participations) {
            if (participation.status !== "active") continue;
            const existing = await ctx.db
              .query("fairReportRuns")
              .withIndex("by_eventDayId_and_participationId", (q) => q.eq("eventDayId", day._id).eq("participationId", participation._id))
              .first();
            if (existing) continue;
            if (!(await participationHasDailyReport(ctx, participation, day.endsAt - 1))) continue;
            if (created >= SWEEP_CREATES_CAP) {
              more = true;
              break outer;
            }
            await insertReportRun(ctx, { eventId: event._id, day, participationId: participation._id, format: FAIR_DAILY_REPORT_FORMAT, now });
            created += 1;
          }
        }
      }
    }
    if (more) await ctx.scheduler.runAfter(0, internal.fairReports.sweepDailyReports, {});
    return { created, more };
  },
});

// -----------------------------------------------------------------------------
// Build (scheduled action; reads one model per query, then freezes the dataset)
// -----------------------------------------------------------------------------

export const claimBuild = internalMutation({
  args: { reportRunId: v.id("fairReportRuns") },
  returns: v.union(
    v.null(),
    v.object({ participationId: v.id("fairParticipations"), eventDayId: v.id("fairEventDays"), format: fairReportFormat }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.reportRunId);
    if (!run || run.status !== "queued") return null;
    await ctx.db.patch(run._id, { status: "building", updatedAt: Date.now() });
    return { participationId: run.participationId, eventDayId: run.eventDayId, format: run.format };
  },
});

export const completeBuild = internalMutation({
  args: {
    reportRunId: v.id("fairReportRuns"),
    dataset: fairDailyDataset,
    storageId: v.id("_storage"),
    recipient: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.reportRunId);
    if (!run || run.status !== "building") {
      await ctx.storage.delete(args.storageId);
      return null;
    }
    if (run.storageId) await ctx.storage.delete(run.storageId);
    await ctx.db.patch(run._id, {
      status: "pending_review",
      dataset: args.dataset,
      storageId: args.storageId,
      dataThrough: args.dataset.windowEnd,
      ...(run.recipient === undefined && args.recipient ? { recipient: args.recipient } : {}),
      error: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const failBuild = internalMutation({
  args: { reportRunId: v.id("fairReportRuns"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.reportRunId);
    if (!run || run.status !== "building") return null;
    await ctx.db.patch(run._id, { status: "failed", error: args.error.slice(0, 120), updatedAt: Date.now() });
    return null;
  },
});

export const buildReportRun = internalAction({
  args: { reportRunId: v.id("fairReportRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim: BuildClaim | null = await ctx.runMutation(internal.fairReports.claimBuild, args);
    if (!claim) return null;
    try {
      const context: ReportContext | null = await ctx.runQuery(internal.fairAnalytics.reportContext, { participationId: claim.participationId, eventDayId: claim.eventDayId });
      if (!context) {
        await ctx.runMutation(internal.fairReports.failBuild, { reportRunId: args.reportRunId, error: "REPORT_CONTEXT_MISSING" });
        return null;
      }
      const raws: FairReportModelRaw[] = [];
      for (const eventModelId of context.modelIds) {
        const raw: FairReportModelRaw | null = await ctx.runQuery(internal.fairAnalytics.modelDayRaw, {
          eventModelId,
          participationId: context.participationId,
          eventDayId: context.day._id,
          ...(context.previousDay ? { previousEventDayId: context.previousDay._id } : {}),
        });
        if (raw) raws.push(raw);
      }
      const builtAt = Date.now();
      const dataset: FairDailyDataset = assembleFairDailyDataset(
        {
          event: context.event,
          day: context.day,
          previousDay: context.previousDay,
          participationId: context.participationId,
          exhibitorName: context.exhibitorName,
          stands: context.stands,
          modelsTruncated: context.modelsTruncated,
          builtAt,
        },
        raws,
      );
      const bytes = renderFairReport(fairDailyReportDocument(dataset), claim.format, fairReportStamp(builtAt));
      const storageId: Id<"_storage"> = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: FAIR_REPORT_MIME[claim.format] }));
      await ctx.runMutation(internal.fairReports.completeBuild, {
        reportRunId: args.reportRunId,
        dataset,
        storageId,
        ...(context.reportRecipientEmail ? { recipient: context.reportRecipientEmail } : {}),
      });
    } catch {
      await ctx.runMutation(internal.fairReports.failBuild, { reportRunId: args.reportRunId, error: "BUILD_FAILED" });
    }
    return null;
  },
});

// -----------------------------------------------------------------------------
// Admin reads (requireAdmin)
// -----------------------------------------------------------------------------

const reportRunRow = v.object({
  reportRunId: v.id("fairReportRuns"),
  eventDayId: v.id("fairEventDays"),
  dateKey: v.string(),
  dayLabel: v.string(),
  participationId: v.id("fairParticipations"),
  exhibitorName: v.string(),
  status: fairReportStatus,
  format: fairReportFormat,
  dataThrough: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  hasFile: v.boolean(),
  recipient: v.optional(v.string()),
  error: v.optional(v.string()),
  approvedAt: v.optional(v.number()),
  correctionOfReportRunId: v.optional(v.id("fairReportRuns")),
  sendCount: v.number(),
  lastDelivery: v.union(v.null(), v.object({ status: v.string(), lastError: v.optional(v.string()), updatedAt: v.number() })),
});

async function runRow(ctx: Ctx, run: Doc<"fairReportRuns">, day: Doc<"fairEventDays">, exhibitorName: string) {
  const delivery = await latestDelivery(ctx, run);
  return {
    reportRunId: run._id,
    eventDayId: run.eventDayId,
    dateKey: day.dateKey,
    dayLabel: day.label,
    participationId: run.participationId,
    exhibitorName,
    status: run.status,
    format: run.format,
    dataThrough: run.dataThrough,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    hasFile: run.storageId !== undefined,
    ...(run.recipient !== undefined ? { recipient: run.recipient } : {}),
    ...(run.error !== undefined ? { error: run.error } : {}),
    ...(run.approvedAt !== undefined ? { approvedAt: run.approvedAt } : {}),
    ...(run.correctionOfReportRunId !== undefined ? { correctionOfReportRunId: run.correctionOfReportRunId } : {}),
    sendCount: run.sendCount ?? 0,
    lastDelivery: delivery
      ? { status: delivery.status, ...(delivery.lastError !== undefined ? { lastError: delivery.lastError } : {}), updatedAt: delivery.updatedAt }
      : null,
  };
}

/** Every run of the event, newest first per day (bounded). No dataset, no contact. */
export const listReportRuns = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.array(reportRunRow),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const days = await ctx.db
      .query("fairEventDays")
      .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", args.eventId))
      .take(DAYS_CAP);
    const names = new Map<string, string>();
    const rows = [];
    for (const day of days.sort((a, b) => b.sortOrder - a.sortOrder)) {
      const runs = await ctx.db
        .query("fairReportRuns")
        .withIndex("by_eventDayId_and_participationId", (q) => q.eq("eventDayId", day._id))
        .take(RUNS_PER_DAY_CAP);
      for (const run of runs.sort((a, b) => b.createdAt - a.createdAt)) {
        if (rows.length >= LIST_CAP) break;
        if (!names.has(run.participationId)) names.set(run.participationId, (await fairExhibitorName(ctx, run.participationId)) ?? "—");
        rows.push(await runRow(ctx, run, day, names.get(run.participationId)!));
      }
    }
    return rows;
  },
});

/** One run with its frozen dataset — what the admin reviews before approving. */
export const getReportRun = query({
  args: { reportRunId: v.id("fairReportRuns") },
  returns: v.union(v.null(), v.object({ run: reportRunRow, dataset: v.union(v.null(), fairDailyDataset) })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const run = await ctx.db.get(args.reportRunId);
    if (!run) return null;
    const day = await ctx.db.get(run.eventDayId);
    if (!day) return null;
    return { run: await runRow(ctx, run, day, (await fairExhibitorName(ctx, run.participationId)) ?? "—"), dataset: run.dataset ?? null };
  },
});

// -----------------------------------------------------------------------------
// Admin commands (requireAdmin)
// -----------------------------------------------------------------------------

/** Manual build (any participation of the day's event; an `included`-only one gets stand totals only). */
export const requestReportBuild = mutation({
  args: { eventDayId: v.id("fairEventDays"), participationId: v.id("fairParticipations"), format: fairReportFormat },
  returns: v.object({ reportRunId: v.id("fairReportRuns") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const [day, participation] = await Promise.all([ctx.db.get(args.eventDayId), ctx.db.get(args.participationId)]);
    if (!day) fairAdminError("FAIR_EVENT_DAY_NOT_FOUND");
    if (!participation) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
    if (participation.eventId !== day.eventId) fairAdminError("FAIR_LINK_CONFLICT", { link: "participation" });
    const now = Date.now();
    const reportRunId = await insertReportRun(ctx, { eventId: day.eventId, day, participationId: participation._id, format: args.format, now });
    await writeAdminAudit(ctx, { actorUserId: admin._id, action: "fair_report_build_requested", detail: { reportRunId, eventDayId: day._id, participationId: participation._id, format: args.format }, now });
    return { reportRunId };
  },
});

/** The manual review gate: pending_review → approved. Nothing else ever sets `approved`. */
export const approveReportRun = mutation({
  args: { reportRunId: v.id("fairReportRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const run = await requireRun(ctx, args.reportRunId);
    if (run.status !== "pending_review" || !run.dataset || !run.storageId) fairAdminError("FAIR_REPORT_STATUS", { status: run.status });
    const now = Date.now();
    await ctx.db.patch(run._id, { status: "approved", reviewedByUserId: admin._id, reviewedAt: now, approvedByUserId: admin._id, approvedAt: now, error: undefined, updatedAt: now });
    await writeAdminAudit(ctx, { actorUserId: admin._id, action: "fair_report_approved", detail: { reportRunId: run._id }, now });
    return null;
  },
});

/** First send. Refuses every status except `approved` (HANDOFF §12). */
export const sendReportRun = mutation({
  args: { reportRunId: v.id("fairReportRuns"), recipient: v.optional(v.string()) },
  returns: v.object({ deliveryId: v.id("fairEmailDeliveries") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const run = await requireRun(ctx, args.reportRunId);
    if (run.status !== "approved" || run.approvedAt === undefined) fairAdminError("FAIR_REPORT_NOT_APPROVED", { status: run.status });
    const now = Date.now();
    const deliveryId = await queueReportDelivery(ctx, run, args.recipient, now);
    await writeAdminAudit(ctx, { actorUserId: admin._id, action: "fair_report_send_queued", detail: { reportRunId: run._id, deliveryId }, now });
    return { deliveryId };
  },
});

/** Resend of an already sent (so already approved) run; the same reviewed file goes again. */
export const resendReportRun = mutation({
  args: { reportRunId: v.id("fairReportRuns"), recipient: v.optional(v.string()) },
  returns: v.object({ deliveryId: v.id("fairEmailDeliveries") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const run = await requireRun(ctx, args.reportRunId);
    if (run.status !== "sent" || run.approvedAt === undefined) fairAdminError("FAIR_REPORT_STATUS", { status: run.status });
    const now = Date.now();
    const deliveryId = await queueReportDelivery(ctx, run, args.recipient, now);
    await writeAdminAudit(ctx, { actorUserId: admin._id, action: "fair_report_resend_queued", detail: { reportRunId: run._id, deliveryId }, now });
    return { deliveryId };
  },
});

/**
 * failed → again. A failed build is rebuilt (→ queued; it still has to be
 * reviewed). A failed SEND of an approved run goes back to `approved` and is
 * queued again with a new dedupe key — the approval was already given.
 */
export const retryReportRun = mutation({
  args: { reportRunId: v.id("fairReportRuns") },
  returns: v.object({ status: fairReportStatus }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const run = await requireRun(ctx, args.reportRunId);
    if (run.status !== "failed") fairAdminError("FAIR_REPORT_STATUS", { status: run.status });
    const now = Date.now();
    if (run.approvedAt !== undefined && run.dataset && run.storageId) {
      await ctx.db.patch(run._id, { status: "approved", updatedAt: now });
      await queueReportDelivery(ctx, { ...run, status: "approved" }, undefined, now);
      await writeAdminAudit(ctx, { actorUserId: admin._id, action: "fair_report_send_retried", detail: { reportRunId: run._id }, now });
      return { status: "approved" as const };
    }
    await ctx.db.patch(run._id, { status: "queued", error: undefined, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.fairReports.buildReportRun, { reportRunId: run._id });
    await writeAdminAudit(ctx, { actorUserId: admin._id, action: "fair_report_build_retried", detail: { reportRunId: run._id }, now });
    return { status: "queued" as const };
  },
});

/** A corrected version: a NEW run of the same day/participation, rebuilt and reviewed again. */
export const createReportCorrection = mutation({
  args: { reportRunId: v.id("fairReportRuns"), format: v.optional(fairReportFormat) },
  returns: v.object({ reportRunId: v.id("fairReportRuns") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const original = await requireRun(ctx, args.reportRunId);
    if (original.status === "queued" || original.status === "building") fairAdminError("FAIR_REPORT_STATUS", { status: original.status });
    const day = await ctx.db.get(original.eventDayId);
    if (!day) fairAdminError("FAIR_EVENT_DAY_NOT_FOUND");
    const now = Date.now();
    const reportRunId = await insertReportRun(ctx, {
      eventId: original.eventId,
      day,
      participationId: original.participationId,
      format: args.format ?? original.format,
      correctionOfReportRunId: original._id,
      now,
    });
    if (original.recipient) await ctx.db.patch(reportRunId, { recipient: original.recipient });
    await writeAdminAudit(ctx, { actorUserId: admin._id, action: "fair_report_correction_created", detail: { reportRunId, correctionOfReportRunId: original._id }, now });
    return { reportRunId };
  },
});

// -----------------------------------------------------------------------------
// Admin downloads (actions; files are rendered on demand and returned in
// chunks like convex/menuExport.ts — nothing new is parked in storage)
// -----------------------------------------------------------------------------

const fileResult = v.object({ fileName: v.string(), mimeType: v.string(), chunks: v.array(v.bytes()) });

export const reportRunForDownload = internalQuery({
  args: { reportRunId: v.id("fairReportRuns") },
  returns: fairDailyDataset,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const run = await requireRun(ctx, args.reportRunId);
    if (!run.dataset) fairAdminError("FAIR_REPORT_STATUS", { status: run.status });
    return run.dataset;
  },
});

/** The reviewed dataset of a run in any format (admin only). */
export const downloadReportRun = action({
  args: { reportRunId: v.id("fairReportRuns"), format: fairReportFormat },
  returns: fileResult,
  handler: async (ctx, args) => {
    const dataset: FairDailyDataset = await ctx.runQuery(internal.fairReports.reportRunForDownload, { reportRunId: args.reportRunId });
    const bytes = renderFairReport(fairDailyReportDocument(dataset), args.format, fairReportStamp(dataset.builtAt));
    return { fileName: fairDailyReportFileName(dataset, args.format), mimeType: FAIR_REPORT_MIME[args.format], chunks: chunkBytes(bytes) };
  },
});

export const leadsExportPage = internalQuery({
  args: { eventId: v.id("fairEvents"), participationId: v.id("fairParticipations"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    eventTitle: v.string(),
    exhibitorName: v.string(),
    rows: v.array(
      v.object({
        createdAt: v.number(),
        kind: v.union(v.literal("interest"), v.literal("test_drive")),
        modelName: v.string(),
        contactName: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        consentVersion: v.number(),
        consentedAt: v.number(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const [event, participation] = await Promise.all([ctx.db.get(args.eventId), ctx.db.get(args.participationId)]);
    if (!event) fairAdminError("FAIR_EVENT_NOT_FOUND");
    if (!participation || participation.eventId !== event._id) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
    const page = await ctx.db
      .query("fairLeads")
      .withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", participation._id))
      .paginate({ numItems: LEAD_EXPORT_PAGE, cursor: args.cursor });
    const modelNames = new Map<string, string>();
    const rows: FairLeadExportRow[] = [];
    for (const lead of page.page) {
      if (!modelNames.has(lead.eventModelId)) {
        const model = await ctx.db.get(lead.eventModelId);
        modelNames.set(lead.eventModelId, model ? fairModelFullName(model) : "—");
      }
      rows.push({
        createdAt: lead.createdAt,
        kind: lead.kind,
        modelName: modelNames.get(lead.eventModelId)!,
        contactName: lead.contactName,
        ...(lead.email !== undefined ? { email: lead.email } : {}),
        ...(lead.phone !== undefined ? { phone: lead.phone } : {}),
        consentVersion: lead.consentVersion,
        consentedAt: lead.consentedAt,
      });
    }
    return {
      eventTitle: event.title,
      exhibitorName: (await fairExhibitorName(ctx, participation._id)) ?? "—",
      rows,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * The SEPARATE PII artifact: one exhibitor's leads with contacts (MASTER §12,
 * §13). Admin only, generated on request, never stored and never attached to
 * a report email. The delivery channel per exhibitor is still open (P0.2).
 */
export const exportLeadsFile = action({
  args: { eventId: v.id("fairEvents"), participationId: v.id("fairParticipations"), format: v.union(v.literal("csv"), v.literal("xlsx")) },
  returns: fileResult,
  handler: async (ctx, args) => {
    const rows: FairLeadExportRow[] = [];
    let cursor: string | null = null;
    let eventTitle = "";
    let exhibitorName = "";
    for (;;) {
      const page: {
        eventTitle: string;
        exhibitorName: string;
        rows: FairLeadExportRow[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.fairReports.leadsExportPage, { eventId: args.eventId, participationId: args.participationId, cursor });
      eventTitle = page.eventTitle;
      exhibitorName = page.exhibitorName;
      rows.push(...page.rows);
      if (rows.length > LEAD_EXPORT_CAP) throw new ConvexError({ code: "FAIR_REPORT_EXPORT_TOO_LARGE", details: { max: LEAD_EXPORT_CAP } });
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    rows.sort((a, b) => a.createdAt - b.createdAt);
    const now = Date.now();
    const bytes = renderFairReport(fairLeadsDocument({ eventTitle, exhibitorName, builtAt: now, rows }), args.format, fairReportStamp(now));
    return {
      fileName: `kontakti-${fairReportFileSlug(exhibitorName)}-${fairReportFileSlug(eventTitle)}.${args.format}`,
      mimeType: FAIR_REPORT_MIME[args.format],
      chunks: chunkBytes(bytes),
    };
  },
});

/**
 * Organizer aggregate (MASTER §12): event-wide scans and lead COUNTS per day.
 * No exhibitor split, no PII and no survey answers. Admin only.
 */
export const exportOrganizerAggregate = action({
  args: { eventId: v.id("fairEvents"), format: fairReportFormat },
  returns: fileResult,
  handler: async (ctx, args) => {
    const scope: OrganizerScope = await ctx.runQuery(internal.fairAnalytics.organizerScope, { eventId: args.eventId });
    const days: FairOrganizerDay[] = scope.days.map((day) => ({ label: day.label, dateKey: day.dateKey, total: 0, unique: 0, interest: 0, testDrive: 0 }));
    const dateKeys = scope.days.map((day) => day.dateKey);
    for (const standId of scope.standIds) {
      const perDay: { dateKey: string; total: number; unique: number }[] = await ctx.runQuery(internal.fairAnalytics.organizerStandDays, { standId, dateKeys });
      perDay.forEach((row, index) => {
        days[index].total += row.total;
        days[index].unique += row.unique;
      });
    }
    const windows = scope.days.map((day) => ({ start: day.startsAt, end: day.endsAt }));
    for (const participationId of scope.participationIds) {
      const perDay: { interest: number; testDrive: number }[] = await ctx.runQuery(internal.fairAnalytics.organizerParticipationLeads, { participationId, windows });
      perDay.forEach((row, index) => {
        days[index].interest += row.interest;
        days[index].testDrive += row.testDrive;
      });
    }
    const now = Date.now();
    const bytes = renderFairReport(fairOrganizerDocument({ eventTitle: scope.eventTitle, builtAt: now, days }), args.format, fairReportStamp(now));
    return { fileName: `zbirno-${fairReportFileSlug(scope.eventSlug)}.${args.format}`, mimeType: FAIR_REPORT_MIME[args.format], chunks: chunkBytes(bytes) };
  },
});
