import { describe, expect, test } from "vitest";
import { constellationDiff } from "./diff";
import { orbitLayout } from "./layout";
import type { ConstellationChange, ConstellationCounts, ConstellationItem, ConstellationLayout, ConstellationPriority } from "./types";

const NOW = 1_700_000_000_000;
const item = (id: string, priority: ConstellationPriority = "needs_reply"): ConstellationItem => ({ id, priority, relevantAt: NOW - 1000 });
const counts = (patch: Partial<ConstellationCounts> = {}): ConstellationCounts => ({
  total: 0,
  urgent: 0,
  today: 0,
  needsReply: 0,
  graceOrWarning: 0,
  waitingScanme: 0,
  waitingClient: 0,
  calm: 0,
  ...patch,
});
const layout = (items: ConstellationItem[], withCounts: ConstellationCounts | null = null): ConstellationLayout => orbitLayout(items, withCounts, NOW);
const kinds = (changes: ConstellationChange[]) => changes.map((change) => `${change.kind}:${change.id}`);

describe("constellationDiff", () => {
  test("the first read is a state, not news", () => {
    expect(constellationDiff(null, layout([item("task:test:1")]), null, 5)).toEqual([]);
  });

  test("nothing changed: no changes", () => {
    const same = layout([item("task:test:1"), item("task:test:2", "due_today")]);
    expect(constellationDiff(same, layout([item("task:test:1"), item("task:test:2", "due_today")]), 5, 5)).toEqual([]);
  });

  test("an item that is gone while the total fell is resolved, and carries its star", () => {
    const prev = layout([item("task:test:1"), item("task:test:2")]);
    const next = layout([item("task:test:2")]);
    const changes = constellationDiff(prev, next, 4, 3);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "resolved", id: "task:test:1" });
    expect(changes[0].kind === "resolved" && changes[0].star).toEqual(prev.stars.find((star) => star.id === "task:test:1"));
  });

  test("an item that is gone while the total did not fall has left", () => {
    const prev = layout([item("task:test:1"), item("task:test:2")]);
    const next = layout([item("task:test:2")]);
    expect(kinds(constellationDiff(prev, next, 4, 4))).toEqual(["left:task:test:1"]);
    expect(kinds(constellationDiff(prev, next, 4, 6))).toEqual(["left:task:test:1"]);
  });

  test("two gone items and a total that fell by one: the more urgent one is resolved, the other has left", () => {
    const prev = layout([item("task:test:a", "waiting_client"), item("task:test:b", "blocking_or_overdue"), item("task:test:c", "due_today")]);
    const next = layout([item("task:test:c", "due_today")]);
    expect(kinds(constellationDiff(prev, next, 5, 4))).toEqual(["resolved:task:test:b", "left:task:test:a"]);
  });

  test("gone items on one orbit are told apart by id", () => {
    const prev = layout([item("task:test:z"), item("task:test:y")]);
    const next = layout([]);
    expect(kinds(constellationDiff(prev, next, 2, 1))).toEqual(["resolved:task:test:y", "left:task:test:z"]);
  });

  test("a new item while the total rose has arrived", () => {
    const prev = layout([item("task:test:1")]);
    const next = layout([item("task:test:1"), item("task:test:2")]);
    expect(constellationDiff(prev, next, 3, 4)).toEqual([{ kind: "arrived", id: "task:test:2" }]);
  });

  test("a new item while the total did not rise is only shown", () => {
    const prev = layout([item("task:test:1")]);
    const next = layout([item("task:test:1"), item("task:test:2")]);
    expect(constellationDiff(prev, next, 3, 3)).toEqual([{ kind: "shown", id: "task:test:2" }]);
    expect(constellationDiff(prev, next, 3, 2)).toEqual([{ kind: "shown", id: "task:test:2" }]);
  });

  test("two new items and a total that rose by one: the more urgent one arrived, the other is shown", () => {
    const prev = layout([]);
    const next = layout([item("task:test:a", "waiting_scanme"), item("task:test:b", "due_today")]);
    expect(constellationDiff(prev, next, 0, 1)).toEqual([
      { kind: "arrived", id: "task:test:b" },
      { kind: "shown", id: "task:test:a" },
    ]);
  });

  test("one solved and one added in the same read (total −1): one resolved, one shown", () => {
    const prev = layout([item("task:test:1"), item("task:test:2")]);
    const next = layout([item("task:test:2"), item("task:test:3")]);
    expect(kinds(constellationDiff(prev, next, 6, 5))).toEqual(["resolved:task:test:1", "shown:task:test:3"]);
  });

  test("a change of urgency moves the star to another orbit", () => {
    const prev = layout([item("task:test:1", "needs_reply")]);
    const next = layout([item("task:test:1", "blocking_or_overdue")]);
    expect(constellationDiff(prev, next, 1, 1)).toEqual([{ kind: "moved", id: "task:test:1", from: 3, to: 1 }]);
  });

  test("an unknown total never claims a solved or a new item", () => {
    const prev = layout([item("task:test:1"), item("task:test:2")]);
    const next = layout([item("task:test:2"), item("task:test:3")]);
    for (const [before, after] of [[null, null], [4, null], [null, 4]] as const) {
      expect(kinds(constellationDiff(prev, next, before, after)), `${before}/${after}`).toEqual(["left:task:test:1", "shown:task:test:3"]);
    }
  });

  test("the „+N“ stars are not in the difference", () => {
    const prev = layout([item("task:test:1", "blocking_or_overdue")], counts({ urgent: 4 }));
    const next = layout([item("task:test:1", "blocking_or_overdue")], counts({ urgent: 2 }));
    expect(prev.stars.some((star) => star.kind === "more")).toBe(true);
    expect(next.stars.some((star) => star.kind === "more")).toBe(true);
    expect(constellationDiff(prev, next, 4, 2)).toEqual([]);
    // A „+N“ star that appears or vanishes is no change either.
    expect(constellationDiff(layout([item("task:test:1", "blocking_or_overdue")], counts({ urgent: 1 })), next, 1, 2)).toEqual([]);
    expect(constellationDiff(prev, layout([item("task:test:1", "blocking_or_overdue")], counts({ urgent: 1 })), 4, 1)).toEqual([]);
  });

  test("the order: resolved, left, arrived, shown, moved", () => {
    const prev = layout([
      item("task:test:r", "blocking_or_overdue"),
      item("task:test:l", "waiting_client"),
      item("task:test:m", "needs_reply"),
      item("task:test:keep", "due_today"),
    ]);
    const next = layout([
      item("task:test:m", "due_today"),
      item("task:test:keep", "due_today"),
      item("task:test:a", "needs_reply"),
      item("task:test:s", "other"),
    ]);
    // total 10 → 9: one item is resolved; 9 → +1 would be arrived, but the net change is −1, so both new ones are shown.
    expect(kinds(constellationDiff(prev, next, 10, 9))).toEqual([
      "resolved:task:test:r",
      "left:task:test:l",
      "shown:task:test:a",
      "shown:task:test:s",
      "moved:task:test:m",
    ]);
    // With a rise of one: the more urgent new item (orbit 3) arrived, the calm one is shown.
    expect(kinds(constellationDiff(prev, next, 10, 11))).toEqual([
      "left:task:test:r",
      "left:task:test:l",
      "arrived:task:test:a",
      "shown:task:test:s",
      "moved:task:test:m",
    ]);
  });
});
