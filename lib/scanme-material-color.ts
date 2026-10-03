import {
  argbFromHex,
  DynamicScheme,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  TonalPalette,
} from "@material/material-color-utilities";
import {
  colorToOklch,
  deriveReadableTextVariant,
  FALLBACK_ACHROMATIC_HUE,
  FALLBACK_COLOR,
  minimumContrast,
  normalizeColorHex,
  oklchToHex,
} from "./scanme-color-science";
import type { PaletteSchemeType } from "./scanme-palette";

// Material Color Utilities adapter for the ScanMe smart palette.
//
// New Color Policy:
// 1. Accent (role 2): verbatim anchor hex (first Color Thief color), untouched.
// 2. Background (role 0): exact complement of anchor hue: (hue_accent + 180) mod 360.
//    Lightness and chroma are carefully tuned for a usable surface with clear opposite tint.
// 3. Surface (role 1): shares complementary hue with background, separated by a distinct
//    lightness step for card/panel hierarchy.
// 4. Text (role 3): deterministic variation of black or white with background's hue,
//    guaranteeing >= 4.5:1 contrast against both background and surface.
// 5. Button (role 4): Material secondary family cooperating with accent, guaranteed >= 3:1.
// 6. Achromatic Fallback: when anchor has no usable chroma (< 0.02), defaults to FALLBACK_ACHROMATIC_HUE (250° cool slate).

export type MaterialVariant = "content" | "tonalSpot" | "vibrant";

export const MATERIAL_VARIANT_CYCLE: readonly MaterialVariant[] = [
  "content",
  "tonalSpot",
  "vibrant",
] as const;

export function nextMaterialVariant(current: MaterialVariant): MaterialVariant {
  const index = MATERIAL_VARIANT_CYCLE.indexOf(current);
  return MATERIAL_VARIANT_CYCLE[(index + 1) % MATERIAL_VARIANT_CYCLE.length];
}

const VARIANT_ENUM: Record<MaterialVariant, number> = {
  tonalSpot: 2,
  vibrant: 3,
  content: 6,
};

const SCHEME_HUE_OFFSETS: Record<
  PaletteSchemeType,
  { secondary: number; tertiary: number }
> = {
  monochromatic: { secondary: 0, tertiary: 0 },
  analogous: { secondary: 30, tertiary: -30 },
  complementary: { secondary: 180, tertiary: 150 },
  triadic: { secondary: 120, tertiary: -120 },
  "split-complementary": { secondary: 150, tertiary: 210 },
};

type VariantConfig = {
  secondary: number;
  tertiary: number;
  neutral: number;
  neutralVariant: number;
  bgLightness: { light: number; dark: number };
  bgChroma: number;
  surfaceLightness: { light: number; dark: number };
  surfaceChroma: number;
};

const VARIANT_CONFIG: Record<MaterialVariant, VariantConfig> = {
  // Content (airy): light canvas, subtle tint, restrained secondary chroma.
  content: {
    secondary: 24,
    tertiary: 24,
    neutral: 4,
    neutralVariant: 6,
    bgLightness: { light: 0.95, dark: 0.15 },
    bgChroma: 0.03,
    surfaceLightness: { light: 0.9, dark: 0.21 },
    surfaceChroma: 0.03,
  },
  // TonalSpot (balanced): softly tinted page, clear card step, balanced CTA.
  tonalSpot: {
    secondary: 36,
    tertiary: 30,
    neutral: 8,
    neutralVariant: 12,
    bgLightness: { light: 0.94, dark: 0.165 },
    bgChroma: 0.038,
    surfaceLightness: { light: 0.885, dark: 0.23 },
    surfaceChroma: 0.038,
  },
  // Vibrant (bold): richer complementary tint, colourful CTA.
  vibrant: {
    secondary: 52,
    tertiary: 46,
    neutral: 14,
    neutralVariant: 20,
    bgLightness: { light: 0.925, dark: 0.18 },
    bgChroma: 0.046,
    surfaceLightness: { light: 0.865, dark: 0.25 },
    surfaceChroma: 0.046,
  },
};

function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export type GenerateMaterialRolesInput = {
  sourceColors: string[];
  mode: "light" | "dark";
  schemeType: PaletteSchemeType;
  variant: MaterialVariant;
  contrastLevel?: number;
};

