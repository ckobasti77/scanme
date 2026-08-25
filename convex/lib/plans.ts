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
