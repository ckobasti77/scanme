import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireBusinessAccess, BusinessAccessDeniedError } from "./lib/access";
import { getUrl as storageGetUrl, remove as storageRemove } from "./lib/storage";
import { getDict } from "../lib/i18n";
import { EXPORT_LINK_TTL_DAYS } from "../lib/memories-export/protocol";

// =============================================================================
// TASK-21 — the host ZIP export, the transactional half (RFC-001 §2.10).
//
// This file owns the JOB and its state machine; the Node worker
// (convex/memoriesExportWorker.ts) owns the sharp+zip bytes. The split is
// deliberate: everything that must be a serializable transaction — dedupe, the
// deletions-win filtering, gating, retry — lives HERE, in queries/mutations that
// convex-test drives directly, so the guarantees are proven without ever
// invoking sharp. The worker is thin glue that decodes, encodes, and calls back.
//
// DELETIONS WIN, guaranteed in two places, both in this file:
//   1. selectExportBatch returns only `ready` photos with a `ready` asset — a
//      photo tombstoned before its batch is selected is never encoded at all.
//   2. survivingEntries re-reads each recorded photo's live status at finalize
//      and drops any that are no longer `ready`. So a photo tombstoned at ANY
//      point before the archive is sealed is absent from the central directory
//      and from metadata.json — no extractor and no reader ever sees it. (Its
//      already-written bytes remain as unreferenced archive slack until the
//      whole archive is purged at link expiry; nothing surfaces them.)
//
// HOST-OR-ADMIN GATED, both to trigger and to download: every public function
// here calls requireBusinessAccess. A guest key never reaches an export.
// =============================================================================

// Finalize reads this job's entries in one query. Bounded well under the
// classic-ZIP 65,535-entry ceiling; a space that somehow exceeded it would fail
// loudly (assertZipClassicLimits) rather than emit a corrupt archive.
const EXPORT_MAX_ENTRIES = 20_000;
// How many chunk blobs / entry rows a single discardArtifacts pass removes
// before rescheduling — the same bounded-batch discipline as the purge sweep.
const CLEANUP_BATCH = 50;

// The central-directory + metadata bookkeeping the worker hands back per file.
const entryInputValidator = v.object({
  photoId: v.id("memoriesPhotos"),
  seq: v.number(),
  name: v.string(),
  tableLabel: v.union(v.string(), v.null()),
  crc: v.number(),
  size: v.number(),
  offset: v.number(),
  dosDate: v.number(),
  dosTime: v.number(),
  takenAt: v.number(),
  visibility: v.union(v.literal("everyone"), v.literal("host_only")),
  width: v.number(),
  height: v.number(),
});

async function activeJobForSpace(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<"memoriesSpaces">,
): Promise<Doc<"memoriesExports"> | null> {
  for (const status of ["queued", "building"] as const) {
    const job = await ctx.db
      .query("memoriesExports")
      .withIndex("by_spaceId_and_status", (q) =>
        q.eq("spaceId", spaceId).eq("status", status),
      )
      .first();
    if (job) return job;
  }
  return null;
}

async function safeStorageRemove(ctx: MutationCtx, ref: Id<"_storage">) {
  try {
    await storageRemove(ctx, ref);
  } catch {
    // Idempotent: an already-gone blob is fine (retried cleanup, double sweep).
  }
}

// -----------------------------------------------------------------------------
// Trigger + retry (public, host-or-admin gated)
// -----------------------------------------------------------------------------

const dict = getDict("memories-panel");

