import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { requireAdmin } from "./lib/access";
import {
  ADMIN_MAIL_ATTACHMENT_MAX_BYTES,
  ADMIN_MAIL_BODY_MAX_LENGTH,
  ADMIN_MAIL_PAGE_SIZE_MAX,
  ADMIN_MAIL_SEND_FILE_MAX_BYTES,
  ADMIN_MAIL_SEND_MAX_ATTACHMENTS,
  ADMIN_MAIL_SEND_TOTAL_MAX_BYTES,
  ADMIN_MAIL_SIGNATURE_MAX_LENGTH,
  ADMIN_MAIL_SUBJECT_MAX_LENGTH,
  ADMIN_MAIL_UPLOAD_TTL_MS,
  adminMailComposeMode,
  adminMailFile,
  adminMailFolder,
  adminMailMessage,
  adminMailMessagePage,
  adminMailSendResult,
  adminMailSendStatus,
  adminMailStatus,
  isAdminMailErrorCode,
  type AdminMailErrorCode,
  type AdminMailSendResult,
  type AdminMailSendStatus,
} from "./lib/adminMailContract";
import { buildMailQuote, checkRecipients, composeSubject } from "./lib/adminMailCompose";
import { renderScanMeEmail, type ScanMeEmailQuote } from "../lib/email-template/scanme-email";
import {
  ADMIN_MAIL_KEY_VERSION,
  adminMailTokenAad,
  decodeAdminMailKey,
  decryptAdminMailSecret,
  encryptAdminMailSecret,
  importAdminMailKey,
  randomAdminMailState,
  sha256Hex,
  type AdminMailTokenPurpose,
} from "./lib/adminMailCrypto";
import {
  AdminMailError,
  ZOHO_MAIL_CLIENT_SCOPES,
  ZohoMailClient,
  adminMailAttachmentMimeType,
  buildZohoAuthorizeUrl,
  exchangeZohoCode,
  refreshZohoAccessToken,
  requireZohoId,
  revokeZohoToken,
  zohoSearchKey,
  type ZohoUploadedAttachment,
} from "./lib/zohoMailClient";

// Admin UX Z1 — Pošta: each admin connects their OWN Zoho EU mailbox and
// reads it live (ADMIN-UX-ZAHTEVI §10, §12.5; A0 plan "Z1"). Separate from
// the ADMIN-09B CRM ingest (emailProviderFoundation.ts, one integration
// account), which is not touched.
//
// - Access: every function starts with requireAdmin (actions through an
//   internal query/mutation, where the caller's auth is the same) and then
//   checks connection.ownerUserId === admin._id. Another admin's connection
//   answers ZOHO_CONNECTION_NOT_FOUND, exactly like a missing one.
// - Switch: without ZOHO_MAIL_CLIENT_ENABLED="true", a 32-byte key, the client
//   id/secret and the redirect URI everything answers ZOHO_NOT_CONFIGURED
//   before any network call. Only disconnect still works (local delete).
// - Tokens: the refresh token (and the cached access token) are AES-GCM
//   ciphertext bound to owner + mailbox + purpose; they never appear in a
//   return value, a log, an error or a URL.
// - Storage: only the connection, its accounts and the one-time OAuth states.
//   Folders, lists, messages and attachments are fetched live per call.
// - Z2 (sending): the mailbox signature, compose attachments waiting in
//   Convex storage (deleted after sending or 2 h) and one row per send
//   attempt without body, subject or recipients. See sendMail.

const STATE_TTL_MS = 10 * 60 * 1_000;
const ACCESS_TOKEN_MARGIN_MS = 60 * 1_000;
const MAX_CONNECTIONS = 10;
const MAX_ACCOUNTS_PER_CONNECTION = 20;
const MAX_ACCOUNTS_PER_OWNER = MAX_CONNECTIONS * MAX_ACCOUNTS_PER_CONNECTION;
const STATE_CLEANUP_BATCH = 20;
const MAX_LIST_START = 100_000;
const CHUNK_BYTES = 512 * 1024;
const CALLBACK_PATH = "/api/admin/posta/callback";

function mailError(code: AdminMailErrorCode, retryAfterSeconds?: number | null): never {
  throw new ConvexError(retryAfterSeconds ? { code, retryAfterSeconds } : { code });
}

// -----------------------------------------------------------------------------
// Configuration (Convex env; names in .env.example, values never in the repo)
// -----------------------------------------------------------------------------

type MailConfig = { clientId: string; clientSecret: string; redirectUri: string; key: Uint8Array };

function mailSwitchOn() {
  return env.ZOHO_MAIL_CLIENT_ENABLED === "true";
}

/** https (or http on localhost) and exactly the Next callback route. */
function validRedirectUri(raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.search || url.hash || url.pathname.replace(/\/$/, "") !== CALLBACK_PATH) return null;
    return value;
  } catch {
    return null;
  }
}

function readMailConfig(): MailConfig | null {
  if (!mailSwitchOn()) return null;
  const key = decodeAdminMailKey(env.ZOHO_TOKEN_ENCRYPTION_KEY);
  const clientId = env.ZOHO_MAIL_CLIENT_ID?.trim();
  const clientSecret = env.ZOHO_MAIL_CLIENT_SECRET?.trim();
  const redirectUri = validRedirectUri(env.ZOHO_MAIL_REDIRECT_URI);
  if (!key || !clientId || !clientSecret || !redirectUri) return null;
  return { key, clientId, clientSecret, redirectUri };
}

function requireMailConfig() {
  return readMailConfig() ?? mailError("ZOHO_NOT_CONFIGURED");
}

/** Provider errors become stable codes; nothing else (no token, no URL) leaves the action. */
async function withMailErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    if (error instanceof AdminMailError) mailError(error.code, error.retryAfterSeconds);
    console.error("admin_mail_unexpected", error instanceof Error ? error.name : "unknown");
    mailError("ZOHO_UNAVAILABLE");
  }
}

