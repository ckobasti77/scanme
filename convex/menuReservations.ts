import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { activeMenuServiceForBusiness } from "./lib/menuAccess";
import { zabeleziDogadjaj } from "./lib/menuAnalytics";
import { menuReservationStatusValidator } from "./lib/menuDomainValidators";
import { menuIpKey } from "./lib/menuGateway";
import { applyReservationAction, type ReservationActorDoc } from "./lib/menuReservationWriter";
import {
  loadMenuStaff,
  userNameForOthers,
  waiterActorRef,
  type MenuStaffActor,
  type MenuWaiter,
} from "./lib/menuStaffAccess";
import { rateLimiter } from "./lib/rateLimits";
import { activeBusinessBySlug } from "./menuPublic";
import { RESERVATION_ERROR, type ReservationErrorCode } from "../lib/menu/errors/reservations";
import { STAFF_ERROR, type StaffErrorCode } from "../lib/menu/errors/waiter";
import {
  MENU_MAX_MY_RESERVATIONS,
  MENU_MAX_OPEN_RESERVATIONS_PER_DEVICE,
  MENU_MAX_PANEL_RESERVATIONS,
  MENU_MAX_RECENT_CANCELLED_RESERVATIONS,
  MENU_MAX_RESERVATIONS_ON_POSITION,
  MENU_RESERVATION_PANEL_WINDOW_MS,
  MENU_TEXT,
} from "../lib/menu/limits";
import {
  acceptsFormRequests,
  publicReservationEntry,
  reservationConfigOf,
  type PublicReservationEntry,
  type ReservationMode,
} from "../lib/menu/reservation-config";
import { parseReservationForm, type ReservationFieldErrors } from "../lib/menu/reservation-form";
import type { ReservationRow } from "../lib/menu/reservation-queue";
import {
  canBindPosition,
  isOpenReservationStatus,
  type MenuReservationStatus,
  type ReservationAction,
} from "../lib/menu/reservation-status";
import { deviceKeyHashFor, isMenuToken, reservationCancelTokenHash } from "../lib/menu/tokens";
import { RESERVATION_MAX_DAYS_AHEAD } from "../lib/menu/working-hours";

// =============================================================================
// ScanMe Menu V1 (K25) — reservations, a function of the Menu service (master
// §11, §21.5; plan docs/meni/planovi/K24.md §2). Separate from the Venue
// product's reservations (convex/venueReservations.ts), which this module
// never reads or writes.
//
//   guest      publicEntry (form, the venue's own system, or nothing),
//              submit (the ScanMe form; called by the Next server action
//              with the device cookie and an IP hash), byCancelToken and
//              cancelByToken (the link /[slug]/meni/rezervacija/[token]),
//              mine and cancelByDevice ("Moji zahtevi").
//   staff      forPanel (ONE subscription per device: what waits for an
//              answer, the accepted ones in the window, the arrived and the
//              recently cancelled — no contact), detail (while open: the
//              contact and the note), accept, decline, proposeChange,
//              acceptProposal, bindPosition, markArrived, cancelByStaff.
//
// The guest never chooses a table: no guest function takes a position. Staff
// bind an accepted reservation to a table by hand and mark the arrival; only
// then, and only when the venue uses the occupancy module, the table becomes
// occupied (K24-12). There is no default duration, no automatic cancellation
// and nothing scheduled. Refusals are values, never throws, so a spent rate
// bucket stays spent. No query reads the clock (the panel passes `fromMs`).
// The cancel token is stored only as its hash; no response carries a token,
// a hash or the guest's device pseudonym.
// =============================================================================

const DEVICE_KEY_PATTERN = /^[0-9a-f]{64}$/;
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Raw strings longer than this are refused before anything is read (the form allows far less). */
const RAW_TEXT_MAX = 2000;

type Served = { business: Doc<"businesses">; menuService: Doc<"menuServices"> };

/** The venue of a public slug and its active Menu service (an active ScanMe Menu profile), or null. */
async function servedBySlug(ctx: QueryCtx | MutationCtx, slug: string): Promise<Served | null> {
  const business = await activeBusinessBySlug(ctx, slug);
  if (!business) return null;
  const menuService = await activeMenuServiceForBusiness(ctx, business._id);
  if (!menuService) return null;
  const profile = menuService.serviceProfileId ? await ctx.db.get(menuService.serviceProfileId) : null;
  if (!profile || profile.status !== "active" || profile.businessId !== business._id) return null;
  return { business, menuService };
}

