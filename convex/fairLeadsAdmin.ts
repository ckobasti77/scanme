import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  FAIR_ADMIN_LIST_LIMIT,
  FAIR_CONSENT_EXHIBITOR_PLACEHOLDER,
  FAIR_CONSENT_LEGAL_APPROVER_MAX,
  type FairContactRequirement,
  type FairLeadConfigSource,
  type FairLeadKind,
  type FairPreferredContact,
} from "../lib/fair-contract";
import { getFairEntitlements } from "../lib/fair-entitlements";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, requireFairEvent, requireText } from "./lib/fairCatalog";
import {
  fairActiveConsent,
  fairActiveFollowUpTemplate,
  fairFollowUpEnabled,
  fairLeadConfig,
  fairLeadDelivery,
  fairLeadsEnabled,
  fairParticipationLeadDefault,
  scheduleFairEmailSend,
} from "./lib/fairLeads";
import {
  fairConsentStatus,
  fairContactRequirement,
  fairEmailDeliveryStatus,
  fairLeadConfigSource,
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
// P0 — activation must wait for the expert-reviewed text and (K3) records who
// approved it and when. Only drafts change; active/retired are immutable. K3:
// activation is no longer the only switch — the lead flow and the follow-up
// also need the Convex env switches FAIR_LEADS_ENABLED / FAIR_FOLLOWUP_ENABLED.
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
  legalApprovedBy: v.optional(v.string()),
  legalApprovedAt: v.optional(v.number()),
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
          ...(row.legalApprovedBy !== undefined ? { legalApprovedBy: row.legalApprovedBy } : {}),
          ...(row.legalApprovedAt !== undefined ? { legalApprovedAt: row.legalApprovedAt } : {}),
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
 * draft → active, the previous active version → retired, in one transaction.
 * The text must name the exhibitor through FAIR_CONSENT_EXHIBITOR_PLACEHOLDER
 * (MASTER §8). K3: activation also needs the legal approval record the admin
 * enters — who did the expert review (`legalApprovedBy`) and when
 * (`legalApprovedAt`, not in the future) — stored on the version and in the
 * audit; otherwise FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED and nothing changes.
 * Activation alone still opens nothing: the flow also needs the Convex env
 * switch FAIR_LEADS_ENABLED (convex/lib/fairLeads.ts).
 */
export const activateConsent = mutation({
  args: {
    consentId: v.id("fairConsentConfigs"),
    // Optional in the validator so a missing value is a stable code, not a validator error.
    legalApprovedBy: v.optional(v.string()),
    legalApprovedAt: v.optional(v.number()),
  },
  returns: v.object({ consentId: v.id("fairConsentConfigs"), version: v.number(), retiredConsentId: v.union(v.id("fairConsentConfigs"), v.null()) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const row = await ctx.db.get(args.consentId);
    if (!row) fairAdminError("FAIR_CONSENT_NOT_FOUND");
    if (row.status !== "draft") fairAdminError("FAIR_CONSENT_STATUS", { status: row.status });
    const legalApprovedBy = (args.legalApprovedBy ?? "").trim().replace(/\s+/g, " ");
    if (!legalApprovedBy || legalApprovedBy.length > FAIR_CONSENT_LEGAL_APPROVER_MAX) {
      fairAdminError("FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED", { field: "legalApprovedBy" });
    }
    const legalApprovedAt = args.legalApprovedAt;
    if (legalApprovedAt === undefined || !Number.isFinite(legalApprovedAt) || legalApprovedAt <= 0 || legalApprovedAt > now) {
      fairAdminError("FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED", { field: "legalApprovedAt" });
    }
    if (!row.text.includes(FAIR_CONSENT_EXHIBITOR_PLACEHOLDER)) fairAdminError("FAIR_CONSENT_EXHIBITOR_MISSING");
    const current = await fairActiveConsent(ctx, row.eventId, row.leadKind);
    if (current) await ctx.db.patch(current._id, { status: "retired", updatedAt: now });
    await ctx.db.patch(row._id, { status: "active", activatedAt: now, legalApprovedBy, legalApprovedAt, updatedAt: now });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: "fair_consent_activated",
      detail: { eventId: row.eventId, leadKind: row.leadKind, version: row.version, legalApprovedBy, legalApprovedAt },
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

type LeadConfigValues = { enabled: boolean; contactRequirement: FairContactRequirement; preferredContact?: FairPreferredContact };

/** Writes one model's config for one kind; no difference, no write. A row without `source` (before A7) counts as an exception. */
async function writeLeadConfig(
  ctx: MutationCtx,
  input: {
    model: Doc<"fairEventModels">;
    kind: FairLeadKind;
    next: LeadConfigValues;
    source: FairLeadConfigSource;
    existing: Doc<"fairLeadConfigs"> | null;
    adminId: Id<"users">;
    now: number;
  },
): Promise<{ configId: Id<"fairLeadConfigs">; result: "created" | "updated" | "unchanged" }> {
  const { existing, next } = input;
  if (existing) {
    if (
      existing.contactRequirement === next.contactRequirement &&
      existing.preferredContact === next.preferredContact &&
      existing.enabled === next.enabled &&
      (existing.source ?? "override") === input.source
    ) {
      return { configId: existing._id, result: "unchanged" };
    }
    await ctx.db.patch(existing._id, {
      contactRequirement: next.contactRequirement,
      preferredContact: next.preferredContact,
      enabled: next.enabled,
      source: input.source,
      updatedByUserId: input.adminId,
      updatedAt: input.now,
    });
    return { configId: existing._id, result: "updated" };
  }
  const configId = await ctx.db.insert("fairLeadConfigs", {
    eventModelId: input.model._id,
    leadKind: input.kind,
    contactRequirement: next.contactRequirement,
    ...(next.preferredContact ? { preferredContact: next.preferredContact } : {}),
    enabled: next.enabled,
    source: input.source,
    updatedByUserId: input.adminId,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return { configId, result: "created" };
}

/**
 * One config per model and kind (HANDOFF §5.4). Enabling needs the right in
 * the model's package (interest Starter+, test drive Advanced); a disabled
 * config may be prepared earlier. `preferredContact` never makes a field
 * required — only `contactRequirement` does. A7: this is the model's own
 * exception (`source: "override"`); the exhibitor default never overwrites it.
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
    return writeLeadConfig(ctx, {
      model,
      kind: args.leadKind,
      next: { contactRequirement: args.contactRequirement, preferredContact: args.preferredContact, enabled: args.enabled },
      source: "override",
      existing: await fairLeadConfig(ctx, model._id, args.leadKind),
      adminId: admin._id,
      now,
    });
  },
});

// -----------------------------------------------------------------------------
// Admin UX A7 — lead forms per exhibitor (`Interakcije → Forme`, ADMIN-UX §6):
// the exhibitor's default for each form, written to all of its models in one
// move; a model's own exception wins. The public flow is unchanged: getLeadForm
// and submitLead still read only fairLeadConfigs (B4/K3 contract), the package
// still decides (interest Starter+, test drive Advanced) and the K3 switches
// and the consent gate stay where they are.
// -----------------------------------------------------------------------------

/** "Primeni na sve modele" handles at most this many models of one exhibitor. */
const LEAD_APPLY_MODELS_MAX = 100;
const LEAD_KINDS = ["interest", "test_drive"] as const;

/** The model's config that follows the exhibitor default: off where the package lacks the form. */
function configFromDefault(row: Doc<"fairParticipationLeadDefaults">, tier: Doc<"fairEventModels">["packageTier"]) {
  const entitled = leadRight(tier, row.leadKind);
  const next: LeadConfigValues = {
    enabled: row.enabled && entitled,
    contactRequirement: row.contactRequirement,
    ...(row.preferredContact ? { preferredContact: row.preferredContact } : {}),
  };
  return { entitled, next };
}

const leadDefaultView = v.object({
  participationId: v.id("fairParticipations"),
  leadKind: fairLeadKind,
  enabled: v.boolean(),
  contactRequirement: fairContactRequirement,
  preferredContact: v.optional(fairPreferredContact),
  updatedAt: v.number(),
});

const modelFormView = v.object({
  /** The model's package has this form (interest Starter+, test drive Advanced). */
  entitled: v.boolean(),
  config: v.union(
    v.null(),
    v.object({
      enabled: v.boolean(),
      contactRequirement: fairContactRequirement,
      preferredContact: v.optional(fairPreferredContact),
      source: fairLeadConfigSource,
      updatedAt: v.number(),
    }),
  ),
});

function formView(model: Doc<"fairEventModels">, kind: FairLeadKind, row: Doc<"fairLeadConfigs"> | null) {
  return {
    entitled: leadRight(model.packageTier, kind),
    config: row
      ? {
          enabled: row.enabled,
          contactRequirement: row.contactRequirement,
          ...(row.preferredContact ? { preferredContact: row.preferredContact } : {}),
          source: row.source ?? ("override" as const),
          updatedAt: row.updatedAt,
        }
      : null,
  };
}

/**
 * The real state of both forms on every exhibited model of the event, with
 * where it comes from, plus the exhibitors' defaults. Bounded by the admin
 * list limit; two indexed reads per model. No visitor data.
 */
export const getEventLeadForms = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    defaults: v.array(leadDefaultView),
    models: v.array(v.object({
      eventModelId: v.id("fairEventModels"),
      participationId: v.id("fairParticipations"),
      packageTier: fairPackageTier,
      interest: modelFormView,
      testDrive: modelFormView,
    })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const defaults = await ctx.db
      .query("fairParticipationLeadDefaults")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(FAIR_ADMIN_LIST_LIMIT);
    const models = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id))
      .take(FAIR_ADMIN_LIST_LIMIT);
    const rows = [];
    for (const model of models) {
      if (model.status === "withdrawn") continue;
      rows.push({
        eventModelId: model._id,
        participationId: model.participationId,
        packageTier: model.packageTier,
        interest: formView(model, "interest", await fairLeadConfig(ctx, model._id, "interest")),
        testDrive: formView(model, "test_drive", await fairLeadConfig(ctx, model._id, "test_drive")),
      });
    }
    return {
      defaults: defaults.map((row) => ({
        participationId: row.participationId,
        leadKind: row.leadKind,
        enabled: row.enabled,
        contactRequirement: row.contactRequirement,
        ...(row.preferredContact ? { preferredContact: row.preferredContact } : {}),
        updatedAt: row.updatedAt,
      })),
      models: rows,
    };
  },
});

/** The exhibitor's default for one form (one row per participation and kind). Applying it is a separate move. */
export const upsertParticipationLeadDefault = mutation({
  args: {
    participationId: v.id("fairParticipations"),
    leadKind: fairLeadKind,
    enabled: v.boolean(),
    contactRequirement: fairContactRequirement,
    preferredContact: v.optional(fairPreferredContact),
  },
  returns: v.object({ defaultId: v.id("fairParticipationLeadDefaults"), result: upsertResult }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const participation = await ctx.db.get(args.participationId);
    if (!participation) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
    const existing = await fairParticipationLeadDefault(ctx, participation._id, args.leadKind);
    if (existing) {
      if (
        existing.enabled === args.enabled &&
        existing.contactRequirement === args.contactRequirement &&
        existing.preferredContact === args.preferredContact
      ) {
        return { defaultId: existing._id, result: "unchanged" as const };
      }
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        contactRequirement: args.contactRequirement,
        preferredContact: args.preferredContact,
        updatedByUserId: admin._id,
        updatedAt: now,
      });
      return { defaultId: existing._id, result: "updated" as const };
    }
    const defaultId = await ctx.db.insert("fairParticipationLeadDefaults", {
      eventId: participation.eventId,
      participationId: participation._id,
      leadKind: args.leadKind,
      enabled: args.enabled,
      contactRequirement: args.contactRequirement,
      ...(args.preferredContact ? { preferredContact: args.preferredContact } : {}),
      updatedByUserId: admin._id,
      createdAt: now,
      updatedAt: now,
    });
    return { defaultId, result: "created" as const };
  },
});

/**
 * "Primeni na sve modele izlagača": writes the default of one kind (or both)
 * to every exhibited model of the exhibitor (`source: "default"`) in one
 * transaction, at most LEAD_APPLY_MODELS_MAX models. Idempotent: a
 * second run changes nothing. A model's exception is skipped; a model whose
 * package lacks the form gets it switched off and is listed in
 * `notEntitled` (never skipped silently).
 */
export const applyLeadDefaultsToModels = mutation({
  args: { participationId: v.id("fairParticipations"), leadKind: v.optional(fairLeadKind) },
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    skippedOverride: v.number(),
    notEntitled: v.array(v.object({ eventModelId: v.id("fairEventModels"), leadKind: fairLeadKind })),
    missingDefault: v.array(fairLeadKind),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const participation = await ctx.db.get(args.participationId);
    if (!participation) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
    const models = (
      await ctx.db
        .query("fairEventModels")
        .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", participation.eventId))
        .take(FAIR_ADMIN_LIST_LIMIT)
    ).filter((model) => model.participationId === participation._id && model.status !== "withdrawn");
    if (models.length > LEAD_APPLY_MODELS_MAX) fairAdminError("FAIR_BULK_TOO_LARGE", { max: LEAD_APPLY_MODELS_MAX });
    const out = {
      created: 0,
      updated: 0,
      unchanged: 0,
      skippedOverride: 0,
      notEntitled: [] as { eventModelId: Id<"fairEventModels">; leadKind: FairLeadKind }[],
      missingDefault: [] as FairLeadKind[],
    };
    for (const kind of args.leadKind ? [args.leadKind] : LEAD_KINDS) {
      const row = await fairParticipationLeadDefault(ctx, participation._id, kind);
      if (!row) {
        out.missingDefault.push(kind);
        continue;
      }
      for (const model of models) {
        const existing = await fairLeadConfig(ctx, model._id, kind);
        if (existing && (existing.source ?? "override") === "override") {
          out.skippedOverride += 1;
          continue;
        }
        const { entitled, next } = configFromDefault(row, model.packageTier);
        if (row.enabled && !entitled) out.notEntitled.push({ eventModelId: model._id, leadKind: kind });
        const { result } = await writeLeadConfig(ctx, { model, kind, next, source: "default", existing, adminId: admin._id, now });
        out[result] += 1;
      }
    }
    if (out.created || out.updated) {
      await writeAdminAudit(ctx, {
        actorUserId: admin._id,
        accountId: participation.accountId,
        businessId: participation.businessId,
        action: "fair_lead_defaults_applied",
        detail: {
          eventId: participation.eventId,
          participationId: participation._id,
          leadKind: args.leadKind ?? "both",
          created: out.created,
          updated: out.updated,
          skippedOverride: out.skippedOverride,
          notEntitled: out.notEntitled.length,
        },
        now,
      });
    }
    return out;
  },
});

