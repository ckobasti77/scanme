# TASK-12 — The twelve block property panels

**Mode:** goal · **Model:** Fable · **Effort:** xhigh · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md` — including the "Design and UX process" section
2. `docs/tasks/TASK-10-venue-editor-shell.md` — especially **Step 5, Constrained freedom**
3. `lib/venue-blocks.ts` — every clamp and cap. The UI must never offer a value this file
   will silently take away.
4. `components/venue/editor/**` and `components/venue/blocks/registry.tsx`

## What this task is

Fill the `EditorPanel` seam TASK-10 left open: a real property panel for each of the twelve block
types, plus the page-level panels. This is the widest UI surface in the product.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links components/admin` must print
  **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- No `--links-` string under `components/venue/**`. `harness:namespace` stays green.
- Every string through `lib/i18n/sr/venue-editor.ts`. No hardcoded Serbian.

---

## STEP 0 — Fix the layout gap on the public page

On the public Venue page, a large vertical void (roughly 300–400px) appears between the last
profile card and the block that follows it. It shows on mobile at both light and dark themes.
It looks like a grid with three cards in a two-column layout where the empty cell still holds
height.

Reproduce it, find the actual cause, fix it, and say what it really was. **Do not paper over it
with a negative margin or a fixed height.**

While there: confirm whether the light and dark themes render the same typeface. If the theme
toggle changes the font family, that is a bug — report it and fix it. If the difference came from
two different design fixtures, say so and change nothing.

## STEP 1 — The constraint that governs every control

From TASK-10 Step 5, restated because this is the task where it is either honoured or lost:

- **Bounded controls only.** Sliders with a real min and max, taken from the clamps in
  `lib/venue-blocks.ts`. Never a free numeric input for radius, spacing, border width, columns or
  gap. If the server would clamp a value, the UI must not let the owner reach it.
- **Colours come from the page palette**, derived from the business's own brand via
  `lib/design-engine/palette.ts`. Never a raw hex field, never a 16-million-colour picker.
- The owner may change every *property*; the owner may not break the *layout*.

For each control you build, the range or option set must be **derived from** the clamp function,
not retyped next to it. A duplicated constant will drift.

## STEP 2 — The twelve panels

`countdown` · `eventDateTime` · `programTimeline` · `map` · `gallery` · `profileCards` ·
`priceList` · `reservation` · `share` · `pastEvents` · `richText` · `spacer`

Each panel edits that block's `props` plus the shared `base` properties (visibility, responsive,
size, alignment, spacing, radius, border, shadow, surface, colour override, typography override,
animation). Put the shared base controls in one reusable section so twelve panels do not each
reinvent them.

**List-shaped blocks need item editors** — `gallery` (≤24), `programTimeline` (≤40), `priceList`
(≤60 across all sections), `profileCards`, and `reservation`'s field config. Each needs add,
remove, reorder and inline edit. As with the block palette, the cap must be visible **before** the
server rejects it: when full, the add control is disabled with a clear reason.

**Media**: gallery images, profile card images and programme item images upload to Convex storage.
Show upload progress, handle failure with a retry, and never leave the owner unsure whether an
image saved.

## STEP 3 — The page-level panels

`event`, `style`, `background`, `text`, `colour`, `settings` — the page's own design document:
palette, typography, background (all six categories from the engine's background union), and the
event's own fields.

## STEP 4 — Quality bar

- Empty states: a block with no items shows a useful prompt in both the panel and the preview,
  never a broken shell.
- Validation feedback lands next to the field that caused it, not in a global banner.
- Selecting a block in the preview opens its panel and vice versa — the seam TASK-10 built.
- Keyboard reachable, visible focus, `prefers-reduced-motion` honoured.
- Verify in a browser at mobile and desktop widths; edit every block type at least once; fix
  console errors before reporting done.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links components/admin` prints nothing.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. `npm run check` green; `npm run test` green.
4. The Step 0 gap: what it actually was, and the fix — with a before/after screenshot or an
   accurate description.
5. All twelve panels exist and were each exercised in a browser — say what you changed in each.
6. **Every numeric control's range is derived from `lib/venue-blocks.ts`, not retyped.** Show one
   example of how.
7. Every list cap is surfaced in the UI before the server rejects it.
8. Zero hardcoded user-facing strings under `components/venue/**` — how you verified.
9. Which design skills you used.

Report in plain language: the gap's real cause, how each control derives its bounds, the media
upload failure path, the outputs above, and every assumption you made.
