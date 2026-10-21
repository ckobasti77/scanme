import { describe, expect, test } from "vitest";
import { flameSize, isDayDone, streakView } from "./streak";
import type { DayLedger, DayRecord } from "./types";

// 2026-10-12 is a Monday; 10-10 and 10-11 are the weekend.
const DONE: DayRecord = { work: true, clear: true, bossMax: 0, bossDown: null };
const ledger = (...keys: string[]): DayLedger => Object.fromEntries(keys.map((key) => [key, { ...DONE }]));

describe("isDayDone", () => {
  test("needs both facts", () => {
    expect(isDayDone(undefined)).toBe(false);
    expect(isDayDone({ ...DONE, work: false })).toBe(false);
    expect(isDayDone({ ...DONE, clear: false })).toBe(false);
    expect(isDayDone(DONE)).toBe(true);
  });
});

describe("flameSize", () => {
  test("the five sizes and their edges", () => {
    const sizes = [0, 1, 2, 3, 4, 5, 9, 10, 19, 20, 100].map(flameSize);
    expect(sizes).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
});

describe("streakView", () => {
  test("an empty ledger is all zeros", () => {
    expect(streakView({}, "2026-10-13")).toEqual({ count: 0, best: 0, flame: 0, todayDone: false, brokenOn: null, since: null });
  });

  test("counts working days in a row up to today", () => {
    const view = streakView(ledger("2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13"), "2026-10-13");
    expect(view).toMatchObject({ count: 4, best: 4, flame: 2, todayDone: true, brokenOn: null, since: "2026-10-08" });
  });

  test("a weekend does not break the streak", () => {
    expect(streakView(ledger("2026-10-09", "2026-10-12"), "2026-10-12").count).toBe(2);
  });

  test("a written weekend day lengthens it", () => {
    const view = streakView(ledger("2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"), "2026-10-12");
    expect(view.count).toBe(4);
  });

  test("a missed working day breaks it and says which", () => {
    // Wednesday 10-07 is missing; today is Tuesday 10-13 and not written.
    const view = streakView(ledger("2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"), "2026-10-13");
    expect(view.count).toBe(0);
    expect(view.best).toBe(2);
    expect(view.brokenOn).toBe("2026-10-12");
  });

  test("a streak cut by a missed day counts only the days after it", () => {
    const view = streakView(ledger("2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13"), "2026-10-13");
    expect(view.count).toBe(4);
    expect(view.best).toBe(4);
    expect(view.brokenOn).toBeNull();
  });

  test("today not written yet does not break the streak", () => {
    const view = streakView(ledger("2026-10-08", "2026-10-09", "2026-10-12"), "2026-10-13");
    expect(view).toMatchObject({ count: 3, todayDone: false, brokenOn: null });
  });

  test("a Monday after a written Friday is not broken", () => {
    const view = streakView(ledger("2026-10-08", "2026-10-09"), "2026-10-12");
    expect(view).toMatchObject({ count: 2, todayDone: false, brokenOn: null });
  });

  test("the best streak is the longest one in the whole ledger", () => {
    const days = ledger("2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-21", "2026-10-12", "2026-10-13");
    const view = streakView(days, "2026-10-13");
    expect(view.count).toBe(2);
    expect(view.best).toBe(6);
  });

  test("a day with only one fact is not written", () => {
    const days: DayLedger = { "2026-10-12": { ...DONE, clear: false }, "2026-10-13": { ...DONE, work: false } };
    expect(streakView(days, "2026-10-13")).toMatchObject({ count: 0, best: 0, brokenOn: null });
  });

  test("the streak stops at the first day of the ledger", () => {
    const view = streakView(ledger("2026-10-12"), "2026-10-13");
    expect(view).toMatchObject({ count: 1, since: "2026-10-12", brokenOn: null });
  });

  test("the flame follows the count", () => {
    const days = ledger(...Array.from({ length: 23 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`));
    // Weekends are written too, so all 23 days count.
    expect(streakView(days, "2026-09-23")).toMatchObject({ count: 23, flame: 5 });
  });

  test("does not change its input", () => {
    const days = ledger("2026-10-12");
    const copy = JSON.stringify(days);
    streakView(days, "2026-10-13");
    expect(JSON.stringify(days)).toBe(copy);
  });
});
