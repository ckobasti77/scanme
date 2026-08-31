import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getEntitlement } from "./lib/entitlements";
import { venueAllowedBlockKeys } from "./lib/plans";
import { rateLimiter } from "./lib/rateLimits";
import { normalizeEmail, normalizePhone, optionalText } from "./lib/validation";
import type { ReservationProps, ReservationZone } from "../lib/venue-blocks";
import { getDict } from "../lib/i18n";
import { loadEventForEditor } from "./venue";
import { bumpDailyEventMetrics } from "./venueAnalytics";

// =============================================================================
// TASK-43 — the reservation-request workflow (RFC-001 §2.4 C.14).
//
// ████ HARD RULE — DO NOT "FIX" THIS TOMORROW ████████████████████████████████
// █ THIS IS NOT A RESERVATION SYSTEM. There is NO payment, NO guarantee, and █
// █ NO automatic confirmation anywhere in this module — THE OWNER DECIDES.  █
// █ A guest submits a REQUEST; the owner taps Potvrdi or Odbij and contacts █
// █ the guest over WhatsApp/Viber. Software that quietly promises a table   █
// █ that does not exist starts a fight at the door. Any change that makes a █
// █ request auto-confirm, take money, or read as a guaranteed booking is a  █
// █ product regression, not an improvement.                                 █
// ████████████████████████████████████████████████████████████████████████████
//
// Capacity model: the owner defines ZONES (never numbered tables — nobody
// maintains a floor plan): "Sto za dvoje — 8 komada", "Separe — 3". One
// request holds exactly ONE unit of its zone. A `pending` request holds the
// unit SOFTLY for RESERVATION_HOLD_MS (2h) — the reserve→commit idea the
// Memories quota already uses (RFC §2.9): without the hold, one prankster
// fills the club in a minute; with a forever-hold, the club reads falsely
// full all evening. The hold expiry is MATERIALIZED (a scheduled flip plus a
// cron backstop flips pending → expired), so no query ever reads the clock
// to decide fullness. `confirmed` holds the unit for good; `declined` and
// `expired` free it. Blocks with no zones keep the legacy whole-event model
// (sum of partySize vs `capacity`).
//
// Abuse posture: the account-less public form is a spam magnet, so the submit
// path is throttled twice — per-IP through the component rate limiter (the
// ipHash is computed by the Next route handler app/api/venue/reservations,
// exactly the cardResolve pattern; the raw IP never reaches Convex, §2.10)
// and per-event through a same-transaction window count.
// =============================================================================

const venueDict = getDict("venue");
const editorDict = getDict("venue-editor");

// The soft hold: a pending request keeps its unit this long, then frees it.
export const RESERVATION_HOLD_MS = 2 * 60 * 60 * 1000;

// In-transaction rate limit: at most this many submissions per event per
// minute. An index-range count inside the mutation's own transaction — not a
// cross-transaction window scan, so it admits no races (RFC §2.9).
const RESERVATION_RATE_LIMIT_PER_MINUTE = 15;
const RESERVATION_RATE_WINDOW_MS = 60_000;
// Capacity reads are bounded: past this many held rows the event is full.
const RESERVATION_READ_CAP = 2000;
const RESERVATION_MAX_PARTY_SIZE = 500;
// Owner list page size.
const RESERVATION_LIST_LIMIT = 200;
// Cron backstop batch (the scheduled per-row flip is the primary mechanism).
const SWEEP_BATCH = 100;

type ReservationStatus = NonNullable<Doc<"venueReservations">["status"]>;

