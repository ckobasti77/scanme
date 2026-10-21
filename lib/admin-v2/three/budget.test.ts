import { describe, expect, test } from "vitest";
import { ADMIN_AMBIENT_FPS } from "@/lib/admin-v2/motion";
import { REGULATOR_FRAMES, REGULATOR_PAUSE_MS, REGULATOR_TOLERANCE, clampEmit, createRegulator, frameTargetMs, nextQuality, particleBudget } from "./budget";

describe("particleBudget", () => {
  test("off has none, low 150, high 600", () => {
    expect(particleBudget("off")).toBe(0);
    expect(particleBudget("low")).toBe(150);
    expect(particleBudget("high")).toBe(600);
  });
});

describe("clampEmit", () => {
  test("room for all", () => {
    expect(clampEmit(10, 0, 150)).toBe(10);
    expect(clampEmit(10, 100, 150)).toBe(10);
  });

  test("no room", () => {
    expect(clampEmit(10, 150, 150)).toBe(0);
    expect(clampEmit(10, 200, 150)).toBe(0);
    expect(clampEmit(10, 0, 0)).toBe(0);
  });

  test("partial room", () => {
    expect(clampEmit(50, 120, 150)).toBe(30);
  });

  test("negative, zero and NaN ask for none", () => {
    expect(clampEmit(-5, 0, 150)).toBe(0);
    expect(clampEmit(0, 0, 150)).toBe(0);
    expect(clampEmit(Number.NaN, 0, 150)).toBe(0);
  });

  test("a fraction is floored", () => {
    expect(clampEmit(7.9, 0, 150)).toBe(7);
    expect(clampEmit(0.9, 0, 150)).toBe(0);
  });
});

describe("frameTargetMs", () => {
  test("interactive is 60 fps, ambient follows the ambient rate", () => {
    expect(frameTargetMs(true)).toBeCloseTo(16.67, 2);
    expect(frameTargetMs(false)).toBeCloseTo(33.33, 2);
    expect(frameTargetMs(false)).toBeCloseTo(1000 / ADMIN_AMBIENT_FPS, 10);
    expect(ADMIN_AMBIENT_FPS).toBe(30);
  });
});

describe("nextQuality", () => {
  test("high drops to low over the tolerance", () => {
    const target = frameTargetMs(true);
    expect(nextQuality(target * REGULATOR_TOLERANCE + 0.1, target, "high")).toBe("low");
  });

  test("high stays high at or under the tolerance", () => {
    const target = frameTargetMs(true);
    expect(nextQuality(target * REGULATOR_TOLERANCE, target, "high")).toBe("high");
    expect(nextQuality(target, target, "high")).toBe("high");
  });

  test("low never goes up", () => {
    const target = frameTargetMs(true);
    expect(nextQuality(target, target, "low")).toBe("low");
    expect(nextQuality(1, target, "low")).toBe("low");
    expect(nextQuality(target * 5, target, "low")).toBe("low");
  });
});

