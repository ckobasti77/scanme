import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { FAIR_ADMIN_LIST_LIMIT, FAIR_FOLLOW_UP_SUBJECT_MAX, FAIR_FOLLOW_UP_TEXT_MAX } from "../lib/fair-contract";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, requireFairEvent, requireText } from "./lib/fairCatalog";
import { fairFollowUpSampleValues, fairFollowUpUnknownField, fairFollowUpValues } from "./lib/fairFollowUp";
import { fairExhibitorModels, fairPairFollowUpFacts, fairPairLeads } from "./lib/fairLeadActivity";
import { fairActiveExhibitorFollowUp, fairActiveFollowUpTemplate, fairExhibitorName, fairLeadDelivery, fairModelFullName } from "./lib/fairLeads";
import { fairLeadKind, fairMessageTemplateStatus } from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — Admin UX A8: the post-fair follow-up per EXHIBITOR
// (ADMIN-UX §7, §12.3; MASTER §8). Every function requires requireAdmin.
//
// - One text per exhibitor participation: a draft is edited, "Aktiviraj"
//   makes it the active version (the previous active one is retired), and
//   "Povuci" retires it. Plain text with merge fields (FAIR_FOLLOW_UP_FIELDS);
//   an unknown `{…}` is refused (FAIR_FOLLOWUP_UNKNOWN_FIELD, details.field).
// - Sending is NOT here: it stays the B4 outbox. Each Advanced lead still
//   queues its row at submit (K3 FAIR_FOLLOWUP_ENABLED), and claimDelivery
//   (convex/fairEmails.ts) sends ONE email per (visitor email, exhibitor),
//   rechecking the switches and the suppression right before sending.
// - The B4 text per model (fairMessageTemplates) stays as the fallback for an
//   exhibitor without an active text here.
// =============================================================================

type Ctx = QueryCtx | MutationCtx;

const upsertResult = v.union(v.literal("created"), v.literal("updated"), v.literal("unchanged"));
/** Pairs counted by estimateFollowUps: the newest leads of the event (bounded). */
const ESTIMATE_LEADS_CAP = 1000;
/** Leads offered as preview examples. */
const PREVIEW_LEADS = 20;

const templateView = v.object({
  templateId: v.id("fairExhibitorFollowUpTemplates"),
  subject: v.string(),
  plainText: v.string(),
  status: fairMessageTemplateStatus,
  version: v.number(),
  updatedAt: v.number(),
});

function viewOf(row: Doc<"fairExhibitorFollowUpTemplates">) {
  return { templateId: row._id, subject: row.subject, plainText: row.plainText, status: row.status, version: row.version, updatedAt: row.updatedAt };
}

async function templateWith(ctx: Ctx, participationId: Id<"fairParticipations">, status: "draft" | "active" | "retired") {
  return ctx.db
    .query("fairExhibitorFollowUpTemplates")
    .withIndex("by_participationId_and_status", (q) => q.eq("participationId", participationId).eq("status", status))
    .order("desc")
    .first();
}

/** Subject on one line, both parts present and within limits, no unknown merge field. */
function validText(args: { subject: string; plainText: string }) {
  const subject = requireText(args.subject.replace(/[\r\n]+/g, " "), "subject", FAIR_FOLLOW_UP_SUBJECT_MAX);
  const plainText = requireText(args.plainText, "plainText", FAIR_FOLLOW_UP_TEXT_MAX);
  const unknown = fairFollowUpUnknownField({ subject, plainText });
  if (unknown !== null) fairAdminError("FAIR_FOLLOWUP_UNKNOWN_FIELD", { field: unknown });
  return { subject, plainText };
}

/**
 * Per exhibitor of the event: the active text, the draft, how many exhibited
 * Advanced models it has (the follow-up exists only for Advanced) and how
 * many of those still carry a B4 per-model text (the fallback).
 */
export const getExhibitorFollowUps = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.array(v.object({
    participationId: v.id("fairParticipations"),
    active: v.union(v.null(), templateView),
    draft: v.union(v.null(), templateView),
    advancedModels: v.number(),
    modelTexts: v.number(),
  })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const participations = await ctx.db
      .query("fairParticipations")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id))
      .take(FAIR_ADMIN_LIST_LIMIT);
    const byStatus = async (status: "draft" | "active") =>
      new Map(
        (await ctx.db
          .query("fairExhibitorFollowUpTemplates")
          .withIndex("by_eventId_and_status", (q) => q.eq("eventId", event._id).eq("status", status))
          .take(FAIR_ADMIN_LIST_LIMIT)).map((row) => [row.participationId, row]),
      );
    const active = await byStatus("active");
    const drafts = await byStatus("draft");
    const advanced = (await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_packageTier", (q) => q.eq("eventId", event._id).eq("packageTier", "advanced"))
      .take(FAIR_ADMIN_LIST_LIMIT)).filter((model) => model.status !== "withdrawn");
    const counts = new Map<Id<"fairParticipations">, { advancedModels: number; modelTexts: number }>();
    for (const model of advanced) {
      const count = counts.get(model.participationId) ?? { advancedModels: 0, modelTexts: 0 };
      count.advancedModels += 1;
      if (await fairActiveFollowUpTemplate(ctx, model._id)) count.modelTexts += 1;
      counts.set(model.participationId, count);
    }
    return participations.map((participation) => {
      const activeRow = active.get(participation._id);
      const draftRow = drafts.get(participation._id);
      return {
        participationId: participation._id,
        active: activeRow ? viewOf(activeRow) : null,
        draft: draftRow ? viewOf(draftRow) : null,
        ...(counts.get(participation._id) ?? { advancedModels: 0, modelTexts: 0 }),
      };
    });
  },
});

