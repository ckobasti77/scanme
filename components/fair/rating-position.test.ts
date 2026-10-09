import { describe, expect, test } from "vitest";
import { fairRatingFromPosition, fairRatingText } from "./rating-position";

describe("fairRatingFromPosition", () => {
  test.each([
    [0.0, 1], // a tap at the very left still gives the minimum
    [0.05, 1], // left half of star 1 → .5, clamped to 1
    [0.15, 1],
    [0.25, 1.5], // left half of star 2
    [0.3, 1.5],
    [0.35, 2],
    [0.62, 3.5],
    [0.7, 3.5],
    [0.71, 4],
    [0.95, 5],
    [1, 5],
    [1.4, 5],
  ])("%d → %d", (fraction, rating) => {
    expect(fairRatingFromPosition(fraction)).toBe(rating);
  });
});

test("fairRatingText uses a decimal comma", () => {
  expect(fairRatingText(4.5)).toBe("4,5");
  expect(fairRatingText(4)).toBe("4");
});
