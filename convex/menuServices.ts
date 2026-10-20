import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAdmin, requireAuthUser, isAdminEmail } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import {
  activeMenuServiceForBusiness,
  derivedMembership,
  getMenuAccess,
  requireMenuAccessToRow,
} from "./lib/menuAccess";
import { getMenuCapabilities, requireMenuCapability } from "./lib/menuCapabilities";
import { auditActorKind, writeMenuAudit } from "./lib/menuDraft";
import { menuBooleanFeatureValidator, menuModeValidator } from "./lib/menuDomainValidators";
import { ensureMenuProfile } from "./menuAdmin";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import {
  DEFAULT_MENU_MODE,
  featuresDroppedByModeChange,
  isModeAvailable,
  modeSupportsFeature,
  type MenuMode,
} from "../lib/menu/modes";
import { ORDER_STEP } from "../lib/menu/order";
import { roleFromMembership } from "../lib/menu/roles";
import { DEFAULT_PAGE_SLUG } from "../lib/menu/slugs";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";

// =============================================================================
// ScanMe Menu V1 — the Menu service (K02; master §3.1, §3.2, §4.1).
//
// A service is created in ONE place (provisionMenuService) with its locked
// mode, its draft bookkeeping and the automatic "Kompletan meni" page. The
// client only SEES the mode (context); only adminSetMode (requireAdmin)
// changes it, and a change never carries incompatible features blindly
// (lib/menu/modes.ts featuresDroppedByModeChange).
// =============================================================================

const DEFAULT_FEATURES: Doc<"menuServices">["features"] = {
  callWaiter: false,
  billRequest: false,
  ordering: false,
  roomService: false,
  occupancy: false,
  reservations: "off",
};

async function legacyMenuIdFor(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
): Promise<Id<"menus"> | undefined> {
  const legacy = await ctx.db
    .query("menus")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .first();
  return legacy?._id;
}

/**
 * Creates the Menu service row, its draft state and the default page
 * "Kompletan meni" (internal name; no public title — master §3.2). The caller
 * has already authorized and checked that no active service exists.
 */
export async function provisionMenuService(
  ctx: MutationCtx,
  input: {
    business: Doc<"businesses">;
    serviceProfileId: Id<"serviceProfiles">;
    mode: MenuMode;
    actor: { kind: "admin" | "user"; userId: Id<"users"> };
  },
): Promise<Id<"menuServices">> {
  const now = Date.now();
  const legacyMenuId = await legacyMenuIdFor(ctx, input.business._id);
  const menuServiceId = await ctx.db.insert("menuServices", {
    businessId: input.business._id,
    serviceProfileId: input.serviceProfileId,
    ...(legacyMenuId ? { legacyMenuId } : {}),
    mode: input.mode,
    modeSetAt: now,
    modeSetByUserId: input.actor.userId,
    status: "active",
    features: DEFAULT_FEATURES,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("menuDraftState", {
    menuServiceId,
    revision: 0,
    articleCount: 0,
    lastEditAt: now,
    lastEditByUserId: input.actor.userId,
  });
  const pageKey = newMenuKey("page");
  await ctx.db.insert("menuPages", {
    menuServiceId,
    key: pageKey,
    slug: DEFAULT_PAGE_SLUG,
    name: menuDomenSr.defaultPageName,
    isDefault: true,
    order: ORDER_STEP,
    visibility: "visible",
    navigation: "standalone",
    placementCount: 0,
    createdAt: now,
    updatedAt: now,
    updatedByUserId: input.actor.userId,
  });
  await writeMenuAudit(ctx, {
    menuServiceId,
    actorKind: input.actor.kind,
    actorUserId: input.actor.userId,
    action: "service.provisioned",
    entityType: "menuServices",
    details: { mode: input.mode, defaultPageKey: pageKey },
  });
  return menuServiceId;
}

async function activeMenuProfile(ctx: MutationCtx, businessId: Id<"businesses">) {
  const profile = await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", businessId).eq("type", "scanme_menu"),
    )
    .unique();
  return profile?.status === "active" ? profile : null;
}

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

/**
 * What the panel needs to know about the caller and the service: the locked
 * mode (shown, never editable), the caller's Menu role and permissions, the
 * live feature switches and the account's Standard/Premium capabilities (K03).
 * null for every refusal.
 */
export const context = query({
  args: { businessSlug: v.string() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { businessSlug: args.businessSlug }, "menu.read");
    if (!access) return null;
    const { menuService, business } = access;
    return {
      menuServiceId: menuService._id,
      business: { id: business._id, name: business.name, slug: business.slug },
      mode: menuService.mode,
      status: menuService.status,
      actor: access.actor,
      permissions: access.permissions,
      canEdit: access.canEdit,
      features: menuService.features,
      capabilities: await getMenuCapabilities(ctx, business._id),
    };
  },
});

/**
 * Turns one on/off switch of Funkcionalnosti on or off (master §13.7). Live at
 * once, outside the draft (K01 A10). Room service needs the Premium account to
 * be switched ON; switching any feature OFF never needs Premium. The three-state
 * reservations switch has its own writer (K25).
 */
