import type {
  ScanMeLinksBackgroundCategory,
  ScanMeLinksColorsV2,
  ScanMeLinksDesignV2,
} from "./scanme-links-design";
import {
  clamp,
  colorDifference,
  colorToOklch,
  contrastRatio,
  ensureContrast,
  mixColors,
  normalizeColorHex,
  oklchToHex,
  readableTextColor,
  SCANME_OFF_BLACK,
  SCANME_OFF_WHITE,
} from "./scanme-color-science";
import {
  generateMaterialRoles,
  type MaterialVariant,
} from "./scanme-material-color";

export const GENERATED_PALETTE_ROLES = [
  "background",
  "surface",
  "accent",
  "text",
  "button",
] as const;

export type GeneratedPaletteRole = (typeof GENERATED_PALETTE_ROLES)[number];
export type PaletteGenerationMode = "light" | "dark";
export type PaletteTargetRole =
  | "background"
  | "surface"
  | "accent"
  | "title"
  | "body"
  | "button"
  | "buttonText"
  | "icon"
  | "border"
  | "focus";

export const DEFAULT_PALETTE_LOCKS = [false, false, true, false, false] as const;

export const PALETTE_SCHEME_TYPES = [
  "complementary",
  "analogous",
  "monochromatic",
  "triadic",
  "split-complementary",
] as const;
export type PaletteSchemeType = (typeof PALETTE_SCHEME_TYPES)[number];
export const DEFAULT_PALETTE_SCHEME: PaletteSchemeType = "complementary";

type GeneratePaletteOptions = {
  sourceColors: string[];
  mode: PaletteGenerationMode;
  schemeType?: PaletteSchemeType;
  // The Regenerate axis — cycles a few noticeably different looks. Defaults to "content".
  variant?: MaterialVariant;
  currentColors?: string[];
  lockedSlots?: boolean[];
};

function hue(value: number) {
  return (value + 360) % 360;
}

function avoidPureNeutral(color: string) {
  if (color === "#000000") return SCANME_OFF_BLACK;
  if (color === "#FFFFFF") return SCANME_OFF_WHITE;
  return color;
}

export function normalizePaletteLocks(locks?: boolean[]) {
  return GENERATED_PALETTE_ROLES.map((_, index) =>
    index === 2 ? true : Boolean(locks?.[index]),
  );
}

export function inferPaletteMode(color: string): PaletteGenerationMode {
  return colorToOklch(color).l >= 0.58 ? "light" : "dark";
}

export function generateScanMePalette({
  sourceColors,
  mode,
  schemeType = DEFAULT_PALETTE_SCHEME,
  variant = "content",
  currentColors = [],
  lockedSlots,
}: GeneratePaletteOptions) {
  const sources = sourceColors.length
    ? sourceColors.map((color) => normalizeColorHex(color))
    : [normalizeColorHex(currentColors[2] ?? "#7A5C43")];
  const anchorHex = sources[0];
  const locks = normalizePaletteLocks(lockedSlots);

  // Material Color Utilities builds the harmonious, contrast-aware palette. schemeType sets
  // the secondary/tertiary hue geometry; variant sets the chroma / vibrancy (Regenerate).
  const generated = generateMaterialRoles({
    sourceColors: sources,
    mode,
    schemeType,
    variant,
  });
  // Accent is always the verbatim logo colour (identical hex, never toned).
  generated[2] = anchorHex;

  // Final WCAG safety net only. MCU already pairs text/button against the surfaces, so this
  // is a rare last resort rather than the design engine.
  generated[3] = ensureContrast(generated[3], [generated[0], generated[1]], 4.5);
  if (
    Math.min(
      contrastRatio(generated[4], generated[0]),
      contrastRatio(generated[4], generated[1]),
    ) < 3
  ) {
    generated[4] = ensureContrast(generated[4], [generated[0], generated[1]], 3);
  }

  return generated.map((color, index) => {
    if (locks[index] && currentColors[index]) {
      return normalizeColorHex(currentColors[index]);
    }
    // Accent stays exactly as the logo colour; other roles never read as pure black/white.
    return index === 2 ? color : avoidPureNeutral(color);
  });
}

export function deriveBackgroundCompanionColor(
  primary: string,
  category: ScanMeLinksBackgroundCategory,
) {
  const source = colorToOklch(primary);
  const light = source.l >= 0.58;
  const settings: Record<
    ScanMeLinksBackgroundCategory,
    { lightness: number; hue: number; chroma: number; maxChroma: number }
  > = {
    flat: { lightness: 0.05, hue: 0, chroma: 0.9, maxChroma: 0.08 },
    gradient: { lightness: 0.06, hue: 10, chroma: 0.9, maxChroma: 0.09 },
    pattern: { lightness: 0.18, hue: 7, chroma: 1.05, maxChroma: 0.1 },
    texture: { lightness: 0.1, hue: -7, chroma: 0.82, maxChroma: 0.075 },
    media: { lightness: 0.08, hue: 0, chroma: 0.82, maxChroma: 0.075 },
    animation: { lightness: 0.16, hue: 20, chroma: 1.08, maxChroma: 0.14 },
  };
  const setting = settings[category];

  return avoidPureNeutral(
    oklchToHex({
      mode: "oklch",
      l: clamp(
        source.l + (light ? -setting.lightness : setting.lightness),
        0.075,
        0.95,
      ),
      c: clamp(source.c * setting.chroma + 0.006, 0.006, setting.maxChroma),
      h: hue((source.h ?? 80) + setting.hue),
    }),
  );
}

