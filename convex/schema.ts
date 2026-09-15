import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { accessActor, accessAttribution, accessColor, accessDestinationInput, accessDestinationKind, accessHealth, accessKind, accessState } from "./lib/accessValidators";
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
import { priceSnapshotValidator } from "./lib/orderSnapshot";
import {
  agreementKind, billingActor, billingChange, billingPeriod, discountValue,
  lifecycleFacts, money, paymentLedger, paymentMethod, subscriptionPrice, subscriptionTarget,
} from "./lib/subscriptionValidators";
import {
  accountContactStatusValidator,
  accountTagKindValidator,
  clientLifecycleStatusValidator,
  clientRoleValidator,
  membershipVenueAccessValidator,
} from "./lib/adminV1Validators";
import {
  actionActorValidator,
  actionDuePrecisionValidator,
  actionEventKindValidator,
  actionPriorityClassValidator,
  actionResolutionRuleValidator,
  actionSeverityValidator,
  actionSignalValidator,
  actionSourceDomainValidator,
  actionStateValidator,
  adminV1ServiceTypeValidator,
  productOperationalStatusValidator,
  productTypeValidator,
  serviceAggregateValidator,
  serviceOperationalStateValidator,
  serviceSummariesValidator,
} from "./lib/adminActionValidators";
import {
  communicationActorKindValidator,
  communicationChannelValidator,
  communicationDirectionValidator,
  conversationEventKindValidator,
  conversationStatusValidator,
} from "./lib/adminCommunicationValidators";
import {
  emailProviderAttachmentDownloadStateValidator,
  emailProviderAttachmentStateValidator,
  emailProviderAuditEventValidator,
  emailProviderAuditOutcomeValidator,
  emailProviderMappingStateValidator,
  emailProviderOperationalStateValidator,
  emailProviderOutboxStateValidator,
  emailProviderValidator,
} from "./lib/emailProviderValidators";
import {
  taskActiveStatusValidator,
  taskDueValidator,
  taskEventFieldValidator,
  taskEventKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
  taskSubjectKindValidator,
  taskSubjectValidator,
  taskTimePhaseValidator,
  taskViewValidator,
} from "./lib/adminTaskValidators";
import {
  adminDeliveryMethodValidator,
  adminDeliveryStateValidator,
  adminOrderAxisValidator,
  adminOrderDesignKindValidator,
  adminOrderDesignStateValidator,
  adminOrderEventKindValidator,
  adminOrderFulfillmentStateValidator,
  adminOrderPaymentStateValidator,
  adminOrderPriorityValidator,
  adminOrderProductConfigValidator,
  adminOrderProductTypeValidator,
  adminOrderViewValidator,
  adminPrintJobStateValidator,
} from "./lib/adminOrderValidators";

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
// convex/cards.ts arg validators (TASK-14). "splitter" (TASK-37, RFC-002 §2.4)
// is the bare splitter: one card serving several services resolves to a
// button page under /r/[cardCode]/izbor instead of a single destination.
export const cardTargetKind = v.union(
  v.literal("memories_space"),
  v.literal("venue"),
  v.literal("event"),
  v.literal("service_page"),
  v.literal("url"),
  v.literal("splitter"),
);

