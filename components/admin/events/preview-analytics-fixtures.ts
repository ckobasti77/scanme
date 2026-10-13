import type { Id } from "@/convex/_generated/dataModel";
import type { EventAnalyticsData, EventAudienceData } from "@/components/admin/events/analytics-logic";
import type { EngagementData, ModelAnalyticsData } from "@/lib/admin-v2/analytics/types";
import { fairHeatCap, fairHeatLevel } from "@/lib/fair-heat";
import type { StandHoursData } from "@/lib/admin-v2/hall/types";

// ADMIN v2 X3 — TEST numbers of `analitika` for the dev preview
// (/dev/admin-events-preview/analitika), in the SHAPE of a real three-day fair:
// 15 models on 4 stands, 3 days, no lead, almost every scan from a phone.
// The totals of the whole fair (scans, visitors, per day, the busiest hour,
// stamps, passports, devices) are the real aggregate; every number per
// exhibitor, model and stand is invented in the same order of magnitude (the
// leading model holds about a fifth of the scans), and every name is a TEST
// name. The map locations are the real ones of Elektromobilnost.
// V3 — `previewStandHours` splits the hours of one TEST fair day over the four
// TEST stands (the Vremeplov of the hall) and `previewHallToday` is the
// analytics the hall excerpt of Pregled shows; both stay in step with these rows.
// Never shown outside `next dev`.

const AT = Date.parse("2026-10-11T22:37:00+02:00");
const CUTOFF = Date.parse("2026-10-09T08:00:00+02:00");
const DAYS = [
  { dateKey: "2026-10-09", label: "Petak" },
  { dateKey: "2026-10-10", label: "Subota" },
  { dateKey: "2026-10-11", label: "Nedelja" },
] as const;
const id = (value: string) => value as Id<"fairEventModels">;

type Tier = "advanced" | "starter" | "included";
type Row = {
  key: string;
  name: string;
  brand: string;
  exhibitor: string;
  stand: string;
  location: string;
  tier: Tier;
  /** Scans per fair day (Petak, Subota, Nedelja). */
  byDay: [number, number, number];
  unique: number;
  uniqueToday: number;
  votes?: number;
  rating?: { average: number; buckets: [number, number, number, number, number] };
};

const A = { exhibitor: "TEST Izlagač A", stand: "9", location: "hala-9", tier: "advanced" } as const;
const B = { exhibitor: "TEST Izlagač B", stand: "6", location: "hala-6", tier: "included" } as const;
const C = { exhibitor: "TEST Izlagač C", stand: "6", location: "hala-6", tier: "included" } as const;
const D = { exhibitor: "TEST Izlagač D", stand: "1A", location: "hala-1a", tier: "starter" } as const;
const E = { exhibitor: "TEST Izlagač E", stand: "1B", location: "hala-1b", tier: "included" } as const;

// X6 (RX V3) — the model names are neutral letters: they carry no word and no digit of a real model name.
// No pair (scans, unique), of the fair or of a day, and no vote count of a row or a stand equals a real one.
const ROWS: Row[] = [
  { key: "a1", name: "Alfa", brand: "TEST Volta", ...A, byDay: [20, 36, 35], unique: 88, uniqueToday: 32, rating: { average: 4.4, buckets: [0, 0, 2, 4, 6] } },
  { key: "e1", name: "Beta", brand: "TEST Njutn", ...E, byDay: [17, 29, 32], unique: 68, uniqueToday: 26, votes: 1 },
  { key: "a2", name: "Gama", brand: "TEST Volta", ...A, byDay: [19, 31, 22], unique: 65, uniqueToday: 20 },
  { key: "a3", name: "Delta", brand: "TEST Volta", ...A, byDay: [12, 19, 20], unique: 48, uniqueToday: 18, votes: 2, rating: { average: 4.8, buckets: [0, 0, 0, 1, 3] } },
  { key: "c1", name: "Epsilon", brand: "TEST Faradej", ...C, byDay: [9, 16, 13], unique: 37, uniqueToday: 13 },
  { key: "c2", name: "Zeta", brand: "TEST Faradej", ...C, byDay: [6, 11, 11], unique: 26, uniqueToday: 10 },
  { key: "d1", name: "Eta", brand: "TEST Vat", ...D, byDay: [6, 8, 13], unique: 26, uniqueToday: 12, rating: { average: 4, buckets: [0, 0, 0, 2, 0] } },
  { key: "c3", name: "Teta", brand: "TEST Džul", ...C, byDay: [5, 7, 11], unique: 22, uniqueToday: 10 },
  { key: "c4", name: "Jota", brand: "TEST Faradej", ...C, byDay: [4, 5, 9], unique: 18, uniqueToday: 9 },
  { key: "c5", name: "Kapa", brand: "TEST Džul", ...C, byDay: [2, 5, 6], unique: 13, uniqueToday: 6 },
  { key: "c6", name: "Lambda", brand: "TEST Džul", ...C, byDay: [2, 2, 5], unique: 9, uniqueToday: 5 },
  { key: "b1", name: "Mi", brand: "TEST Om", ...B, byDay: [1, 3, 2], unique: 5, uniqueToday: 1 },
  { key: "b2", name: "Ni", brand: "TEST Om", ...B, byDay: [1, 3, 0], unique: 4, uniqueToday: 0 },
  { key: "b3", name: "Ksi", brand: "TEST Om", ...B, byDay: [0, 1, 0], unique: 1, uniqueToday: 0 },
  { key: "b4", name: "Omikron", brand: "TEST Om", ...B, byDay: [0, 1, 0], unique: 1, uniqueToday: 0 },
];

