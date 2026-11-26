"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import {
  buildFairDevTestEmail,
  buildFairExhibitorLeadEmail,
  buildFairLeadEmail,
  fairBytesToBase64,
  fairPublicBaseUrl,
  fairResendConfig,
  sendFairResendEmail,
} from "./lib/fairEmails";
import { isFairLeadEmail, normalizeFairLeadEmail } from "../lib/fair-contract";

// =============================================================================
// Sajam automobila 2026 — B4 Node sender (BACKEND-HANDOFF §5.4). The only
// place that talks to Resend for fair emails. Scheduled by the outbox
// (convex/lib/fairLeads.ts queueFairLeadEmail, convex/fairEmails.ts retries);
// never called by a client. Nothing here logs a recipient, a name or a key.
// =============================================================================

export const sendDelivery = internalAction({
  args: { deliveryId: v.id("fairEmailDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internal.fairEmails.claimDelivery, args);
    if (claim.action === "skip") return null;
    const config = fairResendConfig(env);
    if (!config) {
      // N5: one line for the deployment log — a code and the outbox kind, never a recipient, name or key.
      console.warn(`[fair-email] RESEND_NOT_CONFIGURED: ${claim.action === "send" ? claim.message.kind : claim.action === "send_garage" ? "garage_email" : claim.action === "send_exhibitor" ? "exhibitor_delivery" : "daily_report"} not sent, the row is failed; set RESEND_API_KEY and RESEND_FROM_EMAIL, then retry it in the admin`);
      await ctx.runMutation(internal.fairEmails.markFailed, { deliveryId: args.deliveryId, error: "RESEND_NOT_CONFIGURED", retryable: false });
      return null;
    }
    if (claim.action === "send_report") {
      // B6: the approved run's stored file, attached as-is (what the admin reviewed).
      const file = await ctx.storage.get(claim.report.storageId);
      if (!file) {
        await ctx.runMutation(internal.fairEmails.markFailed, { deliveryId: args.deliveryId, error: "REPORT_FILE_MISSING", retryable: false });
        return null;
      }
      const content = fairBytesToBase64(new Uint8Array(await file.arrayBuffer()));
      const { subject, text, html } = claim.report;
      const reportOutcome = await sendFairResendEmail(
        { subject, text, html },
        { ...config, to: claim.report.recipient, idempotencyKey: claim.report.dedupeKey, attachments: [{ filename: claim.report.fileName, content }] },
        fetch,
      );
      if (reportOutcome.ok) {
        await ctx.runMutation(internal.fairEmails.markSent, { deliveryId: args.deliveryId, providerMessageId: reportOutcome.providerMessageId });
      } else {
        await ctx.runMutation(internal.fairEmails.markFailed, { deliveryId: args.deliveryId, error: reportOutcome.error, retryable: reportOutcome.retryable });
      }
      return null;
    }
    if (claim.action === "send_garage") {
      // AMF 1 Nov 2026 "Sačuvaj garažu": the message rendered by the gateway, as-is.
      const { subject, text, html } = claim.email;
      const garageOutcome = await sendFairResendEmail(
        { subject, text, html },
        { ...config, to: claim.email.recipient, idempotencyKey: claim.email.dedupeKey },
        fetch,
      );
      if (garageOutcome.ok) {
        await ctx.runMutation(internal.fairEmails.markSent, { deliveryId: args.deliveryId, providerMessageId: garageOutcome.providerMessageId });
      } else {
        await ctx.runMutation(internal.fairEmails.markFailed, { deliveryId: args.deliveryId, error: garageOutcome.error, retryable: garageOutcome.retryable });
      }
      return null;
    }
    if (claim.action === "send_exhibitor") {
      // 26 Nov 2026: the exhibitor's new-lead email, rendered in the claim; Reply-To = the visitor.
      const { subject, text, html } = claim.email;
      const exhibitorOutcome = await sendFairResendEmail(
        { subject, text, html },
        { ...config, ...(claim.email.replyTo ? { replyTo: claim.email.replyTo } : {}), to: claim.email.to, idempotencyKey: claim.email.dedupeKey },
        fetch,
      );
      if (exhibitorOutcome.ok) {
        await ctx.runMutation(internal.fairEmails.markSent, { deliveryId: args.deliveryId, providerMessageId: exhibitorOutcome.providerMessageId });
      } else {
        await ctx.runMutation(internal.fairEmails.markFailed, { deliveryId: args.deliveryId, error: exhibitorOutcome.error, retryable: exhibitorOutcome.retryable });
      }
      return null;
    }
    const email = buildFairLeadEmail(claim.message, fairPublicBaseUrl(env.FAIR_PUBLIC_BASE_URL));
    const outcome = await sendFairResendEmail(
      email,
      { ...config, to: claim.message.recipient, idempotencyKey: claim.message.dedupeKey },
      fetch,
    );
    if (outcome.ok) {
      await ctx.runMutation(internal.fairEmails.markSent, { deliveryId: args.deliveryId, providerMessageId: outcome.providerMessageId });
    } else {
      await ctx.runMutation(internal.fairEmails.markFailed, { deliveryId: args.deliveryId, error: outcome.error, retryable: outcome.retryable });
    }
    return null;
  },
});

/**
 * Manual DEV proof of the Resend seam (status B4: Jovan runs it once with his
 * own address via `npx convex run`). Internal, so only someone with deploy
 * access can call it; it writes nothing and never runs on its own.
 */
export const sendDevTestEmail = internalAction({
  // 9 Oct 2026: `variant` sends one of the visitor confirmations with sample
  // data (JMEV EWIND, CUBI d.o.o.) instead of the generic test message.
  // AMF 1 Nov 2026: `garage` sends a pre-rendered "Sačuvaj garažu" email (the preview) instead.
  args: {
    to: v.string(),
    variant: v.optional(v.union(v.literal("interest"), v.literal("test_drive"), v.literal("survey"))),
    garage: v.optional(v.object({ subject: v.string(), text: v.string(), html: v.string() })),
  },
  returns: v.object({ ok: v.boolean(), providerMessageId: v.optional(v.string()), error: v.optional(v.string()) }),
  handler: async (_ctx, args) => {
    const to = args.to.trim();
    if (!isFairLeadEmail(to)) return { ok: false, error: "INVALID_INPUT" };
    const config = fairResendConfig(env);
    if (!config) return { ok: false, error: "RESEND_NOT_CONFIGURED" };
    const baseUrl = fairPublicBaseUrl(env.FAIR_PUBLIC_BASE_URL);
    const email = args.garage
      ? args.garage
      : args.variant
      ? buildFairLeadEmail({
          kind: "immediate_confirmation", dedupeKey: "fair-dev-test", recipient: to,
          leadKind: args.variant === "test_drive" ? "test_drive" : "interest",
          contactName: "TEST Aleksa", modelName: "EWIND", brandName: "JMEV", exhibitorName: "CUBI d.o.o.",
          eventTitle: "Sajam elektromobilnosti 2026", modelPath: "/sajam/elektromobilnost-2026/model/jmev-ewind",
          followUpScheduled: false, ...(args.variant === "survey" ? { origin: "survey" as const } : {}),
        }, baseUrl)
      : buildFairDevTestEmail(baseUrl);
    const outcome = await sendFairResendEmail(
      email,
      { ...config, to, idempotencyKey: `fair-dev-test/${Date.now()}` },
      fetch,
    );
    return outcome.ok ? { ok: true, providerMessageId: outcome.providerMessageId } : { ok: false, error: outcome.error };
  },
});

/**
 * 26 Nov 2026: proof of the exhibitor's new-lead email before it is switched
 * on. Renders the email with TEST data (three models of the exhibitor, a TEST
 * visitor) and sends it to `to`, or else to the exhibitor's configured
 * addresses. Writes nothing (no lead, no outbox row). Internal: `npx convex run`.
 */
export const sendExhibitorLeadTestEmail = internalAction({
  args: { participationId: v.id("fairParticipations"), to: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), recipients: v.number(), providerMessageId: v.optional(v.string()), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.fairEmails.exhibitorTestContext, { participationId: args.participationId });
    if (!context) return { ok: false, recipients: 0, error: "LEAD_MISSING" };
    let to: string[];
    if (args.to !== undefined) {
      const one = normalizeFairLeadEmail(args.to);
      if (!one) return { ok: false, recipients: 0, error: "INVALID_INPUT" };
      to = [one];
    } else {
      to = context.leadNotifyEmails;
    }
    if (!to.length) return { ok: false, recipients: 0, error: "EXHIBITOR_NOTIFY_OFF" };
    const config = fairResendConfig(env);
    if (!config) return { ok: false, recipients: to.length, error: "RESEND_NOT_CONFIGURED" };
    const now = Date.now();
    const models = context.modelNames.length ? context.modelNames : ["TEST model"];
    const email = buildFairExhibitorLeadEmail({
      eventTitle: context.eventTitle,
      exhibitorName: context.exhibitorName,
      contactName: "TEST Posetilac",
      email: "test.posetilac@example.com",
      phone: "+381600000000",
      purchaseTiming: "within_3_months",
      financing: "leasing",
      items: models.slice(0, 3).map((modelName, index) => ({ modelName, kind: index === 0 ? "test_drive" : "interest", survey: false, at: now - (2 - index) * 20_000 })),
      test: true,
    });
    const outcome = await sendFairResendEmail(email, { ...config, to, idempotencyKey: `fair-exhibitor-test/${args.participationId}/${now}` }, fetch);
    return outcome.ok ? { ok: true, recipients: to.length, providerMessageId: outcome.providerMessageId } : { ok: false, recipients: to.length, error: outcome.error };
  },
});
