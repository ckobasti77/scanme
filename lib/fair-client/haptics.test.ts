import { afterEach, describe, expect, test, vi } from "vitest";
import { fairHaptic } from "./haptics";

// D1: no vibration call before the visitor's first tap (Chrome blocks it and
// logs a console error); after it, and where the browser has no
// userActivation, the vibration is asked for as before.

afterEach(() => vi.unstubAllGlobals());

describe("fairHaptic", () => {
  test("waits for the first user activation", () => {
    const vibrate = vi.fn(() => true);
    const userActivation = { hasBeenActive: false };
    vi.stubGlobal("navigator", { vibrate, userActivation });
    fairHaptic(14);
    expect(vibrate).not.toHaveBeenCalled();
    userActivation.hasBeenActive = true;
    fairHaptic([20, 40, 40]);
    expect(vibrate).toHaveBeenCalledWith([20, 40, 40]);
  });

  test("a browser without userActivation still vibrates; one without vibrate does nothing and never throws", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    fairHaptic(8);
    expect(vibrate).toHaveBeenCalledWith(8);
    vi.stubGlobal("navigator", {});
    expect(() => fairHaptic(8)).not.toThrow();
    vi.stubGlobal("navigator", { vibrate: () => { throw new Error("blocked"); } });
    expect(() => fairHaptic(8)).not.toThrow();
  });

  test("iosTick: without vibrate, clicks one hidden native switch (reused)", () => {
    const click = vi.fn();
    const label = { style: {} as Record<string, string>, isConnected: true, setAttribute: vi.fn(), click, innerHTML: "" };
    const appendChild = vi.fn();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { body: { appendChild }, createElement: vi.fn(() => label) });
    fairHaptic(8);
    expect(click).not.toHaveBeenCalled();
    fairHaptic(8, { iosTick: true });
    fairHaptic([8, 24], { iosTick: true });
    expect(click).toHaveBeenCalledTimes(2);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(label.innerHTML).toContain('type="checkbox" switch');
  });
});