const configOf = (menuService: Doc<"menuServices">) => reservationConfigOf(menuService.features, menuService.settings);

// -----------------------------------------------------------------------------
// The guest
// -----------------------------------------------------------------------------

/** How the public menu offers reservations: the ScanMe form, the venue's own system, or nothing. */
export const publicEntry = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<PublicReservationEntry> => {
    const served = await servedBySlug(ctx, args.slug);
    return served ? publicReservationEntry(configOf(served.menuService)) : { mode: "off" };
  },
});

export type ReservationSubmitOutcome =
  | {
      ok: true;
      reservationId: Id<"menuReservations">;
      requestedAt: number;
      partySize: number;
      /** A retry of the same send attempt: the reservation written before (its cancel link is now the new token). */
      deduped: boolean;
    }
  | { ok: false; code: ReservationErrorCode; fieldErrors?: ReservationFieldErrors };

const refused = (code: ReservationErrorCode) => ({ ok: false as const, code });

/**
 * The guest's request (master §11.2): name, time, number of guests, the
 * contact the venue asks for, an optional note. No table. Public because the
 * Next server action calls it over HTTP; the device token and the cancel
 * token come from that server, never from the page. Checks the form with the
 * same rules as the phone, then three buckets (the IP, the device, the
 * venue) and at most three open requests per device. Nothing promises a free
 * table: the venue answers.
 */
