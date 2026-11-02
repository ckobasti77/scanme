// ScanMe Menu V1 (K25) — the ONE table of reservation status transitions
// (master §11.3, §11.5, §11.7; plan docs/meni/planovi/K24.md K24-3, K24-4).
//
//   new ──accept──▶ accepted ──arrive──▶ arrived
//    │ ╲              │
//    │  ╲─propose─▶ change_proposed ──acceptProposal──▶ accepted
//    │                │
//    ├──decline──▶ declined ◀──decline── change_proposed
//    └──cancel (guest)──▶ cancelled ◀──cancel (guest or staff)── accepted, change_proposed
//
// `arrived`, `declined` and `cancelled` are final. Nothing moves on its own:
// there is no default duration, no automatic cancellation and no "no show"
// (master §11.5). The guest may only cancel, and only until the reservation
// is realized (§11.7). Staff decline a new request instead of cancelling it.
// A staff member records that the guest agreed to a proposed change
// (`acceptProposal`, K24-4); the guest never answers inside ScanMe.

import { RESERVATION_ERROR, type ReservationErrorCode } from "./errors/reservations";

export const MENU_RESERVATION_STATUSES = [
  "new",
  "accepted",
  "declined",
  "change_proposed",
  "arrived",
  "cancelled",
] as const;
export type MenuReservationStatus = (typeof MENU_RESERVATION_STATUSES)[number];

export type ReservationAction = "accept" | "decline" | "propose" | "acceptProposal" | "arrive" | "cancel";

export type ReservationActorKind = "guest" | "staff";

export type ReservationTransition =
  | { kind: "change"; to: MenuReservationStatus }
  | { kind: "same" }
  | { kind: "refused"; code: ReservationErrorCode };

const refused = (code: ReservationErrorCode): ReservationTransition => ({ kind: "refused", code });
const change = (to: MenuReservationStatus): ReservationTransition => ({ kind: "change", to });
const invalid = refused(RESERVATION_ERROR.invalidTransition);

export function isFinalReservationStatus(status: MenuReservationStatus): boolean {
  return status === "arrived" || status === "declined" || status === "cancelled";
}

/** Still in play: waits for an answer, for the guest's reply or for the guests. */
export function isOpenReservationStatus(status: MenuReservationStatus): boolean {
  return status === "new" || status === "change_proposed" || status === "accepted";
}

/** The guest may cancel until the reservation is realized (master §11.7). */
export function canGuestCancel(status: MenuReservationStatus): boolean {
  return isOpenReservationStatus(status);
}

/** Only an accepted reservation gets (or changes) its table (master §11.3 step 4). */
export function canBindPosition(status: MenuReservationStatus): boolean {
  return status === "accepted";
}

export function nextReservationStatus(
  status: MenuReservationStatus,
  action: ReservationAction,
  actor: ReservationActorKind,
): ReservationTransition {
  if (action === "cancel") {
    if (status === "cancelled") return { kind: "same" };
    if (actor === "guest") {
      return canGuestCancel(status) ? change("cancelled") : refused(RESERVATION_ERROR.notCancellable);
    }
    if (status === "accepted" || status === "change_proposed") return change("cancelled");
    // A new request is declined, not cancelled; a realized or declined one is final.
    return status === "new" ? invalid : refused(RESERVATION_ERROR.notCancellable);
  }
  // Every other action belongs to the staff.
  if (actor === "guest") return invalid;
  switch (action) {
    case "accept":
      if (status === "new") return change("accepted");
      return status === "accepted" ? { kind: "same" } : invalid;
    case "decline":
      if (status === "new" || status === "change_proposed") return change("declined");
      return status === "declined" ? { kind: "same" } : invalid;
    case "propose":
      // Proposing again replaces the earlier proposal.
      return status === "new" || status === "change_proposed" ? change("change_proposed") : invalid;
    case "acceptProposal":
      return status === "change_proposed" ? change("accepted") : invalid;
    case "arrive":
      if (status === "accepted") return change("arrived");
      return status === "arrived" ? { kind: "same" } : invalid;
  }
}
