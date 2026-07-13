import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireBusinessAccessBySlug } from "./lib/access";
import { requireSlug } from "./lib/validation";

const BELGRADE_TIME_ZONE = "Europe/Belgrade";

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
    const link = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!link) return null;
    const business = await ctx.db.get(link.businessId);
    if (!business || business.status === "inactive") return null;
    return { name: business.name };
  },
});

export const metrics = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    let access;
    try {
      access = await requireBusinessAccessBySlug(ctx, args.slug);
    } catch {
      return { status: "forbidden" as const };
    }
    const { business, link } = access;
    const keys = lastDateKeys(7);
    const dailyRows = await Promise.all(
      keys.map((key) =>
        ctx.db
          .query("dailyScanCounts")
          .withIndex("by_dynamicLinkId_and_dateKey", (q) =>
            q.eq("dynamicLinkId", link._id).eq("dateKey", key),
          )
          .unique(),
      ),
    );
    const recentRows = await ctx.db
      .query("scanEvents")
      .withIndex("by_dynamicLinkId_and_scannedAt", (q) => q.eq("dynamicLinkId", link._id))
      .order("desc")
      .take(120);
    const recent = recentRows.filter((row) => row.deviceCategory !== "bot").slice(0, 100);
    const deviceCounts = { mobile: 0, tablet: 0, desktop: 0, unknown: 0 };
    const referrerCounts: Record<string, number> = {};
    for (const event of recent) {
      const category = event.deviceCategory;
      if (category && category !== "bot") deviceCounts[category] += 1;
      if (event.referrerHost) referrerCounts[event.referrerHost] = (referrerCounts[event.referrerHost] ?? 0) + 1;
    }

    return {
      status: "available" as const,
      businessName: business.name,
      total: link.scanCount,
      today: dailyRows[0]?.count ?? 0,
      last7Days: dailyRows.reduce((sum, row) => sum + (row?.count ?? 0), 0),
      daily: keys
        .map((key, index) => ({ dateKey: key, count: dailyRows[index]?.count ?? 0 }))
        .reverse(),
      recent: recent.slice(0, 20).map((event) => ({
        id: event._id,
        scannedAt: event.scannedAt,
        deviceCategory: event.deviceCategory ?? "unknown",
        referrerHost: event.referrerHost ?? null,
      })),
      deviceCounts,
      topReferrers: Object.entries(referrerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([host, count]) => ({ host, count })),
      sampleSize: recent.length,
    };
  },
});
