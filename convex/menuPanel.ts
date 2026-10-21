import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getMenuAccess, requireMenuAccessToRow, resolveMenuAccess, type MenuAccess } from "./lib/menuAccess";
import { getMenuCapabilities } from "./lib/menuCapabilities";
import { auditActorKind, loadDraftState, writeMenuAudit } from "./lib/menuDraft";
import { userNameForOthers } from "./lib/menuStaffAccess";
import { rateLimiter } from "./lib/rateLimits";
import { publishStateOf, type DraftPublishState } from "./menuPublishing";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { OPERATIONS_ERROR, type OperationsErrorCode } from "../lib/menu/errors/operations";
import { REQUEST_ERROR } from "../lib/menu/errors/requests";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import {
  MENU_MAX_ACTIVE_REQUESTS,
  MENU_MAX_ARTICLES,
  MENU_MAX_CART_LINES,
  MENU_MAX_PANEL_NOTICES,
  MENU_MAX_PANEL_RESERVATIONS,
  MENU_MAX_PANEL_SESSIONS,
  MENU_MAX_STAFF,
  MENU_MAX_ZONES,
  MENU_PING_COOLDOWN_MS,
  MENU_RESERVATION_PANEL_WINDOW_MS,
} from "../lib/menu/limits";
import { roleCan } from "../lib/menu/permissions";
import type { MenuPaymentPreference, MenuRequestChannel, MenuRequestKind, MenuRequestStatus } from "../lib/menu/request-status";
import { reservationHoldOf } from "../lib/menu/reservation-late";
import type { MenuReservationStatus } from "../lib/menu/reservation-status";
import { panelTimingOf } from "../lib/menu/thresholds";

// =============================================================================
// ScanMe Menu V1 — the client panel shell (K08, master §13.1).
//
// Two small, self-bounded read models (the `clientPanel.venuePanel` shape):
//   - `entry`: does the existing client panel offer "Otvori ScanMe Menu"?
//   - `shellContext`: what the shell needs — the venue, the locked mode (shown,
//     never changed: master §4.1), the caller's role and the plan.
// Identity comes from ctx.auth through the one Menu access helper; the slug
// only names the venue. Neither query throws for access: the shell shows a
// screen for each refusal instead of an error toast. Later sections (K27+)
// add their own queries next to these:
//   K27  home (Početna), operations + requestDetail (Operativa, read-only)
//        and ping (the one quiet reminder to the responsible waiter).
// =============================================================================

/**
 * The ScanMe Menu entry of the existing client panel. `available` only when
 * the venue has an active Menu service the caller may open (`menu.read`);
 * everything else — no service, no role, service switched off, signed out —
 * is `none`, so a venue without ScanMe Menu sees its panel unchanged.
 */
export const entry = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { businessSlug: args.slug }, "menu.read");
    return access ? { status: "available" as const } : { status: "none" as const };
  },
});

/**
 * Everything the panel shell renders around a section.
 *   - `unauthenticated`: sign in first (the existing client panel login).
 *   - `forbidden`: no role here, or no Menu service at this venue — one answer
 *     for both, so the slug is not an oracle for which venues have Menu.
 *   - `inactive`: the caller has a role, but ScanMe switched the service off.
 *   - `available`: the venue, the mode, the actor and the plan. What each
 *     actor sees is decided on the client by lib/menu/panel-nav.ts from the
 *     same permission matrix the backend enforces; every section's own query
 *     checks its permission again.
 */
export const shellContext = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const outcome = await resolveMenuAccess(ctx, { businessSlug: args.slug });
    if (outcome === MENU_ERROR.unauthenticated) return { status: "unauthenticated" as const };
    if (outcome === MENU_ERROR.serviceInactive) return { status: "inactive" as const };
    if (typeof outcome === "string") return { status: "forbidden" as const };

    const { menuService, business } = outcome;
    const capabilities = await getMenuCapabilities(ctx, business._id);
    return {
      status: "available" as const,
      menuServiceId: menuService._id,
      business: { name: business.name, slug: business.slug },
      mode: menuService.mode,
      actor: outcome.actor,
      /** False when ScanMe switched client editing off; the Editor shows it (K10). */
      canEdit: outcome.canEdit,
      plan: capabilities.tier,
    };
  },
});

