import { describe, expect, it } from "vitest";
import {
  colorDifference,
  colorToOklch,
  contrastRatio,
  FALLBACK_ACHROMATIC_HUE,
  normalizeColorHex,
} from "./scanme-color-science";
import { createDefaultScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  applyGeneratedPalette,
  generateScanMePalette,
  inferPaletteModeFromProfile,
  PALETTE_SCHEME_TYPES,
} from "./scanme-palette";
import {
  buildLogoProfileFromColors,
  buildLogoProfileFromPixels,
} from "./accent-palette";
import { defaultSchemeFromColors } from "./scanme-material-color";

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

const SIX_CHROMATIC_INPUTS = [
  "#FF6F00", // Warm orange (hue ~45°)
  "#1E88E5", // Cool blue (hue ~245°)
  "#2E7D32", // Green (hue ~140°)
  "#7B1FA2", // Purple (hue ~315°)
  "#7A5C43", // Muted earthy (hue ~55°)
  "#C6FF4A", // Lime green (hue ~125°)
];

const ACHROMATIC_INPUTS = [
  "#757575", // Medium gray
  "#1A1A1A", // Near black
  "#F5F5F5", // Near white
];

describe("ScanMe smart palette — Nova Politika Boja", () => {
  // 1. Hue pozadine je (hue_akcenta + 180) mod 360, tolerancija ±5°, za najmanje 6 ulaznih boja
  it("Pravilo 2: hue pozadine je tačan komplement akcenta (±5°) za sve testirane ulaze u oba režima", () => {
    for (const input of SIX_CHROMATIC_INPUTS) {
      for (const mode of ["light", "dark"] as const) {
        const palette = generateScanMePalette({
          sourceColors: [input],
          mode,
        });
        const accentHue = colorToOklch(input).h ?? 0;
        const expectedBgHue = (accentHue + 180) % 360;
        const actualBgHue = colorToOklch(palette[0]).h ?? 0;

        expect(
          hueDistance(actualBgHue, expectedBgHue),
          `Input ${input} (${mode}) expected bg hue ~${expectedBgHue} but got ${actualBgHue}`,
        ).toBeLessThanOrEqual(5);
      }
    }
  });

  // 2. Akcent je bit-identičan prvoj Color Thief boji
  it("Pravilo 1: akcent je bit-identičan prvoj Color Thief boji, bez promene i bez tonske korekcije", () => {
    for (const input of [...SIX_CHROMATIC_INPUTS, ...ACHROMATIC_INPUTS]) {
      const palette = generateScanMePalette({
        sourceColors: [input, "#285C52", "#E36E52"],
        mode: "light",
      });
      expect(palette[2]).toBe(normalizeColorHex(input));
    }
  });

  // 3. Pozadina zadržava merljivu zasićenost — nije neutralno siva
  it("Pravilo 2: pozadina zadržava merljivu zasićenost (C >= 0.02) i nije neutralno siva", () => {
    for (const input of SIX_CHROMATIC_INPUTS) {
      for (const mode of ["light", "dark"] as const) {
        for (const variant of ["content", "tonalSpot", "vibrant"] as const) {
          const palette = generateScanMePalette({
            sourceColors: [input],
            mode,
            variant,
          });
          const bgOklch = colorToOklch(palette[0]);
          expect(bgOklch.c).toBeGreaterThanOrEqual(0.02);
        }
      }
    }
  });

  // 4. Surface deli hue sa pozadinom i razlikuje se od nje po svetlini
  it("Pravilo 3: surface deli hue sa pozadinom i razlikuje se po svetlini (|ΔL| >= 0.04)", () => {
    for (const input of SIX_CHROMATIC_INPUTS) {
      for (const mode of ["light", "dark"] as const) {
        const palette = generateScanMePalette({
          sourceColors: [input],
          mode,
        });
        const bgOklch = colorToOklch(palette[0]);
        const surfaceOklch = colorToOklch(palette[1]);

        expect(
          hueDistance(surfaceOklch.h ?? 0, bgOklch.h ?? 0),
        ).toBeLessThanOrEqual(5);
        expect(Math.abs(surfaceOklch.l - bgOklch.l)).toBeGreaterThanOrEqual(
          0.04,
        );
      }
    }
  });

  // 5. Tekst je uvek varijacija crne ili bele (C < 0.02, L < 0.25 ili L > 0.90)
  it("Pravilo 4: tekst je uvek varijacija crne ili bele (C < 0.02, L < 0.25 ili L > 0.90 — nikad između)", () => {
    for (const input of [...SIX_CHROMATIC_INPUTS, ...ACHROMATIC_INPUTS]) {
      for (const mode of ["light", "dark"] as const) {
        for (const variant of ["content", "tonalSpot", "vibrant"] as const) {
          const palette = generateScanMePalette({
            sourceColors: [input],
            mode,
            variant,
          });
          const textOklch = colorToOklch(palette[3]);
          expect(textOklch.c).toBeLessThan(0.02);
          const isExtremeLightOrDark =
            textOklch.l < 0.25 || textOklch.l > 0.9;
          expect(
            isExtremeLightOrDark,
            `Text lightness ${textOklch.l} for ${input} in ${mode} mode must be < 0.25 or > 0.90`,
          ).toBe(true);
        }
      }
    }
  });

  // 5a. Na svetloj pozadini bira se tamna strana, na tamnoj svetla
  it("Pravilo 4a: na svetloj pozadini bira se tamni tekst, na tamnoj svetli tekst", () => {
    for (const input of [...SIX_CHROMATIC_INPUTS, ...ACHROMATIC_INPUTS]) {
      const lightPalette = generateScanMePalette({
        sourceColors: [input],
        mode: "light",
      });
      expect(colorToOklch(lightPalette[3]).l).toBeLessThan(0.25);

      const darkPalette = generateScanMePalette({
        sourceColors: [input],
        mode: "dark",
      });
      expect(colorToOklch(darkPalette[3]).l).toBeGreaterThan(0.9);
    }
  });

  // 5b. Tekst prelazi 4.5:1 i prema pozadini i prema površini
  it("Pravilo 4b: tekst prelazi 4.5:1 i prema pozadini i prema površini", () => {
    for (const input of [...SIX_CHROMATIC_INPUTS, ...ACHROMATIC_INPUTS]) {
      for (const mode of ["light", "dark"] as const) {
        const palette = generateScanMePalette({
          sourceColors: [input],
          mode,
        });
        expect(contrastRatio(palette[3], palette[0])).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(palette[3], palette[1])).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  // 5c. Tekst na dugmetu prelazi 4.5:1 prema dugmetu i takođe je varijacija crne ili bele
  it("Pravilo 4c: tekst na dugmetu prelazi 4.5:1 prema dugmetu i varijacija je crne ili bele", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    for (const input of SIX_CHROMATIC_INPUTS) {
      for (const mode of ["light", "dark"] as const) {
        const palette = generateScanMePalette({
          sourceColors: [input],
          mode,
        });
        const applied = applyGeneratedPalette(design, palette);
        const buttonText = applied.design.colors.buttonText;
        const button = applied.design.colors.button;

        expect(contrastRatio(buttonText, button)).toBeGreaterThanOrEqual(4.5);
        const btOklch = colorToOklch(buttonText);
        expect(btOklch.c).toBeLessThan(0.02);
        expect(btOklch.l < 0.25 || btOklch.l > 0.9).toBe(true);
      }
    }
  });

  // 5d. Tekst nikad nije tačno #000000 ni tačno #FFFFFF i nosi hue pozadine
  it("Pravilo 4d: tekst nikad nije #000000 ni #FFFFFF i nosi hue pozadine", () => {
    for (const input of SIX_CHROMATIC_INPUTS) {
      for (const mode of ["light", "dark"] as const) {
        const palette = generateScanMePalette({
          sourceColors: [input],
          mode,
        });
        expect(palette[3]).not.toBe("#000000");
        expect(palette[3]).not.toBe("#FFFFFF");

        const bgHue = colorToOklch(palette[0]).h ?? 0;
        const textHue = colorToOklch(palette[3]).h ?? 0;
        expect(hueDistance(textHue, bgHue)).toBeLessThanOrEqual(10);
      }
    }
  });

  // 6. Dugme i ikone prelaze 3:1 gde je relevantno
  it("Pravilo 6: dugme prelazi 3:1 prema pozadini i površini, a ikona prelazi 3:1", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    for (const input of SIX_CHROMATIC_INPUTS) {
      for (const mode of ["light", "dark"] as const) {
        const palette = generateScanMePalette({
          sourceColors: [input],
          mode,
        });
        expect(contrastRatio(palette[4], palette[0])).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(palette[4], palette[1])).toBeGreaterThanOrEqual(3);

        const applied = applyGeneratedPalette(design, palette);
        expect(
          contrastRatio(
            applied.design.colors.icon,
            applied.design.colors.surface,
          ),
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  // 7. Akromatski logo pogađa definisani fallback i ne proizvodi NaN
  it("Pravilo 5: akromatski logo pogađa deterministički fallback (250° cool slate) bez NaN", () => {
    for (const gray of ACHROMATIC_INPUTS) {
      for (const mode of ["light", "dark"] as const) {
        const palette = generateScanMePalette({
          sourceColors: [gray],
          mode,
        });
        expect(palette).toHaveLength(5);
        for (const color of palette) {
          const oklch = colorToOklch(color);
          expect(Number.isNaN(oklch.l)).toBe(false);
          expect(Number.isNaN(oklch.c)).toBe(false);
          expect(Number.isNaN(oklch.h ?? 0)).toBe(false);
        }
        const bgHue = colorToOklch(palette[0]).h ?? 0;
        expect(
          hueDistance(bgHue, FALLBACK_ACHROMATIC_HUE),
        ).toBeLessThanOrEqual(10);
      }
    }
  });

  // 8. Promena druge i treće logo boje vidljivo menja paletu, ali NE pomera hue pozadine
  it("Pravilo 6: promena 2. i 3. logo boje menja paletu (dugme), ali NE pomera hue pozadine", () => {
    const baseColors = ["#C6FF4A", "#285C52", "#E36E52"];
    const changedColors = ["#C6FF4A", "#1E88E5", "#E36E52"];

    const base = generateScanMePalette({
      sourceColors: baseColors,
      mode: "light",
      schemeType: defaultSchemeFromColors(baseColors),
    });
    const changed = generateScanMePalette({
      sourceColors: changedColors,
      mode: "light",
      schemeType: defaultSchemeFromColors(changedColors),
    });

    // Background hue is strictly identical in both palettes
    const baseBgHue = colorToOklch(base[0]).h ?? 0;
    const changedBgHue = colorToOklch(changed[0]).h ?? 0;
    expect(hueDistance(baseBgHue, changedBgHue)).toBeLessThanOrEqual(1);

    // Overall palette (button) visibly changes
    expect(aggregateDeltaE(base, changed)).toBeGreaterThan(8);
  });

  // 9. Zaključani slotovi ostaju identični kroz regeneraciju i promenu režima
  it("Pravilo 7: zaključani slotovi ostaju bit-identični kroz regeneraciju i promenu režima", () => {
    const current = ["#F6F0EA", "#ECE1D8", "#C6FF4A", "#252623", "#315B52"];
    const locks = [true, false, true, true, false];
    const regenerated = generateScanMePalette({
      sourceColors: ["#C6FF4A", "#285C52"],
      mode: "dark",
      variant: "vibrant",
      currentColors: current,
      lockedSlots: locks,
    });

    expect(regenerated[0]).toBe(current[0]);
    expect(regenerated[2]).toBe(current[2]);
    expect(regenerated[3]).toBe(current[3]);
    expect(regenerated[1]).not.toBe(current[1]);
    expect(regenerated[4]).not.toBe(current[4]);
  });

  // 10. Sve tri Material varijante su deterministične i međusobno različite
  it("Pravilo 7: sve tri Material varijante (content, tonalSpot, vibrant) su deterministične i različite", () => {
    const base = {
      sourceColors: ["#1E88E5", "#F4511E"],
      mode: "light" as const,
      schemeType: "complementary" as const,
    };
    const content = generateScanMePalette({ ...base, variant: "content" });
    const tonalSpot = generateScanMePalette({ ...base, variant: "tonalSpot" });
    const vibrant = generateScanMePalette({ ...base, variant: "vibrant" });

    // Deterministic
    expect(generateScanMePalette({ ...base, variant: "content" })).toEqual(
      content,
    );

    // Visibly distinct
    expect(aggregateDeltaE(content, vibrant)).toBeGreaterThan(8);
    expect(aggregateDeltaE(content, tonalSpot)).toBeGreaterThan(3);
    expect(aggregateDeltaE(tonalSpot, vibrant)).toBeGreaterThan(3);
  });

  // 11. Nema duplikata uloga, nema čistog crnog ili belog
  it("Pravilo 7: nema duplikata među 5 uloga i nema čistog #000000 / #FFFFFF", () => {
    for (const schemeType of PALETTE_SCHEME_TYPES) {
      for (const mode of ["light", "dark"] as const) {
        for (const variant of ["content", "tonalSpot", "vibrant"] as const) {
          for (const input of SIX_CHROMATIC_INPUTS) {
            const palette = generateScanMePalette({
              sourceColors: [input, "#285C52", "#E36E52"],
              mode,
              schemeType,
              variant,
            });
            expect(new Set(palette).size).toBe(5);
            for (const color of palette) {
              expect(color).not.toBe("#000000");
              expect(color).not.toBe("#FFFFFF");
            }
          }
        }
      }
    }
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

  describe("ScanMe Logo Profile & Mass-Based Palette Generation", () => {
    // 1. Profil logotipa uključuje crnu, belu i sivu sa njihovim udelima — nije filtrirano po zasićenosti
    it("1. Profil logotipa uključuje crnu, belu i sivu sa udelima (bez filtriranja po zasićenosti)", () => {
      const profile = buildLogoProfileFromColors([
        { hex: "#000000", count: 7000 },
        { hex: "#FF69B4", count: 1500 },
        { hex: "#FFFFFF", count: 1500 },
      ]);
      expect(profile.swatches.length).toBe(3);
      expect(profile.swatches.some((s) => s.hex === "#000000")).toBe(true);
      expect(profile.swatches.some((s) => s.hex === "#FFFFFF")).toBe(true);
      expect(profile.swatches.some((s) => s.hex === "#FF69B4")).toBe(true);
      expect(profile.mass.some((s) => s.hex === "#000000")).toBe(true);
    });

    // 2. Udeli se sabiraju na približno 1 i sortirani su opadajuće
    it("2. Udeli se sabiraju na približno 1 (±0.001) i sortirani su opadajuće", () => {
      const profile = buildLogoProfileFromColors([
        { hex: "#000000", count: 7000 },
        { hex: "#FF69B4", count: 1500 },
        { hex: "#FFFFFF", count: 1500 },
      ]);
      const totalShare = profile.swatches.reduce((sum, s) => sum + s.share, 0);
      expect(Math.abs(totalShare - 1.0)).toBeLessThanOrEqual(0.001);
      for (let i = 0; i < profile.swatches.length - 1; i++) {
        expect(profile.swatches[i].share).toBeGreaterThanOrEqual(
          profile.swatches[i + 1].share,
        );
      }
    });

    // 3. Antialiasing varijante iste boje spajaju se u jednu porodicu
    it("3. Antialiasing varijante iste boje spajaju se u jednu porodicu", () => {
      const profile = buildLogoProfileFromColors([
        { hex: "#000000", count: 5000 },
        { hex: "#050505", count: 1000 },
        { hex: "#0A0A0A", count: 1000 },
        { hex: "#FF69B4", count: 3000 },
      ]);
      // The near-identical black pixels should be clustered together
      const blackSwatches = profile.swatches.filter(
        (s) => colorDifference(s.hex, "#000000") < 7,
      );
      expect(blackSwatches.length).toBe(1);
      expect(blackSwatches[0].share).toBeCloseTo(0.7, 1);
    });

    // 4. Providni pikseli se ne broje kao boja
    it("4. Providni pikseli se ignorišu i ne broje kao boja", () => {
      // 100 opaque orange pixels (alpha 255) and 900 transparent pixels (alpha 0)
      const orangeArgb = 0xffff6f00;
      const transparentArgb = 0x00000000;
      const pixels = [
        ...Array(100).fill(orangeArgb),
        ...Array(900).fill(transparentArgb),
      ];
      // Filtering alpha < 16 simulates the canvas extraction step
      const opaqueOnly = pixels.filter((p) => ((p >>> 24) & 0xff) >= 16);
      const profile = buildLogoProfileFromPixels(opaqueOnly);

      expect(profile.swatches.length).toBe(1);
      expect(profile.swatches[0].hex).toBe("#FF6F00");
      expect(profile.swatches[0].share).toBeCloseTo(1.0, 2);
    });

    // 5. Logotip sa 70% tamne mase i 15% svetlog akcenta dobija SVETLU pozadinu (REGRESIONI TEST)
    it("5. REGRESIJA: Logotip sa 70% tamne mase i 15% svetlog akcenta dobija SVETLU pozadinu", () => {
      const profile = buildLogoProfileFromColors([
        { hex: "#000000", count: 7000 },
        { hex: "#FF69B4", count: 1500 },
        { hex: "#FFFFFF", count: 1500 },
      ]);
      const mode = inferPaletteModeFromProfile(profile);
      expect(mode).toBe("light");

      const palette = generateScanMePalette({
        logoProfile: profile,
      });
      const bgOklch = colorToOklch(palette[0]);
      // Background must be light (L >= 0.90) so black logo text is clearly legible
      expect(bgOklch.l).toBeGreaterThanOrEqual(0.9);
      expect(palette[2]).toBe("#FF69B4"); // Accent is pink
      expect(contrastRatio(palette[0], "#000000")).toBeGreaterThanOrEqual(10);
    });

    // 6. Logotip sa 70% svetle mase dobija TAMNU pozadinu
    it("6. Logotip sa 70% svetle mase dobija TAMNU pozadinu", () => {
      const profile = buildLogoProfileFromColors([
        { hex: "#FFFFFF", count: 7000 },
        { hex: "#0D47A1", count: 3000 },
      ]);
      const mode = inferPaletteModeFromProfile(profile);
      expect(mode).toBe("dark");

      const palette = generateScanMePalette({
        logoProfile: profile,
      });
      const bgOklch = colorToOklch(palette[0]);
      // Background must be dark (L <= 0.25) so white logo text is clearly legible
      expect(bgOklch.l).toBeLessThanOrEqual(0.25);
      expect(contrastRatio(palette[0], "#FFFFFF")).toBeGreaterThanOrEqual(10);
    });

    // 7. Akcent je hromatska boja iz logotipa, bit-identična, i nije crna ni bela ni kad je crna dominantna
    it("7. Akcent je hromatska boja iz logotipa, bit-identična, i nikad crna/bela", () => {
      const profile = buildLogoProfileFromColors([
        { hex: "#000000", count: 8000 },
        { hex: "#FF69B4", count: 1000 },
        { hex: "#FFFFFF", count: 1000 },
      ]);
      expect(profile.accent).toBe("#FF69B4");
      const palette = generateScanMePalette({ logoProfile: profile });
      expect(palette[2]).toBe("#FF69B4");
    });

    // 12. Promena redosleda ulaznih logo boja NE menja rezultat
    it("12. Promena redosleda ulaznih logo boja NE menja profil niti paletu", () => {
      const orderA = [
        { hex: "#000000", count: 7000 },
        { hex: "#FF69B4", count: 1500 },
        { hex: "#FFFFFF", count: 1500 },
      ];
      const orderB = [
        { hex: "#FF69B4", count: 1500 },
        { hex: "#FFFFFF", count: 1500 },
        { hex: "#000000", count: 7000 },
      ];
      const profileA = buildLogoProfileFromColors(orderA);
      const profileB = buildLogoProfileFromColors(orderB);

      expect(profileA.accent).toBe(profileB.accent);
      expect(profileA.isMixed).toBe(profileB.isMixed);
      expect(profileA.isAchromatic).toBe(profileB.isAchromatic);

      const paletteA = generateScanMePalette({ logoProfile: profileA });
      const paletteB = generateScanMePalette({ logoProfile: profileB });
      expect(paletteA).toEqual(paletteB);
    });
  });
});
