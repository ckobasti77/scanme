"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  getBlob as storageGetBlob,
  remove as storageRemove,
  store as storageStore,
} from "./lib/storage";
import { getDict } from "../lib/i18n";
import { belgradeParts } from "../lib/belgrade-time";
import { deriveExportJpeg } from "../lib/memories-export/jpeg";
import {
  photoFileName,
  photoPath,
  tableFolder,
  tableSlug,
} from "../lib/memories-export/filename";
import { buildMetadata, metadataBytes } from "../lib/memories-export/metadata";
import {
  centralDirectory,
  concatBytes,
  crc32,
  dosDateTime,
  localFileRecord,
  localFileRecordSize,
  type ZipEntry,
} from "../lib/memories-export/zip";
import {
  EXPORT_BATCH_SIZE,
  EXPORT_LINK_TTL_DAYS,
  MEMORIES_EXPORT_ERROR,
} from "../lib/memories-export/protocol";

// =============================================================================
// TASK-21 — the ZIP export's Node worker (RFC-001 §2.10). The bytes half of the
// job; the transactional half is convex/memoriesExport.ts.
//
// WHY A CONVEX "use node" ACTION (and not the Next.js route the guest pipeline
// uses, RFC §2.8): the reasons §2.8 gave for keeping sharp OUT of Convex — HEIC
// decode near the memory ceiling on a LATENCY-CRITICAL guest upload — do not
// apply here. The export is a background, retryable job over OUR OWN WebP (small,
// predictable), processed in bounded batches, with no user waiting on a request.
// Keeping it in Convex lets the scheduler drive the continuations natively (§ the
// task's explicit requirement) with no cross-service hop or app-base-URL env.
// The one caveat this inherits from §2.8 — the linux libvips binary must be in
// the Convex deploy bundle — is a deploy detail, not a design risk here; sharp
// is imported dynamically (below), so this module still loads cleanly in the
// edge runtime that convex-test globs, and only pulls the native binary when a
// real export runs.
//
// The heavy work is split across scheduler continuations so no single invocation
// is "one giant action": each runExportBatch encodes EXPORT_BATCH_SIZE photos
// into one chunk blob and reschedules; finalizeExport seals the archive once.
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// A Uint8Array → BlobPart bridge. Our zip bytes are always backed by exactly
// their own ArrayBuffer (fresh `new Uint8Array(n)` allocations), so the common
// branch is zero-copy; the slice branch is a defensive fallback. Avoids the
// TS 5.7 `Uint8Array<ArrayBufferLike>` ↔ `BlobPart` mismatch cleanly.
function toBlobPart(u: Uint8Array): ArrayBuffer {
  if (u.byteOffset === 0 && u.byteLength === u.buffer.byteLength) {
    return u.buffer as ArrayBuffer;
  }
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

// One batch: select `ready` photos, derive their JPEGs, append their ZIP local
// records into one chunk blob, and hand the bookkeeping back to the transaction.
export const runExportBatch = internalAction({
  args: { jobId: v.id("memoriesExports") },
  handler: async (ctx, args): Promise<void> => {
    try {
      const state = await ctx.runQuery(
        internal.memoriesExport.getExportJobState,
        { jobId: args.jobId },
      );
      // Job gone, or cancelled/terminal (guest wipe → invalidateSpaceExports):
      // stop quietly. Nothing to clean here; the invalidation handles artifacts.
      if (!state) return;
      if (state.status !== "queued" && state.status !== "building") return;
      if (state.status === "queued") {
        await ctx.runMutation(internal.memoriesExport.beginBuilding, {
          jobId: args.jobId,
        });
      }

      const otherFolder = getDict("memories-panel").exportOtherFolder;
      const selection = await ctx.runQuery(
        internal.memoriesExport.selectExportBatch,
        {
          spaceId: state.spaceId,
          cursor: state.cursor,
          numItems: EXPORT_BATCH_SIZE,
        },
      );

      const folderCounts: Record<string, number> = { ...state.folderCounts };
      let runningOffset = state.runningOffset;
      const parts: Uint8Array[] = [];
      const entries: {
        photoId: Id<"memoriesPhotos">;
        seq: number;
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

      for (const photo of selection.photos) {
        // The WebP source. A null blob means it was purged out from under us —
        // the photo was deleted concurrently. Deletions win: skip it.
        const blob = await storageGetBlob(ctx, photo.webpRef as Id<"_storage">);
        if (!blob) continue;
        const webpBytes = new Uint8Array(await blob.arrayBuffer());
        const jpeg = await deriveExportJpeg(webpBytes);

        const slug = tableSlug(photo.tableLabel, tableSlug(otherFolder, "ostalo"));
        const folder = tableFolder(photo.tableLabel, otherFolder);
        const seq = (folderCounts[slug] ?? 0) + 1;
        folderCounts[slug] = seq;

        const p = belgradeParts(photo.createdAt);
        const { dosDate, dosTime } = dosDateTime(
          p.year,
          p.month,
          p.day,
          p.hour,
          p.minute,
          p.second,
        );
        const name = photoPath(
          folder,
          photoFileName(photo.createdAt, slug, seq),
        );
        const crc = crc32(jpeg.data);
        parts.push(
          localFileRecord(
            { name, crc, size: jpeg.data.length, dosDate, dosTime },
            jpeg.data,
          ),
        );
        entries.push({
          photoId: photo.photoId,
          seq: state.encodedCount + entries.length,
          name,
          tableLabel: photo.tableLabel,
          crc,
          size: jpeg.data.length,
          offset: runningOffset,
          dosDate,
          dosTime,
          takenAt: photo.createdAt,
          visibility: photo.visibility,
          width: jpeg.width,
          height: jpeg.height,
        });
        runningOffset += localFileRecordSize(name, jpeg.data.length);
      }

      let chunkRef: Id<"_storage"> | undefined;
      if (parts.length > 0) {
        chunkRef = await storageStore(
          ctx,
          new Blob([toBlobPart(concatBytes(parts))]),
        );
      }

      const res = await ctx.runMutation(
        internal.memoriesExport.recordExportBatch,
        {
          jobId: args.jobId,
          chunkRef,
          entries,
          cursor: selection.continueCursor,
          runningOffset,
          folderCounts,
        },
      );
      // Cancelled mid-batch: undo the chunk we just stored and stop.
      if (res.cancelled) {
        if (chunkRef) await storageRemove(ctx, chunkRef);
        return;
      }

      if (!selection.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal.memoriesExportWorker.runExportBatch,
          { jobId: args.jobId },
        );
      } else {
        await ctx.scheduler.runAfter(
          0,
          internal.memoriesExportWorker.finalizeExport,
          { jobId: args.jobId },
        );
      }
    } catch {
      await ctx.runMutation(internal.memoriesExport.failExport, {
        jobId: args.jobId,
        code: MEMORIES_EXPORT_ERROR.buildFailed,
      });
    }
  },
});

// Seal the archive: re-check survivors (deletions win #2), build metadata.json +
// the central directory, concatenate the chunk blobs, store the archive, stamp
// the expiry.
export const finalizeExport = internalAction({
  args: { jobId: v.id("memoriesExports") },
  handler: async (ctx, args): Promise<void> => {
    try {
      const state = await ctx.runQuery(
        internal.memoriesExport.getExportJobState,
        { jobId: args.jobId },
      );
      if (!state || state.status !== "building") return;

      const data = await ctx.runQuery(
        internal.memoriesExport.survivingEntries,
        { jobId: args.jobId },
      );
      if (!data) return;

      if (data.survivors.length === 0) {
        await ctx.runMutation(internal.memoriesExport.failExport, {
          jobId: args.jobId,
          code: MEMORIES_EXPORT_ERROR.noPhotos,
        });
        return;
      }

      const now = Date.now();

      // metadata.json — data only, no guest identifier (buildMetadata enforces
      // the shape).
      const metaObj = buildMetadata({
        space: data.spaceName,
        generatedAt: now,
        photos: data.survivors.map((s) => ({
          file: s.name,
          table: s.tableLabel,
          takenAt: new Date(s.takenAt).toISOString(),
          visibility: s.visibility,
          width: s.width,
          height: s.height,
        })),
      });
      const metaJson = metadataBytes(metaObj);
      const metaOffset = data.runningOffset;
      const mp = belgradeParts(now);
      const metaDos = dosDateTime(
        mp.year,
        mp.month,
        mp.day,
        mp.hour,
        mp.minute,
        mp.second,
      );
      const metaRecord = localFileRecord(
        {
          name: "metadata.json",
          crc: crc32(metaJson),
          size: metaJson.length,
          dosDate: metaDos.dosDate,
          dosTime: metaDos.dosTime,
        },
        metaJson,
      );

      const centralEntries: ZipEntry[] = [
        ...data.survivors.map((s) => ({
          name: s.name,
          crc: s.crc,
          size: s.size,
          offset: s.offset,
          dosDate: s.dosDate,
          dosTime: s.dosTime,
        })),
        {
          name: "metadata.json",
          crc: crc32(metaJson),
          size: metaJson.length,
          offset: metaOffset,
          dosDate: metaDos.dosDate,
          dosTime: metaDos.dosTime,
        },
      ];
      const cdOffset = metaOffset + metaRecord.length;
      const cdBytes = centralDirectory(centralEntries, cdOffset);

      // Assemble the final archive from the stored chunk blobs (in order) plus
      // the metadata record and the central directory. Passing Blobs and
      // Uint8Arrays as parts lets the runtime stream them into storage without
      // us copying every byte into one buffer.
      const archiveParts: BlobPart[] = [];
      for (const ref of data.chunkRefs) {
        const chunk = await storageGetBlob(ctx, ref);
        if (!chunk) {
          await ctx.runMutation(internal.memoriesExport.failExport, {
            jobId: args.jobId,
            code: MEMORIES_EXPORT_ERROR.storageFailed,
          });
          return;
        }
        archiveParts.push(chunk);
      }
      archiveParts.push(toBlobPart(metaRecord));
      archiveParts.push(toBlobPart(cdBytes));
      const archiveBlob = new Blob(archiveParts, { type: "application/zip" });
      const archiveStorageId = await storageStore(ctx, archiveBlob);

      await ctx.runMutation(internal.memoriesExport.completeExport, {
        jobId: args.jobId,
        archiveStorageId,
        archiveBytes: archiveBlob.size,
        photoCount: data.survivors.length,
        expiresAt: now + EXPORT_LINK_TTL_DAYS * DAY_MS,
      });
    } catch {
      await ctx.runMutation(internal.memoriesExport.failExport, {
        jobId: args.jobId,
        code: MEMORIES_EXPORT_ERROR.buildFailed,
      });
    }
  },
});
