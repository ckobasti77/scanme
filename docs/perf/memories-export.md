# Memories export — performance

_Measured by `lib/memories-export/bench.test.ts`. Basic run:
`RUN_EXPORT_BENCH=1 npx vitest run lib/memories-export/bench.test.ts`; premium
run adds `EXPORT_BENCH_TIER=premium` (raw report lands in
`memories-export-premium-run.md`; the numbers are merged here).
Machine: this dev box; single-threaded Node v24.8.0; sharp 0.35.3, libvips 8.18.3._

## The runs — basic (TASK-21) and premium (TASK-25 Step 0 item 6)

| | basic | premium |
|---|---|---|
| Photos | 400 | 400 |
| Max dimension | 2048 px | 4096 px |
| Source long edge | 3000 px | 6000 px (clamp must bind) |
| Distinct source images | 16 (cycled) | 16 (cycled) |
| Batch size (continuation) | 20 | 20 |
| **Wall-clock (encode + zip + finalize)** | **277.0 s** | **1202.4 s (20.0 min)** |
| **Peak RSS** | **640.58 MiB** | **2247.95 MiB** |
| **Archive size** | **472.38 MiB** | **1886.1 MiB** |
| Per-photo wall-clock | 692.4 ms | 3005.9 ms |
| Per-photo JPEG encode (sharp) | 688.9 ms | 2992.2 ms |
| Avg WebP source | 1055 KiB | 4232 KiB |
| Avg exported JPEG | 1209 KiB | 4828 KiB |

The premium numbers confirmed the ~4× prediction: 4× pixel area → 4.3× encode
time, 4.0× archive size. The bench itself passed — on a dev box with gigabytes
of RAM. That is exactly the wrong comfort, see below.

## The deployed ceiling (the TASK-25 finding)

The BUILD phase is safe at every tier: one batch of 20 JPEGs per action
invocation (~24 MiB basic, ~94 MiB premium), CPU ~60 s per premium batch —
far inside the action limits. **FINALIZE is not.** The finalize action
(`convex/memoriesExportWorker.ts`, `finalizeExport`) fetches EVERY chunk blob
of the archive into one action's memory, assembles the `Blob`, and stores it.
Convex `"use node"` actions run with a documented **512 MiB memory limit** —
the dev box's 2.2 GiB peak does not exist there.

Residency at finalize ≈ archive size (all chunk fetches) plus the assembled
blob if the runtime copies parts (conservatively ×2), plus baseline overhead:

| Tier | Avg photo | Safe archive ≈ 200–400 MiB ⇒ photo ceiling |
|---|---|---|
| basic (2048 px) | ~1.2 MiB | **~170–330 photos** |
| standard (2560 px) | ~1.9 MiB (scaled) | **~105–210 photos** |
| premium (4096 px) | ~4.8 MiB | **~40–80 photos** |

Consequences, stated plainly:

- **A full premium night cannot be exported today.** A premium celebration is
  up to 10 photos/guest; a 100-guest wedding plausibly produces 300–600
  photos ≈ 1.5–3 GiB of archive. Finalize will OOM at roughly the 40–80-photo
  mark's archive equivalent. There is no partial output — the job fails.
- **Even the measured basic scenario (400 photos, 472 MiB) is at or beyond the
  deployed ceiling.** The 400-photo basic export has been proven only on this
  bench, never in anger on the deployed runtime. Treat "export works" as
  proven for archives ≲ 200 MiB and unproven above that.
- **What the host should be told** (until the fix ships): the ZIP export is
  reliable for a small-to-mid night — up to roughly 150 photos on basic, 100
  on standard, 50 on premium. Beyond that the job may fail without output;
  the photos themselves are safe and stay in the gallery.
- **The known fix** is a finalize that never holds the whole archive: stream
  the ZIP through an HTTP action response, or emit multi-part archives capped
  at ~150 MiB each. Deliberately not built in TASK-25 (no new product
  surface, no infra change); it is the first engineering task if Memories
  premium sells.

## The format decision (TASK-25 Step 0 item 7): JPEG stays

The export re-encodes the stored lossy WebP (q78) to JPEG (q90, mozjpeg) —
a second lossy generation that is measurably **bigger and worse** than its
source at both tiers (basic 1055→1209 KiB, premium 4232→4828 KiB). Shipping
the WebP bytes verbatim would be smaller, bit-faithful to what we store, and
would delete the entire encode cost (≈ 3 s/photo at premium — the whole
20-minute build).

**Decision: the export keeps shipping JPEG.** The reasons, so the next reader
does not re-litigate it from the size table alone:

- The export's one promise is the panel copy: photos "u punoj rezoluciji,
  spremne za štampu". Print kiosks and every viewer on any device accept JPEG
  unconditionally; WebP is still refused by enough print workflows that
  handing a host a WebP folder breaks the promise exactly when it matters.
- The size inversion is expected codec behavior (JPEG is the weaker coder),
  not a bug; the quality ceiling was set at the pipeline's WebP q78 and the
  q90 re-encode preserves it to a visually negligible degree.
- Reversal triggers: (a) finalize gets its streaming fix and the premium
  encode time becomes the binding constraint, or (b) print acceptance of WebP
  stops being a gamble. Then ship WebP with `.webp` names — the ZIP writer
  needs only the extension changed (`lib/memories-export/filename.ts`), and
  width/height can come from `mediaAssets.variants.webp` with no decode.

## What the numbers mean (mechanics, unchanged from TASK-21)

- **JPEG is derived at export time** from the stored WebP variant (never
  AVIF). The per-photo cost is dominated by the sharp re-encode; the ZIP
  writer (STORE, per-file CRC-32) is negligible next to it.
- **Peak RSS** in the bench is conservative for the BUILD phase (it keeps all
  chunks in an array and does one whole-archive concat at finalize) — but see
  "the deployed ceiling" above: deployed finalize has the same
  whole-archive-in-memory shape with a 512 MiB budget, so the bench's comfort
  does not transfer.

## Archive shape (first entries, extracted on Windows)

```
metadata.json
Sto 1\2026-08-27_1900_sto-01_01.jpg
Sto 1\2026-08-27_1915_sto-01_02.jpg
Sto 1\2026-08-27_1930_sto-01_03.jpg
Sto 1\2026-08-27_1945_sto-01_04.jpg
Sto 1\2026-08-27_2000_sto-01_05.jpg
```

## metadata.json — first photo (guest-anonymous: no guestKey/guestId/cardId)

```json
{
  "file": "Sto 1/2026-08-27_1900_sto-01_01.jpg",
  "table": "Sto 1",
  "takenAt": "2026-08-27T17:00:00.000Z",
  "visibility": "host_only",
  "width": 4096,
  "height": 2731
}
```