export const submit = mutation({
  args: {
    slug: v.string(),
    deviceToken: v.string(),
    clientRequestId: v.string(),
    cancelToken: v.string(),
    guestName: v.string(),
    partySize: v.number(),
    requestedAt: v.number(),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    note: v.optional(v.string()),
    // A rate-limit key only; absent or untrusted → one shared bucket (K33: convex/lib/menuGateway.ts).
    ipHash: v.optional(v.string()),
    // K33: MENU_GATEWAY_SECRET of the Next handler; with it set on the
    // deployment, the ipHash counts only together with it.
    gateway: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ReservationSubmitOutcome> => {
    if (
      !isMenuToken(args.deviceToken) ||
      !isMenuToken(args.cancelToken) ||
      !CLIENT_REQUEST_ID_PATTERN.test(args.clientRequestId) ||
      [args.guestName, args.contactEmail ?? "", args.contactPhone ?? "", args.note ?? ""].some((text) => text.length > RAW_TEXT_MAX)
    ) {
      return refused(RESERVATION_ERROR.invalidInput);
    }
    const now = Date.now();
    const served = await servedBySlug(ctx, args.slug);
    if (!served) return refused(RESERVATION_ERROR.off);
    const config = configOf(served.menuService);
    if (!acceptsFormRequests(config)) return refused(RESERVATION_ERROR.off);
    const menuServiceId = served.menuService._id;
    const deviceKeyHash = await deviceKeyHashFor(menuServiceId, args.deviceToken);
    const cancelTokenHash = await reservationCancelTokenHash(args.cancelToken);

    // The same send attempt again (an answer lost on the way): the reservation already written.
    const earlier = await ctx.db
      .query("menuReservations")
      .withIndex("by_menuServiceId_and_deviceKeyHash_and_clientRequestId", (q) =>
        q.eq("menuServiceId", menuServiceId).eq("deviceKeyHash", deviceKeyHash).eq("clientRequestId", args.clientRequestId),
      )
      .first();
    if (earlier) {
      // The guest never saw the first link: the new token replaces it while the request is still
      // open (never a token another reservation already has; then the old link stays).
      if (isOpenReservationStatus(earlier.status) && earlier.cancelTokenHash !== cancelTokenHash) {
        const clash = await ctx.db
          .query("menuReservations")
          .withIndex("by_cancelTokenHash", (q) => q.eq("cancelTokenHash", cancelTokenHash))
          .first();
        if (clash) return refused(RESERVATION_ERROR.invalidInput);
        await ctx.db.patch(earlier._id, { cancelTokenHash, updatedAt: now });
      }
      return { ok: true, reservationId: earlier._id, requestedAt: earlier.requestedAt, partySize: earlier.partySize, deduped: true };
    }

    const parsed = parseReservationForm(args, config.contact, config.workingHours, now);
    if (!parsed.ok) return { ok: false, code: parsed.code, fieldErrors: parsed.fieldErrors };

    if (!(await rateLimiter.limit(ctx, "menuReservationIp", { key: menuIpKey(args.ipHash, args.gateway) })).ok) {
      return refused(RESERVATION_ERROR.rateLimited);
    }
    if (!(await rateLimiter.limit(ctx, "menuReservationDevice", { key: deviceKeyHash })).ok) {
      return refused(RESERVATION_ERROR.rateLimited);
    }
    if (!(await rateLimiter.limit(ctx, "menuReservationService", { key: menuServiceId })).ok) {
      return refused(RESERVATION_ERROR.rateLimited);
    }

    const recent = await ctx.db
      .query("menuReservations")
      .withIndex("by_menuServiceId_and_deviceKeyHash_and_createdAt", (q) =>
        q.eq("menuServiceId", menuServiceId).eq("deviceKeyHash", deviceKeyHash),
      )
      .order("desc")
      .take(MENU_MAX_OPEN_RESERVATIONS_PER_DEVICE * 10);
    const open = recent.filter((row) => isOpenReservationStatus(row.status) && row.requestedAt > now).length;
    if (open >= MENU_MAX_OPEN_RESERVATIONS_PER_DEVICE) return refused(RESERVATION_ERROR.tooManyOpen);

    // The venue's unanswered requests stay fewer than the panel reads, so a flood can never push a
    // real request out of the waiters' list (security review K25): the next one waits for answers.
    const unanswered = await ctx.db
      .query("menuReservations")
      .withIndex("by_menuServiceId_and_status_and_requestedAt", (q) => q.eq("menuServiceId", menuServiceId).eq("status", "new"))
      .take(MENU_MAX_PANEL_RESERVATIONS);
    if (unanswered.length >= MENU_MAX_PANEL_RESERVATIONS) return refused(RESERVATION_ERROR.rateLimited);

    const taken = await ctx.db
      .query("menuReservations")
      .withIndex("by_cancelTokenHash", (q) => q.eq("cancelTokenHash", cancelTokenHash))
      .first();
    if (taken) return refused(RESERVATION_ERROR.invalidInput);

    const { value } = parsed;
    const reservationId = await ctx.db.insert("menuReservations", {
      menuServiceId,
      businessId: served.business._id,
      status: "new",
      guestName: value.guestName,
      partySize: value.partySize,
      requestedAt: value.requestedAt,
      ...(value.contactEmail ? { contactEmail: value.contactEmail } : {}),
      ...(value.contactPhone ? { contactPhone: value.contactPhone } : {}),
      ...(value.note ? { note: value.note } : {}),
      cancelTokenHash,
      deviceKeyHash,
      clientRequestId: args.clientRequestId,
      createdAt: now,
      updatedAt: now,
    });
    // K29: a new reservation request (a deduped repeat returned above).
    await zabeleziDogadjaj(ctx, menuServiceId, { vrsta: "rezervacija_poslata" }, now);
    return { ok: true, reservationId, requestedAt: value.requestedAt, partySize: value.partySize, deduped: false };
  },
});

/** What the cancel link shows (K24-6): no name, no contact, no note of the guest, no table. */
export type ReservationLinkView = {
  businessName: string;
  status: MenuReservationStatus;
  requestedAt: number;
  partySize: number;
  /** A change the venue proposed (only while it waits for the guest's answer). */
  proposedAt: number | null;
  proposalNote: string | null;
  canCancel: boolean;
};

/** The reservation behind a cancel token of this venue, or null (a wrong token, slug or venue look the same). */
async function byToken(ctx: QueryCtx | MutationCtx, slug: string, token: string): Promise<{ served: Served; reservation: Doc<"menuReservations"> } | null> {
  if (!isMenuToken(token)) return null;
  const served = await servedBySlug(ctx, slug);
  if (!served) return null;
  const tokenHash = await reservationCancelTokenHash(token);
  const reservation = await ctx.db
    .query("menuReservations")
    .withIndex("by_cancelTokenHash", (q) => q.eq("cancelTokenHash", tokenHash))
    .first();
  if (!reservation || reservation.menuServiceId !== served.menuService._id) return null;
  return { served, reservation };
}

/** The page of the cancel link: the reservation in a few words, or null ("Link nije važeći"). */
export const byCancelToken = query({
  args: { slug: v.string(), token: v.string() },
  handler: async (ctx, args): Promise<ReservationLinkView | null> => {
    const found = await byToken(ctx, args.slug, args.token);
    if (!found) return null;
    const { reservation } = found;
    const proposed = reservation.status === "change_proposed";
    return {
      businessName: found.served.business.name,
      status: reservation.status,
      requestedAt: reservation.requestedAt,
      partySize: reservation.partySize,
      proposedAt: proposed ? (reservation.proposedAt ?? null) : null,
      proposalNote: proposed ? (reservation.proposalNote ?? null) : null,
      canCancel: isOpenReservationStatus(reservation.status),
    };
  },
});

export type GuestReservationCancelOutcome = { ok: true; status: MenuReservationStatus } | { ok: false; code: ReservationErrorCode };

async function guestCancel(ctx: MutationCtx, reservation: Doc<"menuReservations">): Promise<GuestReservationCancelOutcome> {
  const result = await applyReservationAction(ctx, reservation, "cancel", { kind: "guest" }, Date.now());
  return result.ok ? { ok: true, status: result.status } : result;
}

/** The guest cancels through the link, until the reservation is realized (master §11.7). */
export const cancelByToken = mutation({
  args: {
    slug: v.string(),
    token: v.string(),
    ipHash: v.optional(v.string()),
    // K33: MENU_GATEWAY_SECRET of the Next handler (convex/lib/menuGateway.ts).
    gateway: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GuestReservationCancelOutcome> => {
    if (!isMenuToken(args.token)) return refused(RESERVATION_ERROR.notFound);
    if (!(await rateLimiter.limit(ctx, "menuReservationCancel", { key: menuIpKey(args.ipHash, args.gateway) })).ok) {
      return refused(RESERVATION_ERROR.rateLimited);
    }
    const found = await byToken(ctx, args.slug, args.token);
    if (!found) return refused(RESERVATION_ERROR.notFound);
    return await guestCancel(ctx, found.reservation);
  },
});

/** One of the guest's own reservations as "Moji zahtevi" shows it. */
export type MyReservation = {
  id: Id<"menuReservations">;
  status: MenuReservationStatus;
  requestedAt: number;
  partySize: number;
  createdAt: number;
  proposedAt: number | null;
  proposalNote: string | null;
  decidedAt: number | null;
  arrivedAt: number | null;
  cancelledAt: number | null;
  cancelledBy: "guest" | "staff" | null;
};

/**
 * "Moji zahtevi" (master §11.7): this device's newest reservations in this
 * venue. `deviceKey` is the device's venue-scoped hash (a READ key, the page
 * derives it from the HttpOnly device cookie); cancelling needs the device
 * token itself. No table, no staff names, no contact.
 */
export const mine = query({
  args: { slug: v.string(), deviceKey: v.string() },
  handler: async (ctx, args): Promise<MyReservation[] | null> => {
    if (!DEVICE_KEY_PATTERN.test(args.deviceKey)) return null;
    const served = await servedBySlug(ctx, args.slug);
    if (!served) return null;
    const rows = await ctx.db
      .query("menuReservations")
      .withIndex("by_menuServiceId_and_deviceKeyHash_and_createdAt", (q) =>
        q.eq("menuServiceId", served.menuService._id).eq("deviceKeyHash", args.deviceKey),
      )
      .order("desc")
      .take(MENU_MAX_MY_RESERVATIONS);
    return rows.map((row) => {
      const proposed = row.status === "change_proposed";
      return {
        id: row._id,
        status: row.status,
        requestedAt: row.requestedAt,
        partySize: row.partySize,
        createdAt: row.createdAt,
        proposedAt: proposed ? (row.proposedAt ?? null) : null,
        proposalNote: proposed ? (row.proposalNote ?? null) : null,
        decidedAt: row.decidedAt ?? null,
        arrivedAt: row.arrivedAt ?? null,
        cancelledAt: row.cancelledAt ?? null,
        cancelledBy: row.cancelledBy ?? null,
      };
    });
  },
});

/** The guest cancels from "Moji zahtevi": the device token proves the reservation is theirs. */
export const cancelByDevice = mutation({
  args: {
    slug: v.string(),
    deviceToken: v.string(),
    reservationId: v.string(),
    ipHash: v.optional(v.string()),
    // K33: MENU_GATEWAY_SECRET of the Next handler (convex/lib/menuGateway.ts).
    gateway: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GuestReservationCancelOutcome> => {
    if (!isMenuToken(args.deviceToken)) return refused(RESERVATION_ERROR.notFound);
    if (!(await rateLimiter.limit(ctx, "menuReservationCancel", { key: menuIpKey(args.ipHash, args.gateway) })).ok) {
      return refused(RESERVATION_ERROR.rateLimited);
    }
    const served = await servedBySlug(ctx, args.slug);
    const reservationId = ctx.db.normalizeId("menuReservations", args.reservationId);
    if (!served || !reservationId) return refused(RESERVATION_ERROR.notFound);
    const reservation = await ctx.db.get(reservationId);
    const deviceKeyHash = await deviceKeyHashFor(served.menuService._id, args.deviceToken);
    if (!reservation || reservation.menuServiceId !== served.menuService._id || reservation.deviceKeyHash !== deviceKeyHash) {
      return refused(RESERVATION_ERROR.notFound);
    }
    return await guestCancel(ctx, reservation);
  },
});

// -----------------------------------------------------------------------------
// The waiter panel
// -----------------------------------------------------------------------------

const staffArgs = { slug: v.string(), panelCode: v.string(), sessionToken: v.optional(v.string()) };

/** A reservation in the waiter's list (lib/menu/reservation-queue.ts ReservationRow with a typed id). */
export type WaiterReservationRow = ReservationRow & { id: Id<"menuReservations"> };

export type WaiterReservations = {
  rows: WaiterReservationRow[];
  /** More than 200 of one status in the window: the earliest 200 are shown. */
  truncated: boolean;
  /** How the venue takes reservations now (existing ones stay workable after a switch, K24-16). */
  mode: ReservationMode;
  /** How long the venue holds a reservation after its time (minutes). */
  holdMinutes: number;
};

function toRow(row: Doc<"menuReservations">): WaiterReservationRow {
  return {
    id: row._id,
    status: row.status,
    guestName: row.guestName,
    partySize: row.partySize,
    requestedAt: row.requestedAt,
    createdAt: row.createdAt,
    positionId: row.positionId ?? null,
    positionLabel: row.positionId ? (row.positionLabel ?? null) : null,
    hasNote: Boolean(row.note),
    proposedAt: row.proposedAt ?? null,
    arrivedAt: row.arrivedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    cancelledBy: row.cancelledBy ?? null,
  };
}

/**
 * The reservations of the venue for the waiter panel: ONE subscription per
 * device (plan K19-17, the fourth). Everything that waits for an answer (any
 * date), the accepted ones from `fromMs` for 60 hours, the arrived and the
 * recently cancelled ones. `fromMs` comes from the device (the start of the
 * current hour minus 12 h), so the query never reads the clock and changes
 * once an hour. Bounded; no contact, no note text, no device pseudonym.
 */
export const forPanel = query({
  args: { ...staffArgs, fromMs: v.number() },
  handler: async (ctx, args): Promise<WaiterReservations | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter || !Number.isFinite(args.fromMs)) return null;
    const menuServiceId = waiter.menuService._id;
    const limit = MENU_MAX_PANEL_RESERVATIONS + 1;
    const withStatus = (status: MenuReservationStatus, from?: number, to?: number) =>
      ctx.db
        .query("menuReservations")
        .withIndex("by_menuServiceId_and_status_and_requestedAt", (q) => {
          const base = q.eq("menuServiceId", menuServiceId).eq("status", status);
          if (from === undefined) return base;
          return to === undefined ? base.gte("requestedAt", from) : base.gte("requestedAt", from).lt("requestedAt", to);
        })
        .take(limit);
    const fresh = await withStatus("new");
    const proposed = await withStatus("change_proposed");
    const accepted = await withStatus("accepted", args.fromMs, args.fromMs + MENU_RESERVATION_PANEL_WINDOW_MS);
    const arrived = await withStatus("arrived", args.fromMs);
    const cancelled = await ctx.db
      .query("menuReservations")
      .withIndex("by_menuServiceId_and_cancelledAt", (q) => q.eq("menuServiceId", menuServiceId).gte("cancelledAt", args.fromMs))
      .order("desc")
      .take(MENU_MAX_RECENT_CANCELLED_RESERVATIONS);
    const lists = [fresh, proposed, accepted, arrived];
    const truncated = lists.some((list) => list.length > MENU_MAX_PANEL_RESERVATIONS);
    const rows = [...lists.flatMap((list) => list.slice(0, MENU_MAX_PANEL_RESERVATIONS)), ...cancelled].map(toRow);
    const config = configOf(waiter.menuService);
    return { rows, truncated, mode: config.mode, holdMinutes: config.holdMinutes };
  },
});

export type WaiterReservationDetail = {
  reservation: WaiterReservationRow & {
    contactEmail: string | null;
    contactPhone: string | null;
    note: string | null;
    proposalNote: string | null;
    decidedAt: number | null;
    decidedBy: string | null;
    boundBy: string | null;
    arrivedBy: string | null;
    cancelledByName: string | null;
  };
  /** Other reservations of the same table that day (accepted or arrived), earliest first. */
  sameTable: WaiterReservationRow[];
};

async function personName(
  ctx: QueryCtx,
  menuServiceId: Id<"menuServices">,
  staffId: Id<"menuStaff"> | undefined,
  userId: Id<"users"> | undefined,
): Promise<string | null> {
  if (staffId) {
    const member = await ctx.db.get(staffId);
    return member && member.menuServiceId === menuServiceId ? member.displayName : null;
  }
  if (userId) {
    const user = await ctx.db.get(userId);
    return user ? userNameForOthers(user) : null;
  }
  return null;
}

/** One reservation with what the decision needs (the contact, the note); a temporary subscription while open. */
export const detail = query({
  args: { ...staffArgs, reservationId: v.id("menuReservations") },
  handler: async (ctx, args): Promise<WaiterReservationDetail | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter) return null;
    const row = await ctx.db.get(args.reservationId);
    const menuServiceId = waiter.menuService._id;
    if (!row || row.menuServiceId !== menuServiceId) return null;
    let sameTable: WaiterReservationRow[] = [];
    if (row.positionId) {
      const others = await ctx.db
        .query("menuReservations")
        .withIndex("by_positionId_and_requestedAt", (q) =>
          q.eq("positionId", row.positionId).gte("requestedAt", row.requestedAt - DAY_MS / 2).lt("requestedAt", row.requestedAt + DAY_MS / 2),
        )
        .take(MENU_MAX_RESERVATIONS_ON_POSITION);
      sameTable = others
        .filter((other) => other._id !== row._id && other.menuServiceId === menuServiceId && (other.status === "accepted" || other.status === "arrived"))
        .map(toRow);
    }
    return {
      reservation: {
        ...toRow(row),
        contactEmail: row.contactEmail ?? null,
        contactPhone: row.contactPhone ?? null,
        note: row.note ?? null,
        proposalNote: row.proposalNote ?? null,
        decidedAt: row.decidedAt ?? null,
        decidedBy: await personName(ctx, menuServiceId, row.decidedByStaffId, row.decidedByUserId),
        boundBy: await personName(ctx, menuServiceId, row.boundByStaffId, row.boundByUserId),
        arrivedBy: await personName(ctx, menuServiceId, row.arrivedByStaffId, row.arrivedByUserId),
        cancelledByName: await personName(ctx, menuServiceId, row.cancelledByStaffId, row.cancelledByUserId),
      },
      sameTable,
    };
  },
});

