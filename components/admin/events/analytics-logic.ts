import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { depthOfInterest, passportFunnel } from "@/lib/admin-v2/analytics/depth";
import { countOf } from "@/lib/admin-v2/analytics/format";
import { funnelSteps } from "@/lib/admin-v2/analytics/funnel";
import { analyticsInsights } from "@/lib/admin-v2/analytics/insights";
import { packageRows } from "@/lib/admin-v2/analytics/stands";
import type { EngagementData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// SAJAM SUPER Korak 4 — pure logic of `Događaji → Analitika`: the model and
// stand ranking (with conversion), the per-hour series of one day, and the
// CSV export. The view and the dev preview render what these return.

export type EventAnalyticsData = FunctionReturnType<typeof api.fairEventAnalytics.getEventAnalytics>;
export type EventAudienceData = FunctionReturnType<typeof api.fairEventAnalytics.getEventAudience>;

const d = adminEventsSr.analytics;

export type AnalyticsModelRow = EventAnalyticsData["models"][number] & {
  /** Distinct visitors of the model (= unique per model; null until the audience read answers). */
  visitors: number | null;
  /** Leads / unique per model; null without a unique scan. */
  conversion: number | null;
};

export type AnalyticsStandRow = {
  locationId: string;
  standCode: string;
  exhibitors: string[];
  models: number;
  scans: number;
  uniquePerModel: number;
  /** Distinct visitors of the stand (one person, many cars = 1); null until the audience read answers. */
  visitors: number | null;
  leads: number;
  conversion: number | null;
  votes: number;
  rating: { average: number; count: number } | null;
};

const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export function analyticsModelRows(data: EventAnalyticsData, audience: EventAudienceData | undefined): AnalyticsModelRow[] {
  const visitors = new Map(audience?.models.map((row) => [row.eventModelId as string, row.visitors]) ?? []);
  return data.models
    .map((row) => ({ ...row, visitors: audience ? (visitors.get(row.eventModelId) ?? 0) : null, conversion: rate(row.leads, row.uniquePerModel.total) }))
    .sort((a, b) => b.scans.total - a.scans.total || b.uniquePerModel.total - a.uniquePerModel.total || a.name.localeCompare(b.name, "sr"));
}

/** Models summed per map location (stand 6 holds two exhibitors); conversion = leads / the stand's visitors. */
export function analyticsStandRows(data: EventAnalyticsData, audience: EventAudienceData | undefined): AnalyticsStandRow[] {
  const visitors = new Map(audience?.locations.map((row) => [row.locationId, row.visitors]) ?? []);
  const rows = new Map<string, AnalyticsStandRow & { ratingSum: number }>();
  for (const model of data.models) {
    const key = model.mapLocationId || model.standCode;
    const row = rows.get(key) ?? {
      locationId: key,
      standCode: model.standCode,
      exhibitors: [],
      models: 0,
      scans: 0,
      uniquePerModel: 0,
      visitors: null,
      leads: 0,
      conversion: null,
      votes: 0,
      rating: null,
      ratingSum: 0,
    };
    if (model.exhibitorName && !row.exhibitors.includes(model.exhibitorName)) row.exhibitors.push(model.exhibitorName);
    row.models += 1;
    row.scans += model.scans.total;
    row.uniquePerModel += model.uniquePerModel.total;
    row.leads += model.leads;
    row.votes += model.votes;
    if (model.rating) {
      row.ratingSum += model.rating.average * model.rating.count;
      row.rating = { average: 0, count: (row.rating?.count ?? 0) + model.rating.count };
    }
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(({ ratingSum, ...row }) => {
      const standVisitors = audience ? (visitors.get(row.locationId) ?? 0) : null;
      return {
        ...row,
        exhibitors: [...row.exhibitors].sort((a, b) => a.localeCompare(b, "sr")),
        visitors: standVisitors,
        conversion: rate(row.leads, standVisitors ?? row.uniquePerModel),
        rating: row.rating ? { average: Math.round((ratingSum / row.rating.count) * 100) / 100, count: row.rating.count } : null,
      };
    })
    .sort((a, b) => b.scans - a.scans || b.uniquePerModel - a.uniquePerModel || a.standCode.localeCompare(b.standCode, "sr", { numeric: true }));
}

/** The fair day whose hours are shown: `?dan=` when it exists, else today, else the last day with data. */
export function analyticsHourDay(data: EventAnalyticsData, requested: string | undefined): string | null {
  const keys = data.days.map((day) => day.dateKey);
  if (requested && keys.includes(requested)) return requested;
  if (keys.includes(data.todayKey)) return data.todayKey;
  const withData = data.days.filter((day) => day.scans > 0).map((day) => day.dateKey);
  return withData.at(-1) ?? keys[0] ?? null;
}

export function analyticsHours(data: EventAnalyticsData, dateKey: string | null) {
  return data.hours.filter((row) => row.dateKey === dateKey);
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(Math.round(value * 1000) / 10).toLocaleString("sr-RS", { maximumFractionDigits: 1 })} %`;
}

// -----------------------------------------------------------------------------
// CSV (RFC 4180, comma, CRLF, UTF-8 BOM so Excel reads the diacritics), like the reports.
// -----------------------------------------------------------------------------

type Cell = string | number | null;

function csvCell(cell: Cell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return String(Math.round(cell * 1000) / 1000);
  // An exhibitor or model name must never run as a formula.
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function analyticsCsv(input: { eventTitle: string; data: EventAnalyticsData; audience: EventAudienceData | undefined; engagement?: EngagementData }): string {
  const { data, audience, engagement } = input;
  const c = d.columns;
  const k = d.kpi;
  const v = d.v2;
  const tier = (value: string) => d.tiers[value as keyof typeof d.tiers] ?? value;
  const byDay = new Map(engagement?.models.map((row) => [row.eventModelId as string, row.scansByDay]) ?? []);
  const depth = depthOfInterest(data, audience, engagement);
  const passport = passportFunnel(audience, engagement);
  const insights = analyticsInsights({ data, audience, engagement }, { tier, and: v.insights.and, otherDays: v.insights.otherDays, scans: (count) => countOf(count, v.units.scans) });
  const lines: Cell[][] = [
    [`${d.title} · ${input.eventTitle}`],
    [new Date(data.at).toISOString()],
    [],
    [d.kpiTitle, d.today, d.total],
    [k.scans, data.kpis.scans.today, data.kpis.scans.total],
    [k.uniquePerModel, data.kpis.uniquePerModel.today, data.kpis.uniquePerModel.total],
    [k.visitors, audience?.visitors.today ?? null, audience?.visitors.total ?? null],
    [k.leads, data.kpis.leads.today, data.kpis.leads.total],
    [k.votes, null, data.kpis.audienceVotes],
    [k.surveys, null, data.kpis.surveys.total],
    [k.stamps, null, audience?.stamps.total ?? null],
    [k.shares, null, data.kpis.shares.total],
    [],
    [d.daysTitle],
    [d.dayLabel, d.legendScans, d.legendUnique],
    ...data.days.map((day) => [`${day.label} (${day.dateKey})`, day.scans, day.uniquePerModel]),
    [],
    [d.hoursTitle],
    [d.dayLabel, d.hourLabel, d.legendScans, d.legendUnique],
    ...data.hours.map((row) => [row.dateKey, `${String(row.hour).padStart(2, "0")}:00`, row.scans, row.uniquePerModel]),
    [],
    [d.modelsTitle],
    [c.model, c.exhibitor, c.stand, c.tier, c.scans, c.unique, c.visitors, c.leads, c.conversion, c.votes, c.rating, ...(engagement ? data.days.map((day) => day.label) : [])],
    ...analyticsModelRows(data, audience).map((row) => [
      `${row.brandName} ${row.name}`.trim(),
      row.exhibitorName,
      row.standCode,
      tier(row.tier),
      row.scans.total,
      row.uniquePerModel.total,
      row.visitors,
      row.leads,
      row.conversion,
      row.votes,
      row.rating?.average ?? null,
      ...(engagement ? data.days.map((_, index) => byDay.get(row.eventModelId)?.[index] ?? null) : []),
    ]),
    [],
    [d.standsTitle],
    [c.stand, c.exhibitor, c.scans, c.unique, c.visitors, c.leads, c.conversion, c.votes, c.rating],
    ...analyticsStandRows(data, audience).map((row) => [
      row.standCode,
      row.exhibitors.join(", "),
      row.scans,
      row.uniquePerModel,
      row.visitors,
      row.leads,
      row.conversion,
      row.votes,
      row.rating?.average ?? null,
    ]),
    [],
    [v.funnel.title],
    [v.funnel.columnStep, v.table.value, v.funnel.columnRate],
    ...funnelSteps(data, audience, engagement).map((step) => [
      v.funnel.steps[step.id],
      step.value,
      step.perVisitor !== null ? fmt(v.funnel.perVisitor, { value: step.perVisitor.toLocaleString("sr-RS", { maximumFractionDigits: 2 }) }) : step.rate,
    ]),
    [],
    [v.packages.title],
    [c.tier, v.packages.columnModels, c.scans, v.packages.perModel],
    ...packageRows(data, engagement).map((row) => [tier(row.tier), row.models, row.scans, row.scansPerModel]),
    ...(depth
      ? [[], [v.depth.title], [v.depth.columnBucket, v.depth.columnVisitors, v.table.share], ...depth.buckets.map((bucket) => [v.depth.buckets[bucket.id], bucket.visitors, bucket.share])]
      : []),
    ...(passport
      ? [[], [v.passport.title], [v.funnel.columnStep, v.table.value], [v.passport.steps.stampVisitors, passport.stampVisitors], [v.passport.steps.stamps, passport.stamps], [v.passport.steps.completed, passport.completed]]
      : []),
    ...(insights.length ? [[], [v.insights.title], ...insights.map((item) => [fmt(v.insights.items[item.id], item.values)])] : []),
  ];
  return `﻿${lines.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
