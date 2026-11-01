import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { randomAdminMailState, sha256Hex } from "./lib/adminMailCrypto";
import { getMenuAccess, requireMenuAccessToRow } from "./lib/menuAccess";
import { auditActorKind, writeMenuAudit } from "./lib/menuDraft";
import {
  menuMailProviderValidator,
  menuPhoneOutcomeValidator,
  menuReplyKindValidator,
  menuReplyTemplateKindValidator,
} from "./lib/menuDomainValidators";
import { menuMailAvailability, readMenuMailConfig, type MenuMailProviderName } from "./lib/menuMailConfig";
import { MENU_MAIL_KEY_VERSION, menuMailAad, sealMenuMailSecret } from "./lib/menuMailCrypto";
import { isPlainRecipient, menuMailProvider } from "./lib/menuMailProviders";
import { loadMenuStaff, userNameForOthers, waiterActorRef, type MenuStaffActor } from "./lib/menuStaffAccess";
import { rateLimiter } from "./lib/rateLimits";
import { MAIL_ERROR, type MailErrorCode } from "../lib/menu/errors/mail";
import { RESERVATION_ERROR, type ReservationErrorCode } from "../lib/menu/errors/reservations";
import { STAFF_ERROR, type StaffErrorCode } from "../lib/menu/errors/waiter";
import { codeChallengeS256, newCodeVerifier } from "../lib/menu/mail/pkce";
import {
  REPLY_SIGNATURE_MAX,
  TEMPLATE_KINDS,
  cleanSubject,
  isValidTemplate,
  type ReplyKind,
  type StoredTemplates,
} from "../lib/menu/reply-templates";

// =============================================================================
// ScanMe Menu V1 (K26) — the reply to a guest about a reservation (master
// §11.4, P7; plan docs/meni/planovi/K24.md §3, K24-17..K24-19).
//
//   Podešavanja (Owner, Manager: settings.edit)
//     status, startConnect, disconnect — the venue's business mailbox, Gmail
//     or Microsoft through OAuth (authorization code + PKCE). No password is
//     ever seen; the tokens are AES-GCM ciphertext under MENU_MAIL_TOKEN_KEY
//     and never leave the actions (convex/menuMailActions.ts).
//     templates, saveTemplate, resetTemplate, setSignature.
//   Waiter panel (waiter.work: PIN staff, Owner, Manager)
//     replyContext (templates, signature, mailbox state, replies so far —
//     the sheet fills the text on the device), logReply (opened in the own
//     e-mail, or a phone call with an optional outcome).
//   Internal (the actions): consumeState, saveConnection, claimSend,
//     tokensFor, cacheAccessToken, markReconnect, finishSend.
//
// The reply goes ONLY to the reservation's own contactEmail: no argument
// carries a recipient. The text of a message is never stored. Without the
// switch and the keys (convex/lib/menuMailConfig.ts) nothing connects or
// sends and the UI says so. Staff refusals are values, never throws.
// =============================================================================

const STATE_TTL_MS = 10 * 60 * 1_000;
const STATE_CLEANUP_BATCH = 20;
const MAX_REPLIES_SHOWN = 10;
const CLIENT_SEND_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const staffArgs = { slug: v.string(), panelCode: v.string(), sessionToken: v.optional(v.string()) };

export type MenuMailConnectionView = {
  provider: MenuMailProviderName;
  emailAddress: string;
  status: "active" | "error";
  connectedAt: number;
  lastErrorCode: string | null;
};

async function connectionOf(ctx: QueryCtx | MutationCtx, menuServiceId: Id<"menuServices">) {
  return await ctx.db
    .query("menuMailConnections")
    .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
    .unique();
}

/** What a client may see of a connection: never a token, a ciphertext or an IV. */
function connectionView(row: Doc<"menuMailConnections"> | null): MenuMailConnectionView | null {
  if (!row || row.status === "revoked") return null;
  return {
    provider: row.provider,
    emailAddress: row.emailAddress,
    status: row.status,
    connectedAt: row.connectedAt,
    lastErrorCode: row.lastErrorCode ?? null,
  };
}

