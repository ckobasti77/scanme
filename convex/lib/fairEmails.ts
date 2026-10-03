import { v, type Infer } from "convex/values";
import type { FairEmailDeliveryError } from "../../lib/fair-contract";
import { fmt } from "../../lib/i18n/format";
import { eventLeadEmailSr as dict } from "../../lib/i18n/sr/event-lead-email";
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
});
export type FairLeadEmailMessage = Infer<typeof fairLeadEmailMessage>;

export type FairOutgoingEmail = { subject: string; text: string; html: string };

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

/**
 * Immediate confirmation (ScanMe text, placeholder until P1) or the Advanced
 * follow-up (the exhibitor's active template + ScanMe footer). The
 * confirmation mentions the reply-to-cancel option only when a follow-up is
 * actually scheduled for the lead (MASTER §8).
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
  const paragraphs = [
    fmt(dict.greeting, { name: message.contactName }),
    fmt(testDrive ? dict.confirmationBodyTestDrive : dict.confirmationBodyInterest, names),
    ...(message.followUpScheduled ? [dict.confirmationFollowUpNote] : []),
  ];
  return compose(fmt(testDrive ? dict.confirmationSubjectTestDrive : dict.confirmationSubjectInterest, names), paragraphs, url);
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
  options: FairResendConfig & { to: string; idempotencyKey: string },
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
