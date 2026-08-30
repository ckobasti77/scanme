import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { isAdminEmail, requireAdmin } from "./lib/access";
import { upsertManualEntitlement } from "./lib/entitlements";
import { buildBusinessContactViews } from "./lib/contacts";
import { aggregateMetricRowsForRange, getMetricRows, metricsRangeConfig } from "./lib/metrics";
import { isSafePublicDestination, normalizeEmail, normalizePhone, requireSlug, requireText } from "./lib/validation";
import {
  DEFAULT_ACCENT,
  DEFAULT_ACCENT_TOKENS,
  googleReviewSlug,
  slugify,
  SLUG_MAX_LENGTH,
} from "../lib/scanme-links";

const INVITATION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
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
  return Array.from({ length: days }, (_, index) =>
    dateKey(Date.now() - index * 24 * 60 * 60 * 1000),
  );
}

function selectPrimaryLink(links: Doc<"dynamicLinks">[]) {
  return links.reduce<Doc<"dynamicLinks"> | null>((selected, link) => {
    if (!selected) return link;
    if (link.active !== selected.active) return link.active ? link : selected;
    return link.updatedAt > selected.updatedAt ? link : selected;
  }, null);
}

const contactArgs = {
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  phone: v.string(),
  positionTitle: v.string(),
};

function normalizeOptionalEmail(value: string) {
  const email = value.trim();
  return email ? normalizeEmail(email) : "";
}

function normalizeOptionalPhone(value: string) {
  const phone = value.trim();
  return phone ? normalizePhone(phone) : "";
}

function normalizeOptionalPosition(value: string) {
  return value.trim() ? requireText(value, "Uloga", 2, 80) : "";
}

async function createContactAndInvitation(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  contact: { firstName: string; lastName: string; email: string; phone: string; positionTitle: string },
  { sendInvitation = true }: { sendInvitation?: boolean } = {},
) {
  const now = Date.now();
  const normalizedEmail = normalizeOptionalEmail(contact.email);
  const contactId = await ctx.db.insert("businessContacts", {
    businessId,
    firstName: requireText(contact.firstName, "Ime", 2, 80),
    lastName: requireText(contact.lastName, "Prezime", 2, 80),
    normalizedEmail,
    phone: normalizeOptionalPhone(contact.phone),
    positionTitle: normalizeOptionalPosition(contact.positionTitle),
    status: "invited",
    createdAt: now,
    updatedAt: now,
  });
  if (!normalizedEmail) return { contactId, invitationId: null };
  const invitationId = await ctx.db.insert("businessInvitations", {
    businessId,
    contactId,
    normalizedEmail,
    tokenHash: "",
    status: "queued",
    expiresAt: now + INVITATION_LIFETIME,
    createdAt: now,
    updatedAt: now,
  });
  if (sendInvitation) {
    await ctx.scheduler.runAfter(0, internal.invitationEmails.sendInvitation, { invitationId });
  }
  return { contactId, invitationId };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { authenticated: false as const, isAdmin: false, email: null };
    const user = await ctx.db.get(userId);
    const email = user?.email?.toLowerCase() ?? null;
    return { authenticated: true as const, isAdmin: isAdminEmail(email ?? undefined), email };
  },
});

export const listBusinesses = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const businesses = await ctx.db.query("businesses").order("desc").take(100);
    return await Promise.all(
      businesses.map(async (business) => {
        const links = await ctx.db
          .query("dynamicLinks")
          .withIndex("by_businessId_and_type", (q) =>
            q.eq("businessId", business._id).eq("type", "google_review"),
          )
          .order("desc")
          .take(20);
        const link = selectPrimaryLink(links);
        const { contact, contacts, invitation } = await buildBusinessContactViews(
          ctx,
          business._id,
        );
        const reviewProfile = await ctx.db
          .query("serviceProfiles")
          .withIndex("by_businessId_and_type", (q) =>
            q.eq("businessId", business._id).eq("type", "google_review"),
          )
          .unique();
        return {
          id: business._id,
          name: business.name,
          clientPanelSlug: business.slug,
          status: reviewProfile?.status === "active" ? "active" : "inactive",
          archivedAt: business.archivedAt ?? null,
          createdAt: business.createdAt,
          link: link
            ? {
                id: link._id,
                slug: link.slug,
                destinationUrl: link.destinationUrl,
                active: link.active,
                scanCount: link.scanCount,
                updatedAt: link.updatedAt,
              }
            : null,
          contact,
          contacts,
          invitation,
        };
      }),
    );
  },
});