function zohoIdArg(value: string) {
  try {
    return requireZohoId(value);
  } catch {
    mailError("ZOHO_REQUEST_REJECTED");
  }
}

// -----------------------------------------------------------------------------
// Owner checks
// -----------------------------------------------------------------------------

async function requireOwnConnection(ctx: MutationCtx, connectionId: Id<"adminMailConnections">) {
  const admin = await requireAdmin(ctx);
  const connection = await ctx.db.get(connectionId);
  if (!connection || connection.ownerUserId !== admin._id) mailError("ZOHO_CONNECTION_NOT_FOUND");
  return connection;
}

async function deleteAccounts(ctx: MutationCtx, connectionId: Id<"adminMailConnections">) {
  const accounts = await ctx.db
    .query("adminMailAccounts")
    .withIndex("by_connectionId", (q) => q.eq("connectionId", connectionId))
    .take(MAX_ACCOUNTS_PER_CONNECTION * 2);
  for (const account of accounts) await ctx.db.delete(account._id);
}

// -----------------------------------------------------------------------------
// Public: status and the start of the OAuth flow
// -----------------------------------------------------------------------------

/** The admin's own connections and accounts (no token, no ciphertext) and the switch state. */
export const getMailStatus = query({
  args: {},
  returns: adminMailStatus,
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const connections = await ctx.db
      .query("adminMailConnections")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", admin._id))
      .take(MAX_CONNECTIONS);
    const accounts = await ctx.db
      .query("adminMailAccounts")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", admin._id))
      .take(MAX_ACCOUNTS_PER_OWNER);
    return {
      enabled: mailSwitchOn(),
      configured: readMailConfig() !== null,
      connections: connections.map((connection) => ({
        connectionId: connection._id,
        primaryEmail: connection.primaryEmail,
        status: connection.status,
        lastErrorCode: connection.lastErrorCode ?? null,
        connectedAt: connection.connectedAt,
        accounts: accounts
          .filter((account) => account.connectionId === connection._id)
          .map((account) => ({
            accountId: account.zohoAccountId,
            emailAddress: account.emailAddress,
            displayName: account.displayName ?? null,
            isDefault: account.isDefault,
            signatureText: account.signatureText ?? null,
          })),
      })),
    };
  },
});

/** A one-time `state` (10 min, bound to this admin; only its hash is stored) and the EU authorize URL. */
export const startZohoConnect = mutation({
  args: {},
  returns: v.object({ authorizeUrl: v.string() }),
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const config = requireMailConfig();
    const now = Date.now();
    const oldest = await ctx.db
      .query("adminMailOAuthStates")
      .withIndex("by_ownerUserId_and_createdAt", (q) => q.eq("ownerUserId", admin._id))
      .take(STATE_CLEANUP_BATCH);
    for (const row of oldest) {
      if (row.usedAt !== undefined || row.expiresAt <= now) await ctx.db.delete(row._id);
    }
    const state = randomAdminMailState();
    await ctx.db.insert("adminMailOAuthStates", {
      ownerUserId: admin._id,
      stateHash: await sha256Hex(state),
      expiresAt: now + STATE_TTL_MS,
      createdAt: now,
    });
    return { authorizeUrl: buildZohoAuthorizeUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state }) };
  },
});

// -----------------------------------------------------------------------------
// Internal: state, connection storage and the token cache
// -----------------------------------------------------------------------------

/** Valid only for the admin who started it, before expiry, once. */
export const consumeOAuthState = internalMutation({
  args: { stateHash: v.string() },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const row = await ctx.db
      .query("adminMailOAuthStates")
      .withIndex("by_stateHash", (q) => q.eq("stateHash", args.stateHash))
      .unique();
    if (!row || row.ownerUserId !== admin._id || row.usedAt !== undefined || row.expiresAt <= now) {
      mailError("ZOHO_STATE_INVALID");
    }
    await ctx.db.patch(row._id, { usedAt: now });
    return admin._id;
  },
});

/** Upsert of the admin's connection for one Zoho mailbox (by primary email) and its accounts. */
export const saveConnection = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    primaryEmail: v.string(),
    refreshTokenCiphertext: v.string(),
    refreshTokenIv: v.string(),
    accessTokenCiphertext: v.string(),
    accessTokenIv: v.string(),
    accessTokenExpiresAt: v.number(),
    scopes: v.array(v.string()),
    accounts: v.array(v.object({ accountId: v.string(), emailAddress: v.string(), displayName: v.union(v.string(), v.null()) })),
  },
  returns: v.id("adminMailConnections"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.ownerUserId !== admin._id) mailError("ZOHO_STATE_INVALID");
    if (args.accounts.length === 0 || args.accounts.length > MAX_ACCOUNTS_PER_CONNECTION) mailError("ZOHO_NO_MAILBOX");
    const now = Date.now();
    const tokens = {
      status: "active" as const,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      refreshTokenIv: args.refreshTokenIv,
      keyVersion: ADMIN_MAIL_KEY_VERSION,
      accessTokenCiphertext: args.accessTokenCiphertext,
      accessTokenIv: args.accessTokenIv,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      scopes: args.scopes,
      lastErrorCode: undefined,
      connectedAt: now,
      updatedAt: now,
    };
    const existing = await ctx.db
      .query("adminMailConnections")
      .withIndex("by_ownerUserId_and_primaryEmail", (q) => q.eq("ownerUserId", admin._id).eq("primaryEmail", args.primaryEmail))
      .unique();
    let connectionId: Id<"adminMailConnections">;
    // Z2: a reconnect keeps each mailbox's signature.
    const signatures = new Map<string, string>();
    if (existing) {
      connectionId = existing._id;
      await ctx.db.patch(connectionId, tokens);
      const previous = await ctx.db
        .query("adminMailAccounts")
        .withIndex("by_connectionId", (q) => q.eq("connectionId", existing._id))
        .take(MAX_ACCOUNTS_PER_CONNECTION * 2);
      for (const account of previous) if (account.signatureText) signatures.set(account.zohoAccountId, account.signatureText);
      await deleteAccounts(ctx, connectionId);
    } else {
      const owned = await ctx.db
        .query("adminMailConnections")
        .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", admin._id))
        .take(MAX_CONNECTIONS);
      if (owned.length >= MAX_CONNECTIONS) mailError("ZOHO_REQUEST_REJECTED");
      connectionId = await ctx.db.insert("adminMailConnections", {
        ownerUserId: admin._id,
        provider: "zoho",
        region: "eu",
        primaryEmail: args.primaryEmail,
        ...tokens,
      });
    }
    for (const [index, account] of args.accounts.entries()) {
      const signatureText = signatures.get(account.accountId);
      await ctx.db.insert("adminMailAccounts", {
        connectionId,
        ownerUserId: admin._id,
        zohoAccountId: account.accountId,
        emailAddress: account.emailAddress,
        ...(account.displayName ? { displayName: account.displayName } : {}),
        isDefault: index === 0,
        ...(signatureText ? { signatureText } : {}),
      });
    }
    return connectionId;
  },
});

