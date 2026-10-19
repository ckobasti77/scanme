// Store stranice /sajam/3d (A13: nije bio testiran): radnja bez promene ne budi pretplatnike,
// promena ih budi tačno jednom, a odjava ih gasi.

import { describe, expect, test, vi } from "vitest";
import { initialState } from "@/lib/auto3d/state";
import { DEFAULT_URL_STATE } from "@/lib/auto3d/url-state";
import { createAuto3dStore } from "./store";

describe("createAuto3dStore", () => {
  test("promena stanja budi pretplatnike, radnja bez promene ne", () => {
    const store = createAuto3dStore(initialState(DEFAULT_URL_STATE));
    const listener = vi.fn();
    const off = store.subscribe(listener);
    const before = store.getState();
    store.dispatch({ type: "close" }); // nema izabranog dela: isto stanje
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    store.dispatch({ type: "select", part: "karter", origin: "list" });
    expect(store.getState().part).toBe("karter");
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.dispatch({ type: "close" });
    expect(store.getState().part).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.initial).toBe(before);
  });
});