// -----------------------------------------------------------------------------
// Podešavanja: the mailbox
// -----------------------------------------------------------------------------

export type MenuMailStatus = {
  available: boolean;
  providers: MenuMailProviderName[];
  reason: "not_configured" | null;
  connection: MenuMailConnectionView | null;
};

/** Whether the mailbox can be connected (and with which providers) and the current connection. */
export const status = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<MenuMailStatus | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "settings.edit");
    if (!access) return null;
    return { ...menuMailAvailability(), connection: connectionView(await connectionOf(ctx, access.menuService._id)) };
  },
});

export type MenuMailStartOutcome = { ok: true; authorizeUrl: string } | { ok: false; code: MailErrorCode };

/**
 * A one-time `state` (10 min, for this person and service; only its SHA-256
 * is stored), a PKCE verifier (stored as ciphertext) and the provider's
 * authorize URL. The browser goes there; the provider returns to
 * /api/meni/mail/callback, which calls menuMailActions.completeConnect.
 */
export const startConnect = mutation({
  args: { menuServiceId: v.id("menuServices"), provider: menuMailProviderValidator },
  handler: async (ctx, args): Promise<MenuMailStartOutcome> => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "settings.edit");
    const config = readMenuMailConfig();
    if (!config) return { ok: false, code: MAIL_ERROR.notConfigured };
    const client = config.clients[args.provider];
    if (!client) return { ok: false, code: MAIL_ERROR.providerUnavailable };
    if (!(await rateLimiter.limit(ctx, "menuMailConnect", { key: access.user._id })).ok) {
      return { ok: false, code: MAIL_ERROR.rateLimited };
    }
    const now = Date.now();
    const oldest = await ctx.db
      .query("menuMailOAuthStates")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", access.user._id))
      .take(STATE_CLEANUP_BATCH);
    for (const row of oldest) {
      if (row.usedAt !== undefined || row.expiresAt <= now) await ctx.db.delete(row._id);
    }
    const state = randomAdminMailState();
    const stateHash = await sha256Hex(state);
    const verifier = newCodeVerifier();
    const sealed = await sealMenuMailSecret(
      config.key,
      verifier,
      menuMailAad({ purpose: "verifier", menuServiceId: access.menuService._id, provider: args.provider, binding: stateHash }),
    );
    await ctx.db.insert("menuMailOAuthStates", {
      stateHash,
      menuServiceId: access.menuService._id,
      provider: args.provider,
      userId: access.user._id,
      codeVerifierCiphertext: sealed.ciphertext,
      codeVerifierIv: sealed.iv,
      expiresAt: now + STATE_TTL_MS,
      createdAt: now,
    });
    const authorizeUrl = menuMailProvider(args.provider).authorizeUrl({
      clientId: client.clientId,
      redirectUri: config.redirectUri,
      state,
      codeChallenge: await codeChallengeS256(verifier),
    });
    return { ok: true, authorizeUrl };
  },
});

/** Ends the connection: the tokens are deleted at once; the provider grant is revoked best effort. */
export const disconnect = mutation({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "settings.edit");
    const row = await connectionOf(ctx, access.menuService._id);
    if (!row || row.status === "revoked") return { ok: true };
    if (row.refreshTokenCiphertext && row.refreshTokenIv && readMenuMailConfig()) {
      await ctx.scheduler.runAfter(0, internal.menuMailActions.revokeAtProvider, {
        menuServiceId: row.menuServiceId,
        provider: row.provider,
        emailAddress: row.emailAddress,
        ciphertext: row.refreshTokenCiphertext,
        iv: row.refreshTokenIv,
      });
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "revoked",
      refreshTokenCiphertext: undefined,
      refreshTokenIv: undefined,
      accessTokenCiphertext: undefined,
      accessTokenIv: undefined,
      accessTokenExpiresAt: undefined,
      revokedAt: now,
      lastErrorCode: undefined,
      updatedAt: now,
    });
    await writeMenuAudit(ctx, {
      menuServiceId: access.menuService._id,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "mail.disconnected",
      entityType: "menuMailConnections",
      details: { provider: row.provider },
    });
    return { ok: true };
  },
});

