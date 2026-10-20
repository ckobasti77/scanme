import { afterEach, expect, test, vi } from "vitest";
import { postFair } from "./fair-api";
import { fetchFairGarageModels } from "./garage-view";
import { FAIR_DEMO_MODELS, FAIR_DEMO_EVENT, FAIR_DEMO_PASSPORTS } from "../fair-demo";
import type { FairMyModelState } from "../fair-contract";

afterEach(() => vi.unstubAllGlobals());

test("demo model reads, ratings, leads and garage never make a network request", async () => {
  const network = vi.fn(() => { throw new Error("Demo tried to reach the server"); });
  vi.stubGlobal("fetch", network);
  const model = FAIR_DEMO_MODELS[0];
  expect((await postFair("/api/fair/model-state", { eventModelId: model.id })).ok).toBe(true);
  await postFair("/api/fair/rating", { eventModelId: model.id, appearance: 4.5 });
  const state = await postFair<FairMyModelState>("/api/fair/model-state", { eventModelId: model.id });
  expect(state.ok && state.value.rating).toMatchObject({ mode: "dimensions", appearance: 4.5 });
  const lead = await postFair("/api/fair/lead", { eventModelId: model.id, kind: "interest", contactName: "Demo", email: "demo@example.invalid" });
  expect(lead).toMatchObject({ ok: true, value: { confirmationEmail: false, followUpScheduled: false } });
  expect(JSON.stringify(lead)).not.toContain("example.invalid");
  expect(await fetchFairGarageModels([model.id])).toEqual([model]);
  expect(network).not.toHaveBeenCalled();
});

test("unknown synthetic IDs fail closed and real IDs retain the real transport", async () => {
  const network = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, value: "real response" }) });
  vi.stubGlobal("fetch", network);
  expect(await postFair("/api/fair/lead", { eventModelId: "demo-model-unknown" })).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
  expect(network).not.toHaveBeenCalled();
  expect(await postFair("/api/fair/model-state", { eventModelId: "real-model" })).toEqual({ ok: true, value: "real response" });
  expect(network).toHaveBeenCalledOnce();
});

test("the public demo contains only illustrative brands and consistent passport members", () => {
  expect(FAIR_DEMO_MODELS).toHaveLength(9);
  for (const model of FAIR_DEMO_MODELS) {
    expect(model.eventId).toBe(FAIR_DEMO_EVENT.id);
    expect(model.brandName).toMatch(/^Demo /);
    expect(model.displayName).toMatch(/^Demo /);
    expect(model.photoUrl).toMatch(/^\/fair\/demo\/vehicle-showroom(?:-(?:blue|copper))?\.(?:webp|png)$/);
  }
  for (const passport of FAIR_DEMO_PASSPORTS) expect(passport.models.every((member) => FAIR_DEMO_MODELS.some((model) => model.id === member.eventModelId && model.brandId === passport.brandId))).toBe(true);
});
