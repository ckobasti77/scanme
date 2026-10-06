import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import {
  FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT,
  FAIR_LEAD_RECIPIENT_WINDOW_MS,
  FAIR_PII_PURGE_AT_MS,
  isFairSubmissionId,
  type FairLeadSubmitResult,
} from "../lib/fair-contract";
import { getFairEntitlements } from "../lib/fair-entitlements";
import {
  fairInteractionError,
  fairModelTierAt,
  findFairVisitor,
  requireFairVisitorRow,
  requireInteractiveModel,
  requireVisitorHash,
} from "./lib/fairInteractions";
import { requireFairGateway } from "./lib/fairGateway";
import {
  fairActiveConsent,
  fairExhibitorName,
  fairFollowUpEnabled,
  fairFollowUpScheduleFor,
  fairLeadConfig,
  fairLeadDelivery,
  fairLeadsEnabled,
  fairRenderConsentText,
  normalizeFairLeadContact,
  queueFairLeadEmail,
} from "./lib/fairLeads";
import { fairLeadKind, fairLeadSubmitResultView } from "./lib/fairValidators";
import { rateLimiter } from "./lib/rateLimits";

// =============================================================================
// Sajam automobila 2026 — B4 `Zainteresovan sam` / `Probna vožnja`
// (BACKEND-HANDOFF §4.4, §5.4, §7 fairLeads; MASTER §8, §13). Called ONLY by
// the Next same-origin POST gateway (app/api/fair/lead, lib/fair-server/
// leads.ts): the visitor is the HMAC of the HttpOnly cookie, never a body
// field. convex/leads.ts is the prelaunch lead and is not used here.
// K1: FAIR_GATEWAY_SECRET is checked first (convex/lib/fairGateway.ts), so a
// direct Convex call cannot store a lead or queue an email.
// K3: right after it, the hard switch FAIR_LEADS_ENABLED (exactly "true",
// default off) → otherwise LEADS_DISABLED before any read, so no PII is
// stored and nothing is queued. The follow-up is queued only while
// FAIR_FOLLOWUP_ENABLED is "true" too (convex/lib/fairLeads.ts).
//
// One transaction: entitlement at the moment of the submit → enabled lead
// config → ACTIVE consent (else CONSENT_NOT_CONFIGURED — the production gate)
// → explicit acceptance of that version → contact rule → lead row with the
// server-rendered consent snapshot → outbox rows for the one confirmation and
// (Advanced) the one follow-up. Every refusal throws ConvexError({ code }),
// so nothing — no lead, no visitor row, no email, no limiter token — is
// written. The result never contains a contact value, and the visitor hash
// is never a key for reading one back.
// =============================================================================

async function submitResult(ctx: MutationCtx, lead: Doc<"fairLeads">, duplicate: boolean): Promise<FairLeadSubmitResult> {
  return {
    eventModelId: lead.eventModelId,
    kind: lead.kind,
    submittedAt: lead.createdAt,
    duplicate,
    confirmationEmail: (await fairLeadDelivery(ctx, lead._id, "immediate_confirmation")) !== null,
    followUpScheduled: (await fairLeadDelivery(ctx, lead._id, "post_event_follow_up")) !== null,
  };
}

