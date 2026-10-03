# TASK-18 — Memories provisioning and the host's control panel

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `docs/architecture/RFC-001-venue-memories.md` — §2.1.6 (celebrations and tenancy), §2.3,
   §2.4 C.4/C.5/C.9/C.15/C.16
3. `convex/venueAdmin.ts` and `components/admin/venue-admin.tsx` — the provisioning pattern to
   follow
4. `components/client-panel/venue-panel-section.tsx` — the panel pattern to follow
5. `convex/memories.ts`, `convex/memoriesDevSeed.ts`

## The gap this closes

Memories works end to end for a guest — card, identity, quota, pipeline, upload screen — but
**nothing grants Memories to a business or a celebration**, and no host has anywhere to run it.
This is the same gap TASK-11 closed for Venue.

**The gallery and moderation are TASK-19.** This task creates the space, the cards, and the
controls around them; browsing and moderating photos comes next.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links` must print **nothing**.
  `components/admin/**` may gain a Memories admin screen and nothing else.
- **The existing client panel must not regress.** A business with only Links, Google Review or
  Venue sees exactly what it sees today. Extend beside the existing queries.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through the i18n layer. No hardcoded Serbian.

---

## STEP 1 — Provisioning, both channels

Two ways a Memories space comes into existence, per RFC §2.1.6:

**A. A venue subscription** — an existing business gets a `scanme_memories` profile and a
`recurring` space. Follow `venueAdmin.ts`'s shape exactly: admin-gated, idempotent, with a
matching deactivation path that leaves content intact.

**B. A celebration** — a wedding, birthday, christening. This is **not** a business at the
product level. Provision, in one transaction: a `businesses` row with `kind: "celebration"`, a
`celebrations` row (C.15) carrying the celebration kind, title, date, contact, acquisition
channel and — when sold by a partner — `referredByBusinessId` plus a **snapshotted**
`referralCommissionPercent` copied from the active `partnerships` row; a `scanme_memories`
profile; an entitlement; and one `one_off` space with its upload window.

It must **not** go through `admin.createBusiness` — that provisions a Links profile, a
`google_review` dynamicLink and slug machinery, none of it applicable. State the slug rule you
use for a celebration tenant.

`celebrations` and `partnerships` already exist in the schema and have never been written to.
This task is their first writer.

## STEP 2 — The admin screen

Replace whatever stands at `app/admin/memories/page.tsx` with a real screen, following
`venue-admin.tsx`:

- list Memories spaces across businesses and celebrations, with plan tier and status;
- grant a venue subscription; create a celebration through the flow above;
- deactivate;
- show each space's code and link straight to `/m/{code}`;
- for a celebration, show the acquisition channel and, when it came from a partner, the partner
  and the snapshotted commission percent.

Also a **partner view**: for a partner business, the celebrations they referred and what is owed,
using `by_referredByBusinessId_and_status` (C.15). This is what makes the hall's deal real.

## STEP 3 — Cards for the tables

A space needs printed cards. Using `convex/cards.ts` (TASK-14):

- mint a batch of cards for a space, each labelled (`Sto 1`, `Sto 2`, …), each with its own
  `cardCode` targeting that space;
- list them with their scan counts;
- disable or retarget one.

**Print-ready output is out of scope** — you are producing codes and their `/r/{code}` URLs, not
PDFs or artwork.

## STEP 4 — The host's panel section

In `/{slug}/client-panel`, a Memories section that appears **only** for a business or celebration
with an active `scanme_memories` profile:

- the current session (tonight, or the celebration's window) with photo and guest counts;
- for `recurring`, the list of past nights;
- **the two switches**: `publicGalleryEnabled` and `wallEnabled`, both default false. Explain in
  one sentence each what turning it on actually does — the host is deciding who sees guests'
  photos, and that decision must be legible.
- the upload window and, for `one_off`, the ability to extend or close it early;
- pause and resume the space;
- per-card statistics — which table has been most active;
- a link to the guest page and, once TASK-19 exists, the gallery.

## STEP 5 — Make the plan legible

Show the plan's real limits in words: photos per guest, retention days, resolution tier. A host
who bought "premium" should be able to see what they bought without asking. When a plan expires,
say what changes rather than silently degrading.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links` prints nothing; the only
   `components/admin/**` change is the Memories screen — paste the diff stat.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. `npm run check` green; `npm run test` green with existing suites unchanged.
4. convex-tests: granting twice is idempotent; a non-admin is rejected; deactivation leaves
   spaces, sessions and photos intact; a celebration is provisioned with its commission
   snapshotted and is **not** created through `admin.createBusiness`.
5. A browser walk-through you actually performed: create a celebration → mint table cards → open
   `/r/{cardCode}` on a phone or with curl → land on the guest page → upload a photo → see the
   counts move in the host panel. Report what you observed at each step.
6. A business with only Links, Google Review or Venue sees an unchanged panel — how you verified.
7. The slug rule for a celebration tenant, stated explicitly.
8. The partner view: how commission is computed and why the snapshot is used rather than the
   partnership's current percent.

Report in plain language: both provisioning paths, the slug rule, how the two visibility switches
are explained to the host, the walk-through, and every assumption you made.
