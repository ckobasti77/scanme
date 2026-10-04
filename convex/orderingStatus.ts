import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { normalizeCode } from "./lib/codes";
import { REQUEST_ERROR } from "./lib/orderingErrors";
import { loadOpenShiftByCode, requireBearer } from "./orderingShifts";

// =============================================================================
// TASK-67 — the guest's LIVE status and the 7-minute deadline (RFC-004 §2.5,
// §2.6, §2.8).
//
// Two things live here, and they are the same thing seen from two ends:
//
//  1. THE LIVE STATUS. `myRequests` is the guest's own subscription: Poslato →
//     Prihvaćeno → Stiže, bearer-scoped (§2.5 — a guest sees their OWN requests,
//     never the table's). The panel transitions that drive it (acceptRequest /
//     markEnroute / completeRequest) are here too, guarded by the shift bearer:
//     a status the guest can watch is worth nothing without the mutation that
//     changes it, and a test that drove the change with a db.patch instead of
//     the real mutation would prove nothing. TASK-68 builds the panel UI on
//     these; it does not need to add server logic for them.
//
//  2. THE 7-MINUTE DEADLINE (§2.8). NEVER a silent cancel. `markOverdue` raises
//     a FLAG and nothing else — the request stays exactly where it was, `sent`,
//     waiting. The flag turns the guest's status card into an ACTION card and
//     sorts the request to the top of the panel queue.
//
// THE RULE THIS FILE EXISTS TO HONOUR, and the reason the flag is a stored
// boolean instead of a comparison: A REACTIVE QUERY DOES NOT RE-RUN BECAUSE
// TIME PASSED (guidelines §331). Had `overdue` been computed as
// `Date.now() - createdAt > window` inside `myRequests`, the guest's phone
// would render the answer from the instant it subscribed and keep it forever —
// the deadline would appear to work in every test (which calls the query
// afresh) and never fire for a real guest holding a phone. That is the exact
// silent failure §2.8 and risk #2 exist to prevent, so the materialization is
// not an optimisation, it is the feature. This file therefore reads NO clock in
// any query. Date.now() appears only in mutations, which is where it is legal.
//
// The materialization is the TASK-65 shape, deliberately, not a new invention:
//   • the deadline is FROZEN at creation (serviceRequests.overdueAt, written by
//     orderingRequests.insertRequest — the twin of venueReservations.heldUntil);
//   • a per-row `runAt` flip is scheduled for that instant;
//   • the flip NO-OPS if something newer arrived — here "newer" is any
//     acceptance, i.e. `status !== "sent"` (the analogue of markShiftStale's
//     `lastHeartbeatAt !== expectedHeartbeatAt`; a request's deadline, unlike a
//     heartbeat, is never pushed forward, so there is nothing else to compare);
//   • `sweepOverdueRequests` is the cron backstop for a lost `runAt`.
//
// Errors are MACHINE CODES (the orderingShifts.ts / memoriesPipeline.ts
// discipline); the guest surface and TASK-68's panel map them to Serbian.
// =============================================================================

// The guest's own status list is bounded like the Memories wall (WALL_WINDOW):
// a subscription must never grow with history. Twelve is far above a table's
// real session — the per-guest orderSubmit bucket is 5/min with capacity 3 —
// and it is newest-first, so what a guest loses at the bottom is their OLDEST
// request. Nothing is cancelled by falling out of this window: the row stays,
// the waiter still sees it in the panel queue, and the ceiling is documented in
// docs/tasks/BLOCKED.md.
const GUEST_REQUEST_WINDOW = 12;

// Cron backstop batch, mirroring orderingShifts.sweepStaleShifts.
const SWEEP_BATCH = 100;

// The statuses a guest may still be waiting on. Only these are shown as live
// state; `completed` is shown as the closing beat, `withdrawn` as their own act.
type RequestStatus = Doc<"serviceRequests">["status"];

// -----------------------------------------------------------------------------
// markOverdue — the runAt flip (§2.8). Scheduled at `overdueAt` by
// orderingRequests.insertRequest. Every branch is an idempotent no-op, and NO
// branch touches `status`: the request is still pending after it runs. That is
// the whole decision — the owner rejected auto-cancel outright, so this mutation
// is physically incapable of it.
// -----------------------------------------------------------------------------

export const markOverdue = internalMutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return { overdue: false as const };
    // Superseded: a waiter accepted (or the guest withdrew) before the deadline.
    // The window is about ACCEPTANCE (§2.6), so anything past `sent` disarms it.
    if (request.status !== "sent") return { overdue: false as const };
    if (request.overdue) return { overdue: true as const };
    await ctx.db.patch(request._id, { overdue: true, updatedAt: Date.now() });
    return { overdue: true as const };
  },
});

