# TASK-21 — The ZIP export: handing the customer their night

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md` — actions, the scheduler, and the bulk patterns
3. `docs/architecture/RFC-001-venue-memories.md` — §2.4 C.7/C.8, §2.10 (export section)
4. `convex/memoriesPipeline.ts` and `lib/memories-pipeline/transform.ts` — what variants exist
5. `convex/lib/storage.ts`

## Why this matters

The couple paid for this. The gallery is where they look; **the ZIP is what they keep.** It is the
last thing the product does for them and the thing they will still have in ten years.

The host panel already promises it — the button says *"Preuzmi sve (ZIP) · Uskoro"*. This task
makes it real.

---

## STEP 0 — The format decision, and it is not AVIF

The pipeline stores AVIF as the primary and WebP as the fallback. **Neither belongs in a
downloadable archive.**

A couple takes that ZIP to a print shop, or opens it in Windows Photo Viewer, or hands it to a
photographer — and AVIF fails or renders inconsistently in a lot of that world. An archive of
files your customer cannot open is worse than no archive.

**The export contains JPEG.** Decide and report how you produce it:

- derive JPEGs at export time from the largest stored variant, or
- keep a JPEG derivative at pipeline time for photos in spaces likely to export.

Weigh the cost either way — CPU at export versus storage forever — and say which you chose and
why. Whatever you choose, the exported image is the **largest quality the plan allows**, with the
watermarks already burned in from the original transform.

Note honestly in your report: the originals are deleted after processing (TASK-15), so the export
can never contain untouched camera files. If that is wrong for the product, say so — do not
silently pretend otherwise.

## STEP 1 — An asynchronous job, because it must be

Four hundred photos is hundreds of megabytes. This cannot happen inside a request.

- A host-triggered mutation creates an export **job row** and schedules the work.
- The job streams photos in batches with `ctx.scheduler.runAfter(0, …)` continuations — never one
  giant action, never an unbounded `.collect()`.
- Progress is visible to the host: queued → building (with a count) → ready → failed.
- The finished archive lands in storage with a **download link that expires**, and the job row
  records when.
- A failed job says why, in Serbian, and can be retried without starting a duplicate.
- Two exports of the same session at once must not both run — dedupe on the job row.

## STEP 2 — What is in the archive

- Every `ready` photo the host is entitled to. **Deletions win**: a photo tombstoned while the job
  runs must not appear in the finished archive. State how you guarantee that.
- Sensible filenames: date, time and table — `2026-08-27_2149_sto-04_01.jpg`. Not opaque ids. The
  filenames are the only structure most people will ever get.
- Folders by table when the space has cards, so `Sto 4` is a directory. A flat pile of 400 files
  is not a gift.
- A `metadata.json`: per photo the table, timestamp, visibility, and dimensions. For anyone who
  wants to do something with it later.
- **Guests stay anonymous.** No `guestKey`, no identifier that survives outside the event.

## STEP 3 — Where the host finds it

- The button in the host panel stops saying "Uskoro" and starts working.
- While building, it shows progress rather than pretending to be idle.
- Past exports are listed with their date and whether the link is still valid.
- Say plainly how long the link lives and what happens after.

## STEP 4 — Retention interaction

The export is a snapshot, not a backup:

- An archive built before a retention sweep still contains photos the sweep later deleted. Decide
  whether the export link survives the sweep, state the decision, and make the UI honest about it.
- A **guest wipe must also reach exports** where it reasonably can — at minimum, say what happens
  to an already-built archive containing a wiped guest's photo, and make the answer defensible
  under §2.10 rather than convenient.

## STEP 5 — Measure it, and write the number down

Build an export for a **400-photo session**. Record: wall-clock time, peak memory, archive size,
and the per-photo cost.

**Write these into `docs/perf/memories-export.md`**, not only into your report. Measurements that
live only in a chat transcript are lost the moment the session closes. If a
`docs/perf/` note already exists for the gallery, add to it.

---

## Standing constraints

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links` must print **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through the i18n layer. No hardcoded Serbian.
- Host-or-admin gated. A guest key must never reach an export.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links harness/goldens` prints nothing.
2. `npm run check` green; `npm run test` green with existing suites unchanged.
3. The export contains **JPEG**, at the plan's maximum quality, watermarked — verify by opening a
   file from a real archive and reporting its format and dimensions.
4. A 400-photo export completes; the measurements are in `docs/perf/memories-export.md`.
5. Tests: a photo tombstoned mid-job is absent from the archive; two concurrent exports do not
   both run; a failed job retries without duplicating; a non-host cannot trigger or download.
6. Filenames and folders as specified — paste the archive's directory listing.
7. `metadata.json` carries no guest identifier — how you verified.
8. The retention and guest-wipe interactions, decided and stated.

Report in plain language: how you produce JPEGs and what it costs, how deletions are guaranteed to
win, the measured numbers, the retention decision and why it is defensible, and every assumption
you made.