export const createBusiness = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    destinationUrl: v.string(),
    contacts: v.optional(v.array(v.object(contactArgs))),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    positionTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = requireText(args.name, "Naziv lokala", 2, 120);
    const slug = requireSlug(args.slug);
    if (slug.length > 66) {
      throw new ConvexError(
        "Osnovni slug može imati najviše 66 karaktera da bi izvedena Google Review adresa ostala važeća.",
      );
    }
    const reviewSlug = googleReviewSlug(slug);
    const destinationUrl = args.destinationUrl.trim();
    if (destinationUrl && !isSafePublicDestination(destinationUrl)) {
      throw new ConvexError("Destinacija mora biti bezbedan javni HTTPS link.");
    }
    const existingLink = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_slug", (q) => q.eq("slug", reviewSlug))
      .unique();
    if (existingLink) throw new ConvexError("Ovaj QR slug se već koristi.");
    const existingAlias = await ctx.db
      .query("dynamicLinkAliases")
      .withIndex("by_slug", (q) => q.eq("slug", reviewSlug))
      .unique();
    if (existingAlias) throw new ConvexError("Ovaj QR slug je sačuvan za ranije odštampanu adresu.");
    const existingBusiness = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existingBusiness) throw new ConvexError("Oznaka lokala se već koristi.");

    const existingLinksProfile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    const existingReviewProfile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_slug", (q) => q.eq("slug", reviewSlug))
      .unique();
    if (existingLinksProfile || existingReviewProfile) {
      throw new ConvexError("Ovaj servisni slug se već koristi.");
    }

    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name,
      slug,
      status: "active",
      createdAt: now,
    });
    const linkId = await ctx.db.insert("dynamicLinks", {
      businessId,
      slug: reviewSlug,
      destinationUrl,
      type: "google_review",
      active: false,
      scanCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const scanMeLinksProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_links",
      slug,
      status: "inactive",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("scanMeLinksConfigs", {
      serviceProfileId: scanMeLinksProfileId,
      draftDisplayName: name,
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
    const googleReviewProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "google_review",
      slug: reviewSlug,
      status: "inactive",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("serviceDestinations", {
      serviceProfileId: googleReviewProfileId,
      kind: "custom",
      totalClicks: 0,
      totalDirectVisits: 0,
      draftLabel: "Google Review",
      draftUrl: destinationUrl,
      draftIconKey: "link",
      draftOrder: 0,
      draftState: destinationUrl ? "active" : "inactive",
      publishedLabel: "Google Review",
      publishedUrl: destinationUrl,
      publishedIconKey: "link",
      publishedOrder: 0,
      publishedState: destinationUrl ? "active" : "inactive",
      createdAt: now,
      updatedAt: now,
    });
    const legacyContact = args.firstName || args.lastName || args.email || args.phone || args.positionTitle
      ? {
          firstName: args.firstName ?? "",
          lastName: args.lastName ?? "",
          email: args.email ?? "",
          phone: args.phone ?? "",
          positionTitle: args.positionTitle ?? "",
        }
      : null;
    const contacts = args.contacts?.length ? args.contacts : legacyContact ? [legacyContact] : [];
    const invitations = [];
    for (const contact of contacts) {
      invitations.push(await createContactAndInvitation(ctx, businessId, contact, { sendInvitation: false }));
    }
    return {
      businessId,
      linkId,
      scanMeLinksProfileId,
      googleReviewProfileId,
      invitationId: invitations[0]?.invitationId ?? null,
      invitationIds: invitations.map(({ invitationId }) => invitationId),
    };
  },
});

export const getBusinessMetrics = query({
  args: {
    businessId: v.id("businesses"),
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
    summaryRange: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const links = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", "google_review"),
      )
      .order("desc")
      .take(20);
    const link = selectPrimaryLink(links);
    if (!link) return null;
    const range = args.range ?? "7d";
    const summaryRange = args.summaryRange ?? range;
    const config = metricsRangeConfig[range];
    const summaryConfig = metricsRangeConfig[summaryRange];
    const metricRows = await getMetricRows(ctx, link._id, range);
    const summaryRows = summaryRange === range ? metricRows : await getMetricRows(ctx, link._id, summaryRange);
    const recent = (
      await ctx.db
        .query("scanEvents")
        .withIndex("by_dynamicLinkId_and_scannedAt", (q) => q.eq("dynamicLinkId", link._id))
        .order("desc")
        .take(30)
    )
      .filter((event) => event.deviceCategory !== "bot")
      .slice(0, 20);
    const last7Keys = new Set(lastDateKeys(7));
    const last7Days = metricRows
      .filter((row) => last7Keys.has(row.dateKey))
      .reduce((sum, row) => sum + row.count, 0);
    const todayKey = dateKey(Date.now());
    return {
      total: link.scanCount,
      today: metricRows.find((row) => row.dateKey === todayKey)?.count ?? 0,
      last7Days,
      periodTotal: range === "all" ? link.scanCount : metricRows.reduce((sum, row) => sum + row.count, 0),
      range,
      rangeLabel: config.label,
      summaryRange,
      summaryRangeLabel: summaryConfig.label,
      summaryPeriodTotal: summaryRange === "all" ? link.scanCount : summaryRows.reduce((sum, row) => sum + row.count, 0),
      daily: aggregateMetricRowsForRange(metricRows, range),
      recent: recent.map((event) => ({
        id: event._id,
        scannedAt: event.scannedAt,
        deviceCategory: event.deviceCategory ?? "unknown",
        referrerHost: event.referrerHost ?? null,
      })),
    };
  },
});

