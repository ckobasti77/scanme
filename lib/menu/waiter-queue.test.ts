// ScanMe Menu V1 (K22) — the work queue of the waiter panel: order, filters,
// the one main action of a card, the summary line and the arrivals the screen
// announces.

import { describe, expect, test } from "vitest";
import type { MenuRequestKind, MenuRequestStatus } from "./request-status";
import {
  QUEUE_FILTERS,
  filterQueue,
  guestCancellationsSince,
  newArrivals,
  primaryAction,
  queueSummary,
  sortQueue,
  type QueueRow,
} from "./waiter-queue";

type RowOptions = {
  kind?: MenuRequestKind;
  mine?: boolean;
  acceptedBy?: QueueRow["acceptedBy"];
};

function row(id: string, status: MenuRequestStatus, createdAt: number, options: RowOptions = {}): QueueRow {
  const acceptedBy =
    options.acceptedBy !== undefined
      ? options.acceptedBy
      : status === "new"
        ? null
        : { isMe: options.mine ?? false };
  return { id, kind: options.kind ?? "call", status, createdAt, acceptedBy };
}

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

describe("sortQueue", () => {
  test("new first (oldest first), then my accepted, then the others' accepted, each oldest first", () => {
    const rows = [
      row("acc-other-1", "accepted", 100),
      row("new-late", "new", 900),
      row("acc-mine-late", "accepted", 800, { mine: true }),
      row("new-early", "new", 500),
      row("acc-other-0", "accepted", 50),
      row("acc-mine-early", "accepted", 300, { mine: true }),
      row("new-mid", "new", 700),
    ];
    expect(ids(sortQueue(rows))).toEqual([
      "new-early",
      "new-mid",
      "new-late",
      "acc-mine-early",
      "acc-mine-late",
      "acc-other-0",
      "acc-other-1",
    ]);
  });

  test("a new request outranks an older accepted one", () => {
    const rows = [row("old-accepted", "accepted", 1, { mine: true }), row("fresh", "new", 1_000_000)];
    expect(ids(sortQueue(rows))).toEqual(["fresh", "old-accepted"]);
  });

  test("drops done and cancelled requests", () => {
    const rows = [
      row("done", "done", 10, { mine: true }),
      row("new", "new", 20),
      row("cancelled", "cancelled", 5, { acceptedBy: null }),
      row("accepted", "accepted", 30),
    ];
    expect(ids(sortQueue(rows))).toEqual(["new", "accepted"]);
  });

  test("an accepted row with no acceptor is ranked with the others'", () => {
    const rows = [
      row("orphan", "accepted", 10, { acceptedBy: null }),
      row("mine", "accepted", 20, { mine: true }),
    ];
    expect(ids(sortQueue(rows))).toEqual(["mine", "orphan"]);
  });

  test("ties on createdAt are broken by id", () => {
    const rows = [row("c", "new", 100), row("a", "new", 100), row("b", "new", 100)];
    expect(ids(sortQueue(rows))).toEqual(["a", "b", "c"]);
  });

  test("createdAt decides before the id", () => {
    const rows = [row("a", "new", 200), row("z", "new", 100)];
    expect(ids(sortQueue(rows))).toEqual(["z", "a"]);
  });

  test("returns a new array and does not mutate the input", () => {
    const rows = [row("b", "accepted", 2), row("a", "new", 1), row("x", "done", 0)];
    const snapshot = rows.map((r) => ({ ...r }));
    const sorted = sortQueue(rows);
    expect(sorted).not.toBe(rows);
    expect(ids(rows)).toEqual(["b", "a", "x"]);
    expect(rows).toEqual(snapshot);
  });

  test("an empty queue stays empty", () => {
    expect(sortQueue([])).toEqual([]);
  });

  test("keeps the extra fields of richer rows", () => {
    const rich = [{ ...row("a", "new", 1), tableLabel: "Sto 12" }];
    expect(sortQueue(rich)[0].tableLabel).toBe("Sto 12");
  });
});

describe("filterQueue", () => {
  const rows = [
    row("n", "new", 1),
    row("a", "accepted", 2, { mine: true }),
    row("d", "done", 3, { mine: true }),
  ];

  test("lists the three filters", () => {
    expect([...QUEUE_FILTERS]).toEqual(["sve", "zahtevi", "rezervacije"]);
  });

  test.each(["sve", "zahtevi"] as const)("%s keeps every request", (filter) => {
    const result = filterQueue(rows, filter);
    expect(ids(result)).toEqual(["n", "a", "d"]);
    expect(result).not.toBe(rows);
  });

  test("rezervacije is empty until reservations exist", () => {
    expect(filterQueue(rows, "rezervacije")).toEqual([]);
  });

  test("an empty list stays empty under every filter", () => {
    for (const filter of QUEUE_FILTERS) expect(filterQueue([], filter)).toEqual([]);
  });
});

