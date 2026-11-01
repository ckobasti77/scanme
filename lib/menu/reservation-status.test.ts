// ScanMe Menu V1 (K25) — the ONE table of reservation status transitions
// (lib/menu/reservation-status.ts; master §11.3, §11.5, §11.7). The expected
// table below is written out by hand, status by status, so a change of the
// rules has to change a test as well. Invented data only.

import { describe, expect, test } from "vitest";
import { RESERVATION_ERROR } from "./errors/reservations";
import {
  MENU_RESERVATION_STATUSES,
  canBindPosition,
  canGuestCancel,
  isFinalReservationStatus,
  isOpenReservationStatus,
  nextReservationStatus,
  type MenuReservationStatus,
  type ReservationAction,
  type ReservationActorKind,
  type ReservationTransition,
} from "./reservation-status";

const ACTIONS: readonly ReservationAction[] = ["accept", "decline", "propose", "acceptProposal", "arrive", "cancel"];
const ACTORS: readonly ReservationActorKind[] = ["guest", "staff"];

const to = (status: MenuReservationStatus): ReservationTransition => ({ kind: "change", to: status });
const SAME: ReservationTransition = { kind: "same" };
const INVALID: ReservationTransition = { kind: "refused", code: RESERVATION_ERROR.invalidTransition };
const NOT_CANCELLABLE: ReservationTransition = { kind: "refused", code: RESERVATION_ERROR.notCancellable };

type Row = Record<ReservationAction, ReservationTransition>;

/** What the staff may do, per current status. */
const STAFF: Record<MenuReservationStatus, Row> = {
  new: {
    accept: to("accepted"),
    decline: to("declined"),
    propose: to("change_proposed"),
    acceptProposal: INVALID,
    arrive: INVALID,
    cancel: INVALID,
  },
  accepted: {
    accept: SAME,
    decline: INVALID,
    propose: INVALID,
    acceptProposal: INVALID,
    arrive: to("arrived"),
    cancel: to("cancelled"),
  },
  declined: {
    accept: INVALID,
    decline: SAME,
    propose: INVALID,
    acceptProposal: INVALID,
    arrive: INVALID,
    cancel: NOT_CANCELLABLE,
  },
  change_proposed: {
    accept: INVALID,
    decline: to("declined"),
    propose: to("change_proposed"),
    acceptProposal: to("accepted"),
    arrive: INVALID,
    cancel: to("cancelled"),
  },
  arrived: {
    accept: INVALID,
    decline: INVALID,
    propose: INVALID,
    acceptProposal: INVALID,
    arrive: SAME,
    cancel: NOT_CANCELLABLE,
  },
  cancelled: {
    accept: INVALID,
    decline: INVALID,
    propose: INVALID,
    acceptProposal: INVALID,
    arrive: INVALID,
    cancel: SAME,
  },
};

/** The guest only ever cancels; every other action is invalid for them. */
const guestRow = (cancel: ReservationTransition): Row => ({
  accept: INVALID,
  decline: INVALID,
  propose: INVALID,
  acceptProposal: INVALID,
  arrive: INVALID,
  cancel,
});

const GUEST: Record<MenuReservationStatus, Row> = {
  new: guestRow(to("cancelled")),
  accepted: guestRow(to("cancelled")),
  declined: guestRow(NOT_CANCELLABLE),
  change_proposed: guestRow(to("cancelled")),
  arrived: guestRow(NOT_CANCELLABLE),
  cancelled: guestRow(SAME),
};

const TABLE: Record<ReservationActorKind, Record<MenuReservationStatus, Row>> = { guest: GUEST, staff: STAFF };

const CASES = MENU_RESERVATION_STATUSES.flatMap((status) =>
  ACTIONS.flatMap((action) => ACTORS.map((actor) => [status, action, actor] as const)),
);

