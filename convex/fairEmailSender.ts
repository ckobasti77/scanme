"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import {
  buildFairDevTestEmail,
  buildFairLeadEmail,
  fairBytesToBase64,
  fairPublicBaseUrl,
  fairResendConfig,
  sendFairResendEmail,
} from "./lib/fairEmails";
import { isFairLeadEmail } from "../lib/fair-contract";

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
      console.warn(`[fair-email] RESEND_NOT_CONFIGURED: ${claim.action === "send" ? claim.message.kind : "daily_report"} not sent, the row is failed; set RESEND_API_KEY and RESEND_FROM_EMAIL, then retry it in the admin`);
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
  args: { to: v.string(), variant: v.optional(v.union(v.literal("interest"), v.literal("test_drive"), v.literal("survey"))) },
  returns: v.object({ ok: v.boolean(), providerMessageId: v.optional(v.string()), error: v.optional(v.string()) }),
  handler: async (_ctx, args) => {
    const to = args.to.trim();
    if (!isFairLeadEmail(to)) return { ok: false, error: "INVALID_INPUT" };
    const config = fairResendConfig(env);
    if (!config) return { ok: false, error: "RESEND_NOT_CONFIGURED" };
    const baseUrl = fairPublicBaseUrl(env.FAIR_PUBLIC_BASE_URL);
    const email = args.variant
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
