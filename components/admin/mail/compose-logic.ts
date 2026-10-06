import type { Id } from "@/convex/_generated/dataModel";
import {
  ADMIN_MAIL_SEND_FILE_MAX_BYTES,
  ADMIN_MAIL_SEND_MAX_ATTACHMENTS,
  ADMIN_MAIL_SEND_TOTAL_MAX_BYTES,
  type AdminMailComposeMode,
  type AdminMailMessage,
} from "@/convex/lib/adminMailContract";
import { buildMailQuote, checkRecipients, composeSubject, replyRecipients, type RecipientCheck } from "@/convex/lib/adminMailCompose";
import { adminMailAttachmentMimeType } from "@/convex/lib/zohoMailClient";
import { renderScanMeEmail } from "@/lib/email-template/scanme-email";

// Admin UX Z2 — pure rules of the compose window (no React): the first draft
// of a reply/forward, the local text draft (localStorage, never attachments),
// recipient chips, the tiny editor markup, the attachment limits and the
// "Pregled pisma" render with the same template the send action uses.

export type MailComposeDraft = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  showCc: boolean;
  showBcc: boolean;
};

export type MailComposeAttachment = {
  localId: string;
  fileName: string;
  size: number;
  /** 0–1 while uploading. */
  progress: number;
  status: "uploading" | "ready" | "error";
  uploadId: Id<"adminMailUploads"> | null;
  errorCode: string | null;
};

/** The message a reply/forward starts from (already read in the reader). */
export type MailComposeSource = { folderId: string; messageId: string; message: AdminMailMessage };

export function initialComposeDraft(mode: AdminMailComposeMode, source: AdminMailMessage | null, ownAddresses: string[]): MailComposeDraft {
  const recipients = source ? replyRecipients(source, mode, ownAddresses) : { to: [], cc: [] };
  return {
    to: recipients.to,
    cc: recipients.cc,
    bcc: [],
    subject: source ? composeSubject(mode, source.subject) : "",
    body: "",
    showCc: recipients.cc.length > 0,
    showBcc: false,
  };
}

// --- local text draft ---------------------------------------------------------

export const MAIL_DRAFT_PREFIX = "scanme-admin-mail-draft:v1:";

export function mailDraftKey(accountKey: string, mode: AdminMailComposeMode, sourceMessageId: string | null) {
  return `${MAIL_DRAFT_PREFIX}${accountKey}:${mode}:${sourceMessageId ?? "novo"}`;
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const stringList = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]).slice(0, 60) : null;

/** The saved text of this draft, or null (missing, damaged, or storage not available). */
export function readMailDraft(storage: DraftStorage | null, key: string): Pick<MailComposeDraft, "to" | "cc" | "bcc" | "subject" | "body"> | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const to = stringList(value.to);
    const cc = stringList(value.cc);
    const bcc = stringList(value.bcc);
    if (!to || !cc || !bcc || typeof value.subject !== "string" || typeof value.body !== "string") return null;
    return { to, cc, bcc, subject: value.subject, body: value.body };
  } catch {
    return null;
  }
}

/** Text only: recipients, subject and body. Attachments are never stored in the browser. */
export function writeMailDraft(storage: DraftStorage | null, key: string, draft: MailComposeDraft) {
  try {
    if (!draft.to.length && !draft.cc.length && !draft.bcc.length && !draft.body.trim()) {
      storage?.removeItem(key);
      return;
    }
    storage?.setItem(key, JSON.stringify({ to: draft.to, cc: draft.cc, bcc: draft.bcc, subject: draft.subject, body: draft.body }));
  } catch {
    // Storage full or blocked: the draft simply is not kept.
  }
}

export function clearMailDraft(storage: DraftStorage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to clear
  }
}

// --- recipients -----------------------------------------------------------------

/** Typed or pasted text → candidate addresses (comma, semicolon, new line; spaces between plain addresses). */
export function splitRecipientInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .flatMap((part) => (part.includes("<") ? [part] : part.split(/\s+/)))
    .map((part) => part.trim())
    .filter(Boolean);
}

// --- editor markup ----------------------------------------------------------------

export type TextEdit = { text: string; selectionStart: number; selectionEnd: number };

/** **bold** around the selection (or around a placeholder word). */
export function applyBold(text: string, start: number, end: number, placeholder: string): TextEdit {
  const selected = text.slice(start, end) || placeholder;
  const next = `${text.slice(0, start)}**${selected}**${text.slice(end)}`;
  return { text: next, selectionStart: start + 2, selectionEnd: start + 2 + selected.length };
}

/** [selection](url); without a selection the URL is also the label. Only http(s)/mailto become links in the template. */
export function applyLink(text: string, start: number, end: number, url: string): TextEdit {
  const label = text.slice(start, end) || url;
  const inserted = `[${label}](${url})`;
  const next = `${text.slice(0, start)}${inserted}${text.slice(end)}`;
  return { text: next, selectionStart: start + inserted.length, selectionEnd: start + inserted.length };
}

// --- attachments -------------------------------------------------------------------

/** Why a file cannot be added: type, size, count or the total of one message. */
export function attachmentProblem(
  file: { name: string; size: number },
  current: MailComposeAttachment[],
  forwardedBytes: number,
  forwardedCount: number,
): "ZOHO_ATTACHMENT_BLOCKED" | null {
  const live = current.filter((item) => item.status !== "error");
  const total = live.reduce((sum, item) => sum + item.size, 0) + forwardedBytes + file.size;
  if (!adminMailAttachmentMimeType(file.name)) return "ZOHO_ATTACHMENT_BLOCKED";
  if (file.size <= 0 || file.size > ADMIN_MAIL_SEND_FILE_MAX_BYTES) return "ZOHO_ATTACHMENT_BLOCKED";
  if (live.length + forwardedCount >= ADMIN_MAIL_SEND_MAX_ATTACHMENTS) return "ZOHO_ATTACHMENT_BLOCKED";
  if (total > ADMIN_MAIL_SEND_TOTAL_MAX_BYTES) return "ZOHO_ATTACHMENT_BLOCKED";
  return null;
}

// --- send readiness and preview -----------------------------------------------------

export type ComposeReadiness = {
  recipients: RecipientCheck;
  subjectMissing: boolean;
  uploading: boolean;
};

export function composeReadiness(mode: AdminMailComposeMode, draft: MailComposeDraft, attachments: MailComposeAttachment[]): ComposeReadiness {
  return {
    recipients: checkRecipients({ to: draft.to, cc: draft.cc, bcc: draft.bcc }),
    subjectMissing: mode === "new" && !draft.subject.trim(),
    uploading: attachments.some((item) => item.status === "uploading"),
  };
}

/** The same ScanMe template, signature and quote the send action builds (it rebuilds the quote from Zoho). */
export function renderComposePreview(args: {
  mode: AdminMailComposeMode;
  draft: MailComposeDraft;
  source: AdminMailMessage | null;
  signatureText: string | null;
}) {
  const subject = args.draft.subject.replace(/\s+/g, " ").trim() || composeSubject(args.mode, args.source?.subject ?? "");
  const rendered = renderScanMeEmail({
    bodyText: args.draft.body,
    signatureText: args.signatureText,
    quote: args.source ? buildMailQuote(args.mode, args.source) : null,
    subject,
  });
  return { ...rendered, subject };
}

/** One id per send attempt (the server never sends twice with the same id). */
export function newSendCommandId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `posta-${random.replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 80);
}
