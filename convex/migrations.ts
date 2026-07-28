import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_ACCENT, DEFAULT_ACCENT_TOKENS, googleReviewSlug } from "../lib/scanme-links";
import {
  legacyScanMeDesign,
  normalizeScanMeDesign,
} from "../lib/scanme-design";
import { canonicalBusinessSlugs } from "../lib/business-slug";
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
          draftDesignState: "ready",
          draftDesign: legacyScanMeDesign({
            accent: DEFAULT_ACCENT,
            accentTokens: DEFAULT_ACCENT_TOKENS,
          }),
          draftDescription: "",
          draftPaletteAnalysis: {
            original: [DEFAULT_ACCENT],
            adjusted: [DEFAULT_ACCENT],
            correctedRoles: [],
          },
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
          draftPresentation: "button",
          publishedLabel: "Google Review",
          publishedUrl: legacy.destinationUrl,
          publishedIconKey: "link",
          publishedOrder: 0,
          publishedState: valid ? "active" : "inactive",
          publishedPresentation: "button",
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

type CanonicalIdentityCtx = QueryCtx | MutationCtx;

type CanonicalIdentityState = {
  business: Doc<"businesses">;
  slug: string;
  reviewSlug: string;
  linksProfile: Doc<"serviceProfiles">;
  reviewProfile: Doc<"serviceProfiles">;
  primaryLink: Doc<"dynamicLinks">;
  configs: Doc<"scanMeLinksConfigs">[];
  drift: string[];
};

type AllowedMigrationSlugOwner = {
  businessId: Id<"businesses">;
  dynamicLinkId?: Id<"dynamicLinks">;
  serviceProfileId: Id<"serviceProfiles">;
};

