import { describe, expect, test } from "vitest";
import { STAGE_BLOOM, blendMode, bloomParams, parseCssColor, themeOf } from "./theme";

describe("the theme of a scene", () => {
  test("anything but dark is the light theme", () => {
    expect(themeOf("dark")).toBe("dark");
    expect(themeOf("light")).toBe("light");
    expect(themeOf(null)).toBe("light");
    expect(themeOf(undefined)).toBe("light");
    expect(themeOf("")).toBe("light");
  });

  test("bloom is a pass of the dark theme at the high quality only", () => {
    expect(bloomParams("dark", "high")).toEqual(STAGE_BLOOM);
    expect(bloomParams("dark", "low")).toBeNull();
    expect(bloomParams("light", "high")).toBeNull();
    expect(bloomParams("light", "low")).toBeNull();
  });

  test("the bloom glows only above its threshold, so the surface of the page never does", () => {
    expect(STAGE_BLOOM.threshold).toBeGreaterThan(0.5);
    expect(STAGE_BLOOM.threshold).toBeLessThan(1);
    expect(STAGE_BLOOM.strength).toBeGreaterThan(0);
    expect(STAGE_BLOOM.strength).toBeLessThanOrEqual(1);
  });

  test("light is added in the dark theme and painted in the light one", () => {
    expect(blendMode("dark")).toBe("additive");
    expect(blendMode("light")).toBe("normal");
  });
});

describe("parseCssColor", () => {
  const close = (value: [number, number, number] | null, expected: [number, number, number]) => {
    expect(value).not.toBeNull();
    value?.forEach((part, index) => expect(part).toBeCloseTo(expected[index], 3));
  };

  test("reads the hex forms of the tokens", () => {
    close(parseCssColor("#6fc05d"), [0x6f / 255, 0xc0 / 255, 0x5d / 255]);
    close(parseCssColor("  #FFFEFA "), [1, 0xfe / 255, 0xfa / 255]);
    close(parseCssColor("#fff"), [1, 1, 1]);
    close(parseCssColor("#292e2bcc"), [0x29 / 255, 0x2e / 255, 0x2b / 255]);
  });

  test("reads both rgb() forms, with and without an alpha", () => {
    close(parseCssColor("rgb(41, 46, 43)"), [41 / 255, 46 / 255, 43 / 255]);
    close(parseCssColor("rgba(41, 46, 43, 0.5)"), [41 / 255, 46 / 255, 43 / 255]);
    close(parseCssColor("rgb(23 25 24 / 0.1)"), [23 / 255, 25 / 255, 24 / 255]);
    close(parseCssColor("rgb(100% 0% 50%)"), [1, 0, 0.5]);
  });

  test("anything else is null, never a wrong colour", () => {
    for (const value of ["", "  ", null, undefined, "red", "var(--admin-danger)", "#12", "#12345", "hsl(10 20% 30%)", "rgb(1, 2)"]) {
      expect(parseCssColor(value), String(value)).toBeNull();
    }
  });
});
