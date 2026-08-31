// The order price snapshot (RFC-002 §2.5, TASK-05).
//
// The entitlement (and the account plan) is the LIVE permission; the order is
// the IMMUTABLE record-as-sold. At sale time the pricing engine's breakdown is
// copied — frozen — into `orders.priceSnapshot`, exactly the pattern RFC-001
// already uses for referral commissions (a percent snapshotted from
// `partnerships` into `celebrations`). Raising a price later never rewrites a
// past order: the snapshot carries the numbers, not a pointer to them.
//
// This is deliberately WHERE grandfathering lives — kept out of the pricing
// engine (`lib/pricing/`, §2.1) so the engine stays a pure function of the
// CURRENT set of services and plan, with no history and no clock.
//
// The validator below mirrors the engine's `PriceBreakdown` (lib/pricing/types)
// field for field, plus two headline totals the flow shows separately and never
// sums (§2.3): `recurringTotalRsd` (services + plan) and `oneTimeTotalRsd`
// (physical products). The invoice re-renders the order purely from this object.

import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { PriceBreakdown } from "../../lib/pricing/types";

// Axis-A service ids of the pricing engine (lib/pricing/types `ServiceId`). This
// is the FIVE-service sellable set and is intentionally distinct from the schema
// `serviceTypeValidator` union — `menu` is priced but has no product yet, and
// `review` is `google_review` on the product side. The snapshot stores the
// engine's output verbatim, so it speaks the engine's vocabulary.
const pricingServiceValidator = v.union(
  v.literal("links"),
  v.literal("venue"),
  v.literal("memories"),
  v.literal("menu"),
  v.literal("review"),
);

const billingPeriodValidator = v.union(
  v.literal("monthly"),
  v.literal("annual"),
);

const planValidator = v.union(
  v.literal("basic"),
  v.literal("premium"),
  v.literal("enterprise"),
);

const packageIdValidator = v.union(
  v.literal("dogadjaj"),
  v.literal("lokal"),
  v.literal("kompletan"),
);

const priceLineValidator = v.object({
  service: pricingServiceValidator,
  period: billingPeriodValidator,
  listRsd: v.number(),
  discountRsd: v.number(),
  chargedRsd: v.number(),
  // null when the line stands on its own (ladder-priced or undiscounted).
  packageId: v.union(packageIdValidator, v.null()),
});

const packageAttributionValidator = v.object({
  packageId: packageIdValidator,
  period: billingPeriodValidator,
  services: v.array(pricingServiceValidator),
  listRsd: v.number(),
  priceRsd: v.number(),
  savingsRsd: v.number(),
});

const periodGroupTotalsValidator = v.object({
  period: billingPeriodValidator,
  services: v.array(pricingServiceValidator),
  listRsd: v.number(),
  chargedRsd: v.number(),
  savingsRsd: v.number(),
});

const planLineValidator = v.object({
  plan: planValidator,
  // null for enterprise (on request) and basic (free) — neither carries a period.
  period: v.union(billingPeriodValidator, v.null()),
  amountRsd: v.number(),
  onRequest: v.boolean(),
});

// The frozen snapshot. Prose-free by design (§2.5): every string here is an
// engine enum, never localized copy — the invoice localizes at render time.
export const priceSnapshotValidator = v.object({
  engineVersion: v.number(),
  currency: v.literal("RSD"),
  lines: v.array(priceLineValidator),
  packages: v.array(packageAttributionValidator),
  groups: v.array(periodGroupTotalsValidator),
  planLine: planLineValidator,
  servicesListRsd: v.number(),
  servicesChargedRsd: v.number(),
  savingsRsd: v.number(),
  // The two kinds of money, kept apart and never summed into one figure (§2.3).
  // recurringTotalRsd is the engine's `totalRsd` (services + plan); oneTimeTotal
  // is the physical-product sum (lib/scanme-pricing), which the engine never sees.
  recurringTotalRsd: v.number(),
  oneTimeTotalRsd: v.number(),
});

export type PriceSnapshot = Infer<typeof priceSnapshotValidator>;

// Freeze a breakdown into a storable snapshot. The engine's `PriceBreakdown`
// already carries every recurring field; the only thing added is the one-time
// physical total (which the engine never sees) and the `recurringTotalRsd`
// alias for §2.3's two-money vocabulary. A pure copy — no rounding, no
// re-derivation — so the stored bytes equal what the buyer was quoted.
export function buildPriceSnapshot(
  breakdown: PriceBreakdown,
  oneTimeTotalRsd: number,
): PriceSnapshot {
  return {
    engineVersion: breakdown.engineVersion,
    currency: breakdown.currency,
    lines: breakdown.lines.map((line) => ({
      service: line.service,
      period: line.period,
      listRsd: line.listRsd,
      discountRsd: line.discountRsd,
      chargedRsd: line.chargedRsd,
      packageId: line.packageId,
    })),
    packages: breakdown.packages.map((pkg) => ({
      packageId: pkg.packageId,
      period: pkg.period,
      services: [...pkg.services],
      listRsd: pkg.listRsd,
      priceRsd: pkg.priceRsd,
      savingsRsd: pkg.savingsRsd,
    })),
    groups: breakdown.groups.map((group) => ({
      period: group.period,
      services: [...group.services],
      listRsd: group.listRsd,
      chargedRsd: group.chargedRsd,
      savingsRsd: group.savingsRsd,
    })),
    planLine: {
      plan: breakdown.planLine.plan,
      period: breakdown.planLine.period,
      amountRsd: breakdown.planLine.amountRsd,
      onRequest: breakdown.planLine.onRequest,
    },
    servicesListRsd: breakdown.servicesListRsd,
    servicesChargedRsd: breakdown.servicesChargedRsd,
    savingsRsd: breakdown.savingsRsd,
    recurringTotalRsd: breakdown.totalRsd,
    oneTimeTotalRsd,
  };
}

// The service a purchased line provisions, on the SCHEMA side (`serviceType`).
// Mirrors the schema `serviceTypeValidator` union without importing it (schema
// imports THIS module — the dependency must not point back).
export type ServiceType =
  | "scanme_links"
  | "google_review"
  | "scanme_venue"
  | "scanme_memories";

// serviceType (schema) → pricing ServiceId (engine). `menu` has no serviceType
// yet (the product does not exist, §2.0 constraint 7), so it is absent here and
// cannot be an order line — it is priceable in the engine but not sellable until
// Menu ships. This map is the one place the two vocabularies meet, so the server
// derives the engine input from the order's own service lines rather than
// trusting a separately-supplied price.
export const PRICING_SERVICE_BY_SERVICE_TYPE = {
  scanme_links: "links",
  google_review: "review",
  scanme_venue: "venue",
  scanme_memories: "memories",
} as const satisfies Record<
  ServiceType,
  "links" | "venue" | "memories" | "review"
>;
