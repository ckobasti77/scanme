// ScanMe Menu V1 (K26) — the two mailbox providers of a venue behind one
// interface (master §11.4; plan docs/meni/planovi/K24.md K24-17, §3.4):
//   gmail       Google OAuth 2.0 + Gmail API users/me/messages/send (a raw
//               RFC 5322 message, lib/menu/mail/mime.ts)
//   microsoft   Microsoft identity platform (tenant "common") + Graph
//               /me/sendMail (plain text)
// Minimal scopes: who the mailbox is (openid email) and sending only — never
// reading. Authorization code flow with PKCE (S256) and a client secret on
// the server. Every network call goes through the injected `fetchImpl`, so
// tests answer with a fake and nothing leaves the process. Errors become
// stable codes (lib/menu/errors/mail.ts); no token, code or provider text is
// ever part of an error.

import { MAIL_ERROR, type MailErrorCode } from "../../lib/menu/errors/mail";
import { gmailRawMessage } from "../../lib/menu/mail/mime";
import type { MenuMailProviderName } from "./menuMailConfig";

type FetchImpl = typeof fetch;

export class MenuMailProviderError extends Error {
  readonly code: MailErrorCode;
  constructor(code: MailErrorCode) {
    super(code);
    this.name = "MenuMailProviderError";
    this.code = code;
  }
}

/** A stored token that does not decrypt (wrong or changed MENU_MAIL_TOKEN_KEY): not the venue's fault, the connection stays. */
export class MenuMailKeyError extends Error {
  constructor() {
    super("mail_key");
    this.name = "MenuMailKeyError";
  }
}

