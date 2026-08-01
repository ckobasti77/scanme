import { describe, expect, test } from "vitest";
import { serbianPluralForm } from "./serbian-plural";

describe("serbianPluralForm", () => {
  test.each([
    [0, "linkova"],
    [1, "link"],
    [2, "linka"],
    [4, "linka"],
    [5, "linkova"],
    [11, "linkova"],
    [12, "linkova"],
    [14, "linkova"],
    [21, "link"],
    [22, "linka"],
    [25, "linkova"],
  ])("returns the correct form for %i", (value, expected) => {
    expect(serbianPluralForm(value, ["link", "linka", "linkova"])).toBe(
      expected,
    );
  });
});
