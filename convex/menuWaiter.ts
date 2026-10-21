import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getMenuAccess } from "./lib/menuAccess";
import { writeMenuAudit } from "./lib/menuDraft";
import { menuIpKey } from "./lib/menuGateway";
import { menuOccupancyStateValidator, menuRequestStatusValidator } from "./lib/menuDomainValidators";
import { activeStaffByLookup, pinLookupOf, pinPepper, verifyStaffPin } from "./lib/menuPin";
import { applyRequestAction } from "./lib/menuRequests";
import {
  loadMenuStaff,
  panelOf,
  userDisplayName,
  userNameForOthers,
  waiterActorRef,
  waiterDisplayName,
  waiterRequestActor,
  type MenuWaiter,
} from "./lib/menuStaffAccess";
import { rateLimiter } from "./lib/rateLimits";
import { REQUEST_ERROR, type RequestErrorCode } from "../lib/menu/errors/requests";
import { MENU_ERROR, type MenuErrorCode } from "../lib/menu/errors/core";
import { STAFF_ERROR, type StaffErrorCode } from "../lib/menu/errors/waiter";
import type { FloorLayout, FloorPositionKind } from "../lib/menu/floor-layout";
import {
  MENU_MAX_ACTIVE_REQUESTS,
  MENU_MAX_CARDS_ON_POSITION,
  MENU_MAX_CART_LINES,
  MENU_MAX_QR_LINKS_ON_POSITION,
  MENU_MAX_OTHERS_ON_POSITION,
  MENU_MAX_POSITIONS,
  MENU_MAX_RECENT_CANCELLED,
  MENU_MAX_STAFF,
  MENU_MAX_STAFF_NOTICES,
  MENU_MAX_ZONES,
} from "../lib/menu/limits";
import type { OccupancyState } from "../lib/menu/occupancy";
import { roleCan } from "../lib/menu/permissions";
import {
  PIN_ATTEMPT_RETENTION_MS,
  PIN_DEVICE_MAX_FAILURES,
  PIN_VENUE_ALL_MAX_FAILURES,
  PIN_VENUE_MAX_FAILURES,
  STAFF_SESSION_MS,
  evaluateAttempt,
  isKnownDevice,
  isPinFormat,
  registerFailure,
  registerSuccess,
  type PinCounter,
} from "../lib/menu/pin-policy";
import type {
  MenuPaymentPreference,
  MenuRequestChannel,
  MenuRequestKind,
  MenuRequestStatus,
  RequestAction,
} from "../lib/menu/request-status";
import { panelTimingOf, type PanelTiming } from "../lib/menu/thresholds";
import { isMenuToken, newMenuToken, staffDeviceKeyHashFor, staffSessionTokenHash } from "../lib/menu/tokens";

// =============================================================================
// ScanMe Menu V1 (K22) — the waiter panel (master §8.4, §10; K01 §4.3–§4.4;
// plan docs/meni/planovi/K19.md §4.3, K19-13…K19-17).
//
// A separate workspace at /[slug]/konobar/[kod]. Staff sign in with their own
// three-digit PIN on the device; the Owner and Managers may also enter with
// their account. The panel then works the venue's requests (call the waiter,
// bill, order for review) through Novi → Prihvaćen → Završen, or Otkazan —
// nothing ever goes to a kitchen.
//
//   entry      panelEntry (is this a panel link at all), accountEntry (may the
//              signed-in account enter without a PIN)
//   sign-in    loginWithPin — called only by the Next handler
//              (lib/menu/http/staff-session.ts) with the device cookie and an
//              IP hash. A wrong PIN is RETURNED, never thrown, so the counters
//              (menuPinAttempts, the menuPinIp bucket) are never rolled back.
//              loginWithAccount, logout; me
//   work       activeRequests (ONE subscription per venue, not per table:
//              `Novi` and `Prihvaćen` bounded at 300 each, plus the last
//              cancelled), requestDetail (while a detail is open), accept,
//              complete, cancel — through the one request writer
//              (convex/lib/menuRequests.ts applyRequestAction)
//   expiry     a session lasts 12 h: runAt(expireSession) and a cron backstop
//              (sweepExpiredSessions), which also forgets stale PIN counters.
//   floor      (K23) floor (static: zones, positions, staff zones, timing,
//              the occupancy switch), occupancy (only with the module),
//              positionDetail (the cards of the open table), setOccupancy
//              (by hand; null = neutral), setMyZone, setStaffZone (audited).
//              Zones are a filter, never routing; nothing scheduled writes
//              occupancy and nothing frees a table on its own.
//
// No query reads the clock; timers are computed on the device from createdAt.
// No response carries a PIN, a hash, a token hash or a guest device pseudonym.
// =============================================================================

const panelArgs = { slug: v.string(), panelCode: v.string() };
const staffArgs = { ...panelArgs, sessionToken: v.optional(v.string()) };

const VENUE_SCOPE_KEY = "venue";
/** K33: the venue counter of EVERY device's misses, known devices too (lib/menu/pin-policy.ts). */
const VENUE_ALL_SCOPE_KEY = "venue:all";
const SWEEP_BATCH = 200;

// -----------------------------------------------------------------------------
// Entry
// -----------------------------------------------------------------------------

/** Is this a waiter-panel link? null = no (the page answers 404). */
export const panelEntry = query({
  args: panelArgs,
  handler: async (ctx, args) => {
    const panel = await panelOf(ctx, args);
    if (!panel) return null;
    return { businessName: panel.business.name, pinAvailable: pinPepper() !== null };
  },
});

/** The signed-in account that may enter without a PIN (Owner, Manager, admin), or null. */
export const accountEntry = query({
  args: panelArgs,
  handler: async (ctx, args) => {
    const panel = await panelOf(ctx, args);
    if (!panel) return null;
    const access = await getMenuAccess(ctx, { menuServiceId: panel.menuService._id }, "waiter.work");
    return access ? { displayName: userDisplayName(access.user) } : null;
  },
});

// -----------------------------------------------------------------------------
// Sign-in with a PIN
// -----------------------------------------------------------------------------

