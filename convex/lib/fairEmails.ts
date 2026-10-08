import { v, type Infer } from "convex/values";
import { FAIR_PII_PURGE_AT_MS, fairLeadNameRisk, type FairEmailDeliveryError } from "../../lib/fair-contract";
import { belgradeParts } from "../../lib/belgrade-time";
import { fmt } from "../../lib/i18n/format";
import { eventLeadEmailSr as dict } from "../../lib/i18n/sr/event-lead-email";
import { eventReportSr as reportDict } from "../../lib/i18n/sr/event-report";
import { fairLeadKind } from "./fairValidators";

// =============================================================================
// Sajam automobila 2026 — B4 email composition and the Resend seam
// (BACKEND-HANDOFF §5.4). Pure and runtime-agnostic: the Node sender
// (convex/fairEmailSender.ts) passes the real `fetch` and env, tests pass a
// mock — nothing here reads env or sends on its own.
//
// Same seam as convex/activationRequestEmails.ts: POST
// https://api.resend.com/emails with Bearer RESEND_API_KEY, from
// RESEND_FROM_EMAIL and a stable `Idempotency-Key` (here = the outbox
// dedupeKey, so a retry can never deliver twice). Links come from
// FAIR_PUBLIC_BASE_URL (default: the main ScanMe domain), never a hardcoded
// host, so a later domain change is configuration only.
// =============================================================================

export const FAIR_DEFAULT_PUBLIC_BASE_URL = "https://scanme.rs";
export const FAIR_RESEND_ENDPOINT = "https://api.resend.com/emails";

/** What claimDelivery hands to the sender. Internal only (it carries the recipient and name). */
export const fairLeadEmailMessage = v.object({
  kind: v.union(v.literal("immediate_confirmation"), v.literal("post_event_follow_up")),
  dedupeKey: v.string(),
  recipient: v.string(),
  leadKind: fairLeadKind,
  contactName: v.string(),
  modelName: v.string(),
  exhibitorName: v.string(),
  eventTitle: v.string(),
  modelPath: v.string(),
  followUpScheduled: v.boolean(),
  template: v.optional(v.object({ subject: v.string(), plainText: v.string() })),
  // N5, confirmation only: where the car is (stand name + event venue) and the contact the visitor shared.
  standName: v.optional(v.string()),
  venueName: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
});
export type FairLeadEmailMessage = Infer<typeof fairLeadEmailMessage>;

export type FairOutgoingEmail = { subject: string; text: string; html: string };

/**
 * B6: what claimDelivery hands to the sender for a `daily_report` row
 * (internal only — it carries the exhibitor recipient). The attachment is the
 * approved run's stored file; the sender reads it from storage.
 */
export const fairReportEmailMessage = v.object({
  dedupeKey: v.string(),
  recipient: v.string(),
  subject: v.string(),
  text: v.string(),
  html: v.string(),
  storageId: v.id("_storage"),
  fileName: v.string(),
});
export type FairReportEmailMessage = Infer<typeof fairReportEmailMessage>;

/** A Resend attachment: base64 file content. */
export type FairEmailAttachment = { filename: string; content: string };

/** Base64 without Buffer (works in the Node sender and the edge test runtime). */
export function fairBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

export type FairResendConfig = { apiKey: string; from: string; replyTo?: string };

export type FairResendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; error: `${FairEmailDeliveryError}:${string}` };

/** An absolute https origin (http only for localhost); anything else falls back to the main domain. */
export function fairPublicBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost")) return url.origin;
    } catch {
      // fall through to the default
    }
  }
  return FAIR_DEFAULT_PUBLIC_BASE_URL;
}

/** Null when Resend is not configured (same checks as the existing ScanMe senders). */
export function fairResendConfig(env: {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  FAIR_EMAIL_REPLY_TO?: string;
}): FairResendConfig | null {
  const apiKey = (env.RESEND_API_KEY ?? "").trim();
  const from = (env.RESEND_FROM_EMAIL ?? "").trim();
  if (!apiKey.startsWith("re_") || !from) return null;
  const replyTo = (env.FAIR_EMAIL_REPLY_TO ?? "").trim();
  return { apiKey, from, ...(replyTo ? { replyTo } : {}) };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[character];
  });
}

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

function compose(subject: string, paragraphs: string[], url: string): FairOutgoingEmail {
  const link = fmt(dict.modelLink, { url });
  const text = [...paragraphs, link, dict.signature].join("\n\n");
  const body = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#151713;line-height:1.5">${body}<p><a href="${escapeHtml(url)}">${escapeHtml(link)}</a></p><p>${escapeHtml(dict.signature)}</p></div>`;
  return { subject: oneLine(subject), text, html };
}

