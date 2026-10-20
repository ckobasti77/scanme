// ScanMe Menu V1 (K21) — which guest actions a scanned position offers
// (master §8.1, §8.3, §9.1; plan K19-5).

import { describe, expect, test } from "vitest";
import {
  MENU_MY_REQUESTS_PATH,
  MENU_ROOM_SERVICE_PATH,
  NO_GUEST_ACTIONS,
  guestActionsFor,
  hasGuestActions,
  type GuestActions,
  type GuestActionsInput,
} from "./guest-actions";

const ALL_ON: GuestActionsInput["features"] = { callWaiter: true, billRequest: true, ordering: true, roomService: true };
const ALL_OFF: GuestActionsInput["features"] = { callWaiter: false, billRequest: false, ordering: false, roomService: false };

function input(fields: Partial<GuestActionsInput> & Pick<GuestActionsInput, "kind">): GuestActionsInput {
  return { features: ALL_ON, premiumRoomService: true, roomServicePublished: true, ...fields };
}

describe("path constants", () => {
  test("are the reserved sub-paths of /{slug}/meni", () => {
    expect(MENU_ROOM_SERVICE_PATH).toBe("room-service");
    expect(MENU_MY_REQUESTS_PATH).toBe("zahtevi");
  });
});

describe("NO_GUEST_ACTIONS", () => {
  test("offers nothing", () => {
    expect(NO_GUEST_ACTIONS).toEqual({ call: false, bill: false, order: false, roomService: false });
    expect(hasGuestActions(NO_GUEST_ACTIONS)).toBe(false);
  });
});

describe("guestActionsFor: a table and an other position", () => {
  test.each(["table", "other"] as const)("%s: every switch maps to its own action", (kind) => {
    expect(guestActionsFor(input({ kind, features: { ...ALL_OFF, callWaiter: true } }))).toEqual({
      call: true,
      bill: false,
      order: false,
      roomService: false,
    });
    expect(guestActionsFor(input({ kind, features: { ...ALL_OFF, billRequest: true } }))).toEqual({
      call: false,
      bill: true,
      order: false,
      roomService: false,
    });
    expect(guestActionsFor(input({ kind, features: { ...ALL_OFF, ordering: true } }))).toEqual({
      call: false,
      bill: false,
      order: true,
      roomService: false,
    });
  });

  test.each(["table", "other"] as const)("%s: all switches on offer call, bill and order", (kind) => {
    expect(guestActionsFor(input({ kind }))).toEqual({ call: true, bill: true, order: true, roomService: false });
  });

  test.each(["table", "other"] as const)("%s: all switches off offer nothing", (kind) => {
    expect(guestActionsFor(input({ kind, features: ALL_OFF }))).toEqual(NO_GUEST_ACTIONS);
  });

  test.each(["table", "other"] as const)("%s: roomService is false even when everything for it is on", (kind) => {
    const actions = guestActionsFor(input({ kind, premiumRoomService: true, roomServicePublished: true }));
    expect(actions.roomService).toBe(false);
  });

  test.each(["table", "other"] as const)("%s: Premium and a published Room service part do not change the table actions", (kind) => {
    const features = { ...ALL_OFF, callWaiter: true, ordering: true };
    const withRs = guestActionsFor(input({ kind, features, premiumRoomService: true, roomServicePublished: true }));
    const withoutRs = guestActionsFor(input({ kind, features, premiumRoomService: false, roomServicePublished: false }));
    expect(withRs).toEqual({ call: true, bill: false, order: true, roomService: false });
    expect(withoutRs).toEqual(withRs);
  });
});

describe("guestActionsFor: a room", () => {
  test("offers only Room service when everything for it is on", () => {
    expect(guestActionsFor(input({ kind: "room" }))).toEqual({ call: false, bill: false, order: false, roomService: true });
  });

  test("never offers call, bill or an order at the standard prices, whatever the switches say", () => {
    for (const features of [ALL_ON, ALL_OFF, { ...ALL_OFF, callWaiter: true, billRequest: true, ordering: true }]) {
      const actions = guestActionsFor(input({ kind: "room", features }));
      expect(actions.call).toBe(false);
      expect(actions.bill).toBe(false);
      expect(actions.order).toBe(false);
    }
  });

  test("Room service is off when the venue's Room service switch is off", () => {
    expect(guestActionsFor(input({ kind: "room", features: { ...ALL_ON, roomService: false } })).roomService).toBe(false);
  });

  test("Room service is off when ordering is off", () => {
    expect(guestActionsFor(input({ kind: "room", features: { ...ALL_ON, ordering: false } })).roomService).toBe(false);
  });

  test("Room service is off without Premium on the account", () => {
    expect(guestActionsFor(input({ kind: "room", premiumRoomService: false })).roomService).toBe(false);
  });

  test("Room service is off without a Room service part in the live version", () => {
    expect(guestActionsFor(input({ kind: "room", roomServicePublished: false })).roomService).toBe(false);
  });

  test("a room with the call and bill switches on but no Room service has no action at all", () => {
    const actions = guestActionsFor(input({ kind: "room", features: { ...ALL_ON, roomService: false } }));
    expect(actions).toEqual(NO_GUEST_ACTIONS);
    expect(hasGuestActions(actions)).toBe(false);
  });

  test("does not hand out the shared NO_GUEST_ACTIONS object", () => {
    const actions = guestActionsFor(input({ kind: "room", premiumRoomService: false }));
    expect(actions).toEqual(NO_GUEST_ACTIONS);
    expect(actions).not.toBe(NO_GUEST_ACTIONS);
  });
});

describe("hasGuestActions", () => {
  test("is false when nothing is offered", () => {
    expect(hasGuestActions({ call: false, bill: false, order: false, roomService: false })).toBe(false);
  });

  test.each(["call", "bill", "order", "roomService"] as const)("is true when only %s is offered", (name) => {
    const actions: GuestActions = { ...NO_GUEST_ACTIONS, [name]: true };
    expect(hasGuestActions(actions)).toBe(true);
  });

  test("agrees with guestActionsFor for a table with every switch off and on", () => {
    expect(hasGuestActions(guestActionsFor(input({ kind: "table", features: ALL_OFF })))).toBe(false);
    expect(hasGuestActions(guestActionsFor(input({ kind: "table" })))).toBe(true);
  });
});
