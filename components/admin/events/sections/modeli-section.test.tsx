import { getFunctionName, type FunctionReference } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ModelDetailActions } from "./modeli-view";

// Admin UX A3 — the model detail moved to its own route; its actions must
// still call the same B1 functions with the same arguments as before A3
// (fairAdmin.publishModel / withdrawModel / upgradePackage / assignQr and the
// fairAdmin.resolveTest query).

const calls: [string, unknown][] = [];
vi.mock("convex/react", () => ({
  useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
    calls.push([getFunctionName(ref), args]);
    return null;
  },
  useConvex: () => ({
    query: async (ref: FunctionReference<"query">, args: unknown) => {
      calls.push([getFunctionName(ref), args]);
      return { outcome: "fair_model", problem: null, path: "/sajam/test/model/test-m1" };
    },
  }),
}));

const { useModelDetailActions } = await import("./modeli-section");

describe("A3 model detail actions", () => {
  test("publish, withdraw, upgrade, assign QR and resolve test call the existing fairAdmin functions", async () => {
    let actions: ModelDetailActions | null = null;
    function Probe() {
      actions = useModelDetailActions();
      return null;
    }
    renderToStaticMarkup(<Probe />);
    const run = actions!;
    expect(await run.publish("m1")).toEqual({ ok: true, warnings: undefined });
    await run.withdraw("m1");
    await run.upgrade("m1", "advanced");
    await run.assignQr("m1", "7KQ2M9XA");
    expect(await run.resolveTest("7KQ2M9XA")).toEqual({ ok: true, value: { outcome: "fair_model", problem: null, path: "/sajam/test/model/test-m1" } });
    expect(calls).toEqual([
      ["fairAdmin:publishModel", { eventModelId: "m1" }],
      ["fairAdmin:withdrawModel", { eventModelId: "m1" }],
      ["fairAdmin:upgradePackage", { eventModelId: "m1", toTier: "advanced" }],
      ["fairAdmin:assignQr", { eventModelId: "m1", resolverCode: "7KQ2M9XA" }],
      ["fairAdmin:resolveTest", { resolverCode: "7KQ2M9XA" }],
    ]);
  });
});
