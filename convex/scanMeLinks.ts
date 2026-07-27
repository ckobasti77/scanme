import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  isAdminEmail,
  requireAdmin,
  requireAuthUser,
} from "./lib/access";
import {
  aggregateMetricRowsForRange,
  metricsRangeConfig,
  type MetricsRange,
} from "./lib/metrics";
import {
  getDestinationMetricRows,
  getServiceMetricRows,
  serviceMetricDateKey,
} from "./lib/serviceMetrics";
import {
  isSafePublicDestination,
  requireSlug,
  requireText,
} from "./lib/validation";
import {
  DEFAULT_ACCENT,
  DEFAULT_ACCENT_TOKENS,
  DESTINATION_DEFAULTS,
  ICON_KEYS,
  TEMPLATE_REGISTRY,
  isTemplateBackgroundCompatible,
  type AccentTokens,
  type DestinationKind,
  type IconKey,
  type TemplateKey,
} from "../lib/scanme-links";

const destinationKindValidator = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("tiktok"),
  v.literal("linkedin"),
  v.literal("website"),
  v.literal("reservations"),
  v.literal("whatsapp"),
  v.literal("viber"),
  v.literal("telegram"),
  v.literal("youtube"),
  v.literal("custom"),
);

const destinationStateValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("archived"),
  v.literal("deleted"),
);

const metricsRangeValidator = v.union(
  v.literal("7d"),
  v.literal("30d"),
  v.literal("90d"),
  v.literal("1y"),
  v.literal("all"),
);

const deviceCategoryValidator = v.union(
  v.literal("mobile"),
  v.literal("tablet"),
  v.literal("desktop"),
  v.literal("bot"),
  v.literal("unknown"),
);

const accentTokensValidator = v.object({
  accent: v.string(),
  strong: v.string(),
  soft: v.string(),
  border: v.string(),
  focus: v.string(),
  onAccent: v.string(),
});

function normalizeHex(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    throw new Error("Boja mora biti HEX vrednost u formatu #RRGGBB.");
  }
  return normalized;
}

function normalizeAccentTokens(tokens: AccentTokens) {
  return {
    accent: normalizeHex(tokens.accent),
    strong: normalizeHex(tokens.strong),
    soft: normalizeHex(tokens.soft),
    border: normalizeHex(tokens.border),
    focus: normalizeHex(tokens.focus),
    onAccent: normalizeHex(tokens.onAccent),
  };
}

function normalizeIconKey(value: string): IconKey {
  if (!ICON_KEYS.includes(value as IconKey)) {
    throw new Error("Izabrana ikonica nije podržana.");
  }
  return value as IconKey;
}

async function serviceBySlug(ctx: QueryCtx | MutationCtx, rawSlug: string) {
  const slug = requireSlug(rawSlug);
  let profile = await ctx.db
    .query("serviceProfiles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!profile) {
    const alias = await ctx.db
      .query("serviceSlugAliases")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    profile = alias ? await ctx.db.get(alias.serviceProfileId) : null;
  }
  return profile;
}

async function profileForBusiness(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
  type: "scanme_links" | "google_review",
) {
  return await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", businessId).eq("type", type),
    )
    .unique();
}

async function requireEditorAccess(
  ctx: QueryCtx | MutationCtx,
  profile: Doc<"serviceProfiles">,
) {
  if (profile.type !== "scanme_links") {
    throw new Error("ScanMe Links profil nije pronađen.");
  }
  const user = await requireAuthUser(ctx);
  if (isAdminEmail(user.email)) return { role: "admin" as const, user };
  if (!profile.clientEditingEnabled) {
    throw new Error("Uređivanje ScanMe Links stranice nije omogućeno za klijenta.");
  }
  const membership = await ctx.db
    .query("businessMemberships")
    .withIndex("by_userId_and_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", profile.businessId),
    )
    .unique();
  if (!membership?.active) {
    throw new Error("Nemate pristup ovom lokalu.");
  }
  return { role: "client" as const, user };
}

async function publishedDestinations(
  ctx: QueryCtx | MutationCtx,
  serviceProfileId: Id<"serviceProfiles">,
) {
  const rows = await ctx.db
    .query("serviceDestinations")
    .withIndex("by_serviceProfileId_and_publishedOrder", (q) =>
      q.eq("serviceProfileId", serviceProfileId),
    )
    .take(100);
  return rows
    .filter(
      (row) =>
        row.publishedState === "active" &&
        (!row.publishedUrl || isSafePublicDestination(row.publishedUrl)),
    )
    .sort((a, b) => (a.publishedOrder ?? 0) - (b.publishedOrder ?? 0))
    .slice(0, 10);
}

