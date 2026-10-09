import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { handleFairHeat, resetFairHeatMemo } = await import("./heat");

const SECRET = "test-fair-gateway-secret-0123456789abcdef";
const VALUE = {
  at: 1,
  today: { enough: true, levels: [{ locationId: "hala-9", level: 1 }] },
  hour: { enough: false, levels: [] },
};

beforeEach(() => resetFairHeatMemo());

describe("SAJAM SUPER: GET /api/fair/heat/[eventSlug]", () => {
  test("one Convex read a minute however many visitors ask; the CDN keeps it 60 s", async () => {
    const getMapHeat = vi.fn(async () => VALUE);
    const deps = { backend: { getMapHeat }, gatewaySecret: SECRET, devTestFallback: false };
    const start = 1_000_000;
    const answers = await Promise.all(Array.from({ length: 50 }, (_, index) => handleFairHeat("elektromobilnost-2026", { ...deps, now: start + index * 1000 })));
    expect(getMapHeat).toHaveBeenCalledTimes(1);
    expect(getMapHeat).toHaveBeenCalledWith({ gatewaySecret: SECRET, eventSlug: "elektromobilnost-2026", at: start });
    for (const response of answers) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
    }
    expect(await answers[0].json()).toEqual({ ok: true, value: VALUE });
    await handleFairHeat("elektromobilnost-2026", { ...deps, now: start + 59_999 });
    expect(getMapHeat).toHaveBeenCalledTimes(1);
    await handleFairHeat("elektromobilnost-2026", { ...deps, now: start + 60_000 });
    expect(getMapHeat).toHaveBeenCalledTimes(2);
  });

  test("the answer carries levels only — the public never sees a count", async () => {
    const response = await handleFairHeat("elektromobilnost-2026", { backend: { getMapHeat: async () => VALUE }, gatewaySecret: SECRET, now: 5 });
    const body = (await response.json()) as { value: typeof VALUE };
    for (const period of [body.value.today, body.value.hour]) {
      for (const row of period.levels) expect(Object.keys(row).sort()).toEqual(["level", "locationId"]);
    }
  });

  test("DEV: a real slug without a real event falls back to the TEST event", async () => {
    const getMapHeat = vi.fn(async ({ eventSlug }: { eventSlug: string }) => (eventSlug.startsWith("test-") ? VALUE : null));
    const response = await handleFairHeat("elektromobilnost-2026", { backend: { getMapHeat }, gatewaySecret: SECRET, devTestFallback: true, now: 7 });
    expect(response.status).toBe(200);
    expect(getMapHeat.mock.calls.map(([args]) => args.eventSlug)).toEqual(["elektromobilnost-2026", "test-elektromobilnost-2026"]);
  });

  test("errors are never cached: a bad slug, no secret, no event and a failed read", async () => {
    const backend = { getMapHeat: vi.fn(async () => null) };
    expect((await handleFairHeat("Nije Slug!", { backend, gatewaySecret: SECRET })).status).toBe(400);
    const noSecret = await handleFairHeat("elektromobilnost-2026", { backend, gatewaySecret: null });
    expect(noSecret.status).toBe(503);
    expect(noSecret.headers.get("Cache-Control")).toBe("no-store");
    expect(backend.getMapHeat).not.toHaveBeenCalled();
    const missing = await handleFairHeat("nema-sajma", { backend, gatewaySecret: SECRET, devTestFallback: false, now: 1 });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("no-store");

    const failing = { getMapHeat: vi.fn(async () => { throw new Error("convex down"); }) };
    expect((await handleFairHeat("elektromobilnost-2026", { backend: failing, gatewaySecret: SECRET, now: 10 })).status).toBe(503);
    // The failure is forgotten at once: the next visitor tries again.
    expect((await handleFairHeat("elektromobilnost-2026", { backend: { getMapHeat: async () => VALUE }, gatewaySecret: SECRET, now: 11 })).status).toBe(200);
  });
});
