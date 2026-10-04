# Ordering — first paint (TASK-70b)

Measured on the **live** guest page `/o/[code]` (reached only through the real
card-aware hop `/r/[cardCode]/o?venue=<code>`, never a bare `/o/[code]` link)
and the **live** waiter panel `/panel/[venueCode]`, both served by
`next dev` on `localhost:3000` against the real `expert-pelican-136` Convex
deployment, using the `orderingDevSeed:seed` data (business
"Poručivanje primer — Kafana Dva Jelena", venue code `905D6HBG`, cards
`R7JR1F81` / `Sto 7` and `M3ZMP68A` / `Sto 12`).

## How it was measured, and why not Paint Timing

The obvious metric is `first-contentful-paint` from
`performance.getEntriesByType("paint")`. It was tried first and came back
**empty on every sample**. The cause is environmental, not the app: this
harness's browser tab reports `document.visibilityState === "hidden"`
whenever it is not the single foregrounded tab, and Chromium does not record
paint timing for a backgrounded tab — there is no paint to time. Fronting the
tab before navigating did not change the reported visibility state inside
this automation harness, so Paint Timing is not obtainable here. This is a
**tooling limitation of the QA harness, not a property of the pages**,
recorded per the task's own rule that a thing that does not pass is a
finding, not something to paper over.

**Proxy used instead: `domInteractive`** (Navigation Timing API,
`performance.getEntriesByType("navigation")[0].domInteractive`), read
immediately after each fresh navigation. Both pages are `force-dynamic`
server components (`app/o/[code]/page.tsx`, `app/panel/[venueCode]/page.tsx`)
that render their real first-paint content — the heading, the actions or the
PIN screen, the live queue — entirely in the server-rendered HTML; the
`"use client"` components (`OrderingGuest`, `WaiterPanel`) hydrate onto that
markup but do not gate what is visible. For a page shaped this way,
`domInteractive` (parser reaches the end of the initial HTML) is the point at
which the real content is on screen, which is what "first paint" is a proxy
for in the first place. `responseStart` (TTFB) and `loadEventEnd` are
reported alongside for context.

**n = 10** fresh navigations per page (browser cache untouched — a real
repeat visit, not a forced cold cache), each through `navigate` to the same
URL. The guest samples each re-ran the card-aware hop (`/r/R7JR1F81/o?venue=…`),
minting a fresh ordering guest every time — the same path a new scan takes.
One additional **cold** sample (the very first hit of `/panel/[venueCode]`
in this session, `domInteractive = 1171ms`) is excluded from the panel's n=10
below and reported separately: `next dev` compiles a route on its first
request, and that one-time compile cost is a dev-server artifact, not a
production number — recording it here so it is not silently dropped.

## Results

### Guest page `/o/[code]` (via the real hop) — n = 10

`domInteractive` samples (ms), sorted: 359, 377, 384, 395, 409, 441, 442, 464, 464, 480

| | TTFB proxy | domInteractive (first-paint proxy) |
|---|---:|---:|
| p50 | — | **425 ms** |
| p95 | — | **480 ms** |

### Waiter panel `/panel/[venueCode]` — n = 10 (warm)

`domInteractive` samples (ms), sorted: 232, 273, 274, 282, 283, 289, 289, 311, 334, 361

| | domInteractive (first-paint proxy) |
|---|---:|
| p50 | **286 ms** |
| p95 | **361 ms** |
| cold (1st hit, dev-server route compile, excluded above) | 1171 ms |

## Verdict

Both pages land well under a 1-second first-paint proxy on a `next dev`
server talking to a real (non-local) Convex deployment over the network —
p95 480 ms for the guest and 361 ms warm for the panel. This is a **dev-server,
single-tester** measurement, not a production benchmark: no CDN, no
production build, no concurrent load, and the browser-reported
`domInteractive` proxy is a deliberate substitute for Paint Timing, which
this harness cannot record (above). Given that, the numbers are a *floor*,
not a guarantee — a production build should be faster (no dev compile
overhead, static optimization where it applies), so this is not read as a
regression risk, only as the honest number this task could actually measure.
The one genuine miss is the environment's Paint Timing gap itself, logged as
a QA finding in [docs/qa/ordering.md](../qa/ordering.md).
