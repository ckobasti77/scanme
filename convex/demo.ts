import { v } from "convex/values";
import { env, mutation } from "./_generated/server";
import { isSafeGoogleReviewDestination } from "./lib/validation";

const DEMO_DESTINATION =
  "https://search.google.com/local/writereview?placeid=DEMO_PLACE_ID";

export const seed = mutation({
  args: { setupKey: v.string() },
  returns: v.object({
    activeSlug: v.string(),
    inactiveSlug: v.string(),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const configuredKey = env.SCANME_DEMO_SETUP_KEY;
    if (!configuredKey || args.setupKey !== configuredKey || configuredKey.length < 16) {
      throw new Error("Demo podešavanje nije dozvoljeno.");
    }
    if (!isSafeGoogleReviewDestination(DEMO_DESTINATION)) {
      throw new Error("Demo odredište nije bezbedno.");
    }

    const activeSlug = "primer-review";
    const inactiveSlug = "primer-neaktivan";
    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", "scanme-primer"))
      .unique();

    if (existing) {
      return { activeSlug, inactiveSlug, created: false };
    }

    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "ScanMe primer",
      slug: "scanme-primer",
      status: "demo",
      createdAt: now,
    });

    await ctx.db.insert("dynamicLinks", {
      businessId,
      slug: activeSlug,
      destinationUrl: DEMO_DESTINATION,
      type: "google_review",
      active: true,
      scanCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("dynamicLinks", {
      businessId,
      slug: inactiveSlug,
      destinationUrl: DEMO_DESTINATION,
      type: "google_review",
      active: false,
      scanCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { activeSlug, inactiveSlug, created: true };
  },
});