// -----------------------------------------------------------------------------
// sweepOverdueRequests — the cron backstop for a lost runAt (crons.ts). Ranges
// still-`sent` requests by their frozen deadline across all venues. Date.now()
// here is fine: this is a mutation, not a query.
//
// The lower bound is not decoration. `overdueAt` is optional in the schema (rows
// written before TASK-67 have none), and in a Convex index an absent value sorts
// BELOW every number — so a bare `.lte("overdueAt", now)` would sweep those
// deadline-less rows into `overdue` on the very first cron tick. `.gte(1)`
// excludes them: a request with no frozen deadline has no deadline to miss.
// -----------------------------------------------------------------------------

export const sweepOverdueRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("serviceRequests")
      .withIndex("by_status_and_overdueAt", (q) =>
        q.eq("status", "sent").gte("overdueAt", 1).lte("overdueAt", now),
      )
      .filter((q) => q.eq(q.field("overdue"), false))
      .take(SWEEP_BATCH);
    for (const request of due) {
      await ctx.db.patch(request._id, { overdue: true, updatedAt: now });
    }
    return { flagged: due.length };
  },
});

// -----------------------------------------------------------------------------
// The guest's live status (§2.5, §2.6) — SSR renders it once, then the browser
// subscribes to this same query and every panel tap lands with no reload.
// -----------------------------------------------------------------------------

export interface GuestRequestLine {
  name: string;
  qty: number;
  priceRsd?: number;
}

export interface GuestRequestRow {
  _id: Id<"serviceRequests">;
  kind: "call" | "order";
  status: RequestStatus;
  /** Materialized by markOverdue; NEVER computed here (see the file header). */
  overdue: boolean;
  reason?: string;
  note?: string;
  createdAt: number;
  items: GuestRequestLine[];
}

export const myRequests = query({
  args: { code: v.string(), guestKey: v.string() },
  handler: async (ctx, args): Promise<GuestRequestRow[]> => {
    const code = normalizeCode(args.code);
    if (!code) return [];

    // Bearer-scoped by construction: the composite index is keyed by the venue
    // code AND the bearer, so a key minted for another venue resolves to
    // nothing here, and there is no argument by which a caller could ask for
    // someone else's rows — the guest id is READ from the bearer, never passed.
    const guest = await ctx.db
      .query("orderingGuests")
      .withIndex("by_code_and_guestKey", (q) =>
        q.eq("code", code).eq("guestKey", args.guestKey),
      )
      .unique();
    if (!guest) return [];

    const requests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_guestId_and_createdAt", (q) => q.eq("guestId", guest._id))
      .order("desc")
      .take(GUEST_REQUEST_WINDOW);

    const rows: GuestRequestRow[] = [];
    for (const request of requests) {
      // Lines are read only for `order` rows; a call has none, and asking for
      // them would be a wasted index scan per request on every reactive tick.
      const items =
        request.kind === "order"
          ? await ctx.db
              .query("serviceRequestItems")
              .withIndex("by_requestId", (q) => q.eq("requestId", request._id))
              .collect()
          : [];
      rows.push({
        _id: request._id,
        kind: request.kind,
        status: request.status,
        overdue: request.overdue,
        reason: request.reason,
        note: request.note,
        createdAt: request.createdAt,
        items: items
          .sort((a, b) => a.order - b.order)
          .map((item) => ({
            name: item.name,
            qty: item.qty,
            priceRsd: item.priceRsd,
          })),
      });
    }
    return rows;
  },
});

// -----------------------------------------------------------------------------
// withdrawRequest — the guest's lever at the deadline (§2.8). Their OWN request,
// their own decision, and the only actor in this product that may end a request
// without a waiter: markOverdue cannot, no sweep can, nothing else can.
//
// Deliberately NOT gated on availability. The guest reaches for this exactly
// when the panel has gone quiet — a stale tablet, a paused or closed shift —
// so requiring an available shift would lock the withdraw button precisely when
// it is the only thing left to press. This mutation therefore does not call
// resolveGuestContext (orderingRequests.ts): it needs identity and ownership,
// not manned presence.
// -----------------------------------------------------------------------------

