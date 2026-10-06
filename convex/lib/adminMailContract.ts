import { v, type Infer } from "convex/values";

// Admin UX Z1 — Pošta (ADMIN-UX-ZAHTEVI §10): the stable error codes and the
// shapes the admin-only mail functions return. Messages are read live from
// Zoho and exist only in these return values; no token and no message body is
// ever stored or returned to the client.

export const ADMIN_MAIL_ERROR_CODES = [
  "ZOHO_NOT_CONFIGURED",
  "ZOHO_AUTH_REQUIRED",
  "ZOHO_RATE_LIMITED",
  "ZOHO_UNAVAILABLE",
  "ZOHO_STATE_INVALID",
  "ZOHO_CONNECTION_NOT_FOUND",
  "ZOHO_NO_MAILBOX",
  "ZOHO_REGION_UNSUPPORTED",
  "ZOHO_ATTACHMENT_BLOCKED",
  "ZOHO_REQUEST_REJECTED",
  // Z2 — sending
  "ZOHO_RECIPIENT_INVALID",
  "ZOHO_COMPOSE_INVALID",
  "ZOHO_SEND_UNCERTAIN",
] as const;

export type AdminMailErrorCode = (typeof ADMIN_MAIL_ERROR_CODES)[number];

export function isAdminMailErrorCode(value: unknown): value is AdminMailErrorCode {
  return typeof value === "string" && (ADMIN_MAIL_ERROR_CODES as readonly string[]).includes(value);
}

/** Largest page of the message list (Zoho allows 200; the UI asks for 25). */
export const ADMIN_MAIL_PAGE_SIZE_MAX = 50;
/** Largest attachment the download action returns (chunked like report files). */
export const ADMIN_MAIL_ATTACHMENT_MAX_BYTES = 7 * 1024 * 1024;
/** Longest search text sent to Zoho. */
export const ADMIN_MAIL_SEARCH_MAX_LENGTH = 100;

// Z2 — limits of one outgoing message.
export const ADMIN_MAIL_SEND_MAX_ATTACHMENTS = 10;
export const ADMIN_MAIL_SEND_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const ADMIN_MAIL_SEND_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
export const ADMIN_MAIL_MAX_RECIPIENTS = 50;
export const ADMIN_MAIL_SUBJECT_MAX_LENGTH = 300;
export const ADMIN_MAIL_BODY_MAX_LENGTH = 50_000;
export const ADMIN_MAIL_SIGNATURE_MAX_LENGTH = 2_000;
/** A registered upload that is not sent is deleted after this time. */
export const ADMIN_MAIL_UPLOAD_TTL_MS = 2 * 60 * 60 * 1_000;

export const ADMIN_MAIL_COMPOSE_MODES = ["new", "reply", "reply_all", "forward"] as const;
export type AdminMailComposeMode = (typeof ADMIN_MAIL_COMPOSE_MODES)[number];
export const adminMailComposeMode = v.union(v.literal("new"), v.literal("reply"), v.literal("reply_all"), v.literal("forward"));

/** ADMIN-09B outbox states: `needs_reconciliation` = the POST may have been accepted; never resent blindly. */
export const adminMailSendStatus = v.union(
  v.literal("pending"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("needs_reconciliation"),
);

export const adminMailSendResult = v.object({
  sendCommandId: v.string(),
  status: adminMailSendStatus,
  errorCode: v.union(v.string(), v.null()),
  /** The same sendCommandId was already used: nothing was sent again. */
  duplicate: v.boolean(),
});

const nullableString = v.union(v.string(), v.null());

export const adminMailAddress = v.object({ name: nullableString, address: v.string() });

export const adminMailFolder = v.object({
  folderId: v.string(),
  name: v.string(),
  type: v.string(),
  path: nullableString,
});

export const adminMailListItem = v.object({
  messageId: v.string(),
  folderId: v.string(),
  threadId: nullableString,
  subject: v.string(),
  fromName: nullableString,
  fromAddress: v.string(),
  summary: v.string(),
  receivedAt: v.number(),
  unread: v.boolean(),
  hasAttachment: v.boolean(),
});

export const adminMailAttachment = v.object({
  attachmentId: v.string(),
  fileName: v.string(),
  size: v.number(),
  inline: v.boolean(),
});

export const adminMailMessage = v.object({
  messageId: v.string(),
  folderId: v.string(),
  subject: v.string(),
  from: v.union(adminMailAddress, v.null()),
  to: v.array(adminMailAddress),
  cc: v.array(adminMailAddress),
  receivedAt: v.union(v.number(), v.null()),
  unread: v.boolean(),
  body: v.object({ kind: v.union(v.literal("html"), v.literal("text")), content: v.string() }),
  attachments: v.array(adminMailAttachment),
});

export const adminMailMessagePage = v.object({
  messages: v.array(adminMailListItem),
  hasMore: v.boolean(),
});

export const adminMailFile = v.object({
  fileName: v.string(),
  mimeType: v.string(),
  chunks: v.array(v.bytes()),
});

export const adminMailConnectionStatus = v.union(v.literal("active"), v.literal("auth_required"));

export const adminMailStatus = v.object({
  /** ZOHO_MAIL_CLIENT_ENABLED is exactly "true". */
  enabled: v.boolean(),
  /** Enabled AND the client id/secret, redirect URI and encryption key are valid. */
  configured: v.boolean(),
  connections: v.array(v.object({
    connectionId: v.id("adminMailConnections"),
    primaryEmail: v.string(),
    status: adminMailConnectionStatus,
    lastErrorCode: nullableString,
    connectedAt: v.number(),
    accounts: v.array(v.object({
      accountId: v.string(),
      emailAddress: v.string(),
      displayName: nullableString,
      isDefault: v.boolean(),
      /** Z2 — signature of this mailbox (text with links), null = none. */
      signatureText: nullableString,
    })),
  })),
});

export type AdminMailAddress = Infer<typeof adminMailAddress>;
export type AdminMailFolder = Infer<typeof adminMailFolder>;
export type AdminMailListItem = Infer<typeof adminMailListItem>;
export type AdminMailAttachment = Infer<typeof adminMailAttachment>;
export type AdminMailMessage = Infer<typeof adminMailMessage>;
export type AdminMailMessagePage = Infer<typeof adminMailMessagePage>;
export type AdminMailStatus = Infer<typeof adminMailStatus>;
export type AdminMailConnectionView = AdminMailStatus["connections"][number];
export type AdminMailSendStatus = Infer<typeof adminMailSendStatus>;
export type AdminMailSendResult = Infer<typeof adminMailSendResult>;