// Every row currently holding capacity for an event, bounded. A row holds
// while its status is pending or confirmed — or absent: legacy rows predate
// the workflow and keep their old semantics (they held forever). Reads those
// three status ranges of by_eventId_and_status so freed rows (declined/
// expired) never count against the read cap.
async function readHeldRows(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<{ rows: Doc<"venueReservations">[]; atCap: boolean }> {
  const rows: Doc<"venueReservations">[] = [];
  let atCap = false;
  for (const status of [undefined, "pending", "confirmed"] as const) {
    const batch = await ctx.db
      .query("venueReservations")
      .withIndex("by_eventId_and_status", (q) =>
        q.eq("eventId", eventId).eq("status", status),
      )
      .take(RESERVATION_READ_CAP);
    if (batch.length >= RESERVATION_READ_CAP) atCap = true;
    rows.push(...batch);
  }
  return { rows, atCap };
}

function zoneUnitsUsed(
  rows: Doc<"venueReservations">[],
  zoneId: string,
): number {
  return rows.filter((row) => row.zoneId === zoneId).length;
}

function legacySeatsUsed(rows: Doc<"venueReservations">[]): number {
  return rows.reduce((sum, row) => sum + (row.partySize ?? 1), 0);
}

// The published, visible reservation block — IF the current plan still allows
// it. The public view filters disallowed blocks out, but a direct API caller
// skips the view, so the plan check is repeated here (RFC §2.9: the check is
// on the server, in the same transaction as the write).
async function publishedReservationBlock(
  ctx: QueryCtx | MutationCtx,
  businessSlug: string,
  eventSlug: string,
) {
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", businessSlug))
    .unique();
  if (!business) return null;
  const event = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_slug", (q) =>
      q.eq("businessId", business._id).eq("slug", eventSlug),
    )
    .unique();
  if (!event) return null;
  const config = await ctx.db
    .query("venueEventConfigs")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .unique();
  const block = (config?.publishedBlocks ?? []).find(
    (candidate) =>
      candidate.type === "reservation" && candidate.base.visible !== false,
  );
  if (!block || block.type !== "reservation") return null;
  const entitlement = await getEntitlement(ctx, business._id, "scanme_venue");
  if (!venueAllowedBlockKeys(entitlement?.limits).includes("reservation")) {
    return null;
  }
  return { business, event, props: block.props as ReservationProps };
}

function activeZones(props: ReservationProps): ReservationZone[] {
  return (props.zones ?? []).filter((zone) => zone.capacity > 0);
}

// -----------------------------------------------------------------------------
// submit — the guest's request (public; reached through the rate-limiting Next
// route handler, which supplies ipHash the way app/r/[cardCode] does for
// cardResolve; a direct caller without ipHash shares one bucket).
// -----------------------------------------------------------------------------