async function migrationSlugHasCollision(
  ctx: CanonicalIdentityCtx,
  slug: string,
  allowed: AllowedMigrationSlugOwner,
) {
  const [businesses, links, linkAliases, profiles, profileAliases] = await Promise.all([
    ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(10),
    ctx.db
      .query("dynamicLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(10),
    ctx.db
      .query("dynamicLinkAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(10),
    ctx.db
      .query("serviceProfiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(10),
    ctx.db
      .query("serviceSlugAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(10),
  ]);

  return (
    businesses.some((row) => row._id !== allowed.businessId) ||
    links.some((row) => row._id !== allowed.dynamicLinkId) ||
    linkAliases.some((row) => row.dynamicLinkId !== allowed.dynamicLinkId) ||
    profiles.some((row) => row._id !== allowed.serviceProfileId) ||
    profileAliases.some((row) => row.serviceProfileId !== allowed.serviceProfileId)
  );
}

async function inspectCanonicalBusinessIdentity(ctx: CanonicalIdentityCtx) {
  const businesses = await ctx.db.query("businesses").order("asc").take(101);
  if (businesses.length > 100) {
    return {
      states: [] as CanonicalIdentityState[],
      checked: 100,
      problems: [
        "Migracija je ograničena na najviše 100 lokala. Podelite migraciju pre pokretanja.",
      ],
    };
  }

  const states: CanonicalIdentityState[] = [];
  const problems: string[] = [];
  for (const business of businesses) {
    let slug: string;
    let reviewSlug: string;
    try {
      ({ slug, reviewSlug } = canonicalBusinessSlugs(business.name));
    } catch (error) {
      problems.push(
        `${business.name}: ${error instanceof Error ? error.message : "slug nije ispravan."}`,
      );
      continue;
    }

    const profiles = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .take(10);
    const linksProfiles = profiles.filter((profile) => profile.type === "scanme_links");
    const reviewProfiles = profiles.filter((profile) => profile.type === "google_review");
    const reviewLinks = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", business._id).eq("type", "google_review"),
      )
      .order("desc")
      .take(20);
    const primaryLink = selectPrimaryLink(reviewLinks);
    if (linksProfiles.length !== 1 || reviewProfiles.length !== 1 || !primaryLink) {
      problems.push(
        `${business.name}: očekivani su po jedan ScanMe Links i Google Review profil i primarni QR link.`,
      );
      continue;
    }

    const linksProfile = linksProfiles[0];
    const reviewProfile = reviewProfiles[0];
    const configs = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", linksProfile._id),
      )
      .take(10);
    if (
      await migrationSlugHasCollision(ctx, slug, {
        businessId: business._id,
        serviceProfileId: linksProfile._id,
        // A legacy Google link may still use the old base slug and will move.
        dynamicLinkId: primaryLink._id,
      })
    ) {
      problems.push(`${business.name}: ciljna adresa "${slug}" ima koliziju.`);
    }
    if (
      await migrationSlugHasCollision(ctx, reviewSlug, {
        businessId: business._id,
        serviceProfileId: reviewProfile._id,
        dynamicLinkId: primaryLink._id,
      })
    ) {
      problems.push(`${business.name}: ciljna adresa "${reviewSlug}" ima koliziju.`);
    }

    const drift: string[] = [];
    if (business.slug !== slug) drift.push("business slug");
    if (linksProfile.slug !== slug) drift.push("ScanMe Links slug");
    if (reviewProfile.slug !== reviewSlug) drift.push("Google Review slug");
    if (primaryLink.slug !== reviewSlug) drift.push("primarni QR slug");
    if (
      configs.some(
        (config) =>
          config.draftDisplayName !== business.name ||
          config.publishedDisplayName !== business.name,
      )
    ) {
      drift.push("legacy kopija naziva");
    }
    states.push({
      business,
      slug,
      reviewSlug,
      linksProfile,
      reviewProfile,
      primaryLink,
      configs,
      drift,
    });
  }
  return { states, checked: businesses.length, problems };
}

async function ensureMigrationServiceAlias(
  ctx: MutationCtx,
  slug: string,
  serviceProfileId: Id<"serviceProfiles">,
  createdAt: number,
) {
  const aliases = await ctx.db
    .query("serviceSlugAliases")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(10);
  if (aliases.some((alias) => alias.serviceProfileId !== serviceProfileId)) {
    throw new Error(`Alias "${slug}" pripada drugom servisu.`);
  }
  if (aliases.some((alias) => alias.serviceProfileId === serviceProfileId)) {
    return 0;
  }
  await ctx.db.insert("serviceSlugAliases", { slug, serviceProfileId, createdAt });
  return 1;
}

async function ensureMigrationLinkAlias(
  ctx: MutationCtx,
  slug: string,
  dynamicLinkId: Id<"dynamicLinks">,
  createdAt: number,
) {
  const aliases = await ctx.db
    .query("dynamicLinkAliases")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(10);
  if (aliases.some((alias) => alias.dynamicLinkId !== dynamicLinkId)) {
    throw new Error(`QR alias "${slug}" pripada drugom linku.`);
  }
  if (aliases.some((alias) => alias.dynamicLinkId === dynamicLinkId)) {
    return 0;
  }
  await ctx.db.insert("dynamicLinkAliases", { slug, dynamicLinkId, createdAt });
  return 1;
}

async function promoteMigrationServiceAlias(
  ctx: MutationCtx,
  slug: string,
  serviceProfileId: Id<"serviceProfiles">,
) {
  const aliases = await ctx.db
    .query("serviceSlugAliases")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(10);
  let deleted = 0;
  for (const alias of aliases) {
    if (alias.serviceProfileId === serviceProfileId) {
      await ctx.db.delete(alias._id);
      deleted += 1;
    }
  }
  return deleted;
}

async function promoteMigrationLinkAlias(
  ctx: MutationCtx,
  slug: string,
  dynamicLinkId: Id<"dynamicLinks">,
) {
  const aliases = await ctx.db
    .query("dynamicLinkAliases")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(10);
  let deleted = 0;
  for (const alias of aliases) {
    if (alias.dynamicLinkId === dynamicLinkId) {
      await ctx.db.delete(alias._id);
      deleted += 1;
    }
  }
  return deleted;
}

async function migrateCanonicalState(ctx: MutationCtx, state: CanonicalIdentityState) {
  const {
    business,
    slug,
    reviewSlug,
    linksProfile,
    reviewProfile,
    primaryLink,
    configs,
  } = state;
  const now = Date.now();
  let changes = 0;

  changes += await promoteMigrationServiceAlias(ctx, slug, linksProfile._id);
  changes += await promoteMigrationServiceAlias(ctx, reviewSlug, reviewProfile._id);
  changes += await promoteMigrationLinkAlias(ctx, reviewSlug, primaryLink._id);

  for (const oldSlug of new Set([business.slug, linksProfile.slug])) {
    if (oldSlug !== slug) {
      changes += await ensureMigrationServiceAlias(ctx, oldSlug, linksProfile._id, now);
    }
  }
  for (const oldSlug of new Set([reviewProfile.slug, primaryLink.slug])) {
    if (oldSlug !== reviewSlug && oldSlug !== slug) {
      changes += await ensureMigrationServiceAlias(ctx, oldSlug, reviewProfile._id, now);
    }
  }
  if (primaryLink.slug !== reviewSlug) {
    changes += await ensureMigrationLinkAlias(ctx, primaryLink.slug, primaryLink._id, now);
  }

  if (business.slug !== slug) {
    await ctx.db.patch(business._id, { slug });
    changes += 1;
  }
  if (linksProfile.slug !== slug) {
    await ctx.db.patch(linksProfile._id, { slug, updatedAt: now });
    changes += 1;
  }
  if (reviewProfile.slug !== reviewSlug) {
    await ctx.db.patch(reviewProfile._id, { slug: reviewSlug, updatedAt: now });
    changes += 1;
  }
  if (primaryLink.slug !== reviewSlug) {
    await ctx.db.patch(primaryLink._id, { slug: reviewSlug, updatedAt: now });
    changes += 1;
  }
  for (const config of configs) {
    if (
      config.draftDisplayName !== business.name ||
      config.publishedDisplayName !== business.name
    ) {
      await ctx.db.patch(config._id, {
        draftDisplayName: business.name,
        publishedDisplayName: business.name,
      });
      changes += 1;
    }
  }
  return changes;
}

export const auditCanonicalBusinessIdentity = internalQuery({
  args: {},
  handler: async (ctx) => {
    const audit = await inspectCanonicalBusinessIdentity(ctx);
    return {
      checked: audit.checked,
      ok: audit.problems.length === 0,
      needsMigration: audit.states.filter((state) => state.drift.length > 0).length,
      problems: audit.problems,
    };
  },
});

export const migrateCanonicalBusinessIdentity = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const audit = await inspectCanonicalBusinessIdentity(ctx);
    if (audit.problems.length > 0) {
      throw new Error(
        `Migracija nije bezbedna: ${audit.problems.slice(0, 5).join(" | ")}`,
      );
    }
    if (args.dryRun) {
      return {
        checked: audit.checked,
        migrated: false,
        changes: 0,
        needsMigration: audit.states.filter((state) => state.drift.length > 0).length,
      };
    }

    let changes = 0;
    for (const state of audit.states) {
      changes += await migrateCanonicalState(ctx, state);
    }
    return {
      checked: audit.checked,
      migrated: true,
      changes,
      needsMigration: audit.states.filter((state) => state.drift.length > 0).length,
    };
  },
});

