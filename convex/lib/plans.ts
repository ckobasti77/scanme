// Plan catalog (RFC-001 §2.3). The limits live in code, never in the database:
// tuning a tier is a DEPLOY, never a migration. `getEntitlement`
// (convex/lib/entitlements.ts) is the only reader; it spreads a row's
// `overrides` over the tier defaults below.
//
// scanme_memories values are the confirmed defaults (§0.7): the 3/5/10
// photos-per-guest quota tiers plus retention 30/90/365 days and per-tier max
// image dimension 2048/2560/4096 px.
//
// scanme_venue tiers (TASK-43, closing RFC-001 §5 Q1): Basic carries the core
// blocks; Premium unlocks the interactive/content-heavy blocks (reservation,
// pastEvents, profileCards, priceList, gallery), unlimited scheduled events,
// and event analytics. `allowedBlockKeys` is the same shape the entitlement
// and account `overrides` already carry, so an Enterprise deviation composes
// with zero new machinery.

import { VENUE_BLOCK_TYPES } from "../../lib/venue-blocks";

export type MemoriesPlanKey = "basic" | "standard" | "premium";
export type VenuePlanKey = "basic" | "premium";

export interface MemoriesLimits {
  photosPerGuest: number;
  maxImageDimension: number;
  retentionDays: number;
}

export interface VenueLimits {
  allowedBlockKeys: readonly string[];
  /** Max events in {scheduled, live} at once; null = unlimited. */
  maxActiveEvents: number | null;
  /** Whether the owner may read event analytics (collection always runs). */
  analytics: boolean;
}

// The Basic core (TASK-43): informational blocks every venue gets for free.
// Premium is everything — derived from VENUE_BLOCK_TYPES so a future block
// type is Premium by default until this list deliberately adds it.
export const VENUE_BASIC_BLOCK_KEYS = [
  "countdown",
  "eventDateTime",
  "programTimeline",
  "map",
  "richText",
  "share",
  "spacer",
] as const;

export const PLAN_LIMITS = {
  scanme_memories: {
    basic: { photosPerGuest: 3, maxImageDimension: 2048, retentionDays: 30 },
    standard: { photosPerGuest: 5, maxImageDimension: 2560, retentionDays: 90 },
    premium: { photosPerGuest: 10, maxImageDimension: 4096, retentionDays: 365 },
  },
  scanme_venue: {
    basic: {
      allowedBlockKeys: VENUE_BASIC_BLOCK_KEYS as readonly string[],
      maxActiveEvents: 1,
      analytics: false,
    },
    premium: {
      allowedBlockKeys: VENUE_BLOCK_TYPES as readonly string[],
      maxActiveEvents: null,
      analytics: true,
    },
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
// in new tier constants. Venue (TASK-43): premium/enterprise resolve the
// premium tier — the mapping that makes the account-plan purchase actually
// mean something for Venue.
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
    premium: "premium",
    enterprise: "premium",
  },
};

// ---------------------------------------------------------------------------
// Venue limit readers (TASK-43). Every enforcement point funnels through these
// so "no entitlement", "unknown planKey", and "override without a value" all
// resolve to the FREE (basic) tier — the honest default: a venue that never
// bought anything gets the core, never everything.
// ---------------------------------------------------------------------------

export function venueAllowedBlockKeys(
  limits: Partial<VenueLimits> | null | undefined,
): readonly string[] {
  const list = limits?.allowedBlockKeys;
  if (!list || list.length === 0) {
    return PLAN_LIMITS.scanme_venue.basic.allowedBlockKeys;
  }
  return list;
}

export function venueMaxActiveEvents(
  limits: Partial<VenueLimits> | null | undefined,
): number | null {
  const value = limits?.maxActiveEvents;
  return value === undefined
    ? PLAN_LIMITS.scanme_venue.basic.maxActiveEvents
    : value;
}

export function venueAnalyticsEnabled(
  limits: Partial<VenueLimits> | null | undefined,
): boolean {
  return limits?.analytics === true;
}
