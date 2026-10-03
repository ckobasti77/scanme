import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { normalizeCode } from "./lib/codes";
import { getEntitlement } from "./lib/entitlements";
import { venueOrderingEnabled } from "./lib/plans";
import { REQUEST_ERROR } from "./lib/orderingErrors";
import { rateLimiter } from "./lib/rateLimits";
import { shiftIsAvailableAt } from "./orderingShifts";

// =============================================================================
// TASK-66 — the two guest actions (RFC-004 §2.1, §2.5, §2.6, §2.9, §4).
//
// Level (a) `callWaiter` and level (b) `submitOrder`. One row type
// (serviceRequests) discriminated by `kind`; an order additionally writes its
// lines as serviceRequestItems children, in the SAME transaction, so a request
// can never exist with half its lines.
//
// THE FAILURE THIS FILE IS BUILT AGAINST is the quiet one: an order the server
// accepts that then reaches nobody. Three guards, in this order:
//
//  1. IDENTITY CARRIES THE TABLE. Every request is written with BOTH cardId
//     (the table) and guestId (the person). cardId is not an argument — it is
//     read off the minted guest row, and the ONLY writer of that row is
//     cards.mintOrderingGuest, whose only caller is the card-aware hop
//     resolveTableOrdering (TASK-63, §2.2). A guest with no cardId (its mint
//     was rate-limited) is REFUSED here, loudly: without a table an order is
//     worthless, and silently dropping the table is exactly risk #1.
//
//  2. ONE DISABLED STATE, TWO CAUSES (§2.6) — re-checked HERE, not trusted from
//     the client. The guest's view is a live subscription, but between its last
//     tick and this mutation the tablet can die or the waiter can pause. Every
//     cause — venue toggled ordering off, entitlement lapsed, no open shift,
//     the waiter paused, the heartbeat went stale, the heartbeat is past
//     STALE_MS but the runAt flip has not landed yet — throws the SAME code,
//     `REQUEST_ERROR.unavailable`. Nothing in this file lets a guest tell cause
//     A (involuntary) from cause B (deliberate); the panel/owner view does.
//
//  3. THE PAYLOAD IS THE VENUE'S, NOT THE CLIENT'S. Item names and prices are
//     snapshotted from orderingItems rows that belong to THIS business and are
//     `available` at send time; a reason chip must be one the venue configured.
//     No client-supplied name, price, or reason string is ever persisted.
//
// NOT here, on purpose:
//  - the 7-minute deadline's FLIP (markOverdue), its cron backstop, the live
//    status Poslato → Prihvaćeno → Stiže and the guest's overdue action all
//    live in convex/orderingStatus.ts (TASK-67, §2.8). What this file owns is
//    the one thing only the creating transaction can do: freeze the deadline
//    and schedule the flip. See the insert site.
//  - accept / enroute / complete are shift-bearer panel actions and also live
//    in orderingStatus.ts; their UI is TASK-68 (§2.7).
//  - there is NO amount owed, NO total, NO paid state and NO tab close, here or
//    anywhere in this model (§2.3, e-fiscalization). Prices are informational
//    snapshots only.
//
// Errors are MACHINE CODES, mapped to Serbian by the guest surface through the
// `ordering` i18n dictionary — the orderingShifts.ts (TASK-65) discipline, so
// nothing in convex/ raises user-visible prose for this product's guest paths.
// =============================================================================

// The guest-visible refusal codes live in a dependency-free module so the
// browser surface can map them to Serbian without pulling _generated/server
// into the guest's bundle. Re-exported here so this file, which raises them,
// stays the obvious place to look.
export { REQUEST_ERROR } from "./lib/orderingErrors";

// Bounds. Deliberately refusals, not silent clamps: an order the guest did not
// send, or a note whose tail was cut off, is precisely the quiet failure this
// product cannot afford — better one visible "no" than a wrong tray.
const MAX_LINES = 30; // distinct item lines in one order
const MAX_QTY = 99; // per line
const MAX_NOTE_CHARS = 280;
// The §2.8 default, used only if a config somehow carries a non-finite window.
// The real value is the venue's orderingConfig.overdueMinutes (§5 Q3).
const DEFAULT_OVERDUE_MINUTES = 7;

// -----------------------------------------------------------------------------
// Resolution — identity and availability, shared by both actions.
// -----------------------------------------------------------------------------

interface ResolvedGuestContext {
  config: Doc<"orderingConfig">;
  guest: Doc<"orderingGuests">;
  cardId: Id<"cards">;
  shift: Doc<"orderingShifts">;
  now: number;
}

/**
 * Resolve the venue, the guest bearer, the guest's TABLE and the open shift, and
 * assert the single availability rule — everything both actions need and neither
 * may skip. Throws a guest-visible machine code; never returns a partial state.
 */
