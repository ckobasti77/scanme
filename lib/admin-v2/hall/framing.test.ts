import { describe, expect, test } from "vitest";
import { HALL_FRAME, frameRect, projectBox, viewAxes, type FrameRect } from "./framing";

// ADMIN v3 V5 — the frame of the Living hall: the home view is fitted to the stands
// with something to show, padded, inside the floor, and never smaller than a share
// of it. All numbers are invented (TEST floor of 1000 × 500 map pixels).

const FLOOR = { width: 1000, depth: 500 };
const rect = (minX: number, minZ: number, maxX: number, maxZ: number): FrameRect => ({ minX, minZ, maxX, maxZ });
const WHOLE = rect(0, 0, 1000, 500);

describe("frameRect", () => {
  test("no stand with something to show: the whole floor", () => {
    expect(frameRect(FLOOR, [])).toEqual(WHOLE);
  });

  test("an empty or broken floor is returned as it is, never NaN", () => {
    expect(frameRect({ width: 0, depth: 500 }, [rect(1, 1, 2, 2)])).toEqual(rect(0, 0, 0, 500));
    expect(frameRect({ width: Number.NaN, depth: 500 }, [rect(1, 1, 2, 2)]).maxZ).toBe(500);
  });

  test("a stand that is not a box (NaN, upside down) is left out", () => {
    expect(frameRect(FLOOR, [rect(Number.NaN, 0, 10, 10), rect(50, 50, 10, 10)])).toEqual(WHOLE);
    const one = frameRect(FLOOR, [rect(Number.NaN, 0, 10, 10), rect(400, 200, 500, 260)]);
    expect(one.minX).toBeGreaterThan(0);
  });

  test("one stand: the minimum share of the floor, centred on it, so it does not fill the box", () => {
    const frame = frameRect(FLOOR, [rect(400, 200, 460, 240)]);
    expect(frame.maxX - frame.minX).toBeCloseTo(FLOOR.width * HALL_FRAME.minShare, 6);
    expect(frame.maxZ - frame.minZ).toBeCloseTo(FLOOR.depth * HALL_FRAME.minShare, 6);
    expect((frame.minX + frame.maxX) / 2).toBeCloseTo(430, 6);
    expect((frame.minZ + frame.maxZ) / 2).toBeCloseTo(220, 6);
    // The stand is a small part of what the box shows.
    expect(60 / (frame.maxX - frame.minX)).toBeLessThan(0.2);
  });

  test("a group of stands: their box with the pad on each side", () => {
    const frame = frameRect(FLOOR, [rect(300, 100, 500, 300), rect(600, 150, 800, 400)]);
    const width = 500 * (1 + 2 * HALL_FRAME.pad);
    const depth = 300 * (1 + 2 * HALL_FRAME.pad);
    expect(frame.maxX - frame.minX).toBeCloseTo(width, 6);
    expect(frame.maxZ - frame.minZ).toBeCloseTo(depth, 6);
    // Every stand is inside with room to spare on every side.
    for (const stand of [rect(300, 100, 500, 300), rect(600, 150, 800, 400)]) {
      expect(frame.minX).toBeLessThan(stand.minX);
      expect(frame.minZ).toBeLessThan(stand.minZ);
      expect(frame.maxX).toBeGreaterThan(stand.maxX);
      expect(frame.maxZ).toBeGreaterThan(stand.maxZ);
    }
    expect(300 - frame.minX).toBeCloseTo(500 * HALL_FRAME.pad, 6);
  });

  test("stands at two far corners: both inside, and the frame is the whole floor, not larger", () => {
    const stands = [rect(0, 0, 80, 60), rect(920, 440, 1000, 500)];
    const frame = frameRect(FLOOR, stands);
    expect(frame).toEqual(WHOLE);
    for (const stand of stands) {
      expect(frame.minX).toBeLessThanOrEqual(stand.minX);
      expect(frame.maxX).toBeGreaterThanOrEqual(stand.maxX);
      expect(frame.minZ).toBeLessThanOrEqual(stand.minZ);
      expect(frame.maxZ).toBeGreaterThanOrEqual(stand.maxZ);
    }
  });

  test("never outside the floor: a stand at the edge slides the frame in, it does not shrink it", () => {
    const corner = frameRect(FLOOR, [rect(0, 0, 40, 30)]);
    expect(corner.minX).toBe(0);
    expect(corner.minZ).toBe(0);
    expect(corner.maxX - corner.minX).toBeCloseTo(FLOOR.width * HALL_FRAME.minShare, 6);
    const far = frameRect(FLOOR, [rect(960, 470, 1000, 500)]);
    expect(far.maxX).toBe(1000);
    expect(far.maxZ).toBe(500);
    expect(far.minX).toBeGreaterThanOrEqual(0);
    expect(far.maxX - far.minX).toBeCloseTo(FLOOR.width * HALL_FRAME.minShare, 6);
  });

  test("for any set of stands the frame is inside the floor and not smaller than the minimum", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const x = (seed * 137) % 900;
      const z = (seed * 71) % 440;
      const frame = frameRect(FLOOR, [rect(x, z, x + 20 + (seed % 7) * 30, z + 10 + (seed % 5) * 20), rect(x / 2, z / 2, x / 2 + 30, z / 2 + 30)]);
      expect(frame.minX).toBeGreaterThanOrEqual(0);
      expect(frame.minZ).toBeGreaterThanOrEqual(0);
      expect(frame.maxX).toBeLessThanOrEqual(FLOOR.width + 1e-9);
      expect(frame.maxZ).toBeLessThanOrEqual(FLOOR.depth + 1e-9);
      expect(frame.maxX - frame.minX).toBeGreaterThanOrEqual(FLOOR.width * HALL_FRAME.minShare - 1e-9);
      expect(frame.maxZ - frame.minZ).toBeGreaterThanOrEqual(FLOOR.depth * HALL_FRAME.minShare - 1e-9);
    }
  });
});

