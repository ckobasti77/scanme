import { describe, expect, it } from "vitest";
import {
  cmykToRgb,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  normalizeHexColor,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from "./scanme-color";

describe("ScanMe color conversions", () => {
  it("normalizes supported HEX forms without alpha", () => {
    expect(normalizeHexColor("c6ff4a")).toBe("#C6FF4A");
    expect(normalizeHexColor("#abc")).toBe("#AABBCC");
    expect(normalizeHexColor("#C6FF4A99")).toBe("#C6FF4A");
  });

  it.each(["#C6FF4A", "#285C52", "#0E3158", "#F7F1EA", "#000000"])(
    "round-trips %s through HSV, HSL and CMYK",
    (hex) => {
      const rgb = hexToRgb(hex);
      expect(rgbToHex(hsvToRgb(rgbToHsv(rgb)))).toBe(hex);
      expect(rgbToHex(hslToRgb(rgbToHsl(rgb)))).toBe(hex);
      expect(rgbToHex(cmykToRgb(rgbToCmyk(rgb)))).toBe(hex);
    },
  );
});