export type WaiterReservationOutcome =
  | { ok: true; status: MenuReservationStatus; changed: boolean }
  | { ok: false; code: ReservationErrorCode | StaffErrorCode; status?: MenuReservationStatus };

function actorDoc(actor: MenuStaffActor): ReservationActorDoc {
  return actor.kind === "staff" ? { kind: "staff", staffId: actor.staff._id } : { kind: "user", userId: actor.access.user._id };
}

type StaffStart =
  | { refused: WaiterReservationOutcome }
  | { waiter: MenuWaiter; reservation: Doc<"menuReservations">; now: number };

/** Who acts (a mutation clock: an expired session is refused), one token of the action bucket, the reservation of this venue. */
async function staffStart(
  ctx: MutationCtx,
  args: { slug: string; panelCode: string; sessionToken?: string; reservationId: Id<"menuReservations">; expectedStatus?: MenuReservationStatus },
): Promise<StaffStart> {
  const now = Date.now();
  const waiter = await loadMenuStaff(ctx, args, now);
  if (!waiter) return { refused: { ok: false, code: STAFF_ERROR.signedOut } };
  const bucket = await rateLimiter.limit(ctx, "menuStaffAction", {
    key: waiter.actor.kind === "staff" ? `session:${waiter.actor.session._id}` : waiterActorRef(waiter.actor),
  });
  if (!bucket.ok) return { refused: { ok: false, code: STAFF_ERROR.rateLimited } };
  const reservation = await ctx.db.get(args.reservationId);
  if (!reservation || reservation.menuServiceId !== waiter.menuService._id) {
    return { refused: { ok: false, code: RESERVATION_ERROR.notFound } };
  }
  if (args.expectedStatus !== undefined && reservation.status !== args.expectedStatus) {
    return { refused: { ok: false, code: RESERVATION_ERROR.statusChanged, status: reservation.status } };
  }
  return { waiter, reservation, now };
}