describe("the screen axes of the camera", () => {
  const VIEW: [number, number, number] = [0.48, 0.56, 1];

  test("the axes are unit, at right angles, and the camera leans back (up has a positive y)", () => {
    const { right, up } = viewAxes(VIEW);
    const length = Math.hypot(...VIEW);
    const toward = [VIEW[0] / length, VIEW[1] / length, VIEW[2] / length] as const;
    const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(Math.hypot(...right)).toBeCloseTo(1, 10);
    expect(Math.hypot(...up)).toBeCloseTo(1, 10);
    expect(dot(right, up)).toBeCloseTo(0, 10);
    expect(dot(right, toward)).toBeCloseTo(0, 10);
    expect(dot(up, toward)).toBeCloseTo(0, 10);
    expect(right[1]).toBe(0);
    expect(up[1]).toBeGreaterThan(0);
  });

  test("looking straight down still has axes", () => {
    const { right, up } = viewAxes([0, 3, 0]);
    expect(right).toEqual([1, 0, 0]);
    expect(up).toEqual([0, 0, -1]);
    expect(viewAxes([0, 0, 0]).right).toEqual([1, 0, 0]);
  });
});

describe("projectBox", () => {
  const VIEW: [number, number, number] = [0.48, 0.56, 1];
  const look: [number, number] = [FLOOR.width / 2, FLOOR.depth / 2];

  test("the whole floor: the width is what the two floor axes add up to, and it is centred sideways", () => {
    const { right } = viewAxes(VIEW);
    const seen = projectBox(WHOLE, 0, VIEW, look);
    expect(seen.halfWidth).toBeCloseTo((FLOOR.width * Math.abs(right[0]) + FLOOR.depth * Math.abs(right[2])) / 2, 8);
    expect(seen.shiftRight).toBeCloseTo(0, 8);
    expect(seen.shiftUp).toBeCloseTo(0, 8);
  });

  test("headroom lifts the middle of the view (the camera moves up the screen), and makes the view taller", () => {
    const flat = projectBox(WHOLE, 0, VIEW, look);
    const tall = projectBox(WHOLE, 60, VIEW, look);
    expect(tall.halfHeight).toBeGreaterThan(flat.halfHeight);
    expect(tall.shiftUp).toBeGreaterThan(0);
    expect(tall.halfWidth).toBeCloseTo(flat.halfWidth, 10);
  });

  test("a part of the floor needs a smaller view than the whole, and its middle is where the part is", () => {
    const whole = projectBox(WHOLE, 40, VIEW, look);
    const part = projectBox(frameRect(FLOOR, [rect(100, 50, 300, 200)]), 40, VIEW, look);
    expect(part.halfWidth).toBeLessThan(whole.halfWidth);
    expect(part.halfHeight).toBeLessThan(whole.halfHeight);
    // The part is on the left of the plan: the view moves left (right axis points to +x).
    expect(part.shiftRight).toBeLessThan(0);
  });

  test("a rect that grows never needs a smaller view", () => {
    const inner = projectBox(rect(300, 200, 500, 300), 40, VIEW, look);
    const outer = projectBox(rect(200, 150, 600, 350), 40, VIEW, look);
    expect(outer.halfWidth).toBeGreaterThanOrEqual(inner.halfWidth);
    expect(outer.halfHeight).toBeGreaterThanOrEqual(inner.halfHeight);
  });
});
