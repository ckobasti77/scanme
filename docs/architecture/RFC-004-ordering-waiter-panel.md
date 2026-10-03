# RFC-004: ScanMe poručivanje i panel konobara (Ordering & Waiter Panel)

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 2026-09-03 |
| **Scope** | The design and architecture of **table ordering and the waiter panel** — two guest actions and one staff surface. Two levels, both in v1: **(a) pozivanje konobara** (call the waiter) and **(b) poručivanje** (a structured order request). Four things, tightly coupled: **(1)** the guest reaches an ordering page whose table identity (`cardId`) is minted through the **exact same card-aware server hop as Memories** — a bare client link is forbidden; **(2)** an **acceptance model** where a **heartbeat** proves the tablet is alive *before* the guest orders and a waiter **acceptance** proves a human looked *after*, with a single guest "unavailable" state fed by two causes; **(3)** a **staff/shift/PIN** identity built from scratch (the codebase has none), routing orders to an open shift; **(4)** ordering + panel expressed as a **Venue capability** through the existing entitlement chain with **zero change to `convex/lib/access.ts`**. **There is no payment in the app** — a hard, reasoned decision (§2.3), not an omission. This RFC produces only the document — **no production code and no schema change land in this task**; the tables and modules below are *specified*, and the tasks in §4 are what create them. |
| **Baseline** | Branch `feat/venue-memories` at `2911ee4`; Next.js `16.2.12`, React `19.2.8`, `convex ^1.44.0`, `@convex-dev/rate-limiter ^0.3.2` ([package.json](../../package.json)). Sits on top of **[RFC-001](./RFC-001-venue-memories.md)** (Venue + Memories), **[RFC-002](./RFC-002-pricing-and-purchase.md)** (pricing + purchase + accounts + the splitter), and **[RFC-003](./RFC-003-scanme-menu.md)** (Menu), whose card resolver, guest-minting hop, entitlement chain, rate limiter, reactive wall, and reservation reserve→commit are **already shipped** on this branch and are treated here as existing code, not as proposals. |

**How to read this document.** It mirrors [RFC-003](./RFC-003-scanme-menu.md), which mirrored [RFC-002](./RFC-002-pricing-and-purchase.md) and [RFC-001](./RFC-001-venue-memories.md). §1 is the audit of what exists today — every claim cites a file (and where useful a symbol or line range) at the baseline above. §2 is the target architecture; the two levels, the no-payment rule, the acceptance model, and the shift/PIN requirement were fixed by the owner before this RFC and are treated as constraints (§2.0) — §2 records where codebase evidence shaped *how* they are realized and where evidence forced a decision. §3 is the risk register, §4 the ordered implementation sequence (the tasks this RFC spawns, numbered **TASK-62** upward, one prompt each), §5 the open questions, §6 the ScanMe-Links freeze ledger. **Every decision states what was rejected and why** — RFC-001 earned its keep through its rejected options, and this document owes the reader the same. **Five decisions were explicitly delegated to this RFC** (running tab, table sharing, spam, panel alerting, kitchen); each is decided to the end in §2 with its rejected alternative.

**Two decisions are load-bearing and are made to the end, not described** (§2.2 and §2.6): the table's identity must survive into the order the same way it survives into a Memories photo — through the card-aware minting hop, never a bare link (this is the gap [TASK-37](../tasks/BLOCKED.md) closed for Memories, RFC-002 §2.4); and an order must **never fall into a void** — a dead tablet disables ordering *before* the guest composes it (heartbeat), and an unaccepted order turns into an *action for the guest* at 7 minutes, never a silent cancel (acceptance). If either is left vague, an order is worthless (no table) or lost (no panel).

**Glossary.** *Poručivanje* = the ordering product (Serbian throughout, ekavica). *Poziv konobara* = the call-waiter action, level (a). *Porudžbina* = a structured order request, level (b). *Zahtev / service request* = either action as one row (`serviceRequests`, §2.16). *Sto / table* = a printed card on a table, identified by its `cardId` (RFC-001 §2.6, RFC-002 §1.d). *Ordering guest* = an anonymous per-scan bearer minted with the table's `cardId`, the ordering twin of a Memories guest (§2.2). *Smena / shift* = a manned panel session opened by a PIN (§2.7). *Otkucaj / heartbeat* = the panel's periodic "I am alive" ping that gates whether a guest can order at all (§2.6). *Prihvatanje / acceptance* = the waiter tapping "Prihvati" on a request (§2.6). *Panel* = the waiter's staff surface on the till-side tablet (§2.7). *Živi status* = the guest's live Poslato → Prihvaćeno → Stiže view (§2.5, §2.8). *Overdue* = a request unaccepted past the window (default 7 min), which becomes a guest **action** (§2.8).

---

## 1. Audit of the existing platform

### 1.a The card resolver and the card-aware minting hop — the table's identity is already solved

RFC-002 §1.d and §2.4 established, and the codebase now ships, the one mechanism this product's identity depends on: a printed card's `cardId` reaches a guest page **only** through a server hop that mints the guest with that `cardId`. Ordering reuses it verbatim.

- **The resolver.** `app/r/[cardCode]/route.ts` `GET` ([app/r/[cardCode]/route.ts:35-108](../../app/r/%5BcardCode%5D/route.ts)) generates the idempotency `requestId` **server-side** ([:50](../../app/r/%5BcardCode%5D/route.ts), comment: "never read from the request … client-supplied UUIDs let anyone inflate counters") and calls `api.cards.resolveAndRecord` ([:52-57](../../app/r/%5BcardCode%5D/route.ts)). `resolveAndRecord` ([convex/cards.ts:554-678](../../convex/cards.ts)) rate-limits on `cardResolve`, records the scan once per `requestId` ([:584-624](../../convex/cards.ts)), and switches on `cardTargets.kind` ([:626-676](../../convex/cards.ts)). The kinds are `memories_space | venue | event | service_page | url | splitter` ([convex/schema.ts:82-89](../../convex/schema.ts)).
- **THE minting path.** `mintSpaceGuest` ([convex/cards.ts:515-542](../../convex/cards.ts)) is the shared function; its header states the contract verbatim — *"every route from a printed card into Memories runs THIS function or none."* It rate-limits `guestCreate`, generates a 256-bit base64url `guestKey`, and inserts `memoriesGuests` with `cardId: params.cardId` ([:532-540](../../convex/cards.ts)), commenting *"the card is attributed as the TABLE (guest.cardId) … quota is per guest, statistics per card."*
- **The splitter's card-aware second hop.** A bare splitter routes to `/r/[cardCode]/izbor`; its Memories button href is the **server hop** `/r/[cardCode]/m?space=<code>` ([convex/cards.ts:729-734](../../convex/cards.ts)), never a client `/m/[code]` link. `app/r/[cardCode]/m/route.ts` ([:25-71](../../app/r/%5BcardCode%5D/m/route.ts)) calls `resolveSplitterMemories` ([convex/cards.ts:800-852](../../convex/cards.ts)), which validates the card is a `splitter`, applies an **anti-oracle guard** (mint only for a space the splitter actually offers, [:833-842](../../convex/cards.ts)), and calls the same `mintSpaceGuest` with `cardId`. The route header is explicit: *"A plain client link from the splitter page to /m/[code] is FORBIDDEN: … the guest would have no cardId, the table identity would be lost."*
- **The cookie.** `lib/memories-guest-cookie.ts` builds `base64url(guestKey).base64url(HMAC-SHA256(guestKey:code, SCANME_GUEST_SECRET))` and sets `HttpOnly; Secure; SameSite=Lax; Path=/m/${code}; Max-Age=1yr` ([lib/memories-guest-cookie.ts:76-78](../../lib/memories-guest-cookie.ts)). The `Path` scoping is why the `/r` resolver can never see an existing cookie and always mints fresh, and why guest endpoints must live **under** the code path (RFC-001 §2.7).
- **The Links-page block, refused at creation.** `assertLinksPageCannotReachMemories` ([convex/cards.ts:134-154](../../convex/cards.ts)) throws `cardLinksMemoriesBlocked` if a `scanme_links` profile's destinations reach `/m` — *"Loud at mint time, never a silent quota leak at scan time."*

**Verdict.** *Reusable as-is:* the resolver, `mintSpaceGuest`'s contract, the card-aware-hop pattern, the HMAC-cookie discipline, and the "refuse the Links-page path at creation" guard. *Extend (additively):* a `table_ordering` card-target kind + splitter item, an `mintOrderingGuest` twin, a `/r/[cardCode]/o` hop, and a symmetric `assertLinksPageCannotReachOrdering` (§2.2, §2.14, §6). *Must not touch:* the frozen ScanMe Links render path — ordering forks nothing from it.

