// ScanMe Menu V1 (K25) — reservations on the waiter panel
// (lib/menu/reservation-queue.ts; master §10.2-§10.4, §11.3, §11.7): the
// groups of the `Rezervacije` filter, the `Uskoro` section, what a table shows
// on the floor. Reference "now": Wed 21 Oct 2026, 18:00 Belgrade (CEST); the
// hold is 15 minutes. Invented guests only.

import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "../belgrade-time";
import {
  RESERVATION_CANCELLED_ON_TABLE_MS,
  RESERVATION_CANCELLED_SHOWN_MS,
  RESERVATION_GROUP_KEYS,
  RESERVATION_ON_TABLE_FROM_MS,
  groupReservations,
  guestReservationCancellationsSince,
  newReservationArrivals,
  newReservationCount,
  reservationsByTable,
  reservationsOfTable,
  soonReservations,
  unboundToday,
  type ReservationRow,
} from "./reservation-queue";

const MIN = 60_000;
const HOUR = 60 * MIN;

function local(value: string): number {
  const epoch = belgradeLocalToEpoch(value);
  if (epoch === null) throw new Error(`bad local time ${value}`);
  return epoch;
}

const NOW = local("2026-10-21T18:00");
const HOLD = 15;
/** `minutes` from now (negative = ago). */
const at = (minutes: number) => NOW + minutes * MIN;

function row(id: string, over: Partial<ReservationRow> = {}): ReservationRow {
  return {
    id,
    status: "accepted",
    guestName: `Gost ${id}`,
    partySize: 2,
    requestedAt: at(300),
    createdAt: 1_000,
    positionId: null,
    positionLabel: null,
    hasNote: false,
    proposedAt: null,
    arrivedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    ...over,
  };
}

const ids = (rows: readonly ReservationRow[]) => rows.map((item) => item.id);

describe("constants", () => {
  test("the windows of the panel", () => {
    expect(RESERVATION_CANCELLED_SHOWN_MS).toBe(12 * HOUR);
    expect(RESERVATION_ON_TABLE_FROM_MS).toBe(120 * MIN);
    expect(RESERVATION_CANCELLED_ON_TABLE_MS).toBe(2 * HOUR);
    expect(RESERVATION_GROUP_KEYS).toEqual(["cekajuOdgovor", "kasne", "uskoro", "danas", "kasnije", "stigli", "otkazane"]);
  });
});

