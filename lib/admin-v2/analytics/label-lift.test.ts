import { describe, expect, test } from "vitest";
import { liftLabels, type LiftLabel } from "./label-lift";

const label = (x: number, y: number, width = 80, height = 20): LiftLabel => ({ x, y, width, height });

function overlap(a: LiftLabel, ay: number, b: LiftLabel, by: number): boolean {
  const overX = Math.abs(a.x - b.x) < (a.width + b.width) / 2;
  const overY = ay > by - b.height && ay - a.height < by;
  return overX && overY;
}

describe("ADMIN v2 X3: labels of the 3D map do not cover each other", () => {
  test("labels that are apart stay on their blocks", () => {
    const labels = [label(50, 100), label(200, 100), label(50, 160)];
    expect(liftLabels(labels)).toEqual([100, 100, 160]);
  });

  test("of two that overlap, the lower one stays and the upper one moves above it", () => {
    const labels = [label(100, 100), label(130, 108)];
    expect(liftLabels(labels)).toEqual([108 - 20 - 2, 108]);
  });

  test("labels side by side on one line are too close only inside the gap", () => {
    expect(liftLabels([label(40, 100), label(121, 100)])).toEqual([100, 78]);
    expect(liftLabels([label(40, 100), label(123, 100)])).toEqual([100, 100]);
  });

  test("a pile of labels becomes a stack with no overlap, the nearest at the bottom", () => {
    const labels = [label(100, 100), label(110, 104), label(120, 96), label(105, 110, 60)];
    const y = liftLabels(labels);
    expect(y[3]).toBe(110);
    for (let a = 0; a < labels.length; a += 1) {
      for (let b = a + 1; b < labels.length; b += 1) expect(overlap(labels[a], y[a], labels[b], y[b])).toBe(false);
    }
    expect(y.every((value, index) => value <= labels[index].y)).toBe(true);
  });

  test("the same input gives the same output; nothing to place, nothing returned", () => {
    const labels = [label(100, 100), label(100, 100), label(100, 100)];
    expect(liftLabels(labels)).toEqual([100, 78, 56]);
    expect(liftLabels(labels)).toEqual(liftLabels(labels));
    expect(liftLabels([])).toEqual([]);
  });
});
