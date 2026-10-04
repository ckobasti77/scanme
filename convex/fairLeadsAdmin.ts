import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { FAIR_CONSENT_EXHIBITOR_PLACEHOLDER, type FairLeadKind } from "../lib/fair-contract";
import { getFairEntitlements } from "../lib/fair-entitlements";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, requireText } from "./lib/fairCatalog";
import { fairActiveConsent, fairActiveFollowUpTemplate, fairLeadConfig, fairLeadDelivery, scheduleFairEmailSend } from "./lib/fairLeads";
import {
  fairConsentStatus,
  fairContactRequirement,
  fairEmailDeliveryStatus,
  fairLeadKind,
  fairLeadStatus,
  fairPackageTier,
  fairPreferredContact,
} from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — B4 admin for leads and email (BACKEND-HANDOFF §4.4,
// §5.4, §7; MASTER §8, §13, §15 `Događaji`). Every function requires
// requireAdmin: only the ScanMe team (Aleksa, Jovan, Teodora) sees contacts;
// exhibitors have no panel. Errors are ConvexError({ code }) with
// FAIR_ADMIN_ISSUE_CODES.
//
// Consent: versions are drafted here, but the legal text itself is open item
// P0 — activation is the production switch of the lead flow and must wait for
// the expert-reviewed text. Only drafts change; active/retired are immutable.
// =============================================================================

const CONSENT_VERSIONS_CAP = 20;
const CONSENT_TEXT_MAX = 5000;
const TEMPLATE_SUBJECT_MAX = 150;
const TEMPLATE_TEXT_MAX = 5000;
const EXPORT_PAGE_MAX = 100;
const upsertResult = v.union(v.literal("created"), v.literal("updated"), v.literal("unchanged"));

function leadRight(tier: Doc<"fairEventModels">["packageTier"], kind: FairLeadKind) {
  const rights = getFairEntitlements(tier);
  return kind === "interest" ? rights.interest : rights.testDrive;
}

// -----------------------------------------------------------------------------
// Consent (fairConsentConfigs)
// -----------------------------------------------------------------------------

const consentRow = v.object({
  consentId: v.id("fairConsentConfigs"),
  leadKind: fairLeadKind,
  version: v.number(),
  status: fairConsentStatus,
  text: v.string(),
  activatedAt: v.optional(v.number()),
  updatedAt: v.number(),
});

/** Newest versions first, per lead kind (bounded). */
export const getEventConsents = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.array(consentRow),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = [];
    for (const leadKind of ["interest", "test_drive"] as const) {
      const versions = await ctx.db
        .query("fairConsentConfigs")
        .withIndex("by_eventId_and_leadKind_and_version", (q) => q.eq("eventId", args.eventId).eq("leadKind", leadKind))
        .order("desc")
        .take(CONSENT_VERSIONS_CAP);
      for (const row of versions) {
        rows.push({
          consentId: row._id,
          leadKind,
          version: row.version,
          status: row.status,
          text: row.text,
          ...(row.activatedAt !== undefined ? { activatedAt: row.activatedAt } : {}),
          updatedAt: row.updatedAt,
        });
      }
    }
    return rows;
  },
});

