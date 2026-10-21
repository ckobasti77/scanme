import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "@/lib/belgrade-time";
import { fairHeatCap, fairHeatLevel } from "@/lib/fair-heat";
import { clockText, cumulativeAt, dayLevelsAt, heightsAt, hourAt, hourLevels, hallSeries, hoursAreStale, layersAt, levelsAt, rankAt, standHoursTable } from "./timelapse";
import type { StandHoursData } from "./types";

// ADMIN v3 V3 — the pure core of the Vremeplov: one fair day, hour by hour, at a
// moment t. The fixture is a short TEST day (08:00 – 12:00, four hours) with
// invented numbers; the clock test uses a full 08:00 – 21:00 day.

const DATE = "2026-10-30";
const start = belgradeLocalToEpoch(`${DATE}T08:00`)!;
const HOUR = 3_600_000;

const stand = (standCode: string, mapLocationId: string, scans: number[], uniquePerModel: number[] = scans) => ({ standCode, mapLocationId, scans, uniquePerModel });

/** T1 leads the first hours, T2 overtakes it in the third; T9 and T10 tie; T0 never has a scan. */
const stands = [
  stand("T1", "test-loc-1", [10, 10, 0, 0]),
  stand("T2", "test-loc-2", [0, 5, 20, 10]),
  stand("T9", "test-loc-9", [3, 0, 0, 0]),
  stand("T10", "test-loc-10", [3, 0, 0, 0]),
  stand("T0", "test-loc-0", [0, 0, 0, 0]),
];

const data = (overrides: Partial<StandHoursData> = {}): StandHoursData => ({
  at: start + 4 * HOUR,
  dateKey: DATE,
  hours: [8, 9, 10, 11],
  stands,
  unread: 0,
  capped: false,
  ...overrides,
});

const series = hallSeries(data());
const byId = (id: string) => series.stands.find((item) => item.locationId === id)!;

