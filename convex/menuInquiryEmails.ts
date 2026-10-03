"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env } from "./_generated/server";

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

// TASK-59 (RFC-003 §2.10) — the item sheet's ONE "Upit" action. Menu is not a
// shop: this sends exactly one email to the local's owner through the
// existing Resend mail seam (the same seam as invitationEmails.ts and
// activationRequestEmails.ts) — no cart, no total, no new mail layer. Public
// (guests are unauthenticated) and idempotency-keyed per call, not per
// stored row: there is no inquiry table to dedupe against (out of scope).
export const sendItemInquiry = action({
  args: { itemId: v.id("menuItems") },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.menuInquiryEmailsData.getInquiryEmailData,
      args,
    );
    if (!data) throw new ConvexError("Stavka nije pronađena.");

    const apiKey = (env.RESEND_API_KEY ?? "").trim();
    const from = (env.RESEND_FROM_EMAIL ?? "").trim();
    const to =
      data.contactEmail ||
      (env.SCANME_ACTIVATION_REQUEST_EMAIL ?? "").trim() ||
      "office@scanme.rs";
    if (!apiKey.startsWith("re_") || !from) {
      throw new ConvexError("Slanje upita nije podešeno.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `scanme-menu-inquiry/${args.itemId}/${Date.now()}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Upit za stavku menija: ${data.itemName} — ${data.businessName}`,
        text: [
          `Lokal: ${data.businessName}`,
          `Stavka: ${data.itemName}`,
          `Gost pita za ovu stavku.`,
          `Vreme: ${new Date().toISOString()}`,
        ].join("\n"),
        html: `<div style="font-family:Arial,sans-serif;color:#151713"><h1>Upit za stavku menija</h1><p><strong>Lokal:</strong> ${escapeHtml(data.businessName)}</p><p><strong>Stavka:</strong> ${escapeHtml(data.itemName)}</p><p>Gost pita za ovu stavku.</p></div>`,
      }),
    });
    const result = (await response.json()) as { id?: string; message?: string };
    if (!response.ok || !result.id) {
      throw new ConvexError(result.message || `Resend je vratio HTTP ${response.status}.`);
    }
    return { sent: true };
  },
});
