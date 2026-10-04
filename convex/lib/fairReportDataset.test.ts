// Sajam 2026 B6 — the pure daily-dataset projection and assembly
// (MASTER §12; BACKEND-HANDOFF §10, §12 "Izveštaji i izolacija").

import { describe, expect, test } from "vitest";
import type { Id, TableNames } from "../_generated/dataModel";
import {
  assembleFairDailyDataset,
  fairHourKey,
  fairTiersHaveDailyReport,
  fairWindowHourKeys,
  projectFairReportModel,
  type FairDailyDatasetContext,
  type FairReportModelRaw,
} from "./fairReportDataset";
import { fairTimeKeys } from "./fairScans";

const id = <T extends TableNames>(value: string) => value as Id<T>;
const DAY1_START = Date.parse("2026-10-09T00:00:00+02:00");
const DAY1_END = Date.parse("2026-10-10T00:00:00+02:00");

/** Everything a model could carry, regardless of its package. */
function fullRaw(tier: FairReportModelRaw["tier"], overrides: Partial<FairReportModelRaw> = {}): FairReportModelRaw {
  return {
    eventModelId: id(`model-${tier}`),
    displayName: `TEST ${tier}`,
    standId: id("stand-1"),
    sortOrder: 0,
    tier,
    scans: { total: 10, unique: 4 },
    hourly: [{ hourKey: "2026-10-09T10", total: 10, unique: 4 }],
    interest: { count: 2, capped: false },
    testDrive: { count: 1, capped: false },
    ratings: [
      { field: "overall", count: 3, average: 4.33 },
      { field: "appearance", count: 2, average: 5 },
      { field: "specifications", count: 1, average: 3 },
      { field: "price", count: 0, average: null },
    ],
    audience: [],
    surveys: [],
    sponsored: { openModel: 3, garageAdd: 1 },
    ...overrides,
  };
}

const context = (overrides: Partial<FairDailyDatasetContext> = {}): FairDailyDatasetContext => ({
  event: { _id: id("event-1"), title: "TEST sajam", slug: "test-sajam" },
  day: { _id: id("day-2"), dateKey: "2026-10-09", label: "TEST dan", startsAt: DAY1_START, endsAt: DAY1_END },
  previousDay: null,
  participationId: id("participation-a"),
  exhibitorName: "TEST izlagač A",
  stands: [{ standId: id("stand-1"), code: "TEST-A", displayName: "TEST štand A", total: 30, unique: 12 }],
  modelsTruncated: false,
  builtAt: DAY1_END + 5 * 60 * 1000,
  ...overrides,
});

describe("projection: a group the package lacks is OMITTED, never a zero", () => {
  test("included keeps only its identity and the stand group", () => {
    const projected = projectFairReportModel(fullRaw("included"));
    expect(projected.metrics).toEqual(["stand_scans"]);
    for (const key of ["scans", "interest", "testDrive", "ratings", "audience", "surveys", "sponsored"]) expect(projected).not.toHaveProperty(key);
  });

  test("Starter has no Advanced keys at all (no fake test-drive/survey/sponsored zeros) and only the overall rating", () => {
    const projected = projectFairReportModel(fullRaw("starter"));
    expect(projected.scans).toEqual({ total: 10, unique: 4 });
    expect(projected.interest).toEqual({ count: 2, capped: false });
    expect(projected.ratings).toEqual([{ field: "overall", count: 3, average: 4.33 }]);
    expect(projected).not.toHaveProperty("testDrive");
    expect(projected).not.toHaveProperty("surveys");
    expect(projected).not.toHaveProperty("sponsored");
  });

  test("Advanced has its extras and the three dimensions, never an overall (not even a stored one)", () => {
    const projected = projectFairReportModel(fullRaw("advanced"));
    expect(projected.testDrive).toEqual({ count: 1, capped: false });
    expect(projected.sponsored).toEqual({ openModel: 3, garageAdd: 1 });
    expect(projected.surveys).toEqual([]);
    expect(projected.ratings?.map((row) => row.field)).toEqual(["appearance", "specifications", "price"]);
  });

  test("only a package with a daily report triggers the automatic build", () => {
    expect(fairTiersHaveDailyReport(["included", "included"])).toBe(false);
    expect(fairTiersHaveDailyReport(["included", "starter"])).toBe(true);
    expect(fairTiersHaveDailyReport([])).toBe(false);
  });
});