async function incrementServiceDaily(
  ctx: MutationCtx,
  serviceProfileId: Id<"serviceProfiles">,
  timestamp: number,
  field: "scans" | "pageViews" | "convertedSessions",
) {
  const dateKey = serviceMetricDateKey(timestamp);
  const row = await ctx.db
    .query("dailyServiceMetrics")
    .withIndex("by_serviceProfileId_and_dateKey", (q) =>
      q.eq("serviceProfileId", serviceProfileId).eq("dateKey", dateKey),
    )
    .unique();
  if (row) {
    await ctx.db.patch(row._id, {
      [field]: row[field] + 1,
      updatedAt: timestamp,
    });
    return;
  }
  await ctx.db.insert("dailyServiceMetrics", {
    serviceProfileId,
    dateKey,
    scans: field === "scans" ? 1 : 0,
    pageViews: field === "pageViews" ? 1 : 0,
    convertedSessions: field === "convertedSessions" ? 1 : 0,
    updatedAt: timestamp,
  });
}

async function incrementDestinationDaily(
  ctx: MutationCtx,
  destinationId: Id<"serviceDestinations">,
  timestamp: number,
  field: "clicks" | "directVisits",
) {
  const dateKey = serviceMetricDateKey(timestamp);
  const row = await ctx.db
    .query("dailyDestinationMetrics")
    .withIndex("by_destinationId_and_dateKey", (q) =>
      q.eq("destinationId", destinationId).eq("dateKey", dateKey),
    )
    .unique();
  if (row) {
    await ctx.db.patch(row._id, {
      [field]: row[field] + 1,
      updatedAt: timestamp,
    });
    return;
  }
  await ctx.db.insert("dailyDestinationMetrics", {
    destinationId,
    dateKey,
    clicks: field === "clicks" ? 1 : 0,
    directVisits: field === "directVisits" ? 1 : 0,
    updatedAt: timestamp,
  });
}

async function publicLinksView(
  ctx: QueryCtx | MutationCtx,
  profile: Doc<"serviceProfiles">,
  destinations: Doc<"serviceDestinations">[],
) {
  const business = await ctx.db.get(profile.businessId);
  const config = await ctx.db
    .query("scanMeLinksConfigs")
    .withIndex("by_serviceProfileId", (q) =>
      q.eq("serviceProfileId", profile._id),
    )
    .unique();
  if (!business || !config?.publishedTemplateKey || !config.publishedBackgroundKey) {
    return null;
  }
  if (
    !isTemplateBackgroundCompatible(
      config.publishedTemplateKey,
      config.publishedBackgroundKey,
    )
  ) {
    return null;
  }
  const logoStorageId = config.publishedLogoStorageId ?? business.logoStorageId;
  const logoUrl = logoStorageId
    ? await ctx.storage.getUrl(logoStorageId)
    : business.logoUrl ?? null;
  return {
    displayName: config.publishedDisplayName ?? business.name,
    logoUrl,
    templateKey: config.publishedTemplateKey,
    backgroundKey: config.publishedBackgroundKey,
    accent: config.publishedAccent ?? DEFAULT_ACCENT,
    accentTokens: config.publishedAccentTokens ?? DEFAULT_ACCENT_TOKENS,
    destinations: destinations.map((destination) => ({
      id: destination._id,
      kind: destination.kind,
      label: destination.publishedLabel ?? DESTINATION_DEFAULTS[destination.kind].label,
      url: destination.publishedUrl ?? "",
      iconKey:
        destination.publishedIconKey ?? DESTINATION_DEFAULTS[destination.kind].iconKey,
    })),
  };
}

async function draftLinksView(
  ctx: QueryCtx,
  business: Doc<"businesses">,
  config: Doc<"scanMeLinksConfigs">,
  destinations: Doc<"serviceDestinations">[],
) {
  const templateKey = TEMPLATE_REGISTRY[config.draftTemplateKey as TemplateKey]
    ? (config.draftTemplateKey as TemplateKey)
    : "option-two";
  const backgroundKey = isTemplateBackgroundCompatible(
    templateKey,
    config.draftBackgroundKey,
  )
    ? config.draftBackgroundKey
    : TEMPLATE_REGISTRY["option-two"].defaultBackground;
  const logoStorageId = config.draftLogoStorageId ?? business.logoStorageId;
  const logoUrl = logoStorageId
    ? await ctx.storage.getUrl(logoStorageId)
    : business.logoUrl ?? null;
  return {
    displayName: config.draftDisplayName ?? business.name,
    logoUrl,
    templateKey,
    backgroundKey,
    accent: config.draftAccent,
    accentTokens: config.draftAccentTokens,
    destinations: destinations
      .filter((row) => row.draftState === "active")
      .sort((a, b) => a.draftOrder - b.draftOrder)
      .slice(0, 10)
      .map((row) => ({
        id: row._id,
        kind: row.kind,
        label: row.draftLabel,
        url: row.draftUrl,
        iconKey: row.draftIconKey,
      })),
  };
}

