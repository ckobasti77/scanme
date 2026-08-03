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

// Tasteful clamp so no generated role ever reaches pure black/white, and neutrals keep a
// whisper of chroma instead of reading as dead grey.
const ROLE_L_MIN = 0.14;
const ROLE_L_MAX = 0.95;
const ROLE_C_FLOOR = 0.008;

// A "scheme" manifests through two levers: the button hue (the one high-chroma non-anchor
// slot → the scheme's secondary pole) and a subtle shared neutral undertone. Lightness and
// chroma targets are identical across schemes; only hue changes.
// `dir` ∈ {+1,-1} chooses which side of the anchor the scheme leans (from the logo's
// secondary color when present, otherwise the seed).
const SCHEME_HUE_PLANS: Record<
  PaletteSchemeType,
  {
    buttonBase: number;
    buttonSpread: number;
    neutralBase: number;
    neutralSpread: number;
    useDir: boolean;
  }
> = {
  monochromatic: { buttonBase: 0, buttonSpread: 0, neutralBase: 0, neutralSpread: 0, useDir: false },
  analogous: { buttonBase: 0, buttonSpread: -30, neutralBase: 0, neutralSpread: 10, useDir: true },
  complementary: { buttonBase: 180, buttonSpread: 0, neutralBase: 8, neutralSpread: 0, useDir: false },
  "split-complementary": { buttonBase: 180, buttonSpread: -30, neutralBase: 0, neutralSpread: 8, useDir: true },
  triadic: { buttonBase: 0, buttonSpread: 120, neutralBase: 0, neutralSpread: 0, useDir: true },
};

type GeneratePaletteOptions = {
  sourceColors: string[];
  mode: PaletteGenerationMode;
  schemeType?: PaletteSchemeType;
  currentColors?: string[];
  lockedSlots?: boolean[];
  seed?: number;
};