// One button on a bare splitter (RFC-002 §2.4, TASK-37): the same per-kind
// reference shape as a direct card target, minus "splitter" itself (no
// nesting, by construction) plus the button label. The exact block model was
// RFC-002 §5 Q8's open question — this is the deliberately minimal answer.
export const cardSplitterItem = v.object({
  kind: v.union(
    v.literal("menu"), // ADMIN-12: Review + Menu uses the existing generic splitter.
    v.literal("memories_space"),
    v.literal("venue"),
    v.literal("event"),
    v.literal("service_page"),
    v.literal("url"),
  ),
  label: v.string(),
  spaceId: v.optional(v.id("memoriesSpaces")),
  eventId: v.optional(v.id("events")),
  serviceProfileId: v.optional(v.id("serviceProfiles")),
  url: v.optional(v.string()),
});

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
    // "expired" (TASK-32) is flipped by the daily billing-cycle sweep once
    // planValidUntil + grace has elapsed, and flipped back to "active" by a
    // recorded payment. "suspended" is an ADMIN decision and only an admin
    // lifts it. getEntitlement step 3 requires "active", so both cut the
    // account-plan tier with zero change to the read path.
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("expired"),
    ),
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
    // The account's paid-through / next-billing date (TASK-32). In the
    // manual-first world the account gets ONE recurring bill (plan + services
    // together), and this is the date the next payment is due. Absent =
    // perpetual (no cycle tracked). Advanced by every recorded payment
    // (convex/billing.ts); the daily billing-cycle sweep flips status to
    // "expired" once this date + GRACE_DAYS has elapsed.
    planValidUntil: v.optional(v.number()),
    // ADMIN-03: one billing writer per account. Legacy dates remain evidence,
    // never a reverse projection of independent subscription cycles.
    billingModel: v.optional(v.literal("subscriptions_v1")),
    // ADMIN-02 widen phase. These fields are optional until the explicit,
    // fixture-proven legacy migration has completed for every client account.
    smkCode: v.optional(v.string()),
    ownerDisplayName: v.optional(v.string()),
    normalizedOwnerDisplayName: v.optional(v.string()),
    clientStatus: v.optional(clientLifecycleStatusValidator),
    primaryOwnerMembershipId: v.optional(v.id("accountMemberships")),
    defaultContactId: v.optional(v.id("accountContacts")),
    adminV1MigrationVersion: v.optional(v.number()),
    adminV1MigratedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    // The billing-cycle sweep's range: active accounts whose paid-through date
    // (+ grace) has passed.
    .index("by_status_and_planValidUntil", ["status", "planValidUntil"])
    .index("by_billingModel_and_status_and_planValidUntil", ["billingModel", "status", "planValidUntil"])
    .index("by_smkCode", ["smkCode"])
    .index("by_clientStatus_and_updatedAt", ["clientStatus", "updatedAt"])
    .index("by_normalizedOwnerDisplayName", ["normalizedOwnerDisplayName"]),

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
    // ADMIN-02 widen fields. `status` remains the legacy runtime status until
    // its later owner is migrated; clientStatus is the active/archived axis.
    smlCode: v.optional(v.string()),
    clientStatus: v.optional(clientLifecycleStatusValidator),
    normalizedName: v.optional(v.string()),
    city: v.optional(v.string()),
    normalizedCity: v.optional(v.string()),
    address: v.optional(v.string()),
    legalEntityId: v.optional(v.id("legalEntities")),
    brandId: v.optional(v.id("brands")),
    venueGroupId: v.optional(v.id("venueGroups")),
    defaultContactOverrideId: v.optional(v.id("accountContacts")),
    adminV1MigrationVersion: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    logoStorageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
    status: businessStatus,
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_account", ["accountId"])
    .index("by_smlCode", ["smlCode"])
    .index("by_accountId_and_clientStatus", ["accountId", "clientStatus"])
    .index("by_accountId_and_normalizedName", ["accountId", "normalizedName"])
    .index("by_normalizedName_and_normalizedCity", ["normalizedName", "normalizedCity"]),

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
    .index("by_businessId_and_status_and_type", ["businessId", "status", "type"])
    .index("by_type_and_status", ["type", "status"]),

  // ADMIN-04: one server-authoritative operational cause. The causeId is a
  // stable domain + source-record + cause-kind key, so every surface refers to
  // the same row and a repeated adapter run is an upsert rather than a clone.
  actionItems: defineTable({
    causeId: v.string(),
    sourceDomain: actionSourceDomainValidator,
    sourceRecordId: v.string(),
    causeKind: v.string(),
    sourceVersion: v.string(),
    sourceFingerprint: v.string(),
    accountId: v.optional(v.id("accounts")),
    businessId: v.optional(v.id("businesses")),
    serviceProfileId: v.optional(v.id("serviceProfiles")),
    productRef: v.optional(v.string()),
    severity: actionSeverityValidator,
    severityRank: v.number(),
    state: actionStateValidator,
    assigneeId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    duePrecision: v.optional(actionDuePrecisionValidator),
    priorityClass: actionPriorityClassValidator,
    priorityRank: v.number(),
    priorityAt: v.number(),
    relevantAt: v.number(),
    snoozedUntil: v.optional(v.number()),
    snoozeReason: v.optional(v.string()),
    snoozedByUserId: v.optional(v.id("users")),
    contextHref: v.optional(v.string()),
    description: v.optional(v.string()),
    resolutionRule: actionResolutionRuleValidator,
    resolvedAt: v.optional(v.number()),
    resolvedByKind: v.optional(v.union(v.literal("admin"), v.literal("system"))),
    resolvedByUserId: v.optional(v.id("users")),
    resolutionNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_causeId", ["causeId"])
    .index("by_state_and_priorityRank_and_priorityAt_and_causeId", ["state", "priorityRank", "priorityAt", "causeId"])
    .index("by_assignee_state_priority", ["assigneeId", "state", "priorityRank", "priorityAt", "causeId"])
    .index("by_state_and_snoozedUntil", ["state", "snoozedUntil"])
    .index("by_assigneeId_and_state_and_snoozedUntil", ["assigneeId", "state", "snoozedUntil"])
    .index("by_account_state_severity_priority", ["accountId", "state", "severityRank", "priorityRank", "priorityAt", "causeId"])
    .index("by_business_state_severity_priority", ["businessId", "state", "severityRank", "priorityRank", "priorityAt", "causeId"])
    .index("by_product_state_severity_priority", ["productRef", "state", "severityRank", "priorityRank", "priorityAt", "causeId"])
    .index("by_source_record_state_priority", ["sourceDomain", "sourceRecordId", "state", "priorityRank", "priorityAt", "causeId"]),

  // Append-only audit of every lifecycle transition. Opening a record is not
  // an event because ADMIN-04 explicitly separates reading from resolution.
  actionItemEvents: defineTable({
    actionItemId: v.id("actionItems"),
    causeId: v.string(),
    event: actionEventKindValidator,
    actor: actionActorValidator,
    fromState: v.optional(actionStateValidator),
    toState: v.optional(actionStateValidator),
    reason: v.optional(v.string()),
    until: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_actionItemId_and_createdAt", ["actionItemId", "createdAt"])
    .index("by_causeId_and_createdAt", ["causeId", "createdAt"]),

  // Materialized one-row-per-entity directory. This is the bounded server read
  // path for 500 venues / 10k products; source joins happen only while syncing.
  adminClientReadModels: defineTable({
    accountId: v.id("accounts"),
    smkCode: v.string(),
    accountName: v.string(),
    ownerDisplayName: v.string(),
    normalizedOwnerDisplayName: v.string(),
    defaultContactEmail: v.union(v.string(), v.null()),
    defaultContactPhone: v.union(v.string(), v.null()),
    firstVenueName: v.union(v.string(), v.null()),
    firstVenueSlug: v.optional(v.union(v.string(), v.null())),
    venueCount: v.number(),
    clientStatus: clientLifecycleStatusValidator,
    signal: actionSignalValidator,
    urgencyRank: v.number(),
    serviceSummaries: serviceSummariesValidator,
    // ADMIN-06 widen field. Older materialized rows remain valid until their
    // next normal sync; the public adapter maps absence to no badge.
    premiumStatus: v.optional(
      v.union(v.literal("active"), v.literal("grace"), v.null()),
    ),
    searchText: v.string(),
    updatedAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_urgencyRank_and_normalizedOwnerDisplayName", ["urgencyRank", "normalizedOwnerDisplayName"])
    .index("by_normalizedOwnerDisplayName", ["normalizedOwnerDisplayName"])
    .index("by_updatedAt", ["updatedAt"])
    .index("by_clientStatus_and_urgencyRank_and_normalizedOwnerDisplayName", ["clientStatus", "urgencyRank", "normalizedOwnerDisplayName"])
    .index("by_clientStatus_and_normalizedOwnerDisplayName", ["clientStatus", "normalizedOwnerDisplayName"])
    .index("by_clientStatus_and_updatedAt", ["clientStatus", "updatedAt"])
    .searchIndex("search_searchText", { searchField: "searchText", filterFields: ["clientStatus"] }),

  adminVenueReadModels: defineTable({
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    smkCode: v.string(),
    smlCode: v.string(),
    ownerDisplayName: v.string(),
    venueName: v.string(),
    normalizedVenueName: v.string(),
    city: v.union(v.string(), v.null()),
    effectiveContactEmail: v.union(v.string(), v.null()),
    effectiveContactPhone: v.union(v.string(), v.null()),
    productCount: v.number(),
    channelCount: v.number(),
    serviceTypes: v.array(adminV1ServiceTypeValidator),
    clientStatus: clientLifecycleStatusValidator,
    signal: actionSignalValidator,
    // Additive operational predicate for the ADMIN-13 venue-first problem
    // filter. It is updated from the canonical action projection, not a UI
    // guess about activity.
    hasOpenAction: v.optional(v.boolean()),
    // Canonical SMF/channel counters are maintained by the ADMIN-12 inventory
    // projection. Legacy directory rows stay explicitly incomplete until a
    // bounded reconciliation can prove every value.
    productFactsComplete: v.optional(v.boolean()),
    canonicalProductCount: v.optional(v.number()),
    canonicalQrCount: v.optional(v.number()),
    canonicalNfcCount: v.optional(v.number()),
    canonicalActiveChannelCount: v.optional(v.number()),
    canonicalProblemCount: v.optional(v.number()),
    urgencyRank: v.number(),
    searchText: v.string(),
    updatedAt: v.number(),
  })
    .index("by_businessId", ["businessId"])
    .index("by_accountId_and_normalizedVenueName", ["accountId", "normalizedVenueName"])
    .index("by_urgencyRank_and_normalizedVenueName", ["urgencyRank", "normalizedVenueName"])
    .index("by_normalizedVenueName", ["normalizedVenueName"])
    .index("by_updatedAt", ["updatedAt"])
    .index("by_clientStatus_and_urgencyRank_and_normalizedVenueName", ["clientStatus", "urgencyRank", "normalizedVenueName"])
    .index("by_clientStatus_and_normalizedVenueName", ["clientStatus", "normalizedVenueName"])
    .index("by_clientStatus_and_updatedAt", ["clientStatus", "updatedAt"])
    .index("by_account_status_urgency_name", ["accountId", "clientStatus", "urgencyRank", "normalizedVenueName"])
    .index("by_accountId_and_clientStatus_and_normalizedVenueName", ["accountId", "clientStatus", "normalizedVenueName"])
    .index("by_hasOpenAction_and_urgencyRank_and_normalizedVenueName", ["hasOpenAction", "urgencyRank", "normalizedVenueName"])
    .index("by_hasOpenAction_and_normalizedVenueName", ["hasOpenAction", "normalizedVenueName"])
    .index("by_account_action_urgency_name", ["accountId", "hasOpenAction", "urgencyRank", "normalizedVenueName"])
    .index("by_accountId_and_hasOpenAction_and_normalizedVenueName", ["accountId", "hasOpenAction", "normalizedVenueName"])
    .index("by_accountId_and_urgencyRank_and_normalizedVenueName", ["accountId", "urgencyRank", "normalizedVenueName"])
    .searchIndex("search_searchText", { searchField: "searchText", filterFields: ["clientStatus", "accountId", "hasOpenAction"] }),

  adminProductReadModels: defineTable({
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    sourceRecordId: v.string(),
    smkCode: v.string(),
    smlCode: v.string(),
    smfCode: v.string(),
    smqCodes: v.array(v.string()),
    ownerDisplayName: v.string(),
    venueName: v.string(),
    productType: productTypeValidator,
    displayName: v.string(),
    normalizedDisplayName: v.string(),
    operationalStatus: productOperationalStatusValidator,
    signal: actionSignalValidator,
    urgencyRank: v.number(),
    searchText: v.string(),
    updatedAt: v.number(),
  })
    .index("by_sourceRecordId", ["sourceRecordId"])
    .index("by_urgencyRank_and_normalizedDisplayName", ["urgencyRank", "normalizedDisplayName"])
    .index("by_normalizedDisplayName", ["normalizedDisplayName"])
    .index("by_updatedAt", ["updatedAt"])
    .index("by_operationalStatus_and_urgencyRank_and_normalizedDisplayName", ["operationalStatus", "urgencyRank", "normalizedDisplayName"])
    .index("by_operationalStatus_and_normalizedDisplayName", ["operationalStatus", "normalizedDisplayName"])
    .index("by_operationalStatus_and_updatedAt", ["operationalStatus", "updatedAt"])
    .searchIndex("search_searchText", { searchField: "searchText", filterFields: ["operationalStatus"] }),

  adminServiceStates: defineTable({
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    serviceProfileId: v.id("serviceProfiles"),
    serviceType: adminV1ServiceTypeValidator,
    state: serviceOperationalStateValidator,
    updatedAt: v.number(),
  })
    .index("by_serviceProfileId", ["serviceProfileId"])
    .index("by_accountId_and_serviceType", ["accountId", "serviceType"]),

  adminServiceAggregates: defineTable({
    accountId: v.id("accounts"),
    serviceType: adminV1ServiceTypeValidator,
    summary: serviceAggregateValidator,
    updatedAt: v.number(),
  }).index("by_accountId_and_serviceType", ["accountId", "serviceType"]),

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
    // Transitional source link used by the idempotent ADMIN-02 migration.
    accountContactId: v.optional(v.id("accountContacts")),
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

  // ADMIN-02 — account-scoped organization and access model. All tables are
  // new and therefore start empty; existing rows stay valid during widen.
  legalEntities: defineTable({
    accountId: v.id("accounts"),
    name: v.string(),
    normalizedName: v.string(),
    taxId: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_accountId_and_normalizedName", ["accountId", "normalizedName"])
    .index("by_taxId", ["taxId"]),

  accountContacts: defineTable({
    accountId: v.id("accounts"),
    firstName: v.string(),
    lastName: v.string(),
    normalizedName: v.string(),
    normalizedEmail: v.optional(v.string()),
    normalizedPhone: v.optional(v.string()),
    positionTitle: v.string(),
    isOwner: v.boolean(),
    status: accountContactStatusValidator,
    authUserId: v.optional(v.id("users")),
    legacyBusinessContactId: v.optional(v.id("businessContacts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_accountId_and_status", ["accountId", "status"])
    .index("by_accountId_and_normalizedEmail", ["accountId", "normalizedEmail"])
    .index("by_accountId_and_normalizedPhone", ["accountId", "normalizedPhone"])
    .index("by_normalizedEmail", ["normalizedEmail"])
    .index("by_normalizedPhone", ["normalizedPhone"])
    .index("by_legacyBusinessContactId", ["legacyBusinessContactId"]),

  accountMemberships: defineTable({
    accountId: v.id("accounts"),
    userId: v.id("users"),
    contactId: v.optional(v.id("accountContacts")),
    role: clientRoleValidator,
    active: v.boolean(),
    venueAccess: membershipVenueAccessValidator,
    canBuyServices: v.boolean(),
    canBuyPremium: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_accountId_and_userId", ["accountId", "userId"])
    .index("by_userId_and_active", ["userId", "active"])
    .index("by_accountId_and_active", ["accountId", "active"])
    .index("by_accountId_and_role", ["accountId", "role"]),

  accountMembershipVenueScopes: defineTable({
    membershipId: v.id("accountMemberships"),
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    createdAt: v.number(),
  })
    .index("by_membershipId_and_businessId", ["membershipId", "businessId"])
    .index("by_membershipId", ["membershipId"])
    .index("by_businessId", ["businessId"]),

  // ADMIN-08: provider-neutral communication core. List-facing labels and the
  // latest-message snapshot are denormalized so Inbox pagination never needs
  // a per-row join. Panel timestamps are authoritative receipt watermarks for
  // admin outbound chat; they are never returned by the client-safe API.
  conversations: defineTable({
    accountId: v.id("accounts"),
    accountName: v.string(),
    smkCode: v.string(),
    contactId: v.id("accountContacts"),
    contactName: v.string(),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    businessId: v.optional(v.id("businesses")),
    businessName: v.optional(v.string()),
    channel: communicationChannelValidator,
    status: conversationStatusValidator,
    assigneeAdminId: v.optional(v.id("users")),
    assigneeName: v.optional(v.string()),
    assigneeKey: v.string(),
    latestMessagePreview: v.string(),
    latestMessageAt: v.number(),
    latestMessageDirection: communicationDirectionValidator,
    latestMessageAuthorName: v.string(),
    adminUnreadCount: v.number(),
    searchText: v.string(),
    clientOpenedPanelAt: v.optional(v.number()),
    clientOpenedConversationAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_updatedAt", ["updatedAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"])
    .index("by_channel_and_updatedAt", ["channel", "updatedAt"])
    .index("by_assigneeKey_and_updatedAt", ["assigneeKey", "updatedAt"])
    .index("by_accountId_and_updatedAt", ["accountId", "updatedAt"])
    .index("by_accountId_and_contactId_and_updatedAt", ["accountId", "contactId", "updatedAt"])
    .index("by_businessId_and_contactId_and_channel", ["businessId", "contactId", "channel"])
    .searchIndex("search_inbox", {
      searchField: "searchText",
      filterFields: ["status", "channel", "assigneeKey", "accountId", "contactId"],
    }),

  conversationMessages: defineTable({
    conversationId: v.id("conversations"),
    accountId: v.id("accounts"),
    contactId: v.id("accountContacts"),
    businessId: v.optional(v.id("businesses")),
    channel: communicationChannelValidator,
    direction: communicationDirectionValidator,
    authorKind: communicationActorKindValidator,
    authorUserId: v.optional(v.id("users")),
    authorContactId: v.optional(v.id("accountContacts")),
    authorDisplayName: v.string(),
    content: v.string(),
    clientMessageId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"])
    .index("by_accountId_and_clientMessageId", ["accountId", "clientMessageId"]),

  conversationEvents: defineTable({
    conversationId: v.id("conversations"),
    accountId: v.id("accounts"),
    messageId: v.optional(v.id("conversationMessages")),
    event: conversationEventKindValidator,
    actorKind: communicationActorKindValidator,
    actorUserId: v.optional(v.id("users")),
    actorContactId: v.optional(v.id("accountContacts")),
    fromStatus: v.optional(conversationStatusValidator),
    toStatus: v.optional(conversationStatusValidator),
    previousAssigneeAdminId: v.optional(v.id("users")),
    nextAssigneeAdminId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"])
    .index("by_accountId_and_createdAt", ["accountId", "createdAt"]),

  // ADMIN-10: canonical client-linked work. Display fields are intentionally
  // denormalized so list pagination never performs per-row joins.
  clientTasks: defineTable({
    accountId: v.id("accounts"),
    accountName: v.string(),
    smkCode: v.string(),
    contactId: v.optional(v.id("accountContacts")),
    contactName: v.optional(v.string()),
    businessId: v.optional(v.id("businesses")),
    businessName: v.optional(v.string()),
    smlCode: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
    subject: v.optional(taskSubjectValidator),
    subjectKind: taskSubjectKindValidator,
    subjectLabel: v.optional(v.string()),
    subjectHref: v.optional(v.string()),
    orderOperationId: v.optional(v.id("orderOperations")),
    title: v.string(),
    description: v.string(),
    assigneeId: v.id("users"),
    assigneeName: v.string(),
    priority: taskPriorityValidator,
    priorityRank: v.number(),
    due: v.optional(taskDueValidator),
    dueAt: v.optional(v.number()),
    dueSortAt: v.number(),
    dueDay: v.optional(v.string()),
    dueVersion: v.string(),
    timePhase: taskTimePhaseValidator,
    status: taskStatusValidator,
    view: taskViewValidator,
    resumeStatus: v.optional(taskActiveStatusValidator),
    deferredUntil: v.optional(v.number()),
    deferredReason: v.optional(v.string()),
    searchText: v.string(),
    participantCount: v.number(),
    createCommandId: v.string(),
    createdByUserId: v.id("users"),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_creator_and_command", ["createdByUserId", "createCommandId"])
    .index("by_view_and_dueSortAt_and_priorityRank", ["view", "dueSortAt", "priorityRank"])
    .index("by_view_and_timePhase_and_dueSortAt", ["view", "timePhase", "dueSortAt"])
    .index("by_assignee_and_view_and_dueSortAt", ["assigneeId", "view", "dueSortAt"])
    .index("by_assignee_view_phase_dueSortAt", ["assigneeId", "view", "timePhase", "dueSortAt"])
    .index("by_account_and_view_and_dueSortAt", ["accountId", "view", "dueSortAt"])
    .index("by_business_and_view_and_dueSortAt", ["businessId", "view", "dueSortAt"])
    .index("by_subjectKind_and_view_and_dueSortAt", ["subjectKind", "view", "dueSortAt"])
    .index("by_orderOperationId_and_view_and_updatedAt", ["orderOperationId", "view", "updatedAt"])
    .index("by_status_and_dueAt", ["status", "dueAt"])
    .index("by_view_and_updatedAt", ["view", "updatedAt"])
    .searchIndex("search_tasks", {
      searchField: "searchText",
      filterFields: ["view", "timePhase", "status", "assigneeId", "accountId", "businessId", "subjectKind"],
    }),

  clientTaskParticipants: defineTable({
    taskId: v.id("clientTasks"),
    userId: v.id("users"),
    userName: v.string(),
    addedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_taskId_and_userId", ["taskId", "userId"])
    .index("by_taskId", ["taskId"])
    .index("by_userId_and_taskId", ["userId", "taskId"]),

  // Append-only task history. commandId makes every write retry-safe without
  // weakening the canonical action-item idempotency boundary.
  clientTaskEvents: defineTable({
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    event: taskEventKindValidator,
    field: taskEventFieldValidator,
    actorKind: v.union(v.literal("admin"), v.literal("system")),
    actorUserId: v.optional(v.id("users")),
    actorName: v.string(),
    before: v.optional(v.string()),
    after: v.optional(v.string()),
    reason: v.optional(v.string()),
    until: v.optional(v.number()),
    targetAdminId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_taskId_and_createdAt", ["taskId", "createdAt"])
    .index("by_taskId_and_commandId", ["taskId", "commandId"]),

  // ADMIN-09B: provider-specific operational state stays outside the
  // provider-neutral ADMIN-08 conversation core. Credentials never belong in
  // these tables; only server environment configuration may hold them.
  emailProviderConnections: defineTable({
    provider: emailProviderValidator,
    operationalState: emailProviderOperationalStateValidator,
    providerAccountId: v.optional(v.string()),
    inboxFolderId: v.optional(v.string()),
    sentFolderId: v.optional(v.string()),
    fromAddress: v.optional(v.string()),
    syncEnabled: v.boolean(),
    outboundEnabled: v.boolean(),
    groupSendAsVerified: v.boolean(),
    accountVerifiedAt: v.optional(v.number()),
    foldersVerifiedAt: v.optional(v.number()),
    lastSuccessfulSyncAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_operationalState", ["operationalState"]),

  emailProviderFolderCheckpoints: defineTable({
    connectionId: v.id("emailProviderConnections"),
    folderId: v.string(),
    checkpointReceivedAt: v.optional(v.number()),
    checkpointProviderMessageId: v.optional(v.string()),
    continuationStart: v.optional(v.number()),
    lastSuccessfulSyncAt: v.optional(v.number()),
    retryAttempt: v.number(),
    nextAttemptAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_connectionId_and_folderId", ["connectionId", "folderId"]),

  emailProviderSyncLeases: defineTable({
    connectionId: v.id("emailProviderConnections"),
    leaseToken: v.string(),
    acquiredAt: v.number(),
    expiresAt: v.number(),
  }).index("by_connectionId", ["connectionId"]),

  emailProviderMessages: defineTable({
    connectionId: v.id("emailProviderConnections"),
    provider: emailProviderValidator,
    providerAccountId: v.string(),
    providerMessageId: v.string(),
    folderId: v.string(),
    providerThreadId: v.optional(v.string()),
    rfcMessageId: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    references: v.array(v.string()),
    senderAddress: v.string(),
    subject: v.string(),
    safePreview: v.string(),
    plainTextContent: v.optional(v.string()),
    receivedAt: v.number(),
    providerReadState: v.optional(v.string()),
    mappingState: emailProviderMappingStateValidator,
    conversationId: v.optional(v.id("conversations")),
    conversationMessageId: v.optional(v.id("conversationMessages")),
    duplicateOfMessageId: v.optional(v.id("emailProviderMessages")),
    attachmentState: emailProviderAttachmentStateValidator,
    poisonCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_and_providerAccountId_and_providerMessageId", [
      "provider",
      "providerAccountId",
      "providerMessageId",
    ])
    .index("by_connectionId_and_providerMessageId", [
      "connectionId",
      "providerMessageId",
    ])
    .index("by_connectionId_and_providerThreadId", [
      "connectionId",
      "providerThreadId",
    ])
    .index("by_connectionId_and_rfcMessageId", [
      "connectionId",
      "rfcMessageId",
    ])
    .index("by_mappingState_and_receivedAt", ["mappingState", "receivedAt"])
    .index("by_conversationId_and_receivedAt", ["conversationId", "receivedAt"]),

  emailProviderAttachments: defineTable({
    providerMessageId: v.id("emailProviderMessages"),
    providerAttachmentId: v.string(),
    fileName: v.string(),
    size: v.number(),
    mimeType: v.optional(v.string()),
    inline: v.boolean(),
    downloadState: emailProviderAttachmentDownloadStateValidator,
    storageId: v.optional(v.id("_storage")),
    failureCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_providerMessageId", ["providerMessageId"])
    .index("by_providerMessageId_and_providerAttachmentId", [
      "providerMessageId",
      "providerAttachmentId",
    ]),

  emailProviderOutbox: defineTable({
    connectionId: v.id("emailProviderConnections"),
    conversationId: v.id("conversations"),
    adminUserId: v.id("users"),
    sendCommandId: v.string(),
    replyToProviderMessageId: v.optional(v.string()),
    fromAddress: v.string(),
    toAddress: v.string(),
    subject: v.string(),
    plainTextContent: v.string(),
    state: emailProviderOutboxStateValidator,
    providerMessageId: v.optional(v.string()),
    providerMailId: v.optional(v.string()),
    reconciliationAttempt: v.number(),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_connectionId_and_sendCommandId", ["connectionId", "sendCommandId"])
    .index("by_state_and_updatedAt", ["state", "updatedAt"])
    .index("by_conversationId_and_updatedAt", ["conversationId", "updatedAt"]),

  emailProviderAudit: defineTable({
    connectionId: v.optional(v.id("emailProviderConnections")),
    provider: emailProviderValidator,
    event: emailProviderAuditEventValidator,
    outcome: emailProviderAuditOutcomeValidator,
    safeCode: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    sendCommandId: v.optional(v.string()),
    runId: v.optional(v.string()),
    count: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_connectionId_and_createdAt", ["connectionId", "createdAt"])
    .index("by_event_and_createdAt", ["event", "createdAt"]),

  brands: defineTable({
    accountId: v.id("accounts"),
    name: v.string(),
    normalizedName: v.string(),
    revision: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    colors: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_accountId_and_normalizedName", ["accountId", "normalizedName"]),

  venueGroups: defineTable({
    accountId: v.id("accounts"),
    name: v.string(),
    normalizedName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_accountId_and_normalizedName", ["accountId", "normalizedName"]),

  accountTags: defineTable({
    accountId: v.id("accounts"),
    kind: accountTagKindValidator,
    label: v.optional(v.string()),
    normalizedLabel: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_accountId_and_kind", ["accountId", "kind"])
    .index("by_accountId_and_normalizedLabel", ["accountId", "normalizedLabel"]),

  adminV1MigrationMappings: defineTable({
    version: v.number(),
    sourceKind: v.union(
      v.literal("business_contact"),
      v.literal("business_membership"),
    ),
    sourceId: v.string(),
    targetKind: v.union(
      v.literal("account_contact"),
      v.literal("account_membership"),
    ),
    targetId: v.string(),
    createdAt: v.number(),
  })
    .index("by_version_and_sourceKind_and_sourceId", [
      "version",
      "sourceKind",
      "sourceId",
    ])
    .index("by_targetKind_and_targetId", ["targetKind", "targetId"]),

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
    accessChannelId: v.optional(v.id("accessChannels")),
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
    // kind === "splitter" only (TASK-37): the bare splitter's button list.
    splitterItems: v.optional(v.array(cardSplitterItem)),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_cardId", ["cardId"]),

  // C.10 — card scan events + daily rollup.
  cardScanEvents: defineTable({
    ...accessAttribution,
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

  // ADMIN-12. A subject owns ONE current destination. cards remain the public
  // token registry and immutable target/event store, including legacy rows.
  accessSubjects: defineTable({
    accountId: v.id("accounts"), businessId: v.id("businesses"),
    physicalProductId: v.optional(v.id("physicalProducts")),
    digitalQrId: v.optional(v.id("digitalQrCodes")),
    anchorCardId: v.optional(v.id("cards")),
    currentTargetId: v.optional(v.id("cardTargets")),
    destinationKind: accessDestinationKind,
    destinationInput: v.optional(accessDestinationInput),
    currentPlacementId: v.optional(v.id("productPlacements")),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_businessId", ["businessId"]),

  physicalProducts: defineTable({
    accountId: v.id("accounts"), businessId: v.id("businesses"),
    subjectId: v.id("accessSubjects"), smfCode: v.string(), localSuffix: v.string(),
    orderId: v.id("orders"), orderLineId: v.id("orderLines"),
    provisioningRequestId: v.id("orderProvisioningRequests"), unitOrdinal: v.number(),
    productType: adminOrderProductTypeValidator,
    designSnapshot: adminOrderProductConfigValidator,
    designApprovalId: v.optional(v.id("orderDesignApprovals")),
    boundServices: v.array(serviceType),
    printJobId: v.optional(v.id("printJobs")),
    qualityCheckId: v.optional(v.id("qualityChecks")),
    deliveryId: v.optional(v.id("deliveries")),
    qc: v.union(v.literal("pending"), v.literal("passed"), v.literal("failed")),
    createdByUserId: v.id("users"), createdAt: v.number(), updatedAt: v.number(),
  })
    .index("by_smfCode", ["smfCode"])
    .index("by_businessId_and_localSuffix", ["businessId", "localSuffix"])
    .index("by_provisioningRequestId_and_unitOrdinal", ["provisioningRequestId", "unitOrdinal"])
    .index("by_orderLineId", ["orderLineId"])
    .index("by_orderLineId_and_deliveryId_and_qc", ["orderLineId", "deliveryId", "qc"]),

  accessChannels: defineTable({
    resumeState: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    accountId: v.id("accounts"), businessId: v.id("businesses"),
    // ADMIN-13's global QR worklist must render the owning context without a
    // per-row account/venue hydration. These are operational display copies;
    // accountId/businessId remain the authorization authority.
    accountName: v.optional(v.string()), smkCode: v.optional(v.string()),
    smlCode: v.optional(v.string()), venueName: v.optional(v.string()),
    city: v.optional(v.string()),
    subjectId: v.id("accessSubjects"), cardId: v.id("cards"), resolverCode: v.string(),
    kind: accessKind, state: accessState, redirectEnabled: v.boolean(), health: accessHealth,
    manualProblem: v.optional(v.string()), problemReason: v.optional(v.string()),
    digitalQrId: v.optional(v.id("digitalQrCodes")),
    physicalProductId: v.optional(v.id("physicalProducts")),
    smqCode: v.optional(v.string()), smfCode: v.optional(v.string()),
    binding: v.union(v.literal("digital"), v.literal("physical")),
    searchText: v.string(), totalScans: v.number(),
    lastActor: accessActor, lastReason: v.string(), createdAt: v.number(), updatedAt: v.number(),
  })
    .index("by_subjectId", ["subjectId"])
    .index("by_cardId", ["cardId"])
    .index("by_resolverCode", ["resolverCode"])
    .index("by_binding_and_state_and_updatedAt", ["binding", "state", "updatedAt"])
    .index("by_binding_and_updatedAt", ["binding", "updatedAt"])
    .index("by_state_and_updatedAt", ["state", "updatedAt"])
    .index("by_kind_and_updatedAt", ["kind", "updatedAt"])
    .index("by_kind_and_state_and_updatedAt", ["kind", "state", "updatedAt"])
    .index("by_kind_and_binding_and_updatedAt", ["kind", "binding", "updatedAt"])
    .index("by_kind_and_binding_and_state_and_updatedAt", ["kind", "binding", "state", "updatedAt"])
    .index("by_updatedAt", ["updatedAt"])
    .searchIndex("search_channels", { searchField: "searchText", filterFields: ["accountId", "businessId", "binding", "state", "kind"] }),

  digitalQrCodes: defineTable({
    accountId: v.id("accounts"), businessId: v.id("businesses"), smqCode: v.string(),
    channelId: v.id("accessChannels"), originalSubjectId: v.id("accessSubjects"),
    linkedProductId: v.optional(v.id("physicalProducts")), linkedAt: v.optional(v.number()),
    linkedByUserId: v.optional(v.id("users")),
    legacyCardId: v.optional(v.id("cards")),
    createdByUserId: v.id("users"), createdAt: v.number(),
  }).index("by_smqCode", ["smqCode"]).index("by_legacyCardId", ["legacyCardId"]),

  accessDestinationHistory: defineTable({
    subjectId: v.id("accessSubjects"), previousTargetId: v.optional(v.id("cardTargets")),
    targetId: v.id("cardTargets"), actor: accessActor, reason: v.string(), createdAt: v.number(),
  }).index("by_subjectId_and_createdAt", ["subjectId", "createdAt"]),

  productPlacements: defineTable({
    productId: v.id("physicalProducts"), businessId: v.id("businesses"), name: v.string(),
    startedAt: v.number(), endedAt: v.optional(v.number()),
    actor: accessActor, reason: v.string(),
  }).index("by_productId_and_startedAt", ["productId", "startedAt"]),

  accessChannelEvents: defineTable({
    channelId: v.id("accessChannels"), fromState: v.optional(accessState), toState: accessState,
    health: accessHealth, redirectEnabled: v.boolean(), problemReason: v.optional(v.string()),
    actor: accessActor, reason: v.string(), createdAt: v.number(),
  }).index("by_channelId_and_createdAt", ["channelId", "createdAt"]),

  accessMetricTotals: defineTable({
    subjectId: v.id("accessSubjects"), channelId: v.id("accessChannels"),
    placementId: v.optional(v.id("productPlacements")), scans: v.number(),
  }).index("by_subjectId_and_placementId_and_channelId", ["subjectId", "placementId", "channelId"]),

  accessCommands: defineTable({
    key: v.string(), fingerprint: v.string(),
    failureReason: v.optional(v.string()),
    productIds: v.array(v.id("physicalProducts")),
    digitalQrId: v.optional(v.id("digitalQrCodes")), createdAt: v.number(),
  }).index("by_key", ["key"]),

  accessMigrationIssues: defineTable({
    cardId: v.id("cards"), reason: v.string(), resolvedAt: v.optional(v.number()), updatedAt: v.number(),
  }).index("by_cardId", ["cardId"]),

  productInventory: defineTable({
    productId: v.id("physicalProducts"), subjectId: v.id("accessSubjects"),
    accountId: v.id("accounts"), businessId: v.id("businesses"),
    smfCode: v.string(), localSuffix: v.string(), productType: adminOrderProductTypeValidator,
    productLabel: v.string(), position: v.string(), qr: accessColor, nfc: accessColor,
    state: accessState, destinationKind: accessDestinationKind,
    currentTargetId: v.optional(v.id("cardTargets")),
    // The projection carries the compact, immutable facts needed by both the
    // table and visual inventory without detail-query fan-out. Optional is
    // deliberate: ADMIN-12 rows already persisted before this additive read
    // model remain valid and are never presented as fabricated values.
    designSnapshot: v.optional(adminOrderProductConfigValidator),
    boundServices: v.optional(v.array(serviceType)),
    destinationServiceTypes: v.optional(v.array(serviceType)),
    qrChannelIds: v.optional(v.array(v.id("accessChannels"))),
    nfcChannelIds: v.optional(v.array(v.id("accessChannels"))),
    qrCount: v.optional(v.number()), nfcCount: v.optional(v.number()),
    activeChannelCount: v.optional(v.number()), problemChannelCount: v.optional(v.number()),
    qrProblemReason: v.optional(v.union(v.string(), v.null())),
    nfcProblemReason: v.optional(v.union(v.string(), v.null())),
    searchText: v.string(), updatedAt: v.number(),
  })
    .index("by_productId", ["productId"])
    .index("by_businessId_and_smfCode", ["businessId", "smfCode"])
    .index("by_businessId_and_state_and_smfCode", ["businessId", "state", "smfCode"])
    .index("by_business_state_type_smf", ["businessId", "state", "productType", "smfCode"])
    .index("by_business_state_type_position_smf", ["businessId", "state", "productType", "position", "smfCode"])
    .index("by_business_state_position_smf", ["businessId", "state", "position", "smfCode"])
    .index("by_business_type_position_smf", ["businessId", "productType", "position", "smfCode"])
    .index("by_businessId_and_productType_and_smfCode", ["businessId", "productType", "smfCode"])
    .index("by_businessId_and_position_and_smfCode", ["businessId", "position", "smfCode"])
    .searchIndex("search_inventory", { searchField: "searchText", filterFields: ["accountId", "businessId", "state", "productType"] }),

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

  // RFC-002 §2.5 — the order: the IMMUTABLE record-as-sold, above the account.
  // The account plan is the live permission; this row is what was bought at the
  // price it was bought. `priceSnapshot` is the pricing engine's breakdown
  // frozen at sale time (convex/lib/orderSnapshot.ts) — a later constants edit
  // never touches it. Payment is a stub against the billing port: `status` moves
  // pending → paid by a manual admin action (or, later, a billing webhook), and
  // no field here waits on the provider choice.
  orders: defineTable({
    accountId: v.id("accounts"),
    // Additive provenance. Legacy rows may not have it; ADMIN-11 never invents
    // a creator while new admin and authenticated checkout writes preserve one.
    createdByUserId: v.optional(v.id("users")),
    // ADMIN-11 identity. Optional keeps every legacy order valid until its
    // bounded, explicit operational migration is run.
    smpCode: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("provisioned"),
      v.literal("cancelled"),
      v.literal("refunded"),
    ),
    plan: v.union(
      v.literal("basic"),
      v.literal("premium"),
      v.literal("enterprise"),
    ),
    // Absent for basic (free) and enterprise (on request) — neither is billed a
    // period; required for premium. Mirrors accounts.planPeriod / the engine.
    planPeriod: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
    priceSnapshot: priceSnapshotValidator,
    // The billing-port seam (same shape as entitlements.source): a manual admin
    // action or a later webhook advances the order; the field never names a
    // provider.
    billingSource: v.optional(
      v.union(v.literal("manual"), v.literal("billing")),
    ),
    externalRef: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_accountId_and_createdAt", ["accountId", "createdAt"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_smpCode", ["smpCode"]),

  // RFC-002 §2.5 — one row per purchased service AND one per physical-product
  // line. `businessId` says which location this line provisions (Enterprise:
  // per location). A physical line carries `boundService` (the service its card
  // is bound to, §2.3) and a frozen snapshot of the product configurator choice.
  orderItems: defineTable({
    orderId: v.id("orders"),
    businessId: v.id("businesses"),
    kind: v.union(v.literal("service"), v.literal("physical")),
    // Service lines only.
    service: v.optional(serviceType),
    period: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
    // Physical lines only: the service the printed item is bound to, and the
    // ProductSelection snapshot (shape from lib/scanme-pricing.ts, stored opaque).
    // `boundService` is the primary (first) service; `boundServices` (TASK-38,
    // §2.4) carries the FULL binding — a line bound to 2+ services is a splitter
    // (razdelnik). Both are written for a physical line so a single-service
    // reader keeps working while the splitter provisioner reads the array.
    boundService: v.optional(serviceType),
    boundServices: v.optional(v.array(serviceType)),
    // TASK-38: the splitter card this physical line provisioned (§2.4). Set once
    // the card-aware splitter is minted; its presence makes provisioning
    // idempotent per orderItem, so a resumed/retried fan-out never mints a
    // second card for the same line.
    provisionedCardId: v.optional(v.id("cards")),
    physicalSelection: v.optional(v.any()),
    lineTotalRsd: v.number(),
    createdAt: v.number(),
  }).index("by_orderId", ["orderId"]),

  // ADMIN-11 read model. Operational state is intentionally separate from the
  // immutable commercial order and its priceSnapshot.
  orderOperations: defineTable({
    orderId: v.id("orders"),
    accountId: v.id("accounts"),
    createdByUserId: v.optional(v.id("users")),
    createdByName: v.optional(v.string()),
    accountName: v.string(),
    smkCode: v.string(),
    smpCode: v.string(),
    primaryBusinessId: v.optional(v.id("businesses")),
    primaryBusinessName: v.optional(v.string()),
    primarySmlCode: v.optional(v.string()),
    paymentState: adminOrderPaymentStateValidator,
    designState: adminOrderDesignStateValidator,
    fulfillmentState: adminOrderFulfillmentStateValidator,
    view: adminOrderViewValidator,
    priority: adminOrderPriorityValidator,
    priorityRank: v.number(),
    assigneeId: v.id("users"),
    assigneeName: v.string(),
    requiredMinor: v.number(),
    settledMinor: v.number(),
    reversedMinor: v.number(),
    currency: v.literal("RSD"),
    lineCount: v.number(),
    unitCount: v.number(),
    problemCount: v.number(),
    migrationIssueCount: v.number(),
    provisioningReady: v.boolean(),
    note: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    searchText: v.string(),
    migrationVersion: v.literal(1),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_smpCode", ["smpCode"])
    .index("by_view_and_updatedAt", ["view", "updatedAt"])
    .index("by_view_and_accountId_and_updatedAt", ["view", "accountId", "updatedAt"])
    .index("by_view_and_paymentState_and_updatedAt", ["view", "paymentState", "updatedAt"])
    .index("by_view_and_designState_and_updatedAt", ["view", "designState", "updatedAt"])
    .index("by_view_and_fulfillmentState_and_updatedAt", ["view", "fulfillmentState", "updatedAt"])
    .index("by_assigneeId_and_view_and_updatedAt", ["assigneeId", "view", "updatedAt"])
    .searchIndex("search_orders", {
      searchField: "searchText",
      filterFields: ["view", "assigneeId", "paymentState", "designState", "fulfillmentState"],
    }),

  orderLines: defineTable({
    operationId: v.id("orderOperations"),
    orderId: v.id("orders"),
    orderItemId: v.id("orderItems"),
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    businessName: v.string(),
    smlCode: v.string(),
    productType: adminOrderProductTypeValidator,
    productLabel: v.string(),
    quantity: v.number(),
    lineTotalMinor: v.number(),
    currency: v.literal("RSD"),
    configSnapshot: adminOrderProductConfigValidator,
    boundServices: v.array(serviceType),
    designKind: adminOrderDesignKindValidator,
    designState: adminOrderDesignStateValidator,
    designRevision: v.number(),
    approvedSnapshotId: v.optional(v.id("orderDesignApprovals")),
    smfAssignedCount: v.number(),
    sentToPrinterCount: v.number(),
    receivedCount: v.number(),
    qcPendingCount: v.number(),
    qcPassedCount: v.number(),
    qcProblemCount: v.number(),
    deliveryReservedCount: v.number(),
    inDeliveryCount: v.number(),
    deliveredCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operationId", ["operationId"])
    .index("by_orderId", ["orderId"])
    .index("by_orderItemId", ["orderItemId"])
    .index("by_businessId_and_createdAt", ["businessId", "createdAt"]),

  orderMigrationIssues: defineTable({
    orderId: v.id("orders"),
    orderItemId: v.optional(v.id("orderItems")),
    code: v.string(),
    detail: v.string(),
    issueKey: v.string(),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_issueKey", ["issueKey"]),

  orderDesignApprovals: defineTable({
    operationId: v.id("orderOperations"),
    orderLineId: v.id("orderLines"),
    revision: v.number(),
    snapshot: adminOrderProductConfigValidator,
    approvedByUserId: v.id("users"),
    approvedAt: v.number(),
  })
    .index("by_orderLineId_and_revision", ["orderLineId", "revision"])
    .index("by_operationId_and_approvedAt", ["operationId", "approvedAt"]),

  orderProvisioningRequests: defineTable({
    accessProblem: v.optional(v.string()),
    accessProblemAt: v.optional(v.number()),
    createdCount: v.optional(v.number()),
    accessFingerprint: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    operationId: v.id("orderOperations"),
    orderLineId: v.id("orderLines"),
    requestKey: v.string(),
    quantity: v.number(),
    state: v.union(v.literal("pending_admin_12"), v.literal("in_progress"), v.literal("fulfilled")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_orderLineId", ["orderLineId"])
    .index("by_requestKey", ["requestKey"])
    .index("by_operationId_and_createdAt", ["operationId", "createdAt"]),

  orderSmfReferences: defineTable({
    operationId: v.id("orderOperations"),
    orderLineId: v.id("orderLines"),
    reference: v.string(),
    sourceRecordId: v.string(),
    printJobId: v.optional(v.id("printJobs")),
    assignedAt: v.number(),
  })
    .index("by_orderLineId", ["orderLineId"])
    .index("by_orderLineId_and_printJobId", ["orderLineId", "printJobId"])
    .index("by_reference", ["reference"])
    .index("by_sourceRecordId", ["sourceRecordId"]),

  orderPaymentAllocations: defineTable({
    operationId: v.id("orderOperations"),
    orderId: v.id("orders"),
    accountId: v.id("accounts"),
    paymentId: v.id("payments"),
    amountMinor: v.number(),
    currency: v.literal("RSD"),
    state: v.union(v.literal("settled"), v.literal("reversed")),
    key: v.string(),
    recordedByUserId: v.id("users"),
    createdAt: v.number(),
    reversedAt: v.optional(v.number()),
  })
    .index("by_orderId", ["orderId"])
    .index("by_paymentId", ["paymentId"])
    .index("by_operationId_and_key", ["operationId", "key"]),

  printers: defineTable({
    name: v.string(),
    contact: v.optional(v.string()),
    active: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active_and_name", ["active", "name"]),

  printJobs: defineTable({
    operationId: v.id("orderOperations"),
    orderId: v.id("orders"),
    printerId: v.id("printers"),
    printerName: v.string(),
    state: adminPrintJobStateValidator,
    destination: v.literal("scanme"),
    assigneeId: v.id("users"),
    assigneeName: v.string(),
    note: v.optional(v.string()),
    commandId: v.string(),
    remakeOfQualityCheckId: v.optional(v.id("qualityChecks")),
    expectedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    receivedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operationId_and_createdAt", ["operationId", "createdAt"])
    .index("by_operationId_and_commandId", ["operationId", "commandId"])
    .index("by_remakeOfQualityCheckId", ["remakeOfQualityCheckId"])
    .index("by_state_and_expectedAt", ["state", "expectedAt"]),

  printJobLines: defineTable({
    printJobId: v.id("printJobs"),
    operationId: v.id("orderOperations"),
    orderLineId: v.id("orderLines"),
    quantity: v.number(),
    smfReferences: v.array(v.string()),
    printSnapshot: adminOrderProductConfigValidator,
    createdAt: v.number(),
  })
    .index("by_printJobId", ["printJobId"])
    .index("by_operationId", ["operationId"])
    .index("by_orderLineId", ["orderLineId"]),

  printerReceipts: defineTable({
    printJobId: v.id("printJobs"),
    operationId: v.id("orderOperations"),
    orderLineId: v.id("orderLines"),
    quantity: v.number(),
    receivedByUserId: v.id("users"),
    receivedAt: v.number(),
    commandId: v.string(),
  })
    .index("by_printJobId_and_createdAt", ["printJobId", "receivedAt"])
    .index("by_operationId_and_receivedAt", ["operationId", "receivedAt"])
    .index("by_orderLineId", ["orderLineId"])
    .index("by_commandId", ["commandId"]),

  qualityChecks: defineTable({
    verifiedChannelKinds: v.optional(v.array(accessKind)),
    physicalProductIds: v.optional(v.array(v.id("physicalProducts"))),
    operationId: v.id("orderOperations"),
    orderLineId: v.id("orderLines"),
    printJobId: v.id("printJobs"),
    result: v.union(v.literal("pass"), v.literal("problem")),
    quantity: v.number(),
    reason: v.optional(v.string()),
    remakeRequested: v.boolean(),
    checkedByUserId: v.id("users"),
    checkedAt: v.number(),
    commandId: v.string(),
  })
    .index("by_operationId_and_checkedAt", ["operationId", "checkedAt"])
    .index("by_printJobId_and_checkedAt", ["printJobId", "checkedAt"])
    .index("by_orderLineId", ["orderLineId"])
    .index("by_commandId", ["commandId"]),

  orderActivationSignals: defineTable({
    processedAt: v.optional(v.number()),
    activeChannelCount: v.optional(v.number()),
    problemChannelCount: v.optional(v.number()),
    operationId: v.id("orderOperations"),
    orderLineId: v.id("orderLines"),
    qualityCheckId: v.id("qualityChecks"),
    state: v.union(v.literal("pending_admin_12"), v.literal("applied"), v.literal("problem")),
    createdAt: v.number(),
  })
    .index("by_qualityCheckId", ["qualityCheckId"])
    .index("by_operationId_and_createdAt", ["operationId", "createdAt"]),

  deliveries: defineTable({
    accessFingerprint: v.optional(v.string()),
    operationId: v.id("orderOperations"),
    orderId: v.id("orders"),
    businessId: v.id("businesses"),
    businessName: v.string(),
    recipientName: v.string(),
    address: v.string(),
    method: adminDeliveryMethodValidator,
    state: adminDeliveryStateValidator,
    courierService: v.optional(v.string()),
    courierReference: v.optional(v.string()),
    courierFeeMinor: v.optional(v.number()),
    courierFeePayer: v.optional(v.literal("client_to_courier")),
    personalFeeMinor: v.number(),
    commandId: v.string(),
    problemReason: v.optional(v.string()),
    startedByUserId: v.optional(v.id("users")),
    startedAt: v.optional(v.number()),
    completedByUserId: v.optional(v.id("users")),
    completedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operationId_and_createdAt", ["operationId", "createdAt"])
    .index("by_operationId_and_commandId", ["operationId", "commandId"])
    .index("by_state_and_updatedAt", ["state", "updatedAt"]),

  deliveryLines: defineTable({
    physicalProductIds: v.optional(v.array(v.id("physicalProducts"))),
    deliveryId: v.id("deliveries"),
    operationId: v.id("orderOperations"),
    orderLineId: v.id("orderLines"),
    quantity: v.number(),
    createdAt: v.number(),
  })
    .index("by_deliveryId", ["deliveryId"])
    .index("by_operationId", ["operationId"])
    .index("by_orderLineId", ["orderLineId"]),

  orderEvents: defineTable({
    operationId: v.id("orderOperations"),
    orderId: v.id("orders"),
    kind: adminOrderEventKindValidator,
    axis: adminOrderAxisValidator,
    commandId: v.string(),
    actorUserId: v.id("users"),
    fromValue: v.optional(v.string()),
    toValue: v.optional(v.string()),
    reason: v.optional(v.string()),
    relatedRecordId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_operationId_and_createdAt", ["operationId", "createdAt"])
    .index("by_operationId_and_commandId", ["operationId", "commandId"]),

  // TASK-32 — the payment HISTORY (RFC-002 §2.5/§2.6): one row per payment,
  // never just a "last paid" field. Manual entry is the MAIN flow (the first
  // fifty clients pay by bank transfer or cash); a provider webhook later
  // writes the same rows through the same billing port (convex/lib/
  // billingPort.ts). The history is append-only: a wrong entry is VOIDED
  // (compensating flags below), never deleted — the first dispute turns on
  // exactly this trail.
  payments: defineTable({
    accountId: v.id("accounts"),
    // Additive envelope: new money arithmetic uses ONLY integer minor units.
    // amountRsd/method below remain legacy display/ingestion mirrors.
    ledger: v.optional(paymentLedger),
    // Present when the payment settles a specific order (the initial sale via
    // markOrderPaid). Renewals have no order — just the account.
    orderId: v.optional(v.id("orders")),
    amountRsd: v.number(),
    // "manual" = admin-entered; "provider" = a billing-port webhook.
    method: v.union(v.literal("manual"), v.literal("provider")),
    // Nalog-za-prenos reference / provider transaction id / "na ruke" note.
    reference: v.optional(v.string()),
    // When the money moved — admin-entered, may be backdated.
    paidAt: v.number(),
    // The paid-through date this payment produced (the new
    // accounts.planValidUntil). Absent when the payment did not move the
    // cycle (e.g. an order with no derivable period).
    coversUntil: v.optional(v.number()),
    // Manual entries: the admin who typed it (who/what/when for disputes).
    recordedByUserId: v.optional(v.id("users")),
    // Void = the compensating correction. Voiding never auto-rewinds the
    // cycle; the admin re-sets the next billing date explicitly (audited).
    voidedAt: v.optional(v.number()),
    voidedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_accountId_and_paidAt", ["accountId", "paidAt"])
    .index("by_orderId", ["orderId"])
    .index("by_accountId_and_ledger_key", ["accountId", "ledger.key"])
    .index("by_ledger_provider_and_ledger_providerEventId", ["ledger.provider", "ledger.providerEventId"]),

  // ADMIN-03. One stable subscription per target, with separate period rows.
  // History grows in child tables; none of these arrays holds an unbounded log.
  subscriptions: defineTable({
    accountId: v.id("accounts"), target: subscriptionTarget, targetKey: v.string(),
    businessId: v.optional(v.id("businesses")), period: billingPeriod,
    startsAt: v.number(), anchorAt: v.number(),
    renewal: v.union(v.object({ kind: v.literal("manual") }), v.object({ kind: v.literal("automatic"), setupReference: v.string() })),
    cancelledAt: v.optional(v.number()), cancelAtPeriodEnd: v.boolean(),
    suspended: v.optional(billingChange),
    graceOverride: v.optional(v.object({ periodId: v.id("subscriptionPeriods"), endsAt: v.number() })),
    lastOverride: v.optional(billingChange),
    facts: lifecycleFacts, nextTransitionAt: v.optional(v.number()),
    key: v.string(), fingerprint: v.string(), createdAt: v.number(), updatedAt: v.number(),
  })
    .index("by_accountId_and_targetKey", ["accountId", "targetKey"])
    .index("by_businessId", ["businessId"])
    .index("by_accountId_and_facts_status", ["accountId", "facts.status"])
    .index("by_facts_status_and_accountId", ["facts.status", "accountId"])
    .index("by_nextTransitionAt", ["nextTransitionAt"])
    .index("by_accountId_and_key", ["accountId", "key"]),

  subscriptionPeriods: defineTable({
    accountId: v.id("accounts"), subscriptionId: v.id("subscriptions"),
    start: v.number(), end: v.number(), price: subscriptionPrice,
    // Incremental coverage; money events themselves are immutable.
    paidMinor: v.number(), funded: v.boolean(),
    migrationEvidence: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_subscriptionId_and_start", ["subscriptionId", "start"])
    .index("by_subscriptionId_and_funded_and_start", ["subscriptionId", "funded", "start"]),

  paymentAllocations: defineTable({
    accountId: v.id("accounts"), paymentId: v.id("payments"),
    subscriptionId: v.id("subscriptions"), periodId: v.id("subscriptionPeriods"),
    start: v.number(), end: v.number(), amount: money, price: subscriptionPrice,
    financeCategory: v.optional(v.union(v.literal("saas"), v.literal("premium"))),
    financeServiceType: v.optional(serviceType),
    financePeriod: v.optional(billingPeriod),
    createdAt: v.number(),
  })
    .index("by_paymentId", ["paymentId"])
    .index("by_subscriptionId_and_start", ["subscriptionId", "start"])
    .index("by_periodId", ["periodId"]),

  paymentAdjustments: defineTable({
    accountId: v.id("accounts"), paymentId: v.id("payments"),
    kind: v.union(v.literal("reversal"), v.literal("refund")), amount: money, change: billingChange,
    occurredAt: v.optional(v.number()),
    allocations: v.optional(v.array(v.object({
      logicalKey: v.string(), amountMinor: v.number(),
    }))),
    key: v.string(), fingerprint: v.string(),
  })
    .index("by_paymentId", ["paymentId"])
    .index("by_accountId_and_key", ["accountId", "key"]),

  // Mutable read fact, separate from append-only payment/adjustment history.
  paymentStates: defineTable({
    accountId: v.id("accounts"), paymentId: v.id("payments"), paidAt: v.number(),
    state: v.union(v.literal("settled"), v.literal("reversed")),
  })
    .index("by_paymentId", ["paymentId"])
    .index("by_accountId_and_state_and_paidAt", ["accountId", "state", "paidAt"]),

  // ADMIN-14: immutable, allocation-level finance projection. Every real
  // payment fact is written twice (global + account scope) so both finance and
  // client-profile reads remain indexed without cross-account post-filtering.
  financeLedgerEntries: defineTable({
    scopeKey: v.string(), sourceKey: v.string(), logicalKey: v.string(),
    fingerprint: v.string(), accountId: v.id("accounts"),
    paymentId: v.id("payments"), adjustmentId: v.optional(v.id("paymentAdjustments")),
    entryKind: v.union(v.literal("receipt"), v.literal("refund"), v.literal("reversal")),
    category: v.union(v.literal("physical"), v.literal("saas"), v.literal("premium"), v.literal("unallocated")),
    serviceType: v.optional(serviceType),
    amountMinor: v.number(), currency: v.string(), method: paymentMethod,
    occurredAt: v.number(),
    period: v.union(v.literal("monthly"), v.literal("annual"), v.literal("one_time"), v.literal("unallocated")),
    coveredStart: v.optional(v.number()), coveredEnd: v.optional(v.number()),
    subscriptionId: v.optional(v.id("subscriptions")), orderId: v.optional(v.id("orders")),
    recordedByUserId: v.optional(v.id("users")), createdAt: v.number(),
  })
    .index("by_sourceKey", ["sourceKey"])
    .index("by_scopeKey_and_occurredAt", ["scopeKey", "occurredAt"])
    .index("by_scopeKey_and_paymentId_and_logicalKey", ["scopeKey", "paymentId", "logicalKey"])
    .index("by_adjustmentId_and_scopeKey", ["adjustmentId", "scopeKey"]),

  // Bounded all-time read path. Rows are leaf dimensions, not pre-labelled UI
  // totals; every filter is derived from the same exact allocation categories.
  financeMonthlyRollups: defineTable({
    scopeKey: v.string(), monthKey: v.string(), dimensionKey: v.string(),
    category: v.union(v.literal("physical"), v.literal("saas"), v.literal("premium"), v.literal("unallocated")),
    serviceType: v.optional(serviceType), method: paymentMethod, currency: v.string(),
    collectedMinor: v.number(), refundedMinor: v.number(), reversedMinor: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scopeKey_and_monthKey", ["scopeKey", "monthKey"])
    .index("by_scopeKey_and_monthKey_and_dimensionKey", ["scopeKey", "monthKey", "dimensionKey"]),

  financeDailyRollups: defineTable({
    scopeKey: v.string(), dateKey: v.string(), dimensionKey: v.string(),
    category: v.union(v.literal("physical"), v.literal("saas"), v.literal("premium"), v.literal("unallocated")),
    serviceType: v.optional(serviceType), method: paymentMethod, currency: v.string(),
    collectedMinor: v.number(), refundedMinor: v.number(), reversedMinor: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scopeKey_and_dateKey", ["scopeKey", "dateKey"])
    .index("by_scopeKey_and_dateKey_and_dimensionKey", ["scopeKey", "dateKey", "dimensionKey"]),

  // One row per payment and scope prevents mixed allocations from duplicating
  // the payment list while retaining their exact allocation breakdown.
  financePaymentDigests: defineTable({
    scopeKey: v.string(), accountId: v.id("accounts"), accountName: v.string(),
    paymentId: v.id("payments"), amountMinor: v.number(), currency: v.string(),
    paidAt: v.number(), method: paymentMethod, reference: v.optional(v.string()),
    recordedByUserId: v.optional(v.id("users")),
    allocations: v.array(v.object({
      logicalKey: v.string(),
      category: v.union(v.literal("physical"), v.literal("saas"), v.literal("premium"), v.literal("unallocated")),
      serviceType: v.optional(serviceType), amountMinor: v.number(),
      period: v.union(v.literal("monthly"), v.literal("annual"), v.literal("one_time"), v.literal("unallocated")),
      coveredStart: v.optional(v.number()), coveredEnd: v.optional(v.number()),
      subscriptionId: v.optional(v.id("subscriptions")), orderId: v.optional(v.id("orders")),
    })),
    refundedMinor: v.number(), reversedMinor: v.number(), updatedAt: v.number(),
  })
    .index("by_scopeKey_and_paidAt", ["scopeKey", "paidAt"])
    .index("by_scopeKey_and_paymentId", ["scopeKey", "paymentId"]),

  // Denormalized once per applicable filter so filtered cursor pagination
  // never scans or post-filters a capped page and never joins per result row.
  financePaymentListRows: defineTable({
    scopeKey: v.string(), filterKey: v.string(), accountId: v.id("accounts"), accountName: v.string(),
    paymentId: v.id("payments"), amountMinor: v.number(), currency: v.string(),
    paidAt: v.number(), method: paymentMethod, reference: v.optional(v.string()),
    recordedByUserId: v.optional(v.id("users")),
    allocations: v.array(v.object({
      logicalKey: v.string(),
      category: v.union(v.literal("physical"), v.literal("saas"), v.literal("premium"), v.literal("unallocated")),
      serviceType: v.optional(serviceType), amountMinor: v.number(),
      period: v.union(v.literal("monthly"), v.literal("annual"), v.literal("one_time"), v.literal("unallocated")),
      coveredStart: v.optional(v.number()), coveredEnd: v.optional(v.number()),
      subscriptionId: v.optional(v.id("subscriptions")), orderId: v.optional(v.id("orders")),
    })),
    refundedMinor: v.number(), reversedMinor: v.number(), updatedAt: v.number(),
  })
    .index("by_scopeKey_and_filterKey_and_paidAt", ["scopeKey", "filterKey", "paidAt"])
    .index("by_scopeKey_and_paymentId_and_filterKey", ["scopeKey", "paymentId", "filterKey"]),

  // Append-only direct-cost facts. Zero is a real confirmed fact; absence is
  // represented only by an unresolved financeCostRequirements row.
  financeDirectCosts: defineTable({
    scopeKey: v.string(), accountId: v.optional(v.id("accounts")),
    category: v.union(v.literal("production"), v.literal("hosting"), v.literal("backend")),
    eventKind: v.union(v.literal("cost"), v.literal("correction"), v.literal("reversal")),
    direction: v.union(v.literal("debit"), v.literal("credit")),
    amountMinor: v.number(), currency: v.string(), occurredAt: v.number(),
    coveredStart: v.optional(v.number()), coveredEnd: v.optional(v.number()),
    orderId: v.optional(v.id("orders")), orderLineId: v.optional(v.id("orderLines")),
    printJobId: v.optional(v.id("printJobs")), printerId: v.optional(v.id("printers")),
    sourceReference: v.optional(v.string()), note: v.optional(v.string()),
    relatedCostId: v.optional(v.id("financeDirectCosts")), reason: v.optional(v.string()),
    actorUserId: v.id("users"), idempotencyKey: v.string(), fingerprint: v.string(), createdAt: v.number(),
  })
    .index("by_scopeKey_and_occurredAt", ["scopeKey", "occurredAt"])
    .index("by_actorUserId_and_idempotencyKey", ["actorUserId", "idempotencyKey"])
    .index("by_relatedCostId", ["relatedCostId"])
    .index("by_orderId", ["orderId"]),

  // Exact coverage evidence for recurring direct costs. This avoids scanning
  // an arbitrarily capped cost list when a receipt creates its requirement.
  financeCostCoverageFacts: defineTable({
    scopeKey: v.string(), monthKey: v.string(),
    category: v.union(v.literal("hosting"), v.literal("backend")),
    evidenceCostId: v.id("financeDirectCosts"), updatedAt: v.number(),
  })
    .index("by_scopeKey_and_category_and_monthKey", ["scopeKey", "category", "monthKey"]),

  financeMonthlyCostRollups: defineTable({
    scopeKey: v.string(), monthKey: v.string(), dimensionKey: v.string(),
    category: v.union(v.literal("production"), v.literal("hosting"), v.literal("backend")),
    currency: v.string(), debitMinor: v.number(), creditMinor: v.number(), updatedAt: v.number(),
  })
    .index("by_scopeKey_and_monthKey", ["scopeKey", "monthKey"])
    .index("by_scopeKey_and_monthKey_and_dimensionKey", ["scopeKey", "monthKey", "dimensionKey"]),

  financeCostRequirements: defineTable({
    scopeKey: v.string(), monthKey: v.string(), requirementKey: v.string(),
    category: v.union(v.literal("production"), v.literal("hosting"), v.literal("backend"), v.literal("classification")),
    accountId: v.optional(v.id("accounts")), sourceId: v.optional(v.string()),
    state: v.union(v.literal("missing"), v.literal("known")),
    evidenceCostId: v.optional(v.id("financeDirectCosts")), updatedAt: v.number(),
  })
    .index("by_scopeKey_and_monthKey", ["scopeKey", "monthKey"])
    .index("by_scopeKey_and_requirementKey_and_monthKey", ["scopeKey", "requirementKey", "monthKey"]),

  // Materialized future obligations. Source rows make replacement idempotent;
  // aggregate rows keep the ADMIN-14 read path fixed-query and exact.
  financeExpectedObligations: defineTable({
    scopeKey: v.string(), sourceKey: v.string(), fingerprint: v.string(),
    accountId: v.id("accounts"),
    sourceKind: v.union(v.literal("subscription"), v.literal("order")),
    monthKey: v.string(),
    category: v.union(v.literal("physical"), v.literal("saas"), v.literal("premium")),
    serviceType: v.optional(serviceType), amountMinor: v.number(), currency: v.literal("RSD"),
    availability: v.union(v.literal("known"), v.literal("unavailable")),
    waived: v.boolean(), dueAt: v.optional(v.number()),
    subscriptionId: v.optional(v.id("subscriptions")),
    orderOperationId: v.optional(v.id("orderOperations")),
    updatedAt: v.number(),
  })
    .index("by_sourceKey", ["sourceKey"])
    .index("by_subscriptionId_and_scopeKey", ["subscriptionId", "scopeKey"])
    .index("by_orderOperationId_and_scopeKey", ["orderOperationId", "scopeKey"]),

  financeExpectedRollups: defineTable({
    scopeKey: v.string(), monthKey: v.string(), dimensionKey: v.string(),
    category: v.union(v.literal("physical"), v.literal("saas"), v.literal("premium")),
    serviceType: v.optional(serviceType), currency: v.literal("RSD"),
    amountMinor: v.number(), waivedCount: v.number(), unavailablePriceCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scopeKey_and_monthKey", ["scopeKey", "monthKey"])
    .index("by_scopeKey_and_monthKey_and_dimensionKey", ["scopeKey", "monthKey", "dimensionKey"]),

  priceAgreements: defineTable({
    accountId: v.id("accounts"), target: subscriptionTarget, targetKey: v.string(),
    period: billingPeriod, kind: agreementKind, reference: money, price: money,
    validFrom: v.number(), validUntil: v.union(v.number(), v.null()),
    change: billingChange, key: v.string(), fingerprint: v.string(),
  })
    .index("by_accountId_and_targetKey_and_period_and_validFrom", ["accountId", "targetKey", "period", "validFrom"])
    .index("by_accountId_and_key", ["accountId", "key"]),

  discountRules: defineTable({
    accountId: v.id("accounts"), target: subscriptionTarget, targetKey: v.string(),
    kind: v.union(v.literal("friend_waiver"), v.literal("manual"), v.literal("referral_discount")),
    value: discountValue, validFrom: v.number(), validUntil: v.union(v.number(), v.null()),
    tagId: v.optional(v.id("accountTags")), referralId: v.optional(v.id("referrals")),
    change: billingChange, key: v.string(), fingerprint: v.string(),
  })
    .index("by_accountId_and_targetKey_and_validFrom", ["accountId", "targetKey", "validFrom"])
    .index("by_referralId", ["referralId"])
    .index("by_accountId_and_key", ["accountId", "key"]),

  referrals: defineTable({
    referrerAccountId: v.id("accounts"), referredAccountId: v.id("accounts"),
    status: v.union(v.literal("pending"), v.literal("qualified"), v.literal("rewarded"), v.literal("cancelled")),
    qualifyingPaymentId: v.optional(v.id("payments")),
    // Campaign terms live on explicit reward discount rows; no wallet/default rate.
    createdAt: v.number(), updatedAt: v.number(),
  })
    .index("by_referredAccountId", ["referredAccountId"])
    .index("by_referrerAccountId_and_status", ["referrerAccountId", "status"])
    .index("by_qualifyingPaymentId", ["qualifyingPaymentId"]),

  subscriptionEvents: defineTable({
    accountId: v.id("accounts"), subscriptionId: v.optional(v.id("subscriptions")),
    actor: billingActor, action: v.string(), reason: v.optional(v.string()),
    before: v.optional(lifecycleFacts), after: v.optional(lifecycleFacts),
    paymentId: v.optional(v.id("payments")), adjustmentId: v.optional(v.id("paymentAdjustments")),
    agreementId: v.optional(v.id("priceAgreements")), discountId: v.optional(v.id("discountRules")),
    referralId: v.optional(v.id("referrals")), createdAt: v.number(),
    key: v.optional(v.string()), fingerprint: v.optional(v.string()),
  })
    .index("by_accountId_and_createdAt", ["accountId", "createdAt"])
    .index("by_accountId_and_key", ["accountId", "key"])
    .index("by_subscriptionId_and_createdAt", ["subscriptionId", "createdAt"]),

  // RFC-002 §2.6 (A.5) — who/what/when for every manual plan / payment /
  // entitlement / activation change. Written in the same transaction as the
  // change itself (convex/lib/adminAudit.ts). `detail` is machine-parseable
  // JSON; prose is localized in the UI.
  adminAuditLog: defineTable({
    actorUserId: v.id("users"),
    accountId: v.optional(v.id("accounts")),
    businessId: v.optional(v.id("businesses")),
    action: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_accountId_and_createdAt", ["accountId", "createdAt"])
    .index("by_businessId_and_createdAt", ["businessId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  // C.14 — reservation-block submissions (child table, unbounded). The
  // reservation block's field config (name/phone/email/partySize/note) drives
  // which of these the submit mutation accepts; every column except name is
  // optional so a block that disables a field simply never writes it.
  //
  // TASK-43 — the request workflow. THIS IS NOT A RESERVATION SYSTEM: no
  // payment, no guarantee, no automatic confirmation — the OWNER decides. A
  // request starts `pending` and holds ONE unit of its zone softly until
  // `heldUntil` (2h), when a scheduled flip (+ cron backstop) marks it
  // `expired` and frees the unit. `confirmed` holds the unit for good;
  // `declined`/`expired` free it. Legacy rows (status absent) predate the
  // workflow and are read as still holding (their old semantics).
  venueReservations: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    partySize: v.optional(v.number()),
    note: v.optional(v.string()),
    // Zone reference (block-embedded zone id) + a name snapshot so the owner
    // list stays readable after the block's zones are edited.
    zoneId: v.optional(v.string()),
    zoneName: v.optional(v.string()),
    // The time the guest asked for — informational for the owner.
    desiredAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("declined"),
        v.literal("expired"),
      ),
    ),
    // Soft-hold expiry instant for pending rows (reserve→commit, RFC §2.9).
    heldUntil: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_eventId_and_createdAt", ["eventId", "createdAt"])
    .index("by_eventId_and_status", ["eventId", "status"])
    .index("by_status_and_heldUntil", ["status", "heldUntil"]),

  // TASK-43 — per-event daily analytics rollup. AGGREGATE ONLY, by design
  // (RFC-001 §2.10): counts and a per-block-type view record — never an IP, a
  // user agent, a guest id, or any per-visitor row.
  dailyEventMetrics: defineTable({
    eventId: v.id("events"),
    dateKey: v.string(),
    pageViews: v.number(),
    reservationSubmits: v.number(),
    blockViews: v.optional(v.record(v.string(), v.number())),
    updatedAt: v.number(),
  }).index("by_eventId_and_dateKey", ["eventId", "dateKey"]),

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