async function currentResolution(
  ctx: QueryCtx | MutationCtx,
  profile: Doc<"serviceProfiles">,
  existingEvent?: Doc<"serviceScanEvents"> | null,
) {
  if (existingEvent?.mode === "direct" && existingEvent.directDestinationId) {
    const destination = await ctx.db.get(existingEvent.directDestinationId);
    if (
      destination?.publishedState === "active" &&
      destination.publishedUrl &&
      isSafePublicDestination(destination.publishedUrl)
    ) {
      return {
        status: "direct" as const,
        destinationUrl: destination.publishedUrl,
      };
    }
  }
  const destinations = await publishedDestinations(ctx, profile._id);
  const linkedDestinations = destinations.filter(
    (destination) =>
      destination.publishedUrl &&
      isSafePublicDestination(destination.publishedUrl),
  );
  if (profile.type === "google_review") {
    if (!linkedDestinations.length) return { status: "unavailable" as const };
    return {
      status: "direct" as const,
      destinationUrl: linkedDestinations[0].publishedUrl!,
      destination: linkedDestinations[0],
    };
  }
  if (destinations.length === 1 && linkedDestinations.length === 1) {
    return {
      status: "direct" as const,
      destinationUrl: linkedDestinations[0].publishedUrl!,
      destination: linkedDestinations[0],
    };
  }
  const view = await publicLinksView(ctx, profile, destinations);
  if (!view) return { status: "unavailable" as const };
  return { status: "links" as const, view };
}

export const resolveAndRecord = mutation({
  args: {
    slug: v.string(),
    requestId: v.string(),
    deviceCategory: v.optional(deviceCategoryValidator),
    referrerHost: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requestId = args.requestId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      throw new Error("Zahtev skeniranja nije ispravan.");
    }
    const profile = await serviceBySlug(ctx, args.slug);
    if (!profile) return { status: "missing" as const };
    if (profile.status !== "active") return { status: "inactive" as const };
    const business = await ctx.db.get(profile.businessId);
    if (!business || business.archivedAt) return { status: "inactive" as const };

    const existing = await ctx.db
      .query("serviceScanEvents")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .unique();
    if (existing) {
      if (existing.serviceProfileId !== profile._id) {
        throw new Error("Zahtev skeniranja nije ispravan.");
      }
      const resolution = await currentResolution(ctx, profile, existing);
      return resolution.status === "links"
        ? { ...resolution, scanSessionId: existing._id }
        : resolution;
    }

    const resolution = await currentResolution(ctx, profile);
    if (resolution.status === "unavailable") {
      return { status: "invalid_destination" as const };
    }

    const safeReferrer = args.referrerHost?.trim().toLowerCase();
    const referrerHost =
      safeReferrer &&
      safeReferrer.length <= 253 &&
      /^[a-z0-9.-]+$/.test(safeReferrer)
        ? safeReferrer
        : undefined;
    const now = Date.now();
    const isBot = args.deviceCategory === "bot";
    const directDestination =
      resolution.status === "direct" && "destination" in resolution
        ? resolution.destination
        : null;
    const scanEventId = await ctx.db.insert("serviceScanEvents", {
      serviceProfileId: profile._id,
      requestId,
      scannedAt: now,
      mode: resolution.status,
      ...(directDestination ? { directDestinationId: directDestination._id } : {}),
      ...(args.deviceCategory ? { deviceCategory: args.deviceCategory } : {}),
      ...(referrerHost ? { referrerHost } : {}),
    });

    if (!isBot) {
      await ctx.db.patch(profile._id, {
        totalScans: profile.totalScans + 1,
        totalPageViews:
          profile.totalPageViews + (resolution.status === "links" ? 1 : 0),
        updatedAt: now,
      });
      await incrementServiceDaily(ctx, profile._id, now, "scans");
      if (resolution.status === "links") {
        await incrementServiceDaily(ctx, profile._id, now, "pageViews");
      }
      if (directDestination) {
        const visitId = `direct-${requestId}`;
        await ctx.db.insert("destinationVisitEvents", {
          serviceProfileId: profile._id,
          destinationId: directDestination._id,
          scanEventId,
          visitId,
          kind: "direct",
          occurredAt: now,
        });
        await ctx.db.patch(directDestination._id, {
          totalDirectVisits: directDestination.totalDirectVisits + 1,
          updatedAt: now,
        });
        await incrementDestinationDaily(
          ctx,
          directDestination._id,
          now,
          "directVisits",
        );
      }
    }

    if (resolution.status === "links") {
      return { ...resolution, scanSessionId: scanEventId };
    }
    return {
      status: "direct" as const,
      destinationUrl: resolution.destinationUrl,
    };
  },
});

