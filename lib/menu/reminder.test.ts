// ScanMe Menu V1 (K23) — the reminder of the waiter panel: a request still
// `Novi` reminds once per interval, never continuously, never after it was taken.

import { describe, expect, test } from "vitest";
import { dospeliPodsetnici, reminderSlot, type ReminderMemory, type ReminderRow } from "./reminder";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const T0 = 10_000_000;

const row = (id: string, status: string, createdAt: number): ReminderRow => ({ id, status, createdAt });

/** Runs one tick every second over [from, to] and returns the moments any reminder rang, with who. */
function simulate(rows: readonly ReminderRow[], from: number, to: number, reminderMin: number, memory: ReminderMemory = new Map()) {
  const rings: { at: number; due: string[] }[] = [];
  let current = memory;
  for (let now = from; now <= to; now += SECOND) {
    const tick = dospeliPodsetnici(rows, now, reminderMin, current);
    if (tick.due.length > 0) rings.push({ at: now, due: tick.due });
    current = tick.memory;
  }
  return { rings, memory: current };
}

describe("reminderSlot", () => {
  const interval = 5 * MINUTE;

  test("is 0 before the first interval is over", () => {
    expect(reminderSlot(T0, T0 + 1, interval)).toBe(0);
    expect(reminderSlot(T0, T0 + interval - 1, interval)).toBe(0);
  });

  test("is 1 at exactly one interval", () => {
    expect(reminderSlot(T0, T0 + interval, interval)).toBe(1);
    expect(reminderSlot(T0, T0 + 2 * interval - 1, interval)).toBe(1);
  });

  test("counts whole intervals", () => {
    expect(reminderSlot(T0, T0 + 2 * interval, interval)).toBe(2);
    expect(reminderSlot(T0, T0 + 12 * MINUTE, interval)).toBe(2);
  });

  test("is 0 for an interval of 0 (or negative)", () => {
    expect(reminderSlot(T0, T0 + 10 * MINUTE, 0)).toBe(0);
    expect(reminderSlot(T0, T0 + 10 * MINUTE, -1)).toBe(0);
  });

  test("is 0 when now is before createdAt (a device clock behind the server)", () => {
    expect(reminderSlot(T0, T0 - 1, interval)).toBe(0);
    expect(reminderSlot(T0, T0 - 10 * MINUTE, interval)).toBe(0);
    expect(reminderSlot(T0, T0, interval)).toBe(0);
  });
});

