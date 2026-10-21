// ScanMe Menu V1 (K21) — which guest actions a scanned position offers
// (master §8.1, §8.3, §9.1; plan docs/meni/planovi/K19.md K19-5). One pure
// rule, shared by the server (menuGuest.sessionView and every guest mutation)
// and the izlog, so what the guest sees and what the server accepts never
// differ.
//
//   table, other   call the waiter, ask for the bill, order from the
//                  standard pages — each only when the venue turned it on;
//   room           only a Room service order: no call, no bill, no order at
//                  the standard prices (the Room service markup must not be
//                  bypassed). It needs Room service AND ordering on, Premium on
//                  the account and a Room service part in the live version.
//
// Without a position there are no actions at all (nothing is invented).

export type GuestPositionKind = "table" | "room" | "other";

/** Sub-paths of `/{slug}/meni` (reserved page slugs, lib/menu/slugs.ts). */
export const MENU_ROOM_SERVICE_PATH = "room-service";
export const MENU_MY_REQUESTS_PATH = "zahtevi";

export type GuestActions = {
  call: boolean;
  bill: boolean;
  /** An order at the standard prices, from the standard pages. */
  order: boolean;
  /** A Room service order (Room service prices, the delivery fee once). */
  roomService: boolean;
};

export const NO_GUEST_ACTIONS: GuestActions = { call: false, bill: false, order: false, roomService: false };

export type GuestActionsInput = {
  features: { callWaiter: boolean; billRequest: boolean; ordering: boolean; roomService: boolean };
  kind: GuestPositionKind;
  /** The account's Premium unlocks Room service (lib/menu/capabilities.ts `roomService`). */
  premiumRoomService: boolean;
  /** The live version carries a Room service part (`_rs`). */
  roomServicePublished: boolean;
};

export function guestActionsFor(input: GuestActionsInput): GuestActions {
  const { features, kind } = input;
  if (kind === "room") {
    return {
      ...NO_GUEST_ACTIONS,
      roomService:
        features.roomService && features.ordering && input.premiumRoomService && input.roomServicePublished,
    };
  }
  return {
    call: features.callWaiter,
    bill: features.billRequest,
    order: features.ordering,
    roomService: false,
  };
}

export function hasGuestActions(actions: GuestActions): boolean {
  return actions.call || actions.bill || actions.order || actions.roomService;
}
