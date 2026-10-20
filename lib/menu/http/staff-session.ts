// ScanMe Menu V1 (K22) — the sign-in route of the waiter panel:
// /[slug]/konobar/[kod]/sesija (master §10.6; plan docs/meni/planovi/K19.md
// §4.3, K19-4, K19-13…K19-15).
//
//   POST {pin}  → menuWaiter.loginWithPin with the device cookie and an IP
//                 hash → Set-Cookie smk_s (the 12-hour sign-in) and smk_d (the
//                 device, 180 days) → JSON. A wrong PIN still sets smk_d, so
//                 the device keeps its own counter across attempts.
//   DELETE      → menuWaiter.logout → the session cookie is cleared.
//
// Both cookies are HttpOnly; Secure; SameSite=Lax, scoped to /{slug}/konobar
// and signed with SCANME_GUEST_SECRET over a context bound to the venue, so a
// value copied to another venue fails. The raw session token also goes back
// in the JSON body: the panel's live subscriptions carry it (the RFC-004
// panel discipline); the cookie lets a device that reloads stay signed in.
//
// `(request, deps) => Response`, tested without Next or Convex; the route
// file only wires the dependencies. Every answer is no-store.

import {
  cookieHeader,
  readCookie,
  signCookieValue,
  verifyCookieValue,
} from "../signed-cookie";
import { waiterCookiePath } from "../panel-code";

export const STAFF_SESSION_COOKIE = "smk_s";
export const STAFF_DEVICE_COOKIE = "smk_d";
/** 12 hours, like the session on the server (master §10.6). */
export const STAFF_SESSION_MAX_AGE_S = 12 * 60 * 60;
/** 180 days. */
export const STAFF_DEVICE_MAX_AGE_S = 180 * 24 * 60 * 60;

export function staffSessionCookieContext(slug: string): string {
  return `${STAFF_SESSION_COOKIE}:${slug}`;
}

export function staffDeviceCookieContext(slug: string): string {
  return `${STAFF_DEVICE_COOKIE}:${slug}`;
}

/** What menuWaiter.loginWithPin answers (structurally; lib/menu does not import Convex). */
export type StaffLoginOutcome =
  | { ok: true; sessionToken: string; deviceToken: string; expiresAt: number; displayName: string }
  | { ok: false; code: "staff/panel_not_found" }
  | { ok: false; code: "staff/pin_unavailable" }
  | { ok: false; code: "staff/rate_limited"; deviceToken: string; retryAt: number | null }
  | { ok: false; code: "staff/locked"; deviceToken: string; lockedUntil: number }
  | { ok: false; code: "staff/wrong_pin"; deviceToken: string; attemptsLeft: number };

export type StaffSessionDeps = {
  /** menuWaiter.loginWithPin over HTTP; may throw (network). */
  login(input: { slug: string; panelCode: string; pin: string; deviceToken?: string; ipHash: string }): Promise<StaffLoginOutcome>;
  /** menuWaiter.logout over HTTP; may throw (network). */
  logout(input: { slug: string; panelCode: string; sessionToken: string }): Promise<unknown>;
  /** SCANME_GUEST_SECRET; null = the panel cannot keep a sign-in (503). */
  secret: string | null;
  /** The salted IP hash of the resolver (resolverIpHash). */
  ipHash: string;
};

/** Why a sign-in answer is a refusal: the Convex code, or a problem of the request itself. */
export type StaffSessionErrorCode =
  | Extract<StaffLoginOutcome, { ok: false }>["code"]
  | "invalid_request"
  | "unavailable"
  | "network"
  | "forbidden";

/** The JSON body of a sign-in answer (what the PIN screen reads). */
export type StaffSessionBody =
  | { ok: true; sessionToken: string; expiresAt: number; displayName: string }
  | { ok: false; code: StaffSessionErrorCode; attemptsLeft?: number; lockedUntil?: number; retryAt?: number | null };

const NO_STORE: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