export const startExport = mutation({
  args: { spaceId: v.id("memoriesSpaces") },
  handler: async (ctx, args): Promise<{ jobId: Id<"memoriesExports"> }> => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.loadError);
    const access = await requireBusinessAccess(ctx, space.businessId);

    // Dedupe (§ STEP 1): at most one queued/building job per space. Convex
    // mutations are serializable, so two concurrent triggers cannot both pass
    // this check and both insert — the loser retries under OCC and sees the row.
    const existing = await activeJobForSpace(ctx, args.spaceId);
    if (existing) throw new ConvexError(dict.exportInProgressNote);

    const now = Date.now();
    const jobId = await ctx.db.insert("memoriesExports", {
      spaceId: args.spaceId,
      businessId: space.businessId,
      requestedByUserId: access.user._id,
      status: "queued",
      runningOffset: 0,
      folderCounts: {},
      chunkRefs: [],
      encodedCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.memoriesExportWorker.runExportBatch,
      { jobId },
    );
    return { jobId };
  },
});

export const retryExport = mutation({
  args: { jobId: v.id("memoriesExports") },
  handler: async (ctx, args): Promise<{ jobId: Id<"memoriesExports"> }> => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new ConvexError(dict.loadError);
    const space = await ctx.db.get(job.spaceId);
    if (!space) throw new ConvexError(dict.loadError);
    await requireBusinessAccess(ctx, space.businessId);

    // Only a FAILED job retries in place — no duplicate row (§ STEP 1). A
    // ready/expired job is re-run by starting a fresh export instead.
    if (job.status !== "failed") throw new ConvexError(dict.exportInProgressNote);
    const conflict = await activeJobForSpace(ctx, job.spaceId);
    if (conflict) throw new ConvexError(dict.exportInProgressNote);

    // Reset the row to a clean queued state, then discard the failed run's
    // partial artifacts. The worker is NOT restarted here: the new run reuses the
    // same jobId and seq numbering (encodedCount resets to 0), so a discard pass
    // deleting old entries could otherwise race and delete the new run's entries.
    // discardArtifacts restarts the worker itself once every old artifact is gone
    // (thenStart), so the two never overlap.
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "queued",
      error: undefined,
      cursor: undefined,
      runningOffset: 0,
      folderCounts: {},
      chunkRefs: [],
      encodedCount: 0,
      archiveStorageId: undefined,
      archiveBytes: undefined,
      photoCount: undefined,
      expiresAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.memoriesExport.discardArtifacts, {
      jobId: job._id,
      chunkRefs: job.chunkRefs,
      thenStart: true,
    });
    return { jobId: job._id };
  },
});

// -----------------------------------------------------------------------------
// Worker-facing internal queries/mutations
// -----------------------------------------------------------------------------

export const getExportJobState = internalQuery({
  args: { jobId: v.id("memoriesExports") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    return {
      status: job.status,
      spaceId: job.spaceId,
      cursor: job.cursor ?? null,
      runningOffset: job.runningOffset,
      folderCounts: job.folderCounts ?? {},
      encodedCount: job.encodedCount,
    };
  },
});