const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);
const scansOf = (row: Row) => total(row.byDay);
const ratingCount = (row: Row) => (row.rating ? total(row.rating.buckets) : 0);

/** Scans (and unique per model) per hour from 08:00: [hour, Petak, Subota, Nedelja]. The Sunday noon is the busiest hour. */
const HOUR_SCANS: Array<[number, number, number, number]> = [
  [8, 2, 3, 2], [9, 5, 8, 7], [10, 9, 15, 16], [11, 12, 22, 28], [12, 14, 27, 39], [13, 13, 24, 30], [14, 11, 19, 21],
  [15, 10, 17, 14], [16, 9, 15, 10], [17, 8, 12, 7], [18, 6, 8, 4], [19, 3, 4, 1], [20, 2, 2, 0], [21, 0, 1, 0], [22, 0, 0, 0], [23, 0, 0, 0],
];
const HOUR_UNIQUE: Array<[number, number, number, number]> = [
  [8, 2, 3, 2], [9, 5, 8, 7], [10, 9, 14, 15], [11, 11, 21, 26], [12, 13, 26, 35], [13, 12, 23, 27], [14, 11, 18, 19],
  [15, 10, 16, 12], [16, 9, 15, 9], [17, 7, 12, 6], [18, 6, 8, 3], [19, 2, 3, 1], [20, 2, 2, 0], [21, 0, 1, 0], [22, 0, 0, 0], [23, 0, 0, 0],
];
/** The last hour of each day the read has reached (the read is on Sunday at 22:37). */
const LAST_HOUR = [23, 23, 22];

const hours = DAYS.flatMap((day, dayIndex) =>
  HOUR_SCANS.filter(([hour]) => hour <= LAST_HOUR[dayIndex]).map(([hour, ...scans], index) => ({ dateKey: day.dateKey, hour, scans: scans[dayIndex], uniquePerModel: HOUR_UNIQUE[index][dayIndex + 1] })),
);

const models: EventAnalyticsData["models"] = ROWS.map((row) => ({
  eventModelId: id(`test-preview-${row.key}`),
  name: row.name,
  brandName: row.brand,
  exhibitorName: row.exhibitor,
  standCode: row.stand,
  mapLocationId: row.location,
  tier: row.tier,
  scans: { today: row.byDay[2], total: scansOf(row) },
  uniquePerModel: { today: row.uniqueToday, total: row.unique },
  leads: 0,
  votes: row.votes ?? 0,
  rating: row.rating ? { average: row.rating.average, count: ratingCount(row) } : null,
}));

const heatRows = (counts: Map<string, number>, period: "today" | "hour") => {
  const sum = total([...counts.values()]);
  const cap = fairHeatCap(counts.values(), period);
  return [...counts]
    .map(([locationId, count]) => ({ locationId, count, share: Math.round((count / sum) * 1000) / 1000, level: fairHeatLevel(count, cap) }))
    .sort((a, b) => b.count - a.count);
};
const uniqueTodayByLocation = new Map<string, number>();
for (const row of ROWS) uniqueTodayByLocation.set(row.location, (uniqueTodayByLocation.get(row.location) ?? 0) + row.uniqueToday);

