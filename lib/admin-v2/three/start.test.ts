import { describe, expect, test } from "vitest";
import { ADMIN_STAGE_MOTION } from "@/lib/admin-v2/motion";
import { idleTimeoutMs, resolveStartAfterMs, startWaitMs, viewIs2D } from "./start";

describe("viewIs2D", () => {
  const open = { flat: false, width: 1280, flatBelow: 768, pinned: null } as const;

  test("a wide window with no choice and no pin keeps the door open", () => {
    expect(viewIs2D(open)).toBe(false);
    expect(viewIs2D({ ...open, flatBelow: 0 })).toBe(false);
  });

  test("the 2D view by choice, by width or by a pinned off", () => {
    expect(viewIs2D({ ...open, flat: true })).toBe(true);
    expect(viewIs2D({ ...open, width: 600 })).toBe(true);
    expect(viewIs2D({ ...open, pinned: "off" })).toBe(true);
  });

  test("the window exactly as wide as flatBelow is wide enough; a pinned quality does not exclude", () => {
    expect(viewIs2D({ ...open, width: 768 })).toBe(false);
    expect(viewIs2D({ ...open, pinned: "high" })).toBe(false);
    expect(viewIs2D({ ...open, pinned: "low" })).toBe(false);
  });
});

describe("the start timing", () => {
  test("startAfterMs defaults to the token and ignores what is not a time", () => {
    expect(resolveStartAfterMs(undefined)).toBe(ADMIN_STAGE_MOTION.startAfter * 1000);
    expect(resolveStartAfterMs(350)).toBe(350);
    expect(resolveStartAfterMs(0)).toBe(0);
    expect(resolveStartAfterMs(-1)).toBe(ADMIN_STAGE_MOTION.startAfter * 1000);
    expect(resolveStartAfterMs(Number.NaN)).toBe(ADMIN_STAGE_MOTION.startAfter * 1000);
  });

  test("the wait is what is left of startAfterMs after the navigation, never negative", () => {
    expect(startWaitMs(1000, 1000, 1400)).toBe(600);
    expect(startWaitMs(1000, 350, 1400)).toBe(0);
    expect(startWaitMs(1000, 1000, 2000)).toBe(0);
  });

  test("the idle timeout is short for a scene that lights up", () => {
    expect(idleTimeoutMs(false)).toBe(1500);
    expect(idleTimeoutMs(true)).toBe(150);
  });
});