function json(status: number, body: object, cookies: readonly string[] = []): Response {
  const headers = new Headers({ ...NO_STORE, "Content-Type": "application/json; charset=utf-8" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * A POST or DELETE from another site is refused: the browser always sends
 * `Origin` on them, and SameSite=Lax alone would still let a cross-site form
 * post a PIN guess.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function deviceCookie(slug: string, deviceToken: string, secret: string): Promise<string> {
  return cookieHeader(STAFF_DEVICE_COOKIE, await signCookieValue(deviceToken, secret, staffDeviceCookieContext(slug)), {
    path: waiterCookiePath(slug),
    maxAgeS: STAFF_DEVICE_MAX_AGE_S,
  });
}

/** The verified raw session token of this venue's cookie, or null. */
export async function readStaffSessionToken(
  cookieHeaderValue: string | null | undefined,
  slug: string,
  secret: string | null,
): Promise<string | null> {
  if (!secret) return null;
  return await verifyCookieValue(readCookie(cookieHeaderValue, STAFF_SESSION_COOKIE), secret, staffSessionCookieContext(slug));
}

export async function handleStaffLogin(
  request: Request,
  params: { slug: string; panelCode: string },
  deps: StaffSessionDeps,
): Promise<Response> {
  if (!sameOrigin(request)) return json(403, { ok: false, code: "forbidden" });
  if (!deps.secret) return json(503, { ok: false, code: "unavailable" });

  let pin: unknown;
  try {
    pin = ((await request.json()) as { pin?: unknown } | null)?.pin;
  } catch {
    return json(400, { ok: false, code: "invalid_request" });
  }
  if (typeof pin !== "string" || pin.length === 0 || pin.length > 8) {
    return json(400, { ok: false, code: "invalid_request" });
  }

  const deviceToken = await verifyCookieValue(
    readCookie(request.headers.get("cookie"), STAFF_DEVICE_COOKIE),
    deps.secret,
    staffDeviceCookieContext(params.slug),
  );

  let outcome: StaffLoginOutcome;
  try {
    outcome = await deps.login({
      slug: params.slug,
      panelCode: params.panelCode,
      pin,
      ipHash: deps.ipHash,
      ...(deviceToken ? { deviceToken } : {}),
    });
  } catch {
    return json(502, { ok: false, code: "network" });
  }

  if (outcome.ok) {
    const session = cookieHeader(
      STAFF_SESSION_COOKIE,
      await signCookieValue(outcome.sessionToken, deps.secret, staffSessionCookieContext(params.slug)),
      { path: waiterCookiePath(params.slug), maxAgeS: STAFF_SESSION_MAX_AGE_S },
    );
    return json(
      200,
      { ok: true, sessionToken: outcome.sessionToken, expiresAt: outcome.expiresAt, displayName: outcome.displayName },
      [session, await deviceCookie(params.slug, outcome.deviceToken, deps.secret)],
    );
  }

  switch (outcome.code) {
    case "staff/panel_not_found":
      return json(404, { ok: false, code: outcome.code });
    case "staff/pin_unavailable":
      return json(503, { ok: false, code: outcome.code });
    case "staff/rate_limited":
      return json(429, { ok: false, code: outcome.code, retryAt: outcome.retryAt }, [
        await deviceCookie(params.slug, outcome.deviceToken, deps.secret),
      ]);
    case "staff/locked":
      return json(423, { ok: false, code: outcome.code, lockedUntil: outcome.lockedUntil }, [
        await deviceCookie(params.slug, outcome.deviceToken, deps.secret),
      ]);
    case "staff/wrong_pin":
      return json(401, { ok: false, code: outcome.code, attemptsLeft: outcome.attemptsLeft }, [
        await deviceCookie(params.slug, outcome.deviceToken, deps.secret),
      ]);
    default:
      // A code this handler does not know (a newer Convex deploy): no cookie, no claim.
      return json(502, { ok: false, code: "network" });
  }
}

export async function handleStaffLogout(
  request: Request,
  params: { slug: string; panelCode: string },
  deps: Pick<StaffSessionDeps, "logout" | "secret">,
): Promise<Response> {
  if (!sameOrigin(request)) return json(403, { ok: false, code: "forbidden" });
  const cleared = cookieHeader(STAFF_SESSION_COOKIE, "", { path: waiterCookiePath(params.slug), maxAgeS: 0 });
  const sessionToken = await readStaffSessionToken(request.headers.get("cookie"), params.slug, deps.secret);
  if (sessionToken) {
    try {
      await deps.logout({ slug: params.slug, panelCode: params.panelCode, sessionToken });
    } catch {
      // The cookie is cleared anyway; the server session still ends at 12 h.
    }
  }
  return json(200, { ok: true }, [cleared]);
}