/** A guest address a provider gets as a recipient: one plain address, nothing that could list or quote another. */
export function isPlainRecipient(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

/** A 401/403 from the mail API: the action refreshes the access token once and retries. */
export class MenuMailAuthError extends Error {
  constructor() {
    super("mail_auth");
    this.name = "MenuMailAuthError";
  }
}

export type MenuMailTokens = {
  accessToken: string;
  /** Microsoft rotates it on every refresh; Google sends one only on the first exchange. */
  refreshToken: string | null;
  expiresInSeconds: number;
  /** The granted scopes, when the provider says. */
  scope: string | null;
};

export type MenuMailMessage = { from: string; to: string; subject: string; body: string; now: Date };

export interface MenuMailProvider {
  readonly name: MenuMailProviderName;
  readonly scopes: readonly string[];
  /** The scope without which nothing can be sent. */
  readonly sendScope: string;
  authorizeUrl(args: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string;
  exchangeCode(args: {
    fetchImpl: FetchImpl;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): Promise<MenuMailTokens>;
  refresh(args: { fetchImpl: FetchImpl; clientId: string; clientSecret: string; refreshToken: string }): Promise<MenuMailTokens>;
  /** The verified address of the mailbox the person signed in with. */
  userEmail(args: { fetchImpl: FetchImpl; accessToken: string }): Promise<string>;
  send(args: { fetchImpl: FetchImpl; accessToken: string; message: MenuMailMessage }): Promise<{ providerMessageId: string | null }>;
  /** Best effort; never throws. */
  revoke(args: { fetchImpl: FetchImpl; token: string }): Promise<void>;
}

const EMAIL_PATTERN = /^[^\s<>"(),;:\\[\]@]+@[^\s<>"(),;:\\[\]@]+\.[^\s<>"(),;:\\[\]@]+$/;
const TOKEN_PATTERN = /^[\x21-\x7e]{1,8192}$/;

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A provider that does not answer within this time is "unavailable" (the action never hangs). */
const CALL_TIMEOUT_MS = 15_000;

async function call(fetchImpl: FetchImpl, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, redirect: "error", signal: controller.signal });
  } catch {
    throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
  } finally {
    clearTimeout(timer);
  }
}

/** The token endpoint answer: a rejected grant means the connection must be made again. */
async function tokenRequest(fetchImpl: FetchImpl, url: string, form: Record<string, string>, needRefresh: boolean): Promise<MenuMailTokens> {
  const response = await call(fetchImpl, url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const json = await readJson(response);
  if (!response.ok) {
    const error = json && typeof json.error === "string" ? json.error : "";
    if (error === "invalid_grant") throw new MenuMailProviderError(MAIL_ERROR.reconnectRequired);
    throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
  }
  const accessToken = json?.access_token;
  const refreshToken = json?.refresh_token;
  const expiresIn = json?.expires_in;
  if (typeof accessToken !== "string" || !TOKEN_PATTERN.test(accessToken)) {
    throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
  }
  const refresh = typeof refreshToken === "string" && TOKEN_PATTERN.test(refreshToken) ? refreshToken : null;
  if (needRefresh && refresh === null) throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
  const seconds = typeof expiresIn === "number" ? expiresIn : typeof expiresIn === "string" ? Number(expiresIn) : NaN;
  return {
    accessToken,
    refreshToken: refresh,
    expiresInSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 24 * 60 * 60) : 3_600,
    scope: typeof json?.scope === "string" ? json.scope : null,
  };
}

function cleanEmail(value: unknown): string {
  if (typeof value !== "string") throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
  return email;
}

/** 401/403 → refresh and retry; 429 → rate limited; anything else that is not 2xx → not sent. */
function sendFailure(status: number): Error {
  if (status === 401 || status === 403) return new MenuMailAuthError();
  if (status === 429) return new MenuMailProviderError(MAIL_ERROR.rateLimited);
  return new MenuMailProviderError(MAIL_ERROR.sendFailed);
}

function bearer(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

// -----------------------------------------------------------------------------
// Gmail
// -----------------------------------------------------------------------------

const GOOGLE_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

const gmail: MenuMailProvider = {
  name: "gmail",
  scopes: ["openid", "email", GOOGLE_SEND_SCOPE],
  sendScope: GOOGLE_SEND_SCOPE,
  authorizeUrl({ clientId, redirectUri, state, codeChallenge }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: gmail.scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },
  async exchangeCode({ fetchImpl, clientId, clientSecret, redirectUri, code, codeVerifier }) {
    return await tokenRequest(
      fetchImpl,
      "https://oauth2.googleapis.com/token",
      { grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code_verifier: codeVerifier },
      true,
    );
  },
  async refresh({ fetchImpl, clientId, clientSecret, refreshToken }) {
    return await tokenRequest(
      fetchImpl,
      "https://oauth2.googleapis.com/token",
      { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret },
      false,
    );
  },
  async userEmail({ fetchImpl, accessToken }) {
    const response = await call(fetchImpl, "https://openidconnect.googleapis.com/v1/userinfo", { headers: bearer(accessToken) });
    const json = response.ok ? await readJson(response) : null;
    if (!json || json.email_verified !== true) throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
    return cleanEmail(json.email);
  },
  async send({ fetchImpl, accessToken, message }) {
    const raw = gmailRawMessage({ from: message.from, to: message.to, subject: message.subject, body: message.body, date: message.now });
    const response = await call(fetchImpl, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!response.ok) throw sendFailure(response.status);
    const json = await readJson(response);
    const id = json?.id;
    return { providerMessageId: typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null };
  },
  async revoke({ fetchImpl, token }) {
    try {
      await call(fetchImpl, "https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch {
      // best effort
    }
  },
};

// -----------------------------------------------------------------------------
// Microsoft
// -----------------------------------------------------------------------------

const MICROSOFT_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send";
const MICROSOFT_LOGIN = "https://login.microsoftonline.com/common/oauth2/v2.0";

const microsoft: MenuMailProvider = {
  name: "microsoft",
  scopes: ["openid", "email", "offline_access", MICROSOFT_SEND_SCOPE],
  sendScope: MICROSOFT_SEND_SCOPE,
  authorizeUrl({ clientId, redirectUri, state, codeChallenge }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: microsoft.scopes.join(" "),
      prompt: "select_account",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${MICROSOFT_LOGIN}/authorize?${params.toString()}`;
  },
  async exchangeCode({ fetchImpl, clientId, clientSecret, redirectUri, code, codeVerifier }) {
    return await tokenRequest(
      fetchImpl,
      `${MICROSOFT_LOGIN}/token`,
      {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        scope: microsoft.scopes.join(" "),
      },
      true,
    );
  },
  async refresh({ fetchImpl, clientId, clientSecret, refreshToken }) {
    return await tokenRequest(
      fetchImpl,
      `${MICROSOFT_LOGIN}/token`,
      { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, scope: microsoft.scopes.join(" ") },
      false,
    );
  },
  async userEmail({ fetchImpl, accessToken }) {
    const response = await call(fetchImpl, "https://graph.microsoft.com/oidc/userinfo", { headers: bearer(accessToken) });
    const json = response.ok ? await readJson(response) : null;
    if (!json) throw new MenuMailProviderError(MAIL_ERROR.providerUnavailable);
    return cleanEmail(json.email);
  },
  async send({ fetchImpl, accessToken, message }) {
    const response = await call(fetchImpl, "https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "Text", content: message.body },
          toRecipients: [{ emailAddress: { address: message.to } }],
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) throw sendFailure(response.status);
    return { providerMessageId: null };
  },
  async revoke() {
    // Microsoft has no token revocation endpoint for this flow; the venue
    // removes the app in its account (the settings text says so).
  },
};

const PROVIDERS: Record<MenuMailProviderName, MenuMailProvider> = { gmail, microsoft };

export function menuMailProvider(name: MenuMailProviderName): MenuMailProvider {
  return PROVIDERS[name];
}

/** Whether the granted scopes (when the provider reports them) include sending. */
export function grantsSend(provider: MenuMailProvider, scope: string | null): boolean {
  if (scope === null) return true;
  return scope.split(/\s+/).some((granted) => granted.toLowerCase() === provider.sendScope.toLowerCase() || granted === "Mail.Send");
}
