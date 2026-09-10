import { createHmac, timingSafeEqual } from "node:crypto";

// The waiter panel's shift cookie (RFC-004 §2.7, TASK-68). Server-only: this
// module uses node:crypto and must only be imported by route handlers and
// server components.
//
// A deliberate FORK of lib/ordering-guest-cookie.ts ("the guest-cookie
// discipline, adapted", §2.7), not an import of it: a different cookie name, a
// different Path scope, a different bearer shape, and no shared file whose edit
// could silently reshape the guest's identity.
//
// WHY THE COOKIE IS BUILT AT THE NEXT.JS LAYER: an HttpOnly cookie cannot be
// set from client JS, and Convex runs on its own origin. openShift (TASK-65)
// therefore returns the RAW bearer to the caller precisely so that a Next route
// handler can put it in this cookie. The HMAC is computed and verified HERE;
// Convex only ever sees the bearer as a mutation/query argument and compares
// its SHA-256 against orderingShifts.bearerHash.
//
// Value: `bearer + "." + base64url(HMAC-SHA256(bearer + ":" + code, SCANME_GUEST_SECRET))`.
// The bearer is 32 random bytes as 64 hex chars (orderingShifts.mintBearer).
// The HMAC binds it to one venue's code, so a value cannot be replayed onto
// another venue's panel path, and a tampered value fails verification.
//
// The PIN is a floor convenience and this cookie is a bearer capability; the
// real boundary is physical possession of the till-side tablet (§2.7, risk #6).

// A shift is a working day. Placeholder awaiting the owner (docs/tasks/BLOCKED.md).
export const SHIFT_COOKIE_MAX_AGE_SECONDS = 86400; // 24 h

const BEARER_PATTERN = /^[0-9a-f]{64}$/;
const MAC_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function shiftCookieName(code: string) {
  return `scanme_shift_${code}`;
}

function macFor(bearer: string, code: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${bearer}:${code}`)
    .digest("base64url");
}

export function buildShiftCookieValue(
  bearer: string,
  code: string,
  secret: string,
) {
  return `${bearer}.${macFor(bearer, code, secret)}`;
}

// Returns the verified bearer, or null for anything malformed or forged.
// Constant-time MAC comparison; the shape checks bound the input first.
export function verifyShiftCookieValue(
  value: string,
  code: string,
  secret: string,
): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const bearer = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!BEARER_PATTERN.test(bearer) || !MAC_PATTERN.test(mac)) return null;
  const expected = macFor(bearer, code, secret);
  const provided = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length) return null;
  if (!timingSafeEqual(provided, wanted)) return null;
  return bearer;
}

// HttpOnly; Secure; SameSite=Lax; Path=/panel/{code}; Max-Age=86400.
//  - HttpOnly: client JS never reads it; the page's server component verifies
//    it and hands the bearer to the client component as a prop (the exact
//    guestKey discipline of app/o/[code]).
//  - Path=/panel/{code}: presented only to that venue's panel routes,
//    including the session route beneath it.
export function shiftCookieHeader(code: string, value: string) {
  return `${shiftCookieName(code)}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/panel/${code}; Max-Age=${SHIFT_COOKIE_MAX_AGE_SECONDS}`;
}

// Max-Age=0 with the identical name and Path: the browser drops it.
export function clearShiftCookieHeader(code: string) {
  return `${shiftCookieName(code)}=; HttpOnly; Secure; SameSite=Lax; Path=/panel/${code}; Max-Age=0`;
}
