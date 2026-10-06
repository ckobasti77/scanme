import { ConvexError, v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
  ADMIN_MAIL_PAGE_SIZE_MAX,
  adminMailFile,
  adminMailFolder,
  adminMailMessage,
  adminMailMessagePage,
  adminMailStatus,
  type AdminMailErrorCode,
} from "./lib/adminMailContract";
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
    if (existing) {
      connectionId = existing._id;
      await ctx.db.patch(connectionId, tokens);
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
      await ctx.db.insert("adminMailAccounts", {
        connectionId,
        ownerUserId: admin._id,
        zohoAccountId: account.accountId,
        emailAddress: account.emailAddress,
        ...(account.displayName ? { displayName: account.displayName } : {}),
        isDefault: index === 0,
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
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.ownerUserId !== admin._id) mailError("ZOHO_CONNECTION_NOT_FOUND");
    if (args.zohoAccountId !== undefined) {
      const accounts = await ctx.db
        .query("adminMailAccounts")
        .withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id))
        .take(MAX_ACCOUNTS_PER_CONNECTION * 2);
      if (!accounts.some((account) => account.zohoAccountId === args.zohoAccountId)) mailError("ZOHO_CONNECTION_NOT_FOUND");
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

type OwnedConnection = FunctionReturnType<typeof internal.adminMail.connectionForAction>;

/** A client for the caller's own connection: cached access token, else one refresh. */
async function openMailbox(
  ctx: ActionCtx,
  args: { connectionId: Id<"adminMailConnections">; accountId?: string },
) {
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
  return new ZohoMailClient({
    fetchImpl: fetch,
    accessToken: accessToken ?? (await refresh()),
    refreshed,
    refreshAccessToken: refresh,
    onAuthRequired: markAuthRequired,
  });
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