export const withdrawRequest = mutation({
  args: {
    code: v.string(),
    guestKey: v.string(),
    requestId: v.id("serviceRequests"),
  },
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code);
    if (!code) throw new ConvexError(REQUEST_ERROR.notFound);
    const guest = await ctx.db
      .query("orderingGuests")
      .withIndex("by_code_and_guestKey", (q) =>
        q.eq("code", code).eq("guestKey", args.guestKey),
      )
      .unique();
    if (!guest) throw new ConvexError(REQUEST_ERROR.invalidGuest);

    const request = await ctx.db.get(args.requestId);
    // Ownership: another guest's request — even at the same table (§2.5) — is
    // not theirs to withdraw, and the refusal is identical to "does not exist"
    // so an id cannot be probed for existence.
    if (!request || request.guestId !== guest._id) {
      throw new ConvexError(REQUEST_ERROR.requestNotFound);
    }
    // Only a request nobody has picked up. Once a waiter accepted it, a human is
    // already walking; withdrawing then would send them to a table for nothing.
    if (request.status !== "sent") {
      throw new ConvexError(REQUEST_ERROR.notWithdrawable);
    }

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "withdrawn", updatedAt: now });
    return { withdrawn: true as const };
  },
});

// -----------------------------------------------------------------------------
// Panel transitions (§2.7) — sent → accepted → enroute → completed. Guarded by
// the shift bearer, the same constant-time check as every other panel action.
// TASK-68 wires the buttons; the rules live here, once.
// -----------------------------------------------------------------------------

interface PanelContext {
  shift: Doc<"orderingShifts">;
  request: Doc<"serviceRequests">;
}

/**
 * Authenticate a panel action and load the target request.
 *
 * The authorization is on the VENUE (`businessId`), NOT on `shiftId`. That is a
 * deliberate difference from how the request was routed: a request carries the
 * shift it was sent to, but a shift ends. A panel that closed at 23:00 and
 * reopened as a new shift row would otherwise be unable to accept, complete or
 * even touch the requests still pending from before the change — they would sit
 * in the queue forever, untouchable, which is precisely the void §2.8 forbids.
 * The bearer still proves the caller is manning THIS venue's open shift.
 */
async function requirePanel(
  ctx: MutationCtx,
  args: { code: string; bearer: string; requestId: Id<"serviceRequests"> },
): Promise<PanelContext> {
  const shift = await loadOpenShiftByCode(ctx, args.code);
  if (!shift) throw new ConvexError(REQUEST_ERROR.unavailable);
  await requireBearer(shift, args.bearer);
  const request = await ctx.db.get(args.requestId);
  if (!request || request.businessId !== shift.businessId) {
    throw new ConvexError(REQUEST_ERROR.requestNotFound);
  }
  return { shift, request };
}

const panelArgs = {
  code: v.string(),
  bearer: v.string(),
  requestId: v.id("serviceRequests"),
} as const;

/**
 * Prihvati — the acceptance of §2.6: a human looked. This is what disarms the
 * deadline (markOverdue no-ops from here on) and what turns the guest's card
 * from Poslato to Prihvaćeno.
 *
 * Idempotent on an already-accepted request so a double tap on a tablet in a
 * loud room is not an error the waiter has to read; every other status is a
 * loud refusal, because accepting something already completed or withdrawn
 * means the panel is showing a stale row and the waiter must see that.
 */
export const acceptRequest = mutation({
  args: panelArgs,
  handler: async (ctx, args) => {
    const { request } = await requirePanel(ctx, args);
    if (request.status === "accepted") return { status: "accepted" as const };
    if (request.status !== "sent") {
      throw new ConvexError(REQUEST_ERROR.invalidTransition);
    }
    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    });
    // `overdue` is deliberately NOT cleared. It is the record that this request
    // waited past its window — the panel keeps showing it as one that ran late,
    // and the guest's card has already moved on to Prihvaćeno anyway.
    return { status: "accepted" as const };
  },
});

/** Stiže — the waiter is walking with it (§2.6). */
export const markEnroute = mutation({
  args: panelArgs,
  handler: async (ctx, args) => {
    const { request } = await requirePanel(ctx, args);
    if (request.status === "enroute") return { status: "enroute" as const };
    if (request.status !== "accepted") {
      throw new ConvexError(REQUEST_ERROR.invalidTransition);
    }
    await ctx.db.patch(request._id, {
      status: "enroute",
      updatedAt: Date.now(),
    });
    return { status: "enroute" as const };
  },
});

/** Završeno — delivered. Reachable from accepted or enroute (a waiter who
 * carries it straight over never taps Stiže), never from `sent`: something the
 * panel never accepted cannot have been delivered. */
export const completeRequest = mutation({
  args: panelArgs,
  handler: async (ctx, args) => {
    const { request } = await requirePanel(ctx, args);
    if (request.status === "completed") return { status: "completed" as const };
    if (request.status !== "accepted" && request.status !== "enroute") {
      throw new ConvexError(REQUEST_ERROR.invalidTransition);
    }
    await ctx.db.patch(request._id, {
      status: "completed",
      updatedAt: Date.now(),
    });
    return { status: "completed" as const };
  },
});
