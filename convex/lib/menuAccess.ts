import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  BusinessAccessDeniedError,
  isAdminEmail,
  requireBusinessAccess,
} from "./access";
import { MENU_ERROR, type MenuErrorCode } from "../../lib/menu/errors/core";
import {
  permissionsOf,
  roleCan,
  type MenuActor,
  type MenuPermission,
  type MenuRole,
} from "../../lib/menu/permissions";
import { effectiveMenuRole, type DerivedMembership } from "../../lib/menu/roles";

// =============================================================================
// ScanMe Menu V1 — THE access helper (K01 §4.3). Every new Menu query and
// mutation for account users goes through requireMenuAccess / getMenuAccess;
// no Menu function checks a role inline. Identity always comes from ctx.auth,
// never from an argument. Staff (PIN) and guests get their own helpers in K22
// and K20/K21.
//
// Order of checks:
//   1. signed-in user                                → menu/unauthenticated
//   2. the Menu service (by id or by business slug)  → menu/not_found
//   3. ScanMe admin passes (support, migration)
//   4. archived service / inactive business          → menu/not_found
//   5. role = stronger of the role DERIVED from the account membership
//      (requireBusinessAccess, venue scope included) and an EXPLICIT active
//      menuMembers row (lib/menu/roles.ts)            → menu/forbidden
//   6. the scanme_menu service profile is active     → menu/service_inactive
//   7. menu.edit / menu.publish need client editing on (clientEditingEnabled
//      === true, the requireServiceEditorAccess semantics) → menu/editing_disabled
//   8. roleCan(role, permission)                     → menu/forbidden
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

export type MenuTarget =
  | { menuServiceId: Id<"menuServices"> }
  | { businessSlug: string };

export type MenuAccess = {
  user: Doc<"users">;
  actor: Exclude<MenuActor, "staff">;
  role: MenuRole | null;
  menuService: Doc<"menuServices">;
  business: Doc<"businesses">;
  /** False when ScanMe switched client editing off (admin still edits). */
  canEdit: boolean;
  permissions: MenuPermission[];
};

const EDIT_GATED: ReadonlySet<MenuPermission> = new Set<MenuPermission>([
  "menu.edit",
  "menu.publish",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The active Menu service of a business (V1: at most one). */
export async function activeMenuServiceForBusiness(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
): Promise<Doc<"menuServices"> | null> {
  const services = await ctx.db
    .query("menuServices")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .take(10);
  return services.find((service) => service.status === "active") ?? null;
}

async function loadTargetService(
  ctx: DatabaseCtx,
  target: MenuTarget,
): Promise<Doc<"menuServices"> | null> {
  if ("menuServiceId" in target) return await ctx.db.get(target.menuServiceId);
  const slug = target.businessSlug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return null;
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!business) return null;
  return await activeMenuServiceForBusiness(ctx, business._id);
}

/** The membership-derived input of lib/menu/roles.ts for one business. */
export async function derivedMembership(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
): Promise<DerivedMembership> {
  try {
    const access = await requireBusinessAccess(ctx, businessId);
    if (access.clientRole) return { kind: "account", role: access.clientRole };
    return { kind: "legacy" };
  } catch (error) {
    if (error instanceof BusinessAccessDeniedError) return { kind: "none" };
    throw error;
  }
}

async function explicitRole(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  userId: Id<"users">,
): Promise<MenuRole | null> {
  const rows = await ctx.db
    .query("menuMembers")
    .withIndex("by_menuServiceId_and_userId", (q) =>
      q.eq("menuServiceId", menuServiceId).eq("userId", userId),
    )
    .take(5);
  return rows.find((row) => row.status === "active")?.role ?? null;
}

/**
 * The access, or the MENU_ERROR code that refuses it (checks 1–6 above; the
 * permission is checked by the callers). Exported for a query that has to TELL
 * the refusals apart — the panel shell (convex/menuPanel.ts) shows a different
 * screen for "sign in", "no access" and "service switched off".
 */
export async function resolveMenuAccess(
  ctx: DatabaseCtx,
  target: MenuTarget,
): Promise<MenuAccess | MenuErrorCode> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return MENU_ERROR.unauthenticated;
  const user = await ctx.db.get(userId);
  if (!user) return MENU_ERROR.unauthenticated;

  const menuService = await loadTargetService(ctx, target);
  if (!menuService) return MENU_ERROR.notFound;
  const business = await ctx.db.get(menuService.businessId);
  if (!business) return MENU_ERROR.notFound;

  if (isAdminEmail(user.email)) {
    return {
      user,
      actor: "admin",
      role: null,
      menuService,
      business,
      canEdit: true,
      permissions: permissionsOf("admin"),
    };
  }

  if (
    menuService.status !== "active" ||
    business.status === "inactive" ||
    business.archivedAt !== undefined
  ) {
    return MENU_ERROR.notFound;
  }

  const role = effectiveMenuRole({
    membership: await derivedMembership(ctx, business._id),
    explicitRole: await explicitRole(ctx, menuService._id, user._id),
  });
  if (!role) return MENU_ERROR.forbidden;

  const profile = menuService.serviceProfileId
    ? await ctx.db.get(menuService.serviceProfileId)
    : null;
  if (!profile || profile.status !== "active" || profile.businessId !== business._id) {
    return MENU_ERROR.serviceInactive;
  }

  return {
    user,
    actor: role,
    role,
    menuService,
    business,
    canEdit: profile.clientEditingEnabled === true,
    permissions: permissionsOf(role),
  };
}