export type PinLoginOutcome =
  | { ok: true; sessionToken: string; deviceToken: string; expiresAt: number; displayName: string }
  | { ok: false; code: typeof STAFF_ERROR.panelNotFound }
  | { ok: false; code: typeof STAFF_ERROR.pinUnavailable }
  | { ok: false; code: typeof STAFF_ERROR.rateLimited; deviceToken: string; retryAt: number | null }
  | { ok: false; code: typeof STAFF_ERROR.locked; deviceToken: string; lockedUntil: number }
  | { ok: false; code: typeof STAFF_ERROR.wrongPin; deviceToken: string; attemptsLeft: number };

async function counterOf(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  scope: "device" | "venue",
  scopeKey: string,
): Promise<Doc<"menuPinAttempts"> | null> {
  return await ctx.db
    .query("menuPinAttempts")
    .withIndex("by_menuServiceId_and_scope_and_scopeKey", (q) =>
      q.eq("menuServiceId", menuServiceId).eq("scope", scope).eq("scopeKey", scopeKey),
    )
    .unique();
}

async function writeCounter(
  ctx: MutationCtx,
  existing: Doc<"menuPinAttempts"> | null,
  key: { menuServiceId: Id<"menuServices">; scope: "device" | "venue"; scopeKey: string },
  counter: PinCounter,
  now: number,
): Promise<void> {
  const fields = {
    failures: counter.failures,
    windowStartedAt: counter.windowStartedAt,
    lockedUntil: counter.lockedUntil,
    lastSuccessAt: counter.lastSuccessAt,
    lockStreak: counter.lockStreak,
    updatedAt: now,
  };
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("menuPinAttempts", { ...key, ...fields });
}

/**
 * Sign in with a PIN. Called only by the Next handler of
 * /[slug]/konobar/[kod]/sesija, which keeps the raw tokens in HttpOnly
 * cookies; a direct call gains nothing, since the venue lock counts every new
 * device and (K33) the all-devices lock counts every miss. Every refusal is a
 * value (see the header).
 */
