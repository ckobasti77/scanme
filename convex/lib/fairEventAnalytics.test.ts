// ADMIN v2 X3 — the pure aggregations of Analitika v2: Belgrade days across
// the DST change, visitors per day, models per visitor, the engaged visitors
// as a subset of the scanners, packages and rating buckets. TEST values only.

import { describe, expect, test } from "vitest";
import {
  fairBelgradeDateKey,
  fairCountByDay,
  fairEngagedVisitors,
  fairPackageComparison,
  fairRatingBuckets,
  fairVisitorDepth,
  fairVisitorsByDay,
} from "./fairEventAnalytics";

const DAYS = ["2026-10-09", "2026-10-10", "2026-10-11"];

describe("ADMIN v2 X3: a day is a Europe/Belgrade day", () => {
  test("the date key follows the Belgrade wall clock, in summer and in winter time", () => {
    // Summer time (UTC+2): 22:30 UTC is already the next day in Belgrade.
    expect(fairBelgradeDateKey(Date.parse("2026-10-09T21:59:59Z"))).toBe("2026-10-09");
    expect(fairBelgradeDateKey(Date.parse("2026-10-09T22:00:00Z"))).toBe("2026-10-10");
    // Winter time from 25 Oct 2026 (UTC+1), the days of Auto Moto Fest: the day turns at 23:00 UTC.
    expect(fairBelgradeDateKey(Date.parse("2026-10-30T22:30:00Z"))).toBe("2026-10-30");
    expect(fairBelgradeDateKey(Date.parse("2026-10-30T23:00:00Z"))).toBe("2026-10-31");
    // The night of the change has 25 hours and stays one day.
    expect(fairBelgradeDateKey(Date.parse("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    expect(fairBelgradeDateKey(Date.parse("2026-10-25T22:59:59Z"))).toBe("2026-10-25");
  });

  test("moments are counted on their Belgrade day; a moment outside the fair days is not counted", () => {
    const at = (local: string) => Date.parse(`${local}:00+02:00`);
    expect(fairCountByDay(DAYS, [at("2026-10-09T08:00"), at("2026-10-09T23:59"), at("2026-10-10T00:00"), at("2026-10-11T19:30"), at("2026-10-12T09:00"), at("2026-10-08T23:59")])).toEqual([2, 1, 1]);
    expect(fairCountByDay(DAYS, [])).toEqual([0, 0, 0]);
    expect(fairCountByDay([], [at("2026-10-09T08:00")])).toEqual([]);
  });

  test("a visitor counts once a day, on the day of the first and of the last scan of any row", () => {
    const at = (local: string) => Date.parse(`${local}:00+02:00`);
    const rows = [
      // Anna: two models on Friday, back on Sunday for one of them.
      { visitorId: "anna", firstScannedAt: at("2026-10-09T10:00"), lastScannedAt: at("2026-10-09T10:05") },
      { visitorId: "anna", firstScannedAt: at("2026-10-09T10:20"), lastScannedAt: at("2026-10-11T12:00") },
      // Boris: Saturday only, late at night.
      { visitorId: "boris", firstScannedAt: at("2026-10-10T23:30"), lastScannedAt: at("2026-10-10T23:40") },
      // Vera: first scan just after midnight on Sunday (22:10 UTC of Saturday).
      { visitorId: "vera", firstScannedAt: at("2026-10-11T00:10"), lastScannedAt: at("2026-10-11T00:10") },
    ];
    expect(fairVisitorsByDay(DAYS, rows)).toEqual([1, 1, 2]);
    expect(fairVisitorsByDay(DAYS, [])).toEqual([0, 0, 0]);
  });
});

describe("ADMIN v2 X3: visitors and what they did", () => {
  test("models per visitor: 1, 2, 3 and 4 or more", () => {
    const rows = [
      ...Array.from({ length: 1 }, () => ({ visitorId: "a" })),
      ...Array.from({ length: 2 }, () => ({ visitorId: "b" })),
      ...Array.from({ length: 3 }, () => ({ visitorId: "c" })),
      ...Array.from({ length: 4 }, () => ({ visitorId: "d" })),
      ...Array.from({ length: 7 }, () => ({ visitorId: "e" })),
      { visitorId: "f" },
    ];
    expect(fairVisitorDepth(rows)).toEqual({ one: 2, two: 1, three: 1, fourPlus: 2, visitors: 6 });
    expect(fairVisitorDepth([])).toEqual({ one: 0, two: 0, three: 0, fourPlus: 0, visitors: 0 });
  });

  test("engaged visitors are a subset of the scanners and are counted once, whatever they did", () => {
    const scanners = new Set(["a", "b", "c", "d"]);
    const engaged = fairEngagedVisitors(scanners, {
      rating: ["a", "a", "b", "x"], // a rated two models; x never scanned
      vote: ["a"],
      survey: [],
      lead: ["c", "x"],
    });
    expect(engaged).toEqual({ visitors: 3, rating: 2, vote: 1, survey: 0, lead: 1 });
    expect(engaged.visitors).toBeLessThanOrEqual(scanners.size);
    expect(fairEngagedVisitors(new Set(), { rating: ["a"], vote: [], survey: [], lead: [] })).toEqual({ visitors: 0, rating: 0, vote: 0, survey: 0, lead: 0 });
  });

  test("packages: scans per model, in the order Napredni, Starter, Besplatan; a package without a model is left out", () => {
    expect(fairPackageComparison([
      { tier: "included", scans: 10 }, { tier: "advanced", scans: 70 }, { tier: "included", scans: 15 }, { tier: "advanced", scans: 75 }, { tier: "included", scans: 5 },
    ])).toEqual([
      { tier: "advanced", models: 2, scans: 145, scansPerModel: 72.5 },
      { tier: "included", models: 3, scans: 30, scansPerModel: 10 },
    ]);
    expect(fairPackageComparison([{ tier: "starter", scans: 0 }, { tier: "advanced", scans: 1 }, { tier: "included", scans: 2 }, { tier: "starter", scans: 1 }]).map((row) => [row.tier, row.scansPerModel])).toEqual([["advanced", 1], ["starter", 0.5], ["included", 2]]);
    expect(fairPackageComparison([])).toEqual([]);
  });

  test("ratings 1–5 in five buckets by whole star; a half goes with the star below it", () => {
    expect(fairRatingBuckets([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5])).toEqual([2, 2, 2, 2, 2]);
    expect(fairRatingBuckets([4.5, 4.5, 5])).toEqual([0, 0, 0, 2, 1]);
    // A value outside the scale is not a rating.
    expect(fairRatingBuckets([0, 0.5, 5.5, Number.NaN])).toEqual([0, 0, 0, 0, 0]);
    expect(fairRatingBuckets([])).toEqual([0, 0, 0, 0, 0]);
  });
});