export const updateDestination = mutation({
  args: { linkId: v.id("dynamicLinks"), destinationUrl: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const legacyLink = await ctx.db.get(args.linkId);
    if (!legacyLink) throw new ConvexError("QR link nije pronađen.");
    if (!isSafePublicDestination(args.destinationUrl)) {
      throw new ConvexError("Destinacija mora biti bezbedan javni HTTPS link.");
    }
    await ctx.db.patch(args.linkId, {
      destinationUrl: args.destinationUrl.trim(),
      updatedAt: Date.now(),
    });
    const profile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", legacyLink.businessId).eq("type", "google_review"),
      )
      .unique();
    if (profile) {
      const destination = (
        await ctx.db
          .query("serviceDestinations")
          .withIndex("by_serviceProfileId", (q) =>
            q.eq("serviceProfileId", profile._id),
          )
          .take(1)
      )[0];
      if (destination) {
        await ctx.db.patch(destination._id, {
          draftUrl: args.destinationUrl.trim(),
          publishedUrl: args.destinationUrl.trim(),
          draftState: "active",
          publishedState: "active",
          updatedAt: Date.now(),
        });
      }
    }
    return { updated: true };
  },
});

// Re-slug a business's base slug and keep every derived slug in sync:
// businesses.slug, both serviceProfiles.slug (scanme_links = base, google_review =
// base-google-review), dynamicLinks.slug, plus alias rows for the vacated slugs so
// previously printed QR codes and saved service URLs keep resolving. This is the exact
// logic the `clientPanel` branch of `updateBusinessSlug` used inline; it is shared so a
// rename can perform the same sync.
async function applyBaseSlugSync(
  ctx: MutationCtx,
  params: {
    business: Doc<"businesses">;
    link: Doc<"dynamicLinks"> | null;
    linksProfile: Doc<"serviceProfiles"> | null;
    reviewProfile: Doc<"serviceProfiles"> | null;
    base: string;
  },
) {
  const { business, link, linksProfile, reviewProfile, base } = params;
  const reviewSlug = googleReviewSlug(base);
  const desiredSlugSet = new Set([base, reviewSlug]);
  const ownProfileIds = new Set(
    [linksProfile?._id, reviewProfile?._id].filter(
      (id): id is Id<"serviceProfiles"> => id !== undefined,
    ),
  );
  const now = Date.now();

  if (link && link.slug !== reviewSlug) {
    const oldAlias = await ctx.db
      .query("dynamicLinkAliases")
      .withIndex("by_slug", (q) => q.eq("slug", link.slug))
      .unique();
    if (!desiredSlugSet.has(link.slug) && !oldAlias) {
      await ctx.db.insert("dynamicLinkAliases", {
        slug: link.slug,
        dynamicLinkId: link._id,
        createdAt: now,
      });
    }
    const promotedAlias = await ctx.db
      .query("dynamicLinkAliases")
      .withIndex("by_slug", (q) => q.eq("slug", reviewSlug))
      .unique();
    if (promotedAlias?.dynamicLinkId === link._id) {
      await ctx.db.delete(promotedAlias._id);
    }
    await ctx.db.patch(link._id, { slug: reviewSlug, updatedAt: now });
  }

  for (const [profile, nextSlug] of [
    [linksProfile, base],
    [reviewProfile, reviewSlug],
  ] as const) {
    if (!profile || profile.slug === nextSlug) continue;
    const oldAlias = await ctx.db
      .query("serviceSlugAliases")
      .withIndex("by_slug", (q) => q.eq("slug", profile.slug))
      .unique();
    if (!desiredSlugSet.has(profile.slug) && !oldAlias) {
      await ctx.db.insert("serviceSlugAliases", {
        slug: profile.slug,
        serviceProfileId: profile._id,
        createdAt: now,
      });
    }
    const promotedAlias = await ctx.db
      .query("serviceSlugAliases")
      .withIndex("by_slug", (q) => q.eq("slug", nextSlug))
      .unique();
    if (promotedAlias && ownProfileIds.has(promotedAlias.serviceProfileId)) {
      await ctx.db.delete(promotedAlias._id);
    }
    await ctx.db.patch(profile._id, { slug: nextSlug, updatedAt: now });
  }

  await ctx.db.patch(business._id, { slug: base });
  return { qrSlug: reviewSlug, clientPanelSlug: base };
}