export const recordClick = mutation({
  args: {
    requestId: v.string(),
    destinationId: v.id("serviceDestinations"),
    clickId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!/^[0-9a-f-]{36}$/i.test(args.clickId.trim())) {
      throw new Error("Klik nije ispravan.");
    }
    const scan = await ctx.db
      .query("serviceScanEvents")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId.trim()))
      .unique();
    if (!scan || scan.mode !== "links") throw new Error("ScanMe sesija nije dostupna.");
    const destination = await ctx.db.get(args.destinationId);
    if (
      !destination ||
      destination.serviceProfileId !== scan.serviceProfileId ||
      destination.publishedState !== "active" ||
      !destination.publishedUrl ||
      !isSafePublicDestination(destination.publishedUrl)
    ) {
      throw new Error("Destinacija nije dostupna.");
    }
    const existing = await ctx.db
      .query("destinationVisitEvents")
      .withIndex("by_visitId", (q) => q.eq("visitId", args.clickId.trim()))
      .unique();
    if (existing) return { destinationUrl: destination.publishedUrl };

    const now = Date.now();
    await ctx.db.insert("destinationVisitEvents", {
      serviceProfileId: scan.serviceProfileId,
      destinationId: destination._id,
      scanEventId: scan._id,
      visitId: args.clickId.trim(),
      kind: "click",
      occurredAt: now,
    });
    await ctx.db.patch(destination._id, {
      totalClicks: destination.totalClicks + 1,
      updatedAt: now,
    });
    await incrementDestinationDaily(ctx, destination._id, now, "clicks");

    if (!scan.convertedAt && scan.deviceCategory !== "bot") {
      const profile = await ctx.db.get(scan.serviceProfileId);
      if (profile) {
        await ctx.db.patch(scan._id, { convertedAt: now });
        await ctx.db.patch(profile._id, {
          totalConvertedSessions: profile.totalConvertedSessions + 1,
          updatedAt: now,
        });
        await incrementServiceDaily(
          ctx,
          profile._id,
          scan.scannedAt,
          "convertedSessions",
        );
      }
    }
    return { destinationUrl: destination.publishedUrl };
  },
});

async function businessView(ctx: QueryCtx, business: Doc<"businesses">) {
  const profile = await profileForBusiness(ctx, business._id, "scanme_links");
  const contacts = await ctx.db
    .query("businessContacts")
    .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
    .take(50);
  const contact = contacts.find((row) => row.status !== "inactive") ?? null;
  const config = profile
    ? await ctx.db
        .query("scanMeLinksConfigs")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", profile._id),
        )
        .unique()
    : null;
  const destinations = profile
    ? await ctx.db
        .query("serviceDestinations")
        .withIndex("by_serviceProfileId_and_draftOrder", (q) =>
          q.eq("serviceProfileId", profile._id),
        )
        .take(100)
    : [];
  const logoStorageId = config?.draftLogoStorageId ?? business.logoStorageId;
  const logoUrl = logoStorageId
    ? await ctx.storage.getUrl(logoStorageId)
    : business.logoUrl ?? null;
  const businessLogoUrl = business.logoStorageId
    ? await ctx.storage.getUrl(business.logoStorageId)
    : business.logoUrl ?? null;
  return {
    id: business._id,
    name: business.name,
    clientPanelSlug: business.slug,
    archivedAt: business.archivedAt ?? null,
    businessLogoUrl,
    profile: profile
      ? {
          id: profile._id,
          slug: profile.slug,
          status: profile.status,
          clientEditingEnabled: profile.clientEditingEnabled ?? false,
          totalScans: profile.totalScans,
        }
      : null,
    config: config
      ? {
          displayName: config.draftDisplayName ?? business.name,
          logoUrl,
          templateKey: config.draftTemplateKey,
          backgroundKey: config.draftBackgroundKey,
          palette: config.draftPalette,
          accent: config.draftAccent,
          accentTokens: config.draftAccentTokens,
          hasUnpublishedChanges: config.hasUnpublishedChanges,
          draftRevision: config.draftRevision,
          publishedRevision: config.publishedRevision,
          publishedAt: config.publishedAt ?? null,
        }
      : null,
    destinationCount: destinations.filter(
      (row) => row.draftState !== "deleted" && row.draftState !== "archived",
    ).length,
    contact: contact
      ? {
          id: contact._id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.normalizedEmail,
          phone: contact.phone,
          positionTitle: contact.positionTitle,
        }
      : null,
  };
}

