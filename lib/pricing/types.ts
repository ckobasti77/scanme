// Shared vocabulary of the pricing engine (RFC-002 §2.1). Kept in its own
// module so `constants.ts` and `engine.ts` can import types from each other's
// direction without a cycle.
//
// NOTE the deliberate namespace split: `ServiceId` here is the FIVE-service
// sellable set of RFC-002. `lib/scanme-pricing.ts` also exports a `ServiceId`,
// but that is the legacy two-service offer surface ("review" | "links") whose
// SaaS half this module supersedes (RFC-002 §1.a). The physical-product half of
// that file is untouched and still imported from there.

export type Rsd = number;

export type ServiceId = "links" | "venue" | "memories" | "menu" | "review";

export type BillingPeriod = "monthly" | "annual";

/** Axis B — the ACCOUNT plan, orthogonal to which services are owned. Basic is
 *  a free plan; the services are still paid (RFC-002 §2.0 constraint 1). */
export type PlanId = "basic" | "premium" | "enterprise";

export type PackageId = "dogadjaj" | "lokal" | "kompletan";

export interface PriceItem {
  service: ServiceId;
  period: BillingPeriod;
}

export interface PriceInput {
  /** One entry per purchased service. A service may appear at most once —
   *  a location owns a service, or it does not. */
  items: ReadonlyArray<PriceItem>;
  plan: PlanId;
  /** Required for `premium`, forbidden for `basic` and `enterprise`. See the
   *  note on `price()` — this is the one place the implementation extends the
   *  signature sketched in RFC-002 §2.1, because Premium has a monthly and an
   *  annual price and deriving which one from the items would make the plan
   *  line depend on the service mix. `orders.planPeriod` (§2.5) is optional for
   *  exactly the same reason. */
  planPeriod?: BillingPeriod;
}

export interface PriceLine {
  service: ServiceId;
  period: BillingPeriod;
  /** Undiscounted Axis-A price for this service at this period. */
  listRsd: Rsd;
  /** `listRsd - chargedRsd`. Always a non-negative integer. */
  discountRsd: Rsd;
  chargedRsd: Rsd;
  /** Set when the line is covered by a named package; `chargedRsd` is then this
   *  line's share of the package price (allocated pro-rata by list price). */
  packageId: PackageId | null;
}

export interface PackageAttribution {
  packageId: PackageId;
  period: BillingPeriod;
  services: readonly ServiceId[];
  listRsd: Rsd;
  priceRsd: Rsd;
  savingsRsd: Rsd;
}

/** One period basket. Monthly money and annual money are never mixed into a
 *  rate or a comparison — see the invariant notes in engine.ts. */
export interface PeriodGroupTotals {
  period: BillingPeriod;
  services: readonly ServiceId[];
  listRsd: Rsd;
  chargedRsd: Rsd;
  savingsRsd: Rsd;
}

export interface PlanLine {
  plan: PlanId;
  period: BillingPeriod | null;
  amountRsd: Rsd;
  /** Enterprise is quoted by hand and is a dead end in the flow (RFC-002 §2.3
   *  step 2): `amountRsd` is 0 and means "not priced here", not "free". */
  onRequest: boolean;
}

export interface PriceBreakdown {
  engineVersion: number;
  currency: "RSD";
  /** Canonically ordered: by period (monthly, annual), then by the canonical
   *  service order. Never by the order `items` arrived in. */
  lines: readonly PriceLine[];
  packages: readonly PackageAttribution[];
  groups: readonly PeriodGroupTotals[];
  planLine: PlanLine;
  servicesListRsd: Rsd;
  servicesChargedRsd: Rsd;
  /** `servicesListRsd - servicesChargedRsd` — what the cart saved on Axis A. */
  savingsRsd: Rsd;
  /** Services + plan. Physical products are NOT part of this engine; the flow
   *  shows them as a separate one-time figure and never sums the two
   *  (RFC-002 §2.3). */
  totalRsd: Rsd;
}
