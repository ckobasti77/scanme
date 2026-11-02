import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { zabeleziPrelazRezervacije } from "./menuAnalytics";
import { writeMenuAudit } from "./menuDraft";
import {
  nextReservationStatus,
  type MenuReservationStatus,
  type ReservationAction,
} from "../../lib/menu/reservation-status";
import type { ReservationErrorCode } from "../../lib/menu/errors/reservations";

// =============================================================================
// ScanMe Menu V1 (K25) — applying a status transition to a reservation
// (master §11.3, §11.7; plan docs/meni/planovi/K24.md K24-2, K24-3). The ONLY
// writer of `menuReservations.status` after creation: the guest's
// cancellation (link or Moji zahtevi) and the waiter panel (a PIN waiter or
// an Owner/Manager account, convex/menuReservations.ts).
//
// The rule table is lib/menu/reservation-status.ts. Who and when are written
// on the row (decided, arrived, cancelled at and by); a decline and a
// cancellation are also audited (whoever does them), the rest is not (the
// row is the trace, as K19-16). The table and the occupancy are not written
// here: binding is its own mutation, and only `markArrived` may mark the
// table occupied (K24-12).
// =============================================================================

export type ReservationActorDoc =
  | { kind: "guest" }
  | { kind: "user"; userId: Id<"users"> }
  | { kind: "staff"; staffId: Id<"menuStaff"> };

export type ReservationApplyResult =
  | { ok: true; status: MenuReservationStatus; changed: boolean }
  | { ok: false; code: ReservationErrorCode };

/** `…ByStaffId` or `…ByUserId` of one stamp. */
function by<K extends string>(prefix: K, actor: ReservationActorDoc) {
  if (actor.kind === "staff") return { [`${prefix}ByStaffId`]: actor.staffId } as Record<`${K}ByStaffId`, Id<"menuStaff">>;
  if (actor.kind === "user") return { [`${prefix}ByUserId`]: actor.userId } as Record<`${K}ByUserId`, Id<"users">>;
  return {};
}

export async function applyReservationAction(
  ctx: MutationCtx,
  reservation: Doc<"menuReservations">,
  action: ReservationAction,
  actor: ReservationActorDoc,
  now: number,
  proposal?: { proposedAt: number; proposalNote: string | null },
): Promise<ReservationApplyResult> {
  const result = nextReservationStatus(reservation.status, action, actor.kind === "guest" ? "guest" : "staff");
  if (result.kind === "refused") return { ok: false, code: result.code };
  if (result.kind === "same") return { ok: true, status: reservation.status, changed: false };

  const patch: Partial<Doc<"menuReservations">> = { status: result.to, updatedAt: now };
  switch (action) {
    case "accept":
    case "decline":
      Object.assign(patch, { decidedAt: now, ...by("decided", actor) });
      break;
    case "propose":
      if (!proposal) throw new Error("propose needs a proposal");
      Object.assign(patch, {
        decidedAt: now,
        ...by("decided", actor),
        proposedAt: proposal.proposedAt,
        proposalNote: proposal.proposalNote ?? undefined,
      });
      break;
    case "acceptProposal":
      // The guest agreed (by phone or e-mail): the proposed time becomes the reservation's time
      // and the proposal is done (cleared, so no screen shows it as still open).
      Object.assign(patch, {
        decidedAt: now,
        ...by("decided", actor),
        ...(reservation.proposedAt !== undefined ? { requestedAt: reservation.proposedAt } : {}),
        proposedAt: undefined,
        proposalNote: undefined,
      });
      break;
    case "arrive":
      Object.assign(patch, { arrivedAt: now, ...by("arrived", actor) });
      break;
    case "cancel":
      Object.assign(patch, { cancelledAt: now, cancelledBy: actor.kind === "guest" ? "guest" : "staff", ...by("cancelled", actor) });
      break;
  }
  await ctx.db.patch(reservation._id, patch);
  // K29: one analytics event per real transition (docs/menu/ANALITIKA-DEFINICIJE.md §4).
  await zabeleziPrelazRezervacije(ctx, reservation, action, actor.kind === "guest" ? "guest" : "staff", now);

  if (result.to === "declined" || result.to === "cancelled") {
    await writeMenuAudit(ctx, {
      menuServiceId: reservation.menuServiceId,
      actorKind: actor.kind,
      ...(actor.kind === "user" ? { actorUserId: actor.userId } : {}),
      ...(actor.kind === "staff" ? { actorRef: actor.staffId } : {}),
      action: result.to === "declined" ? "reservation.declined" : "reservation.cancelled",
      entityType: "reservation",
      entityKey: reservation._id,
      details: { from: reservation.status, by: actor.kind === "guest" ? "guest" : "staff" },
    });
  }
  return { ok: true, status: result.to, changed: true };
}
