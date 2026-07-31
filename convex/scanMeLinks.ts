import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
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
import {
  createDefaultScanMeLinksDesignV2,
  normalizeDesignForPreset,
  type ScanMeLinksDesignV2,
} from "../lib/scanme-links-design";
import {
  paletteAnalysisValidator,
  scanMeDesignV2Validator,
} from "./lib/scanMeDesignValidators";

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

const editableDestinationStates = [
  "active",
  "inactive",
  "archived",
] as const;

const publishedDestinationStates = [
  "active",
  "inactive",
  "archived",
  "deleted",
] as const;

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

const editorDestinationValidator = v.object({
  id: v.id("serviceDestinations"),
  kind: destinationKindValidator,
  label: v.string(),
  url: v.string(),
  order: v.number(),
  state: destinationStateValidator,
});

function normalizeHex(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    throw new Error("Boja mora biti HEX vrednost u formatu #RRGGBB.");
  }
  return normalized;
}

function normalizeDesignHex(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/.test(normalized)) {
    throw new Error("Boja u dizajnu mora biti HEX vrednost u formatu #RRGGBB ili #RRGGBBAA.");
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

function storedDesignV2(
  design:
    | Doc<"scanMeLinksConfigs">["draftDesign"]
    | Doc<"scanMeLinksConfigs">["publishedDesign"],
) {
  if (design?.version === 2) {
    return normalizeDesignForPreset(design, design.presetKey);
  }
  return createDefaultScanMeLinksDesignV2(design?.presetKey);
}

function normalizeEditorDesign(design: ScanMeLinksDesignV2) {
  const normalized = normalizeDesignForPreset(design, design.presetKey);
  const colors = Object.fromEntries(
    Object.entries(normalized.colors).map(([key, value]) => [
      key,
      normalizeDesignHex(value),
    ]),
  ) as ScanMeLinksDesignV2["colors"];
  const background = (() => {
    switch (normalized.background.category) {
      case "flat":
        return {
          ...normalized.background,
          color: normalizeDesignHex(normalized.background.color),
        };
      case "gradient":
        return {
          ...normalized.background,
          startColor: normalizeDesignHex(normalized.background.startColor),
          endColor: normalizeDesignHex(normalized.background.endColor),
        };
      case "pattern":
        return {
          ...normalized.background,
          backgroundColor: normalizeDesignHex(
            normalized.background.backgroundColor,
          ),
          patternColor: normalizeDesignHex(normalized.background.patternColor),
        };
      case "texture":
        return {
          ...normalized.background,
          backgroundColor: normalizeDesignHex(
            normalized.background.backgroundColor,
          ),
          tintColor: normalizeDesignHex(normalized.background.tintColor),
        };
      case "media":
        return {
          ...normalized.background,
          overlayColor: normalizeDesignHex(normalized.background.overlayColor),
        };
      case "animation":
        return {
          ...normalized.background,
          baseColor: normalizeDesignHex(normalized.background.baseColor),
          accentColor: normalizeDesignHex(normalized.background.accentColor),
        };
    }
  })();
  return {
    ...normalized,
    background,
    colors,
    buttons: {
      ...normalized.buttons,
      shadow: {
        ...normalized.buttons.shadow,
        color: normalizeDesignHex(normalized.buttons.shadow.color),
      },
    },
  } satisfies ScanMeLinksDesignV2;
}

function normalizeEditorText(
  value: string | null,
  label: string,
  maxLength: number,
) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} karaktera.`);
  }
  return normalized;
}

function normalizePaletteAnalysis(
  value:
    | {
        original: string[];
        adjusted: string[];
        correctedRoles: string[];
      }
    | null
    | undefined,
) {
  if (value == null) return undefined;
  if (
    value.original.length > 8 ||
    value.adjusted.length > 8 ||
    value.correctedRoles.length > 8
  ) {
    throw new Error("Analiza palete može imati najviše osam vrednosti po grupi.");
  }
  return {
    original: value.original.map(normalizeHex),
    adjusted: value.adjusted.map(normalizeHex),
    correctedRoles: value.correctedRoles.map((role) =>
      requireText(role, "Uloga boje", 1, 64),
    ),
  };
}

async function validateStoredFile(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | null,
  options: {
    label: string;
    maxBytes: number;
    contentTypes: readonly string[];
  },
) {
  if (!storageId) return;
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) throw new Error(`${options.label} nije pronađen.`);
  if (metadata.size > options.maxBytes) {
    throw new Error(
      `${options.label} može imati najviše ${Math.floor(options.maxBytes / 1024 / 1024)} MB.`,
    );
  }
  const contentType = metadata.contentType
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!contentType || !options.contentTypes.includes(contentType)) {
    throw new Error(`${options.label} nema podržan format.`);
  }
}

async function validateEditorMedia(
  ctx: MutationCtx,
  media: {
    logoStorageId: Id<"_storage"> | null;
    backgroundImageStorageId: Id<"_storage"> | null;
    backgroundVideoStorageId: Id<"_storage"> | null;
  },
) {
  await validateStoredFile(ctx, media.logoStorageId, {
    label: "Logotip",
    maxBytes: 5 * 1024 * 1024,
    contentTypes: [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ],
  });
  await validateStoredFile(ctx, media.backgroundImageStorageId, {
    label: "Pozadinska slika",
    maxBytes: 12 * 1024 * 1024,
    contentTypes: [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/avif",
      "image/gif",
    ],
  });
  await validateStoredFile(ctx, media.backgroundVideoStorageId, {
    label: "Pozadinski video",
    maxBytes: 30 * 1024 * 1024,
    contentTypes: ["video/mp4", "video/webm"],
  });
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
    .withIndex("by_serviceProfileId_and_publishedState", (q) =>
      q
        .eq("serviceProfileId", serviceProfileId)
        .eq("publishedState", "active"),
    )
    .take(100);
  return rows
    .filter(
      (row) =>
        row.publishedState === "active" &&
        Boolean(row.publishedUrl) &&
        isSafePublicDestination(row.publishedUrl!),
    )
    .sort((a, b) => (a.publishedOrder ?? 0) - (b.publishedOrder ?? 0))
    .slice(0, 10);
}

async function editorDestinations(
  ctx: QueryCtx | MutationCtx,
  serviceProfileId: Id<"serviceProfiles">,
) {
  const groups = await Promise.all(
    editableDestinationStates.map((state) =>
      ctx.db
        .query("serviceDestinations")
        .withIndex("by_serviceProfileId_and_draftState", (q) =>
          q.eq("serviceProfileId", serviceProfileId).eq("draftState", state),
        )
        .take(101),
    ),
  );
  return groups
    .flat()
    .sort((a, b) => a.draftOrder - b.draftOrder)
    .slice(0, 101);
}

async function draftRowsForCommit(
  ctx: MutationCtx,
  serviceProfileId: Id<"serviceProfiles">,
) {
  const [visible, recentDeleted] = await Promise.all([
    editorDestinations(ctx, serviceProfileId),
    ctx.db
      .query("serviceDestinations")
      .withIndex(
        "by_serviceProfileId_and_draftState_and_updatedAt",
        (q) =>
          q
            .eq("serviceProfileId", serviceProfileId)
            .eq("draftState", "deleted"),
      )
      .order("desc")
      .take(101),
  ]);
  return [
    ...visible,
    ...recentDeleted.filter((row) => row.publishedState !== "deleted"),
  ];
}

async function analyticsDestinations(
  ctx: QueryCtx,
  serviceProfileId: Id<"serviceProfiles">,
) {
  const rows: Doc<"serviceDestinations">[] = [];
  for (const state of publishedDestinationStates) {
    const query = ctx.db
      .query("serviceDestinations")
      .withIndex("by_serviceProfileId_and_publishedState", (q) =>
        q
          .eq("serviceProfileId", serviceProfileId)
          .eq("publishedState", state),
      );
    for await (const row of query) rows.push(row);
  }
  return rows;
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
  const usesBusinessLogo = config.publishedLogoStorageId === undefined;
  const logoStorageId = usesBusinessLogo
    ? business.logoStorageId
    : config.publishedLogoStorageId;
  const logoUrl = logoStorageId
    ? await ctx.storage.getUrl(logoStorageId)
    : usesBusinessLogo
      ? business.logoUrl ?? null
      : null;
  const backgroundImageUrl = config.publishedBackgroundImageStorageId
    ? await ctx.storage.getUrl(config.publishedBackgroundImageStorageId)
    : null;
  const backgroundVideoUrl = config.publishedBackgroundVideoStorageId
    ? await ctx.storage.getUrl(config.publishedBackgroundVideoStorageId)
    : null;
  return {
    displayName: config.publishedDisplayName ?? business.name,
    description: config.publishedDescription ?? "",
    logoUrl,
    templateKey: config.publishedTemplateKey,
    backgroundKey: config.publishedBackgroundKey,
    accent: config.publishedAccent ?? DEFAULT_ACCENT,
    accentTokens: config.publishedAccentTokens ?? DEFAULT_ACCENT_TOKENS,
    design:
      config.publishedDesign?.version === 2
        ? storedDesignV2(config.publishedDesign)
        : null,
    backgroundImageUrl,
    backgroundVideoUrl,
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
  const usesBusinessLogo = config.draftLogoStorageId === undefined;
  const logoStorageId = usesBusinessLogo
    ? business.logoStorageId
    : config.draftLogoStorageId;
  const logoUrl = logoStorageId
    ? await ctx.storage.getUrl(logoStorageId)
    : usesBusinessLogo
      ? business.logoUrl ?? null
      : null;
  const backgroundImageUrl = config.draftBackgroundImageStorageId
    ? await ctx.storage.getUrl(config.draftBackgroundImageStorageId)
    : null;
  const backgroundVideoUrl = config.draftBackgroundVideoStorageId
    ? await ctx.storage.getUrl(config.draftBackgroundVideoStorageId)
    : null;
  return {
    displayName: config.draftDisplayName ?? business.name,
    description: config.draftDescription ?? "",
    logoUrl,
    templateKey,
    backgroundKey,
    accent: config.draftAccent,
    accentTokens: config.draftAccentTokens,
    design: storedDesignV2(config.draftDesign),
    backgroundImageUrl,
    backgroundVideoUrl,
    destinations: destinations
      .filter(
        (row) =>
          row.draftState === "active" || row.draftState === "inactive",
      )
      .sort((a, b) => a.draftOrder - b.draftOrder)
      .slice(0, 100)
      .map((row) => ({
        id: row._id,
        kind: row.kind,
        label: row.draftLabel,
        url: row.draftUrl,
        iconKey: row.draftIconKey,
        state: row.draftState,
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
    ? await editorDestinations(ctx, profile._id)
    : [];
  const usesBusinessLogo = config?.draftLogoStorageId === undefined;
  const logoStorageId = usesBusinessLogo
    ? business.logoStorageId
    : config?.draftLogoStorageId;
  const logoUrl = logoStorageId
    ? await ctx.storage.getUrl(logoStorageId)
    : usesBusinessLogo
      ? business.logoUrl ?? null
      : null;
  const backgroundImageUrl = config?.draftBackgroundImageStorageId
    ? await ctx.storage.getUrl(config.draftBackgroundImageStorageId)
    : null;
  const backgroundVideoUrl = config?.draftBackgroundVideoStorageId
    ? await ctx.storage.getUrl(config.draftBackgroundVideoStorageId)
    : null;
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
          description: config.draftDescription ?? "",
          logoStorageId: logoStorageId ?? null,
          inheritsBusinessLogo: usesBusinessLogo,
          logoUrl,
          templateKey: config.draftTemplateKey,
          backgroundKey: config.draftBackgroundKey,
          palette: config.draftPalette,
          paletteAnalysis: config.draftPaletteAnalysis ?? null,
          accent: config.draftAccent,
          accentTokens: config.draftAccentTokens,
          design: storedDesignV2(config.draftDesign),
          backgroundImageStorageId:
            config.draftBackgroundImageStorageId ?? null,
          backgroundImageUrl,
          backgroundVideoStorageId:
            config.draftBackgroundVideoStorageId ?? null,
          backgroundVideoUrl,
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
    const destinations = await editorDestinations(ctx, profile._id);
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
    const publishedRows = await publishedDestinations(ctx, profile._id);
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

async function adminEditorPayload(
  ctx: QueryCtx,
  business: Doc<"businesses">,
  profile: Doc<"serviceProfiles"> | null,
) {
  const summary = await businessView(ctx, business);
  if (!profile) {
    return {
      ...summary,
      destinations: [],
      draftView: null,
      publishedView: null,
      editorRole: "admin" as const,
      templateRegistry: TEMPLATE_REGISTRY,
    };
  }
  const config = await ctx.db
    .query("scanMeLinksConfigs")
    .withIndex("by_serviceProfileId", (q) =>
      q.eq("serviceProfileId", profile._id),
    )
    .unique();
  const destinations = await editorDestinations(ctx, profile._id);
  const draftView = config
    ? await draftLinksView(ctx, business, config, destinations)
    : null;
  const publishedRows = await publishedDestinations(ctx, profile._id);
  const publishedView =
    config?.publishedAt
      ? await publicLinksView(ctx, profile, publishedRows)
      : null;
  return {
    ...summary,
    draftView,
    publishedView,
    editorRole: "admin" as const,
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
}

export const editorBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const slug = requireSlug(args.slug);
    const resolvedProfile = await serviceBySlug(ctx, slug);
    let profile =
      resolvedProfile?.type === "scanme_links" ? resolvedProfile : null;
    let business = profile ? await ctx.db.get(profile.businessId) : null;

    if (!business) {
      business = await ctx.db
        .query("businesses")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      profile = business
        ? await profileForBusiness(ctx, business._id, "scanme_links")
        : null;
    }
    if (!business) return null;
    return await adminEditorPayload(ctx, business, profile);
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

export const generateEditorUploadUrl = mutation({
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

export const saveEditorDraft = mutation({
  args: {
    serviceProfileId: v.id("serviceProfiles"),
    displayName: v.union(v.string(), v.null()),
    description: v.union(v.string(), v.null()),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    palette: v.array(v.string()),
    paletteAnalysis: v.optional(
      v.union(paletteAnalysisValidator, v.null()),
    ),
    design: scanMeDesignV2Validator,
    backgroundImageStorageId: v.union(v.id("_storage"), v.null()),
    backgroundVideoStorageId: v.union(v.id("_storage"), v.null()),
    destinations: v.array(editorDestinationValidator),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.serviceProfileId);
    if (!profile) throw new Error("ScanMe Links profil nije pronađen.");
    await requireEditorAccess(ctx, profile);
    const config = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", profile._id),
      )
      .unique();
    if (!config) throw new Error("Konfiguracija nije pronađena.");
    if (args.palette.length > 8) {
      throw new Error("Paleta može imati najviše osam boja.");
    }
    if (args.destinations.length > 100) {
      throw new Error("Nacrt može imati najviše 100 destinacija.");
    }

    const displayName = normalizeEditorText(
      args.displayName,
      "Naziv lokala",
      20,
    );
    const description = normalizeEditorText(
      args.description,
      "Kratak opis",
      50,
    );
    const palette = args.palette.map(normalizeHex);
    const paletteAnalysis = normalizePaletteAnalysis(args.paletteAnalysis);
    const design = normalizeEditorDesign(args.design);
    await validateEditorMedia(ctx, {
      logoStorageId: args.logoStorageId ?? null,
      backgroundImageStorageId: args.backgroundImageStorageId,
      backgroundVideoStorageId: args.backgroundVideoStorageId,
    });

    const submittedIds = new Set<Id<"serviceDestinations">>();
    let activeCount = 0;

    for (const destination of args.destinations) {
      if (submittedIds.has(destination.id)) {
        throw new Error("Ista destinacija je poslata više puta.");
      }
      submittedIds.add(destination.id);
      const row = await ctx.db.get(destination.id);
      if (!row || row.serviceProfileId !== profile._id) {
        throw new Error("Destinacija ne pripada ovom ScanMe Links profilu.");
      }
      if (
        !Number.isInteger(destination.order) ||
        destination.order < 0 ||
        destination.order >= 100
      ) {
        throw new Error("Redosled destinacije nije ispravan.");
      }
      const url = destination.url.trim();
      if (url && !isSafePublicDestination(url)) {
        throw new Error("Destinacija mora biti bezbedan javni HTTPS link.");
      }
      if (destination.state === "active") activeCount += 1;
      const defaults =
        DESTINATION_DEFAULTS[destination.kind as DestinationKind];
      await ctx.db.patch(row._id, {
        kind: destination.kind,
        draftLabel: requireText(
          destination.label,
          "Naziv destinacije",
          1,
          80,
        ),
        draftUrl: url,
        draftIconKey: defaults.iconKey,
        draftOrder: destination.order,
        draftState: destination.state,
        updatedAt: Date.now(),
      });
    }
    if (activeCount > 10) {
      throw new Error("ScanMe Links može imati najviše 10 aktivnih destinacija.");
    }
    const now = Date.now();
    const draftRevision = config.draftRevision + 1;
    await ctx.db.patch(config._id, {
      draftDisplayName: displayName,
      draftDescription: description,
      draftLogoStorageId: args.logoStorageId,
      draftPalette: palette,
      draftPaletteAnalysis: paletteAnalysis,
      draftDesignState: "ready",
      draftDesign: design,
      draftBackgroundImageStorageId: args.backgroundImageStorageId,
      draftBackgroundVideoStorageId: args.backgroundVideoStorageId,
      draftAccent: design.colors.accent.slice(0, 7),
      hasUnpublishedChanges: true,
      draftRevision,
      updatedAt: now,
    });
    return {
      saved: true,
      draftRevision,
      updatedAt: now,
      design,
    };
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
    const activeRows = await ctx.db
      .query("serviceDestinations")
      .withIndex("by_serviceProfileId_and_draftState", (q) =>
        q
          .eq("serviceProfileId", profile._id)
          .eq("draftState", "active"),
      )
      .take(10);
    if (activeRows.length >= 10) {
      throw new Error("ScanMe Links može imati najviše 10 aktivnih destinacija.");
    }
    const visible = await editorDestinations(ctx, profile._id);
    if (visible.length >= 100) {
      throw new Error("ScanMe Links nacrt moÅ¾e imati najviÅ¡e 100 destinacija.");
    }
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
      draftState: "active",
      draftPresentation: "button",
      createdAt: now,
      updatedAt: now,
    });
    const draftRevision = await markDraftChanged(ctx, profile._id);
    return { destinationId, draftRevision };
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
    const draftRevision = config.draftRevision + 1;
    await ctx.db.patch(config._id, {
      hasUnpublishedChanges: true,
      draftRevision,
      updatedAt: Date.now(),
    });
    return draftRevision;
  }
  throw new Error("Konfiguracija nije pronađena.");
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
      const activeRows = await ctx.db
        .query("serviceDestinations")
        .withIndex("by_serviceProfileId_and_draftState", (q) =>
          q
            .eq("serviceProfileId", row.serviceProfileId)
            .eq("draftState", "active"),
        )
        .take(10);
      if (activeRows.length >= 10) {
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
    const rows = await draftRowsForCommit(ctx, args.serviceProfileId);
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
          draftPresentation:
            row.publishedPresentation ?? row.draftPresentation ?? "button",
          updatedAt: Date.now(),
        });
      }
    }
    await ctx.db.patch(config._id, {
      draftDisplayName: config.publishedDisplayName,
      draftLogoStorageId: config.publishedLogoStorageId,
      draftDescription: config.publishedDescription ?? "",
      draftTemplateKey: config.publishedTemplateKey ?? "option-two",
      draftBackgroundKey: config.publishedBackgroundKey ?? "warm-ivory",
      draftPalette:
        config.publishedPalette ??
        (config.publishedAccent
          ? [config.publishedAccent]
          : [DEFAULT_ACCENT]),
      draftAccent: config.publishedAccent ?? DEFAULT_ACCENT,
      draftAccentTokens: config.publishedAccentTokens ?? DEFAULT_ACCENT_TOKENS,
      draftDesignState: "ready",
      draftDesign: storedDesignV2(config.publishedDesign),
      draftPaletteAnalysis: config.publishedPaletteAnalysis,
      draftBackgroundImageStorageId:
        config.publishedBackgroundImageStorageId ?? null,
      draftBackgroundVideoStorageId:
        config.publishedBackgroundVideoStorageId ?? null,
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
    await validateEditorMedia(ctx, {
      logoStorageId: config.draftLogoStorageId ?? null,
      backgroundImageStorageId:
        config.draftBackgroundImageStorageId ?? null,
      backgroundVideoStorageId:
        config.draftBackgroundVideoStorageId ?? null,
    });
    const rows = await draftRowsForCommit(ctx, profile._id);
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
          publishedLabel: row.draftLabel,
          publishedUrl: row.draftUrl,
          publishedIconKey: row.draftIconKey,
          publishedOrder: row.draftOrder,
          publishedState: "deleted",
          publishedPresentation: row.draftPresentation ?? "button",
          updatedAt: now,
        });
        continue;
      }
      await ctx.db.patch(row._id, {
        publishedLabel: row.draftLabel,
        publishedUrl: row.draftUrl,
        publishedIconKey: row.draftIconKey,
        publishedOrder: row.draftOrder,
        publishedState: row.draftState,
        publishedPresentation: row.draftPresentation ?? "button",
        updatedAt: now,
      });
    }
    const design = storedDesignV2(config.draftDesign);
    await ctx.db.patch(config._id, {
      publishedDisplayName: config.draftDisplayName,
      publishedLogoStorageId: config.draftLogoStorageId,
      publishedDescription: config.draftDescription ?? "",
      publishedTemplateKey: config.draftTemplateKey,
      publishedBackgroundKey: config.draftBackgroundKey,
      publishedPalette: config.draftPalette,
      publishedAccent: config.draftAccent,
      publishedAccentTokens: config.draftAccentTokens,
      publishedDesign: design,
      publishedPaletteAnalysis: config.draftPaletteAnalysis,
      publishedBackgroundImageStorageId:
        config.draftBackgroundImageStorageId ?? null,
      publishedBackgroundVideoStorageId:
        config.draftBackgroundVideoStorageId ?? null,
      hasUnpublishedChanges: false,
      publishedRevision: config.draftRevision,
      publishedAt: now,
      updatedAt: now,
    });
    return {
      publishedAt: now,
      publishedRevision: config.draftRevision,
    };
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
    const destinations = await analyticsDestinations(ctx, profile._id);
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
        .filter((row) => Boolean(row.publishedState))
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
