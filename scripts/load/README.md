# TASK-24 load harness — operator runbook

Drives a **real Convex deployment over the real network** with the shape of a
real night: 200 phones, burst arrivals, the live wall subscribed throughout.
Findings and numbers live in `docs/perf/memories-load.md`.

**Never wired into `npm run check`.** Never point it at a deployment with real
data: it writes hundreds of photos and `memoriesLoadSeed:reset` hard-deletes
them.

Requires Node ≥ 23 (native TS type-stripping imports the real guest-cookie
module) and `.env.local` in the repo root (`NEXT_PUBLIC_CONVEX_URL`,
`SCANME_GUEST_SECRET`, `SCANME_PIPELINE_SECRET`).

## Runbook

```bash
# 1. Push functions (memoriesLoadSeed) to the dev deployment
npx convex dev --once

# 2. Provision: 2 spaces (standard 5/guest + basic limit-3), 25 cards, guests
mkdir -p scripts/load/out
npx convex run memoriesLoadSeed:seed '{}' > scripts/load/out/seed.json

# 3. The realistic night (route engine needs a production build first)
npm run build
node scripts/load/run.mjs --mode full --guests 200 --photos 5

# 4. Escalation ladder — pure commit-path pressure, no sharp stage
node scripts/load/run.mjs --mode flood --flood-total 300 --flood-concurrency 24
node scripts/load/run.mjs --mode flood --flood-total 300 --flood-concurrency 48

# 5. The quota attack (limit-3 space, 8 parallel reserves per guest)
node scripts/load/run.mjs --mode quota --attack-guests 40 --attack-parallel 8

# 6. Ground truth from the deployment (per-guest counts, rollups)
npx convex run memoriesLoadSeed:verify '{"code":"<space code>"}'

# 7. Wipe the run's photos + rollups (batched; reschedules itself until clean)
npx convex run memoriesLoadSeed:reset '{}'
```

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--mode full\|flood\|quota` | — | required |
| `--guests / --photos` | 200 / 5 | full-mode room size |
| `--burst-sec / --tail-sec / --burst-frac` | 120 / 120 / 0.6 | arrival model (burst + exponential tail) |
| `--engine route\|direct` | route | full mode: real Next route (sharp included) vs inline Convex half |
| `--target` / `--port` | spawn on :3100 | route engine: reuse a running `next start` instead of spawning |
| `--flood-total / --flood-concurrency` | 300 / 24 | flood pressure |
| `--attack-guests / --attack-parallel` | 40 / 8 | quota attack shape |
| `--pool / --long-edge` | 24 / 2560 | payload pool (client-prepared JPEG shape) |
| `--guest-offset / --guest-count` | 0 / all | disjoint guest window, for multi-process floods |
| `--no-wall` | wall on | drop the wall subscription |
| `--label` | — | suffix for the result JSON |

All protocol mutations run with `skipQueue: true` and a 60 s deadline —
`ConvexHttpClient` otherwise serializes mutations per client instance, which
turns a "flood" into a single-file queue (see docs/perf/memories-load.md,
Run 2). `probe-cold.mjs [delayMs] [probes] [cold|hot]` measures mutation
latency from a separate process during a flood.

Results land in `scripts/load/out/<stamp>-<mode>.json`; the route engine also
writes the Next server log (per-photo transform timings) next to it.