/** The caller's own connection (ciphertext only; it never leaves the action). */
export const connectionForAction = internalQuery({
  args: { connectionId: v.id("adminMailConnections"), zohoAccountId: v.optional(v.string()) },
  returns: v.object({
    ownerUserId: v.id("users"),
    primaryEmail: v.string(),
    status: v.union(v.literal("active"), v.literal("auth_required")),
    refreshTokenCiphertext: v.string(),
    refreshTokenIv: v.string(),
    accessTokenCiphertext: v.union(v.string(), v.null()),
    accessTokenIv: v.union(v.string(), v.null()),
    accessTokenExpiresAt: v.union(v.number(), v.null()),
    // Z2: the granted scopes (send needs ZohoMail.messages.CREATE) and the
    // requested mailbox (its address is the only allowed fromAddress).
    scopes: v.array(v.string()),
    account: v.union(v.object({ emailAddress: v.string(), signatureText: v.union(v.string(), v.null()) }), v.null()),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.ownerUserId !== admin._id) mailError("ZOHO_CONNECTION_NOT_FOUND");
    let account: { emailAddress: string; signatureText: string | null } | null = null;
    if (args.zohoAccountId !== undefined) {
      const accounts = await ctx.db
        .query("adminMailAccounts")
        .withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id))
        .take(MAX_ACCOUNTS_PER_CONNECTION * 2);
      const found = accounts.find((item) => item.zohoAccountId === args.zohoAccountId);
      if (!found) mailError("ZOHO_CONNECTION_NOT_FOUND");
      account = { emailAddress: found.emailAddress, signatureText: found.signatureText ?? null };
    }
    return {
      ownerUserId: connection.ownerUserId,
      primaryEmail: connection.primaryEmail,
      status: connection.status,
      refreshTokenCiphertext: connection.refreshTokenCiphertext,
      refreshTokenIv: connection.refreshTokenIv,
      accessTokenCiphertext: connection.accessTokenCiphertext ?? null,
      accessTokenIv: connection.accessTokenIv ?? null,
      accessTokenExpiresAt: connection.accessTokenExpiresAt ?? null,
      scopes: connection.scopes,
      account,
    };
  },
});