/** N5: the purge day as the visitor reads it, `16. 11. 2026.` (Europe/Belgrade). */
export function fairEmailPurgeDateText(): string {
  const day = belgradeParts(FAIR_PII_PURGE_AT_MS);
  return `${day.day}. ${day.month}. ${day.year}.`;
}

/**
 * Immediate confirmation (ScanMe text, placeholder until P1) or the Advanced
 * follow-up (the exhibitor's active template + ScanMe footer). The
 * confirmation mentions the reply-to-cancel option only when a follow-up is
 * actually scheduled for the lead (MASTER §8).
 *
 * N5 confirmation: what was received (model, exhibitor, event), where (stand
 * and venue), the next step by kind, the contact that was shared (so a typo
 * shows), the privacy line, „Ako niste vi…“, then the link and the signature.
 * A name with a link, invisible characters or a phone-like number is never
 * repeated (the greeting drops it); every value is HTML-escaped by compose.
 */
export function buildFairLeadEmail(message: FairLeadEmailMessage, baseUrl: string): FairOutgoingEmail {
  const url = `${baseUrl}${message.modelPath}`;
  const names = { model: message.modelName, event: message.eventTitle, exhibitor: message.exhibitorName };
  if (message.kind === "post_event_follow_up") {
    const template = message.template ?? { subject: "", plainText: "" };
    const body = template.plainText.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
    return compose(template.subject, [...body, fmt(dict.followUpFooter, names)], url);
  }
  const testDrive = message.leadKind === "test_drive";
  const name = oneLine(message.contactName);
  const where = [message.standName, message.venueName].map((part) => oneLine(part ?? "")).filter(Boolean).join(", ");
  const contact = [message.contactEmail, message.contactPhone].map((part) => oneLine(part ?? "")).filter(Boolean).join(", ");
  const paragraphs = [
    name && !fairLeadNameRisk(name) ? fmt(dict.greeting, { name }) : dict.greetingWithoutName,
    fmt(testDrive ? dict.confirmationBodyTestDrive : dict.confirmationBodyInterest, names),
    ...(where ? [fmt(dict.confirmationWhere, { where })] : []),
    fmt(testDrive ? dict.confirmationNextTestDrive : dict.confirmationNextInterest, names),
    ...(contact ? [fmt(dict.confirmationContact, { contact })] : []),
    ...(message.followUpScheduled ? [dict.confirmationFollowUpNote] : []),
    fmt(dict.confirmationPrivacy, { exhibitor: message.exhibitorName, date: fairEmailPurgeDateText() }),
    dict.confirmationNotYou,
  ];
  return compose(fmt(testDrive ? dict.confirmationSubjectTestDrive : dict.confirmationSubjectInterest, names), paragraphs, url);
}

/** B6 report email (placeholder copy, MASTER §12 template PRIVREMENO). Same layout as the lead emails, without a link. */
export function buildFairReportEmail(input: { eventTitle: string; dayLabel: string; dateText: string; exhibitorName: string; correction: boolean }): FairOutgoingEmail {
  const names = { event: input.eventTitle, day: input.dayLabel, date: input.dateText, exhibitor: input.exhibitorName };
  const paragraphs = [...fmt(reportDict.emailBody, names).split(/\n\s*\n/), ...(input.correction ? [reportDict.emailCorrectionNote] : []), reportDict.emailSignature];
  const body = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  return {
    subject: oneLine(fmt(reportDict.emailSubject, names)),
    text: paragraphs.join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#151713;line-height:1.5">${body}</div>`,
  };
}

export function buildFairDevTestEmail(baseUrl: string): FairOutgoingEmail {
  return compose(dict.devTestSubject, [dict.devTestBody], `${baseUrl}/`);
}

/**
 * One Resend call. 429/5xx/409 (in-flight duplicate key) and network errors
 * are retryable; other 4xx are not. The stored error is a stable code plus
 * the HTTP status — never the provider message (it may echo the address).
 */
export async function sendFairResendEmail(
  email: FairOutgoingEmail,
  options: FairResendConfig & { to: string; idempotencyKey: string; attachments?: FairEmailAttachment[] },
  fetchImpl: typeof fetch,
): Promise<FairResendOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(FAIR_RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({
        from: options.from,
        to: [options.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      }),
    });
  } catch {
    return { ok: false, retryable: true, error: "PROVIDER_UNAVAILABLE:network" };
  }
  let id: unknown;
  try {
    id = ((await response.json()) as { id?: unknown }).id;
  } catch {
    id = undefined;
  }
  if (response.ok && typeof id === "string" && id) return { ok: true, providerMessageId: id };
  const retryable = response.status === 409 || response.status === 429 || response.status >= 500;
  return { ok: false, retryable, error: `${retryable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED"}:${response.status}` };
}
