// ScanMe Menu V1 (K20) — the guest cookies of the Menu (plan K19 §1, K19-4).
//
//   smm_g  guest session (a scanned position), Path=/{slug}/meni, 3 h
//   smm_d  guest device (Moji zahtevi, K21/K25), 180 days, set TWICE:
//          Path=/{slug}/meni (the menu reads it) and Path=/r (the card hop
//          reads it, so scanning again keeps the same device)
//
// Values are `<token>.<hmac>`: HMAC-SHA256 with SCANME_GUEST_SECRET over the
// cookie's context (name and venue), so a value copied into another cookie or
// another venue fails verification. All cookies are HttpOnly; Secure;
// SameSite=Lax. Pure Web Crypto, no imports.

export const MENU_GUEST_SESSION_COOKIE = "smm_g";
export const MENU_GUEST_DEVICE_COOKIE = "smm_d";
/** 3 hours (the session itself expires on the server at the same time). */
export const MENU_GUEST_SESSION_MAX_AGE_S = 3 * 60 * 60;
/** 180 days. */
export const MENU_GUEST_DEVICE_MAX_AGE_S = 180 * 24 * 60 * 60;
/** Path of the device copy the card hop reads. */
export const MENU_HOP_COOKIE_PATH = "/r";

const SIGNED_PATTERN = /^([A-Za-z0-9_-]{16,128})\.([A-Za-z0-9_-]{16,64})$/;
const COOKIE_NAME_PATTERN = /^[a-z_]+$/;

function base64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/** The signing context of the session cookie: bound to the venue. */
export function sessionCookieContext(slug: string): string {
  return `${MENU_GUEST_SESSION_COOKIE}:${slug}`;
}

/** The signing context of the device cookie: one device key per browser. */
export function deviceCookieContext(): string {
  return MENU_GUEST_DEVICE_COOKIE;
}

export async function signCookieValue(value: string, secret: string, context: string): Promise<string> {
  return `${value}.${await hmac(secret, `${context}:${value}`)}`;
}

/** The value inside a signed cookie, or null for a malformed or forged one. */
export async function verifyCookieValue(
  signed: string | null | undefined,
  secret: string,
  context: string,
): Promise<string | null> {
  if (!signed || signed.length > 256 || !secret) return null;
  const match = SIGNED_PATTERN.exec(signed);
  if (!match) return null;
  const [, value, mac] = match;
  const expected = await hmac(secret, `${context}:${value}`);
  return constantTimeEqual(mac, expected) ? value : null;
}

/** The menu path of a venue, the Path of its guest cookies. */
export function guestMenuPath(slug: string): string {
  return `/${slug}/meni`;
}

export function cookieHeader(
  name: string,
  value: string,
  options: { path: string; maxAgeS: number },
): string {
  if (!COOKIE_NAME_PATTERN.test(name)) throw new Error("invalid cookie name");
  return `${name}=${value}; Path=${options.path}; Max-Age=${options.maxAgeS}; HttpOnly; Secure; SameSite=Lax`;
}

/** The first value of a cookie in a `Cookie:` request header, or null. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}