export const listBusinesses = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const businesses = await ctx.db.query("businesses").order("desc").take(100);
    return await Promise.all(businesses.map((business) => businessView(ctx, business)));
  },
});

export const editor = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) return null;
    const profile = await profileForBusiness(ctx, business._id, "scanme_links");
    if (!profile) {
      await requireAdmin(ctx);
      const summary = await businessView(ctx, business);
      return {
        ...summary,
        destinations: [],
        draftView: null,
        publishedView: null,
        editorRole: "admin" as const,
        templateRegistry: TEMPLATE_REGISTRY,
      };
    }
    const access = await requireEditorAccess(ctx, profile);
    const summary = await businessView(ctx, business);
    const destinations = await ctx.db
      .query("serviceDestinations")
      .withIndex("by_serviceProfileId_and_draftOrder", (q) =>
        q.eq("serviceProfileId", profile._id),
      )
      .take(100);
    const draftView = summary.config
      ? await draftLinksView(
          ctx,
          business,
          await ctx.db
            .query("scanMeLinksConfigs")
            .withIndex("by_serviceProfileId", (q) =>
              q.eq("serviceProfileId", profile._id),
            )
            .unique()
            .then((config) => {
              if (!config) throw new Error("Konfiguracija nije pronađena.");
              return config;
            }),
          destinations,
        )
      : null;
    const publishedRows = destinations
      .filter(
        (row) =>
          row.publishedState === "active" &&
          (!row.publishedUrl || isSafePublicDestination(row.publishedUrl)),
      )
      .sort((a, b) => (a.publishedOrder ?? 0) - (b.publishedOrder ?? 0));
    const publishedView =
      summary.config?.publishedAt
        ? await publicLinksView(ctx, profile, publishedRows)
        : null;
    return {
      ...summary,
      draftView,
      publishedView,
      editorRole: access.role,
      destinations: destinations
        .filter((row) => row.draftState !== "deleted")
        .sort((a, b) => a.draftOrder - b.draftOrder)
        .map((row) => ({
          id: row._id,
          kind: row.kind,
          label: row.draftLabel,
          url: row.draftUrl,
          iconKey: row.draftIconKey,
          order: row.draftOrder,
          state: row.draftState,
          publishedState: row.publishedState ?? null,
          totalClicks: row.totalClicks,
          totalDirectVisits: row.totalDirectVisits,
          updatedAt: row.updatedAt,
        })),
      templateRegistry: TEMPLATE_REGISTRY,
    };
  },
});

export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const generateDisplayLogoUploadUrl = mutation({
  args: { serviceProfileId: v.id("serviceProfiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile) throw new Error("ScanMe Links profil nije pronađen.");
    await requireEditorAccess(ctx, profile);
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateBusinessLogo = mutation({
  args: {
    businessId: v.id("businesses"),
    logoStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Lokal nije pronađen.");
    const metadata = await ctx.db.system.get("_storage", args.logoStorageId);
    if (!metadata) throw new Error("Logotip nije pronađen.");
    if (metadata.size > 5 * 1024 * 1024) {
      throw new Error("Logotip može imati najviše 5 MB.");
    }
    if (
      !metadata.contentType ||
      !["image/png", "image/jpeg", "image/webp"].includes(metadata.contentType)
    ) {
      throw new Error("Dozvoljeni su PNG, JPEG i WebP logotipi.");
    }
    await ctx.db.patch(args.businessId, {
      logoStorageId: args.logoStorageId,
    });
    return { updated: true };
  },
});

export const saveDraftAppearance = mutation({
  args: {
    serviceProfileId: v.id("serviceProfiles"),
    displayName: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    templateKey: v.string(),
    backgroundKey: v.string(),
    palette: v.array(v.string()),
    accent: v.string(),
    accentTokens: accentTokensValidator,
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile) {
      throw new Error("ScanMe Links profil nije pronađen.");
    }
    await requireEditorAccess(ctx, profile);
    const templateKey = args.templateKey as TemplateKey;
    if (!TEMPLATE_REGISTRY[templateKey]) throw new Error("Template nije podržan.");
    if (!isTemplateBackgroundCompatible(templateKey, args.backgroundKey)) {
      throw new Error("Pozadina ne pripada izabranom template-u.");
    }
    if (args.palette.length > 3) throw new Error("Paleta može imati najviše tri boje.");
    const palette = args.palette.map(normalizeHex);
    const config = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", profile._id),
      )
      .unique();
    if (!config) throw new Error("Konfiguracija nije pronađena.");
    await ctx.db.patch(config._id, {
      draftDisplayName: requireText(args.displayName, "Naziv za prikaz", 2, 120),
      ...(args.logoStorageId ? { draftLogoStorageId: args.logoStorageId } : {}),
      draftTemplateKey: templateKey,
      draftBackgroundKey: args.backgroundKey,
      draftPalette: palette,
      draftAccent: normalizeHex(args.accent),
      draftAccentTokens: normalizeAccentTokens(args.accentTokens),
      hasUnpublishedChanges: true,
      draftRevision: config.draftRevision + 1,
      updatedAt: Date.now(),
    });
    return { saved: true };
  },
});

export const addDestination = mutation({
  args: {
    serviceProfileId: v.id("serviceProfiles"),
    kind: destinationKindValidator,
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile) {
      throw new Error("ScanMe Links profil nije pronađen.");
    }
    await requireEditorAccess(ctx, profile);
    const rows = await ctx.db
      .query("serviceDestinations")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", profile._id),
      )
      .take(200);
    const visible = rows.filter((row) => row.draftState !== "deleted");
    const defaults = DESTINATION_DEFAULTS[args.kind as DestinationKind];
    const now = Date.now();
    const destinationId = await ctx.db.insert("serviceDestinations", {
      serviceProfileId: profile._id,
      kind: args.kind,
      totalClicks: 0,
      totalDirectVisits: 0,
      draftLabel: defaults.label,
      draftUrl: "",
      draftIconKey: defaults.iconKey,
      draftOrder: visible.length,
      draftState: "inactive",
      createdAt: now,
      updatedAt: now,
    });
    await markDraftChanged(ctx, profile._id);
    return { destinationId };
  },
});

