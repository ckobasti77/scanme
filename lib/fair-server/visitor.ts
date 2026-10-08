import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { FAIR_GATEWAY_SECRET_MIN_LENGTH, FAIR_PII_PURGE_AT_MS } from "@/lib/fair-contract";

// =============================================================================
// Sajam automobila 2026 — B2 anonymous visitor identity (MASTER §5 "Anonimni
// identitet", BACKEND-HANDOFF §4.2). Server-only: route handlers import this;
// a client bundle cannot (the `server-only` import fails the build).
//
// Data flow:
//   1. /r/[cardCode] (fair_model) or POST /api/fair/visitor reads the HttpOnly
//      cookie `scanme_fair_visitor`; if absent or malformed it mints a fresh
//      token: 32 bytes (256 bits) from the CSPRNG, base64url (43 chars).
//   2. visitorHash = HMAC-SHA256(FAIR_VISITOR_HASH_SECRET,
//      "scanme-fair-visitor-v1:" + token) as lowercase hex (64 chars).
//   3. Only visitorHash goes to Convex (cards.resolveAndRecord, B3 gateway
//      mutations). The token stays in the cookie and in this request's memory:
//      it is never logged, never put in a URL/query, never sent to Convex and
//      never readable by client JS (HttpOnly).
//
// Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, expiring at
// FAIR_PII_PURGE_AT_MS (16 Nov 2026 00:00 Europe/Belgrade) — after the purge
// its random value links to nothing. Host-only unless FAIR_COOKIE_DOMAIN is
// set (e.g. `.scanme.rs`); the domain is a deploy-time choice, not code.
//
// Secret: FAIR_VISITOR_HASH_SECRET (≥32 chars, Next env only — Convex never
// needs it). Missing in production → no fair identity: the scan and redirect
// still work, only the fair row is skipped (`FAIR_VISITOR_SECRET_MISSING` is
// logged once, without PII). Missing in development → a clearly labeled
// DEV-ONLY fallback with a one-time warning.
//
// K1 — trust Next → Convex (`fairConvexVisitorForRequest`): every Convex call
// that carries a visitorHash also carries FAIR_GATEWAY_SECRET (≥32 chars, the
// same value in the Next env and on the Convex deployment of one environment)
// and `ipHash` = HMAC-SHA256(visitor secret, "scanme-fair-ip-v1:" + caller
// IP), the key of the per-IP new-identity bucket. Both are read from the
// server env / request here and go only into the Convex call: never to the
// browser, a URL or a log. There is no fallback for FAIR_GATEWAY_SECRET in
// any environment: missing → no fair Convex call (`FAIR_GATEWAY_SECRET_MISSING`
// logged once, without the value).
// =============================================================================

export const FAIR_VISITOR_COOKIE_NAME = "scanme_fair_visitor";

const TOKEN_BYTES = 32; // 256 bits
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_CONTEXT = "scanme-fair-visitor-v1:";
const MIN_SECRET_LENGTH = 32;
const DEV_ONLY_FALLBACK_SECRET = "scanme-fair-DEV-ONLY-visitor-secret--never-in-production";
// A registrable host, optionally with the leading dot (".scanme.rs").
const COOKIE_DOMAIN_PATTERN = /^\.?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export type FairVisitorEnv = {
  secret?: string;
  gatewaySecret?: string;
  cookieDomain?: string;
  nodeEnv?: string;
};

export function fairVisitorEnv(): FairVisitorEnv {
  return {
    secret: process.env.FAIR_VISITOR_HASH_SECRET,
    gatewaySecret: process.env.FAIR_GATEWAY_SECRET,
    cookieDomain: process.env.FAIR_COOKIE_DOMAIN,
    nodeEnv: process.env.NODE_ENV,
  };
}

export function generateFairVisitorToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isFairVisitorToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function fairVisitorHash(token: string, secret: string): string {
  return createHmac("sha256", secret).update(`${HASH_CONTEXT}${token}`).digest("hex");
}

export type FairVisitorSecret =
  | { secret: string; devFallback: boolean }
  | { problem: "FAIR_VISITOR_SECRET_MISSING" };

export function resolveFairVisitorSecret(env: FairVisitorEnv): FairVisitorSecret {
  const configured = env.secret?.trim();
  if (configured && configured.length >= MIN_SECRET_LENGTH) return { secret: configured, devFallback: false };
  if (env.nodeEnv === "production") return { problem: "FAIR_VISITOR_SECRET_MISSING" };
  return { secret: DEV_ONLY_FALLBACK_SECRET, devFallback: true };
}

/** FAIR_COOKIE_DOMAIN when it is a valid domain; otherwise host-only. */
export function fairCookieDomain(value: string | undefined): string | undefined {
  const domain = value?.trim().toLowerCase();
  return domain && COOKIE_DOMAIN_PATTERN.test(domain) ? domain : undefined;
}

