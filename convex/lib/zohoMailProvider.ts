import {
  EMAIL_SYNC_PAGE_SIZE,
  EmailProviderHttpError,
  EmailProviderPayloadError,
  isHtmlContent,
  normalizeEmailAddress,
  normalizeProviderId,
  safePlainTextPreview,
  type EmailProviderAccount,
  type EmailProviderAttachment,
  type EmailProviderAttachmentDownload,
  type EmailProviderFolder,
  type EmailProviderListMessage,
  type EmailProviderMessageContent,
  type EmailProviderMessageHeaders,
  type EmailProviderReplyInput,
  type EmailProviderSendInput,
  type EmailProviderSendResult,
  type EmailProviderTransport,
} from "./emailProvider";

export const ZOHO_MAIL_EU_API_BASE_URL = "https://mail.zoho.eu/api";
export const ZOHO_ACCOUNTS_EU_BASE_URL = "https://accounts.zoho.eu";

const MAX_HEADER_VALUES = 50;
const MAX_HEADER_VALUE_LENGTH = 4_096;
const MAX_CONTENT_LENGTH = 900_000;

type JsonRecord = Record<string, unknown>;

function record(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EmailProviderPayloadError(code);
  }
  return value as JsonRecord;
}

function array(value: unknown, code: string) {
  if (!Array.isArray(value)) throw new EmailProviderPayloadError(code);
  return value;
}

function string(value: unknown, code: string) {
  if (typeof value !== "string") throw new EmailProviderPayloadError(code);
  return value;
}

function finiteNumber(value: unknown, code: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new EmailProviderPayloadError(code);
  }
  return number;
}

function successData(payload: unknown) {
  const root = record(payload, "zoho_response_invalid");
  const status = record(root.status, "zoho_status_invalid");
  if (status.code !== 200) throw new EmailProviderPayloadError("zoho_status_not_success");
  return root.data;
}

function headerValues(headers: JsonRecord, name: string) {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  if (!key) return [];
  const values = array(headers[key], "zoho_header_values_invalid");
  if (values.length > MAX_HEADER_VALUES) {
    throw new EmailProviderPayloadError("zoho_header_values_excessive");
  }
  return values.map((value) => {
    const item = string(value, "zoho_header_value_invalid").trim();
    if (!item || item.length > MAX_HEADER_VALUE_LENGTH) {
      throw new EmailProviderPayloadError("zoho_header_value_invalid");
    }
    return item;
  });
}

function firstHeader(headers: JsonRecord, name: string) {
  return headerValues(headers, name)[0] ?? null;
}

function splitReferences(values: string[]) {
  const references = values.flatMap((value) => value.match(/<[^<>\s]+>/g) ?? []);
  if (references.length > MAX_HEADER_VALUES) {
    throw new EmailProviderPayloadError("zoho_references_excessive");
  }
  return [...new Set(references)];
}

export function parseZohoAccounts(payload: unknown): EmailProviderAccount[] {
  return array(successData(payload), "zoho_accounts_invalid")
    .filter((value) => record(value, "zoho_account_invalid").type === "ZOHO_ACCOUNT")
    .map((value) => {
    const item = record(value, "zoho_account_invalid");
    return {
      providerAccountId: normalizeProviderId(item.accountId, "zoho_account_id_invalid"),
      primaryEmailAddress: normalizeEmailAddress(
        string(item.primaryEmailAddress ?? item.mailboxAddress, "zoho_account_email_invalid"),
      ),
      enabled: item.enabled === true && item.mailboxStatus !== "disabled",
    };
  });
}

export function parseZohoFolders(payload: unknown): EmailProviderFolder[] {
  return array(successData(payload), "zoho_folders_invalid").map((value) => {
    const item = record(value, "zoho_folder_invalid");
    const name = string(item.folderName, "zoho_folder_name_invalid").trim();
    const type = string(item.folderType, "zoho_folder_type_invalid").trim();
    if (!name || !type) throw new EmailProviderPayloadError("zoho_folder_invalid");
    return {
      folderId: normalizeProviderId(item.folderId, "zoho_folder_id_invalid"),
      name,
      type,
    };
  });
}

