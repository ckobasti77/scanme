import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getMenuAccess, type MenuAccess } from "./menuAccess";
import type { RequestActorDoc } from "./menuRequests";
import { MENU_MAX_STAFF_SESSIONS_ENDED } from "../../lib/menu/limits";
import { normalizePanelCode } from "../../lib/menu/panel-code";
import { isMenuToken, staffSessionTokenHash } from "../../lib/menu/tokens";
import { menuKonobarSr } from "../../lib/i18n/sr/menu-konobar";

// =============================================================================
// ScanMe Menu V1 (K22) — who works in the waiter panel (master §10.1, §10.6;
// K01 §4.3; plan docs/meni/planovi/K19.md K19-13, K19-15).
//
// The panel lives at /[slug]/konobar/[kod]. The code (menuSecrets, 10
// characters) is checked against the venue named by the slug: a wrong or old
// code is "no panel" (a 404 on the page). Inside it, two identities work:
//   - a STAFF member signed in with a PIN on this device: the 256-bit session
//     token rides the HttpOnly cookie smk_s and only its hash is stored; the
//     session has not ended (mutations also compare expiresAt with the clock;
//     queries see only the materialized end) and the member is active;
//   - the OWNER or a MANAGER with their own account (master §13.6: "za rad
//     menadžer ulazi u konobarski panel"), checked by the one account helper
//     (getMenuAccess, permission waiter.work). An Urednik has no waiter.work.
// A token that does not check out is "signed out", never a fallback to the
// account. Identity never comes from an argument: the token is a bearer
// secret, the account comes from ctx.auth.
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

const RECENTLY_EXPIRED_MS = 24 * 60 * 60 * 1000;

export type MenuStaffActor =
  | { kind: "staff"; staff: Doc<"menuStaff">; session: Doc<"menuStaffSessions"> }
  | { kind: "user"; access: MenuAccess };

export type MenuPanel = {
  menuService: Doc<"menuServices">;
  business: Doc<"businesses">;
  /** When the panel code was last changed: older sign-ins no longer count. */
  codeRotatedAt: number | null;
};