export const loginWithPin = mutation({
  args: {
    ...panelArgs,
    pin: v.string(),
    // The raw device token of the cookie smk_d, verified by the handler;
    // anything malformed starts a new device.
    deviceToken: v.optional(v.string()),
    // A salted hash of the caller IP computed by the handler (a bucket key
    // only); absent or untrusted → one shared bucket (K33: convex/lib/menuGateway.ts).
    ipHash: v.optional(v.string()),
    // K33: MENU_GATEWAY_SECRET of the Next handler; with it set on the
    // deployment, the ipHash counts only together with it.
    gateway: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PinLoginOutcome> => {
    const now = Date.now();
    const panel = await panelOf(ctx, args);
    if (!panel) return { ok: false, code: STAFF_ERROR.panelNotFound };
    const pepper = pinPepper();
    if (!pepper) return { ok: false, code: STAFF_ERROR.pinUnavailable };
    const menuServiceId = panel.menuService._id;

    const deviceToken = args.deviceToken && isMenuToken(args.deviceToken) ? args.deviceToken : newMenuToken();
    const deviceKeyHash = await staffDeviceKeyHashFor(menuServiceId, deviceToken);
    const deviceKey = { menuServiceId, scope: "device", scopeKey: deviceKeyHash } as const;
    const venueKey = { menuServiceId, scope: "venue", scopeKey: VENUE_SCOPE_KEY } as const;
    const allKey = { menuServiceId, scope: "venue", scopeKey: VENUE_ALL_SCOPE_KEY } as const;
    const deviceRow = await counterOf(ctx, menuServiceId, "device", deviceKeyHash);
    const venueRow = await counterOf(ctx, menuServiceId, "venue", VENUE_SCOPE_KEY);
    const allRow = await counterOf(ctx, menuServiceId, "venue", VENUE_ALL_SCOPE_KEY);

    // A locked device is refused even with the right PIN (the sixth try).
    const verdict = evaluateAttempt({ device: deviceRow, venue: venueRow, all: allRow }, now);
    if (verdict.kind === "locked") {
      return { ok: false, code: STAFF_ERROR.locked, deviceToken, lockedUntil: verdict.lockedUntil };
    }

    const ipKey = menuIpKey(args.ipHash, args.gateway);
    const ipBucket = await rateLimiter.check(ctx, "menuPinIp", { key: ipKey });
    if (!ipBucket.ok) {
      return { ok: false, code: STAFF_ERROR.rateLimited, deviceToken, retryAt: ipBucket.retryAfter ? now + ipBucket.retryAfter : null };
    }

    const lookup = isPinFormat(args.pin) ? await pinLookupOf(pepper, menuServiceId, args.pin) : null;
    const staff = lookup ? await activeStaffByLookup(ctx, menuServiceId, lookup) : null;
    // Always one PBKDF2 verify (a decoy when nobody matched): a miss costs what a wrong PIN costs.
    const matched = await verifyStaffPin(pepper, menuServiceId, isPinFormat(args.pin) ? args.pin : "", staff?.pinHash);

    if (!staff || !matched) {
      const known = isKnownDevice(deviceRow, now);
      const device = registerFailure(deviceRow, now, PIN_DEVICE_MAX_FAILURES);
      await writeCounter(ctx, deviceRow, deviceKey, device.counter, now);
      if (device.justLocked) {
        await writeMenuAudit(ctx, {
          menuServiceId,
          actorKind: "system",
          action: "staff.pin_locked",
          entityType: "panel",
          details: { scope: "device", lockedUntil: device.counter.lockedUntil ?? null },
        });
      }
      // The venue counts only devices without a sign-in in the last 12 h.
      if (!known) {
        const venue = registerFailure(venueRow, now, PIN_VENUE_MAX_FAILURES, true);
        await writeCounter(ctx, venueRow, venueKey, venue.counter, now);
        if (venue.justLocked) {
          await writeMenuAudit(ctx, {
            menuServiceId,
            actorKind: "system",
            action: "staff.pin_locked",
            entityType: "panel",
            details: { scope: "venue", lockedUntil: venue.counter.lockedUntil ?? null, streak: venue.counter.lockStreak ?? 1 },
          });
        }
      }
      // K33: every miss, known device or not, so minting known devices with one valid PIN probes nothing more.
      const all = registerFailure(allRow, now, PIN_VENUE_ALL_MAX_FAILURES, true);
      await writeCounter(ctx, allRow, allKey, all.counter, now);
      if (all.justLocked) {
        await writeMenuAudit(ctx, {
          menuServiceId,
          actorKind: "system",
          action: "staff.pin_locked",
          entityType: "panel",
          details: { scope: "venue_all", lockedUntil: all.counter.lockedUntil ?? null, streak: all.counter.lockStreak ?? 1 },
        });
      }
      await rateLimiter.limit(ctx, "menuPinIp", { key: ipKey });
      if (device.justLocked) {
        return { ok: false, code: STAFF_ERROR.locked, deviceToken, lockedUntil: device.counter.lockedUntil ?? now };
      }
      return { ok: false, code: STAFF_ERROR.wrongPin, deviceToken, attemptsLeft: device.attemptsLeft };
    }

    await writeCounter(ctx, deviceRow, deviceKey, registerSuccess(deviceRow, now), now);

    // One device, one live session: signing in again (or as someone else) replaces it.
    const sameDevice = await ctx.db
      .query("menuStaffSessions")
      .withIndex("by_menuServiceId_and_deviceKeyHash", (q) =>
        q.eq("menuServiceId", menuServiceId).eq("deviceKeyHash", deviceKeyHash),
      )
      .take(20);
    for (const previous of sameDevice) {
      if (previous.endedAt === undefined) await ctx.db.patch(previous._id, { endedAt: now, endReason: "replaced" });
    }

    const sessionToken = newMenuToken();
    const expiresAt = now + STAFF_SESSION_MS;
    const sessionId = await ctx.db.insert("menuStaffSessions", {
      menuServiceId,
      staffId: staff._id,
      deviceKeyHash,
      tokenHash: await staffSessionTokenHash(sessionToken),
      createdAt: now,
      expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.menuWaiter.expireSession, { sessionId });
    await writeMenuAudit(ctx, {
      menuServiceId,
      actorKind: "staff",
      actorRef: staff._id,
      action: "staff.login",
      entityType: "staff",
      entityKey: staff._id,
      details: { method: "pin" },
    });
    return { ok: true, sessionToken, deviceToken, expiresAt, displayName: staff.displayName };
  },
});

/** The Owner or a Manager enters with their account (no PIN, no session row). */
export const loginWithAccount = mutation({
  args: panelArgs,
  handler: async (ctx, args): Promise<{ ok: true; displayName: string } | { ok: false; code: StaffErrorCode }> => {
    const waiter = await loadMenuStaff(ctx, args, Date.now());
    if (!waiter || waiter.actor.kind !== "user") return { ok: false, code: STAFF_ERROR.signedOut };
    const bucket = await rateLimiter.limit(ctx, "menuStaffAction", { key: waiterActorRef(waiter.actor) });
    if (!bucket.ok) return { ok: false, code: STAFF_ERROR.rateLimited };
    await writeMenuAudit(ctx, {
      menuServiceId: waiter.menuService._id,
      actorKind: waiter.actor.access.actor === "admin" ? "admin" : "user",
      actorUserId: waiter.actor.access.user._id,
      action: "staff.login",
      entityType: "panel",
      details: { method: "account" },
    });
    return { ok: true, displayName: waiterDisplayName(waiter.actor) };
  },
});

/** Sign this device out (idempotent: an ended or unknown session is already out). */
export const logout = mutation({
  args: { ...panelArgs, sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter || waiter.actor.kind !== "staff") return { ok: true };
    const now = Date.now();
    await ctx.db.patch(waiter.actor.session._id, { endedAt: now, endReason: "logout" });
    await writeMenuAudit(ctx, {
      menuServiceId: waiter.menuService._id,
      actorKind: "staff",
      actorRef: waiter.actor.staff._id,
      action: "staff.logout",
      entityType: "staff",
      entityKey: waiter.actor.staff._id,
    });
    return { ok: true };
  },
});

export type WaiterMe = {
  kind: "staff" | "account";
  displayName: string;
  /** staff: their panel role; account: the Menu role (owner, manager, admin). */
  role: "staff" | "manager" | "owner" | "admin";
  businessName: string;
  /** When the PIN sign-in ends (12 h); null for an account. */
  expiresAt: number | null;
};

/** Who is signed in on this device, or null (signed out, expired, no access). */
export const me = query({
  args: staffArgs,
  handler: async (ctx, args): Promise<WaiterMe | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter) return null;
    const { actor } = waiter;
    if (actor.kind === "staff") {
      return {
        kind: "staff",
        displayName: actor.staff.displayName,
        role: actor.staff.panelRole,
        businessName: waiter.business.name,
        expiresAt: actor.session.expiresAt,
      };
    }
    const role = actor.access.actor === "admin" ? "admin" : actor.access.actor === "owner" ? "owner" : "manager";
    return { kind: "account", displayName: userDisplayName(actor.access.user), role, businessName: waiter.business.name, expiresAt: null };
  },
});

// -----------------------------------------------------------------------------
// The work queue and the request detail
// -----------------------------------------------------------------------------

export type WaiterRequestRow = {
  id: Id<"menuRequests">;
  kind: MenuRequestKind;
  /** K23: the position (the floor and the table detail group requests by it). */
  positionId: Id<"menuPositions">;
  /** K23: the zone recorded on the request (the floor prefers the position's current zone). */
  zoneId: Id<"menuZones"> | null;
  status: MenuRequestStatus;
  channel: MenuRequestChannel;
  positionLabel: string;
  positionKind: Doc<"menuRequests">["positionKind"];
  zoneName: string | null;
  createdAt: number;
  acceptedAt: number | null;
  paymentPreference: MenuPaymentPreference | null;
  /** Orders: lines and the informative total (whole RSD). */
  itemCount: number | null;
  totalRsd: number | null;
  /** Who took it; `isMe` = the person on this device. */
  acceptedBy: { name: string; isMe: boolean } | null;
};

type NameBook = {
  zone: (id: Id<"menuZones"> | undefined) => string | null;
  person: (staffId: Id<"menuStaff"> | undefined, userId: Id<"users"> | undefined) => string | null;
};

