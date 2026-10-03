# TASK-06 — The shared design engine (primitives + lift)

**Mode:** goal · **Model:** Fable · **Effort:** xhigh · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `docs/architecture/RFC-001-venue-memories.md` — §1.a, §1.b, §2.5, §2.11, risk #1, risk #4
3. `harness/run.mjs` and `harness/namespace-gate.mjs` — understand the net before working under it
4. `components/scanme-links/templates/option-two/option-two-template.tsx`

---

## What "ScanMe Links is frozen" means — read this before anything else

The freeze is on **observable behavior**, not on source layout.

**Forbidden — zero tolerance:**
- Any change to what a visitor sees on a published ScanMe Links page. Byte-identical DOM and
  byte-identical `--links-*` token values, always.
- Any change to the ScanMe Links **editor** — its panels, its controls, its layout, its
  interactions, its internals. Do not touch `components/admin/**` at all in this task.

**Permitted:**
- Moving a **pure** function out of the Links template into the shared engine and importing it
  back, when the rendered output is provably unchanged. This is not a change to ScanMe Links; it
  is the same code living somewhere better. The golden harness is what makes it provable.

The single file this task may modify under `components/` is
`components/scanme-links/templates/option-two/option-two-template.tsx`, and only to delete the
moved function bodies and add the import lines. Nothing else in that file. No other component.

## THE RULE THAT OUTRANKS EVERYTHING ELSE

`harness:check` must stay green with **zero changes to any golden file**.

If a golden changes, the lift changed behavior. **Fix the lift.** Never run `harness:capture`,
never edit a golden, never relax the comparison, never add an exception. Re-capturing goldens to
turn a red harness green destroys the only thing protecting every live ScanMe Links page. If you
cannot make the lift a true no-op, **STOP and report** with the exact diff.

---

## What this task builds

The shared **primitives** Venue will consume. Precisely:

- **Shared:** token compiler, background renderer, shadow CSS, capability/clamp pattern, font
  enum. Plumbing.
- **NOT shared:** the block system. It does not exist yet and will exist **only in Venue**
  (TASK-07). ScanMe Links keeps its fixed page shape — logo, title, button list, footer — and is
  never retrofitted into blocks.

**No Venue code in this task.** No block types, no Venue template, no `components/venue/**`, no
editor work of any kind.

---

## STEP 0 — One RFC amendment

RFC §2.5 currently anticipates parameterizing the editor shell into "links mode" and "venue mode".
**Record that this is deferred.** While the freeze holds, Venue gets a **standalone editor** with
its own history, autosave and panel shell, duplicating the Links editor chrome.

State the reason honestly: the golden harness covers the public render path only, so an
"invisible" refactor of the editor has no automated proof. Unifying the shells becomes its own
task later, gated on an editor E2E smoke test — which is exactly what risk #1 already prescribes.
Frame the duplication as deliberate, recorded debt, not an oversight.

Leave the §2.5 lift wording (from TASK-02 §0.5) as it is — the lift is what this task performs.

## STEP 1 — New modules with no callers

Create under `lib/design-engine/`:

- **`tokens.ts`** — `createTokenCompiler(prefix)`, emitting `--{prefix}-*` CSS custom properties
  from a page-level design object, structurally parallel to what `designStyle()` produces today.
  **Links does NOT adopt it** — `designStyle()` stays exactly as it is. No consumer yet is correct.
- **`capabilities.ts`** — a generic `Capabilities<TDesign>` type plus `clampDesign()`,
  generalizing the `SCANME_LINKS_PRESET_CAPABILITIES` + `normalizeDesignForPreset` pattern. Read
  `lib/scanme-links-design.ts` for the shape; change nothing in it. No consumer yet.

## STEP 2 — The lift

Move these **pure** functions out of the Links template into the engine, and import them back:

- `backgroundPresentation` (~lines 141–218) → `lib/design-engine/background.ts`
- `shadowCss` / `logoShadowCss` (~lines 200–248) → `lib/design-engine/shadows.ts`

A **pure code move**: identical logic, identical output, no improvements, no renamed parameters,
no reordered branches, no tidying while you are in there. The template's rendering code is
untouched apart from the deleted bodies and the added imports.

The V2 background union is already exported from `convex/lib/scanMeDesignValidators.ts` —
re-export it from a new `convex/lib/designEngineValidators.ts` so there is one source of truth and
the Links validator file needs zero edits.

Add engine unit tests for both lifted functions, covering all six background categories and the
shadow variants (off, colored, offset).

## STEP 3 — Font enum: consolidate the render map, report the divergence

The audit (§1.a, §1.b) found the 12-key font enum duplicated in four places, and that the
**render** font-family map and the **editor** swatch map have diverged.

Define the enum and font stacks once in `lib/design-engine/typography.ts`, mirroring the render
map exactly, and have the Links template import it — output must not change by a byte.

Do **not** touch the editor's swatch map, and do not "reconcile" the two. The divergence is a
**finding to report**: list the exact differences and confirm the editor side was left alone.

## STEP 4 — Prove the no-op

Paste real command output for each:

1. `git --no-optional-locks diff --stat harness/goldens` — **empty**.
2. `npm run harness:check` — green.
3. `git --no-optional-locks diff --stat components/` — names **only**
   `option-two-template.tsx`. Paste the full diff of that file.
4. `npm run check` — green.
5. `npm run test` — green, existing suites unchanged, new engine tests passing.

---

## Do not touch

`components/admin/**` and every component except `option-two-template.tsx`; `convex/**` except
creating `convex/lib/designEngineValidators.ts`; `convex/lib/scanMeDesignValidators.ts`;
`lib/scanme-links-design.ts`; `lib/scanme-palette.ts`; `lib/scanme-color-science.ts`; `app/**`;
`globals.css`; `harness/goldens/**`.

`deriveColors` role-list parameterization in `lib/scanme-palette.ts` is **deferred to TASK-07**.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. Zero golden files changed — output pasted.
2. `git diff --stat components/` names only `option-two-template.tsx`; its full diff is pasted and
   shows only deleted function bodies plus added imports.
3. `npm run check`, `npm run harness:check`, `npm run test` all green — output pasted.
4. `lib/design-engine/{tokens,capabilities,background,shadows,typography}.ts` exist.
   `background.ts`, `shadows.ts` and `typography.ts` have exactly one caller (the Links template);
   `tokens.ts` and `capabilities.ts` have none, deliberately. State this explicitly.
5. Engine unit tests cover all six background categories and the shadow variants.
6. RFC §2.5 records the deferred editor-shell unification with its reason.
7. The font-map divergence is reported: the exact differences, and confirmation that the editor
   side was not touched.

Report in plain language: what moved, what is new and unused, the font divergence findings, the
five Step 4 outputs verbatim, and every assumption you made.