function backgroundWithPrimaryColor(
  design: ScanMeLinksDesignV2,
  background: string,
) {
  const companion = deriveBackgroundCompanionColor(
    background,
    design.background.category,
  );
  switch (design.background.category) {
    case "flat":
      return { ...design.background, color: background };
    case "gradient":
      return {
        ...design.background,
        startColor: background,
        endColor: companion,
      };
    case "pattern":
      return {
        ...design.background,
        backgroundColor: background,
        patternColor: companion,
      };
    case "texture":
      return {
        ...design.background,
        backgroundColor: background,
        tintColor: companion,
      };
    case "media":
      return {
        ...design.background,
        overlayColor: background,
      };
    case "animation":
      return {
        ...design.background,
        baseColor: background,
        accentColor: companion,
      };
  }
}

function deriveColors(
  palette: string[],
): { colors: ScanMeLinksColorsV2; correctedRoles: string[] } {
  const [page, surface, accent, title, button] = palette.map((color) =>
    normalizeColorHex(color),
  );
  const safeTitle = ensureContrast(title, [page, surface], 4.5);
  const safeButton = ensureContrast(button, [page, surface], 3);
  const body = ensureContrast(
    mixColors(safeTitle, page, 0.16),
    [page, surface],
    4.5,
  );
  const buttonText = readableTextColor(safeButton, safeTitle);
  const buttonHover = mixColors(safeButton, buttonText, 0.1);
  const border = mixColors(safeTitle, surface, 0.8);
  const focus = ensureContrast(accent, page, 3);
  const icon =
    contrastRatio(accent, surface) >= 3
      ? accent
      : ensureContrast(mixColors(accent, safeTitle, 0.22), surface, 3);
  const correctedRoles = ["body", "border", "buttonHover", "buttonText"];
  if (safeTitle !== title) correctedRoles.push("title");
  if (safeButton !== button) correctedRoles.push("button");
  if (focus !== accent) correctedRoles.push("focus");
  if (icon !== accent) correctedRoles.push("icon");

  return {
    colors: {
      page,
      surface,
      title: safeTitle,
      body,
      accent,
      border,
      focus,
      button: safeButton,
      buttonHover,
      buttonText,
      icon,
    },
    correctedRoles,
  };
}

export function applyGeneratedPalette(
  design: ScanMeLinksDesignV2,
  palette: string[],
) {
  if (palette.length < GENERATED_PALETTE_ROLES.length) {
    return { design, correctedRoles: [] as string[] };
  }
  const normalized = palette.slice(0, 5).map((color) => normalizeColorHex(color));
  const { colors, correctedRoles } = deriveColors(normalized);

  return {
    design: {
      ...design,
      background: backgroundWithPrimaryColor(design, normalized[0]),
      colors,
    } satisfies ScanMeLinksDesignV2,
    correctedRoles,
  };
}

function singleBackgroundColor(
  design: ScanMeLinksDesignV2,
  color: string,
  overlayOpacity?: number,
) {
  const background = backgroundWithPrimaryColor(design, color);
  if (background.category === "media" && overlayOpacity != null) {
    return { ...background, overlayOpacity: clamp(overlayOpacity) };
  }
  return background;
}

export function applyPaletteColorToRole(
  design: ScanMeLinksDesignV2,
  color: string,
  role: PaletteTargetRole,
  options?: { overlayOpacity?: number },
): ScanMeLinksDesignV2 {
  const normalized = normalizeColorHex(color);
  if (role === "background") {
    return {
      ...design,
      background: singleBackgroundColor(
        design,
        normalized,
        options?.overlayOpacity,
      ),
      colors: { ...design.colors, page: normalized },
    };
  }

  return {
    ...design,
    colors: {
      ...design.colors,
      [role]: normalized,
      ...(role === "button"
        ? {
            buttonHover: mixColors(
              normalized,
              readableTextColor(normalized, design.colors.buttonText),
              0.12,
            ),
          }
        : {}),
    },
  };
}

export function nearestPaletteColor(
  reference: string,
  palette: string[],
  predicate: (color: string) => boolean,
) {
  return palette
    .map((color) => normalizeColorHex(color))
    .filter(predicate)
    .sort(
      (first, second) =>
        colorDifference(reference, first) - colorDifference(reference, second),
    )[0];
}