async function resolveGuestContext(
  ctx: MutationCtx,
  rawCode: string,
  guestKey: string,
): Promise<ResolvedGuestContext> {
  const code = normalizeCode(rawCode);
  if (!code) throw new ConvexError(REQUEST_ERROR.notFound);

  const config = await ctx.db
    .query("orderingConfig")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!config) throw new ConvexError(REQUEST_ERROR.notFound);

  const business = await ctx.db.get(config.businessId);
  if (!business || business.status === "inactive") {
    throw new ConvexError(REQUEST_ERROR.notFound);
  }

  // Identity: the bearer is scoped to this venue's code by the composite index,
  // so a guestKey minted for another venue simply does not resolve here.
  const guest = await ctx.db
    .query("orderingGuests")
    .withIndex("by_code_and_guestKey", (q) =>
      q.eq("code", code).eq("guestKey", guestKey),
    )
    .unique();
  if (!guest || guest.businessId !== config.businessId) {
    throw new ConvexError(REQUEST_ERROR.invalidGuest);
  }

  // The TABLE. Guaranteed by construction (resolveTableOrdering only mints for
  // the card's own business config), re-asserted because a request with no — or
  // a foreign — table is worse than no request at all.
  if (!guest.cardId) throw new ConvexError(REQUEST_ERROR.noTable);
  const card = await ctx.db.get(guest.cardId);
  if (!card || card.businessId !== config.businessId) {
    throw new ConvexError(REQUEST_ERROR.noTable);
  }

  // --- The single disabled state (§2.6). The order of these checks is
  // irrelevant: every one of them raises the identical code. ------------------
  // Capability and configuration are two separate gates (§2.12): the plan
  // decides the RIGHT to use, the toggle decides USE. A plan that lapsed
  // mid-service must stop new requests, so the entitlement is re-read per
  // action rather than trusted from the guest's last page load.
  const entitlement = await getEntitlement(
    ctx,
    config.businessId,
    "scanme_venue",
  );
  if (!venueOrderingEnabled(entitlement?.limits)) {
    throw new ConvexError(REQUEST_ERROR.unavailable);
  }
  if (!config.enabled) throw new ConvexError(REQUEST_ERROR.unavailable);

  const shift = await ctx.db
    .query("orderingShifts")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", config.businessId).eq("status", "open"),
    )
    .first();
  if (!shift) throw new ConvexError(REQUEST_ERROR.unavailable);

  const now = Date.now();
  if (!shiftIsAvailableAt(shift, now)) {
    throw new ConvexError(REQUEST_ERROR.unavailable);
  }

  return { config, guest, cardId: guest.cardId, shift, now };
}

/**
 * Insert the request row. Both kinds route to the venue's single open shift
 * (§2.7) and carry BOTH cardId and guestId (§2.2, §2.5).
 *
 * NO DEDUPE, deliberately: §2.4 makes every request independent — a table
 * legitimately orders the same round twice — so swallowing an "identical"
 * second order would be the worse quiet failure (a tray that never comes) than
 * an obvious duplicate the waiter sees side by side and asks about.
 * Double-submit is prevented where it belongs, in the client, by disabling the
 * control while the mutation is in flight.
 */
async function insertRequest(
  ctx: MutationCtx,
  resolved: ResolvedGuestContext,
  fields: { kind: "call" | "order"; reason?: string; note?: string },
): Promise<Id<"serviceRequests">> {
  const { config, guest, cardId, shift, now } = resolved;
  // Clamped defensively to the same 1..60 band updateOrderingConfig enforces:
  // a 0 (or negative) window would schedule the flip in the past and make every
  // order overdue the instant it is sent, and a NaN would make runAt throw and
  // lose the whole request. The config is the venue's, but this row's deadline
  // must be sane no matter how the config got written.
  const overdueMinutes = Number.isFinite(config.overdueMinutes)
    ? Math.max(1, Math.min(60, Math.round(config.overdueMinutes)))
    : DEFAULT_OVERDUE_MINUTES;
  const overdueAt = now + overdueMinutes * 60_000;
  const requestId = await ctx.db.insert("serviceRequests", {
    businessId: config.businessId,
    cardId,
    guestId: guest._id,
    shiftId: shift._id,
    kind: fields.kind,
    status: "sent",
    reason: fields.reason,
    note: fields.note,
    // The 7-minute deadline (§2.8, TASK-67). `overdue` starts false and is
    // MATERIALIZED by the scheduled flip below — never computed from Date.now()
    // in a query, because a reactive query does not re-run merely because time
    // passed (the TASK-65 doctrine; a guest would sit staring at "Poslato"
    // forever). The deadline is frozen here, at creation, from the venue's
    // configured window: an owner who edits overdueMinutes mid-service must not
    // move the deadline of a request already in flight.
    overdue: false,
    overdueAt,
    createdAt: now,
    updatedAt: now,
  });
  // The flip. NOTHING here cancels the request when it fires — markOverdue only
  // raises a flag (§2.8: never a silent cancel). Its superseded-guard is the
  // request's own status: any acceptance before this instant makes it a no-op.
  await ctx.scheduler.runAt(
    overdueAt,
    internal.orderingStatus.markOverdue,
    { requestId },
  );
  await ctx.db.patch(guest._id, { lastSeenAt: now, updatedAt: now });
  return requestId;
}

