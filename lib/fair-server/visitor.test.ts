// Sajam 2026 B2 — anonymous visitor cookie and HMAC (MASTER §5 "Anonimni
// identitet", BACKEND-HANDOFF §4.2, §12 "Identitet i scanovi").

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FAIR_PII_PURGE_AT_MS, isFairVisitorHash } from "@/lib/fair-contract";

vi.mock("server-only", () => ({}));
const {
  FAIR_VISITOR_COOKIE_NAME,
  fairCookieDomain,
  fairVisitorCookieHeader,
  fairVisitorForRequest,
  fairVisitorHash,
  generateFairVisitorToken,
  readFairVisitorCookie,
  resolveFairVisitorSecret,
} = await import("./visitor");

const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const PROD = { secret: SECRET, nodeEnv: "production" };

const request = (cookie?: string) =>
  new Request("https://scanme.rs/r/ABCD2345", cookie ? { headers: { cookie } } : undefined);

afterEach(() => vi.restoreAllMocks());

describe("visitor token", () => {
  test("is 256 bits of CSPRNG output, base64url, never repeating", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const token = generateFairVisitorToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      tokens.add(token);
    }
    expect(tokens.size).toBe(1000);
  });
});

describe("visitor hash", () => {
  test("is a keyed, domain-separated HMAC-SHA256 as lowercase 64-hex", () => {
    const token = generateFairVisitorToken();
    const hash = fairVisitorHash(token, SECRET);
    expect(isFairVisitorHash(hash)).toBe(true);
    expect(hash).toBe(createHmac("sha256", SECRET).update(`scanme-fair-visitor-v1:${token}`).digest("hex"));
    expect(fairVisitorHash(token, SECRET)).toBe(hash);
    expect(fairVisitorHash(token, `${SECRET}-other`)).not.toBe(hash);
    expect(fairVisitorHash(generateFairVisitorToken(), SECRET)).not.toBe(hash);
    // A bare SHA-256 of the token (no server secret) must not equal it.
    expect(createHmac("sha256", "").update(token).digest("hex")).not.toBe(hash);
    expect(hash).not.toContain(token);
  });

  test("the secret: env value in production, refusal when missing or weak, labeled DEV-ONLY fallback otherwise", () => {
    expect(resolveFairVisitorSecret(PROD)).toEqual({ secret: SECRET, devFallback: false });
    expect(resolveFairVisitorSecret({ nodeEnv: "production" })).toEqual({ problem: "FAIR_VISITOR_SECRET_MISSING" });
    expect(resolveFairVisitorSecret({ nodeEnv: "production", secret: "short" })).toEqual({ problem: "FAIR_VISITOR_SECRET_MISSING" });
    const dev = resolveFairVisitorSecret({ nodeEnv: "development" });
    expect(dev).toMatchObject({ devFallback: true });
    expect("secret" in dev && dev.secret).toContain("DEV-ONLY");
  });
});

