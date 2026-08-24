import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { PLAN_LIMITS, type PlanProduct } from "./plans";

type DatabaseCtx = QueryCtx | MutationCtx;

export interface ResolvedEntitlement {
  planKey: string;
  limits: Record<string, unknown>;
  status: Doc<"entitlements">["status"];
}

// The single entitlement read path (RFC-001 §2.3). No caller may read the
// `entitlements` table directly. Resolution order:
//   1. if spaceId is given, an ACTIVE space-scoped entitlement for that space wins;
//   2. otherwise the ACTIVE business-scoped entitlement (spaceId unset);
//   3. otherwise null.
// Only status === "active" ever resolves.
export async function getEntitlement(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
  product: PlanProduct,
  spaceId?: Id<"memoriesSpaces">,
): Promise<ResolvedEntitlement | null> {
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
    row =
      candidates.find(
        (entitlement) =>
          entitlement.spaceId === undefined && entitlement.status === "active",
      ) ?? null;
  }

  if (!row) return null;

  const tierLimits =
    (PLAN_LIMITS[product] as Record<string, Record<string, unknown>>)[
      row.planKey
    ] ?? {};

  return {
    planKey: row.planKey,
    limits: { ...tierLimits, ...(row.overrides ?? {}) },
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
