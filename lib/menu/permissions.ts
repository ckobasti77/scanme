// ScanMe Menu V1 — the role × permission matrix (master §10.6, K01 §4.1).
// Pure and dependency-free: Convex (convex/lib/menuAccess.ts) enforces it and
// the panel (K08) uses the same function to decide what to show. One table,
// one function — no permission check is written inline anywhere else.

/** Account-user roles inside one Menu service. */
export const MENU_ROLES = ["owner", "manager", "editor"] as const;
export type MenuRole = (typeof MENU_ROLES)[number];

/**
 * Who acts. `staff` is a PIN identity of the waiter panel (K22), never an
 * account user; `admin` is the ScanMe operator (SCANME_ADMIN_EMAILS).
 */
export type MenuActor = MenuRole | "staff" | "admin";

export const MENU_PERMISSIONS = [
  /** Read the editor, the draft and the preview. */
  "menu.read",
  /** Change offer, appearance, translations and Room service content. */
  "menu.edit",
  /** Publish the draft and restore a version. */
  "menu.publish",
  /** Toggle "Privremeno nedostupno" (live). */
  "menu.availability",
  /** Funkcionalnosti (guest actions, modules). */
  "features.edit",
  /** Positions, zones, floor layout and QR links. */
  "venue.edit",
  /** Team: invite, change role, remove. */
  "team.manage",
  /** Staff members and their PINs, the waiter-panel code. */
  "staff.pin",
  /** Working hours, languages, e-mail, templates, thresholds, brand. */
  "settings.edit",
  /** Operativa (live overview) and pinging staff. */
  "operations.read",
  /** Analytics (Premium parts additionally need the plan). */
  "analytics.read",
  /** Waiter-panel work: requests, reservations, occupancy, own zone. */
  "waiter.work",
  /** Re-assign zones of every waiter. */
  "waiter.assignZones",
  /** ScanMe-only: change the service mode. */
  "admin.mode",
  /** ScanMe-only: internal import / migration into the draft. */
  "admin.import",
] as const;
export type MenuPermission = (typeof MENU_PERMISSIONS)[number];

const OFFER: readonly MenuPermission[] = [
  "menu.read",
  "menu.edit",
  "menu.publish",
  "menu.availability",
];

const MANAGEMENT: readonly MenuPermission[] = [
  ...OFFER,
  "features.edit",
  "venue.edit",
  "team.manage",
  "staff.pin",
  "settings.edit",
  "operations.read",
  "analytics.read",
  "waiter.work",
  "waiter.assignZones",
];

const MATRIX: Record<MenuActor, ReadonlySet<MenuPermission>> = {
  // Billing and account ownership live on the account, outside the Menu UI;
  // inside one Menu service the owner and the manager hold the same rights,
  // except that only an owner may grant the owner role (canAssignRole).
  owner: new Set(MANAGEMENT),
  manager: new Set(MANAGEMENT),
  // Master §10.6: "ponuda, dizajn, preview i objavljivanje".
  editor: new Set(OFFER),
  // K01 OTV 4: staff does not toggle availability in V1. Zone re-assignment
  // for a staff member with panelRole "manager" is decided in K22/K23 on the
  // staff record, not by this account-role table.
  staff: new Set<MenuPermission>(["waiter.work"]),
  admin: new Set<MenuPermission>(MENU_PERMISSIONS),
};

export function roleCan(actor: MenuActor, permission: MenuPermission): boolean {
  return MATRIX[actor].has(permission);
}

export function permissionsOf(actor: MenuActor): MenuPermission[] {
  return MENU_PERMISSIONS.filter((permission) => MATRIX[actor].has(permission));
}

const RANK: Record<MenuRole, number> = { editor: 1, manager: 2, owner: 3 };

/** The stronger of two roles; null means "no role". */
export function strongerRole(
  a: MenuRole | null,
  b: MenuRole | null,
): MenuRole | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Team management (K28): an owner may assign any role; a manager may assign
 * manager or editor but never owner (master §10.6: "bez vlasništva"); admin
 * may assign anything.
 */
export function canAssignRole(actor: MenuActor, target: MenuRole): boolean {
  if (actor === "admin" || actor === "owner") return true;
  if (actor === "manager") return target !== "owner";
  return false;
}