describe("visitor cookie", () => {
  test("is HttpOnly; Secure; SameSite=Lax; Path=/ and expires no later than 16 Nov 2026 (Belgrade)", () => {
    const header = fairVisitorCookieHeader("t".repeat(43), NOW)!;
    const parts = header.split("; ");
    expect(parts[0]).toBe(`${FAIR_VISITOR_COOKIE_NAME}=${"t".repeat(43)}`);
    expect(parts).toEqual(expect.arrayContaining(["Path=/", "HttpOnly", "Secure", "SameSite=Lax"]));
    expect(parts).toContain(`Expires=${new Date(FAIR_PII_PURGE_AT_MS).toUTCString()}`);
    expect(new Date(FAIR_PII_PURGE_AT_MS).toISOString()).toBe("2026-11-15T23:00:00.000Z");
    const maxAge = Number(parts.find((part) => part.startsWith("Max-Age="))!.slice("Max-Age=".length));
    expect(NOW + maxAge * 1000).toBeLessThanOrEqual(FAIR_PII_PURGE_AT_MS);
    expect(parts.some((part) => part.startsWith("Domain="))).toBe(false);
    expect(fairVisitorCookieHeader("t".repeat(43), FAIR_PII_PURGE_AT_MS)).toBeNull();
  });

  test("the domain comes only from FAIR_COOKIE_DOMAIN and must be a plain domain", () => {
    expect(fairVisitorCookieHeader("t".repeat(43), NOW, ".scanme.rs")).toContain("; Domain=.scanme.rs;");
    expect(fairCookieDomain("")).toBeUndefined();
    expect(fairCookieDomain("scanme.rs; HttpOnly")).toBeUndefined();
    expect(fairCookieDomain("localhost")).toBeUndefined();
    expect(fairCookieDomain(" .ScanMe.rs ")).toBe(".scanme.rs");
  });

  test("reading picks the fair cookie and rejects malformed values", () => {
    const token = generateFairVisitorToken();
    expect(readFairVisitorCookie(`a=1; ${FAIR_VISITOR_COOKIE_NAME}=${token}; b=2`)).toBe(token);
    expect(readFairVisitorCookie(`${FAIR_VISITOR_COOKIE_NAME}=${token}x`)).toBeNull();
    expect(readFairVisitorCookie(`${FAIR_VISITOR_COOKIE_NAME}=<script>`)).toBeNull();
    expect(readFairVisitorCookie(`other_${FAIR_VISITOR_COOKIE_NAME}=${token}`)).toBeNull();
    expect(readFairVisitorCookie(null)).toBeNull();
  });
});

describe("fairVisitorForRequest (the only entry the route handlers use)", () => {
  test("first contact mints a token into Set-Cookie and returns only its hash", () => {
    const visitor = fairVisitorForRequest(request(), NOW, PROD);
    expect(visitor.visitorHash).toMatch(/^[0-9a-f]{64}$/);
    const token = /^scanme_fair_visitor=([^;]+);/.exec(visitor.setCookie!)![1];
    expect(visitor.visitorHash).toBe(fairVisitorHash(token, SECRET));
    // The token exists only inside the Set-Cookie header.
    expect(JSON.stringify({ ...visitor, setCookie: undefined })).not.toContain(token);
  });

  test("an existing cookie is reused (same hash, no new cookie); a tampered one is replaced", () => {
    const token = generateFairVisitorToken();
    const again = fairVisitorForRequest(request(`${FAIR_VISITOR_COOKIE_NAME}=${token}`), NOW, PROD);
    expect(again).toEqual({ visitorHash: fairVisitorHash(token, SECRET), setCookie: null });
    const tampered = fairVisitorForRequest(request(`${FAIR_VISITOR_COOKIE_NAME}=forged`), NOW, PROD);
    expect(tampered.setCookie).toMatch(/^scanme_fair_visitor=[A-Za-z0-9_-]{43}; /);
  });

  test("production without the secret: no identity, no cookie, one log line without PII", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const token = generateFairVisitorToken();
    const visitor = fairVisitorForRequest(request(`${FAIR_VISITOR_COOKIE_NAME}=${token}`), NOW, { nodeEnv: "production" });
    expect(visitor).toEqual({ visitorHash: null, setCookie: null, problem: "FAIR_VISITOR_SECRET_MISSING" });
    fairVisitorForRequest(request(), NOW, { nodeEnv: "production" });
    const logged = warn.mock.calls.map((call) => call.join(" "));
    expect(logged).toEqual(["[fair] FAIR_VISITOR_SECRET_MISSING"]);
    expect(logged.join()).not.toContain(token);
  });

  test("after the purge moment no identity is minted", () => {
    expect(fairVisitorForRequest(request(), FAIR_PII_PURGE_AT_MS, PROD)).toEqual({
      visitorHash: null, setCookie: null, problem: "FAIR_VISITOR_EXPIRED",
    });
  });
});