// =============================================================================
// K27 — Početna and Operativa (master §13.2, §13.5; plan docs/meni/planovi/
// K24.md §4.2–§4.3). Read models for the Owner and Managers: what needs
// attention, what is happening now, who of the staff took what. Nothing here
// accepts, finishes or reassigns a request — the only write is `ping`, one
// quiet reminder to the waiter who took a request.
//
// Like the waiter panel, no query reads the clock: the device passes `fromMs`
// (the start of the current Belgrade hour minus 12 h, `okvirOd` in
// components/menu/konobar/rezervacije/okvir-vremena.ts), so the argument
// changes once an hour; "late", "on shift now" and "today" are computed on
// the device from the timestamps (lib/menu/home-summary.ts,
// lib/menu/operations-view.ts). No response carries a guest contact, a note
// of a reservation or a device pseudonym.
// =============================================================================

type Db = QueryCtx["db"];

/** Active requests (Novi, Prihvaćen) of the venue, oldest first, bounded at 300 per status. */
async function activeRequestsOf(db: Db, menuServiceId: Id<"menuServices">) {
  const read = (status: "new" | "accepted") =>
    db
      .query("menuRequests")
      .withIndex("by_menuServiceId_and_status_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId).eq("status", status))
      .take(MENU_MAX_ACTIVE_REQUESTS + 1);
  const fresh = await read("new");
  const accepted = await read("accepted");
  return {
    rows: [...fresh.slice(0, MENU_MAX_ACTIVE_REQUESTS), ...accepted.slice(0, MENU_MAX_ACTIVE_REQUESTS)],
    truncated: fresh.length > MENU_MAX_ACTIVE_REQUESTS || accepted.length > MENU_MAX_ACTIVE_REQUESTS,
  };
}

export type PanelReservationRow = {
  id: Id<"menuReservations">;
  status: MenuReservationStatus;
  requestedAt: number;
  partySize: number;
  /** The table staff bound it to; null = none yet. */
  positionLabel: string | null;
};

/**
 * The reservations the overview needs, like the waiter panel reads them
 * (convex/menuReservations.ts forPanel): everything that waits for an answer
 * (any date), the accepted ones from `fromMs` for 60 hours and the arrived
 * ones since `fromMs`. No name, contact or note.
 */
async function reservationsOf(db: Db, menuServiceId: Id<"menuServices">, fromMs: number) {
  const limit = MENU_MAX_PANEL_RESERVATIONS + 1;
  const read = (status: MenuReservationStatus, from?: number, to?: number) =>
    db
      .query("menuReservations")
      .withIndex("by_menuServiceId_and_status_and_requestedAt", (q) => {
        const base = q.eq("menuServiceId", menuServiceId).eq("status", status);
        if (from === undefined) return base;
        return to === undefined ? base.gte("requestedAt", from) : base.gte("requestedAt", from).lt("requestedAt", to);
      })
      .take(limit);
  const lists = [
    await read("new"),
    await read("change_proposed"),
    await read("accepted", fromMs, fromMs + MENU_RESERVATION_PANEL_WINDOW_MS),
    await read("arrived", fromMs),
  ];
  const rows: PanelReservationRow[] = lists
    .flatMap((list) => list.slice(0, MENU_MAX_PANEL_RESERVATIONS))
    .map((row) => ({
      id: row._id,
      status: row.status,
      requestedAt: row.requestedAt,
      partySize: row.partySize,
      positionLabel: row.positionLabel ?? null,
    }));
  return { rows, truncated: lists.some((list) => list.length > MENU_MAX_PANEL_RESERVATIONS) };
}

/**
 * PIN sign-ins that may still be live: not ended, expiring after `fromMs`.
 * The device keeps those with `expiresAt` in the future (a session lasts 12 h,
 * so `fromMs` = 12 h back covers every live one). Accounts have no sessions.
 */
async function liveSessionsOf(db: Db, menuServiceId: Id<"menuServices">, fromMs: number) {
  const sessions = await db
    .query("menuStaffSessions")
    .withIndex("by_menuServiceId_and_expiresAt", (q) => q.eq("menuServiceId", menuServiceId).gt("expiresAt", fromMs))
    // Latest expiry first: when the window holds more than the bound, the live ones are the ones kept.
    .order("desc")
    .take(MENU_MAX_PANEL_SESSIONS);
  return sessions.filter((session) => session.endedAt === undefined);
}

function timingOf(menuService: Doc<"menuServices">) {
  return {
    lateThresholdMin: panelTimingOf(menuService.settings?.panel).lateThresholdMin,
    holdMinutes: reservationHoldOf(menuService.settings?.reservation?.holdMinutes),
  };
}

export type PanelHome = {
  /** The menu block (menu.read): the live version and whether the draft differs. */
  menu: {
    state: DraftPublishState;
    liveVersionNumber: number | null;
    livePublishedAt: number | null;
    /** The last saved change of the draft (Pažnja: unpublished for more than 24 h). */
    lastEditAt: number;
  };
  /**
   * Room service articles whose price needs a look after the base price
   * changed (K16). null = Room service is off or not in the plan.
   */
  roomServicePriceWarnings: number | null;
  /** Only with `operations.read` (not for an Urednik). */
  operations: {
    lateThresholdMin: number;
    holdMinutes: number;
    requests: { kind: MenuRequestKind; status: MenuRequestStatus; createdAt: number }[];
    requestsTruncated: boolean;
    reservations: PanelReservationRow[];
    reservationsTruncated: boolean;
    /** Live PIN sign-ins (`expiresAt` > now is checked on the device), one per staff member. */
    staffSessions: { staffId: Id<"menuStaff">; expiresAt: number }[];
  } | null;
  /** The venue mailbox (K26), only with `settings.edit`; "none" = never connected or disconnected. */
  mail: { status: "active" | "error" | "none" } | null;
};

/** One entry per staff member: the session that lasts longest. */
function sessionsPerStaff(sessions: Doc<"menuStaffSessions">[]) {
  const best = new Map<Id<"menuStaff">, Doc<"menuStaffSessions">>();
  for (const session of sessions) {
    const known = best.get(session.staffId);
    if (!known || session.expiresAt > known.expiresAt) best.set(session.staffId, session);
  }
  return [...best.values()];
}

async function roomServiceWarningsOf(ctx: QueryCtx, access: MenuAccess): Promise<number | null> {
  const { menuService, business } = access;
  if (!menuService.features.roomService) return null;
  const capabilities = await getMenuCapabilities(ctx, business._id);
  if (!capabilities.roomService) return null;
  const items = await ctx.db
    .query("menuRoomServiceItems")
    .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuService._id))
    .take(MENU_MAX_ARTICLES);
  return items.filter((item) => item.priceWarning || item.manualVariantPrices?.some((price) => price.priceWarning)).length;
}