describe("assembly", () => {
  test("hourly sums only models with the hourly group; an included model's scans never leak into it", () => {
    const dataset = assembleFairDailyDataset(context(), [
      fullRaw("starter", { eventModelId: id("m-s"), hourly: [{ hourKey: "2026-10-09T10", total: 5, unique: 2 }] }),
      fullRaw("included", { eventModelId: id("m-i"), hourly: [{ hourKey: "2026-10-09T10", total: 100, unique: 100 }] }),
    ]);
    expect(dataset.hourly).toHaveLength(24);
    expect(dataset.hourly?.find((hour) => hour.hourKey === "2026-10-09T10")).toEqual({ hourKey: "2026-10-09T10", total: 5, unique: 2 });
    expect(dataset.hourly?.reduce((sum, hour) => sum + hour.total, 0)).toBe(5);
  });

  test("an included-only participation gets stand totals and nothing else (no hourly, no comparison)", () => {
    const dataset = assembleFairDailyDataset(context({ previousDay: { _id: id("day-1"), dateKey: "2026-10-08" } }), [
      fullRaw("included", { previous: { tier: "included" } }),
    ]);
    expect(dataset.stands).toHaveLength(1);
    expect(dataset).not.toHaveProperty("hourly");
    expect(dataset).not.toHaveProperty("comparison");
    expect(dataset.models[0].metrics).toEqual(["stand_scans"]);
  });

  test("the day comparison is like-for-like: a model that lacked a group yesterday is left out of that row", () => {
    const dataset = assembleFairDailyDataset(context({ previousDay: { _id: id("day-1"), dateKey: "2026-10-08" } }), [
      // Upgraded starter → advanced overnight: it had scans and interest yesterday, but no test drive.
      fullRaw("advanced", { eventModelId: id("m-up"), previous: { tier: "starter", scans: { total: 7, unique: 3 }, interest: { count: 1, capped: false } } }),
      fullRaw("starter", { eventModelId: id("m-s"), scans: { total: 1, unique: 1 }, interest: { count: 0, capped: false }, previous: { tier: "starter", scans: { total: 2, unique: 2 }, interest: { count: 4, capped: false } } }),
    ]);
    const rows = Object.fromEntries((dataset.comparison?.rows ?? []).map((row) => [row.metric, row]));
    expect(rows.scans_total).toEqual({ metric: "scans_total", current: 11, previous: 9 });
    expect(rows.interest).toEqual({ metric: "interest", current: 2, previous: 5 });
    expect(rows).not.toHaveProperty("test_drive");
    expect(rows).not.toHaveProperty("sponsored_open_model");
    expect(dataset.comparison?.previousDateKey).toBe("2026-10-08");
  });

  test("the first fair day has no comparison", () => {
    expect(assembleFairDailyDataset(context(), [fullRaw("starter")])).not.toHaveProperty("comparison");
  });
});

describe("Europe/Belgrade day and hour buckets", () => {
  test("a normal day has 24 hour keys from T00 to T23, same as the scan pipeline", () => {
    const keys = fairWindowHourKeys(DAY1_START, DAY1_END);
    expect(keys).toHaveLength(24);
    expect(keys[0]).toBe("2026-10-09T00");
    expect(keys[23]).toBe("2026-10-09T23");
    for (const at of [DAY1_START, DAY1_START + 13 * 3_600_000 + 59_000, DAY1_END - 1]) expect(fairHourKey(at)).toBe(fairTimeKeys(at).hourKey);
  });

  test("23:30 Belgrade is still the same day although it is 21:30 UTC; 00:10 Belgrade is the next day while still 9 Oct in UTC", () => {
    expect(fairTimeKeys(Date.parse("2026-10-09T23:30:00+02:00")).dateKey).toBe("2026-10-09");
    expect(fairTimeKeys(Date.parse("2026-10-10T00:10:00+02:00")).dateKey).toBe("2026-10-10");
    expect(new Date(Date.parse("2026-10-10T00:10:00+02:00")).toISOString().slice(0, 10)).toBe("2026-10-09");
  });

  test("the DST fall-back day (25 Oct) lists its repeated 02 hour once; the spring day has 23 hours", () => {
    const fall = fairWindowHourKeys(Date.parse("2026-10-25T00:00:00+02:00"), Date.parse("2026-10-26T00:00:00+01:00"));
    expect(fall).toHaveLength(24);
    expect(new Set(fall).size).toBe(24);
    const spring = fairWindowHourKeys(Date.parse("2026-03-29T00:00:00+01:00"), Date.parse("2026-03-30T00:00:00+02:00"));
    expect(spring).toHaveLength(23);
    expect(spring).not.toContain("2026-03-29T02");
  });
});
