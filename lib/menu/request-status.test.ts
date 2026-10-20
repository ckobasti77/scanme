// ScanMe Menu V1 (K21) — the table of request status transitions (master §8.4;
// plan K19-6). Every cell of nextStatus: 4 statuses x 3 actions x 3 actors
// (guest, the staff member who accepted it, another staff member).

import { describe, expect, test } from "vitest";
import type { RequestErrorCode } from "./errors/requests";
import {
  LEGACY_KIND_MAP,
  LEGACY_STATUS_MAP,
  MENU_REQUEST_KINDS,
  MENU_REQUEST_STATUSES,
  REQUEST_STATUS_TONE,
  isFinalStatus,
  isOpenStatus,
  nextStatus,
  statusFromLegacy,
  type LegacyRequestStatus,
  type MenuRequestStatus,
  type RequestAction,
  type RequestActor,
  type TransitionResult,
} from "./request-status";

const GUEST: RequestActor = { kind: "guest" };
const STAFF_SAME: RequestActor = { kind: "staff", ref: "staff:ana" };
const STAFF_OTHER: RequestActor = { kind: "staff", ref: "staff:bojan" };

const ACTIONS: RequestAction[] = ["accept", "done", "cancel"];

const change = (to: MenuRequestStatus, alsoAccepted = false): TransitionResult => ({ kind: "change", to, alsoAccepted });
const SAME: TransitionResult = { kind: "same" };
const refused = (code: RequestErrorCode): TransitionResult => ({ kind: "refused", code });

const NOT_CANCELLABLE = "request/not_cancellable";
const INVALID_TRANSITION = "request/invalid_transition";
const TAKEN = "request/taken";

/** The request as it stands: `staff:ana` accepted it (a new request has no one yet). */
const stateOf = (status: MenuRequestStatus) => ({
  status,
  acceptedByRef: status === "new" ? null : "staff:ana",
});

// status, action -> [guest, staff who accepted it, another staff member]
const MATRIX: [MenuRequestStatus, RequestAction, TransitionResult, TransitionResult, TransitionResult][] = [
  // accept
  ["new", "accept", refused(INVALID_TRANSITION), change("accepted"), change("accepted")],
  ["accepted", "accept", refused(INVALID_TRANSITION), SAME, refused(TAKEN)],
  ["done", "accept", refused(INVALID_TRANSITION), refused(INVALID_TRANSITION), refused(INVALID_TRANSITION)],
  ["cancelled", "accept", refused(INVALID_TRANSITION), refused(INVALID_TRANSITION), refused(INVALID_TRANSITION)],
  // done
  ["new", "done", refused(INVALID_TRANSITION), change("done", true), change("done", true)],
  ["accepted", "done", refused(INVALID_TRANSITION), change("done"), change("done")],
  ["done", "done", refused(INVALID_TRANSITION), SAME, SAME],
  ["cancelled", "done", refused(INVALID_TRANSITION), refused(INVALID_TRANSITION), refused(INVALID_TRANSITION)],
  // cancel
  ["new", "cancel", change("cancelled"), change("cancelled"), change("cancelled")],
  ["accepted", "cancel", refused(NOT_CANCELLABLE), change("cancelled"), change("cancelled")],
  ["done", "cancel", refused(NOT_CANCELLABLE), refused(INVALID_TRANSITION), refused(INVALID_TRANSITION)],
  ["cancelled", "cancel", SAME, SAME, SAME],
];

const CELLS = MATRIX.flatMap(([status, action, guest, staffSame, staffOther]) => [
  { status, action, who: "guest", actor: GUEST, expected: guest },
  { status, action, who: "staff (the one who accepted it)", actor: STAFF_SAME, expected: staffSame },
  { status, action, who: "staff (another ref)", actor: STAFF_OTHER, expected: staffOther },
]);

describe("MENU_REQUEST_STATUSES", () => {
  test("is exactly new, accepted, done, cancelled (no enroute)", () => {
    expect([...MENU_REQUEST_STATUSES]).toEqual(["new", "accepted", "done", "cancelled"]);
    expect(MENU_REQUEST_STATUSES as readonly string[]).not.toContain("enroute");
  });

  test("the request kinds are call, bill, order", () => {
    expect([...MENU_REQUEST_KINDS]).toEqual(["call", "bill", "order"]);
  });
});

