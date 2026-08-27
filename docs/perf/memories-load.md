# Memories under load — 200 phones (TASK-24)

Everything before this task was proven one guest at a time. This document is
the measurement for the night the product is actually for: ~200 phones on one
venue Wi-Fi, most of them uploading inside the same fifteen minutes, with the
live wall re-rendering the whole time.

The harness lives in `scripts/load/` and drives a **real deployment over the
real network** (`dev:expert-pelican-136`). `convex-test` is deliberately not
used for any number in this file: it has no OCC, no network, and no
concurrency, so it cannot produce a meaningful answer to any question below.

---

## Step 0 — hypothesis, written before the harness ran

### H1 — the rollup row is a single point of contention

`convex/memoriesPipeline.ts` (`commitProcessed`, ~line 313) patches
`session.photoCount` on **every** commit, `guest.photoCount` beside it, and —
one screen further down — `space.totalPhotos` too. Convex mutations are
serializable with OCC retry, so every commit of the night is a write into the
same `memoriesSessions` row **and** the same `memoriesSpaces` row.

Reading the code makes the contention domain wider than the task's original
suspicion, and that is part of the hypothesis:

- `commitProcessed` **writes** the session row and the space row (and one
  guest row, which is per-device and therefore sequential by construction).
- Every other protocol mutation — `reserveUpload`, `renewUploadUrl`,
  `releaseReservation`, `uploadContext` — **reads** the space row (all of them
  resolve the space via `by_code`), and `reserveUpload` also reads the session
  row for the status check. Under OCC, a transaction that read a document
  another transaction wrote must retry. So under sustained committing, *every
  mutation in the protocol* is in the conflict domain of *every commit* — not
  just commit-vs-commit.

**Prediction if H1 is true:** as concurrent commits rise, (a) commit p95/p99
latency inflates well past the idle baseline (server-side OCC retries are
invisible to the client except as latency), (b) sustained commit throughput
plateaus and then degrades as retry work compounds, and (c) at some sustained
concurrency, commits start failing client-visibly with
`OptimisticConcurrencyControlFailure` after the server exhausts its retries.
Reserve latency should inflate too, because its read set overlaps the commit
write set.

**What falsifies H1:** a run that holds **≥ 24 concurrently in-flight
`commitProcessed` calls for ≥ 60 s** with zero client-visible OCC failures
and commit p99 under ~3× the low-concurrency baseline p50. If the 200×5
realistic run cannot reach that pressure (the local transform stage may cap
arrival), the harness escalates with a commit-flood mode (below) until the
pressure is real. A run that never reached the pressure proves nothing and is
recorded as such.

### H2 — the quota gate must be exact under races

`memories.reserveUpload` enforces the quota as an index count of the guest's
live rows **in the same transaction** as the `reserved` insert — exactly the
pattern OCC is supposed to make safe. Prove it by attacking it, not by
trusting it: guests on the **basic plan (limit 3)** each fire **8 parallel
`reserveUpload` calls** (a hostile/buggy client; the real queue is sequential,
so parallelism must be induced deliberately), and every successfully reserved
slot is driven all the way to a committed photo.

**Verdict criterion:** every attacked guest ends the run with **exactly 3**
committed photos. One single guest at 4 is a paid-plan bypass and a defect
that gets fixed before anything else in this task.

### H3 — the rate limiter under one venue NAT

Answer from `convex/lib/rateLimits.ts` and `convex/cards.ts`, stated before
the run so the run can check the arithmetic:

- `reserveUpload` and `renewUploadUrl` are keyed by **`guest._id`** — not by
  IP. A full room behind one NAT cannot throttle itself out of uploading;
  each phone has its own 30/min (capacity 15) bucket. Predicted: **zero**
  `rateLimited` refusals in the realistic run (5 photos/guest, retries
  included), and the harness classifies any that do appear.
- The per-IP buckets are upstream of uploading: `cardResolve`
  (120/min, cap 60) and `guestCreate` (60/min, cap 30), keyed by the ipHash
  the Next resolver computes. 200 scans spread over 15 min ≈ 13/min — far
  under both. The sharp edge is a **synchronized scan burst**: `guestCreate`
  admits 30 instantly, then refills at 1/s, so ~60 guests scanning inside the
  first minute behind one NAT would see ~half of the first-minute scans
  refused (the guest gets no key and must re-scan). This is a scan-time
  ceiling, not an upload-time one, and the load harness (which seeds guests
  directly, as if scans succeeded) does not exercise it — the verdict for H3
  is this arithmetic plus the key-choice reading, not a measured number.
- `cards.resolveAndRecord` collapses a missing `ipHash` into one `"shared"`
  key — that path only exists for direct API callers bypassing the Next
  handler, which always computes the hash. Not a room-throttling risk.

