# TASK-14 — Memories: card resolver, guest identity, quota

**Mode:** goal · **Model:** Fable · **Effort:** max · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md` — the wall-clock rule, the rate-limiter guidance, scheduler patterns
3. `docs/architecture/RFC-001-venue-memories.md` — §1.e (the audited inflation hole), §2.4 C.4–C.7
   and C.9–C.12, §2.6, §2.7, §2.9
4. `convex/venue.ts` — the lifecycle/OCC patterns to follow
5. `convex/lib/entitlements.ts`, `convex/lib/plans.ts`

## What this task is

The layer that answers **"who is this person, and may they upload?"** — the printed card's
resolver, the guest cookie, sessions, and the quota reservation.

**No image handling of any kind.** No upload, no HEIC, no sharp, no storage, no gallery, no
React. The pipeline is TASK-15/16, the guest UI is TASK-17. Everything here must be provable with
`convex-test` and `curl`.

The tables (C.4–C.7, C.9–C.12) already exist in `convex/schema.ts` from TASK-03/04. This task
writes the functions.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links components/admin` must
  print **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through the i18n layer (`lib/i18n/sr/memories.ts`, `resolver.ts`). No hardcoded
  Serbian.
- No query may read the wall clock. Session and space state is materialized by mutations and
  crons, exactly as Venue's lifecycle is.

---

## STEP 1 — The card resolver

`app/r/[cardCode]/route.ts` — a GET route handler returning a **server-side 302**. This is the
only thing printed on a physical card, so it must be right.

- `export const dynamic = "force-dynamic"`, `Cache-Control: no-store` on every response. GET
  handlers are otherwise cacheable and a cached redirect would send every guest to one place.
- **`requestId` is generated in the handler**, never accepted from the client. RFC §1.e audited
  the existing Links endpoints, where client-supplied UUIDs let anyone inflate the counters. For
  Memories the same hole would let anyone mint scan events; close it for every new endpoint.
- `convex/cards.ts` → `resolveAndRecord({ cardCode, requestId, deviceCategory })`: resolve
  `by_cardCode` → `currentTargetId`, record `cardScanEvents` + `dailyCardMetrics` (idempotent on
  `by_requestId`), rate-limited per IP.
- Targets: unknown or disabled card → `302 /r/nevazeca`; `venue` → `302 /{slug}/venue`; `event` →
  the event page; `service_page` → that profile's slug; `url` → external, validated by
  `isSafePublicDestination`; `memories_space` → get-or-create the guest, set the cookie,
  `302 /m/{code}`.
- **The URL the guest lands on must be clean** — no card code in the address bar or in referrers.
  Also add `app/r/nevazeca/page.tsx` (a static sibling wins over `[cardCode]`).

Also implement **retargeting**: insert a new `cardTargets` row and patch `cards.currentTargetId`.
Printed cards never change; the target does. Immutable target rows are the audit trail.

## STEP 2 — Guest identity

Per RFC §2.6, and note the reasoning as you go — this is the part most likely to be
misunderstood later.

- The cookie is set by the **Next.js route handler**. An HttpOnly cookie cannot be set from client
  JS, and the Convex client cannot set cookies on the app's domain at all. This is a hard
  requirement, not a preference.
- Value: `base64url(guestKey) + "." + base64url(HMAC-SHA256(guestKey + ":" + spaceCode, SCANME_GUEST_SECRET))`.
  Attributes exactly: `HttpOnly; Secure; SameSite=Lax; Path=/m/{code}; Max-Age=31536000`.
- `guestKey` is 256-bit from a CSPRNG. **Possession is the capability.** Convex public functions
  take `{ code, guestKey }` and look up `memoriesGuests.by_spaceId_and_guestKey`. The HMAC is
  verified at the Next layer so Convex queries stay deterministic and cacheable with no crypto.
- `app/api/m/[code]/restore/route.ts` — the localStorage-mirror recovery path: re-validate the
  HMAC, re-set the cookie. A guest who loses both simply becomes a new guest; that is acceptable
  by design.
- Declare `SCANME_GUEST_SECRET` in `convex/convex.config.ts` and document it in `.env.example`.

**Write this in the code comments and in your report:** the quota is a *soft* limit and
explicitly **not** a security boundary. Minting new guests is intentionally cheap. Forging a
*specific other guest's* access requires their key, and that is the only property that matters.
Do not add SMS, email, accounts, or fingerprinting to "harden" it.