/**
 * Početna: what needs attention, what is happening now, the menu status.
 * `menu.read` (an Urednik gets the menu block only); operations need
 * `operations.read`, the mailbox `settings.edit`. null for every refusal.
 */
export const home = query({
  args: { menuServiceId: v.id("menuServices"), fromMs: v.number() },
  handler: async (ctx, args): Promise<PanelHome | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access || !Number.isFinite(args.fromMs)) return null;
    const { menuService } = access;
    const state = await loadDraftState(ctx, menuService._id);
    const live = menuService.liveVersionId ? await ctx.db.get(menuService.liveVersionId) : null;

    let operations: PanelHome["operations"] = null;
    if (roleCan(access.actor, "operations.read")) {
      const requests = await activeRequestsOf(ctx.db, menuService._id);
      const reservations = await reservationsOf(ctx.db, menuService._id, args.fromMs);
      const sessions = await liveSessionsOf(ctx.db, menuService._id, args.fromMs);
      operations = {
        ...timingOf(menuService),
        requests: requests.rows.map((row) => ({ kind: row.kind, status: row.status, createdAt: row.createdAt })),
        requestsTruncated: requests.truncated,
        reservations: reservations.rows,
        reservationsTruncated: reservations.truncated,
        staffSessions: sessionsPerStaff(sessions).map((session) => ({ staffId: session.staffId, expiresAt: session.expiresAt })),
      };
    }

    let mail: PanelHome["mail"] = null;
    if (roleCan(access.actor, "settings.edit")) {
      const connection = await ctx.db
        .query("menuMailConnections")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuService._id))
        .first();
      mail = { status: connection?.status === "active" || connection?.status === "error" ? connection.status : "none" };
    }

    return {
      menu: {
        state: publishStateOf(menuService, state),
        liveVersionNumber: menuService.liveVersionNumber ?? null,
        livePublishedAt: live?.publishedAt ?? null,
        lastEditAt: state.lastEditAt,
      },
      roomServicePriceWarnings: await roomServiceWarningsOf(ctx, access),
      operations,
      mail,
    };
  },
});