describe("groupReservations", () => {
  const MIXED: ReservationRow[] = [
    row("z2", { requestedAt: local("2026-10-23T19:00") }),
    row("n1", { status: "new", createdAt: 2_000 }),
    row("k2", { requestedAt: at(-15) }),
    row("p1", { status: "change_proposed", createdAt: 500, proposedAt: at(-10) }),
    row("u3", { requestedAt: at(120) }),
    row("s2", { status: "arrived", arrivedAt: at(-90) }),
    row("o2", { status: "cancelled", cancelledAt: at(-600), cancelledBy: "staff" }),
    row("d2", { requestedAt: local("2026-10-21T23:30") }),
    row("x1", { status: "declined" }),
    row("u1", { requestedAt: at(-5) }),
    row("n2", { status: "new", createdAt: 1_000 }),
    row("k1", { requestedAt: at(-30) }),
    row("s1", { status: "arrived", arrivedAt: at(-30) }),
    row("d1", { requestedAt: at(121) }),
    row("o1", { status: "cancelled", cancelledAt: at(-60), cancelledBy: "guest" }),
    row("z1", { requestedAt: local("2026-10-22T12:00") }),
    row("u2", { requestedAt: at(119) }),
    row("s3", { status: "arrived", arrivedAt: local("2026-10-20T23:59") }),
    row("s4", { status: "arrived", arrivedAt: null }),
    row("o3", { status: "cancelled", cancelledAt: at(-13 * 60), cancelledBy: "guest" }),
    row("o4", { status: "cancelled", cancelledAt: null }),
  ];

  test("every status lands in its own group, in the right order", () => {
    const groups = groupReservations(MIXED, NOW, HOLD);
    // New ones, the oldest request first, then the proposals waiting for the guest.
    expect(ids(groups.cekajuOdgovor)).toEqual(["n2", "n1", "p1"]);
    // Accepted, past the hold: the longest overdue first.
    expect(ids(groups.kasne)).toEqual(["k1", "k2"]);
    // Accepted, within two hours or just come: by time.
    expect(ids(groups.uskoro)).toEqual(["u1", "u2", "u3"]);
    // Accepted, later today (more than two hours away): by time.
    expect(ids(groups.danas)).toEqual(["d1", "d2"]);
    // Accepted, another day: by time.
    expect(ids(groups.kasnije)).toEqual(["z1", "z2"]);
    // Arrived today, the latest arrival first.
    expect(ids(groups.stigli)).toEqual(["s1", "s2"]);
    // Cancelled in the last 12 hours, the newest first.
    expect(ids(groups.otkazane)).toEqual(["o1", "o2"]);
  });

  test("a declined reservation is in no group at all", () => {
    const groups = groupReservations(MIXED, NOW, HOLD);
    for (const key of RESERVATION_GROUP_KEYS) expect(ids(groups[key]), key).not.toContain("x1");
    expect(ids(groupReservations([row("x1", { status: "declined" })], NOW, HOLD).cekajuOdgovor)).toEqual([]);
  });

  test("the order of the input does not matter, and the input is not touched", () => {
    const forward = groupReservations(MIXED, NOW, HOLD);
    const backward = groupReservations([...MIXED].reverse(), NOW, HOLD);
    for (const key of RESERVATION_GROUP_KEYS) expect(ids(backward[key]), key).toEqual(ids(forward[key]));
    const frozen = Object.freeze([...MIXED]);
    expect(() => groupReservations(frozen, NOW, HOLD)).not.toThrow();
    expect(ids(frozen)).toEqual(ids(MIXED));
  });

  test("an empty list gives seven empty groups", () => {
    const groups = groupReservations([], NOW, HOLD);
    expect(Object.keys(groups).sort()).toEqual([...RESERVATION_GROUP_KEYS].sort());
    for (const key of RESERVATION_GROUP_KEYS) expect(groups[key]).toEqual([]);
  });

  test("a new request waits for an answer whatever its time, a proposal goes after all the new ones", () => {
    const groups = groupReservations(
      [
        row("p1", { status: "change_proposed", createdAt: 100 }),
        row("n1", { status: "new", createdAt: 9_000, requestedAt: at(-600) }),
        row("n2", { status: "new", createdAt: 8_000, requestedAt: at(60 * 24 * 10) }),
      ],
      NOW,
      HOLD,
    );
    expect(ids(groups.cekajuOdgovor)).toEqual(["n2", "n1", "p1"]);
  });

  test("proposals are ordered among themselves, oldest first", () => {
    const groups = groupReservations(
      [
        row("p2", { status: "change_proposed", createdAt: 300 }),
        row("p1", { status: "change_proposed", createdAt: 200 }),
        row("n1", { status: "new", createdAt: 900 }),
      ],
      NOW,
      HOLD,
    );
    expect(ids(groups.cekajuOdgovor)).toEqual(["n1", "p1", "p2"]);
  });

  test("ties are broken by creation time, then by id", () => {
    const groups = groupReservations(
      [
        row("b", { status: "new", createdAt: 10 }),
        row("a", { status: "new", createdAt: 10 }),
        row("y2", { requestedAt: at(60), createdAt: 20 }),
        row("y1", { requestedAt: at(60), createdAt: 30 }),
        row("y0", { requestedAt: at(60), createdAt: 20 }),
      ],
      NOW,
      HOLD,
    );
    expect(ids(groups.cekajuOdgovor)).toEqual(["a", "b"]);
    expect(ids(groups.uskoro)).toEqual(["y0", "y2", "y1"]);
  });

  test("the hold decides between 'uskoro' (the time has come) and 'kasne' (past the hold)", () => {
    const rows = [row("edge", { requestedAt: at(-15) }), row("inside", { requestedAt: at(-15) + 1_000 })];
    const groups = groupReservations(rows, NOW, 15);
    expect(ids(groups.kasne)).toEqual(["edge"]);
    expect(ids(groups.uskoro)).toEqual(["inside"]);

    const twenty = row("twenty", { requestedAt: at(-20) });
    expect(ids(groupReservations([twenty], NOW, 30).uskoro)).toEqual(["twenty"]);
    expect(ids(groupReservations([twenty], NOW, 30).kasne)).toEqual([]);
    expect(ids(groupReservations([twenty], NOW, 5).kasne)).toEqual(["twenty"]);
  });

  test("an accepted reservation of yesterday is long overdue, not 'kasnije'", () => {
    const groups = groupReservations([row("old", { requestedAt: local("2026-10-20T20:00") })], NOW, HOLD);
    expect(ids(groups.kasne)).toEqual(["old"]);
    expect(ids(groups.kasnije)).toEqual([]);
  });

  test("two hours ahead is 'uskoro', one millisecond more is 'danas' (later today)", () => {
    const groups = groupReservations([row("in", { requestedAt: at(120) }), row("out", { requestedAt: at(120) + 1 })], NOW, HOLD);
    expect(ids(groups.uskoro)).toEqual(["in"]);
    expect(ids(groups.danas)).toEqual(["out"]);
  });

  test("'danas' and 'kasnije' follow the Belgrade calendar day, not 24 hours", () => {
    const late = local("2026-10-21T23:59");
    const groups = groupReservations(
      [row("lastMinute", { requestedAt: late }), row("justAfter", { requestedAt: late + MIN })],
      NOW,
      HOLD,
    );
    expect(ids(groups.danas)).toEqual(["lastMinute"]);
    expect(ids(groups.kasnije)).toEqual(["justAfter"]);
  });

  test("'stigli' is today only, by the Belgrade day", () => {
    const afterMidnight = local("2026-10-21T00:30");
    const groups = groupReservations(
      [
        row("before", { status: "arrived", arrivedAt: local("2026-10-20T23:50") }),
        row("after", { status: "arrived", arrivedAt: local("2026-10-21T00:10") }),
      ],
      afterMidnight,
      HOLD,
    );
    expect(ids(groups.stigli)).toEqual(["after"]);
  });

  test("'otkazane' keeps a cancellation for 12 hours, the 12th hour included", () => {
    const groups = groupReservations(
      [
        row("exact", { status: "cancelled", cancelledAt: NOW - 12 * HOUR }),
        row("late", { status: "cancelled", cancelledAt: NOW - 12 * HOUR - 1 }),
        row("fresh", { status: "cancelled", cancelledAt: NOW }),
      ],
      NOW,
      HOLD,
    );
    expect(ids(groups.otkazane)).toEqual(["fresh", "exact"]);
  });
});