### Run design — built to break it, not to confirm it

- Arrival is a **burst plus heavy tail** (most devices start inside the first
  compressed "fifteen minutes", stragglers after), never uniform — uniform
  arrival is the one distribution that will not find the bug.
- The **wall stays subscribed for the whole run** (`wallFeed` over a real
  WebSocket): it re-runs on every commit and its `count` reads the very
  session row under attack, so it is part of the load, not an observer.
- Escalation ladder, in order, until something breaks or the pressure ceiling
  is provably reached: (1) realistic 200×5 route-engine run; (2) commit-flood
  at 24 concurrent; (3) commit-flood at 48 and 96 (the "what breaks first at
  500" probe).
- A run that finds nothing at ladder rung N is treated as too gentle and goes
  to rung N+1 — the verdict paragraph must say which rung finally produced
  pressure and what happened there.

### What is deliberately out of scope

No R2/CDN, no migration, no ScanMe Links surface. The local machine runs both
the load generator and the sharp transform stage, so the transform stage's
*absolute* throughput is machine-bound and is reported as context, not as a
production number; the Convex-side numbers (mutation latency, OCC behaviour,
quota exactness, wall behaviour) are the transferable findings.

---

## Step 2 — what actually happened

Rig: one Windows dev box (Node 24) running the load generator, the wall
subscriber, and — for the realistic run — a production `next start` serving
the real `/m/[code]/process` route (sharp included), all against
`dev:expert-pelican-136` over the real network. Payloads: distinct synthetic
JPEGs at 2560 px long edge (client-prepared shape; ~115 KB avg — lighter than
a typical real prepared photo at ~0.5–1.5 MB, so `put_original` transfer
times below are optimistic; nothing else depends on payload byte size).

### Run 1 — the realistic night (2026-08-27, `full`, route engine)

200 guests × 5 photos, burst 60 % of arrivals in the first 120 s + heavy
tail, wall subscribed throughout. **1000 attempted, 990 committed, 10
failed — and all 10 "failures" were the quota refusing reservation #6 for
the ten slots earlier smoke-test photos had already consumed. Zero uploads
were lost.** Duration 344 s.

| step | n | p50 | p95 | p99 | max | failures |
| --- | --- | --- | --- | --- | --- | --- |
| `reserveUpload` | 990 | 199 ms | 828 ms | 1396 ms | 1912 ms | 10 × quota_refused (correct refusals) |
| PUT original | 990 | 239 ms | 402 ms | 498 ms | 1198 ms | 0 |
| process (route, incl. sharp) | 990 | 6341 ms | 9140 ms | 11 403 ms | 13 672 ms | 0 |

- Sustained commit throughput: **~4.5–4.7 commits/s, flat** across the whole
  burst (buckets 30 s → 210 s all within 4.3–4.7/s); no degradation as the
  session grew from 0 to 1000 photos.
- The 6.3 s process p50 is the **local rig saturating, not Convex**: the
  route's own transform timings show `prepare` (decode+rotate) at p50
  2328 ms under load vs ~50 ms idle — CPU queueing across ~dozens of
  concurrent sharp runs on one box. In production this stage is Vercel
  functions scaling horizontally.
- Reserve latency p50 199 ms vs ~100 ms idle, p99 1.4 s: visible inflation
  consistent with server-side OCC retries against the commit stream (reserve
  reads the space+session rows every commit writes), but **zero**
  client-visible OCC failures and no refusals other than the correct quota
  ones.
- **The wall never blanked**: 515 reactive updates, commit→wall lag p50
  345 ms / p99 1054 ms / max 1.3 s, window pinned at 60, `count` ended at
  exactly 1000. The one 20 s update gap sits in the drain tail when commits
  went sparse — the feed only re-runs when something commits.
- Ground truth after the run (`memoriesLoadSeed:verify`): 200/200 guests at
  **exactly** `ready = 5`, `session.photoCount = space.totalPhotos = 1000 =`
  the index count of ready rows, per-guest rollups equal to per-guest index
  counts. **Zero drift, zero quota leak.**

**Step 0 discipline:** this run never pushed the commit path past ~5
concurrent commits — the local transform stage capped arrival, exactly the
"too gentle" case the hypothesis section anticipated. H1 is NOT falsified by
Run 1; the ladder escalates below.

### Run 2 — a flood ladder that measured the wrong thing (kept for the record)

The first escalation ladder (direct engine: reserve → PUT original →
`uploadContext` → PUT 3 pre-encoded variants → `commitProcessed`, 300 photos
per rung) produced numbers that *looked* exactly like H1: mutation p50
~2.2 s @ 24 in-flight, ~4.4 s @ 48, ~8.7 s @ 96, throughput flat at
~3.4 photos/s, storage PUTs unaffected at ~220 ms — and, damningly for the
attribution, **implementing the sharded counter moved none of it** (the
after-ladder reproduced every number within noise).

Chasing that discrepancy instead of explaining it away found the truth in
three discriminator experiments:

1. **Cold-space probes**: during a 48-way flood of the load space, reserve
   mutations against the untouched quota space, from a separate process, ran
   at 85–160 ms — no deployment-wide queue.
2. **Hot-space probes**: mutations against the *flooded space itself* from a
   separate process ran at 90–580 ms while the flood process's own mutations
   waited ~4 s — the wait was inside the load generator.
3. **Split flood**: the same 300 photos split across two processes (150 @ 24
   each, disjoint guests) finished in 18 s — **~16.7 photos/s aggregate,
   5× the "plateau"**.

The cause, confirmed in the `convex` package source: **`ConvexHttpClient`
queues mutations per client instance** ("Mutations are queued by default",
bypassable per call with `skipQueue`). One shared client turned the 96-way
"flood" into a single-file line; the observed latency was in-flight ×
~90 ms of service time, the tight p50≈p99 distributions were the queue's
FIFO signature, and the plateau was 1/(3 mutations × 90 ms). The harness
now passes `skipQueue: true` on every protocol mutation with a 60 s
deadline (a run also surfaced silently-dead parallel keep-alive sockets on
Windows, which the deadline converts into classified, retryable failures).

Recorded because it is the kind of number that ships wrong conclusions:
a load generator that serializes client-side will always "confirm" a
server-side bottleneck.

Worth recording for the product, not fixing here (not run-proven on
phones): the real client's reserve/renew calls
(`lib/memories-client/backend.ts`) go through the same `ConvexHttpClient`
default queue and have no timeout and no abort path in the queue's
`kick()` — a phone holding a silently-dead socket during `reserving`
waits until the OS kills the socket.

### Run 3 — the true-concurrency ladder: unsharded vs sharded, same harness

With the harness fixed, the same ladder became a controlled A/B: the
unsharded commit (direct `session.photoCount` / `space.totalPhotos`
patches, temporarily redeployed) versus the sharded commit
(`convex/lib/countShards.ts`, 16 shards per counter). 300 photos per rung,
disjoint per-worker guests, wall subscribed, reset between ladders.

**Unsharded (the code as it was before this task):**

| in-flight | committed | OCC-exhausted step errors (reserve/claim/commit) | reserve p50/p95/p99 | commit p50/p95/p99 | throughput |
| --- | --- | --- | --- | --- | --- |
| 24 | 300/300 | **38** (22/4/12) | 172 / 673 / 1228 ms | 132 / 639 / 1156 ms | ~13/s |
| 48 | 300/300 | **133** (72/17/44) | 208 / 1044 / 1352 ms | 156 / 931 / 1243 ms | ~14/s |
| 96 | 178/178¹ | **163** (52/20/91) | 262 / 1134 / 1493 ms | 156 / 1204 / 1402 ms | ~17/s |

**Sharded (the shipped fix):**

| in-flight | committed | OCC-exhausted step errors | reserve p50/p95/p99 | commit p50/p95/p99 | throughput |
| --- | --- | --- | --- | --- | --- |
| 24 | 300/300 | **0** | 96 / 175 / 194 ms | 94 / 209 / 328 ms | ~30/s |
| 48 | 300/300 | **0** | 100 / 216 / 239 ms | 88 / 308 / 462 ms | ~33/s |
| 96 | 241/241¹ | **4** (commit only) | 156 / 377 / 389 ms | 185 / 720 / 977 ms | ~24/s |

¹ Every "failure" in both ladders was `quota_refused` on reserve — the
cumulative fill of the ladder pushing guests to their 5-photo limit, refused
exactly (122 unsharded, 59 sharded); zero photos were lost to anything else
in any rung.

**H1's verdict, finally honest:**

- The mechanism is real. On the unsharded code, true concurrency produces
  **client-visible `OptimisticConcurrencyControlFailure` errors after
  Convex's server-side retries give up** — on the commit itself, and on
  reserve/claim, whose read sets include the very session/space rows every
  commit writes. The retry burden grows superlinearly with concurrency
  (38 → 133 → 163 step-errors per 300 photos); at 96-way, 30 % of commits
  needed a client retry. No photo was lost — the client contract's
  retry-with-backoff absorbed every one — but that budget (6 attempts) is
  the only thing between this failure mode and a guest-visible error.
- The sharded counter **moved the number**: OCC step-errors 38/133/163 →
  **0/0/4**, reserve p95 at 48-way 1044 → 216 ms, commit p95 931 → 308 ms,
  sustained throughput roughly doubled to 24–33 photos/s — and the counter
  stayed exact: after 841 concurrent commits, `session.photoCount` =
  `space.totalPhotos` = the index count of ready rows = 841, and the shard
  sum matched per-guest index counts guest for guest.
- The residual 4 OCC retries at 96-way are the expected 1-in-16 shard
  collisions (and they retried clean); raising `COUNT_SHARDS` buys more
  headroom linearly if a rig ever demonstrates the need.

### Run 4 — the quota attack (H2), on the shipped code

40 guests on the limit-3 space, each firing **8 parallel `reserveUpload`
calls** (320 attempts), every won slot driven through PUT → claim → PUT
variants → commit, all guests attacking simultaneously:

- **Exactly 3 committed photos per guest — 40 for 40, 120 total.** 200
  reservation attempts refused with the quota message. Zero guests at 4.
  Zero drift between rollups and index counts. One commit needed an OCC
  retry (three parallel commits racing on one guest's own row — an attack
  artefact; the real client is sequential per device).
- Combined with the accidental H2 data from Runs 1–3 (10 + 100 + 122 + 59
  refusals, each refusing precisely the overflow and nothing else), the
  same-transaction index-count gate held exact under every concurrency
  shape this harness produced. **The quota does not leak.**

### The wall, across every run

The `wallFeed` subscription stayed connected through all ~2 900 committed
photos of the campaign: **zero blank frames**, window pinned at 60, commit→
wall-update lag p50 0.35–0.8 s, p99 0.9–1.2 s, worst single gap outside
drain tails ~10 s at the artifact-stall, and the social-proof `count` ended
byte-exact on every verify. A projector running this feed would simply have
kept filling.

### H3 — the rate limiter under one NAT

Answered from code in Step 0 and corroborated by the runs: `reserveUpload` /
`renewUploadUrl` are keyed per guest, and across ~3 900 reservation attempts
the harness recorded **zero** `rate_limited` refusals. The remaining edge is
scan-time (`guestCreate`, per-IP, 30 instant + 1/s refill): a synchronized
first-minute surge of 60+ scans behind one NAT would refuse roughly its
second half; it self-heals within a minute and touches only the scan, never
uploads. Recorded, not fixed — the run cannot exercise the Next resolver's
IP hashing from one machine honestly.

---

## Step 3 — what was fixed, and what deliberately was not

**Fixed (proven by the before/after pair above):**

1. `commitProcessed` no longer patches `session.photoCount` /
   `space.totalPhotos` directly; it bumps one of 16 counter shards per
   rollup (`convex/lib/countShards.ts`, new `memoriesCountShards` table).
   Readers (`wallFeed`, `guestSpaceView`, client panel, dev/load seeds) sum
   base field + shards; the base fields keep historical values so no
   migration was needed. `guest.photoCount` stays a direct patch — a real
   guest's commits are sequential by construction. Covered by the updated
   commit test (`convex/memoriesPipeline.test.ts` asserts the session/space
   docs are untouched and the shard sums move).
2. The harness itself: `skipQueue` on every mutation, 60 s deadlines,
   disjoint guest partitions, cold/hot probe tooling — so the next
   measurement starts honest.

**Recorded, not fixed (the run did not prove them):**

- The real client's `reserve`/`renew` have no timeout/abort path
  (silently-dead-socket hang; see Run 2).
- `guestCreate`'s first-minute scan-burst ceiling behind one NAT (H3).
- `COUNT_SHARDS` sizing beyond 16 (4 residual OCC retries at 96-way is not
  a problem).

---

## Verdict

**Two hundred phones work as built.** The realistic night (Run 1: 200
devices, 990 photos, burst arrivals, wall live) completed with zero lost
uploads, exact quotas, exact rollups, and a wall that never blanked. On the
commit path the shipped sharded-counter code sustained 96 concurrent
in-flight photos at ~24–33 photos/s with p99 under ~1 s per protocol step
on a **dev-tier deployment** — an order of magnitude above the real night's
average demand (1000 photos over 15 min ≈ 1.1/s) and comfortably above any
burst minute of it. The transform stage is the only stage this rig could
not scale (one machine ran all of sharp; production runs it on horizontally
scaling Vercel functions), and its numbers are reported as rig context, not
product limits.

At **500 phones**, nothing measured here breaks on the Convex protocol
side: demand (~2.8 photos/s average, tens-of-photos-per-second burst peaks)
sits inside the measured sharded capacity, and the residual shard-collision
rate grows linearly and retryably. The first things that break are outside
this protocol, in order of likelihood: the venue's own uplink (500 × ~1 MB
originals in the burst minutes), the scan-burst `guestCreate` ceiling if
hundreds of guests scan within the same first minute behind one NAT, and —
on the old unsharded code, had it shipped — the OCC retry burden that this
task measured and removed.
