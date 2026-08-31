import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  ACCOUNT_PLAN_TIER,
  PLAN_LIMITS,
  type LimitsFor,
  type PlanProduct,
} from "./plans";

type DatabaseCtx = QueryCtx | MutationCtx;

export interface ResolvedEntitlement<P extends PlanProduct> {
  planKey: string;
  limits: LimitsFor<P>;
  status: Doc<"entitlements">["status"];
}

// The single entitlement read path (RFC-001 §2.3, RFC-002 §2.2.3). No caller
// may read the `entitlements` table directly. Resolution order:
//   1. if spaceId is given, an ACTIVE space-scoped entitlement for that space wins;
//   2. otherwise the ACTIVE business-scoped entitlement (spaceId unset);
//   3. otherwise the account plan: business.accountId → ACTIVE account →
//      ACCOUNT_PLAN_TIER[product][account.plan], limits spread with
//      account.overrides;
//   4. otherwise null.
// Only status === "active" ever resolves.
//
// Generic over `product` so `limits` is that product's typed limit shape
// (MemoriesLimits for scanme_memories, VenueLimits for scanme_venue). A caller
// with a literal product reads e.g. `limits.photosPerGuest` as `number` with no
// cast.
export async function getEntitlement<P extends PlanProduct>(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
  product: P,
  spaceId?: Id<"memoriesSpaces">,
): Promise<ResolvedEntitlement<P> | null> {
  let row: Doc<"entitlements"> | null = null;

  if (spaceId) {
    // Step 1 — active space-scoped entitlement for this space.
    row = await ctx.db
      .query("entitlements")
      .withIndex("by_spaceId_and_status", (q) =>
        q.eq("spaceId", spaceId).eq("status", "active"),
      )
      .filter((q) => q.eq(q.field("product"), product))
      .first();
  }

  if (!row) {
    // Step 2 — active business-scoped entitlement (spaceId unset). Bounded: a
    // business holds few entitlements per product.
    const candidates = await ctx.db
      .query("entitlements")
      .withIndex("by_businessId_and_product", (q) =>
        q.eq("businessId", businessId).eq("product", product),
      )
      .take(50);
    const active = candidates.filter(
      (entitlement) =>
        entitlement.spaceId === undefined && entitlement.status === "active",
    );
    // Two active business-scoped rows for one (businessId, product) make the
    // resolved plan tier non-deterministic. upsertManualEntitlement prevents
    // this on the manual path, but the billing path (§2.3) will not. Fail loud
    // and name the rows rather than silently pick one — a wrong plan tier is a
    // quota bug.
    if (active.length > 1) {
      throw new ConvexError(
        `Multiple active business-scoped entitlements for business ${businessId} product ${product}: ${active
          .map((entitlement) => entitlement._id)
          .join(", ")}. Expected at most one.`,
      );
    }
    row = active[0] ?? null;
  }

  if (!row) {
    // Step 3 (RFC-002 §2.2.3) — the account-plan fallback. Fires only where
    // steps 1–2 resolved nothing, so every answer that existed before this
    // step is unchanged: a space- or business-scoped row still wins. The
    // account is the least-specific baseline — one plan resolving for every
    // location under it, and for every service the account later adds.
    const business = await ctx.db.get(businessId);
    if (!business?.accountId) return null;
    const account = await ctx.db.get(business.accountId);
    if (!account || account.status !== "active") return null;
    const tier = ACCOUNT_PLAN_TIER[product][account.plan];
    const tierLimits = (PLAN_LIMITS[product] as Record<string, object>)[tier];
    const limits = {
      ...tierLimits,
      ...(account.overrides ?? {}),
    } as LimitsFor<P>;
    return { planKey: tier, limits, status: "active" };
  }

  // `planKey` is a DB string, so neither the catalog lookup nor the overrides
  // merge can be statically proven to yield LimitsFor<P>. One assertion here —
  // internal to the read path, never at a call site — bridges the runtime lookup
  // to the typed return. Callers then read e.g. `limits.photosPerGuest` as
  // `number` with no cast of their own.
  const tierLimits = (PLAN_LIMITS[product] as Record<string, object>)[
    row.planKey
  ];
  const limits = {
    ...tierLimits,
    ...(row.overrides ?? {}),
  } as LimitsFor<P>;

  return {
    planKey: row.planKey,
    limits,
    status: row.status,
  };
}

// Manual (admin) entitlement upsert used by admin.approveActivation (§2.3). One
// active entitlement per (business, product, scope): patch it in place if it
// exists, otherwise insert. `source: "manual"`.
export async function upsertManualEntitlement(
  ctx: MutationCtx,
  params: {
    businessId: Id<"businesses">;
    product: Doc<"entitlements">["product"];
    planKey: string;
    spaceId?: Id<"memoriesSpaces">;
    now: number;
  },
): Promise<Id<"entitlements">> {
  const { businessId, product, planKey, spaceId, now } = params;

  const candidates = await ctx.db
    .query("entitlements")
    .withIndex("by_businessId_and_product", (q) =>
      q.eq("businessId", businessId).eq("product", product),
    )
    .take(50);
  const existing = candidates.find(
    (entitlement) => (entitlement.spaceId ?? undefined) === (spaceId ?? undefined),
  );

  if (existing) {
    await ctx.db.patch(existing._id, {
      planKey,
      status: "active",
      source: "manual",
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("entitlements", {
    businessId,
    product,
    planKey,
    ...(spaceId ? { spaceId } : {}),
    status: "active",
    source: "manual",
    createdAt: now,
    updatedAt: now,
  });
}