export function parseZohoMessageList(payload: unknown): EmailProviderListMessage[] {
  return array(successData(payload), "zoho_messages_invalid").map((value) => {
    const item = record(value, "zoho_message_invalid");
    const subject = string(item.subject, "zoho_message_subject_invalid").trim();
    const summary = string(item.summary, "zoho_message_summary_invalid");
    return {
      providerMessageId: normalizeProviderId(item.messageId, "zoho_message_id_invalid"),
      folderId: normalizeProviderId(item.folderId, "zoho_message_folder_id_invalid"),
      providerThreadId: item.threadId === undefined
        ? null
        : normalizeProviderId(item.threadId, "zoho_thread_id_invalid"),
      subject: subject.slice(0, 500),
      senderAddress: normalizeEmailAddress(
        string(item.fromAddress, "zoho_message_sender_invalid"),
      ),
      recipientAddress: typeof item.toAddress === "string"
        ? normalizeEmailAddress(item.toAddress)
        : null,
      receivedAt: finiteNumber(item.receivedTime, "zoho_message_received_at_invalid"),
      providerReadState: typeof item.status === "string" ? item.status : null,
      safePreview: safePlainTextPreview(summary) ?? "",
      hasAttachment: item.hasAttachment === true || item.hasAttachment === 1 || item.hasAttachment === "1",
    };
  });
}

export function parseZohoHeaders(payload: unknown): EmailProviderMessageHeaders {
  const data = record(successData(payload), "zoho_headers_invalid");
  const headers = record(data.headerContent, "zoho_header_content_invalid");
  return {
    providerMessageId: normalizeProviderId(data.messageId, "zoho_header_message_id_invalid"),
    rfcMessageId: firstHeader(headers, "Message-Id"),
    inReplyTo: firstHeader(headers, "In-Reply-To"),
    references: splitReferences(headerValues(headers, "References")),
  };
}

export function parseZohoContent(payload: unknown): EmailProviderMessageContent {
  const data = record(successData(payload), "zoho_content_invalid");
  const rawContent = string(data.content, "zoho_content_value_invalid");
  if (rawContent.length > MAX_CONTENT_LENGTH) {
    throw new EmailProviderPayloadError("zoho_content_excessive");
  }
  const html = isHtmlContent(rawContent);
  return {
    providerMessageId: normalizeProviderId(data.messageId, "zoho_content_message_id_invalid"),
    kind: html ? "html" : "plain_text",
    rawContent,
    safePlainText: html ? null : rawContent.trim().slice(0, 50_000),
  };
}

export function parseZohoAttachments(payload: unknown): EmailProviderAttachment[] {
  const data = record(successData(payload), "zoho_attachments_invalid");
  const normal = array(data.attachments ?? [], "zoho_attachment_list_invalid");
  const inline = array(data.inline ?? [], "zoho_inline_attachment_list_invalid");
  return [...normal.map((value) => ({ value, inline: false })), ...inline.map((value) => ({ value, inline: true }))]
    .map(({ value, inline: isInline }) => {
      const item = record(value, "zoho_attachment_invalid");
      const fileName = string(item.attachmentName, "zoho_attachment_name_invalid").trim();
      if (!fileName || fileName.length > 255) {
        throw new EmailProviderPayloadError("zoho_attachment_name_invalid");
      }
      return {
        providerAttachmentId: normalizeProviderId(
          item.attachmentId,
          "zoho_attachment_id_invalid",
        ),
        fileName,
        size: finiteNumber(item.attachmentSize, "zoho_attachment_size_invalid"),
        inline: isInline,
      };
    });
}

export function parseZohoSendResult(payload: unknown): EmailProviderSendResult {
  const data = record(successData(payload), "zoho_send_result_invalid");
  const mailId = typeof data.mailId === "string" ? data.mailId.trim() : "";
  return {
    providerMessageId: normalizeProviderId(data.messageId, "zoho_send_message_id_invalid"),
    providerMailId: mailId || null,
  };
}

export function parseZohoHttpError(args: {
  status: number;
  retryAfter: string | null;
}) {
  let retryAfterMs: number | null = null;
  if (args.retryAfter) {
    const seconds = Number(args.retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      retryAfterMs = Math.round(seconds * 1_000);
    } else {
      const timestamp = Date.parse(args.retryAfter);
      if (Number.isFinite(timestamp)) retryAfterMs = Math.max(0, timestamp - Date.now());
    }
  }
  const safeCode = args.status === 401
    ? "zoho_auth_required"
    : args.status === 429
      ? "zoho_rate_limited"
      : args.status >= 500
        ? "zoho_unavailable"
        : "zoho_request_rejected";
  return new EmailProviderHttpError({ status: args.status, safeCode, retryAfterMs });
}