export const previewAnalytics: EventAnalyticsData = {
  at: AT,
  cutoff: CUTOFF,
  todayKey: "2026-10-11",
  capped: false,
  kpis: {
    scans: { today: total(ROWS.map((row) => row.byDay[2])), total: total(ROWS.map(scansOf)) },
    uniquePerModel: { today: total(ROWS.map((row) => row.uniqueToday)), total: total(ROWS.map((row) => row.unique)) },
    leads: { today: 0, total: 0, interest: 0, testDrive: 0, capped: false },
    audienceVotes: 3,
    surveys: { total: 2, capped: false },
    shares: { total: 0, capped: false },
  },
  days: DAYS.map((day, index) => ({ ...day, scans: total(ROWS.map((row) => row.byDay[index])), uniquePerModel: total(HOUR_UNIQUE.map((row) => row[index + 1])) })),
  hours,
  models,
  // The hall closed at 20:00, so the last hour has no scan.
  heat: { today: heatRows(uniqueTodayByLocation, "today"), hour: [] },
};

export const previewAudience: EventAudienceData = {
  visitors: { today: 117, total: 310, capped: false },
  models: ROWS.map((row) => ({ eventModelId: id(`test-preview-${row.key}`), visitors: row.unique })),
  locations: [
    { locationId: "hala-9", visitors: 168 },
    { locationId: "hala-6", visitors: 101 },
    { locationId: "hala-1b", visitors: 68 },
    { locationId: "hala-1a", visitors: 26 },
  ],
  devices: { mobile: 454, tablet: 0, desktop: 2, unknown: 0, bots: 4, sample: 460, capped: false },
  stamps: { total: 210, passportsCompleted: 5, capped: false },
};

const TIERS: readonly Tier[] = ["advanced", "starter", "included"];

export const previewEngagement: EngagementData = {
  at: AT,
  days: DAYS.map((day, index) => ({ ...day, visitors: [72, 124, 117][index], leads: 0 })),
  models: ROWS.map((row) => ({ eventModelId: id(`test-preview-${row.key}`), scansByDay: [...row.byDay] })),
  // 310 visitors and 431 visitor–model pairs: 222 + 2·62 + 3·19 + 4·7.
  depth: { one: 222, two: 62, three: 19, fourPlus: 7, visitors: 310 },
  engaged: { visitors: 11, rating: 9, vote: 3, survey: 2, lead: 0 },
  stampVisitors: 164,
  packages: TIERS.map((tier) => {
    const rows = ROWS.filter((row) => row.tier === tier);
    const scans = total(rows.map(scansOf));
    return { tier, models: rows.length, scans, scansPerModel: Math.round((scans / rows.length) * 10) / 10 };
  }),
  capped: { days: false, visitors: false, ratings: false, votes: false, surveys: false, leads: false, stamps: false },
};

/** ADMIN v2 X4 — scans one simulated poll adds (`?uzivo=<step>` of the preview). */
export const PREVIEW_STEP_SCANS = 14;
const MAX_STEP = 9;

/** `?uzivo=` as a step: 0 (the fixtures as they are) to 9. */
export function previewStep(value: string | null | undefined): number {
  const step = Number(value);
  return Number.isInteger(step) && step > 0 ? Math.min(step, MAX_STEP) : 0;
}

/**
 * ADMIN v2 X4 — the three reads as a poll would bring them `step` minutes later
 * (dev preview `?uzivo=<step>`): every step adds 14 TEST scans of the leading
 * TEST model in the current hour (the third step makes that hour the record of
 * the fair) and the second step brings the first TEST lead. Nothing here is a
 * real number; it only lets the preview show what moves when data changes (the
 * rolling numbers, a new record, its toast).
 */