// -----------------------------------------------------------------------------
// Podešavanja: templates and the signature
// -----------------------------------------------------------------------------

async function storedTemplates(ctx: QueryCtx | MutationCtx, menuServiceId: Id<"menuServices">): Promise<StoredTemplates> {
  const stored: StoredTemplates = {};
  for (const kind of TEMPLATE_KINDS) {
    const row = await ctx.db
      .query("menuMessageTemplates")
      .withIndex("by_menuServiceId_and_kind", (q) => q.eq("menuServiceId", menuServiceId).eq("kind", kind))
      .unique();
    if (row) stored[kind] = { subject: row.subject, body: row.body };
  }
  return stored;
}

export type MenuReplyTemplates = {
  venueName: string;
  /** The venue's own signature; null = the default "Srdačno, <venue>". */
  signature: string | null;
  /** Only the kinds the venue changed; the rest use the default text. */
  templates: StoredTemplates;
};

export const templates = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args): Promise<MenuReplyTemplates | null> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "settings.edit");
    if (!access) return null;
    return {
      venueName: access.business.name,
      signature: access.menuService.settings?.replySignature ?? null,
      templates: await storedTemplates(ctx, access.menuService._id),
    };
  },
});

export type MenuMailSaveOutcome = { ok: true } | { ok: false; code: MailErrorCode };

export const saveTemplate = mutation({
  args: { menuServiceId: v.id("menuServices"), kind: menuReplyTemplateKindValidator, subject: v.string(), body: v.string() },
  handler: async (ctx, args): Promise<MenuMailSaveOutcome> => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "settings.edit");
    const subject = cleanSubject(args.subject);
    const body = args.body.replace(/\r\n?/g, "\n").trim();
    if (!isValidTemplate({ subject, body })) return { ok: false, code: MAIL_ERROR.invalidInput };
    const now = Date.now();
    const row = await ctx.db
      .query("menuMessageTemplates")
      .withIndex("by_menuServiceId_and_kind", (q) => q.eq("menuServiceId", access.menuService._id).eq("kind", args.kind))
      .unique();
    if (row) {
      if (row.subject !== subject || row.body !== body) {
        await ctx.db.patch(row._id, { subject, body, updatedAt: now, updatedByUserId: access.user._id });
      }
    } else {
      await ctx.db.insert("menuMessageTemplates", {
        menuServiceId: access.menuService._id,
        kind: args.kind,
        subject,
        body,
        updatedAt: now,
        updatedByUserId: access.user._id,
      });
    }
    return { ok: true };
  },
});

/** Back to the default text of the kind. */
export const resetTemplate = mutation({
  args: { menuServiceId: v.id("menuServices"), kind: menuReplyTemplateKindValidator },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "settings.edit");
    const row = await ctx.db
      .query("menuMessageTemplates")
      .withIndex("by_menuServiceId_and_kind", (q) => q.eq("menuServiceId", access.menuService._id).eq("kind", args.kind))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return { ok: true };
  },
});

