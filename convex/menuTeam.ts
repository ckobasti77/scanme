import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getMenuAccess, loadOwned, requireMenuAccess, requireMenuAccessToRow, type MenuAccess } from "./lib/menuAccess";
import { auditActorKind, writeMenuAudit } from "./lib/menuDraft";
import { menuMemberRoleValidator } from "./lib/menuDomainValidators";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { TEAM_ERROR } from "../lib/menu/errors/team";
import {
  MENU_INVITE_TTL_MS,
  inviteState,
  inviteTokenHash,
  invitePath,
  normalizeInviteEmail,
} from "../lib/menu/invite";
import { MENU_MAX_ACCOUNT_MEMBERS, MENU_MAX_ACTIVITY, MENU_MAX_MEMBERS } from "../lib/menu/limits";
import { canAssignRole, type MenuRole } from "../lib/menu/permissions";
import { roleFromMembership } from "../lib/menu/roles";
import { smeUpravljati } from "../lib/menu/team-view";
import { isMenuToken, newMenuToken } from "../lib/menu/tokens";

// =============================================================================
// ScanMe Menu V1 (K28) — Tim i pristupi (master §10.6; plan
// docs/meni/planovi/K24.md §4.6, K24-21).
//
// Two sources of a Menu role, shown side by side:
//   - the ACCOUNT: an Owner or a Manager derived from the account membership
//     (lib/menu/roles.ts) — shown "iz naloga", never changed here;
//   - `menuMembers`: people invited into THIS Menu service with an explicit
//     role (Vlasnik, Menadžer, Urednik). Their own invitation flow: a 256-bit
//     token, only its hash stored, a 7-day term, the same e-mail on
//     acceptance. It never touches businessInvitations or businessMemberships
//     (an accepted invitation is NOT legacy access to the account).
// Staff with a PIN (Osoblje) live in convex/menuStaff.ts.
//
// Everything is `team.manage` (Owner, Manager, ScanMe admin). A Manager never
// gives or takes away the Owner role (canAssignRole); nobody changes their own
// row. The invitation link is returned ONCE, in the answer of `invite`.
// =============================================================================

const PERMISSION = "team.manage" as const;
/** Rows of one service read when counting the team or finding an address (removed rows are reused). */
const MEMBER_SCAN = MENU_MAX_MEMBERS * 4;

export type TeamAccountRow = {
  key: string;
  name: string | null;
  email: string | null;
  role: "owner" | "manager";
  isSelf: boolean;
};

export type TeamMemberRow = {
  id: Id<"menuMembers">;
  email: string;
  name: string | null;
  role: MenuRole;
  status: "invited" | "active";
  inviteExpiresAt: number | null;
  createdAt: number;
  isSelf: boolean;
};

export type TeamActivityRow = {
  id: Id<"menuAuditLog">;
  action: string;
  createdAt: number;
  actor: { kind: "user"; name: string | null } | { kind: "staff"; name: string | null } | { kind: "scanme" } | { kind: "guest" } | { kind: "system" };
  /** The staff member the action was about (staff.* actions), by name only. */
  subject: string | null;
};

async function accountMembersOf(ctx: QueryCtx, access: MenuAccess): Promise<TeamAccountRow[]> {
  const business = access.business;
  const rows: { userId: Id<"users">; role: "owner" | "manager" }[] = [];
  const account = business.accountId ? await ctx.db.get(business.accountId) : null;
  if (account?.adminV1MigrationVersion === 1) {
    const memberships = await ctx.db
      .query("accountMemberships")
      .withIndex("by_accountId_and_active", (q) => q.eq("accountId", account._id).eq("active", true))
      .take(MENU_MAX_ACCOUNT_MEMBERS);
    for (const membership of memberships) {
      const role = roleFromMembership({ kind: "account", role: membership.role });
      if (role !== "owner" && role !== "manager") continue;
      if (membership.venueAccess === "selected") {
        const scope = await ctx.db
          .query("accountMembershipVenueScopes")
          .withIndex("by_membershipId_and_businessId", (q) =>
            q.eq("membershipId", membership._id).eq("businessId", business._id),
          )
          .unique();
        if (!scope || scope.accountId !== account._id) continue;
      }
      rows.push({ userId: membership.userId, role });
    }
  } else {
    const memberships = await ctx.db
      .query("businessMemberships")
      .withIndex("by_businessId_and_active", (q) => q.eq("businessId", business._id).eq("active", true))
      .take(MENU_MAX_ACCOUNT_MEMBERS);
    for (const membership of memberships) rows.push({ userId: membership.userId, role: "manager" });
  }
  const result: TeamAccountRow[] = [];
  for (const row of rows) {
    const user = await ctx.db.get(row.userId);
    result.push({
      key: row.userId,
      name: user?.name ?? null,
      email: user?.email ?? null,
      role: row.role,
      isSelf: row.userId === access.user._id,
    });
  }
  // Owners first, then by name or address.
  return result.sort(
    (a, b) =>
      (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1) ||
      (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "sr"),
  );
}

