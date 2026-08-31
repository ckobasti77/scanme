# RFC-002: ScanMe pricing, the purchase flow, the Enterprise account, and the admin layer

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 2026-08-31 |
| **Scope** | How the five ScanMe services are priced and sold. Four things, tightly coupled: **(1)** a pure pricing engine (two independent axes — per-service prices and an account-level plan); **(2)** the **Enterprise account** — one login/one plan/one bill above many locations, which is the first structural change to tenancy since `businesses` was born its own owner; **(3)** the four-step purchase flow (services → plan → physical products → checkout) reusing the existing physical-product configurator; **(4)** the admin layer above it all. Real payment capture is a **non-goal** (no Serbian provider is chosen — the checkout is a stub against the RFC-001 billing port), but every decision leaves room for it. |
| **Baseline** | Branch `feat/venue-memories` at `a234026`; Next.js `16.2.12`, React `19.2.8`, `convex ^1.44.0`, `@convex-dev/auth ^0.0.94`, `@convex-dev/rate-limiter ^0.3.2` ([package.json](../../package.json)). Sits on top of RFC-001 (Venue + Memories), whose schema, entitlements, and card resolver are **already shipped** on this branch and are treated here as existing code, not as proposals. |

**How to read this document.** It mirrors [RFC-001](./RFC-001-venue-memories.md). §1 is the audit of what exists today — every claim cites a file (and where useful a symbol or line range) at the baseline above. §2 is the target architecture; the money model, the Enterprise shape, and the flow copy were fixed before this RFC ([docs/tasks/TASK-26-rfc-pricing.md](../tasks/TASK-26-rfc-pricing.md)) and are treated as constraints — §2 records where codebase evidence shaped *how* they are realized and where evidence forced a decision. §3 is the risk register, §4 the ordered implementation sequence (the thirteen tasks this RFC spawns), §5 the open questions, §6 the ScanMe-Links freeze ledger. **Every decision states what was rejected and why** — RFC-001 earned its keep through its rejected options, and this document owes the reader the same.

**Two decisions are load-bearing and are made to the end, not described** (§2.2 and §2.4): the shape of the Enterprise account and how `getEntitlement` resolves a plan from the account level down; and the condition under which a table card's *identity* survives a splitter on the way to Memories. If either is left vague, the cost surfaces a task or two later, when it is expensive.