/** Saves the exhibitor's draft (one per exhibitor; a new one takes the next version number). */
export const saveExhibitorFollowUpDraft = mutation({
  args: { participationId: v.id("fairParticipations"), subject: v.string(), plainText: v.string() },
  returns: v.object({ templateId: v.id("fairExhibitorFollowUpTemplates"), version: v.number(), result: upsertResult }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const participation = await ctx.db.get(args.participationId);
    if (!participation) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
    const text = validText(args);
    const draft = await templateWith(ctx, participation._id, "draft");
    if (draft) {
      if (draft.subject === text.subject && draft.plainText === text.plainText) return { templateId: draft._id, version: draft.version, result: "unchanged" as const };
      await ctx.db.patch(draft._id, { ...text, updatedByUserId: admin._id, updatedAt: now });
      return { templateId: draft._id, version: draft.version, result: "updated" as const };
    }
    const latest = [await templateWith(ctx, participation._id, "active"), await templateWith(ctx, participation._id, "retired")];
    const version = Math.max(0, ...latest.map((row) => row?.version ?? 0)) + 1;
    const templateId = await ctx.db.insert("fairExhibitorFollowUpTemplates", {
      eventId: participation.eventId,
      participationId: participation._id,
      ...text,
      status: "draft",
      version,
      updatedByUserId: admin._id,
      createdAt: now,
      updatedAt: now,
    });
    return { templateId, version, result: "created" as const };
  },
});

/** draft → active; the exhibitor's previous active version → retired (one transaction, audited). */
export const activateExhibitorFollowUp = mutation({
  args: { templateId: v.id("fairExhibitorFollowUpTemplates") },
  returns: v.object({
    templateId: v.id("fairExhibitorFollowUpTemplates"),
    version: v.number(),
    retiredTemplateId: v.union(v.id("fairExhibitorFollowUpTemplates"), v.null()),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const row = await ctx.db.get(args.templateId);
    if (!row) fairAdminError("FAIR_FOLLOWUP_NOT_FOUND");
    if (row.status !== "draft") fairAdminError("FAIR_FOLLOWUP_STATUS", { status: row.status });
    validText(row);
    const current = await fairActiveExhibitorFollowUp(ctx, row.participationId);
    if (current) await ctx.db.patch(current._id, { status: "retired", updatedByUserId: admin._id, updatedAt: now });
    await ctx.db.patch(row._id, { status: "active", updatedByUserId: admin._id, updatedAt: now });
    const participation = await ctx.db.get(row.participationId);
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(participation ? { accountId: participation.accountId, businessId: participation.businessId } : {}),
      action: "fair_followup_activated",
      detail: { eventId: row.eventId, participationId: row.participationId, version: row.version },
      now,
    });
    return { templateId: row._id, version: row.version, retiredTemplateId: current?._id ?? null };
  },
});

/** active → retired: from now on the exhibitor sends no follow-up (unless a B4 per-model text remains). */
export const retireExhibitorFollowUp = mutation({
  args: { templateId: v.id("fairExhibitorFollowUpTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const row = await ctx.db.get(args.templateId);
    if (!row) fairAdminError("FAIR_FOLLOWUP_NOT_FOUND");
    if (row.status !== "active") fairAdminError("FAIR_FOLLOWUP_STATUS", { status: row.status });
    await ctx.db.patch(row._id, { status: "retired", updatedByUserId: admin._id, updatedAt: now });
    const participation = await ctx.db.get(row.participationId);
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(participation ? { accountId: participation.accountId, businessId: participation.businessId } : {}),
      action: "fair_followup_retired",
      detail: { eventId: row.eventId, participationId: row.participationId, version: row.version },
      now,
    });
    return null;
  },
});

const nullableText = v.union(v.string(), v.null());
/** One value per FAIR_FOLLOW_UP_FIELDS entry (null = the email uses the field's fallback text). */
const fieldValues = v.object({
  ime: nullableText,
  izlagac: nullableText,
  dogadjaj: nullableText,
  modeli: nullableText,
  modeli_zainteresovan: nullableText,
  modeli_probna_voznja: nullableText,
  modeli_ocenjeni: nullableText,
});

