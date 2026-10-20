import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  getMenuAccess,
  loadOwned,
  requireMenuAccess,
  requireMenuAccessToRow,
  type MenuAccess,
} from "./lib/menuAccess";
import { auditActorKind, writeMenuAudit } from "./lib/menuDraft";
import { menuStaffPanelRoleValidator } from "./lib/menuDomainValidators";
import {
  activeStaffByLookup,
  generateFreePin,
  hashStaffPin,
  pinLookupOf,
  pinPepper,
} from "./lib/menuPin";
import { endSessionsOfService, endSessionsOfStaff, panelCodeRowOf } from "./lib/menuStaffAccess";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import { MENU_MAX_STAFF, MENU_TEXT } from "../lib/menu/limits";
import { newPanelCode, waiterPanelPath } from "../lib/menu/panel-code";
import { isPinFormat } from "../lib/menu/pin-policy";
import { cleanText } from "../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 (K22) — the staff of a venue and the waiter-panel link
// (master §10.6, §13.7; K01 §4.4; plan docs/meni/planovi/K19.md §4.3). The UI is
// built by K28 (Tim i pristupi); K22 proves the rules.
//
// Everything here is the Owner's or a Manager's (permission `staff.pin`; a
// ScanMe admin too) and goes through the one account helper. A PIN is shown
// exactly once, in the answer of `setPin`; it is stored only as the lookup
// HMAC and a salted PBKDF2 hash (convex/lib/menuPin.ts) and never written to
// the audit trail. Resetting a PIN, deactivating a member and changing the
// panel code sign the affected devices out at once.
// =============================================================================

const PERMISSION = "staff.pin" as const;
/** Upper bound of lock rows lifted by one `unlockPins` (devices × venue). */
const UNLOCK_BATCH = 500;
const PANEL_CODE_DRAWS = 8;

export type StaffListRow = {
  id: Id<"menuStaff">;
  displayName: string;
  panelRole: Doc<"menuStaff">["panelRole"];
  active: boolean;
  hasPin: boolean;
  pinSetAt: number | null;
  activeZoneId: Id<"menuZones"> | null;
  createdAt: number;
};

function staffName(raw: string): string {
  const name = cleanText(raw);
  if (name.length === 0 || name.length > MENU_TEXT.staffName) throw new ConvexError(STAFF_ERROR.nameInvalid);
  return name;
}

async function activeStaffOf(ctx: MutationCtx, menuServiceId: Id<"menuServices">) {
  return await ctx.db
    .query("menuStaff")
    .withIndex("by_menuServiceId_and_active", (q) => q.eq("menuServiceId", menuServiceId).eq("active", true))
    .take(MENU_MAX_STAFF + 1);
}

/** A member of this service, for an Owner/Manager of it (anyone else: menu/not_found). */
async function ownedStaff(
  ctx: MutationCtx,
  staffId: Id<"menuStaff">,
): Promise<{ access: MenuAccess; staff: Doc<"menuStaff"> }> {
  const row = await ctx.db.get(staffId);
  if (!row) throw new ConvexError("menu/not_found");
  const access = await requireMenuAccessToRow(ctx, row.menuServiceId, PERMISSION);
  const staff = await loadOwned(ctx, staffId, access.menuService._id);
  return { access, staff };
}

// -----------------------------------------------------------------------------
// Members
// -----------------------------------------------------------------------------

/** The venue's staff, active first (null for every refusal). Never a PIN or a hash. */
export const list = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<StaffListRow[] | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    if (!access) return null;
    const rows: Doc<"menuStaff">[] = [];
    for (const active of [true, false]) {
      rows.push(
        ...(await ctx.db
          .query("menuStaff")
          .withIndex("by_menuServiceId_and_active", (q) => q.eq("menuServiceId", args.menuServiceId).eq("active", active))
          .take(MENU_MAX_STAFF)),
      );
    }
    return rows.map((row) => ({
      id: row._id,
      displayName: row.displayName,
      panelRole: row.panelRole,
      active: row.active,
      hasPin: row.pinLookup !== undefined,
      pinSetAt: row.pinSetAt ?? null,
      activeZoneId: row.activeZoneId ?? null,
      createdAt: row.createdAt,
    }));
  },
});

export const create = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    displayName: v.string(),
    panelRole: v.optional(menuStaffPanelRoleValidator),
  },
  handler: async (ctx, args): Promise<{ staffId: Id<"menuStaff"> }> => {
    const access = await requireMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    const displayName = staffName(args.displayName);
    if ((await activeStaffOf(ctx, args.menuServiceId)).length >= MENU_MAX_STAFF) {
      throw new ConvexError(STAFF_ERROR.staffLimit);
    }
    const now = Date.now();
    const staffId = await ctx.db.insert("menuStaff", {
      menuServiceId: args.menuServiceId,
      businessId: access.menuService.businessId,
      displayName,
      panelRole: args.panelRole ?? "staff",
      active: true,
      createdByUserId: access.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeMenuAudit(ctx, {
      menuServiceId: args.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "staff.created",
      entityType: "staff",
      entityKey: staffId,
      details: { panelRole: args.panelRole ?? "staff" },
    });
    return { staffId };
  },
});