**Glossary.** *Service* = one of the five sellable products: **ScanMe Links**, **Venue**, **Memories**, **Menu** (does not exist yet), **Review** (= Google Review). *Plan* = the account-level tier **Basic / Premium / Enterprise** (Axis B), distinct from a service. *Tier / `planKey`* = the per-service capability level `getEntitlement` returns (e.g. Memories `basic|standard|premium`, RFC-001 §2.3) — the plan *maps down* to a tier. *Account* = the new billing/plan/grouping row above one or more `businesses` (§2.2). *Location / local* = a `businesses` row (RFC-001's tenant, [convex/schema.ts:101](../../convex/schema.ts)). *Package* = a named, discounted bundle of services (Događaj, Lokal, Kompletan ScanMe) — marketing, never a SKU (§2.1). *Physical product* = a printed/manufactured item from the configurator ([lib/scanme-pricing.ts:107–181](../../lib/scanme-pricing.ts)). *Splitter (razdelnik)* = the single destination a multi-service card resolves to (§2.4). *Snapshot* = a price copied into an order at sale time so later price changes never touch an existing customer (§2.5).

---

## 1. Audit of the existing platform

### 1.a The pricing engine as it exists today

There **is** a pricing engine, and it is a good one — but it encodes a different model than the one this RFC must build. [lib/scanme-pricing.ts](../../lib/scanme-pricing.ts) (500 lines) is a pure, dependency-free domain module (its own header says "Centralizovan domenski model ScanMe ponude"):

- **Two services only**: `ServiceId = "review" | "links"` ([:10](../../lib/scanme-pricing.ts)). Venue, Memories, and Menu do not appear — the offer surface predates them.
- **Per-service tiers**: `TierId = "starter" | "premium" | "enterprise"` ([:11](../../lib/scanme-pricing.ts)); `SAAS_PRICING[service][tier]` carries a `{ monthly, annual }` price **per (service, tier)** ([:85–94](../../lib/scanme-pricing.ts)). This is the crux mismatch: today the tier is **per service**; TASK-26 makes the plan **per account** and orthogonal to which services are owned (§2.1).
- **Physical products**: `PHYSICAL_PRODUCTS` — five items (`stickers`, `window-film`, `two-piece-stand`, `compact-stand`, `premium-engraved-stand`) each with a `baseUnitPrice`, a preview asset + plane, an allow-list of option controls, and gross-price matrices per option combination ([:127–234](../../lib/scanme-pricing.ts)). `productUnitPrice` resolves the matrix; `computeOrderBreakdown` folds products + one SaaS term into a `totalDueNow` with a `renewal` ([:428–472](../../lib/scanme-pricing.ts)).
- **Quantity discounts**: a five-rung ladder `QUANTITY_DISCOUNT_TIERS` (1→0%, 2→8%, 5→17%, 10→25%, 20→30%) applied per line ([:262–289](../../lib/scanme-pricing.ts)). This is a *quantity* ladder on one physical product, **not** the *service-count* ladder TASK-26 specifies (§2.1) — they are different axes and must not be conflated.
- **URL as the source of truth**: [lib/offer-url.ts](../../lib/offer-url.ts) serializes a whole `OrderSelection` into query params (`v=4`, `service`, `tier`, `period`, `items=JSON`) and parses it back with version fallbacks (v1–v4) and strict per-field validation ([:38–47, 255–281](../../lib/offer-url.ts)). The four-step flow's "state in the URL, config shareable by link" requirement (§2.3) already has its mechanism here.
- **Surfaces**: [components/pricing-plans.tsx](../../components/pricing-plans.tsx) (marketing cards, `computeCardPrice` "Od" prices per tier), [components/offer-configurator.tsx](../../components/offer-configurator.tsx), and the route shells [app/ponuda/page.tsx](../../app/ponuda/page.tsx) + [app/ponuda/pregled/page.tsx](../../app/ponuda/pregled/page.tsx). Enterprise is already a dead-end contact CTA, not a card that computes a price — `ENTERPRISE_CONTACT_HREF` ([lib/offer-contact.ts:18](../../lib/offer-contact.ts)) — which is exactly the treatment §2.3 keeps.

**Verdict.** *Reusable as-is:* the physical-product catalog + gross-price matrices, `formatRsd`, the quantity ladder (for physical items), the URL codec's shape and validation discipline, the Enterprise-as-contact treatment. *Must be replaced:* the `SAAS_PRICING[service][tier]` model — the new engine prices services on one axis and the plan on another (§2.1), so `computeOrderBreakdown`'s "one service, one tier, one term" core is superseded. *Must be learned from:* the module is already pure and framework-free — the new engine keeps that property and the "imported everywhere" discipline, because §2.1 requires the identical function on the marketing page, the billing server, and the invoice. **This file is marketing/commerce, not the frozen ScanMe Links product** — editing it is in scope and touches nothing under the freeze (§6).

### 1.b Entitlements, plans, and how a capability is resolved today

RFC-001 shipped the capability layer this RFC extends. It is small and deliberate:

- **`entitlements`** ([convex/schema.ts:785–812](../../convex/schema.ts)): `businessId`, `product` (serviceType), `planKey` (a free string), optional `spaceId` (present = space-scoped, absent = business-scoped), `status` (`active|expired`), `overrides`, `source` (`manual|billing`), `externalRef`, `validUntil`. Indexes: `by_businessId_and_product`, `by_spaceId_and_status`, `by_status_and_validUntil`. **The row is keyed on `businessId` — there is no concept above a single location.**
- **`getEntitlement(ctx, businessId, product, spaceId?)`** ([convex/lib/entitlements.ts:25–92](../../convex/lib/entitlements.ts)) is the **single read path** — no caller reads the table directly. Resolution order today: (1) if `spaceId`, an active space-scoped row wins; (2) else the active business-scoped row; (3) else `null`. It throws loudly on two active business-scoped rows for one `(business, product)` ([:62–68](../../convex/lib/entitlements.ts)) — "a wrong plan tier is a quota bug." It returns `{ planKey, limits, status }` where `limits = { ...PLAN_LIMITS[product][planKey], ...row.overrides }`.
- **`PLAN_LIMITS`** ([convex/lib/plans.ts:28–42](../../convex/lib/plans.ts)) lives in **code, not the database** — "tuning a tier is a DEPLOY, never a migration." Memories has three tiers (`basic` 3 / `standard` 5 / `premium` 10 photos, with retention + max-dimension); Venue is a placeholder shape (`allowedBlockKeys: []`, open question RFC-001 §5 Q1).
- **`upsertManualEntitlement`** ([convex/lib/entitlements.ts:97–139](../../convex/lib/entitlements.ts)) keeps "one active entitlement per (business, product, scope)"; **`admin.approveActivation`** ([convex/admin.ts:1133–1166](../../convex/admin.ts)) is the one transaction that flips `serviceProfiles.status = "active"`, upserts the entitlement, and closes the request — the audited "activation flips nothing" gap (RFC-001 §1.e) is already closed here. Expiry is a daily cron sweeping `by_status_and_validUntil` ([convex/entitlements.ts:14–34](../../convex/entitlements.ts)).

**Two orthogonal gates already coexist**, and this is the fact §2.2 builds on: *ownership* ("is this service available on this location") is `serviceProfiles.status === "active"` (RFC-001 §2.11 step 6, "gated behind `serviceProfiles.status` exactly as Links is today"); *capability* ("what are the numeric limits") is `getEntitlement`. They are separate reads. The account plan can therefore be layered onto the *capability* gate without disturbing the *ownership* gate.

**Verdict.** *Reusable as-is:* the `getEntitlement` single-read-path discipline, `PLAN_LIMITS`-in-code, the two-gate separation, `upsertManualEntitlement`, `approveActivation`, the expiry cron. *Must be extended (additively):* `getEntitlement` gains an account-level fallback (§2.2); `PLAN_LIMITS` gains an account-plan→tier mapping. *Must not be touched:* the throw on ambiguous rows, and the space/business precedence order (the "premium for one event" override, RFC-001 §2.3, must keep winning).

### 1.c Tenancy and the access boundary (the sensitive code)

- **`businesses` is the tenant** ([convex/schema.ts:101–118](../../convex/schema.ts)) and already carries `kind: "business" | "celebration"` (RFC-001 §2.1.6) — it is a tenant table whose name is legacy. **Nothing sits above it.** A single login maps to one or more businesses only through per-business membership.
- **`businessMemberships`** ([convex/schema.ts:339–349](../../convex/schema.ts)): `(userId, businessId, accessRole: "viewer", active)`. Crucially, **one user already can hold many memberships** — `by_userId_and_active` exists ([:348](../../convex/schema.ts)). "One login → many locations" is therefore *already representable*; what is missing is a row that *groups* those locations for a shared plan and bill.
- **`requireBusinessAccess`** ([convex/lib/access.ts:102–110](../../convex/lib/access.ts)) is the boundary TASK-26 names as the most sensitive code. Its shape: `resolveBusinessForAccess` (auth → business by slug/id → active-status gate, [:63–79](../../convex/lib/access.ts)) then `requireAdminOrActiveMembership` (admin bypasses; otherwise an active `businessMemberships` row is required, [:82–98](../../convex/lib/access.ts)). It is called from the card manager ([convex/cards.ts:154, 209, 302, 333, 377](../../convex/cards.ts)) and every host-panel path. **It reasons purely about (user, business).** Any change here ripples through every product's write path.
- **`requireServiceEditorAccess`** ([convex/lib/access.ts:151–179](../../convex/lib/access.ts)) is the parameterized editor gate; **`clientPanel.overview`** ([convex/clientPanel.ts:72–129](../../convex/clientPanel.ts)) still hardcodes exactly two services (`scanMeLinks`, `googleReview`) and is welded to the Google-Review panel access.
- **Admin's business list** ([convex/admin.ts:116–165](../../convex/admin.ts)) is review-centric: it takes 100 businesses unpaginated, and each row's `status` is literally `reviewProfile?.status === "active"`. There is no notion of plan, renewal, or a customer who is paid-but-unconfigured — the operational table §2.6 needs does not exist yet.

**Verdict.** *Reusable as-is:* per-business membership (already supports one-user-many-businesses), `requireBusinessAccess`'s exact logic, the admin allowlist. *Must be extended (additively):* a grouping row above `businesses`; the admin list (a new query, not a widening of the review-welded one). *Must NOT change behavior:* `requireBusinessAccess` — §2.2's central decision is to leave its logic byte-identical.

### 1.d The card resolver and the table's identity

RFC-001's `/r/[cardCode]` resolver ([convex/cards.ts:414–545](../../convex/cards.ts)) is the whole surface a printed card touches, and it already contains the fact §2.4 turns on:

- A card is one code with one `currentTargetId` → one `cardTargets` row; kinds are `memories_space | venue | event | service_page | url` ([convex/schema.ts:79–85, 712–721](../../convex/schema.ts)). **One card = one code = one destination.** There is no "two targets" — a splitter must itself *be* the single destination.
- For a **`memories_space`** target, and only there, `resolveAndRecord` mints a guest with `cardId: card._id` ([convex/cards.ts:518–541](../../convex/cards.ts)) — "the person: a fresh 256-bit bearer key. The card is attributed as the TABLE (`guest.cardId`) so per-card stats survive re-cookieing." The Next handler then sets the `Path=/m/[code]` HMAC cookie and 302s (RFC-001 §2.6, §2.7).
- Per-table identity lives in exactly three places: `memoriesGuests.cardId` (`by_cardId`, [convex/schema.ts:592–602](../../convex/schema.ts)), `memoriesPhotos.cardId` denormalized at upload ([:609](../../convex/schema.ts)), and the quota being computed per guest (RFC-001 §2.6, §2.9). **Quota is per person; statistics are per table.** If a scan reaches `/m/[code]` *without* passing through this minting branch, the resulting guest has **no `cardId`** — the table is lost, and per-table statistics silently degrade to nothing.

**Verdict.** The resolver already does the right thing for a *direct* Memories card. The gap §2.4 must close is any *indirect* path — a card that lands on a splitter first — because a plain client-side link from a splitter to `/m/[code]` bypasses the minting branch entirely.

### 1.e Summary table

| Area | Reusable as-is | Extend (additive) | Replace / must not touch |
|---|---|---|---|
| Pricing | physical-product catalog + matrices, `formatRsd`, quantity ladder, URL codec discipline, Enterprise-as-contact | new dual-axis engine imported by marketing/server/invoice | replace `SAAS_PRICING[service][tier]` tier model |
| Entitlements | `getEntitlement` single-read-path, `PLAN_LIMITS`-in-code, two-gate separation, `approveActivation`, expiry cron | account-level fallback in `getEntitlement`; account-plan→tier map in `plans.ts` | must not touch the ambiguous-row throw or space/business precedence |
| Tenancy / access | per-business membership (already many-per-user), `requireBusinessAccess` logic, admin allowlist | `accounts` grouping row; `businesses.accountId` | `requireBusinessAccess` logic must not change behavior |
| Cards | direct `memories_space` minting (table attribution) | card-aware splitter hop preserving `cardId` | a bare client link splitter→`/m/[code]` is forbidden (§2.4) |
| Admin / panel | admin allowlist, `serviceProfiles.status` ownership gate | new customers table (plan/renewal/status), audit log | admin's review-welded list is not widened; a new query is added |

---

## 2. Target architecture

### 2.0 Constraints (fixed inputs)

Decided before this RFC ([TASK-26](../tasks/TASK-26-rfc-pricing.md)) and treated as requirements:

1. **Two independent price axes.** Axis A: each service priced, monthly or annually; all 31 non-empty subsets of the five services are legal. Axis B: an account-level plan `Basic` (free) / `Premium` (fixed price) / `Enterprise` (on request). The plan is per **account**, not per service; **Basic is a free plan but services are still paid** (the sentence someone will misread — written here in bold on purpose).
2. **The engine is a pure function of the chosen set and plan** — never of order, history, or date. Two customers with the same selection pay the same, always. Prices are **placeholder constants in one file**; the engine must not care what the numbers are, Premium's price included.
3. **Enterprise** = one account above 10–15 locations, one login sees all, one plan and one bill for all. It is a schema change and it approaches the most sensitive code.
4. **The purchase flow is one shell, four steps, state in the URL.** Real payment is a **stub** (no Serbian provider chosen) against the RFC-001 billing port.
5. **The paid price is snapshotted into the order** — the entitlement is the live permission, the order is the record-as-sold; raising prices later never touches an existing customer.
6. **ScanMe Links is frozen.** Any decision that requires touching the ScanMe Links **product** (its public render path or editor) is marked **BLOCKED on the owner's decision** and collected in §6. (The marketing/commerce surfaces — pricing page, configurator, offer route — are **not** the frozen product.)
7. **Menu does not exist yet.** It is a first-class service in the model and the engine, but no Menu product, page, or editor is designed here; wherever Menu would be surfaced, the design degrades cleanly to "coming soon" and the `page → Menu` rename (RFC-001 §2.5) lands when Menu is built.

No constraint was found unworkable against the codebase. Two required an implementation-level judgment call, recorded where they occur: the Enterprise account is a grouping row that leaves `requireBusinessAccess` untouched (§2.2), and the splitter's card-awareness is achievable for the bare splitter but **blocked** for the Links-page splitter (§2.4, §6).

### 2.1 The pricing engine — a pure function and its rules

**Shape.** A new pure module `lib/pricing/` (successor to the SaaS half of [lib/scanme-pricing.ts](../../lib/scanme-pricing.ts); the physical-product half of that file is retained and imported unchanged). One entry point, no I/O, no clock, no framework:

```ts
// lib/pricing/engine.ts — pure, dependency-free, no Date/Math.random
price(input: {
  items: ReadonlyArray<{ service: ServiceId; period: "monthly" | "annual" }>;
  plan: "basic" | "premium" | "enterprise";
}): PriceBreakdown        // per-line list price, per-line discount, package attributions,
                          //   per-group subtotal, plan line, grand total, savings — all RSD ints
```

`ServiceId = "links" | "venue" | "memories" | "menu" | "review"`. All constants — per-service `{ monthly, annual }`, the Premium plan price, package prices, the ladder rates — live in `lib/pricing/constants.ts` as **placeholders the owner fills later**. The engine imports them; it never hard-codes a number, and no test asserts a specific currency amount except through the golden table (below), which is regenerated from the constants.

**The algorithm** (verbatim from the constraint, made executable):

1. **Group items by period.** A discount only ever applies *within* one period group — the rule the owner gave, and the rule that explains itself to a buyer ("your monthly things and your yearly things are two baskets").
2. **Per group, enumerate all 2ⁿ decompositions** of the group's services into `{named packages} ∪ {individual services}` and keep the **cheapest for the buyer**. `n ≤ 5`, so this is exhaustive enumeration (≤ 32 partitions), never a heuristic.
3. **On the services left outside any package**, apply the **position ladder** by price — 1st `0%`, 2nd `20%`, 3rd `30%`, 4th `40%`, 5th `50%` — ordering **from the cheapest service upward**, so the **most expensive item is never discounted**.
4. **Sum the groups, then add the plan line.**

**Named packages** (marketing bundles, not SKUs): **Događaj** = Venue + Memories; **Lokal** = Links + Menu; **Kompletan ScanMe** = all five. A package is only eligible when **all its services sit in the same period group**.

**A package is marketing, not a SKU — and that is a test, not a nicety.** If a buyer clicks Venue, then Memories, individually, they must land on the Događaj price automatically; there is no way to pay more by arriving at the same set through a different door. This falls out of step 2 for free (the decomposition that names the package is one of the 2ⁿ, and it is cheaper), which is *why* packages are decompositions and not separate priced rows (see rejected options).

**Four hard invariants, expressed as `throw`s in the engine — not as "the numbers happen to work out":**

1. No single line is ever billed below **50%** of its list price.
2. Total discount across the cart never exceeds **45%**.
3. The cart total is never **less than the most expensive single service** in it.
4. Adding a service never lowers the total; **splitting a set across periods is never cheaper than combining it** in one.

These are asserted against the *computed result* on every call in development and in the golden generator; if a future constant edit would violate one, the engine throws at that input rather than quietly selling below cost. (Invariant 4's "splitting across periods" clause is the one a naïve grouping would break — it is checked by comparing the grouped result against the all-in-one-period lower bound.)

**The golden table.** All **31 non-empty service subsets × 2 plans × every legal period split**, each with an expected `PriceBreakdown`, committed as a fixture and regenerated by a script from `constants.ts` (exactly the pattern of the ScanMe-Links preset harness, RFC-001 §2.11). Price is a thing you must never change by accident. **The identical engine file is imported in three places — the marketing page, the server at checkout, and the invoice.** If the client and the server ever compute a different number, that is **not a bug, it is a legal problem**; the shared module and the golden table are what make divergence impossible.

**Review is free from the fourth service up (DECIDED, owner may veto).** When a cart holds **four or more services and includes Review**, Review's line is priced **0**. It is the one lever that nudges a customer who stopped at three onto a fourth service at almost no marginal cost. Implemented as a rule *inside* the engine (so marketing, server, and invoice agree), evaluated after packaging and before the ladder, and covered by the golden table. Rejected alternative: making Review always free — it would leave money on the table for the many single-Review locals who are the current base ([lib/scanme-pricing.ts:85–89](../../lib/scanme-pricing.ts) prices Review today); the "from the fourth up" rule captures the upsell without repricing the base.

**Rejected options.**

- *Keep the per-service tier model (`SAAS_PRICING[service][tier]`, [lib/scanme-pricing.ts:85](../../lib/scanme-pricing.ts)).* Rejected: the plan is account-level and orthogonal to services (§2.0), so a `starter/premium` price *per service* both double-counts the plan and makes "Premium unlocks everything for one price" impossible to express.
- *Packages as distinct priced SKUs.* Rejected: then reaching the same set à la carte would not match the package price, violating invariant "no cheaper path" and the marketing promise. Decomposition (step 2) gives the package price to *any* path to the set.
- *Greedy / heuristic package assignment.* Rejected: greedy can miss the cheapest split; with `n ≤ 5` the exhaustive 2ⁿ is trivially cheap and provably optimal, and optimality is the product promise, not an optimization.
- *Ladder from the most expensive item down, or by purchase order.* Rejected: discounting the priciest item bleeds revenue, and ordering by purchase sequence makes price depend on history — both forbidden by "pure function of the set."
- *Promo codes / time-limited / grandfathered pricing inside the engine.* Rejected: any of these makes two identical carts price differently. Grandfathering is real and needed, but it belongs at the **order snapshot** layer (§2.5), not in the pricing function.

### 2.2 Axis B and the Enterprise account — decided to the end

This is the first structural change to tenancy since RFC-001, and it approaches `requireBusinessAccess`. The governing decision is to make that approach a **near-miss**: the account is a layer *above* `businesses`, and the sensitive access code does not change its logic.

#### 2.2.1 The `accounts` table (new)

```ts
accounts: defineTable({
  name: v.string(),                         // "Kafanski lanac d.o.o." or a solo local's own name
  plan: v.union(v.literal("basic"), v.literal("premium"), v.literal("enterprise")),
  planPeriod: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),  // absent for basic (free)
  status: v.union(v.literal("active"), v.literal("suspended")),
  // Enterprise-negotiated capability deviations, merged by getEntitlement (step 3);
  // same optional-subset shape as entitlements.overrides. Empty/absent for Basic/Premium.
  overrides: v.optional(v.object({
    photosPerGuest: v.optional(v.number()),
    maxImageDimension: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
    allowedBlockKeys: v.optional(v.array(v.string())),
  })),
  // Billing-port target for the PLAN subscription (services bill through orders, §2.5).
  planSource: v.optional(v.union(v.literal("manual"), v.literal("billing"))),
  planExternalRef: v.optional(v.string()),
  planValidUntil: v.optional(v.number()),   // absent = perpetual (manual); daily expiry cron sweeps numeric values
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_status", ["status"])
```

**`businesses` gains one optional field:** `accountId: v.optional(v.id("accounts"))` ([convex/schema.ts:101–118](../../convex/schema.ts)). Additive — every existing row validates unchanged, and a read that finds `accountId === undefined` degrades cleanly (below), so the backfill is not a correctness prerequisite.

| Index | Query served |
|---|---|
| `accounts.by_status` | admin: suspend/reactivate sweeps, operational lists |
| `businesses.by_account` **(new on `businesses`)** = `["accountId"]` | the Enterprise admin row expanding into its locations (§2.6); provisioning's per-location fan-out |

#### 2.2.2 Membership stays per-business — `requireBusinessAccess` is untouched

**Decision: the account is a plan/billing/grouping layer only. Access stays `(user, business)`.** An Enterprise login reaches its 10–15 locations through **10–15 `businessMemberships` rows** — the exact many-per-user shape the schema already supports (`by_userId_and_active`, §1.c). Enterprise provisioning writes those rows; `requireBusinessAccess` ([convex/lib/access.ts:102–110](../../convex/lib/access.ts)) is **not modified**, so no product write path changes behavior, and the highest-risk code in the project is not in this RFC's diff at all.

- *Rejected: account-level membership* (`accountMemberships(userId, accountId)`, and `requireBusinessAccess` resolves business → account → checks account membership). Rejected because it rewrites the most sensitive function for **zero functional gain** — per-business membership already expresses "one login, many locations." The only thing account membership would add is not re-writing N rows at provisioning time, which is a one-time cost paid by a background mutation, not worth the standing risk on every request.
- *Rejected: self-referential `businesses.parentBusinessId`.* Rejected because `businesses` already carries two meanings (business + celebration, RFC-001 §2.1.6); a third (group parent vs leaf location) overloads it further, and every membership/entitlement query would have to walk a parent chain — a read-amplification tax on the whole platform to serve 2% of customers (TASK-26 §4).
- *Rejected: no table, a `plan` string + `accountKey` on each `businesses` row.* Rejected because the plan is account-level: duplicating it per location makes "one plan for all locations" a write-fan-out and invites drift (invariant: exactly one plan per account). A single `accounts` row holds it once.

#### 2.2.3 How `getEntitlement` resolves the plan from the account down

The plan (Axis B) feeds the **capability** gate, not the **ownership** gate (§1.b). `getEntitlement` ([convex/lib/entitlements.ts:25–92](../../convex/lib/entitlements.ts)) gains **one additive step at the bottom**; steps 1–2 are byte-identical to today:

1. **space-scoped** active entitlement row wins (unchanged) — RFC-001's "Premium tier for one specific event" override.
2. **business-scoped** active entitlement row (unchanged) — an admin's per-location pin, and every legacy manual grant from `approveActivation`.
3. **NEW — account plan.** Read `business.accountId → account`. If the account is `active` and its `plan` grants this `product` a tier via `ACCOUNT_PLAN_TIER[product][account.plan]` (a new map in `plans.ts`), return that tier's limits **spread with `account.overrides`**, `planKey = the mapped tier`, `status = "active"`.
4. `null` (unchanged).

Read top-down, this *is* "resolve the plan from the account level downward": the account is the baseline tier; a business-scoped row refines it for one location; a space-scoped row refines it for one space. Read most-specific-first (as the code already does), the account is simply the least-specific fallback. **No caller changes shape** — callers already pass `spaceId` when they have one and omit it otherwise.

`ACCOUNT_PLAN_TIER` in `plans.ts` (code, so tuning is a deploy):

```ts
// account plan → per-product tier (planKey). Products with no plan gate (links, review) are absent.
ACCOUNT_PLAN_TIER = {
  scanme_memories: { basic: "basic", premium: "premium", enterprise: "premium" },   // standard(5) is override-only
  scanme_venue:    { basic: "basic", premium: "basic",   enterprise: "basic"   },   // Venue tiers TBD, RFC-001 §5 Q1
}
```

- **Memories has three tiers, the plan has two relevant ones.** Decision: account `basic → memories basic` (3), account `premium → memories premium` (10); the `standard` (5) tier stays **reachable only through an explicit space/business override** (an admin grant, or the per-event premium purchase, RFC-001 §2.3). Rejected: collapsing Memories to two tiers — RFC-001 shipped three and the 5-photo mid-tier is a genuine per-event upsell; deleting it to match the plan axis throws away a lever for no reason.
- **Enterprise is "on request," not a fixed higher tier.** Decision: `enterprise` maps to the same tier as `premium` by default, and negotiated deviations are written to `account.overrides` (merged in step 3) rather than invented as new tier constants. Rejected: an `enterprise` tier per product in `PLAN_LIMITS` — Enterprise is bespoke by definition (TASK-26 §3), so a fixed fourth tier would be a fiction; overrides model "custom" honestly.

**Does Enterprise share entitlements or assign them per location? — the plan is shared, ownership is per location.** The account's plan tier resolves for **every** location under it (one plan, one bill — step 3 reads whichever `businessId` is asked). But *which services a location has* stays per-location: `serviceProfiles.status` and the per-location purchase decide it, so location A can run Venue+Memories while location B runs only Review, all under one Premium plan. This is the honest answer to TASK-26 §3's question, and it is why the two gates were kept separate in §1.b.

**A consequence worth stating:** the new purchase flow (§2.3–2.5), for the common case, writes **no per-business entitlement row** — it activates `serviceProfiles` (ownership) and sets `account.plan` (tier), and step 3 resolves the tier live. This is what makes "Premium unlocks premium on every service the account has **and every one it later adds, with no surcharge**" (TASK-26 §1) true by construction: add a service tomorrow, its tier resolves from today's account plan with zero writes. The legacy `approveActivation` path (which does write a per-business row) still works via step 2 and still wins where present — both coexist.

#### 2.2.4 Backfill of existing rows (specified, not run)

Following the RFC-001 migration pattern (specified, executed when the feature ships): every existing `businesses` row gets its **own solo account** (1:1), `account.name = business.name`, and `account.plan` derived from that business's existing active entitlement (a premium-grade `planKey` → `premium`, else `basic`). Because `getEntitlement` step 3 only fires when steps 1–2 return nothing, and every currently-active service already has a business-scoped entitlement row (from `approveActivation`), **day-one behavior is identical** — the account fallback changes an answer only where there was previously `null`. The backfill exists to make grouping and reporting explicit, and is not a prerequisite for shipping the `accountId` field.

```ts
// convex/migrations.ts — SPECIFIED, not executed in this task.
export const backfillSoloAccounts = internalMutation({ /* paginate businesses;
  for each with accountId === undefined: insert a solo account (plan derived from its
  active entitlement, else "basic"), patch business.accountId; self-reschedule via
  ctx.scheduler.runAfter(0, ...) — the exact shape of RFC-001 §2.1.6's backfillBusinessKind. */ });
```

### 2.3 The purchase flow — one shell, four steps, state in the URL

**The shell is a frame and a rail**: a rounded panel, a header, a step timeline on top, and a **sticky bottom bar** carrying the running total and the advance button. It does not change or disappear in any step. The three configurator panels are **not** the shell — they are what steps 1 and 3 put *inside* it; step 2 puts something else inside. **State lives in the URL** so a configuration is shareable by link — the existing codec ([lib/offer-url.ts](../../lib/offer-url.ts)) is extended from "one service + tier" to "a set of services + a plan," keeping its versioned, strictly-validated discipline (a v5).

The total row **splits the two kinds of money**: `9.990 RSD godišnje · + 24.000 RSD jednokratno` — recurring plan/service money and one-time physical-product money are never summed into one figure.

**Step 1 — services.** The **monthly/annual toggle sits at the top**, above the list, because it changes every price on screen; prices animate/cross-fade on switch. Left: the five services + the combo (package) cards; a click expands one. Center: **a live phone-frame preview of the real page of that service** — the answer to "the buyer doesn't know what Venue is" is to show it, not explain it. Right: the live cart with struck-through prices, savings in dinars, and a nudge line (*"Dodaj Meni i štediš još 900."*). Each service card carries what you get, and — below a thin divider, in a second color — one line: *"Sa Premium nalogom još i: …"*.

- **The live preview is read-only.** It renders the **existing public page** of each service through its existing view (for Links, the frozen public render path, *read* not edited — §6 confirms reading is not a freeze touch). No service template gains a new prop for the preview.

**Step 2 — plan.** Two full-width columns. **Basic**: a list, headed *"Uključeno, ne plaćaš ništa."* **Premium**: the first item is **"Sve iz Basic-a,"** then new items **grouped by the service the buyer chose** (each service's name as a small superheading) — nothing they did not buy — and the last item always: *"Sve buduće usluge automatski na Premium-u."*

- **Never divide the Premium price by the number of services.** The message is generosity — paid once, applies everywhere. A per-service figure would suggest Premium is sold per service (it is not) and that something is bundled into it. This is a copy/UX invariant, recorded so no one "helpfully" adds a per-service breakdown later.
- **Enterprise is not a third equal card.** It is a **dead end in the flow** (it leads to a contact form, not step 3) and concerns ~2% of visitors (TASK-26 §4). It appears as a quieter row beneath the two columns: *"Imate 10+ lokala? Napravićemo ponudu po meri →"*, routing to the existing contact target ([lib/offer-contact.ts:18](../../lib/offer-contact.ts)). Rejected: a three-card layout — it would give a bespoke, sales-led motion the same visual weight as the two self-serve plans and push the 98% to hesitate.

**Step 3 — physical products.** One pass, never N passes. **Service-binding is a property of a cart line and lives in the right sidebar as the first item, above Orientation** — because the service determines which templates are available, so it must come before design. It is visually set apart and required. **If the buyer bought only one service, the binding item is not shown at all** and the line is bound silently. If they change a line's service to one whose already-chosen design does not exist for the new service, reset to the default and write one line saying why. This reuses the existing configurator ([components/offer-configurator.tsx](../../components/offer-configurator.tsx), [lib/scanme-pricing.ts:107–421](../../lib/scanme-pricing.ts)) — the physical-product catalog, matrices, quantity ladder, and per-line design choice are unchanged; only the **service-binding property** is added to a line and surfaced as the first sidebar control.

- The top-right badge **stops being a control**: drop its dropdown arrow, make it a summary of the whole order (`3 usluge · Premium · godišnje`), and let a click open the cart. Two controls that both name the service and both look editable is a bug you get silently — the flow has exactly one editable place per fact.

**Step 4 — checkout.** Creates the order, provisions the account/profiles/entitlements, records the **price snapshot** (§2.5). Payment is a **stub** — no Serbian provider is chosen — implemented against the RFC-001 billing port (RFC-001 §2.3) so that when a provider is picked, an `httpAction` webhook maps to the same provisioning with no shape change.

### 2.4 The splitter (razdelnik) — one card, several services, and the table's survival

**Technical truth:** one card = one code = one destination. A card cannot point at two things — **unless that one destination is a splitter.**

**Decision: a card that serves several services resolves to a ScanMe Links page.** A customer who owns Links gets their styled Links page acting as the splitter. A customer who does not gets a **bare splitter** — buttons and nothing else, deliberately unstyled, so anyone who cares how it looks buys Links. A fair ladder, not a trick. Rejected: giving everyone a styleable splitter (removes the reason to buy Links); a "multi-target card" (contradicts one-code-one-destination — the splitter *is* the single destination).

**The condition that must live in the RFC, not be discovered late — written as a hard requirement, not a note:**

> **Memories computes quota per table card (§1.d). Every path from a card into Memories MUST pass through a card-aware server hop that mints the guest with that card's `cardId`. A bare client-side link from a splitter to `/m/[code]` is FORBIDDEN: it bypasses the minting branch ([convex/cards.ts:518–541](../../convex/cards.ts)), the guest is created with no `cardId`, the table identity is lost, per-table quota ceases to exist, and the Memories billing model collapses.**

This is enforced by construction, and the two splitter variants land on opposite sides of the ScanMe Links freeze:

- **Bare splitter (no Links) — buildable now, card-aware by construction.** It is **new code**, reached under `/r/[cardCode]` where the `cardCode` is already in the server context. Its Memories entry is **not** a client link to `/m/[code]`; it is a server route (e.g. `app/r/[cardCode]/m/route.ts`) that runs the **same guest-minting path** as the direct `memories_space` resolve — mint guest with `cardId`, `Set-Cookie` `Path=/m/[code]`, `302` to the clean `/m/[code]` URL. The table survives because the second hop is still card-aware. New `cardTargets.kind: "splitter"` (additive union widening on the shared `cardTargetKind` validator, [convex/schema.ts:79–85](../../convex/schema.ts)) plus a small destination list; the exact block model of the bare splitter is a minor open question (§5), the card-aware hop is not.
- **Links-page splitter (has Links) — BLOCKED on the owner.** Making the *Links page* card-aware requires the frozen public Links render path to know the `cardCode` and emit a card-aware Memories link instead of a plain `/m/[code]` href. **That edits the frozen ScanMe Links product (§6) and is BLOCKED on the owner's decision to unfreeze that one seam.** Until unblocked, Memories must **not** sit behind a Links-page splitter; per-table Memories uses either a **direct `memories_space` card** (RFC-001's path, already correctly attributed, [convex/cards.ts:518](../../convex/cards.ts)) or the **bare splitter**. A card whose splitter would include Memories via the Links page is refused at creation with a message pointing to the two supported patterns — the failure is loud at mint time, never a silent quota leak at scan time.

Rejected mechanism: pre-minting a guest for *every* splitter scan and setting the cookie before showing the splitter. Rejected because it manufactures a junk `memoriesGuests` row for everyone who scans and never opens Memories, and a splitter may reference more than one space, so "which space to pre-attribute" has no answer. Minting on the card-aware second hop mints exactly once, for exactly the space chosen.

### 2.5 The order, the price snapshot, and the billing port

**Decision: the paid price is snapshotted into the order at sale time.** The entitlement (and the account plan) is the **live permission**; the order is the **immutable record-as-sold** — precisely the pattern RFC-001 already uses for referral commissions (`celebrations.referralCommissionPercent` snapshotted from `partnerships`, RFC-001 §2.1.6). Raising a price later never rewrites a past order; a customer keeps what they bought at the price they bought it. This is *where* grandfathering lives — deliberately kept out of the pricing engine (§2.1) so the engine stays a pure function of the current set.

```ts
orders: defineTable({
  accountId: v.id("accounts"),
  status: v.union(v.literal("pending"), v.literal("paid"), v.literal("provisioned"),
    v.literal("cancelled"), v.literal("refunded")),
  plan: v.union(v.literal("basic"), v.literal("premium"), v.literal("enterprise")),
  planPeriod: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
  // The full PriceBreakdown the engine produced, frozen. Prose-free; the invoice re-renders it.
  priceSnapshot: v.object({ /* recurringTotal, oneTimeTotal, currency, lines[], packages[], planLine, engineVersion */ }),
  billingSource: v.optional(v.union(v.literal("manual"), v.literal("billing"))),
  externalRef: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_accountId_and_createdAt", ["accountId", "createdAt"])
  .index("by_status_and_createdAt", ["status", "createdAt"]),

orderItems: defineTable({          // one row per purchased service + one per physical product line
  orderId: v.id("orders"),
  businessId: v.id("businesses"),  // which location this line provisions (Enterprise: per location)
  kind: v.union(v.literal("service"), v.literal("physical")),
  service: v.optional(serviceTypeValidator),
  period: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
  boundService: v.optional(serviceTypeValidator),   // physical lines: the service the item is bound to (§2.3)
  physicalSelection: v.optional(v.any()),           // the ProductSelection snapshot (shape from lib/scanme-pricing.ts)
  lineTotalRsd: v.number(),
  createdAt: v.number(),
})
  .index("by_orderId", ["orderId"]),
```

| Index | Query served |
|---|---|
| `orders.by_accountId_and_createdAt` | a customer's order history (admin + client) |
| `orders.by_status_and_createdAt` | admin: pending/unprovisioned queue |
| `orderItems.by_orderId` | invoice + provisioning fan-out |

**Checkout provisioning (one transaction where possible; scheduler-fanned where a location count is large):** create the `orders` + `orderItems` rows with the snapshot; ensure the `account` (plan from Axis B); for each purchased service, ensure the location's `serviceProfiles` and activate it (ownership); leave the tier to `getEntitlement` step 3 (§2.2.3). Payment stays a stub: `orders.status` moves `pending → paid` by a manual admin action or, later, the billing-port webhook — the same seam RFC-001 built (`convex/lib/billingPort.ts`, RFC-001 §2.3). No schema field waits on the provider choice.

### 2.6 The admin layer — a sheet above the existing one

**A table of *all* customers as the operational heart, not a list.** Columns: name, phone, active services, plan, period, **status**, **next renewal**, actions. Default sort by renewal — it is a work queue. This is a **new query** (`admin.customers`), not a widening of the review-welded `admin.listBusinesses` ([convex/admin.ts:116–165](../../convex/admin.ts), which hard-codes the Google-Review link and takes 100 rows unpaginated); the old query keeps serving the Google-Review screen untouched.

**Status is four states, and the fourth is the point:** `aktivan` · `ističe za < 14 dana` · `istekao` · **`plaćeno ali nikad podešeno`**. The last one predicts churn and is invisible unless built. It is **derived, not stored** — computed from *(account has an active plan / the location has an active service)* ∧ *(no published config / no content exists)*. Rejected: a stored status column — it would drift from the underlying facts; deriving it keeps it honest and free.

**Enterprise is one row that expands into its locations**, not fifteen rows. The query groups `businesses` by `accountId` (`by_account`); an account with more than one location renders as **one expandable row**, a solo account as a normal full-width row. The **left sidebar of locations exists only inside an Enterprise customer**; for everyone else the page is full width.

**Activation and deactivation of services happen from the table, and every change writes a trail — who, what, when.** Paid things are granted by hand; without a log the first dispute is unresolvable.

```ts
adminAuditLog: defineTable({
  actorUserId: v.id("users"),                 // the admin who acted
  accountId: v.optional(v.id("accounts")),
  businessId: v.optional(v.id("businesses")),
  action: v.string(),                         // "activate_service" | "set_plan" | "grant_override" | "suspend" | ...
  detail: v.optional(v.string()),             // machine-parseable summary; prose is localized in the UI
  createdAt: v.number(),
})
  .index("by_accountId_and_createdAt", ["accountId", "createdAt"])
  .index("by_businessId_and_createdAt", ["businessId", "createdAt"])
  .index("by_createdAt", ["createdAt"]),
```

Every admin mutation that changes a plan, an entitlement, an override, or a service's active state writes one row in the same transaction. Rejected: leaning on `updatedAt`/`_creationTime` for audit — those record *when* a row last changed, never *who* or *what*, and manual grants are exactly the actions a dispute turns on.

**Per-location subpages** (Links / Review / Venue / Menu) render only for that location's **active** services; `Page` is renamed to `Menu` the day Menu exists (RFC-001 §2.5). The current admin stubs [app/admin/venue/page.tsx](../../app/admin/venue/page.tsx), [app/admin/memories/page.tsx](../../app/admin/memories/page.tsx), [app/admin/page/page.tsx](../../app/admin/page/page.tsx) are where these grow.

### 2.7 New-table / new-type catalog

Conventions follow [convex/schema.ts](../../convex/schema.ts): literal-union statuses, `createdAt`/`updatedAt` as `v.number()`, child tables over unbounded arrays, index names listing all fields. Everything below is **additive** — new tables start empty, and the two touched existing tables gain only optional fields.

| # | Table / type | New or Δ | Why it exists | Ref |
|---|---|---|---|---|
| A.1 | `accounts` | new | the plan/billing/grouping row above `businesses`; carries Axis B | §2.2.1 |
| A.2 | `businesses.accountId` | Δ (optional field) + `by_account` index | link a location to its account; degrades cleanly when absent | §2.2.1 |
| A.3 | `orders` | new | the immutable record-as-sold; holds the price snapshot | §2.5 |
| A.4 | `orderItems` | new | per-service + per-physical line of an order; drives provisioning + invoice | §2.5 |
| A.5 | `adminAuditLog` | new | who/what/when for every manual plan/entitlement/activation change | §2.6 |
| A.6 | `cardTargets.kind: "splitter"` (+ splitter destination storage) | Δ (union widening) | the single destination a multi-service card resolves to | §2.4 |
| A.7 | `plans.ts: ACCOUNT_PLAN_TIER` | code (not schema) | maps account plan → per-product tier for `getEntitlement` step 3 | §2.2.3 |
| A.8 | `lib/pricing/` (`engine.ts`, `constants.ts`, golden fixture) | code (not schema) | the pure dual-axis engine; placeholder constants; the golden table | §2.1 |
| A.9 | `accounts.overrides` | (field on A.1) | Enterprise-negotiated capability deviations, merged by `getEntitlement` | §2.2.3 |

No index key on any **existing** table changes. `entitlements` is **not** modified (the account layer is served by `accounts` + `plans.ts`, deliberately, so the shipped entitlement read path and its ambiguous-row throw are untouched, §1.b).

### 2.8 Change list against existing code (risk-annotated)

| File / area | Change | Risk | Why it is bounded |
|---|---|---|---|
| [convex/schema.ts](../../convex/schema.ts) | `accounts`, `orders`, `orderItems`, `adminAuditLog` (new); `businesses.accountId` + `by_account`; `cardTargets.kind` +`"splitter"` | low | additive; existing rows validate unchanged; new tables empty (no `staged:` indexes) |
| [convex/lib/entitlements.ts](../../convex/lib/entitlements.ts) | `getEntitlement` gains step 3 (account fallback) | **medium** | steps 1–2 byte-identical; step 3 only answers where today's result is `null`; covered by convex-test before/after; the ambiguous-row throw is not touched |
| [convex/lib/plans.ts](../../convex/lib/plans.ts) | add `ACCOUNT_PLAN_TIER` | low | additive const; no existing export changes |
| [convex/lib/access.ts](../../convex/lib/access.ts) | **no change to `requireBusinessAccess`** | — | the central decision (§2.2.2) is to leave it alone; Enterprise access is N membership rows |
| [convex/cards.ts](../../convex/cards.ts) | new splitter branch + card-aware `/r/[cardCode]/m` hop; direct `memories_space` mint unchanged | **medium** | the mint path that preserves `cardId` is reused verbatim; the bare splitter is new code; the Links-page splitter is refused at mint (§2.4) |
| [convex/admin.ts](../../convex/admin.ts) | new `admin.customers` query; new activation/plan mutations that write `adminAuditLog`; existing `listBusinesses`/`approveActivation` untouched | low | new surface alongside old; the review-welded query keeps serving its screen |
| [lib/scanme-pricing.ts](../../lib/scanme-pricing.ts) | SaaS half superseded by `lib/pricing/`; physical-product half retained + imported | medium | golden table gates the new engine; physical matrices unchanged |
| [lib/offer-url.ts](../../lib/offer-url.ts) | v5: set-of-services + plan | low | additive version; v1–v4 parsers kept; strict validation discipline preserved |
| [components/pricing-plans.tsx](../../components/pricing-plans.tsx), [components/offer-configurator.tsx](../../components/offer-configurator.tsx), [app/ponuda/**](../../app/ponuda/page.tsx) | consume the new engine; the four-step shell; service-binding on physical lines | medium | marketing/commerce surface, **not** the frozen product; verified in the browser at both widths |
| **ScanMe Links product** (public render path / editor) | **no change** — see §6 | frozen | reading the public page for the live preview (§2.3) is not a touch; the only wanted touch (splitter card-awareness on the Links page) is **BLOCKED** |

---

## 3. Risk register

Ranked. Each risk lists blast radius and a concrete mitigation.

| # | Risk | Blast radius | Mitigation |
|---|---|---|---|
| 1 | **`getEntitlement` account fallback (§2.2.3) mis-resolves a tier** — a wrong `ACCOUNT_PLAN_TIER` map, or step 3 firing where a step-2 row should have won, silently grants or denies premium capability across a whole account. | Every location under an account; a paying customer without limits, or a free one with premium. | Steps 1–2 are byte-identical (convex-test asserts before/after); step 3 only answers where today's result is `null`; a convex-test matrix covers {no account, basic, premium, enterprise} × {space/business override present/absent}; the ambiguous-row throw ([entitlements.ts:62](../../convex/lib/entitlements.ts)) is preserved. |
| 2 | **Client and server compute a different price.** The engine is imported on the marketing page, the checkout server, and the invoice; a divergence is a legal problem, not a bug (§2.1). | Every quote and every invoice; trust and legal exposure. | One shared pure module, zero I/O; the 31×2×period golden table is the merge gate; a CI check regenerates the golden from `constants.ts` and fails on any drift; the four hard invariants throw on bad constants. |
| 3 | **A splitter drops the table identity** (§2.4) — a bare client link to `/m/[code]`, now or in a later edit, mints a guest with no `cardId`. | Per-table quota and statistics for every Memories space reached via a splitter; the Memories billing model. | The card-aware `/r/[cardCode]/m` hop reuses the exact minting branch; the Links-page splitter is **refused at card creation** (loud at mint, never silent at scan); a convex-test asserts a splitter→Memories scan yields a guest **with** `cardId`; the freeze ledger (§6) records the one blocked path. |
| 4 | **`requireBusinessAccess` regressed by Enterprise work.** The most sensitive code (§1.c); a subtle change corrupts access for every product. | Every host write path across all products. | The decision is to **not touch it** (§2.2.2); Enterprise access is N membership rows through the unchanged function; the existing access tests are the gate and must pass byte-identically. |
| 5 | **Provisioning fan-out on a large Enterprise** — creating N locations, N memberships, and N `serviceProfiles` in one checkout exceeds a transaction's limits or partially applies. | An Enterprise onboarding stuck half-provisioned. | Bounded per-location work with `ctx.scheduler.runAfter(0, …)` continuations (RFC-001's bulk pattern); `orders.status` is the durable state a resumable provisioner advances; idempotent per `orderItems` row. |
| 6 | **Price/plan drift between the order snapshot and the live entitlement** — a customer's snapshot says one thing, `getEntitlement` resolves another after an admin edit. | Billing disputes; a customer charged for more than they can use. | The snapshot is the record-as-sold (§2.5), the entitlement is the live permission — they are *meant* to differ after a change; `adminAuditLog` records every plan/override edit (§2.6) so any divergence has a who/what/when. |
| 7 | **"Paid but never configured" never surfaces** — the churn-predicting status (§2.6) is derived, and a wrong derivation hides at-risk customers. | Silent churn of exactly the customers most worth saving. | The status is computed from active-plan/service ∧ no-published-config in the `admin.customers` query, unit-tested against seeded fixtures (paid+empty, paid+configured, free); sorted to the top of the work queue. |
| 8 | **Menu is priced but does not exist** (§2.0 constraint 7) — the engine sells a Menu line and the flow offers a Menu preview/binding for a product with no page. | A customer pays for vapor; a broken step-1 preview or step-3 binding. | Menu is a first-class *pricing* citizen but every *surface* degrades to "uskoro" — no Menu preview, no Menu template in the binding list, and (owner decision, §5) Menu is either hidden from the sellable set until it ships or sold explicitly as pre-order. |

---

## 4. Implementation sequence (the thirteen tasks)

Each step has a criterion a test or check can confirm. Steps 1–2 are the engine (no DB); 3–4 are the Enterprise/plan spine (PLAN mode, early, isolated); 5 is the order layer; 6–10 are the flow; 11 is the splitter; 12–13 are admin. The engine (1–2) and the Enterprise spine (3–4) are independent and may be built in parallel after this RFC.

| # | Step | Verifiable success criterion |
|---|---|---|
| 1 | Pricing engine `lib/pricing/` (pure) + `constants.ts` placeholders + golden table | Golden fixture (31 subsets × 2 plans × period splits) matches; each of the four invariants has a test; a deliberate constant edit that would violate an invariant makes the engine throw; a reorder of `items` never changes the result |
| 2 | Wire the engine into the marketing pricing page + offer configurator; retire `SAAS_PRICING` tier model; keep physical matrices | Marketing "Od" prices and cart totals come from the engine; `npm run check` green; the frozen Links product is untouched (§6 grep gate) |
| 3 | **PLAN mode, isolated**: `accounts` + `businesses.accountId` + backfill (specified) + `getEntitlement` step 3 + `ACCOUNT_PLAN_TIER` | convex-test: a solo account resolves its tier from `account.plan`; a business-scoped override still wins; **existing access + entitlement tests pass byte-identically** (`requireBusinessAccess` untouched); `getEntitlement` returns today's answer wherever a step-2 row exists |
| 4 | Enterprise provisioning mutation (account + N businesses + N memberships for the admin) + admin grouping read | convex-test: one admin user reaches all N locations through `requireBusinessAccess` unchanged; `admin.customers` renders one expandable Enterprise row and solo rows full-width; provisioning resumes cleanly after a simulated mid-fan-out stop |
| 5 | `orders` + `orderItems` + price snapshot + billing-port stub reuse | convex-test: checkout writes the snapshot; a later `constants.ts` price change leaves the existing order's snapshot byte-identical; `orders.status pending→paid` via manual admin action provisions |
| 6 | Purchase shell (frame, timeline, sticky split-total bar) + v5 URL codec | The shell persists across all four steps; a configuration round-trips through the URL (v5 parse/encode); v1–v4 offer URLs still parse |
| 7 | Step 1 — services list + top period toggle + live cart (struck prices, savings, nudge) + live phone preview (read-only real pages) | Toggling period reflows every on-screen price; the cart total equals the engine's; the preview renders each service's real public page with no edit to any template |
| 8 | Step 2 — Basic/Premium two columns (Premium grouped by owned service, "Sve iz Basic-a", future-services line) + Enterprise quiet row → contact | Premium column lists premium items only for owned services; the Premium price is never shown divided per service; Enterprise routes to the contact target and never into step 3 |
| 9 | Step 3 — one-pass physical products; service-binding as the first sidebar item above Orientation; single-service hides it and binds silently; invalid-design reset on rebind | Binding renders above Orientation; a one-service order hides the binding control; changing a line's service resets an incompatible design and writes the one-line reason; the top badge is a summary, not a control |
| 10 | Step 4 — checkout stub: create order, provision account/profiles, activate services, snapshot | Post-checkout: `getEntitlement` resolves the bought tier from the account plan for each owned service; payment is a stub against the billing port; the order carries the snapshot |
| 11 | Cards → splitter: bare card-aware splitter (new code) + the card-identity condition enforced; direct `memories_space` unchanged | convex-test/e2e: scanning a splitter card then choosing Memories mints a guest **with** `cardId` (table survives); a card whose splitter would route Memories through the Links page is **refused at creation** with the two-pattern message |
| 12 | Admin customers table (`admin.customers`): columns, sort-by-renewal, four statuses incl. "paid but never configured"; activation/deactivation writing `adminAuditLog` | Every activation/plan change writes exactly one audit row (who/what/when); the "plaćeno ali nikad podešeno" status appears for a seeded paid-unconfigured account and sorts to the top |
| 13 | Admin per-location subpages gated by active services + Enterprise per-location sidebar + `Page→Menu` rename hook | An inactive service's subpage is hidden; the per-location sidebar appears only inside a multi-location account; the `Page` label flips to `Menu` behind the Menu-exists flag |

The one **blocked** item — splitter card-awareness *through the Links page* — is **not** a task here; it waits on the owner (§6).

---

## 5. Open questions

Named, each with who resolves it. Information this RFC did not have and did not invent.

1. **Final prices, the Premium price, and the three package prices** — placeholder constants in `lib/pricing/constants.ts` (§2.1). **Owner.** The engine and the golden generator are ready for them; filling them is a deploy, not a code change.
2. **Serbian payment provider** — the checkout is a stub against the billing port (§2.5). Blocks real capture only; nothing else waits on it. **Owner / founder.**
3. **Unfreeze ScanMe Links for the splitter seam?** — routing Memories through a Links-page splitter needs the frozen public Links render path to emit a card-aware Memories link (§2.4, §6). **Owner.** Until decided, Memories-behind-a-splitter is supported only via the bare splitter or a direct card.
4. **Menu's existence and sell timing** — Menu is priced (§2.1) but has no product (§2.0 constraint 7). Hidden from the sellable set until it ships, or sold as an explicit pre-order? **Owner / product.**
5. **Memories `standard` (5-photo) tier exposure** — kept as override-only under the two-plan account model (§2.2.3). Should the flow ever offer it directly, or does it stay an admin/per-event lever? **Product.**
6. **Review-free-from-the-fourth rule** — DECIDED as an engine rule (§2.1), but flagged for owner veto since it repositions Review's price. **Owner.**
7. **Enterprise plan semantics** — modelled as "premium tier by default + negotiated `account.overrides`" (§2.2.3). Confirm this matches how Enterprise is actually sold, or whether a fixed enterprise tier per product is wanted. **Owner / sales.**
8. **The bare splitter's block/destination model** — the card-aware hop is specified (§2.4); the exact stored shape of a bare splitter's button list is left minimal and open. **Next implementer of task 11.**
9. **VAT/PDV split in the snapshot and invoice** — today's physical prices include PDV ([lib/scanme-pricing.ts:5](../../lib/scanme-pricing.ts)); the recurring/one-time split (§2.3) and how PDV is itemized on the invoice is unspecified. **Owner / accounting.**

---

## 6. ScanMe Links freeze ledger

ScanMe Links (the **product** — its public render path and editor) is frozen (§2.0 constraint 6). This RFC touches it in exactly **zero** places, and records here every point where a decision *neighbours* the freeze so nothing is discovered late:

| Neighbouring decision | Does it touch the frozen product? | Disposition |
|---|---|---|
| Live phone preview of the real Links page in step 1 (§2.3) | **No** — it *reads* the existing public render, no edit, no new prop | Allowed; reading is not a touch (RFC-001 §2.11 treats the public render as read-only elsewhere too) |
| Splitter card-awareness via the **Links page** (§2.4) | **Yes** — the Links render path would have to know `cardCode` and emit a card-aware Memories link | **BLOCKED on the owner's decision** to unfreeze that one seam; until then Memories-behind-a-splitter uses the bare splitter or a direct card, and a Links-page-splitter-with-Memories card is refused at creation |
| Pricing engine / marketing pricing page / offer configurator (§2.1, §2.3) | **No** — these are marketing/commerce surfaces ([lib/scanme-pricing.ts](../../lib/scanme-pricing.ts), [components/pricing-plans.tsx](../../components/pricing-plans.tsx), [app/ponuda/**](../../app/ponuda/page.tsx)), not the ScanMe Links product | Allowed; in scope |
| `page → Menu` admin rename (§2.6) | **No** — admin surface, and Menu is a separate future product (RFC-001 §2.5) | Allowed; lands with Menu |

Anything a future task discovers that *does* require editing the ScanMe Links public render path or editor must stop and be re-flagged here as blocked on the owner, exactly as row 2 is.

---

*End of RFC-002.*
