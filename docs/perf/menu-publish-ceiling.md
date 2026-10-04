# Menu — publish ceiling (TASK-60)

_RFC-003 §4 TASK-60, §2.7: `publishDraft` (`convex/menu.ts`) writes every row
of the published menu — `menuGroups`, `menuItems`, `itemVariants`,
`itemPairings`, `menuDayparts` — by deleting the old published rows and
inserting the new ones, all inside **one mutation**, while §2.7 promises
**unlimited items and groups on both tiers**. This measures where that one
mutation actually breaks against the real deployed Convex limits, on the
real `expert-pelican-136` deployment — not a local/mocked transaction
engine, which would not enforce the same limits._

## How it was measured

`publishDraft` is a public mutation gated by `requireBusinessAccess`
(`convex/lib/access.ts` — off limits per the task preamble), which needs a
real authenticated editor session. A deploy-key script (`npx convex run`)
has no such session, and `access.ts`/`entitlements.ts` were not to be
touched. Reimplementing publish's body in the seed tool was rejected too —
that would measure a fiction, not the real code path.

**What was actually done:** two functions `convex/menu.ts` already had —
`deletePublishedRows` and `insertPublishedRows`, the exact two calls
`publishDraft`'s handler makes — were marked `export` (two one-line changes,
no logic touched). The new operator-only module
[`convex/menuPerfSeed.ts`](../../convex/menuPerfSeed.ts) (internal-only,
`npx convex run` with a deploy key, mirroring `convex/venueDevSeed.ts` /
`convex/memoriesLoadSeed.ts`) calls those same two functions, in the same
order, inside one `internalMutation` — **the identical database transaction
`publishDraft` runs**, minus only the access check and the OCC compare,
neither of which is what this task measures. `menu.ts`'s own logic was not
reimplemented; `lib/menu-rows.ts` (the one mapping module both `publishDraft`
and the public render already share) is reused unchanged.

Three throwaway businesses per size (`menu-perf-ceiling-100/400/700/850/1000`),
each with a `premium`-tier account (so nothing about entitlements gates the
write). Every item carries **2 variants** (the RFC's own note: variants are
what multiply the row count), spread across `⌈items/50⌉` groups.

Two scenarios per size, because they cost differently:

- **fresh publish** — the menu has no existing published rows, so the
  DELETE half of the transaction is nearly free. This is the "first
  migration" case (§2.9's concierge onboarding).
- **republish** — the SAME menu, already published at that size, published
  again. The DELETE half now has real rows to walk (with
  `deletePublishedRows`'s per-item nested queries — one for that item's
  variants, one for its pairings — for **every existing item**). This is the
  realistic case: an owner (or the admin doing a later paid edit, §2.9)
  editing an already-large menu and republishing.

`ctx.meta.getTransactionMetrics()` (Convex 1.41+, documented in
`convex/_generated/ai/guidelines.md`) was read at the end of every
successful mutation to report exact used/remaining headroom against this
deployment's real limits, not an assumed number.

## Results

| Items | Variants/item | Rows written | Scenario | documentsWritten | databaseQueries | bytesWritten | Result |
|---:|---:|---:|---|---:|---:|---:|---|
| 100 | 2 | 302 | fresh | 303 / 16000 | — | 61,726 B | **OK** |
| 400 | 2 | 1,208 | fresh | 1,209 / 16000 | — | 246,436 B | **OK** |
| 400 | 2 | 1,208 | republish | 2,417 / 16000 | 2,030 / 4096 (49.6%) | 246,436 B | **OK** |
| 700 | 2 | 2,114 | fresh | 2,115 / 16000 | — | 431,151 B | **OK** |
| 700 | 2 | 2,114 | republish | 4,229 / 16000 | 3,536 / 4096 (**86.3%**) | 862,036 B | **OK, close to the edge** |
| 850 | 2 | 2,567 | fresh | 2,568 / 16000 | 22 / 4096 | 523,509 B | **OK** |
| 850 | 2 | 2,567 | republish | — | **> 4096** | — | **FAILS** |
| 1000 | 2 | 3,020 | fresh | 3,021 / 16000 | — | 615,867 B | **OK** |
| 1000 | 2 | 3,020 | republish | — | **> 4096** | — | **FAILS** |

The republish failure, verbatim:

