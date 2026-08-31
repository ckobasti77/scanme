import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  destinationPresentationValidator,
  paletteAnalysisValidator,
  scanMeDesignStateValidator,
  scanMeDesignValidator,
} from "./lib/scanMeDesignValidators";
import {
  venueBlockValidator,
  venueDesignValidator,
} from "./lib/venueValidators";

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

// Shared service-type validator (RFC-001 §2.1). Widened with the two new
// products so any table, arg, or return validator that keys on service type
// stays in one place. Additive: existing "scanme_links"/"google_review" rows
// validate unchanged and no index keys change.
export const serviceTypeValidator = v.union(
  v.literal("scanme_links"),
  v.literal("google_review"),
  v.literal("scanme_venue"),
  v.literal("scanme_memories"),
);

const serviceType = serviceTypeValidator;

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

// Card retarget kinds (RFC-001 §2.4 C.9). Shared by `cardTargets.kind` and
// `cardScanEvents.targetKind` so the two can never drift; exported for the
// convex/cards.ts arg validators (TASK-14).
export const cardTargetKind = v.union(
  v.literal("memories_space"),
  v.literal("venue"),
  v.literal("event"),
  v.literal("service_page"),
  v.literal("url"),
);

// Reduced device signal for the new scan/visit event tables (RFC-001 §2.4
// C.10). No IP or full UA is stored (§2.10 GDPR minimization). Exported for
// the convex/cards.ts arg validators (TASK-14).
export const deviceCategory = v.union(
  v.literal("mobile"),
  v.literal("tablet"),
  v.literal("desktop"),
  v.literal("bot"),
  v.literal("unknown"),
);