/** Ends a model's exception: the model follows the exhibitor default again (the default must exist). */
export const clearLeadOverride = mutation({
  args: { eventModelId: v.id("fairEventModels"), leadKind: fairLeadKind },
  returns: v.object({ result: upsertResult, enabled: v.boolean(), entitled: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const model = await ctx.db.get(args.eventModelId);
    if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
    const row = await fairParticipationLeadDefault(ctx, model.participationId, args.leadKind);
    if (!row) fairAdminError("FAIR_LEAD_DEFAULT_MISSING", { leadKind: args.leadKind });
    const { entitled, next } = configFromDefault(row, model.packageTier);
    const existing = await fairLeadConfig(ctx, model._id, args.leadKind);
    const { result } = await writeLeadConfig(ctx, { model, kind: args.leadKind, next, source: "default", existing, adminId: admin._id, now });
    return { result, enabled: next.enabled, entitled };
  },
});

/**
 * The K3 switches as plain booleans for the admin info bar (A7 Forme, A10
 * Pregled): never the env values themselves.
 */
export const getLeadSwitches = query({
  args: {},
  returns: v.object({ leadsEnabled: v.boolean(), followUpEnabled: v.boolean() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return { leadsEnabled: fairLeadsEnabled(), followUpEnabled: fairFollowUpEnabled() };
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
    // P1: a pre-event lead (before the event's start) is never handed to the exhibitor.
    const event = await requireFairEvent(ctx, args.eventId);
    const page = await ctx.db
      .query("fairLeads")
      .withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", args.participationId).gte("createdAt", event.startsAt))
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