describe("nextStatus: every cell of the table", () => {
  test("the table covers every status x action once", () => {
    const keys = MATRIX.map(([status, action]) => `${status}/${action}`);
    expect(new Set(keys).size).toBe(MENU_REQUEST_STATUSES.length * ACTIONS.length);
    for (const status of MENU_REQUEST_STATUSES) {
      for (const action of ACTIONS) expect(keys).toContain(`${status}/${action}`);
    }
    expect(CELLS).toHaveLength(36);
  });

  test.each(CELLS)("$status + $action by $who", ({ status, action, actor, expected }) => {
    expect(nextStatus(stateOf(status), action, actor)).toEqual(expected);
  });

  test("a guest may only cancel a new request", () => {
    expect(nextStatus(stateOf("new"), "cancel", GUEST)).toEqual(change("cancelled"));
    expect(nextStatus(stateOf("accepted"), "cancel", GUEST)).toEqual(refused("request/not_cancellable"));
    expect(nextStatus(stateOf("done"), "cancel", GUEST)).toEqual(refused("request/not_cancellable"));
  });

  test("a guest can neither accept nor finish a request, whatever its status", () => {
    for (const status of MENU_REQUEST_STATUSES) {
      expect(nextStatus(stateOf(status), "accept", GUEST)).toEqual(refused("request/invalid_transition"));
      expect(nextStatus(stateOf(status), "done", GUEST)).toEqual(refused("request/invalid_transition"));
    }
  });

  test("done straight from new also accepts it; from accepted it does not", () => {
    expect(nextStatus(stateOf("new"), "done", STAFF_OTHER)).toEqual({ kind: "change", to: "done", alsoAccepted: true });
    expect(nextStatus(stateOf("accepted"), "done", STAFF_OTHER)).toEqual({ kind: "change", to: "done", alsoAccepted: false });
  });

  test("alsoAccepted is true only for done from new, and only for staff", () => {
    const withAlso = CELLS.filter((cell) => cell.expected.kind === "change" && cell.expected.alsoAccepted);
    expect(withAlso).toHaveLength(2);
    for (const cell of withAlso) {
      expect(cell.status).toBe("new");
      expect(cell.action).toBe("done");
      expect(cell.actor.kind).toBe("staff");
    }
  });
});

describe("isFinalStatus and isOpenStatus", () => {
  test("done and cancelled are final, new and accepted are not", () => {
    expect(isFinalStatus("new")).toBe(false);
    expect(isFinalStatus("accepted")).toBe(false);
    expect(isFinalStatus("done")).toBe(true);
    expect(isFinalStatus("cancelled")).toBe(true);
  });

  test("new and accepted are open, done and cancelled are not", () => {
    expect(isOpenStatus("new")).toBe(true);
    expect(isOpenStatus("accepted")).toBe(true);
    expect(isOpenStatus("done")).toBe(false);
    expect(isOpenStatus("cancelled")).toBe(false);
  });

  test("every status is exactly one of final or open", () => {
    for (const status of MENU_REQUEST_STATUSES) expect(isFinalStatus(status)).toBe(!isOpenStatus(status));
  });
});

describe("legacy RFC-004 mapping", () => {
  test("LEGACY_STATUS_MAP is exactly sent to new, accepted, enroute to accepted, completed to done, withdrawn to cancelled", () => {
    expect(LEGACY_STATUS_MAP).toEqual({
      sent: "new",
      accepted: "accepted",
      enroute: "accepted",
      completed: "done",
      withdrawn: "cancelled",
    });
  });

  test("every legacy status maps onto a status of the new model", () => {
    for (const value of Object.values(LEGACY_STATUS_MAP)) {
      expect(MENU_REQUEST_STATUSES as readonly string[]).toContain(value);
    }
  });

  test("LEGACY_KIND_MAP maps call to call and order to order", () => {
    expect(LEGACY_KIND_MAP).toEqual({ call: "call", order: "order" });
    for (const value of Object.values(LEGACY_KIND_MAP)) {
      expect(MENU_REQUEST_KINDS as readonly string[]).toContain(value);
    }
  });

  test.each([
    ["sent", "new"],
    ["accepted", "accepted"],
    ["enroute", "accepted"],
    ["completed", "done"],
    ["withdrawn", "cancelled"],
  ] as [LegacyRequestStatus, MenuRequestStatus][])("statusFromLegacy(%s) is %s", (legacy, expected) => {
    expect(statusFromLegacy(legacy)).toBe(expected);
  });
});

describe("REQUEST_STATUS_TONE", () => {
  test("has a tone for each of the four statuses and nothing else", () => {
    expect(REQUEST_STATUS_TONE).toEqual({
      new: "info",
      accepted: "neutralno",
      done: "uspeh",
      cancelled: "neutralno",
    });
    expect(Object.keys(REQUEST_STATUS_TONE).sort()).toEqual([...MENU_REQUEST_STATUSES].sort());
  });
});
