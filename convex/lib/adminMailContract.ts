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