describe("cumulativeAt", () => {
  const scans = [10, 20, 30];

  test("whole hours are the sum of the hours before", () => {
    expect(cumulativeAt(scans, 0)).toBe(0);
    expect(cumulativeAt(scans, 1)).toBe(10);
    expect(cumulativeAt(scans, 2)).toBe(30);
    expect(cumulativeAt(scans, 3)).toBe(60);
  });

  test("half an hour is half of that hour on top", () => {
    expect(cumulativeAt(scans, 0.5)).toBe(5);
    expect(cumulativeAt(scans, 1.5)).toBe(20);
    expect(cumulativeAt(scans, 2.25)).toBe(37.5);
  });

  test("an open day: the last hour runs only up to a fractional end", () => {
    // end = 2.5: the third hour lasts half an hour, so at the end all of it is in.
    expect(cumulativeAt(scans, 2.25, 2.5)).toBe(30 + 15);
    expect(cumulativeAt(scans, 2.5, 2.5)).toBe(60);
    expect(cumulativeAt(scans, 9, 2.5)).toBe(60);
  });

  test("clamps t to 0 … end and treats bad input as 0", () => {
    expect(cumulativeAt(scans, -4)).toBe(0);
    expect(cumulativeAt(scans, 99)).toBe(60);
    expect(cumulativeAt(scans, Number.NaN)).toBe(0);
    expect(cumulativeAt([5, Number.NaN, -3, 7], 4)).toBe(12);
    expect(cumulativeAt([], 3)).toBe(0);
  });

  test("never decreases with t", () => {
    let previous = 0;
    for (let t = 0; t <= 3; t += 0.05) {
      const value = cumulativeAt(scans, t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(previous).toBeCloseTo(60, 9);
  });
});

describe("hallSeries", () => {
  test("sorts by total desc, then label (numeric-aware), and drops stands without a scan", () => {
    expect(series.stands.map((item) => item.label)).toEqual(["T2", "T1", "T9", "T10"]);
    expect(series.stands.map((item) => item.total)).toEqual([35, 20, 3, 3]);
    expect(series.maxTotal).toBe(35);
    expect(series.hours).toEqual([8, 9, 10, 11]);
    expect(series.dateKey).toBe(DATE);
  });

  test("two stands of one map location are summed into one column", () => {
    const merged = hallSeries(
      data({
        stands: [
          stand("T11", "test-loc-m", [1, 2, 3, 4], [1, 1, 1, 1]),
          stand("T3", "test-loc-m", [4, 3, 2, 1], [2, 2, 2, 2]),
          stand("T1", "test-loc-1", [1, 0, 0, 0]),
        ],
      }),
    );
    expect(merged.stands).toHaveLength(2);
    const column = merged.stands[0];
    expect(column.locationId).toBe("test-loc-m");
    expect(column.label).toBe("T3, T11");
    expect(column.scans).toEqual([5, 5, 5, 5]);
    expect(column.unique).toEqual([3, 3, 3, 3]);
    expect(column.total).toBe(20);
  });

  test("a stand without a map location is grouped by its code", () => {
    const loose = hallSeries(data({ stands: [stand("T5", "", [1, 0, 0, 0]), stand("T5", "", [0, 2, 0, 0])] }));
    expect(loose.stands).toHaveLength(1);
    expect(loose.stands[0].locationId).toBe("T5");
    expect(loose.stands[0].scans).toEqual([1, 2, 0, 0]);
  });

  test("unique is null as soon as one stand of the group has none", () => {
    const partial = hallSeries(data({ stands: [stand("T1", "test-loc-m", [1, 1, 1, 1], [1, 1, 1, 1]), stand("T2", "test-loc-m", [2, 2, 2, 2], [])] }));
    expect(partial.stands[0].unique).toBeNull();
    expect(partial.stands[0].scans).toEqual([3, 3, 3, 3]);
  });

  test("a short scans array counts as zeros; the result is always as long as the hours", () => {
    const short = hallSeries(data({ stands: [stand("T1", "test-loc-1", [4], [4])] }));
    expect(short.stands[0].scans).toEqual([4, 0, 0, 0]);
    expect(short.stands[0].unique).toBeNull();
  });

  test("a finished day ends at the number of hours", () => {
    expect(series.end).toBe(4);
    expect(hallSeries(data({ at: start + 40 * HOUR })).end).toBe(4);
  });

  test("an open day ends at a fraction: how far the running hour has got", () => {
    expect(hallSeries(data({ at: start + 3.5 * HOUR })).end).toBeCloseTo(3.5, 9);
    expect(hallSeries(data({ at: start + 3.25 * HOUR })).end).toBeCloseTo(3.25, 9);
  });

  test("an open day never ends at or before the start of its last hour", () => {
    const justOpened = hallSeries(data({ at: start + 3 * HOUR })).end;
    expect(justOpened).toBeGreaterThan(3);
    expect(justOpened).toBeLessThan(3.1);
    expect(hallSeries(data({ at: start - HOUR })).end).toBe(justOpened);
  });

  test("an empty day: no hours, no stands, end 0", () => {
    const empty = hallSeries(data({ hours: [], stands: [], at: start }));
    expect(empty.stands).toEqual([]);
    expect(empty.end).toBe(0);
    expect(empty.maxTotal).toBe(0);
    expect(hourAt(empty, 1)).toBe(-1);
    expect(heightsAt(empty, 1).size).toBe(0);
    expect(rankAt(empty, 1)).toEqual([]);
    expect(clockText(empty, 1)).toBe("");
  });

  test("a day without any scan has no stands and a zero scale", () => {
    const quiet = hallSeries(data({ stands: [stand("T0", "test-loc-0", [0, 0, 0, 0])] }));
    expect(quiet.stands).toEqual([]);
    expect(quiet.maxTotal).toBe(0);
    expect(quiet.end).toBe(4);
  });

  test("carries the capped flag", () => {
    expect(hallSeries(data({ capped: true })).capped).toBe(true);
    expect(series.capped).toBe(false);
  });
});

describe("hourAt", () => {
  test("the hour t is in, clamped into the series", () => {
    expect(hourAt(series, 0)).toBe(0);
    expect(hourAt(series, 0.99)).toBe(0);
    expect(hourAt(series, 1)).toBe(1);
    expect(hourAt(series, 3.5)).toBe(3);
    expect(hourAt(series, 4)).toBe(3);
    expect(hourAt(series, 99)).toBe(3);
    expect(hourAt(series, -2)).toBe(0);
  });
});

describe("heightsAt", () => {
  test("every stand of the series is in the map", () => {
    expect([...heightsAt(series, 0).keys()].sort()).toEqual(["test-loc-1", "test-loc-10", "test-loc-2", "test-loc-9"]);
    expect(heightsAt(series, 0).get("test-loc-2")).toBe(0);
  });

  test("the tallest stand reaches exactly 1 at the end and nobody exceeds 1", () => {
    const heights = heightsAt(series, series.end);
    expect(heights.get("test-loc-2")).toBe(1);
    for (const value of heights.values()) expect(value).toBeLessThanOrEqual(1);
    expect(heights.get("test-loc-1")).toBeCloseTo(20 / 35, 9);
  });

  test("the scale does not change during the day: t = 3 is on the same scale as t = end", () => {
    // T2 has 25 scans at t = 3 against a scale of 35, not against the 25 of that moment.
    expect(heightsAt(series, 3).get("test-loc-2")).toBeCloseTo(25 / 35, 9);
    expect(heightsAt(series, 3).get("test-loc-1")).toBeCloseTo(20 / 35, 9);
    expect(heightsAt(series, 1).get("test-loc-1")).toBeCloseTo(10 / 35, 9);
  });

  test("grows without a step in the running hour", () => {
    expect(heightsAt(series, 2.5).get("test-loc-2")).toBeCloseTo(15 / 35, 9);
  });

  test("a series without scans has all heights 0 (no division by zero)", () => {
    const flat = { ...series, stands: series.stands.map((item) => ({ ...item, scans: [0, 0, 0, 0] })), maxTotal: 0 };
    for (const value of heightsAt(flat, 2).values()) expect(value).toBe(0);
  });

  test("an open day: the tallest stand is at 1 at its fractional end", () => {
    const open = hallSeries(data({ at: start + 3.5 * HOUR }));
    expect(heightsAt(open, open.end).get("test-loc-2")).toBe(1);
  });
});

describe("hourLevels", () => {
  test("the level of one hour on the heat scale of the hour, from the unique counts", () => {
    const counts = [10, 0, 3, 3];
    const cap = fairHeatCap(counts, "hour");
    const levels = hourLevels(series, 0);
    expect(levels.get("test-loc-1")).toBe(fairHeatLevel(10, cap));
    expect(levels.get("test-loc-1")).toBe(1);
    expect(levels.get("test-loc-9")).toBe(fairHeatLevel(3, cap));
    expect(levels.get("test-loc-2")).toBe(0);
  });

  test("uses the scans when the unique counts were not read", () => {
    const noUnique = hallSeries(data({ stands: [stand("T1", "test-loc-1", [8, 0, 0, 0], []), stand("T2", "test-loc-2", [2, 0, 0, 0], [])] }));
    expect(hourLevels(noUnique, 0).get("test-loc-1")).toBe(1);
    expect(hourLevels(noUnique, 0).get("test-loc-2")).toBe(fairHeatLevel(2, 8));
  });

  test("an hour out of range is an empty map", () => {
    expect(hourLevels(series, -1).size).toBe(0);
    expect(hourLevels(series, 4).size).toBe(0);
    expect(hourLevels(series, 0.5).size).toBe(0);
  });

  test("is cached per series: the same object comes back", () => {
    expect(hourLevels(series, 1)).toBe(hourLevels(series, 1));
    expect(hourLevels(series, 1)).not.toBe(hourLevels(hallSeries(data()), 1));
  });
});

describe("levelsAt", () => {
  test("is 0 for every stand at t = 0", () => {
    for (const value of levelsAt(series, 0).values()) expect(value).toBe(0);
    expect(levelsAt(series, 0).size).toBe(4);
  });

  test("at a whole hour it is exactly the level of the hour that has just ended", () => {
    for (let hour = 1; hour <= 4; hour += 1) {
      const levels = levelsAt(series, hour);
      for (const item of series.stands) expect(levels.get(item.locationId)).toBe(hourLevels(series, hour - 1).get(item.locationId) ?? 0);
    }
  });

  test("at the end of an open day it is the level of the last (running) hour", () => {
    const open = hallSeries(data({ at: start + 3.5 * HOUR }));
    expect(open.end).toBeCloseTo(3.5, 9);
    expect(levelsAt(open, open.end).get("test-loc-2")).toBe(hourLevels(open, 3).get("test-loc-2"));
  });

  test("is linear between two hours", () => {
    const from = hourLevels(series, 1).get("test-loc-2")!;
    const to = hourLevels(series, 2).get("test-loc-2")!;
    expect(from).not.toBe(to);
    expect(levelsAt(series, 2.5).get("test-loc-2")).toBeCloseTo(from + (to - from) * 0.5, 9);
    expect(levelsAt(series, 2.25).get("test-loc-2")).toBeCloseTo(from + (to - from) * 0.25, 9);
    // The first hour rises from 0: L(-1) is 0.
    expect(levelsAt(series, 0.5).get("test-loc-1")).toBeCloseTo(hourLevels(series, 0).get("test-loc-1")! * 0.5, 9);
  });

  test("clamps t past the end", () => {
    expect(levelsAt(series, 99).get("test-loc-2")).toBe(levelsAt(series, 4).get("test-loc-2"));
  });
});

describe("dayLevelsAt", () => {
  test("is 0 for every stand at t = 0", () => {
    const levels = dayLevelsAt(series, 0);
    expect(levels.size).toBe(series.stands.length);
    for (const level of levels.values()) expect(level).toBe(0);
  });

  test("is the heat of the day so far: the unique counts since the opening on the scale of a day", () => {
    // After the first hour: T1 10, T9 and T10 3 each, T2 none yet.
    const first = dayLevelsAt(series, 1);
    const cap = fairHeatCap([10, 0, 3, 3], "today");
    expect(first.get("test-loc-1")).toBe(fairHeatLevel(10, cap));
    expect(first.get("test-loc-9")).toBe(fairHeatLevel(3, cap));
    expect(first.get("test-loc-2")).toBe(0);
    // At the end of the day T2 (35) has overtaken T1 (20) and is the hot end.
    const last = dayLevelsAt(series, series.end);
    expect(last.get("test-loc-2")).toBe(1);
    expect(last.get("test-loc-1")).toBe(fairHeatLevel(20, fairHeatCap([20, 35, 3, 3], "today")));
    expect(last.get("test-loc-1")!).toBeLessThan(1);
  });

  test("early in the day nobody is at the hot end: the scale of a day needs a few scans", () => {
    // Half an hour in: T1 has 5, and the least count that reaches the hot end of a day is 8.
    expect(dayLevelsAt(series, 0.5).get("test-loc-1")).toBe(fairHeatLevel(5, 8));
    expect(dayLevelsAt(series, 0.5).get("test-loc-1")!).toBeLessThan(1);
    // The heat of the HOUR is another measure: there T1 is already the hot end.
    expect(levelsAt(series, 1).get("test-loc-1")).toBe(1);
  });

  test("uses the scans when the unique counts were not read", () => {
    const plain = hallSeries(data({ stands: [{ ...stands[0], uniquePerModel: [] }, stands[1]] }));
    expect(plain.stands.find((item) => item.locationId === "test-loc-1")!.unique).toBeNull();
    expect(dayLevelsAt(plain, plain.end).get("test-loc-1")).toBe(fairHeatLevel(20, fairHeatCap([20, 35], "today")));
  });

  test("never goes down for the leading stand, and clamps t past the end", () => {
    let before = 0;
    for (let t = 0; t <= series.end; t += 0.25) {
      const level = Math.max(...dayLevelsAt(series, t).values());
      expect(level).toBeGreaterThanOrEqual(before);
      before = level;
    }
    expect([...dayLevelsAt(series, 99)]).toEqual([...dayLevelsAt(series, series.end)]);
  });
});

describe("one measure of heat per day", () => {
  // T1 has no unique counts (the budget of the read), T2 has them and they are far below its scans.
  const mixed = hallSeries(data({ stands: [{ ...stands[0], uniquePerModel: [] }, stand("T2", "test-loc-2", [0, 5, 20, 10], [0, 1, 2, 1])] }));

  test("when one stand has no unique counts, every stand is measured in scans", () => {
    expect(mixed.stands.find((item) => item.locationId === "test-loc-1")!.unique).toBeNull();
    expect(mixed.stands.find((item) => item.locationId === "test-loc-2")!.unique).toEqual([0, 1, 2, 1]);
    // Hour 2 (10:00): T1 has 0 scans, T2 has 20 scans (2 unique). On scans T2 is the hot end; on its 2 unique it would not be.
    expect(hourLevels(mixed, 2).get("test-loc-2")).toBe(fairHeatLevel(20, fairHeatCap([0, 20], "hour")));
    expect(hourLevels(mixed, 2).get("test-loc-2")).toBe(1);
    // Hour 0: T1 has 10 scans and is not compared with T2's unique counts.
    expect(hourLevels(mixed, 0).get("test-loc-1")).toBe(fairHeatLevel(10, fairHeatCap([10, 0], "hour")));
    // The day so far follows the same rule: scans of both, 20 against 35.
    expect(dayLevelsAt(mixed, mixed.end).get("test-loc-1")).toBe(fairHeatLevel(20, fairHeatCap([20, 35], "today")));
    expect(dayLevelsAt(mixed, mixed.end).get("test-loc-2")).toBe(1);
  });

  test("when every stand has them, the measure is unique per model", () => {
    const all = hallSeries(data({ stands: [stand("T1", "test-loc-1", [10, 10, 0, 0], [8, 2, 0, 0]), stand("T2", "test-loc-2", [0, 5, 20, 10], [0, 1, 2, 1])] }));
    expect(hourLevels(all, 0).get("test-loc-1")).toBe(fairHeatLevel(8, fairHeatCap([8, 0], "hour")));
    expect(dayLevelsAt(all, all.end).get("test-loc-2")).toBe(fairHeatLevel(4, fairHeatCap([10, 4], "today")));
  });
});

describe("hoursAreStale: when the layers of the live hall are read again", () => {
  test("the same hour is fresh, a later hour is stale, an earlier one never is", () => {
    expect(hoursAreStale(start + 10 * 60_000, start + 5 * 60_000)).toBe(false);
    expect(hoursAreStale(start + 59 * 60_000, start)).toBe(false);
    expect(hoursAreStale(start + HOUR, start + 59 * 60_000)).toBe(true);
    expect(hoursAreStale(start + 6 * HOUR, start + 10 * 60_000)).toBe(true);
    expect(hoursAreStale(start, start + HOUR)).toBe(false);
  });

  test("a time that is not a number asks for nothing", () => {
    expect(hoursAreStale(Number.NaN, start)).toBe(false);
    expect(hoursAreStale(start, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("layersAt", () => {
  const two = byId("test-loc-2");
  const one = byId("test-loc-1");

  test("nothing at t = 0", () => {
    expect(layersAt(series, two, 0)).toEqual([]);
  });

  test("one layer per hour that has scans in it, oldest first", () => {
    const layers = layersAt(series, two, 4);
    expect(layers.map((layer) => layer.hour)).toEqual([9, 10, 11]);
    expect(layers.map((layer) => layer.scans)).toEqual([5, 20, 10]);
  });

  test("the running hour is a partial layer", () => {
    const layers = layersAt(series, two, 2.5);
    expect(layers.map((layer) => layer.hour)).toEqual([9, 10]);
    expect(layers[0].scans).toBe(5);
    expect(layers[1].scans).toBeCloseTo(10, 9);
  });

  test("an hour that has not started has no layer; a whole hour starts it empty", () => {
    expect(layersAt(series, one, 1).map((layer) => layer.hour)).toEqual([8]);
    expect(layersAt(series, one, 1.01).map((layer) => layer.hour)).toEqual([8, 9]);
    expect(layersAt(series, one, 2)).toHaveLength(2);
  });

  test("the level of a layer is the level of its hour", () => {
    const layers = layersAt(series, two, 4);
    expect(layers[0].level).toBe(hourLevels(series, 1).get("test-loc-2"));
    expect(layers[1].level).toBe(hourLevels(series, 2).get("test-loc-2"));
    expect(layers[1].level).toBe(1);
  });

  test("the layers add up to the cumulative at every moment", () => {
    for (const item of series.stands) {
      for (let t = 0; t <= series.end; t += 0.125) {
        const sum = layersAt(series, item, t).reduce((total, layer) => total + layer.scans, 0);
        expect(sum).toBeCloseTo(cumulativeAt(item.scans, t, series.end), 9);
      }
    }
  });

  test("on an open day the layers add up at its fractional end", () => {
    const open = hallSeries(data({ at: start + 3.5 * HOUR }));
    const column = open.stands.find((item) => item.locationId === "test-loc-2")!;
    const sum = layersAt(open, column, open.end).reduce((total, layer) => total + layer.scans, 0);
    expect(sum).toBeCloseTo(35, 9);
  });
});

describe("rankAt", () => {
  test("is empty before the first scan", () => {
    expect(rankAt(series, 0)).toEqual([]);
  });

  test("stands without a scan by t are absent", () => {
    const ids = rankAt(series, 1).map((row) => row.locationId);
    expect(ids).toContain("test-loc-1");
    expect(ids).not.toContain("test-loc-2");
    expect(rankAt(series, 1.2).map((row) => row.locationId)).toContain("test-loc-2");
  });

  test("the order changes when a later stand overtakes", () => {
    expect(rankAt(series, 2)[0].locationId).toBe("test-loc-1");
    expect(rankAt(series, 2.5)[0].locationId).toBe("test-loc-1");
    expect(rankAt(series, 3)[0].locationId).toBe("test-loc-2");
    expect(rankAt(series, 4).map((row) => row.locationId)).toEqual(["test-loc-2", "test-loc-1", "test-loc-9", "test-loc-10"]);
  });

  test("rows carry the label, the rounded scans and the place 1, 2, 3 …", () => {
    expect(rankAt(series, 4)).toEqual([
      { locationId: "test-loc-2", label: "T2", scans: 35, place: 1 },
      { locationId: "test-loc-1", label: "T1", scans: 20, place: 2 },
      { locationId: "test-loc-9", label: "T9", scans: 3, place: 3 },
      { locationId: "test-loc-10", label: "T10", scans: 3, place: 4 },
    ]);
    expect(rankAt(series, 1.5)[0].scans).toBe(15);
    expect(rankAt(series, 0.25)[0].scans).toBe(3);
  });

  test("a tie goes by label, numeric-aware: T9 before T10", () => {
    expect(rankAt(series, 1).map((row) => row.label)).toEqual(["T1", "T9", "T10"]);
    expect(rankAt(series, 1).map((row) => row.place)).toEqual([1, 2, 3]);
  });

  test("the order is by the unrounded value", () => {
    const close = hallSeries(data({ stands: [stand("T1", "test-loc-1", [10, 0, 0, 0]), stand("T2", "test-loc-2", [10, 0, 0, 0]), stand("T3", "test-loc-3", [4, 0, 0, 0])] }));
    // At t = 0.5 all are unrounded halves (5, 5, 2); the tie is by label.
    expect(rankAt(close, 0.5).map((row) => row.label)).toEqual(["T1", "T2", "T3"]);
    const uneven = hallSeries(data({ stands: [stand("T1", "test-loc-1", [9, 0, 0, 0]), stand("T2", "test-loc-2", [10, 0, 0, 0])] }));
    // 4.5 and 5 both show as 5; the unrounded value decides, not the label.
    expect(rankAt(uneven, 0.5).map((row) => row.label)).toEqual(["T2", "T1"]);
  });

  test("limit cuts the list", () => {
    expect(rankAt(series, 4, 2).map((row) => row.label)).toEqual(["T2", "T1"]);
    expect(rankAt(series, 4, 0)).toEqual([]);
    expect(rankAt(series, 4, 99)).toHaveLength(4);
  });
});

describe("clockText", () => {
  const hours = Array.from({ length: 13 }, (_, index) => 8 + index);
  const day = hallSeries({ at: start + 13 * HOUR, dateKey: DATE, hours, stands: [stand("T1", "test-loc-1", hours.map(() => 1))], unread: 0, capped: false });

  test("the clock of the day at t", () => {
    expect(clockText(day, 0)).toBe("08:00");
    expect(clockText(day, 1)).toBe("09:00");
    expect(clockText(day, 6.5)).toBe("14:30");
    expect(clockText(day, 13)).toBe("21:00");
    expect(clockText(day, 12.999)).toBe("20:59");
  });

  test("whole minutes are floored and a float does not read a minute early", () => {
    expect(clockText(day, 6 + 1 / 3)).toBe("14:20");
    expect(clockText(day, 6 + 20 / 60)).toBe("14:20");
    expect(clockText(day, 0.01)).toBe("08:00");
  });

  test("clamps t into the day", () => {
    expect(clockText(day, -3)).toBe("08:00");
    expect(clockText(day, 99)).toBe("21:00");
  });

  test("an open day stops at its own end", () => {
    const open = hallSeries({ at: start + 3.5 * HOUR, dateKey: DATE, hours: [8, 9, 10, 11], stands, unread: 0, capped: false });
    expect(clockText(open, 99)).toBe("11:30");
  });
});

describe("standHoursTable", () => {
  test("stands × hours of the day, in the order of the series", () => {
    const table = standHoursTable(series);
    expect(table.hours).toEqual([8, 9, 10, 11]);
    expect(table.rows).toEqual([
      { label: "T2", scans: [0, 5, 20, 10], total: 35 },
      { label: "T1", scans: [10, 10, 0, 0], total: 20 },
      { label: "T9", scans: [3, 0, 0, 0], total: 3 },
      { label: "T10", scans: [3, 0, 0, 0], total: 3 },
    ]);
  });

  test("is a copy: changing it does not change the series", () => {
    const table = standHoursTable(series);
    table.rows[0].scans[0] = 999;
    table.hours[0] = 0;
    expect(series.stands[0].scans[0]).toBe(0);
    expect(series.hours[0]).toBe(8);
  });
});
