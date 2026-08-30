# TASK-13 — Venue in the client panel: the owner's event workflow

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `docs/architecture/RFC-001-venue-memories.md` — §2.2 (lifecycle), §2.3, §2.4 C.1/C.3
3. `convex/clientPanel.ts` and `components/client-panel/**` — the existing panel
4. `convex/venue.ts` — the lifecycle mutations TASK-08 built

## What this task is

The surface where a business owner actually **runs** Venue week to week: sees their events,
creates the next one, duplicates last week's design, schedules it, publishes, ends it, archives it.

The editor (TASK-10) edits one event's design. This is everything around it.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links components/admin` must print
  **nothing**.
- **The existing client panel must not regress.** A business with only Links or only Google Review
  must see exactly what it sees today. `convex/clientPanel.ts`'s existing queries keep their
  current shape — extend beside them, do not rewrite them.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through the i18n layer. No hardcoded Serbian.

---

## STEP 1 — The Venue section

Inside `/{slug}/client-panel`, a Venue section that appears **only** when the business has an
active `scanme_venue` profile. A business without it sees no trace of it.

It shows:

- the current event with its lifecycle status (`draft` / `scheduled` / `live` / `ended` /
  `archived`), stated in plain Serbian, not as a raw status token;
- when it goes live and when it ends, in Europe/Belgrade;
- whether the design has unpublished changes (`hasUnpublishedChanges`);
- a link into the editor and a link to the public page;
- the past events list.

## STEP 2 — The workflow

Every action goes through the mutations TASK-08 already built — do not add new lifecycle logic
here, and do not duplicate any validation the server performs:

- **Create event** — new draft plus its empty config.
- **Duplicate previous** — `duplicateEvent`, copying the last published design into a new draft.
  This is the weekly path for a venue that runs an event every Friday; make it the obvious button,
  not something buried.
- **Schedule** — start and end datetime, Europe/Belgrade, correct across DST. The server rejects
  overlaps and demands a published config; surface those refusals as clear sentences, not raw
  errors.
- **Publish** — through `publishDraft` with `expectedDraftRevision`. On a revision mismatch, tell
  the owner someone else published and offer to reload.
- **End now** — the manual end.
- **Archive** — including choosing which photos are kept permanently for the `pastEvents` block
  (`eventArchiveItems`).

## STEP 3 — Make the state legible

The single most confusing thing about this product is the difference between *saved*, *published*
and *live*. Someone can have a published design and no scheduled event, or a live event with
unpublished edits sitting in the draft.

Design for that explicitly: at a glance the owner must know whether visitors are currently seeing
their latest work, and if not, what to press. Say in your report how you made that legible.

## STEP 4 — Quality bar

- Empty state: a business that owns Venue but has never made an event gets a clear first step, not
  a blank panel.
- Destructive actions (end now, archive) confirm and explain what happens to the public page.
- Mobile first — owners check this on a phone behind the bar.
- Verify in a browser: create → duplicate → schedule → publish → end → archive, and watch the
  public page follow along. Fix console errors before reporting done.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links components/admin` prints nothing.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. `npm run check` green; `npm run test` green with existing client-panel tests unchanged.
4. A business with only Links/Google Review sees an unchanged panel — how you verified.
5. The full browser walk-through: create → duplicate → schedule → publish → end → archive, with
   what you observed at each step and what the public page did.
6. How the saved / published / live distinction is made legible — describe the design.
7. No new lifecycle logic was added outside `convex/venue.ts` — confirm.

Report in plain language: the panel's shape, how state is made legible, how server refusals are
surfaced, the outputs above, and every assumption you made.