export type PanelRequestRow = {
  id: Id<"menuRequests">;
  kind: MenuRequestKind;
  status: MenuRequestStatus;
  channel: MenuRequestChannel;
  positionLabel: string;
  zoneId: Id<"menuZones"> | null;
  zoneName: string | null;
  createdAt: number;
  acceptedAt: number | null;
  paymentPreference: MenuPaymentPreference | null;
  /** Orders: lines and the informative total (whole RSD). */
  itemCount: number | null;
  totalRsd: number | null;
  /** Who took it: a PIN waiter (who can be reminded) or an Owner/Manager account (who cannot). */
  acceptedBy: { kind: "staff"; staffId: Id<"menuStaff">; name: string } | { kind: "account"; name: string } | null;
  /** The last reminder of this request since `fromMs`, and whether the waiter closed it. */
  lastPing: { at: number; seen: boolean } | null;
};

export type PanelOperations = {
  lateThresholdMin: number;
  holdMinutes: number;
  requests: PanelRequestRow[];
  /** More than 300 of one status: the oldest 300 are shown. */
  truncated: boolean;
  reservations: PanelReservationRow[];
  reservationsTruncated: boolean;
  /** Who is signed in to the waiter panel with a PIN (the device keeps `expiresAt` > now). */
  onShift: { staffId: Id<"menuStaff">; name: string; zoneName: string | null; since: number; expiresAt: number }[];
  /** Active zones, in order; empty = the venue does not use zones (no zone filter). */
  zones: { id: Id<"menuZones">; name: string }[];
};

/** Names of the people, read once per distinct id; account names never fall back to an e-mail. */
async function peopleOf(db: Db, menuServiceId: Id<"menuServices">, requests: Doc<"menuRequests">[]) {
  const staff = new Map<Id<"menuStaff">, Doc<"menuStaff"> | null>();
  const users = new Map<Id<"users">, string>();
  const active = await db
    .query("menuStaff")
    .withIndex("by_menuServiceId_and_active", (q) => q.eq("menuServiceId", menuServiceId).eq("active", true))
    .take(MENU_MAX_STAFF);
  for (const member of active) staff.set(member._id, member);
  for (const request of requests) {
    const staffId = request.acceptedByStaffId;
    if (staffId && !staff.has(staffId)) {
      const member = await db.get(staffId);
      staff.set(staffId, member && member.menuServiceId === menuServiceId ? member : null);
    }
    const userId = request.acceptedByUserId;
    if (userId && !users.has(userId)) {
      const user = await db.get(userId);
      users.set(userId, user ? userNameForOthers(user) : "");
    }
  }
  return { staff, users };
}

