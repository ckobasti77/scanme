# TASK-05 — The golden harness (regression net for ScanMe Links)

**Mode:** goal · **Model:** Fable · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `docs/architecture/RFC-001-venue-memories.md` — §1.a, §2.5, §2.11, §3 (risks 1, 4, 7)
3. `app/dev/template-gallery/page.tsx` and `components/scanme-links/templates/**`

## Why this task exists

Everything after this touches the design layer. The RFC's central promise is that published
ScanMe Links pages do not change by a single byte while Venue is built beside them. That promise
is worthless without a mechanism that **proves** it on every commit.

This is the one task where being subtly wrong is invisible: a harness that passes for the wrong
reason gives false confidence to every task after it. Prefer a smaller corpus that is provably
deterministic over a broad one that is flaky.

**Baseline commit: `ec039b1` on branch `jovan/scanme-templates-icons`.** No Links render code has
changed since. Goldens captured from the current working tree therefore represent the baseline.

**No product code. No Venue code. No design-engine code.** This task builds only the harness.

---

## STEP 0 — Kill the line-ending noise first

`lib/scanme-links.ts` repeatedly shows ~222 changed lines while `git diff --ignore-cr-at-eol` is
empty — pure CRLF churn from a Windows working copy. The harness's `git diff --stat` gate cannot
work while phantom whole-file diffs appear.

Add a `.gitattributes` that normalizes line endings for text files (`* text=auto` plus explicit
rules for the extensions in this repo), then renormalize the index so the churn stops
(`git add --renormalize .`). Verify afterwards that `git --no-optional-locks diff --stat` is
clean with no `--ignore-cr-at-eol` needed. Report the before/after.

---

## STEP 1 — Determinism rules (design these before writing the corpus)

A golden harness is only as good as its determinism. Address each of these explicitly and say in
your report how each is handled:

- **Fonts.** Every face is statically imported via `@fontsource*` in `app/layout.tsx`. Await
  `document.fonts.ready` before serializing. Do not let a race decide the output.
- **Animation and transitions.** Inject a stylesheet that disables all animation, transition and
  `caret-color`, and emulate `prefers-reduced-motion: reduce`.
- **Randomness and time.** Audit the render path for `Math.random()`, `Date.now()`, `new Date()`,
  `crypto.randomUUID()`, and any variation seed. If any exists, the corpus must pin it. Report
  what you found — including "none", if that is the truth.
- **Media.** Wait for images (and any background media) to settle; the template supports
  image/video backgrounds.
- **Viewport.** Fixed sizes. Capture at least one desktop and one mobile width.

## STEP 2 — What is serialized (read this carefully — it departs from the RFC)

Serialize exactly two things per case:

1. The rendered subtree's `outerHTML`, normalized (stable attribute order, whitespace collapsed,
   React-generated ids and any hydration attributes stripped).
2. The **resolved values of the `--links-*` CSS custom properties** on the token-bearing root
   element — the output of `designStyle()`.

Do **NOT** capture full `getComputedStyle` output, and do **NOT** make screenshots the gate.
Reason: computed styles and pixels depend on platform font metrics and rasterization, so goldens
captured on Windows would fail on Linux CI and vice versa. DOM structure plus token values are
platform-independent and catch precisely what matters — did the design→CSS compiler or the
template markup change its output.

Screenshots may be produced as a **local-only diagnostic aid** to help a human see a failure, but
they must never fail the build. If you add them, gitignore them.

## STEP 3 — The corpus

Extend `app/dev/template-gallery/page.tsx` (which already renders every preset × variation
through the real template) into a golden corpus covering **preset × variation × background
category**. All six background categories in the V2 union must appear: `flat`, `gradient`,
`pattern`, `texture`, `media`, `animation`.

The corpus must render the **real production components** (`OptionTwoFrame` /
`OptionTwoTemplate` via the registry), never a copy or a simplified stand-in. If rendering the
real component requires fixture data, the fixtures live in the harness — the components stay
untouched.

Keep `/dev/*` production-404 behavior exactly as it is today.

## STEP 4 — Capture, check, and the namespace gate

Add three npm scripts:

- `harness:capture` — renders the corpus and writes goldens to a committed directory.
- `harness:check` — re-renders and diffs against the goldens; non-zero exit and a readable diff
  (which case, which property, expected vs actual) on any mismatch.
- `harness:namespace` — the CI grep gate from RFC §2.11: fail if `--links-` appears anywhere under
  `components/venue/**`, or `--venue-` anywhere under `components/scanme-links/**`. It must pass
  today (neither directory pattern has violations; `components/venue/**` does not exist yet) and
  must not error on a missing directory.

Wire `harness:check` and `harness:namespace` into `npm run check` — or explain, with a concrete
reason, why they should stay separate. Add Playwright as a devDependency if it is not already
present, and make the browser install step explicit in the README section you add.

## STEP 5 — Prove the net actually catches something

This is the most important deliverable in the task. Demonstrate, with real command output pasted
into your report:

1. `harness:capture` → `harness:check` passes on a clean tree.
2. Make a **deliberate one-token edit** to the Links design→CSS path (e.g. change one value in
   `designStyle()` in `option-two-template.tsx`), run `harness:check`, and show it **fails** with
   a diff that names the case and the token.
3. Revert that edit (`git checkout --`), run `harness:check`, and show it **passes** again.
4. Confirm the tree is clean afterwards — the deliberate edit must not be committed.

A harness that has never been seen to fail has not been tested.

---

## Do not touch

`convex/**`, `lib/scanme-links*.ts`, `lib/scanme-palette.ts`, `lib/scanme-color-science.ts`,
`app/layout.tsx`, `globals.css`, and — except for the temporary, reverted edit in Step 5 —
`components/**`. If you believe one must change permanently, **STOP and explain why** instead of
changing it.

## Definition of done — demonstrate each, do not assert it

1. `.gitattributes` exists; `git diff --stat` on a clean tree shows nothing, with no
   `--ignore-cr-at-eol` needed. Before/after in the report.
2. `npm run check` green.
3. Goldens are committed, and the corpus covers all six background categories × the preset and
   variation matrix. State the exact case count.
4. `harness:check` passes clean, fails on the deliberate edit with a readable diff, and passes
   again after revert — all four Step 5 outputs pasted verbatim.
5. `harness:namespace` passes today and is proven to fail on a planted violation you then remove.
6. Every determinism risk in Step 1 is addressed with a stated mechanism, including an honest
   answer on randomness and time in the render path.
7. `git diff --stat` shows zero permanent changes under `components/` and `convex/`.

Report in plain language: the corpus shape and case count, how each determinism risk is handled,
the four Step 5 outputs, and every assumption you made.
