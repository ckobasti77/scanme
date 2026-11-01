import { describe, expect, test } from "vitest";
import { previewAnalytics, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { fairRecords, recordNews, recordsSeen, type FairRecords, type RecordsSeen } from "./records";
import type { AnalyticsData, EngagementData } from "./types";

// ADMIN v2 X4 — records from the data. The fixtures are the TEST fair (15
// models, 4 stands, 3 days, no lead, the third day is „today“); the rest are
// small invented series.

const data = previewAnalytics;
const hourRow = (dateKey: string, hour: number, scans: number) => ({ dateKey, hour, scans, uniquePerModel: scans });
const withHours = (hours: AnalyticsData["hours"], over: Partial<AnalyticsData> = {}): AnalyticsData => ({ ...data, hours, ...over });
const noScansToday = (over: Partial<AnalyticsData> = {}): AnalyticsData => ({
  ...data,
  models: data.models.map((model) => ({ ...model, scans: { ...model.scans, today: 0 } })),
  ...over,
});
const withLeads = (perDay: number[]): EngagementData => ({ ...previewEngagement, days: previewEngagement.days.map((day, index) => ({ ...day, leads: perDay[index] ?? 0 })) });

describe("fairRecords", () => {
  test("empty data: no record", () => {
    const empty = noScansToday({ hours: [], todayKey: "2026-12-31" });
    expect(fairRecords(empty, undefined)).toEqual({ hour: null, stand: null, firstLead: null });
    expect(fairRecords(empty, withLeads([0, 0, 0]))).toEqual({ hour: null, stand: null, firstLead: null });
  });

  test("the hour record is the strongest hour of the series, with its day and whether it is today", () => {
    const records = fairRecords(data, undefined);
    expect(records.hour).toEqual({ value: 39, dateKey: "2026-10-11", dayLabel: "Nedelja", hour: 12, today: true, running: false });
    const series = withHours([hourRow("2026-10-09", 10, 5), hourRow("2026-10-10", 11, 9), hourRow("2026-10-11", 9, 4)]);
    expect(fairRecords(series, undefined).hour).toEqual({ value: 9, dateKey: "2026-10-10", dayLabel: "Subota", hour: 11, today: false, running: false });
  });

  test("the record hour still runs when it is the last hour of today's series (its number can grow)", () => {
    const running = withHours([hourRow("2026-10-10", 11, 9), hourRow("2026-10-11", 9, 4), hourRow("2026-10-11", 10, 12)]);
    expect(fairRecords(running, undefined).hour).toMatchObject({ value: 12, hour: 10, today: true, running: true });
    // An hour later the same record is a finished hour.
    const later = withHours([hourRow("2026-10-10", 11, 9), hourRow("2026-10-11", 9, 4), hourRow("2026-10-11", 10, 12), hourRow("2026-10-11", 11, 1)]);
    expect(fairRecords(later, undefined).hour).toMatchObject({ value: 12, hour: 10, running: false });
    // A record of an earlier day never runs.
    const earlier = withHours([hourRow("2026-10-10", 11, 9), hourRow("2026-10-11", 11, 4)]);
    expect(fairRecords(earlier, undefined).hour?.running).toBe(false);
  });

  test("today is false when the record is from an earlier day or when no fair day runs", () => {
    const earlier = withHours([hourRow("2026-10-10", 11, 9), hourRow("2026-10-11", 9, 4)]);
    expect(fairRecords(earlier, undefined).hour?.today).toBe(false);
    expect(fairRecords({ ...data, todayKey: "2026-12-31" }, undefined).hour?.today).toBe(false);
  });

  test("equal hours: the first one stays the record", () => {
    const tie = withHours([hourRow("2026-10-09", 10, 7), hourRow("2026-10-10", 10, 7), hourRow("2026-10-11", 10, 7)]);
    expect(fairRecords(tie, undefined).hour).toMatchObject({ dateKey: "2026-10-09", value: 7 });
  });

  test("the strongest stand of the day is the one with most scans today, only while a fair day runs", () => {
    expect(fairRecords(data, undefined).stand).toEqual({ locationId: "hala-9", standCode: "9", scansToday: 77 });
    // The read is from a day that is not a fair day: nobody is „today“.
    expect(fairRecords({ ...data, todayKey: "2026-12-31" }, undefined).stand).toBeNull();
  });

  test("no scan today at any stand: no strongest stand", () => {
    expect(fairRecords(noScansToday(), undefined).stand).toBeNull();
  });

  test("the strongest stand of the day can be another than the leader of the fair; equal days go to the first of the ranking", () => {
    // Today's scans of a stand sit on its first model; its other models have none today.
    const flip = (today: Record<string, number>): AnalyticsData => {
      const given = new Set<string>();
      return {
        ...data,
        models: data.models.map((model) => {
          const first = !given.has(model.standCode);
          given.add(model.standCode);
          return { ...model, scans: { ...model.scans, today: first ? (today[model.standCode] ?? 0) : 0 } };
        }),
      };
    };
    // Stand 9 leads the fair, but today stand 1A has the most.
    expect(fairRecords(flip({ "9": 1, "1A": 5 }), undefined).stand).toMatchObject({ standCode: "1A", scansToday: 5 });
    // 9 and 1B are equal today: stand 9 is first in the ranking.
    const tie = fairRecords(flip({ "9": 1, "1B": 1 }), undefined).stand;
    expect(tie).toMatchObject({ standCode: "9", scansToday: 1 });
  });

  test("the first lead is the first day with a lead; none while there is no lead or no day series", () => {
    expect(fairRecords(data, previewEngagement).firstLead).toBeNull();
    expect(fairRecords(data, withLeads([0, 2, 3])).firstLead).toEqual({ dateKey: "2026-10-10", dayLabel: "Subota" });
    expect(fairRecords(data, withLeads([0, 0, 1])).firstLead).toEqual({ dateKey: "2026-10-11", dayLabel: "Nedelja" });
    expect(fairRecords(data, undefined).firstLead).toBeNull();
  });
});

describe("recordsSeen", () => {
  const records = fairRecords(data, undefined);

  test("remembers the hour record with its hour, the strongest stand and the leads", () => {
    expect(recordsSeen(records, 0)).toEqual({ hour: 39, hourSlot: "2026-10-11|12", stand: "hala-9", stands: ["hala-9"], leads: 0 });
    expect(recordsSeen({ hour: null, stand: null, firstLead: null }, 2)).toEqual({ hour: 0, hourSlot: null, stand: null, stands: [], leads: 2 });
  });

  test("with a previous look the hour record and the leads never fall, and the stands seen add up", () => {
    const lower: FairRecords = { ...records, hour: { ...records.hour!, value: 30 } };
    const previous: RecordsSeen = { hour: 39, hourSlot: "2026-10-11|12", stand: "hala-6", stands: ["hala-6"], leads: 3 };
    expect(recordsSeen(lower, 0, previous)).toEqual({ hour: 39, hourSlot: "2026-10-11|12", stand: "hala-9", stands: ["hala-6", "hala-9"], leads: 3 });
  });

  test("a higher record moves the remembered hour to the hour that set it", () => {
    const higher: FairRecords = { ...records, hour: { ...records.hour!, value: 42, hour: 22, running: true } };
    expect(recordsSeen(higher, 0, recordsSeen(records, 0))).toMatchObject({ hour: 42, hourSlot: "2026-10-11|22" });
  });
});

describe("recordNews", () => {
  const base = fairRecords(data, undefined);
  /** The record of the fixtures is Sunday at 12:00; `at` moves it to another hour of that day. */
  const hour = (value: number, { today = true, at = 22 }: { today?: boolean; at?: number } = {}): FairRecords => ({ ...base, hour: { ...base.hour!, value, today, hour: at, running: today } });
  const stand = (locationId: string | null): FairRecords => ({ ...base, stand: locationId ? { locationId, standCode: locationId.replace("hala-", ""), scansToday: 5 } : null });
  const seen = (over: Partial<RecordsSeen> = {}): RecordsSeen => ({ hour: 39, hourSlot: "2026-10-11|12", stand: "hala-9", stands: ["hala-9"], leads: 0, ...over });

  test("the first look reports nothing", () => {
    expect(recordNews(null, base, 0)).toEqual([]);
    expect(recordNews(null, base, 5)).toEqual([]);
  });

  test("the same numbers again report nothing", () => {
    expect(recordNews(seen(), base, 0)).toEqual([]);
  });

  test("another hour of today that beats the record is news, keyed by that hour", () => {
    expect(recordNews(seen(), hour(42), 0)).toEqual([{ id: "hour", key: "hour:2026-10-11|22" }]);
    expect(recordNews(seen(), hour(40, { at: 14 }), 0)).toEqual([{ id: "hour", key: "hour:2026-10-11|14" }]);
  });

  test("the busiest hour that keeps filling is one record: every poll raises it, only the first is announced", () => {
    let memory: RecordsSeen | null = recordsSeen(base, 0);
    const toasts: string[] = [];
    for (const value of [42, 47, 53, 61]) {
      const records = hour(value);
      toasts.push(...recordNews(memory, records, 0).map((news) => news.key));
      memory = recordsSeen(records, 0, memory);
    }
    expect(toasts).toEqual(["hour:2026-10-11|22"]);
    expect(memory).toMatchObject({ hour: 61, hourSlot: "2026-10-11|22" });
  });

  test("the hour that already held the record when the page opened is never announced while it grows", () => {
    // The page opens during the busiest hour: 12:00 holds the record and still runs.
    let memory: RecordsSeen | null = recordsSeen(base, 0);
    const growing = (value: number): FairRecords => ({ ...base, hour: { ...base.hour!, value, running: true } });
    for (const value of [40, 41, 45]) {
      expect(recordNews(memory, growing(value), 0)).toEqual([]);
      memory = recordsSeen(growing(value), 0, memory);
    }
  });

  test("a fallen hour record (a correction of the data) and a record of an earlier day report nothing", () => {
    expect(recordNews(seen(), hour(30), 0)).toEqual([]);
    expect(recordNews(seen(), hour(42, { today: false }), 0)).toEqual([]);
  });

  test("a first scan of the fair is not a record to announce", () => {
    expect(recordNews(seen({ hour: 0, hourSlot: null }), hour(3), 0)).toEqual([]);
  });

  test("a new strongest stand is news; the first stand of the day and a lost one are not", () => {
    expect(recordNews(seen({ stand: "hala-6", stands: ["hala-6"] }), stand("hala-9"), 0)).toEqual([{ id: "stand", key: "stand:hala-9" }]);
    expect(recordNews(seen({ stand: null, stands: [] }), stand("hala-9"), 0)).toEqual([]);
    expect(recordNews(seen({ stand: "hala-9" }), stand(null), 0)).toEqual([]);
    expect(recordNews(seen({ stand: "hala-9" }), stand("hala-9"), 0)).toEqual([]);
  });

  test("two stands that trade the lead are each announced once, not at every change", () => {
    let memory: RecordsSeen | null = recordsSeen(stand("hala-9"), 0);
    const toasts: string[] = [];
    for (const leader of ["hala-6", "hala-9", "hala-6", "hala-9", "hala-1b"]) {
      toasts.push(...recordNews(memory, stand(leader), 0).map((news) => news.key));
      memory = recordsSeen(stand(leader), 0, memory);
    }
    expect(toasts).toEqual(["stand:hala-6", "stand:hala-1b"]);
  });

  test("the first lead is news once: 0 → 1, but not 1 → 2", () => {
    expect(recordNews(seen({ leads: 0 }), base, 1)).toEqual([{ id: "firstLead", key: "firstLead" }]);
    expect(recordNews(seen({ leads: 1 }), base, 2)).toEqual([]);
    expect(recordNews(seen({ leads: 0 }), base, 0)).toEqual([]);
  });

  test("several records at once come in the order hour, stand, first lead", () => {
    const noStand: FairRecords = { ...hour(42), stand: null };
    const before = seen({ hour: 10, hourSlot: "2026-10-09|10", stand: "hala-6", stands: ["hala-6"], leads: 0 });
    expect(recordNews(before, noStand, 2).map((news) => news.id)).toEqual(["hour", "firstLead"]);
    expect(recordNews(before, hour(42), 2).map((news) => news.id)).toEqual(["hour", "stand", "firstLead"]);
  });
});
