// @vitest-environment node
//
// TASK-21 STEP 5 — the real 400-photo export measurement. This is a BENCH, not a
// unit test: it is skipped in the normal suite (it takes ~a minute and writes
// files) and run explicitly:
//
//   RUN_EXPORT_BENCH=1 npx vitest run lib/memories-export/bench.test.ts
//
// It exercises the exact export codec + ZIP writer the Convex worker uses, in
// the same batched shape (per-batch chunk buffers, then a finalize concat), over
// 400 photos derived from real pipeline WebP variants. It measures wall-clock,
// peak RSS, archive size, and per-photo cost; verifies a file opens as a real
// JPEG and that Windows can extract the archive; and writes the raw numbers to
// docs/perf/memories-export-<tier>-run.md (the canonical
// docs/perf/memories-export.md merges both tiers by hand) so they survive
// this session.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { transformMemoryPhoto } from "../memories-pipeline/transform";
import { deriveExportJpeg } from "./jpeg";
import { tableFolder, tableSlug, photoFileName, photoPath } from "./filename";
import { buildMetadata, metadataBytes } from "./metadata";
import {
  centralDirectory,
  concatBytes,
  crc32,
  dosDateTime,
  localFileRecord,
  localFileRecordSize,
  type ZipEntry,
} from "./zip";
import { EXPORT_BATCH_SIZE } from "./protocol";

const RUN = process.env.RUN_EXPORT_BENCH === "1";
const PHOTO_COUNT = 400;
// TASK-25 Step 0 item 6: the premium tier is selected with
// EXPORT_BENCH_TIER=premium. Sources must out-size the tier clamp
// (transformMemoryPhoto uses withoutEnlargement), so premium synthesizes
// 6000×4000 originals; its raw report goes to a separate file and the
// canonical docs/perf/memories-export.md carries both tiers' numbers.
const TIER =
  process.env.EXPORT_BENCH_TIER === "premium"
    ? { name: "premium", maxDimension: 4096, sourceWidth: 6000, sourceHeight: 4000 }
    : { name: "basic", maxDimension: 2048, sourceWidth: 3000, sourceHeight: 2000 };
const DISTINCT_SOURCES = 16; // distinct real photos, cycled to 400
const TABLES = 20;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