/** One signature for the venue (≤ 500 characters); empty = the default. */
export const setSignature = mutation({
  args: { menuServiceId: v.id("menuServices"), signature: v.string() },
  handler: async (ctx, args): Promise<MenuMailSaveOutcome> => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "settings.edit");
    const signature = args.signature.replace(/\r\n?/g, "\n").trim();
    if (signature.length > REPLY_SIGNATURE_MAX) return { ok: false, code: MAIL_ERROR.invalidInput };
    const next = signature.length > 0 ? signature : undefined;
    if ((access.menuService.settings?.replySignature ?? undefined) === next) return { ok: true };
    await ctx.db.patch(access.menuService._id, {
      settings: { ...access.menuService.settings, replySignature: next },
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// -----------------------------------------------------------------------------
// Waiter panel: the context of the sheet and the logged replies
// -----------------------------------------------------------------------------

export type MenuReplyRow = {
  id: Id<"menuReservationReplies">;
  channel: "mailbox" | "mailto" | "phone";
  kind: ReplyKind | null;
  status: "sending" | "sent" | "failed" | "logged";
  phoneOutcome: "reached" | "no_answer" | "left_message" | null;
  errorCode: string | null;
  createdAt: number;
  byName: string | null;
};

export type MenuReplyContext = MenuReplyTemplates & {
  mailbox: {
    available: boolean;
    /** The venue's connected mailbox (only the provider, the address and the state). */
    connection: { provider: MenuMailProviderName; emailAddress: string; status: "active" | "error" } | null;
  };
  /** The latest replies to this reservation, newest first. */
  replies: MenuReplyRow[];
};

async function replyByName(ctx: QueryCtx, menuServiceId: Id<"menuServices">, row: Doc<"menuReservationReplies">): Promise<string | null> {
  if (row.byStaffId) {
    const member = await ctx.db.get(row.byStaffId);
    return member && member.menuServiceId === menuServiceId ? member.displayName : null;
  }
  if (row.byUserId) {
    const user = await ctx.db.get(row.byUserId);
    return user ? userNameForOthers(user) : null;
  }
  return null;
}

/** What the sheet "Obavesti gosta" needs besides the reservation detail; a temporary subscription while it is open. */
export const replyContext = query({
  args: { ...staffArgs, reservationId: v.id("menuReservations") },
  handler: async (ctx, args): Promise<MenuReplyContext | null> => {
    const waiter = await loadMenuStaff(ctx, args, null);
    if (!waiter) return null;
    const menuServiceId = waiter.menuService._id;
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.menuServiceId !== menuServiceId) return null;
    const connection = connectionView(await connectionOf(ctx, menuServiceId));
    const rows = await ctx.db
      .query("menuReservationReplies")
      .withIndex("by_reservationId", (q) => q.eq("reservationId", reservation._id))
      .order("desc")
      .take(MAX_REPLIES_SHOWN);
    const replies: MenuReplyRow[] = [];
    for (const row of rows) {
      if (row.menuServiceId !== menuServiceId) continue;
      replies.push({
        id: row._id,
        channel: row.channel,
        kind: row.kind ?? null,
        status: row.status,
        phoneOutcome: row.phoneOutcome ?? null,
        errorCode: row.errorCode ?? null,
        createdAt: row.createdAt,
        byName: await replyByName(ctx, menuServiceId, row),
      });
    }
    return {
      venueName: waiter.business.name,
      signature: waiter.menuService.settings?.replySignature ?? null,
      templates: await storedTemplates(ctx, menuServiceId),
      mailbox: {
        available: menuMailAvailability().available,
        connection: connection ? { provider: connection.provider, emailAddress: connection.emailAddress, status: connection.status } : null,
      },
      replies,
    };
  },
});

export type MenuReplyLogOutcome = { ok: true } | { ok: false; code: MailErrorCode | ReservationErrorCode | StaffErrorCode };

function actorFields(actor: MenuStaffActor): { byStaffId?: Id<"menuStaff">; byUserId?: Id<"users"> } {
  return actor.kind === "staff" ? { byStaffId: actor.staff._id } : { byUserId: actor.access.user._id };
}

/**
 * A reply the staff made outside ScanMe: the message opened in their own
 * e-mail (mailto:) or a phone call with an optional outcome. Optional for
 * the staff (nothing requires it); it tells colleagues what was done.
 */
export const logReply = mutation({
  args: {
    ...staffArgs,
    reservationId: v.id("menuReservations"),
    channel: v.union(v.literal("mailto"), v.literal("phone")),
    kind: v.optional(menuReplyKindValidator),
    phoneOutcome: v.optional(menuPhoneOutcomeValidator),
  },
  handler: async (ctx, args): Promise<MenuReplyLogOutcome> => {
    const now = Date.now();
    const waiter = await loadMenuStaff(ctx, args, now);
    if (!waiter) return { ok: false, code: STAFF_ERROR.signedOut };
    const bucket = await rateLimiter.limit(ctx, "menuStaffAction", {
      key: waiter.actor.kind === "staff" ? `session:${waiter.actor.session._id}` : waiterActorRef(waiter.actor),
    });
    if (!bucket.ok) return { ok: false, code: STAFF_ERROR.rateLimited };
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.menuServiceId !== waiter.menuService._id) return { ok: false, code: RESERVATION_ERROR.notFound };
    if (args.channel === "mailto" && !reservation.contactEmail) return { ok: false, code: MAIL_ERROR.noRecipient };
    if (args.channel === "phone" && !reservation.contactPhone) return { ok: false, code: MAIL_ERROR.noRecipient };
    if (args.channel === "mailto" && args.phoneOutcome !== undefined) return { ok: false, code: MAIL_ERROR.invalidInput };
    await ctx.db.insert("menuReservationReplies", {
      reservationId: reservation._id,
      menuServiceId: waiter.menuService._id,
      channel: args.channel,
      ...(args.kind !== undefined ? { kind: args.kind } : {}),
      status: "logged",
      ...(args.phoneOutcome !== undefined ? { phoneOutcome: args.phoneOutcome } : {}),
      ...actorFields(waiter.actor),
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

// -----------------------------------------------------------------------------
// Internal: the OAuth state and the connection (called by the actions; the
// caller's identity is the same as the action's)
// -----------------------------------------------------------------------------

export type ConsumedState =
  | {
      ok: true;
      menuServiceId: Id<"menuServices">;
      provider: MenuMailProviderName;
      userId: Id<"users">;
      slug: string;
      stateHash: string;
      verifierCiphertext: string;
      verifierIv: string;
    }
  | { ok: false; code: MailErrorCode; slug: string | null };

/** Valid only for the person who started it, still allowed to change settings, before expiry, once. */
export const consumeState = internalMutation({
  args: { stateHash: v.string() },
  handler: async (ctx, args): Promise<ConsumedState> => {
    const row = await ctx.db
      .query("menuMailOAuthStates")
      .withIndex("by_stateHash", (q) => q.eq("stateHash", args.stateHash))
      .unique();
    if (!row) return { ok: false, code: MAIL_ERROR.stateInvalid, slug: null };
    const access = await getMenuAccess(ctx, { menuServiceId: row.menuServiceId }, "settings.edit");
    if (!access || access.user._id !== row.userId) return { ok: false, code: MAIL_ERROR.stateInvalid, slug: null };
    const now = Date.now();
    if (row.usedAt !== undefined || row.expiresAt <= now) {
      return { ok: false, code: MAIL_ERROR.stateInvalid, slug: access.business.slug };
    }
    await ctx.db.patch(row._id, { usedAt: now });
    return {
      ok: true,
      menuServiceId: row.menuServiceId,
      provider: row.provider,
      userId: row.userId,
      slug: access.business.slug,
      stateHash: row.stateHash,
      verifierCiphertext: row.codeVerifierCiphertext,
      verifierIv: row.codeVerifierIv,
    };
  },
});

/** One connection per service: a new one replaces the old (an old grant of another mailbox is revoked best effort). */
export const saveConnection = internalMutation({
  args: {
    menuServiceId: v.id("menuServices"),
    userId: v.id("users"),
    provider: menuMailProviderValidator,
    emailAddress: v.string(),
    refreshTokenCiphertext: v.string(),
    refreshTokenIv: v.string(),
    accessTokenCiphertext: v.string(),
    accessTokenIv: v.string(),
    accessTokenExpiresAt: v.number(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; code: MailErrorCode }> => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "settings.edit");
    if (!access || access.user._id !== args.userId) return { ok: false, code: MAIL_ERROR.stateInvalid };
    const now = Date.now();
    const fields = {
      provider: args.provider,
      emailAddress: args.emailAddress,
      status: "active" as const,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      refreshTokenIv: args.refreshTokenIv,
      accessTokenCiphertext: args.accessTokenCiphertext,
      accessTokenIv: args.accessTokenIv,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      keyVersion: MENU_MAIL_KEY_VERSION,
      scopes: args.scopes,
      connectedByUserId: args.userId,
      connectedAt: now,
      revokedAt: undefined,
      lastErrorCode: undefined,
      updatedAt: now,
    };
    const existing = await connectionOf(ctx, args.menuServiceId);
    if (existing) {
      const otherMailbox = existing.provider !== args.provider || existing.emailAddress !== args.emailAddress;
      if (otherMailbox && existing.refreshTokenCiphertext && existing.refreshTokenIv) {
        await ctx.scheduler.runAfter(0, internal.menuMailActions.revokeAtProvider, {
          menuServiceId: existing.menuServiceId,
          provider: existing.provider,
          emailAddress: existing.emailAddress,
          ciphertext: existing.refreshTokenCiphertext,
          iv: existing.refreshTokenIv,
        });
      }
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("menuMailConnections", { menuServiceId: args.menuServiceId, ...fields });
    }
    await writeMenuAudit(ctx, {
      menuServiceId: args.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "mail.connected",
      entityType: "menuMailConnections",
      details: { provider: args.provider },
    });
    return { ok: true };
  },
});

// -----------------------------------------------------------------------------
// Internal: sending
// -----------------------------------------------------------------------------

export type ClaimedSend =
  | {
      ok: true;
      replyId: Id<"menuReservationReplies">;
      connectionId: Id<"menuMailConnections">;
      provider: MenuMailProviderName;
      from: string;
      to: string;
    }
  | { ok: true; duplicate: "sending" | "sent" | "failed" | "logged" }
  | { ok: false; code: MailErrorCode | ReservationErrorCode | StaffErrorCode };

/**
 * Who sends (waiter.work), the reservation of this venue and its own guest
 * address, the connection, the two rate buckets, and a `sending` row — or the
 * earlier row of the same clientSendId (a double tap sends once).
 */
export const claimSend = internalMutation({
  args: { ...staffArgs, reservationId: v.id("menuReservations"), kind: menuReplyKindValidator, clientSendId: v.string() },
  handler: async (ctx, args): Promise<ClaimedSend> => {
    const now = Date.now();
    const waiter = await loadMenuStaff(ctx, args, now);
    if (!waiter) return { ok: false, code: STAFF_ERROR.signedOut };
    if (!CLIENT_SEND_ID_PATTERN.test(args.clientSendId)) return { ok: false, code: MAIL_ERROR.invalidInput };
    const menuServiceId = waiter.menuService._id;
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.menuServiceId !== menuServiceId) return { ok: false, code: RESERVATION_ERROR.notFound };
    const earlier = await ctx.db
      .query("menuReservationReplies")
      .withIndex("by_menuServiceId_and_clientSendId", (q) => q.eq("menuServiceId", menuServiceId).eq("clientSendId", args.clientSendId))
      .first();
    if (earlier) {
      return earlier.reservationId === reservation._id ? { ok: true, duplicate: earlier.status } : { ok: false, code: MAIL_ERROR.invalidInput };
    }
    const to = reservation.contactEmail?.trim();
    if (!to || !isPlainRecipient(to)) return { ok: false, code: MAIL_ERROR.noRecipient };
    const connection = await connectionOf(ctx, menuServiceId);
    if (!connection || connection.status === "revoked") return { ok: false, code: MAIL_ERROR.notConnected };
    if (connection.status !== "active" || !connection.refreshTokenCiphertext) return { ok: false, code: MAIL_ERROR.reconnectRequired };
    if (!(await rateLimiter.limit(ctx, "menuMailSendService", { key: menuServiceId })).ok) return { ok: false, code: MAIL_ERROR.rateLimited };
    if (!(await rateLimiter.limit(ctx, "menuMailSendPerson", { key: waiterActorRef(waiter.actor) })).ok) {
      return { ok: false, code: MAIL_ERROR.rateLimited };
    }
    if (!(await rateLimiter.limit(ctx, "menuMailSendReservation", { key: reservation._id })).ok) {
      return { ok: false, code: MAIL_ERROR.rateLimited };
    }
    const replyId = await ctx.db.insert("menuReservationReplies", {
      reservationId: reservation._id,
      menuServiceId,
      channel: "mailbox",
      kind: args.kind,
      status: "sending",
      clientSendId: args.clientSendId,
      ...actorFields(waiter.actor),
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, replyId, connectionId: connection._id, provider: connection.provider, from: connection.emailAddress, to };
  },
});

export type MailTokens = {
  connectionId: Id<"menuMailConnections">;
  menuServiceId: Id<"menuServices">;
  provider: MenuMailProviderName;
  emailAddress: string;
  refreshTokenCiphertext: string;
  refreshTokenIv: string;
  accessTokenCiphertext: string | null;
  accessTokenIv: string | null;
  accessTokenExpiresAt: number | null;
};

/** The ciphertexts for ONE claimed send (they never leave the action). */
export const tokensFor = internalQuery({
  args: { replyId: v.id("menuReservationReplies") },
  handler: async (ctx, args): Promise<MailTokens | null> => {
    const reply = await ctx.db.get(args.replyId);
    if (!reply || reply.status !== "sending" || reply.channel !== "mailbox") return null;
    const connection = await connectionOf(ctx, reply.menuServiceId);
    if (!connection || connection.status !== "active" || !connection.refreshTokenCiphertext || !connection.refreshTokenIv) return null;
    return {
      connectionId: connection._id,
      menuServiceId: connection.menuServiceId,
      provider: connection.provider,
      emailAddress: connection.emailAddress,
      refreshTokenCiphertext: connection.refreshTokenCiphertext,
      refreshTokenIv: connection.refreshTokenIv,
      accessTokenCiphertext: connection.accessTokenCiphertext ?? null,
      accessTokenIv: connection.accessTokenIv ?? null,
      accessTokenExpiresAt: connection.accessTokenExpiresAt ?? null,
    };
  },
});

/** A fresh access token (and, for Microsoft, the rotated refresh token), if the connection is still the same. */
export const cacheAccessToken = internalMutation({
  args: {
    connectionId: v.id("menuMailConnections"),
    provider: menuMailProviderValidator,
    emailAddress: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
    expiresAt: v.number(),
    refreshTokenCiphertext: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get(args.connectionId);
    if (!row || row.status !== "active" || row.provider !== args.provider || row.emailAddress !== args.emailAddress) return null;
    await ctx.db.patch(row._id, {
      accessTokenCiphertext: args.ciphertext,
      accessTokenIv: args.iv,
      accessTokenExpiresAt: args.expiresAt,
      ...(args.refreshTokenCiphertext && args.refreshTokenIv
        ? { refreshTokenCiphertext: args.refreshTokenCiphertext, refreshTokenIv: args.refreshTokenIv }
        : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** The provider no longer accepts the grant: an Owner or Manager connects again. */
export const markReconnect = internalMutation({
  args: { connectionId: v.id("menuMailConnections") },
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get(args.connectionId);
    if (!row || row.status !== "active") return null;
    await ctx.db.patch(row._id, {
      status: "error",
      accessTokenCiphertext: undefined,
      accessTokenIv: undefined,
      accessTokenExpiresAt: undefined,
      lastErrorCode: MAIL_ERROR.reconnectRequired,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const finishSend = internalMutation({
  args: {
    replyId: v.id("menuReservationReplies"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    errorCode: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const reply = await ctx.db.get(args.replyId);
    if (!reply || reply.status !== "sending") return null;
    await ctx.db.patch(reply._id, {
      status: args.status,
      ...(args.errorCode !== undefined ? { errorCode: args.errorCode } : {}),
      ...(args.providerMessageId !== undefined ? { providerMessageId: args.providerMessageId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});