async function memberRowsOf(ctx: QueryCtx | MutationCtx, menuServiceId: Id<"menuServices">) {
  return await ctx.db
    .query("menuMembers")
    .withIndex("by_menuServiceId_and_email", (q) => q.eq("menuServiceId", menuServiceId))
    .take(MEMBER_SCAN);
}

/** A member row of this service for a team manager (anyone else: menu/not_found). */
async function ownedMember(
  ctx: MutationCtx,
  memberId: Id<"menuMembers">,
): Promise<{ access: MenuAccess; member: Doc<"menuMembers"> }> {
  const row = await ctx.db.get(memberId);
  if (!row) throw new ConvexError(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, row.menuServiceId, PERMISSION);
  const member = await loadOwned(ctx, memberId, access.menuService._id);
  if (member.status === "removed") throw new ConvexError(MENU_ERROR.notFound);
  return { access, member };
}

function audit(
  ctx: MutationCtx,
  access: MenuAccess,
  action: "team.invited" | "team.invite_revoked" | "team.role_changed" | "team.removed",
  member: Id<"menuMembers">,
  details: Record<string, string | number | boolean | null>,
) {
  return writeMenuAudit(ctx, {
    menuServiceId: access.menuService._id,
    actorKind: auditActorKind(access.actor),
    actorUserId: access.user._id,
    action,
    entityType: "member",
    entityKey: member,
    details,
  });
}

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

/** The team: account Owners/Managers (read-only) and the invited/active members. null for every refusal. */
export const list = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<{ account: TeamAccountRow[]; members: TeamMemberRow[] } | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    if (!access) return null;
    const members: TeamMemberRow[] = [];
    for (const row of await memberRowsOf(ctx, args.menuServiceId)) {
      if (row.status === "removed") continue;
      const user = row.userId ? await ctx.db.get(row.userId) : null;
      members.push({
        id: row._id,
        email: row.email,
        name: user?.name ?? null,
        role: row.role,
        status: row.status,
        inviteExpiresAt: row.status === "invited" ? (row.inviteExpiresAt ?? null) : null,
        createdAt: row.createdAt,
        isSelf: row.userId !== undefined && row.userId === access.user._id,
      });
    }
    members.sort((a, b) => (a.status === b.status ? a.createdAt - b.createdAt : a.status === "active" ? -1 : 1));
    return { account: await accountMembersOf(ctx, access), members };
  },
});

/**
 * The last sensitive actions of the service (menuAuditLog), readable: who
 * (a name, never an e-mail), what and when. Never a PIN, a hash or a token —
 * the audit trail never holds them.
 */
export const activity = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<TeamActivityRow[] | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    if (!access) return null;
    const rows = await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", args.menuServiceId))
      .order("desc")
      .take(MENU_MAX_ACTIVITY);
    const result: TeamActivityRow[] = [];
    for (const row of rows) {
      let actor: TeamActivityRow["actor"];
      if (row.actorKind === "admin") actor = { kind: "scanme" };
      else if (row.actorKind === "guest") actor = { kind: "guest" };
      else if (row.actorKind === "system") actor = { kind: "system" };
      else if (row.actorKind === "staff") {
        const id = row.actorRef ? ctx.db.normalizeId("menuStaff", row.actorRef) : null;
        const staff = id ? await ctx.db.get(id) : null;
        actor = { kind: "staff", name: staff && staff.menuServiceId === args.menuServiceId ? staff.displayName : null };
      } else {
        const user = row.actorUserId ? await ctx.db.get(row.actorUserId) : null;
        actor = { kind: "user", name: user?.name ?? null };
      }
      let subject: string | null = null;
      if (row.entityType === "staff" && row.entityKey) {
        const id = ctx.db.normalizeId("menuStaff", row.entityKey);
        const staff = id ? await ctx.db.get(id) : null;
        subject = staff && staff.menuServiceId === args.menuServiceId ? staff.displayName : null;
      }
      result.push({ id: row._id, action: row.action, createdAt: row.createdAt, actor, subject });
    }
    return result;
  },
});

