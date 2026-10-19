import { describe, expect, test } from "vitest";
import { EXPLODE_WINDOWS } from "./catalog";
import { cubicInOut, explodeFactor, explodeOffset } from "./explode";

describe("rasklapanje po fazama", () => {
  test("cubicInOut u 0, 0.5 i 1", () => {
    expect(cubicInOut(0)).toBe(0);
    expect(cubicInOut(0.5)).toBe(0.5);
    expect(cubicInOut(1)).toBe(1);
  });

  test("granice prozora: pre početka 0, posle kraja 1", () => {
    EXPLODE_WINDOWS.forEach(([s, e], stage) => {
      expect(explodeFactor(s, stage)).toBe(0);
      expect(explodeFactor(e, stage)).toBe(1);
      expect(explodeFactor((s + e) / 2, stage)).toBeCloseTo(0.5, 10);
    });
    expect(explodeFactor(0.3, 0)).toBe(1);
    expect(explodeFactor(0.65, 3)).toBe(0);
  });

  test("pomeraj: 0 u p = 0, dir · dist u p = 1", () => {
    expect(explodeOffset([0, 1, 0], 0.5, 2, 0)).toEqual([0, 0, 0]);
    expect(explodeOffset([0.6, 0.8, 0], 0.5, 2, 1)).toEqual([0.3, 0.4, 0]);
  });

  test("monotono raste za svaku fazu", () => {
    for (let stage = 0; stage < 4; stage++) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const k = explodeFactor(i / 100, stage);
        expect(k).toBeGreaterThanOrEqual(prev);
        prev = k;
      }
    }
  });

  test("tablične vrednosti iste formule kao Exploder u 3d/auto3d/lib/views.py", () => {
    // t = (p − s)/(e − s); k = 4t³ ako je t < 0,5, inače 1 − (−2t + 2)³/2
    expect(explodeFactor(0.1, 0)).toBeCloseTo(4 * (1 / 3) ** 3, 12);
    expect(explodeFactor(0.4, 1)).toBeCloseTo(1 - (-2 * (0.25 / 0.35) + 2) ** 3 / 2, 12);
    expect(explodeFactor(0.5, 2)).toBeCloseTo(4 * (0.1 / 0.35) ** 3, 12);
    expect(explodeFactor(0.9, 3)).toBeCloseTo(1 - (-2 * (0.25 / 0.35) + 2) ** 3 / 2, 12);
    expect(explodeFactor(0.2, 1)).toBeCloseTo(4 * (0.05 / 0.35) ** 3, 12);
  });
});
