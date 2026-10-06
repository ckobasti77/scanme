import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { handleFairGarageModels } = await import("./garage");
type FairGarageBackend = import("./garage").FairGarageBackend;

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://scanme.rs/api/fair/garage-models", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://scanme.rs", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/fair/garage-models", () => {
  test("reads a bounded, deduplicated model list without visitor data", async () => {
    const backend: FairGarageBackend = { getModelsByIds: vi.fn(async () => []) };
    const response = await handleFairGarageModels(
      request({ ids: ["model_a", "model_a", "model_b"] }),
      backend,
    );

    expect(response.status).toBe(200);
    expect(backend.getModelsByIds).toHaveBeenCalledWith({ ids: ["model_a", "model_b"] });
    expect(await response.json()).toEqual({ ok: true, value: [] });
  });

  test("rejects unknown keys, invalid ids and cross-origin calls", async () => {
    const backend: FairGarageBackend = { getModelsByIds: vi.fn(async () => []) };
    expect((await handleFairGarageModels(request({ ids: [], visitorHash: "no" }), backend)).status).toBe(400);
    expect((await handleFairGarageModels(request({ ids: [""] }), backend)).status).toBe(400);
    expect(
      (
        await handleFairGarageModels(
          request({ ids: [] }, { origin: "https://example.com" }),
          backend,
        )
      ).status,
    ).toBe(403);
    expect(backend.getModelsByIds).not.toHaveBeenCalled();
  });

  test("reports backend unavailability without inventing model data", async () => {
    const response = await handleFairGarageModels(request({ ids: ["model_a"] }), null);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
  });
});