export const verifyCanonicalBusinessIdentity = internalQuery({
  args: {},
  handler: async (ctx) => {
    const audit = await inspectCanonicalBusinessIdentity(ctx);
    const drift = audit.states.flatMap((state) =>
      state.drift.map((item) => `${state.business.name}: ${item} nije kanonski.`),
    );
    const problems = [...audit.problems, ...drift];
    return {
      checked: audit.checked,
      ok: problems.length === 0,
      problems,
    };
  },
});

const MAX_SCANME_DESIGN_MIGRATION_ROWS = 100;

function boundedMigrationLimit(rawLimit: number | undefined) {
  const limit = rawLimit ?? MAX_SCANME_DESIGN_MIGRATION_ROWS;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_SCANME_DESIGN_MIGRATION_ROWS
  ) {
    throw new Error("Limit migracije mora biti između 1 i 100.");
  }
  return limit;
}

type ScanMeDesignMigrationConfig = {
  config: Doc<"scanMeLinksConfigs">;
  draftDesign: ReturnType<typeof legacyScanMeDesign> | null;
  publishedDesign: ReturnType<typeof legacyScanMeDesign> | null;
  needsConfigUpdate: boolean;
  destinations: Doc<"serviceDestinations">[];
};

async function inspectScanMeDesignV1(
  ctx: QueryCtx | MutationCtx,
  rawLimit: number | undefined,
) {
  const limit = boundedMigrationLimit(rawLimit);
  const rows = await ctx.db
    .query("scanMeLinksConfigs")
    .order("asc")
    .take(limit + 1);
  const configs = rows.slice(0, limit);
  const plans: ScanMeDesignMigrationConfig[] = [];
  const problems: string[] = [];

  for (const config of configs) {
    const explicitUninitialized =
      config.draftDesignState === "uninitialized";
    let draftDesign = config.draftDesign ?? null;
    let publishedDesign = config.publishedDesign ?? null;
    try {
      if (draftDesign) {
        draftDesign = normalizeScanMeDesign(draftDesign).design;
      } else if (!explicitUninitialized) {
        draftDesign = legacyScanMeDesign({
          accent: config.draftAccent,
          accentTokens: config.draftAccentTokens,
        });
      }
      if (publishedDesign) {
        publishedDesign = normalizeScanMeDesign(publishedDesign).design;
      } else if (config.publishedTemplateKey) {
        publishedDesign = legacyScanMeDesign({
          accent: config.publishedAccent ?? DEFAULT_ACCENT,
          accentTokens:
            config.publishedAccentTokens ?? DEFAULT_ACCENT_TOKENS,
        });
      }
    } catch (error) {
      problems.push(
        `${config._id}: ${
          error instanceof Error ? error.message : "dizajn nije ispravan"
        }`,
      );
      continue;
    }
    if (explicitUninitialized && config.draftDesign) {
      problems.push(
        `${config._id}: uninitialized konfiguracija već sadrži draft dizajn.`,
      );
      continue;
    }

    const destinations = await ctx.db
      .query("serviceDestinations")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", config.serviceProfileId),
      )
      .take(101);
    if (destinations.length > 100) {
      problems.push(
        `${config._id}: profil ima više od 100 destinacija i zahteva batch migraciju.`,
      );
      continue;
    }
    const needsConfigUpdate =
      (!explicitUninitialized &&
        (config.draftDesignState !== "ready" || !config.draftDesign)) ||
      Boolean(config.publishedTemplateKey && !config.publishedDesign) ||
      (!explicitUninitialized && config.draftDescription === undefined) ||
      (!explicitUninitialized && config.draftPaletteAnalysis === undefined) ||
      Boolean(
        config.publishedTemplateKey &&
          config.publishedDescription === undefined,
      ) ||
      Boolean(
        config.publishedTemplateKey &&
          config.publishedPaletteAnalysis === undefined,
      );
    plans.push({
      config,
      draftDesign,
      publishedDesign,
      needsConfigUpdate,
      destinations,
    });
  }
  return {
    plans,
    checked: configs.length,
    truncated: rows.length > limit,
    problems,
  };
}

