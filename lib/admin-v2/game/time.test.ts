import { describe, expect, test } from "vitest";
import { DAY_MS, belgradeHour, dayKey, dayStart, isWorkday, shiftDay, weekStart, weekdayOf } from "./time";

describe("the calendar of the game is Belgrade time", () => {
  test("a moment late in the UTC evening already belongs to the next Belgrade day", () => {
    // 13 Oct 2026 22:30 UTC is 14 Oct 00:30 in Belgrade (summer time, UTC+2).
    expect(dayKey(Date.UTC(2026, 9, 13, 22, 30))).toBe("2026-10-14");
    expect(dayKey(Date.UTC(2026, 9, 13, 21, 30))).toBe("2026-10-13");
    // 1 Nov 2026 23:30 UTC is 2 Nov 00:30 in Belgrade (winter time, UTC+1).
    expect(dayKey(Date.UTC(2026, 10, 1, 23, 30))).toBe("2026-11-02");
  });

  test("the hour is the Belgrade hour in summer and in winter", () => {
    expect(belgradeHour(Date.UTC(2026, 9, 13, 9, 59))).toBe(11);
    expect(belgradeHour(Date.UTC(2026, 9, 13, 10, 0))).toBe(12);
    expect(belgradeHour(Date.UTC(2026, 10, 2, 10, 59))).toBe(11);
    expect(belgradeHour(Date.UTC(2026, 10, 2, 23, 0))).toBe(0);
  });

  test("a day starts at Belgrade midnight, also on the days the clock changes", () => {
    expect(dayStart("2026-10-13")).toBe(Date.UTC(2026, 9, 12, 22, 0));
    expect(dayStart("2026-11-02")).toBe(Date.UTC(2026, 10, 1, 23, 0));
    // 25 Oct 2026: the clock goes back at 03:00, so the day is 25 hours long.
    expect(dayStart("2026-10-25")).toBe(Date.UTC(2026, 9, 24, 22, 0));
    expect(dayStart("2026-10-26") - dayStart("2026-10-25")).toBe(DAY_MS + 3_600_000);
    // 29 Mar 2026: the clock goes forward, the day is 23 hours long.
    expect(dayStart("2026-03-30") - dayStart("2026-03-29")).toBe(DAY_MS - 3_600_000);
    for (const key of ["2026-10-13", "2026-10-25", "2026-10-26", "2026-03-29", "2026-01-01"]) {
      expect(dayKey(dayStart(key))).toBe(key);
      expect(dayKey(dayStart(key) - 1)).toBe(shiftDay(key, -1));
    }
  });

  test("days shift across months and years", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2026-10-13", 0)).toBe("2026-10-13");
    expect(shiftDay("2026-10-13", -7)).toBe("2026-10-06");
  });

  test("working days are Monday to Friday", () => {
    expect(weekdayOf("2026-10-12")).toBe(1);
    expect(weekdayOf("2026-10-13")).toBe(2);
    expect(weekdayOf("2026-10-18")).toBe(7);
    expect(isWorkday("2026-10-16")).toBe(true);
    expect(isWorkday("2026-10-17")).toBe(false);
    expect(isWorkday("2026-10-18")).toBe(false);
  });

  test("the week starts on Monday 00:00 in Belgrade", () => {
    const monday = dayStart("2026-10-12");
    expect(weekStart(Date.UTC(2026, 9, 13, 8, 0))).toBe(monday);
    expect(weekStart(monday)).toBe(monday);
    expect(weekStart(monday - 1)).toBe(dayStart("2026-10-05"));
    // Sunday 23:30 in Belgrade is still the old week.
    expect(weekStart(Date.UTC(2026, 9, 18, 21, 30))).toBe(monday);
    // The week of the clock change keeps its Monday.
    expect(weekStart(Date.UTC(2026, 9, 25, 12, 0))).toBe(dayStart("2026-10-19"));
  });
});
