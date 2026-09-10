import { createHmac, timingSafeEqual } from "node:crypto";

// The ordering guest cookie (RFC-004 §2.2, TASK-63). Server-only: this module
// uses node:crypto and must only be imported by route handlers.
//
// A deliberate FORK of lib/memories-guest-cookie.ts, not an import of it: the
// two identities are independent products with different cookie names and Path
// scopes, and forking keeps a change to one from silently reshaping the other
// (the Memories cookie is on a frozen path). The shape is identical on purpose.
//
// WHY THE COOKIE IS BUILT AT THE NEXT.JS LAYER — a hard requirement, not a
// preference: an HttpOnly cookie cannot be set from client JS by definition,
// and the Convex client cannot set cookies on the app's domain at all (Convex
// runs on its own origin). Only a Next route handler response can mint it. The
// HMAC is computed and verified HERE so Convex functions stay deterministic
// with no crypto in them.
//
// Value: `guestKey + "." + base64url(HMAC-SHA256(guestKey + ":" + code, SCANME_GUEST_SECRET))`.
// The guestKey is a base64url string of 256 random bits (convex/cards.ts) — the
// first segment IS that canonical string. The HMAC binds the key to one venue's
// ordering code, so a value cannot be replayed onto a different code's path, and
// a tampered value fails verification.
//
// The identity this cookie carries is the TABLE (the guest row stores cardId).
// It is a bearer capability, not a security boundary: anyone can clear cookies
// and become a new guest — by design. The only security property is that forging
// a SPECIFIC other guest's access requires their guestKey; possession is the
// capability.

export const ORDERING_COOKIE_MAX_AGE_SECONDS = 31536000; // 1 year

const GUEST_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAC_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function orderingCookieName(code: string) {
  return `scanme_order_${code}`;
}

function macFor(guestKey: string, code: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${guestKey}:${code}`)
    .digest("base64url");
}

export function buildOrderingCookieValue(
  guestKey: string,
  code: string,
  secret: string,
) {
  return `${guestKey}.${macFor(guestKey, code, secret)}`;
}

// Returns the verified guestKey, or null for anything malformed or forged.
// Constant-time MAC comparison; the shape checks bound the input first.
export function verifyOrderingCookieValue(
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

// The Set-Cookie header, attributes exactly per §2.2:
// HttpOnly; Secure; SameSite=Lax; Path=/o/{code}; Max-Age=31536000.
//  - HttpOnly: client JS never reads it.
//  - Path=/o/{code}: the browser only presents it to that venue's ordering
//    routes — which is also why the /r hop can never SEE an existing cookie and
//    always mints a fresh guest carrying the scanning card's cardId.
//  - SameSite=Lax: survives the top-level redirect navigation from /r.
export function orderingCookieHeader(code: string, value: string) {
  return `${orderingCookieName(code)}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/o/${code}; Max-Age=${ORDERING_COOKIE_MAX_AGE_SECONDS}`;
}
