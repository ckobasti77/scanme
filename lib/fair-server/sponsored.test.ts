// Sajam 2026 B5 — the garage sponsored action gateway POST
// /api/fair/sponsored-action (BACKEND-HANDOFF §4.2, §5.7; JOVAN-DELTA §2):
// same-origin, strict bounded body, only `garage` + `open_model | garage_add`,
// visitor hash only from the HttpOnly cookie, stable codes, no-store.

import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { handleFairSponsoredAction } = await import("./sponsored");
const { FAIR_VISITOR_COOKIE_NAME, fairIpHash, fairVisitorHash, generateFairVisitorToken } = await import("./visitor");

const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
// K1: a TEST gateway secret (not a real value); the gateway sends it to Convex.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const ENV = { secret: SECRET, gatewaySecret: GATEWAY_SECRET, nodeEnv: "production" };
const BODY = { eventModelId: "m1", surface: "garage", kind: "open_model", requestId: "test-gateway-request-1" };
const RESULT = { eventModelId: "m1", kind: "open_model" as const, recordedAt: NOW, duplicate: false };

function post(body: unknown, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  return new Request("https://scanme.rs/api/fair/sponsored-action", { method: "POST", headers, body: JSON.stringify(body) });
}

function backend(impl?: () => Promise<typeof RESULT>) {
  return { recordSponsoredAction: vi.fn(impl ?? (async () => RESULT)) };
}

describe("POST /api/fair/sponsored-action", () => {
  test("the backend gets the HMAC of a new cookie and the strict body", async () => {
    const fake = backend();
    const response = await handleFairSponsoredAction(post(BODY), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, value: RESULT });
    const token = response.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    expect(fake.recordSponsoredAction).toHaveBeenCalledWith({ gatewaySecret: GATEWAY_SECRET, ipHash: fairIpHash(post(BODY), SECRET), visitorHash: fairVisitorHash(token, SECRET), ...BODY });
    expect(JSON.stringify(fake.recordSponsoredAction.mock.calls)).not.toContain(token);
  });

  test("an existing cookie is reused; garage_add passes", async () => {
    const fake = backend();
    const token = generateFairVisitorToken();
    const headers = { "sec-fetch-site": "same-origin", cookie: `${FAIR_VISITOR_COOKIE_NAME}=${token}` };
    const response = await handleFairSponsoredAction(post({ ...BODY, kind: "garage_add" }, headers), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fake.recordSponsoredAction).toHaveBeenCalledWith({ gatewaySecret: GATEWAY_SECRET, ipHash: fairIpHash(post(BODY), SECRET), visitorHash: fairVisitorHash(token, SECRET), ...BODY, kind: "garage_add" });
  });

  test("map/display surfaces, other kinds, a body visitorHash, cross-site calls and a missing secret never reach Convex", async () => {
    const fake = backend();
    const deps = { now: NOW, env: ENV, backend: fake };
    for (const body of [
      { ...BODY, surface: "map" },
      { ...BODY, surface: "display" },
      { eventModelId: "m1", kind: "open_model", requestId: BODY.requestId },
      { ...BODY, kind: "impression" },
      { ...BODY, kind: "view" },
      { ...BODY, visitorHash: "a".repeat(64) },
      { ...BODY, requestId: "" },
      { ...BODY, eventModelId: "x".repeat(65) },
      [BODY],
    ]) {
      const response = await handleFairSponsoredAction(post(body), deps);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, code: "INVALID_INPUT" });
    }
    expect((await handleFairSponsoredAction(post(BODY, { "sec-fetch-site": "cross-site" }), deps)).status).toBe(403);
    expect((await handleFairSponsoredAction(post(BODY), { ...deps, env: { nodeEnv: "production" } })).status).toBe(503);
    expect(fake.recordSponsoredAction).not.toHaveBeenCalled();
  });

  test("K1: without FAIR_GATEWAY_SECRET nothing reaches Convex; a refused secret is 503 SERVICE_UNAVAILABLE", async () => {
    const fake = backend();
    for (const env of [{ secret: SECRET, nodeEnv: "production" }, { secret: SECRET, gatewaySecret: "too-short", nodeEnv: "production" }]) {
      const response = await handleFairSponsoredAction(post(BODY), { now: NOW, env, backend: fake });
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await response.json()).toEqual({ ok: false, code: "VISITOR_UNAVAILABLE" });
    }
    expect(fake.recordSponsoredAction).not.toHaveBeenCalled();
    for (const code of ["FAIR_GATEWAY_NOT_CONFIGURED", "FAIR_GATEWAY_UNAUTHORIZED"]) {
      const refused = await handleFairSponsoredAction(post(BODY), { now: NOW, env: ENV, backend: backend(async () => { throw new ConvexError({ code }); }) });
      expect(refused.status).toBe(503);
      expect(await refused.json()).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    }
  });

  test("Convex codes map to HTTP statuses; an unknown failure is 502 without its message", async () => {
    const cases: Array<[string, number]> = [
      ["INVALID_INPUT", 400],
      ["FEATURE_NOT_ENTITLED", 403],
      ["FAIR_MODEL_NOT_FOUND", 404],
      ["EVENT_NOT_ACTIVE", 409],
      ["SUBMISSION_DUPLICATE", 409],
      ["RATE_LIMITED", 429],
    ];
    for (const [code, status] of cases) {
      const fake = backend(async () => { throw new ConvexError({ code }); });
      const response = await handleFairSponsoredAction(post(BODY), { now: NOW, env: ENV, backend: fake });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ ok: false, code });
    }
    const leaky = backend(async () => { throw new Error("boom internal detail"); });
    const response = await handleFairSponsoredAction(post(BODY), { now: NOW, env: ENV, backend: leaky });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe(JSON.stringify({ ok: false, code: "SERVICE_UNAVAILABLE" }));
  });
});