export const auditScanMeDesignV1 = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const audit = await inspectScanMeDesignV1(ctx, args.limit);
    const destinationsNeedingMigration = audit.plans.reduce(
      (total, plan) =>
        total +
        plan.destinations.filter(
          (destination) =>
            !destination.draftPresentation ||
            (destination.publishedState &&
              !destination.publishedPresentation),
        ).length,
      0,
    );
    return {
      checked: audit.checked,
      truncated: audit.truncated,
      ok: audit.problems.length === 0,
      configsNeedingMigration: audit.plans.filter(
        (plan) => plan.needsConfigUpdate,
      ).length,
      destinationsNeedingMigration,
      problems: audit.problems,
    };
  },
});

export const migrateScanMeDesignV1 = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const audit = await inspectScanMeDesignV1(ctx, args.limit);
    if (audit.problems.length) {
      throw new Error(
        `Migracija nije bezbedna: ${audit.problems.slice(0, 5).join(" | ")}`,
      );
    }
    let configsChanged = 0;
    let destinationsChanged = 0;
    for (const plan of audit.plans) {
      if (plan.needsConfigUpdate) {
        configsChanged += 1;
        if (!args.dryRun) {
          const draftAccent = plan.draftDesign?.colors.accent ?? DEFAULT_ACCENT;
          const publishedAccent =
            plan.publishedDesign?.colors.accent ?? DEFAULT_ACCENT;
          await ctx.db.patch(plan.config._id, {
            ...(plan.draftDesign
              ? {
                  draftDesignState: "ready" as const,
                  draftDesign: plan.draftDesign,
                  draftDescription: plan.config.draftDescription ?? "",
                  draftPaletteAnalysis:
                    plan.config.draftPaletteAnalysis ?? {
                      original: [draftAccent],
                      adjusted: [draftAccent],
                      correctedRoles: [],
                    },
                }
              : {}),
            ...(plan.publishedDesign
              ? {
                  publishedDesign: plan.publishedDesign,
                  publishedDescription:
                    plan.config.publishedDescription ?? "",
                  publishedPaletteAnalysis:
                    plan.config.publishedPaletteAnalysis ?? {
                      original: [publishedAccent],
                      adjusted: [publishedAccent],
                      correctedRoles: [],
                    },
                }
              : {}),
          });
        }
      }
      for (const destination of plan.destinations) {
        const needsDraft = !destination.draftPresentation;
        const needsPublished =
          Boolean(destination.publishedState) &&
          !destination.publishedPresentation;
        if (!needsDraft && !needsPublished) continue;
        destinationsChanged += 1;
        if (!args.dryRun) {
          await ctx.db.patch(destination._id, {
            ...(needsDraft ? { draftPresentation: "button" as const } : {}),
            ...(needsPublished
              ? { publishedPresentation: "button" as const }
              : {}),
          });
        }
      }
    }
    return {
      checked: audit.checked,
      truncated: audit.truncated,
      dryRun: args.dryRun ?? false,
      configsChanged,
      destinationsChanged,
    };
  },
});

export const verifyScanMeDesignV1 = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const audit = await inspectScanMeDesignV1(ctx, args.limit);
    const problems = [...audit.problems];
    for (const plan of audit.plans) {
      if (plan.needsConfigUpdate) {
        problems.push(`${plan.config._id}: V1 design nije migriran.`);
      }
      if (
        plan.destinations.some(
          (destination) =>
            !destination.draftPresentation ||
            (destination.publishedState &&
              !destination.publishedPresentation),
        )
      ) {
        problems.push(
          `${plan.config._id}: presentation polja destinacija nisu migrirana.`,
        );
      }
    }
    return {
      checked: audit.checked,
      truncated: audit.truncated,
      ok: problems.length === 0 && !audit.truncated,
      problems,
    };
  },
});
