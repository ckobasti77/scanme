"use node";

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

export const sendActivationRequest = internalAction({
  args: { requestId: v.id("serviceActivationRequests") },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.activationRequestEmailsData.getEmailData,
      args,
    );
    if (!data) return null;
    const apiKey = (env.RESEND_API_KEY ?? "").trim();
    const from = (env.RESEND_FROM_EMAIL ?? "").trim();
    const to =
      (env.SCANME_ACTIVATION_REQUEST_EMAIL ?? "").trim() || "office@scanme.rs";
    const siteUrl = (env.SCANME_SITE_URL ?? "").replace(/\/$/, "");
    if (!apiKey.startsWith("re_") || !from) {
      await ctx.runMutation(
        internal.activationRequestEmailsData.markEmailFailed,
        {
          requestId: args.requestId,
          reason: "RESEND_API_KEY ili RESEND_FROM_EMAIL nije podešen.",
        },
      );
      return null;
    }
    const service =
      data.request.requestedService === "scanme_links"
        ? "ScanMe Links"
        : "Google Review";
    const contactName = data.contact
      ? `${data.contact.firstName} ${data.contact.lastName}`.trim()
      : "Nije naveden";
    const adminUrl = `${siteUrl}/admin/scanme-links?activationRequest=${args.requestId}`;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `scanme-activation-request/${args.requestId}`,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `Novi upit za aktivaciju: ${service} — ${data.business.name}`,
          text: [
            `Lokal: ${data.business.name}`,
            `Servis: ${service}`,
            `POC: ${contactName}`,
            `Email: ${data.contact?.normalizedEmail || "Nije naveden"}`,
            `Telefon: ${data.contact?.phone || "Nije naveden"}`,
            `Vreme: ${new Date(data.request.requestedAt).toISOString()}`,
            `Admin: ${adminUrl}`,
          ].join("\n"),
          html: `<div style="font-family:Arial,sans-serif;color:#151713"><h1>Novi upit za aktivaciju</h1><p><strong>Lokal:</strong> ${escapeHtml(data.business.name)}</p><p><strong>Servis:</strong> ${escapeHtml(service)}</p><p><strong>POC:</strong> ${escapeHtml(contactName)}</p><p><strong>Email:</strong> ${escapeHtml(data.contact?.normalizedEmail || "Nije naveden")}</p><p><strong>Telefon:</strong> ${escapeHtml(data.contact?.phone || "Nije naveden")}</p><p><a href="${adminUrl}">Otvori upit u admin panelu</a></p></div>`,
        }),
      });
      const result = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !result.id) {
        throw new Error(result.message || `Resend je vratio HTTP ${response.status}.`);
      }
      await ctx.runMutation(
        internal.activationRequestEmailsData.markEmailSent,
        { requestId: args.requestId, messageId: result.id },
      );
    } catch (error) {
      await ctx.runMutation(
        internal.activationRequestEmailsData.markEmailFailed,
        {
          requestId: args.requestId,
          reason: error instanceof Error ? error.message : "Slanje emaila nije uspelo.",
        },
      );
    }
    return null;
  },
});

