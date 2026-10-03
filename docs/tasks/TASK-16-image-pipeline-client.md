# TASK-16 — The client image pipeline: decode, downscale, queue

**Mode:** goal · **Model:** Fable · **Effort:** max · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `docs/architecture/RFC-001-venue-memories.md` — §2.8, §2.9, risk #2, risk #5
3. `convex/memories.ts` — `reserveUpload` and the quota model
4. `convex/memoriesPipeline.ts`, `app/api/m/[code]/process/route.ts`,
   `lib/memories-pipeline/transform.ts` — the server half TASK-15 built

## What this task is

Everything that happens **in the guest's browser** before the photo reaches the server: decoding
whatever the phone produced, shrinking it, and getting it uploaded over a bad hall network without
losing it.

**This is a headless module plus a dev harness — not the guest page.** The designed guest
experience is TASK-17. Build the mechanism and a bare `/dev` page that exercises it; make no
design decisions about the real screen.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links components/admin` must
  print **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- `/dev/*` keeps its production-404 behaviour.
- Every string through the i18n layer. No hardcoded Serbian.

---

## STEP 0 — Fix the reservation trap (do this first)

A quota slot is consumed the moment `reserveUpload` succeeds. So: a guest picks three photos, two
uploads stall when the phone locks, and the guest is now told they have used their quota — for
photos that never arrived. The stale rows are only reaped after 24 hours. That is a broken product
on a wedding night.

Two changes, both server-side, both small:

1. **A retry must reuse the same `photoId`** and never call `reserveUpload` again. Make the
   contract explicit in the module and enforce it: re-uploading against an existing `reserved` or
   `processing` row is legal; a second reservation for the same intended photo is a bug.
2. **Add `releaseReservation`** — a guest-key-gated mutation that frees a `reserved` row
   immediately when the client gives up. Only the owning guest, only a `reserved` row that has no
   committed asset. Cover it with a test, including that it cannot free someone else's slot.

## STEP 1 — Decode

Accept whatever a phone hands over. Note the reality before you build: on iOS, a photo picked
through `<input type="file" accept="image/*">` is usually **already transcoded to JPEG by the
system**. HEIC arrives mainly from the Files app and some in-app browsers. So a WASM HEIC decoder
is a **fallback path, not the common path** — load it lazily and only when the bytes actually turn
out to be HEIC. Do not ship a megabyte of WASM to every guest for a case most will never hit.

Detect by content, not by file extension or MIME — phones lie about both.

Reject non-images clearly and early, in the guest's language.

## STEP 2 — Downscale and encode

- Downscale to the plan's `maxImageDimension`, fetched from the server. Never hardcode it.
- Encode a **fast JPEG** (quality around 0.85). **No AVIF on the client** — encoding is
  seconds-per-image on a mid-range Android, and support for encoding is uneven. **No watermark on
  the client** — a client-drawn mark is trivially stripped, and the server already applies both.
- State plainly in a comment: the client's shrink is **bandwidth UX only**. The server re-clamps
  unconditionally, so nothing here is a security control.
- Preserve the pixels' correct orientation through the canvas round-trip — the server's
  `.rotate()` runs on the original EXIF, so do not hand it a file whose orientation you have
  already half-applied. Say how you handled this.

## STEP 3 — The queue, which is the whole point

**Sequential per device**, never parallel. Three photos uploading at once from one phone on a
saturated hall network share one thin pipe: all three slow down and all three time out together.
One at a time means the first two are already safe when the third fails.

Requirements:

- Retry with backoff, reusing the same `photoId` (Step 0).
- Survive the phone locking and the tab being backgrounded — this is the normal case, not an edge
  case. Say what actually happens on iOS when the tab is suspended mid-upload, and how the queue
  recovers when it resumes.
- After a definitive failure, call `releaseReservation` so the guest gets their slot back
  immediately.
- Emit progress and state per item — `queued`, `uploading`, `processing`, `ready`, `failed` — so
  TASK-17 can render honestly. **Never report success before the server commit confirms it.** A
  guest who is told "saved" and finds nothing later is worse than one who sees a retry button.
- If the guest navigates away with items in flight, warn them.

## STEP 4 — The dev harness

A bare page under `/dev` that picks files, runs the pipeline, and prints per-item state,
byte sizes before and after, and elapsed time. No design work — this exists to make the mechanism
observable and to let you test on a real phone.

## STEP 5 — Tests and real-device verification

- Unit: content-based format detection, including a HEIC byte signature and a mislabelled file.
- Unit: downscale respects the server's dimension; a small image is not enlarged.
- Unit: the queue runs strictly sequentially; a failure retries the same `photoId`; a definitive
  failure calls `releaseReservation`.
- convex-test: `releaseReservation` frees the slot, refuses another guest's row, and refuses a row
  that already committed.
- **On a real phone**, over a throttled connection: upload three photos, lock the screen mid-upload,
  unlock, and report exactly what happened. If it does not recover, fix it and say what you changed.

---

## Do not touch

`components/scanme-links/**`, `components/admin/**`, `convex/scanMeLinks.ts`,
`lib/scanme-links*.ts`, `lib/scanme-palette.ts`, `harness/goldens/**`, `app/[slug]/**`,
`lib/memories-pipeline/transform.ts` (the server transform is settled), `globals.css`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links components/admin` prints nothing.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. **No guest-page design work** — the only new UI is the `/dev` harness. State this.
4. `npm run check` green; `npm run test` green with existing suites unchanged.
5. Every Step 5 test exists and passes — list them.
6. The real-phone screen-lock test: what you did, what happened, what you changed.
7. The HEIC decoder is lazily loaded and only on actual HEIC bytes — show how.
8. Byte sizes before and after for a typical phone photo, and time to first successful upload.

Report in plain language: how format detection works and why not by extension, what the client's
shrink is and is not responsible for, how the queue survives a locked phone, how a released
reservation returns the guest's slot, the outputs above, and every assumption you made.
