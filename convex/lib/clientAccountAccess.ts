import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isAdminEmail, requireAuthUser, requireBusinessAccess } from "./access";

type DatabaseCtx = QueryCtx | MutationCtx;

export type ClientAccountCapability =
  | "manage_account"
  | "manage_venue"
  | "cancel_service"
  | "buy_services"
  | "buy_premium";

type AccountAccess = {
  account: Doc<"accounts">;
  user: Doc<"users">;
  membership: Doc<"accountMemberships"> | null;
  isAdmin: boolean;
};

function deny(): never {
  throw new ConvexError("Nemate pristup ovom klijentskom nalogu.");
}

export function clientAccountCapabilities(
  membership: Doc<"accountMemberships"> | null,
  isAdmin: boolean,
) {
  const fullAccess = isAdmin || membership?.role === "full_access";
  return {
    canManageAccount: fullAccess,
    canManageVenue:
      fullAccess || membership?.role === "venue_management",
    canCancelService: fullAccess,
    canBuyServices:
      fullAccess || membership?.canBuyServices === true,
    canBuyPremium:
      fullAccess || membership?.canBuyPremium === true,
  };
}

export async function requireClientAccountAccess(
  ctx: DatabaseCtx,
  accountId: Id<"accounts">,
): Promise<AccountAccess> {
  const user = await requireAuthUser(ctx);
  const account = await ctx.db.get(accountId);
  if (!account) deny();
  if (isAdminEmail(user.email)) {
    return { account, user, membership: null, isAdmin: true };
  }
  if (account.adminV1MigrationVersion !== 1) deny();
  const membership = await ctx.db
    .query("accountMemberships")
    .withIndex("by_accountId_and_userId", (q) =>
      q.eq("accountId", accountId).eq("userId", user._id),
    )
    .unique();
  if (!membership?.active) deny();
  return { account, user, membership, isAdmin: false };
}

export async function requireClientVenueAccess(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
) {
  const business = await ctx.db.get(businessId);
  if (!business || business.kind === "celebration" || !business.accountId) deny();
  const access = await requireClientAccountAccess(ctx, business.accountId);
  if (!access.isAdmin && access.membership?.venueAccess === "selected") {
    const scope = await ctx.db
      .query("accountMembershipVenueScopes")
      .withIndex("by_membershipId_and_businessId", (q) =>
        q.eq("membershipId", access.membership!._id).eq("businessId", businessId),
      )
      .unique();
    if (!scope || scope.accountId !== business.accountId) deny();
  }
  return { ...access, business };
}

function hasCapability(
  membership: Doc<"accountMemberships"> | null,
  isAdmin: boolean,
  capability: ClientAccountCapability,
) {
  const capabilities = clientAccountCapabilities(membership, isAdmin);
  switch (capability) {
    case "manage_account":
      return capabilities.canManageAccount;
    case "manage_venue":
      return capabilities.canManageVenue;
    case "cancel_service":
      return capabilities.canCancelService;
    case "buy_services":
      return capabilities.canBuyServices;
    case "buy_premium":
      return capabilities.canBuyPremium;
  }
}

export async function requireClientAccountCapability(
  ctx: DatabaseCtx,
  accountId: Id<"accounts">,
  capability: ClientAccountCapability,
) {
  const access = await requireClientAccountAccess(ctx, accountId);
  if (!hasCapability(access.membership, access.isAdmin, capability)) deny();
  return access;
}

export async function requireClientVenueCapability(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
  capability: ClientAccountCapability,
) {
  const access = await requireClientVenueAccess(ctx, businessId);
  if (!hasCapability(access.membership, access.isAdmin, capability)) deny();
  return access;
}

/**
 * Temporary checkout adapter for the widen phase. Migrated accounts enforce
 * the ADMIN-02 purchase/payment grant; legacy rows retain their existing access
 * rule only until their explicit per-client migration is applied.
 */
export async function requireBusinessPurchaseAccess(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
) {
  const business = await ctx.db.get(businessId);
  if (business?.accountId) {
    const account = await ctx.db.get(business.accountId);
    if (account?.adminV1MigrationVersion === 1) {
      return requireClientVenueCapability(ctx, businessId, "buy_services");
    }
  }
  return requireBusinessAccess(ctx, businessId);
}