async function markDraftChanged(
  ctx: MutationCtx,
  serviceProfileId: Id<"serviceProfiles">,
) {
  const config = await ctx.db
    .query("scanMeLinksConfigs")
    .withIndex("by_serviceProfileId", (q) =>
      q.eq("serviceProfileId", serviceProfileId),
    )
    .unique();
  if (config) {
    await ctx.db.patch(config._id, {
      hasUnpublishedChanges: true,
      draftRevision: config.draftRevision + 1,
      updatedAt: Date.now(),
    });
  }
}

export const updateDestination = mutation({
  args: {
    destinationId: v.id("serviceDestinations"),
    kind: destinationKindValidator,
    label: v.string(),
    url: v.string(),
    iconKey: v.string(),
    state: destinationStateValidator,
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.destinationId);
    if (!row) throw new Error("Destinacija nije pronađena.");
    const profile = await ctx.db.get(row.serviceProfileId);
    if (!profile) throw new Error("ScanMe Links profil nije pronađen.");
    await requireEditorAccess(ctx, profile);
    const url = args.url.trim();
    if (url && !isSafePublicDestination(url)) {
      throw new Error("Destinacija mora biti bezbedan javni HTTPS link.");
    }
    if (args.state === "active" && row.draftState !== "active") {
      const rows = await ctx.db
        .query("serviceDestinations")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", row.serviceProfileId),
        )
        .take(200);
      if (rows.filter((candidate) => candidate.draftState === "active").length >= 10) {
        throw new Error("ScanMe Links može imati najviše 10 aktivnih destinacija.");
      }
    }
    await ctx.db.patch(row._id, {
      kind: args.kind,
      draftLabel: requireText(args.label, "Naziv destinacije", 1, 80),
      draftUrl: url,
      draftIconKey: normalizeIconKey(args.iconKey),
      draftState: args.state,
      updatedAt: Date.now(),
    });
    await markDraftChanged(ctx, row.serviceProfileId);
    return { saved: true };
  },
});

export const reorderDestinations = mutation({
  args: {
    serviceProfileId: v.id("serviceProfiles"),
    destinationIds: v.array(v.id("serviceDestinations")),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile) throw new Error("ScanMe Links profil nije pronađen.");
    await requireEditorAccess(ctx, profile);
    if (args.destinationIds.length > 100) throw new Error("Redosled nije ispravan.");
    for (const [order, destinationId] of args.destinationIds.entries()) {
      const row = await ctx.db.get(destinationId);
      if (!row || row.serviceProfileId !== args.serviceProfileId) {
        throw new Error("Destinacija nije pronađena.");
      }
      await ctx.db.patch(row._id, { draftOrder: order, updatedAt: Date.now() });
    }
    await markDraftChanged(ctx, args.serviceProfileId);
    return { saved: true };
  },
});