export function previewAnalyticsStep(step: number): { data: EventAnalyticsData; audience: EventAudienceData; engagement: EngagementData } {
  if (step <= 0) return { data: previewAnalytics, audience: previewAudience, engagement: previewEngagement };
  const extra = PREVIEW_STEP_SCANS * step;
  const lead = step >= 2 ? 1 : 0;
  const last = DAYS.length - 1;
  const today = previewAnalytics.todayKey;
  const hour = LAST_HOUR[last];
  const kpis = previewAnalytics.kpis;
  const data: EventAnalyticsData = {
    ...previewAnalytics,
    at: AT + step * 60_000,
    kpis: {
      ...kpis,
      scans: { today: kpis.scans.today + extra, total: kpis.scans.total + extra },
      leads: lead ? { today: 1, total: 1, interest: 1, testDrive: 0, capped: false } : kpis.leads,
    },
    days: previewAnalytics.days.map((day, index) => (index === last ? { ...day, scans: day.scans + extra } : day)),
    // V3 — the same hour also has the unique of the leading stand (`previewHourHeat`), so its layer of the hall is not „nobody new“.
    hours: previewAnalytics.hours.map((row) => (row.dateKey === today && row.hour === hour ? { ...row, scans: row.scans + extra, uniquePerModel: row.uniquePerModel + previewStepUnique(step) } : row)),
    models: previewAnalytics.models.map((model, index) => (index === 0 ? { ...model, scans: { today: model.scans.today + extra, total: model.scans.total + extra }, leads: lead } : model)),
    // V3 — the last hour has unique visitors per location from the first poll on (at step 0 the hall closed at 20:00).
    heat: { ...previewAnalytics.heat, hour: previewHourHeat(step) },
  };
  const engagement: EngagementData = {
    ...previewEngagement,
    at: AT + step * 60_000,
    days: previewEngagement.days.map((day, index) => (index === last ? { ...day, leads: lead } : day)),
    models: previewEngagement.models.map((model, index) => (index === 0 ? { ...model, scansByDay: model.scansByDay.map((scans, day) => (day === last ? scans + extra : scans)) } : model)),
    engaged: lead ? { ...previewEngagement.engaged, visitors: previewEngagement.engaged.visitors + 1, lead: 1 } : previewEngagement.engaged,
  };
  return { data, audience: previewAudience, engagement };
}

/** `amount` split over `weights` in whole numbers that sum to it (largest remainder). */
function split(amount: number, weights: readonly number[]): number[] {
  const sum = total(weights);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (amount * weight) / sum);
  const parts = raw.map(Math.floor);
  const order = raw.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let left = amount - total(parts), at = 0; left > 0; left -= 1, at += 1) parts[order[at % order.length].index] += 1;
  return parts;
}

/** The detail of one TEST model, derived from its row: its days, its hours in the fair's hourly profile, its ratings. */
export function previewModelAnalytics(modelId: string): ModelAnalyticsData | null {
  const row = ROWS.find((entry) => `test-preview-${entry.key}` === modelId);
  if (!row) return null;
  const [friday, saturday] = split(row.unique - row.uniqueToday, row.byDay.slice(0, 2)).map((value, index) => Math.min(value, row.byDay[index]));
  const uniqueByDay = [friday, saturday, row.uniqueToday];
  const count = ratingCount(row);
  return {
    at: AT,
    eventModelId: id(modelId),
    days: DAYS.map((day, index) => ({ ...day, scans: row.byDay[index], uniquePerModel: uniqueByDay[index] })),
    hours: DAYS.flatMap((day, dayIndex) => {
      const profile = HOUR_SCANS.filter(([hour]) => hour <= LAST_HOUR[dayIndex]);
      const scans = split(row.byDay[dayIndex], profile.map((entry) => entry[dayIndex + 1]));
      const unique = split(uniqueByDay[dayIndex], scans);
      return profile.map(([hour], index) => ({ dateKey: day.dateKey, hour, scans: scans[index], uniquePerModel: unique[index] }));
    }),
    ratings: { count, average: row.rating?.average ?? null, buckets: row.rating ? [...row.rating.buckets] : [0, 0, 0, 0, 0], capped: false },
    votes: { total: row.votes ?? 0, questions: row.votes ? [{ prompt: "TEST pitanje: koja boja vam se najviše sviđa?", votes: row.votes }] : [] },
    leads: { total: 0, interest: 0, testDrive: 0, capped: false },
  };
}

/** V3 — the invented unique visitors of the leading stand in the last hour after `step` simulated polls. */
const previewStepUnique = (step: number) => (step > 0 ? 4 + 2 * step : 0);

/** V3 — invented unique visitors in the last hour per location, from the first simulated poll on (the leading stand grows with the step). */
function previewHourHeat(step: number) {
  return heatRows(new Map([["hala-9", previewStepUnique(step)], ["hala-6", 3], ["hala-1b", 2], ["hala-1a", 1]]), "hour");
}

