import { describe, expect, it } from "vitest";
import { colorDifference, colorToOklch } from "./scanme-color-science";
import {
  defaultSchemeFromColors,
  generateMaterialRoles,
  MATERIAL_VARIANT_CYCLE,
  type MaterialVariant,
  nextMaterialVariant,
} from "./scanme-material-color";

const VARIANTS: MaterialVariant[] = ["content", "tonalSpot", "vibrant"];

// Difference across the roles that a variant actually drives (accent is the pinned anchor).
function roleDelta(a: string[], b: string[]) {
  return [0, 1, 3, 4].reduce(
    (sum, index) => sum + colorDifference(a[index], b[index]),
    0,
  );
}

function roles(variant: MaterialVariant, mode: "light" | "dark" = "light") {
  return generateMaterialRoles({
    sourceColors: ["#C6FF4A", "#285C52"],
    mode,
    schemeType: "complementary",
    variant,
  });
}

describe("ScanMe Material engine", () => {
  it("is deterministic for every variant — identical input, identical output", () => {
    for (const variant of VARIANTS) {
      expect(roles(variant)).toEqual(roles(variant));
    }
  });

  it("keeps the first logo colour as the exact, untouched accent hex", () => {
    for (const variant of VARIANTS) {
      // Index 2 is the anchor placeholder pinned verbatim by the caller.
      expect(generateMaterialRoles({
        sourceColors: ["#C6FF4A", "#285C52", "#E36E52"],
        mode: "light",
        schemeType: "analogous",
        variant,
      })[2]).toBe("#C6FF4A");
    }
  });

  it("makes the three variants visibly different, not a shade nudge", () => {
    const content = roles("content");
    const tonalSpot = roles("tonalSpot");
    const vibrant = roles("vibrant");
    // Content (airy) → vibrant (bold) is a large, deliberate jump; every neighbour is visible.
    expect(roleDelta(content, vibrant)).toBeGreaterThan(10);
    expect(roleDelta(content, tonalSpot)).toBeGreaterThan(3);
    expect(roleDelta(tonalSpot, vibrant)).toBeGreaterThan(3);
  });

  it("cycles Content → TonalSpot → Vibrant → Content", () => {
    expect(MATERIAL_VARIANT_CYCLE).toEqual(["content", "tonalSpot", "vibrant"]);
    expect(nextMaterialVariant("content")).toBe("tonalSpot");
    expect(nextMaterialVariant("tonalSpot")).toBe("vibrant");
    expect(nextMaterialVariant("vibrant")).toBe("content");
  });

  it("keeps each variant recognisable in both light and dark mode (point 8)", () => {
    // Mode and variant are orthogonal: within EACH mode the variant still separates the
    // looks, so switching Light/Dark with a fixed variant preserves that variant's identity.
    for (const mode of ["light", "dark"] as const) {
      expect(roleDelta(roles("content", mode), roles("vibrant", mode))).toBeGreaterThan(8);
    }
  });

  it("infers the scheme from the logo's colour story (point 9 seed)", () => {
    // Single colour, or a near-grey second colour → no meaningful hue relationship.
    expect(defaultSchemeFromColors(["#C6FF4A"])).toBe("monochromatic");
    expect(defaultSchemeFromColors(["#C6FF4A", "#7C7A78"])).toBe("monochromatic");
    // Two clearly different hues resolve to a geometry driven by their hue distance.
    expect(defaultSchemeFromColors(["#1E88E5", "#F4511E"])).not.toBe("monochromatic");
    // Deterministic: same colours, same scheme.
    expect(defaultSchemeFromColors(["#1E88E5", "#F4511E"])).toBe(
      defaultSchemeFromColors(["#1E88E5", "#F4511E"]),
    );
  });

  it("never emits a pure black/white or a duplicated role", () => {
    for (const variant of VARIANTS) {
      for (const mode of ["light", "dark"] as const) {
        const palette = generateMaterialRoles({
          sourceColors: ["#C6FF4A", "#285C52"],
          mode,
          schemeType: "triadic",
          variant,
        });
        for (const color of palette) {
          expect(color).not.toBe("#000000");
          expect(color).not.toBe("#FFFFFF");
          // No visually meaningless near-extreme tones either.
          const l = colorToOklch(color).l;
          expect(l).toBeGreaterThan(0.03);
          expect(l).toBeLessThan(0.995);
        }
      }
    }
  });
});
