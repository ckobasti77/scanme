# TASK-10 — Venue editor: shell, block palette, preview, autosave, publish

**Mode:** goal · **Model:** Fable · **Effort:** xhigh · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md` — including the "Design and UX process" section
2. The Next.js 16 docs under `node_modules/next/dist/docs/` before touching a route or `proxy.ts`
3. `docs/architecture/RFC-001-venue-memories.md` — §2.5 **including the TASK-06 amendment at the
   end of §2.5**, §2.7, risk #1
4. `components/admin/scanme-links-editor*.tsx` and `components/admin/use-editor-history.ts` —
   **READ ONLY.** Learn the patterns: history with group coalescing, the content-hash + debounce
   autosave loop, the desktop/mobile shell split, the preview-renders-production-markup seam.
5. `convex/venue.ts`, `lib/venue-blocks.ts`, `components/venue/**`

## What this task is

A **standalone** Venue editor: its own shell, its own history, its own autosave, its own panel
layout. Per the §2.5 amendment, the Links editor shell is **not** parameterized while the freeze
holds — this duplication is deliberate, recorded debt.

**This task builds the shell and the block palette.** The twelve per-block property panels are
**TASK-11**. Here, selecting a block shows a placeholder panel that names the block and says its
controls are coming — the registry's `EditorPanel` seam gets wired, not filled.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links components/admin` must
  print **nothing**. You may READ `components/admin/**` to learn the patterns; you may not modify
  one byte of it. Copy what you need into `components/venue/editor/**`.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- **Namespace:** no `--links-` string anywhere under `components/venue/**`. `harness:namespace`
  must stay green.

---

## STEP 0 — Keep Venue niche-neutral (do this FIRST)

Restaurants, cafés and clubs are the primary customers, but Venue must work for **any** small
business running something time-boxed: a hairdresser's promotion, a gym's challenge week, a shop's
seasonal sale, a workshop. All of those are events — they have a start and an end the owner
chooses. **The existing lifecycle is correct and does not change.** Do not add an "evergreen" or
open-ended mode.

The block structures are already general. Only the vocabulary is not, and one name is about to
collide with a future product.

### 0.1 Free the name "Menu" for a future product

A separate product, **ScanMe Menu**, is planned for services and price lists. It is **not** built
now and Venue must not absorb it. But Venue currently has a block type literally called `menu`,
which will collide with that product's name in the UI, in support conversations, and in this
codebase.

Rename the block type `menu` → **`priceList`** across `convex/lib/venueValidators.ts`,
`lib/venue-blocks.ts`, `components/venue/blocks/**`, `lib/i18n/sr/venue.ts` and every test. The
block stays in Venue — an owner may still list a few items on a campaign page — but the word
"Menu" now belongs to the future product.

Also add a short note to RFC §2.5 recording that ScanMe Menu is a planned separate product, that
Venue's `priceList` block is a light convenience and not a replacement for it, and that nobody
should grow Venue into a menu product.

### 0.2 Rename the one trade-specific block type

`performerCards` describes DJs and bands. The structure — image, title, subtitle — is equally a
stylist, a trainer, a featured product, a workshop leader. Rename it to **`profileCards`** across
the same set of files and tests.

### 0.3 Neutral vocabulary

`lib/i18n/sr/venue.ts` has `performersHeading: "Nastupaju"` and `menuHeading: "Meni"`. Both read as
hospitality. They are only fallbacks — six blocks already accept an owner-typed `heading` — but
they are the first thing a hairdresser sees when she adds the block.

Choose neutral Serbian defaults that read naturally for a club night **and** a salon promotion, and
use the same neutral vocabulary for the palette labels in Step 3. Check the rest of the dictionary
for copy that assumes a party rather than a campaign, and neutralise it.
`programHeading: "Program"` is already neutral; leave it.

**Both renames are free only while `venueEventConfigs` is empty.** Confirm it is empty in your
report; once a customer saves a config, either rename becomes a migration.

## STEP 1 — The route and its guard

- `app/[slug]/venue/editor/page.tsx` — a server shell rendering the client editor, mirroring how
  `app/[slug]/editor/page.tsx` is structured.
- **`proxy.ts`**: the existing editor matcher matches exactly one segment before `/editor`
  (RFC §1.f) and will not cover `/{slug}/venue/editor`. Add a second matcher with the same
  unauthenticated → `/{slug}/client-panel` redirect. **Leave the existing matcher untouched** and
  confirm the new regex cannot match `/{slug}` or `/{slug}/editor`. This is the one file outside
  `components/venue/**` and `app/[slug]/venue/**` this task may modify.
- Server-side authority stays in the Convex functions — `requireServiceEditorAccess(ctx, profile,
  ["scanme_venue"])`, already built in TASK-08. The proxy check is convenience, not security.

## STEP 2 — The shell

Build in `components/venue/editor/`:

- **History** — undo/redo with group coalescing, generic over the document type. `useEditorHistory`
  in `components/admin/use-editor-history.ts` is already generic; **copy it** into the Venue
  editor rather than importing across the freeze boundary, and note in a comment that the two
  copies exist deliberately and why.
- **Autosave** — content-hash diff plus a debounce, following the Links loop's shape. Every draft
  write goes through `saveDraft` (TASK-08), which normalizes and clamps server-side. Show save
  state honestly: saving / saved / failed-with-retry. Never a silent failure.
- **Panel layout** — desktop and mobile arrangements driven by one panel-id list plus a copy map,
  the way the Links shell does it. Venue panel ids: `blocks`, `event`, `style`, `background`,
  `text`, `color`, `settings`, `analytics`, `help`.
- **Publish** — via `publishDraft` with `expectedDraftRevision`. On a revision mismatch, tell the
  user someone else published and offer to reload — do not silently overwrite.

## STEP 3 — The block palette (the `blocks` panel)

Add, reorder, duplicate, delete. Reordering uses `@dnd-kit` (already a dependency; the Links
destinations list is the precedent — read it).

- The palette lists the twelve block types with label and icon from
  `components/venue/blocks/registry.tsx`.
- Adding inserts `defaults(type)` from `lib/venue-blocks.ts`.
- The 30-block cap is surfaced in the UI **before** the server rejects it: when full, the palette
  is disabled with a clear reason. A limit the user only discovers by hitting an error is a bug.
- Delete asks for confirmation only when the block has content; an empty block deletes silently.
  Undo covers both.

## STEP 4 — The preview

- Renders the **real `VenueTemplate`** from TASK-09 — never a simplified copy. This is the seam
  the Links editor gets right and it must not be lost.
- **Mobile preview is the DEFAULT view, not an option.** Nearly every visitor arrives by scanning
  a QR code on a phone. A desktop-first editor is how owners ship pages that break on phones.
- Selecting a block in the preview selects it in the panel, and vice versa.
- Selection type is `{ kind: "block"; id } | { kind: "page" } | null`.

## STEP 5 — Constrained freedom (the product decision behind this editor)

This is deliberate and must be honoured by every control you build, here and in TASK-11:

- **Bounded controls only.** A slider with a real min and max — never a free numeric input for
  radius, spacing, or border width. The ranges come from the clamps in `lib/venue-blocks.ts`;
  the UI must not offer a value the server will silently clamp away.
- **Colours come from the page palette**, not a raw 16-million-colour picker. The owner picks from
  colours derived from their own brand via `lib/design-engine/palette.ts`.
- The owner may change every *property*; the owner may not break the *layout*.

State in your report how each control enforces this.

## STEP 6 — Quality bar

- Every string through `lib/i18n/sr/venue-editor.ts`. That dictionary currently holds one key;
  this task fills it. No hardcoded Serbian in components.
- Keyboard: undo/redo shortcuts, focus management when panels open and close, visible focus rings.
- `prefers-reduced-motion` honoured.
- Verify in a browser at mobile and desktop widths; exercise add → reorder → undo → autosave
  settle → publish; fix console errors before reporting done.

---

## Do not touch

`components/scanme-links/**`, `components/admin/**` (read only), `convex/scanMeLinks.ts`,
`convex/lib/scanMeDesignValidators.ts`, `lib/scanme-links*.ts`, `lib/scanme-palette.ts`,
`harness/goldens/**`, `app/[slug]/page.tsx`, `app/[slug]/editor/**`, `globals.css`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links components/admin` prints nothing.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. `git diff proxy.ts` pasted; confirm the new matcher cannot match `/{slug}` or `/{slug}/editor`.
4. `npm run check` green (includes `harness:check` and `harness:namespace`); `npm run test` green.
5. A browser pass: add a block → reorder → undo → autosave settles → publish → the public page
   shows the change. Describe it, console clean.
6. The 30-block cap is visible in the UI before the server rejects it — show how.
7. Zero hardcoded user-facing strings under `components/venue/editor/**` — state how you verified.
8. Every numeric control is bounded and every colour control is palette-derived — list them.
9. Which design skills you used.
10. Neither `performerCards` nor the block type `menu` appears anywhere in the repo; confirm
    `venueEventConfigs` was empty so neither rename needed a migration.
11. RFC §2.5 records ScanMe Menu as a planned separate product that Venue must not absorb.
12. The neutral wording you chose, and why it reads naturally for both a club night and a salon
    promotion.

Report in plain language: the shell's shape, how autosave and publish report failure, how
constrained freedom is enforced, the outputs above, and every assumption you made.
