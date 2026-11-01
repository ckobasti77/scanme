import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  FAIR_GARAGE_EMAIL_ADDRESS_WINDOW_MS,
  FAIR_GARAGE_EMAIL_HASH_PATTERN,
  FAIR_GARAGE_EMAIL_PER_ADDRESS,
  FAIR_GARAGE_EMAIL_PER_VISITOR,
  FAIR_GARAGE_EMAIL_VISITOR_WINDOW_MS,
  FAIR_GARAGE_MAX_MODELS,
  FAIR_PII_PURGE_AT_MS,
  isFairSubmissionId,
  isFairVisitorHash,
  normalizeFairLeadEmail,
} from "../lib/fair-contract";
import { requireAdmin } from "./lib/access";
import { requireFairGateway } from "./lib/fairGateway";
import { fairInteractionError, requireFairVisitorRow } from "./lib/fairInteractions";
import { scheduleFairEmailSend } from "./lib/fairLeads";
import { rateLimiter } from "./lib/rateLimits";

// =============================================================================
// AMF 1 Nov 2026 — "Sačuvaj garažu": the visitor emails their garage to
// themselves. The gateway (lib/fair-server/garage-email.ts) renders the
// message and computes the address HMAC; this mutation re-checks everything,
// creates the share collection behind the `?vrati=` link and queues ONE row
// in the B4 outbox (convex/fairEmails.ts, convex/fairEmailSender.ts).
//
// Privacy: the address and the message sit only in `garageEmail` of the
// outbox row until the send is final (markSent / final markFailed remove
// them). What stays is the send log — address HMAC (`recipient`), time,
// model count, visitor — used for the limits and the admin count, deleted
// with the outbox by the 16 Nov 2026 purge. Never shown to exhibitors, leads,
// analytics or reports.
//
// Limits: 3 per visitor per hour, 3 per address per day (exact, bounded
// index reads), plus the per-IP `fairLeadIp` bucket. Idempotent by
// submissionId (dedupeKey `fair-garage/<submissionId>`).
// =============================================================================

const CODE_HASH_PATTERN = /^[0-9a-f]{64}$/;
const MESSAGE_MAX_CHARS = 300_000;

export function fairGarageEmailDedupeKey(submissionId: string) {
  return `fair-garage/${submissionId}`;
}