```
Uncaught Error: Too many reads in a single function execution (limit: 4096).
Consider using smaller limits in your queries, paginating your queries, or
using indexed queries with a selective index range expressions.
    at async handler (convex/menuPerfSeed.ts:247)   ← deletePublishedRows
```

## Where it actually breaks

**Not the write/byte side.** `documentsWritten` (16,000/transaction) and
`bytesWritten` (16 MiB/transaction) both stay far under budget even at
1000 items on a fresh publish (3,021/16,000 docs — 19%; 616 KB/16 MiB —
3.7%). A fresh, never-before-published menu of 1000+ items would publish
fine on the write side alone.

**The bottleneck is `databaseQueries` (4096/transaction), and only on
republish.** `deletePublishedRows` walks the existing rows to delete them,
and for **every existing item** issues two separate indexed queries — one
`itemVariants` lookup, one `itemPairings` lookup — regardless of how many
rows either returns. That is a query cost that scales **linearly with the
CURRENT published item count**, independent of the write-side limits:

- 400 items republish: 2,030 queries used (~5.08/item)
- 700 items republish: 3,536 queries used (~5.05/item), 86.3% of budget
- 850 / 1000 items republish: **exceeds 4096**, hard failure

Extrapolating the ~5.05–5.08 queries/item rate: the transaction has room for
roughly **4096 ÷ 5.07 ≈ 808 items** before a republish fails outright — and
700 items is already at 86% of that budget, meaning even success there
leaves almost no headroom for a slightly bigger menu, more variants per
item, or any pairings (`itemPairings` was 0 in this run; a menu that
actually uses "Ide uz" pairings would burn through the remaining budget
faster still).