export const submitLead = mutation({
  args: {
    gatewaySecret: v.optional(v.string()),
    ipHash: v.optional(v.string()),
    visitorHash: v.string(),
    eventModelId: v.string(),
    kind: fairLeadKind,
    submissionId: v.string(),
    contactName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    consentAccepted: v.boolean(),
    consentVersion: v.number(),
  },
  returns: fairLeadSubmitResultView,
  handler: async (ctx, args): Promise<FairLeadSubmitResult> => {
    const now = Date.now();
    requireFairGateway(args.gatewaySecret);
    if (!fairLeadsEnabled()) fairInteractionError("LEADS_DISABLED");
    requireVisitorHash(args.visitorHash);
    if (!isFairSubmissionId(args.submissionId)) fairInteractionError("INVALID_INPUT", { field: "submissionId" });

    // Idempotency: a retry of the same submit returns the stored outcome and
    // writes/sends nothing; a submissionId owned by another submit is refused.
    const prior = await ctx.db
      .query("fairLeads")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", args.submissionId))
      .unique();
    if (prior) {
      const visitor = await findFairVisitor(ctx, args.visitorHash);
      if (!visitor || prior.visitorId !== visitor._id || prior.eventModelId !== args.eventModelId || prior.kind !== args.kind) {
        fairInteractionError("SUBMISSION_DUPLICATE");
      }
      return submitResult(ctx, prior, true);
    }

    const { model, event } = await requireInteractiveModel(ctx, args.eventModelId, now);
    const tier = await fairModelTierAt(ctx, model, now);
    const rights = getFairEntitlements(tier);
    if (args.kind === "interest" ? !rights.interest : !rights.testDrive) fairInteractionError("FEATURE_NOT_ENTITLED");
    const config = await fairLeadConfig(ctx, model._id, args.kind);
    if (!config || !config.enabled) fairInteractionError("FEATURE_NOT_ENTITLED");

    const consent = await fairActiveConsent(ctx, model.eventId, args.kind);
    if (!consent) fairInteractionError("CONSENT_NOT_CONFIGURED");
    if (args.consentAccepted !== true || args.consentVersion !== consent.version) fairInteractionError("CONSENT_REQUIRED");
    const exhibitorName = await fairExhibitorName(ctx, model.participationId);
    if (!exhibitorName) fairInteractionError("CONSENT_NOT_CONFIGURED");

    const contact = normalizeFairLeadContact(args, config.contactRequirement);
    // B7 (§9.44): a per-address cap on confirmations, whatever visitor hash or
    // model asked for them, so the public submit cannot be used to flood one
    // inbox by cycling cookies. Bounded read (≤ the cap) on the outbox index.
    const recipient = contact.email?.toLowerCase();
    if (recipient !== undefined) {
      const recent = await ctx.db
        .query("fairEmailDeliveries")
        .withIndex("by_recipient_and_kind_and_createdAt", (q) =>
          q.eq("recipient", recipient).eq("kind", "immediate_confirmation").gt("createdAt", now - FAIR_LEAD_RECIPIENT_WINDOW_MS),
        )
        .take(FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT);
      if (recent.length >= FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT) {
        fairInteractionError("RATE_LIMITED", { retryAfterMs: Math.max(0, recent[0].createdAt + FAIR_LEAD_RECIPIENT_WINDOW_MS - now) });
      }
    }

    const visitorId = await requireFairVisitorRow(ctx, { visitorHash: args.visitorHash, ipHash: args.ipHash, now });
    const limit = await rateLimiter.limit(ctx, "fairLeadSubmit", { key: `${visitorId}:${model._id}` });
    if (!limit.ok) fairInteractionError("RATE_LIMITED", { retryAfterMs: Math.ceil(limit.retryAfter) });

    const leadId = await ctx.db.insert("fairLeads", {
      submissionId: args.submissionId,
      kind: args.kind,
      visitorId,
      eventId: model.eventId,
      eventModelId: model._id,
      participationId: model.participationId,
      ...contact,
      consentAccepted: true,
      consentVersion: consent.version,
      consentTextSnapshot: fairRenderConsentText(consent.text, exhibitorName),
      consentedAt: now,
      status: "received",
      followUpSuppressed: false,
      createdAt: now,
      purgeAt: FAIR_PII_PURGE_AT_MS,
    });

    let followUpScheduled = false;
    if (recipient !== undefined) {
      await queueFairLeadEmail(ctx, { leadId, kind: "immediate_confirmation", recipient, scheduledFor: now, now });
      // Advanced only, judged by the package in force NOW: a lead from before
      // an upgrade never gains a follow-up afterwards (no retroactivity).
      // K3: and only while FAIR_FOLLOWUP_ENABLED is on — a lead taken while it
      // is off never gains one later (its confirmation did not announce one).
      const followUpAt = rights.postEventFollowUp && fairFollowUpEnabled() ? fairFollowUpScheduleFor(event.endsAt, now) : null;
      if (followUpAt !== null) {
        await queueFairLeadEmail(ctx, { leadId, kind: "post_event_follow_up", recipient, scheduledFor: followUpAt, now });
        followUpScheduled = true;
      }
    }

    return {
      eventModelId: model._id,
      kind: args.kind,
      submittedAt: now,
      duplicate: false,
      confirmationEmail: recipient !== undefined,
      followUpScheduled,
    };
  },
});