### 1.b Reserve→commit and materialized presence — never read the wall clock in a query

The venue reservation system is the template for time-bounded state that a query must read without a clock, which is exactly what a heartbeat and a 7-minute deadline need.

- **The soft hold.** `venueReservations.submit` ([convex/venueReservations.ts:155-284](../../convex/venueReservations.ts)) inserts a `pending` row with `heldUntil = now + RESERVATION_HOLD_MS` (2 h, [:56](../../convex/venueReservations.ts), [:262-275](../../convex/venueReservations.ts)) and schedules the **exact-time flip** `ctx.scheduler.runAt(heldUntil, internal.venueReservations.expireHold, …)` ([:278-280](../../convex/venueReservations.ts)). `expireHold` is idempotent ([:361-369](../../convex/venueReservations.ts)).
- **The backstop.** A 15-minute cron `sweepExpiredHolds` sweeps `by_status_and_heldUntil` for `pending` rows past `heldUntil` ([convex/venueReservations.ts:371-386](../../convex/venueReservations.ts); wired [convex/crons.ts:85-90](../../convex/crons.ts)). The doctrine is stated at [convex/crons.ts:4-9](../../convex/crons.ts) and [convex/venueReservations.ts:38-42](../../convex/venueReservations.ts): *crons back materialized state so **no query ever reads the wall clock**.*
- **Reserve→commit with re-check.** Owner `confirm` ([:510-528](../../convex/venueReservations.ts)) is the commit; if the hold expired, `assertConfirmCapacity` re-checks before re-taking a unit ([:476-508](../../convex/venueReservations.ts)). Double-booking is prevented by Convex serializable OCC plus a conservative read cap, **not** a unique index ([:240-242](../../convex/venueReservations.ts), [:64](../../convex/venueReservations.ts)).
- **The same idiom elsewhere.** `ctx.scheduler.runAfter(0, …)` resumable fan-out (`enterpriseProvisioning.provisionEnterpriseLocations` [convex/enterpriseProvisioning.ts:167-208](../../convex/enterpriseProvisioning.ts)); the Memories upload state machine `reserved → processing → ready` ([convex/memories.ts:335-454](../../convex/memories.ts), [convex/memoriesPipeline.ts:246-337](../../convex/memoriesPipeline.ts)); the import-free protocol vocabulary ([lib/memories-pipeline/protocol.ts](../../lib/memories-pipeline/protocol.ts)); the client queue with reserve-once/renew/release/offline-hold ([lib/memories-client/queue.ts](../../lib/memories-client/queue.ts)).

**Verdict.** *Reusable as-is:* the "materialized state + `runAt` flip + cron backstop, never a clock in a query" doctrine, and the OCC single-winner pattern. *Extend (additively):* a heartbeat that reschedules a `markShiftStale` flip (§2.6), a 7-minute `markOverdue` flip (§2.8), and a one-open-shift-per-venue OCC guard (§2.7). *Must not touch:* the reservation tables — ordering has its own.

### 1.c Entitlements — ordering plugs into the Venue gate without touching `access.ts`

Two orthogonal gates coexist (RFC-002 §1.b, RFC-003 §1.c): *ownership* is `serviceProfiles.status === "active"`; *capability* is `getEntitlement`. Ordering is a Venue capability layered on the second.

- **`getEntitlement` is the single read path** ([convex/lib/entitlements.ts](../../convex/lib/entitlements.ts)); no caller reads the `entitlements` table directly. It resolves space → business → account plan → null and returns `{ planKey, limits, status }`.
- **Venue limits live in code** ([convex/lib/plans.ts:28-66](../../convex/lib/plans.ts)): `VenueLimits` ([:28-34](../../convex/lib/plans.ts)), `PLAN_LIMITS.scanme_venue` (`basic` = `{ allowedBlockKeys, maxActiveEvents: 1, analytics: false }`, `premium` = all + `analytics: true`), `ACCOUNT_PLAN_TIER.scanme_venue = { basic: "basic", premium: "premium", enterprise: "premium" }` ([:112-116](../../convex/lib/plans.ts)).
- **The read-time gate is a limit-reader helper.** `venueAnalyticsEnabled(limits)` returns `limits?.analytics === true` and **defaults a missing entitlement to the free Basic tier** ([convex/lib/plans.ts:126-149](../../convex/lib/plans.ts)). `venueAnalytics.eventMetrics` resolves `getEntitlement(ctx, businessId, "scanme_venue")`, and returns `{ status: "locked" }` on Basic — *collection always runs; only the read is gated* ([convex/venueAnalytics.ts:179-255](../../convex/venueAnalytics.ts), esp. [:193-195](../../convex/venueAnalytics.ts)).
- **`access.ts` does not read entitlements.** [convex/lib/access.ts](../../convex/lib/access.ts) is auth/membership/editor-access only; `requireServiceEditorAccess` ([:151-179](../../convex/lib/access.ts)) is already parameterized by an `allowedTypes` list, and `requireBusinessAccess` ([:102-110](../../convex/lib/access.ts)) is the product-agnostic guard the owner-config path uses.

**Verdict.** *Reusable as-is:* `getEntitlement`, the limit-reader-helper pattern, `venueAnalyticsEnabled`'s default-to-Basic shape, and `requireBusinessAccess`. *Extend (additively):* an `ordering: boolean` field on `VenueLimits`, and a `venueOrderingEnabled(limits)` helper of the identical shape (§2.12). *Must not touch:* `convex/lib/access.ts`.

### 1.d The rate limiter — mounted, token-bucketed, keyed per IP and per guest

- **Mount.** `@convex-dev/rate-limiter` is mounted at [convex/convex.config.ts:36](../../convex/convex.config.ts); the instance is built in [convex/lib/rateLimits.ts:17-65](../../convex/lib/rateLimits.ts).
- **Named token buckets** (verbatim): `cardResolve` and `guestCreate` at `rate 300 / MINUTE, capacity 300` (sized for a ~300-guest wedding behind one NAT IP, [:18-34](../../convex/lib/rateLimits.ts)); `splitterMemoriesHop` its own 300-bucket so the second hop does not double-spend `cardResolve` ([:35-43](../../convex/lib/rateLimits.ts)); `reserveUpload` / `renewUploadUrl` at `rate 30, capacity 15`; `venueReservation` at `rate 10, capacity 5`.
- **Keying.** Scan/mint limits are keyed **per IP-hash** (`cardResolve`, `guestCreate`, `splitterMemoriesHop` — [convex/cards.ts:568](../../convex/cards.ts), [:524](../../convex/cards.ts), [:810-812](../../convex/cards.ts)); upload limits are keyed **per `guest._id`** (`reserveUpload` [convex/memories.ts:350-352](../../convex/memories.ts)). **There is no per-`cardId` bucket anywhere.** The raw IP never reaches Convex — `resolverIpHash` sends only a salted 32-hex digest ([lib/card-resolver-http.ts:26-31](../../lib/card-resolver-http.ts)).

**Verdict.** *Reusable as-is:* the mounted limiter, the token-bucket sizing rationale, and the "reject with a guest-visible `{ kind: "rate_limited" }`, never a silent drop" shape ([convex/cards.ts:567-569](../../convex/cards.ts)). *Extend (additively):* an `orderSubmit` bucket keyed per ordering-guest and a `callWaiter` bucket keyed **per `cardId`** — a new keying, justified in §2.9.

### 1.e The reactive surface — the Memories wall, not the venue page

Only the Memories wall and guest surfaces are truly reactive; the public venue page is a one-shot server render.

- **The wall = the reuse target.** `app/zid/[code]/page.tsx` is a `force-dynamic` server shell that renders the **client** component `WallScreen`; the reactivity is `useQuery(api.memoriesWall.wallFeed, { code })` ([components/memories/wall/wall-screen.tsx:30,86](../../components/memories/wall/wall-screen.tsx)). `wallFeed` reads a newest-first index and bounds memory with `.order("desc").take(WALL_WINDOW)` (`WALL_WINDOW = 60`, [convex/memoriesWall.ts:43,55-121](../../convex/memoriesWall.ts)); its comment: *"Convex reruns it whenever a matching row commits, so a new photo arrives on the wall on its own."* A dropped connection degrades to an empty window.
- **The venue page is NOT reactive.** `app/[slug]/venue/page.tsx` uses `fetchQuery(api.venue.publicVenuePageState, …)` in a server component ([app/[slug]/venue/page.tsx:25-30,124-192](../../app/%5Bslug%5D/venue/page.tsx)) — one render per request, no subscription.
- **The client panel is already reactive** via `useQuery` ([components/client-panel/client-panel.tsx:57,61,64](../../components/client-panel/client-panel.tsx)), the working precedent for the waiter panel's live queue.