describe("dospeliPodsetnici", () => {
  test("a reminder of 0 (off) rings nothing and keeps nothing", () => {
    const old = row("a", "new", T0);
    const tick = dospeliPodsetnici([old], T0 + 30 * MINUTE, 0, new Map([["a", 1]]));
    expect(tick.due).toEqual([]);
    expect(tick.memory.size).toBe(0);
  });

  test("the first sight never rings: the interval it is already in counts as rung", () => {
    // 12 minutes old with a 5 minute reminder is in slot 2.
    const tick = dospeliPodsetnici([row("a", "new", T0)], T0 + 12 * MINUTE, 5, new Map());
    expect(tick.due).toEqual([]);
    expect(tick.memory.get("a")).toBe(2);
  });

  test("opening the panel does not ring for every old request at once", () => {
    const rows = [row("a", "new", T0), row("b", "new", T0 + MINUTE), row("c", "new", T0 + 7 * MINUTE)];
    const tick = dospeliPodsetnici(rows, T0 + 20 * MINUTE, 5, new Map());
    expect(tick.due).toEqual([]);
    expect([...tick.memory.entries()]).toEqual([
      ["a", 4],
      ["b", 3],
      ["c", 2],
    ]);
  });

  test("a request first seen in slot 0 rings exactly once when it reaches slot 1", () => {
    const rows = [row("a", "new", T0)];
    const { rings } = simulate(rows, T0 + 4 * MINUTE + 58 * SECOND, T0 + 5 * MINUTE + 2 * SECOND, 5);
    expect(rings).toEqual([{ at: T0 + 5 * MINUTE, due: ["a"] }]);
  });

  test("does not ring 1 ms before the boundary, rings at it", () => {
    const rows = [row("a", "new", T0)];
    const seen = dospeliPodsetnici(rows, T0 + SECOND, 5, new Map());
    expect(dospeliPodsetnici(rows, T0 + 5 * MINUTE - 1, 5, seen.memory).due).toEqual([]);
    expect(dospeliPodsetnici(rows, T0 + 5 * MINUTE, 5, seen.memory).due).toEqual(["a"]);
  });

  test("after ringing at slot 1 it does not ring again until slot 2", () => {
    const rows = [row("a", "new", T0)];
    const first = dospeliPodsetnici(rows, T0 + SECOND, 5, new Map());
    const ring = dospeliPodsetnici(rows, T0 + 5 * MINUTE, 5, first.memory);
    expect(ring.due).toEqual(["a"]);
    expect(ring.memory.get("a")).toBe(1);
    const quiet = dospeliPodsetnici(rows, T0 + 5 * MINUTE + SECOND, 5, ring.memory);
    expect(quiet.due).toEqual([]);
    expect(quiet.memory.get("a")).toBe(1);
    const second = dospeliPodsetnici(rows, T0 + 10 * MINUTE, 5, quiet.memory);
    expect(second.due).toEqual(["a"]);
    expect(second.memory.get("a")).toBe(2);
  });

  test("across full intervals there is exactly one ring per interval, never continuous", () => {
    const rows = [row("a", "new", T0)];
    // Ticks every second from just after it arrived to 3 intervals + 10 s.
    const { rings } = simulate(rows, T0 + SECOND, T0 + 15 * MINUTE + 10 * SECOND, 5);
    expect(rings.map((ring) => ring.at)).toEqual([T0 + 5 * MINUTE, T0 + 10 * MINUTE, T0 + 15 * MINUTE]);
    for (const ring of rings) expect(ring.due).toEqual(["a"]);
  });

  test("a late tick after missed intervals rings once, not once per missed interval", () => {
    const rows = [row("a", "new", T0)];
    const seen = dospeliPodsetnici(rows, T0 + SECOND, 5, new Map());
    // The tab slept for 3 intervals.
    const wake = dospeliPodsetnici(rows, T0 + 16 * MINUTE, 5, seen.memory);
    expect(wake.due).toEqual(["a"]);
    expect(wake.memory.get("a")).toBe(3);
    expect(dospeliPodsetnici(rows, T0 + 16 * MINUTE + SECOND, 5, wake.memory).due).toEqual([]);
  });

  test("a request that is not Novi never rings and is dropped from memory", () => {
    for (const status of ["accepted", "done", "cancelled"]) {
      const memory = new Map([["a", 0]]);
      const tick = dospeliPodsetnici([row("a", status, T0)], T0 + 5 * MINUTE, 5, memory);
      expect(tick.due).toEqual([]);
      expect(tick.memory.has("a")).toBe(false);
      expect(tick.memory.size).toBe(0);
    }
  });

  test("a request taken between two ticks does not ring at its boundary", () => {
    const seen = dospeliPodsetnici([row("a", "new", T0)], T0 + SECOND, 5, new Map());
    const taken = dospeliPodsetnici([row("a", "accepted", T0)], T0 + 5 * MINUTE, 5, seen.memory);
    expect(taken.due).toEqual([]);
    expect(taken.memory.size).toBe(0);
  });

  test("a request that disappears from the input is dropped from memory", () => {
    const rows = [row("a", "new", T0), row("b", "new", T0)];
    const seen = dospeliPodsetnici(rows, T0 + SECOND, 5, new Map());
    expect([...seen.memory.keys()]).toEqual(["a", "b"]);
    const tick = dospeliPodsetnici([rows[1]], T0 + 5 * MINUTE, 5, seen.memory);
    expect(tick.memory.has("a")).toBe(false);
    expect(tick.due).toEqual(["b"]);
  });

  test("a request that reappears is treated as first sight and does not ring", () => {
    const rows = [row("a", "new", T0)];
    const seen = dospeliPodsetnici(rows, T0 + SECOND, 5, new Map());
    const gone = dospeliPodsetnici([], T0 + 2 * SECOND, 5, seen.memory);
    expect(gone.memory.size).toBe(0);
    const back = dospeliPodsetnici(rows, T0 + 5 * MINUTE, 5, gone.memory);
    expect(back.due).toEqual([]);
    expect(back.memory.get("a")).toBe(1);
  });

  test("several requests due at the same tick are all in due", () => {
    const rows = [row("a", "new", T0), row("b", "new", T0), row("c", "new", T0)];
    const seen = dospeliPodsetnici(rows, T0 + SECOND, 5, new Map());
    const tick = dospeliPodsetnici(rows, T0 + 5 * MINUTE, 5, seen.memory);
    expect(tick.due).toEqual(["a", "b", "c"]);
  });

  test("requests are identified by id and ring on their own schedule", () => {
    const rows = [row("early", "new", T0), row("late", "new", T0 + 2 * MINUTE)];
    const { rings } = simulate(rows, T0 + SECOND, T0 + 7 * MINUTE + 10 * SECOND, 5);
    expect(rings).toEqual([
      { at: T0 + 5 * MINUTE, due: ["early"] },
      { at: T0 + 7 * MINUTE, due: ["late"] },
    ]);
  });

  test("only the due request is listed when others are not at a boundary", () => {
    const rows = [row("a", "new", T0), row("b", "new", T0 + 3 * MINUTE)];
    const seen = dospeliPodsetnici(rows, T0 + 4 * MINUTE, 5, new Map());
    const tick = dospeliPodsetnici(rows, T0 + 5 * MINUTE, 5, seen.memory);
    expect(tick.due).toEqual(["a"]);
    expect(tick.memory.get("a")).toBe(1);
    expect(tick.memory.get("b")).toBe(0);
  });

  test("the previous memory is not changed", () => {
    const memory = new Map([["a", 0]]);
    dospeliPodsetnici([row("a", "new", T0)], T0 + 5 * MINUTE, 5, memory);
    expect(memory.get("a")).toBe(0);
  });

  test("a different interval moves the boundary", () => {
    const rows = [row("a", "new", T0)];
    const { rings } = simulate(rows, T0 + SECOND, T0 + 3 * MINUTE + 10 * SECOND, 1);
    expect(rings.map((ring) => ring.at)).toEqual([T0 + MINUTE, T0 + 2 * MINUTE, T0 + 3 * MINUTE]);
  });
});
