# TASK-22 — The live wall: photos on the screen in the room

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md` — including the "Design and UX process" section
2. `convex/_generated/ai/guidelines.md` — reactive queries and pagination
3. `docs/architecture/RFC-001-venue-memories.md` — §2.4 C.4 (`wallEnabled`), §2.7, §2.9
4. `convex/memories.ts` — the public gallery query and its pagination (TASK-20)
5. `components/memories/photo-picture.tsx`

## Why this exists

Guests scan the card because they want to **see themselves on the screen**. For a café this is
the whole reason the product works — without it, ten percent of guests participate; with it,
sixty. The wall is not a feature of Memories, it is the engine that makes Memories worth buying.

`/zid/[code]`, gated on `wallEnabled`, projected on a TV or a beamer in the room.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links` must print **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through the i18n layer. No hardcoded Serbian.
- The wall shows **only** `status === "ready"` **and** `visibility === "everyone"` **and** not
  hidden. A `host_only` photo reaching a projector in a full room is the worst failure this
  product can have. Filter it in the **query**, on the server — never in the client.

---

## STEP 1 — It runs for six hours unattended

This is the constraint that shapes everything. A laptop is plugged into a TV at 20:00 and nobody
touches it until 02:00. During that time hundreds of photos arrive.

- **Memory must not grow.** Window the photo set — hold a bounded number in memory and drop what
  scrolled past. A wall that accumulates 400 decoded images will die around midnight, which is
  exactly when the room is fullest.
- **Survive a dropped connection.** Wi-Fi in these rooms fails. Reconnect silently and keep
  showing what it has; never show an error screen to a room full of people.
- **Keep the screen awake** — the Wake Lock API where available, and say what you do where it is
  not.
- Handle the session rolling over at the night cutoff without a reload.
- Report what you did to prove it survives: how you tested duration, and what memory did.

## STEP 2 — What it looks like

Full bleed, no chrome, no cursor, no controls. This is furniture, not an app.

- New photos **arrive** rather than appear — a considered transition, using the existing motion
  tooling. Nothing that induces motion sickness on a 65-inch screen; honour
  `prefers-reduced-motion` even here.
- A newly uploaded photo gets a moment of prominence before joining the rotation. That moment is
  the product: the guest who just uploaded looks up and sees their photo. **Make that the
  designed centrepiece.**
- Mixed orientations — portrait phone photos on a landscape screen. Decide how (blurred fill,
  paired portraits, a grid) and say why. Never distort, never crop faces out.
- Readable from across a room: whatever text appears is large.

## STEP 3 — The wall recruits

Put the space's QR code on screen, small and persistent, with one short line. Someone watching
the wall should be able to join without asking anyone how.

This is the cheapest growth mechanism in the product — the wall advertises itself.

## STEP 4 — The nervous host

Some hosts will not want anything reaching the screen unattended. Add an optional
**approve-before-wall** mode on the space:

- off by default — the wall shows what guests opted to share;
- on — a photo waits for the host's approval before it can appear, approved from the host gallery
  built in TASK-19.

One switch, explained in one sentence, beside the existing `wallEnabled`.

## STEP 5 — Verify honestly

- Open the wall on a real screen and leave it running while photos are uploaded. Report what
  happened over time, including memory.
- Kill the network mid-run and restore it. Report what the room saw.
- Confirm a `host_only` photo and a hidden photo never appear — assert it in a test, not by
  looking.
- Confirm the wall 404s when `wallEnabled` is false.

---

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links harness/goldens` prints nothing.
2. `npm run check` green; `npm run test` green with existing suites unchanged.
3. Tests: `host_only`, hidden and non-`ready` photos never reach the wall query; the wall 404s
   when `wallEnabled` is false; approve-before-wall holds a photo until approved.
4. A duration run: what you did, how long, and what memory did. **Write the numbers into
   `docs/perf/memories-wall.md`** — not only into your report.
5. The network-drop behaviour, described from the room's point of view.
6. How mixed orientations are handled and why.
7. The QR recruitment element — screenshot it.
8. Which design skills you used.

Report in plain language: how memory stays bounded over six hours, how the newly-uploaded moment
is staged, the orientation decision, the measured duration run, and every assumption you made.