export type ZohoMailTransportConfig = {
  accessToken: string;
  allowedAccountId: string;
  fromAddress: string;
  syncEnabled: boolean;
  outboundEnabled: boolean;
  accountIdConfirmed: boolean;
  foldersConfirmed: boolean;
  groupSendAsVerified: boolean;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  refreshAccessToken?: () => Promise<boolean>;
};

export class ZohoMailTransport implements EmailProviderTransport {
  private readonly config: ZohoMailTransportConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;

  constructor(config: ZohoMailTransportConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.apiBaseUrl = (config.apiBaseUrl ?? ZOHO_MAIL_EU_API_BASE_URL).replace(/\/$/, "");
    if (this.apiBaseUrl !== ZOHO_MAIL_EU_API_BASE_URL) {
      throw new EmailProviderPayloadError("zoho_eu_api_base_required");
    }
    normalizeProviderId(config.allowedAccountId, "zoho_allowed_account_invalid");
    normalizeEmailAddress(config.fromAddress);
    if (!config.accessToken.trim()) throw new EmailProviderPayloadError("zoho_access_token_missing");
  }

  private assertReadReady(accountId?: string) {
    if (!this.config.syncEnabled || !this.config.accountIdConfirmed) {
      throw new EmailProviderPayloadError("zoho_sync_disabled");
    }
    if (accountId && accountId !== this.config.allowedAccountId) {
      throw new EmailProviderPayloadError("zoho_account_not_allowed");
    }
  }

  private assertDiscoveryReady() {
    if (!this.config.syncEnabled) {
      throw new EmailProviderPayloadError("zoho_sync_disabled");
    }
  }

  private assertOutboundReady(input: EmailProviderSendInput) {
    this.assertReadReady(input.accountId);
    if (
      !this.config.outboundEnabled ||
      !this.config.foldersConfirmed ||
      !this.config.groupSendAsVerified
    ) {
      throw new EmailProviderPayloadError("zoho_outbound_disabled");
    }
    if (normalizeEmailAddress(input.fromAddress) !== normalizeEmailAddress(this.config.fromAddress)) {
      throw new EmailProviderPayloadError("zoho_from_address_not_allowed");
    }
  }

