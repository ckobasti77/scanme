"use node";

import { createHash, createHmac } from "node:crypto";
import { v } from "convex/values";
import nodemailer from "nodemailer";
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
    const gmailUser = (env.GMAIL_USER ?? "").trim().toLowerCase();
    const gmailAppPassword = (env.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, "");
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
    if (!gmailUser || gmailAppPassword.length !== 16) {
      await ctx.runMutation(internal.invitations.markFailed, {
        invitationId: args.invitationId,
        failureReason: "Nedostaje Gmail adresa ili važeći Google App Password.",
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
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
      });
      const result = await transporter.sendMail({
        from: { name: "ScanMe", address: gmailUser },
        to: data.invitation.normalizedEmail,
        subject: `Aktivirajte ScanMe panel za ${data.business.name}`,
        text: `Zdravo ${data.contact.firstName}, otvorite ${activationUrl} da postavite šifru i pristupite metrici lokala ${data.business.name}. Link važi 7 dana.`,
        html: `<div style="background:#0b0c0a;color:#f1f3ed;padding:32px;font-family:ui-monospace,monospace"><h1 style="font-size:28px">Aktivirajte ScanMe panel</h1><p>Zdravo ${escapeHtml(data.contact.firstName)},</p><p>Dobili ste pristup metrici lokala <strong>${escapeHtml(data.business.name)}</strong>.</p><p><a href="${activationUrl}" style="display:inline-block;background:#c6ff4a;color:#0b0c0a;padding:14px 18px;text-decoration:none;font-weight:700">Postavi šifru</a></p><p style="color:#a7ab9f">Link važi 7 dana.</p></div>`,
      });

      if (!result.messageId || result.rejected.length > 0) {
        throw new Error("Gmail nije prihvatio email pozivnicu.");
      }
      await ctx.runMutation(internal.invitations.markSent, {
        invitationId: args.invitationId,
        emailMessageId: result.messageId,
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
