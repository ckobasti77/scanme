// Sajam 2026 (JOVAN-DELTA 2026-10-09) — POST /api/fair/admin-dev: same-origin
// gateway, 401 without a ScanMe session, 403 for a non-admin session, and the
// visitor hash only from the HttpOnly cookie.

import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { handleFairAdminDev, parseFairAdminDevAction } = await import("./admin-dev");
const { FAIR_VISITOR_COOKIE_NAME, fairVisitorHash, generateFairVisitorToken } = await import("./visitor");

const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const ENV = { secret: SECRET, gatewaySecret: GATEWAY_SECRET, nodeEnv: "production" };

function post(body: unknown, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  return new Request("https://scanme.rs/api/fair/admin-dev", { method: "POST", headers, body: JSON.stringify(body) });
}

function backend(isAdmin: boolean) {
  return { isAdmin: vi.fn(async () => isAdmin), run: vi.fn(async () => ({ stamped: 1 })) };
}

const stamps = { action: "stamps", eventId: "e1", eventModelIds: ["m1"] };

describe("admin-dev gateway", () => {
  test("no session → 401, nothing called", async () => {
    const fake = backend(true);
    const response = await handleFairAdminDev(post(stamps), { now: NOW, env: ENV, backend: fake, sessionToken: async () => null });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, code: "ADMIN_SESSION_REQUIRED" });
    expect(fake.isAdmin).not.toHaveBeenCalled();
    expect(fake.run).not.toHaveBeenCalled();
  });

  test("a session that is not an admin → 403, nothing run", async () => {
    const fake = backend(false);
    const response = await handleFairAdminDev(post(stamps), { now: NOW, env: ENV, backend: fake, sessionToken: async () => "jwt" });
    expect(response.status).toBe(403);
    expect(fake.run).not.toHaveBeenCalled();
  });

  test("cross-origin is refused before the session is read", async () => {
    const fake = backend(true);
    const sessionToken = vi.fn(async () => "jwt");
    const response = await handleFairAdminDev(post(stamps, { "sec-fetch-site": "cross-site" }), { now: NOW, env: ENV, backend: fake, sessionToken });
    expect(response.status).toBe(403);
    expect(sessionToken).not.toHaveBeenCalled();
  });

  test("admin: the action runs with the session and the cookie's hash", async () => {
    const fake = backend(true);
    const token = generateFairVisitorToken();
    const response = await handleFairAdminDev(
      post(stamps, { "sec-fetch-site": "same-origin", cookie: `${FAIR_VISITOR_COOKIE_NAME}=${token}` }),
      { now: NOW, env: ENV, backend: fake, sessionToken: async () => "jwt" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, value: { stamped: 1 } });
    expect(fake.run).toHaveBeenCalledWith("jwt", expect.objectContaining({ visitorHash: fairVisitorHash(token, SECRET), gatewaySecret: GATEWAY_SECRET }), stamps);
  });

  test("preview only sets this admin's HttpOnly cookie; a visitor gets 401 and no cookie", async () => {
    const fake = backend(true);
    const set = await handleFairAdminDev(post({ action: "preview", tier: "starter" }), { now: NOW, env: ENV, backend: fake, sessionToken: async () => "jwt" });
    expect(set.status).toBe(200);
    expect(set.headers.get("set-cookie")).toMatch(/^scanme_fair_admin_preview=starter; Path=\/; Max-Age=86400; SameSite=Lax; HttpOnly/);
    expect(fake.run).not.toHaveBeenCalled();
    const cleared = await handleFairAdminDev(post({ action: "preview", tier: null }), { now: NOW, env: ENV, backend: fake, sessionToken: async () => "jwt" });
    expect(cleared.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    const visitor = await handleFairAdminDev(post({ action: "preview", tier: "free" }), { now: NOW, env: ENV, backend: fake, sessionToken: async () => null });
    expect(visitor.status).toBe(401);
    expect(visitor.headers.get("set-cookie")).toBeNull();
  });

  test("unknown or malformed actions are 400", async () => {
    const fake = backend(true);
    for (const body of [{ action: "nuke" }, { action: "reset", eventId: "e1", scope: "everyone" }, { action: "stamps", eventId: "e1", eventModelIds: [] }]) {
      const response = await handleFairAdminDev(post(body), { now: NOW, env: ENV, backend: fake, sessionToken: async () => "jwt" });
      expect(response.status).toBe(400);
    }
    expect(fake.run).not.toHaveBeenCalled();
    expect(parseFairAdminDevAction({ action: "state", eventId: "e1" })).toEqual({ action: "state", eventId: "e1" });
  });
});