/**
 * The merge values for the admin preview: from the chosen lead's pair (that
 * visitor email × this exhibitor) or, without a lead, a marked example built
 * from the exhibitor's own models. The browser renders the text with these
 * values (convex/lib/fairFollowUp.ts), so the preview follows the editor.
 * `leads` = recent leads with an email to pick from (PII, admin only).
 */
export const previewExhibitorFollowUp = query({
  args: { participationId: v.id("fairParticipations"), leadId: v.optional(v.id("fairLeads")) },
  returns: v.object({
    source: v.union(v.literal("lead"), v.literal("sample")),
    values: fieldValues,
    leads: v.array(v.object({ leadId: v.id("fairLeads"), contactName: v.string(), kind: fairLeadKind, createdAt: v.number() })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const participation = await ctx.db.get(args.participationId);
    if (!participation) fairAdminError("FAIR_LINK_NOT_FOUND", { field: "participationId" });
    const event = await requireFairEvent(ctx, participation.eventId);
    const recent = (await ctx.db
      .query("fairLeads")
      .withIndex("by_participationId_and_createdAt", (q) => q.eq("participationId", participation._id))
      .order("desc")
      .take(PREVIEW_LEADS * 3)).filter((lead) => lead.email !== undefined).slice(0, PREVIEW_LEADS);
    const leads = recent.map((lead) => ({ leadId: lead._id, contactName: lead.contactName, kind: lead.kind, createdAt: lead.createdAt }));
    const chosen = args.leadId ? await ctx.db.get(args.leadId) : null;
    if (chosen && chosen.participationId === participation._id && chosen.email !== undefined) {
      const pair = await fairPairLeads(ctx, participation._id, chosen.email);
      const facts = await fairPairFollowUpFacts(ctx, { participationId: participation._id, leads: pair.length ? pair : [chosen], eventTitle: event.title });
      return { source: "lead" as const, values: fairFollowUpValues(facts), leads };
    }
    const models = [...(await fairExhibitorModels(ctx, participation._id)).values()]
      .filter((model) => model.status === "published")
      .sort((a, b) => Number(b.packageTier === "advanced") - Number(a.packageTier === "advanced") || a.sortOrder - b.sortOrder);
    const values = fairFollowUpSampleValues({
      exhibitorName: (await fairExhibitorName(ctx, participation._id)) ?? "",
      eventTitle: event.title,
      modelNames: models.slice(0, 2).map(fairModelFullName),
    });
    return { source: "sample" as const, values, leads };
  },
});

/**
 * How many follow-up emails would go (or went) out, per exhibitor: pairs
 * (visitor email in lower case × exhibitor) with at least one announced
 * follow-up row (queued, sent, failed or merged; not closed by a K3 switch);
 * a pair with a suppressed lead is counted apart. Reads the newest ESTIMATE_LEADS_CAP leads of the event; above
 * that `capped` is true and the numbers are partial. Whether the text exists
 * and the K3 switch is on are shown next to it by the admin screen.
 */
export const estimateFollowUps = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    byParticipation: v.array(v.object({ participationId: v.id("fairParticipations"), pairs: v.number(), sent: v.number(), suppressed: v.number() })),
    capped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const leads = await ctx.db
      .query("fairLeads")
      .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", event._id))
      .order("desc")
      .take(ESTIMATE_LEADS_CAP + 1);
    const capped = leads.length > ESTIMATE_LEADS_CAP;
    type Pair = { participationId: Id<"fairParticipations">; announced: boolean; sent: boolean; suppressed: boolean };
    const pairs = new Map<string, Pair>();
    for (const lead of leads.slice(0, ESTIMATE_LEADS_CAP)) {
      if (lead.email === undefined) continue;
      const key = `${lead.participationId}|${lead.email.trim().toLowerCase()}`;
      const pair = pairs.get(key) ?? { participationId: lead.participationId, announced: false, sent: false, suppressed: false };
      if (lead.followUpSuppressed) pair.suppressed = true;
      const followUp = await fairLeadDelivery(ctx, lead._id, "post_event_follow_up");
      if (followUp?.status === "sent") pair.sent = true;
      // Announced = the lead queued a follow-up; only a row closed by a K3 switch (skipped, not merged) never goes out.
      if (followUp && !(followUp.status === "skipped" && followUp.lastError !== "FOLLOW_UP_MERGED")) pair.announced = true;
      pairs.set(key, pair);
    }
    const out = new Map<Id<"fairParticipations">, { participationId: Id<"fairParticipations">; pairs: number; sent: number; suppressed: number }>();
    for (const pair of pairs.values()) {
      if (!pair.announced) continue;
      const row = out.get(pair.participationId) ?? { participationId: pair.participationId, pairs: 0, sent: 0, suppressed: 0 };
      if (pair.suppressed) row.suppressed += 1;
      else {
        row.pairs += 1;
        if (pair.sent) row.sent += 1;
      }
      out.set(pair.participationId, row);
    }
    return { byParticipation: [...out.values()], capped };
  },
});
