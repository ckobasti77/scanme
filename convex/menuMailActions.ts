import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { sha256Hex } from "./lib/adminMailCrypto";
import { menuMailProviderValidator, menuReplyKindValidator } from "./lib/menuDomainValidators";
import { readMenuMailConfig, type MenuMailConfig } from "./lib/menuMailConfig";
import { menuMailAad, openMenuMailSecret, sealMenuMailSecret } from "./lib/menuMailCrypto";
import {
  MenuMailAuthError,
  MenuMailKeyError,
  MenuMailProviderError,
  grantsSend,
  menuMailProvider,
  type MenuMailProvider,
  type MenuMailTokens,
} from "./lib/menuMailProviders";
import type { ClaimedSend, ConsumedState, MailTokens } from "./menuMail";
import { MAIL_ERROR, type MailErrorCode } from "../lib/menu/errors/mail";
import type { ReservationErrorCode } from "../lib/menu/errors/reservations";
import type { StaffErrorCode } from "../lib/menu/errors/waiter";
import { isCodeVerifier } from "../lib/menu/mail/pkce";
import { cleanSubject, isValidReply } from "../lib/menu/reply-templates";

// =============================================================================
// ScanMe Menu V1 (K26) — the live provider calls of the venue mailbox (plan
// docs/meni/planovi/K24.md §3.1). Default runtime (fetch + Web Crypto), no
// "use node", like convex/adminMail.ts.
//
//   completeConnect   the callback step: consume the one-time state, exchange
//                     the code with the PKCE verifier, read the verified
//                     address, store the tokens as ciphertext.
//   sendReply         a reply to the reservation's own guest address, from the
//                     venue's mailbox: claim (access, idempotency, rate
//                     buckets) → tokens → send (one refresh on 401) → finish.
//   revokeAtProvider  best-effort revocation of an ended grant.
//
// Tokens exist in the clear only inside these handlers; nothing returns,
// logs or throws one. Every outcome is a value with a stable code.
// =============================================================================

const ACCESS_TOKEN_MARGIN_MS = 60 * 1_000;
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CODE_PATTERN = /^[\x21-\x7e]{1,2048}$/;

export type CompleteConnectOutcome =
  | { ok: true; slug: string; emailAddress: string }
  | { ok: false; code: MailErrorCode; slug: string | null };

function codeOf(error: unknown): MailErrorCode {
  return error instanceof MenuMailProviderError ? error.code : MAIL_ERROR.providerUnavailable;
}

/** Callback step of the OAuth flow (called by app/api/meni/mail/callback with the person's session). */
export const completeConnect = action({
  // `code` is absent when the person declined on the provider's consent screen:
  // the state is still consumed (one-time) and the answer names the venue.
  args: { code: v.optional(v.string()), state: v.string() },
  handler: async (ctx, args): Promise<CompleteConnectOutcome> => {
    const config = readMenuMailConfig();
    if (!config) return { ok: false, code: MAIL_ERROR.notConfigured, slug: null };
    if (!STATE_PATTERN.test(args.state)) return { ok: false, code: MAIL_ERROR.stateInvalid, slug: null };
    const consumed: ConsumedState = await ctx.runMutation(internal.menuMail.consumeState, { stateHash: await sha256Hex(args.state) });
    if (!consumed.ok) return consumed;
    const slug = consumed.slug;
    if (args.code === undefined) return { ok: false, code: MAIL_ERROR.scopeMissing, slug };
    if (!CODE_PATTERN.test(args.code)) return { ok: false, code: MAIL_ERROR.providerUnavailable, slug };
    const client = config.clients[consumed.provider];
    if (!client) return { ok: false, code: MAIL_ERROR.providerUnavailable, slug };
    const provider = menuMailProvider(consumed.provider);

    let verifier: string;
    try {
      verifier = await openMenuMailSecret(
        config.key,
        { ciphertext: consumed.verifierCiphertext, iv: consumed.verifierIv },
        menuMailAad({ purpose: "verifier", menuServiceId: consumed.menuServiceId, provider: consumed.provider, binding: consumed.stateHash }),
      );
    } catch {
      return { ok: false, code: MAIL_ERROR.stateInvalid, slug };
    }
    if (!isCodeVerifier(verifier)) return { ok: false, code: MAIL_ERROR.stateInvalid, slug };

    let tokens: MenuMailTokens;
    try {
      tokens = await provider.exchangeCode({
        fetchImpl: fetch,
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        redirectUri: config.redirectUri,
        code: args.code,
        codeVerifier: verifier,
      });
    } catch (error) {
      return { ok: false, code: codeOf(error) === MAIL_ERROR.reconnectRequired ? MAIL_ERROR.stateInvalid : codeOf(error), slug };
    }
    const refreshToken = tokens.refreshToken as string;
    try {
      if (!grantsSend(provider, tokens.scope)) throw new MenuMailProviderError(MAIL_ERROR.scopeMissing);
      const emailAddress = await provider.userEmail({ fetchImpl: fetch, accessToken: tokens.accessToken });
      const binding = { menuServiceId: consumed.menuServiceId, provider: consumed.provider, binding: emailAddress };
      const refresh = await sealMenuMailSecret(config.key, refreshToken, menuMailAad({ purpose: "refresh", ...binding }));
      const access = await sealMenuMailSecret(config.key, tokens.accessToken, menuMailAad({ purpose: "access", ...binding }));
      const saved: { ok: true } | { ok: false; code: MailErrorCode } = await ctx.runMutation(internal.menuMail.saveConnection, {
        menuServiceId: consumed.menuServiceId,
        userId: consumed.userId,
        provider: consumed.provider,
        emailAddress,
        refreshTokenCiphertext: refresh.ciphertext,
        refreshTokenIv: refresh.iv,
        accessTokenCiphertext: access.ciphertext,
        accessTokenIv: access.iv,
        accessTokenExpiresAt: Date.now() + tokens.expiresInSeconds * 1_000,
        scopes: [...provider.scopes],
      });
      if (!saved.ok) throw new MenuMailProviderError(saved.code);
      return { ok: true, slug, emailAddress };
    } catch (error) {
      // Nothing was stored: do not leave a live grant behind at the provider.
      await provider.revoke({ fetchImpl: fetch, token: refreshToken });
      return { ok: false, code: codeOf(error), slug };
    }
  },
});

