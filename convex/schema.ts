import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

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

  dailyScanCounts: defineTable({
    dynamicLinkId: v.id("dynamicLinks"),
    dateKey: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_dynamicLinkId_and_dateKey", ["dynamicLinkId", "dateKey"]),

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
