import { belgradeParts } from "@/lib/belgrade-time";
import { sum } from "./format";
import type { AnalyticsData, AudienceData, EngagementData } from "./types";

// ADMIN v2 X3 — the KPI strip: „Koliko je danas i kuda ide?“. Four numbers
// with a trend per fair day and the difference to the day before, and four
// totals without a trend (the backend has no day series for them).

export type KpiId = "scans" | "uniquePerModel" | "visitors" | "leads";

export type KpiDelta = {
  diff: number;
  /** diff / the day before; null when the day before had nothing. */
  ratio: number | null;
  /**
   * `sameTime`: the day is still running, so it is compared with the day
   * before up to the same hour (`hour`); `fullDay`: both days whole. A number
   * without an hour series (visitors, leads) has no difference while the day
   * runs: a part of a day against a whole one would always read as a fall.
   */
  basis: "sameTime" | "fullDay";
  hour: number | null;
};

export type KpiTile = {
  id: KpiId;
  /** The number of the reference day (today on a fair day), or null while the read is not in. */
  today: number | null;
  total: number | null;
  /** One value per fair day, in the order of `dayLabels`; null when the series is not known (yet). */
  trend: number[] | null;
  delta: KpiDelta | null;
  /** A zero that is a problem (no lead while there are scans). */
  problem: boolean;
  capped: boolean;
};

export type KpiStrip = {
  dayLabels: string[];
  /** Index of the day the big numbers are for; -1 before the first scan (then the totals lead). */
  dayIndex: number;
  /** True while that day is the calendar day of the read. */
  dayRunning: boolean;
  tiles: KpiTile[];
};

/** Today when it is a fair day, else the last fair day with a scan, else -1. */
export function referenceDayIndex(data: Pick<AnalyticsData, "days" | "todayKey">): number {
  const today = data.days.findIndex((day) => day.dateKey === data.todayKey);
  if (today >= 0) return today;
  for (let index = data.days.length - 1; index >= 0; index -= 1) if (data.days[index].scans > 0) return index;
  return -1;
}

function fullDayDelta(values: readonly number[], index: number): KpiDelta | null {
  if (index < 1) return null;
  const previous = values[index - 1];
  const diff = values[index] - previous;
  return { diff, ratio: previous > 0 ? diff / previous : null, basis: "fullDay", hour: null };
}

/**
 * While the day runs, a whole yesterday against a part of today reads as a
 * fall. The hour series lets scans be compared up to the same hour: yesterday
 * minus its hours after the hour of the read.
 */
function sameTimeDelta(data: AnalyticsData, index: number, metric: "scans" | "uniquePerModel"): KpiDelta | null {
  if (index < 1) return null;
  const hour = belgradeParts(data.at).hour;
  const day = data.days[index];
  const previous = data.days[index - 1];
  const later = sum(data.hours.filter((row) => row.dateKey === previous.dateKey && row.hour > hour).map((row) => row[metric]));
  const untilNow = Math.max(0, previous[metric] - later);
  const diff = day[metric] - untilNow;
  return { diff, ratio: untilNow > 0 ? diff / untilNow : null, basis: "sameTime", hour };
}

export function kpiStrip(data: AnalyticsData, audience: AudienceData | undefined, engagement: EngagementData | undefined): KpiStrip {
  const dayIndex = referenceDayIndex(data);
  const dayRunning = dayIndex >= 0 && data.days[dayIndex].dateKey === data.todayKey;
  const counter = (metric: "scans" | "uniquePerModel"): KpiTile => {
    const trend = data.days.map((day) => day[metric]);
    return {
      id: metric,
      today: dayIndex >= 0 ? trend[dayIndex] : null,
      total: data.kpis[metric].total,
      trend,
      delta: dayIndex < 0 ? null : dayRunning ? sameTimeDelta(data, dayIndex, metric) : fullDayDelta(trend, dayIndex),
      problem: false,
      capped: data.capped,
    };
  };
  // Visitors and leads per day come with the engagement read; its days are in the same order.
  const aligned = engagement !== undefined && engagement.days.length === data.days.length;
  const visitorsTrend = aligned ? engagement.days.map((day) => day.visitors) : null;
  const leadsTrend = aligned ? engagement.days.map((day) => day.leads) : null;
  const tiles: KpiTile[] = [
    counter("scans"),
    counter("uniquePerModel"),
    {
      id: "visitors",
      today: dayIndex < 0 ? null : dayRunning ? (audience?.visitors.today ?? null) : (visitorsTrend?.[dayIndex] ?? null),
      total: audience?.visitors.total ?? null,
      trend: visitorsTrend,
      delta: visitorsTrend && dayIndex >= 0 && !dayRunning ? fullDayDelta(visitorsTrend, dayIndex) : null,
      problem: false,
      capped: Boolean(audience?.visitors.capped || engagement?.capped.visitors),
    },
    {
      id: "leads",
      today: dayIndex < 0 ? null : dayRunning ? data.kpis.leads.today : (leadsTrend?.[dayIndex] ?? null),
      total: data.kpis.leads.total,
      trend: leadsTrend,
      delta: leadsTrend && dayIndex >= 0 && !dayRunning ? fullDayDelta(leadsTrend, dayIndex) : null,
      problem: data.kpis.leads.total === 0 && data.kpis.scans.total > 0,
      capped: data.kpis.leads.capped,
    },
  ];
  return { dayLabels: data.days.map((day) => day.label), dayIndex, dayRunning, tiles };
}