export const requestGarageEmail = mutation({
  args: {
    gatewaySecret: v.optional(v.string()),
    ipHash: v.optional(v.string()),
    visitorHash: v.string(),
    submissionId: v.string(),
    email: v.string(),
    emailHash: v.string(),
    consentAccepted: v.boolean(),
    eventId: v.string(),
    eventModelIds: v.array(v.string()),
    codeHash: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.string(),
  },
  returns: v.object({ modelCount: v.number(), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    requireFairGateway(args.gatewaySecret);
    if (!isFairVisitorHash(args.visitorHash)) fairInteractionError("INVALID_INPUT", { field: "visitorHash" });
    if (!isFairSubmissionId(args.submissionId)) fairInteractionError("INVALID_INPUT", { field: "submissionId" });
    if (normalizeFairLeadEmail(args.email) !== args.email) fairInteractionError("INVALID_INPUT", { field: "email" });
    if (!FAIR_GARAGE_EMAIL_HASH_PATTERN.test(args.emailHash)) fairInteractionError("INVALID_INPUT", { field: "emailHash" });
    if (args.consentAccepted !== true) fairInteractionError("INVALID_INPUT", { field: "consent" });
    if (!CODE_HASH_PATTERN.test(args.codeHash)) fairInteractionError("INVALID_INPUT", { field: "codeHash" });
    if (!args.subject.trim() || !args.text.trim() || !args.html.trim() || args.text.length + args.html.length > MESSAGE_MAX_CHARS) {
      fairInteractionError("INVALID_INPUT", { field: "message" });
    }

    const dedupeKey = fairGarageEmailDedupeKey(args.submissionId);
    const prior = await ctx.db
      .query("fairEmailDeliveries")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (prior) return { modelCount: prior.modelCount ?? 0, duplicate: true };

    const eventId = ctx.db.normalizeId("fairEvents", args.eventId);
    const event = eventId ? await ctx.db.get(eventId) : null;
    if (!event || event.status === "draft" || now >= FAIR_PII_PURGE_AT_MS) fairInteractionError("EVENT_NOT_ACTIVE");

    // Only published models of this event, once each, at most the garage maximum.
    const models: Doc<"fairEventModels">[] = [];
    for (const rawId of new Set(args.eventModelIds)) {
      if (models.length >= FAIR_GARAGE_MAX_MODELS) break;
      const id = ctx.db.normalizeId("fairEventModels", rawId);
      const model = id ? await ctx.db.get(id) : null;
      if (model && model.status === "published" && model.eventId === event._id) models.push(model);
    }
    if (models.length === 0) fairInteractionError("INVALID_INPUT", { field: "eventModelIds" });

    const visitorId = await requireFairVisitorRow(ctx, { visitorHash: args.visitorHash, ipHash: args.ipHash, now });
    await requireGarageEmailLimits(ctx, { visitorId, emailHash: args.emailHash, now });
    const perIp = await rateLimiter.limit(ctx, "fairLeadIp", { key: args.ipHash ?? "shared" });
    if (!perIp.ok) fairInteractionError("RATE_LIMITED", { retryAfterMs: Math.ceil(perIp.retryAfter) });

    const eventModelIds = models.map((model) => model._id);
    const collection = await ctx.db
      .query("fairShareCollections")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (!collection) {
      await ctx.db.insert("fairShareCollections", {
        requestId: `garage-email:${args.submissionId}`,
        codeHash: args.codeHash,
        eventId: event._id,
        eventModelIds,
        status: "active",
        createdAt: now,
        expiresAt: FAIR_PII_PURGE_AT_MS,
      });
    }

    const deliveryId = await ctx.db.insert("fairEmailDeliveries", {
      dedupeKey,
      kind: "garage_email",
      recipient: args.emailHash,
      status: "queued",
      scheduledFor: now,
      attemptCount: 0,
      garageEmail: { to: args.email, subject: args.subject, text: args.text, html: args.html },
      visitorId,
      eventId: event._id,
      modelCount: models.length,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleFairEmailSend(ctx, deliveryId, now, now);
    return { modelCount: models.length, duplicate: false };
  },
});

async function requireGarageEmailLimits(
  ctx: MutationCtx,
  input: { visitorId: Id<"fairVisitors">; emailHash: string; now: number },
) {
  const byVisitor = await ctx.db
    .query("fairEmailDeliveries")
    .withIndex("by_visitorId_and_createdAt", (q) =>
      q.eq("visitorId", input.visitorId).gt("createdAt", input.now - FAIR_GARAGE_EMAIL_VISITOR_WINDOW_MS),
    )
    .take(FAIR_GARAGE_EMAIL_PER_VISITOR);
  if (byVisitor.length >= FAIR_GARAGE_EMAIL_PER_VISITOR) {
    fairInteractionError("RATE_LIMITED", { retryAfterMs: Math.max(0, byVisitor[0].createdAt + FAIR_GARAGE_EMAIL_VISITOR_WINDOW_MS - input.now) });
  }
  const byAddress = await ctx.db
    .query("fairEmailDeliveries")
    .withIndex("by_recipient_and_kind_and_createdAt", (q) =>
      q.eq("recipient", input.emailHash).eq("kind", "garage_email").gt("createdAt", input.now - FAIR_GARAGE_EMAIL_ADDRESS_WINDOW_MS),
    )
    .take(FAIR_GARAGE_EMAIL_PER_ADDRESS);
  if (byAddress.length >= FAIR_GARAGE_EMAIL_PER_ADDRESS) {
    fairInteractionError("RATE_LIMITED", { retryAfterMs: Math.max(0, byAddress[0].createdAt + FAIR_GARAGE_EMAIL_ADDRESS_WINDOW_MS - input.now) });
  }
}

const COUNT_CAP = 5_000;

/** Admin: garages emailed for an event (queued or sent; a failed send is not counted). A count only. */
export const countGarageEmails = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("fairEmailDeliveries")
      .withIndex("by_leadId_and_kind", (q) => q.eq("leadId", undefined).eq("kind", "garage_email"))
      .take(COUNT_CAP + 1);
    const count = rows.slice(0, COUNT_CAP).filter((row) => row.eventId === args.eventId && (row.status === "queued" || row.status === "sent")).length;
    return { count, capped: rows.length > COUNT_CAP };
  },
});
