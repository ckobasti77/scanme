// Plan catalog (RFC-001 §2.3). The limits live in code, never in the database:
// tuning a tier is a DEPLOY, never a migration. `getEntitlement`
// (convex/lib/entitlements.ts) is the only reader; it spreads a row's
// `overrides` over the tier defaults below.
//
// scanme_memories values are the confirmed defaults (§0.7): the 3/5/10
// photos-per-guest quota tiers plus retention 30/90/365 days and per-tier max
// image dimension 2048/2560/4096 px.
//
// scanme_venue is a PLACEHOLDER shape only — its tiers (which blocks per tier,
// event/archive limits) are open question §5 Q1. `allowedBlockKeys` is present
// so the read path and the entitlements `overrides` shape are exercised, but the
// key list is intentionally empty until the tiers are decided.

export type MemoriesPlanKey = "basic" | "standard" | "premium";
export type VenuePlanKey = "basic";

export interface MemoriesLimits {
  photosPerGuest: number;
  maxImageDimension: number;
  retentionDays: number;
}

export interface VenueLimits {
  allowedBlockKeys: readonly string[];
}

export const PLAN_LIMITS = {
  scanme_memories: {
    basic: { photosPerGuest: 3, maxImageDimension: 2048, retentionDays: 30 },
    standard: { photosPerGuest: 5, maxImageDimension: 2560, retentionDays: 90 },
    premium: { photosPerGuest: 10, maxImageDimension: 4096, retentionDays: 365 },
  },
  scanme_venue: {
    // TODO(RFC-001 §5 Q1): fill per-tier allowedBlockKeys once Venue tiers are
    // decided. Placeholder shape only.
    basic: { allowedBlockKeys: [] as readonly string[] },
  },
} satisfies {
  scanme_memories: Record<MemoriesPlanKey, MemoriesLimits>;
  scanme_venue: Record<VenuePlanKey, VenueLimits>;
};

// The products that carry a plan catalog. Links and Google Review have no plans
// and never resolve an entitlement.
export type PlanProduct = keyof typeof PLAN_LIMITS;

// The typed limit shape for a given product. Every tier within a product shares
// one shape (all scanme_memories tiers are MemoriesLimits, etc.), so indexing by
// any tier key collapses to that single shape. This is what makes
// `getEntitlement`'s `limits` typed per product instead of Record<string,
// unknown>: LimitsFor<"scanme_memories"> is MemoriesLimits, so a caller reading
// `limits.photosPerGuest` gets `number` with no cast.
export type LimitsFor<P extends PlanProduct> =
  (typeof PLAN_LIMITS)[P][keyof (typeof PLAN_LIMITS)[P]];

// Account plan (Axis B, RFC-002 §2.2.1) — mirrors accounts.plan in the schema.
export type AccountPlan = "basic" | "premium" | "enterprise";

// Account plan → per-product tier (planKey) for getEntitlement step 3
// (RFC-002 §2.2.3). Lives in code, so tuning is a deploy, never a migration.
// The value type is `keyof PLAN_LIMITS[product]`, so the map can never name a
// tier that does not exist.
//
// Memories: account basic → basic (3), premium → premium (10); the standard
// (5) mid-tier stays reachable only through an explicit space/business
// override (an admin grant, or the per-event premium purchase, RFC-001 §2.3).
// Enterprise is "on request": it maps to the same tier as premium, and
// negotiated deviations live in account.overrides (merged in step 3), never
// in new tier constants. Venue: every plan maps to the placeholder basic
// tier until Venue tiers are decided (RFC-001 §5 Q1).
export const ACCOUNT_PLAN_TIER: {
  [P in PlanProduct]: Record<
    AccountPlan,
    keyof (typeof PLAN_LIMITS)[P] & string
  >;
} = {
  scanme_memories: {
    basic: "basic",
    premium: "premium",
    enterprise: "premium",
  },
  scanme_venue: {
    basic: "basic",
    premium: "basic",
    enterprise: "basic",
  },
};
