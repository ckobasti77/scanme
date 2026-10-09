import { v, type Infer } from "convex/values";
import { fairLeadNameRisk, type FairEmailDeliveryError } from "../../lib/fair-contract";
import { fmt, fmt as fmtRaw } from "../../lib/i18n/format";
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
  // Confirmation only (9 Oct 2026): the brand display name and, for a lead
  // left in the survey, the survey confirmation instead of the interest one.
  brandName: v.optional(v.string()),
  origin: v.optional(v.literal("survey")),
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

/** The model name without a leading brand ("Mazda CX-5" → "CX-5" for brand Mazda). */
export function fairModelNameWithoutBrand(modelName: string, brandName: string): string {
  const name = oneLine(modelName);
  const brand = oneLine(brandName);
  if (brand && name.toLowerCase().startsWith(`${brand.toLowerCase()} `)) return name.slice(brand.length + 1).trim();
  return name;
}

/** The visitor's first name, or null when there is none or it is not safe to repeat. */
export function fairFirstName(contactName: string): string | null {
  const name = oneLine(contactName);
  if (!name || fairLeadNameRisk(name)) return null;
  return name.split(/\s+/)[0] ?? null;
}

function linkHtml(url: string) {
  return `<a href="${escapeHtml(url)}" style="color:#1d5bd8">${escapeHtml(url.replace(/^https?:\/\//, ""))}</a>`;
}

/**
 * The three visitor confirmations (9 Oct 2026, final copy): "Zainteresovan
 * sam", "Probna vožnja" and a survey with a contact left. Plain text + HTML in
 * the existing style; every value is HTML-escaped; the stand is never shown.
 */
function buildFairVisitorConfirmation(message: FairLeadEmailMessage, baseUrl: string): FairOutgoingEmail {
  const brand = oneLine(message.brandName ?? "");
  const model = fairModelNameWithoutBrand(message.modelName, brand);
  const names = { brand, model };
  // An empty value never leaves a double space behind.
  const fmt = (template: string, values: Record<string, string>) => fmtRaw(template, values).replace(/ {2,}/g, " ").replace(/ ([.,:])/g, "$1").replace(/\.\.(?=\s|$)/g, ".");
  const modelUrl = `${baseUrl}${message.modelPath}`;
  const privacyUrl = `${baseUrl}/sajam/privatnost`;
  const first = fairFirstName(message.contactName);
  const greeting = first ? fmt(dict.greeting, { name: first }) : dict.greetingWithoutName;
  const survey = message.origin === "survey";
  const testDrive = !survey && message.leadKind === "test_drive";

  const subject = survey ? dict.surveySubject : testDrive ? dict.testDriveSubject : dict.interestSubject;
  // Body paragraphs; `link` marks the one paragraph that ends with the model URL.
  const body: { text: string; link?: string }[] = survey
    ? [{ text: fmt(dict.surveyBody, names) }, { text: fmt(dict.surveyContactNote, names) }]
    : testDrive
      ? [{ text: fmt(dict.testDriveBody, names) }, { text: dict.testDriveNote }]
      : [{ text: fmt(dict.interestBody, names) }, { text: fmt(dict.interestModelLink, { url: modelUrl }), link: modelUrl }];
  const footer = fmt(dict.footer, {
    subject: survey ? brand : `${brand} ${model}`.trim(),
    exhibitor: message.exhibitorName,
    url: privacyUrl,
  });

  const text = [`${greeting}\n${body[0].text}`, ...body.slice(1).map((part) => part.text), dict.closing, "—", footer].join("\n\n");
  const paragraph = (part: { text: string; link?: string }) =>
    part.link ? `<p>${escapeHtml(part.text.slice(0, part.text.length - part.link.length))}${linkHtml(part.link)}</p>` : `<p>${escapeHtml(part.text)}</p>`;
  const footerHtml = `${escapeHtml(footer.slice(0, footer.length - privacyUrl.length))}${linkHtml(privacyUrl)}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#151713;line-height:1.5">`
    + `<p>${escapeHtml(greeting)}<br>${escapeHtml(body[0].text)}</p>`
    + body.slice(1).map(paragraph).join("")
    + `<p>${escapeHtml(dict.closing).replace(/\n/g, "<br>")}</p>`
    + `<hr style="border:none;border-top:1px solid #e3e5df;margin:24px 0 12px">`
    + `<p style="color:#6b7068;font-size:12px">${footerHtml}</p>`
    + `</div>`;
  return { subject: oneLine(fmt(subject, names)), text, html };
}

/**
 * The visitor's immediate confirmation (9 Oct 2026 copy, see above) or the
 * Advanced follow-up (the exhibitor's active template + ScanMe footer; off for
 * the fair: FAIR_FOLLOWUP_ENABLED is not set).
 */
export function buildFairLeadEmail(message: FairLeadEmailMessage, baseUrl: string): FairOutgoingEmail {
  const url = `${baseUrl}${message.modelPath}`;
  if (message.kind === "post_event_follow_up") {
    const names = { model: message.modelName, event: message.eventTitle, exhibitor: message.exhibitorName };
    const template = message.template ?? { subject: "", plainText: "" };
    const body = template.plainText.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
    return compose(template.subject, [...body, fmt(dict.followUpFooter, names)], url);
  }
  return buildFairVisitorConfirmation(message, baseUrl);
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
