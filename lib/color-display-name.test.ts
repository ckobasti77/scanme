import { describe, expect, it } from "vitest";
import { colorDisplayName } from "./color-display-name";
import { COOLORS_COLOR_NAMES } from "./coolors-color-name-data";

describe("colorDisplayName", () => {
  it.each([
    ["#F4BE30", "Tuscan Sun"],
    ["#0E3158", "Oxford Navy"],
    ["#C0D6DF", "Pale Sky"],
    ["#DBE9EE", "Alice Blue"],
    ["#C44900", "Burnt Orange"],
    ["#C6FF4A", "Chartreuse"],
    ["#123456", "Deep Space Blue"],
    ["#ABCDEF", "Powder Blue"],
    ["#010101", "Black"],
    ["#FEFEFE", "White"],
  ])("matches Coolors for %s", (hex, expected) => {
    expect(colorDisplayName(hex)).toBe(expected);
  });

  it("returns every exact library name for its own HEX value", () => {
    for (const [hex, name] of COOLORS_COLOR_NAMES) {
      expect(colorDisplayName(`#${hex}`)).toBe(name);
    }
  });

  it("keeps invalid draft values user-friendly", () => {
    expect(colorDisplayName("#12")).toBe("Custom Color");
  });
});