**Verdict.** *Reusable as-is:* the wall's `useQuery` + bounded-`take` client-component model for both the guest's live status and the panel's queue; the client panel's `useQuery` reactivity. *Rejected as a base:* the venue page's `fetchQuery` server render — it cannot push Poslato → Prihvaćeno → Stiže.

### 1.f Staff, PIN, shift, heartbeat — none of it exists; this RFC builds it from scratch

A repo-wide search for `heartbeat | konobar | waiter | staffPin | pinLogin | \bshift\b | deviceToken | kiosk` finds **no** staff role, **no** PIN login, **no** shift entity, **no** heartbeat/presence, and **no** device/session decoupled from a user account. The only authenticated surfaces are: a logged-in `users` account with an active `businessMemberships` row (owner/client panels — `client-panel.tsx` signs in with email+password via `@convex-dev/auth`), and the admin email allow-list (`requireAdmin`, [convex/lib/access.ts:54-58](../../convex/lib/access.ts)). The **closest precedent** to "a device that is not a logged-in user" is the Memories guest bearer — an anonymous per-card cookie with no account ([convex/cards.ts:515-542](../../convex/cards.ts), [lib/memories-guest-cookie.ts](../../lib/memories-guest-cookie.ts)).

**Verdict.** The staff/shift/PIN/heartbeat identity is **new**, and it is modelled on the guest bearer, not on a `users` login (§2.7). *Reusable as-is:* the guest-bearer minting + HMAC-cookie discipline (adapted to `Path=/panel/[venueCode]`), and the constant-time secret comparison used for the pipeline secret ([convex/memoriesPipeline.ts:63-78](../../convex/memoriesPipeline.ts)) for the PIN hash.

### 1.g Notifications — the panel is the channel; email is a `"use node"` Resend action

There is no shared mailer. Owner emails are a **Resend REST call inside a `"use node"` `internalAction`**, one per type: `activationRequestEmails.sendActivationRequest` ([convex/activationRequestEmails.ts:20-94](../../convex/activationRequestEmails.ts), `POST https://api.resend.com/emails`, idempotency key, env `RESEND_API_KEY`/`RESEND_FROM_EMAIL`) and `invitationEmails.sendInvitation`. Notably, **venue reservations do not email at all** — `confirm`/`decline` drive a client-side prepared **WhatsApp/Viber deep-link** (`resWhatsappAction`/`resViberAction`, [lib/i18n/types.ts:758-781](../../lib/i18n/types.ts)).

**Verdict.** v1 ordering needs **no new mail seam** — the panel (the till-side tablet) is the delivery channel, and the overdue path escalates in-app (§2.8). An optional "your panel has been offline" owner alert is future work in the `activationRequestEmails` idiom or the reservation WhatsApp/Viber idiom (§5).

### 1.h Flags and the i18n layer

- **Flags.** [lib/flags.ts](../../lib/flags.ts) holds one constant, `export const MENU_EXISTS = false` ([:17](../../lib/flags.ts)). Ordering adds a second, `ORDERING_EXISTS`, flipped only in the terminal task (§4 TASK-71); `MENU_EXISTS` is **not touched** (owner constraint 1).
- **i18n.** The four-step "add a surface" recipe (RFC-003 §1.e) is unchanged: declare a `XDict` in [lib/i18n/types.ts](../../lib/i18n/types.ts), add the key to `DictBySurface` ([:1695-1712](../../lib/i18n/types.ts)), create `sr/<surface>.ts` (`as const satisfies XDict`, so a missing key fails `npm run check`), register in [lib/i18n/index.ts](../../lib/i18n/index.ts). The 14 existing surfaces include `venue`, `venue-panel`, `memories`, `memories-panel`, `memories-wall`.

**Verdict.** *Extend (additively):* `ORDERING_EXISTS`; three surfaces `ordering`, `ordering-panel`, `ordering-admin` (§2.15). *Stays frozen and unmigrated:* the inline Serbian of the ScanMe Links render path.

### 1.i Summary table

| Area | Reusable as-is | Extend (additive) | Must not touch |
|---|---|---|---|
| Card identity | resolver, `mintSpaceGuest` contract, card-aware hop, HMAC cookie, Links-page block-at-creation | `table_ordering` kind + splitter item, `mintOrderingGuest`, `/r/[cardCode]/o` hop, `assertLinksPageCannotReachOrdering` | frozen Links render path |
| Time-bounded state | materialized-state + `runAt` + cron doctrine, OCC single-winner | heartbeat `markShiftStale`, 7-min `markOverdue`, one-open-shift OCC | reservation tables |
| Entitlements | `getEntitlement`, limit-reader helper, default-to-Basic | `VenueLimits.ordering`, `venueOrderingEnabled(limits)` | `convex/lib/access.ts` |
| Rate limiter | mounted limiter, token-bucket sizing, visible-reject | `orderSubmit` (per guest), `callWaiter` (per cardId) | IP-hash-only doctrine (raw IP never stored) |
| Reactive surface | wall `useQuery` + bounded `take`, client-panel `useQuery` | guest live status, panel live queue | venue-page `fetchQuery` as a push base |
| Staff identity | guest-bearer minting + HMAC cookie, constant-time secret compare | shift/PIN/heartbeat from scratch (`Path=/panel/[venueCode]`) | `users`/membership auth |
| Notifications | Resend `"use node"` action, reservation WhatsApp/Viber | none in v1 (panel is the channel) | — |
| Flags / i18n | `MENU_EXISTS` pattern, add-surface recipe | `ORDERING_EXISTS`, three surfaces | `MENU_EXISTS`, frozen Links Serbian |

---

## 2. Target architecture

### 2.0 Constraints (fixed inputs)

Decided by the owner before this RFC and treated as requirements:

1. **ScanMe Links is frozen; Convex only; Serbian, ekavica; `MENU_EXISTS` stays `false`.** Ordering does **not** depend on Menu and does **not** touch `MENU_EXISTS`. New strings go through the typed dictionary (§2.15); no inline literals in new code. Any decision that would require editing the frozen Links product is **BLOCKED on the owner** and collected in §6.
2. **Two levels, both in v1:** (a) call the waiter, (b) order (§2.1).
3. **This is not the Menu editor.** A separate **guest route** (`/o/[code]`) and a separate **waiter panel** (`/panel/[venueCode]`) (§2.14, §2.7).
4. **No payment in the app.** Serbian e-fiscalization is a legal constraint; ordering is a **request to the waiter**, and payment stays at the table / at the register. This is written as a decision with rationale (§2.3) so no one "adds Stripe" later.
5. **The table's identity comes from the card's `cardId`, through the same server hop as Memories.** A bare client link that does not carry `cardId` is **forbidden** — without `cardId` there is no table, and without a table an order is worthless. This is the gap [TASK-37 / RFC-002 §2.4](./RFC-002-pricing-and-purchase.md) closed for Memories (§2.2, §6).
6. **All SaaS is a subscription; the only one-time charge is the physical card.** Ordering is therefore a **subscription capability** (§2.12), never a one-time sale.
7. **The till-side tablet/phone is bought by the owner** (a cheap disposable). **The call-waiter button is absolutely optional per venue** — a per-venue config toggle independent of the entitlement (§2.1, §2.12).

Two constraints forced an implementation-level judgment call, recorded where they occur: the "no order into a void" requirement is met by a heartbeat that disables ordering *before* it happens and an acceptance action that *never* silently cancels (§2.6, §2.8); and the presence/deadline state is materialized so no query reads the wall clock (§2.6, §1.b).

### 2.1 Two levels — call the waiter, and order

Both ship in v1. They are one row type (`serviceRequests`, §2.16) discriminated by `kind`:

| Level | Serbian | Guest action | What the waiter sees |
|---|---|---|---|
| (a) Call waiter | **Pozovi konobara** | one tap, optional reason chip (Račun / Voda / Pomoć / Ostalo, §5) | a call at table N, with the reason |
| (b) Order | **Poruči** | pick items from a short list + qty + optional note | an order at table N, with the item lines |

**The call-waiter button is optional per venue** (constraint 7): a `callWaiterEnabled` toggle on the venue's ordering config (§2.16), independent of whether ordering itself is entitled (§2.12). A venue can run ordering without the call button, or — once a venue buys the capability — the call button without a curated item list.

**Rejected options.**

- *Only one level in v1 (call-waiter first, ordering later).* Rejected: the owner fixed both in v1, and they share the entire spine — identity hop, shift, panel, acceptance, live status. Splitting them ships two releases of the same plumbing for no benefit.
- *A free-text-only "order" (the guest types "2 piva").* Rejected: unstructured text is a spam magnet, cannot be shown as clean rows the waiter accepts at a glance, and gives the panel nothing to sort. The order is a short structured list (§2.13) with an optional free-text note — structure where it earns its keep, prose where it does not.