/**
 * Operativa: the live overview of the venue for the Owner and Managers —
 * active requests and who took them, the reservations around today, who is on
 * shift. Read-only (`operations.read`); null for every refusal.
 */
export const operations = query({
  args: { menuServiceId: v.id("menuServices"), fromMs: v.number() },
  handler: async (ctx, args): Promise<PanelOperations | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "operations.read");
    if (!access || !Number.isFinite(args.fromMs)) return null;
    const { menuService } = access;
    const menuServiceId = menuService._id;

    const requests = await activeRequestsOf(ctx.db, menuServiceId);
    const reservations = await reservationsOf(ctx.db, menuServiceId, args.fromMs);
    const sessions = sessionsPerStaff(await liveSessionsOf(ctx.db, menuServiceId, args.fromMs));
    const zoneRows = await ctx.db
      .query("menuZones")
      .withIndex("by_menuServiceId_and_active_and_order", (q) => q.eq("menuServiceId", menuServiceId).eq("active", true))
      .take(MENU_MAX_ZONES);
    const zoneNames = new Map<Id<"menuZones">, string>(zoneRows.map((zone) => [zone._id, zone.name]));
    const { staff, users } = await peopleOf(ctx.db, menuServiceId, requests.rows);

    const pings = new Map<Id<"menuRequests">, { at: number; seen: boolean }>();
    const notices = await ctx.db
      .query("menuStaffNotices")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId).gte("createdAt", args.fromMs))
      .order("desc")
      .take(MENU_MAX_PANEL_NOTICES);
    for (const notice of notices) {
      if (!pings.has(notice.requestId)) pings.set(notice.requestId, { at: notice.createdAt, seen: notice.seenAt !== undefined });
    }

    const onShift: PanelOperations["onShift"] = [];
    for (const session of sessions) {
      const member = staff.get(session.staffId) ?? (await ctx.db.get(session.staffId));
      if (!member || member.menuServiceId !== menuServiceId || !member.active) continue;
      onShift.push({
        staffId: member._id,
        name: member.displayName,
        zoneName: member.activeZoneId ? (zoneNames.get(member.activeZoneId) ?? null) : null,
        since: session.createdAt,
        expiresAt: session.expiresAt,
      });
    }
    onShift.sort((a, b) => a.since - b.since);

    return {
      ...timingOf(menuService),
      requests: requests.rows.map((request) => {
        const member = request.acceptedByStaffId ? staff.get(request.acceptedByStaffId) : null;
        const acceptedBy: PanelRequestRow["acceptedBy"] = request.acceptedByStaffId
          ? { kind: "staff", staffId: request.acceptedByStaffId, name: member?.displayName ?? "" }
          : request.acceptedByUserId
            ? { kind: "account", name: users.get(request.acceptedByUserId) ?? "" }
            : null;
        return {
          id: request._id,
          kind: request.kind,
          status: request.status,
          channel: request.channel,
          positionLabel: request.positionLabel,
          zoneId: request.zoneId ?? null,
          zoneName: request.zoneId ? (zoneNames.get(request.zoneId) ?? null) : null,
          createdAt: request.createdAt,
          acceptedAt: request.acceptedAt ?? null,
          paymentPreference: request.paymentPreference ?? null,
          itemCount: request.kind === "order" ? (request.itemCount ?? null) : null,
          totalRsd: request.kind === "order" ? (request.totalRsd ?? null) : null,
          acceptedBy,
          lastPing: pings.get(request._id) ?? null,
        };
      }),
      truncated: requests.truncated,
      reservations: reservations.rows,
      reservationsTruncated: reservations.truncated,
      onShift,
      zones: zoneRows.map((zone) => ({ id: zone._id, name: zone.name })),
    };
  },
});