describe("newReservationCount", () => {
  test("counts only the new ones, not the proposals", () => {
    const rows = [
      row("a", { status: "new" }),
      row("b", { status: "new" }),
      row("c", { status: "change_proposed" }),
      row("d"),
      row("e", { status: "declined" }),
    ];
    expect(newReservationCount(rows)).toBe(2);
    expect(newReservationCount([])).toBe(0);
  });
});

describe("soonReservations", () => {
  test("the late ones first, then the ones whose time is near; nothing else", () => {
    const rows = [
      row("u2", { requestedAt: at(90) }),
      row("k1", { requestedAt: at(-40) }),
      row("d1", { requestedAt: at(200) }),
      row("u1", { requestedAt: at(-5) }),
      row("n1", { status: "new", requestedAt: at(10) }),
      row("k2", { requestedAt: at(-20) }),
      row("s1", { status: "arrived", arrivedAt: at(-30), requestedAt: at(-40) }),
      row("z1", { requestedAt: local("2026-10-25T12:00") }),
    ];
    expect(ids(soonReservations(rows, NOW, HOLD))).toEqual(["k1", "k2", "u1", "u2"]);
    expect(soonReservations([], NOW, HOLD)).toEqual([]);
  });
});

describe("newReservationArrivals", () => {
  const rows = [
    row("n1", { status: "new", createdAt: 300 }),
    row("n2", { status: "new", createdAt: 100 }),
    row("n3", { status: "new", createdAt: 200 }),
    row("a1", { status: "accepted", createdAt: 50 }),
    row("p1", { status: "change_proposed", createdAt: 60 }),
  ];

  test("the first snapshot announces nothing", () => {
    expect(newReservationArrivals(null, rows)).toEqual([]);
    expect(newReservationArrivals(null, [])).toEqual([]);
  });

  test("a later snapshot announces the new requests it has not seen, oldest first", () => {
    expect(ids(newReservationArrivals(new Set(["n3"]), rows))).toEqual(["n2", "n1"]);
    expect(ids(newReservationArrivals(new Set<string>(), rows))).toEqual(["n2", "n3", "n1"]);
  });

  test("an accepted or proposed reservation is never an arrival, even if unseen", () => {
    expect(ids(newReservationArrivals(new Set(["n1", "n2", "n3"]), rows))).toEqual([]);
  });

  test("it returns the rows themselves", () => {
    const [first] = newReservationArrivals(new Set<string>(), rows);
    expect(first).toBe(rows[1]);
  });
});