async function staffAct(
  ctx: MutationCtx,
  args: { slug: string; panelCode: string; sessionToken?: string; reservationId: Id<"menuReservations">; expectedStatus?: MenuReservationStatus },
  action: ReservationAction,
  proposal?: { proposedAt: number; proposalNote: string | null },
): Promise<WaiterReservationOutcome> {
  const start = await staffStart(ctx, args);
  if ("refused" in start) return start.refused;
  const { waiter, reservation, now } = start;
  const result = await applyReservationAction(ctx, reservation, action, actorDoc(waiter.actor), now, proposal);
  return result.ok ? result : { ok: false, code: result.code, status: reservation.status };
}

const actionArgs = {
  ...staffArgs,
  reservationId: v.id("menuReservations"),
  // What the waiter saw; when the reservation moved meanwhile (the guest cancelled), nothing is written.
  expectedStatus: v.optional(menuReservationStatusValidator),
};

/** `Prihvati` (master §11.3): staff judged by hand that a table can be found. Nothing is promised automatically. */
export const accept = mutation({
  args: actionArgs,
  handler: async (ctx, args) => await staffAct(ctx, args, "accept"),
});

/** `Odbij` a new request (or a proposal the guest did not take). Audited. */
export const decline = mutation({
  args: actionArgs,
  handler: async (ctx, args) => await staffAct(ctx, args, "decline"),
});