/**
 * The public face of an invitation link: the venue's name, the role and the
 * term — nothing else. Unknown, revoked and used links all answer
 * `{status:"invalid"}`. `viewer` tells the signed-in visitor whether the
 * invitation is for their address (never which address it is for).
 */
export const inviteStatus = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invalid = { status: "invalid" as const };
    const found = await pendingInvite(ctx, args.token);
    if (!found) return invalid;
    const { row, business } = found;
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    const viewer: "anonymous" | "match" | "mismatch" = !user
      ? "anonymous"
      : normalizeInviteEmail(user.email) === row.email
        ? "match"
        : "mismatch";
    return {
      status: "pending" as const,
      venue: business.name,
      slug: business.slug,
      role: row.role,
      expiresAt: row.inviteExpiresAt ?? 0,
      viewer,
    };
  },
});

/** A pending invitation row by its raw token, with its live service and business (null otherwise). */
async function pendingInvite(ctx: QueryCtx | MutationCtx, token: string) {
  if (!isMenuToken(token)) return null;
  const hash = await inviteTokenHash(token);
  const row = await ctx.db
    .query("menuMembers")
    .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", hash))
    .first();
  if (!row || row.status !== "invited" || row.inviteExpiresAt === undefined) return null;
  const service = await ctx.db.get(row.menuServiceId);
  if (!service || service.status !== "active") return null;
  const business = await ctx.db.get(service.businessId);
  if (!business || business.status === "inactive" || business.archivedAt !== undefined) return null;
  return { row, service, business };
}

// -----------------------------------------------------------------------------
// Invitations
// -----------------------------------------------------------------------------

/**
 * Invite someone into the Menu team by e-mail. The link is in the answer
 * ONCE; only its hash is stored. A Manager cannot offer the Owner role. An
 * expired or removed row of the same address is reused (one row per address).
 */