/** Zone and people names of a set of requests: bounded, one read per DISTINCT id. */
async function nameBook(ctx: QueryCtx | MutationCtx, menuServiceId: Id<"menuServices">, requests: Doc<"menuRequests">[]): Promise<NameBook> {
  const zones = new Map<Id<"menuZones">, string | null>();
  const staff = new Map<Id<"menuStaff">, string | null>();
  const users = new Map<Id<"users">, string | null>();
  const activeStaff = await ctx.db
    .query("menuStaff")
    .withIndex("by_menuServiceId_and_active", (q) => q.eq("menuServiceId", menuServiceId).eq("active", true))
    .take(MENU_MAX_STAFF);
  for (const member of activeStaff) staff.set(member._id, member.displayName);
  for (const request of requests) {
    const zoneId = request.zoneId;
    if (zoneId && !zones.has(zoneId)) {
      const zone = await ctx.db.get(zoneId);
      zones.set(zoneId, zone && zone.menuServiceId === menuServiceId ? zone.name : null);
    }
    for (const staffId of [request.acceptedByStaffId, request.doneByStaffId, request.cancelledByStaffId]) {
      if (staffId && !staff.has(staffId)) {
        const member = await ctx.db.get(staffId);
        staff.set(staffId, member && member.menuServiceId === menuServiceId ? member.displayName : null);
      }
    }
    for (const userId of [request.acceptedByUserId, request.doneByUserId, request.cancelledByUserId]) {
      if (userId && !users.has(userId)) {
        const user = await ctx.db.get(userId);
        users.set(userId, user ? userNameForOthers(user) : null);
      }
    }
  }
  return {
    zone: (id) => (id ? (zones.get(id) ?? null) : null),
    person: (staffId, userId) => (staffId ? (staff.get(staffId) ?? null) : userId ? (users.get(userId) ?? null) : null),
  };
}

function isMine(waiter: MenuWaiter, staffId: Id<"menuStaff"> | undefined, userId: Id<"users"> | undefined): boolean {
  const { actor } = waiter;
  return actor.kind === "staff" ? staffId === actor.staff._id : userId === actor.access.user._id;
}

function toRow(request: Doc<"menuRequests">, names: NameBook, waiter: MenuWaiter): WaiterRequestRow {
  const takenBy =
    request.acceptedByStaffId || request.acceptedByUserId
      ? {
          name: names.person(request.acceptedByStaffId, request.acceptedByUserId) ?? "",
          isMe: isMine(waiter, request.acceptedByStaffId, request.acceptedByUserId),
        }
      : null;
  return {
    id: request._id,
    kind: request.kind,
    positionId: request.positionId,
    zoneId: request.zoneId ?? null,
    status: request.status,
    channel: request.channel,
    positionLabel: request.positionLabel,
    positionKind: request.positionKind,
    zoneName: names.zone(request.zoneId),
    createdAt: request.createdAt,
    acceptedAt: request.acceptedAt ?? null,
    paymentPreference: request.paymentPreference ?? null,
    itemCount: request.kind === "order" ? (request.itemCount ?? null) : null,
    totalRsd: request.kind === "order" ? (request.totalRsd ?? null) : null,
    acceptedBy: takenBy,
  };
}

async function requestsWithStatus(
  ctx: QueryCtx,
  menuServiceId: Id<"menuServices">,
  status: MenuRequestStatus,
  limit: number,
  order: "asc" | "desc",
) {
  return await ctx.db
    .query("menuRequests")
    .withIndex("by_menuServiceId_and_status_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId).eq("status", status))
    .order(order)
    .take(limit);
}

export type WaiterCancelledRow = {
  id: Id<"menuRequests">;
  kind: MenuRequestKind;
  positionLabel: string;
  cancelledAt: number | null;
  cancelledBy: "guest" | "staff" | null;
};

export type WaiterQueue = {
  /** `Novi` (oldest first) then `Prihvaćen` (oldest first); the client orders the queue. */
  requests: WaiterRequestRow[];
  /** More than 300 of one status: the oldest 300 are shown. */
  truncated: boolean;
  /** The last cancelled requests (newest first), so a guest's cancellation is never silent. */
  recentlyCancelled: WaiterCancelledRow[];
  /**
   * K27: unseen reminders ("ping") from Operativa to THIS PIN waiter, newest
   * first, at most 5, only for requests the waiter still holds. The device
   * shows those sent in the last 30 minutes (the query never reads the clock).
   * Always empty for an account.
   */
  notices: WaiterNotice[];
};

export type WaiterNotice = {
  id: Id<"menuStaffNotices">;
  requestId: Id<"menuRequests">;
  kind: MenuRequestKind;
  positionLabel: string;
  /** When the guest sent the request ("čeka od 18:12"). */
  requestCreatedAt: number;
  createdAt: number;
  /** Who sent it (an account name, never an e-mail). */
  from: string;
};

/** K27: the reminders of one PIN waiter (see WaiterQueue.notices). */
async function noticesOf(
  ctx: QueryCtx,
  staffId: Id<"menuStaff">,
  menuServiceId: Id<"menuServices">,
  open: Doc<"menuRequests">[],
): Promise<WaiterNotice[]> {
  const rows = await ctx.db
    .query("menuStaffNotices")
    .withIndex("by_staffId_and_createdAt", (q) => q.eq("staffId", staffId))
    .order("desc")
    .take(MENU_MAX_STAFF_NOTICES * 4);
  const held = new Map(open.filter((request) => request.acceptedByStaffId === staffId).map((request) => [request._id, request]));
  const names = new Map<Id<"users">, string>();
  const notices: WaiterNotice[] = [];
  for (const row of rows) {
    if (notices.length >= MENU_MAX_STAFF_NOTICES) break;
    const request = held.get(row.requestId);
    if (row.seenAt !== undefined || row.menuServiceId !== menuServiceId || !request || request.status !== "accepted") continue;
    if (!names.has(row.createdByUserId)) {
      const user = await ctx.db.get(row.createdByUserId);
      names.set(row.createdByUserId, user ? userNameForOthers(user) : "");
    }
    notices.push({
      id: row._id,
      requestId: request._id,
      kind: request.kind,
      positionLabel: request.positionLabel,
      requestCreatedAt: request.createdAt,
      createdAt: row.createdAt,
      from: names.get(row.createdByUserId) ?? "",
    });
  }
  return notices;
}

/** The live work queue of the venue: ONE subscription per device. */
export const activeRequests = query({
  args: staffArgs,
  handler: async (ctx, args): Promise<WaiterQueue | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter) return null;
    const menuServiceId = waiter.menuService._id;
    const fresh = await requestsWithStatus(ctx, menuServiceId, "new", MENU_MAX_ACTIVE_REQUESTS + 1, "asc");
    const accepted = await requestsWithStatus(ctx, menuServiceId, "accepted", MENU_MAX_ACTIVE_REQUESTS + 1, "asc");
    const cancelled = await requestsWithStatus(ctx, menuServiceId, "cancelled", MENU_MAX_RECENT_CANCELLED, "desc");
    const truncated = fresh.length > MENU_MAX_ACTIVE_REQUESTS || accepted.length > MENU_MAX_ACTIVE_REQUESTS;
    const open = [...fresh.slice(0, MENU_MAX_ACTIVE_REQUESTS), ...accepted.slice(0, MENU_MAX_ACTIVE_REQUESTS)];
    const names = await nameBook(ctx, menuServiceId, open);
    return {
      requests: open.map((request) => toRow(request, names, waiter)),
      truncated,
      recentlyCancelled: cancelled.map((request) => ({
        id: request._id,
        kind: request.kind,
        positionLabel: request.positionLabel,
        cancelledAt: request.cancelledAt ?? null,
        cancelledBy: request.cancelledBy ?? null,
      })),
      notices: waiter.actor.kind === "staff" ? await noticesOf(ctx, waiter.actor.staff._id, menuServiceId, open) : [],
    };
  },
});