describe("guestReservationCancellationsSince", () => {
  const since = at(-60);
  const rows = [
    row("g1", { status: "cancelled", cancelledBy: "guest", cancelledAt: at(-30) }),
    row("g2", { status: "cancelled", cancelledBy: "guest", cancelledAt: at(-10) }),
    row("g3", { status: "cancelled", cancelledBy: "guest", cancelledAt: since }),
    row("g4", { status: "cancelled", cancelledBy: "guest", cancelledAt: at(-120) }),
    row("s1", { status: "cancelled", cancelledBy: "staff", cancelledAt: at(-5) }),
    row("c0", { status: "cancelled", cancelledBy: null, cancelledAt: at(-5) }),
    row("g5", { status: "cancelled", cancelledBy: "guest", cancelledAt: null }),
    row("a1", { status: "accepted", cancelledBy: "guest", cancelledAt: at(-5) }),
  ];

  test("only the guest's own cancellations after the moment, newest first", () => {
    expect(ids(guestReservationCancellationsSince(rows, since))).toEqual(["g2", "g1"]);
  });

  test("the moment itself is excluded, one millisecond later is in", () => {
    expect(ids(guestReservationCancellationsSince(rows, since - 1))).toContain("g3");
    expect(ids(guestReservationCancellationsSince(rows, since))).not.toContain("g3");
  });

  test("staff cancellations are never in the strip", () => {
    expect(ids(guestReservationCancellationsSince(rows, 0))).not.toContain("s1");
    expect(ids(guestReservationCancellationsSince(rows, 0))).not.toContain("c0");
  });
});

describe("reservationsByTable", () => {
  const rows: ReservationRow[] = [
    row("b3", { positionId: "p1", requestedAt: at(180) }),
    row("b1", { positionId: "p1", requestedAt: at(30) }),
    row("b2", { positionId: "p1", requestedAt: at(90) }),
    row("e1", { positionId: "p2", requestedAt: at(120) }),
    row("f1", { positionId: "p3", requestedAt: at(121) }),
    row("l2", { positionId: "p4", requestedAt: at(60) }),
    row("l1", { positionId: "p4", requestedAt: at(-20) }),
    row("h1", { positionId: "p5", requestedAt: at(-5) }),
    row("w1", { positionId: "p6", status: "new", requestedAt: at(30) }),
    row("w2", { positionId: "p6", status: "arrived", arrivedAt: at(-5), requestedAt: at(-30) }),
    row("w3", { positionId: "p7", status: "cancelled", cancelledAt: at(-5), requestedAt: at(30) }),
    row("w4", { positionId: "p8", status: "change_proposed", requestedAt: at(30) }),
    row("w5", { positionId: "p9", status: "declined", requestedAt: at(30) }),
    row("u0", { positionId: null, requestedAt: at(30) }),
  ];

  test("only accepted reservations with a table; the others are absent", () => {
    const byTable = reservationsByTable(rows, NOW, HOLD);
    expect([...byTable.keys()].sort()).toEqual(["p1", "p2", "p4", "p5"]);
  });

  test("the earliest reservation of a table wins and `more` counts the later ones", () => {
    const entry = reservationsByTable(rows, NOW, HOLD).get("p1");
    expect(entry?.row.id).toBe("b1");
    expect(entry?.more).toBe(2);
    expect(entry?.phase).toBe("uskoro");
  });

  test("an overdue reservation stays on its table until the guests arrive or it is cancelled, and wins over a later one", () => {
    const entry = reservationsByTable(rows, NOW, HOLD).get("p4");
    expect(entry?.row.id).toBe("l1");
    expect(entry?.phase).toBe("kasni");
    expect(entry?.more).toBe(1);
  });

  test("the phase is the reservation's own", () => {
    const byTable = reservationsByTable(rows, NOW, HOLD);
    expect(byTable.get("p5")).toMatchObject({ phase: "u-terminu", more: 0 });
    expect(byTable.get("p2")).toMatchObject({ phase: "uskoro", more: 0 });
  });

  test("it appears from two hours before the time: exactly 120 minutes is in, one more minute is not", () => {
    const byTable = reservationsByTable(rows, NOW, HOLD);
    expect(byTable.has("p2")).toBe(true);
    expect(byTable.has("p3")).toBe(false);
    // Moving 'now' by a minute brings the later one in.
    expect(reservationsByTable(rows, NOW + MIN, HOLD).has("p3")).toBe(true);
  });

  test("the hold changes the phase, not the presence", () => {
    const withLongHold = reservationsByTable(rows, NOW, 30).get("p4");
    expect(withLongHold?.phase).toBe("u-terminu");
    expect(reservationsByTable(rows, NOW, 5).get("p4")?.phase).toBe("kasni");
  });

  test("the order of the input does not matter", () => {
    const forward = reservationsByTable(rows, NOW, HOLD);
    const backward = reservationsByTable([...rows].reverse(), NOW, HOLD);
    expect([...backward.keys()].sort()).toEqual([...forward.keys()].sort());
    for (const [key, entry] of forward) {
      expect(backward.get(key)?.row.id, key).toBe(entry.row.id);
      expect(backward.get(key)?.more, key).toBe(entry.more);
    }
  });

  test("no reservations, no tables", () => {
    expect(reservationsByTable([], NOW, HOLD).size).toBe(0);
  });
});

