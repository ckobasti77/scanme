import { describe, expect, test } from "vitest";
import { ADMIN_DURATION, ADMIN_LAYER_MAX } from "@/lib/admin-v2/motion";
import { HALL_PARTICLES } from "./impulses";
import { HALL_INTRO_MAX, HALL_MOTION, approach, introCamera, introColumnDelay, introGrow, powerInOut, powerOut, shortGrow } from "./motion";

// ADMIN v3 V3 — the motion of the Living hall: the intro of the camera is at most
// 1.6 s and ends on the isometric view, the columns have risen by 0.9 s (the
// nearest first), and a move of the slider settles inside the interaction layer.

describe("the intro of the camera", () => {
  test("is at most 1.6 s (ZADATAK-V3 §3.2) and the columns rise inside it", () => {
    expect(HALL_INTRO_MAX).toBe(1.6);
    expect(HALL_MOTION.intro.camera).toBeLessThanOrEqual(HALL_INTRO_MAX);
    expect(HALL_MOTION.intro.grow).toBeLessThanOrEqual(HALL_MOTION.intro.camera);
    expect(HALL_MOTION.intro.column).toBeLessThan(HALL_MOTION.intro.grow);
  });

  test("starts round the hall and further out, and ends exactly on the saved view", () => {
    const start = introCamera(0);
    expect(start.azimuth).toBeCloseTo((HALL_MOTION.intro.azimuthDeg * Math.PI) / 180, 10);
    expect(start.zoom).toBeCloseTo(HALL_MOTION.intro.zoom, 10);
    const end = introCamera(HALL_MOTION.intro.camera);
    expect(Math.abs(end.azimuth)).toBe(0);
    expect(end.zoom).toBe(1);
    // After the end nothing moves any more.
    expect(introCamera(5)).toEqual(end);
  });

  test("comes round without a turn back: the angle only shrinks and the zoom only grows", () => {
    let before = introCamera(0);
    for (let time = 0.05; time <= HALL_MOTION.intro.camera; time += 0.05) {
      const now = introCamera(time);
      expect(Math.abs(now.azimuth)).toBeLessThanOrEqual(Math.abs(before.azimuth));
      expect(now.zoom).toBeGreaterThanOrEqual(before.zoom);
      before = now;
    }
  });
});

describe("the columns of the intro", () => {
  test("the nearest starts at once, the farthest last, and every one has risen by 0.9 s", () => {
    const count = 6;
    expect(introColumnDelay(0, count)).toBe(0);
    for (let order = 1; order < count; order += 1) expect(introColumnDelay(order, count)).toBeGreaterThan(introColumnDelay(order - 1, count));
    expect(introColumnDelay(count - 1, count) + HALL_MOTION.intro.column).toBeCloseTo(HALL_MOTION.intro.grow, 10);
    for (let order = 0; order < count; order += 1) expect(introGrow(HALL_MOTION.intro.grow, order, count)).toBe(1);
  });

  test("at any moment a nearer column is at least as high as a farther one", () => {
    for (let time = 0; time <= 1; time += 0.1) {
      for (let order = 1; order < 5; order += 1) expect(introGrow(time, order - 1, 5)).toBeGreaterThanOrEqual(introGrow(time, order, 5));
    }
    expect(introGrow(0, 0, 5)).toBe(0);
    expect(introGrow(0.2, 4, 5)).toBe(0);
  });

  test("one column, and an order outside the range, are safe", () => {
    expect(introColumnDelay(0, 1)).toBe(0);
    expect(introColumnDelay(9, 1)).toBe(0);
    expect(introColumnDelay(99, 4)).toBe(introColumnDelay(3, 4));
    expect(introColumnDelay(-1, 4)).toBe(0);
  });

  test("a returning page: the columns only rise, together, in 0.4 s", () => {
    expect(HALL_MOTION.short).toBeLessThanOrEqual(ADMIN_LAYER_MAX.reveal);
    expect(shortGrow(0)).toBe(0);
    expect(shortGrow(HALL_MOTION.short)).toBe(1);
    expect(shortGrow(0.2)).toBeGreaterThan(0.5);
  });
});

describe("curves and the settle of a column", () => {
  test("the curves start at 0, end at 1 and do not overshoot", () => {
    for (const curve of [powerInOut, powerOut]) {
      expect(curve(0)).toBe(0);
      expect(curve(1)).toBe(1);
      expect(curve(-1)).toBe(0);
      expect(curve(2)).toBe(1);
      expect(curve(Number.NaN)).toBe(0);
      for (let k = 0; k <= 1; k += 0.05) {
        expect(curve(k)).toBeGreaterThanOrEqual(0);
        expect(curve(k)).toBeLessThanOrEqual(1);
      }
    }
    expect(powerInOut(0.5)).toBeCloseTo(0.5, 10);
  });

  test("a move of the slider settles inside the interaction layer (≤ 250 ms)", () => {
    let height = 0;
    for (let time = 0; time < ADMIN_LAYER_MAX.interakcija; time += 1 / 60) height = approach(height, 1, 1 / 60, HALL_MOTION.settle);
    expect(height).toBeGreaterThan(0.96);
    expect(height).toBeLessThanOrEqual(1);
    expect(ADMIN_DURATION.move).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
  });

  test("the approach does not depend on the frame rate and never passes its goal", () => {
    const at60 = Array.from({ length: 6 }).reduce<number>((value) => approach(value, 1, 1 / 60, HALL_MOTION.settle), 0);
    const at30 = Array.from({ length: 3 }).reduce<number>((value) => approach(value, 1, 1 / 30, HALL_MOTION.settle), 0);
    expect(at60).toBeCloseTo(at30, 10);
    expect(approach(0.2, 1, 10, HALL_MOTION.settle)).toBeLessThanOrEqual(1);
    expect(approach(0.2, 1, 0, HALL_MOTION.settle)).toBe(0.2);
    expect(approach(0.2, 1, 0.1, 0)).toBe(1);
  });

  test("the ring of a new scan and the flash of an hour are short", () => {
    expect(HALL_MOTION.ring).toBe(HALL_PARTICLES.ringS);
    expect(HALL_MOTION.flash).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
  });
});