/**
 * `Predloži izmenu`: another time and a short message for the guest; the
 * staff then tell the guest (e-mail, phone). The proposed time is in the
 * future and at most 60 days ahead.
 */
export const proposeChange = mutation({
  args: { ...actionArgs, proposedAt: v.number(), proposalNote: v.optional(v.string()) },
  handler: async (ctx, args): Promise<WaiterReservationOutcome> => {
    const now = Date.now();
    const note = (args.proposalNote ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isInteger(args.proposedAt) || args.proposedAt <= now) return { ok: false, code: RESERVATION_ERROR.inPast };
    if (args.proposedAt > now + RESERVATION_MAX_DAYS_AHEAD * DAY_MS) return { ok: false, code: RESERVATION_ERROR.tooFar };
    if (note.length > MENU_TEXT.reservationProposalNote) return { ok: false, code: RESERVATION_ERROR.invalidInput };
    return await staffAct(ctx, args, "propose", { proposedAt: args.proposedAt, proposalNote: note.length > 0 ? note : null });
  },
});

/** `Gost prihvata predlog` (K24-4): the guest agreed by phone or e-mail; the proposed time becomes the time. */
export const acceptProposal = mutation({
  args: actionArgs,
  handler: async (ctx, args) => await staffAct(ctx, args, "acceptProposal"),
});

