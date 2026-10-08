import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { belgradeParts } from "../lib/belgrade-time";
import { fmt } from "../lib/i18n/format";
import { leadEmailSr as dict } from "../lib/i18n/sr/lead-email";

// Mejl timu za svaki PRIHVAĆEN upit iz leads.create (javni landing i klasični
// #ponuda). Isti Resend šav kao activationRequestEmails.ts: samo postojeće env
// promenljive, nijedna nova obavezna. Ishod (poslat / neuspeo + razlog) upisuje
// se na red upita u opciona polja; forma posetiocu u svakom slučaju kaže „Hvala“.

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

const pad = (value: number) => String(value).padStart(2, "0");

function formatBelgradeTime(epoch: number) {
  const parts = belgradeParts(epoch);
  return `${pad(parts.day)}.${pad(parts.month)}.${parts.year}. ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function buildLeadEmail(lead: Doc<"leads">) {
  const rows: Array<[string, string]> = [
    [dict.fields.contactName, lead.contactName],
    [dict.fields.businessName, lead.businessName],
    [dict.fields.businessType, lead.businessType],
    [dict.fields.city, lead.city ?? dict.notProvided],
    [dict.fields.email, lead.email ?? dict.notProvided],
    [dict.fields.phone, lead.phone ?? dict.notProvided],
    [dict.fields.interest, dict.interests[lead.interest]],
    [dict.fields.message, lead.message ?? dict.notProvided],
    ...(lead.offerSelection ? [[dict.fields.offerSelection, lead.offerSelection] as [string, string]] : []),
    ...(lead.logoStorageId ? [[dict.fields.logo, dict.logoAttached] as [string, string]] : []),
    [dict.fields.time, fmt(dict.timeValue, { time: formatBelgradeTime(lead.createdAt) })],
    [dict.fields.leadId, lead._id],
  ];

  const text = [
    dict.heading,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(lead.email ? ["", dict.replyHint] : []),
  ].join("\n");

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" valign="top" style="padding:6px 12px 6px 0;white-space:nowrap">${escapeHtml(label)}</th><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#151713"><h1 style="font-size:20px">${escapeHtml(dict.heading)}</h1><p>${escapeHtml(dict.intro)}</p><table cellspacing="0" cellpadding="0">${htmlRows}</table>${lead.email ? `<p style="color:#5f6462">${escapeHtml(dict.replyHint)}</p>` : ""}</div>`;

  return {
    subject: fmt(dict.subject, { business: lead.businessName }),
    text,
    html,
    ...(lead.email ? { replyTo: lead.email } : {}),
  };
}

export const getQueuedLead = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    return lead && lead.emailStatus === "queued" ? lead : null;
  },
});

export const markLeadEmailSent = internalMutation({
  args: { leadId: v.id("leads"), messageId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("leads", args.leadId, {
      emailStatus: "sent",
      emailMessageId: args.messageId,
      emailFailureReason: undefined,
      emailUpdatedAt: Date.now(),
    });
    return null;
  },
});

export const markLeadEmailFailed = internalMutation({
  args: { leadId: v.id("leads"), reason: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("leads", args.leadId, {
      emailStatus: "failed",
      emailFailureReason: args.reason.slice(0, 500),
      emailUpdatedAt: Date.now(),
    });
    return null;
  },
});

export const sendLeadNotification = internalAction({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const lead: Doc<"leads"> | null = await ctx.runQuery(internal.leadEmails.getQueuedLead, args);
    if (!lead) return null;

    const apiKey = (env.RESEND_API_KEY ?? "").trim();
    const from = (env.RESEND_FROM_EMAIL ?? "").trim();
    const to = (env.SCANME_ACTIVATION_REQUEST_EMAIL ?? "").trim() || "office@scanme.rs";
    if (!apiKey.startsWith("re_") || !from) {
      await ctx.runMutation(internal.leadEmails.markLeadEmailFailed, {
        leadId: args.leadId,
        reason: dict.failure.notConfigured,
      });
      return null;
    }

    const email = buildLeadEmail(lead);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `scanme-lead/${args.leadId}`,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: email.subject,
          text: email.text,
          html: email.html,
          ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok || !result.id) {
        throw new Error(result.message || fmt(dict.failure.providerStatus, { status: response.status }));
      }
      await ctx.runMutation(internal.leadEmails.markLeadEmailSent, {
        leadId: args.leadId,
        messageId: result.id,
      });
    } catch (error) {
      await ctx.runMutation(internal.leadEmails.markLeadEmailFailed, {
        leadId: args.leadId,
        reason: error instanceof Error ? error.message : dict.failure.unknown,
      });
    }
    return null;
  },
});
