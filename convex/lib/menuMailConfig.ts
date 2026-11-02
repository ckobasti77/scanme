// ScanMe Menu V1 (K26) — configuration of the venue mailbox (master §11.4;
// plan docs/meni/planovi/K24.md §3.3). Reads the Convex env and never throws:
// without the switch, a valid key and the callback URI nothing is available,
// and a provider is offered only with both of its client values. Names are in
// .env.example; values never live in the repo.

import { env } from "../_generated/server";
import { decodeAdminMailKey } from "./adminMailCrypto";

export const MENU_MAIL_CALLBACK_PATH = "/api/meni/mail/callback";

export const MENU_MAIL_PROVIDERS = ["gmail", "microsoft"] as const;
export type MenuMailProviderName = (typeof MENU_MAIL_PROVIDERS)[number];

export type MenuMailClient = { clientId: string; clientSecret: string };

export type MenuMailConfig = {
  /** 32 raw bytes of MENU_MAIL_TOKEN_KEY (its own key, never the Zoho one). */
  key: Uint8Array;
  redirectUri: string;
  clients: Partial<Record<MenuMailProviderName, MenuMailClient>>;
};

export type MenuMailAvailability = {
  available: boolean;
  providers: MenuMailProviderName[];
  reason: "not_configured" | null;
};

/** https (or http on localhost) and exactly the Next callback route, without a query or a fragment. */
export function validMenuMailRedirectUri(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname.replace(/\/$/, "") !== MENU_MAIL_CALLBACK_PATH) return null;
    return value;
  } catch {
    return null;
  }
}

function clientOf(id: string | undefined, secret: string | undefined): MenuMailClient | undefined {
  const clientId = id?.trim();
  const clientSecret = secret?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** The configuration, or null when the mailbox connection is switched off or incomplete. */
export function readMenuMailConfig(): MenuMailConfig | null {
  if (env.MENU_MAIL_ENABLED !== "true") return null;
  const key = decodeAdminMailKey(env.MENU_MAIL_TOKEN_KEY);
  const redirectUri = validMenuMailRedirectUri(env.MENU_MAIL_REDIRECT_URI);
  if (!key || !redirectUri) return null;
  const clients: MenuMailConfig["clients"] = {};
  const gmail = clientOf(env.MENU_MAIL_GOOGLE_CLIENT_ID, env.MENU_MAIL_GOOGLE_CLIENT_SECRET);
  const microsoft = clientOf(env.MENU_MAIL_MICROSOFT_CLIENT_ID, env.MENU_MAIL_MICROSOFT_CLIENT_SECRET);
  if (gmail) clients.gmail = gmail;
  if (microsoft) clients.microsoft = microsoft;
  if (!gmail && !microsoft) return null;
  return { key, redirectUri, clients };
}

export function menuMailAvailability(): MenuMailAvailability {
  const config = readMenuMailConfig();
  if (!config) return { available: false, providers: [], reason: "not_configured" };
  return { available: true, providers: MENU_MAIL_PROVIDERS.filter((name) => config.clients[name]), reason: null };
}
