import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { FAIR_PII_PURGE_AT_MS } from "@/lib/fair-contract";

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
  cookieDomain?: string;
  nodeEnv?: string;
};

export function fairVisitorEnv(): FairVisitorEnv {
  return {
    secret: process.env.FAIR_VISITOR_HASH_SECRET,
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

export type FairVisitorProblem = "FAIR_VISITOR_SECRET_MISSING" | "FAIR_VISITOR_EXPIRED";

export type FairVisitor =
  | { visitorHash: string; setCookie: string | null }
  | { visitorHash: null; setCookie: null; problem: FairVisitorProblem };

const warned = new Set<string>();
function warnOnce(code: string, detail = "") {
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