A **fresh** publish of the same item count does not hit this at all (no
existing rows to delete ⇒ the per-item nested-query loop never executes) —
which is why the fresh-publish column above shows 1000 items succeeding
comfortably while the republish column fails at 850. The RFC's promise
(§2.7: "unlimited items and unlimited groups") is genuinely true for the
**first** migration of even a very large menu. It is **not** true for
**editing** one: the concierge model (§2.9 — "later owner-requested edits
… billed extra") means every large menu gets republished repeatedly over
its life, and each republish pays this same per-item query cost against the
same 4096 ceiling every time.

## Verdict

**Grananje objave u nastavke (scheduler continuation) JE POTREBNO PRE
TASK-58**, not merely worth recording. The reasoning:

- The practical republish ceiling (~800 items with 2 variants/item, less
  with pairings in use) is comfortably within reach of a real restaurant
  menu — large but not exotic (drinks + food + variants easily clears a few
  hundred rows for a mid-size kafana, and TASK-58's own premise is
  importing **third-party menus we did not size-control**).
- The failure mode is a hard, uncaught `ConvexError`-free crash — the owner
  (or the admin doing a paid edit) gets a raw "Too many reads" server error
  on Save/Publish, with **no partial output**: `publishDraft` is one
  transaction, so a failed publish leaves the previously-published menu
  intact but the edit is simply lost, with no path to retry except cutting
  the menu down — a genuinely bad failure mode to ship silently.
- TASK-58 explicitly imports "third-party menus" (RFC-003 §4's own framing
  of why this task exists) — item counts there are the client's, not ours,
  so the platform cannot assume item counts stay under ~800 the way an
  in-house-only surface might.
- The fix shape mirrors the one this codebase already has for exactly this
  problem class (`docs/perf/memories-export.md`'s BUILD-phase batching):
  `deletePublishedRows` and `insertPublishedRows` would each need to run in
  bounded batches with `ctx.scheduler.runAfter(0, …)` continuations between
  them (per `convex/_generated/ai/guidelines.md`'s own documented pattern
  for "a mutation [that] needs to process more documents than fit in a
  single transaction"), with the menu staying in a `"publishing"`-shaped
  state between batches rather than atomically flipping in one step as it
  does today.

This is a measurement, not a fix — no change was made to `publishDraft`,
`deletePublishedRows`, or `insertPublishedRows` beyond the two `export`
keywords needed to measure them from the perf tool. The continuation
redesign is a separate, real task that should land before TASK-58 starts
importing menus this platform does not control the size of.

---

# After — the generation model (TASK-60c)

_Measured on the same real `expert-pelican-136` deployment (Node v22.23.2,
CLI pinned `--url https://expert-pelican-136.eu-west-1.convex.cloud`,
`CONVEX_DEPLOY_KEY=""`) via the new operator entry point
[`menuPerfSeed:seedCeilingGeneration`](../../convex/menuPerfSeed.ts):_

```
npx convex run menuPerfSeed:seedCeilingGeneration \
  --url https://expert-pelican-136.eu-west-1.convex.cloud '{"itemCount":1000}'
```

TASK-60c moved deletion **out of the publish transaction**: `publishDraft` now
writes a fresh `publishGeneration` N+1 (never touching the old rows) and flips
`menus.publishedGeneration` atomically; old generations are drained afterward by
the `cleanupOldGenerations` scheduler continuation (cron reserve
`sweepStuckMenuCleanups`). The perf entry point mirrors that publish transaction
(the exported `insertPublishedRows(..., generation)` + the flip), and drives the
real `cleanupGenerationBatch` to completion.

## Results (1000 items, 2 variants/item, 20 groups)

| Scenario | documentsWritten | databaseQueries | bytesWritten | Result |
|---|---:|---:|---:|---|
| **fresh publish** (write generation 1) | 3,021 / 16,000 | **19 / 4096** | 643,481 B | **OK** |
| **republish** (write generation N+1, old generation still present) | 3,021 / 16,000 | **19 / 4096** | 643,481 B | **OK** |

Cleanup of the old generations (off the critical path, `cleanupGenerationBatch`,
`MENU_CLEANUP_BATCH = 200` items/batch):

| Metric | Value |
|---|---:|
| batches to drain 2,000 old items | 11 |
| **max databaseQueries in any one batch** | **1,020 / 4096** |
| old items / groups / dayparts left after cleanup | **0 / 0 / 0** |

## What changed

- **The republish query cost stopped scaling with menu size.** The old
  delete-then-insert republish used **2,030** queries at 400 items, **3,536** at
  700, and **exceeded 4096 (hard crash)** at 850+. The generation-model
  republish uses **19** queries at 1000 items — *identical to a fresh publish*,
  because it no longer walks the existing rows at all. The publish transaction is
  now bounded by `documentsWritten` (3,021 / 16,000 at 1000 items), not by
  `databaseQueries`.
- **The guest never sees a partial menu.** The public query filters to
  `menus.publishedGeneration`; generation N and N+1 coexist in the tables only
  between the flip and cleanup, and the read returns exactly one whole
  generation (proven in `convex/menuPublishGeneration.test.ts`).
- **Cleanup completes with no orphans.** 2,000 old items (two prior generations)
  drained in 11 bounded batches, the worst of which used 1,020 / 4096 queries —
  a quarter of the budget, and independent of total menu size (it is a function
  of the 200-item batch, not the menu). `rowsAfterCleanup` = all zeros.

## TASK-58 addendum — two more indexed reads per publish

`publishDraft` now reads the LIVE generation's `menuItems` and `menuGroups`
(one indexed query each, `by_menuId_and_publishGeneration`) before writing,
to detect a live "nema više" the draft would resurrect (RFC-003 §3 Risk 10).
That is +2 `databaseQueries` and +N `documentsRead` (N = the live item count,
≤ ~2000 under the admin import cap) per publish — it does not reintroduce the
per-item fan-out this document measured, because variants/pairings are not
read. The admin's `menuAdmin.importDraft` refuses more than `MENU_MAX_ITEMS`
(2000) items BEFORE any write, so the read ceiling below is never crossed by
an admin-entered menu; the owner path stays uncapped (BLOCKED TASK-58 §3).

## The remaining ceiling (honest note)

Publish now scales to roughly **~5000 items** (where `documentsWritten` = 16,000
binds). But the **public read** `collectPublishedRows` still issues two queries
per item (`itemVariants` + `itemPairings`, which have no `menuId` and are fetched
per parent item id): ~2,003 databaseQueries at 1000 items, crossing 4096 at about
**~2045 items**. So at 1000 items both publish *and* read pass comfortably; above
~2000 items the read becomes the binding constraint. That is a pre-existing
property of the public query (out of scope here — TASK-60c does not touch the
render), recorded so **TASK-58 does not import third-party menus larger than
~2000 items** until the read is also batched (e.g. give `itemVariants` /
`itemPairings` a `menuId`+`publishGeneration` and an index, then load a whole
generation without the per-item fan-out). See docs/tasks/BLOCKED.md TASK-60c §2.
