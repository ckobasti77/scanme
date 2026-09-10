import { describe, expect, test } from "vitest";
import {
  createSeenRequests,
  detectNewRequests,
  groupQueueByTable,
  type QueueRequest,
} from "./ordering-panel-queue";

const row = (
  id: string,
  cardId: string,
  createdAt: number,
  extra: Partial<QueueRequest> = {},
): QueueRequest => ({
  _id: id,
  cardId,
  tableLabel: `Sto ${cardId}`,
  status: "sent",
  overdue: false,
  createdAt,
  ...extra,
});

describe("TASK-68: groupQueueByTable (RFC-004 §2.7, §2.8)", () => {
  test("groups by cardId and orders groups by the longest wait", () => {
    const groups = groupQueueByTable([
      row("c1", "12", 300),
      row("a1", "7", 100),
      row("a2", "7", 400, { status: "accepted" }),
      row("b1", "3", 200),
    ]);
    expect(groups.map((g) => g.cardId)).toEqual(["7", "3", "12"]);
    expect(groups[0].requests.map((r) => r._id)).toEqual(["a1", "a2"]);
    expect(groups[0].tableLabel).toBe("Sto 7");
  });

  test("a table with an overdue unaccepted request jumps to the top", () => {
    const groups = groupQueueByTable([
      row("a1", "7", 100),
      row("b1", "3", 200),
      row("c1", "12", 900, { overdue: true }),
    ]);
    expect(groups.map((g) => g.cardId)).toEqual(["12", "7", "3"]);
    expect(groups[0].hasOverdue).toBe(true);
    expect(groups[1].hasOverdue).toBe(false);
  });

  test("overdue on an already-accepted request does not count as late", () => {
    const groups = groupQueueByTable([
      row("a1", "7", 100),
      row("c1", "12", 900, { overdue: true, status: "accepted" }),
    ]);
    expect(groups.map((g) => g.cardId)).toEqual(["7", "12"]);
    expect(groups[1].hasOverdue).toBe(false);
  });

  test("inside a group the late request comes first, then oldest first", () => {
    const [group] = groupQueueByTable([
      row("x3", "7", 300),
      row("x1", "7", 100, { status: "enroute" }),
      row("x2", "7", 200, { overdue: true }),
    ]);
    expect(group.requests.map((r) => r._id)).toEqual(["x2", "x1", "x3"]);
  });

  test("empty input → no groups", () => {
    expect(groupQueueByTable([])).toEqual([]);
  });
});

describe("TASK-68: detectNewRequests", () => {
  test("an empty first payload still rings for the first request of the night", () => {
    const seen = createSeenRequests();
    expect(detectNewRequests(seen, [])).toEqual([]);
    expect(detectNewRequests(seen, [row("a", "7", 1)]).map((r) => r._id)).toEqual(
      ["a"],
    );
  });

  test("adopts the first payload silently, announces later sent rows once", () => {
    const seen = createSeenRequests();
    expect(
      detectNewRequests(seen, [row("a", "7", 1), row("b", "3", 2)]),
    ).toEqual([]);
    const fresh = detectNewRequests(seen, [
      row("a", "7", 1),
      row("b", "3", 2),
      row("c", "12", 3),
      row("d", "12", 4, { status: "accepted" }),
    ]);
    expect(fresh.map((r) => r._id)).toEqual(["c"]);
    expect(detectNewRequests(seen, [row("c", "12", 3)])).toEqual([]);
  });
});
