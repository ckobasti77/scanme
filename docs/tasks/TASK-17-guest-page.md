# TASK-17 — The guest page: the screen behind the card

**Mode:** goal · **Model:** Fable · **Effort:** xhigh · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md` — including the "Design and UX process" section
2. The Next.js 16 docs under `node_modules/next/dist/docs/` before touching a route
3. `docs/architecture/RFC-001-venue-memories.md` — §2.4 C.4/C.7, §2.6, §2.7, §2.9, §2.10
4. `lib/memories-client/**` — the queue and its state machine (TASK-16). **Consume it; do not
   rewrite it.**
5. `app/dev/memories-upload/**` — the harness that already exercises the pipeline

## Who this screen is for

A guest at a table. The room is dark. They are holding a drink in the other hand. They are
somewhere between 20 and 80 years old. They have about ten seconds of patience and no interest in
learning anything.

They scanned a card and this page appeared. **The next thing they should do must be obvious
without a single word of instruction.** Every design decision in this task is subordinate to that
sentence.

This is the emotional centre of the product. A correct-but-cold guest page is a failed task.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links components/admin` must print
  **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through `lib/i18n/sr/memories.ts` and `consent.ts`. No hardcoded Serbian.
- No new upload logic. The queue, retry, release and state machine are TASK-16's; this task
  renders them.

---

## STEP 1 — Design first, then build

Follow `AGENTS.md`'s order — Taste → UI UX Pro Max → Frontend Design — with whichever of those are
actually available, and name which you used. `apple-design` and `motion-design` are also present
and relevant: this is a one-handed, touch-first surface where motion carries meaning.

Before writing components, state the audience, the page's single job, and the visual direction.

The page inherits the host's brand where one exists (the space's business), but it must stay
legible in a dark room on a cheap screen. Large targets, high contrast, no thin grey text.

## STEP 2 — The routes

```
app/m/[code]/page.tsx        the landing and upload screen
app/m/[code]/moje/page.tsx   the guest's own photos
app/m/[code]/galerija/page.tsx  the shared gallery — 404 unless publicGalleryEnabled
```

Async Server Components (`params` is Promise-only), client leaves only where browser state is
needed. The guest arrives already carrying the cookie, set by `/r/[cardCode]` — this page never
mints identity itself.

## STEP 3 — Every state gets a design

The page must never show a blank or broken shell. Design each of these deliberately and say what
each looks like:

- **before the window opens** — the event has not started
- **open** — the normal case
- **window closed** — uploading is over; their photos are still theirs to see
- **space paused** — the host stopped it
- **quota exhausted** — with their own photos shown, and no dead-end feeling
- **offline** — the queue keeps items; say so plainly
- **no active entitlement** — a neutral message, never a technical error

## STEP 4 — The upload flow

- **Remaining quota is visible before they pick**, in words: *"možeš da dodaš još 2 slike"*, not a
  progress bar or a fraction.
- Multi-select from the picker; the queue handles them one at a time.
- Per-item state rendered honestly from TASK-16's machine: queued / uploading / processing /
  ready / failed-with-retry. **Never render "sačuvano" before the server commit confirms it.** A
  guest told their photo is saved who finds nothing later is worse than one who sees a retry
  button.
- Failure is recoverable in one tap, and a released slot visibly returns to their count.
- The guest can delete their own photo.

## STEP 5 — Consent, done honestly

Per RFC §2.10, uploading is the affirmative act that gives consent, so the notice must be
**above the upload control, on the first screen, before anything is sent** — not behind a link,
not in a footer, not a modal to dismiss.

Short Serbian, plain words: who sees the photo, that the host may include it in the event's
archive, and how long it is kept. Link to the full policy for anyone who wants it.

The text is versioned (`consentVersion`); when it changes, the notice shows again. It lives in
`lib/i18n/sr/consent.ts`.

## STEP 6 — The visibility choice, and one nudge

- **Per photo**, the guest chooses: visible to everyone, or only to them and the host. Honour the
  space's `defaultVisibility` and `guestVisibilityChoice`. Make the choice a single obvious
  control, not a settings screen.
- **One social-proof line**: how many photos have been added tonight. It costs nothing, exposes
  no one, and it is the difference between ten percent of guests scanning and sixty. Do not turn
  it into a leaderboard or show whose photos they are.

## STEP 7 — Quality bar

- Verify on a **real phone**, in portrait, one-handed, with the screen dimmed. Not just a desktop
  browser at 390px.
- Touch targets comfortable for an unsteady hand; nothing important within thumb-collision range
  of the browser chrome.
- Keyboard reachable, visible focus, sensible heading order, `prefers-reduced-motion` honoured.
- No layout shift when a photo finishes processing and its thumbnail swaps in.
- Images served through `<picture>` with AVIF first and the WebP fallback — old iPhones are the
  audience, not the exception.

---

## Do not touch

`components/scanme-links/**`, `components/admin/**`, `convex/scanMeLinks.ts`,
`lib/scanme-links*.ts`, `lib/scanme-palette.ts`, `harness/goldens/**`, `app/[slug]/**`,
`lib/memories-pipeline/transform.ts`, `lib/memories-client/**` (consume, do not rewrite),
`globals.css`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links components/admin` prints nothing.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. `npm run check` green; `npm run test` green with existing suites unchanged.
4. **No new upload logic** — the queue is consumed unchanged. State how you verified.
5. All seven states from Step 3 render — describe each and how you produced it.
6. A real-phone pass: screenshots or an accurate description, portrait, one-handed. Console clean.
7. "Saved" is never shown before commit — show the code path that guarantees it.
8. The consent notice is above the upload control on the first screen — screenshot it.
9. Zero hardcoded user-facing strings under the new components — how you verified.
10. Which design skills you used, and the visual direction you chose and why.

Report in plain language: the visual direction and why it suits a dark room and an unsteady hand,
each of the seven states, how honesty about upload state is enforced, the outputs above, and every
assumption you made.
