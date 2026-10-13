import { describe, expect, test } from "vitest";
import { ADMIN_LAYER_MAX, ADMIN_REVEAL } from "@/lib/admin-v2/motion";
import { ORBIT_RADIUS } from "./geometry";
import { CONSTELLATION_MOTION as M, angleDelta, arrivalRadius, backOut, introStarStart, powerInOut, powerOut, spiralPoint, windowProgress } from "./motion";

describe("the motion of the Constellation stays inside the layers", () => {
  test("the intro is a reveal: at most the budget of a page entrance", () => {
    expect(M.intro.total).toBeLessThanOrEqual(ADMIN_REVEAL.budget);
    expect(M.intro.total).toBeLessThanOrEqual(ADMIN_LAYER_MAX.reveal);
    for (const [from, to] of [M.intro.core, M.intro.orbits, M.intro.stars]) {
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeGreaterThan(from);
      expect(to).toBeLessThanOrEqual(M.intro.total);
    }
  });

  test("what answers the pointer or a number is of the interaction layer", () => {
    for (const duration of [M.hover, M.ring, M.shown, M.left]) expect(duration).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
  });

  test("a resolved or a new item moves for less than a second", () => {
    for (const duration of [M.resolved.duration, M.arrived.duration, M.moved]) expect(duration).toBeLessThanOrEqual(ADMIN_LAYER_MAX.reveal);
    expect(M.resolved.trailLife).toBeLessThanOrEqual(M.resolved.duration);
  });
});

describe("the intro", () => {
  test("the stars come out from the inner orbit to the outer one and the last ends with the intro", () => {
    const starts = ([1, 2, 3, 4] as const).map((orbit) => introStarStart(ORBIT_RADIUS[orbit]));
    expect(starts[0]).toBeCloseTo(M.intro.stars[0], 6);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(starts[3] + M.intro.star).toBeCloseTo(M.intro.total, 6);
    // Radii outside the system are clamped: nothing starts before or ends after the window.
    expect(introStarStart(0)).toBeCloseTo(M.intro.stars[0], 6);
    expect(introStarStart(2) + M.intro.star).toBeCloseTo(M.intro.total, 6);
  });

  test("a part of the intro runs only inside its window", () => {
    expect(windowProgress(0, M.intro.orbits)).toBe(0);
    expect(windowProgress(0.4, M.intro.orbits)).toBeCloseTo(0.5, 6);
    expect(windowProgress(5, M.intro.orbits)).toBe(1);
  });
});

describe("a resolved item leaves for the calm orbit", () => {
  test("it starts where the star stands, fully visible", () => {
    const start = spiralPoint(0, ORBIT_RADIUS[1], 1.25);
    expect(start.radius).toBeCloseTo(ORBIT_RADIUS[1], 6);
    expect(start.angle).toBeCloseTo(1.25, 6);
    expect(start.alpha).toBe(1);
  });

  test("it ends on the calm orbit a third of a turn further, and is gone", () => {
    for (const orbit of [1, 2, 3] as const) {
      const end = spiralPoint(1, ORBIT_RADIUS[orbit], 0.4);
      expect(end.radius).toBeCloseTo(ORBIT_RADIUS[4], 6);
      expect(end.angle).toBeCloseTo(0.4 + (2 * Math.PI) / 3, 6);
      expect(end.alpha).toBe(0);
    }
  });

  test("the way out never turns back and stays visible until the last part", () => {
    let radius = 0;
    let angle = -Infinity;
    for (let step = 0; step <= 20; step += 1) {
      const point = spiralPoint(step / 20, ORBIT_RADIUS[1], 0);
      expect(point.radius).toBeGreaterThanOrEqual(radius);
      expect(point.angle).toBeGreaterThanOrEqual(angle);
      radius = point.radius;
      angle = point.angle;
      if (step / 20 <= M.resolved.fadeFrom) expect(point.alpha).toBe(1);
    }
    expect(spiralPoint(-1, 0.3, 0).radius).toBeCloseTo(0.3, 6);
    expect(spiralPoint(2, 0.3, 0).radius).toBeCloseTo(ORBIT_RADIUS[4], 6);
  });
});

describe("a new item falls into its orbit", () => {
  test("from outside the system exactly onto the orbit, a little past it on the way", () => {
    for (const orbit of [1, 2, 3, 4] as const) {
      const target = ORBIT_RADIUS[orbit];
      expect(arrivalRadius(0, target)).toBeCloseTo(M.arrived.from, 6);
      expect(arrivalRadius(1, target)).toBeCloseTo(target, 6);
      const lowest = Math.min(...Array.from({ length: 41 }, (_, step) => arrivalRadius(step / 40, target)));
      if (orbit < 4) expect(lowest).toBeLessThan(target);
      // Never through the core.
      expect(lowest).toBeGreaterThan(0.11);
    }
  });
});

describe("curves", () => {
  test("every curve starts at 0, ends at 1 and clamps its input", () => {
    for (const curve of [powerOut, powerInOut, (t: number) => backOut(t, 1.2)]) {
      expect(curve(0)).toBeCloseTo(0, 6);
      expect(curve(1)).toBeCloseTo(1, 6);
      expect(curve(-3)).toBeCloseTo(0, 6);
      expect(curve(3)).toBeCloseTo(1, 6);
    }
    expect(Math.max(...Array.from({ length: 21 }, (_, step) => backOut(step / 20, 1.2)))).toBeGreaterThan(1);
  });

  test("the shortest way between two angles", () => {
    expect(angleDelta(0, 1)).toBeCloseTo(1, 6);
    expect(angleDelta(1, 0)).toBeCloseTo(-1, 6);
    expect(angleDelta(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2, 6);
    expect(angleDelta(2 * Math.PI - 0.1, 0.1)).toBeCloseTo(0.2, 6);
    expect(angleDelta(0, Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(angleDelta(5, 5 + 4 * Math.PI)).toBeCloseTo(0, 6);
  });
});
