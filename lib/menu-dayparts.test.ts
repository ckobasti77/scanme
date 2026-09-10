import { describe, expect, it } from "vitest";
import {
  activeDaypartKey,
  daypartGroups,
  DEFAULT_DAYPART_WINDOWS,
  resolveEffectiveDaypart,
} from "./menu-dayparts";
import { belgradeMinuteOfDay } from "./belgrade-time";
import { defaults, type MenuGroup } from "./menu-blocks";

// The boundary the tests exercise: 11:00 (660 min) divides doručak / ručak in
// the PLACEHOLDER windows. The two epochs below straddle it in BELGRADE
// wall-clock. They are chosen so a naïve UTC reading would NOT switch (both fall
// in doručak under UTC), so a passing switch proves the venue timezone is used.
//   winter (CET, UTC+1): 10:59 Belgrade = 09:59 UTC;  11:01 = 10:01 UTC
//   summer (CEST, UTC+2): 10:59 Belgrade = 08:59 UTC;  11:01 = 09:01 UTC
const WINTER_BEFORE = Date.UTC(2026, 0, 15, 9, 59); // 10:59 Belgrade (CET)
const WINTER_AFTER = Date.UTC(2026, 0, 15, 10, 1); // 11:01 Belgrade (CET)
const SUMMER_BEFORE = Date.UTC(2026, 6, 15, 8, 59); // 10:59 Belgrade (CEST)
const SUMMER_AFTER = Date.UTC(2026, 6, 15, 9, 1); // 11:01 Belgrade (CEST)

describe("belgradeMinuteOfDay (venue timezone, non-UTC)", () => {
  it("reads the minute of day in Belgrade, not UTC, across DST", () => {
    expect(belgradeMinuteOfDay(WINTER_BEFORE)).toBe(10 * 60 + 59); // 659
    expect(belgradeMinuteOfDay(WINTER_AFTER)).toBe(11 * 60 + 1); // 661
    expect(belgradeMinuteOfDay(SUMMER_BEFORE)).toBe(10 * 60 + 59); // 659
    expect(belgradeMinuteOfDay(SUMMER_AFTER)).toBe(11 * 60 + 1); // 661
  });
});

describe("activeDaypartKey — the boundary minute picks the right daypart", () => {
  it("switches doručak → ručak across the 11:00 boundary in winter (CET)", () => {
    expect(
      activeDaypartKey(DEFAULT_DAYPART_WINDOWS, belgradeMinuteOfDay(WINTER_BEFORE)),
    ).toBe("dorucak");
    expect(
      activeDaypartKey(DEFAULT_DAYPART_WINDOWS, belgradeMinuteOfDay(WINTER_AFTER)),
    ).toBe("rucak");
  });

  it("switches doručak → ručak across the 11:00 boundary in summer (CEST)", () => {
    expect(
      activeDaypartKey(DEFAULT_DAYPART_WINDOWS, belgradeMinuteOfDay(SUMMER_BEFORE)),
    ).toBe("dorucak");
    expect(
      activeDaypartKey(DEFAULT_DAYPART_WINDOWS, belgradeMinuteOfDay(SUMMER_AFTER)),
    ).toBe("rucak");
  });

  it("returns null when no window contains the minute", () => {
    // 03:00 — before doručak (07:00), no window matches.
    expect(activeDaypartKey(DEFAULT_DAYPART_WINDOWS, 3 * 60)).toBeNull();
  });

  it("handles a window that wraps past midnight (start > end)", () => {
    const windows = [{ key: "nocno", startMinute: 22 * 60, endMinute: 2 * 60 }];
    expect(activeDaypartKey(windows, 23 * 60)).toBe("nocno"); // 23:00 in
    expect(activeDaypartKey(windows, 60)).toBe("nocno"); // 01:00 in
    expect(activeDaypartKey(windows, 10 * 60)).toBeNull(); // 10:00 out
  });

  it("ignores an empty window (start === end)", () => {
    expect(activeDaypartKey([{ key: "x", startMinute: 600, endMinute: 600 }], 600)).toBeNull();
  });
});

describe("override BEATS the clock (§2.5) — at both boundary minutes", () => {
  it("pins the override regardless of the minute, before and after the boundary", () => {
    for (const epoch of [WINTER_BEFORE, WINTER_AFTER, SUMMER_BEFORE, SUMMER_AFTER]) {
      expect(
        activeDaypartKey(DEFAULT_DAYPART_WINDOWS, belgradeMinuteOfDay(epoch), "vecera"),
      ).toBe("vecera");
    }
  });

  it("resolveEffectiveDaypart: non-empty override wins, empty/null falls back to the clock", () => {
    expect(resolveEffectiveDaypart("vecera", "dorucak")).toBe("vecera");
    expect(resolveEffectiveDaypart("", "dorucak")).toBe("dorucak");
    expect(resolveEffectiveDaypart(null, "dorucak")).toBe("dorucak");
    expect(resolveEffectiveDaypart(undefined, null)).toBeNull();
  });
});

describe("daypartGroups — visibility by daypart binding", () => {
  function bound(key: string | undefined, id: string): MenuGroup {
    const g = defaults("lista");
    return { ...g, base: { ...g.base, id, title: id, daypartKey: key } };
  }
  const groups: MenuGroup[] = [
    bound(undefined, "always"),
    bound("dorucak", "breakfast"),
    bound("rucak", "lunch"),
  ];

  it("shows always-on groups plus those bound to the active key", () => {
    expect(daypartGroups(groups, "dorucak").map((g) => g.base.id)).toEqual([
      "always",
      "breakfast",
    ]);
    expect(daypartGroups(groups, "rucak").map((g) => g.base.id)).toEqual([
      "always",
      "lunch",
    ]);
  });

  it("shows only always-on groups when no daypart is active", () => {
    expect(daypartGroups(groups, null).map((g) => g.base.id)).toEqual(["always"]);
  });
});
