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
  args: { to: v.string() },
  returns: v.object({ ok: v.boolean(), providerMessageId: v.optional(v.string()), error: v.optional(v.string()) }),
  handler: async (_ctx, args) => {
    const to = args.to.trim();
    if (!isFairLeadEmail(to)) return { ok: false, error: "INVALID_INPUT" };
    const config = fairResendConfig(env);
    if (!config) return { ok: false, error: "RESEND_NOT_CONFIGURED" };
    const outcome = await sendFairResendEmail(
      buildFairDevTestEmail(fairPublicBaseUrl(env.FAIR_PUBLIC_BASE_URL)),
      { ...config, to, idempotencyKey: `fair-dev-test/${Date.now()}` },
      fetch,
    );
    return outcome.ok ? { ok: true, providerMessageId: outcome.providerMessageId } : { ok: false, error: outcome.error };
  },
});
