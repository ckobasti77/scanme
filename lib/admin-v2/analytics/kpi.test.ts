import { describe, expect, test } from "vitest";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { sum } from "./format";
import { kpiStrip, referenceDayIndex, type KpiId } from "./kpi";
import type { AnalyticsData } from "./types";

// ADMIN v2 X3 — the KPI strip. Fixtures: 3 fair days (Petak, Subota, Nedelja),
// the read is on Nedelja at 22:37 (Belgrade), so the day is still running.

const data = previewAnalytics;
const audience = previewAudience;
const engagement = previewEngagement;

const day = (dateKey: string, scans: number) => ({ dateKey, label: `TEST ${dateKey}`, scans, uniquePerModel: scans });
const tile = (strip: ReturnType<typeof kpiStrip>, id: KpiId) => strip.tiles.find((entry) => entry.id === id)!;

describe("referenceDayIndex", () => {
  const days = [day("2026-10-09", 4), day("2026-10-10", 7), day("2026-10-11", 0)];

  test("is today when today is a fair day, also without a scan yet", () => {
    expect(referenceDayIndex({ days, todayKey: "2026-10-11" })).toBe(2);
    expect(referenceDayIndex({ days, todayKey: "2026-10-09" })).toBe(0);
  });

  test("after the fair it is the last fair day with a scan", () => {
    expect(referenceDayIndex({ days, todayKey: "2026-10-20" })).toBe(1);
  });

  test("with no scan on any day (and today not a fair day) it is -1", () => {
    expect(referenceDayIndex({ days: days.map((entry) => ({ ...entry, scans: 0 })), todayKey: "2026-10-20" })).toBe(-1);
    expect(referenceDayIndex({ days: [], todayKey: "2026-10-11" })).toBe(-1);
  });
});

describe("kpiStrip with the fixtures (the fair day is running)", () => {
  const strip = kpiStrip(data, audience, engagement);

  test("names the day and the labels in order", () => {
    expect(strip.dayIndex).toBe(2);
    expect(strip.dayRunning).toBe(true);
    expect(strip.dayLabels).toEqual(["Petak", "Subota", "Nedelja"]);
    expect(strip.tiles.map((entry) => entry.id)).toEqual(["scans", "uniquePerModel", "visitors", "leads"]);
  });

  test("the scans tile has today's number, the total and a trend per day", () => {
    const scans = tile(strip, "scans");
    expect(scans.today).toBe(179);
    expect(scans.total).toBe(460);
    expect(scans.trend).toEqual([104, 177, 179]);
    expect(sum(scans.trend!)).toBe(scans.total);
    expect(scans.problem).toBe(false);
    expect(scans.capped).toBe(false);
  });

  test("the scans difference is to yesterday up to the same hour", () => {
    const delta = tile(strip, "scans").delta!;
    expect(delta.basis).toBe("sameTime");
    expect(delta.hour).toBe(22);
    // Yesterday (Subota) minus its hours after 22:00, from the hour series.
    const yesterday = data.days[1];
    const later = sum(data.hours.filter((row) => row.dateKey === yesterday.dateKey && row.hour > 22).map((row) => row.scans));
    const untilNow = yesterday.scans - later;
    expect(delta.diff).toBe(data.days[2].scans - untilNow);
    expect(delta.ratio).toBeCloseTo(delta.diff / untilNow, 10);
    // Hand-checked: yesterday had no scan after 22:00 (hour 23 is 0), so 179 − 177.
    expect(delta.diff).toBe(2);
  });

  test("the unique-per-model difference uses the same rule", () => {
    const delta = tile(strip, "uniquePerModel").delta!;
    expect(delta.basis).toBe("sameTime");
    const yesterday = data.days[1];
    const later = sum(data.hours.filter((row) => row.dateKey === yesterday.dateKey && row.hour > 22).map((row) => row.uniquePerModel));
    expect(delta.diff).toBe(data.days[2].uniquePerModel - (yesterday.uniquePerModel - later));
    expect(tile(strip, "uniquePerModel").total).toBe(431);
  });

  test("the visitors tile: today from the audience read while the day runs, per-day trend and no difference", () => {
    const visitors = tile(strip, "visitors");
    expect(visitors.today).toBe(audience.visitors.today);
    expect(visitors.total).toBe(310);
    expect(visitors.trend).toEqual(engagement.days.map((entry) => entry.visitors));
    // No hour series for visitors: a part of today against a whole yesterday would always read as a fall.
    expect(visitors.delta).toBeNull();
  });

  test("the leads tile: zero leads next to scans is a problem, and there is no difference while the day runs", () => {
    const leads = tile(strip, "leads");
    expect(leads.today).toBe(0);
    expect(leads.total).toBe(0);
    expect(leads.trend).toEqual([0, 0, 0]);
    expect(leads.problem).toBe(true);
    expect(leads.delta).toBeNull();
  });
});