/** The Set-Cookie value, or null once the purge moment has passed. Secure is omitted only for explicit HTTP DEV/LAN testing. */
export function fairVisitorCookieHeader(token: string, now: number, cookieDomain?: string, secure = true): string | null {
  const maxAge = Math.floor((FAIR_PII_PURGE_AT_MS - now) / 1000);
  if (maxAge <= 0) return null;
  const domain = fairCookieDomain(cookieDomain);
  return [
    `${FAIR_VISITOR_COOKIE_NAME}=${token}`,
    "Path=/",
    `Expires=${new Date(FAIR_PII_PURGE_AT_MS).toUTCString()}`,
    `Max-Age=${maxAge}`,
    ...(domain ? [`Domain=${domain}`] : []),
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
  ].join("; ");
}

/** The token from a Cookie request header, or null when absent/malformed. */
export function readFairVisitorCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== FAIR_VISITOR_COOKIE_NAME) continue;
    const value = part.slice(eq + 1).trim();
    if (isFairVisitorToken(value)) return value;
  }
  return null;
}

export type FairVisitorProblem = "FAIR_VISITOR_SECRET_MISSING" | "FAIR_GATEWAY_SECRET_MISSING" | "FAIR_VISITOR_EXPIRED";

export type FairVisitor =
  | { visitorHash: string; setCookie: string | null }
  | { visitorHash: null; setCookie: null; problem: FairVisitorProblem };

const warned = new Set<string>();
/** One `[fair] CODE` line per process — a stable code, never a token, hash, IP or secret. */
export function warnOnce(code: string, detail = "") {
  if (warned.has(code)) return;
  warned.add(code);
  console.warn(`[fair] ${code}${detail}`);
}

/**
 * The visitor of this request: the hash Convex may see, plus the Set-Cookie
 * to send when a token was just minted (null when the existing cookie is
 * reused). Never returns the token itself.
 */
export function fairVisitorForRequest(request: Request, now: number, env: FairVisitorEnv = fairVisitorEnv()): FairVisitor {
  const resolved = resolveFairVisitorSecret(env);
  if ("problem" in resolved) {
    warnOnce(resolved.problem);
    return { visitorHash: null, setCookie: null, problem: resolved.problem };
  }
  if (resolved.devFallback) {
    warnOnce("FAIR_VISITOR_SECRET_DEV_FALLBACK", ": FAIR_VISITOR_HASH_SECRET nije postavljen, koristi se DEV-ONLY ključ (nikad u produkciji).");
  }
  if (now >= FAIR_PII_PURGE_AT_MS) return { visitorHash: null, setCookie: null, problem: "FAIR_VISITOR_EXPIRED" };
  const existing = readFairVisitorCookie(request.headers.get("cookie"));
  const token = existing ?? generateFairVisitorToken();
  const secureCookie = env.nodeEnv === "production" || new URL(request.url).protocol === "https:";
  return {
    visitorHash: fairVisitorHash(token, resolved.secret),
    setCookie: existing ? null : fairVisitorCookieHeader(token, now, env.cookieDomain, secureCookie),
  };
}

const IP_HASH_CONTEXT = "scanme-fair-ip-v1:";

/** FAIR_GATEWAY_SECRET when configured (≥32 chars), else null. No fallback anywhere. */
export function fairGatewaySecret(env: FairVisitorEnv): string | null {
  const secret = env.gatewaySecret?.trim();
  return secret && secret.length >= FAIR_GATEWAY_SECRET_MIN_LENGTH ? secret : null;
}

/**
 * Rate-limit key for new identities: HMAC of the caller IP under the visitor
 * secret (Next-only, so Convex cannot reverse it). Same header as the card
 * resolver (`x-forwarded-for`, first entry, set by the platform).
 */
export function fairIpHash(request: Request, secret: string): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return createHmac("sha256", secret).update(`${IP_HASH_CONTEXT}${ip}`).digest("hex");
}

export type FairConvexVisitor =
  | { visitorHash: string; gatewaySecret: string; ipHash: string; setCookie: string | null }
  | { visitorHash: null; setCookie: null; problem: FairVisitorProblem };

/**
 * Everything a visitor-specific Convex call needs (K1): the visitor of this
 * request plus the gateway proof. Without FAIR_GATEWAY_SECRET there is no
 * fair Convex call at all (and no cookie is minted for it).
 */
export function fairConvexVisitorForRequest(request: Request, now: number, env: FairVisitorEnv = fairVisitorEnv()): FairConvexVisitor {
  const gatewaySecret = fairGatewaySecret(env);
  if (gatewaySecret === null) {
    warnOnce("FAIR_GATEWAY_SECRET_MISSING");
    return { visitorHash: null, setCookie: null, problem: "FAIR_GATEWAY_SECRET_MISSING" };
  }
  const visitor = fairVisitorForRequest(request, now, env);
  if (visitor.visitorHash === null) return visitor;
  // A hash exists, so the visitor secret resolved (fairVisitorForRequest checked it).
  const { secret } = resolveFairVisitorSecret(env) as { secret: string };
  return { ...visitor, gatewaySecret, ipHash: fairIpHash(request, secret) };
}
