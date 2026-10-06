import { EmailProviderPayloadError, isHtmlContent } from "./emailProvider";
import {
  ZOHO_ACCOUNTS_EU_BASE_URL,
  ZOHO_MAIL_EU_API_BASE_URL,
  parseZohoAttachments,
  parseZohoHttpError,
} from "./zohoMailProvider";
import {
  ADMIN_MAIL_SEARCH_MAX_LENGTH,
  type AdminMailAddress,
  type AdminMailAttachment,
  type AdminMailErrorCode,
  type AdminMailFolder,
  type AdminMailListItem,
} from "./adminMailContract";

// Admin UX Z1 — live Zoho Mail client of the personal admin mailboxes
// (ADMIN-UX-ZAHTEVI §10). Separate from the ADMIN-09B ingest transport
// (ZohoMailTransport, one integration account, GET only), which stays as it
// is; this client reuses its EU constants and the attachment/HTTP parsers.
// Endpoints and scopes were checked against zoho.com/mail/help/api on
// 2026-10-06: OAuth (using-oauth-2), Accounts, Folders, List/Search Emails,
// Email Meta Data, Email Content, Attachment Info/Content, Mark as read; for
// Z2 also Send Email (+ with attachments), Reply to an email (action "Reply";
// reply-all is a reply with explicit recipients, forward is a new message —
// the API documents no separate actions for them) and Upload Attachment.
// Every call goes to the EU data centre only; the token is sent only in the
// Authorization header and never appears in a URL, a log or an error.

/** Read accounts and folders; read, mark read (UPDATE) and — for Z2 — send/upload (CREATE). */
export const ZOHO_MAIL_CLIENT_SCOPES = [
  "ZohoMail.accounts.READ",
  "ZohoMail.folders.READ",
  "ZohoMail.messages.READ",
  "ZohoMail.messages.UPDATE",
  "ZohoMail.messages.CREATE",
] as const;

export const ZOHO_OAUTH_AUTHORIZE_URL = `${ZOHO_ACCOUNTS_EU_BASE_URL}/oauth/v2/auth`;
export const ZOHO_OAUTH_TOKEN_URL = `${ZOHO_ACCOUNTS_EU_BASE_URL}/oauth/v2/token`;
export const ZOHO_OAUTH_REVOKE_URL = `${ZOHO_ACCOUNTS_EU_BASE_URL}/oauth/v2/token/revoke`;

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CONTENT_LENGTH = 900_000;
const MAX_ACCOUNTS = 20;
const MAX_FOLDERS = 200;
const MAX_ADDRESSES = 50;
const MAX_SUMMARY = 300;
const MAX_SUBJECT = 500;

export class AdminMailError extends Error {
  readonly code: AdminMailErrorCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: AdminMailErrorCode, retryAfterSeconds: number | null = null) {
    super(code);
    this.name = "AdminMailError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type FetchLike = typeof fetch;
type Json = Record<string, unknown>;

export function buildZohoAuthorizeUrl(args: { clientId: string; redirectUri: string; state: string }) {
  const params = new URLSearchParams({
    client_id: args.clientId,
    response_type: "code",
    redirect_uri: args.redirectUri,
    scope: ZOHO_MAIL_CLIENT_SCOPES.join(","),
    access_type: "offline",
    prompt: "consent",
    state: args.state,
  });
  return `${ZOHO_OAUTH_AUTHORIZE_URL}?${params}`;
}

// -----------------------------------------------------------------------------
// Payload helpers
// -----------------------------------------------------------------------------

// Zoho ids are 64-bit numbers (e.g. 1709887058769100001) and some responses
// send them as JSON numbers, which JSON.parse would round. Quote every long
// integer value of an "...Id" key before parsing.
const LONG_ID_VALUE = /("[A-Za-z]*Id"\s*:\s*)(\d{16,})(?=\s*[,}\]])/g;

export function parseZohoJson(text: string): unknown {
  return JSON.parse(text.replace(LONG_ID_VALUE, '$1"$2"'));
}

