import { hourMatrix } from "./matrix";
import { standRanking } from "./stands";
import type { AnalyticsData, EngagementData } from "./types";

// ADMIN v2 X4 — records and badges derived from the data (ZADATAK §5.4): the
// strongest hour of the fair, the strongest stand of the day, the day of the
// first lead. Nothing here is a score: every record is a plain fact of the
// numbers on the page. `recordNews` says which of them is new since the last
// time the page looked, so a toast can be shown (never on the first load).

export type FairRecords = {
  /**
   * The strongest hour of the whole fair so far. `running`: it is the hour the day is in right now, so
   * the number can still grow.
   */
  hour: { value: number; dateKey: string; dayLabel: string; hour: number; today: boolean; running: boolean } | null;
  /** The stand with the most scans today; only while a fair day runs and at least one stand has a scan today. */
  stand: { locationId: string; standCode: string; scansToday: number } | null;
  /** The day of the first lead; null while there is none (or while the day series is not in yet). */
  firstLead: { dateKey: string; dayLabel: string } | null;
};

export function fairRecords(data: AnalyticsData, engagement: EngagementData | undefined): FairRecords {
  const peak = hourMatrix(
    data.days,
    data.hours.map((row) => ({ dateKey: row.dateKey, hour: row.hour, value: row.scans })),
  ).peak;
  const dayRunning = data.days.some((day) => day.dateKey === data.todayKey);
  // The ranking is ordered by scans; equal numbers of today keep that order, so the first of them wins.
  let lead: ReturnType<typeof standRanking>[number] | null = null;
  if (dayRunning) for (const row of standRanking(data, undefined)) if (row.scansToday > (lead?.scansToday ?? 0)) lead = row;
  const leadDay = engagement?.days.find((day) => day.leads > 0);
  const today = peak?.dateKey === data.todayKey;
  // The series of today ends with the hour the read was taken in.
  const currentHour = Math.max(-1, ...data.hours.filter((row) => row.dateKey === data.todayKey).map((row) => row.hour));
  return {
    hour: peak ? { value: peak.value, dateKey: peak.dateKey, dayLabel: peak.label, hour: peak.hour, today, running: today && peak.hour === currentHour } : null,
    stand: lead ? { locationId: lead.locationId, standCode: lead.standCode, scansToday: lead.scansToday } : null,
    firstLead: leadDay ? { dateKey: leadDay.dateKey, dayLabel: leadDay.label } : null,
  };
}

/** What was last seen on this page. */
export type RecordsSeen = {
  /** The highest hour record seen. */
  hour: number;
  /** The hour (day and hour) that record belongs to: while it keeps growing it is the same record. */
  hourSlot: string | null;
  stand: string | null;
  /** The stands that already were the strongest of the day in this look: each is announced once. */
  stands: readonly string[];
  leads: number;
};
export type RecordNews = { id: "hour" | "stand" | "firstLead"; key: string };

const hourSlot = (hour: FairRecords["hour"]) => (hour ? `${hour.dateKey}|${hour.hour}` : null);

/**
 * The state to remember after a look. With `previous` the hour record and the
 * lead count only ever grow: a corrected fall of the data must not make the
 * same record „new“ again when the number comes back.
 */
export function recordsSeen(records: FairRecords, leadsTotal: number, previous?: RecordsSeen | null): RecordsSeen {
  const value = records.hour?.value ?? 0;
  const stand = records.stand?.locationId ?? null;
  const stands = previous?.stands ?? [];
  return {
    hour: Math.max(value, previous?.hour ?? 0),
    hourSlot: value > (previous?.hour ?? 0) || !previous ? hourSlot(records.hour) : previous.hourSlot,
    stand,
    stands: stand && !stands.includes(stand) ? [...stands, stand] : stands,
    leads: Math.max(leadsTotal, previous?.leads ?? 0),
  };
}

/**
 * New records against what was seen. The first look (`seen === null`) reports
 * nothing; the same or a lower number reports nothing. An hour is one record:
 * while the busiest hour is still filling, every poll raises its number, and
 * that is announced once, not every minute. A stand that already was the
 * strongest of the day is not announced again when two stands trade places.
 */
export function recordNews(seen: RecordsSeen | null, records: FairRecords, leadsTotal: number): RecordNews[] {
  if (seen === null) return [];
  const news: RecordNews[] = [];
  const slot = hourSlot(records.hour);
  // From nothing to a first scan is not a record to announce; the hour must beat an earlier one.
  if (records.hour?.today && seen.hour > 0 && records.hour.value > seen.hour && slot !== seen.hourSlot) news.push({ id: "hour", key: `hour:${slot}` });
  if (records.stand && seen.stand !== null && seen.stand !== records.stand.locationId && !seen.stands.includes(records.stand.locationId)) {
    news.push({ id: "stand", key: `stand:${records.stand.locationId}` });
  }
  if (seen.leads === 0 && leadsTotal >= 1) news.push({ id: "firstLead", key: "firstLead" });
  return news;
}