export type MenuWaiter = MenuPanel & { actor: MenuStaffActor };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The secret code row of a service's waiter panel, or null before it exists. */
export async function panelCodeRowOf(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<"menuSecrets"> | null> {
  return await ctx.db
    .query("menuSecrets")
    .withIndex("by_menuServiceId_and_kind", (q) => q.eq("menuServiceId", menuServiceId).eq("kind", "panel_code"))
    .unique();
}

/**
 * The venue and Menu service of a panel link, or null: unknown or changed
 * code, another venue's code, an archived service, an inactive venue, or a
 * switched-off ScanMe Menu profile. All of them look the same (no oracle).
 */
export async function panelOf(
  ctx: DatabaseCtx,
  args: { slug: string; panelCode: string },
): Promise<MenuPanel | null> {
  const code = normalizePanelCode(args.panelCode);
  if (!code) return null;
  const slug = args.slug.trim().toLowerCase();
  if (slug.length > 80 || !SLUG_PATTERN.test(slug)) return null;
  const secret = await ctx.db
    .query("menuSecrets")
    .withIndex("by_kind_and_value", (q) => q.eq("kind", "panel_code").eq("value", code))
    .unique();
  if (!secret) return null;
  const menuService = await ctx.db.get(secret.menuServiceId);
  if (!menuService || menuService.status !== "active") return null;
  const business = await ctx.db.get(menuService.businessId);
  if (!business || business.slug !== slug || business.status === "inactive" || business.archivedAt !== undefined) {
    return null;
  }
  const profile = menuService.serviceProfileId ? await ctx.db.get(menuService.serviceProfileId) : null;
  if (!profile || profile.status !== "active" || profile.businessId !== business._id) return null;
  return { menuService, business, codeRotatedAt: secret.rotatedAt ?? null };
}

/**
 * The live staff session behind a raw token, for this service, or null. A
 * session also has to be newer than the member's current PIN and than the
 * last change of the panel code, so a reset PIN or a new link revokes every
 * older sign-in at once, however many rows exist (the rows are also ended in
 * a batch, but access never depends on that batch).
 */
export async function liveStaffSession(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  sessionToken: string,
  now: number | null,
  codeRotatedAt: number | null = null,
): Promise<{ session: Doc<"menuStaffSessions">; staff: Doc<"menuStaff"> } | null> {
  if (!isMenuToken(sessionToken)) return null;
  const tokenHash = await staffSessionTokenHash(sessionToken);
  const session = await ctx.db
    .query("menuStaffSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session || session.menuServiceId !== menuServiceId || session.endedAt !== undefined) return null;
  if (now !== null && session.expiresAt <= now) return null;
  if (codeRotatedAt !== null && session.createdAt < codeRotatedAt) return null;
  const staff = await ctx.db.get(session.staffId);
  if (!staff || !staff.active || staff.menuServiceId !== menuServiceId) return null;
  if (staff.pinLookup === undefined) return null;
  if (staff.pinSetAt !== undefined && session.createdAt < staff.pinSetAt) return null;
  return { session, staff };
}

/**
 * Who works in this panel, or null. `now` is the clock of a mutation (an
 * expired but not yet materialized session is refused); queries pass null.
 * With a `sessionToken` only that PIN session counts; without one, the
 * signed-in Owner or Manager (or a ScanMe admin) of this venue.
 */
export async function loadMenuStaff(
  ctx: DatabaseCtx,
  args: { slug: string; panelCode: string; sessionToken?: string },
  now: number | null,
): Promise<MenuWaiter | null> {
  const panel = await panelOf(ctx, args);
  if (!panel) return null;
  if (args.sessionToken !== undefined) {
    const live = await liveStaffSession(ctx, panel.menuService._id, args.sessionToken, now, panel.codeRotatedAt);
    return live ? { ...panel, actor: { kind: "staff", ...live } } : null;
  }
  const access = await getMenuAccess(ctx, { menuServiceId: panel.menuService._id }, "waiter.work");
  return access ? { ...panel, actor: { kind: "user", access } } : null;
}

/** Stable identity of the actor across calls (`staff:<id>` / `user:<id>`). */
export function waiterActorRef(actor: MenuStaffActor): string {
  return actor.kind === "staff" ? `staff:${actor.staff._id}` : `user:${actor.access.user._id}`;
}

/** The actor in the shape of the one request writer (convex/lib/menuRequests.ts). */
export function waiterRequestActor(actor: MenuStaffActor): RequestActorDoc {
  return actor.kind === "staff"
    ? { kind: "staff", staffId: actor.staff._id }
    : { kind: "user", userId: actor.access.user._id };
}

/** How the panel names the signed-in account to ITSELF: the name, else the part of the e-mail before @. */
export function userDisplayName(user: Doc<"users">): string {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  return email ? email.split("@")[0] : "";
}

/** How the panel names an account to OTHER people (staff): the name, else a neutral label, never the e-mail. */
export function userNameForOthers(user: Doc<"users">): string {
  return user.name?.trim() || menuKonobarSr.zaglavlje.nalogBezImena;
}

export function waiterDisplayName(actor: MenuStaffActor): string {
  return actor.kind === "staff" ? actor.staff.displayName : userDisplayName(actor.access.user);
}

export type StaffSessionEndReason = NonNullable<Doc<"menuStaffSessions">["endReason"]>;

/** End every live session of one staff member (sign-out everywhere). Returns how many ended. */
export async function endSessionsOfStaff(
  ctx: MutationCtx,
  staffId: Id<"menuStaff">,
  reason: StaffSessionEndReason,
  now: number,
): Promise<number> {
  const sessions = await ctx.db
    .query("menuStaffSessions")
    .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
    .take(MENU_MAX_STAFF_SESSIONS_ENDED);
  let ended = 0;
  for (const session of sessions) {
    if (session.endedAt !== undefined) continue;
    await ctx.db.patch(session._id, { endedAt: now, endReason: reason });
    ended += 1;
  }
  return ended;
}

/**
 * End every live session of a Menu service (the panel code changed). Sessions
 * that expired a moment ago but whose scheduled end has not run yet are ended
 * too (the range starts a day back), so nothing outlives the change.
 */
export async function endSessionsOfService(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  reason: StaffSessionEndReason,
  now: number,
): Promise<number> {
  const sessions = await ctx.db
    .query("menuStaffSessions")
    .withIndex("by_menuServiceId_and_expiresAt", (q) =>
      q.eq("menuServiceId", menuServiceId).gt("expiresAt", now - RECENTLY_EXPIRED_MS),
    )
    .take(MENU_MAX_STAFF_SESSIONS_ENDED);
  let ended = 0;
  for (const session of sessions) {
    if (session.endedAt !== undefined) continue;
    await ctx.db.patch(session._id, { endedAt: now, endReason: reason });
    ended += 1;
  }
  return ended;
}