describe("nextReservationStatus: the whole table", () => {
  test("there are six statuses, six actions and two actors, so 72 cells", () => {
    expect(MENU_RESERVATION_STATUSES).toEqual(["new", "accepted", "declined", "change_proposed", "arrived", "cancelled"]);
    expect(CASES).toHaveLength(72);
  });

  test.each(CASES)("%s + %s by %s", (status, action, actor) => {
    expect(nextReservationStatus(status, action, actor)).toEqual(TABLE[actor][status][action]);
  });
});

describe("nextReservationStatus: the rules in words", () => {
  test("the guest may cancel only a new, a changed-proposed or an accepted reservation", () => {
    const cancellable = MENU_RESERVATION_STATUSES.filter(
      (status) => nextReservationStatus(status, "cancel", "guest").kind === "change",
    );
    expect(cancellable).toEqual(["new", "accepted", "change_proposed"]);
    for (const status of cancellable) {
      expect(nextReservationStatus(status, "cancel", "guest")).toEqual({ kind: "change", to: "cancelled" });
    }
  });

  test("a guest cancelling an arrived or declined reservation gets reservation/not_cancellable", () => {
    for (const status of ["arrived", "declined"] as const) {
      expect(nextReservationStatus(status, "cancel", "guest")).toEqual({
        kind: "refused",
        code: "reservation/not_cancellable",
      });
    }
  });

  test("the guest has no other action: accept, decline, propose, acceptProposal and arrive are invalid transitions", () => {
    for (const status of MENU_RESERVATION_STATUSES) {
      for (const action of ["accept", "decline", "propose", "acceptProposal", "arrive"] as const) {
        expect(nextReservationStatus(status, action, "guest"), `${status} ${action}`).toEqual({
          kind: "refused",
          code: "reservation/invalid_transition",
        });
      }
    }
  });

  test("staff decline a new request instead of cancelling it: cancelling it is reservation/invalid_transition", () => {
    expect(nextReservationStatus("new", "cancel", "staff")).toEqual({
      kind: "refused",
      code: "reservation/invalid_transition",
    });
    expect(nextReservationStatus("new", "decline", "staff")).toEqual({ kind: "change", to: "declined" });
  });

  test("staff may cancel an accepted or a change-proposed reservation, not a realized or declined one", () => {
    expect(nextReservationStatus("accepted", "cancel", "staff")).toEqual({ kind: "change", to: "cancelled" });
    expect(nextReservationStatus("change_proposed", "cancel", "staff")).toEqual({ kind: "change", to: "cancelled" });
    expect(nextReservationStatus("arrived", "cancel", "staff")).toEqual({ kind: "refused", code: "reservation/not_cancellable" });
    expect(nextReservationStatus("declined", "cancel", "staff")).toEqual({ kind: "refused", code: "reservation/not_cancellable" });
  });

  test("repeating a transition that already happened is 'same', never an error", () => {
    expect(nextReservationStatus("accepted", "accept", "staff")).toEqual({ kind: "same" });
    expect(nextReservationStatus("declined", "decline", "staff")).toEqual({ kind: "same" });
    expect(nextReservationStatus("arrived", "arrive", "staff")).toEqual({ kind: "same" });
    for (const actor of ACTORS) {
      expect(nextReservationStatus("cancelled", "cancel", actor)).toEqual({ kind: "same" });
    }
  });

  test("proposing again replaces the earlier proposal (a change to change_proposed, not 'same')", () => {
    expect(nextReservationStatus("change_proposed", "propose", "staff")).toEqual({ kind: "change", to: "change_proposed" });
  });

  test("recording that the guest agreed to a proposal accepts the reservation, and only from change_proposed", () => {
    expect(nextReservationStatus("change_proposed", "acceptProposal", "staff")).toEqual({ kind: "change", to: "accepted" });
    for (const status of MENU_RESERVATION_STATUSES.filter((s) => s !== "change_proposed")) {
      expect(nextReservationStatus(status, "acceptProposal", "staff"), status).toEqual({
        kind: "refused",
        code: "reservation/invalid_transition",
      });
    }
  });

  test("a guest arrives only from accepted: a new or proposed request has no table to arrive at", () => {
    expect(nextReservationStatus("accepted", "arrive", "staff")).toEqual({ kind: "change", to: "arrived" });
    for (const status of ["new", "change_proposed", "declined", "cancelled"] as const) {
      expect(nextReservationStatus(status, "arrive", "staff"), status).toEqual({
        kind: "refused",
        code: "reservation/invalid_transition",
      });
    }
  });

  test("nothing ever leaves a final status (no 'change' from arrived, declined or cancelled)", () => {
    for (const status of MENU_RESERVATION_STATUSES.filter(isFinalReservationStatus)) {
      for (const action of ACTIONS) {
        for (const actor of ACTORS) {
          expect(nextReservationStatus(status, action, actor).kind, `${status} ${action} ${actor}`).not.toBe("change");
        }
      }
    }
  });

  test("every 'change' lands on a known status different from where it started", () => {
    for (const [status, action, actor] of CASES) {
      const result = nextReservationStatus(status, action, actor);
      if (result.kind !== "change") continue;
      expect(MENU_RESERVATION_STATUSES).toContain(result.to);
      if (!(status === "change_proposed" && action === "propose")) expect(result.to).not.toBe(status);
    }
  });

  test("a whole life: new, proposal, agreed, arrived", () => {
    const steps: [ReservationAction, ReservationActorKind, MenuReservationStatus][] = [
      ["propose", "staff", "change_proposed"],
      ["acceptProposal", "staff", "accepted"],
      ["arrive", "staff", "arrived"],
    ];
    let status: MenuReservationStatus = "new";
    for (const [action, actor, expected] of steps) {
      const result = nextReservationStatus(status, action, actor);
      expect(result).toEqual({ kind: "change", to: expected });
      status = expected;
    }
    expect(isFinalReservationStatus(status)).toBe(true);
  });
});

