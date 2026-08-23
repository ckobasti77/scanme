import { describe, expect, it } from "vitest";
import {
  colorDifference,
  colorToOklch,
  contrastRatio,
} from "./scanme-color-science";
import { createDefaultScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  applyGeneratedPalette,
  generateScanMePalette,
  PALETTE_SCHEME_TYPES,
} from "./scanme-palette";
import {
  defaultSchemeFromColors,
  type MaterialVariant,
} from "./scanme-material-color";

function hueDistance(first: number, second: number) {
  return Math.abs(((second - first + 540) % 360) - 180);
}

function aggregateDeltaE(a: string[], b: string[]) {
  // Non-accent roles only (accent is pinned to the logo, so it never moves).
  return [0, 1, 3, 4].reduce(
    (sum, index) => sum + colorDifference(a[index], b[index]),
    0,
  );
}

describe("ScanMe smart palette", () => {
  it("keeps exactly the extracted anchor and creates five usable light colors", () => {
    const palette = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#285C52", "#E36E52"],
      mode: "light",
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
      variant: "vibrant",
      currentColors: current,
      lockedSlots: [true, false, true, true, false],
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

  it("keeps a monochromatic scheme tied to the logo's own hue family", () => {
    for (const mode of ["light", "dark"] as const) {
      const palette = generateScanMePalette({
        sourceColors: ["#C6FF4A", "#C44900"],
        mode,
        schemeType: "monochromatic",
      });
      const anchorHue = colorToOklch(palette[2]).h ?? 0;
      // Button is the chromatic non-anchor role; monochromatic keeps it near the anchor hue.
      expect(hueDistance(colorToOklch(palette[4]).h ?? anchorHue, anchorHue)).toBeLessThanOrEqual(40);
      expect(contrastRatio(palette[3], palette[0])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette[4], palette[0])).toBeGreaterThanOrEqual(3);
    }
  });

  it("pushes the button toward the scheme's pole while the accent stays on the logo", () => {
    const anchor = "#C6FF4A";
    const mono = generateScanMePalette({ sourceColors: [anchor], mode: "light", schemeType: "monochromatic" });
    const analogous = generateScanMePalette({ sourceColors: [anchor], mode: "light", schemeType: "analogous" });
    const complementary = generateScanMePalette({ sourceColors: [anchor], mode: "light", schemeType: "complementary" });
    const buttonHueDistance = (p: string[]) =>
      hueDistance(colorToOklch(p[2]).h ?? 0, colorToOklch(p[4]).h ?? 0);

    expect(mono[2]).toBe(anchor);
    expect(buttonHueDistance(mono)).toBeLessThanOrEqual(40);
    expect(buttonHueDistance(analogous)).toBeGreaterThan(buttonHueDistance(mono));
    expect(buttonHueDistance(complementary)).toBeGreaterThan(110);
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

  it("makes each scheme change more than just the button", () => {
    // Regression: the old engine left background/surface/text identical across schemes.
    const sources = ["#1E88E5", "#F4511E"];
    const mono = generateScanMePalette({ sourceColors: sources, mode: "light", schemeType: "monochromatic" });
    const complementary = generateScanMePalette({ sourceColors: sources, mode: "light", schemeType: "complementary" });
    // The card surface visibly shifts with the scheme (ΔE > 5 = clearly perceptible), not
    // only the button (which changes far more).
    expect(colorDifference(mono[1], complementary[1])).toBeGreaterThan(5);
    expect(colorDifference(mono[4], complementary[4])).toBeGreaterThan(8);
  });

  it("gives Regenerate noticeably different variations", () => {
    // Regression: variations must be real, not a 5-degree shade nudge.
    const base = { sourceColors: ["#1E88E5", "#F4511E"], mode: "light" as const, schemeType: "complementary" as const };
    const content = generateScanMePalette({ ...base, variant: "content" });
    const tonalSpot = generateScanMePalette({ ...base, variant: "tonalSpot" });
    const vibrant = generateScanMePalette({ ...base, variant: "vibrant" });
    expect(aggregateDeltaE(content, vibrant)).toBeGreaterThan(10);
    expect(aggregateDeltaE(content, tonalSpot)).toBeGreaterThan(4);
  });

  it("holds contrast floors and avoids pure neutrals for every scheme, mode and variant", () => {
    for (const schemeType of PALETTE_SCHEME_TYPES) {
      for (const mode of ["light", "dark"] as const) {
        for (const variant of ["content", "tonalSpot", "vibrant"] as const) {
          const palette = generateScanMePalette({
            sourceColors: ["#C6FF4A", "#285C52"],
            mode,
            schemeType,
            variant,
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
    });
    const applied = applyGeneratedPalette(design, palette);

    expect(applied.design.background.category).toBe("gradient");
    if (applied.design.background.category !== "gradient") return;
    expect(applied.design.background.startColor).toBe(palette[0]);
    expect(applied.design.background.endColor).not.toBe(palette[0]);
    expect(applied.design.background.endColor).not.toBe(palette[1]);
  });
});

// Mirrors the real editor flow: the scheme is inferred from the logo's whole colour story
// (defaultSchemeFromColors), then the palette is generated from it.
function pipeline(sourceColors: string[], variant: MaterialVariant = "content") {
  return generateScanMePalette({
    sourceColors,
    mode: "light",
    schemeType: defaultSchemeFromColors(sourceColors),
    variant,
  });
}

describe("ScanMe palette — logo colours drive the result", () => {
  it("is deterministic end to end", () => {
    const options = {
      sourceColors: ["#C6FF4A", "#285C52", "#E36E52"],
      mode: "light" as const,
      schemeType: "complementary" as const,
      variant: "tonalSpot" as const,
    };
    expect(generateScanMePalette(options)).toEqual(generateScanMePalette(options));
  });

  it("changing the SECOND logo colour visibly changes the palette (point 5)", () => {
    // The second colour drives the inferred scheme, which reshapes surface + button + text.
    const base = pipeline(["#C6FF4A", "#285C52", "#E36E52"]);
    const changed = pipeline(["#C6FF4A", "#1E88E5", "#E36E52"]);
    expect(defaultSchemeFromColors(["#C6FF4A", "#285C52", "#E36E52"])).not.toBe(
      defaultSchemeFromColors(["#C6FF4A", "#1E88E5", "#E36E52"]),
    );
    expect(aggregateDeltaE(base, changed)).toBeGreaterThan(8);
  });

  it("changing the THIRD logo colour visibly changes the palette (point 6)", () => {
    // When the dominant colour repeats (a monochrome logo with one accent), the third
    // extracted colour becomes the effective secondary and reshapes the whole palette.
    const base = pipeline(["#C6FF4A", "#C6FF4A", "#285C52"]);
    const changed = pipeline(["#C6FF4A", "#C6FF4A", "#1E88E5"]);
    expect(aggregateDeltaE(base, changed)).toBeGreaterThan(8);
  });

  it("keeps locked slots bit-identical across a Regenerate that changes the variant", () => {
    const current = ["#F6F0EA", "#ECE1D8", "#C6FF4A", "#252623", "#315B52"];
    const locks = [true, false, true, true, true];
    const asContent = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#285C52"],
      mode: "dark",
      variant: "content",
      currentColors: current,
      lockedSlots: locks,
    });
    const asVibrant = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#285C52"],
      mode: "dark",
      variant: "vibrant",
      currentColors: current,
      lockedSlots: locks,
    });
    // Locked slots are byte-for-byte identical across the regenerate…
    for (const index of [0, 2, 3, 4]) {
      expect(asContent[index]).toBe(current[index]);
      expect(asVibrant[index]).toBe(current[index]);
    }
    // …while the one unlocked slot actually responds to the new variant.
    expect(asVibrant[1]).not.toBe(asContent[1]);
  });

  it("keeps the variant recognisable under locked and manually-edited slots (point 9)", () => {
    const base = {
      sourceColors: ["#C6FF4A", "#285C52"],
      mode: "light" as const,
      schemeType: "complementary" as const,
    };
    // A slot is locked to a hand-picked colour; the variant must still separate the looks on
    // the remaining slots, so which variant is active stays identifiable.
    const manual = ["#EDE7DF", "#111111", "#C6FF4A", "#20221F", "#3B5A50"];
    const content = generateScanMePalette({
      ...base,
      variant: "content",
      currentColors: manual,
      lockedSlots: [false, true, true, false, false],
    });
    const vibrant = generateScanMePalette({
      ...base,
      variant: "vibrant",
      currentColors: manual,
      lockedSlots: [false, true, true, false, false],
    });
    expect(content[1]).toBe("#111111"); // manual locked colour preserved
    expect(vibrant[1]).toBe("#111111");
    // Unlocked, variant-driven slots still differ → the variant is inferable from them.
    expect(aggregateDeltaE(content, vibrant)).toBeGreaterThan(4);
  });

  it("never duplicates a role and never lands on a near-extreme tone (point 10)", () => {
    for (const schemeType of PALETTE_SCHEME_TYPES) {
      for (const mode of ["light", "dark"] as const) {
        for (const variant of ["content", "tonalSpot", "vibrant"] as const) {
          const palette = generateScanMePalette({
            sourceColors: ["#C6FF4A", "#285C52", "#E36E52"],
            mode,
            schemeType,
            variant,
          });
          expect(new Set(palette).size).toBe(palette.length);
          palette.forEach((color, index) => {
            expect(color).not.toBe("#000000");
            expect(color).not.toBe("#FFFFFF");
            if (index === 2) return; // accent is the verbatim logo colour, exempt
            // An intentional airy near-white page / near-black text is fine; only truly
            // pure endpoints are forbidden.
            const l = colorToOklch(color).l;
            expect(l).toBeGreaterThan(0.03);
            expect(l).toBeLessThan(0.997);
          });
        }
      }
    }
  });
});
