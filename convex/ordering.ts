import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireBusinessAccess } from "./lib/access";
import { generateCode, normalizeCode } from "./lib/codes";
import { getEntitlement } from "./lib/entitlements";
import { venueOrderingEnabled } from "./lib/plans";
import { shiftIsAvailable } from "./orderingShifts";
import { orderingAdminSr as dict } from "../lib/i18n/sr/ordering-admin";

// =============================================================================
// TASK-64 — Ordering configuration, items list & capability gate (RFC-004 §2.12, §2.13, §4).
//
// Ordering is a Venue capability (RFC-004 §2.12): it rides `scanme_venue`
// through getEntitlement and venueOrderingEnabled. Missing entitlement falls
// back to Basic tier (ordering: false).
//
// Two orthogonal gates (RFC-004 §2.12):
//   1. Capability gate: entitlement decides RIGHT to use (status: "available" vs "locked").
//   2. Per-venue toggles: orderingConfig.enabled and callWaiterEnabled decide USE by this venue.
//
// Ordering items list (orderingItems):
//   - Decoupled from Menu (MENU_EXISTS stays false, constraint 1).
//   - `available` is a LIVE reactive flag: setItemAvailable immediately notifies
//     all open clients via Convex subscriptions (the Living Menu pattern, TASK-54).
//   - Prices are informational only (RFC-004 §2.3) — never summed, no cart, no payment.
// =============================================================================

/**
 * Finds existing orderingConfig for a business or creates a new one with a unique Crockford code.
 */
export async function getOrCreateOrderingConfig(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
): Promise<Doc<"orderingConfig">> {
  const existing = await ctx.db
    .query("orderingConfig")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .unique();
  if (existing) return existing;

  // Generate unique Crockford 8-character short code (twin of memoriesSpaces.code).
  let code = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateCode();
    const collision = await ctx.db
      .query("orderingConfig")
      .withIndex("by_code", (q) => q.eq("code", candidate))
      .unique();
    if (!collision) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error("Failed to generate unique ordering code");

  const now = Date.now();
  const configId = await ctx.db.insert("orderingConfig", {
    businessId,
    code,
    enabled: false, // default off: venue explicitly enables use
    callWaiterEnabled: true, // call-waiter enabled by default when ordering is enabled
    overdueMinutes: 7, // default 7-min acceptance window (RFC-004 §2.8)
    reasons: ["Račun", "Voda", "Pomoć", "Ostalo"], // default call reason chips
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(configId);
  return created!;
}

// -----------------------------------------------------------------------------
// Public ordering state query (RFC-004 §2.12)
// -----------------------------------------------------------------------------

export type PublicOrderingStateResult =
  | { status: "absent" }
  | { status: "locked"; planKey: string }
  | {
      status: "available";
      planKey: string;
      businessName: string;
      // TASK-66 (RFC-004 §2.6) — THE single disabled state, as ONE boolean.
      // True iff this venue turned ordering on AND a fresh, non-stale shift is
      // open AND the waiter has not paused. The CAUSE is deliberately absent
      // from this payload: cause A (stale heartbeat) and cause B (no shift /
      // paused / venue switched ordering off) are indistinguishable to the
      // guest by design, because the remedy is the same — flag a waiter in
      // person. `stale` and `paused` never cross this boundary.
      acceptingRequests: boolean;
      config: {
        code: string;
        enabled: boolean;
        callWaiterEnabled: boolean;
        overdueMinutes: number;
        reasons: string[];
      };
      items: Array<{
        _id: Id<"orderingItems">;
        name: string;
        priceRsd?: number;
        available: boolean;
        order: number;
      }>;
    };

export const publicOrderingState = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args): Promise<PublicOrderingStateResult> => {
    const code = normalizeCode(args.code);
    if (!code) return { status: "absent" };

    const config = await ctx.db
      .query("orderingConfig")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!config) return { status: "absent" };

    const business = await ctx.db.get(config.businessId);
    if (!business || business.status === "inactive") {
      return { status: "absent" };
    }

    const entitlement = await getEntitlement(
      ctx,
      config.businessId,
      "scanme_venue",
    );
    if (!venueOrderingEnabled(entitlement?.limits)) {
      return {
        status: "locked",
        planKey: entitlement?.planKey ?? "basic",
      };
    }

    const items = await ctx.db
      .query("orderingItems")
      .withIndex("by_businessId_and_order", (q) =>
        q.eq("businessId", config.businessId),
      )
      .collect();

    // The venue's single open shift (the one-open-shift-per-venue invariant is
    // enforced in orderingShifts.openShift, so .first() is unambiguous).
    // shiftIsAvailable reads only materialized booleans — no wall clock in a
    // query, which is what makes this subscription flip live on the guest's
    // phone the moment the tablet dies or the waiter pauses.
    const shift = await ctx.db
      .query("orderingShifts")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", config.businessId).eq("status", "open"),
      )
      .first();

    return {
      status: "available",
      planKey: entitlement?.planKey ?? "basic",
      businessName: business.name,
      acceptingRequests:
        config.enabled && shift !== null && shiftIsAvailable(shift),
      config: {
        code: config.code,
        enabled: config.enabled,
        callWaiterEnabled: config.callWaiterEnabled,
        overdueMinutes: config.overdueMinutes,
        reasons: config.reasons,
      },
      items: items.map((item) => ({
        _id: item._id,
        name: item.name,
        priceRsd: item.priceRsd,
        available: item.available,
        order: item.order,
      })),
    };
  },
});