export type WaiterRequestItem = {
  name: string;
  variantName: string | null;
  addons: { groupName: string; optionName: string; priceDeltaRsd: number }[];
  quantity: number;
  unitPriceRsd: number;
  lineTotalRsd: number;
  promoApplied: boolean;
  note: string | null;
};

export type WaiterRequestDetail = {
  request: WaiterRequestRow & {
    /** The card the guest scanned ("Kartica 12-B"), as it was named when the request was sent. */
    sourceLabel: string | null;
    subtotalRsd: number | null;
    deliveryFeeRsd: number | null;
    doneAt: number | null;
    doneBy: string | null;
    cancelledAt: number | null;
    cancelledBy: "guest" | "staff" | null;
  };
  items: WaiterRequestItem[];
  /** Other open requests of the same table or room ("Ostalo na ovom stolu"). */
  others: WaiterRequestRow[];
};

/** One request with its lines and the rest of its table; a temporary subscription while open. */
export const requestDetail = query({
  args: { ...staffArgs, requestId: v.id("menuRequests") },
  handler: async (ctx, args): Promise<WaiterRequestDetail | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter) return null;
    const request = await ctx.db.get(args.requestId);
    if (!request || request.menuServiceId !== waiter.menuService._id) return null;
    const items = await ctx.db
      .query("menuRequestItems")
      .withIndex("by_requestId", (q) => q.eq("requestId", request._id))
      .take(MENU_MAX_CART_LINES);
    const sameTable: Doc<"menuRequests">[] = [];
    for (const status of ["new", "accepted"] as const) {
      const rows = await ctx.db
        .query("menuRequests")
        .withIndex("by_positionId_and_status", (q) => q.eq("positionId", request.positionId).eq("status", status))
        .take(MENU_MAX_OTHERS_ON_POSITION);
      for (const row of rows) if (row._id !== request._id && row.menuServiceId === request.menuServiceId) sameTable.push(row);
    }
    const names = await nameBook(ctx, waiter.menuService._id, [request, ...sameTable]);
    return {
      request: {
        ...toRow(request, names, waiter),
        sourceLabel: request.sourceLabel ?? null,
        subtotalRsd: request.subtotalRsd ?? null,
        deliveryFeeRsd: request.deliveryFeeRsd ?? null,
        doneAt: request.doneAt ?? null,
        doneBy: names.person(request.doneByStaffId, request.doneByUserId),
        cancelledAt: request.cancelledAt ?? null,
        cancelledBy: request.cancelledBy ?? null,
      },
      items: items
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          name: item.name,
          variantName: item.variantName ?? null,
          addons: item.addons.map((addon) => ({
            groupName: addon.groupName,
            optionName: addon.optionName,
            priceDeltaRsd: addon.priceDeltaRsd,
          })),
          quantity: item.quantity,
          unitPriceRsd: item.unitPriceRsd,
          lineTotalRsd: item.lineTotalRsd,
          promoApplied: item.promoApplied === true,
          note: item.note ?? null,
        })),
      others: sameTable.sort((a, b) => a.createdAt - b.createdAt).map((row) => toRow(row, names, waiter)),
    };
  },
});

// -----------------------------------------------------------------------------
// Preuzmi, Završi, Otkaži
// -----------------------------------------------------------------------------

export type WaiterActionOutcome =
  | { ok: true; status: MenuRequestStatus; changed: boolean }
  | {
      ok: false;
      code: RequestErrorCode | StaffErrorCode;
      /** The request's status now (when it is known). */
      status?: MenuRequestStatus;
      /** `request/taken`: who already took it. */
      takenBy?: string;
    };