describe("status predicates", () => {
  test("final statuses are arrived, declined and cancelled", () => {
    expect(MENU_RESERVATION_STATUSES.filter(isFinalReservationStatus)).toEqual(["declined", "arrived", "cancelled"]);
    expect(isFinalReservationStatus("new")).toBe(false);
    expect(isFinalReservationStatus("accepted")).toBe(false);
    expect(isFinalReservationStatus("change_proposed")).toBe(false);
  });

  test("open statuses are new, change_proposed and accepted, exactly the non-final ones", () => {
    expect(MENU_RESERVATION_STATUSES.filter(isOpenReservationStatus)).toEqual(["new", "accepted", "change_proposed"]);
    for (const status of MENU_RESERVATION_STATUSES) {
      expect(isOpenReservationStatus(status), status).toBe(!isFinalReservationStatus(status));
    }
  });

  test("canGuestCancel is true for new, change_proposed and accepted only", () => {
    expect(MENU_RESERVATION_STATUSES.filter(canGuestCancel)).toEqual(["new", "accepted", "change_proposed"]);
    expect(canGuestCancel("arrived")).toBe(false);
    expect(canGuestCancel("declined")).toBe(false);
    expect(canGuestCancel("cancelled")).toBe(false);
  });

  test("canGuestCancel agrees with what nextReservationStatus does for a guest", () => {
    for (const status of MENU_RESERVATION_STATUSES) {
      if (status === "cancelled") continue;
      expect(canGuestCancel(status), status).toBe(nextReservationStatus(status, "cancel", "guest").kind === "change");
    }
  });

  test("a table can be bound only to an accepted reservation", () => {
    expect(MENU_RESERVATION_STATUSES.filter(canBindPosition)).toEqual(["accepted"]);
    for (const status of ["new", "declined", "change_proposed", "arrived", "cancelled"] as const) {
      expect(canBindPosition(status), status).toBe(false);
    }
  });
});
