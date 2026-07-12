import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { isSafeGoogleReviewDestination, requireSlug } from "./lib/validation";

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
    if (!isSafeGoogleReviewDestination(link.destinationUrl)) {
      return { status: "invalid_destination" as const };
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
      scannedAt,
      ...(args.deviceCategory ? { deviceCategory: args.deviceCategory } : {}),
      ...(safeReferrer ? { referrerHost: safeReferrer } : {}),
    });
    await ctx.db.patch("dynamicLinks", link._id, {
      scanCount: link.scanCount + 1,
      updatedAt: scannedAt,
    });

    return { status: "available" as const, destinationUrl: link.destinationUrl };
  },
});