describe("primaryAction", () => {
  test("a new call is taken right from the queue", () => {
    expect(primaryAction(row("1", "new", 1, { kind: "call" }))).toBe("accept");
  });

  test("a new bill is taken right from the queue", () => {
    expect(primaryAction(row("1", "new", 1, { kind: "bill" }))).toBe("accept");
  });

  test("a new order is reviewed first", () => {
    expect(primaryAction(row("1", "new", 1, { kind: "order" }))).toBe("review");
  });

  test.each(["call", "bill", "order"] as const)("a %s accepted by me is completed", (kind) => {
    expect(primaryAction(row("1", "accepted", 1, { kind, mine: true }))).toBe("complete");
  });

  test.each(["call", "bill", "order"] as const)("a %s accepted by someone else is only opened", (kind) => {
    expect(primaryAction(row("1", "accepted", 1, { kind, mine: false }))).toBe("review");
  });

  test("an accepted request with no known acceptor is only opened", () => {
    expect(primaryAction(row("1", "accepted", 1, { acceptedBy: null }))).toBe("review");
  });
});

describe("queueSummary", () => {
  test("an empty queue has nothing active and no oldest new request", () => {
    expect(queueSummary([])).toEqual({ active: 0, newCount: 0, oldestNewAt: null });
  });

  test("active counts new and accepted only", () => {
    const rows = [
      row("n1", "new", 300),
      row("n2", "new", 100),
      row("a1", "accepted", 50, { mine: true }),
      row("d1", "done", 10, { mine: true }),
      row("c1", "cancelled", 5, { acceptedBy: null }),
    ];
    expect(queueSummary(rows)).toEqual({ active: 3, newCount: 2, oldestNewAt: 100 });
  });

  test("oldestNewAt is the oldest NEW request, not the oldest accepted one", () => {
    const rows = [row("a1", "accepted", 1), row("n1", "new", 500), row("n2", "new", 900)];
    expect(queueSummary(rows).oldestNewAt).toBe(500);
  });

  test("oldestNewAt is null when nothing is new", () => {
    const rows = [row("a1", "accepted", 1), row("a2", "accepted", 2, { mine: true })];
    expect(queueSummary(rows)).toEqual({ active: 2, newCount: 0, oldestNewAt: null });
  });

  test("closed requests alone give an empty summary", () => {
    const rows = [row("d", "done", 1, { mine: true }), row("c", "cancelled", 2, { acceptedBy: null })];
    expect(queueSummary(rows)).toEqual({ active: 0, newCount: 0, oldestNewAt: null });
  });

  test("a createdAt of zero is still an oldest request", () => {
    expect(queueSummary([row("n", "new", 0)]).oldestNewAt).toBe(0);
  });
});

describe("newArrivals", () => {
  test("the first snapshot announces nothing", () => {
    expect(newArrivals(null, [row("a", "new", 1), row("b", "new", 2)])).toEqual([]);
  });

  test("returns only new rows whose id is not in the previous snapshot, oldest first", () => {
    const rows = [
      row("seen", "new", 10),
      row("late", "new", 300),
      row("early", "new", 200),
      row("accepted-elsewhere", "accepted", 250),
      row("done-elsewhere", "done", 260, { mine: true }),
    ];
    const previous = new Set(["seen"]);
    expect(ids(newArrivals(previous, rows))).toEqual(["early", "late"]);
  });

  test("nothing new since the last snapshot gives an empty list", () => {
    const rows = [row("a", "new", 1), row("b", "accepted", 2)];
    expect(newArrivals(new Set(["a", "b"]), rows)).toEqual([]);
  });

  test("an empty previous snapshot (not null) announces every new row", () => {
    const rows = [row("b", "new", 2), row("a", "new", 1)];
    expect(ids(newArrivals(new Set<string>(), rows))).toEqual(["a", "b"]);
  });

  test("does not reorder or mutate the input", () => {
    const rows = [row("b", "new", 2), row("a", "new", 1)];
    newArrivals(new Set<string>(), rows);
    expect(ids(rows)).toEqual(["b", "a"]);
  });
});

describe("guestCancellationsSince", () => {
  type Cancelled = { id: string; cancelledAt: number | null; cancelledBy: "guest" | "staff" | null };
  const cancelled = (id: string, cancelledAt: number | null, cancelledBy: Cancelled["cancelledBy"]): Cancelled => ({
    id,
    cancelledAt,
    cancelledBy,
  });

  test("keeps only guest cancellations newer than `since`, newest first", () => {
    const rows = [
      cancelled("old", 100, "guest"),
      cancelled("mid", 500, "guest"),
      cancelled("staff", 600, "staff"),
      cancelled("open", null, null),
      cancelled("new", 900, "guest"),
    ];
    expect(ids(guestCancellationsSince(rows, 200))).toEqual(["new", "mid"]);
  });

  test("`since` itself is excluded (strictly newer)", () => {
    const rows = [cancelled("edge", 200, "guest"), cancelled("after", 201, "guest")];
    expect(ids(guestCancellationsSince(rows, 200))).toEqual(["after"]);
  });

  test("ignores a guest row without a cancellation time", () => {
    expect(guestCancellationsSince([cancelled("odd", null, "guest")], 0)).toEqual([]);
  });

  test("an empty list gives an empty list", () => {
    expect(guestCancellationsSince([], 0)).toEqual([]);
  });

  test("does not mutate the input", () => {
    const rows = [cancelled("a", 100, "guest"), cancelled("b", 300, "guest")];
    guestCancellationsSince(rows, 0);
    expect(ids(rows)).toEqual(["a", "b"]);
  });
});
