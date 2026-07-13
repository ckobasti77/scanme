import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { isSafePublicDestination, requireSlug } from "./lib/validation";

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

const deviceCategoryValidator = v.union(
  v.literal("mobile"),
  v.literal("tablet"),
  v.literal("desktop"),
  v.literal("bot"),
  v.literal("unknown"),
);

export const resolveAndRecord = mutation({
  args: {
    slug: v.string(),
    requestId: v.string(),
    deviceCategory: v.optional(deviceCategoryValidator),
    referrerHost: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ status: v.literal("available"), destinationUrl: v.string() }),
    v.object({
      status: v.union(
        v.literal("missing"),
        v.literal("inactive"),
        v.literal("invalid_destination"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const slug = requireSlug(args.slug);
    const link = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!link) return { status: "missing" as const };
    if (!link.active) return { status: "inactive" as const };
    if (!isSafePublicDestination(link.destinationUrl)) {
      return { status: "invalid_destination" as const };
    }

    const requestId = args.requestId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Zahtev skeniranja nije ispravan.");
    const existingEvent = await ctx.db
      .query("scanEvents")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .unique();
    if (existingEvent) {
      return { status: "available" as const, destinationUrl: link.destinationUrl };
    }

    const referrerHost = args.referrerHost?.trim().toLowerCase();
    const safeReferrer =
      referrerHost &&
      referrerHost.length <= 253 &&
      /^[a-z0-9.-]+$/.test(referrerHost)
        ? referrerHost
        : undefined;

    const scannedAt = Date.now();
    await ctx.db.insert("scanEvents", {
      dynamicLinkId: link._id,
      requestId,
      scannedAt,
      ...(args.deviceCategory ? { deviceCategory: args.deviceCategory } : {}),
      ...(safeReferrer ? { referrerHost: safeReferrer } : {}),
    });
    if (args.deviceCategory !== "bot") {
      await ctx.db.patch("dynamicLinks", link._id, {
        scanCount: link.scanCount + 1,
        updatedAt: scannedAt,
      });
      const key = dateKey(scannedAt);
      const daily = await ctx.db
        .query("dailyScanCounts")
        .withIndex("by_dynamicLinkId_and_dateKey", (q) =>
          q.eq("dynamicLinkId", link._id).eq("dateKey", key),
        )
        .unique();
      if (daily) {
        await ctx.db.patch(daily._id, { count: daily.count + 1, updatedAt: scannedAt });
      } else {
        await ctx.db.insert("dailyScanCounts", {
          dynamicLinkId: link._id,
          dateKey: key,
          count: 1,
          updatedAt: scannedAt,
        });
      }
    }

    return { status: "available" as const, destinationUrl: link.destinationUrl };
  },
});