// Returns 5 hex in ScanMe role order: [background, surface, accent, text, button].
export function generateMaterialRoles({
  sourceColors,
  mode,
  schemeType,
  variant,
  contrastLevel = 0,
}: GenerateMaterialRolesInput): string[] {
  const anchorHex = normalizeColorHex(sourceColors[0] ?? FALLBACK_COLOR);
  const anchorOklch = colorToOklch(anchorHex);

  // Rule 5: Achromatic logo detection. If the logo has no usable chroma (< 0.02)
  // or undefined hue, 180° complement is meaningless. We fall back deterministically
  // to FALLBACK_ACHROMATIC_HUE (250° cool slate), creating a crisp, refined neutral canvas
  // with no NaN values.
  const isAchromatic =
    anchorOklch.c < 0.02 ||
    anchorOklch.h === undefined ||
    isNaN(anchorOklch.h);

  const anchorHue = isAchromatic ? FALLBACK_ACHROMATIC_HUE : anchorOklch.h!;
  // Rule 2 & 3: Background and Surface share the complementary hue (anchorHue + 180) mod 360.
  const bgHue = isAchromatic
    ? FALLBACK_ACHROMATIC_HUE
    : wrapHue(anchorHue + 180);

  const isDark = mode === "dark";
  const config = VARIANT_CONFIG[variant];
  const offsets = SCHEME_HUE_OFFSETS[schemeType];

  // Role 0: Background (Complementary hue, calibrated lightness & chroma)
  const bgL = isDark ? config.bgLightness.dark : config.bgLightness.light;
  const bgC = config.bgChroma;
  const background = oklchToHex({
    mode: "oklch",
    l: bgL,
    c: bgC,
    h: bgHue,
  });

  // Role 1: Surface (Shares complementary hue with background, distinct lightness step)
  const surfaceL = isDark
    ? config.surfaceLightness.dark
    : config.surfaceLightness.light;
  const surfaceC = config.surfaceChroma;
  const surface = oklchToHex({
    mode: "oklch",
    l: surfaceL,
    c: surfaceC,
    h: bgHue,
  });

  // Role 2: Accent (Rule 1: verbatim first Color Thief hex, untouched)
  const accent = anchorHex;

  // Role 3: Text (Rule 4: black/white variation with background's hue, >= 4.5:1)
  const text = deriveReadableTextVariant([background, surface], bgHue);

  // Role 4: Button (MCU secondary family, cooperating with accent and scheme)
  const anchorArgb = argbFromHex(anchorHex);
  const scheme = new DynamicScheme({
    sourceColorArgb: anchorArgb,
    variant: VARIANT_ENUM[variant],
    contrastLevel,
    isDark,
    primaryPalette: TonalPalette.fromInt(anchorArgb),
    secondaryPalette: TonalPalette.fromHueAndChroma(
      wrapHue(anchorHue + offsets.secondary),
      config.secondary,
    ),
    tertiaryPalette: TonalPalette.fromHueAndChroma(
      wrapHue(anchorHue + offsets.tertiary),
      config.tertiary,
    ),
    neutralPalette: TonalPalette.fromHueAndChroma(bgHue, config.neutral),
    neutralVariantPalette: TonalPalette.fromHueAndChroma(
      bgHue,
      config.neutralVariant,
    ),
  });

  const hexFromDynamic = (dynamicColor: { getArgb(s: DynamicScheme): number }) =>
    normalizeColorHex(hexFromArgb(dynamicColor.getArgb(scheme)));

  let button = hexFromDynamic(MaterialDynamicColors.secondary);

  // Ensure button clears >= 3:1 against background and surface
  if (minimumContrast(button, [background, surface]) < 3) {
    const buttonOklch = colorToOklch(button);
    const targetL = isDark ? 0.85 : 0.35;
    for (let step = 1; step <= 25; step += 1) {
      const candidateL =
        buttonOklch.l + (targetL - buttonOklch.l) * (step / 25);
      const candidate = oklchToHex({
        mode: "oklch",
        l: candidateL,
        c: buttonOklch.c,
        h: buttonOklch.h ?? wrapHue(anchorHue + offsets.secondary),
      });
      if (minimumContrast(candidate, [background, surface]) >= 3) {
        button = candidate;
        break;
      }
    }
  }

  return [background, surface, accent, text, button];
}

// Pick the scheme whose geometry best matches the logo's own colour story, so the very
// first suggestion after upload feels connected to the brand. Falls back to complementary.
export function defaultSchemeFromColors(
  sourceColors: string[],
): PaletteSchemeType {
  const valid = sourceColors
    .map((color) => normalizeColorHex(color))
    .filter((color, index, all) => all.indexOf(color) === index);
  if (valid.length < 2) return "monochromatic";

  const anchor = Hct.fromInt(argbFromHex(valid[0]));
  const second = Hct.fromInt(argbFromHex(valid[1]));
  // If the secondary logo colour has almost no chroma, hue is meaningless → monochromatic.
  if (second.chroma < 6) return "monochromatic";

  const diff = Math.abs(
    ((second.hue - anchor.hue + 540) % 360) - 180,
  ); // 0..180 shortest hue distance
  if (diff < 20) return "monochromatic";
  if (diff < 55) return "analogous";
  if (diff < 95) return "triadic";
  if (diff < 145) return "split-complementary";
  return "complementary";
}
