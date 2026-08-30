import { createHmac, timingSafeEqual } from "node:crypto";

// The Memories guest cookie (RFC-001 §2.6, TASK-14). Server-only: this module
// uses node:crypto and must only be imported by route handlers.
//
// WHY THE COOKIE IS BUILT AT THE NEXT.JS LAYER — a hard requirement, not a
// preference: an HttpOnly cookie cannot be set from client JS by definition,
// and the Convex client cannot set cookies on the app's domain at all (Convex
// runs on its own origin; a Set-Cookie there would never be first-party here).
// Only a Next route handler response can mint it. The HMAC is likewise
// computed and verified HERE so Convex functions stay deterministic and
// cacheable with no crypto in them.
//
// Value: `base64url(guestKey) + "." + base64url(HMAC-SHA256(guestKey + ":" + spaceCode, SCANME_GUEST_SECRET))`.
// The guestKey is generated as a base64url string of 256 random bits
// (convex/cards.ts) — the first segment IS that canonical string. The HMAC
// binds the key to one space's code, so a value cannot be replayed onto a
// different space's path, and a tampered value fails verification.
//
// The quota this identity carries is a SOFT limit, not a security boundary:
// anyone can clear cookies and become a new guest — by design. The only
// security property is that forging a SPECIFIC other guest's access requires
// their guestKey; possession is the capability.

export const GUEST_COOKIE_MAX_AGE_SECONDS = 31536000; // 1 year, per constraint

const GUEST_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAC_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function guestCookieName(code: string) {
  return `scanme_guest_${code}`;
}

function macFor(guestKey: string, code: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${guestKey}:${code}`)
    .digest("base64url");
}

export function buildGuestCookieValue(
  guestKey: string,
  code: string,
  secret: string,
) {
  return `${guestKey}.${macFor(guestKey, code, secret)}`;
}

// Returns the verified guestKey, or null for anything malformed or forged.
// Constant-time MAC comparison; the shape checks bound the input first.
export function verifyGuestCookieValue(
  value: string,
  code: string,
  secret: string,
): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const guestKey = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!GUEST_KEY_PATTERN.test(guestKey) || !MAC_PATTERN.test(mac)) return null;
  const expected = macFor(guestKey, code, secret);
  const provided = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length) return null;
  if (!timingSafeEqual(provided, wanted)) return null;
  return guestKey;
}

// The Set-Cookie header, attributes exactly per the constraint:
// HttpOnly; Secure; SameSite=Lax; Path=/m/{code}; Max-Age=31536000.
//  - HttpOnly: client JS never reads it (the localStorage mirror is the
//    client-visible copy, written by the guest UI).
//  - Path=/m/{code}: the browser only presents it to that space's routes —
//    which is also why the /r resolver can never SEE an existing cookie and
//    always mints a fresh guest; the mirror-restore path recovers the original.
//  - SameSite=Lax: survives the top-level redirect navigation from /r.
export function guestCookieHeader(code: string, value: string) {
  return `${guestCookieName(code)}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/m/${code}; Max-Age=${GUEST_COOKIE_MAX_AGE_SECONDS}`;
}
