import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("lokalni pristup sajamskoj mapi", () => {
  test.each([
    ["development", true],
    ["production", false],
    ["test", false],
  ] as const)("NODE_ENV=%s: mapa enabled=%s", async (mode, enabled) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.resetModules();
    const { FAIR_PUBLIC_MAP_ENABLED } = await import("../fair-contract");
    expect(FAIR_PUBLIC_MAP_ENABLED).toBe(enabled);
  });
});