export const markDestinationDeleted = mutation({
  args: { destinationId: v.id("serviceDestinations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.destinationId);
    if (!row) throw new Error("Destinacija nije pronađena.");
    const profile = await ctx.db.get(row.serviceProfileId);
    if (!profile) throw new Error("ScanMe Links profil nije pronađen.");
    await requireEditorAccess(ctx, profile);
    await ctx.db.patch(row._id, { draftState: "deleted", updatedAt: Date.now() });
    await markDraftChanged(ctx, row.serviceProfileId);
    return { marked: true };
  },
});

export const discardDraft = mutation({
  args: { serviceProfileId: v.id("serviceProfiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile) throw new Error("ScanMe Links profil nije pronađen.");
    await requireEditorAccess(ctx, profile);
    const config = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", args.serviceProfileId),
      )
      .unique();
    if (!config) throw new Error("Konfiguracija nije pronađena.");
    const rows = await ctx.db
      .query("serviceDestinations")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", args.serviceProfileId),
      )
      .take(200);
    for (const row of rows) {
      if (!row.publishedState) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, {
          draftLabel: row.publishedLabel ?? row.draftLabel,
          draftUrl: row.publishedUrl ?? row.draftUrl,
          draftIconKey: row.publishedIconKey ?? row.draftIconKey,
          draftOrder: row.publishedOrder ?? row.draftOrder,
          draftState: row.publishedState,
          updatedAt: Date.now(),
        });
      }
    }
    await ctx.db.patch(config._id, {
      draftDisplayName: config.publishedDisplayName,
      draftLogoStorageId: config.publishedLogoStorageId,
      draftTemplateKey: config.publishedTemplateKey ?? "option-two",
      draftBackgroundKey: config.publishedBackgroundKey ?? "warm-ivory",
      draftAccent: config.publishedAccent ?? DEFAULT_ACCENT,
      draftAccentTokens: config.publishedAccentTokens ?? DEFAULT_ACCENT_TOKENS,
      hasUnpublishedChanges: false,
      draftRevision: config.draftRevision + 1,
      updatedAt: Date.now(),
    });
    return { discarded: true };
  },
});

export const publishDraft = mutation({
  args: {
    serviceProfileId: v.id("serviceProfiles"),
    expectedDraftRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile) {
      throw new Error("ScanMe Links profil nije pronađen.");
    }
    await requireEditorAccess(ctx, profile);
    const config = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", profile._id),
      )
      .unique();
    if (!config) throw new Error("Konfiguracija nije pronađena.");
    if (config.draftRevision !== args.expectedDraftRevision) {
      throw new Error("Nacrt je u međuvremenu izmenjen. Osvežite editor i pokušajte ponovo.");
    }
    if (
      !isTemplateBackgroundCompatible(
        config.draftTemplateKey,
        config.draftBackgroundKey,
      )
    ) {
      throw new Error("Pozadina ne pripada izabranom template-u.");
    }
    if (config.draftLogoStorageId) {
      const metadata = await ctx.db.system.get("_storage", config.draftLogoStorageId);
      if (
        !metadata ||
        metadata.size > 5 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(metadata.contentType ?? "")
      ) {
        throw new Error("Logo mora biti PNG, JPEG ili WebP fajl do 5 MB.");
      }
    }
    const rows = await ctx.db
      .query("serviceDestinations")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", profile._id),
      )
      .take(200);
    const active = rows.filter((row) => row.draftState === "active");
    if (active.length > 10) throw new Error("Možete objaviti najviše 10 aktivnih destinacija.");
    for (const row of active) {
      if (row.draftUrl && !isSafePublicDestination(row.draftUrl)) {
        throw new Error(`Destinacija „${row.draftLabel}“ nema bezbedan HTTPS URL.`);
      }
    }
    const now = Date.now();
    for (const row of rows) {
      if (row.draftState === "deleted") {
        await ctx.db.patch(row._id, {
          publishedState: "deleted",
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(0, internal.scanMeLinks.purgeDestination, {
          destinationId: row._id,
        });
        continue;
      }
      await ctx.db.patch(row._id, {
        publishedLabel: row.draftLabel,
        publishedUrl: row.draftUrl,
        publishedIconKey: row.draftIconKey,
        publishedOrder: row.draftOrder,
        publishedState: row.draftState,
        updatedAt: now,
      });
    }
    await ctx.db.patch(config._id, {
      publishedDisplayName: config.draftDisplayName,
      publishedLogoStorageId: config.draftLogoStorageId,
      publishedTemplateKey: config.draftTemplateKey,
      publishedBackgroundKey: config.draftBackgroundKey,
      publishedAccent: config.draftAccent,
      publishedAccentTokens: config.draftAccentTokens,
      hasUnpublishedChanges: false,
      publishedRevision: config.draftRevision,
      publishedAt: now,
      updatedAt: now,
    });
    return { publishedAt: now };
  },
});

export const setServiceActive = mutation({
  args: { serviceProfileId: v.id("serviceProfiles"), active: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile || profile.type !== "scanme_links") {
      throw new Error("ScanMe Links profil nije pronađen.");
    }
    const business = await ctx.db.get(profile.businessId);
    if (!business || business.archivedAt) {
      throw new Error("Arhivirani lokal ne može biti aktiviran.");
    }
    await ctx.db.patch(profile._id, {
      status: args.active ? "active" : "inactive",
      updatedAt: Date.now(),
    });
    return { active: args.active };
  },
});