describe("createRegulator", () => {
  test("ratio is null until the window is full", () => {
    const regulator = createRegulator();
    for (let index = 0; index < REGULATOR_FRAMES - 1; index += 1) {
      regulator.push(20, 16.67);
      expect(regulator.ratio()).toBeNull();
    }
    regulator.push(20, 16.67);
    expect(regulator.ratio()).toBeCloseTo(20 / 16.67, 6);
  });

  test("a slow window drops high to low, and low stays low with perfect frames", () => {
    const target = frameTargetMs(true);
    const regulator = createRegulator();
    for (let index = 0; index < REGULATOR_FRAMES; index += 1) regulator.push(target * 1.6, target);
    let quality = nextQuality((regulator.ratio() ?? 0) * target, target, "high");
    expect(quality).toBe("low");

    regulator.reset();
    for (let index = 0; index < REGULATOR_FRAMES * 2; index += 1) regulator.push(target, target);
    quality = nextQuality((regulator.ratio() ?? 0) * target, target, quality);
    expect(quality).toBe("low");
  });

  test("an ambient loop that holds 30 fps stays high", () => {
    const target = frameTargetMs(false);
    const regulator = createRegulator();
    for (let index = 0; index < REGULATOR_FRAMES; index += 1) regulator.push(1000 / 30, target);
    const ratio = regulator.ratio();
    expect(ratio).not.toBeNull();
    expect(nextQuality((ratio ?? 0) * target, target, "high")).toBe("high");
  });

  test("the window slides: old slow frames leave", () => {
    const regulator = createRegulator(4);
    for (let index = 0; index < 4; index += 1) regulator.push(40, 20);
    expect(regulator.ratio()).toBeCloseTo(2, 10);
    for (let index = 0; index < 4; index += 1) regulator.push(20, 20);
    expect(regulator.ratio()).toBeCloseTo(1, 10);
  });

  test("reset empties the window", () => {
    const regulator = createRegulator(3);
    for (let index = 0; index < 3; index += 1) regulator.push(20, 20);
    expect(regulator.ratio()).not.toBeNull();
    regulator.reset();
    expect(regulator.ratio()).toBeNull();
    regulator.push(20, 20);
    expect(regulator.ratio()).toBeNull();
  });

  test("invalid gaps and targets are skipped", () => {
    const regulator = createRegulator(2);
    regulator.push(Number.NaN, 20);
    regulator.push(Number.POSITIVE_INFINITY, 20);
    regulator.push(0, 20);
    regulator.push(-5, 20);
    regulator.push(20, 0);
    regulator.push(20, -1);
    regulator.push(20, Number.NaN);
    expect(regulator.ratio()).toBeNull();
    regulator.push(40, 20);
    regulator.push(20, 20);
    expect(regulator.ratio()).toBeCloseTo(1.5, 10);
  });

  test("a gap after a pause is not a slow frame: a tab that was hidden never lowers the quality", () => {
    const target = frameTargetMs(false);
    const regulator = createRegulator();
    for (let frame = 0; frame < REGULATOR_FRAMES - 1; frame += 1) regulator.push(target, target);
    // The frame that was asked for before the tab was hidden is drawn a minute later.
    regulator.push(60_000, target);
    expect(regulator.ratio()).toBeNull();
    for (let frame = 0; frame < REGULATOR_FRAMES; frame += 1) regulator.push(target, target);
    const ratio = regulator.ratio();
    expect(ratio).toBeCloseTo(1, 6);
    expect(nextQuality((ratio ?? 0) * target, target, "high")).toBe("high");
  });

  test("a pause empties the window; a slow device stays under the pause and is still measured", () => {
    const regulator = createRegulator(3);
    for (let frame = 0; frame < 3; frame += 1) regulator.push(20, 16);
    expect(regulator.ratio()).not.toBeNull();
    regulator.push(REGULATOR_PAUSE_MS + 1, 16);
    expect(regulator.ratio()).toBeNull();
    // 80 ms a frame is a slow device, not a pause.
    for (let frame = 0; frame < 3; frame += 1) regulator.push(80, frameTargetMs(false));
    const ratio = regulator.ratio() ?? 0;
    expect(ratio).toBeGreaterThan(REGULATOR_TOLERANCE);
    expect(nextQuality(ratio * frameTargetMs(false), frameTargetMs(false), "high")).toBe("low");
    expect(REGULATOR_PAUSE_MS).toBeGreaterThan(3 * frameTargetMs(false));
  });

  test("mixed targets average as ratios, not as milliseconds", () => {
    const regulator = createRegulator(2);
    // An interactive frame at twice its target and an ambient frame on its target.
    regulator.push(2 * (1000 / 60), 1000 / 60);
    regulator.push(1000 / 30, 1000 / 30);
    expect(regulator.ratio()).toBeCloseTo(1.5, 10);
  });
});
