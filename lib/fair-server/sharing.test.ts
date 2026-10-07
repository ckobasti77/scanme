import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { fairShareCode, fairShareCodeHash, handleCreateShareCollection, handleFairTraffic } = await import("./sharing");
const { FAIR_VISITOR_COOKIE_NAME, fairVisitorHash, generateFairVisitorToken } = await import("./visitor");

const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const ENV = { secret: SECRET, nodeEnv: "production" };
const headers = { "content-type": "application/json", "sec-fetch-site": "same-origin" };

function post(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request(`https://scanme.rs${path}`, {
    method: "POST",
    headers: { ...headers, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

describe("fair share collection gateway", () => {
  test("creates an opaque URL while Convex sees only its hash and the cookie HMAC", async () => {
    const backend = {
      createShareCollection: vi.fn(async () => ({ collectionId: "collection-1", eventId: "event-1", eventModelIds: ["model-1", "model-2"], expiresAt: NOW + 1_000, duplicate: false })),
      recordTraffic: vi.fn(),
      getModelsByIds: vi.fn(async () => [{ eventSlug: "test-elektromobilnost-2026" }] as never),
    };
    const response = await handleCreateShareCollection(
      post("/api/fair/share-collection", { eventModelIds: ["model-1", "model-2"], requestId: "test-share-request-1" }),
      { now: NOW, env: ENV, backend },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.value.shareCode).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(body.value.url).toBe(`https://scanme.rs/sajam/elektromobilnost-2026/deli/${body.value.shareCode}`);
    expect(backend.getModelsByIds).toHaveBeenCalledWith({ ids: ["model-1"] });
    const token = response.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    const expectedCode = fairShareCode(fairVisitorHash(token, SECRET), "test-share-request-1");
    expect(body.value.shareCode).toBe(expectedCode);
    expect(backend.createShareCollection).toHaveBeenCalledWith({
      visitorHash: fairVisitorHash(token, SECRET),
      eventModelIds: ["model-1", "model-2"],
      codeHash: fairShareCodeHash(expectedCode),
      requestId: "test-share-request-1",
    });
    expect(JSON.stringify(backend.createShareCollection.mock.calls)).not.toContain(expectedCode);
  });

  test("falls back to the legacy redirecting path when the event slug cannot be read", async () => {
    const backend = {
      createShareCollection: vi.fn(async () => ({ collectionId: "collection-1", eventId: "event-1", eventModelIds: ["model-1", "model-2"], expiresAt: NOW + 1_000, duplicate: false })),
      recordTraffic: vi.fn(),
      getModelsByIds: vi.fn(async () => { throw new Error("offline"); }),
    };
    const response = await handleCreateShareCollection(
      post("/api/fair/share-collection", { eventModelIds: ["model-1", "model-2"], requestId: "test-share-request-2" }),
      { now: NOW, env: ENV, backend },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.value.url).toBe(`https://scanme.rs/sajam/deli/${body.value.shareCode}`);
  });

  test("rejects duplicate, oversized and caller-supplied identity input before Convex", async () => {
    const backend = { createShareCollection: vi.fn(), recordTraffic: vi.fn(), getModelsByIds: vi.fn() };
    for (const body of [
      { eventModelIds: [], requestId: "test-request" },
      { eventModelIds: ["m1", "m1"], requestId: "test-request" },
      { eventModelIds: ["m1", "m2", "m3", "m4", "m5", "m6"], requestId: "test-request" },
      { eventModelIds: ["m1"], requestId: "test-request", visitorHash: "a".repeat(64) },
    ]) {
      const response = await handleCreateShareCollection(post("/api/fair/share-collection", body), { now: NOW, env: ENV, backend });
      expect(response.status).toBe(400);
    }
    expect(backend.createShareCollection).not.toHaveBeenCalled();
  });
});

describe("fair traffic gateway", () => {
  test("records only explicit direct/share signals with identity derived from the cookie", async () => {
    const token = generateFairVisitorToken();
    const backend = {
      createShareCollection: vi.fn(),
      recordTraffic: vi.fn(async (args) => ({ kind: args.kind, recordedAt: NOW, duplicate: false })),
      getModelsByIds: vi.fn(),
    };
    const response = await handleFairTraffic(
      post("/api/fair/traffic", { kind: "share_action", requestId: "test-traffic-1", shareCollectionId: "collection-1", channel: "native", modelCount: 3 }, { cookie: `${FAIR_VISITOR_COOKIE_NAME}=${token}` }),
      { now: NOW, env: ENV, backend },
    );
    expect(response.status).toBe(200);
    expect(backend.recordTraffic).toHaveBeenCalledWith({
      visitorHash: fairVisitorHash(token, SECRET),
      kind: "share_action",
      requestId: "test-traffic-1",
      shareCollectionId: "collection-1",
      channel: "native",
      modelCount: 3,
    });
  });

  test("refuses scan-like kinds, extra identity and cross-site requests", async () => {
    const backend = { createShareCollection: vi.fn(), recordTraffic: vi.fn(), getModelsByIds: vi.fn() };
    for (const body of [
      { kind: "scan", requestId: "test-traffic-1", eventModelId: "m1" },
      { kind: "share_action", requestId: "test-traffic-1", eventModelId: "m1", channel: "native", modelCount: 1, visitorHash: "a".repeat(64) },
      { kind: "share_open", requestId: "test-traffic-1", shareCollectionId: "c1", channel: "copy" },
    ]) {
      expect((await handleFairTraffic(post("/api/fair/traffic", body), { now: NOW, env: ENV, backend })).status).toBe(400);
    }
    expect((await handleFairTraffic(post("/api/fair/traffic", { kind: "direct_view", requestId: "test-traffic-2", eventModelId: "m1" }, { "sec-fetch-site": "cross-site" }), { now: NOW, env: ENV, backend })).status).toBe(403);
    expect(backend.recordTraffic).not.toHaveBeenCalled();
  });

  test("maps stable Convex errors and hides unknown failures", async () => {
    const token = generateFairVisitorToken();
    const cookie = { cookie: `${FAIR_VISITOR_COOKIE_NAME}=${token}` };
    const invalid = { createShareCollection: vi.fn(), getModelsByIds: vi.fn(), recordTraffic: vi.fn(async () => { throw new ConvexError({ code: "INVALID_INPUT" }); }) };
    expect((await handleFairTraffic(post("/api/fair/traffic", { kind: "direct_view", requestId: "test-traffic-3", eventModelId: "m1" }, cookie), { now: NOW, env: ENV, backend: invalid })).status).toBe(400);
    const broken = { createShareCollection: vi.fn(), getModelsByIds: vi.fn(), recordTraffic: vi.fn(async () => { throw new Error("secret detail"); }) };
    const response = await handleFairTraffic(post("/api/fair/traffic", { kind: "direct_view", requestId: "test-traffic-4", eventModelId: "m1" }, cookie), { now: NOW, env: ENV, backend: broken });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
  });
});