async function act(
  ctx: MutationCtx,
  args: { slug: string; panelCode: string; sessionToken?: string; requestId: Id<"menuRequests"> },
  action: RequestAction,
  expectedStatus?: MenuRequestStatus,
): Promise<WaiterActionOutcome> {
  const now = Date.now();
  const waiter = await loadMenuStaff(ctx, args, now);
  if (!waiter) return { ok: false, code: STAFF_ERROR.signedOut };
  const bucket = await rateLimiter.limit(ctx, "menuStaffAction", {
    key: waiter.actor.kind === "staff" ? `session:${waiter.actor.session._id}` : waiterActorRef(waiter.actor),
  });
  if (!bucket.ok) return { ok: false, code: STAFF_ERROR.rateLimited };
  const request = await ctx.db.get(args.requestId);
  if (!request || request.menuServiceId !== waiter.menuService._id) return { ok: false, code: REQUEST_ERROR.notFound };
  if (expectedStatus !== undefined && request.status !== expectedStatus) {
    return { ok: false, code: STAFF_ERROR.statusChanged, status: request.status };
  }
  const result = await applyRequestAction(ctx, request, action, waiterRequestActor(waiter.actor), now);
  if (result.ok) return { ok: true, status: result.status, changed: result.changed };
  if (result.code === REQUEST_ERROR.requestTaken) {
    const names = await nameBook(ctx, waiter.menuService._id, [request]);
    return {
      ok: false,
      code: result.code,
      status: request.status,
      takenBy: names.person(request.acceptedByStaffId, request.acceptedByUserId) ?? "",
    };
  }
  return { ok: false, code: result.code, status: request.status };
}

const actionArgs = { ...staffArgs, requestId: v.id("menuRequests") };

/** Preuzmi: Novi → Prihvaćen (the same person again is a no-op; someone else's → request/taken). */
export const accept = mutation({
  args: actionArgs,
  handler: async (ctx, args) => await act(ctx, args, "accept"),
});

/** Završi: Prihvaćen → Završen, or Novi → Završen in one tap (accepted at the same moment). */
export const complete = mutation({
  args: actionArgs,
  handler: async (ctx, args) => await act(ctx, args, "done"),
});

/**
 * Otkaži (after the waiter confirmed): Novi or Prihvaćen → Otkazan, audited.
 * `expectedStatus` is what the waiter saw; if the request moved meanwhile,
 * nothing is written (`staff/status_changed`).
 */
export const cancel = mutation({
  args: { ...actionArgs, expectedStatus: v.optional(menuRequestStatusValidator) },
  handler: async (ctx, args) => await act(ctx, args, "cancel", args.expectedStatus),
});

/**
 * K27: "U redu" on a reminder from Operativa — only the PIN waiter it was
 * sent to closes it (anyone else: `menu/not_found`, the same as a missing
 * one). Closing twice is a no-op.
 */
export const seeNotice = mutation({
  args: { ...staffArgs, noticeId: v.id("menuStaffNotices") },
  handler: async (ctx, args): Promise<{ ok: true; changed: boolean } | { ok: false; code: StaffErrorCode | MenuErrorCode }> => {
    const now = Date.now();
    const waiter = await loadMenuStaff(ctx, args, now);
    if (!waiter) return { ok: false, code: STAFF_ERROR.signedOut };
    const notice = await ctx.db.get(args.noticeId);
    if (
      waiter.actor.kind !== "staff" ||
      !notice ||
      notice.menuServiceId !== waiter.menuService._id ||
      notice.staffId !== waiter.actor.staff._id
    ) {
      return { ok: false, code: MENU_ERROR.notFound };
    }
    if (notice.seenAt !== undefined) return { ok: true, changed: false };
    await ctx.db.patch(notice._id, { seenAt: now });
    return { ok: true, changed: true };
  },
});

// -----------------------------------------------------------------------------
// K23 — the floor: zones, positions, occupancy, own and assigned zones
// (master §9.3, §9.4, §10.2–§10.5; plan K19 §4.4, K19-17…K19-21)
// -----------------------------------------------------------------------------

export type WaiterFloorPosition = {
  id: Id<"menuPositions">;
  kind: FloorPositionKind;
  label: string;
  seats: number | null;
  /** null = "Bez zone" (everyone's). */
  zoneId: Id<"menuZones"> | null;
  /** The stored schematic layout (the panel places the rest like "Lokal i QR" does). */
  layout: FloorLayout | null;
  order: number;
};

export type WaiterFloor = {
  zones: { id: Id<"menuZones">; name: string; order: number }[];
  positions: WaiterFloorPosition[];
  /** Active staff and their own active zone (the manager re-assigns them; names only). */
  staff: { id: Id<"menuStaff">; name: string; panelRole: "staff" | "manager"; activeZoneId: Id<"menuZones"> | null }[];
  me: {
    /** The staff member on this device; null for the Owner's or a Manager's account. */
    staffId: Id<"menuStaff"> | null;
    /** The own active zone (a filter); null = every zone. Accounts keep theirs on the device. */
    activeZoneId: Id<"menuZones"> | null;
    /** May re-assign the zones of everyone (Owner, Manager, admin, a panel manager). */
    canAssignZones: boolean;
  };
  /** The venue's late threshold and reminder (defaults when unset). */
  timing: PanelTiming;
  /** The optional occupancy module (master §9.4): off = every table is neutral. */
  occupancyEnabled: boolean;
};

function canAssignZones(waiter: MenuWaiter): boolean {
  const { actor } = waiter;
  return actor.kind === "staff" ? actor.staff.panelRole === "manager" : roleCan(actor.access.actor, "waiter.assignZones");
}

/**
 * The static part of the floor: ONE subscription per device (plan K19-17).
 * It changes when the venue changes zones, positions, staff or settings,
 * never with a guest's scan or request. Bounded: ≤ 30 zones, ≤ 500
 * positions, ≤ 100 staff.
 */