  private async requestJson(path: string, init?: RequestInit) {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Zoho-oauthtoken ${this.config.accessToken}`,
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw parseZohoHttpError({
        status: response.status,
        retryAfter: response.headers.get("Retry-After"),
      });
    }
    return response.json() as Promise<unknown>;
  }

  async discoverAccount() {
    this.assertDiscoveryReady();
    const accounts = parseZohoAccounts(await this.requestJson("/accounts"));
    const matches = accounts.filter(
      (account) => account.providerAccountId === this.config.allowedAccountId,
    );
    if (matches.length !== 1 || !matches[0].enabled) {
      throw new EmailProviderPayloadError("zoho_allowed_account_not_confirmed");
    }
    return matches[0];
  }

  async discoverFolders(accountId: string) {
    this.assertReadReady(accountId);
    return parseZohoFolders(await this.requestJson(`/accounts/${accountId}/folders`));
  }

  async listMessages(args: {
    accountId: string;
    folderId: string;
    start: number;
    limit: number;
  }) {
    this.assertReadReady(args.accountId);
    if (
      !this.config.foldersConfirmed ||
      args.start < 1 ||
      args.limit < 1 ||
      args.limit > EMAIL_SYNC_PAGE_SIZE
    ) throw new EmailProviderPayloadError("zoho_list_bounds_invalid");
    const params = new URLSearchParams({
      folderId: normalizeProviderId(args.folderId, "zoho_folder_id_invalid"),
      start: String(args.start),
      limit: String(args.limit),
      status: "all",
      sortBy: "date",
      sortorder: "false",
      includeto: "true",
    });
    return parseZohoMessageList(
      await this.requestJson(`/accounts/${args.accountId}/messages/view?${params}`),
    );
  }

  async getMessageHeaders(args: {
    accountId: string;
    folderId: string;
    providerMessageId: string;
  }) {
    this.assertReadReady(args.accountId);
    return parseZohoHeaders(await this.requestJson(
      `/accounts/${args.accountId}/folders/${normalizeProviderId(args.folderId, "zoho_folder_id_invalid")}` +
      `/messages/${normalizeProviderId(args.providerMessageId, "zoho_message_id_invalid")}/header?raw=false`,
    ));
  }

  async getMessageContent(args: {
    accountId: string;
    folderId: string;
    providerMessageId: string;
  }) {
    this.assertReadReady(args.accountId);
    return parseZohoContent(await this.requestJson(
      `/accounts/${args.accountId}/folders/${normalizeProviderId(args.folderId, "zoho_folder_id_invalid")}` +
      `/messages/${normalizeProviderId(args.providerMessageId, "zoho_message_id_invalid")}/content`,
    ));
  }

  async listAttachments(args: {
    accountId: string;
    folderId: string;
    providerMessageId: string;
  }) {
    this.assertReadReady(args.accountId);
    return parseZohoAttachments(await this.requestJson(
      `/accounts/${args.accountId}/folders/${normalizeProviderId(args.folderId, "zoho_folder_id_invalid")}` +
      `/messages/${normalizeProviderId(args.providerMessageId, "zoho_message_id_invalid")}/attachmentinfo?includeInline=true`,
    ));
  }

  async downloadAttachment(args: {
    accountId: string;
    folderId: string;
    providerMessageId: string;
    providerAttachmentId: string;
    policy: { maxBytes: number; allowedMimeTypes: ReadonlySet<string> };
  }): Promise<EmailProviderAttachmentDownload> {
    this.assertReadReady(args.accountId);
    if (!Number.isFinite(args.policy.maxBytes) || args.policy.maxBytes <= 0) {
      throw new EmailProviderPayloadError("attachment_policy_invalid");
    }
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/accounts/${args.accountId}/folders/${normalizeProviderId(args.folderId, "zoho_folder_id_invalid")}` +
      `/messages/${normalizeProviderId(args.providerMessageId, "zoho_message_id_invalid")}` +
      `/attachments/${normalizeProviderId(args.providerAttachmentId, "zoho_attachment_id_invalid")}`,
      { headers: { Authorization: `Zoho-oauthtoken ${this.config.accessToken}` } },
    );
    if (!response.ok) {
      throw parseZohoHttpError({
        status: response.status,
        retryAfter: response.headers.get("Retry-After"),
      });
    }
    const mimeType = (response.headers.get("Content-Type") ?? "application/octet-stream")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const declaredSize = Number(response.headers.get("Content-Length"));
    if (
      !args.policy.allowedMimeTypes.has(mimeType) ||
      (Number.isFinite(declaredSize) && declaredSize > args.policy.maxBytes)
    ) throw new EmailProviderPayloadError("attachment_policy_blocked");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > args.policy.maxBytes) {
      throw new EmailProviderPayloadError("attachment_policy_blocked");
    }
    return { bytes, mimeType };
  }

  async send(input: EmailProviderSendInput) {
    this.assertOutboundReady(input);
    return parseZohoSendResult(await this.requestJson(
      `/accounts/${input.accountId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          fromAddress: normalizeEmailAddress(input.fromAddress),
          toAddress: normalizeEmailAddress(input.toAddress),
          subject: input.subject,
          content: input.plainTextContent,
          mailFormat: "plaintext",
        }),
      },
    ));
  }

  async reply(input: EmailProviderReplyInput) {
    this.assertOutboundReady(input);
    return parseZohoSendResult(await this.requestJson(
      `/accounts/${input.accountId}/messages/${normalizeProviderId(input.replyToProviderMessageId, "zoho_reply_message_id_invalid")}`,
      {
        method: "POST",
        body: JSON.stringify({
          fromAddress: normalizeEmailAddress(input.fromAddress),
          toAddress: normalizeEmailAddress(input.toAddress),
          subject: input.subject,
          content: input.plainTextContent,
          mailFormat: "plaintext",
          action: "Reply",
        }),
      },
    ));
  }

  async searchSentForReconciliation(args: {
    accountId: string;
    sentFolderId: string;
    fromAddress: string;
    toAddress: string;
    subject: string;
    limit: number;
  }) {
    if (args.limit < 1 || args.limit > EMAIL_SYNC_PAGE_SIZE) {
      throw new EmailProviderPayloadError("zoho_reconciliation_bounds_invalid");
    }
    const rows = await this.listMessages({
      accountId: args.accountId,
      folderId: args.sentFolderId,
      start: 1,
      limit: args.limit,
    });
    const from = normalizeEmailAddress(args.fromAddress);
    const to = normalizeEmailAddress(args.toAddress);
    return rows.filter((row) =>
      row.subject === args.subject &&
      row.senderAddress === from &&
      row.recipientAddress === to
    );
  }

  async refreshAccessToken() {
    return this.config.refreshAccessToken ? this.config.refreshAccessToken() : false;
  }
}
