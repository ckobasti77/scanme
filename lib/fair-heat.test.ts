import { describe, expect, test } from "vitest";
import { FAIR_HEAT_RULES, FAIR_HEAT_STOPS, fairHeatCap, fairHeatColor, fairHeatGradientCss, fairHeatLevel, fairHeatLevels, fairHeatMinutesAgo } from "./fair-heat";

const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("SAJAM SUPER: one heat scale for the public map and the admin", () => {
  test("too little activity in the period is `enough: false` with no levels (the map says so, never all blue)", () => {
    expect(fairHeatLevels(counts({ "hala-9": 2, "hala-6": 2 }), "today")).toEqual({ enough: false, levels: [] });
    expect(fairHeatLevels(counts({ "hala-9": 2 }), "hour")).toEqual({ enough: false, levels: [] });
    expect(fairHeatLevels(counts({}), "today").enough).toBe(false);
  });

  test("one scan never paints a stand red: the hot end is at least minCap", () => {
    const { levels } = fairHeatLevels(counts({ "hala-9": 1, "hala-6": 5 }), "today");
    const one = levels.find((row) => row.locationId === "hala-9")!.level;
    expect(one).toBeLessThan(0.3);
    expect(fairHeatColor(one)).not.toBe(fairHeatColor(1));
    expect(fairHeatCap([1, 5], "today")).toBe(FAIR_HEAT_RULES.today.minCap);
  });

  test("the hottest stand is the top of the period (p95 clip); zero gets no glow; levels are rounded", () => {
    const many = Object.fromEntries(Array.from({ length: 19 }, (_, index) => [`s${index}`, 20]));
    const { enough, levels } = fairHeatLevels(counts({ ...many, outlier: 400, quiet: 0 }), "today");
    expect(enough).toBe(true);
    // 21 positive values: the nearest-rank p95 is 20, so the outlier does not wash the rest out.
    expect(levels.find((row) => row.locationId === "s0")!.level).toBe(1);
    expect(levels.find((row) => row.locationId === "outlier")!.level).toBe(1);
    expect(levels.some((row) => row.locationId === "quiet")).toBe(false);
    for (const row of levels) expect(Number.isInteger(row.level * 100)).toBe(true);
  });

  test("levels rise with the count, monotonic and within 0…1", () => {
    const steps = [0, 1, 2, 4, 8, 16].map((value) => fairHeatLevel(value, 16));
    expect(steps[0]).toBe(0);
    for (let index = 1; index < steps.length; index += 1) expect(steps[index]).toBeGreaterThan(steps[index - 1]);
    expect(steps.at(-1)).toBe(1);
    expect(fairHeatLevel(50, 16)).toBe(1);
  });

  test("colour runs blue → turquoise → green → yellow → orange → red, and the legend uses the same stops", () => {
    expect(fairHeatColor(0)).toBe(FAIR_HEAT_STOPS[0].color);
    expect(fairHeatColor(1)).toBe(FAIR_HEAT_STOPS.at(-1)!.color);
    expect(fairHeatColor(0.44)).toBe(FAIR_HEAT_STOPS[2].color);
    expect(fairHeatColor(Number.NaN)).toBe(FAIR_HEAT_STOPS[0].color);
    expect(fairHeatColor(0.5)).toMatch(/^#[0-9a-f]{6}$/);
    // ScanMe green is never on the heat scale.
    expect(FAIR_HEAT_STOPS.map((stop) => stop.color.toLowerCase())).not.toContain("#6fc05d");
    const css = fairHeatGradientCss();
    for (const stop of FAIR_HEAT_STOPS) expect(css).toContain(stop.color);
  });

  test("„ažurirano pre X min“ counts whole minutes and never goes negative", () => {
    expect(fairHeatMinutesAgo(0, 59_999)).toBe(0);
    expect(fairHeatMinutesAgo(0, 125_000)).toBe(2);
    expect(fairHeatMinutesAgo(10_000, 0)).toBe(0);
  });
});
