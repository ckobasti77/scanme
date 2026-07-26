import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DEFAULT_ACCENT, DEFAULT_ACCENT_TOKENS, googleReviewSlug } from "../lib/scanme-links";
import { isSafePublicDestination } from "./lib/validation";

function selectPrimaryLink(links: Doc<"dynamicLinks">[]) {
  return links.reduce<Doc<"dynamicLinks"> | null>((selected, link) => {
    if (!selected) return link;
    if (link.active !== selected.active) return link.active ? link : selected;
    return link.updatedAt > selected.updatedAt ? link : selected;
  }, null);
}

export const migrateLegacyServices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").order("asc").take(100);
    let createdProfiles = 0;
    let migratedEvents = 0;

    for (const business of businesses) {
      if (!business.archivedAt && business.status === "inactive") {
        await ctx.db.patch(business._id, { status: "active" });
      }
      let linksProfile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", business._id).eq("type", "scanme_links"),
        )
        .unique();
      if (!linksProfile) {
        const collision = await ctx.db
          .query("serviceProfiles")
          .withIndex("by_slug", (q) => q.eq("slug", business.slug))
          .unique();
        if (collision) {
          throw new Error(`ScanMe Links slug kolizija: ${business.slug}`);
        }
        const now = Date.now();
        const id = await ctx.db.insert("serviceProfiles", {
          businessId: business._id,
          type: "scanme_links",
          slug: business.slug,
          status: "inactive",
          totalScans: 0,
          totalPageViews: 0,
          totalConvertedSessions: 0,
          createdAt: now,
          updatedAt: now,
        });
        linksProfile = await ctx.db.get(id);
        await ctx.db.insert("scanMeLinksConfigs", {
          serviceProfileId: id,
          draftDisplayName: business.name,
          draftTemplateKey: "option-two",
          draftBackgroundKey: "warm-ivory",
          draftPalette: [DEFAULT_ACCENT],
          draftAccent: DEFAULT_ACCENT,
          draftAccentTokens: DEFAULT_ACCENT_TOKENS,
          hasUnpublishedChanges: true,
          draftRevision: 1,
          publishedRevision: 0,
          updatedAt: now,
        });
        createdProfiles += 1;
      }

      const legacyLinks = await ctx.db
        .query("dynamicLinks")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", business._id).eq("type", "google_review"),
        )
        .take(20);
      const legacy = selectPrimaryLink(legacyLinks);
      const reviewSlug = googleReviewSlug(business.slug);
      let reviewProfile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", business._id).eq("type", "google_review"),
        )
        .unique();
      if (!reviewProfile) {
        const collision = await ctx.db
          .query("serviceProfiles")
          .withIndex("by_slug", (q) => q.eq("slug", reviewSlug))
          .unique();
        if (collision) throw new Error(`Google Review slug kolizija: ${reviewSlug}`);
        const now = Date.now();
        const id = await ctx.db.insert("serviceProfiles", {
          businessId: business._id,
          type: "google_review",
          slug: reviewSlug,
          status:
            legacy?.active && !business.archivedAt ? "active" : "inactive",
          totalScans: legacy?.scanCount ?? 0,
          totalPageViews: 0,
          totalConvertedSessions: 0,
          createdAt: now,
          updatedAt: now,
        });
        reviewProfile = await ctx.db.get(id);
        createdProfiles += 1;
      }
      if (!reviewProfile) continue;

      let destination: Doc<"serviceDestinations"> | null = (
        await ctx.db
          .query("serviceDestinations")
          .withIndex("by_serviceProfileId", (q) =>
            q.eq("serviceProfileId", reviewProfile!._id),
          )
          .take(2)
      )[0] ?? null;
      if (!destination && legacy) {
        const valid = isSafePublicDestination(legacy.destinationUrl);
        const id = await ctx.db.insert("serviceDestinations", {
          serviceProfileId: reviewProfile._id,
          kind: "custom",
          totalClicks: 0,
          totalDirectVisits: legacy.scanCount,
          draftLabel: "Google Review",
          draftUrl: legacy.destinationUrl,
          draftIconKey: "link",
          draftOrder: 0,
          draftState: valid ? "active" : "inactive",
          publishedLabel: "Google Review",
          publishedUrl: legacy.destinationUrl,
          publishedIconKey: "link",
          publishedOrder: 0,
          publishedState: valid ? "active" : "inactive",
          createdAt: legacy.createdAt,
          updatedAt: legacy.updatedAt,
        });
        destination = await ctx.db.get(id);
      }
      if (!legacy || !destination) continue;

      const dailyRows = await ctx.db
        .query("dailyScanCounts")
        .withIndex("by_dynamicLinkId_and_dateKey", (q) =>
          q.eq("dynamicLinkId", legacy._id),
        )
        .take(10000);
      for (const row of dailyRows) {
        const existing = await ctx.db
          .query("dailyServiceMetrics")
          .withIndex("by_serviceProfileId_and_dateKey", (q) =>
            q.eq("serviceProfileId", reviewProfile!._id).eq("dateKey", row.dateKey),
          )
          .unique();
        if (!existing) {
          await ctx.db.insert("dailyServiceMetrics", {
            serviceProfileId: reviewProfile._id,
            dateKey: row.dateKey,
            scans: row.count,
            pageViews: 0,
            convertedSessions: 0,
            updatedAt: row.updatedAt,
          });
        }
        const destinationDaily = await ctx.db
          .query("dailyDestinationMetrics")
          .withIndex("by_destinationId_and_dateKey", (q) =>
            q.eq("destinationId", destination!._id).eq("dateKey", row.dateKey),
          )
          .unique();
        if (!destinationDaily) {
          await ctx.db.insert("dailyDestinationMetrics", {
            destinationId: destination._id,
            dateKey: row.dateKey,
            clicks: 0,
            directVisits: row.count,
            updatedAt: row.updatedAt,
          });
        }
      }

      const events = await ctx.db
        .query("scanEvents")
        .withIndex("by_dynamicLinkId_and_scannedAt", (q) =>
          q.eq("dynamicLinkId", legacy._id),
        )
        .take(1000);
      for (const event of events) {
        if (!event.requestId) continue;
        const existing = await ctx.db
          .query("serviceScanEvents")
          .withIndex("by_requestId", (q) => q.eq("requestId", event.requestId!))
          .unique();
        if (existing) continue;
        await ctx.db.insert("serviceScanEvents", {
          serviceProfileId: reviewProfile._id,
          requestId: event.requestId,
          scannedAt: event.scannedAt,
          mode: "direct",
          directDestinationId: destination._id,
          ...(event.deviceCategory ? { deviceCategory: event.deviceCategory } : {}),
          ...(event.referrerHost ? { referrerHost: event.referrerHost } : {}),
        });
        migratedEvents += 1;
      }
    }

    return { businesses: businesses.length, createdProfiles, migratedEvents };
  },
});

export const verifyLegacyServices = internalQuery({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").order("asc").take(100);
    const problems: string[] = [];
    for (const business of businesses) {
      const profiles = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .take(10);
      if (profiles.filter((profile) => profile.type === "scanme_links").length !== 1) {
        problems.push(`${business.name}: ScanMe Links profil nije jedinstven.`);
      }
      if (profiles.filter((profile) => profile.type === "google_review").length !== 1) {
        problems.push(`${business.name}: Google Review profil nije jedinstven.`);
      }
    }
    return { checked: businesses.length, ok: problems.length === 0, problems };
  },
});
