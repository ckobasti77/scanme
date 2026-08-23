import {
  argbFromHex,
  DynamicScheme,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  TonalPalette,
} from "@material/material-color-utilities";
import { mixColors, normalizeColorHex } from "./scanme-color-science";
import type { PaletteSchemeType } from "./scanme-palette";

// Material Color Utilities adapter for the ScanMe smart palette.
//
// Two orthogonal controls drive the engine:
//  - schemeType (user-facing "Tip palete") sets the HUE geometry of the secondary /
//    tertiary families relative to the logo's anchor hue.
//  - variant (the Regenerate axis) sets the CHROMA / vibrancy / neutral tint, giving a few
//    genuinely different looks rather than a small shade nudge.
//
// MCU is only reachable through its package entry (its `exports` map exposes `"."` only),
// so everything is imported from the barrel; bundlers tree-shake it.

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

// MCU's Variant enum is not re-exported by the barrel; the numeric values are stable
// (see dynamiccolor/variant.js). Only the three we cycle through are needed.
const VARIANT_ENUM: Record<MaterialVariant, number> = {
  tonalSpot: 2,
  vibrant: 3,
  content: 6,
};

// Hue offsets (degrees) from the anchor for the secondary and tertiary families. This is
// the classic colour-scheme geometry the "Tip palete" dropdown already exposes.
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

// Per-variant treatment. Hue always comes from the scheme geometry; the variant changes
// how saturated AND how light/tinted the whole palette is, so Regenerate gives a clearly
// different look each press (airy → balanced → bold), not a shade nudge.
type VariantConfig = {
  secondary: number;
  tertiary: number;
  neutral: number;
  neutralVariant: number;
  // Card = tertiary tint mixed over the neutral surface tone; higher = more colourful card.
  surfaceTint: number;
  pageTone: { light: number; dark: number };
  cardNeutralTone: { light: number; dark: number };
  cardTertiaryTone: { light: number; dark: number };
};

const VARIANT_CONFIG: Record<MaterialVariant, VariantConfig> = {
  // Airy: near-white page, barely-tinted card, restrained colour.
  content: {
    secondary: 24,
    tertiary: 24,
    neutral: 3,
    neutralVariant: 6,
    surfaceTint: 0.48,
    pageTone: { light: 99, dark: 5 },
    cardNeutralTone: { light: 96, dark: 20 },
    cardTertiaryTone: { light: 92, dark: 24 },
  },
  // Balanced: softly tinted page, clearly tinted card, richer colour.
  tonalSpot: {
    secondary: 32,
    tertiary: 30,
    neutral: 8,
    neutralVariant: 12,
    surfaceTint: 0.62,
    pageTone: { light: 98, dark: 7 },
    cardNeutralTone: { light: 93, dark: 24 },
    cardTertiaryTone: { light: 90, dark: 28 },
  },
  // Bold: visibly tinted page, colourful card, saturated CTA.
  vibrant: {
    secondary: 50,
    tertiary: 46,
    neutral: 16,
    neutralVariant: 24,
    surfaceTint: 0.9,
    pageTone: { light: 96, dark: 9 },
    cardNeutralTone: { light: 90, dark: 28 },
    cardTertiaryTone: { light: 87, dark: 32 },
  },
};

function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export type GenerateMaterialRolesInput = {
  // 1..3 hex; [0] is the anchor (becomes the verbatim accent). Extra colours are not
  // transplanted — the palette is generated to harmonise with the anchor.
  sourceColors: string[];
  mode: "light" | "dark";
  schemeType: PaletteSchemeType;
  variant: MaterialVariant;
  contrastLevel?: number;
};

// Returns 5 hex in ScanMe role order: [background, surface, accent, text, button].
// `accent` (index 2) is left as a placeholder here (the anchor) and is pinned verbatim by
// the caller; every other role is a harmonised, contrast-aware Material tone.
export function generateMaterialRoles({
  sourceColors,
  mode,
  schemeType,
  variant,
  contrastLevel = 0,
}: GenerateMaterialRolesInput): string[] {
  const anchorHex = normalizeColorHex(sourceColors[0] ?? "#7A5C43");
  const anchorArgb = argbFromHex(anchorHex);
  const anchorHct = Hct.fromInt(anchorArgb);
  const anchorHue = anchorHct.hue;

  const offsets = SCHEME_HUE_OFFSETS[schemeType];
  const config = VARIANT_CONFIG[variant];
  const isDark = mode === "dark";

  const neutralPalette = TonalPalette.fromHueAndChroma(anchorHue, config.neutral);
  const tertiaryPalette = TonalPalette.fromHueAndChroma(
    wrapHue(anchorHue + offsets.tertiary),
    config.tertiary,
  );

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
    tertiaryPalette,
    neutralPalette,
    neutralVariantPalette: TonalPalette.fromHueAndChroma(
      anchorHue,
      config.neutralVariant,
    ),
  });

  const hex = (dynamicColor: { getArgb(s: DynamicScheme): number }) =>
    normalizeColorHex(hexFromArgb(dynamicColor.getArgb(scheme)));
  const tone = (palette: TonalPalette, t: number) =>
    normalizeColorHex(hexFromArgb(palette.tone(t)));

  // Role mapping (design-justified). The whole palette stays responsive to the scheme —
  // not just the button — because the card surface carries the tertiary family while the
  // button carries the secondary family. So accent (logo) + button + surface show three
  // related hues that all shift with the chosen scheme, yet contrast stays safe by
  // construction: page/surface tones are picked at the light (or dark) end so the dark (or
  // light) `onSurface` text always pairs with them.
  //  - page  = neutral, near-white (light) / near-black (dark) — the calm canvas.
  //  - card  = a soft tertiary-tinted step (still light in light mode, dark in dark mode).
  //  - text  = onSurface — MD3's contrast-guaranteed on-surface tone, so WCAG rarely fires.
  //  - button= secondary — a harmonised second brand colour for the CTA.
  const background = tone(
    neutralPalette,
    isDark ? config.pageTone.dark : config.pageTone.light,
  );
  // Card = a tertiary tint over the neutral surface tone. The tint strength and tones scale
  // with the variant, so the card ranges from near-white (content) to colourful (vibrant).
  const surface = mixColors(
    tone(
      neutralPalette,
      isDark ? config.cardNeutralTone.dark : config.cardNeutralTone.light,
    ),
    tone(
      tertiaryPalette,
      isDark ? config.cardTertiaryTone.dark : config.cardTertiaryTone.light,
    ),
    config.surfaceTint,
  );
  const text = hex(MaterialDynamicColors.onSurface);
  const button = hex(MaterialDynamicColors.secondary);

  return [background, surface, anchorHex, text, button];
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
