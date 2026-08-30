# TASK-24 — 200 telefona: the load test that decides if this ships

Everything built so far was proven correct one guest at a time. The night this
product is actually for is a full club: two hundred phones on the same overloaded
Wi-Fi, most of them uploading in the same fifteen minutes after midnight, one
projector wall re-rendering while they do. Nothing in the suite has ever run that
shape. This task runs it, finds where it breaks, and writes down the numbers.

**The deliverable is a measurement and a verdict, not a green checkmark.** A run
that finds nothing is a run that was too gentle — say so and make it harsher.

---

## Step 0 — the hypothesis, stated before the run

Write the hypothesis down first so the run can falsify it rather than confirm it.

`convex/memoriesPipeline.ts` (~line 313) patches `session.photoCount` on **every**
commit, and `guest.photoCount` beside it. That is one document written by every
upload of the night. Convex mutations are serializable: two hundred phones
committing into one session means two hundred writes contending for one row, each
losing write retried by OCC. The suspicion is that throughput collapses there —
and, worse, that under sustained contention some commits exhaust their retries.

Two more places to interrogate with the same eye:

- **The quota gate.** RFC-001 makes quota enforcement an index-count in the *same
  transaction* as the `reserved` insert. That is exactly the pattern OCC is
  supposed to make safe. Prove it: a card whose limit is 3 must end the run with
  **exactly 3** committed photos, never 4, no matter how many phones raced. A
  quota that leaks under concurrency is a paid-plan bypass.
- **`@convex-dev/rate-limiter` on `reserveUpload`.** Two hundred phones behind
  one venue NAT can look like one IP. If the limiter is keyed such that a busy
  room throttles itself, the product fails in the room while every test passes.
  Determine what the key actually is under a shared IP and state the answer.

---

## Step 1 — the harness

`scripts/load/` — a Node script driving a **real deployment** over the network
(`npx convex dev` against `expert-pelican-136`, or a scratch deployment; do not
run this against anything with real data). `convex-test` cannot answer this
question — it has no OCC, no network, no concurrency. Using it here would produce
a confident, meaningless number.

Shape it like the real night:

- **200 virtual guests**, each a distinct `guestKey`, spread across ~25 table
  cards on one space, on the `standard` plan (5 photos each).
- Full protocol per photo — `reserveUpload` → PUT the bytes → `commitUpload` —
  using the real client pipeline's contract from `lib/memories-client/`. Payloads
  are real JPEG/WebP bytes at phone resolutions, not 1 KB stubs: the sharp step
  is part of what is being measured.
- **Sequential per device, concurrent across devices** — that is the actual
  production shape (`lib/memories-client/queue.ts`), and it is what makes the
  session rollup hot.
- Arrival modelled on a real room: a burst at the start, then a heavy tail. A
  uniform arrival rate is the one distribution that will not find the bug.
- **The wall runs during the whole test.** Its `wallFeed` query is reactive and
  reruns on every commit; a headless client subscribed for the duration is part
  of the load, not an observer of it.

Configurable via flags so the run can be re-pointed and re-scaled without editing
the script. Never wired into `npm run check` — this is an operator tool.

---

## Step 2 — run it, and record what actually happened

`docs/perf/memories-load.md`, with real numbers from a real run:

- Total photos attempted / committed / failed, and **every failure classified by
  cause** (OCC exhaustion, rate limit, timeout, storage, client). "Some failed"
  is not a finding; "11 commits failed with OCC after 4 retries, all on the
  session rollup" is.
- Latency distribution per protocol step: p50, p95, **p99**, max. The p99 is the
  guest standing there watching a spinner and deciding this thing is broken.
- Sustained throughput (commits/sec) and whether it **degrades** as the session
  grows — the shape of the curve matters more than its peak.
- The wall's behaviour under it: did the feed keep updating, did latency rise,
  did anything blank.
- The quota verdict, stated as a count: N cards with limit 3 ended with exactly
  3N committed photos, or here is where it leaked.
- The rate-limiter verdict under a shared IP.

Then a plain **verdict paragraph**: does 200 phones work as built, yes or no, and
what is the first thing that breaks if it goes to 500.

---

## Step 3 — fix what the run proves, and only that

If the session-rollup contention is real, the fix is a **sharded counter**: N
counter rows per session, each commit picking a shard, the read summing them.
Convex's own sharded-counter component is the reference. Implement it **only if
the run demonstrates the problem**, and re-run to prove the number moved — a
before-and-after pair in the same file. Optimising an unmeasured hot spot is how
correct code gets broken for nothing.

If the quota leaked, that is not a tuning issue — that is a defect, and it gets
fixed and covered by a test before anything else in this task is considered done.

Do not fix things the run did not find. Record them and stop.

---

## Constraints

- **ScanMe Links is frozen.** `npm run check` clean, `harness:check` and
  `harness:namespace` included.
- No R2, no CDN, no migration work — everything stays on Convex.
- Serbian ekavica for any user-visible string (this task should add none).
- A measured number that lives only in a chat transcript does not exist. It goes
  in `docs/perf/memories-load.md` or it did not happen.