export type SendReplyOutcome =
  | { ok: true; status: "sent" | "sending" | "failed" | "logged" }
  | { ok: false; code: MailErrorCode | ReservationErrorCode | StaffErrorCode };

type Session = { tokens: MailTokens; provider: MenuMailProvider; config: MenuMailConfig };

async function freshAccessToken(ctx: ActionCtx, session: Session): Promise<string> {
  const { tokens, provider, config } = session;
  const client = config.clients[tokens.provider];
  if (!client) throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
  const binding = { menuServiceId: tokens.menuServiceId, provider: tokens.provider, binding: tokens.emailAddress };
  let refreshToken: string;
  try {
    refreshToken = await openMenuMailSecret(
      config.key,
      { ciphertext: tokens.refreshTokenCiphertext, iv: tokens.refreshTokenIv },
      menuMailAad({ purpose: "refresh", ...binding }),
    );
  } catch {
    throw new MenuMailKeyError();
  }
  const fresh = await provider.refresh({ fetchImpl: fetch, clientId: client.clientId, clientSecret: client.clientSecret, refreshToken });
  const access = await sealMenuMailSecret(config.key, fresh.accessToken, menuMailAad({ purpose: "access", ...binding }));
  // Microsoft rotates the refresh token: the new one replaces the old.
  const rotated =
    fresh.refreshToken && fresh.refreshToken !== refreshToken
      ? await sealMenuMailSecret(config.key, fresh.refreshToken, menuMailAad({ purpose: "refresh", ...binding }))
      : null;
  await ctx.runMutation(internal.menuMail.cacheAccessToken, {
    connectionId: tokens.connectionId,
    provider: tokens.provider,
    emailAddress: tokens.emailAddress,
    ciphertext: access.ciphertext,
    iv: access.iv,
    expiresAt: Date.now() + fresh.expiresInSeconds * 1_000,
    ...(rotated ? { refreshTokenCiphertext: rotated.ciphertext, refreshTokenIv: rotated.iv } : {}),
  });
  return fresh.accessToken;
}

async function cachedAccessToken(session: Session): Promise<string | null> {
  const { tokens, config } = session;
  if (!tokens.accessTokenCiphertext || !tokens.accessTokenIv || tokens.accessTokenExpiresAt === null) return null;
  if (tokens.accessTokenExpiresAt - ACCESS_TOKEN_MARGIN_MS <= Date.now()) return null;
  try {
    return await openMenuMailSecret(
      config.key,
      { ciphertext: tokens.accessTokenCiphertext, iv: tokens.accessTokenIv },
      menuMailAad({ purpose: "access", menuServiceId: tokens.menuServiceId, provider: tokens.provider, binding: tokens.emailAddress }),
    );
  } catch {
    return null;
  }
}

/**
 * Sends a reply from the venue's mailbox to the reservation's own guest
 * address (never an address from the caller). Idempotent per clientSendId.
 */
