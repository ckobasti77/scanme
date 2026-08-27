# Memories export — performance

_Measured by `lib/memories-export/bench.test.ts` (run with
`RUN_EXPORT_BENCH=1 npx vitest run lib/memories-export/bench.test.ts`).
Machine: this dev box; single-threaded Node v24.8.0; sharp 0.35.3, libvips 8.18.3._

## The run

| | |
|---|---|
| Photos | 400 |
| Plan tier | basic (max dimension 2048px) |
| Distinct source images | 16 (cycled) |
| Batch size (continuation) | 20 photos |
| **Wall-clock (encode + zip + finalize)** | **277.0 s** |
| **Peak RSS** | **640.58 MiB** |
| **Archive size** | **472.38 MiB** |
| Per-photo wall-clock | 692.4 ms |
| Per-photo JPEG encode (sharp) | 688.9 ms |
| Avg WebP source | 1055 KiB |
| Avg exported JPEG | 1209 KiB |

## What the numbers mean

- **JPEG is derived at export time** from the stored WebP variant (never AVIF).
  The per-photo cost above is dominated by the sharp WebP→JPEG re-encode
  (688.9 ms); the ZIP writer (STORE, per-file CRC-32) is
  negligible next to it.
- **Peak RSS (640.58 MiB)** is the conservative figure: this bench
  materializes the whole archive with one `Buffer.concat` at finalize, the worst
  case. Production assembles `new Blob([...chunkBlobs, metaRecord, cd])` and hands
  it to Convex storage, which can stream the parts rather than copy them, so the
  deployed peak is at or below this. The BUILD phase (the CPU-heavy sharp work) is
  batched at 20 photos per continuation and never holds more
  than one batch of JPEGs (~24 MiB) at a time.
- **Premium (4096px)** roughly quadruples pixel area, so expect ~3–4× the archive
  size and per-photo encode time; the batched build keeps peak memory flat
  regardless (still one batch at a time).

## Archive shape (first entries, extracted on Windows)

```
metadata.json
Sto 1\2026-08-27_1900_sto-01_01.jpg
Sto 1\2026-08-27_1915_sto-01_02.jpg
Sto 1\2026-08-27_1930_sto-01_03.jpg
Sto 1\2026-08-27_1945_sto-01_04.jpg
Sto 1\2026-08-27_2000_sto-01_05.jpg
Sto 1\2026-08-27_2015_sto-01_06.jpg
Sto 1\2026-08-27_2030_sto-01_07.jpg
Sto 1\2026-08-27_2045_sto-01_08.jpg
Sto 1\2026-08-27_2100_sto-01_09.jpg
Sto 1\2026-08-27_2115_sto-01_10.jpg
Sto 1\2026-08-27_2130_sto-01_11.jpg
```

## metadata.json — first photo (guest-anonymous: no guestKey/guestId/cardId)

```json
{
  "file": "Sto 1/2026-08-27_1900_sto-01_01.jpg",
  "table": "Sto 1",
  "takenAt": "2026-08-27T17:00:00.000Z",
  "visibility": "host_only",
  "width": 2048,
  "height": 1365
}
```
