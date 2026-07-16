import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { BusinessAccessDeniedError, requireBusinessAccessBySlug } from "./lib/access";
import { aggregateMetricRows, getMetricRows, metricsRangeConfig } from "./lib/metrics";
import { requireSlug } from "./lib/validation";

const BELGRADE_TIME_ZONE = "Europe/Belgrade";

export const myPanels = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const memberships = await ctx.db
      .query("businessMemberships")
      .withIndex("by_userId_and_active", (q) =>
        q.eq("userId", userId).eq("active", true),
      )
      .take(20);

    const panels = [];
    for (const membership of memberships) {
      const business = await ctx.db.get(membership.businessId);
      if (business && business.status !== "inactive") {
        panels.push({ slug: business.slug, name: business.name });
      }
    }

    return panels;
  },
});

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
  const now = Date.now();
  return Array.from({ length: days }, (_, index) => dateKey(now - index * 24 * 60 * 60 * 1000));
}

export const publicLocation = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const slug = requireSlug(args.slug);
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!business || business.status === "inactive") return null;
    return { name: business.name };
  },
});

export const metrics = query({
  args: {
    slug: v.string(),
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
    summaryRange: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    let access;
    try {
      access = await requireBusinessAccessBySlug(ctx, args.slug);
    } catch (error) {
      if (error instanceof BusinessAccessDeniedError) {
        return { status: "forbidden" as const };
      }
      throw error;
    }
    const { business, link } = access;
    const range = args.range ?? "7d";
    const summaryRange = args.summaryRange ?? range;
    const config = metricsRangeConfig[range];
    const summaryConfig = metricsRangeConfig[summaryRange];
    const metricRows = await getMetricRows(ctx, link._id, range);
    const summaryRows = summaryRange === range ? metricRows : await getMetricRows(ctx, link._id, summaryRange);
    const last7Keys = new Set(lastDateKeys(7));
    const last7Days = metricRows
      .filter((row) => last7Keys.has(row.dateKey))
      .reduce((sum, row) => sum + row.count, 0);
    const todayKey = dateKey(Date.now());
    return {
      status: "available" as const,
      businessName: business.name,
      total: link.scanCount,
      today: metricRows.find((row) => row.dateKey === todayKey)?.count ?? 0,
      last7Days,
      periodTotal: range === "all" ? link.scanCount : metricRows.reduce((sum, row) => sum + row.count, 0),
      range,
      rangeLabel: config.label,
      summaryRange,
      summaryRangeLabel: summaryConfig.label,
      summaryPeriodTotal: summaryRange === "all" ? link.scanCount : summaryRows.reduce((sum, row) => sum + row.count, 0),
      daily: aggregateMetricRows(metricRows, config.granularity),
    };
  },
});