function record(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function zohoId(value: unknown): string | null {
  const raw = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  return /^\d{1,40}$/.test(raw) ? raw : null;
}

export function requireZohoId(value: string) {
  const id = zohoId(value);
  if (!id) throw new AdminMailError("ZOHO_REQUEST_REJECTED");
  return id;
}

function flag(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function epochMs(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

const ENTITIES: Record<string, string> = { quot: '"', lt: "<", gt: ">", amp: "&", "#39": "'", apos: "'", nbsp: " " };

export function decodeZohoEntities(value: string) {
  return value.replace(/&(quot|lt|gt|amp|#39|apos|nbsp);/g, (_, name: string) => ENTITIES[name]);
}

const EMAIL = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/;

/** `"Ana" <ana@x.rs>, b@y.rs` (HTML-escaped or not) → address list; "Not Provided" → []. */
export function parseZohoAddressList(raw: unknown): AdminMailAddress[] {
  const value = typeof raw === "string" ? decodeZohoEntities(raw).trim() : "";
  if (!value || /^not provided$/i.test(value)) return [];
  const result: AdminMailAddress[] = [];
  for (const part of value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const item = part.trim();
    const bracketed = item.match(/^(.*?)<([^<>]+)>\s*$/);
    const address = (bracketed ? bracketed[2] : item).trim();
    if (!EMAIL.test(address)) continue;
    const name = bracketed ? bracketed[1].trim().replace(/^"(.*)"$/, "$1").trim() : "";
    result.push({ name: name && name !== address ? name : null, address });
    if (result.length >= MAX_ADDRESSES) break;
  }
  return result;
}

function successData(payload: unknown): unknown {
  const root = record(payload);
  const status = record(root?.status);
  if (!root || !status) throw new AdminMailError("ZOHO_UNAVAILABLE");
  if (Number(status.code) !== 200) throw new AdminMailError("ZOHO_REQUEST_REJECTED");
  return root.data;
}

function list(payload: unknown) {
  const data = successData(payload);
  if (!Array.isArray(data)) throw new AdminMailError("ZOHO_UNAVAILABLE");
  return data;
}

function cleanText(value: unknown, max: number) {
  return decodeZohoEntities(text(value) ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// -----------------------------------------------------------------------------
// Response mapping
// -----------------------------------------------------------------------------

export type ZohoMailAccount = { accountId: string; emailAddress: string; displayName: string | null };

export function parseZohoMailAccounts(payload: unknown): ZohoMailAccount[] {
  const accounts: ZohoMailAccount[] = [];
  for (const value of list(payload)) {
    const item = record(value);
    if (!item || (item.type !== undefined && item.type !== "ZOHO_ACCOUNT")) continue;
    if (item.enabled === false || item.mailboxStatus === "disabled") continue;
    const accountId = zohoId(item.accountId);
    const email = (text(item.primaryEmailAddress) ?? text(item.mailboxAddress) ?? "").trim().toLowerCase();
    if (!accountId || !EMAIL.test(email)) continue;
    const displayName = cleanText(item.displayName ?? item.accountDisplayName, 120);
    accounts.push({ accountId, emailAddress: email, displayName: displayName || null });
    if (accounts.length >= MAX_ACCOUNTS) break;
  }
  return accounts;
}

const FOLDER_ORDER = ["Inbox", "Sent", "Drafts"];

export function parseZohoMailFolders(payload: unknown): AdminMailFolder[] {
  const folders: AdminMailFolder[] = [];
  for (const value of list(payload)) {
    const item = record(value);
    const folderId = zohoId(item?.folderId);
    const name = cleanText(item?.folderName, 120);
    if (!item || !folderId || !name) continue;
    const path = cleanText(item.path, 300);
    folders.push({ folderId, name, type: cleanText(item.folderType, 40) || "NONE", path: path || null });
    if (folders.length >= MAX_FOLDERS) break;
  }
  // Inbox, Sent and Drafts first; the rest keeps Zoho's order.
  const rank = (folder: AdminMailFolder) => {
    const index = FOLDER_ORDER.indexOf(folder.type);
    return index === -1 ? FOLDER_ORDER.length : index;
  };
  return folders
    .map((folder, index) => ({ folder, index }))
    .sort((a, b) => rank(a.folder) - rank(b.folder) || a.index - b.index)
    .map(({ folder }) => folder);
}

function isUnread(status: unknown) {
  return status === "0" || status === 0 || status === "unread";
}

/** Maps both List Emails (`receivedTime`, status "0"/"1") and Search (`receivedtime`, "read"/"unread"). */
export function parseZohoMailList(payload: unknown): AdminMailListItem[] {
  const messages: AdminMailListItem[] = [];
  for (const value of list(payload)) {
    const item = record(value);
    const messageId = zohoId(item?.messageId);
    const folderId = zohoId(item?.folderId);
    if (!item || !messageId || !folderId) continue;
    const from = parseZohoAddressList(item.fromAddress)[0] ?? null;
    const sender = cleanText(item.sender, 200);
    const threadId = zohoId(item.threadId);
    messages.push({
      messageId,
      folderId,
      threadId: threadId && threadId !== "0" ? threadId : null,
      subject: cleanText(item.subject, MAX_SUBJECT),
      fromName: sender || from?.name || null,
      fromAddress: from?.address ?? cleanText(item.fromAddress, 320),
      summary: cleanText(item.summary, MAX_SUMMARY),
      receivedAt: epochMs(item.receivedTime ?? item.receivedtime) ?? epochMs(item.sentDateInGMT) ?? 0,
      unread: isUnread(item.status),
      hasAttachment: flag(item.hasAttachment),
    });
  }
  return messages;
}

export type ZohoMailDetails = {
  folderId: string | null;
  subject: string;
  from: AdminMailAddress | null;
  to: AdminMailAddress[];
  cc: AdminMailAddress[];
  receivedAt: number | null;
  unread: boolean;
  hasAttachment: boolean;
};

export function parseZohoMailDetails(payload: unknown): ZohoMailDetails {
  const item = record(successData(payload));
  if (!item) throw new AdminMailError("ZOHO_UNAVAILABLE");
  const from = parseZohoAddressList(item.fromAddress)[0] ?? null;
  const sender = cleanText(item.sender, 200);
  return {
    folderId: zohoId(item.folderId),
    subject: cleanText(item.subject, MAX_SUBJECT),
    from: from ? { name: sender || from.name, address: from.address } : null,
    to: parseZohoAddressList(item.toAddress),
    cc: parseZohoAddressList(item.ccAddress),
    receivedAt: epochMs(item.receivedTime ?? item.receivedtime) ?? epochMs(item.sentDateInGMT),
    unread: isUnread(item.status),
    hasAttachment: flag(item.hasAttachment),
  };
}

export function parseZohoMailContent(payload: unknown): { kind: "html" | "text"; content: string } {
  const item = record(successData(payload));
  const content = text(item?.content);
  if (content === null) throw new AdminMailError("ZOHO_UNAVAILABLE");
  const bounded = content.slice(0, MAX_CONTENT_LENGTH);
  return { kind: isHtmlContent(bounded) ? "html" : "text", content: bounded };
}

export function parseZohoMailAttachments(payload: unknown): AdminMailAttachment[] {
  try {
    return parseZohoAttachments(payload).map((item) => ({
      attachmentId: item.providerAttachmentId,
      fileName: item.fileName,
      size: item.size,
      inline: item.inline,
    }));
  } catch (error) {
    if (error instanceof EmailProviderPayloadError && error.safeCode === "zoho_status_not_success") {
      throw new AdminMailError("ZOHO_REQUEST_REJECTED");
    }
    throw new AdminMailError("ZOHO_UNAVAILABLE");
  }
}

/** `entire:<text>` (Zoho search syntax), without the `::` / `:or:` combinators. */
export function zohoSearchKey(search: string) {
  const term = search.replace(/::|:or:/gi, " ").replace(/\s+/g, " ").trim().slice(0, ADMIN_MAIL_SEARCH_MAX_LENGTH);
  return term ? `entire:${term}` : null;
}

// -----------------------------------------------------------------------------
// Attachment policy (download goes through the action, never a Zoho URL)
// -----------------------------------------------------------------------------

const ATTACHMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  txt: "text/plain",
  csv: "text/csv",
  ics: "text/calendar",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  zip: "application/zip",
};

/** The download MIME type by extension, or null when the type is not allowed (html, svg, exe, js…). */
export function adminMailAttachmentMimeType(fileName: string) {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  return extension ? ATTACHMENT_TYPES[extension] ?? null : null;
}

// -----------------------------------------------------------------------------
// OAuth token endpoint
// -----------------------------------------------------------------------------

export type ZohoTokenSet = { accessToken: string; refreshToken: string | null; expiresInSeconds: number };

async function timedFetch(fetchImpl: FetchLike, url: string, init: RequestInit) {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    return await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function retryAfterSeconds(response: Response) {
  const ms = parseZohoHttpError({ status: response.status, retryAfter: response.headers.get("Retry-After") }).retryAfterMs;
  return ms === null ? null : Math.max(1, Math.ceil(ms / 1_000));
}

const CONFIG_ERRORS = new Set(["invalid_client", "invalid_client_secret", "invalid_redirect_uri", "unauthorized_client"]);

export function parseZohoTokenResponse(payload: unknown): ZohoTokenSet {
  const item = record(payload);
  if (!item) throw new AdminMailError("ZOHO_UNAVAILABLE");
  const error = text(item.error);
  if (error) {
    const description = text(item.error_description) ?? "";
    if (/too many requests/i.test(description) || /access denied/i.test(error)) throw new AdminMailError("ZOHO_RATE_LIMITED");
    throw new AdminMailError(CONFIG_ERRORS.has(error) ? "ZOHO_NOT_CONFIGURED" : "ZOHO_AUTH_REQUIRED");
  }
  const accessToken = text(item.access_token)?.trim();
  if (!accessToken) throw new AdminMailError("ZOHO_AUTH_REQUIRED");
  // Zoho sends seconds in expires_in (older responses: milliseconds + expires_in_sec).
  const raw = epochMs(item.expires_in_sec) ?? epochMs(item.expires_in) ?? 3_600;
  const seconds = raw > 86_400 ? Math.round(raw / 1_000) : raw;
  const refreshToken = text(item.refresh_token)?.trim();
  return { accessToken, refreshToken: refreshToken || null, expiresInSeconds: Math.min(Math.max(seconds, 60), 86_400) };
}

async function postToken(fetchImpl: FetchLike, params: Record<string, string>): Promise<ZohoTokenSet> {
  let response: Response;
  try {
    response = await timedFetch(fetchImpl, ZOHO_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
  } catch {
    throw new AdminMailError("ZOHO_UNAVAILABLE");
  }
  if (response.status === 429) throw new AdminMailError("ZOHO_RATE_LIMITED", retryAfterSeconds(response));
  if (response.status >= 500) throw new AdminMailError("ZOHO_UNAVAILABLE");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AdminMailError(response.ok ? "ZOHO_UNAVAILABLE" : "ZOHO_AUTH_REQUIRED");
  }
  return parseZohoTokenResponse(payload);
}

/** Authorization code → tokens. The code is single-use, so there is no retry. */
export async function exchangeZohoCode(args: {
  fetchImpl: FetchLike;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}) {
  const tokens = await postToken(args.fetchImpl, {
    grant_type: "authorization_code",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    code: args.code,
  });
  if (!tokens.refreshToken) throw new AdminMailError("ZOHO_AUTH_REQUIRED");
  return { ...tokens, refreshToken: tokens.refreshToken };
}

export function refreshZohoAccessToken(args: {
  fetchImpl: FetchLike;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  return postToken(args.fetchImpl, {
    grant_type: "refresh_token",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    refresh_token: args.refreshToken,
  });
}

/** Best effort: a failed revoke never blocks deleting the local connection. */
export async function revokeZohoToken(args: { fetchImpl: FetchLike; token: string }) {
  try {
    await timedFetch(args.fetchImpl, ZOHO_OAUTH_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: args.token }).toString(),
    });
    return true;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Mail API client
// -----------------------------------------------------------------------------

export type ZohoMailClientOptions = {
  fetchImpl: FetchLike;
  accessToken: string;
  /** The access token was obtained by a refresh in this same call (no second refresh). */
  refreshed: boolean;
  refreshAccessToken: () => Promise<string>;
  onAuthRequired: () => Promise<void>;
};

const INVALID_TOKEN_CODES = new Set(["INVALID_OAUTHTOKEN", "INVALID_TICKET", "OAUTH_TOKEN_EXPIRED"]);

export class ZohoMailClient {
  private accessToken: string;
  private refreshed: boolean;
  private readonly options: ZohoMailClientOptions;

  constructor(options: ZohoMailClientOptions) {
    this.options = options;
    this.accessToken = options.accessToken;
    this.refreshed = options.refreshed;
  }

  /**
   * 401 → one refresh, then auth_required; 429 → rate limited; 5xx/network →
   * one retry for idempotent calls (GET/PUT). A POST is never repeated after
   * it may have reached Zoho: network error or 5xx → `failure` (Z2 send:
   * ZOHO_SEND_UNCERTAIN). A 401 is safe to repeat (Zoho did not process it).
   */
  private async send(
    path: string,
    init: {
      method?: "GET" | "PUT" | "POST";
      body?: string | ArrayBuffer;
      contentType?: string;
      accept?: string;
      failure?: AdminMailErrorCode;
    } = {},
  ) {
    const method = init.method ?? "GET";
    const idempotent = method !== "POST";
    let retried = false;
    for (;;) {
      let response: Response;
      try {
        response = await timedFetch(this.options.fetchImpl, `${ZOHO_MAIL_EU_API_BASE_URL}${path}`, {
          method,
          headers: {
            Accept: init.accept ?? "application/json",
            ...(init.body !== undefined ? { "Content-Type": init.contentType ?? "application/json" } : {}),
            Authorization: `Zoho-oauthtoken ${this.accessToken}`,
          },
          body: init.body,
        });
      } catch {
        if (idempotent && !retried) {
          retried = true;
          continue;
        }
        throw new AdminMailError(init.failure ?? "ZOHO_UNAVAILABLE");
      }
      if (response.status === 401 || (response.status === 400 && (await this.isInvalidTokenBody(response)))) {
        if (this.refreshed) {
          await this.options.onAuthRequired();
          throw new AdminMailError("ZOHO_AUTH_REQUIRED");
        }
        this.refreshed = true;
        this.accessToken = await this.options.refreshAccessToken();
        continue;
      }
      if (response.status === 429) throw new AdminMailError("ZOHO_RATE_LIMITED", retryAfterSeconds(response));
      if (response.status >= 500) {
        if (idempotent && !retried) {
          retried = true;
          continue;
        }
        throw new AdminMailError(init.failure ?? "ZOHO_UNAVAILABLE");
      }
      if (!response.ok) throw new AdminMailError("ZOHO_REQUEST_REJECTED");
      return response;
    }
  }

  private async isInvalidTokenBody(response: Response) {
    try {
      const payload = record(parseZohoJson(await response.clone().text()));
      const code = text(record(payload?.data)?.errorCode);
      return code !== null && INVALID_TOKEN_CODES.has(code);
    } catch {
      return false;
    }
  }

  private async json(path: string, init?: { method?: "GET" | "PUT"; body?: string }) {
    const response = await this.send(path, init);
    try {
      return parseZohoJson(await response.text());
    } catch {
      throw new AdminMailError("ZOHO_UNAVAILABLE");
    }
  }

  async listAccounts() {
    return parseZohoMailAccounts(await this.json("/accounts"));
  }

  async listFolders(accountId: string) {
    return parseZohoMailFolders(await this.json(`/accounts/${requireZohoId(accountId)}/folders`));
  }

  async listMessages(args: { accountId: string; folderId: string; start: number; limit: number; unreadOnly: boolean }) {
    const params = new URLSearchParams({
      folderId: requireZohoId(args.folderId),
      start: String(args.start),
      limit: String(args.limit),
      status: args.unreadOnly ? "unread" : "all",
      sortBy: "date",
      sortorder: "false",
    });
    return parseZohoMailList(await this.json(`/accounts/${requireZohoId(args.accountId)}/messages/view?${params}`));
  }

  async searchMessages(args: { accountId: string; searchKey: string; start: number; limit: number }) {
    const params = new URLSearchParams({ searchKey: args.searchKey, start: String(args.start), limit: String(args.limit) });
    return parseZohoMailList(await this.json(`/accounts/${requireZohoId(args.accountId)}/messages/search?${params}`));
  }

  private messagePath(args: { accountId: string; folderId: string; messageId: string }) {
    return `/accounts/${requireZohoId(args.accountId)}/folders/${requireZohoId(args.folderId)}/messages/${requireZohoId(args.messageId)}`;
  }

  async getDetails(args: { accountId: string; folderId: string; messageId: string }) {
    return parseZohoMailDetails(await this.json(`${this.messagePath(args)}/details`));
  }

  async getContent(args: { accountId: string; folderId: string; messageId: string }) {
    return parseZohoMailContent(await this.json(`${this.messagePath(args)}/content?includeBlockContent=true`));
  }

  async getAttachments(args: { accountId: string; folderId: string; messageId: string }) {
    return parseZohoMailAttachments(await this.json(`${this.messagePath(args)}/attachmentinfo`));
  }

  async downloadAttachment(args: { accountId: string; folderId: string; messageId: string; attachmentId: string; maxBytes: number }) {
    const response = await this.send(`${this.messagePath(args)}/attachments/${requireZohoId(args.attachmentId)}`, {
      accept: "application/octet-stream",
    });
    const declared = Number(response.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > args.maxBytes) throw new AdminMailError("ZOHO_ATTACHMENT_BLOCKED");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > args.maxBytes) throw new AdminMailError("ZOHO_ATTACHMENT_BLOCKED");
    return bytes;
  }

  async markRead(args: { accountId: string; messageId: string }) {
    // The id is digits only (requireZohoId), written as a raw JSON number so a
    // 64-bit id is not rounded.
    const body = `{"mode":"markAsRead","messageId":[${requireZohoId(args.messageId)}]}`;
    successData(await this.json(`/accounts/${requireZohoId(args.accountId)}/updatemessage`, { method: "PUT", body }));
  }

  /** Z2 — Upload Attachment (raw binary). Nothing is sent yet, so a failure here is a definite "not sent". */
  async uploadAttachment(args: { accountId: string; fileName: string; bytes: ArrayBuffer }): Promise<ZohoUploadedAttachment> {
    const params = new URLSearchParams({ fileName: args.fileName });
    const response = await this.send(`/accounts/${requireZohoId(args.accountId)}/messages/attachments?${params}`, {
      method: "POST",
      body: args.bytes,
      contentType: "application/octet-stream",
    });
    let payload: unknown;
    try {
      payload = parseZohoJson(await response.text());
    } catch {
      throw new AdminMailError("ZOHO_UNAVAILABLE");
    }
    return parseZohoUploadResult(payload);
  }

  /**
   * Z2 — Send Email (POST …/messages) or Reply (POST …/messages/{id},
   * action "Reply"). Sent exactly once: anything after the request may have
   * reached Zoho (network error, timeout, 5xx, unreadable 2xx) is
   * ZOHO_SEND_UNCERTAIN and is never repeated here.
   */
  async sendMessage(args: { accountId: string; replyToMessageId?: string; message: ZohoOutgoingMessage }) {
    const accountId = requireZohoId(args.accountId);
    const path = args.replyToMessageId
      ? `/accounts/${accountId}/messages/${requireZohoId(args.replyToMessageId)}`
      : `/accounts/${accountId}/messages`;
    const body = JSON.stringify(args.replyToMessageId ? { ...args.message, action: "Reply" } : args.message);
    const response = await this.send(path, { method: "POST", body, failure: "ZOHO_SEND_UNCERTAIN" });
    let root: Json | null;
    try {
      root = record(parseZohoJson(await response.text()));
    } catch {
      throw new AdminMailError("ZOHO_SEND_UNCERTAIN");
    }
    const status = record(root?.status);
    if (!root || !status) throw new AdminMailError("ZOHO_SEND_UNCERTAIN");
    if (Number(status.code) !== 200) throw new AdminMailError("ZOHO_REQUEST_REJECTED");
    return { providerMessageId: zohoId(record(root.data)?.messageId) };
  }
}

export type ZohoUploadedAttachment = { storeName: string; attachmentPath: string; attachmentName: string };

export type ZohoOutgoingMessage = {
  fromAddress: string;
  toAddress: string;
  ccAddress?: string;
  bccAddress?: string;
  subject: string;
  content: string;
  mailFormat: "html";
  encoding: "UTF-8";
  askReceipt: "no";
  attachments?: ZohoUploadedAttachment[];
};

/** Upload Attachment answer: `data` is one object or a list with one object. */
export function parseZohoUploadResult(payload: unknown): ZohoUploadedAttachment {
  const data = successData(payload);
  const item = record(Array.isArray(data) ? data[0] : data);
  const storeName = text(item?.storeName)?.trim();
  const attachmentPath = text(item?.attachmentPath)?.trim();
  const attachmentName = text(item?.attachmentName)?.trim();
  if (!storeName || !attachmentPath || !attachmentName) throw new AdminMailError("ZOHO_UNAVAILABLE");
  return { storeName, attachmentPath, attachmentName };
}