// Non-throwing collision check used by the rename auto-suffix path. Confirms both the
// base slug and its derived google_review slug are free across every table (ignoring the
// business's own rows).
async function isBaseSlugAvailable(
  ctx: MutationCtx,
  base: string,
  own: {
    businessId: Id<"businesses">;
    linkId: Id<"dynamicLinks"> | null;
    profileIds: Set<Id<"serviceProfiles">>;
  },
) {
  for (const slug of [base, googleReviewSlug(base)]) {
    const links = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (links.some((candidate) => candidate._id !== own.linkId)) return false;
    const businesses = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (businesses.some((candidate) => candidate._id !== own.businessId)) return false;
    const profiles = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (profiles.some((candidate) => !own.profileIds.has(candidate._id))) return false;
    const linkAliases = await ctx.db
      .query("dynamicLinkAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (linkAliases.some((candidate) => candidate.dynamicLinkId !== own.linkId)) return false;
    const serviceAliases = await ctx.db
      .query("serviceSlugAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (serviceAliases.some((candidate) => !own.profileIds.has(candidate.serviceProfileId)))
      return false;
  }
  return true;
}

// Derive an available base slug from the desired one, appending -2, -3, … on collision so
// a rename always succeeds (unlike manual slug edits, which surface the collision).
async function resolveAvailableBaseSlug(
  ctx: MutationCtx,
  desired: string,
  own: {
    businessId: Id<"businesses">;
    linkId: Id<"dynamicLinks"> | null;
    profileIds: Set<Id<"serviceProfiles">>;
  },
) {
  const trimBase = (value: string, max: number) =>
    value.slice(0, max).replace(/-+$/g, "");
  const primary = trimBase(desired, SLUG_MAX_LENGTH);
  if (primary && (await isBaseSlugAvailable(ctx, primary, own))) return primary;
  for (let counter = 2; counter < 1000; counter += 1) {
    const suffix = `-${counter}`;
    const candidate = `${trimBase(desired, SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
    if (await isBaseSlugAvailable(ctx, candidate, own)) return candidate;
  }
  throw new ConvexError("Ne mogu da napravim jedinstven slug za ovaj naziv.");
}

// When the ScanMe Links page title still mirrors the old business name (i.e. it was never
// customized in the editor), follow the rename. A client's intentionally customized title
// is left untouched.
async function syncLinksDisplayName(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  previousName: string,
  nextName: string,
) {
  const profile = await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", businessId).eq("type", "scanme_links"),
    )
    .unique();
  if (!profile) return;
  const config = await ctx.db
    .query("scanMeLinksConfigs")
    .withIndex("by_serviceProfileId", (q) => q.eq("serviceProfileId", profile._id))
    .unique();
  if (!config) return;
  const patch: {
    draftDisplayName?: string;
    publishedDisplayName?: string;
    hasUnpublishedChanges?: boolean;
  } = {};
  if (config.draftDisplayName === previousName) patch.draftDisplayName = nextName;
  if (config.publishedDisplayName === previousName) patch.publishedDisplayName = nextName;
  if (patch.draftDisplayName === undefined && patch.publishedDisplayName === undefined) return;
  const resolvedDraft = patch.draftDisplayName ?? config.draftDisplayName;
  const resolvedPublished = patch.publishedDisplayName ?? config.publishedDisplayName;
  if (patch.draftDisplayName !== undefined && resolvedDraft !== resolvedPublished) {
    patch.hasUnpublishedChanges = true;
  }
  await ctx.db.patch(config._id, { ...patch, updatedAt: Date.now() });
}

export const updateBusinessName = mutation({
  args: { businessId: v.id("businesses"), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Lokal nije pronađen.");
    const name = requireText(args.name, "Naziv lokala", 2, 120);
    const previousName = business.name;

    await ctx.db.patch(args.businessId, { name });

    // Re-slug so the address follows the name. Old QR prints keep working via aliases;
    // the client-panel URL changes (accepted product decision — no businesses alias table).
    let synced: { qrSlug: string; clientPanelSlug: string } | null = null;
    const desiredBase = slugify(name);
    if (desiredBase && desiredBase !== business.slug) {
      const links = await ctx.db
        .query("dynamicLinks")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", args.businessId).eq("type", "google_review"),
        )
        .order("desc")
        .take(20);
      const link = selectPrimaryLink(links);
      const linksProfile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", args.businessId).eq("type", "scanme_links"),
        )
        .unique();
      const reviewProfile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", args.businessId).eq("type", "google_review"),
        )
        .unique();
      const profileIds = new Set(
        [linksProfile?._id, reviewProfile?._id].filter(
          (id): id is Id<"serviceProfiles"> => id !== undefined,
        ),
      );
      const base = await resolveAvailableBaseSlug(ctx, desiredBase, {
        businessId: args.businessId,
        linkId: link?._id ?? null,
        profileIds,
      });
      synced = await applyBaseSlugSync(ctx, {
        business,
        link,
        linksProfile,
        reviewProfile,
        base,
      });
    }

    if (previousName !== name) {
      await syncLinksDisplayName(ctx, args.businessId, previousName, name);
    }

    return {
      name,
      qrSlug: synced?.qrSlug ?? null,
      clientPanelSlug: synced?.clientPanelSlug ?? business.slug,
    };
  },
});

export const updateBusinessSlug = mutation({
  args: {
    businessId: v.id("businesses"),
    linkId: v.optional(v.id("dynamicLinks")),
    kind: v.union(v.literal("qr"), v.literal("clientPanel")),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Lokal nije pronađen.");
    const slug = requireSlug(args.slug);
    const selectedLink = args.linkId ? await ctx.db.get(args.linkId) : null;
    const links = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", "google_review"),
      )
      .order("desc")
      .take(20);
    const link =
      selectedLink?.businessId === args.businessId &&
      selectedLink.type === "google_review"
        ? selectedLink
        : selectPrimaryLink(links);
    if (!link) throw new ConvexError("QR link nije pronađen.");
    const linksProfile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", "scanme_links"),
      )
      .unique();
    const reviewProfile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", "google_review"),
      )
      .unique();

    if (args.kind === "clientPanel") {
      if (slug.length > 66) {
        throw new ConvexError(
          "Osnovni slug može imati najviše 66 karaktera da bi izvedena Google Review adresa ostala važeća.",
        );
      }
      const reviewSlug = googleReviewSlug(slug);
      const ownProfileIds = new Set(
        [linksProfile?._id, reviewProfile?._id].filter(
          (id): id is Id<"serviceProfiles"> => id !== undefined,
        ),
      );
      const desiredSlugs = [slug, reviewSlug];

      for (const desiredSlug of desiredSlugs) {
        const matchingLinks = await ctx.db
          .query("dynamicLinks")
          .withIndex("by_slug", (q) => q.eq("slug", desiredSlug))
          .take(2);
        if (
          matchingLinks.some((candidate) => candidate._id !== link._id)
        ) {
          throw new ConvexError("Ovaj slug se već koristi za drugu QR adresu.");
        }
        const matchingBusinesses = await ctx.db
          .query("businesses")
          .withIndex("by_slug", (q) => q.eq("slug", desiredSlug))
          .take(2);
        if (
          matchingBusinesses.some((candidate) => candidate._id !== business._id)
        ) {
          throw new ConvexError("Ovaj slug se već koristi za drugi lokal.");
        }
        const matchingProfiles = await ctx.db
          .query("serviceProfiles")
          .withIndex("by_slug", (q) => q.eq("slug", desiredSlug))
          .take(2);
        if (
          matchingProfiles.some(
            (candidate) => !ownProfileIds.has(candidate._id),
          )
        ) {
          throw new ConvexError("Ovaj servisni slug se već koristi.");
        }
        const matchingLinkAliases = await ctx.db
          .query("dynamicLinkAliases")
          .withIndex("by_slug", (q) => q.eq("slug", desiredSlug))
          .take(2);
        if (
          matchingLinkAliases.some(
            (candidate) => candidate.dynamicLinkId !== link._id,
          )
        ) {
          throw new ConvexError("Ovaj slug je sačuvan za ranije odštampanu QR adresu.");
        }
        const matchingServiceAliases = await ctx.db
          .query("serviceSlugAliases")
          .withIndex("by_slug", (q) => q.eq("slug", desiredSlug))
          .take(2);
        if (
          matchingServiceAliases.some(
            (candidate) => !ownProfileIds.has(candidate.serviceProfileId),
          )
        ) {
          throw new ConvexError("Ovaj servisni slug je sačuvan kao ranija adresa.");
        }
      }

      return await applyBaseSlugSync(ctx, {
        business,
        link,
        linksProfile,
        reviewProfile,
        base: slug,
      });
    }

    const targetProfile = reviewProfile;
    const matchingLinks = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (matchingLinks.some((candidate) => candidate._id !== link._id)) {
      throw new ConvexError("Ovaj slug se već koristi za drugu QR adresu.");
    }
    const matchingBusinesses = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (matchingBusinesses.some((candidate) => candidate._id !== business._id)) {
      throw new ConvexError("Ovaj slug se već koristi za drugi klijentski panel.");
    }
    const matchingAliases = await ctx.db
      .query("dynamicLinkAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (matchingAliases.some((candidate) => candidate.dynamicLinkId !== link._id)) {
      throw new ConvexError("Ovaj slug je sačuvan za ranije odštampanu QR adresu.");
    }
    const matchingProfiles = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (matchingProfiles.some((candidate) => candidate._id !== targetProfile?._id)) {
      throw new ConvexError("Ovaj servisni slug se već koristi.");
    }
    const matchingServiceAliases = await ctx.db
      .query("serviceSlugAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(2);
    if (
      matchingServiceAliases.some(
        (candidate) => candidate.serviceProfileId !== targetProfile?._id,
      )
    ) {
      throw new ConvexError("Ovaj servisni slug je sačuvan kao ranija adresa.");
    }

    const now = Date.now();
    if (slug !== link.slug) {
      const existingOldSlugAlias = await ctx.db
        .query("dynamicLinkAliases")
        .withIndex("by_slug", (q) => q.eq("slug", link.slug))
        .unique();
      if (!existingOldSlugAlias) {
        await ctx.db.insert("dynamicLinkAliases", {
          slug: link.slug,
          dynamicLinkId: link._id,
          createdAt: now,
        });
      }
      const promotedAlias = matchingAliases.find(
        (candidate) => candidate.dynamicLinkId === link._id,
      );
      if (promotedAlias) await ctx.db.delete(promotedAlias._id);
      await ctx.db.patch(link._id, { slug, updatedAt: now });
    }

    if (targetProfile && targetProfile.slug !== slug) {
      const previousProfileSlug = targetProfile.slug;
      const existingOldAlias = await ctx.db
        .query("serviceSlugAliases")
        .withIndex("by_slug", (q) => q.eq("slug", previousProfileSlug))
        .unique();
      if (!existingOldAlias) {
        await ctx.db.insert("serviceSlugAliases", {
          slug: previousProfileSlug,
          serviceProfileId: targetProfile._id,
          createdAt: now,
        });
      }
      const promotedAlias = matchingServiceAliases.find(
        (candidate) => candidate.serviceProfileId === targetProfile._id,
      );
      if (promotedAlias) {
        await ctx.db.delete(promotedAlias._id);
      }
      await ctx.db.patch(targetProfile._id, {
        slug,
        updatedAt: now,
      });
    }
    return {
      qrSlug: slug,
      clientPanelSlug: business.slug,
    };
  },
});

export const setBusinessActive = mutation({
  args: { businessId: v.id("businesses"), active: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Lokal nije pronađen.");
    if (business.archivedAt) throw new ConvexError("Arhivirani lokal ne može biti aktiviran.");
    const links = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", "google_review"),
      )
      .order("desc")
      .take(20);
    const link = selectPrimaryLink(links);
    if (link) await ctx.db.patch(link._id, { active: args.active, updatedAt: Date.now() });
    const profile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", "google_review"),
      )
      .unique();
    if (profile) {
      const destinations = await ctx.db
        .query("serviceDestinations")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", profile._id),
        )
        .take(2);
      if (
        args.active &&
        (!destinations[0]?.publishedUrl ||
          !isSafePublicDestination(destinations[0].publishedUrl))
      ) {
        throw new ConvexError("Google Review servis mora imati bezbednu destinaciju.");
      }
      await ctx.db.patch(profile._id, {
        status: args.active ? "active" : "inactive",
        updatedAt: Date.now(),
      });
    } else {
      // Legacy fallback remains during the development migration window.
      await ctx.db.patch(args.businessId, {
        status: args.active ? "active" : "inactive",
      });
    }
    return { active: args.active };
  },
});

export const archiveBusiness = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Lokal nije pronađen.");
    if (business.archivedAt) throw new ConvexError("Lokal je već arhiviran.");
    const serviceProfiles = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(10);
    const links = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(100);
    if (
      serviceProfiles.some((profile) => profile.status === "active") ||
      (serviceProfiles.length === 0 && business.status !== "inactive")
    ) {
      throw new ConvexError("Svi servisi lokala moraju biti deaktivirani pre arhiviranja.");
    }

    const now = Date.now();
    await ctx.db.patch(args.businessId, { archivedAt: now });
    await Promise.all(
      serviceProfiles.map((profile) =>
        ctx.db.patch(profile._id, { status: "archived", updatedAt: now }),
      ),
    );
    await Promise.all(
      links.map((link) =>
        ctx.db.patch(link._id, { active: false, updatedAt: now }),
      ),
    );
    return { archivedAt: now };
  },
});

export const resendInvitation = mutation({
  args: { invitationId: v.id("businessInvitations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const previous = await ctx.db.get(args.invitationId);
    if (!previous) throw new ConvexError("Pozivnica nije pronađena.");
    if (previous.status === "accepted") throw new ConvexError("Prihvaćena pozivnica se ne šalje ponovo. Zamenite POC kontakt ako je potrebno.");
    const contact = await ctx.db.get(previous.contactId);
    if (!contact || contact.status === "inactive") throw new ConvexError("POC više nije aktivan.");
    if (previous.status !== "revoked") {
      await ctx.db.patch(previous._id, { status: "revoked", updatedAt: Date.now() });
    }
    const now = Date.now();
    const invitationId = await ctx.db.insert("businessInvitations", {
      businessId: previous.businessId,
      contactId: previous.contactId,
      normalizedEmail: previous.normalizedEmail,
      tokenHash: "",
      status: "queued",
      expiresAt: now + INVITATION_LIFETIME,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.invitationEmails.sendInvitation, { invitationId });
    return { invitationId };
  },
});

export const revokeInvitation = mutation({
  args: { invitationId: v.id("businessInvitations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.status === "accepted") {
      throw new ConvexError("Pozivnica ne može biti opozvana.");
    }
    await ctx.db.patch(invitation._id, { status: "revoked", updatedAt: Date.now() });
    return { revoked: true };
  },
});

export const addContact = mutation({
  args: { businessId: v.id("businesses"), ...contactArgs },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Lokal nije pronađen.");
    return await createContactAndInvitation(ctx, args.businessId, args, { sendInvitation: false });
  },
});

export const updateContact = mutation({
  args: { businessId: v.id("businesses"), contactId: v.id("businessContacts"), ...contactArgs },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.businessId !== args.businessId || contact.status === "inactive") {
      throw new ConvexError("POC kontakt nije pronađen.");
    }
    const normalizedEmail = normalizeOptionalEmail(args.email);
    await ctx.db.patch(contact._id, {
      firstName: requireText(args.firstName, "Ime", 2, 80),
      lastName: requireText(args.lastName, "Prezime", 2, 80),
      normalizedEmail,
      phone: normalizeOptionalPhone(args.phone),
      positionTitle: normalizeOptionalPosition(args.positionTitle),
      updatedAt: Date.now(),
    });
    const latestInvitation = await ctx.db
      .query("businessInvitations")
      .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
      .order("desc")
      .take(1);
    let invitationId = latestInvitation[0]?._id ?? null;
    if (normalizedEmail && !latestInvitation[0]) {
      const now = Date.now();
      invitationId = await ctx.db.insert("businessInvitations", {
        businessId: args.businessId,
        contactId: contact._id,
        normalizedEmail,
        tokenHash: "",
        status: "queued",
        expiresAt: now + INVITATION_LIFETIME,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { contactId: contact._id, invitationId };
  },
});

export const deleteContact = mutation({
  args: { businessId: v.id("businesses"), contactId: v.id("businessContacts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.businessId !== args.businessId) {
      throw new ConvexError("POC kontakt nije pronađen.");
    }
    const contacts = await ctx.db
      .query("businessContacts")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("asc")
      .take(50);
    const primary = contacts.find((candidate) => candidate.status !== "inactive");
    if (!primary || primary._id === contact._id) {
      throw new ConvexError("Glavni POC kontakt ne može da se obriše. Dodajte drugi kontakt pa obrišite njega.");
    }
    const now = Date.now();
    await ctx.db.patch(contact._id, { status: "inactive", updatedAt: now });
    if (contact.authUserId) {
      const membership = await ctx.db
        .query("businessMemberships")
        .withIndex("by_userId_and_businessId", (q) =>
          q.eq("userId", contact.authUserId!).eq("businessId", args.businessId),
        )
        .unique();
      if (membership) await ctx.db.patch(membership._id, { active: false, updatedAt: now });
    }
    const invitations = await ctx.db
      .query("businessInvitations")
      .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
      .take(50);
    for (const invitation of invitations) {
      if (invitation.status !== "accepted" && invitation.status !== "revoked") {
        await ctx.db.patch(invitation._id, { status: "revoked", updatedAt: now });
      }
    }
    return { deleted: true };
  },
});

export const replaceContact = mutation({
  args: { businessId: v.id("businesses"), ...contactArgs },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new ConvexError("Lokal nije pronađen.");
    const contacts = await ctx.db
      .query("businessContacts")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(50);
    const now = Date.now();
    for (const contact of contacts) {
      await ctx.db.patch(contact._id, { status: "inactive", updatedAt: now });
      if (contact.authUserId) {
        const membership = await ctx.db
          .query("businessMemberships")
          .withIndex("by_userId_and_businessId", (q) =>
            q.eq("userId", contact.authUserId!).eq("businessId", args.businessId),
          )
          .unique();
        if (membership) await ctx.db.patch(membership._id, { active: false, updatedAt: now });
      }
      const invitations = await ctx.db
        .query("businessInvitations")
        .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
        .take(50);
      for (const invitation of invitations) {
        if (invitation.status !== "accepted" && invitation.status !== "revoked") {
          await ctx.db.patch(invitation._id, { status: "revoked", updatedAt: now });
        }
      }
    }
    return await createContactAndInvitation(ctx, args.businessId, args);
  },
});

// Approve an activation request in ONE transaction (RFC-001 §2.3), closing the
// audited gap (§1.e) where profile status and entitlement could drift: (1) flip
// the service profile to "active" (what setServiceActive does), (2) upsert the
// entitlement with source "manual", (3) close the request. An optional spaceId
// grants a space-scoped entitlement instead of a business-scoped one.
export const approveActivation = mutation({
  args: {
    requestId: v.id("serviceActivationRequests"),
    planKey: v.string(),
    spaceId: v.optional(v.id("memoriesSpaces")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Upit nije pronađen.");
    const profile = await ctx.db.get(request.serviceProfileId);
    if (!profile) throw new ConvexError("Servisni profil nije pronađen.");
    const business = await ctx.db.get(profile.businessId);
    if (!business || business.archivedAt) {
      throw new ConvexError("Arhivirani lokal ne može biti aktiviran.");
    }

    const now = Date.now();
    // 1. profile → active
    await ctx.db.patch(profile._id, { status: "active", updatedAt: now });
    // 2. entitlement upsert (source: manual)
    const entitlementId = await upsertManualEntitlement(ctx, {
      businessId: profile.businessId,
      product: request.requestedService,
      planKey: args.planKey,
      spaceId: args.spaceId,
      now,
    });
    // 3. close the request
    await ctx.db.patch(request._id, { status: "closed", updatedAt: now });

    return { activated: true as const, entitlementId };
  },
});