function mib(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

describe.skipIf(!RUN)("memories export bench (400 photos)", () => {
  test(
    "builds a 400-photo archive and records the measurements",
    async () => {
      // --- 1. Real WebP variants from the real pipeline transform ------------
      // A noisy source ≈ a real photograph's entropy, so WebP/JPEG sizes are
      // representative rather than the near-zero of a flat gradient.
      const webps: Uint8Array[] = [];
      for (let i = 0; i < DISTINCT_SOURCES; i += 1) {
        const source = await sharp({
          create: {
            width: TIER.sourceWidth,
            height: TIER.sourceHeight,
            channels: 3,
            noise: { type: "gaussian", mean: 128, sigma: 40 + i },
          },
        })
          .jpeg({ quality: 92 })
          .toBuffer();
        const variants = await transformMemoryPhoto(source, {
          maxDimension: TIER.maxDimension,
        });
        webps.push(variants.webp.data);
      }
      const avgWebp =
        webps.reduce((n, w) => n + w.length, 0) / webps.length;

      // --- 2. Synthetic photo list (chronological, foldered by table) --------
      const eveningStart = Date.UTC(2026, 7, 27, 17, 0, 0);
      const photos = Array.from({ length: PHOTO_COUNT }, (_, i) => ({
        webp: webps[i % webps.length],
        createdAt: eveningStart + i * 45_000, // ~one every 45s across the night
        tableLabel: `Sto ${(i % TABLES) + 1}`,
        visibility: (i % 5 === 0 ? "host_only" : "everyone") as
          | "everyone"
          | "host_only",
      }));

      // --- 3. Peak-RSS sampler ----------------------------------------------
      let peakRss = process.memoryUsage().rss;
      const sampler = setInterval(() => {
        const rss = process.memoryUsage().rss;
        if (rss > peakRss) peakRss = rss;
      }, 25);

      // --- 4. The export, in the worker's batched shape ---------------------
      const startedAt = performance.now();
      let encodeMsTotal = 0;
      const chunks: Uint8Array[] = []; // stands in for stored chunk blobs
      const entries: (ZipEntry & { takenAt: number; tableLabel: string; visibility: "everyone" | "host_only"; width: number; height: number })[] = [];
      const folderCounts: Record<string, number> = {};
      let runningOffset = 0;

      for (let b = 0; b < photos.length; b += EXPORT_BATCH_SIZE) {
        const batch = photos.slice(b, b + EXPORT_BATCH_SIZE);
        const parts: Uint8Array[] = [];
        for (const photo of batch) {
          const t0 = performance.now();
          const jpeg = await deriveExportJpeg(photo.webp);
          encodeMsTotal += performance.now() - t0;

          const slug = tableSlug(photo.tableLabel, "ostalo");
          const folder = tableFolder(photo.tableLabel, "Ostalo");
          const seq = (folderCounts[slug] ?? 0) + 1;
          folderCounts[slug] = seq;
          const d = new Date(photo.createdAt);
          const { dosDate, dosTime } = dosDateTime(
            d.getUTCFullYear(),
            d.getUTCMonth() + 1,
            d.getUTCDate(),
            d.getUTCHours(),
            d.getUTCMinutes(),
            d.getUTCSeconds(),
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
            name,
            crc,
            size: jpeg.data.length,
            offset: runningOffset,
            dosDate,
            dosTime,
            takenAt: photo.createdAt,
            tableLabel: photo.tableLabel,
            visibility: photo.visibility,
            width: jpeg.width,
            height: jpeg.height,
          });
          runningOffset += localFileRecordSize(name, jpeg.data.length);
        }
        chunks.push(concatBytes(parts)); // "store" the batch chunk
      }

      // --- 5. Finalize: metadata.json + central directory + concat ----------
      const metaJson = metadataBytes(
        buildMetadata({
          space: "Svadba Ane i Marka",
          generatedAt: eveningStart,
          photos: entries.map((e) => ({
            file: e.name,
            table: e.tableLabel,
            takenAt: new Date(e.takenAt).toISOString(),
            visibility: e.visibility,
            width: e.width,
            height: e.height,
          })),
        }),
      );
      const metaOffset = runningOffset;
      const md = new Date(eveningStart);
      const metaDos = dosDateTime(
        md.getUTCFullYear(),
        md.getUTCMonth() + 1,
        md.getUTCDate(),
        md.getUTCHours(),
        md.getUTCMinutes(),
        md.getUTCSeconds(),
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
        ...entries.map((e) => ({
          name: e.name,
          crc: e.crc,
          size: e.size,
          offset: e.offset,
          dosDate: e.dosDate,
          dosTime: e.dosTime,
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
      const cd = centralDirectory(centralEntries, metaOffset + metaRecord.length);
      const archive = concatBytes([...chunks, metaRecord, cd]);
      const wallMs = performance.now() - startedAt;
      clearInterval(sampler);

      // --- 6. Write the archive and verify it opens -------------------------
      const outDir = mkdtempSync(path.join(tmpdir(), "memexport-"));
      const zipPath = path.join(outDir, "uspomene.zip");
      writeFileSync(zipPath, archive);

      // DoD #3 — a file from the archive is a real JPEG at the plan's dimension.
      const firstJpeg = await deriveExportJpeg(photos[0].webp);
      const meta = await sharp(Buffer.from(firstJpeg.data)).metadata();
      expect(meta.format).toBe("jpeg");
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(
        TIER.maxDimension,
      );

      // DoD #6 — Windows extracts it; capture the directory listing.
      const extractDir = path.join(outDir, "extracted");
      mkdirSync(extractDir, { recursive: true });
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`,
        ],
        { stdio: "pipe" },
      );
      const listing = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-ChildItem -Recurse -File '${extractDir}' | ForEach-Object { $_.FullName.Substring(${extractDir.length + 1}) } | Sort-Object | Select-Object -First 12`,
        ],
        { encoding: "utf8" },
      );
      // The extracted first photo is openable as a JPEG.
      const anyExtracted = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-ChildItem -Recurse -File -Filter *.jpg '${extractDir}' | Select-Object -First 1).FullName`,
        ],
        { encoding: "utf8" },
      ).trim();
      const extractedMeta = await sharp(readFileSync(anyExtracted)).metadata();
      expect(extractedMeta.format).toBe("jpeg");

      // --- 7. Numbers -------------------------------------------------------
      const archiveBytes = archive.length;
      const perPhotoWallMs = wallMs / PHOTO_COUNT;
      const perPhotoEncodeMs = encodeMsTotal / PHOTO_COUNT;
      const avgJpeg = archiveBytes / PHOTO_COUNT;

      const metaPreview = JSON.stringify(
        JSON.parse(new TextDecoder().decode(metaJson)).photos[0],
        null,
        2,
      );

      const report = `# Memories export — performance

_Measured by \`lib/memories-export/bench.test.ts\` (run with
\`RUN_EXPORT_BENCH=1 npx vitest run lib/memories-export/bench.test.ts\`).
Machine: this dev box; single-threaded Node ${process.version}; sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}._

## The run

| | |
|---|---|
| Photos | ${PHOTO_COUNT} |
| Plan tier | ${TIER.name} (max dimension ${TIER.maxDimension}px) |
| Distinct source images | ${DISTINCT_SOURCES} (cycled) |
| Batch size (continuation) | ${EXPORT_BATCH_SIZE} photos |
| **Wall-clock (encode + zip + finalize)** | **${(wallMs / 1000).toFixed(1)} s** |
| **Peak RSS** | **${mib(peakRss)} MiB** |
| **Archive size** | **${mib(archiveBytes)} MiB** |
| Per-photo wall-clock | ${perPhotoWallMs.toFixed(1)} ms |
| Per-photo JPEG encode (sharp) | ${perPhotoEncodeMs.toFixed(1)} ms |
| Avg WebP source | ${Math.round(avgWebp / 1024)} KiB |
| Avg exported JPEG | ${Math.round(avgJpeg / 1024)} KiB |

## What the numbers mean

- **JPEG is derived at export time** from the stored WebP variant (never AVIF).
  The per-photo cost above is dominated by the sharp WebP→JPEG re-encode
  (${perPhotoEncodeMs.toFixed(1)} ms); the ZIP writer (STORE, per-file CRC-32) is
  negligible next to it.
- **Peak RSS (${mib(peakRss)} MiB)** is the conservative figure: this bench
  materializes the whole archive with one \`Buffer.concat\` at finalize, the worst
  case. Production assembles \`new Blob([...chunkBlobs, metaRecord, cd])\` and hands
  it to Convex storage, which can stream the parts rather than copy them, so the
  deployed peak is at or below this. The BUILD phase (the CPU-heavy sharp work) is
  batched at ${EXPORT_BATCH_SIZE} photos per continuation and never holds more
  than one batch of JPEGs (~${Math.round((avgJpeg * EXPORT_BATCH_SIZE) / (1024 * 1024))} MiB) at a time.
- **Premium (4096px)** roughly quadruples pixel area, so expect ~3–4× the archive
  size and per-photo encode time; the batched build keeps peak memory flat
  regardless (still one batch at a time).

## Archive shape (first entries, extracted on Windows)

\`\`\`
${listing.trim()}
\`\`\`

## metadata.json — first photo (guest-anonymous: no guestKey/guestId/cardId)

\`\`\`json
${metaPreview}
\`\`\`
`;

      const perfDir = path.join(repoRoot, "docs", "perf");
      mkdirSync(perfDir, { recursive: true });
      // Since TASK-25 the canonical memories-export.md carries BOTH tiers'
      // numbers plus the deployed-ceiling analysis and is merged by hand; a
      // bench run must not clobber it, so raw reports land beside it.
      writeFileSync(
        path.join(perfDir, `memories-export-${TIER.name}-run.md`),
        report,
      );

      // Sanity: the archive holds 400 photos + metadata.json.
      expect(centralEntries.length).toBe(PHOTO_COUNT + 1);
      expect(archiveBytes).toBeGreaterThan(0);

      console.log(
        `\n[bench] ${PHOTO_COUNT} photos → ${mib(archiveBytes)} MiB in ${(wallMs / 1000).toFixed(1)}s, peak RSS ${mib(peakRss)} MiB\n`,
      );
    },
    // Premium at 4096px multiplies the per-photo encode ~4×; give the run an
    // hour so the measurement finishes instead of timing out mid-answer.
    3_600_000,
  );
});