export const setFeature = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    feature: menuBooleanFeatureValidator,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "features.edit");
    const { menuService } = access;
    if (menuService.features[args.feature] === args.enabled) return { ok: true as const };
    if (args.enabled) {
      if (!modeSupportsFeature(menuService.mode, args.feature)) {
        throw new ConvexError(MENU_ERROR.invalidInput);
      }
      if (args.feature === "roomService") {
        await requireMenuCapability(ctx, menuService.businessId, "roomService");
      }
    }
    await ctx.db.patch(menuService._id, {
      features: { ...menuService.features, [args.feature]: args.enabled },
      updatedAt: Date.now(),
    });
    await writeMenuAudit(ctx, {
      menuServiceId: menuService._id,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "feature.changed",
      entityType: "menuServices",
      details: { feature: args.feature, enabled: args.enabled },
    });
    return { ok: true as const };
  },
});

/**
 * Opens the Menu service of a business the first time its owner or manager
 * comes to it. Requires the ScanMe-granted, active `scanme_menu` profile; the
 * mode is the V1 default (hospitality) — the client never chooses or changes
 * it. Idempotent: an existing active service is returned as is.
 */
export const ensureForBusiness = mutation({
  args: { businessSlug: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx).catch(() => {
      throw new ConvexError(MENU_ERROR.unauthenticated);
    });
    const slug = args.businessSlug.trim().toLowerCase();
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!business || business.status === "inactive" || business.archivedAt !== undefined) {
      throw new ConvexError(MENU_ERROR.notFound);
    }
    const admin = isAdminEmail(user.email);
    if (!admin) {
      const role = roleFromMembership(await derivedMembership(ctx, business._id));
      if (role !== "owner" && role !== "manager") {
        throw new ConvexError(MENU_ERROR.forbidden);
      }
    }
    const existing = await activeMenuServiceForBusiness(ctx, business._id);
    if (existing) return { menuServiceId: existing._id, created: false as const };
    const profile = await activeMenuProfile(ctx, business._id);
    if (!profile) throw new ConvexError(MENU_ERROR.serviceInactive);
    const menuServiceId = await provisionMenuService(ctx, {
      business,
      serviceProfileId: profile._id,
      mode: DEFAULT_MENU_MODE,
      actor: { kind: admin ? "admin" : "user", userId: user._id },
    });
    return { menuServiceId, created: true as const };
  },
});

// -----------------------------------------------------------------------------
// ScanMe admin
// -----------------------------------------------------------------------------

/**
 * ScanMe admin creates the Menu service and picks its mode (master §4.1:
 * "Režim se bira pri kreiranju"). Provisions/reactivates the `scanme_menu`
 * profile like menuAdmin.grantMenu. V1 accepts hospitality only. An existing
 * active service is returned unchanged — its mode is changed only through
 * adminSetMode.
 */
export const adminProvision = mutation({
  args: { businessId: v.id("businesses"), mode: menuModeValidator },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!isModeAvailable(args.mode)) throw new ConvexError(MENU_ERROR.modeNotAvailable);
    const business = await ctx.db.get(args.businessId);
    if (!business || business.archivedAt !== undefined) {
      throw new ConvexError(MENU_ERROR.notFound);
    }
    const existing = await activeMenuServiceForBusiness(ctx, business._id);
    if (existing) {
      return { menuServiceId: existing._id, created: false as const, mode: existing.mode };
    }
    const now = Date.now();
    const serviceProfileId = await ensureMenuProfile(ctx, business, now);
    const menuServiceId = await provisionMenuService(ctx, {
      business,
      serviceProfileId,
      mode: args.mode,
      actor: { kind: "admin", userId: admin._id },
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "menu_provision",
      detail: { menuServiceId, mode: args.mode },
      now,
    });
    return { menuServiceId, created: true as const, mode: args.mode };
  },
});

/**
 * The ONLY mode writer. ScanMe admin only (master §4.1). Features the new mode
 * does not support are switched off — never carried over blindly — and listed
 * in the result and in both audit trails. Content is not deleted. In V1 only
 * hospitality is available, so any other target is refused.
 */
export const adminSetMode = mutation({
  args: { menuServiceId: v.id("menuServices"), mode: menuModeValidator },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const service = await ctx.db.get(args.menuServiceId);
    if (!service) throw new ConvexError(MENU_ERROR.notFound);
    if (!isModeAvailable(args.mode)) throw new ConvexError(MENU_ERROR.modeNotAvailable);
    if (service.mode === args.mode) {
      return { changed: false as const, droppedFeatures: [] as string[] };
    }
    const dropped = featuresDroppedByModeChange(service.mode, args.mode);
    const features = { ...service.features };
    for (const feature of dropped) {
      if (feature === "reservations") features.reservations = "off";
      else features[feature] = false;
    }
    const now = Date.now();
    await ctx.db.patch(service._id, {
      mode: args.mode,
      modeSetAt: now,
      modeSetByUserId: admin._id,
      features,
      updatedAt: now,
    });
    await writeMenuAudit(ctx, {
      menuServiceId: service._id,
      actorKind: auditActorKind("admin"),
      actorUserId: admin._id,
      action: "service.mode_changed",
      entityType: "menuServices",
      details: { from: service.mode, to: args.mode, droppedFeatures: dropped.join(",") },
    });
    const business = await ctx.db.get(service.businessId);
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business?.accountId ? { accountId: business.accountId } : {}),
      businessId: service.businessId,
      action: "menu_set_mode",
      detail: { menuServiceId: service._id, from: service.mode, to: args.mode, dropped },
      now,
    });
    return { changed: true as const, droppedFeatures: dropped as string[] };
  },
});