// -----------------------------------------------------------------------------
// Owner panel query (RFC-004 §2.12, §2.13)
// -----------------------------------------------------------------------------

export type OwnerOrderingConfigResult =
  | {
      status: "locked";
      planKey: string;
      orderingEnabled: false;
      config: null;
      items: [];
    }
  | {
      status: "available";
      planKey: string;
      orderingEnabled: true;
      config: {
        _id: Id<"orderingConfig">;
        code: string;
        enabled: boolean;
        callWaiterEnabled: boolean;
        overdueMinutes: number;
        reasons: string[];
      } | null;
      items: Array<{
        _id: Id<"orderingItems">;
        name: string;
        priceRsd?: number;
        available: boolean;
        order: number;
      }>;
    };

export const getOwnerOrderingConfig = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<OwnerOrderingConfigResult> => {
    await requireBusinessAccess(ctx, args.businessId);

    const entitlement = await getEntitlement(
      ctx,
      args.businessId,
      "scanme_venue",
    );
    const orderingEnabled = venueOrderingEnabled(entitlement?.limits);

    if (!orderingEnabled) {
      return {
        status: "locked",
        planKey: entitlement?.planKey ?? "basic",
        orderingEnabled: false,
        config: null,
        items: [],
      };
    }

    const config = await ctx.db
      .query("orderingConfig")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .unique();

    const items = await ctx.db
      .query("orderingItems")
      .withIndex("by_businessId_and_order", (q) =>
        q.eq("businessId", args.businessId),
      )
      .collect();

    return {
      status: "available",
      planKey: entitlement?.planKey ?? "basic",
      orderingEnabled: true,
      config: config
        ? {
            _id: config._id,
            code: config.code,
            enabled: config.enabled,
            callWaiterEnabled: config.callWaiterEnabled,
            overdueMinutes: config.overdueMinutes,
            reasons: config.reasons,
          }
        : null,
      items: items.map((item) => ({
        _id: item._id,
        name: item.name,
        priceRsd: item.priceRsd,
        available: item.available,
        order: item.order,
      })),
    };
  },
});

// -----------------------------------------------------------------------------
// Owner mutations (RFC-004 §2.12, §2.13)
// -----------------------------------------------------------------------------

