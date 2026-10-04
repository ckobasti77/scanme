export const EMAIL_SYNC_PAGE_SIZE = 50;
export const EMAIL_SYNC_MAX_PAGES = 3;
export const EMAIL_SYNC_MAX_MESSAGES = 150;
export const EMAIL_SYNC_OVERLAP_MS = 10 * 60 * 1_000;
export const EMAIL_SYNC_OVERLAP_MESSAGES = 100;
export const EMAIL_SYNC_LEASE_MS = 90 * 1_000;
export const EMAIL_PREVIEW_MAX_LENGTH = 180;

export type EmailProviderName = "zoho";

export type EmailProviderAccount = {
  providerAccountId: string;
  primaryEmailAddress: string;
  enabled: boolean;
};

export type EmailProviderFolder = {
  folderId: string;
  name: string;
  type: string;
};

export type EmailProviderListMessage = {
  providerMessageId: string;
  folderId: string;
  providerThreadId: string | null;
  subject: string;
  senderAddress: string;
  recipientAddress: string | null;
  receivedAt: number;
  providerReadState: string | null;
  safePreview: string;
  hasAttachment: boolean;
};

export type EmailProviderMessageHeaders = {
  providerMessageId: string;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
};

export type EmailProviderMessageContent = {
  providerMessageId: string;
  kind: "plain_text" | "html";
  rawContent: string;
  safePlainText: string | null;
};

export type EmailProviderAttachment = {
  providerAttachmentId: string;
  fileName: string;
  size: number;
  inline: boolean;
};

export type EmailProviderAttachmentDownload = {
  bytes: ArrayBuffer;
  mimeType: string;
};

export type EmailProviderSendInput = {
  accountId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  plainTextContent: string;
};

export type EmailProviderReplyInput = EmailProviderSendInput & {
  replyToProviderMessageId: string;
};

export type EmailProviderSendResult = {
  providerMessageId: string;
  providerMailId: string | null;
};

export type EmailProviderAttachmentPolicy = {
  maxBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
};

export interface EmailProviderTransport {
  discoverAccount(): Promise<EmailProviderAccount>;
  discoverFolders(accountId: string): Promise<EmailProviderFolder[]>;
  listMessages(args: {
    accountId: string;
    folderId: string;
    start: number;
    limit: number;
  }): Promise<EmailProviderListMessage[]>;
  getMessageHeaders(args: {
    accountId: string;
    folderId: string;
    providerMessageId: string;
  }): Promise<EmailProviderMessageHeaders>;
  getMessageContent(args: {
    accountId: string;
    folderId: string;
    providerMessageId: string;
  }): Promise<EmailProviderMessageContent>;
  listAttachments(args: {
    accountId: string;
    folderId: string;
    providerMessageId: string;
  }): Promise<EmailProviderAttachment[]>;
  downloadAttachment(args: {
    accountId: string;
    folderId: string;
    providerMessageId: string;
    providerAttachmentId: string;
    policy: EmailProviderAttachmentPolicy;
  }): Promise<EmailProviderAttachmentDownload>;
  send(input: EmailProviderSendInput): Promise<EmailProviderSendResult>;
  reply(input: EmailProviderReplyInput): Promise<EmailProviderSendResult>;
  searchSentForReconciliation(args: {
    accountId: string;
    sentFolderId: string;
    fromAddress: string;
    toAddress: string;
    subject: string;
    limit: number;
  }): Promise<EmailProviderListMessage[]>;
  refreshAccessToken(): Promise<boolean>;
}

export class EmailProviderPayloadError extends Error {
  readonly safeCode: string;

  constructor(safeCode: string) {
    super(safeCode);
    this.name = "EmailProviderPayloadError";
    this.safeCode = safeCode;
  }
}

export class EmailProviderHttpError extends Error {
  readonly status: number;
  readonly safeCode: string;
  readonly retryAfterMs: number | null;

  constructor(args: {
    status: number;
    safeCode: string;
    retryAfterMs?: number | null;
  }) {
    super(args.safeCode);
    this.name = "EmailProviderHttpError";
    this.status = args.status;
    this.safeCode = args.safeCode;
    this.retryAfterMs = args.retryAfterMs ?? null;
  }
}

export function normalizeEmailAddress(value: string) {
  const bracketed = value.match(/<([^<>]+)>/);
  const normalized = (bracketed?.[1] ?? value).trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new EmailProviderPayloadError("email_address_invalid");
  }
  return normalized;
}

export function normalizeProviderId(value: unknown, safeCode: string) {
  const normalized = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";
  if (!/^\d{1,40}$/.test(normalized)) {
    throw new EmailProviderPayloadError(safeCode);
  }
  return normalized;
}

export function safePlainTextPreview(value: string) {
  if (value.includes("<") || value.includes(">")) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, EMAIL_PREVIEW_MAX_LENGTH);
}

export function isHtmlContent(value: string) {
  return /<\/?[a-z][^>]*>/i.test(value);
}

export function retryDelayMs(args: {
  attempt: number;
  retryAfterMs?: number | null;
  random?: () => number;
}) {
  if (args.retryAfterMs !== undefined && args.retryAfterMs !== null) {
    return Math.max(1_000, Math.min(args.retryAfterMs, 60 * 60 * 1_000));
  }
  const attempt = Math.max(0, Math.min(args.attempt, 8));
  const base = Math.min(1_000 * (2 ** attempt), 15 * 60 * 1_000);
  const random = args.random ?? Math.random;
  return Math.round(base * (0.75 + random() * 0.5));
}
