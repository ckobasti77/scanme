import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { normalizeCode } from "./lib/codes";
import { requireBearer } from "./orderingShifts";

// =============================================================================
// TASK-68 — the waiter panel's read model (RFC-004 §2.7, §2.10).
//
// ONE query, `panelView`, is the panel's whole subscription: the shift header
// (who is manning it, paused, stale) and the live queue. Nothing else in this
// file — every panel ACTION already exists and is called as-is:
//   openShift / heartbeat / pauseOrdering / resumeOrdering / closeShift
//     → convex/orderingShifts.ts (TASK-65)
//   acceptRequest / markEnroute / completeRequest
//     → convex/orderingStatus.ts (TASK-67)
//
// Guarded by the shift bearer, the same constant-time check as every action.
// Hashing inside a query is fine: SHA-256 is deterministic (the invitations
// status query has done exactly this since TASK-02).
//
// THE QUEUE IS BOUNDED AND READS ONLY ACTIVE ROWS. Each of sent / accepted /
// enroute is read newest-first with `.take(PANEL_WINDOW)` (the Memories
// WALL_WINDOW pattern: a subscription must never grow with history). The
// per-status index is what makes the bound honest — through the plain
// by_businessId_and_createdAt index, sixty fresh `completed` rows would push an
// older still-`sent` request (the overdue one, the row the panel exists to
// surface) out of the window without a trace.
//
// Authorization is on the VENUE (businessId), not the request's shiftId,
// deliberately matching orderingStatus.requirePanel (TASK-67 §5): a shift that
// closed at 23:00 and reopened must still see — and be able to accept — the
// requests routed to its predecessor.
//
// NO CLOCK. `overdue` and `stale` arrive materialized (markOverdue /
// markShiftStale); this query never computes anything from Date.now(), so the
// subscription re-runs exactly when those flags flip and never goes quietly
// wrong the way a computed comparison would (guidelines §331).
//
// `stale` and `paused` ARE returned here, unlike the guest query: this is the
// panel, the diagnostic view §2.6 reserves the cause A / cause B distinction for.
// =============================================================================

export const PANEL_WINDOW = 60;

const ACTIVE_STATUSES = ["sent", "accepted", "enroute"] as const;
type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export interface PanelRequestLine {
  name: string;
  qty: number;
  priceRsd?: number;
}

export interface PanelRequestRow {
  _id: Id<"serviceRequests">;
  cardId: Id<"cards">;
  /** cards.label — "Sto 7". Falls back to the card code if the label is empty. */
  tableLabel: string;
  kind: "call" | "order";
  status: ActiveStatus;
  /** Materialized by markOverdue; NEVER computed here. */
  overdue: boolean;
  reason?: string;
  note?: string;
  createdAt: number;
  acceptedAt?: number;
  items: PanelRequestLine[];
}

export type PanelViewResult =
  | { status: "no_shift" }
  | { status: "invalid_bearer" }
  | {
      status: "open";
      businessName: string;
      staffLabel: string;
      paused: boolean;
      stale: boolean;
      openedAt: number;
      requests: PanelRequestRow[];
    };

// The config→open-shift lookup, over a QueryCtx. orderingShifts exports the
// same lookup typed for mutations only; re-stating eight lines here keeps
// TASK-65's file untouched.
async function loadOpenShift(
  ctx: QueryCtx,
  rawCode: string,
): Promise<{ business: Doc<"businesses">; shift: Doc<"orderingShifts"> } | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const config = await ctx.db
    .query("orderingConfig")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!config) return null;
  const business = await ctx.db.get(config.businessId);
  if (!business || business.status === "inactive") return null;
  const shift = await ctx.db
    .query("orderingShifts")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", config.businessId).eq("status", "open"),
    )
    .first();
  if (!shift) return null;
  return { business, shift };
}

export const panelView = query({
  args: { code: v.string(), bearer: v.string() },
  handler: async (ctx, args): Promise<PanelViewResult> => {
    const found = await loadOpenShift(ctx, args.code);
    if (!found) return { status: "no_shift" };
    const { business, shift } = found;
    try {
      await requireBearer(shift, args.bearer);
    } catch {
      // A second PIN login on another device re-minted the bearer (TASK-65
      // adopt) or the cookie is stale: this tablet falls back to the PIN screen.
      return { status: "invalid_bearer" };
    }

    const active: Array<Doc<"serviceRequests">> = [];
    for (const status of ACTIVE_STATUSES) {
      const rows = await ctx.db
        .query("serviceRequests")
        .withIndex("by_businessId_and_status_and_createdAt", (q) =>
          q.eq("businessId", business._id).eq("status", status),
        )
        .order("desc")
        .take(PANEL_WINDOW);
      active.push(...rows);
    }

    // One card read per TABLE, not per request: a busy table has many rows.
    const labels = new Map<Id<"cards">, string>();
    const requests: PanelRequestRow[] = [];
    for (const row of active) {
      let tableLabel = labels.get(row.cardId);
      if (tableLabel === undefined) {
        const card = await ctx.db.get(row.cardId);
        tableLabel = card ? card.label.trim() || card.cardCode : "";
        labels.set(row.cardId, tableLabel);
      }
      const items =
        row.kind === "order"
          ? (
              await ctx.db
                .query("serviceRequestItems")
                .withIndex("by_requestId", (q) => q.eq("requestId", row._id))
                .collect()
            )
              .sort((a, b) => a.order - b.order)
              .map((item) => ({
                name: item.name,
                qty: item.qty,
                priceRsd: item.priceRsd,
              }))
          : [];
      requests.push({
        _id: row._id,
        cardId: row.cardId,
        tableLabel,
        kind: row.kind,
        // Narrowed by the index range above; the cast only names it.
        status: row.status as ActiveStatus,
        overdue: row.overdue,
        reason: row.reason,
        note: row.note,
        createdAt: row.createdAt,
        acceptedAt: row.acceptedAt,
        items,
      });
    }

    return {
      status: "open",
      businessName: business.name,
      staffLabel: shift.staffLabel,
      paused: shift.paused,
      stale: shift.stale,
      openedAt: shift.openedAt,
      requests,
    };
  },
});