/** `Otkaži rezervaciju` (after the waiter confirmed): an accepted or proposed reservation. Audited. */
export const cancelByStaff = mutation({
  args: actionArgs,
  handler: async (ctx, args) => await staffAct(ctx, args, "cancel"),
});

/** An active table (position) of this venue, or null. */
async function activePosition(ctx: MutationCtx, menuServiceId: Id<"menuServices">, positionId: Id<"menuPositions">) {
  const position = await ctx.db.get(positionId);
  return position && position.menuServiceId === menuServiceId && position.active ? position : null;
}

function boundStamp(actor: MenuStaffActor, now: number) {
  return actor.kind === "staff"
    ? { boundAt: now, boundByStaffId: actor.staff._id, boundByUserId: undefined }
    : { boundAt: now, boundByUserId: actor.access.user._id, boundByStaffId: undefined };
}

/**
 * `Poveži sa stolom` (master §11.3 step 4): staff bind an ACCEPTED reservation
 * to a table by hand (or change it, or `null` to unbind). The table gets the
 * reservation's name, guests, time and note on the floor. Never automatic,
 * never by the guest. Not audited (the row carries who and when).
 */
export const bindPosition = mutation({
  args: { ...actionArgs, positionId: v.union(v.id("menuPositions"), v.null()) },
  handler: async (ctx, args): Promise<WaiterReservationOutcome> => {
    const start = await staffStart(ctx, args);
    if ("refused" in start) return start.refused;
    const { waiter, reservation, now } = start;
    if (!canBindPosition(reservation.status)) {
      return { ok: false, code: RESERVATION_ERROR.invalidTransition, status: reservation.status };
    }
    if (args.positionId === null) {
      if (!reservation.positionId) return { ok: true, status: reservation.status, changed: false };
      await ctx.db.patch(reservation._id, {
        positionId: undefined,
        positionLabel: undefined,
        ...boundStamp(waiter.actor, now),
        updatedAt: now,
      });
      return { ok: true, status: reservation.status, changed: true };
    }
    const position = await activePosition(ctx, waiter.menuService._id, args.positionId);
    if (!position) return { ok: false, code: RESERVATION_ERROR.positionInvalid, status: reservation.status };
    if (reservation.positionId === position._id) return { ok: true, status: reservation.status, changed: false };
    await ctx.db.patch(reservation._id, {
      positionId: position._id,
      positionLabel: position.label,
      ...boundStamp(waiter.actor, now),
      updatedAt: now,
    });
    return { ok: true, status: reservation.status, changed: true };
  },
});

