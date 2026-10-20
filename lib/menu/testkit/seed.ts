// ScanMe Menu V1 — shared convex-test seed (K02). Test-only: imported by
// convex/menu*.test.ts inside `t.run`. Fictional tenants only (the repo is
// public): "Kafana kod Mike" and "Demo restoran".
//
// The world:
//   account A (migrated, adminV1MigrationVersion 1) → business A + Menu service A
//     owner      accountMemberships full_access        → Menu "owner"
//     manager    accountMemberships venue_management   → Menu "manager"
//     finance    accountMemberships finance            → no Menu access
//     viewOnly   accountMemberships view_only          → no Menu access
//     editor     no account membership, menuMembers editor (explicit)
//   account B (migrated) → business B + Menu service B
//     otherOwner accountMemberships full_access on B only
//   admin      SCANME_ADMIN_EMAILS
//   outsider   no membership anywhere
//
// Both accounts start on the Basic plan (Menu Standard). K03 helpers:
// addVenueToAccount (a second venue under the same account) and
// grantAccountPremium (Premium on the ACCOUNT, by plan or by subscription).

import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../../../convex/_generated/dataModel";
import { provisionMenuService } from "../../../convex/menuServices";

type Ctx = GenericMutationCtx<DataModel>;

export const TEST_ISSUER = "https://test.local";
export const TEST_ADMIN_EMAIL = "admin@scanme.test";
export const SLUG_A = "kafana-kod-mike";
export const SLUG_B = "demo-restoran";

export type MenuTenantSeed = {
  accountId: Id<"accounts">;
  businessId: Id<"businesses">;
  serviceProfileId: Id<"serviceProfiles">;
  menuServiceId: Id<"menuServices">;
  defaultPageId: Id<"menuPages">;
};

export type MenuWorldSeed = {
  adminId: Id<"users">;
  ownerId: Id<"users">;
  managerId: Id<"users">;
  financeId: Id<"users">;
  viewOnlyId: Id<"users">;
  editorId: Id<"users">;
  otherOwnerId: Id<"users">;
  outsiderId: Id<"users">;
  a: MenuTenantSeed;
  b: MenuTenantSeed;
};

async function user(ctx: Ctx, email: string) {
  return await ctx.db.insert("users", { email, emailVerificationTime: Date.now() });
}

