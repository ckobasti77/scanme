// Pricing constants for the dual-axis engine (RFC-002 §2.1, TASK-01).
//
// EVERY NUMBER IN THIS FILE IS A PLACEHOLDER the owner fills later (RFC-002 §5
// Q1). The engine (./engine.ts) imports them and never hard-codes a value, so
// filling them in is a deploy, not a code change. The golden fixture
// (./golden.json) is REGENERATED from this file — `npm run pricing:golden` —
// and any edit here that the regeneration does not accompany fails
// `lib/pricing/golden.test.ts`. That is deliberate: price is a thing you must
// never change by accident.
//
// Money is whole RSD dinars, as in lib/scanme-pricing.ts. Rates are integer
// basis points (10000 = 100%) so no discount is ever a float rounding.

import type { BillingPeriod, PackageId, PlanId, Rsd, ServiceId } from "./types";

/** Bumped whenever the SHAPE of a PriceBreakdown changes. Frozen into
 *  `orders.priceSnapshot.engineVersion` (RFC-002 §2.5) so an old snapshot is
 *  always readable by the invoice that rendered it. A constant edit does NOT
 *  bump it — the snapshot carries the numbers, not a pointer to them. */
export const PRICING_ENGINE_VERSION = 1;

/** Canonical service order. It is the deterministic tie-break everywhere in the
 *  engine (ladder ties, package member ordering, output line order), which is
 *  what makes `price()` independent of the order `items` arrives in. */
export const SERVICE_IDS: readonly ServiceId[] = [
  "links",
  "venue",
  "memories",
  "menu",
  "review",
];

/** Group order in the output. Fixed, so two carts with the same content produce
 *  byte-identical breakdowns regardless of input order. */
export const BILLING_PERIODS: readonly BillingPeriod[] = ["monthly", "annual"];

export interface PeriodPrice {
  monthly: Rsd;
  annual: Rsd;
}

export interface PackageDefinition {
  id: PackageId;
  /** The exact service set. A package applies only when ALL of these sit in one
   *  period group (RFC-002 §2.1). */
  services: readonly ServiceId[];
  price: PeriodPrice;
}

export interface PricingConstants {
  /** Axis A — the per-service list price. */
  service: Readonly<Record<ServiceId, PeriodPrice>>;
  /** Axis B — the account plan line. `basic` is free; `enterprise` is on
   *  request and never carries a computed price (RFC-002 §2.3 step 2). */
  plan: Readonly<Record<Exclude<PlanId, "enterprise">, PeriodPrice>>;
  /** Named marketing bundles — decompositions, never SKUs (RFC-002 §2.1). */
  packages: readonly PackageDefinition[];
  /** Position ladder, applied to the services left outside every package.
   *  Index 0 is the MOST EXPENSIVE remaining service, which is why index 0 is
   *  always 0 bps: "the most expensive item is never discounted" (RFC-002
   *  §2.1 step 3). Positions past the end reuse the last rung. */
  ladderBps: readonly number[];
  /** Review is free once the cart holds this many services and includes Review
   *  (RFC-002 §2.1, "Review is free from the fourth service up"). */
  reviewFreeFromServiceCount: number;
  /** Invariant 1 — no priced line is ever billed below this share of list. */
  minLineChargeBps: number;
  /** Invariant 2 — total discount within one period group never exceeds this. */
  maxGroupDiscountBps: number;
}

export const DEFAULT_PRICING_CONSTANTS: PricingConstants = {
  service: {
    links: { monthly: 990, annual: 9990 },
    venue: { monthly: 1490, annual: 14990 },
    memories: { monthly: 1290, annual: 12990 },
    menu: { monthly: 890, annual: 8990 },
    review: { monthly: 490, annual: 4990 },
  },
  plan: {
    basic: { monthly: 0, annual: 0 },
    premium: { monthly: 990, annual: 9990 },
  },
  packages: [
    { id: "dogadjaj", services: ["venue", "memories"], price: { monthly: 2390, annual: 23990 } },
    { id: "lokal", services: ["links", "menu"], price: { monthly: 1590, annual: 15990 } },
    // NOTE FOR THE OWNER (found by invariant 4 while filling these in, not by
    // reading the RFC): with the "Review is free from the fourth service up"
    // rule DECIDED (RFC-002 §2.1, §5 Q6), the five-service cart is already
    // "the four paid + Review at 0". A Kompletan price BELOW that four-service
    // ladder total makes the fifth service lower the bill, which invariant 4
    // rejects; a price at or above it is never the cheapest decomposition, so
    // the package is never selected. Kompletan is therefore currently a name
    // with no effect. Two ways out, both the owner's call: veto the free-Review
    // rule (§5 Q6) and price Kompletan freely, or drop the package and let the
    // free Review BE the Kompletan offer. Nothing in the engine needs changing
    // for either.
    {
      id: "kompletan",
      services: ["links", "venue", "memories", "menu", "review"],
      price: { monthly: 3790, annual: 37990 },
    },
  ],
  ladderBps: [0, 2000, 3000, 4000, 5000],
  reviewFreeFromServiceCount: 4,
  minLineChargeBps: 5000,
  maxGroupDiscountBps: 4500,
};
