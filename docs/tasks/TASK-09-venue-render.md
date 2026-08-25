# TASK-09 — Venue rendering: template, 12 block renderers, public routes

**Mode:** goal · **Model:** Fable · **Effort:** xhigh · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md` — **including the "Design and UX process" section**
2. The relevant Next.js 16 docs under `node_modules/next/dist/docs/` before writing any route
3. `docs/architecture/RFC-001-venue-memories.md` — §2.2, §2.5, §2.7, §2.12
4. `convex/venue.ts` — the view models TASK-08 returns
5. `lib/venue-blocks.ts`, `lib/design-engine/**`, `lib/i18n/**`

## Use the design skills

`AGENTS.md` prescribes an order for UI work: **Taste → UI UX Pro Max → Frontend Design**. Use
whichever of those are actually available in your environment, and say in your report which you
used. Never claim to have used one that was not available.

This is the first thing a paying customer will see. A correct-but-ugly Venue page is a failed
task. Before writing components, state the audience, the page's single job, and the intended
visual direction, then design to it.

## What this task is

The Venue **render layer**: the template, all twelve block renderers, and the public routes.

**No editor.** That is TASK-10. Build no panels, no drag-and-drop, no autosave.

## Standing constraints (unchanged, non-negotiable)

- **ScanMe Links is frozen.** Do not open `components/scanme-links/**` or `components/admin/**`.
  `git diff --stat components/scanme-links components/admin` must print **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- **Namespace:** emit `--venue-*` only. No `--links-` string may appear under `components/venue/**`.
  `harness:namespace` must stay green — it now has a real directory to police.

---

## STEP 1 — Template and registry

- `components/venue/venue-template.tsx` — the root. Applies the `--venue-*` custom properties via
  `createTokenCompiler("venue")` (TASK-06/07), renders the background through the engine's
  `backgroundPresentation`, and lays out the ordered block array. Its own CSS module — no shared
  stylesheet with Links, ever.
- `components/venue/blocks/registry.tsx` — `{ type, Render, label, icon }` per block type. The
  `EditorPanel` entry the RFC describes is **not** built here; leave the registry shape ready for
  it and say so.

Every block wrapper consumes the shared base properties from `blockBaseValidator`: `visible`,
`responsive`, `size`, `alignment`, `spacing`, `radius`, `border`, `shadow`, `surface`,
`colorOverride`, `typographyOverride`, `animation`. Per-block overrides work by re-declaring the
same custom properties locally so the CSS cascade does the inheritance.

## STEP 2 — The twelve renderers

`countdown` · `eventDateTime` · `programTimeline` · `map` · `gallery` · `performerCards` ·
`menu` · `reservation` · `share` · `pastEvents` · `richText` · `spacer`

**Server Components by default.** Add `"use client"` only at the smallest leaf that needs
browser state. Only these need it: the countdown's ticking, the gallery lightbox, the share
actions, and the reservation form.

Traps to handle deliberately, and report how you handled each:

- **Countdown hydration.** A ticking clock rendered on the server and hydrated on the client is
  the classic hydration-mismatch bug. Render a stable server value, take over on the client.
  Honour `completedBehavior` (`hide` / `message`).
- **Add to calendar.** `eventDateTime` needs a Google Calendar link and a generated `.ics`.
  Timezone must be explicit — Europe/Belgrade — and correct across DST.
- **Map.** Support both `static` and `embed`. An embedded third-party iframe is a privacy and
  layout-shift risk: reserve its space, lazy-load it, and do not load it until it is needed.
- **Gallery.** `next/image` with correct `sizes`; the lightbox must trap focus, close on Escape,
  and restore focus on close.
- **Reservation.** The form needs a backend. Add a `submitReservation` mutation to
  `convex/venue.ts` writing `venueReservations` (RFC §2.4 C.14) — validated, rate-limited, and
  honouring the block's field config, capacity and deadline. This is the one backend addition
  this task may make.
- **pastEvents.** Sourced from archived events plus their `eventArchiveItems`.

## STEP 3 — Routes and lifecycle states

```
app/[slug]/venue/page.tsx            the live event — the printed card's target
app/[slug]/venue/[event]/page.tsx    a specific event (sharing, archive)
app/[slug]/venue/arhiva/page.tsx     the archived list
app/[slug]/venue/not-found.tsx       segment 404
```

Async Server Components: `const { slug } = await params` — params is Promise-only in Next.js 16.
Match the existing `app/[slug]/page.tsx` conventions.

**Three states, three designs** (RFC §2.2). `/[slug]/venue` must never 404 for a business that
owns Venue — a printed card leads here forever:

- **before** — countdown, "see you Friday", the upcoming event's content
- **live** — the event page proper
- **after** — a recap state that thanks people and, when an archive exists, shows it. This is the
  natural bridge to Memories later; leave the seam, build no Memories code.

Add OpenGraph and Twitter metadata per event — these pages get shared to Instagram and Viber, and
the preview card is part of the product.

## STEP 4 — Quality bar

- Every user-facing string through `lib/i18n/sr/venue.ts`. That dictionary is currently
  empty-but-typed; this task fills it. No hardcoded Serbian in components.
- Responsive, mobile-first. The overwhelming majority of visitors arrive by scanning a QR code on
  a phone, often one-handed, often in a dark room.
- Keyboard focus states, readable contrast, sensible heading order, `prefers-reduced-motion`
  honoured by every block animation.
- Useful empty states: a block with no items must not render a broken shell.
- Framer Motion for local transitions; GSAP only for a purposeful scroll timeline, inside a client
  component, with context cleanup. Never both for one animation.

## STEP 5 — Tests

- A render smoke: **every one of the twelve block types renders with its `defaults()` without
  throwing**, and again with an empty/minimal payload.
- `harness:namespace` green with `components/venue/**` now present.
- `submitReservation`: a convex-test for validation, the capacity cap, and the deadline.
- Verify in a browser at a mobile and a desktop width, exercise the interactive paths, and fix
  console errors before reporting done.

---

## Do not touch

`components/scanme-links/**`, `components/admin/**`, `convex/scanMeLinks.ts`,
`convex/lib/scanMeDesignValidators.ts`, `lib/scanme-links*.ts`, `lib/scanme-palette.ts`,
`harness/goldens/**`, `app/[slug]/page.tsx`, `app/[slug]/editor/**`, `globals.css`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links components/admin` prints nothing.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. `npm run check` green — includes `harness:check` and `harness:namespace`.
4. `npm run test` green; the twelve-block render smoke passes.
5. All three lifecycle states render — describe what each looks like and how you verified.
6. Screenshots or a described browser pass at mobile and desktop widths, console clean.
7. Zero hardcoded user-facing strings in `components/venue/**` — state how you verified.
8. Which design skills you used, and the visual direction you chose and why.

Report in plain language: the visual direction, how you handled each trap in Step 2, the three
states, the outputs above, and every assumption you made.
