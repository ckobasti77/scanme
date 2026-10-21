// ScanMe Menu V1 (K21) — the ONE table of request status transitions
// (master §8.4; plan docs/meni/planovi/K19.md K19-6).
//
//   new ──accept──▶ accepted ──done──▶ done
//    │                 │
//    ├──done (one tap: accepted and finished at once)
//    └──cancel──▶ cancelled ◀──cancel (staff only)── accepted
//
// `done` and `cancelled` are final. There is no "Konobar je krenuo". A guest
// may only cancel their own request while it is still `new`; staff (a waiter
// with a PIN from K22, or an Owner/Manager with their account) may also
// cancel an accepted one. Repeating the same transition is idempotent; a
// request someone else already accepted answers `request/taken`.
//
// The legacy RFC-004 statuses map onto these for reports and analytics only
// (K06/K29/K35); the legacy tables are never rewritten (K19-1).

import { REQUEST_ERROR, type RequestErrorCode } from "./errors/requests";

export const MENU_REQUEST_STATUSES = ["new", "accepted", "done", "cancelled"] as const;
export type MenuRequestStatus = (typeof MENU_REQUEST_STATUSES)[number];

export const MENU_REQUEST_KINDS = ["call", "bill", "order"] as const;
export type MenuRequestKind = (typeof MENU_REQUEST_KINDS)[number];

export type MenuRequestChannel = "standard" | "room_service";
export type MenuPaymentPreference = "cash" | "card";

export type RequestAction = "accept" | "done" | "cancel";

/**
 * Who acts. `ref` identifies a staff actor across calls (`user:<id>` for an
 * account, `staff:<id>` for a PIN waiter from K22), so a repeated accept by
 * the same person is recognised.
 */
export type RequestActor = { kind: "guest" } | { kind: "staff"; ref: string };

export type RequestState = {
  status: MenuRequestStatus;
  /** The `ref` of whoever accepted it; null while nobody has. */
  acceptedByRef: string | null;
};

export type TransitionResult =
  | { kind: "change"; to: MenuRequestStatus; /** `done` straight from `new`: accepted at the same moment. */ alsoAccepted: boolean }
  | { kind: "same" }
  | { kind: "refused"; code: RequestErrorCode };

const refused = (code: RequestErrorCode): TransitionResult => ({ kind: "refused", code });

export function isFinalStatus(status: MenuRequestStatus): boolean {
  return status === "done" || status === "cancelled";
}

/** Still waiting for the staff (shown in the work queue and counted as open). */
export function isOpenStatus(status: MenuRequestStatus): boolean {
  return status === "new" || status === "accepted";
}

export function nextStatus(state: RequestState, action: RequestAction, actor: RequestActor): TransitionResult {
  const { status } = state;
  if (action === "cancel") {
    if (status === "cancelled") return { kind: "same" };
    if (status === "done") return refused(actor.kind === "guest" ? REQUEST_ERROR.notCancellable : REQUEST_ERROR.invalidTransition);
    if (status === "accepted" && actor.kind === "guest") return refused(REQUEST_ERROR.notCancellable);
    return { kind: "change", to: "cancelled", alsoAccepted: false };
  }
  // Accepting and finishing belong to the staff only.
  if (actor.kind === "guest") return refused(REQUEST_ERROR.invalidTransition);
  if (action === "accept") {
    if (status === "new") return { kind: "change", to: "accepted", alsoAccepted: false };
    if (status === "accepted") {
      return state.acceptedByRef === actor.ref ? { kind: "same" } : refused(REQUEST_ERROR.requestTaken);
    }
    return refused(REQUEST_ERROR.invalidTransition);
  }
  // done
  if (status === "new") return { kind: "change", to: "done", alsoAccepted: true };
  if (status === "accepted") return { kind: "change", to: "done", alsoAccepted: false };
  if (status === "done") return { kind: "same" };
  return refused(REQUEST_ERROR.invalidTransition);
}

// -----------------------------------------------------------------------------
// Legacy RFC-004 (serviceRequests) → this model, for reports only (K19-1)
// -----------------------------------------------------------------------------

export const LEGACY_STATUS_MAP = {
  sent: "new",
  accepted: "accepted",
  enroute: "accepted",
  completed: "done",
  withdrawn: "cancelled",
} as const satisfies Record<string, MenuRequestStatus>;

export const LEGACY_KIND_MAP = { call: "call", order: "order" } as const satisfies Record<string, MenuRequestKind>;

export type LegacyRequestStatus = keyof typeof LEGACY_STATUS_MAP;

export function statusFromLegacy(status: LegacyRequestStatus): MenuRequestStatus {
  return LEGACY_STATUS_MAP[status];
}

// -----------------------------------------------------------------------------
// Presentation hints (MENU-UX §5.2): the tone of StatusOznaka per status. The
// icon and the word always go with the colour.
// -----------------------------------------------------------------------------

export type RequestStatusTone = "info" | "neutralno" | "uspeh";

export const REQUEST_STATUS_TONE: Record<MenuRequestStatus, RequestStatusTone> = {
  new: "info",
  accepted: "neutralno",
  done: "uspeh",
  cancelled: "neutralno",
};
