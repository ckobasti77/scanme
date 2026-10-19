import { describe, expect, test } from "vitest";
import { SYSTEMS } from "./catalog";
import { contrast, hexToRgb, lighten, mixHex, rgbToHex } from "./color";

describe("boje pregledača", () => {
  test("heks ↔ rgb", () => {
    expect(hexToRgb("#FF8000")).toEqual([1, 128 / 255, 0]);
    expect(rgbToHex([1, 128 / 255, 0])).toBe("#FF8000");
    expect(() => hexToRgb("plavo")).toThrow();
  });

  test("lighten: k = 0 ista boja, k = 1 bela, između je svetlije", () => {
    expect(lighten("#3D9BFF", 0)).toBe("#3D9BFF");
    expect(lighten("#3D9BFF", 1)).toBe("#FFFFFF");
    const mid = hexToRgb(lighten("#3D9BFF", 0.35));
    const base = hexToRgb("#3D9BFF");
    mid.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(base[i]));
    // Mešanje je u linearnom prostoru: sredina crne i bele je #BCBCBC, a ne #808080 (sRGB).
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#BCBCBC");
  });

  test("svih 10 boja sistema ima kontrast ≥ 5,9 na pozadini studija #0A0D11 (A01 §2.1 zaokružuje 5,95 na 6,0)", () => {
    for (const s of SYSTEMS) expect(contrast(s.color, "#0A0D11"), s.id).toBeGreaterThanOrEqual(5.9);
  });
});