async function tenant(
  ctx: Ctx,
  input: { name: string; slug: string; actorUserId: Id<"users"> },
): Promise<MenuTenantSeed> {
  const now = Date.now();
  const accountId = await ctx.db.insert("accounts", {
    name: input.name,
    plan: "basic",
    status: "active",
    adminV1MigrationVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  return await venue(ctx, { ...input, accountId });
}

async function venue(
  ctx: Ctx,
  input: { name: string; slug: string; actorUserId: Id<"users">; accountId: Id<"accounts"> },
): Promise<MenuTenantSeed> {
  const now = Date.now();
  const accountId = input.accountId;
  const businessId = await ctx.db.insert("businesses", {
    name: input.name,
    slug: input.slug,
    status: "active",
    accountId,
    createdAt: now,
  });
  const serviceProfileId = await ctx.db.insert("serviceProfiles", {
    businessId,
    type: "scanme_menu",
    slug: `${input.slug}-meni`,
    status: "active",
    clientEditingEnabled: true,
    totalScans: 0,
    totalPageViews: 0,
    totalConvertedSessions: 0,
    createdAt: now,
    updatedAt: now,
  });
  const business = await ctx.db.get(businessId);
  if (!business) throw new Error("seed: business missing");
  const menuServiceId = await provisionMenuService(ctx, {
    business,
    serviceProfileId,
    mode: "hospitality",
    actor: { kind: "admin", userId: input.actorUserId },
  });
  const defaultPage = await ctx.db
    .query("menuPages")
    .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
    .first();
  if (!defaultPage) throw new Error("seed: default page missing");
  return { accountId, businessId, serviceProfileId, menuServiceId, defaultPageId: defaultPage._id };
}

/** One more venue (business + active Menu profile + Menu service) under an existing account. */
export async function addVenueToAccount(
  ctx: Ctx,
  input: { accountId: Id<"accounts">; name: string; slug: string; actorUserId: Id<"users"> },
): Promise<MenuTenantSeed> {
  return await venue(ctx, input);
}

/**
 * Premium on the ACCOUNT (master §2.2), through either existing path of
 * getEntitlement: `plan` sets accounts.plan; `subscription` makes the account
 * subscriptions_v1 with an account_premium subscription in `status`.
 */
export async function grantAccountPremium(
  ctx: Ctx,
  input: {
    accountId: Id<"accounts">;
    via: "plan" | "subscription";
    plan?: "premium" | "enterprise";
    status?: "inactive" | "active" | "grace" | "suspended";
  },
) {
  const now = Date.now();
  if (input.via === "plan") {
    await ctx.db.patch(input.accountId, { plan: input.plan ?? "premium", updatedAt: now });
    return;
  }
  await ctx.db.patch(input.accountId, { billingModel: "subscriptions_v1", updatedAt: now });
  await ctx.db.insert("subscriptions", {
    accountId: input.accountId,
    target: { kind: "account_premium" },
    targetKey: "premium",
    period: "monthly",
    startsAt: now,
    anchorAt: now,
    renewal: { kind: "manual" },
    cancelAtPeriodEnd: false,
    facts: {
      status: input.status ?? "active",
      warning: false,
      currentPeriodStart: now,
      paidThrough: now + 30 * 86_400_000,
      graceEndsAt: null,
      nextTransitionAt: null,
    },
    key: `menu-test-premium-${input.accountId}`,
    fingerprint: `menu-test-premium-${input.accountId}`,
    createdAt: now,
    updatedAt: now,
  });
}

export async function addAccountMember(
  ctx: Ctx,
  input: {
    accountId: Id<"accounts">;
    userId: Id<"users">;
    role: "full_access" | "venue_management" | "finance" | "view_only";
    venueAccess?: "all" | "selected";
  },
) {
  const now = Date.now();
  return await ctx.db.insert("accountMemberships", {
    accountId: input.accountId,
    userId: input.userId,
    role: input.role,
    active: true,
    venueAccess: input.venueAccess ?? "all",
    canBuyServices: false,
    canBuyPremium: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function addMenuMember(
  ctx: Ctx,
  input: {
    menuServiceId: Id<"menuServices">;
    businessId: Id<"businesses">;
    userId: Id<"users">;
    email: string;
    role: "owner" | "manager" | "editor";
    invitedByUserId: Id<"users">;
    status?: "invited" | "active" | "removed";
  },
) {
  const now = Date.now();
  return await ctx.db.insert("menuMembers", {
    menuServiceId: input.menuServiceId,
    businessId: input.businessId,
    email: input.email,
    userId: input.userId,
    role: input.role,
    status: input.status ?? "active",
    invitedByUserId: input.invitedByUserId,
    createdAt: now,
    updatedAt: now,
  });
}

export async function seedMenuWorld(ctx: Ctx): Promise<MenuWorldSeed> {
  const adminId = await user(ctx, TEST_ADMIN_EMAIL);
  const ownerId = await user(ctx, "vlasnik@example.com");
  const managerId = await user(ctx, "menadzer@example.com");
  const financeId = await user(ctx, "finansije@example.com");
  const viewOnlyId = await user(ctx, "pregled@example.com");
  const editorId = await user(ctx, "urednik@example.com");
  const otherOwnerId = await user(ctx, "drugi-vlasnik@example.com");
  const outsiderId = await user(ctx, "gost@example.com");

  const a = await tenant(ctx, { name: "Kafana kod Mike", slug: SLUG_A, actorUserId: adminId });
  const b = await tenant(ctx, { name: "Demo restoran", slug: SLUG_B, actorUserId: adminId });

  await addAccountMember(ctx, { accountId: a.accountId, userId: ownerId, role: "full_access" });
  await addAccountMember(ctx, { accountId: a.accountId, userId: managerId, role: "venue_management" });
  await addAccountMember(ctx, { accountId: a.accountId, userId: financeId, role: "finance" });
  await addAccountMember(ctx, { accountId: a.accountId, userId: viewOnlyId, role: "view_only" });
  await addAccountMember(ctx, { accountId: b.accountId, userId: otherOwnerId, role: "full_access" });
  await addMenuMember(ctx, {
    menuServiceId: a.menuServiceId,
    businessId: a.businessId,
    userId: editorId,
    email: "urednik@example.com",
    role: "editor",
    invitedByUserId: ownerId,
  });

  return { adminId, ownerId, managerId, financeId, viewOnlyId, editorId, otherOwnerId, outsiderId, a, b };
}

/**
 * A QR card whose menuQrLinks row points at `pageKey`. Defaults describe a
 * link that BLOCKS deleting/archiving the page: link active, card active,
 * card's current target kind `menu`.
 */
export async function seedQrLink(
  ctx: Ctx,
  input: {
    menuServiceId: Id<"menuServices">;
    businessId: Id<"businesses">;
    pageKey: string;
    createdByUserId: Id<"users">;
    cardCode?: string;
    linkActive?: boolean;
    cardStatus?: "active" | "disabled";
    targetKind?: "menu" | "url";
  },
) {
  const now = Date.now();
  const cardId = await ctx.db.insert("cards", {
    businessId: input.businessId,
    cardCode: input.cardCode ?? "MENUQR01",
    label: "Sto 1",
    status: input.cardStatus ?? "active",
    totalScans: 0,
    createdAt: now,
    updatedAt: now,
  });
  const kind = input.targetKind ?? "menu";
  const targetId = await ctx.db.insert("cardTargets", {
    cardId,
    kind,
    ...(kind === "url" ? { url: "https://example.com" } : {}),
    createdByUserId: input.createdByUserId,
    createdAt: now,
  });
  await ctx.db.patch(cardId, { currentTargetId: targetId });
  const linkId = await ctx.db.insert("menuQrLinks", {
    menuServiceId: input.menuServiceId,
    cardId,
    pageKey: input.pageKey,
    active: input.linkActive ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return { cardId, targetId, linkId };
}
