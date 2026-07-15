import { v } from "convex/values";
import { query } from "./_generated/server";
import { BusinessAccessDeniedError, requireBusinessAccessBySlug } from "./lib/access";
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
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
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
    } catch (error) {
      if (error instanceof BusinessAccessDeniedError) {
        return { status: "forbidden" as const };
      }
      throw error;
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
    return {
      status: "available" as const,
      businessName: business.name,
      total: link.scanCount,
      today: dailyRows[0]?.count ?? 0,
      last7Days: dailyRows.reduce((sum, row) => sum + (row?.count ?? 0), 0),
      daily: keys
        .map((key, index) => ({ dateKey: key, count: dailyRows[index]?.count ?? 0 }))
        .reverse(),
    };
  },
});
