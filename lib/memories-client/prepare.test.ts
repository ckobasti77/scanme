// TASK-16 STEP 5 — the downscale respects the server's dimension and a small
// image is never enlarged. fitWithin is the pure math the canvas path applies
// verbatim (target = fitWithin(bitmap, maxDimension)); the canvas encode
// itself needs a real browser and is exercised by the /dev harness QA.

import { describe, expect, test } from "vitest";
import { fitWithin } from "./prepare";

describe("fitWithin", () => {
  test("clamps the long edge to the server's dimension, preserving aspect", () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    // Portrait: the LONG edge is the height.
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  test("respects each plan tier's dimension", () => {
    expect(fitWithin(8000, 6000, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(8000, 6000, 4096)).toEqual({ width: 4096, height: 3072 });
  });

  test("a small image is not enlarged", () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2048, 1536, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  test("extreme aspect ratios never round to zero", () => {
    expect(fitWithin(10000, 10, 2048)).toEqual({ width: 2048, height: 2 });
    expect(fitWithin(10000, 1, 2048).height).toBe(1);
  });

  test("degenerate zero input passes through untouched", () => {
    expect(fitWithin(0, 0, 2048)).toEqual({ width: 0, height: 0 });
  });
});