export const updateOrderingConfig = mutation({
  args: {
    businessId: v.id("businesses"),
    enabled: v.optional(v.boolean()),
    callWaiterEnabled: v.optional(v.boolean()),
    overdueMinutes: v.optional(v.number()),
    reasons: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireBusinessAccess(ctx, args.businessId);

    const entitlement = await getEntitlement(
      ctx,
      args.businessId,
      "scanme_venue",
    );
    if (!venueOrderingEnabled(entitlement?.limits)) {
      throw new ConvexError(dict.errorNotEntitled);
    }

    const config = await getOrCreateOrderingConfig(ctx, args.businessId);
    const patch: Partial<Doc<"orderingConfig">> = { updatedAt: Date.now() };

    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.callWaiterEnabled !== undefined) {
      patch.callWaiterEnabled = args.callWaiterEnabled;
    }
    if (args.overdueMinutes !== undefined) {
      patch.overdueMinutes = Math.max(1, Math.min(60, args.overdueMinutes));
    }
    if (args.reasons !== undefined) {
      patch.reasons = args.reasons.map((r) => r.trim()).filter(Boolean);
    }

    await ctx.db.patch(config._id, patch);
    return { success: true };
  },
});

export const createOrderingItem = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    priceRsd: v.optional(v.number()),
    available: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireBusinessAccess(ctx, args.businessId);

    const entitlement = await getEntitlement(
      ctx,
      args.businessId,
      "scanme_venue",
    );
    if (!venueOrderingEnabled(entitlement?.limits)) {
      throw new ConvexError(dict.errorNotEntitled);
    }

    const name = args.name.trim();
    if (!name) throw new ConvexError(dict.itemNameRequired);

    await getOrCreateOrderingConfig(ctx, args.businessId);

    const existingItems = await ctx.db
      .query("orderingItems")
      .withIndex("by_businessId_and_order", (q) =>
        q.eq("businessId", args.businessId),
      )
      .collect();

    const nextOrder =
      existingItems.length > 0
        ? Math.max(...existingItems.map((i) => i.order)) + 1
        : 0;

    const now = Date.now();
    const itemId = await ctx.db.insert("orderingItems", {
      businessId: args.businessId,
      name,
      priceRsd:
        args.priceRsd !== undefined && args.priceRsd > 0
          ? Math.round(args.priceRsd)
          : undefined,
      available: args.available ?? true,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    });

    return { itemId };
  },
});

export const updateOrderingItem = mutation({
  args: {
    itemId: v.id("orderingItems"),
    name: v.optional(v.string()),
    priceRsd: v.optional(v.union(v.number(), v.null())),
    available: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError(dict.itemNotFound);
    await requireBusinessAccess(ctx, item.businessId);

    const patch: Partial<Doc<"orderingItems">> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new ConvexError(dict.itemNameRequired);
      patch.name = name;
    }

    if (args.priceRsd !== undefined) {
      patch.priceRsd =
        args.priceRsd === null || args.priceRsd <= 0
          ? undefined
          : Math.round(args.priceRsd);
    }

    if (args.available !== undefined) {
      patch.available = args.available;
    }

    await ctx.db.patch(item._id, patch);
    return { success: true };
  },
});

export const deleteOrderingItem = mutation({
  args: {
    itemId: v.id("orderingItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError(dict.itemNotFound);
    await requireBusinessAccess(ctx, item.businessId);

    await ctx.db.delete(item._id);
    return { success: true };
  },
});

/**
 * LIVE available toggle (RFC-004 §2.13, TASK-64).
 * Reactively flips availability on all subscribed guest phones with zero page reload.
 */
export const setItemAvailable = mutation({
  args: {
    itemId: v.id("orderingItems"),
    available: v.boolean(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError(dict.itemNotFound);
    await requireBusinessAccess(ctx, item.businessId);

    await ctx.db.patch(item._id, {
      available: args.available,
      updatedAt: Date.now(),
    });

    return { available: args.available };
  },
});

export const reorderOrderingItems = mutation({
  args: {
    businessId: v.id("businesses"),
    itemIds: v.array(v.id("orderingItems")),
  },
  handler: async (ctx, args) => {
    await requireBusinessAccess(ctx, args.businessId);

    const now = Date.now();
    for (let index = 0; index < args.itemIds.length; index++) {
      const id = args.itemIds[index];
      const item = await ctx.db.get(id);
      if (item && item.businessId === args.businessId) {
        await ctx.db.patch(id, { order: index, updatedAt: now });
      }
    }
    return { success: true };
  },
});
