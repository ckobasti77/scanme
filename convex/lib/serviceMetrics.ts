import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { MetricsRange } from "./metrics";
import { metricsRangeConfig } from "./metrics";

const BELGRADE_TIME_ZONE = "Europe/Belgrade";

export function serviceMetricDateKey(timestamp: number) {
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
  return Array.from({ length: days }, (_, index) =>
    serviceMetricDateKey(Date.now() - index * 24 * 60 * 60 * 1000),
  );
}

export async function getServiceMetricRows(
  ctx: QueryCtx,
  serviceProfileId: Id<"serviceProfiles">,
  range: MetricsRange,
  field: "scans" | "pageViews" | "convertedSessions" = "scans",
) {
  const config = metricsRangeConfig[range];
  if (config.days) {
    const keys = lastDateKeys(config.days);
    const rows = await Promise.all(
      keys.map((key) =>
        ctx.db
          .query("dailyServiceMetrics")
          .withIndex("by_serviceProfileId_and_dateKey", (q) =>
            q.eq("serviceProfileId", serviceProfileId).eq("dateKey", key),
          )
          .unique(),
      ),
    );
    return keys.map((key, index) => ({ dateKey: key, count: rows[index]?.[field] ?? 0 }));
  }

  const rows = await ctx.db
    .query("dailyServiceMetrics")
    .withIndex("by_serviceProfileId_and_dateKey", (q) =>
      q.eq("serviceProfileId", serviceProfileId),
    )
    .order("desc")
    .take(10000);
  return rows.map((row) => ({ dateKey: row.dateKey, count: row[field] }));
}

export async function getDestinationMetricRows(
  ctx: QueryCtx,
  destinationId: Id<"serviceDestinations">,
  range: MetricsRange,
  field: "clicks" | "directVisits",
) {
  const config = metricsRangeConfig[range];
  if (config.days) {
    const keys = lastDateKeys(config.days);
    const rows = await Promise.all(
      keys.map((key) =>
        ctx.db
          .query("dailyDestinationMetrics")
          .withIndex("by_destinationId_and_dateKey", (q) =>
            q.eq("destinationId", destinationId).eq("dateKey", key),
          )
          .unique(),
      ),
    );
    return keys.map((key, index) => ({ dateKey: key, count: rows[index]?.[field] ?? 0 }));
  }

  const rows = await ctx.db
    .query("dailyDestinationMetrics")
    .withIndex("by_destinationId_and_dateKey", (q) =>
      q.eq("destinationId", destinationId),
    )
    .order("desc")
    .take(10000);
  return rows.map((row) => ({ dateKey: row.dateKey, count: row[field] }));
}

