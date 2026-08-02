import { describe, expect, it } from "vitest";
import { colorToOklch, contrastRatio } from "./scanme-color-science";
import { createDefaultScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  applyGeneratedPalette,
  generateScanMePalette,
} from "./scanme-palette";

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

  it("keeps generated roles in one calm color family across regenerations", () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const palette = generateScanMePalette({
        sourceColors: ["#C6FF4A", "#C44900"],
        mode: seed % 2 ? "dark" : "light",
        seed,
      });
      const anchorHue = colorToOklch(palette[2]).h ?? 0;

      for (const color of [palette[0], palette[1], palette[3], palette[4]]) {
        const parsed = colorToOklch(color);
        const distance = Math.abs(
          (((parsed.h ?? anchorHue) - anchorHue + 540) % 360) - 180,
        );
        expect(distance).toBeLessThanOrEqual(30);
        expect(color).not.toBe("#000000");
        expect(color).not.toBe("#FFFFFF");
      }

      expect(contrastRatio(palette[3], palette[0])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette[3], palette[1])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette[4], palette[0])).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette[4], palette[1])).toBeGreaterThanOrEqual(3);
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