// -----------------------------------------------------------------------------
// Level (a) — Pozovi konobara (§2.1).
// -----------------------------------------------------------------------------

export const callWaiter = mutation({
  args: {
    code: v.string(),
    guestKey: v.string(),
    // Optional chip. Must be one of orderingConfig.reasons — free text from a
    // guest would land unfiltered in the panel and is a spam vector (§2.1).
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveGuestContext(ctx, args.code, args.guestKey);
    if (!resolved.config.callWaiterEnabled) {
      // The venue switched the call button off (constraint 7). Same calm state.
      throw new ConvexError(REQUEST_ERROR.unavailable);
    }

    // Keyed per cardId — the TABLE, across all its guests (§2.9). The printed
    // card is the scarce identifier: clearing a cookie mints a new guest but
    // cannot conjure a new table, so this is the ceiling that actually holds
    // against the shared-table call button.
    const allowed = await rateLimiter.limit(ctx, "callWaiter", {
      key: resolved.cardId,
    });
    if (!allowed.ok) throw new ConvexError(REQUEST_ERROR.rateLimited);

    let reason: string | undefined;
    if (args.reason !== undefined) {
      const trimmed = args.reason.trim();
      if (trimmed && !resolved.config.reasons.includes(trimmed)) {
        throw new ConvexError(REQUEST_ERROR.invalidReason);
      }
      reason = trimmed || undefined;
    }

    const requestId = await insertRequest(ctx, resolved, {
      kind: "call",
      reason,
    });
    return { requestId };
  },
});

// -----------------------------------------------------------------------------
// Level (b) — Poruči (§2.1, §2.13).
// -----------------------------------------------------------------------------

export const submitOrder = mutation({
  args: {
    code: v.string(),
    guestKey: v.string(),
    // Item ids + quantities. Names and prices are NOT accepted from the client;
    // they are snapshotted server-side from the venue's own rows.
    lines: v.array(v.object({ itemId: v.id("orderingItems"), qty: v.number() })),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveGuestContext(ctx, args.code, args.guestKey);

    // Keyed per ordering-guest bearer (§2.9), mirroring reserveUpload's keying
    // per guest._id.
    const allowed = await rateLimiter.limit(ctx, "orderSubmit", {
      key: resolved.guest._id,
    });
    if (!allowed.ok) throw new ConvexError(REQUEST_ERROR.rateLimited);

    if (args.lines.length === 0 || args.lines.length > MAX_LINES) {
      throw new ConvexError(REQUEST_ERROR.invalidItems);
    }
    const seen = new Set<string>();
    for (const line of args.lines) {
      if (seen.has(line.itemId)) {
        // Two lines for the same item: refuse rather than silently merge or
        // silently keep one — the guest's intent is ambiguous, and a guessed
        // quantity is a wrong tray.
        throw new ConvexError(REQUEST_ERROR.invalidItems);
      }
      seen.add(line.itemId);
      if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) {
        throw new ConvexError(REQUEST_ERROR.invalidItems);
      }
    }

    let note: string | undefined;
    if (args.note !== undefined) {
      const trimmed = args.note.trim();
      if (trimmed.length > MAX_NOTE_CHARS) {
        throw new ConvexError(REQUEST_ERROR.noteTooLong);
      }
      note = trimmed || undefined;
    }

    // Resolve every line BEFORE inserting anything: an item that belongs to
    // another business, no longer exists, or is switched off (`available:
    // false`, the live "nema više" flag of §2.13) fails the whole order. A
    // partially-accepted order is a wrong tray with a plausible receipt.
    const resolvedLines: Array<{
      name: string;
      priceRsd?: number;
      qty: number;
    }> = [];
    for (const line of args.lines) {
      const item = await ctx.db.get(line.itemId);
      if (
        !item ||
        item.businessId !== resolved.config.businessId ||
        !item.available
      ) {
        throw new ConvexError(REQUEST_ERROR.invalidItems);
      }
      resolvedLines.push({
        // Snapshot at send time (§2.16 O.7): the waiter must read what the
        // guest saw, even if the owner renames or reprices the item mid-order.
        name: item.name,
        // Informational ONLY (§2.3). Never summed, here or anywhere: there is
        // no total, no bill and no payment in this product — the register is
        // the fiscal device.
        priceRsd: item.priceRsd,
        qty: line.qty,
      });
    }

    const requestId = await insertRequest(ctx, resolved, {
      kind: "order",
      note,
    });
    // Same transaction as the request row: the lines and their request commit
    // or roll back together.
    for (let index = 0; index < resolvedLines.length; index += 1) {
      const line = resolvedLines[index];
      await ctx.db.insert("serviceRequestItems", {
        requestId,
        name: line.name,
        priceRsd: line.priceRsd,
        qty: line.qty,
        order: index,
      });
    }
    return { requestId, lineCount: resolvedLines.length };
  },
});