export const submit = mutation({
  args: {
    businessSlug: v.string(),
    eventSlug: v.string(),
    zoneId: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    partySize: v.optional(v.number()),
    desiredAt: v.optional(v.number()),
    note: v.optional(v.string()),
    // Salted one-way hash of the caller IP, computed by the Next handler as a
    // rate-limit key only (GDPR §2.10) — never stored on the row.
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ipKey = args.ipHash ?? "shared";
    const allowed = await rateLimiter.limit(ctx, "venueReservation", {
      key: ipKey,
    });
    if (!allowed.ok) {
      throw new ConvexError(venueDict.reservationRateLimited);
    }

    const resolved = await publishedReservationBlock(
      ctx,
      args.businessSlug,
      args.eventSlug,
    );
    if (!resolved) throw new ConvexError(venueDict.reservationUnavailable);
    const { event, props } = resolved;
    if (event.status === "ended" || event.status === "archived") {
      throw new ConvexError(venueDict.reservationClosed);
    }

    const now = Date.now();
    if (props.deadline !== undefined && now > props.deadline) {
      throw new ConvexError(venueDict.reservationDeadlinePassed);
    }

    // Per-event window count, in-transaction (unchanged from TASK-09).
    const recent = await ctx.db
      .query("venueReservations")
      .withIndex("by_eventId_and_createdAt", (q) =>
        q
          .eq("eventId", event._id)
          .gte("createdAt", now - RESERVATION_RATE_WINDOW_MS),
      )
      .take(RESERVATION_RATE_LIMIT_PER_MINUTE);
    if (recent.length >= RESERVATION_RATE_LIMIT_PER_MINUTE) {
      throw new ConvexError(venueDict.reservationRateLimited);
    }

    // Honour the block's field config: enabled fields are validated, disabled
    // fields are dropped and never stored.
    const fields = props.fields;
    let name = "";
    if (fields.name) {
      name = (args.name ?? "").trim().replace(/\s+/g, " ");
      if (name.length === 0 || name.length > 120) {
        throw new ConvexError(venueDict.reservationNameRequired);
      }
    }
    const phone =
      fields.phone && args.phone?.trim() ? normalizePhone(args.phone) : undefined;
    const email =
      fields.email && args.email?.trim() ? normalizeEmail(args.email) : undefined;
    let partySize: number | undefined;
    if (fields.partySize && args.partySize !== undefined) {
      if (
        !Number.isInteger(args.partySize) ||
        args.partySize < 1 ||
        args.partySize > RESERVATION_MAX_PARTY_SIZE
      ) {
        throw new ConvexError(venueDict.reservationPartySizeInvalid);
      }
      partySize = args.partySize;
    }
    const note =
      fields.note && args.note ? optionalText(args.note, 500) : undefined;
    const desiredAt =
      args.desiredAt !== undefined && Number.isFinite(args.desiredAt)
        ? args.desiredAt
        : undefined;

    // Capacity — counted and inserted in the SAME serializable transaction, so
    // two concurrent submissions can never both observe the last free unit
    // (the Memories quota argument, RFC §2.9).
    const zones = activeZones(props);
    let zone: ReservationZone | undefined;
    if (zones.length > 0) {
      zone = zones.find((candidate) => candidate.id === args.zoneId);
      if (!args.zoneId) throw new ConvexError(venueDict.reservationZoneRequired);
      if (!zone) throw new ConvexError(venueDict.reservationZoneInvalid);
      const { rows, atCap } = await readHeldRows(ctx, event._id);
      if (atCap || zoneUnitsUsed(rows, zone.id) >= zone.capacity) {
        throw new ConvexError(venueDict.reservationZoneFull);
      }
    } else if (props.capacity !== undefined) {
      const { rows, atCap } = await readHeldRows(ctx, event._id);
      const used = legacySeatsUsed(rows);
      const requested = partySize ?? 1;
      if (atCap || used + requested > props.capacity) {
        throw new ConvexError(venueDict.reservationFull);
      }
    }

    const heldUntil = now + RESERVATION_HOLD_MS;
    const reservationId = await ctx.db.insert("venueReservations", {
      eventId: event._id,
      name,
      phone,
      email,
      partySize,
      note,
      ...(zone ? { zoneId: zone.id, zoneName: zone.name } : {}),
      desiredAt,
      status: "pending",
      heldUntil,
      createdAt: now,
    });
    // The soft hold's release: an exact-time flip; the cron sweep below is the
    // backstop for a lost scheduled function.
    await ctx.scheduler.runAt(heldUntil, internal.venueReservations.expireHold, {
      reservationId,
    });
    await bumpDailyEventMetrics(ctx, event._id, { reservationSubmits: 1 });
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// availability — what the public form renders: which zones are full
// ("popunjeno" instead of the form). Reads only materialized status — the
// hold expiry flips are what advance time here, never a clock read.
// -----------------------------------------------------------------------------

type AvailabilityResult =
  | { kind: "none" }
  | {
      kind: "zones";
      zones: Array<{
        id: string;
        name: string;
        capacity: number;
        used: number;
        full: boolean;
      }>;
      allFull: boolean;
    }
  | { kind: "capacity"; capacity: number; used: number; full: boolean }
  | { kind: "open" };

export const availability = query({
  args: { businessSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args): Promise<AvailabilityResult> => {
    const resolved = await publishedReservationBlock(
      ctx,
      args.businessSlug,
      args.eventSlug,
    );
    if (!resolved) return { kind: "none" };
    const { event, props } = resolved;
    if (event.status === "ended" || event.status === "archived") {
      return { kind: "none" };
    }

    const zones = activeZones(props);
    if (zones.length > 0) {
      const { rows, atCap } = await readHeldRows(ctx, event._id);
      const zoneViews = zones.map((zone) => {
        const used = zoneUnitsUsed(rows, zone.id);
        return {
          id: zone.id,
          name: zone.name,
          capacity: zone.capacity,
          used,
          full: atCap || used >= zone.capacity,
        };
      });
      return {
        kind: "zones",
        zones: zoneViews,
        allFull: zoneViews.every((zone) => zone.full),
      };
    }
    if (props.capacity !== undefined) {
      const { rows, atCap } = await readHeldRows(ctx, event._id);
      const used = legacySeatsUsed(rows);
      return {
        kind: "capacity",
        capacity: props.capacity,
        used,
        full: atCap || used >= props.capacity,
      };
    }
    return { kind: "open" };
  },
});

// -----------------------------------------------------------------------------
// The soft-hold release: pending → expired. Scheduled per row at heldUntil;
// swept by cron as a backstop. Both are idempotent no-ops on any row that is
// no longer pending (confirmed/declined/expired in the meantime).
// -----------------------------------------------------------------------------

export const expireHold = internalMutation({
  args: { reservationId: v.id("venueReservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row || row.status !== "pending") return { expired: false };
    await ctx.db.patch(row._id, { status: "expired" });
    return { expired: true };
  },
});

export const sweepExpiredHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("venueReservations")
      .withIndex("by_status_and_heldUntil", (q) =>
        q.eq("status", "pending").lte("heldUntil", now),
      )
      .take(SWEEP_BATCH);
    for (const row of due) {
      await ctx.db.patch(row._id, { status: "expired" });
    }
    return { expired: due.length };
  },
});

// -----------------------------------------------------------------------------
// The owner's side: list, confirm, decline. Confirmation NEVER notifies the
// guest automatically — the panel opens a PREPARED WhatsApp/Viber message the
// owner sends themself (the owner of a kafić does not read email, and the
// hard rule above forbids the software promising anything on its own).
// -----------------------------------------------------------------------------

type ReservationRow = {
  id: Id<"venueReservations">;
  name: string;
  phone: string | null;
  email: string | null;
  partySize: number | null;
  note: string | null;
  zoneId: string | null;
  zoneName: string | null;
  desiredAt: number | null;
  // Legacy rows (status absent) read as pending — an open request.
  status: ReservationStatus;
  heldUntil: number | null;
  decidedAt: number | null;
  createdAt: number;
};

function toRow(row: Doc<"venueReservations">): ReservationRow {
  return {
    id: row._id,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    partySize: row.partySize ?? null,
    note: row.note ?? null,
    zoneId: row.zoneId ?? null,
    zoneName: row.zoneName ?? null,
    desiredAt: row.desiredAt ?? null,
    status: row.status ?? "pending",
    heldUntil: row.heldUntil ?? null,
    decidedAt: row.decidedAt ?? null,
    createdAt: row.createdAt,
  };
}

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, config } = await loadEventForEditor(ctx, args.eventId);
    const rows = await ctx.db
      .query("venueReservations")
      .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id))
      .order("desc")
      .take(RESERVATION_LIST_LIMIT);

    // Zone usage summary from the PUBLISHED block (what guests can pick from).
    const block = (config.publishedBlocks ?? []).find(
      (candidate) =>
        candidate.type === "reservation" && candidate.base.visible !== false,
    );
    const props =
      block && block.type === "reservation"
        ? (block.props as ReservationProps)
        : null;
    let zoneUsage: Array<{
      id: string;
      name: string;
      capacity: number;
      used: number;
    }> | null = null;
    if (props && activeZones(props).length > 0) {
      const held = await readHeldRows(ctx, event._id);
      zoneUsage = activeZones(props).map((zone) => ({
        id: zone.id,
        name: zone.name,
        capacity: zone.capacity,
        used: zoneUnitsUsed(held.rows, zone.id),
      }));
    }

    return {
      eventTitle: event.title,
      rows: rows.map(toRow),
      zoneUsage,
    };
  },
});