export const floor = query({
  args: staffArgs,
  handler: async (ctx, args): Promise<WaiterFloor | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter) return null;
    const menuServiceId = waiter.menuService._id;
    const zones = await ctx.db
      .query("menuZones")
      .withIndex("by_menuServiceId_and_active_and_order", (q) => q.eq("menuServiceId", menuServiceId).eq("active", true))
      .take(MENU_MAX_ZONES);
    const positions = await ctx.db
      .query("menuPositions")
      .withIndex("by_menuServiceId_and_active_and_order", (q) => q.eq("menuServiceId", menuServiceId).eq("active", true))
      .take(MENU_MAX_POSITIONS);
    const staff = await ctx.db
      .query("menuStaff")
      .withIndex("by_menuServiceId_and_active", (q) => q.eq("menuServiceId", menuServiceId).eq("active", true))
      .take(MENU_MAX_STAFF);
    const zoneIds = new Set(zones.map((zone) => zone._id));
    const liveZone = (id: Id<"menuZones"> | undefined) => (id && zoneIds.has(id) ? id : null);
    const me = waiter.actor.kind === "staff" ? waiter.actor.staff : null;
    return {
      zones: zones.map((zone) => ({ id: zone._id, name: zone.name, order: zone.order })),
      positions: positions.map((position) => ({
        id: position._id,
        kind: position.kind,
        label: position.label,
        seats: position.seats ?? null,
        zoneId: liveZone(position.zoneId),
        layout: position.layout ?? null,
        order: position.order,
      })),
      staff: staff.map((member) => ({
        id: member._id,
        name: member.displayName,
        panelRole: member.panelRole,
        activeZoneId: liveZone(member.activeZoneId),
      })),
      me: {
        staffId: me ? me._id : null,
        activeZoneId: me ? liveZone(me.activeZoneId) : null,
        canAssignZones: canAssignZones(waiter),
      },
      timing: panelTimingOf(waiter.menuService.settings?.panel),
      occupancyEnabled: waiter.menuService.features.occupancy === true,
    };
  },
});

export type WaiterOccupancy =
  | { off: true }
  | {
      off: false;
      states: { positionId: Id<"menuPositions">; state: OccupancyState; updatedAt: number; updatedBy: string | null }[];
    };

/**
 * The occupancy of the venue's positions, only when the module is on (plan
 * K19-19): `{ off: true }` otherwise, and the panel shows every table as
 * neutral. A position without a row is neutral too.
 */
export const occupancy = query({
  args: staffArgs,
  handler: async (ctx, args): Promise<WaiterOccupancy | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter) return null;
    if (waiter.menuService.features.occupancy !== true) return { off: true };
    const menuServiceId = waiter.menuService._id;
    const rows = await ctx.db
      .query("menuPositionOccupancy")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .take(MENU_MAX_POSITIONS);
    const staffNames = new Map<Id<"menuStaff">, string | null>();
    const userNames = new Map<Id<"users">, string | null>();
    const states: Extract<WaiterOccupancy, { off: false }>["states"] = [];
    for (const row of rows) {
      let updatedBy: string | null = null;
      if (row.updatedByStaffId) {
        const id = row.updatedByStaffId;
        if (!staffNames.has(id)) {
          const member = await ctx.db.get(id);
          staffNames.set(id, member && member.menuServiceId === menuServiceId ? member.displayName : null);
        }
        updatedBy = staffNames.get(id) ?? null;
      } else if (row.updatedByUserId) {
        const id = row.updatedByUserId;
        if (!userNames.has(id)) {
          const user = await ctx.db.get(id);
          userNames.set(id, user ? userNameForOthers(user) : null);
        }
        updatedBy = userNames.get(id) ?? null;
      }
      states.push({ positionId: row.positionId, state: row.state, updatedAt: row.updatedAt, updatedBy });
    }
    return { off: false, states };
  },
});

export type WaiterPositionDetail = {
  /** The active QR cards standing on this position ("Kartica 12-B"), by label. */
  cards: { label: string }[];
};

/**
 * What the table detail adds to the floor: the card(s) on the table. A
 * temporary subscription while one table is open (cards change with every
 * scan, so the static floor never reads them).
 */
export const positionDetail = query({
  args: { ...staffArgs, positionId: v.id("menuPositions") },
  handler: async (ctx, args): Promise<WaiterPositionDetail | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter) return null;
    const position = await ctx.db.get(args.positionId);
    if (!position || position.menuServiceId !== waiter.menuService._id || !position.active) return null;
    const links = await ctx.db
      .query("menuQrLinks")
      .withIndex("by_positionId", (q) => q.eq("positionId", position._id))
      .take(MENU_MAX_QR_LINKS_ON_POSITION);
    const cards: WaiterPositionDetail["cards"] = [];
    for (const link of links) {
      if (cards.length >= MENU_MAX_CARDS_ON_POSITION) break;
      if (!link.active || link.menuServiceId !== waiter.menuService._id) continue;
      const card = await ctx.db.get(link.cardId);
      if (!card || card.businessId !== waiter.business._id || card.status !== "active") continue;
      cards.push({ label: card.label });
    }
    return { cards };
  },
});

export type WaiterFloorOutcome = { ok: true; changed: boolean } | { ok: false; code: StaffErrorCode | MenuErrorCode };

/** Who acts (a mutation clock: an expired session is refused) and one token of the action bucket. */
async function floorActor(
  ctx: MutationCtx,
  args: { slug: string; panelCode: string; sessionToken?: string },
): Promise<{ waiter: MenuWaiter; now: number } | { refused: WaiterFloorOutcome }> {
  const now = Date.now();
  const waiter = await loadMenuStaff(ctx, args, now);
  if (!waiter) return { refused: { ok: false, code: STAFF_ERROR.signedOut } };
  const bucket = await rateLimiter.limit(ctx, "menuStaffAction", {
    key: waiter.actor.kind === "staff" ? `session:${waiter.actor.session._id}` : waiterActorRef(waiter.actor),
  });
  if (!bucket.ok) return { refused: { ok: false, code: STAFF_ERROR.rateLimited } };
  return { waiter, now };
}

/** An active zone of this venue, or null for "every zone"; undefined = not this venue's (refused). */
async function zoneArg(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  zoneId: Id<"menuZones"> | null,
): Promise<Id<"menuZones"> | null | undefined> {
  if (zoneId === null) return null;
  const zone = await ctx.db.get(zoneId);
  return zone && zone.menuServiceId === menuServiceId && zone.active ? zone._id : undefined;
}

/**
 * Status stola, set by hand (master §9.4): free, occupied, reserved, out of
 * service, or `null` back to neutral (the row is deleted). Refused when the
 * module is off. Recorded on the row (who and when), not audited (K19-16).
 */