/**
 * `Gosti su stigli` (master §11.3 steps 6–7): the reservation is realized.
 * With a table (bound before, or chosen now) AND the venue's optional
 * occupancy module on, the table becomes occupied — the one place outside
 * the manual `menuWaiter.setOccupancy` that writes occupancy (plan K19-19,
 * K24-12). Without the module nothing about the table changes. A person
 * does this; nothing scheduled ever calls it.
 */
export const markArrived = mutation({
  args: { ...actionArgs, positionId: v.optional(v.id("menuPositions")) },
  handler: async (ctx, args): Promise<WaiterReservationOutcome> => {
    const start = await staffStart(ctx, args);
    if ("refused" in start) return start.refused;
    const { waiter, reservation, now } = start;
    let positionId = reservation.positionId ?? null;
    if (args.positionId !== undefined && reservation.status === "accepted" && args.positionId !== positionId) {
      const position = await activePosition(ctx, waiter.menuService._id, args.positionId);
      if (!position) return { ok: false, code: RESERVATION_ERROR.positionInvalid, status: reservation.status };
      await ctx.db.patch(reservation._id, { positionId: position._id, positionLabel: position.label, ...boundStamp(waiter.actor, now) });
      positionId = position._id;
    }
    const current = (await ctx.db.get(reservation._id)) ?? reservation;
    const result = await applyReservationAction(ctx, current, "arrive", actorDoc(waiter.actor), now);
    if (!result.ok) return { ok: false, code: result.code, status: reservation.status };
    if (result.changed && positionId && waiter.menuService.features.occupancy === true) {
      const position = await activePosition(ctx, waiter.menuService._id, positionId);
      if (position) {
        const who =
          waiter.actor.kind === "staff"
            ? { updatedByStaffId: waiter.actor.staff._id, updatedByUserId: undefined }
            : { updatedByUserId: waiter.actor.access.user._id, updatedByStaffId: undefined };
        const existing = await ctx.db
          .query("menuPositionOccupancy")
          .withIndex("by_positionId", (q) => q.eq("positionId", position._id))
          .unique();
        if (existing) {
          if (existing.state !== "occupied") await ctx.db.patch(existing._id, { state: "occupied", updatedAt: now, ...who });
        } else {
          await ctx.db.insert("menuPositionOccupancy", {
            menuServiceId: waiter.menuService._id,
            positionId: position._id,
            state: "occupied",
            updatedAt: now,
            ...who,
          });
        }
      }
    }
    return result;
  },
});