describe("kpiStrip after the fair (today is not a fair day)", () => {
  const after: AnalyticsData = { ...data, todayKey: "2026-10-20" };
  const strip = kpiStrip(after, audience, engagement);

  test("the reference day is the last day with a scan and the difference is whole day to whole day", () => {
    expect(strip.dayIndex).toBe(2);
    expect(strip.dayRunning).toBe(false);
    const delta = tile(strip, "scans").delta!;
    expect(delta.basis).toBe("fullDay");
    expect(delta.hour).toBeNull();
    expect(delta.diff).toBe(179 - 177);
    expect(delta.ratio).toBeCloseTo(2 / 177, 10);
  });

  test("visitors and leads of the day come from the per-day series, not from today", () => {
    expect(tile(strip, "visitors").today).toBe(117);
    expect(tile(strip, "leads").today).toBe(0);
  });

  test("visitors and leads have a whole-day difference once the day is over, computed from the trend", () => {
    const visitorsTrend = engagement.days.map((entry) => entry.visitors);
    const leadsTrend = engagement.days.map((entry) => entry.leads);
    const visitorsDiff = visitorsTrend[2] - visitorsTrend[1];
    expect(tile(strip, "visitors").delta).toEqual({ diff: visitorsDiff, ratio: visitorsDiff / visitorsTrend[1], basis: "fullDay", hour: null });
    expect(visitorsDiff).toBe(117 - 124);
    // The day before had no lead, so there is no ratio.
    expect(leadsTrend[1]).toBe(0);
    expect(tile(strip, "leads").delta).toEqual({ diff: leadsTrend[2] - leadsTrend[1], ratio: null, basis: "fullDay", hour: null });
  });

  test("without the engagement read those numbers are unknown, not zero", () => {
    const partial = kpiStrip(after, audience, undefined);
    expect(tile(partial, "visitors").today).toBeNull();
    expect(tile(partial, "leads").today).toBeNull();
  });
});

describe("kpiStrip on the first fair day", () => {
  test("there is no day before, so no difference on any tile", () => {
    const first = kpiStrip({ ...data, todayKey: "2026-10-09" }, audience, engagement);
    expect(first.dayIndex).toBe(0);
    expect(first.dayRunning).toBe(true);
    for (const entry of first.tiles) expect(entry.delta).toBeNull();
    expect(tile(first, "scans").today).toBe(104);
  });
});

describe("kpiStrip without the audience and the engagement reads", () => {
  const strip = kpiStrip(data, undefined, undefined);

  test("visitors are unknown: null values and no trend, never a false zero", () => {
    const visitors = tile(strip, "visitors");
    expect(visitors.today).toBeNull();
    expect(visitors.total).toBeNull();
    expect(visitors.trend).toBeNull();
    expect(visitors.delta).toBeNull();
    expect(visitors.capped).toBe(false);
  });

  test("leads have no trend and no difference (the totals still come from the first read)", () => {
    const leads = tile(strip, "leads");
    expect(leads.trend).toBeNull();
    expect(leads.delta).toBeNull();
    expect(leads.total).toBe(0);
  });

  test("the scans tile does not depend on those reads", () => {
    expect(tile(strip, "scans")).toEqual(tile(kpiStrip(data, audience, engagement), "scans"));
  });
});

describe("kpiStrip: the series of the engagement read must match the days", () => {
  test("a series of another length gives no visitors and leads trend", () => {
    const short = { ...engagement, days: engagement.days.slice(0, 2) };
    const strip = kpiStrip(data, audience, short);
    expect(tile(strip, "visitors").trend).toBeNull();
    expect(tile(strip, "visitors").delta).toBeNull();
    expect(tile(strip, "leads").trend).toBeNull();
    // The number of today still comes from the audience read.
    expect(tile(strip, "visitors").today).toBe(117);
  });
});

describe("kpiStrip: the leads problem", () => {
  const withLeads = (total: number, scans: number): AnalyticsData => ({
    ...data,
    kpis: { ...data.kpis, scans: { ...data.kpis.scans, total: scans }, leads: { ...data.kpis.leads, total } },
  });

  test("is set only when there are scans and no lead", () => {
    expect(tile(kpiStrip(withLeads(0, 460), audience, engagement), "leads").problem).toBe(true);
  });

  test("is not set when there is a lead", () => {
    expect(tile(kpiStrip(withLeads(3, 460), audience, engagement), "leads").problem).toBe(false);
  });

  test("is not set when there is no scan either", () => {
    expect(tile(kpiStrip(withLeads(0, 0), audience, engagement), "leads").problem).toBe(false);
  });
});

describe("kpiStrip: no scan on any day", () => {
  test("the day index is -1 and the day numbers are unknown while the totals still show", () => {
    const empty: AnalyticsData = {
      ...data,
      todayKey: "2026-10-20",
      days: data.days.map((entry) => ({ ...entry, scans: 0, uniquePerModel: 0 })),
    };
    const strip = kpiStrip(empty, undefined, undefined);
    expect(strip.dayIndex).toBe(-1);
    expect(strip.dayRunning).toBe(false);
    for (const entry of strip.tiles) {
      expect(entry.today).toBeNull();
      expect(entry.delta).toBeNull();
    }
    expect(tile(strip, "scans").total).toBe(460);
  });
});

describe("kpiStrip: partial reads are flagged", () => {
  test("a capped read flags the tile", () => {
    const strip = kpiStrip({ ...data, capped: true }, { ...audience, visitors: { ...audience.visitors, capped: true } }, engagement);
    expect(tile(strip, "scans").capped).toBe(true);
    expect(tile(strip, "uniquePerModel").capped).toBe(true);
    expect(tile(strip, "visitors").capped).toBe(true);
    expect(tile(strip, "leads").capped).toBe(false);
  });

  test("the visitors tile is also capped when the engagement read is", () => {
    const strip = kpiStrip(data, audience, { ...engagement, capped: { ...engagement.capped, visitors: true } });
    expect(tile(strip, "visitors").capped).toBe(true);
  });
});