### 2.2 The table's identity — the same card-aware hop as Memories, decided to the end

**Decision: ordering reaches the guest through a card-aware server hop that mints an *ordering guest* with the card's `cardId`, sets a `Path=/o/[code]` HMAC cookie, and 302s to `/o/[code]` — the exact shape of the Memories path (§1.a). A bare client link to `/o/[code]` is FORBIDDEN.**

Written as a hard requirement, not a note (mirroring RFC-002 §2.4):

> **Every path from a card into ordering MUST pass through the card-aware hop that mints the ordering guest with that card's `cardId`. A bare client-side link from a splitter (or anywhere) to `/o/[code]` is FORBIDDEN: it would skip the minting branch, the ordering guest would have no `cardId`, the table identity would be lost, and an order with no table is worthless — the waiter would not know where to go.**

Realized as the twin of `mintSpaceGuest`:

- A new `mintOrderingGuest(ctx, { code, cardId, ipKey, now })` inserts an `orderingGuests` row with `cardId` (the ordering twin of [convex/cards.ts:515-542](../../convex/cards.ts)); it rate-limits `guestCreate` (or an `orderGuestCreate` twin) and returns a 256-bit `guestKey`.
- A new card-target kind **`table_ordering`** (a direct table card) and a `cardSplitterItem` kind `table_ordering` (an ordering button on a bare splitter). The resolver adds a one-line redirect; the splitter view emits the **server-hop** href `/r/[cardCode]/o?venue=<code>`, never a client `/o/[code]` link.
- A new route `app/r/[cardCode]/o/route.ts` calls `resolveTableOrdering`, which validates the card resolves to a `table_ordering` target (or a splitter that offers this venue's ordering), applies the **same anti-oracle guard** as `resolveSplitterMemories` (mint only for a venue the card/splitter actually offers), mints the ordering guest with `cardId`, and 302s to `/o/[code]` with the `Path=/o/[code]` cookie.
- **The Links-page path is refused at creation** by a symmetric `assertLinksPageCannotReachOrdering`, the twin of `assertLinksPageCannotReachMemories` — loud at mint, never a silent identity leak at scan (§6).

**`[code]` is the venue's ordering code** (a per-venue short code on `orderingConfig`, §2.16), the twin of `memoriesSpaces.code`; the `cardId` (the specific table) rides in the minted cookie, exactly as Memories carries the table in the guest and denormalizes it onto each photo.

**Rejected options.**

- *A bare client link from the splitter/venue page to `/o/[code]`.* Rejected by constraint 5 and by the Memories precedent — it destroys the table identity, which is the one thing that makes an order actionable. This is precisely the failure [TASK-37](../tasks/BLOCKED.md) closed for Memories.
- *Route ordering through the generic `venue` kind with no minted `cardId`.* Rejected: the public venue page carries no per-table identity (§1.e); reusing it would land the guest on a page that cannot name their table. Ordering needs the minted-`cardId` hop, so it gets its own kind, mirroring how `memories_space` earns its own kind.

### 2.3 No payment in the app — a decision, with its reason, so no one adds Stripe

**Decision: there is no payment, no cart total, no bill, and no settlement in the ordering product. An order is a *request to the waiter*; the money is handled at the table or at the register, exactly as it is today.**

The reason is legal, not technical: **Serbian e-fiscalization** requires that a sale be issued through a certified fiscal device (the register), which produces the fiscal receipt. An app that took payment or "closed a bill" would be issuing a sale outside that device — which this product must not do. The register remains the single source of truth for what is owed and what is paid.

This is stated as a constraint (§2.0 #4) **and** written into the data model: `serviceRequests` has **no** amount-owed, no "paid" state, no tab close (§2.4, §2.16). Item prices, where shown, are **informational only** (§2.13) — never summed into a total the guest is asked to pay.

**Rejected option.** *In-app payment / Stripe, even as a "later" stub.* Rejected: it would put the app on the wrong side of e-fiscalization, and even a stub invites a running total and a "pay" button that the register must then reconcile against. The honest surface is a request; payment lives where the fiscal device lives. This is recorded here, and as risk #3 (§3), specifically so a future task does not "helpfully" add it.

### 2.4 Running tab or independent orders? — INDEPENDENT (delegated decision 1)

**Decision: each request is independent — a discrete request to the waiter, never an app-computed running bill.** Requests are **grouped per table (`cardId`) and per shift** for the waiter's situational awareness ("Sto 7 has ordered three times tonight"), but there is **no monetary total, no "close the tab," and no settlement in the app** (§2.3). The per-table grouping is a soft, non-financial view — the same "statistics per table" idea Memories uses (`memoriesGuests.by_cardId`, [convex/cards.ts:453-464](../../convex/cards.ts)) — not a ledger.

**Rejected option.** *A true running tab the app totals and "closes."* Rejected on two grounds: it manufactures a bill the app is legally forbidden to settle (§2.3, e-fiscalization), and it duplicates the register's source of truth, guaranteeing drift between the app-tab and the real bill. It is also the exact seam through which "just add a pay button" enters. A request is a request; the tab lives at the register.

### 2.5 Guest scans a table that already has another guest's open order — ALLOWED (delegated decision 2)

**Decision: a second guest scanning a table with an open order is normal and must not be blocked.** A table is inherently multi-person (a four-top). Each guest is a **separate bearer** minted by the card-aware hop (§2.2), all attributed to the **same `cardId`** — the exact "identity per person, statistics per table" split Memories already ships ([convex/cards.ts:528-530](../../convex/cards.ts)). Therefore:

- **A guest sees only their own requests** (bearer-scoped) and their own live status — you do not show person A's order to person B.
- **The waiter sees the whole table's requests grouped under `cardId`** (§2.4), across all guests at that table.
- There is **no table locking** and no "one active order per table."

**Rejected option.** *Lock a table to the first guest, or allow one active order per table.* Rejected: it is absurd for a group — the second person at a four-top must be able to order — and "whose phone owns the table" has no good answer. The table is shared context; requests are per-guest and merely *grouped* for the waiter.

### 2.6 The acceptance model — heartbeat before, acceptance after, one disabled state with two causes

Both mechanisms are kept, as the owner fixed:

- **Heartbeat (before).** The panel posts a `heartbeat` every N seconds (§5) while it is alive and foregrounded, patching `orderingShifts.lastHeartbeatAt` and rescheduling `runAt(now + STALE_MS, markShiftStale, { shiftId, expectedHeartbeatAt: now })`; `markShiftStale` no-ops if a newer heartbeat arrived, with a cron backstop (§1.b doctrine). The shift's **derived availability** is a materialized boolean read by the guest query — **never a wall-clock read**.
- **Acceptance (after).** The waiter taps "Prihvati" ([acceptRequest], §2.7), flipping `sent → accepted`. Acceptance proves a human looked; the heartbeat only proved the tablet was on.

**One disabled state for the guest, two causes — exactly how it is shown.** The guest's ordering surface is enabled **iff** `(a fresh, non-stale shift is open) AND (the waiter has not paused ordering)`. It is disabled when **either**:

- **Cause A (involuntary):** the heartbeat is stale — the tablet is off, asleep, backgrounded, or offline. Ordering is disabled *before the guest composes an order*, so nothing falls into a dead panel.
- **Cause B (deliberate):** no shift is open, or the waiter manually paused ordering (rush, end of shift).

Both render the **identical, calm** guest message — *"Poručivanje trenutno nije dostupno"* — and, where the venue has it, still offer the call-waiter button or a plain "flag a waiter" line. The guest is **never** shown "the tablet is asleep" versus "the shift is closed": the remedy is the same (get a waiter's attention in person), and exposing the cause invites confusion and blame. The A/B distinction is **diagnostic** and surfaced only in the panel/owner view (so the owner knows to wake the tablet vs open a shift), never to the guest.

**Guest live status (never silence).** Once ordering is available and a request is sent, the guest sees **Poslato → Prihvaćeno → Stiže**, live, via `useQuery` (§1.e). "Stiže" is the waiter marking the accepted request en route.

**Rejected options.**

- *Heartbeat only (no acceptance), or acceptance only (no heartbeat).* Rejected: heartbeat alone lets an order sit unseen on a live-but-ignored panel; acceptance alone lets an order vanish into an asleep tablet. The owner's model keeps both — one prevents the bad experience up front, the other apologizes after — and this RFC honors it.
- *Show the guest why ordering is unavailable (asleep vs closed).* Rejected: the guest's action is identical either way, and "the tablet is asleep" reads as the venue's fault and invites a bad rating for a two-second remedy. One calm state, cause hidden.

### 2.7 The shift, the PIN, and the panel — a staff identity built from scratch

No staff/PIN/shift/heartbeat concept exists (§1.f); this is new, modelled on the guest bearer, **not** on a `users` login (a waiter is floor staff, not a ScanMe account; the owner owns the login).

- **PIN.** The owner sets one or more PINs per venue in the owner config (§2.12); each is stored as a `pinHash` compared in **constant time** (the pipeline-secret discipline, [convex/memoriesPipeline.ts:63-78](../../convex/memoriesPipeline.ts)). The PIN is a floor convenience, **not** a security boundary — the real boundary is physical possession of the till-side tablet (the same honest framing Memories uses for its quota-not-a-security-boundary cookie, [lib/memories-guest-cookie.ts:20-23](../../lib/memories-guest-cookie.ts)).
- **Open shift.** At `/panel/[venueCode]`, a PIN opens a shift: `openShift` validates the `pinHash`, mints a 256-bit **shift bearer**, sets a `HttpOnly; Path=/panel/[venueCode]` HMAC cookie (the guest-cookie discipline, adapted), and inserts an `orderingShifts` row `{ status: "open", openedAt, staffLabel, lastHeartbeatAt, paused: false }`. **One open shift per venue** is enforced by read-then-write OCC (the reservation single-winner pattern, [convex/venueReservations.ts:240-242](../../convex/venueReservations.ts)); a second open attempt joins/replaces rather than double-opening.
- **Routing.** A request's `shiftId` is the venue's single open shift. **No open shift → ordering disabled** (§2.6 cause B).
- **Panel actions** (all guarded by the shift bearer): `acceptRequest` (`sent → accepted`), `markEnroute` (`accepted → enroute`, the guest's "Stiže"), `completeRequest` (`→ completed`), `pauseOrdering` / `resumeOrdering` (the manual off-switch, §2.6 cause B), `closeShift`.
- **The live queue** is the wall pattern (§1.e): `useQuery` over a newest-first index bounded with `.take(...)` like `WALL_WINDOW`, grouped by `cardId` (table), with overdue requests (§2.8) sorted to the top.

**Rejected options.**

- *Give each waiter a `users` account and reuse `requireBusinessAccess`.* Rejected: it forces account creation for floor staff, drags the sensitive access boundary into a tablet by the till, and a shared tablet has no single "user." The guest-bearer model already solves "an authenticated device that is not an account," and the PIN adds a lightweight who-is-manning-it.
- *A trusted, always-on panel with no shift (orders route to the venue).* Rejected: without a shift there is no "manned vs unmanned" signal, so ordering could not be turned off at end of shift and an order could route to a closed venue. The shift is exactly the "someone is here to accept" gate.

### 2.8 The 7-minute deadline — an action, never a silent cancel

**Decision: if a request is not accepted within the window (default 7 minutes, `overdueMinutes` on the config, §5), the guest gets an ACTION, and the request is NEVER silently cancelled.** At creation, the request schedules `runAt(now + overdueMinutes, markOverdue, { requestId })`; `markOverdue` no-ops if already accepted, else sets a materialized `overdue` flag (cron backstop, §1.b). Two effects, both from that flag:

- **Guest:** the live-status card becomes an **action card** — "re-ring" the panel as urgent (an escalated ping) and, where the venue configured it, the venue's phone number to call / a withdraw button. The request **stays pending**; the guest decides.
- **Panel:** the overdue request is flagged and **sorted to the top** of the queue with an escalated visual.

**Rejected options.**

- *Auto-cancel an unaccepted order after the window.* Rejected explicitly by the owner and by common sense — a guest who ordered and waited should not have their order silently disappear; the failure is the venue's to fix (accept it, or the guest escalates), never a quiet deletion.
- *Only a passive notification ("still waiting…").* Rejected: the owner asked for an **action**, not a toast. At 7 minutes the guest is given a lever (escalate / call / withdraw), because a passive message at a table changes nothing.

### 2.9 Spam prevention — rate limits per guest and per table (delegated decision 3)

**Decision: use the mounted `@convex-dev/rate-limiter` (§1.d) with two new token buckets:**

- **`orderSubmit`, keyed per ordering-guest bearer** — the direct per-actor throttle on level (b), mirroring `reserveUpload` keyed per `guest._id` ([convex/memories.ts:350-352](../../convex/memories.ts)).
- **`callWaiter`, keyed per `cardId` (the table)** — stricter, because the call is the worst spam vector: one tap buzzes the panel. A table cannot ring the waiter more than a few times a minute *even across guests*.

The existing per-IP `guestCreate` / `cardResolve` at the mint hop already bounds the "clear the cookie and re-mint a fresh guest to dodge a per-guest limit" bypass — inherited for free, exactly as it protects Memories. All limits **reject with a guest-visible message** ("sačekajte malo"), the `{ kind: "rate_limited" }` shape ([convex/cards.ts:567-569](../../convex/cards.ts)), never a silent drop.

**Note — per-`cardId` is a new keying** (the codebase keys only per-IP and per-guest, §1.d), and it is deliberate: the printed card is the **scarce, stable** identifier for a table, so it is the correct ceiling for the shared-table call button.

**Rejected option.** *A per-IP throttle on the order/call action.* Rejected: a whole venue's guests share one Wi-Fi/NAT (the 300-capacity IP buckets are sized for exactly that shared-IP case, [convex/lib/rateLimits.ts:18-29](../../convex/lib/rateLimits.ts)); a per-IP action limit would throttle legitimate tables against each other. IP is right for the **mint** (a burst of scans); the **table (`cardId`) and the guest** are right for the action.

### 2.10 The panel alert — sound, vibration, and the locked tablet (delegated decision 4)

The panel is a web page on a cheap, always-on tablet by the register (constraint 7). Alerting is **best-effort while alive**, and reliability comes from the heartbeat, not from background delivery:

- **Sound:** an `<audio>` / Web Audio ping on a new request. Mobile browsers gate audio behind a user gesture — the **PIN shift-open tap is that gesture**, unlocking audio for the shift.
- **Vibration:** `navigator.vibrate` (Android Chrome), best-effort, only while the page is visible.
- **Screen Wake Lock** while a shift is open, to keep the screen on (with the Android "stay awake while charging" developer toggle the owner sets once).
- **Locked / backgrounded / asleep tablet:** browsers throttle timers and suspend the Convex subscription when the tab is hidden — a pure web page **cannot** reliably alert a locked tablet. This is exactly what the heartbeat solves (§2.6): heartbeats stop when the panel sleeps, so ordering flips to the single disabled state (cause A), and a dead panel **disables ordering** rather than dropping orders into a void.

**Rejected option.** *Web Push / a native app / service-worker background notifications to reach a locked tablet.* Rejected: (a) it is a separate app to build, install, and maintain, against the owner's "cheap disposable tablet, a web page" (constraint 7); (b) Web Push on a locked Android tab is unreliable and iOS Safari is a minefield; (c) it papers over the real fix — keep the panel awake and charging — while the heartbeat already turns "panel asleep" into an honest "ordering temporarily off." Building background delivery adds standing complexity to support a misconfigured tablet.

### 2.11 The kitchen gets nothing in v1 (delegated decision 5)

**Decision: no kitchen display, ticket, or printer in v1.** The product is "get the waiter"; the waiter is the **single role and the single point of acceptance** in the owner's model. The **waiter is the router**: on acceptance, the request's item list (§2.13) is enough to relay to the kitchen the way the venue does today — verbally or by keying it into the existing register.

Why not: a kitchen display is a **second device, a second role** (kuvar), and a **second presence problem** (its own shift/heartbeat/acceptance) for zero added value over "the waiter accepts and relays." The target venues (kafana, small restaurant) run the floor through waiters, and a kitchen ticket is the thin end of POS integration, which the e-fiscalization scope (§2.3) keeps out.

**Rejected option.** *A kitchen display / auto-print in v1.* Rejected: it doubles the surface (device + role + presence) for the same outcome and pulls the product toward the POS the owner scoped out. Left as an explicit **RFC-005** candidate if a venue actually asks.

### 2.12 Plans, the capability gate, and the per-venue toggle

Ordering is a **Venue capability**, expressed through the existing chain (§1.c), additively, with **no change to `convex/lib/access.ts`**.

- **Capability (entitlement).** A new `ordering: boolean` on `VenueLimits` ([convex/lib/plans.ts:28-34](../../convex/lib/plans.ts)) and a `venueOrderingEnabled(limits)` helper of the identical shape as `venueAnalyticsEnabled` — defaulting a missing entitlement to the free Basic tier. The public ordering query resolves `getEntitlement(ctx, businessId, "scanme_venue")` and returns a locked/absent shape when ordering is not entitled, exactly as `venueAnalytics.eventMetrics` does ([convex/venueAnalytics.ts:193-195](../../convex/venueAnalytics.ts)). **Whether ordering is Basic, Premium, or its own price is an owner decision (§5).**
- **Config (per-venue toggle).** A separate `orderingConfig.enabled` and `orderingConfig.callWaiterEnabled` (§2.16) decide whether *this* venue turns ordering on and whether it shows the optional call button (constraint 7) — the two-gate discipline (capability vs configuration) the codebase already uses for ownership vs capability.
- **Owner config surface.** Managed through `requireBusinessAccess` ([convex/lib/access.ts:102-110](../../convex/lib/access.ts)) in the client panel (the `venue-panel-section` sibling, §2.15), the product-agnostic guard — no `access.ts` change.

**Rejected options.**

- *A brand-new `scanme_ordering` service type.* Rejected: ordering is not sold standalone — it lives inside Venue — and a new service type multiplies the surface (provisioning, a card kind, an admin subpage, a sellable SKU, the pricing engine) for a feature that is a Venue capability. It rides `scanme_venue`, gated by one new helper.
- *A per-venue config toggle with no entitlement gate (ordering for everyone who toggles it).* Rejected by constraint 6 — ordering is a paid subscription capability; the toggle decides *use*, the entitlement decides *right to use*.

### 2.13 The orderable list — decoupled from Menu

**Decision: v1 ordering has its own minimal orderable-item list (`orderingItems`), managed by the owner, DECOUPLED from the Menu product** — because Menu does not exist and must not be depended on (`MENU_EXISTS` stays `false`, constraint 1). An `orderingItems` row is `{ name, priceRsd?, available, order }`; the **`available` flag is live** (the "living menu" reactivity of RFC-003 §2.6 — a `nema više` reaches every open phone at that second, via `useQuery`). Prices are **informational only** (§2.3), never totaled.

When Menu ships (RFC-003), a **future task gated on `MENU_EXISTS`** can bind ordering to Menu items; v1 must not import a product that does not exist.

**Rejected options.**

- *Bind ordering to Menu items now.* Rejected by constraint 1 — Menu does not exist on this branch and `MENU_EXISTS` stays `false`; ordering cannot depend on it.
- *No item list at all — pure free-text orders.* Rejected (also §2.1): unstructured, spam-prone, and gives the panel nothing to render cleanly. A short structured list plus an optional note is the balance.

### 2.14 Routing and the card resolver

**Decision: a new `table_ordering` card-target kind (direct) and a `table_ordering` splitter item, both resolving through the card-aware hop `/r/[cardCode]/o?venue=<code>` → `resolveTableOrdering` → `mintOrderingGuest` → `Path=/o/[code]` cookie → `302 /o/[code]`** (§2.2). The guest page lives at `app/o/[code]/` (the ordering twin of `app/m/[code]/`); the panel at `app/panel/[venueCode]/`. Both are additive to `convex/cards.ts` and `convex/schema.ts` (the `cardTargetKind` and `cardSplitterItem` unions each gain one member) — the shipped resolver path is unchanged, and an unknown/inactive code falls through to the existing fallback.

**Rejected options.**

- *A `service_page` binding with a stored `serviceProfileId`.* Rejected: `memories_space` established the "kind that mints a card-aware guest" pattern, and ordering needs exactly that minting (§2.2); a stored reference adds a consistency burden for zero gain.
- *An ordering segment under the venue page.* Rejected: the venue page is a one-shot server render with no minted `cardId` (§1.e); ordering is a first-class guest surface at `/o/[code]`, reached only through the minting hop.

### 2.15 i18n

Three new surfaces via the recipe in §1.h: **`ordering`** (the guest page + live status + the two actions), **`ordering-panel`** (the waiter panel — PIN, queue, accept/enroute/complete, pause), and **`ordering-admin`** (the owner's config: enable, call-waiter toggle, PINs, the item list). Each is a `Dict` interface in [lib/i18n/types.ts](../../lib/i18n/types.ts) plus an `sr/*` module registered in [lib/i18n/index.ts](../../lib/i18n/index.ts), read through `getDict` / `fmt`. All copy is Serbian, ekavica (constraint 1); every ConvexError message the backend raises for these surfaces lives here too (the pattern where `venue-editor` carries the server refusals). The frozen Links inline Serbian is explicitly **not** in scope.

### 2.16 New-table / new-type catalog

Conventions follow [convex/schema.ts](../../convex/schema.ts): literal-union statuses, `createdAt`/`updatedAt` as `v.number()`, child tables over unbounded arrays, index names listing all fields, `pinHash`/bearer stored hashed. **Everything below is additive and *specified, not created in this task*** — new tables start empty; the two touched existing validators (`cardTargetKind`, `cardSplitterItem`) gain one member each. **The `orders` / `orderItems` names are already taken by the RFC-002 purchase layer — this product deliberately uses `serviceRequests` / `serviceRequestItems`.**

```ts
orderingConfig: defineTable({                       // per-venue ordering settings (§2.12, §2.13)
  businessId: v.id("businesses"),
  code: v.string(),                                 // the /o/[code] short code (twin of memoriesSpaces.code)
  enabled: v.boolean(),                             // this venue turns ordering on (config gate)
  callWaiterEnabled: v.boolean(),                   // the optional call button (constraint 7)
  overdueMinutes: v.number(),                       // acceptance deadline; default 7 (§2.8, §5)
  reasons: v.array(v.string()),                     // call-waiter reason chips (§5)
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_businessId", ["businessId"])
  .index("by_code", ["code"]),

orderingItems: defineTable({                        // the orderable list, DECOUPLED from Menu (§2.13)
  businessId: v.id("businesses"),
  name: v.string(),
  priceRsd: v.optional(v.number()),                 // informational only; never totaled (§2.3)
  available: v.boolean(),                           // the live "nema više" flag (§2.13, RFC-003 §2.6)
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_businessId_and_order", ["businessId", "order"]),

orderingGuests: defineTable({                       // anonymous per-scan bearer, twin of memoriesGuests (§2.2)
  businessId: v.id("businesses"),
  code: v.string(),                                 // the venue ordering code
  guestKey: v.string(),                             // 256-bit bearer (hashed cookie value verifies via HMAC)
  cardId: v.optional(v.id("cards")),                // the TABLE — minted through the card-aware hop
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_code_and_guestKey", ["code", "guestKey"])
  .index("by_cardId", ["cardId"]),

staffPins: defineTable({                            // owner-set PINs; NOT a users account (§2.7)
  businessId: v.id("businesses"),
  label: v.string(),                                // "Šef sale", "Konobar 1"
  pinHash: v.string(),                              // constant-time compared; PIN is convenience, not a boundary
  active: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_businessId", ["businessId"]),

orderingShifts: defineTable({                       // a manned panel session (§2.7)
  businessId: v.id("businesses"),
  status: v.union(v.literal("open"), v.literal("closed")),
  staffLabel: v.string(),                           // from the PIN used
  bearerHash: v.string(),                           // the shift bearer (Path=/panel/[venueCode] cookie)
  paused: v.boolean(),                              // manual ordering off-switch (§2.6 cause B)
  lastHeartbeatAt: v.number(),                      // heartbeat presence (§2.6)
  stale: v.boolean(),                               // materialized by markShiftStale; never a clock read
  openedAt: v.number(),
  closedAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_businessId_and_status", ["businessId", "status"]),

serviceRequests: defineTable({                      // one row per call OR order (§2.1, §2.4, §2.5)
  businessId: v.id("businesses"),
  cardId: v.id("cards"),                            // the TABLE — the whole point (§2.2)
  guestId: v.id("orderingGuests"),                  // the person (bearer-scoped view, §2.5)
  shiftId: v.id("orderingShifts"),                  // routed to the open shift (§2.7)
  kind: v.union(v.literal("call"), v.literal("order")),
  status: v.union(v.literal("sent"), v.literal("accepted"), v.literal("enroute"),
    v.literal("completed"), v.literal("withdrawn")),  // Poslato / Prihvaćeno / Stiže / done / withdrawn
  reason: v.optional(v.string()),                   // call kind: the chip
  note: v.optional(v.string()),                     // order kind: optional free text
  overdue: v.boolean(),                             // materialized by markOverdue (§2.8); never a clock read
  createdAt: v.number(),
  acceptedAt: v.optional(v.number()),
  updatedAt: v.number(),
})
  .index("by_shiftId_and_status", ["shiftId", "status"])
  .index("by_cardId_and_createdAt", ["cardId", "createdAt"])
  .index("by_businessId_and_createdAt", ["businessId", "createdAt"]),

serviceRequestItems: defineTable({                  // order lines (child over array; §2.13)
  requestId: v.id("serviceRequests"),
  name: v.string(),                                 // snapshot of orderingItems.name at send time
  priceRsd: v.optional(v.number()),                 // informational snapshot (§2.3)
  qty: v.number(),
  order: v.number(),
})
  .index("by_requestId", ["requestId"]),
```

| # | Table / type | New or Δ | Why it exists | Ref |
|---|---|---|---|---|
| O.1 | `orderingConfig` | new | per-venue ordering settings + the `/o/[code]` code + the optional call toggle | §2.12, §2.14 |
| O.2 | `orderingItems` | new | the orderable list, live `available`, decoupled from Menu | §2.13 |
| O.3 | `orderingGuests` | new | the per-scan bearer minted with `cardId` (twin of `memoriesGuests`) | §2.2 |
| O.4 | `staffPins` | new | owner-set PINs (not a `users` account) | §2.7 |
| O.5 | `orderingShifts` | new | the manned panel session; heartbeat + pause + materialized `stale` | §2.6, §2.7 |
| O.6 | `serviceRequests` | new | one row per call/order; the live status + materialized `overdue` | §2.1, §2.5, §2.8 |
| O.7 | `serviceRequestItems` | new | order lines as priced (informational) rows | §2.13 |
| O.8 | `cardTargetKind: "table_ordering"` | Δ (union +1) | a card resolves through the card-aware hop to `/o/[code]` | §2.2, §2.14 |
| O.9 | `cardSplitterItem.kind: "table_ordering"` | Δ (union +1) | an ordering button on a bare splitter | §2.2, §6 |
| O.10 | `VenueLimits.ordering` + `venueOrderingEnabled` | code | the entitlement capability gate | §2.12 |
| O.11 | `orderSubmit` + `callWaiter` rate buckets | code | per-guest + per-table spam ceilings | §2.9 |
| O.12 | `ORDERING_EXISTS` flag | code | the terminal activation flip | §1.h, §2.0 |

No index key on any **existing** table changes, and `entitlements`, `accounts`, `orders`, `convex/lib/access.ts`, and every Menu/Links surface are **not** modified — ordering rides the shipped chain.

### 2.17 Change list against existing code (risk-annotated)

| File / area | Change | Risk | Why it is bounded |
|---|---|---|---|
| [convex/schema.ts](../../convex/schema.ts) | 7 new tables; `cardTargetKind` +`table_ordering`; `cardSplitterItem.kind` +`table_ordering` | low | additive; existing rows validate unchanged; new tables empty |
| [convex/cards.ts](../../convex/cards.ts) | `table_ordering` case + `resolveTableOrdering` + `mintOrderingGuest` (twin of `mintSpaceGuest`) + `assertLinksPageCannotReachOrdering` | **medium** | mirrors the shipped Memories hop verbatim; the mint path preserving `cardId` is reused; the Links-page path is refused at creation |
| [convex/lib/plans.ts](../../convex/lib/plans.ts) | `VenueLimits.ordering` + `venueOrderingEnabled(limits)` | low | additive; copies the `venueAnalyticsEnabled` shape; no existing export changes |
| [convex/lib/entitlements.ts](../../convex/lib/entitlements.ts) | **no change** — `scanme_venue` already resolves | — | ordering reads the existing product's limits |
| [convex/lib/access.ts](../../convex/lib/access.ts) | **no change** | — | owner config uses `requireBusinessAccess`; the panel uses the new shift bearer |
| [convex/lib/rateLimits.ts](../../convex/lib/rateLimits.ts) | `orderSubmit` (per guest) + `callWaiter` (per cardId) buckets | low | additive named limits alongside the existing seven |
| [convex/crons.ts](../../convex/crons.ts) | backstop sweeps for `markShiftStale` + `markOverdue` | low | mirrors the reservation/session sweeps; no-ops on empty tables |
| [components/client-panel/**](../../components/client-panel) | a new ordering config section beside `venue-panel-section.tsx` | low | additive owner surface; `requireBusinessAccess` unchanged |
| new `app/o/[code]/**`, `app/panel/[venueCode]/**`, `app/r/[cardCode]/o/route.ts` | the guest page, the waiter panel, the card-aware hop | medium | new files; no shipped route changes; verified at both widths |
| [lib/i18n/**](../../lib/i18n) | `ordering`, `ordering-panel`, `ordering-admin` surfaces | low | additive; a missing key is a type error |
| [lib/flags.ts](../../lib/flags.ts) | **no change until §4 TASK-71**, then `ORDERING_EXISTS = true` | low | one-line flip is the terminal task; `MENU_EXISTS` untouched |
| **ScanMe Links product** (public render path / editor) | **no change** — see §6 | frozen | ordering forks nothing from Links; the Links-page splitter path is refused at creation and the wanted seam is **BLOCKED** |

---

## 3. Risk register

Ranked. Each risk lists blast radius and a concrete mitigation.

| # | Risk | Blast radius | Mitigation |
|---|---|---|---|
| 1 | **A path drops the table identity** (§2.2) — a bare client link to `/o/[code]`, now or in a later edit, mints an ordering guest with no `cardId`. | Every order routed that way — the waiter cannot find the table; the order is worthless. | The card-aware `/r/[cardCode]/o` hop reuses the exact `mintSpaceGuest` shape; a bare `/o/[code]` link is forbidden; the Links-page path is **refused at creation** (`assertLinksPageCannotReachOrdering`); a convex-test asserts a scan yields an ordering guest **with** `cardId`; §6 records the one blocked seam. |
| 2 | **An order falls into a void** (§2.6, §2.8) — a dead/asleep tablet, or an unaccepted order that vanishes. | Any guest at a table with an offline or inattentive panel; the product's trust. | Heartbeat materializes shift `stale` and **disables ordering up front** (single disabled state, cause A); acceptance + the 7-minute **action** never silently cancel; `runAt` flips + cron backstops; no query reads the wall clock. |
| 3 | **Someone adds in-app payment / Stripe later** (§2.3). | Legal exposure under e-fiscalization; a bill the register cannot reconcile. | The no-payment rule is a written constraint (§2.0 #4) *and* is baked into the data model (no amount-owed, no paid state, no tab close, prices informational); a convex-test asserts no settlement path exists (§4 TASK-70). |
| 4 | **Ordering couples to Menu**, which does not exist (§2.13). | The whole build blocked on a product outside this RFC. | `orderingItems` is decoupled; v1 imports nothing from Menu; `MENU_EXISTS` stays `false`; binding to Menu is a future task behind that flag. |
| 5 | **The capability/config gate mis-resolves** — ordering shown without entitlement, or the call button shown when the venue disabled it. | Every venue; a free tier getting a paid capability, or a confusing guest surface. | `venueOrderingEnabled` copies the proven `venueAnalyticsEnabled` shape (defaults to Basic/off); the two gates are separate (entitlement capability vs `orderingConfig.enabled`/`callWaiterEnabled`); a convex-test matrix covers {no entitlement, basic, premium} × {enabled, callWaiter}. |
| 6 | **Shift/PIN identity is abused** — a weak PIN, or a leaked shift bearer, lets a stranger accept/close shifts. | One venue's panel for one shift. | `pinHash` + constant-time compare; the shift bearer is an HMAC `Path=/panel/[venueCode]` cookie; the PIN is a convenience, the real boundary is physical possession of the tablet (stated, not hidden); the owner rotates PINs; one open shift per venue by OCC. |
| 7 | **Spam floods the panel** (§2.9) — a guest or a table hammering call/order. | One venue's panel during service. | `orderSubmit` per-guest + `callWaiter` per-`cardId` token buckets; the per-IP mint throttle bounds cookie-reset bypass; every reject is guest-visible, never a silent drop. |
| 8 | **Two open shifts for one venue** — a double PIN-open routes orders to the wrong shift. | One venue's routing for one service. | `openShift` enforces one open shift per business by read-then-write OCC (the reservation single-winner pattern); a second open joins/replaces rather than double-opening; a convex-test covers concurrent opens. |
| 9 | **`ORDERING_EXISTS` flips before ordering is ready**, or `table_ordering` becomes bindable prematurely. | The card manager and the sellable set. | The flip is the single terminal task (§4 TASK-71); `table_ordering` and the buckets stay inert until then; no earlier task touches `lib/flags.ts`. |

---

## 4. Implementation sequence

Each step has a criterion a test or check can confirm. **Tasks are numbered TASK-62 upward**; from this table the prompts go out one at a time. TASK-62 (schema) and TASK-63 (identity hop) are the spine and come first; the config/items (64), shift/PIN/heartbeat (65), and the two guest actions (66) build on them; the guest live status (67) and the panel (68) are the two live surfaces; i18n (69) and hardening (70) close the product; **TASK-71 (the `ORDERING_EXISTS` flip) is terminal and done only when everything above is green.**

| # | Task | Verifiable success criterion |
|---|---|---|
| **TASK-62** | Schema catalog (PLAN mode): the 7 new tables + `cardTargetKind` +`table_ordering` + `cardSplitterItem.kind` +`table_ordering` (§2.16) | convex-test: every existing table validates unchanged; an `orderingConfig`/`orderingShifts`/`serviceRequests` round-trip inserts and reads; `npm run check` green; **no existing card/entitlement/access test changes** |
| **TASK-63** | Card-aware ordering hop: `resolveTableOrdering` + `mintOrderingGuest` (twin of `mintSpaceGuest`) + `app/r/[cardCode]/o/route.ts` + `Path=/o/[code]` cookie + splitter `table_ordering` button href + `assertLinksPageCannotReachOrdering` (§2.2, §2.14) | convex-test/e2e: a scan of a `table_ordering` card mints an ordering guest **with** `cardId`; a bare `/o/[code]` link mints **no** identity; a card whose Links-page splitter would route ordering is **refused at creation**; the anti-oracle guard rejects a foreign venue code |
| **TASK-64** | `orderingConfig` + `orderingItems` + owner config surface (client panel) + `venueOrderingEnabled` gate (§2.12, §2.13) | an owner enables ordering, toggles the call button, and manages items with a live `available`; a Basic/unentitled venue's public ordering query returns the locked/absent shape; `access.ts` untouched |
| **TASK-65** | Shift + PIN + heartbeat: `staffPins`, `orderingShifts`, `openShift`/`closeShift`/`heartbeat`/`pause`/`resume`; materialized `stale` via `runAt` + cron backstop; one open shift per venue (§2.6, §2.7) | convex-test: a correct PIN opens a shift and mints a shift bearer; a wrong PIN is refused (constant-time); a stopped heartbeat flips `stale` at the threshold with no wall-clock read; two concurrent opens yield exactly one open shift |
| **TASK-66** | The two guest actions: call + order (`serviceRequests` + `serviceRequestItems`) + rate limits (`orderSubmit` per guest, `callWaiter` per cardId) + the single disabled state from materialized booleans (§2.1, §2.9) | a call and an order each insert one row routed to the open shift; ordering is disabled when the shift is stale **or** paused **or** absent, with one guest message; a flood is rejected with a visible message; a request carries `cardId` and `guestId` |
| **TASK-67** | Guest live status (SSR-then-subscribe): Poslato → Prihvaćeno → Stiže via `useQuery`; the 7-min overdue → action card; never a silent cancel (§2.5, §2.6, §2.8) | a status change on the panel reaches a second open guest client **with no reload**; at the overdue threshold the status becomes an action card and the request **stays pending** (no auto-cancel); a guest sees only their own requests |
| **TASK-68** | Waiter panel `app/panel/[venueCode]`: PIN login, live queue (bounded `take` like `WALL_WINDOW`), accept/enroute/complete, per-table grouping, manual pause; sound + vibration + Wake Lock; overdue sorted to top (§2.7, §2.10) | on a 375px + tablet viewport the panel logs in by PIN, shows the live queue grouped by table, and accept/enroute/complete drive the guest status; a new request pings (audio unlocked by the PIN gesture); overdue rows sort to the top |
| **TASK-69** | i18n `ordering` + `ordering-panel` + `ordering-admin` surfaces (`Dict` ifaces + `sr/*` + `SR` map) (§2.15) | all ordering copy reads through `getDict`/`fmt`; a deliberately missing key fails `npm run check`; no inline Serbian in new code |
| **TASK-70** | Hardening: rate-limit matrix + presence edge cases + the **no-payment guard test** (§2.3, §2.9) | a convex-test asserts there is no amount-owed/paid/tab-close path anywhere in the ordering model; the rate-limit matrix covers per-guest and per-cardId ceilings; a lost heartbeat and a lost `runAt` are both recovered by the cron backstop |
| **TASK-70b** | QA, pristupačnost i perf panela i gosta (§2.7, §2.10, §2.12) | panel je upotrebljiv jednom rukom na tabletu od 10″ i na telefonu od 375px; dugmad Prihvati/Stiže/Završeno imaju cilj dodira najmanje 44px; red čekanja je prohodan tastaturom i nova porudžbina se najavljuje preko `aria-live`; kontrast prolazi AA na jeftinom ekranu pri punom osvetljenju; gost i panel imaju izmeren prvi paint upisan u `docs/perf/` i `docs/qa/` |
| **TASK-71** | Flip `ORDERING_EXISTS = true` + activation wiring (`table_ordering` becomes bindable; ordering shows in the venue's config) — **terminal** | a venue with the ordering capability can bind a `table_ordering` card and run the guest + panel flow end to end; `MENU_EXISTS` is untouched; done only after TASK-62–70 are green |

The exact **prices/tiers** for the ordering capability and the operational defaults (overdue minutes, heartbeat interval, PIN policy, reason chips) are owner inputs, not tasks here; they wait in §5 / [BLOCKED](../tasks/BLOCKED.md).

---

## 5. Open questions

Named, each with who resolves it. Information this RFC did not have and did not invent — all cross-listed in [docs/tasks/BLOCKED.md](../tasks/BLOCKED.md).

1. **Ordering capability price / tier.** Is ordering a Basic or Premium Venue capability, or its own price line? The proposal is a `venueOrderingEnabled(limits)` gate on `scanme_venue` (§2.12); confirm the mapping and the number. **Owner.**
2. **Sold only to Venue-owning locals, or standalone?** Ordering rides `scanme_venue` (§2.12); confirm ordering is only for locations that own Venue, or specify a standalone sale (which would revisit the service-type decision). **Owner / product.**
3. **The overdue window and the exact guest action at it.** Default is 7 minutes (§2.8); confirm the number and the exact action offered (re-ring / show the venue phone / withdraw). **Owner.**
4. **PIN policy.** One PIN per venue or per-waiter PINs; PIN length; rotation cadence (§2.7). **Owner.**
5. **Heartbeat interval and stale threshold.** Proposal: heartbeat every ~15 s, stale at ~60 s (§2.6); confirm the numbers. **Owner / infra.**
6. **The orderable list for v1.** A curated short list, free text, or both; and are informational prices shown (§2.13)? **Owner / product.**
7. **The call-waiter reason chips.** Proposed seed: Račun / Voda / Pomoć / Ostalo (§2.1). Confirm and complete. **Owner.**
8. **Table display label.** Do printed cards already carry a human "Sto N" label the panel shows, or is a card-label field needed (§2.4, §2.7)? **Owner / next implementer.**
9. **Kitchen display.** Confirmed **out** for v1 (§2.11), an RFC-005 candidate; confirm no venue needs it day one. **Owner.**

---

## 6. ScanMe Links freeze ledger

ScanMe Links (the **product** — its public render path and editor) is frozen (§2.0 constraint 1). This RFC touches it in exactly **zero** places, and records here every point where a decision *neighbours* the freeze so nothing is discovered late:

| Neighbouring decision | Does it touch the frozen product? | Disposition |
|---|---|---|
| The whole ordering product (§2.1–2.14) | **No** — a new guest surface (`/o/[code]`) + a new panel (`/panel/[venueCode]`) + additive `cards.ts`/`schema.ts`; it forks nothing from Links and is **not** the Menu editor | Allowed; in scope |
| The `table_ordering` splitter button (§2.2, §2.14) | **No** for the **bare** splitter — new code reached under `/r/[cardCode]`, card-aware by construction (the exact Memories precedent) | Allowed; in scope |
| Ordering routed through a **Links-page** splitter (§2.2) | **Yes** — the frozen Links render would have to know `cardCode` and emit a card-aware `/r/[cardCode]/o` link | **BLOCKED on the owner**, exactly as Memories-behind-a-Links-splitter is (RFC-002 §2.4). A card whose Links-page splitter would include ordering is refused at creation (`assertLinksPageCannotReachOrdering`) |
| The post-creation Links-editor hole (inherited) | **Yes, latently** — the Links owner could later add an `/o/…` destination to the same page, minting an ordering guest with no `cardId` (the identical hole [TASK-37 §1](../tasks/BLOCKED.md) recorded for `/m/…`) | Same disposition as TASK-37: the create-time guard is loud; closing the editor-side hole edits the frozen product and is **BLOCKED on the owner**; re-flagged here so it is not discovered late |
| Menu binding for the orderable list (§2.13) | **N/A** — Menu is a separate product and does not exist; `MENU_EXISTS` stays `false` | Out of scope; a future task behind the flag |

Anything a future task discovers that *does* require editing the ScanMe Links public render path or editor must stop and be re-flagged here as blocked on the owner, exactly as the Links-page rows are.

---

*End of RFC-004.*