/**
 * V3 — the analytics the hall excerpt of Pregled shows in the preview: the
 * analytics of `analitika` with the models' scans of today re-split so they sum
 * to `scansToday` (the dashboard fixture's number), and the heat of the last hour.
 */
export function previewHallToday(scansToday: number): EventAnalyticsData {
  const today = split(scansToday, previewAnalytics.models.map((model) => model.scans.today));
  return {
    ...previewAnalytics,
    kpis: { ...previewAnalytics.kpis, scans: { ...previewAnalytics.kpis.scans, today: scansToday } },
    models: previewAnalytics.models.map((model, index) => ({ ...model, scans: { ...model.scans, today: today[index] } })),
    heat: { ...previewAnalytics.heat, hour: previewHourHeat(1) },
  };
}

/** The four TEST stands of the rows, in the order the hall splits the hours over them (the last one takes what is left). */
const STANDS = [
  { standCode: "9", mapLocationId: "hala-9" },
  { standCode: "6", mapLocationId: "hala-6" },
  { standCode: "1B", mapLocationId: "hala-1b" },
  { standCode: "1A", mapLocationId: "hala-1a" },
] as const;

type StandHoursDay = { hours: number[]; scans: number[][]; unique: number[][] };
const standHoursDays = new Map<number, StandHoursDay>();

/**
 * One fair day over the stands, deterministic, with exact margins: per hour the stands sum to `HOUR_SCANS`
 * (and their unique to `HOUR_UNIQUE`), per stand the hours sum to its rows' scans of the day. The first three
 * stands take their day total by the weights of what is still free in each hour (never above it), the last one
 * what is left. Unique per hour is split by the scans of the hour, so no cell exceeds its scans (the hour's
 * unique never exceeds its scans).
 */
function standHoursDay(dayIndex: number): StandHoursDay {
  const cached = standHoursDays.get(dayIndex);
  if (cached) return cached;
  const profile = HOUR_SCANS.filter(([hour]) => hour <= LAST_HOUR[dayIndex]);
  const free = profile.map((entry) => entry[dayIndex + 1]);
  const scans = STANDS.map((stand, index) => {
    const dayTotal = total(ROWS.filter((row) => row.stand === stand.standCode).map((row) => row.byDay[dayIndex]));
    const cells = index === STANDS.length - 1 ? [...free] : split(dayTotal, free);
    cells.forEach((cell, hour) => { free[hour] -= cell; });
    return cells;
  });
  const unique = STANDS.map(() => profile.map(() => 0));
  profile.forEach(([hour], index) => {
    const row = HOUR_UNIQUE.find((entry) => entry[0] === hour)?.[dayIndex + 1] ?? 0;
    split(row, scans.map((cells) => cells[index])).forEach((cell, stand) => { unique[stand][index] = cell; });
  });
  const day = { hours: profile.map(([hour]) => hour), scans, unique };
  standHoursDays.set(dayIndex, day);
  return day;
}

/**
 * V3 — the hourly read of one TEST fair day per stand (`getEventStandHours` in the Vremeplov of the dev preview);
 * null for a day that is not one of the fixtures'. `step` is the same simulated poll as `previewAnalyticsStep`:
 * the extra scans land on stand 9 in the last hour of the last day, so the hour sums follow `previewAnalyticsStep(step).data.hours`.
 */
export function previewStandHours(dateKey: string, step = 0): StandHoursData | null {
  const dayIndex = DAYS.findIndex((day) => day.dateKey === dateKey);
  if (dayIndex < 0) return null;
  const day = standHoursDay(dayIndex);
  const extra = step > 0 && dayIndex === DAYS.length - 1 ? PREVIEW_STEP_SCANS * step : 0;
  const lastHour = day.hours.indexOf(LAST_HOUR[dayIndex]);
  return {
    at: AT + step * 60_000,
    dateKey,
    hours: [...day.hours],
    stands: STANDS.map((stand, index) => ({
      standCode: stand.standCode,
      mapLocationId: stand.mapLocationId,
      scans: day.scans[index].map((cell, hour) => (index === 0 && hour === lastHour ? cell + extra : cell)),
      uniquePerModel: day.unique[index].map((cell, hour) => (index === 0 && hour === lastHour && extra > 0 ? cell + previewStepUnique(step) : cell)),
    })),
    unread: 0,
    capped: false,
  };
}
