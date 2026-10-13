import { describe, expect, test } from "vitest";
import { previewAnalytics, previewAnalyticsStep, previewHallToday, previewStandHours } from "./preview-analytics-fixtures";

// ADMIN v3 V3 — the TEST hourly read of one fair day per stand (the Vremeplov of
// the dev preview) keeps both margins exact: the hours sum to the hourly totals
// of Analitika and the stands to the scans of their rows. TEST numbers only.

const STEPS = [0, 1, 3] as const;
const STAND_CODES = ["9", "6", "1B", "1A"];
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const whole = (values: readonly number[]) => values.every((value) => Number.isInteger(value) && value >= 0);

describe("previewStandHours", () => {
  test("a day that is not one of the fixtures has no read", () => {
    expect(previewStandHours("2026-10-08")).toBeNull();
    expect(previewStandHours("x", 3)).toBeNull();
  });

  for (const step of STEPS) {
    const { data, engagement } = previewAnalyticsStep(step);

    for (const day of data.days) {
      test(`step ${step}, ${day.dateKey}: both margins of the scans are exact`, () => {
        const read = previewStandHours(day.dateKey, step);
        expect(read).not.toBeNull();
        if (!read) return;
        const hours = data.hours.filter((row) => row.dateKey === day.dateKey);
        expect(read.hours).toEqual(hours.map((row) => row.hour));
        // Per hour: the stands sum to the hour of Analitika.
        read.hours.forEach((_, index) => {
          expect(sum(read.stands.map((stand) => stand.scans[index]))).toBe(hours[index].scans);
        });
        // Per stand: the hours sum to the scans of its rows on that day (models grouped by stand code).
        const dayIndex = data.days.findIndex((entry) => entry.dateKey === day.dateKey);
        for (const stand of read.stands) {
          const rows = data.models.map((model, index) => ({ model, byDay: engagement.models[index].scansByDay })).filter((row) => row.model.standCode === stand.standCode);
          expect(sum(stand.scans)).toBe(sum(rows.map((row) => row.byDay[dayIndex])));
        }
        expect(sum(read.stands.map((stand) => sum(stand.scans)))).toBe(day.scans);
      });

      test(`step ${step}, ${day.dateKey}: unique per model, lengths, whole numbers and the TEST stands`, () => {
        const read = previewStandHours(day.dateKey, step);
        expect(read).not.toBeNull();
        if (!read) return;
        const hours = data.hours.filter((row) => row.dateKey === day.dateKey);
        expect(read.stands.map((stand) => stand.standCode)).toEqual(STAND_CODES);
        expect(read.stands.map((stand) => stand.mapLocationId)).toEqual(["hala-9", "hala-6", "hala-1b", "hala-1a"]);
        expect(read).toMatchObject({ dateKey: day.dateKey, at: data.at, unread: 0, capped: false });
        for (const stand of read.stands) {
          expect(stand.scans).toHaveLength(read.hours.length);
          expect(stand.uniquePerModel).toHaveLength(read.hours.length);
          expect(whole(stand.scans)).toBe(true);
          expect(whole(stand.uniquePerModel)).toBe(true);
          // No cell has more unique than scans (the unique of an hour never exceeds its scans).
          stand.uniquePerModel.forEach((cell, index) => expect(cell).toBeLessThanOrEqual(stand.scans[index]));
        }
        read.hours.forEach((_, index) => {
          expect(sum(read.stands.map((stand) => stand.uniquePerModel[index]))).toBe(hours[index].uniquePerModel);
        });
      });
    }
  }

  test("a simulated poll only adds its scans (and their unique visitors) to stand 9 in the last hour of the last day", () => {
    const last = previewAnalytics.days.at(-1)?.dateKey ?? "";
    const base = previewStandHours(last);
    const later = previewStandHours(last, 3);
    expect(base).not.toBeNull();
    expect(later).not.toBeNull();
    if (!base || !later) return;
    const lastHour = base.hours.length - 1;
    base.stands.forEach((stand, index) => {
      stand.scans.forEach((cell, hour) => {
        const grows = index === 0 && hour === lastHour;
        expect(later.stands[index].scans[hour]).toBe(grows ? cell + 3 * 14 : cell);
      });
      // The unique of that hour is the one „Poslednji sat“ shows for the stand after three polls: 4 + 2 × 3.
      expect(later.stands[index].uniquePerModel).toEqual(stand.uniquePerModel.map((cell, hour) => (index === 0 && hour === lastHour ? cell + 10 : cell)));
    });
    expect(previewAnalyticsStep(3).data.heat.hour.find((row) => row.locationId === "hala-9")?.count).toBe(10);
    // The other days do not change with the step.
    const first = previewAnalytics.days[0].dateKey;
    expect(previewStandHours(first, 3)?.stands).toEqual(previewStandHours(first)?.stands);
  });
});

describe("heat of the last hour", () => {
  test("empty at step 0 (the hall is closed), filled from the first poll on", () => {
    expect(previewAnalyticsStep(0).data.heat.hour).toEqual([]);
    for (const step of [1, 3]) {
      const hour = previewAnalyticsStep(step).data.heat.hour;
      expect(hour.length).toBeGreaterThan(0);
      expect(hour.map((row) => row.locationId).sort()).toEqual(["hala-1a", "hala-1b", "hala-6", "hala-9"]);
    }
    expect(previewAnalyticsStep(1).data.heat.today).toEqual(previewAnalytics.heat.today);
  });
});

describe("previewHallToday", () => {
  test("the models' scans of today sum to the number asked for, the rest stays as it is", () => {
    for (const scansToday of [0, 37, 179, 412]) {
      const data = previewHallToday(scansToday);
      expect(sum(data.models.map((model) => model.scans.today))).toBe(scansToday);
      expect(whole(data.models.map((model) => model.scans.today))).toBe(true);
      expect(data.kpis.scans.today).toBe(scansToday);
      expect(data.kpis.scans.total).toBe(previewAnalytics.kpis.scans.total);
      expect(data.heat.today).toEqual(previewAnalytics.heat.today);
      expect(data.heat.hour.length).toBeGreaterThan(0);
      expect(data.days).toBe(previewAnalytics.days);
      expect(data.hours).toBe(previewAnalytics.hours);
      expect(data.models.map((model) => model.eventModelId)).toEqual(previewAnalytics.models.map((model) => model.eventModelId));
    }
  });
});

describe("TEST names", () => {
  test("exhibitors and brands of the fixtures start with TEST", () => {
    for (const model of previewAnalytics.models) {
      expect(model.exhibitorName.startsWith("TEST")).toBe(true);
      expect(model.brandName.startsWith("TEST")).toBe(true);
    }
  });
});