export type PanelRequestDetail = {
  /** The card the guest scanned, as it was named when the request was sent. */
  sourceLabel: string | null;
  subtotalRsd: number | null;
  deliveryFeeRsd: number | null;
  items: {
    name: string;
    variantName: string | null;
    addons: string[];
    quantity: number;
    lineTotalRsd: number;
    note: string | null;
  }[];
};

/** What the read-only detail of Operativa adds to a row (an order's lines); a temporary subscription while open. */
export const requestDetail = query({
  args: { menuServiceId: v.id("menuServices"), requestId: v.id("menuRequests") },
  handler: async (ctx, args): Promise<PanelRequestDetail | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "operations.read");
    if (!access) return null;
    const request = await ctx.db.get(args.requestId);
    if (!request || request.menuServiceId !== access.menuService._id) return null;
    const items = await ctx.db
      .query("menuRequestItems")
      .withIndex("by_requestId", (q) => q.eq("requestId", request._id))
      .take(MENU_MAX_CART_LINES);
    return {
      sourceLabel: request.sourceLabel ?? null,
      subtotalRsd: request.subtotalRsd ?? null,
      deliveryFeeRsd: request.deliveryFeeRsd ?? null,
      items: items
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          name: item.name,
          variantName: item.variantName ?? null,
          addons: item.addons.map((addon) => addon.optionName),
          quantity: item.quantity,
          lineTotalRsd: item.lineTotalRsd,
          note: item.note ?? null,
        })),
    };
  },
});

export type PanelPingOutcome =
  | { ok: true; sentAt: number }
  | {
      ok: false;
      code: OperationsErrorCode | typeof REQUEST_ERROR.notFound | typeof STAFF_ERROR.rateLimited;
      /** `ping/too_soon`: when the last reminder was sent. */
      lastAt?: number;
    };

/**
 * "Podseti konobara": one quiet reminder to the PIN waiter who took the
 * request (K24-20) — never to an account, never for a new or finished
 * request, at most one per request per 5 minutes. Nothing is reassigned and
 * no status changes. Access is thrown (like every panel mutation); the
 * outcome is a value. Audited as `operations.ping`.
 */
export const ping = mutation({
  args: { menuServiceId: v.id("menuServices"), requestId: v.id("menuRequests") },
  handler: async (ctx, args): Promise<PanelPingOutcome> => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "operations.read");
    const now = Date.now();
    const request = await ctx.db.get(args.requestId);
    if (!request || request.menuServiceId !== access.menuService._id) return { ok: false, code: REQUEST_ERROR.notFound };
    const staffId = request.acceptedByStaffId;
    if (request.status !== "accepted" || !staffId) return { ok: false, code: OPERATIONS_ERROR.noResponsible };
    const member = await ctx.db.get(staffId);
    if (!member || member.menuServiceId !== request.menuServiceId || !member.active) {
      return { ok: false, code: OPERATIONS_ERROR.noResponsible };
    }
    const last = await ctx.db
      .query("menuStaffNotices")
      .withIndex("by_requestId_and_createdAt", (q) => q.eq("requestId", request._id))
      .order("desc")
      .first();
    if (last && now - last.createdAt < MENU_PING_COOLDOWN_MS) {
      return { ok: false, code: OPERATIONS_ERROR.tooSoon, lastAt: last.createdAt };
    }
    const bucket = await rateLimiter.limit(ctx, "menuStaffAction", { key: `ping:user:${access.user._id}` });
    if (!bucket.ok) return { ok: false, code: STAFF_ERROR.rateLimited };

    await ctx.db.insert("menuStaffNotices", {
      menuServiceId: request.menuServiceId,
      staffId,
      kind: "ping",
      requestId: request._id,
      createdByUserId: access.user._id,
      createdAt: now,
    });
    await writeMenuAudit(ctx, {
      menuServiceId: request.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "operations.ping",
      entityType: "menuRequests",
      entityKey: request._id,
      details: { staffId },
    });
    return { ok: true, sentAt: now };
  },
});
