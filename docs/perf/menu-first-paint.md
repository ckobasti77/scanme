# Menu — first paint (TASK-60)

Measured on the **live** public Menu page `/{slug}/meni`
(`app/[slug]/meni/page.tsx`), served by `next dev` on `localhost:3000`
against the real `expert-pelican-136` Convex deployment, using two seeded
menus (`convex/menuPerfSeed.ts`, an operator-only tool mirroring
`convex/venueDevSeed.ts` / `convex/memoriesLoadSeed.ts`):

- **Basic** — `menu-perf-fp-basic` (account plan `basic`, no photos): 32
  items across the five group shapes (Predjela/lista, Glavna
  jela/galerija, Pića/traka, Preporuka kuće/istaknuto, Pivo i
  sokovi/tabela_varijanti), the tile aesthetic from §2.4 — every item an
  icon-tinted accent tile, never an empty frame.
- **Premium** — `menu-perf-fp-premium` (account plan `premium`, photos on):
  the identical 32-item menu, every item carrying a real (placeholder)
  `photoStorageId` — a genuine signed-URL round trip through
  `resolveItemMediaUrls` / `menuStorageUrl`, not a stub.

Both were published for real through the exact `publishDraft` transaction
(see the publish-ceiling doc for why that reuse was necessary), then loaded
in the browser and screenshotted to confirm they render correctly — accent
tiles with no photos on Basic, real photo tiles on Premium, sticky
scroll-spy nav with all five groups — before any measurement was taken.

## How it was measured, and why not Paint Timing (same method as TASK-70b)

The budget metric in RFC-003 §2.12 is first-contentful-paint. It was tried
first, the same way [docs/perf/ordering-first-paint.md](ordering-first-paint.md)
(TASK-70b) tried it: `performance.getEntriesByType("paint")` read
immediately after each scripted `navigate()`. In THIS session it briefly
worked on one manually-spaced check (`document.visibilityState ===
"visible"`, real `first-contentful-paint` entries came back), which
confirms the capability exists in the browser build — but the moment
measurement moved to the same back-to-back scripted-navigation pattern
TASK-70b used (needed for n=10 in a reasonable number of round trips),
`document.visibilityState` flipped to `"hidden"` again and the paint
entries came back empty. Reproduced deliberately before committing to the
substitute: this is the same **QA-harness backgrounding limitation**
TASK-70b found, not a fluke and not a property of the Menu pages themselves.

**Same substitute as TASK-70b: `domInteractive`** (Navigation Timing API,
`performance.getEntriesByType("navigation")[0].domInteractive`), read
immediately after each fresh navigation. `app/[slug]/meni/page.tsx` is a
`force-dynamic` server component that fetches the published menu via
`fetchQuery` and renders the real first-paint content — heading, sticky nav,
every group's tiles — entirely in the server-rendered HTML (§2.6
SSR-then-subscribe: the client subscription hydrates after, costing nothing
at paint time). For a page shaped this way `domInteractive` is the point the
real content is on screen, same reasoning TASK-70b documented.
`responseStart` (TTFB) and `loadEventEnd` are reported alongside for
context, not gated.

**n = 10** fresh navigations per page (browser cache untouched — a repeat
visit, not a forced cold cache), each through `navigate` to the same URL, in
the same tab, one after another.

## Results

### Basic `/menu-perf-fp-basic/meni` (no photos) — n = 10

`domInteractive` samples (ms), sorted: 278.3, 282.0, 290.2, 290.7, 291.2,
298.1, 332.5, 336.6, 338.4, 415.0

| | domInteractive (first-paint proxy) | Budget | Verdict |
|---|---:|---:|---|
| p50 | **295 ms** | — | — |
| p95 | **415 ms** | 1000 ms | **PASS** (41.5% of budget) |

### Premium `/menu-perf-fp-premium/meni` (with photos) — n = 10

`domInteractive` samples (ms), sorted: 245.3, 273.7, 277.8, 285.2, 291.7,
294.2, 298.0, 310.2, 333.5, 366.4

| | domInteractive (first-paint proxy) | Budget | Verdict |
|---|---:|---:|---|
| p50 | **293 ms** | — | — |
| p95 | **366 ms** | 1000 ms | **PASS** (36.6% of budget) |

One representative Premium sample for context (not gated): `responseStart`
(TTFB) 355 ms, `domInteractive` 366 ms, `loadEventEnd` 523 ms. No console
errors on either page across the run.

## Verdict

**Both Basic and Premium PASS the < 1000 ms p95 budget (§2.12), by a wide
margin** — p95 415 ms Basic, 366 ms Premium, both under half the budget.
Premium is not measurably slower than Basic on this proxy (366 ms vs 415 ms
p95 — within the run-to-run noise band of a `next dev` server on shared
hardware; the photo round trip does not show up as a first-paint cost,
which is exactly what §2.12's design predicts: photos load via `next/image`
after the SSR'd HTML paints, never blocking it).

This is a **dev-server, single-tester** measurement, not a production
benchmark — same caveat as TASK-70b: no CDN, no production build, no
concurrent load, no throttled-4G emulation (the harness's Paint Timing gap
also meant the RFC's literal "emulated 4G profile" instruction could not be
exercised through Chrome's real network-throttling + paint-timing pipeline
here; `domInteractive` was read against the harness's normal network). A
production build should be faster, not slower, so the honest reading is:
this is a floor measurement that clears the budget by a wide enough margin
(more than 2x headroom at p95 on both tiers) that production and a real 4G
profile are very unlikely to flip the verdict — but that specific claim is
unverified, exactly as the ordering doc flagged for the same tooling gap.
The Paint Timing gap itself is an environment limitation, logged here as a
QA finding for the same reason TASK-70b logged it in `docs/qa/ordering.md`.

## What was NOT touched

No optimization was made — the budget passed by construction (§2.12's own
claim), so there was nothing to fix. No change to `MENU_EXISTS` (stays
`false`), no change to `components/menu/**` or `convex/menu.ts`'s render
path. The only code added was the seed tool itself
(`convex/menuPerfSeed.ts`) and two `export` keywords on already-existing
functions in `convex/menu.ts` (see the publish-ceiling doc for why).