export const setClientEditingEnabled = mutation({
  args: {
    serviceProfileId: v.id("serviceProfiles"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile || profile.type !== "scanme_links") {
      throw new Error("ScanMe Links profil nije pronađen.");
    }
    await ctx.db.patch(profile._id, {
      clientEditingEnabled: args.enabled,
      updatedAt: Date.now(),
    });
    return { enabled: args.enabled };
  },
});

export const metrics = query({
  args: {
    businessId: v.id("businesses"),
    range: v.optional(metricsRangeValidator),
    destinationId: v.optional(v.id("serviceDestinations")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await profileForBusiness(ctx, args.businessId, "scanme_links");
    if (!profile) return null;
    const range = (args.range ?? "7d") as MetricsRange;
    const rows = args.destinationId
      ? await getDestinationMetricRows(ctx, args.destinationId, range, "clicks")
      : await getServiceMetricRows(ctx, profile._id, range, "scans");
    const destinations = await ctx.db
      .query("serviceDestinations")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", profile._id),
      )
      .take(100);
    return {
      totalScans: profile.totalScans,
      totalPageViews: profile.totalPageViews,
      totalConvertedSessions: profile.totalConvertedSessions,
      ctr:
        profile.totalPageViews > 0
          ? profile.totalConvertedSessions / profile.totalPageViews
          : 0,
      range,
      rangeLabel: metricsRangeConfig[range].label,
      daily: aggregateMetricRowsForRange(rows, range),
      destinations: destinations
        .filter((row) => row.publishedState && row.publishedState !== "deleted")
        .sort((a, b) => (a.publishedOrder ?? 0) - (b.publishedOrder ?? 0))
        .map((row) => ({
          id: row._id,
          label: row.publishedLabel ?? row.draftLabel,
          kind: row.kind,
          state: row.publishedState!,
          totalClicks: row.totalClicks,
          totalDirectVisits: row.totalDirectVisits,
        })),
    };
  },
});

export const purgeDestination = internalMutation({
  args: { destinationId: v.id("serviceDestinations") },
  handler: async (ctx, args) => {
    const destination = await ctx.db.get(args.destinationId);
    if (!destination || destination.publishedState !== "deleted") return null;
    const visits = await ctx.db
      .query("destinationVisitEvents")
      .withIndex("by_destinationId_and_occurredAt", (q) =>
        q.eq("destinationId", destination._id),
      )
      .take(50);
    for (const visit of visits) {
      await ctx.db.delete(visit._id);
      if (visit.kind !== "click") continue;
      const scan = await ctx.db.get(visit.scanEventId);
      if (!scan?.convertedAt) continue;
      const remainingClicks = (
        await ctx.db
          .query("destinationVisitEvents")
          .withIndex("by_scanEventId", (q) => q.eq("scanEventId", scan._id))
          .take(20)
      ).filter((event) => event.kind === "click");
      if (remainingClicks.length) continue;
      const profile = await ctx.db.get(scan.serviceProfileId);
      if (profile) {
        await ctx.db.patch(profile._id, {
          totalConvertedSessions: Math.max(0, profile.totalConvertedSessions - 1),
          updatedAt: Date.now(),
        });
      }
      await ctx.db.patch(scan._id, { convertedAt: undefined });
      const dateKey = serviceMetricDateKey(scan.scannedAt);
      const dailyService = await ctx.db
        .query("dailyServiceMetrics")
        .withIndex("by_serviceProfileId_and_dateKey", (q) =>
          q.eq("serviceProfileId", scan.serviceProfileId).eq("dateKey", dateKey),
        )
        .unique();
      if (dailyService) {
        await ctx.db.patch(dailyService._id, {
          convertedSessions: Math.max(0, dailyService.convertedSessions - 1),
          updatedAt: Date.now(),
        });
      }
    }
    if (visits.length) {
      await ctx.scheduler.runAfter(0, internal.scanMeLinks.purgeDestination, {
        destinationId: destination._id,
      });
      return null;
    }
    const daily = await ctx.db
      .query("dailyDestinationMetrics")
      .withIndex("by_destinationId_and_dateKey", (q) =>
        q.eq("destinationId", destination._id),
      )
      .take(50);
    for (const row of daily) await ctx.db.delete(row._id);
    if (daily.length) {
      await ctx.scheduler.runAfter(0, internal.scanMeLinks.purgeDestination, {
        destinationId: destination._id,
      });
      return null;
    }
    await ctx.db.delete(destination._id);
    return null;
  },
});
