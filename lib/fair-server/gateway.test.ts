// Sajam 2026 B2 — the same-origin POST gateway (BACKEND-HANDOFF §4.2, §7):
// same-origin writes, bounded body, no-store, errors without token/contact.

import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { FAIR_GATEWAY_MAX_BODY_BYTES, fairGatewayRequest, handleFairVisitorBootstrap, isSameOriginRequest } = await import("./gateway");
const { FAIR_VISITOR_COOKIE_NAME, generateFairVisitorToken } = await import("./visitor");

const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const PROD = { secret: "test-fair-visitor-secret-0123456789abcdef", nodeEnv: "production" };
const URL_ = "https://scanme.rs/api/fair/visitor";

function post(headers: Record<string, string>, body?: BodyInit) {
  return new Request(URL_, { method: "POST", headers, body });
}
const sameOrigin = { "sec-fetch-site": "same-origin" };

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.json()).toEqual({ ok: false, code });
}

describe("same-origin check", () => {
  test("Sec-Fetch-Site decides when present; otherwise Origin must equal this origin", () => {
    expect(isSameOriginRequest(post(sameOrigin))).toBe(true);
    expect(isSameOriginRequest(post({ "sec-fetch-site": "cross-site", origin: "https://scanme.rs" }))).toBe(false);
    expect(isSameOriginRequest(post({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isSameOriginRequest(post({ origin: "https://scanme.rs" }))).toBe(true);
    expect(isSameOriginRequest(post({ referer: "https://scanme.rs/sajam/elektromobilnost-2026" }))).toBe(true);
    expect(isSameOriginRequest(new Request("http://localhost:3000/api/fair/visitor", {
      method: "POST",
      headers: { host: "192.168.1.10:3000", referer: "http://192.168.1.10:3000/sajam/elektromobilnost-2026/pasosi" },
    }))).toBe(true);
    expect(isSameOriginRequest(post({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(post({ referer: "https://evil.example/sajam" }))).toBe(false);
    expect(isSameOriginRequest(post({}))).toBe(false);
  });

  test("a cross-site write is refused before anything else happens", async () => {
    await expectError(await handleFairVisitorBootstrap(post({ origin: "https://evil.example" }), NOW, PROD), 403, "ORIGIN_NOT_ALLOWED");
  });
});

describe("bounded body", () => {
  test("declared and streamed oversize bodies are refused; bad JSON is INVALID_INPUT", async () => {
    const big = "x".repeat(FAIR_GATEWAY_MAX_BODY_BYTES + 1);
    const declared = await fairGatewayRequest(post({ ...sameOrigin, "content-length": String(big.length) }, big));
    expect(declared.ok).toBe(false);
    if (!declared.ok) await expectError(declared.response, 413, "PAYLOAD_TOO_LARGE");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const streamed = await fairGatewayRequest(
      new Request(URL_, { method: "POST", headers: sameOrigin, body: stream, duplex: "half" } as RequestInit),
    );
    expect(streamed.ok).toBe(false);
    if (!streamed.ok) await expectError(streamed.response, 413, "PAYLOAD_TOO_LARGE");

    const broken = await fairGatewayRequest(post(sameOrigin, "{nije json"));
    expect(broken.ok).toBe(false);
    if (!broken.ok) await expectError(broken.response, 400, "INVALID_INPUT");

    expect(await fairGatewayRequest(post(sameOrigin, '{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
    expect(await fairGatewayRequest(post(sameOrigin))).toEqual({ ok: true, value: {} });
  });

  test("the bootstrap accepts only an empty or object body of at most 1 KB", async () => {
    await expectError(await handleFairVisitorBootstrap(post(sameOrigin, "[]"), NOW, PROD), 400, "INVALID_INPUT");
    await expectError(await handleFairVisitorBootstrap(post(sameOrigin, JSON.stringify({ x: "y".repeat(1100) })), NOW, PROD), 413, "PAYLOAD_TOO_LARGE");
  });
});

describe("POST /api/fair/visitor bootstrap", () => {
  test("mints the HttpOnly cookie once; the body never carries the token or its hash", async () => {
    const response = await handleFairVisitorBootstrap(post(sameOrigin, "{}"), NOW, PROD);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^scanme_fair_visitor=[A-Za-z0-9_-]{43}; Path=\/; Expires=Sun, 15 Nov 2026 23:00:00 GMT; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/);
    const token = /^scanme_fair_visitor=([^;]+);/.exec(cookie)![1];
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(text).not.toContain(token);

    const again = await handleFairVisitorBootstrap(post({ ...sameOrigin, cookie: `${FAIR_VISITOR_COOKIE_NAME}=${generateFairVisitorToken()}` }), NOW, PROD);
    expect(again.status).toBe(200);
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  test("production without the secret answers VISITOR_UNAVAILABLE and sets nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expectError(await handleFairVisitorBootstrap(post(sameOrigin), NOW, { nodeEnv: "production" }), 503, "VISITOR_UNAVAILABLE");
  });
});
