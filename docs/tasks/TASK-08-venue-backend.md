# TASK-08 — Venue backend: event lifecycle, draft/publish, public query

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md` — especially the wall-clock rule and the bulk/scheduler patterns
3. `docs/architecture/RFC-001-venue-memories.md` — §1.d, §2.1, §2.2, §2.3, §2.4 C.1/C.2/C.3, §2.9
4. `convex/scanMeLinks.ts` — `publishDraft` (~1643–1737) and `publicLinksView` (~554–615) as the
   contract precedent
5. `lib/venue-blocks.ts` and `convex/lib/venueValidators.ts` — what TASK-07 built

## What this task is

The **write and read backend** for Venue: the event lifecycle state machine, the draft/publish
contract for venue configs, and the public query that a page will later render.

**No React. No components. No routes. Not one `.tsx` file.** Rendering is TASK-09, the editor is
TASK-10. Everything here must be provable with `convex-test`, no browser.

## Standing constraints (unchanged, non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/` must show **no new change**. Do not
  open `components/**`. Do not touch `convex/scanMeLinks.ts`, `lib/scanme-links*.ts`,
  `lib/scanme-palette.ts`, or `convex/lib/scanMeDesignValidators.ts` — read them, learn the
  pattern, copy it into new files.
- **Zero golden changes.** Never run `harness:capture`. Never edit a golden.

---

## STEP 1 — The lifecycle state machine (RFC §2.2)

`draft → scheduled → live → ended → archived`, in `convex/venue.ts`.

- **draft → scheduled**: validates `startsAt < endsAt`, no overlap with another scheduled/live
  event of the same business, and a published config revision. Cancels any prior scheduled
  functions (`ctx.scheduler.cancel`), bumps `lifecycleRevision`, schedules
  `internal.venue.goLive` at `startsAt` and `internal.venue.endEvent` at `endsAt`
  (`ctx.scheduler.runAt`), storing both ids on the doc.
- **scheduled → live** and **live → ended**: scheduler-run internal mutations, **idempotent** —
  each no-ops unless `lifecycleRevision` matches what it was scheduled with **and** the status is
  the expected predecessor. This is the `expectedDraftRevision` OCC idea applied to time.
  `goLive` additionally asserts no other live event exists for the business
  (`by_businessId_and_status`).
- **ended → archived**: manual owner action; writes the selected media list to
  `eventArchiveItems` and sets `archivedAt`.
- **Wall-clock discipline, non-negotiable:** public queries read only the materialized `status` —
  never `Date.now()`. Reading the clock in a query is forbidden by the Convex guidelines.
- **Reconcile cron**: every 15 minutes, sweep `by_status_and_startsAt` and `by_status_and_endsAt`
  for flips the scheduler missed. Add it to the existing `convex/crons.ts` alongside the
  entitlement-expiry sweep.

`duplicateEvent`: copies a source config's `published*` into the new config's `draft*` and stamps
`duplicatedFromEventId`. This is the "change only what is event-specific" flow the owner uses
every week.

## STEP 2 — The draft/publish contract (RFC §1.d, §2.4)

Follow the audited contract exactly, and fix the flaw the audit found:

- The quartet `hasUnpublishedChanges` / `draftRevision` / `publishedRevision` / `publishedAt`.
- Draft writers bump `draftRevision` and set the dirty flag.
- `publishDraft` takes `expectedDraftRevision`, throws on mismatch, validates, copies
  `draft* → published*`, sets `publishedRevision = draftRevision`, clears the flag, stamps
  `publishedAt`. Because blocks are an embedded array, publish is **one OCC-guarded patch** — no
  per-row loop, no partial state.
- **`publishDraft` is the ONLY writer of `published*`.** ScanMe Links has three out-of-band
  writers (RFC §1.d); Venue must not inherit that ambiguity. State in your report that you
  verified no other function writes a `published*` field.
- Public queries read `published*` exclusively and never return draft data.

`saveDraft` normalizes on write using `clamp` / `clampBlocks` from `lib/venue-blocks.ts` —
exactly the way `normalizeDesignForPreset` normalizes for Links. Never trust client input.

## STEP 3 — Access and entitlement gates (RFC §2.9)

- Editor mutations go through `requireServiceEditorAccess(ctx, profile, ["scanme_venue"])`.
- Public queries are unauthenticated but return published data only.
- The Venue plan's `allowedBlockKeys` is enforced in the same transaction as the gated write, at
  both `saveDraft` and `publishDraft`, via `getEntitlement`. A client never transmits its own
  limits. Venue tiers are still an open question (RFC §5 Q1) — implement the **gate**, and if the
  catalog leaves `allowedBlockKeys` unset for a tier, treat that as "all blocks allowed" and say
  so in your report.

## STEP 4 — Public queries

- `publicVenueView(businessSlug)` — resolves the business, finds its single `live` event via
  `by_businessId_and_status`, returns the published config. Returns null when there is no live
  event, so the route can render the pre/ended state or 404.
- `publicEventView(businessSlug, eventSlug)` — a specific event by
  `by_businessId_and_slug`.
- `archivedEvents(businessSlug)` — the archive list via `by_businessId_and_startsAt`, archived
  only, newest first, with each event's `eventArchiveItems`.

Return shapes must be render-ready view models — the route should not have to reshape anything.
`"arhiva"` is a reserved event slug (RFC §2.7); enforce it.

## STEP 5 — Tests (`convex-test`)

- Full walk `draft → scheduled → live → ended → archived`.
- A stale `lifecycleRevision` flip **no-ops**.
- `goLive` rejects a second live event for the same business.
- Rescheduling cancels the previous scheduled functions and schedules new ones.
- `publishDraft` throws on a mismatched `expectedDraftRevision`.
- `saveDraft` clamps a 40-block payload down to 30 and clamps out-of-range numerics.
- `publicVenueView` returns published data and **never** draft data — assert on a config whose
  draft differs from its published state.
- The entitlement gate rejects a block key outside the plan's allow-list.
- An event slugged `arhiva` is rejected.

---

## Do not touch

`components/**`, `app/**`, `convex/scanMeLinks.ts`, `convex/lib/scanMeDesignValidators.ts`,
`lib/scanme-links*.ts`, `lib/scanme-palette.ts`, `lib/scanme-color-science.ts`, `globals.css`,
`harness/goldens/**`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/` shows **no change beyond what was already
   uncommitted before this task** — state the before/after explicitly.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. **Zero `.tsx` files created or modified by this task** — state this explicitly.
4. `npx convex deploy` (or `npx convex dev --once`) succeeds.
5. `npm run check` green; `npm run test` green with existing suites unchanged.
6. Every Step 5 test exists and passes — list them.
7. Explicit confirmation that `publishDraft` is the only writer of any `published*` field on
   `venueEventConfigs`, and how you verified it.
8. No query anywhere in `convex/venue.ts` reads the wall clock — state how you verified it.

Report in plain language: the lifecycle transitions and their guards, how the entitlement gate
behaves when a tier has no `allowedBlockKeys`, the test list, the outputs above, and every
assumption you made.
