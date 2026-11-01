import { describe, expect, test } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { previewAnalytics, previewModelAnalytics } from "@/components/admin/events/preview-analytics-fixtures";
import { modelComparison, modelDays, ratingBars } from "./model-detail";
import type { AnalyticsData, AnalyticsModel, ModelAnalyticsData } from "./types";

// ADMIN v2 X3 — the detail of one model: against its stand and the fair, its
// days (first scans and repeated ones) and its ratings.

const id = (value: string) => value as Id<"fairEventModels">;
const model = (key: string, scans: number, over: Partial<AnalyticsModel> = {}): AnalyticsModel => ({
  eventModelId: id(key),
  name: `TEST ${key}`,
  brandName: "TEST Brend",
  exhibitorName: "TEST Izlagač",
  standCode: "1",
  mapLocationId: "test-1",
  tier: "included",
  scans: { today: 0, total: scans },
  uniquePerModel: { today: 0, total: scans },
  leads: 0,
  votes: 0,
  rating: null,
  ...over,
});
const dataOf = (models: AnalyticsModel[]): AnalyticsData => ({ ...previewAnalytics, models });

describe("modelComparison", () => {
  const m1 = model("m1", 10, { mapLocationId: "test-a" });
  const m2 = model("m2", 20, { mapLocationId: "test-a" });
  const m3 = model("m3", 60, { mapLocationId: "test-b" });
  const data = dataOf([m1, m2, m3]);

  test("the stand average is the average of the models on the same location, this model included", () => {
    const comparison = modelComparison(m1, data);
    expect(comparison.model).toBe(10);
    expect(comparison.standModels).toBe(2);
    expect(comparison.standAverage).toBe(15);
  });

  test("the fair average is over all models", () => {
    const comparison = modelComparison(m1, data);
    expect(comparison.fairModels).toBe(3);
    expect(comparison.fairAverage).toBe(30);
  });

  test("max is the longest of the three values", () => {
    expect(modelComparison(m1, data).max).toBe(30);
    expect(modelComparison(m3, data).max).toBe(60);
    // A weak model on a strong stand: the stand average is the longest bar.
    const weak = model("w", 1, { mapLocationId: "test-c" });
    const strong = model("s", 99, { mapLocationId: "test-c" });
    const comparison = modelComparison(weak, dataOf([weak, strong, model("x", 2, { mapLocationId: "test-d" })]));
    expect(comparison.standAverage).toBe(50);
    expect(comparison.fairAverage).toBe(34);
    expect(comparison.max).toBe(50);
  });

  test("a model alone on its stand has no stand average", () => {
    const comparison = modelComparison(m3, data);
    expect(comparison.standAverage).toBeNull();
    expect(comparison.standModels).toBe(1);
    expect(comparison.fairAverage).toBe(30);
  });

  test("averages are rounded to one decimal", () => {
    const rows = [model("a", 1), model("b", 1), model("c", 2)];
    expect(modelComparison(rows[0], dataOf(rows)).standAverage).toBe(1.3);
    expect(modelComparison(rows[0], dataOf(rows)).fairAverage).toBe(1.3);
  });

  test("without a map location the stand is told by the stand code", () => {
    const a = model("a", 4, { mapLocationId: "", standCode: "7" });
    const b = model("b", 8, { mapLocationId: "", standCode: "7" });
    const c = model("c", 30, { mapLocationId: "", standCode: "8" });
    const comparison = modelComparison(a, dataOf([a, b, c]));
    expect(comparison.standModels).toBe(2);
    expect(comparison.standAverage).toBe(6);
  });

  test("with the fixtures the numbers fit the fair", () => {
    const leader = previewAnalytics.models[0];
    const comparison = modelComparison(leader, previewAnalytics);
    expect(comparison.model).toBe(leader.scans.total);
    expect(comparison.fairModels).toBe(15);
    expect(comparison.fairAverage).toBeCloseTo(previewAnalytics.kpis.scans.total / 15, 1);
    expect(comparison.standModels).toBe(previewAnalytics.models.filter((row) => row.mapLocationId === leader.mapLocationId).length);
    expect(comparison.max).toBe(leader.scans.total);
  });
});

describe("modelDays", () => {
  const detail = previewModelAnalytics("test-preview-a1")!;
  const summary = previewAnalytics.models.find((row) => row.eventModelId === "test-preview-a1")!;

  test("a row per fair day with scans, first scans and repeated scans", () => {
    const { days } = modelDays(detail);
    expect(days.map((day) => day.label)).toEqual(["Petak", "Subota", "Nedelja"]);
    for (const day of days) {
      expect(day.repeated).toBe(day.scans - day.unique);
      expect(day.repeated).toBeGreaterThanOrEqual(0);
    }
  });

  test("the totals add up to the model's totals", () => {
    const result = modelDays(detail);
    expect(result.scans).toBe(summary.scans.total);
    expect(result.unique).toBe(summary.uniquePerModel.total);
    expect(result.repeated).toBe(result.scans - result.unique);
    expect(result.days.reduce((total, day) => total + day.scans, 0)).toBe(result.scans);
  });

  test("max is the busiest day's scans", () => {
    const result = modelDays(detail);
    expect(result.max).toBe(Math.max(...result.days.map((day) => day.scans)));
    expect(result.max).toBe(36);
  });

  test("repeated never goes below 0, whatever the unique count says", () => {
    const odd: ModelAnalyticsData = {
      ...detail,
      days: [
        { dateKey: "2026-10-09", label: "TEST dan 1", scans: 3, uniquePerModel: 5 },
        { dateKey: "2026-10-10", label: "TEST dan 2", scans: 6, uniquePerModel: 2 },
      ],
    };
    const result = modelDays(odd);
    expect(result.days.map((day) => day.repeated)).toEqual([0, 4]);
    expect(result.repeated).toBe(4);
    expect(result.scans).toBe(9);
    expect(result.unique).toBe(7);
  });

  test("a model without days has zeros", () => {
    const result = modelDays({ ...detail, days: [] });
    expect(result).toEqual({ days: [], max: 0, scans: 0, unique: 0, repeated: 0 });
  });
});

describe("ratingBars", () => {
  test("five rows, the highest rating first, with their counts", () => {
    // a1 TEST model: ratings [0, 0, 2, 4, 6] from 1 to 5 stars.
    const bars = ratingBars(previewModelAnalytics("test-preview-a1")!);
    expect(bars.map((bar) => bar.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(bars.map((bar) => bar.count)).toEqual([6, 4, 2, 0, 0]);
  });

  test("the shares add up to 1 when there are ratings", () => {
    const bars = ratingBars(previewModelAnalytics("test-preview-a1")!);
    expect(bars.reduce((total, bar) => total + bar.share, 0)).toBeCloseTo(1, 10);
    expect(bars[0].share).toBeCloseTo(6 / 12, 10);
  });

  test("with no ratings every share is 0", () => {
    const bars = ratingBars(previewModelAnalytics("test-preview-b1")!);
    expect(bars).toHaveLength(5);
    expect(bars.every((bar) => bar.count === 0 && bar.share === 0)).toBe(true);
    expect(bars.map((bar) => bar.stars)).toEqual([5, 4, 3, 2, 1]);
  });

  test("does not change the buckets of the detail it reads", () => {
    const detail = previewModelAnalytics("test-preview-a1")!;
    const before = [...detail.ratings.buckets];
    ratingBars(detail);
    expect(detail.ratings.buckets).toEqual(before);
  });
});