// One batch of `ready` photos with their WebP source ref and table label, in
// upload order (by_spaceId_and_createdAt ascending → the archive reads
// chronologically). Only `ready` photos with a `ready` asset are returned; this
// is deletions-win guarantee #1.
export const selectExportBatch = internalQuery({
  args: {
    spaceId: v.id("memoriesSpaces"),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_spaceId_and_createdAt", (q) =>
        q.eq("spaceId", args.spaceId),
      )
      .filter((q) => q.eq(q.field("status"), "ready"))
      .paginate({ numItems: args.numItems, cursor: args.cursor });

    const photos: {
      photoId: Id<"memoriesPhotos">;
      createdAt: number;
      webpRef: string;
      tableLabel: string | null;
      visibility: "everyone" | "host_only";
    }[] = [];
    for (const photo of page.page) {
      if (!photo.mediaAssetId) continue;
      const asset = await ctx.db.get(photo.mediaAssetId);
      if (!asset || asset.status !== "ready") continue;
      let tableLabel: string | null = null;
      if (photo.cardId) {
        const card = await ctx.db.get(photo.cardId);
        tableLabel = card?.label ?? null;
      }
      photos.push({
        photoId: photo._id,
        createdAt: photo.createdAt,
        webpRef: asset.variants.webp.ref,
        tableLabel,
        visibility: photo.visibility,
      });
    }
    return {
      photos,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const beginBuilding = internalMutation({
  args: { jobId: v.id("memoriesExports") },
  handler: async (ctx, args): Promise<{ building: boolean }> => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { building: false };
    if (job.status === "queued") {
      await ctx.db.patch(job._id, { status: "building", updatedAt: Date.now() });
      return { building: true };
    }
    return { building: job.status === "building" };
  },
});

export const recordExportBatch = internalMutation({
  args: {
    jobId: v.id("memoriesExports"),
    chunkRef: v.optional(v.id("_storage")),
    entries: v.array(entryInputValidator),
    cursor: v.union(v.string(), v.null()),
    runningOffset: v.number(),
    folderCounts: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args): Promise<{ cancelled: boolean }> => {
    const job = await ctx.db.get(args.jobId);
    // A job cancelled mid-run (guest/space wipe → invalidateSpaceExports) is no
    // longer "building"; tell the worker to stop and clean up its chunk.
    if (!job || job.status !== "building") return { cancelled: true };

    for (const e of args.entries) {
      await ctx.db.insert("memoriesExportEntries", { jobId: job._id, ...e });
    }
    await ctx.db.patch(job._id, {
      chunkRefs: args.chunkRef
        ? [...job.chunkRefs, args.chunkRef]
        : job.chunkRefs,
      cursor: args.cursor,
      runningOffset: args.runningOffset,
      folderCounts: args.folderCounts,
      encodedCount: job.encodedCount + args.entries.length,
      updatedAt: Date.now(),
    });
    return { cancelled: false };
  },
});

// Finalize's transactional read: the surviving entries (deletions-win #2) plus
// everything the worker needs to seal the archive. Re-reads each recorded
// photo's LIVE status; a photo tombstoned since it was encoded is dropped here.
export const survivingEntries = internalQuery({
  args: { jobId: v.id("memoriesExports") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const space = await ctx.db.get(job.spaceId);
    const entries = await ctx.db
      .query("memoriesExportEntries")
      .withIndex("by_jobId_and_seq", (q) => q.eq("jobId", job._id))
      .take(EXPORT_MAX_ENTRIES);

    const survivors: {
      name: string;
      tableLabel: string | null;
      crc: number;
      size: number;
      offset: number;
      dosDate: number;
      dosTime: number;
      takenAt: number;
      visibility: "everyone" | "host_only";
      width: number;
      height: number;
    }[] = [];
    for (const e of entries) {
      const photo = await ctx.db.get(e.photoId);
      if (!photo || photo.status !== "ready") continue; // deletions win
      survivors.push({
        name: e.name,
        tableLabel: e.tableLabel,
        crc: e.crc,
        size: e.size,
        offset: e.offset,
        dosDate: e.dosDate,
        dosTime: e.dosTime,
        takenAt: e.takenAt,
        visibility: e.visibility,
        width: e.width,
        height: e.height,
      });
    }
    return {
      spaceName: space?.name ?? "",
      chunkRefs: job.chunkRefs,
      runningOffset: job.runningOffset,
      survivors,
    };
  },
});

export const completeExport = internalMutation({
  args: {
    jobId: v.id("memoriesExports"),
    archiveStorageId: v.id("_storage"),
    archiveBytes: v.number(),
    photoCount: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args): Promise<{ cancelled: boolean }> => {
    const job = await ctx.db.get(args.jobId);
    // Cancelled mid-finalize: throw away the archive we just built rather than
    // leaving a downloadable snapshot of invalidated content.
    if (!job || job.status !== "building") {
      await safeStorageRemove(ctx, args.archiveStorageId);
      return { cancelled: true };
    }
    await ctx.db.patch(job._id, {
      status: "ready",
      archiveStorageId: args.archiveStorageId,
      archiveBytes: args.archiveBytes,
      photoCount: args.photoCount,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
    // The chunks and entries are now redundant (the archive is their concat).
    await ctx.scheduler.runAfter(0, internal.memoriesExport.discardArtifacts, {
      jobId: job._id,
      chunkRefs: job.chunkRefs,
    });
    return { cancelled: false };
  },
});

export const failExport = internalMutation({
  args: {
    jobId: v.id("memoriesExports"),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    // Don't clobber a job that already completed or was invalidated.
    if (job.status !== "building" && job.status !== "queued") return null;
    await ctx.db.patch(job._id, {
      status: "failed",
      error: args.code,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.memoriesExport.discardArtifacts, {
      jobId: job._id,
      chunkRefs: job.chunkRefs,
    });
    return null;
  },
});

// Bounded cleanup of a job's intermediate chunk blobs and entry rows, batched
// with continuations like every other sweep in this codebase.
export const discardArtifacts = internalMutation({
  args: {
    jobId: v.id("memoriesExports"),
    chunkRefs: v.array(v.id("_storage")),
    // Retry-only: once every old artifact is gone, (re)start the worker on this
    // same row. Kept out of the complete/fail cleanup paths (default false).
    thenStart: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ done: boolean }> => {
    const chunkBatch = args.chunkRefs.slice(0, CLEANUP_BATCH);
    const remainingChunks = args.chunkRefs.slice(CLEANUP_BATCH);
    for (const ref of chunkBatch) await safeStorageRemove(ctx, ref);

    const entries = await ctx.db
      .query("memoriesExportEntries")
      .withIndex("by_jobId_and_seq", (q) => q.eq("jobId", args.jobId))
      .take(CLEANUP_BATCH);
    for (const e of entries) await ctx.db.delete(e._id);

    // Keep the job row's chunkRefs in sync so a crash mid-cleanup is resumable.
    // Only while the row still belongs to this cleanup (a retry has reset it to
    // [] already, and the worker has not started because thenStart gates it).
    const job = await ctx.db.get(args.jobId);
    if (job && !args.thenStart) {
      await ctx.db.patch(job._id, { chunkRefs: remainingChunks });
    }

    if (remainingChunks.length > 0 || entries.length === CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.memoriesExport.discardArtifacts, {
        jobId: args.jobId,
        chunkRefs: remainingChunks,
        thenStart: args.thenStart,
      });
      return { done: false };
    }
    // Everything gone. For a retry, launch the fresh run now that no old entry
    // can be confused for a new one.
    if (args.thenStart) {
      await ctx.scheduler.runAfter(
        0,
        internal.memoriesExportWorker.runExportBatch,
        { jobId: args.jobId },
      );
    }
    return { done: true };
  },
});

// -----------------------------------------------------------------------------
// Retention & guest-wipe interaction (§ STEP 4)
// -----------------------------------------------------------------------------

// A guest wipe (or space wipe) reaches exports where it reasonably can: a built
// archive may still contain the wiped guest's photo bytes, and guests are
// anonymous so we cannot surgically excise one from a sealed ZIP. So every
// queued/building/ready export of the space is invalidated — the archive blob is
// purged and the link dies. A building job's next recordExportBatch/completeExport
// sees the non-building status and stops. The host can re-export, which will
// exclude the now-deleted photos. Defensible under §2.10: the guest's erasure
// beats a kept snapshot, exactly as it beats the host's archive pin.
export const invalidateSpaceExports = internalMutation({
  args: { spaceId: v.id("memoriesSpaces") },
  handler: async (ctx, args): Promise<{ invalidated: number }> => {
    const jobs = await ctx.db
      .query("memoriesExports")
      .withIndex("by_spaceId_and_createdAt", (q) =>
        q.eq("spaceId", args.spaceId),
      )
      .order("desc")
      .take(100);
    let invalidated = 0;
    const now = Date.now();
    for (const job of jobs) {
      if (
        job.status !== "queued" &&
        job.status !== "building" &&
        job.status !== "ready"
      ) {
        continue;
      }
      if (job.archiveStorageId) {
        await safeStorageRemove(ctx, job.archiveStorageId);
      }
      await ctx.db.patch(job._id, {
        status: "expired",
        archiveStorageId: undefined,
        expiresAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.memoriesExport.discardArtifacts, {
        jobId: job._id,
        chunkRefs: job.chunkRefs,
      });
      invalidated += 1;
    }
    return { invalidated };
  },
});

// Daily cron (crons.ts): a ready archive whose link lifetime elapsed. The BLOB
// is deleted so even a leaked URL 404s — the link truly dies — and the row flips
// to `expired` so the panel says so. The export is a snapshot with its own
// lifetime; a retention sweep of the live photos does NOT touch a built archive
// (§ STEP 4), only this expiry does.
export const purgeExpiredExports = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ purged: number }> => {
    const now = args.now ?? Date.now();
    const ready = await ctx.db
      .query("memoriesExports")
      .withIndex("by_status_and_expiresAt", (q) =>
        q.eq("status", "ready").lte("expiresAt", now),
      )
      .take(CLEANUP_BATCH);
    for (const job of ready) {
      if (job.archiveStorageId) {
        await safeStorageRemove(ctx, job.archiveStorageId);
      }
      await ctx.db.patch(job._id, {
        status: "expired",
        archiveStorageId: undefined,
        updatedAt: now,
      });
    }
    if (ready.length === CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.memoriesExport.purgeExpiredExports,
        {},
      );
    }
    return { purged: ready.length };
  },
});

// -----------------------------------------------------------------------------
// Host panel read model (public, host-or-admin gated)
// -----------------------------------------------------------------------------

type ExportSummary = {
  id: Id<"memoriesExports">;
  status: Doc<"memoriesExports">["status"];
  encodedCount: number;
  photoCount: number | null;
  archiveBytes: number | null;
  expiresAt: number | null;
  error: string | null;
  createdAt: number;
  downloadUrl: string | null;
};

async function summarize(
  ctx: QueryCtx,
  job: Doc<"memoriesExports">,
): Promise<ExportSummary> {
  const downloadUrl =
    job.status === "ready" && job.archiveStorageId
      ? await storageGetUrl(ctx, job.archiveStorageId)
      : null;
  return {
    id: job._id,
    status: job.status,
    encodedCount: job.encodedCount,
    photoCount: job.photoCount ?? null,
    archiveBytes: job.archiveBytes ?? null,
    expiresAt: job.expiresAt ?? null,
    error: job.error ?? null,
    createdAt: job.createdAt,
    downloadUrl,
  };
}

export const exportsForSpace = query({
  args: { spaceId: v.id("memoriesSpaces") },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { status: "forbidden" }
    | {
        status: "ok";
        hasReadyPhotos: boolean;
        active: ExportSummary | null;
        history: ExportSummary[];
        linkTtlDays: number;
      }
  > => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) return { status: "forbidden" as const };
    try {
      await requireBusinessAccess(ctx, space.businessId);
    } catch (error) {
      if (error instanceof BusinessAccessDeniedError) {
        return { status: "forbidden" as const };
      }
      throw error;
    }

    const readyPhoto = await ctx.db
      .query("memoriesPhotos")
      .withIndex("by_spaceId_and_createdAt", (q) =>
        q.eq("spaceId", args.spaceId),
      )
      .filter((q) => q.eq(q.field("status"), "ready"))
      .first();

    const active = await activeJobForSpace(ctx, args.spaceId);
    const recent = await ctx.db
      .query("memoriesExports")
      .withIndex("by_spaceId_and_createdAt", (q) =>
        q.eq("spaceId", args.spaceId),
      )
      .order("desc")
      .take(8);
    const history: ExportSummary[] = [];
    for (const job of recent) {
      if (active && job._id === active._id) continue;
      history.push(await summarize(ctx, job));
    }

    return {
      status: "ok" as const,
      hasReadyPhotos: readyPhoto !== null,
      active: active ? await summarize(ctx, active) : null,
      history,
      linkTtlDays: EXPORT_LINK_TTL_DAYS,
    };
  },
});