function checkPermission(
  access: MenuAccess,
  permission: MenuPermission,
): MenuErrorCode | null {
  if (access.actor !== "admin" && EDIT_GATED.has(permission) && !access.canEdit) {
    return MENU_ERROR.editingDisabled;
  }
  return roleCan(access.actor, permission) ? null : MENU_ERROR.forbidden;
}

/** Mutations: the access or a ConvexError carrying a MENU_ERROR code. */
export async function requireMenuAccess(
  ctx: DatabaseCtx,
  target: MenuTarget,
  permission: MenuPermission,
): Promise<MenuAccess> {
  const access = await resolveMenuAccess(ctx, target);
  if (typeof access === "string") throw new ConvexError(access);
  const denied = checkPermission(access, permission);
  if (denied) throw new ConvexError(denied);
  return access;
}

/**
 * Mutations addressed by a row id taken from an argument (the service comes
 * from the row). A caller with NO role in that row's service gets
 * `menu/not_found`, exactly as for a missing id — no existence oracle across
 * tenants. A member whose role lacks the permission still gets
 * `menu/forbidden`, and the other codes pass through unchanged.
 */
export async function requireMenuAccessToRow(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  permission: MenuPermission,
): Promise<MenuAccess> {
  const access = await resolveMenuAccess(ctx, { menuServiceId });
  if (typeof access === "string") {
    throw new ConvexError(access === MENU_ERROR.forbidden ? MENU_ERROR.notFound : access);
  }
  const denied = checkPermission(access, permission);
  if (denied) throw new ConvexError(denied);
  return access;
}

/** Queries: the access, or null for every refusal (no error toast on load). */
export async function getMenuAccess(
  ctx: DatabaseCtx,
  target: MenuTarget,
  permission: MenuPermission,
): Promise<MenuAccess | null> {
  const access = await resolveMenuAccess(ctx, target);
  if (typeof access === "string") return null;
  return checkPermission(access, permission) ? null : access;
}

// -----------------------------------------------------------------------------
// Tenant boundary for ids taken from arguments. A validator only proves the id
// belongs to the TABLE; these prove it belongs to THIS Menu service. A foreign
// id is reported as not found, never as forbidden (no existence oracle).
// -----------------------------------------------------------------------------

export type MenuOwnedTable =
  | "menuDraftState"
  | "menuPages"
  | "menuSections"
  | "menuArticles"
  | "menuPlacements"
  | "menuQrLinks"
  | "menuMembers"
  | "menuAuditLog"
  | "menuRoomService"
  | "menuRoomServiceCategories"
  | "menuRoomServiceItems"
  | "menuVariants"
  | "menuAddonGroups"
  | "menuAddonOptions"
  | "menuArticleAddonGroups"
  | "menuComboComponents"
  | "menuAvailability"
  | "menuVersions"
  | "menuVersionParts"
  | "menuPresentation"
  | "menuEditorPresence"
  // K20
  | "menuZones"
  | "menuPositions"
  | "menuGuestSessions"
  // K21
  | "menuRequests"
  | "menuRequestItems";

export async function loadOwned<T extends MenuOwnedTable>(
  ctx: DatabaseCtx,
  id: Id<T>,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<T>> {
  const doc = (await ctx.db.get(id)) as (Doc<T> & { menuServiceId: Id<"menuServices"> }) | null;
  if (!doc || doc.menuServiceId !== menuServiceId) {
    throw new ConvexError(MENU_ERROR.notFound);
  }
  return doc;
}

export async function loadManyOwned<T extends MenuOwnedTable>(
  ctx: DatabaseCtx,
  ids: readonly Id<T>[],
  menuServiceId: Id<"menuServices">,
): Promise<Doc<T>[]> {
  const docs: Doc<T>[] = [];
  for (const id of ids) docs.push(await loadOwned(ctx, id, menuServiceId));
  return docs;
}
