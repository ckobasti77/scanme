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
