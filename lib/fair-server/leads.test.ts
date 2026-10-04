// Sajam 2026 B4 — the lead gateway POST /api/fair/lead (BACKEND-HANDOFF §4.2,
// §4.4, §7): same-origin, strict bounded body, visitor hash only from the
// HttpOnly cookie, a declined consent never reaches Convex, stable codes,
// no-store, and no contact value in any response.

import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { handleFairLead } = await import("./leads");
const { FAIR_VISITOR_COOKIE_NAME, fairIpHash, fairVisitorHash, generateFairVisitorToken } = await import("./visitor");

const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
// K1: a TEST gateway secret (not a real value); the gateway sends it to Convex.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const ENV = { secret: SECRET, gatewaySecret: GATEWAY_SECRET, nodeEnv: "production" };
const BODY = {
  eventModelId: "m1",
  kind: "test_drive",
  submissionId: "test-gateway-submission-1",
  contactName: "TEST Posetilac",
  email: "gateway.b4@example.invalid",
  phone: "+381 60 000 0005",
  consentAccepted: true,
  consentVersion: 1,
};
const RESULT = { eventModelId: "m1", kind: "test_drive" as const, submittedAt: NOW, duplicate: false, confirmationEmail: true, followUpScheduled: true };

function post(body: unknown, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  return new Request("https://scanme.rs/api/fair/lead", { method: "POST", headers, body: JSON.stringify(body) });
}

function backend(impl?: () => Promise<typeof RESULT>) {
  return { submitLead: vi.fn(impl ?? (async () => RESULT)) };
}

describe("POST /api/fair/lead", () => {
  test("the backend gets the HMAC of the cookie and the strict body; the response never echoes a contact", async () => {
    const fake = backend();
    const response = await handleFairLead(post(BODY), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true, value: RESULT });
    for (const contact of [BODY.contactName, BODY.email, BODY.phone]) expect(text).not.toContain(contact);
    const token = response.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    expect(fake.submitLead).toHaveBeenCalledWith({ gatewaySecret: GATEWAY_SECRET, ipHash: fairIpHash(post(BODY), SECRET), visitorHash: fairVisitorHash(token, SECRET), ...BODY });
    expect(JSON.stringify(fake.submitLead.mock.calls)).not.toContain(token);
  });

  test("an existing cookie is reused; empty contact fields are dropped", async () => {
    const fake = backend();
    const token = generateFairVisitorToken();
    const headers = { "sec-fetch-site": "same-origin", cookie: `${FAIR_VISITOR_COOKIE_NAME}=${token}` };
    const response = await handleFairLead(post({ ...BODY, email: "", kind: "interest" }, headers), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fake.submitLead).toHaveBeenCalledWith({
      gatewaySecret: GATEWAY_SECRET, ipHash: fairIpHash(post(BODY), SECRET),
      visitorHash: fairVisitorHash(token, SECRET), eventModelId: "m1", kind: "interest", submissionId: BODY.submissionId,
      contactName: BODY.contactName, phone: BODY.phone, consentAccepted: true, consentVersion: 1,
    });
  });

  test("a declined consent stops at the gateway: Convex never receives the contact", async () => {
    const fake = backend();
    const response = await handleFairLead(post({ ...BODY, consentAccepted: false }), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ ok: false, code: "CONSENT_REQUIRED" });
    expect(fake.submitLead).not.toHaveBeenCalled();
  });

  test("malformed bodies, a body visitorHash, cross-site calls and a missing secret are refused before Convex", async () => {
    const fake = backend();
    const deps = { now: NOW, env: ENV, backend: fake };
    for (const body of [
      { ...BODY, visitorHash: "a".repeat(64) },
      { ...BODY, consentText: "proizvoljan tekst" },
      { ...BODY, kind: "offer" },
      { ...BODY, consentAccepted: "true" },
      { ...BODY, consentVersion: 1.5 },
      { ...BODY, contactName: "" },
      { ...BODY, email: "x".repeat(255) },
      [BODY],
    ]) {
      const response = await handleFairLead(post(body), deps);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, code: "INVALID_INPUT" });
    }
    expect((await handleFairLead(post(BODY, { "sec-fetch-site": "cross-site" }), deps)).status).toBe(403);
    expect((await handleFairLead(post(BODY), { ...deps, env: { nodeEnv: "production" } })).status).toBe(503);
    expect(fake.submitLead).not.toHaveBeenCalled();
  });

  test("K1: without FAIR_GATEWAY_SECRET the contact never reaches Convex; a refused secret is 503 SERVICE_UNAVAILABLE", async () => {
    const fake = backend();
    for (const env of [{ secret: SECRET, nodeEnv: "production" }, { secret: SECRET, gatewaySecret: "too-short", nodeEnv: "production" }]) {
      const response = await handleFairLead(post(BODY), { now: NOW, env, backend: fake });
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await response.json()).toEqual({ ok: false, code: "VISITOR_UNAVAILABLE" });
    }
    expect(fake.submitLead).not.toHaveBeenCalled();
    for (const code of ["FAIR_GATEWAY_NOT_CONFIGURED", "FAIR_GATEWAY_UNAUTHORIZED"]) {
      const refused = await handleFairLead(post(BODY), { now: NOW, env: ENV, backend: backend(async () => { throw new ConvexError({ code }); }) });
      expect(refused.status).toBe(503);
      const text = await refused.text();
      expect(text).toBe(JSON.stringify({ ok: false, code: "SERVICE_UNAVAILABLE" }));
      expect(text).not.toContain(GATEWAY_SECRET);
    }
  });

  test("Convex codes map to HTTP statuses; an unknown failure is 502 without its message", async () => {
    const cases: Array<[string, number]> = [
      ["CONSENT_NOT_CONFIGURED", 409],
      ["CONSENT_REQUIRED", 422],
      ["CONTACT_REQUIREMENT_NOT_MET", 422],
      ["FEATURE_NOT_ENTITLED", 403],
      ["SUBMISSION_DUPLICATE", 409],
      ["RATE_LIMITED", 429],
      ["FAIR_MODEL_NOT_FOUND", 404],
    ];
    for (const [code, status] of cases) {
      const fake = backend(async () => { throw new ConvexError({ code }); });
      const response = await handleFairLead(post(BODY), { now: NOW, env: ENV, backend: fake });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ ok: false, code });
    }
    const leaky = backend(async () => { throw new Error(`boom ${BODY.email}`); });
    const response = await handleFairLead(post(BODY), { now: NOW, env: ENV, backend: leaky });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toBe(JSON.stringify({ ok: false, code: "SERVICE_UNAVAILABLE" }));
  });
});