describe("reservationsOfTable", () => {
  const rows: ReservationRow[] = [
    row("t2", { positionId: "p1", requestedAt: local("2026-10-23T19:00") }),
    row("t1", { positionId: "p1", requestedAt: at(300) }),
    row("t0", { positionId: "p1", status: "arrived", requestedAt: at(-120), arrivedAt: at(-100) }),
    row("ty", { positionId: "p1", status: "arrived", requestedAt: local("2026-10-20T20:00"), arrivedAt: local("2026-10-20T20:05") }),
    row("tn", { positionId: "p1", status: "arrived", requestedAt: at(-200), arrivedAt: null }),
    row("c1", { positionId: "p1", status: "cancelled", requestedAt: at(-90), cancelledAt: NOW - 2 * HOUR }),
    row("c2", { positionId: "p1", status: "cancelled", requestedAt: at(-80), cancelledAt: NOW - 2 * HOUR - 1 }),
    row("c3", { positionId: "p1", status: "cancelled", requestedAt: at(-70), cancelledAt: null }),
    row("n1", { positionId: "p1", status: "new" }),
    row("d1", { positionId: "p1", status: "declined" }),
    row("pr", { positionId: "p1", status: "change_proposed" }),
    row("o1", { positionId: "p2", requestedAt: at(30) }),
    row("u0", { positionId: null, requestedAt: at(30) }),
  ];

  test("accepted at any time, arrived today and recently cancelled, in order of time", () => {
    expect(ids(reservationsOfTable(rows, "p1", NOW))).toEqual(["t0", "c1", "t1", "t2"]);
  });

  test("a cancellation stays named for two hours, the second hour included", () => {
    expect(ids(reservationsOfTable(rows, "p1", NOW))).toContain("c1");
    expect(ids(reservationsOfTable(rows, "p1", NOW))).not.toContain("c2");
    expect(ids(reservationsOfTable(rows, "p1", NOW + 1))).not.toContain("c1");
  });

  test("another table has only its own reservations; a table with none gets an empty list", () => {
    expect(ids(reservationsOfTable(rows, "p2", NOW))).toEqual(["o1"]);
    expect(reservationsOfTable(rows, "p9", NOW)).toEqual([]);
  });

  test("the reservations that arrived yesterday are no longer on the table", () => {
    expect(ids(reservationsOfTable(rows, "p1", NOW))).not.toContain("ty");
  });
});

describe("unboundToday", () => {
  const rows: ReservationRow[] = [
    row("u2", { requestedAt: local("2026-10-21T23:30") }),
    row("u0", { requestedAt: at(30) }),
    row("u1", { requestedAt: at(-120) }),
    row("tomorrowMorning", { requestedAt: local("2026-10-22T00:15") }),
    row("tomorrowNoon", { requestedAt: local("2026-10-22T12:00") }),
    row("bound", { requestedAt: at(30), positionId: "p1" }),
    row("new", { status: "new", requestedAt: at(30) }),
    row("proposed", { status: "change_proposed", requestedAt: at(30) }),
    row("arrived", { status: "arrived", requestedAt: at(-30), arrivedAt: at(-20) }),
    row("cancelled", { status: "cancelled", requestedAt: at(30), cancelledAt: at(-5) }),
    row("declined", { status: "declined", requestedAt: at(30) }),
  ];

  test("accepted reservations without a table whose time is today, in order of time", () => {
    expect(ids(unboundToday(rows, NOW))).toEqual(["u1", "u0", "u2"]);
  });

  test("today is the Belgrade day: a quarter past midnight is tomorrow, even a few minutes away", () => {
    const lateNow = local("2026-10-21T23:50");
    expect(ids(unboundToday([row("soon", { requestedAt: local("2026-10-22T00:10") })], lateNow))).toEqual([]);
    expect(ids(unboundToday([row("soon", { requestedAt: local("2026-10-21T23:55") })], lateNow))).toEqual(["soon"]);
  });

  test("nothing to bind gives an empty list", () => {
    expect(unboundToday([], NOW)).toEqual([]);
  });
});
