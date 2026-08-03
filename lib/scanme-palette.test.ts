import { describe, expect, it } from "vitest";
import { colorToOklch, contrastRatio } from "./scanme-color-science";
import { createDefaultScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  applyGeneratedPalette,
  generateScanMePalette,
  PALETTE_SCHEME_TYPES,
} from "./scanme-palette";

function hueDistance(first: number, second: number) {
  return Math.abs(((second - first + 540) % 360) - 180);
}

describe("ScanMe smart palette", () => {
  it("keeps exactly the extracted anchor and creates five usable light colors", () => {
    const palette = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#285C52", "#E36E52"],
      mode: "light",
      seed: 2,
    });

    expect(palette).toHaveLength(5);
    expect(palette[2]).toBe("#C6FF4A");
    expect(palette.filter((color) => color === "#C6FF4A")).toHaveLength(1);
    expect(contrastRatio(palette[3], palette[0])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette[3], palette[1])).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves locked slots while regenerating unlocked colors", () => {
    const current = ["#F6F0EA", "#ECE1D8", "#C6FF4A", "#252623", "#315B52"];
    const next = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#285C52"],
      mode: "dark",
      currentColors: current,
      lockedSlots: [true, false, true, true, false],
      seed: 4,
    });

    expect(next[0]).toBe(current[0]);
    expect(next[2]).toBe("#C6FF4A");
    expect(next[3]).toBe(current[3]);
    expect(next[1]).not.toBe(current[1]);
    expect(next[4]).not.toBe(current[4]);
  });

  it("applies the semantic palette without replacing the background category", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    const palette = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#285C52"],
      mode: "light",
      seed: 1,
    });
    const applied = applyGeneratedPalette(design, palette);

    expect(applied.design.background.category).toBe(design.background.category);
    expect(applied.design.colors.page).toBe(palette[0]);
    expect(applied.design.colors.surface).toBe(palette[1]);
    expect(applied.design.colors.accent).toBe("#C6FF4A");
    expect(applied.design.colors.button).toBe(palette[4]);
    expect(
      contrastRatio(
        applied.design.colors.buttonText,
        applied.design.colors.button,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a monochromatic scheme in one calm color family across regenerations", () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const palette = generateScanMePalette({
        sourceColors: ["#C6FF4A", "#C44900"],
        mode: seed % 2 ? "dark" : "light",
        schemeType: "monochromatic",
        seed,
      });
      const anchorHue = colorToOklch(palette[2]).h ?? 0;

      for (const color of [palette[0], palette[1], palette[3], palette[4]]) {
        const parsed = colorToOklch(color);
        expect(hueDistance(parsed.h ?? anchorHue, anchorHue)).toBeLessThanOrEqual(30);
        expect(color).not.toBe("#000000");
        expect(color).not.toBe("#FFFFFF");
      }

      expect(contrastRatio(palette[3], palette[0])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette[3], palette[1])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette[4], palette[0])).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette[4], palette[1])).toBeGreaterThanOrEqual(3);
    }
  });

  it("places the button at the scheme's secondary pole while the accent stays on the logo", () => {
    const anchor = "#C6FF4A";
    const cases: Array<{
      schemeType: Parameters<typeof generateScanMePalette>[0]["schemeType"];
      min: number;
      max: number;
    }> = [
      { schemeType: "complementary", min: 150, max: 180 },
      { schemeType: "split-complementary", min: 135, max: 180 },
      { schemeType: "triadic", min: 95, max: 145 },
      { schemeType: "analogous", min: 8, max: 50 },
      { schemeType: "monochromatic", min: 0, max: 18 },
    ];
    for (const { schemeType, min, max } of cases) {
      const palette = generateScanMePalette({
        sourceColors: [anchor],
        mode: "light",
        schemeType,
      });
      expect(palette[2]).toBe(anchor);
      const distance = hueDistance(
        colorToOklch(palette[2]).h ?? 0,
        colorToOklch(palette[4]).h ?? 0,
      );
      expect(distance).toBeGreaterThanOrEqual(min);
      expect(distance).toBeLessThanOrEqual(max);
    }
  });

  it("orders lightness with background lightest and text darkest in light mode", () => {
    const palette = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#3A2E22"],
      mode: "light",
      schemeType: "complementary",
    });
    expect(colorToOklch(palette[0]).l).toBeGreaterThan(
      (colorToOklch(palette[3]).l ?? 0) + 0.4,
    );
  });

  it("switching scheme keeps the anchor but moves the button hue", () => {
    const sources = ["#C6FF4A", "#285C52"];
    const mono = generateScanMePalette({
      sourceColors: sources,
      mode: "light",
      schemeType: "monochromatic",
    });
    const complementary = generateScanMePalette({
      sourceColors: sources,
      mode: "light",
      schemeType: "complementary",
    });
    expect(mono[2]).toBe(complementary[2]);
    expect(
      hueDistance(
        colorToOklch(mono[4]).h ?? 0,
        colorToOklch(complementary[4]).h ?? 0,
      ),
    ).toBeGreaterThan(120);
  });

  it("holds contrast floors and avoids pure neutrals for every scheme and mode", () => {
    for (const schemeType of PALETTE_SCHEME_TYPES) {
      for (const mode of ["light", "dark"] as const) {
        for (let seed = 0; seed < 4; seed += 1) {
          const palette = generateScanMePalette({
            sourceColors: ["#C6FF4A", "#285C52"],
            mode,
            schemeType,
            seed,
          });
          expect(contrastRatio(palette[3], palette[0])).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(palette[3], palette[1])).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(palette[4], palette[0])).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(palette[4], palette[1])).toBeGreaterThanOrEqual(3);
          for (const color of palette) {
            expect(color).not.toBe("#000000");
            expect(color).not.toBe("#FFFFFF");
          }
        }
      }
    }
  });

  it("derives a harmonious second gradient color from the generated primary", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = {
      category: "gradient",
      variant: "linear",
      startColor: "#F7F1EA",
      endColor: "#E2D4C9",
      angle: 135,
      centerX: 50,
      centerY: 50,
    };
    const palette = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#285C52"],
      mode: "light",
      seed: 3,
    });
    const applied = applyGeneratedPalette(design, palette);

    expect(applied.design.background.category).toBe("gradient");
    if (applied.design.background.category !== "gradient") return;
    expect(applied.design.background.startColor).toBe(palette[0]);
    expect(applied.design.background.endColor).not.toBe(palette[0]);
    expect(applied.design.background.endColor).not.toBe(palette[1]);
  });
});
