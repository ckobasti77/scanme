import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { writeMenuAudit } from "./menuDraft";
import { nextStatus, type MenuRequestStatus, type RequestAction } from "../../lib/menu/request-status";
import type { RequestErrorCode } from "../../lib/menu/errors/requests";

// =============================================================================
// ScanMe Menu V1 (K21) — applying a status transition to a guest request
// (master §8.4; plan K19-6, K19-16). The ONLY writer of `menuRequests.status`
// after creation: the guest's own cancellation (convex/menuGuest.ts) uses it
// now, the waiter panel (K22, a PIN waiter or an Owner/Manager account,
// convex/menuWaiter.ts) and the panel's Operativa (K27).
//
// The rule table is lib/menu/request-status.ts. Who and when are written on
// the row itself (accepted/done/cancelled at and by); accepting and finishing
// are NOT audited (hundreds a day, the row is the trace, K19-16), a
// cancellation is (`request.cancelled`, whoever cancels).
// =============================================================================

/** K21 actors (the guest, an Owner/Manager account); K22 adds the PIN waiter (`staff`). */
export type RequestActorDoc =
  | { kind: "guest" }
  | { kind: "user"; userId: Id<"users"> }
  | { kind: "staff"; staffId: Id<"menuStaff"> };

function actorRef(actor: RequestActorDoc) {
  if (actor.kind === "guest") return { kind: "guest" } as const;
  return {
    kind: "staff",
    ref: actor.kind === "staff" ? `staff:${actor.staffId}` : `user:${actor.userId}`,
  } as const;
}

function acceptedByRef(request: Doc<"menuRequests">): string | null {
  if (request.acceptedByStaffId) return `staff:${request.acceptedByStaffId}`;
  return request.acceptedByUserId ? `user:${request.acceptedByUserId}` : null;
}

export type ApplyResult =
  | { ok: true; status: MenuRequestStatus; changed: boolean }
  | { ok: false; code: RequestErrorCode };

export async function applyRequestAction(
  ctx: MutationCtx,
  request: Doc<"menuRequests">,
  action: RequestAction,
  actor: RequestActorDoc,
  now: number,
): Promise<ApplyResult> {
  const result = nextStatus(
    { status: request.status, acceptedByRef: acceptedByRef(request) },
    action,
    actorRef(actor),
  );
  if (result.kind === "refused") return { ok: false, code: result.code };
  if (result.kind === "same") return { ok: true, status: request.status, changed: false };

  const userId = actor.kind === "user" ? actor.userId : undefined;
  const staffId = actor.kind === "staff" ? actor.staffId : undefined;
  const patch: Partial<Doc<"menuRequests">> = { status: result.to, updatedAt: now };
  if (result.to === "accepted" || result.alsoAccepted) {
    patch.acceptedAt = now;
    if (userId) patch.acceptedByUserId = userId;
    if (staffId) patch.acceptedByStaffId = staffId;
  }
  if (result.to === "done") {
    patch.doneAt = now;
    if (userId) patch.doneByUserId = userId;
    if (staffId) patch.doneByStaffId = staffId;
  }
  if (result.to === "cancelled") {
    patch.cancelledAt = now;
    patch.cancelledBy = actor.kind === "guest" ? "guest" : "staff";
    if (userId) patch.cancelledByUserId = userId;
    if (staffId) patch.cancelledByStaffId = staffId;
  }
  await ctx.db.patch(request._id, patch);

  if (result.to === "cancelled") {
    await writeMenuAudit(ctx, {
      menuServiceId: request.menuServiceId,
      actorKind: actor.kind,
      ...(userId ? { actorUserId: userId } : {}),
      ...(staffId ? { actorRef: staffId } : {}),
      action: "request.cancelled",
      entityType: "request",
      entityKey: request._id,
      details: { kind: request.kind, channel: request.channel, from: request.status, by: patch.cancelledBy ?? null },
    });
  }
  return { ok: true, status: result.to, changed: true };
}
