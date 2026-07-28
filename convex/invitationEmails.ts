"use node";

import { createHash, createHmac } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

export const sendInvitation = internalAction({
  args: { invitationId: v.id("businessInvitations") },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.invitations.getEmailData, args);
    if (!data) return null;

    const secret = env.SCANME_INVITE_SECRET ?? "";
    const resendApiKey = (env.RESEND_API_KEY ?? "").trim();
    const resendFromEmail = (env.RESEND_FROM_EMAIL ?? "").trim();
    const siteUrl = (env.SCANME_SITE_URL ?? "").replace(/\/$/, "");
    const validSiteUrl = siteUrl.startsWith("https://") || siteUrl.startsWith("http://localhost:");

    if (secret.length < 32) {
      await ctx.runMutation(internal.invitations.markFailed, {
        invitationId: args.invitationId,
        failureReason: "SCANME_INVITE_SECRET nije podešen u ovom Convex deploymentu.",
      });
      return null;
    }
    if (!validSiteUrl) {
      await ctx.runMutation(internal.invitations.markFailed, {
        invitationId: args.invitationId,
        failureReason: "SCANME_SITE_URL nije podešen ili nema dozvoljen protokol.",
      });
      return null;
    }
    if (!resendApiKey.startsWith("re_") || !resendFromEmail) {
      await ctx.runMutation(internal.invitations.markFailed, {
        invitationId: args.invitationId,
        failureReason: "RESEND_API_KEY ili RESEND_FROM_EMAIL nije podešen u ovom Convex deploymentu.",
      });
      return null;
    }

    const token = createHmac("sha256", secret).update(String(args.invitationId)).digest("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const prepared = await ctx.runMutation(internal.invitations.prepareForSend, {
      invitationId: args.invitationId,
      tokenHash,
    });
    if (!prepared) return null;

    const activationUrl = `${siteUrl}/${encodeURIComponent(data.slug)}/client-panel/activate/${token}`;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `scanme-invitation/${args.invitationId}`,
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: [data.invitation.normalizedEmail],
          subject: `Aktivirajte ScanMe panel za ${data.business.name}`,
          text: `Zdravo ${data.contact.firstName}, otvorite ${activationUrl} da postavite šifru i pristupite metrici lokala ${data.business.name}. Link važi 7 dana.`,
          html: `<div style="background:#0b0c0a;color:#f1f3ed;padding:32px;font-family:ui-monospace,monospace"><h1 style="font-size:28px">Aktivirajte ScanMe panel</h1><p>Zdravo ${escapeHtml(data.contact.firstName)},</p><p>Dobili ste pristup metrici lokala <strong>${escapeHtml(data.business.name)}</strong>.</p><p><a href="${activationUrl}" style="display:inline-block;background:#c6ff4a;color:#0b0c0a;padding:14px 18px;text-decoration:none;font-weight:700">Postavi šifru</a></p><p style="color:#a7ab9f">Link važi 7 dana.</p></div>`,
        }),
      });

      const result = (await response.json()) as { id?: string; message?: string; name?: string };
      if (!response.ok || !result.id) {
        throw new Error(result.message || result.name || `Resend je vratio HTTP ${response.status}.`);
      }
      await ctx.runMutation(internal.invitations.markSent, {
        invitationId: args.invitationId,
        emailMessageId: result.id,
      });
    } catch (error) {
      await ctx.runMutation(internal.invitations.markFailed, {
        invitationId: args.invitationId,
        failureReason: error instanceof Error ? error.message : "Slanje emaila nije uspelo.",
      });
    }
    return null;
  },
});