export const invite = mutation({
  args: { menuServiceId: v.id("menuServices"), email: v.string(), role: menuMemberRoleValidator },
  handler: async (ctx, args): Promise<{ memberId: Id<"menuMembers">; token: string; path: string; expiresAt: number }> => {
    const access = await requireMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    if (!canAssignRole(access.actor, args.role)) throw new ConvexError(TEAM_ERROR.roleForbidden);
    const email = normalizeInviteEmail(args.email);
    if (!email) throw new ConvexError(TEAM_ERROR.emailInvalid);

    const now = Date.now();
    const rows = await memberRowsOf(ctx, args.menuServiceId);
    const same = rows.filter((row) => row.email === email);
    if (same.some((row) => row.status === "active" || inviteState(row, now) === "valid")) {
      throw new ConvexError(TEAM_ERROR.inviteExists);
    }
    const reuse = same[0] ?? null;
    if (!reuse && rows.filter((row) => row.status !== "removed").length >= MENU_MAX_MEMBERS) {
      throw new ConvexError(TEAM_ERROR.teamFull);
    }

    const token = newMenuToken();
    const fields = {
      role: args.role,
      status: "invited" as const,
      userId: undefined,
      inviteTokenHash: await inviteTokenHash(token),
      inviteExpiresAt: now + MENU_INVITE_TTL_MS,
      invitedByUserId: access.user._id,
      acceptedAt: undefined,
      updatedAt: now,
    };
    let memberId: Id<"menuMembers">;
    if (reuse) {
      await ctx.db.patch(reuse._id, fields);
      memberId = reuse._id;
    } else {
      memberId = await ctx.db.insert("menuMembers", {
        menuServiceId: args.menuServiceId,
        businessId: access.menuService.businessId,
        email,
        role: args.role,
        status: "invited",
        inviteTokenHash: fields.inviteTokenHash,
        inviteExpiresAt: fields.inviteExpiresAt,
        invitedByUserId: access.user._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await audit(ctx, access, "team.invited", memberId, { role: args.role });
    return { memberId, token, path: invitePath(access.business.slug, token), expiresAt: fields.inviteExpiresAt };
  },
});

/** Revoke a pending invitation: its link stops working at once. */
export const revokeInvite = mutation({
  args: { memberId: v.id("menuMembers") },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { access, member } = await ownedMember(ctx, args.memberId);
    if (member.status !== "invited") throw new ConvexError(TEAM_ERROR.inviteInvalid);
    if (!canAssignRole(access.actor, member.role)) throw new ConvexError(TEAM_ERROR.roleForbidden);
    await ctx.db.patch(member._id, {
      status: "removed",
      inviteTokenHash: undefined,
      inviteExpiresAt: undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, access, "team.invite_revoked", member._id, { role: member.role });
    return { ok: true };
  },
});

/**
 * Accept an invitation: the signed-in account must have the invitation's
 * e-mail. The row becomes an active member of THIS Menu service only (never a
 * businessMemberships row); the link cannot be used again.
 */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<{ slug: string }> => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    if (!user) throw new ConvexError(MENU_ERROR.unauthenticated);
    const found = await pendingInvite(ctx, args.token);
    const now = Date.now();
    if (!found || inviteState(found.row, now) !== "valid") throw new ConvexError(TEAM_ERROR.inviteInvalid);
    const { row, business } = found;
    if (normalizeInviteEmail(user.email) !== row.email) throw new ConvexError(TEAM_ERROR.emailMismatch);

    // One active row per person and service: an older grant of the same user gives way to this one.
    const older = await ctx.db
      .query("menuMembers")
      .withIndex("by_menuServiceId_and_userId", (q) => q.eq("menuServiceId", row.menuServiceId).eq("userId", user._id))
      .take(5);
    for (const other of older) {
      if (other._id !== row._id && other.status === "active") {
        await ctx.db.patch(other._id, { status: "removed", updatedAt: now });
      }
    }
    await ctx.db.patch(row._id, {
      status: "active",
      userId: user._id,
      acceptedAt: now,
      inviteTokenHash: undefined,
      inviteExpiresAt: undefined,
      updatedAt: now,
    });
    await writeMenuAudit(ctx, {
      menuServiceId: row.menuServiceId,
      actorKind: "user",
      actorUserId: user._id,
      action: "team.joined",
      entityType: "member",
      entityKey: row._id,
      details: { role: row.role },
    });
    return { slug: business.slug };
  },
});

// -----------------------------------------------------------------------------
// Members
// -----------------------------------------------------------------------------

/** Change a member's role (or the role of a pending invitation). */
export const changeRole = mutation({
  args: { memberId: v.id("menuMembers"), role: menuMemberRoleValidator },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { access, member } = await ownedMember(ctx, args.memberId);
    const svoj = member.userId !== undefined && member.userId === access.user._id;
    if (svoj) throw new ConvexError(TEAM_ERROR.selfChange);
    if (!smeUpravljati(access.actor, member.role, { svoj, nova: args.role })) {
      throw new ConvexError(TEAM_ERROR.roleForbidden);
    }
    if (member.role === args.role) return { ok: true };
    await ctx.db.patch(member._id, { role: args.role, updatedAt: Date.now() });
    await audit(ctx, access, "team.role_changed", member._id, { from: member.role, to: args.role });
    return { ok: true };
  },
});

/** Remove a member (or a pending invitation) from the Menu team; account access is never touched. */
export const remove = mutation({
  args: { memberId: v.id("menuMembers") },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { access, member } = await ownedMember(ctx, args.memberId);
    const svoj = member.userId !== undefined && member.userId === access.user._id;
    if (svoj) throw new ConvexError(TEAM_ERROR.selfChange);
    if (!smeUpravljati(access.actor, member.role, { svoj })) throw new ConvexError(TEAM_ERROR.roleForbidden);
    await ctx.db.patch(member._id, {
      status: "removed",
      inviteTokenHash: undefined,
      inviteExpiresAt: undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, access, "team.removed", member._id, { role: member.role });
    return { ok: true };
  },
});