export const sendReply = action({
  args: {
    slug: v.string(),
    panelCode: v.string(),
    sessionToken: v.optional(v.string()),
    reservationId: v.id("menuReservations"),
    kind: menuReplyKindValidator,
    subject: v.string(),
    body: v.string(),
    clientSendId: v.string(),
  },
  handler: async (ctx, args): Promise<SendReplyOutcome> => {
    const config = readMenuMailConfig();
    if (!config) return { ok: false, code: MAIL_ERROR.notConfigured };
    const body = args.body.replace(/\r\n?/g, "\n").trim();
    if (!isValidReply({ subject: args.subject, body })) return { ok: false, code: MAIL_ERROR.invalidInput };
    const subject = cleanSubject(args.subject);
    const claimed: ClaimedSend = await ctx.runMutation(internal.menuMail.claimSend, {
      slug: args.slug,
      panelCode: args.panelCode,
      ...(args.sessionToken !== undefined ? { sessionToken: args.sessionToken } : {}),
      reservationId: args.reservationId,
      kind: args.kind,
      clientSendId: args.clientSendId,
    });
    if (!claimed.ok) return claimed;
    if ("duplicate" in claimed) return { ok: true, status: claimed.duplicate };
    const replyId: Id<"menuReservationReplies"> = claimed.replyId;
    const finish = async (status: "sent" | "failed", extra: { errorCode?: MailErrorCode; providerMessageId?: string } = {}) => {
      await ctx.runMutation(internal.menuMail.finishSend, { replyId, status, ...extra });
    };

    const tokens: MailTokens | null = await ctx.runQuery(internal.menuMail.tokensFor, { replyId });
    if (!tokens || tokens.provider !== claimed.provider || tokens.emailAddress !== claimed.from) {
      await finish("failed", { errorCode: MAIL_ERROR.reconnectRequired });
      return { ok: false, code: MAIL_ERROR.reconnectRequired };
    }
    const session: Session = { tokens, provider: menuMailProvider(tokens.provider), config };
    const message = { from: claimed.from, to: claimed.to, subject, body, now: new Date() };
    try {
      let accessToken = (await cachedAccessToken(session)) ?? (await freshAccessToken(ctx, session));
      let sent: { providerMessageId: string | null };
      try {
        sent = await session.provider.send({ fetchImpl: fetch, accessToken, message });
      } catch (error) {
        if (!(error instanceof MenuMailAuthError)) throw error;
        accessToken = await freshAccessToken(ctx, session);
        try {
          sent = await session.provider.send({ fetchImpl: fetch, accessToken, message });
        } catch (again) {
          throw again instanceof MenuMailAuthError ? new MenuMailProviderError(MAIL_ERROR.reconnectRequired) : again;
        }
      }
      try {
        await finish("sent", sent.providerMessageId ? { providerMessageId: sent.providerMessageId } : {});
      } catch {
        // The message left the mailbox; a failed bookkeeping write never reports it as unsent.
      }
      return { ok: true, status: "sent" };
    } catch (error) {
      // A key that cannot open the stored token is a server setting, not a broken connection.
      const code = error instanceof MenuMailProviderError ? error.code : MAIL_ERROR.sendFailed;
      if (error instanceof MenuMailKeyError) {
        await finish("failed", { errorCode: MAIL_ERROR.providerUnavailable });
        return { ok: false, code: MAIL_ERROR.providerUnavailable };
      }
      if (code === MAIL_ERROR.reconnectRequired) {
        await ctx.runMutation(internal.menuMail.markReconnect, { connectionId: tokens.connectionId });
      }
      await finish("failed", { errorCode: code });
      return { ok: false, code };
    }
  },
});

/** Best effort: revoke an ended grant at the provider (Google; Microsoft has no endpoint). */
export const revokeAtProvider = internalAction({
  args: {
    menuServiceId: v.id("menuServices"),
    provider: menuMailProviderValidator,
    emailAddress: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
  },
  handler: async (_ctx, args): Promise<null> => {
    const config = readMenuMailConfig();
    if (!config) return null;
    try {
      const token = await openMenuMailSecret(
        config.key,
        { ciphertext: args.ciphertext, iv: args.iv },
        menuMailAad({ purpose: "refresh", menuServiceId: args.menuServiceId, provider: args.provider, binding: args.emailAddress }),
      );
      await menuMailProvider(args.provider).revoke({ fetchImpl: fetch, token });
    } catch {
      // Undecryptable or unreachable: nothing more to do; the tokens are already gone here.
    }
    return null;
  },
});
