import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  destinationPresentationValidator,
  paletteAnalysisValidator,
  scanMeDesignStateValidator,
  scanMeDesignValidator,
} from "./lib/scanMeDesignValidators";

const businessStatus = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("demo"),
);

const leadStatus = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("closed"),
);

const serviceType = v.union(
  v.literal("scanme_links"),
  v.literal("google_review"),
);

const serviceStatus = v.union(
  v.literal("inactive"),
  v.literal("active"),
  v.literal("archived"),
);

const destinationKind = v.union(
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

const destinationState = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("archived"),
  v.literal("deleted"),
);

const accentTokens = v.object({
  accent: v.string(),
  strong: v.string(),
  soft: v.string(),
  border: v.string(),
  focus: v.string(),
  onAccent: v.string(),
});

export default defineSchema({
  ...authTables,

  businesses: defineTable({
    name: v.string(),
    slug: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
    status: businessStatus,
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  dynamicLinks: defineTable({
    businessId: v.id("businesses"),
    slug: v.string(),
    destinationUrl: v.string(),
    type: v.literal("google_review"),
    active: v.boolean(),
    scanCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_businessId", ["businessId"])
    .index("by_businessId_and_type", ["businessId", "type"])
    .index("by_active", ["active"]),

  dynamicLinkAliases: defineTable({
    slug: v.string(),
    dynamicLinkId: v.id("dynamicLinks"),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_dynamicLinkId", ["dynamicLinkId"]),

  serviceProfiles: defineTable({
    businessId: v.id("businesses"),
    type: serviceType,
    slug: v.string(),
    status: serviceStatus,
    clientEditingEnabled: v.optional(v.boolean()),
    totalScans: v.number(),
    totalPageViews: v.number(),
    totalConvertedSessions: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_businessId", ["businessId"])
    .index("by_businessId_and_type", ["businessId", "type"])
    .index("by_type_and_status", ["type", "status"]),

  serviceSlugAliases: defineTable({
    slug: v.string(),
    serviceProfileId: v.id("serviceProfiles"),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_serviceProfileId", ["serviceProfileId"]),

  scanMeLinksConfigs: defineTable({
    serviceProfileId: v.id("serviceProfiles"),
    // Deprecated rollout mirror of businesses.name; never use as canonical identity.
    draftDisplayName: v.optional(v.string()),
    // null explicitly removes the service logo; undefined keeps the legacy business-logo fallback.
    draftLogoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    draftTemplateKey: v.string(),
    draftBackgroundKey: v.string(),
    draftPalette: v.array(v.string()),
    draftAccent: v.string(),
    draftAccentTokens: accentTokens,
    draftDesignState: v.optional(scanMeDesignStateValidator),
    draftDesign: v.optional(scanMeDesignValidator),
    draftDescription: v.optional(v.string()),
    draftPaletteAnalysis: v.optional(paletteAnalysisValidator),
    draftBackgroundImageStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    // Deprecated rollout mirror kept optional until all deployed readers use businesses.name.
    publishedDisplayName: v.optional(v.string()),
    publishedLogoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    publishedTemplateKey: v.optional(v.string()),
    publishedBackgroundKey: v.optional(v.string()),
    publishedAccent: v.optional(v.string()),
    publishedAccentTokens: v.optional(accentTokens),
    publishedDesign: v.optional(scanMeDesignValidator),
    publishedDescription: v.optional(v.string()),
    publishedPaletteAnalysis: v.optional(paletteAnalysisValidator),
    publishedBackgroundImageStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    hasUnpublishedChanges: v.boolean(),
    draftRevision: v.number(),
    publishedRevision: v.number(),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_serviceProfileId", ["serviceProfileId"]),

  serviceDestinations: defineTable({
    serviceProfileId: v.id("serviceProfiles"),
    kind: destinationKind,
    totalClicks: v.number(),
    totalDirectVisits: v.number(),
    draftLabel: v.string(),
    draftUrl: v.string(),
    draftIconKey: v.string(),
    draftOrder: v.number(),
    draftState: destinationState,
    draftPresentation: v.optional(destinationPresentationValidator),
    publishedLabel: v.optional(v.string()),
    publishedUrl: v.optional(v.string()),
    publishedIconKey: v.optional(v.string()),
    publishedOrder: v.optional(v.number()),
    publishedState: v.optional(destinationState),
    publishedPresentation: v.optional(destinationPresentationValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_serviceProfileId", ["serviceProfileId"])
    .index("by_serviceProfileId_and_draftOrder", ["serviceProfileId", "draftOrder"])
    .index("by_serviceProfileId_and_publishedOrder", ["serviceProfileId", "publishedOrder"]),

  scanEvents: defineTable({
    dynamicLinkId: v.id("dynamicLinks"),
    requestId: v.optional(v.string()),
    scannedAt: v.number(),
    deviceCategory: v.optional(
      v.union(
        v.literal("mobile"),
        v.literal("tablet"),
        v.literal("desktop"),
        v.literal("bot"),
        v.literal("unknown"),
      ),
    ),
    referrerHost: v.optional(v.string()),
  })
    .index("by_dynamicLinkId_and_scannedAt", ["dynamicLinkId", "scannedAt"])
    .index("by_requestId", ["requestId"]),

  serviceScanEvents: defineTable({
    serviceProfileId: v.id("serviceProfiles"),
    requestId: v.string(),
    scannedAt: v.number(),
    mode: v.union(v.literal("direct"), v.literal("links")),
    directDestinationId: v.optional(v.id("serviceDestinations")),
    convertedAt: v.optional(v.number()),
    deviceCategory: v.optional(
      v.union(
        v.literal("mobile"),
        v.literal("tablet"),
        v.literal("desktop"),
        v.literal("bot"),
        v.literal("unknown"),
      ),
    ),
    referrerHost: v.optional(v.string()),
  })
    .index("by_serviceProfileId_and_scannedAt", ["serviceProfileId", "scannedAt"])
    .index("by_requestId", ["requestId"]),

  destinationVisitEvents: defineTable({
    serviceProfileId: v.id("serviceProfiles"),
    destinationId: v.id("serviceDestinations"),
    scanEventId: v.id("serviceScanEvents"),
    visitId: v.string(),
    kind: v.union(v.literal("click"), v.literal("direct")),
    occurredAt: v.number(),
  })
    .index("by_visitId", ["visitId"])
    .index("by_destinationId_and_occurredAt", ["destinationId", "occurredAt"])
    .index("by_scanEventId", ["scanEventId"]),

  dailyScanCounts: defineTable({
    dynamicLinkId: v.id("dynamicLinks"),
    dateKey: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_dynamicLinkId_and_dateKey", ["dynamicLinkId", "dateKey"]),

  dailyServiceMetrics: defineTable({
    serviceProfileId: v.id("serviceProfiles"),
    dateKey: v.string(),
    scans: v.number(),
    pageViews: v.number(),
    convertedSessions: v.number(),
    updatedAt: v.number(),
  }).index("by_serviceProfileId_and_dateKey", ["serviceProfileId", "dateKey"]),

  dailyDestinationMetrics: defineTable({
    destinationId: v.id("serviceDestinations"),
    dateKey: v.string(),
    clicks: v.number(),
    directVisits: v.number(),
    updatedAt: v.number(),
  }).index("by_destinationId_and_dateKey", ["destinationId", "dateKey"]),

  businessContacts: defineTable({
    businessId: v.id("businesses"),
    firstName: v.string(),
    lastName: v.string(),
    normalizedEmail: v.string(),
    phone: v.string(),
    positionTitle: v.string(),
    status: v.union(v.literal("invited"), v.literal("active"), v.literal("inactive")),
    authUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_normalizedEmail", ["normalizedEmail"]),

  businessMemberships: defineTable({
    userId: v.id("users"),
    businessId: v.id("businesses"),
    accessRole: v.literal("viewer"),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_businessId", ["userId", "businessId"])
    .index("by_userId_and_active", ["userId", "active"])
    .index("by_businessId_and_active", ["businessId", "active"]),

  businessInvitations: defineTable({
    businessId: v.id("businesses"),
    contactId: v.id("businessContacts"),
    normalizedEmail: v.string(),
    tokenHash: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("accepted"),
      v.literal("failed"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    sentAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    emailMessageId: v.optional(v.string()),
    // Legacy field retained so existing Resend invitation rows remain valid.
    resendEmailId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_businessId_and_status", ["businessId", "status"])
    .index("by_contactId", ["contactId"]),

  serviceActivationRequests: defineTable({
    businessId: v.id("businesses"),
    serviceProfileId: v.id("serviceProfiles"),
    requestedService: serviceType,
    contactId: v.optional(v.id("businessContacts")),
    status: v.union(v.literal("new"), v.literal("contacted"), v.literal("closed")),
    requestedAt: v.number(),
    updatedAt: v.number(),
    emailStatus: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    emailMessageId: v.optional(v.string()),
    emailFailureReason: v.optional(v.string()),
  })
    .index("by_businessId_and_requestedService", ["businessId", "requestedService"])
    .index("by_status_and_requestedAt", ["status", "requestedAt"]),

  leads: defineTable({
    contactName: v.string(),
    businessName: v.string(),
    businessType: v.string(),
    city: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    interest: v.union(
      v.literal("review"),
      v.literal("page"),
      v.literal("venue"),
      v.literal("memories"),
      v.literal("loyalty"),
      v.literal("not_sure"),
    ),
    message: v.optional(v.string()),
    submissionId: v.string(),
    status: leadStatus,
    createdAt: v.number(),
  })
    .index("by_submissionId", ["submissionId"])
    .index("by_status_and_createdAt", ["status", "createdAt"]),
});
