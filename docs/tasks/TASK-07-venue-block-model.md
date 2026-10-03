# TASK-07 — The Venue block model (data + rules, no React)

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md`
3. `docs/architecture/RFC-001-venue-memories.md` — §2.4 C.2, §2.5 (including the TASK-06
   amendment at the end of §2.5), §2.9
4. `lib/design-engine/**` — what TASK-06 built
5. `convex/lib/venueValidators.ts` — the placeholders this task replaces

## What this task is

The **data model and rules** for Venue blocks. Validators, defaults, clamps, the Venue token
compiler wiring, and the Venue role palette.

**No React. No components. No rendering. No editor.** Not one `.tsx` file. Rendering is TASK-08,
the editor is TASK-09. Everything here must be unit-testable without a browser.

## Standing constraints (unchanged, non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/` must print **nothing**. Do not open
  `components/admin/**`. Do not touch `lib/scanme-links*.ts`, `lib/scanme-palette.ts`, or
  `lib/scanme-color-science.ts`.
- **Zero golden changes.** Never run `harness:capture`. Never edit a golden. If the harness goes
  red, something you wrote reached a shared path — remove it, do not adjust the net.

---

## STEP 0 — One stale row in the RFC

RFC §4's implementation sequence, row 9, still reads *"Editor shell parameterization, then Venue
editor mode"*. That contradicts the TASK-06 amendment at the end of §2.5, which defers shell
unification and gives Venue a standalone editor. Rewrite row 9 to match, and check the rest of
the §4 table for any other row that assumes the shared shell.

---

## STEP 1 — Validators

Replace the TASK-03 placeholders in `convex/lib/venueValidators.ts` with the real definitions.

**`venueDesignValidator`** — page-level design for a Venue page: colour roles, typography,
background, effects. Per RFC §2.5 it **must not compose `scanMeDesignValidator`** — `presetKey`
and `iconStyle` are Links-hardcoded 15-member unions. Instead:

- re-use the V2 background union through `convex/lib/designEngineValidators.ts` (TASK-06), so
  there is one source of truth and the Links validator file needs zero edits;
- define shadow and typography validators of identical shape independently;
- give Venue its own preset/capability catalog built on the generic `Capabilities<TDesign>` from
  `lib/design-engine/capabilities.ts`.

**`venueBlockValidator`** — a discriminated union of
`v.object({ type: v.literal(x), base: blockBaseValidator, props: v.object({...}) })`.

`blockBaseValidator` is the per-block property set, exactly as RFC §2.5 specifies: `id`,
`visible`, `responsive`, `size`, `alignment`, `spacing`, `radius`, `border`, `shadow`, `surface`,
`colorOverride`, `typographyOverride`, `animation`.

Block types to define — the full set from §2.5, no more, no fewer:

`countdown` · `eventDateTime` · `programTimeline` · `map` · `gallery` · `performerCards` ·
`menu` · `reservation` · `share` · `pastEvents` · `richText` · `spacer`

Use the representative payloads the RFC already spells out for `countdown`, `programTimeline` and
`gallery` verbatim. Design the rest in the same style. If a block needs a decision the RFC does
not make, **make the smallest reasonable choice and list it in your report** — do not invent
elaborate options.

`venueEventConfigs` in `convex/schema.ts` already references these validators. Confirm
`npx convex deploy` still succeeds — the tables are empty, so this is a shape change with no data
to migrate. Say so explicitly in your report.

## STEP 2 — Pure defaults and clamps

Create `lib/venue-blocks.ts`: block types, `defaults(type)`, and `clamp(block)` as **pure
functions with no Convex imports**, so `convex/venue.ts` can import them later and normalize on
write exactly the way `normalizeDesignForPreset` does for Links. (Precedent: `convex/scanMeLinks.ts`
imports `lib/scanme-links-design.ts`.)

Enforce the caps from RFC §2.4 C.2: **30 blocks** per config, `gallery` items ≤ 24,
`programTimeline` items ≤ 40, `menu` items ≤ 60. Numeric properties clamp to bounded ranges —
`radius`, `spacing`, `border.width`, `gallery.columns` (1–4) and so on. Every clamp must be
idempotent: `clamp(clamp(x))` equals `clamp(x)`.

## STEP 3 — The Venue role palette, by copy

Venue needs the 5-role → N-role expansion that `deriveColors` performs in `lib/scanme-palette.ts`
(lines ~249–296), but parameterized over a role list instead of hardcoded to the Links roles.

**Do not modify `lib/scanme-palette.ts`.** Create `lib/design-engine/palette.ts` with
`deriveRoleColors(roleList, palette)`, and define the Venue role list there. Re-export the
existing colour-science and Material-colour helpers rather than reimplementing them — those files
are read-only for you.

Note in a file comment that this parallels the Links `deriveColors` and that unifying them is
deferred while the freeze holds.

## STEP 4 — Wire the Venue token compiler

Adopt `createTokenCompiler("venue")` from TASK-06 to compile a `venueDesignValidator` document
into `--venue-*` custom properties. This is the compiler's first consumer.

Emit **only** `--venue-*` names. `harness:namespace` must stay green, and no `--links-` string may
appear anywhere in the new code.

## STEP 5 — Tests

- Every block type: `defaults(type)` validates against `venueBlockValidator`.
- Every block type: `clamp` enforces its caps, and is idempotent.
- The block-count cap and each per-block item cap reject overflow.
- `deriveRoleColors` returns the full Venue role set from a 5-colour palette.
- The token compiler emits `--venue-*` for a representative design, and emits no `--links-`.

---

## Do not touch

`components/**` (all of it), `lib/scanme-links*.ts`, `lib/scanme-palette.ts`,
`lib/scanme-color-science.ts`, `lib/scanme-material-color.ts`, `convex/lib/scanMeDesignValidators.ts`,
`convex/scanMeLinks.ts`, `app/**`, `globals.css`, `harness/goldens/**`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/` prints **nothing** — output pasted.
2. `git --no-optional-locks diff --stat harness/goldens` prints **nothing** — output pasted.
3. `npm run check` green (includes `harness:check` and `harness:namespace`) — output pasted.
4. `npm run test` green, existing suites unchanged, new block tests passing — output pasted.
5. `npx convex deploy` (or `npx convex dev --once`) succeeds; state explicitly that
   `venueEventConfigs` is empty so the validator shape change migrates nothing.
6. **Zero `.tsx` files created or modified** — state this explicitly.
7. All twelve block types exist with defaults, clamps and tests. List them with each one's caps.
8. RFC §4 row 9 matches the §2.5 TASK-06 amendment; report any other row you had to correct.

Report in plain language: the block set and each one's caps, every design decision the RFC did not
make for you, the outputs above, and every assumption you made.
