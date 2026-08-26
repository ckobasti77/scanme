# TASK-15 — The server image pipeline: sharp, watermarks, AVIF

**Mode:** goal · **Model:** Fable · **Effort:** max · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. The Next.js 16 docs under `node_modules/next/dist/docs/` for route handlers and runtimes
3. `docs/architecture/RFC-001-venue-memories.md` — §2.4 C.7/C.8, §2.8, §2.9, §2.10, risk #2
4. `convex/memories.ts` — `reserveUpload` and the quota model TASK-14 built
5. `convex/lib/entitlements.ts`, `convex/lib/plans.ts`

## What this task is

Everything that happens to a photo **after** the browser hands it over: EXIF stripping, the two
watermarks, AVIF + WebP + thumbnail, storage, and the commit that makes it visible.

**No browser code.** No HEIC decoding, no client downscale, no upload queue, no React, no gallery.
That is TASK-16 (client) and TASK-17 (guest UI). This task must be provable by POSTing a fixture
image to the route.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links components/admin` must
  print **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through the i18n layer. No hardcoded Serbian.

---

## STEP 1 — Where sharp runs, and why

Per RFC §2.8: **sharp runs in a Next.js route handler on the Node runtime, not in a Convex
`"use node"` action.** Convex node actions can carry sharp, but it is the fragile path — libvips
native binaries must match the runtime and decoded buffers push memory near the action ceiling.
sharp on Vercel Node functions is first-class.

The stated cost is that the pipeline leaves Convex's transactional world. The reserve→commit
protocol in Step 3 is what keeps the database authoritative anyway. Say in your report that you
understand this trade and how the protocol mitigates it.

`app/api/m/[code]/process/route.ts`. Note the body-size question is already solved: the browser
PUTs the image **directly to Convex storage**, and this route receives only
`{ photoId, storageId }` — no large body ever reaches the function.

## STEP 2 — The transform, in this exact order

1. **Load and auto-orient.** Call sharp's `.rotate()` with no argument *before* stripping
   metadata, so the EXIF orientation is baked into the pixels. Strip metadata first and every
   portrait photo from an iPhone lands sideways — this is the single most common bug in this kind
   of pipeline.
2. **Strip EXIF entirely**, including GPS. A wedding photo carrying the venue's coordinates is a
   privacy leak, and RFC §2.10 commits us to not storing it.
3. **Clamp dimensions server-authoritatively** to the entitlement's `maxImageDimension`
   (2048 / 2560 / 4096 by tier). The client's own downscale is bandwidth UX only — re-clamp here
   unconditionally so no client can exceed its plan.
4. **Watermarks**, per the settled spec:
   - ScanMe logo, **bottom-right**, width **8% of the image width**, **70% opacity**, with a
     subtle shadow so it stays legible on a light photo.
   - The business logo, **bottom-left**, same treatment. **Skipped entirely when the business has
     no logo** — never substitute text.
   - Both scale with the image, so they read the same on a 2048px and a 4096px render.
5. **Encode**: AVIF as the primary, WebP as the fallback for iOS 15 and older, plus a thumbnail
   for grid views. AVIF encoding is CPU-heavy — choose quality and effort deliberately and
   **report the measured time per image**, because this runs 200 times in an hour at a wedding.

Store all three through the `convex/lib/storage.ts` wrapper, never by calling storage directly
from the pipeline.

## STEP 3 — The reserve → commit protocol

This is what keeps the database authoritative while the transform runs outside it:

1. `reserveUpload` (TASK-14) already returns a `photoId` and a Convex upload URL.
2. The browser PUTs the original, then calls this route with `{ photoId, storageId }` plus its
   guest cookie.
3. The handler verifies the cookie HMAC, then fetches an **upload context** from Convex
   (secret-gated): validates the photo is still `reserved` and owned by this guest, and returns
   `maxImageDimension` plus the business logo URL. Never trust the client for either.
4. It runs the transform, writes the three variants, then calls the **secret-gated commit
   mutation**, which in one transaction inserts `mediaAssets`, flips the photo to `ready`, deletes
   the original blob, and increments the rollups.

Requirements:

- `SCANME_PIPELINE_SECRET`, declared in `convex/convex.config.ts` and documented in
  `.env.example`. It lives only in server env, never reaches the client, and is rotatable.
- **The commit is idempotent per `photoId`** — a retried call must not create a second
  `mediaAssets` row.
- **The commit validates the photo's state machine, not just the secret.** A leaked secret must
  still not be able to inject an asset onto a photo that was never reserved.
- Only `ready` photos with a `mediaAssets` row can ever reach a gallery.

## STEP 4 — Reaping what fails

Extend the purge cron from TASK-14: sweep `reserved` and `processing` rows older than 24 hours
along with their orphaned original blobs. A crash between transform and commit must cost storage
for one day, not forever.

## STEP 5 — Tests, with real image fixtures

Commit small fixture images and assert on the **actual output bytes**, not on the code path:

- A JPEG carrying **GPS EXIF** → the outputs contain no EXIF at all, and specifically no GPS.
- A **portrait photo with EXIF orientation 6** → the output is upright, proving `.rotate()` ran
  before the strip.
- An oversized image → output respects the tier's `maxImageDimension`; run it at two tiers.
- A business **with** a logo → both watermarks present. A business **without** → only the ScanMe
  one, and no text stand-in.
- AVIF, WebP and thumbnail are all produced, and the `mediaAssets` row records real dimensions and
  byte sizes.
- The commit called twice creates one `mediaAssets` row.
- A commit for a photo that is not `reserved` is rejected even with a valid secret.
- A stale `processing` row and its orphan blob are reaped by the sweep.

Report the measured encode time per image and the output sizes for a typical phone photo.

---

## Do not touch

`components/**`, `convex/scanMeLinks.ts`, `convex/lib/scanMeDesignValidators.ts`,
`lib/scanme-links*.ts`, `lib/scanme-palette.ts`, `harness/goldens/**`, `app/[slug]/**`,
`globals.css`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links components/admin` prints nothing.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. **Zero browser-side image code** — no HEIC decode, no client downscale, no upload queue, no
   React. State this explicitly.
4. `npm run check` green; `npm run test` green with existing suites unchanged.
5. Every Step 5 assertion exists and passes, asserted on real output bytes — list them.
6. Measured AVIF/WebP encode time per image, and output sizes for a typical phone photo.
7. The commit is idempotent and state-machine-validated — show the test.
8. `SCANME_PIPELINE_SECRET` never reaches the client — how you verified.

Report in plain language: the transform order and why `.rotate()` comes first, the watermark
geometry, the encode settings you chose and the measured cost, how the reserve→commit protocol
survives a crash, the outputs above, and every assumption you made.
