import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type MetricsRange = "7d" | "30d" | "90d" | "1y" | "all";
export type MetricsGranularity = "day" | "week" | "month";

const BELGRADE_TIME_ZONE = "Europe/Belgrade";

export const metricsRangeConfig = {
  "7d": { label: "Poslednjih 7 dana", days: 7, granularity: "day" },
  "30d": { label: "Poslednjih 30 dana", days: 30, granularity: "day" },
  "90d": { label: "Poslednja 3 meseca", days: 90, granularity: "week" },
  "1y": { label: "Poslednjih godinu dana", days: 365, granularity: "month" },
  all: { label: "Oduvek", days: undefined, granularity: "month" },
} as const satisfies Record<MetricsRange, { label: string; days?: number; granularity: MetricsGranularity }>;

function dateKey(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function lastDateKeys(days: number) {
  return Array.from({ length: days }, (_, index) => dateKey(Date.now() - index * 24 * 60 * 60 * 1000));
}

export async function getMetricRows(ctx: QueryCtx, dynamicLinkId: Id<"dynamicLinks">, range: MetricsRange) {
  const config = metricsRangeConfig[range];
  if (config.days) {
    const keys = lastDateKeys(config.days);
    const dailyRows = await Promise.all(
      keys.map((key) =>
        ctx.db
          .query("dailyScanCounts")
          .withIndex("by_dynamicLinkId_and_dateKey", (q) =>
            q.eq("dynamicLinkId", dynamicLinkId).eq("dateKey", key),
          )
          .unique(),
      ),
    );
    return keys.map((key, index) => ({ dateKey: key, count: dailyRows[index]?.count ?? 0 }));
  }

  const allTimeRows = await ctx.db
    .query("dailyScanCounts")
    .withIndex("by_dynamicLinkId_and_dateKey", (q) => q.eq("dynamicLinkId", dynamicLinkId))
    .order("desc")
    .take(10000);
  return allTimeRows.map((row) => ({ dateKey: row.dateKey, count: row.count }));
}

function metricBucketKey(value: string, granularity: MetricsGranularity) {
  if (granularity === "day") return value;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (granularity === "month") return `${year}-${String(month).padStart(2, "0")}`;
  const dayOfWeek = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function metricBucketLabel(value: string, granularity: MetricsGranularity) {
  const date = new Date(`${value}${granularity === "month" ? "-01" : ""}T12:00:00Z`);
  return new Intl.DateTimeFormat(
    "sr-Latn-RS",
    granularity === "month"
      ? { month: "short", year: "numeric", timeZone: "UTC" }
      : { day: "2-digit", month: "2-digit", timeZone: "UTC" },
  ).format(date);
}

export function aggregateMetricRows(rows: Array<{ dateKey: string; count: number }>, granularity: MetricsGranularity) {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const key = metricBucketKey(row.dateKey, granularity);
    buckets.set(key, (buckets.get(key) ?? 0) + row.count);
  }
  return [...buckets.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([dateKey, count]) => ({ dateKey, label: metricBucketLabel(dateKey, granularity), count }));
}

function nextBucketKey(value: string, granularity: "day" | "month") {
  const [year, month, day = 1] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (granularity === "day") date.setUTCDate(date.getUTCDate() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return granularity === "day"
    ? `${nextYear}-${nextMonth}-${String(date.getUTCDate()).padStart(2, "0")}`
    : `${nextYear}-${nextMonth}`;
}

export function aggregateMetricRowsForRange(
  rows: Array<{ dateKey: string; count: number }>,
  range: MetricsRange,
  currentDateKey = dateKey(Date.now()),
) {
  if (range !== "all" || rows.length === 0) {
    return aggregateMetricRows(rows, metricsRangeConfig[range].granularity);
  }

  const firstDateKey = rows.reduce((first, row) => row.dateKey < first ? row.dateKey : first, rows[0].dateKey);
  const singleMonth = firstDateKey.slice(0, 7) === currentDateKey.slice(0, 7);
  const granularity = singleMonth ? "day" : "month";
  const aggregated = aggregateMetricRows(rows, granularity);
  const counts = new Map(aggregated.map((row) => [row.dateKey, row.count]));
  const endKey = metricBucketKey(currentDateKey, granularity);
  const result = [];

  for (let key = aggregated[0].dateKey; key <= endKey; key = nextBucketKey(key, granularity)) {
    result.push({ dateKey: key, label: metricBucketLabel(key, granularity), count: counts.get(key) ?? 0 });
  }
  return result;
}