export default defineSchema({
  ...authTables,

  // RFC-002 §2.2.1 — the account: the plan/billing/grouping layer ABOVE
  // businesses (Axis B). Access stays per-business (§2.2.2): an Enterprise
  // login reaches its locations through N businessMemberships rows, and
  // requireBusinessAccess never reads this table. getEntitlement reads it as
  // its least-specific fallback (step 3, §2.2.3).
  accounts: defineTable({
    name: v.string(), // "Kafanski lanac d.o.o." or a solo local's own name
    plan: v.union(
      v.literal("basic"),
      v.literal("premium"),
      v.literal("enterprise"),
    ),
    // Absent for basic — the free plan has no billing period.
    planPeriod: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
    status: v.union(v.literal("active"), v.literal("suspended")),
    // Enterprise-negotiated capability deviations, merged by getEntitlement
    // (step 3); the same optional-subset shape as entitlements.overrides.
    // Empty/absent for Basic/Premium.
    overrides: v.optional(
      v.object({
        photosPerGuest: v.optional(v.number()),
        maxImageDimension: v.optional(v.number()),
        retentionDays: v.optional(v.number()),
        allowedBlockKeys: v.optional(v.array(v.string())),
      }),
    ),
    // Billing-port target for the PLAN subscription (services bill through
    // orders, §2.5).
    planSource: v.optional(v.union(v.literal("manual"), v.literal("billing"))),
    planExternalRef: v.optional(v.string()),
    // Absent = perpetual (manual); a daily expiry cron sweeps numeric values.
    planValidUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  businesses: defineTable({
    name: v.string(),
    slug: v.string(),
    // Tenant kind (RFC-001 §2.1.6). `businesses` is the tenant table; a
    // celebration is a tenant too. Absent means "business" so existing rows
    // validate unchanged; celebrations are never surfaced as "businesses" in
    // any UI. The celebrations/partnerships product tables (C.15/C.16) exist
    // below; the mutation that provisions a celebration tenant is built with
    // Memories.
    kind: v.optional(v.union(v.literal("business"), v.literal("celebration"))),
    // RFC-002 §2.2.1 — the account this location belongs to. Optional and
    // additive: absent degrades cleanly (getEntitlement step 3 simply never
    // fires), so the solo-account backfill (§2.2.4) is not a correctness
    // prerequisite.
    accountId: v.optional(v.id("accounts")),
    logoStorageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
    status: businessStatus,
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_account", ["accountId"]),

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
    draftDisplayName: v.optional(v.string()),
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
    draftBackgroundVideoStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    publishedDisplayName: v.optional(v.string()),
    publishedLogoStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    publishedTemplateKey: v.optional(v.string()),
    publishedBackgroundKey: v.optional(v.string()),
    publishedAccent: v.optional(v.string()),
    publishedAccentTokens: v.optional(accentTokens),
    publishedPalette: v.optional(v.array(v.string())),
    publishedDesign: v.optional(scanMeDesignValidator),
    publishedDescription: v.optional(v.string()),
    publishedPaletteAnalysis: v.optional(paletteAnalysisValidator),
    publishedBackgroundImageStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    publishedBackgroundVideoStorageId: v.optional(
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
    .index("by_serviceProfileId_and_draftState", [
      "serviceProfileId",
      "draftState",
    ])
    .index("by_serviceProfileId_and_draftState_and_updatedAt", [
      "serviceProfileId",
      "draftState",
      "updatedAt",
    ])
    .index("by_serviceProfileId_and_publishedState", [
      "serviceProfileId",
      "publishedState",
    ])
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
    .index("by_contactId", ["contactId"])
    .index("by_normalizedEmail", ["normalizedEmail"]),

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
    offerSelection: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    submissionId: v.string(),
    status: leadStatus,
    createdAt: v.number(),
  })
    .index("by_submissionId", ["submissionId"])
    .index("by_status_and_createdAt", ["status", "createdAt"]),

  offerLogoUploads: defineTable({
    sessionToken: v.string(),
    fileName: v.string(),
    storageId: v.optional(v.id("_storage")),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    status: v.union(
      v.literal("reserved"),
      v.literal("ready"),
      v.literal("attached"),
    ),
    leadId: v.optional(v.id("leads")),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  }),

  // ==========================================================================
  // Venue + Memories data model (RFC-001 §2.4). Shape only — no routes, UI,
  // image pipeline, guest identity, block types, or rate limiter land here.
  // Every index name is taken verbatim from the RFC's per-table catalog.
  // C.15 `celebrations` and C.16 `partnerships` are SPECIFIED in the RFC
  // (§2.4 C.15/C.16, §2.1.6) but deliberately NOT created here — they are added
  // when Memories is built. New tables start empty, so no `staged:` indexes.
  // ==========================================================================

  // C.1 — the events backbone (§2.2).
  events: defineTable({
    businessId: v.id("businesses"),
    slug: v.string(),
    title: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("live"),
      v.literal("ended"),
      v.literal("archived"),
    ),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    lifecycleRevision: v.number(),
    scheduledGoLiveId: v.optional(v.id("_scheduled_functions")),
    scheduledEndId: v.optional(v.id("_scheduled_functions")),
    duplicatedFromEventId: v.optional(v.id("events")),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_businessId_and_slug", ["businessId", "slug"])
    .index("by_businessId_and_status", ["businessId", "status"])
    .index("by_businessId_and_startsAt", ["businessId", "startsAt"])
    .index("by_status_and_startsAt", ["status", "startsAt"])
    .index("by_status_and_endsAt", ["status", "endsAt"]),

  // C.2 — venue event config (draft/publish contract; blocks embedded).
  venueEventConfigs: defineTable({
    eventId: v.id("events"),
    venueProfileId: v.id("serviceProfiles"),
    draftDisplayName: v.optional(v.string()),
    draftDesign: v.optional(venueDesignValidator),
    draftBlocks: v.optional(v.array(venueBlockValidator)),
    draftLogoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    draftBackgroundImageStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    draftBackgroundVideoStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    publishedDisplayName: v.optional(v.string()),
    publishedDesign: v.optional(venueDesignValidator),
    publishedBlocks: v.optional(v.array(venueBlockValidator)),
    publishedLogoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    publishedBackgroundImageStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    publishedBackgroundVideoStorageId: v.optional(
      v.union(v.id("_storage"), v.null()),
    ),
    hasUnpublishedChanges: v.boolean(),
    draftRevision: v.number(),
    publishedRevision: v.number(),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_venueProfileId", ["venueProfileId"]),

  // C.3 — archived-media picks for an event's archive gallery.
  eventArchiveItems: defineTable({
    eventId: v.id("events"),
    mediaAssetId: v.id("mediaAssets"),
    sourcePhotoId: v.optional(v.id("memoriesPhotos")),
    order: v.number(),
    createdAt: v.number(),
  })
    .index("by_eventId_and_order", ["eventId", "order"])
    .index("by_mediaAssetId", ["mediaAssetId"]),

  // C.4 — Memories spaces (one installation → /m/[code]).
  memoriesSpaces: defineTable({
    businessId: v.id("businesses"),
    memoriesProfileId: v.id("serviceProfiles"),
    code: v.string(),
    name: v.string(),
    mode: v.union(v.literal("recurring"), v.literal("one_off")),
    eventId: v.optional(v.id("events")),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("closed"),
      v.literal("archived"),
    ),
    windowStartAt: v.optional(v.number()),
    windowEndAt: v.optional(v.number()),
    nightCutoffHour: v.optional(v.number()),
    defaultVisibility: v.union(
      v.literal("everyone"),
      v.literal("host_only"),
    ),
    guestVisibilityChoice: v.boolean(),
    publicGalleryEnabled: v.boolean(),
    wallEnabled: v.boolean(),
    // TASK-22 STEP 4 — the "nervous host" switch. Off (or absent) → the wall
    // shows every everyone/ready photo the moment it commits. On → a photo must
    // be approved from the host gallery (memoriesPhotos.wallApproved) before the
    // wall query will surface it. Optional so every pre-TASK-22 space row
    // validates unchanged and reads as "approval not required".
    wallRequiresApproval: v.optional(v.boolean()),
    totalPhotos: v.number(),
    totalGuests: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_businessId_and_status", ["businessId", "status"])
    .index("by_memoriesProfileId", ["memoriesProfileId"])
    .index("by_eventId", ["eventId"]),

  // C.5 — sessions (nights).
  memoriesSessions: defineTable({
    spaceId: v.id("memoriesSpaces"),
    dateKey: v.string(),
    status: v.union(v.literal("open"), v.literal("closed")),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    scheduledCloseId: v.optional(v.id("_scheduled_functions")),
    photoCount: v.number(),
    guestCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_spaceId_and_dateKey", ["spaceId", "dateKey"])
    .index("by_status_and_openedAt", ["status", "openedAt"]),

  // TASK-24 — sharded counter rows for session.photoCount / space.totalPhotos
  // (convex/lib/countShards.ts). The doc fields stay as the base value; these
  // rows absorb the per-commit increments so two hundred concurrent commits
  // stop serializing on one session row and one space row. `key` is
  // "session:<id>" | "space:<id>".
  memoriesCountShards: defineTable({
    key: v.string(),
    shard: v.number(),
    value: v.number(),
  }).index("by_key_and_shard", ["key", "shard"]),

  // C.6 — guests (anonymous; cookie-bearer capability).
  memoriesGuests: defineTable({
    spaceId: v.id("memoriesSpaces"),
    guestKey: v.string(),
    cardId: v.optional(v.id("cards")),
    nickname: v.optional(v.string()),
    consentVersion: v.optional(v.string()),
    consentAt: v.optional(v.number()),
    photoCount: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_spaceId_and_guestKey", ["spaceId", "guestKey"])
    .index("by_cardId", ["cardId"]),

  // C.7 — guest photos.
  memoriesPhotos: defineTable({
    spaceId: v.id("memoriesSpaces"),
    sessionId: v.id("memoriesSessions"),
    guestId: v.id("memoriesGuests"),
    cardId: v.optional(v.id("cards")),
    mediaAssetId: v.optional(v.id("mediaAssets")),
    visibility: v.union(v.literal("everyone"), v.literal("host_only")),
    status: v.union(
      v.literal("reserved"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("hidden"),
      v.literal("deleted"),
    ),
    // TASK-22 STEP 4 — set true when a host approves a photo for the live wall
    // in a space that runs approve-before-wall. Ignored entirely by spaces that
    // do not require approval (the wall reads the 3-key index there). Optional
    // so it is absent/false until a host explicitly approves.
    wallApproved: v.optional(v.boolean()),
    originalStorageId: v.optional(v.id("_storage")),
    deletedReason: v.optional(
      v.union(
        v.literal("guest"),
        v.literal("host"),
        v.literal("admin"),
        v.literal("retention"),
        v.literal("gdpr_wipe"),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId_and_status", ["sessionId", "status"])
    // TASK-20 STEP 0 — the public gallery reads (sessionId, "ready", "everyone")
    // and paginates. Folding visibility INTO the index makes it part of the
    // indexed read rather than a post-cap filter: the old query took the newest
    // 150 `ready` rows and dropped `host_only` ones AFTER, so a night whose
    // newest rows were mostly host_only rendered nearly empty while everyone-
    // photos sat further back. With visibility in the key, every row the scan
    // yields is already public, and .paginate() walks all of them, not 150.
    .index("by_sessionId_and_status_and_visibility", [
      "sessionId",
      "status",
      "visibility",
    ])
    // TASK-22 STEP 4 — the approve-before-wall read. Folding wallApproved into
    // the key keeps the wall query a pure indexed read even when a host requires
    // approval: it scans straight into (sessionId,"ready","everyone",true), so
    // an unapproved-photo tail can never crowd approved photos out of the wall's
    // window, exactly as visibility is folded in for the public gallery. Spaces
    // that do not require approval never touch this index (they read the 3-key
    // one above); the worst-failure guarantee — host_only never on a projector —
    // is enforced by the "everyone" key in BOTH paths.
    .index("by_sessionId_and_status_and_visibility_and_wallApproved", [
      "sessionId",
      "status",
      "visibility",
      "wallApproved",
    ])
    .index("by_sessionId_and_guestId", ["sessionId", "guestId"])
    .index("by_guestId", ["guestId"])
    .index("by_spaceId_and_createdAt", ["spaceId", "createdAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  // C.8 — processed media assets (Convex file storage is the storage, §0.6).
  mediaAssets: defineTable({
    businessId: v.id("businesses"),
    kind: v.literal("image"),
    provider: v.literal("convex"),
    variants: v.object({
      avif: v.object({
        ref: v.string(),
        width: v.number(),
        height: v.number(),
        bytes: v.number(),
      }),
      webp: v.object({
        ref: v.string(),
        width: v.number(),
        height: v.number(),
        bytes: v.number(),
      }),
      thumb: v.object({
        ref: v.string(),
        width: v.number(),
        height: v.number(),
        bytes: v.number(),
      }),
    }),
    status: v.union(v.literal("ready"), v.literal("purged")),
    createdAt: v.number(),
  }).index("by_businessId_and_createdAt", ["businessId", "createdAt"]),

  // C.9 — cards + immutable retarget history (the /r/[cardCode] resolver).
  cards: defineTable({
    businessId: v.id("businesses"),
    cardCode: v.string(),
    label: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled")),
    currentTargetId: v.optional(v.id("cardTargets")),
    totalScans: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_cardCode", ["cardCode"])
    .index("by_businessId", ["businessId"]),

  cardTargets: defineTable({
    cardId: v.id("cards"),
    kind: cardTargetKind,
    spaceId: v.optional(v.id("memoriesSpaces")),
    eventId: v.optional(v.id("events")),
    serviceProfileId: v.optional(v.id("serviceProfiles")),
    url: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_cardId", ["cardId"]),

  // C.10 — card scan events + daily rollup.
  cardScanEvents: defineTable({
    cardId: v.id("cards"),
    requestId: v.string(),
    occurredAt: v.number(),
    targetKind: cardTargetKind,
    deviceCategory: v.optional(deviceCategory),
  })
    .index("by_cardId_and_occurredAt", ["cardId", "occurredAt"])
    .index("by_requestId", ["requestId"]),

  dailyCardMetrics: defineTable({
    cardId: v.id("cards"),
    dateKey: v.string(),
    scans: v.number(),
    updatedAt: v.number(),
  }).index("by_cardId_and_dateKey", ["cardId", "dateKey"]),

  // C.11 — admin quota raise/reset (additive grants).
  quotaAdjustments: defineTable({
    spaceId: v.id("memoriesSpaces"),
    sessionId: v.optional(v.id("memoriesSessions")),
    guestId: v.optional(v.id("memoriesGuests")),
    extraPhotos: v.number(),
    reason: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_spaceId_and_createdAt", ["spaceId", "createdAt"])
    .index("by_guestId", ["guestId"]),

  // C.12 — moderation / takedown intake.
  photoReports: defineTable({
    photoId: v.id("memoriesPhotos"),
    spaceId: v.id("memoriesSpaces"),
    reporterKind: v.union(
      v.literal("guest"),
      v.literal("host"),
      v.literal("admin"),
      v.literal("public"),
    ),
    reporterGuestId: v.optional(v.id("memoriesGuests")),
    reason: v.union(
      v.literal("inappropriate"),
      v.literal("privacy"),
      v.literal("copyright"),
      v.literal("other"),
    ),
    note: v.optional(v.string()),
    status: v.union(
      v.literal("open"),
      v.literal("actioned"),
      v.literal("dismissed"),
    ),
    resolvedByUserId: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_photoId", ["photoId"])
    .index("by_status_and_createdAt", ["status", "createdAt"]),

  // C.13 — entitlements (billing port target; read via getEntitlement, §2.3).
  entitlements: defineTable({
    businessId: v.id("businesses"),
    product: serviceType,
    planKey: v.string(),
    // Present = space-scoped; absent = business-scoped (§2.3 resolution order).
    spaceId: v.optional(v.id("memoriesSpaces")),
    status: v.union(v.literal("active"), v.literal("expired")),
    // Per-row overrides spread over PLAN_LIMITS in getEntitlement. Optional
    // subset of the known limit keys across both plan-bearing products.
    overrides: v.optional(
      v.object({
        photosPerGuest: v.optional(v.number()),
        maxImageDimension: v.optional(v.number()),
        retentionDays: v.optional(v.number()),
        allowedBlockKeys: v.optional(v.array(v.string())),
      }),
    ),
    source: v.union(v.literal("manual"), v.literal("billing")),
    externalRef: v.optional(v.string()),
    // Absent = perpetual (manual grants); the expiry cron only sweeps rows that
    // carry a numeric validUntil.
    validUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_businessId_and_product", ["businessId", "product"])
    .index("by_spaceId_and_status", ["spaceId", "status"])
    .index("by_status_and_validUntil", ["status", "validUntil"]),

  // C.14 — reservation-block submissions (child table, unbounded). The
  // reservation block's field config (name/phone/email/partySize/note) drives
  // which of these submitReservation accepts; every column except name is
  // optional so a block that disables a field simply never writes it.
  venueReservations: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    partySize: v.optional(v.number()),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_eventId_and_createdAt", ["eventId", "createdAt"]),

  // C.15 — celebrations (the product entity, §2.1.6). A celebration is a
  // product instance, not a tenant: its tenant is a `businesses` row with
  // kind: "celebration". `venueBusinessId` (held at) and `referredByBusinessId`
  // (sold by) are deliberately distinct and must never be conflated.
  celebrations: defineTable({
    businessId: v.id("businesses"), // the tenant row, kind === "celebration"
    kind: v.union(
      v.literal("svadba"),
      v.literal("rodjendan"),
      v.literal("krstenje"),
      v.literal("veridba"),
      v.literal("ispracaj"),
      v.literal("maturska"),
      v.literal("godisnjica"),
      v.literal("other"),
    ),
    title: v.string(), // e.g. "Jovana i Marko"
    celebrantNames: v.optional(v.string()),
    eventDate: v.number(),
    venueName: v.optional(v.string()), // free text — where it happens, partner or not
    venueBusinessId: v.optional(v.id("businesses")), // set only when that venue is on our platform
    acquisitionChannel: v.union(
      v.literal("direct"),
      v.literal("partner"),
      v.literal("ads"),
      v.literal("other"),
    ),
    referredByBusinessId: v.optional(v.id("businesses")), // WHO SOLD IT
    referralCommissionPercent: v.optional(v.number()), // snapshotted at sale time
    contactName: v.string(),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    status: v.union(
      v.literal("lead"),
      v.literal("booked"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_referredByBusinessId_and_status", [
      "referredByBusinessId",
      "status",
    ])
    .index("by_status_and_eventDate", ["status", "eventDate"])
    .index("by_venueBusinessId_and_eventDate", [
      "venueBusinessId",
      "eventDate",
    ]),

  // C.16 — partnerships (referral terms, §2.1.6). The standing agreement with a
  // partner; the commission percent is snapshotted onto each celebration row at
  // sale time, so renegotiating terms never rewrites past commissions.
  partnerships: defineTable({
    partnerBusinessId: v.id("businesses"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("ended"),
    ),
    commissionPercent: v.number(),
    productScope: v.array(serviceType), // which products this partner may refer
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_partnerBusinessId_and_status", ["partnerBusinessId", "status"])
    .index("by_status_and_startedAt", ["status", "startedAt"]),

  // TASK-21 — the host ZIP export (RFC-001 §2.10). One job row per export run.
  // The build is asynchronous (hundreds of MB cannot happen in a request), so
  // this row is the durable state a chain of scheduler continuations advances:
  // queued → building (with a live count) → ready (a stored archive + an expiry)
  // or failed (with a machine code the UI localizes). Dedupe lives on the row:
  // at most one queued/building job per space at a time (by_spaceId_and_status).
  memoriesExports: defineTable({
    spaceId: v.id("memoriesSpaces"),
    businessId: v.id("businesses"),
    // Who triggered it — a host member or an admin (NEVER a guest). Recorded for
    // the audit trail only; access is always re-checked at read/download time.
    requestedByUserId: v.optional(v.id("users")),
    status: v.union(
      v.literal("queued"),
      v.literal("building"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("expired"),
    ),
    // Machine code (see MEMORIES_EXPORT_ERROR); the panel maps it to a Serbian
    // sentence. Prose never lives here.
    error: v.optional(v.string()),
    // Live build bookkeeping, carried between continuations on the row itself so
    // a continuation only needs the jobId.
    cursor: v.optional(v.union(v.string(), v.null())),
    runningOffset: v.number(), // total bytes of local records written so far
    // Per-folder running counter for stable, gap-free "_01/_02" sequences.
    // Bounded by the number of tables (small). Keys are ASCII folder slugs.
    folderCounts: v.optional(v.record(v.string(), v.number())),
    // Ordered chunk blobs (one per processed batch); concatenated at finalize,
    // then deleted. Bounded by batchCount = ceil(photos / batch).
    chunkRefs: v.array(v.id("_storage")),
    encodedCount: v.number(), // photos encoded into chunks so far
    // The finished archive and how long its link lives.
    archiveStorageId: v.optional(v.id("_storage")),
    archiveBytes: v.optional(v.number()),
    photoCount: v.optional(v.number()), // survivors actually in the archive
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_spaceId_and_status", ["spaceId", "status"])
    .index("by_spaceId_and_createdAt", ["spaceId", "createdAt"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"]),

  // TASK-21 — one row per photo written into an export's chunks. Holds exactly
  // the central-directory bookkeeping (offset/crc/size/name/dosDate/dosTime) plus
  // the metadata.json facts (table/timestamp/visibility/dimensions) — NO guest
  // identifier. `photoId` is kept ONLY so finalize can re-check the photo is
  // still `ready` (deletions win); it never leaves the server. A child table,
  // not an array on the job row, because the count is unbounded per §schema.
  memoriesExportEntries: defineTable({
    jobId: v.id("memoriesExports"),
    photoId: v.id("memoriesPhotos"),
    seq: v.number(), // global write order, for a stable central directory
    name: v.string(), // in-archive path, e.g. "Sto 4/2026-…_01.jpg"
    tableLabel: v.union(v.string(), v.null()),
    crc: v.number(),
    size: v.number(),
    offset: v.number(),
    dosDate: v.number(),
    dosTime: v.number(),
    takenAt: v.number(), // photo createdAt (epoch ms)
    visibility: v.union(v.literal("everyone"), v.literal("host_only")),
    width: v.number(),
    height: v.number(),
  }).index("by_jobId_and_seq", ["jobId", "seq"]),
});