**The card identifies the table; the cookie identifies the person.** Quota is per person,
statistics are per card. Denormalize `cardId` onto rows that need it so table stats survive a
guest re-cookieing.

## STEP 3 — Sessions

Per RFC §2.4 C.5. Photos always hang off a session, so galleries, quota and stats have one shape.

- **recurring**: the session is lazily get-or-created by the first reservation of the night. The
  mutation computes the cutoff-shifted `dateKey` (Belgrade, `nightCutoffHour` default 6, so a
  01:00 photo belongs to yesterday's night) — reading the clock in a *mutation* is legal. Creation
  schedules `internal.memories.closeSession` at the next cutoff, with a cron as backstop.
- **one_off**: exactly one session, created at activation, closed by the scheduler at
  `windowEndAt`.
- Reuse the Belgrade `dateKey` helper rather than adding a fourth copy of it (RFC §1.f found three).

## STEP 4 — Quota, the part that must not race

`memories.reserveUpload` — a Convex mutation. This is the enforcement point.

- Count the guest's non-deleted photos via `by_sessionId_and_guestId` with `.take(limit + 1)`,
  compare against `entitlement.photosPerGuest + Σ matching quotaAdjustments`, and insert the
  `reserved` row **in the same transaction**. Convex mutations are serializable with OCC retry, so
  two concurrent reservations cannot both observe n−1 and both insert.
- **`reserved` rows count toward the quota** — otherwise a client opening ten parallel uploads
  bypasses it.
- Do **not** use `@convex-dev/rate-limiter` for the quota itself: it models rates per period, not
  lifetime caps with admin grants and delete-refunds. Do mount it (this task is its first real
  consumer) and use it for per-IP card resolution, guest creation, and per-guest reservation
  bursts.
- Do **not** keep a counter document: deletes and moderation would need drift-prone decrements.
  Counting ≤ ~20 rows is cheap and self-healing.
- Upload window: `space.status === "active"` and `session.status === "open"`; `one_off`
  additionally re-checks `windowStartAt <= now <= windowEndAt`.
- Entitlement resolution passes the `spaceId` so a space-scoped plan wins (TASK-04 §0.2).

Also: `quotaAdjustments` — the admin grant that raises or resets a guest's limit. Additive only,
so enforcement stays pure arithmetic and deletions refund automatically.

## STEP 5 — Crons

Add to `convex/crons.ts`, beside the entitlement and Venue sweeps: close stale open sessions, and
purge `reserved` rows older than 24 hours. Document that retention and blob purging arrive with
the pipeline.

## STEP 6 — Tests

`convex-test`:
- The (limit+1)th reservation is rejected at each tier — 3 / 5 / 10.
- Concurrent reservations never exceed the limit.
- A `quotaAdjustments` grant admits exactly `extraPhotos` more; deleting a photo refunds a slot.
- A wrong `guestKey` yields an empty result, never another guest's data.
- Reservation outside the upload window is rejected; a closed session is rejected.
- Recurring: a 01:00 reservation lands in the previous night's `dateKey`.
- The same server `requestId` records one `cardScanEvents` row, not two.

`curl` against the dev deployment, output pasted:
- `curl -i /r/<code>` → `302`, correct `Location`, and for a memories target a `Set-Cookie`
  containing `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/m/<code>`.
- Unknown code → `302 /r/nevazeca`.
- The landing URL contains no card code.

---

## Do not touch

`components/**`, `convex/scanMeLinks.ts`, `convex/lib/scanMeDesignValidators.ts`,
`lib/scanme-links*.ts`, `lib/scanme-palette.ts`, `harness/goldens/**`, `app/[slug]/**`,
`globals.css`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links components/admin` prints nothing.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. **Zero image-handling code** — no upload, no HEIC, no sharp, no storage writes. State this.
4. `npm run check` green; `npm run test` green with existing suites unchanged.
5. Every Step 6 test exists and passes — list them; paste the `curl` output verbatim.
6. No query reads the wall clock — how you verified.
7. No endpoint accepts a client-supplied `requestId` or idempotency token — how you verified.
8. The cookie attributes, verified from real response headers, not from the source.

Report in plain language: the resolver's flow, why the cookie must be set at the Next layer, why
the quota cannot race, what is deliberately soft about it, the outputs above, and every assumption
you made.