/** New draft version (next number), or an edit of an existing draft. */
export const saveConsentDraft = mutation({
  args: { eventId: v.id("fairEvents"), leadKind: fairLeadKind, text: v.string(), consentId: v.optional(v.id("fairConsentConfigs")) },
  returns: v.object({ consentId: v.id("fairConsentConfigs"), version: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    if (!(await ctx.db.get(args.eventId))) fairAdminError("FAIR_EVENT_NOT_FOUND");
    const text = requireText(args.text, "text", CONSENT_TEXT_MAX);
    if (args.consentId) {
      const row = await ctx.db.get(args.consentId);
      if (!row || row.eventId !== args.eventId || row.leadKind !== args.leadKind) fairAdminError("FAIR_CONSENT_NOT_FOUND");
      if (row.status !== "draft") fairAdminError("FAIR_CONSENT_STATUS", { status: row.status });
      await ctx.db.patch(row._id, { text, updatedAt: now });
      return { consentId: row._id, version: row.version };
    }
    const latest = await ctx.db
      .query("fairConsentConfigs")
      .withIndex("by_eventId_and_leadKind_and_version", (q) => q.eq("eventId", args.eventId).eq("leadKind", args.leadKind))
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    const consentId = await ctx.db.insert("fairConsentConfigs", {
      eventId: args.eventId,
      leadKind: args.leadKind,
      version,
      text,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    return { consentId, version };
  },
});

/**
 * Production switch: draft → active, the previous active version → retired,
 * in one transaction. The text must name the exhibitor through
 * FAIR_CONSENT_EXHIBITOR_PLACEHOLDER (MASTER §8).
 */
export const activateConsent = mutation({
  args: { consentId: v.id("fairConsentConfigs") },
  returns: v.object({ consentId: v.id("fairConsentConfigs"), version: v.number(), retiredConsentId: v.union(v.id("fairConsentConfigs"), v.null()) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const row = await ctx.db.get(args.consentId);
    if (!row) fairAdminError("FAIR_CONSENT_NOT_FOUND");
    if (row.status !== "draft") fairAdminError("FAIR_CONSENT_STATUS", { status: row.status });
    if (!row.text.includes(FAIR_CONSENT_EXHIBITOR_PLACEHOLDER)) fairAdminError("FAIR_CONSENT_EXHIBITOR_MISSING");
    const current = await fairActiveConsent(ctx, row.eventId, row.leadKind);
    if (current) await ctx.db.patch(current._id, { status: "retired", updatedAt: now });
    await ctx.db.patch(row._id, { status: "active", activatedAt: now, updatedAt: now });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: "fair_consent_activated",
      detail: { eventId: row.eventId, leadKind: row.leadKind, version: row.version },
      now,
    });
    return { consentId: row._id, version: row.version, retiredConsentId: current?._id ?? null };
  },
});

/** active → retired: the lead flow of that kind closes again (CONSENT_NOT_CONFIGURED). */
export const retireConsent = mutation({
  args: { consentId: v.id("fairConsentConfigs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const row = await ctx.db.get(args.consentId);
    if (!row) fairAdminError("FAIR_CONSENT_NOT_FOUND");
    if (row.status !== "active") fairAdminError("FAIR_CONSENT_STATUS", { status: row.status });
    await ctx.db.patch(row._id, { status: "retired", updatedAt: now });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: "fair_consent_retired",
      detail: { eventId: row.eventId, leadKind: row.leadKind, version: row.version },
      now,
    });
    return null;
  },
});

// -----------------------------------------------------------------------------
// Per-model lead settings (fairLeadConfigs) and the follow-up text
// (fairMessageTemplates, post_event_follow_up)
// -----------------------------------------------------------------------------

const leadConfigView = v.union(
  v.null(),
  v.object({ contactRequirement: fairContactRequirement, preferredContact: v.optional(fairPreferredContact), enabled: v.boolean(), updatedAt: v.number() }),
);

function configView(row: Doc<"fairLeadConfigs"> | null) {
  if (!row) return null;
  return {
    contactRequirement: row.contactRequirement,
    ...(row.preferredContact ? { preferredContact: row.preferredContact } : {}),
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
}

export const getModelLeadSettings = query({
  args: { eventModelId: v.id("fairEventModels") },
  returns: v.object({
    packageTier: fairPackageTier,
    interest: leadConfigView,
    testDrive: leadConfigView,
    followUpTemplate: v.union(v.null(), v.object({ subject: v.string(), plainText: v.string(), version: v.number(), updatedAt: v.number() })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const model = await ctx.db.get(args.eventModelId);
    if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
    const template = await fairActiveFollowUpTemplate(ctx, model._id);
    return {
      packageTier: model.packageTier,
      interest: configView(await fairLeadConfig(ctx, model._id, "interest")),
      testDrive: configView(await fairLeadConfig(ctx, model._id, "test_drive")),
      followUpTemplate: template ? { subject: template.subject, plainText: template.plainText, version: template.version, updatedAt: template.updatedAt } : null,
    };
  },
});

/**
 * One config per model and kind (HANDOFF §5.4). Enabling needs the right in
 * the model's package (interest Starter+, test drive Advanced); a disabled
 * config may be prepared earlier. `preferredContact` never makes a field
 * required — only `contactRequirement` does.
 */
export const upsertLeadConfig = mutation({
  args: {
    eventModelId: v.id("fairEventModels"),
    leadKind: fairLeadKind,
    contactRequirement: fairContactRequirement,
    preferredContact: v.optional(fairPreferredContact),
    enabled: v.boolean(),
  },
  returns: v.object({ configId: v.id("fairLeadConfigs"), result: upsertResult }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const model = await ctx.db.get(args.eventModelId);
    if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
    if (args.enabled && !leadRight(model.packageTier, args.leadKind)) fairAdminError("FAIR_FEATURE_NOT_ENTITLED", { leadKind: args.leadKind });
    const existing = await fairLeadConfig(ctx, model._id, args.leadKind);
    if (existing) {
      if (
        existing.contactRequirement === args.contactRequirement &&
        existing.preferredContact === args.preferredContact &&
        existing.enabled === args.enabled
      ) {
        return { configId: existing._id, result: "unchanged" as const };
      }
      await ctx.db.patch(existing._id, {
        contactRequirement: args.contactRequirement,
        preferredContact: args.preferredContact,
        enabled: args.enabled,
        updatedByUserId: admin._id,
        updatedAt: now,
      });
      return { configId: existing._id, result: "updated" as const };
    }
    const configId = await ctx.db.insert("fairLeadConfigs", {
      eventModelId: model._id,
      leadKind: args.leadKind,
      contactRequirement: args.contactRequirement,
      ...(args.preferredContact ? { preferredContact: args.preferredContact } : {}),
      enabled: args.enabled,
      updatedByUserId: admin._id,
      createdAt: now,
      updatedAt: now,
    });
    return { configId, result: "created" as const };
  },
});

/**
 * The exhibitor's follow-up text, entered by the ScanMe admin (HANDOFF §5.4:
 * no HTML from a public client; plain text only). Advanced only. A change
 * retires the active version and activates a new one; the sender reads the
 * active version at send time.
 */
export const upsertFollowUpTemplate = mutation({
  args: { eventModelId: v.id("fairEventModels"), subject: v.string(), plainText: v.string() },
  returns: v.object({ templateId: v.id("fairMessageTemplates"), version: v.number(), result: upsertResult }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const model = await ctx.db.get(args.eventModelId);
    if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
    if (!getFairEntitlements(model.packageTier).postEventFollowUp) fairAdminError("FAIR_FEATURE_NOT_ENTITLED");
    const subject = requireText(args.subject.replace(/[\r\n]+/g, " "), "subject", TEMPLATE_SUBJECT_MAX);
    const plainText = requireText(args.plainText, "plainText", TEMPLATE_TEXT_MAX);
    const active = await fairActiveFollowUpTemplate(ctx, model._id);
    if (active && active.subject === subject && active.plainText === plainText) {
      return { templateId: active._id, version: active.version, result: "unchanged" as const };
    }
    const lastRetired = await ctx.db
      .query("fairMessageTemplates")
      .withIndex("by_eventModelId_and_kind_and_status", (q) =>
        q.eq("eventModelId", model._id).eq("kind", "post_event_follow_up").eq("status", "retired"),
      )
      .order("desc")
      .first();
    const version = Math.max(active?.version ?? 0, lastRetired?.version ?? 0) + 1;
    if (active) await ctx.db.patch(active._id, { status: "retired", updatedAt: now });
    const templateId = await ctx.db.insert("fairMessageTemplates", {
      eventModelId: model._id,
      kind: "post_event_follow_up",
      subject,
      plainText,
      status: "active",
      version,
      createdAt: now,
      updatedAt: now,
    });
    return { templateId, version, result: active ? ("updated" as const) : ("created" as const) };
  },
});

// -----------------------------------------------------------------------------
// Leads (PII — admin only) and the outbox
// -----------------------------------------------------------------------------

const deliveryView = v.union(
  v.null(),
  v.object({
    deliveryId: v.id("fairEmailDeliveries"),
    status: fairEmailDeliveryStatus,
    scheduledFor: v.number(),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
  }),
);

const leadRow = v.object({
  leadId: v.id("fairLeads"),
  createdAt: v.number(),
  kind: fairLeadKind,
  eventModelId: v.id("fairEventModels"),
  contactName: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  consentVersion: v.number(),
  consentedAt: v.number(),
  status: fairLeadStatus,
  followUpSuppressed: v.boolean(),
  suppressedAt: v.optional(v.number()),
  confirmation: deliveryView,
  followUp: deliveryView,
});

function deliverySummary(row: Doc<"fairEmailDeliveries"> | null) {
  if (!row) return null;
  return {
    deliveryId: row._id,
    status: row.status,
    scheduledFor: row.scheduledFor,
    attemptCount: row.attemptCount,
    ...(row.lastError ? { lastError: row.lastError } : {}),
  };
}

/**
 * Paginated lead export of one exhibitor on one event (newest first) — the
 * list in `Događaji → Leadovi` and the source of the PII hand-over to the
 * exhibitor. At most EXPORT_PAGE_MAX rows per page; per row only the two
 * outbox rows of that lead are read.
 */
export const exportLeads = query({
  args: { eventId: v.id("fairEvents"), participationId: v.id("fairParticipations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(leadRow),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const participation = await ctx.db.get(args.participationId);
    if (!participation || participation.eventId !== args.eventId) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
    if (args.paginationOpts.numItems > EXPORT_PAGE_MAX) fairAdminError("INVALID_INPUT", { field: "numItems", max: EXPORT_PAGE_MAX });
    const page = await ctx.db
      .query("fairLeads")
      .withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", args.participationId))
      .order("desc")
      .paginate(args.paginationOpts);
    const rows = [];
    for (const lead of page.page) {
      rows.push({
        leadId: lead._id,
        createdAt: lead.createdAt,
        kind: lead.kind,
        eventModelId: lead.eventModelId,
        contactName: lead.contactName,
        ...(lead.email !== undefined ? { email: lead.email } : {}),
        ...(lead.phone !== undefined ? { phone: lead.phone } : {}),
        consentVersion: lead.consentVersion,
        consentedAt: lead.consentedAt,
        status: lead.status,
        followUpSuppressed: lead.followUpSuppressed,
        ...(lead.suppressedAt !== undefined ? { suppressedAt: lead.suppressedAt } : {}),
        confirmation: deliverySummary(await fairLeadDelivery(ctx, lead._id, "immediate_confirmation")),
        followUp: deliverySummary(await fairLeadDelivery(ctx, lead._id, "post_event_follow_up")),
      });
    }
    return { ...page, page: rows };
  },
});

/**
 * Records the visitor's reply-based opt-out of the one follow-up (MASTER §8).
 * The sender re-reads this flag immediately before delivery. Reversible for
 * an admin mistake; a follow-up already sent stays sent.
 */
export const setFollowUpSuppressed = mutation({
  args: { leadId: v.id("fairLeads"), suppressed: v.boolean() },
  returns: v.object({ leadId: v.id("fairLeads"), followUpSuppressed: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) fairAdminError("FAIR_LEAD_NOT_FOUND");
    if (lead.followUpSuppressed !== args.suppressed) {
      await ctx.db.patch(
        lead._id,
        args.suppressed
          ? { followUpSuppressed: true, suppressedAt: Date.now(), suppressedByUserId: admin._id }
          : { followUpSuppressed: false, suppressedAt: undefined, suppressedByUserId: undefined },
      );
    }
    return { leadId: lead._id, followUpSuppressed: args.suppressed };
  },
});

/** failed → queued, sent again now with the SAME dedupeKey/Idempotency-Key (no duplicate delivery). */
export const retryEmailDelivery = mutation({
  args: { deliveryId: v.id("fairEmailDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) fairAdminError("FAIR_EMAIL_DELIVERY_NOT_FOUND");
    if (delivery.status !== "failed") fairAdminError("FAIR_EMAIL_DELIVERY_STATUS", { status: delivery.status });
    await ctx.db.patch(delivery._id, { status: "queued", scheduledFor: now, lastError: undefined, updatedAt: now });
    await scheduleFairEmailSend(ctx, delivery._id, now, now);
    return null;
  },
});
