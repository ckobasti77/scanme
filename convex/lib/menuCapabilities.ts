import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getEntitlement } from "./entitlements";
import {
  menuCapabilitiesFor,
  type MenuCapabilities,
  type MenuPremiumCapability,
} from "../../lib/menu/capabilities";
import { MENU_PLAN_ERROR } from "../../lib/menu/errors/plan";

// ScanMe Menu V1 — Standard/Premium for a Menu service (K03; master §2.2).
// Premium is an ACCOUNT fact: this helper only extends the existing entitlement
// chain (getEntitlement(..., "scanme_menu"): a subscriptions_v1 Premium
// account, then an active business grant, then the account plan with
// enterprise → premium) and maps its plan key through lib/menu/capabilities.ts.
// No Menu function decides Premium any other way.

type DatabaseCtx = QueryCtx | MutationCtx;

export async function getMenuCapabilities(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
): Promise<MenuCapabilities> {
  const entitlement = await getEntitlement(ctx, businessId, "scanme_menu");
  return menuCapabilitiesFor(entitlement?.status === "active" ? entitlement.planKey : null);
}

/** Mutations: the capabilities, or `plan/premium_required` when `capability` is off. */
export async function requireMenuCapability(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
  capability: MenuPremiumCapability,
): Promise<MenuCapabilities> {
  const capabilities = await getMenuCapabilities(ctx, businessId);
  if (!capabilities[capability]) throw new ConvexError(MENU_PLAN_ERROR.premiumRequired);
  return capabilities;
}
