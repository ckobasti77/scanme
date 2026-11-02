import { belgradeLocalToEpoch } from "@/lib/belgrade-time";
import { fairHeatCap, fairHeatLevel } from "@/lib/fair-heat";
import type { HallLayer, HallRankRow, HallSeries, HallStand, StandHoursData } from "./types";

// ADMIN v3 V3 — the pure core of the Vremeplov (ZADATAK-V3 §3.2): one fair day,
// hour by hour, turned into what the hall draws at a moment `t`. `t` is hours
// from the START of the first hour (0 … `series.end`): with hours 8 … 20, t = 0 is
// 08:00, t = 6.5 is 14:30 and t = 13 is 21:00. The scans of a running hour are
// spread evenly over it (we only know the hour, not the minute), so every number
// grows without jumps and never goes down. The scale of the heights is the
// total of the busiest stand of the whole day: it does not change while it plays.

const HOUR_MS = 3_600_000;
/** An open day never ends right at the start of its last hour: the running hour has at least this much (h). */
const MIN_OPEN_SPAN = 0.01;

const collator = new Intl.Collator("sr", { numeric: true });
const byLabel = (a: string, b: string) => collator.compare(a, b);

const count = (value: number | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
const clampT = (t: number, end: number) => Math.min(Math.max(0, end), Math.max(0, Number.isFinite(t) ? t : 0));

/** How much of hour `i` has passed at `t` (0–1); the hour runs from `i` to `min(i + 1, end)`. */
function shareOf(i: number, t: number, end: number): number {
  const span = Math.min(i + 1, end) - i;
  return span > 0 ? Math.min(1, Math.max(0, (t - i) / span)) : 0;
}

/** Where the series ends (hours from the start of its first hour): a finished day = all hours, an open one a fraction. */
function seriesEnd(data: StandHoursData): number {
  const length = data.hours.length;
  if (length === 0) return 0;
  const start = belgradeLocalToEpoch(`${data.dateKey}T${String(data.hours[0]).padStart(2, "0")}:00`);
  if (start === null || !Number.isFinite(data.at) || data.at >= start + length * HOUR_MS) return length;
  return Math.min(length, Math.max(length - 1 + MIN_OPEN_SPAN, (data.at - start) / HOUR_MS));
}

/**
 * Whether the hours read at `readAt` are behind the live picture of `liveAt`: the poll has moved into a later
 * Belgrade hour (Belgrade is a whole number of hours off UTC, so its hours start on UTC hours). The layers of the
 * live hall are read again then: at most once an hour.
 */
export function hoursAreStale(liveAt: number, readAt: number): boolean {
  if (!Number.isFinite(liveAt) || !Number.isFinite(readAt)) return false;
  return Math.floor(liveAt / HOUR_MS) > Math.floor(readAt / HOUR_MS);
}

/** Stands of one map location summed; empty stands dropped; sorted by total desc, then label. */
export function hallSeries(data: StandHoursData): HallSeries {
  const length = data.hours.length;
  const groups = new Map<string, StandHoursData["stands"]>();
  for (const stand of data.stands) {
    const key = stand.mapLocationId || stand.standCode;
    groups.set(key, [...(groups.get(key) ?? []), stand]);
  }
  const stands: HallStand[] = [];
  for (const [locationId, members] of groups) {
    const label = [...new Set(members.map((member) => member.standCode))].sort(byLabel).join(", ");
    const scans = Array.from({ length }, (_, hour) => members.reduce((sum, member) => sum + count(member.scans[hour]), 0));
    const readUnique = members.every((member) => member.uniquePerModel.length === length);
    const unique = readUnique ? Array.from({ length }, (_, hour) => members.reduce((sum, member) => sum + count(member.uniquePerModel[hour]), 0)) : null;
    const total = scans.reduce((sum, value) => sum + value, 0);
    if (total > 0) stands.push({ locationId, label, scans, unique, total });
  }
  stands.sort((a, b) => b.total - a.total || byLabel(a.label, b.label));
  return {
    dateKey: data.dateKey,
    hours: [...data.hours],
    stands,
    end: seriesEnd(data),
    maxTotal: stands.reduce((max, stand) => Math.max(max, stand.total), 0),
    capped: data.capped,
  };
}

/** Scans up to the moment t: whole hours in full plus the linear part of the running hour. */
export function cumulativeAt(scans: readonly number[], t: number, end: number = scans.length): number {
  const limit = Number.isFinite(end) ? Math.max(0, end) : scans.length;
  const at = clampT(t, limit);
  const i = Math.floor(at);
  let sum = 0;
  for (let hour = 0; hour < Math.min(i, scans.length); hour += 1) sum += count(scans[hour]);
  return sum + count(scans[i]) * shareOf(i, at, limit);
}

/** Index of the hour t is in (0 … hours.length − 1); −1 for an empty series. */
export function hourAt(series: HallSeries, t: number): number {
  if (series.hours.length === 0) return -1;
  return Math.min(series.hours.length - 1, Math.floor(clampT(t, series.end)));
}

/** locationId → cumulative / series.maxTotal (0–1). The scale never changes during the day. */
export function heightsAt(series: HallSeries, t: number): Map<string, number> {
  const heights = new Map<string, number>();
  for (const stand of series.stands) {
    heights.set(stand.locationId, series.maxTotal > 0 ? Math.min(1, cumulativeAt(stand.scans, t, series.end) / series.maxTotal) : 0);
  }
  return heights;
}

/**
 * What the heat of a day is measured in: unique per model when it was read for EVERY stand, else the scans of
 * every stand. Two measures on one scale would make a stand without unique counts look hotter than it is.
 */
const measureOf = (series: HallSeries) => {
  const unique = series.stands.every((stand) => stand.unique !== null);
  return (stand: HallStand) => (unique ? stand.unique ?? stand.scans : stand.scans);
};

const levelCache = new WeakMap<HallSeries, Map<number, ReadonlyMap<string, number>>>();

/** locationId → heat level 0–1 of ONE hour (cached per series). */
export function hourLevels(series: HallSeries, hourIndex: number): ReadonlyMap<string, number> {
  if (!Number.isInteger(hourIndex) || hourIndex < 0 || hourIndex >= series.hours.length) return new Map();
  let perHour = levelCache.get(series);
  if (!perHour) {
    perHour = new Map();
    levelCache.set(series, perHour);
  }
  const cached = perHour.get(hourIndex);
  if (cached) return cached;
  const measure = measureOf(series);
  const counts = series.stands.map((stand) => ({ locationId: stand.locationId, value: count(measure(stand)[hourIndex]) }));
  const cap = fairHeatCap(counts.map((entry) => entry.value), "hour");
  const levels = new Map(counts.map((entry) => [entry.locationId, fairHeatLevel(entry.value, cap)] as const));
  perHour.set(hourIndex, levels);
  return levels;
}

/** locationId → heat level 0–1 at the moment t, linear between two hours. */
export function levelsAt(series: HallSeries, t: number): Map<string, number> {
  const levels = new Map<string, number>();
  const at = clampT(t, series.end);
  const i = Math.floor(at);
  const share = shareOf(i, at, series.end);
  const before = hourLevels(series, i - 1);
  const during = hourLevels(series, i);
  for (const stand of series.stands) {
    if (at <= 0) {
      levels.set(stand.locationId, 0);
      continue;
    }
    const from = before.get(stand.locationId) ?? 0;
    const to = during.get(stand.locationId) ?? 0;
    levels.set(stand.locationId, from + (to - from) * share);
  }
  return levels;
}

/**
 * locationId → heat level 0–1 of the day SO FAR at the moment t: the measure and the scale of „Danas“ on the
 * live map (unique per model since the opening, the scale of a day), so at the end of the day the picture is
 * the one the live map had. Early in the day every stand is cool: the scale of a day needs a few scans.
 */
export function dayLevelsAt(series: HallSeries, t: number): Map<string, number> {
  const measure = measureOf(series);
  const counts = series.stands.map((stand) => ({ locationId: stand.locationId, value: cumulativeAt(measure(stand), t, series.end) }));
  const cap = fairHeatCap(counts.map((entry) => entry.value), "today");
  return new Map(counts.map((entry) => [entry.locationId, fairHeatLevel(entry.value, cap)] as const));
}

/** The layers of one column at t: one per hour that has scans in it by then, oldest first. */
export function layersAt(series: HallSeries, stand: HallStand, t: number): HallLayer[] {
  const at = clampT(t, series.end);
  const i = Math.floor(at);
  const layers: HallLayer[] = [];
  for (let hour = 0; hour <= Math.min(i, series.hours.length - 1); hour += 1) {
    const scans = count(stand.scans[hour]) * (hour < i ? 1 : shareOf(hour, at, series.end));
    if (scans <= 0) continue;
    layers.push({ hour: series.hours[hour], scans, level: hourLevels(series, hour).get(stand.locationId) ?? 0 });
  }
  return layers;
}

/** Stands with at least one scan by t, by cumulative desc; a tie goes by label. */
export function rankAt(series: HallSeries, t: number, limit?: number): HallRankRow[] {
  const rows = series.stands
    .map((stand) => ({ stand, cumulative: cumulativeAt(stand.scans, t, series.end) }))
    .filter((row) => row.cumulative > 0)
    .sort((a, b) => b.cumulative - a.cumulative || byLabel(a.stand.label, b.stand.label))
    .map((row, index) => ({ locationId: row.stand.locationId, label: row.stand.label, scans: Math.round(row.cumulative), place: index + 1 }));
  return limit === undefined || !Number.isFinite(limit) ? rows : rows.slice(0, Math.max(0, Math.floor(limit)));
}

/** "14:20" for t; "" for an empty series. */
export function clockText(series: HallSeries, t: number): string {
  if (series.hours.length === 0) return "";
  // The small bias keeps a float like 379.99999999999994 from reading a minute early.
  const minutes = Math.floor(series.hours[0] * 60 + clampT(t, series.end) * 60 + 1e-6);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The table twin: stands × hours of the day. */
export function standHoursTable(series: HallSeries): { hours: number[]; rows: Array<{ label: string; scans: number[]; total: number }> } {
  return {
    hours: [...series.hours],
    rows: series.stands.map((stand) => ({ label: stand.label, scans: [...stand.scans], total: stand.total })),
  };
}