export const setOccupancy = mutation({
  args: { ...staffArgs, positionId: v.id("menuPositions"), state: v.union(menuOccupancyStateValidator, v.null()) },
  handler: async (ctx, args): Promise<WaiterFloorOutcome> => {
    const start = await floorActor(ctx, args);
    if ("refused" in start) return start.refused;
    const { waiter, now } = start;
    if (waiter.menuService.features.occupancy !== true) return { ok: false, code: STAFF_ERROR.occupancyOff };
    const menuServiceId = waiter.menuService._id;
    const position = await ctx.db.get(args.positionId);
    if (!position || position.menuServiceId !== menuServiceId || !position.active) return { ok: false, code: MENU_ERROR.notFound };
    const existing = await ctx.db
      .query("menuPositionOccupancy")
      .withIndex("by_positionId", (q) => q.eq("positionId", position._id))
      .unique();
    if (args.state === null) {
      if (!existing) return { ok: true, changed: false };
      await ctx.db.delete(existing._id);
      return { ok: true, changed: true };
    }
    if (existing && existing.state === args.state) return { ok: true, changed: false };
    const who =
      waiter.actor.kind === "staff"
        ? { updatedByStaffId: waiter.actor.staff._id, updatedByUserId: undefined }
        : { updatedByUserId: waiter.actor.access.user._id, updatedByStaffId: undefined };
    if (existing) {
      await ctx.db.patch(existing._id, { state: args.state, updatedAt: now, ...who });
    } else {
      await ctx.db.insert("menuPositionOccupancy", { menuServiceId, positionId: position._id, state: args.state, updatedAt: now, ...who });
    }
    return { ok: true, changed: true };
  },
});

/**
 * The waiter's OWN active zone (master §9.3: "Konobar može promeniti sopstvenu
 * aktivnu zonu"): a filter of the queue, the floor, the sound and the
 * reminder, never routing. `null` = every zone. Positions without a zone stay
 * visible to everyone. An Owner's or Manager's account keeps its filter on
 * the device (it has no staff row), so it is refused here.
 */
export const setMyZone = mutation({
  args: { ...staffArgs, zoneId: v.union(v.id("menuZones"), v.null()) },
  handler: async (ctx, args): Promise<WaiterFloorOutcome> => {
    const start = await floorActor(ctx, args);
    if ("refused" in start) return start.refused;
    const { waiter, now } = start;
    if (waiter.actor.kind !== "staff") return { ok: false, code: MENU_ERROR.forbidden };
    const zoneId = await zoneArg(ctx, waiter.menuService._id, args.zoneId);
    if (zoneId === undefined) return { ok: false, code: MENU_ERROR.notFound };
    const member = waiter.actor.staff;
    if ((member.activeZoneId ?? null) === zoneId) return { ok: true, changed: false };
    await ctx.db.patch(member._id, { activeZoneId: zoneId ?? undefined, updatedAt: now });
    return { ok: true, changed: true };
  },
});

/**
 * Re-assign another staff member's active zone (master §9.3: "menadžer
 * raspodelu svih konobara"; no automatic proposal). The Owner, a Manager, a
 * ScanMe admin, or a staff member whose panel role is `manager`. Audited.
 */
export const setStaffZone = mutation({
  args: { ...staffArgs, staffId: v.id("menuStaff"), zoneId: v.union(v.id("menuZones"), v.null()) },
  handler: async (ctx, args): Promise<WaiterFloorOutcome> => {
    const start = await floorActor(ctx, args);
    if ("refused" in start) return start.refused;
    const { waiter, now } = start;
    if (!canAssignZones(waiter)) return { ok: false, code: MENU_ERROR.forbidden };
    const menuServiceId = waiter.menuService._id;
    const member = await ctx.db.get(args.staffId);
    if (!member || member.menuServiceId !== menuServiceId || !member.active) return { ok: false, code: MENU_ERROR.notFound };
    const zoneId = await zoneArg(ctx, menuServiceId, args.zoneId);
    if (zoneId === undefined) return { ok: false, code: MENU_ERROR.notFound };
    if ((member.activeZoneId ?? null) === zoneId) return { ok: true, changed: false };
    await ctx.db.patch(member._id, { activeZoneId: zoneId ?? undefined, updatedAt: now });
    const { actor } = waiter;
    await writeMenuAudit(ctx, {
      menuServiceId,
      ...(actor.kind === "staff"
        ? { actorKind: "staff" as const, actorRef: actor.staff._id }
        : { actorKind: actor.access.actor === "admin" ? ("admin" as const) : ("user" as const), actorUserId: actor.access.user._id }),
      action: "staff.zone_assigned",
      entityType: "staff",
      entityKey: member._id,
      details: { zoneId: zoneId ?? null },
    });
    return { ok: true, changed: true };
  },
});

// -----------------------------------------------------------------------------
// Expiry (12 h) and the cron backstop
// -----------------------------------------------------------------------------

/** The scheduled end of one session, at its expiresAt. */
export const expireSession = internalMutation({
  args: { sessionId: v.id("menuStaffSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.endedAt !== undefined) return;
    const now = Date.now();
    if (session.expiresAt > now) return;
    await ctx.db.patch(session._id, { endedAt: session.expiresAt, endReason: "expired" });
  },
});

/**
 * Cron backstop (convex/crons.ts): an expired session whose scheduled end
 * was lost is ended, an expired session that already ended is deleted (so
 * every run makes progress), and PIN counters nobody touched for 12 h 15 min
 * are forgotten (they no longer lock or vouch for anything). Batches; a full
 * batch schedules the next one.
 */
export const sweepExpiredSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("menuStaffSessions")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(SWEEP_BATCH);
    for (const session of sessions) {
      if (session.endedAt === undefined) await ctx.db.patch(session._id, { endedAt: session.expiresAt, endReason: "expired" });
      else await ctx.db.delete(session._id);
    }
    const counters = await ctx.db
      .query("menuPinAttempts")
      .withIndex("by_updatedAt", (q) => q.lt("updatedAt", now - PIN_ATTEMPT_RETENTION_MS))
      .take(SWEEP_BATCH);
    for (const counter of counters) {
      if (counter.lockedUntil !== undefined && counter.lockedUntil > now) continue;
      await ctx.db.delete(counter._id);
    }
    if (sessions.length === SWEEP_BATCH || counters.length === SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.menuWaiter.sweepExpiredSessions, {});
    }
  },
});