function seededNoise(seed: number, offset: number) {
  const value = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function hue(value: number) {
  return (value + 360) % 360;
}

function hueDistance(first: number, second: number) {
  return Math.abs(((second - first + 540) % 360) - 180);
}

// Which side of the anchor the scheme leans. Prefer the logo's second color (so the scheme
// stays tied to the brand and doesn't flip sides on regenerate); otherwise vary by seed.
function schemeDirection(
  anchorHue: number,
  secondary: ReturnType<typeof colorToOklch> | null,
  seed: number,
): 1 | -1 {
  if (secondary?.h != null && secondary.c >= 0.03) {
    const delta = ((secondary.h - anchorHue + 540) % 360) - 180;
    if (Math.abs(delta) > 4) return delta >= 0 ? 1 : -1;
  }
  return seededNoise(seed, 99) >= 0 ? 1 : -1;
}

// If the logo already contains a real color near the scheme's secondary pole, use that
// exact hue for the button so the palette stays maximally tied to the logo.
function resolveButtonHue(
  syntheticHue: number,
  secondary: ReturnType<typeof colorToOklch> | null,
): number {
  if (
    secondary?.h != null &&
    secondary.c >= 0.03 &&
    hueDistance(secondary.h, syntheticHue) <= 22
  ) {
    return secondary.h;
  }
  return syntheticHue;
}

function avoidPureNeutral(color: string) {
  if (color === "#000000") return SCANME_OFF_BLACK;
  if (color === "#FFFFFF") return SCANME_OFF_WHITE;
  return color;
}

// Clamp a role color into the tasteful band (never pure black/white) with a chroma floor,
// then a last-resort pure-neutral swap.
function sanitizeRoleColor(
  lightness: number,
  chroma: number,
  hueValue: number,
  chromaCap: number,
) {
  return avoidPureNeutral(
    oklchToHex({
      mode: "oklch",
      l: clamp(lightness, ROLE_L_MIN, ROLE_L_MAX),
      c: clamp(chroma, ROLE_C_FLOOR, chromaCap),
      h: hue(hueValue),
    }),
  );
}

function createRoleColor(
  anchorChroma: number,
  role: Exclude<GeneratedPaletteRole, "accent">,
  mode: PaletteGenerationMode,
  schemeHue: number,
  seed: number,
  chromaScale = 1,
) {
  const light = mode === "light";
  const targets = light
    ? {
        background: [0.95, 0.014],
        surface: [0.895, 0.024],
        text: [0.225, 0.022],
        button: [0.52, 0.105],
      }
    : {
        background: [0.165, 0.022],
        surface: [0.245, 0.03],
        text: [0.925, 0.016],
        button: [0.67, 0.11],
      };
  const [targetLightness, targetChroma] = targets[role];
  const chromaInfluence = role === "text" ? 0.07 : role === "button" ? 0.46 : 0.1;
  const chromaCap = role === "button" ? 0.16 : role === "text" ? 0.04 : 0.05;
  const lightnessJitter = role === "button" ? 0.018 : 0.008;

  return sanitizeRoleColor(
    targetLightness + seededNoise(seed, role.length) * lightnessJitter,
    (targetChroma +
      anchorChroma * chromaInfluence +
      seededNoise(seed, role.length + 9) * 0.005) *
      chromaScale,
    schemeHue + seededNoise(seed, role.length + 17) * 2.5,
    chromaCap,
  );
}

function preventSourceDuplicate(color: string, sourceColors: string[], index: number) {
  if (!sourceColors.some((source) => normalizeColorHex(source) === color)) return color;
  const parsed = colorToOklch(color);
  return oklchToHex({
    ...parsed,
    l: clamp(parsed.l + (index % 2 ? 0.018 : -0.018), 0.03, 0.98),
  });
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
  currentColors = [],
  lockedSlots,
  seed = 0,
}: GeneratePaletteOptions) {
  const sources = sourceColors.length
    ? sourceColors.map((color) => normalizeColorHex(color))
    : [normalizeColorHex(currentColors[2] ?? "#7A5C43")];
  const anchorHex = sources[0];
  const anchor = colorToOklch(anchorHex);
  const secondary = sources[1] ? colorToOklch(sources[1]) : null;
  const locks = normalizePaletteLocks(lockedSlots);

  const baseHue = anchor.h ?? secondary?.h ?? 80;
  const plan = SCHEME_HUE_PLANS[schemeType];
  const dir = plan.useDir ? schemeDirection(baseHue, secondary, seed) : 1;

  // A grey/black/white logo has no hue to build a complement/triad from — treat it as
  // monochromatic and keep the whole palette near-neutral rather than inventing a color.
  const achromatic = anchor.c < 0.02;
  const chromaScale = achromatic ? 0.25 : 1;
  const neutralHue = achromatic
    ? baseHue
    : hue(
        baseHue +
          plan.neutralBase +
          plan.neutralSpread * dir +
          seededNoise(seed, 37) * 4,
      );
  const buttonHue = achromatic
    ? neutralHue
    : resolveButtonHue(
        hue(
          baseHue +
            plan.buttonBase +
            plan.buttonSpread * dir +
            seededNoise(seed, 31) * 8,
        ),
        secondary,
      );

  const generated = [
    createRoleColor(anchor.c, "background", mode, neutralHue, seed + 1, chromaScale),
    createRoleColor(anchor.c, "surface", mode, neutralHue, seed + 2, chromaScale),
    anchorHex,
    createRoleColor(anchor.c, "text", mode, neutralHue, seed + 3, chromaScale),
    createRoleColor(anchor.c, "button", mode, buttonHue, seed + 4, chromaScale),
  ].map((color, index) =>
    index === 2 ? anchorHex : preventSourceDuplicate(color, sources, index),
  );

  generated[3] = ensureContrast(generated[3], [generated[0], generated[1]], 4.5);
  if (Math.min(
    contrastRatio(generated[4], generated[0]),
    contrastRatio(generated[4], generated[1]),
  ) < 3) {
    generated[4] = ensureContrast(generated[4], [generated[0], generated[1]], 3);
  }

  return generated.map((color, index) =>
    locks[index] && currentColors[index]
      ? normalizeColorHex(currentColors[index])
      : color,
  );
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