export const cacheAccessToken = internalMutation({
  args: { connectionId: v.id("adminMailConnections"), ciphertext: v.string(), iv: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnConnection(ctx, args.connectionId);
    await ctx.db.patch(args.connectionId, {
      accessTokenCiphertext: args.ciphertext,
      accessTokenIv: args.iv,
      accessTokenExpiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** 401 after one refresh, a rejected refresh token or an undecryptable record: reconnect needed. */
export const markAuthRequired = internalMutation({
  args: { connectionId: v.id("adminMailConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnConnection(ctx, args.connectionId);
    await ctx.db.patch(args.connectionId, {
      status: "auth_required",
      accessTokenCiphertext: undefined,
      accessTokenIv: undefined,
      accessTokenExpiresAt: undefined,
      lastErrorCode: "ZOHO_AUTH_REQUIRED",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Deletes the connection, its tokens and its accounts. */
export const deleteConnection = internalMutation({
  args: { connectionId: v.id("adminMailConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnConnection(ctx, args.connectionId);
    await deleteAccounts(ctx, args.connectionId);
    await ctx.db.delete(args.connectionId);
    return null;
  },
});

// -----------------------------------------------------------------------------
// Actions (live Zoho calls)
// -----------------------------------------------------------------------------

/** Return of connectionForAction (written out: the module's own api type cannot describe itself). */
type OwnedConnection = {
  ownerUserId: Id<"users">;
  primaryEmail: string;
  status: "active" | "auth_required";
  refreshTokenCiphertext: string;
  refreshTokenIv: string;
  accessTokenCiphertext: string | null;
  accessTokenIv: string | null;
  accessTokenExpiresAt: number | null;
  scopes: string[];
  account: { emailAddress: string; signatureText: string | null } | null;
};

/** A client for the caller's own connection: cached access token, else one refresh. */
async function openMailbox(
  ctx: ActionCtx,
  args: { connectionId: Id<"adminMailConnections">; accountId?: string },
): Promise<ZohoMailClient> {
  return (await openMailboxSession(ctx, args)).client;
}

/** The client plus the owner-checked connection (scopes, mailbox address and signature). */
async function openMailboxSession(
  ctx: ActionCtx,
  args: { connectionId: Id<"adminMailConnections">; accountId?: string },
): Promise<{ client: ZohoMailClient; connection: OwnedConnection }> {
  const config = requireMailConfig();
  const connection: OwnedConnection = await ctx.runQuery(internal.adminMail.connectionForAction, {
    connectionId: args.connectionId,
    zohoAccountId: args.accountId,
  });
  if (connection.status !== "active") mailError("ZOHO_AUTH_REQUIRED");
  const key = await importAdminMailKey(config.key);
  const aad = (purpose: AdminMailTokenPurpose) =>
    adminMailTokenAad({ ownerUserId: connection.ownerUserId, primaryEmail: connection.primaryEmail, purpose });
  const markAuthRequired = async () => {
    await ctx.runMutation(internal.adminMail.markAuthRequired, { connectionId: args.connectionId });
  };
  const refresh = async () => {
    let refreshToken: string;
    try {
      refreshToken = await decryptAdminMailSecret(
        key,
        { ciphertext: connection.refreshTokenCiphertext, iv: connection.refreshTokenIv },
        aad("refresh"),
      );
    } catch {
      await markAuthRequired();
      throw new AdminMailError("ZOHO_AUTH_REQUIRED");
    }
    try {
      const tokens = await refreshZohoAccessToken({
        fetchImpl: fetch,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken,
      });
      const sealed = await encryptAdminMailSecret(key, tokens.accessToken, aad("access"));
      await ctx.runMutation(internal.adminMail.cacheAccessToken, {
        connectionId: args.connectionId,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        expiresAt: Date.now() + tokens.expiresInSeconds * 1_000,
      });
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof AdminMailError && error.code === "ZOHO_AUTH_REQUIRED") await markAuthRequired();
      throw error;
    }
  };
  let accessToken: string | null = null;
  if (
    connection.accessTokenCiphertext &&
    connection.accessTokenIv &&
    connection.accessTokenExpiresAt !== null &&
    connection.accessTokenExpiresAt - ACCESS_TOKEN_MARGIN_MS > Date.now()
  ) {
    try {
      accessToken = await decryptAdminMailSecret(
        key,
        { ciphertext: connection.accessTokenCiphertext, iv: connection.accessTokenIv },
        aad("access"),
      );
    } catch {
      accessToken = null;
    }
  }
  const refreshed = accessToken === null;
  const client = new ZohoMailClient({
    fetchImpl: fetch,
    accessToken: accessToken ?? (await refresh()),
    refreshed,
    refreshAccessToken: refresh,
    onAuthRequired: markAuthRequired,
  });
  return { client, connection };
}

/** Callback step: consume the state, exchange the code (EU), read the accounts, store the encrypted tokens. */
export const completeZohoConnect = action({
  args: { code: v.string(), state: v.string() },
  returns: v.object({ primaryEmail: v.string(), accounts: v.number() }),
  handler: (ctx, args) =>
    withMailErrors(async () => {
      const config = requireMailConfig();
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(args.state)) mailError("ZOHO_STATE_INVALID");
      if (!/^[\x21-\x7e]{1,1024}$/.test(args.code)) mailError("ZOHO_AUTH_REQUIRED");
      const ownerUserId: Id<"users"> = await ctx.runMutation(internal.adminMail.consumeOAuthState, {
        stateHash: await sha256Hex(args.state),
      });
      const tokens = await exchangeZohoCode({
        fetchImpl: fetch,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
        code: args.code,
      });
      try {
        const client = new ZohoMailClient({
          fetchImpl: fetch,
          accessToken: tokens.accessToken,
          refreshed: true,
          refreshAccessToken: async () => {
            throw new AdminMailError("ZOHO_AUTH_REQUIRED");
          },
          onAuthRequired: async () => {},
        });
        const accounts = await client.listAccounts();
        if (accounts.length === 0) mailError("ZOHO_NO_MAILBOX");
        const primaryEmail = accounts[0].emailAddress;
        const key = await importAdminMailKey(config.key);
        const binding = { ownerUserId, primaryEmail };
        const refresh = await encryptAdminMailSecret(key, tokens.refreshToken, adminMailTokenAad({ ...binding, purpose: "refresh" }));
        const access = await encryptAdminMailSecret(key, tokens.accessToken, adminMailTokenAad({ ...binding, purpose: "access" }));
        await ctx.runMutation(internal.adminMail.saveConnection, {
          ownerUserId,
          primaryEmail,
          refreshTokenCiphertext: refresh.ciphertext,
          refreshTokenIv: refresh.iv,
          accessTokenCiphertext: access.ciphertext,
          accessTokenIv: access.iv,
          accessTokenExpiresAt: Date.now() + tokens.expiresInSeconds * 1_000,
          scopes: [...ZOHO_MAIL_CLIENT_SCOPES],
          accounts,
        });
        return { primaryEmail, accounts: accounts.length };
      } catch (error) {
        // Nothing was stored: do not leave a live grant behind at Zoho.
        await revokeZohoToken({ fetchImpl: fetch, token: tokens.refreshToken });
        throw error;
      }
    }),
});

const mailboxArgs = { connectionId: v.id("adminMailConnections"), accountId: v.string() };
const messageArgs = { ...mailboxArgs, folderId: v.string(), messageId: v.string() };

export const listFolders = action({
  args: mailboxArgs,
  returns: v.array(adminMailFolder),
  handler: (ctx, args) =>
    withMailErrors(async () => {
      requireMailConfig();
      zohoIdArg(args.accountId);
      return (await openMailbox(ctx, args)).listFolders(args.accountId);
    }),
});

/** One page (newest first). With `search`, Zoho searches the whole mailbox (`entire:`), not one folder. */
export const listMessages = action({
  args: {
    ...mailboxArgs,
    folderId: v.string(),
    start: v.number(),
    limit: v.number(),
    unreadOnly: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  returns: adminMailMessagePage,
  handler: (ctx, args) =>
    withMailErrors(async () => {
      requireMailConfig();
      zohoIdArg(args.accountId);
      zohoIdArg(args.folderId);
      if (
        !Number.isInteger(args.start) || args.start < 1 || args.start > MAX_LIST_START ||
        !Number.isInteger(args.limit) || args.limit < 1 || args.limit > ADMIN_MAIL_PAGE_SIZE_MAX
      ) mailError("ZOHO_REQUEST_REJECTED");
      const searchKey = args.search ? zohoSearchKey(args.search) : null;
      const client = await openMailbox(ctx, args);
      // One extra row tells whether a next page exists.
      const rows = searchKey
        ? await client.searchMessages({ accountId: args.accountId, searchKey, start: args.start, limit: args.limit + 1 })
        : await client.listMessages({
            accountId: args.accountId,
            folderId: args.folderId,
            start: args.start,
            limit: args.limit + 1,
            unreadOnly: args.unreadOnly === true,
          });
      return { messages: rows.slice(0, args.limit), hasMore: rows.length > args.limit };
    }),
});

/** Headers, body and attachment metadata of one message (live; nothing is stored). */
export const getMessage = action({
  args: messageArgs,
  returns: adminMailMessage,
  handler: (ctx, args) =>
    withMailErrors(async () => {
      requireMailConfig();
      for (const id of [args.accountId, args.folderId, args.messageId]) zohoIdArg(id);
      const client = await openMailbox(ctx, args);
      const details = await client.getDetails(args);
      const body = await client.getContent(args);
      const attachments = details.hasAttachment ? await client.getAttachments(args) : [];
      return {
        messageId: args.messageId,
        folderId: details.folderId ?? args.folderId,
        subject: details.subject,
        from: details.from,
        to: details.to,
        cc: details.cc,
        receivedAt: details.receivedAt,
        unread: details.unread,
        body,
        attachments,
      };
    }),
});

function chunkBytes(bytes: ArrayBuffer) {
  const chunks: ArrayBuffer[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
    chunks.push(bytes.slice(offset, offset + CHUNK_BYTES));
  }
  return chunks;
}

/** One attachment through the action: ≤ 7 MB and an allowed type (by extension); never a Zoho URL. */
export const downloadAttachment = action({
  args: { ...messageArgs, attachmentId: v.string() },
  returns: adminMailFile,
  handler: (ctx, args) =>
    withMailErrors(async () => {
      requireMailConfig();
      for (const id of [args.accountId, args.folderId, args.messageId, args.attachmentId]) zohoIdArg(id);
      const client = await openMailbox(ctx, args);
      const info = (await client.getAttachments(args)).find((item) => item.attachmentId === args.attachmentId);
      if (!info) mailError("ZOHO_REQUEST_REJECTED");
      const mimeType = adminMailAttachmentMimeType(info.fileName);
      if (!mimeType || info.size > ADMIN_MAIL_ATTACHMENT_MAX_BYTES) mailError("ZOHO_ATTACHMENT_BLOCKED");
      const bytes = await client.downloadAttachment({ ...args, maxBytes: ADMIN_MAIL_ATTACHMENT_MAX_BYTES });
      return {
        fileName: info.fileName.replace(/[\\/\u0000-\u001f\u007f]/g, "_"),
        mimeType,
        chunks: chunkBytes(bytes),
      };
    }),
});

/** Explicit "Označi kao pročitano" of the owner (the ingest account never marks; A0 R5). */
export const markRead = action({
  args: { ...mailboxArgs, messageId: v.string() },
  returns: v.null(),
  handler: (ctx, args) =>
    withMailErrors(async () => {
      requireMailConfig();
      zohoIdArg(args.accountId);
      zohoIdArg(args.messageId);
      await (await openMailbox(ctx, args)).markRead(args);
      return null;
    }),
});

/** Deletes the connection, its tokens and accounts (UI confirms first). Revokes at Zoho only when configured. */
export const disconnect = action({
  args: { connectionId: v.id("adminMailConnections") },
  returns: v.null(),
  handler: (ctx, args) =>
    withMailErrors(async () => {
      const connection: OwnedConnection = await ctx.runQuery(internal.adminMail.connectionForAction, {
        connectionId: args.connectionId,
      });
      const config = readMailConfig();
      if (config) {
        try {
          const key = await importAdminMailKey(config.key);
          const refreshToken = await decryptAdminMailSecret(
            key,
            { ciphertext: connection.refreshTokenCiphertext, iv: connection.refreshTokenIv },
            adminMailTokenAad({ ownerUserId: connection.ownerUserId, primaryEmail: connection.primaryEmail, purpose: "refresh" }),
          );
          await revokeZohoToken({ fetchImpl: fetch, token: refreshToken });
        } catch {
          // A token that no longer decrypts cannot be revoked; the local delete still happens.
        }
      }
      await ctx.runMutation(internal.adminMail.deleteConnection, { connectionId: args.connectionId });
      return null;
    }),
});

// -----------------------------------------------------------------------------
// Z2 — signature, attachments and sending
// -----------------------------------------------------------------------------

const UPLOADS_PER_OWNER = 30;
const SEND_COMMAND_ID = /^[A-Za-z0-9_-]{16,80}$/;
const SEND_SCOPE = "ZohoMail.messages.CREATE";

/** Signature of one own mailbox (plain text with [links](…)); empty text removes it. Local data: no switch needed. */
export const updateSignature = mutation({
  args: { connectionId: v.id("adminMailConnections"), accountId: v.string(), signatureText: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await requireOwnConnection(ctx, args.connectionId);
    const signatureText = args.signatureText.replace(/\r\n?/g, "\n").trim();
    if (signatureText.length > ADMIN_MAIL_SIGNATURE_MAX_LENGTH) mailError("ZOHO_COMPOSE_INVALID");
    const accounts = await ctx.db
      .query("adminMailAccounts")
      .withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id))
      .take(MAX_ACCOUNTS_PER_CONNECTION * 2);
    const account = accounts.find((item) => item.zohoAccountId === args.accountId);
    if (!account) mailError("ZOHO_CONNECTION_NOT_FOUND");
    await ctx.db.patch(account._id, { signatureText: signatureText || undefined });
    return null;
  },
});

async function deleteUpload(ctx: MutationCtx, upload: Doc<"adminMailUploads">) {
  try {
    await ctx.storage.delete(upload.storageId);
  } catch {
    // Already gone from storage: the row is still removed.
  }
  await ctx.db.delete(upload._id);
}

/** Upload URL for one compose attachment (Convex storage; registerMailUpload checks it next). */
export const generateMailUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    requireMailConfig();
    return await ctx.storage.generateUploadUrl();
  },
});

function cleanFileName(raw: string) {
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  // keep the end: the extension decides the type
  return base.replace(/[\u0000-\u001f\u007f"<>]/g, "").trim().slice(-180);
}

/**
 * Binds an uploaded file to the admin: allowed type (by extension), at most
 * 10 MB, at most 30 waiting files. A rejected file is deleted at once; an
 * accepted one is deleted after sending or after 2 h.
 */
export const registerMailUpload = mutation({
  args: { storageId: v.id("_storage"), fileName: v.string() },
  returns: v.union(
    v.object({ status: v.literal("ready"), uploadId: v.id("adminMailUploads"), fileName: v.string(), size: v.number(), mimeType: v.string() }),
    v.object({ status: v.literal("rejected"), code: v.string() }),
  ),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    requireMailConfig();
    const claimed = await ctx.db
      .query("adminMailUploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (claimed) {
      return claimed.ownerUserId === admin._id
        ? { status: "ready" as const, uploadId: claimed._id, fileName: claimed.fileName, size: claimed.size, mimeType: claimed.mimeType }
        : { status: "rejected" as const, code: "ZOHO_ATTACHMENT_BLOCKED" };
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) return { status: "rejected" as const, code: "ZOHO_ATTACHMENT_BLOCKED" };
    const fileName = cleanFileName(args.fileName);
    const mimeType = fileName ? adminMailAttachmentMimeType(fileName) : null;
    const waiting = await ctx.db
      .query("adminMailUploads")
      .withIndex("by_ownerUserId_and_createdAt", (q) => q.eq("ownerUserId", admin._id))
      .take(UPLOADS_PER_OWNER);
    if (!mimeType || metadata.size <= 0 || metadata.size > ADMIN_MAIL_SEND_FILE_MAX_BYTES || waiting.length >= UPLOADS_PER_OWNER) {
      await ctx.storage.delete(args.storageId);
      return { status: "rejected" as const, code: "ZOHO_ATTACHMENT_BLOCKED" };
    }
    const now = Date.now();
    const uploadId = await ctx.db.insert("adminMailUploads", {
      ownerUserId: admin._id,
      storageId: args.storageId,
      fileName,
      size: metadata.size,
      mimeType,
      createdAt: now,
      expiresAt: now + ADMIN_MAIL_UPLOAD_TTL_MS,
    });
    await ctx.scheduler.runAfter(ADMIN_MAIL_UPLOAD_TTL_MS, internal.adminMail.expireMailUpload, { uploadId });
    return { status: "ready" as const, uploadId, fileName, size: metadata.size, mimeType };
  },
});

/** Removes an own waiting attachment (chip removed or compose discarded). */
export const removeMailUpload = mutation({
  args: { uploadId: v.id("adminMailUploads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (upload && upload.ownerUserId === admin._id) await deleteUpload(ctx, upload);
    return null;
  },
});

export const expireMailUpload = internalMutation({
  args: { uploadId: v.id("adminMailUploads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (upload) await deleteUpload(ctx, upload);
    return null;
  },
});

/** Recipient suggestions from the existing client contacts (read only; active contacts, email prefix, at most 8). */
export const suggestRecipients = query({
  args: { prefix: v.string() },
  returns: v.array(v.object({ email: v.string(), name: v.string() })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const prefix = args.prefix.trim().toLowerCase();
    if (prefix.length < 2 || prefix.length > 64) return [];
    const rows = await ctx.db
      .query("accountContacts")
      .withIndex("by_normalizedEmail", (q) => q.gte("normalizedEmail", prefix).lt("normalizedEmail", `${prefix}￿`))
      .take(8);
    return rows
      .filter((row) => row.status === "active" && row.normalizedEmail)
      .map((row) => ({ email: row.normalizedEmail!, name: `${row.firstName} ${row.lastName}`.trim() }));
  },
});

/** The outcome of one own send attempt (for the UI after a lost connection: no blind resend). */
export const getSendCommand = query({
  args: { sendCommandId: v.string() },
  returns: v.union(v.object({ status: adminMailSendStatus, errorCode: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const row = await ctx.db
      .query("adminMailSendCommands")
      .withIndex("by_ownerUserId_and_sendCommandId", (q) => q.eq("ownerUserId", admin._id).eq("sendCommandId", args.sendCommandId))
      .unique();
    return row ? { status: row.status, errorCode: row.errorCode ?? null } : null;
  },
});

/** One sendCommandId = one attempt. A second call with it only reads the stored outcome. */
export const claimSendCommand = internalMutation({
  args: {
    sendCommandId: v.string(),
    connectionId: v.id("adminMailConnections"),
    zohoAccountId: v.string(),
    mode: adminMailComposeMode,
  },
  returns: v.union(
    v.object({ claimed: v.literal(true) }),
    v.object({ claimed: v.literal(false), status: adminMailSendStatus, errorCode: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, args) => {
    const connection = await requireOwnConnection(ctx, args.connectionId);
    const accounts = await ctx.db
      .query("adminMailAccounts")
      .withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id))
      .take(MAX_ACCOUNTS_PER_CONNECTION * 2);
    if (!accounts.some((account) => account.zohoAccountId === args.zohoAccountId)) mailError("ZOHO_CONNECTION_NOT_FOUND");
    const existing = await ctx.db
      .query("adminMailSendCommands")
      .withIndex("by_ownerUserId_and_sendCommandId", (q) => q.eq("ownerUserId", connection.ownerUserId).eq("sendCommandId", args.sendCommandId))
      .unique();
    if (existing) return { claimed: false as const, status: existing.status, errorCode: existing.errorCode ?? null };
    const now = Date.now();
    await ctx.db.insert("adminMailSendCommands", {
      ownerUserId: connection.ownerUserId,
      connectionId: connection._id,
      zohoAccountId: args.zohoAccountId,
      sendCommandId: args.sendCommandId,
      mode: args.mode,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return { claimed: true as const };
  },
});

export const updateSendCommand = internalMutation({
  args: {
    sendCommandId: v.string(),
    status: adminMailSendStatus,
    errorCode: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const row = await ctx.db
      .query("adminMailSendCommands")
      .withIndex("by_ownerUserId_and_sendCommandId", (q) => q.eq("ownerUserId", admin._id).eq("sendCommandId", args.sendCommandId))
      .unique();
    if (!row) mailError("ZOHO_REQUEST_REJECTED");
    await ctx.db.patch(row._id, {
      status: args.status,
      ...(args.errorCode ? { errorCode: args.errorCode } : {}),
      ...(args.providerMessageId ? { providerMessageId: args.providerMessageId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** The admin's own waiting attachments of this message (a foreign or expired id refuses the send). */
export const uploadsForSend = internalQuery({
  args: { uploadIds: v.array(v.id("adminMailUploads")) },
  returns: v.array(v.object({ storageId: v.id("_storage"), fileName: v.string(), size: v.number() })),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const uploads: { storageId: Id<"_storage">; fileName: string; size: number }[] = [];
    for (const uploadId of args.uploadIds.slice(0, ADMIN_MAIL_SEND_MAX_ATTACHMENTS)) {
      const upload = await ctx.db.get(uploadId);
      if (!upload || upload.ownerUserId !== admin._id) mailError("ZOHO_ATTACHMENT_BLOCKED");
      uploads.push({ storageId: upload.storageId, fileName: upload.fileName, size: upload.size });
    }
    return uploads;
  },
});

export const discardUploads = internalMutation({
  args: { uploadIds: v.array(v.id("adminMailUploads")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    for (const uploadId of args.uploadIds.slice(0, ADMIN_MAIL_SEND_MAX_ATTACHMENTS)) {
      const upload = await ctx.db.get(uploadId);
      if (upload && upload.ownerUserId === admin._id) await deleteUpload(ctx, upload);
    }
    return null;
  },
});

/**
 * New message, reply, reply-all or forward from the admin's own mailbox
 * (fromAddress is always that mailbox). Every message is the ScanMe template
 * (lib/email-template/scanme-email.ts) with the mailbox signature; a reply or
 * forward quotes the original server-side, as escaped text.
 *
 * Idempotent (ADMIN-09B outbox pattern): the claim stores `pending`, the
 * attachments go Convex storage → Zoho upload, `sending` is stored right
 * before the one POST, and the outcome is `sent`, `failed` (Zoho did not take
 * it) or `needs_reconciliation` (the POST may have been accepted: never
 * repeated; the admin checks Sent). Temporary files are deleted after `sent`
 * and `needs_reconciliation`; after `failed` they stay (2 h) for a new attempt.
 */
export const sendMail = action({
  args: {
    sendCommandId: v.string(),
    connectionId: v.id("adminMailConnections"),
    accountId: v.string(),
    mode: adminMailComposeMode,
    to: v.array(v.string()),
    cc: v.array(v.string()),
    bcc: v.array(v.string()),
    subject: v.string(),
    bodyText: v.string(),
    source: v.optional(v.object({ folderId: v.string(), messageId: v.string() })),
    uploadIds: v.array(v.id("adminMailUploads")),
    forwardAttachmentIds: v.optional(v.array(v.string())),
  },
  returns: adminMailSendResult,
  handler: (ctx, args): Promise<AdminMailSendResult> =>
    withMailErrors(async () => {
      requireMailConfig();
      if (!SEND_COMMAND_ID.test(args.sendCommandId)) mailError("ZOHO_COMPOSE_INVALID");
      zohoIdArg(args.accountId);
      const recipients = checkRecipients({ to: args.to, cc: args.cc, bcc: args.bcc });
      if (!recipients.ok) mailError("ZOHO_RECIPIENT_INVALID");
      const forwardIds = args.mode === "forward" ? args.forwardAttachmentIds ?? [] : [];
      for (const id of forwardIds) zohoIdArg(id);
      if (args.source) {
        zohoIdArg(args.source.folderId);
        zohoIdArg(args.source.messageId);
      }
      if (
        (args.mode === "new") !== (args.source === undefined) ||
        (args.mode === "new" && !args.subject.trim()) ||
        args.subject.length > ADMIN_MAIL_SUBJECT_MAX_LENGTH ||
        args.bodyText.length > ADMIN_MAIL_BODY_MAX_LENGTH ||
        new Set(args.uploadIds).size !== args.uploadIds.length ||
        new Set(forwardIds).size !== forwardIds.length ||
        args.uploadIds.length + forwardIds.length > ADMIN_MAIL_SEND_MAX_ATTACHMENTS
      ) mailError("ZOHO_COMPOSE_INVALID");

      const claim: { claimed: true } | { claimed: false; status: AdminMailSendStatus; errorCode: string | null } = await ctx.runMutation(internal.adminMail.claimSendCommand, {
        sendCommandId: args.sendCommandId,
        connectionId: args.connectionId,
        zohoAccountId: args.accountId,
        mode: args.mode,
      });
      if (!claim.claimed) {
        return { sendCommandId: args.sendCommandId, status: claim.status, errorCode: claim.errorCode, duplicate: true };
      }

      let posted = false;
      try {
        const uploads: { storageId: Id<"_storage">; fileName: string; size: number }[] = await ctx.runQuery(internal.adminMail.uploadsForSend, { uploadIds: args.uploadIds });
        const { client, connection } = await openMailboxSession(ctx, { connectionId: args.connectionId, accountId: args.accountId });
        const account = connection.account ?? mailError("ZOHO_CONNECTION_NOT_FOUND");

        let quote: ScanMeEmailQuote | null = null;
        let sourceSubject = "";
        const forwarded: { fileName: string; size: number; attachmentId: string }[] = [];
        if (args.source) {
          const sourceArgs = { accountId: args.accountId, folderId: args.source.folderId, messageId: args.source.messageId };
          const details = await client.getDetails(sourceArgs);
          const body = await client.getContent(sourceArgs);
          quote = buildMailQuote(args.mode, { ...details, body });
          sourceSubject = details.subject;
          if (forwardIds.length > 0) {
            const infos = await client.getAttachments(sourceArgs);
            for (const attachmentId of forwardIds) {
              const info = infos.find((item) => item.attachmentId === attachmentId);
              if (!info || !adminMailAttachmentMimeType(info.fileName) || info.size > ADMIN_MAIL_SEND_FILE_MAX_BYTES) mailError("ZOHO_ATTACHMENT_BLOCKED");
              forwarded.push({ fileName: info.fileName, size: info.size, attachmentId });
            }
          }
        }
        const totalBytes = [...uploads, ...forwarded].reduce((sum, item) => sum + item.size, 0);
        if (totalBytes > ADMIN_MAIL_SEND_TOTAL_MAX_BYTES) mailError("ZOHO_ATTACHMENT_BLOCKED");

        const subject = args.subject.replace(/\s+/g, " ").trim() || composeSubject(args.mode, sourceSubject);
        const rendered = renderScanMeEmail({ bodyText: args.bodyText, signatureText: account.signatureText, quote, subject });

        const attachments: ZohoUploadedAttachment[] = [];
        for (const upload of uploads) {
          const blob = await ctx.storage.get(upload.storageId);
          if (!blob) mailError("ZOHO_ATTACHMENT_BLOCKED");
          attachments.push(await client.uploadAttachment({ accountId: args.accountId, fileName: upload.fileName, bytes: await blob.arrayBuffer() }));
        }
        for (const item of forwarded) {
          const bytes = await client.downloadAttachment({
            accountId: args.accountId,
            folderId: args.source!.folderId,
            messageId: args.source!.messageId,
            attachmentId: item.attachmentId,
            maxBytes: ADMIN_MAIL_SEND_FILE_MAX_BYTES,
          });
          attachments.push(await client.uploadAttachment({ accountId: args.accountId, fileName: item.fileName, bytes }));
        }

        // Outbound is checked again immediately before the one POST.
        if (!readMailConfig()) mailError("ZOHO_NOT_CONFIGURED");
        if (!connection.scopes.includes(SEND_SCOPE)) mailError("ZOHO_AUTH_REQUIRED");
        await ctx.runMutation(internal.adminMail.updateSendCommand, { sendCommandId: args.sendCommandId, status: "sending" });
        posted = true;
        const result = await client.sendMessage({
          accountId: args.accountId,
          replyToMessageId: args.mode === "reply" || args.mode === "reply_all" ? args.source!.messageId : undefined,
          message: {
            fromAddress: account.emailAddress,
            toAddress: recipients.to.join(","),
            ...(recipients.cc.length > 0 ? { ccAddress: recipients.cc.join(",") } : {}),
            ...(recipients.bcc.length > 0 ? { bccAddress: recipients.bcc.join(",") } : {}),
            subject,
            content: rendered.html,
            mailFormat: "html",
            encoding: "UTF-8",
            askReceipt: "no",
            ...(attachments.length > 0 ? { attachments } : {}),
          },
        });
        await ctx.runMutation(internal.adminMail.updateSendCommand, {
          sendCommandId: args.sendCommandId,
          status: "sent",
          ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        });
        await ctx.runMutation(internal.adminMail.discardUploads, { uploadIds: args.uploadIds });
        return { sendCommandId: args.sendCommandId, status: "sent" as const, errorCode: null, duplicate: false };
      } catch (error) {
        const data = error instanceof ConvexError ? (error.data as { code?: unknown } | string) : null;
        const known = data && typeof data === "object" && isAdminMailErrorCode(data.code) ? data.code : null;
        const code: AdminMailErrorCode = error instanceof AdminMailError ? error.code : known ?? (posted ? "ZOHO_SEND_UNCERTAIN" : "ZOHO_UNAVAILABLE");
        const status = posted && code === "ZOHO_SEND_UNCERTAIN" ? ("needs_reconciliation" as const) : ("failed" as const);
        await ctx.runMutation(internal.adminMail.updateSendCommand, { sendCommandId: args.sendCommandId, status, errorCode: code });
        if (status === "needs_reconciliation") await ctx.runMutation(internal.adminMail.discardUploads, { uploadIds: args.uploadIds });
        return { sendCommandId: args.sendCommandId, status, errorCode: code, duplicate: false };
      }
    }),
});