export const rename = mutation({
  args: { staffId: v.id("menuStaff"), displayName: v.string() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { staff } = await ownedStaff(ctx, args.staffId);
    if (!staff.active) throw new ConvexError(STAFF_ERROR.inactive);
    await ctx.db.patch(staff._id, { displayName: staffName(args.displayName), updatedAt: Date.now() });
    return { ok: true };
  },
});

export const setPanelRole = mutation({
  args: { staffId: v.id("menuStaff"), panelRole: menuStaffPanelRoleValidator },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { access, staff } = await ownedStaff(ctx, args.staffId);
    if (!staff.active) throw new ConvexError(STAFF_ERROR.inactive);
    if (staff.panelRole === args.panelRole) return { ok: true };
    await ctx.db.patch(staff._id, { panelRole: args.panelRole, updatedAt: Date.now() });
    await writeMenuAudit(ctx, {
      menuServiceId: staff.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "staff.role_changed",
      entityType: "staff",
      entityKey: staff._id,
      details: { from: staff.panelRole, to: args.panelRole },
    });
    return { ok: true };
  },
});

/** Deactivate: the PIN is cleared (free again) and every device of the member is signed out. */
export const deactivate = mutation({
  args: { staffId: v.id("menuStaff") },
  handler: async (ctx, args): Promise<{ ok: true; endedSessions: number }> => {
    const { access, staff } = await ownedStaff(ctx, args.staffId);
    if (!staff.active) return { ok: true, endedSessions: 0 };
    const now = Date.now();
    await ctx.db.patch(staff._id, {
      active: false,
      deactivatedAt: now,
      updatedAt: now,
      pinHash: undefined,
      pinLookup: undefined,
      pinSetAt: undefined,
      pinSetByUserId: undefined,
    });
    const endedSessions = await endSessionsOfStaff(ctx, staff._id, "deactivated", now);
    await writeMenuAudit(ctx, {
      menuServiceId: staff.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "staff.deactivated",
      entityType: "staff",
      entityKey: staff._id,
      details: { endedSessions },
    });
    return { ok: true, endedSessions };
  },
});

// -----------------------------------------------------------------------------
// PINs
// -----------------------------------------------------------------------------

/**
 * Set (or change) a member's PIN. Without `pin` the system picks a free one
 * (the default, K19-13). The answer carries the PIN ONCE — it is never
 * readable again. Changing an existing PIN signs the member's devices out.
 */
export const setPin = mutation({
  args: { staffId: v.id("menuStaff"), pin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ pin: string; endedSessions: number }> => {
    const { access, staff } = await ownedStaff(ctx, args.staffId);
    if (!staff.active) throw new ConvexError(STAFF_ERROR.inactive);
    const pepper = pinPepper();
    if (!pepper) throw new ConvexError(STAFF_ERROR.pinUnavailable);
    const menuServiceId = staff.menuServiceId;

    let pin: string;
    if (args.pin !== undefined) {
      if (!isPinFormat(args.pin)) throw new ConvexError(STAFF_ERROR.pinFormat);
      const holder = await activeStaffByLookup(ctx, menuServiceId, await pinLookupOf(pepper, menuServiceId, args.pin));
      if (holder && holder._id !== staff._id) throw new ConvexError(STAFF_ERROR.pinTaken);
      pin = args.pin;
    } else {
      const free = await generateFreePin(ctx, pepper, menuServiceId);
      if (!free) throw new ConvexError(STAFF_ERROR.pinExhausted);
      pin = free;
    }

    const now = Date.now();
    const hadPin = staff.pinLookup !== undefined;
    await ctx.db.patch(staff._id, {
      pinLookup: await pinLookupOf(pepper, menuServiceId, pin),
      pinHash: await hashStaffPin(pepper, menuServiceId, pin),
      pinSetAt: now,
      pinSetByUserId: access.user._id,
      updatedAt: now,
    });
    const endedSessions = hadPin ? await endSessionsOfStaff(ctx, staff._id, "pin_reset", now) : 0;
    await writeMenuAudit(ctx, {
      menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "staff.pin_set",
      entityType: "staff",
      entityKey: staff._id,
      details: { generated: args.pin === undefined, replaced: hadPin, endedSessions },
    });
    return { pin, endedSessions };
  },
});