// Re-check capacity when confirming a request whose hold was already freed
// (expired/declined): its unit may have been taken in the meantime, and a
// confirm must never oversell a zone.
async function assertConfirmCapacity(
  ctx: MutationCtx,
  row: Doc<"venueReservations">,
) {
  const event = await ctx.db.get(row.eventId);
  if (!event) throw new ConvexError(editorDict.resRequestNotFound);
  const config = await ctx.db
    .query("venueEventConfigs")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .unique();
  const block = (config?.publishedBlocks ?? []).find(
    (candidate) => candidate.type === "reservation",
  );
  if (!block || block.type !== "reservation") return; // block gone — owner's call
  const props = block.props as ReservationProps;
  const zones = activeZones(props);
  if (row.zoneId && zones.length > 0) {
    const zone = zones.find((candidate) => candidate.id === row.zoneId);
    if (!zone) return; // zone edited away — owner's call
    const { rows, atCap } = await readHeldRows(ctx, event._id);
    if (atCap || zoneUnitsUsed(rows, zone.id) >= zone.capacity) {
      throw new ConvexError(editorDict.resConfirmFull);
    }
  } else if (props.capacity !== undefined) {
    const { rows, atCap } = await readHeldRows(ctx, event._id);
    if (
      atCap ||
      legacySeatsUsed(rows) + (row.partySize ?? 1) > props.capacity
    ) {
      throw new ConvexError(editorDict.resConfirmFull);
    }
  }
}

export const confirm = mutation({
  args: { reservationId: v.id("venueReservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new ConvexError(editorDict.resRequestNotFound);
    await loadEventForEditor(ctx, row.eventId);
    if (row.status === "confirmed") return { ok: true as const };
    // A freed request (expired/declined) no longer holds its unit — re-check
    // before it re-takes one. A pending (or legacy) request already holds it.
    if (row.status === "expired" || row.status === "declined") {
      await assertConfirmCapacity(ctx, row);
    }
    await ctx.db.patch(row._id, {
      status: "confirmed",
      decidedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const decline = mutation({
  args: { reservationId: v.id("venueReservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new ConvexError(editorDict.resRequestNotFound);
    await loadEventForEditor(ctx, row.eventId);
    if (row.status === "declined") return { ok: true as const };
    await ctx.db.patch(row._id, {
      status: "declined",
      decidedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
