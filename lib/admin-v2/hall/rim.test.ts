import { describe, expect, test } from "vitest";
import { rimStrip } from "./rim";

// ADMIN v3 V3 — the lit rim of a top: a strip along the inside of the outline of a stand.

const square: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];
const inner = (strip: { points: number[] }) => Array.from({ length: strip.points.length / 4 }, (_, index) => [strip.points[index * 4 + 2], strip.points[index * 4 + 3]]);
const outer = (strip: { points: number[] }) => Array.from({ length: strip.points.length / 4 }, (_, index) => [strip.points[index * 4], strip.points[index * 4 + 1]]);

describe("rimStrip", () => {
  test("a square: the inner outline is the same square, `width` in from every edge", () => {
    const strip = rimStrip(square, 10);
    expect(outer(strip)).toEqual(square);
    const moved = inner(strip);
    for (const [index, expected] of [[10, 10], [90, 10], [90, 90], [10, 90]].entries()) {
      expect(moved[index][0]).toBeCloseTo(expected[0], 9);
      expect(moved[index][1]).toBeCloseTo(expected[1], 9);
    }
  });

  test("the winding does not matter: the strip is always on the inside", () => {
    const moved = inner(rimStrip([...square].reverse(), 10));
    for (const [x, y] of moved) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
  });

  test("two triangles per edge, every index points at a point of the strip", () => {
    const strip = rimStrip(square, 10);
    expect(strip.points).toHaveLength(square.length * 4);
    expect(strip.indices).toHaveLength(square.length * 6);
    for (const index of strip.indices) expect(index).toBeLessThan(strip.points.length / 2);
    // The last edge closes the strip back to the first corner.
    expect(strip.indices.slice(-6)).toEqual([6, 7, 0, 0, 7, 1]);
  });

  test("an L-shaped stand: the inner corner of the L moves inwards too", () => {
    const shape: Array<[number, number]> = [[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]];
    const moved = inner(rimStrip(shape, 5));
    // The concave corner (50, 50) moves towards the body of the L, away from the notch.
    expect(moved[3][0]).toBeCloseTo(45, 9);
    expect(moved[3][1]).toBeCloseTo(45, 9);
    expect(moved[0][0]).toBeCloseTo(5, 9);
    expect(moved[0][1]).toBeCloseTo(5, 9);
  });

  test("a very sharp corner is not pushed far out of the stand", () => {
    const spike: Array<[number, number]> = [[0, 0], [200, 4], [0, 8]];
    for (const [x, y] of inner(rimStrip(spike, 2))) {
      expect(Math.abs(x)).toBeLessThan(210);
      expect(Math.abs(y)).toBeLessThan(20);
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
  });

  test("a repeated closing point is dropped; fewer than three corners and no width give nothing", () => {
    expect(rimStrip([...square, [0, 0]], 10)).toEqual(rimStrip(square, 10));
    expect(rimStrip([[0, 0], [10, 0]], 2)).toEqual({ points: [], indices: [] });
    expect(rimStrip(square, 0)).toEqual({ points: [], indices: [] });
    expect(rimStrip([], 2)).toEqual({ points: [], indices: [] });
  });
});