/** Reset (clear) a member's PIN: the member is signed out everywhere until a new PIN is set. */
export const resetPin = mutation({
  args: { staffId: v.id("menuStaff") },
  handler: async (ctx, args): Promise<{ ok: true; endedSessions: number }> => {
    const { access, staff } = await ownedStaff(ctx, args.staffId);
    const now = Date.now();
    await ctx.db.patch(staff._id, {
      pinHash: undefined,
      pinLookup: undefined,
      pinSetAt: undefined,
      pinSetByUserId: undefined,
      updatedAt: now,
    });
    const endedSessions = await endSessionsOfStaff(ctx, staff._id, "pin_reset", now);
    await writeMenuAudit(ctx, {
      menuServiceId: staff.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "staff.pin_reset",
      entityType: "staff",
      entityKey: staff._id,
      details: { endedSessions },
    });
    return { ok: true, endedSessions };
  },
});

/** Lift every PIN lock of the venue (devices and the venue-wide one). */
export const unlockPins = mutation({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<{ unlocked: number }> => {
    const access = await requireMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    const now = Date.now();
    // The venue-wide row first (by its key), so a flood of device rows can never hide it.
    const venueRows = await ctx.db
      .query("menuPinAttempts")
      .withIndex("by_menuServiceId_and_scope_and_scopeKey", (q) =>
        q.eq("menuServiceId", args.menuServiceId).eq("scope", "venue"),
      )
      .take(1);
    const deviceRows = await ctx.db
      .query("menuPinAttempts")
      .withIndex("by_menuServiceId_and_scope_and_scopeKey", (q) =>
        q.eq("menuServiceId", args.menuServiceId).eq("scope", "device"),
      )
      .take(UNLOCK_BATCH);
    const rows = [...venueRows, ...deviceRows];
    let unlocked = 0;
    for (const row of rows) {
      const locked = row.lockedUntil !== undefined && row.lockedUntil > now;
      if (!locked && row.failures === 0) continue;
      await ctx.db.patch(row._id, { failures: 0, windowStartedAt: now, lockedUntil: undefined, updatedAt: now });
      if (locked) unlocked += 1;
    }
    await writeMenuAudit(ctx, {
      menuServiceId: args.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "staff.pins_unlocked",
      entityType: "panel",
      details: { unlocked },
    });
    return { unlocked };
  },
});

// -----------------------------------------------------------------------------
// The waiter-panel link /[slug]/konobar/[kod]
// -----------------------------------------------------------------------------

async function freePanelCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < PANEL_CODE_DRAWS; attempt += 1) {
    const code = newPanelCode();
    const clash = await ctx.db
      .query("menuSecrets")
      .withIndex("by_kind_and_value", (q) => q.eq("kind", "panel_code").eq("value", code))
      .unique();
    if (!clash) return code;
  }
  throw new Error("menuStaff: no free panel code");
}

/** The link of the waiter panel for the Owner or a Manager (null before it exists or on refusal). */
export const panelLink = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<{ code: string; path: string } | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    if (!access) return null;
    const row = await panelCodeRowOf(ctx, args.menuServiceId);
    return row ? { code: row.value, path: waiterPanelPath(access.business.slug, row.value) } : null;
  },
});

/** Create the panel link once (idempotent). */
export const ensurePanelCode = mutation({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<{ code: string; path: string }> => {
    const access = await requireMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    const existing = await panelCodeRowOf(ctx, args.menuServiceId);
    if (existing) return { code: existing.value, path: waiterPanelPath(access.business.slug, existing.value) };
    const code = await freePanelCode(ctx);
    await ctx.db.insert("menuSecrets", { menuServiceId: args.menuServiceId, kind: "panel_code", value: code, createdAt: Date.now() });
    await writeMenuAudit(ctx, {
      menuServiceId: args.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "panel.code_rotated",
      entityType: "panel",
      details: { first: true },
    });
    return { code, path: waiterPanelPath(access.business.slug, code) };
  },
});

/** Change the panel link: the old one is a 404 at once and every device is signed out. */
export const rotatePanelCode = mutation({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<{ code: string; path: string; endedSessions: number }> => {
    const access = await requireMenuAccess(ctx, { menuServiceId: args.menuServiceId }, PERMISSION);
    const now = Date.now();
    const code = await freePanelCode(ctx);
    const existing = await panelCodeRowOf(ctx, args.menuServiceId);
    if (existing) await ctx.db.patch(existing._id, { value: code, rotatedAt: now });
    else await ctx.db.insert("menuSecrets", { menuServiceId: args.menuServiceId, kind: "panel_code", value: code, createdAt: now });
    const endedSessions = await endSessionsOfService(ctx, args.menuServiceId, "code_rotated", now);
    await writeMenuAudit(ctx, {
      menuServiceId: args.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "panel.code_rotated",
      entityType: "panel",
      details: { first: !existing, endedSessions },
    });
    return { code, path: waiterPanelPath(access.business.slug, code), endedSessions };
  },
});
