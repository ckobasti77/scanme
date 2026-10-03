import {
  converter,
  differenceCiede2000,
  formatHex,
  modeLab65,
  modeLrgb,
  modeOklch,
  modeRgb,
  toGamut,
  useMode as registerMode,
  wcagContrast,
  type Oklch,
  type Rgb,
} from "culori/fn";
import type { ScanMeLinksDesignV2 } from "./scanme-links-design";

registerMode(modeRgb);
registerMode(modeOklch);
registerMode(modeLab65);
registerMode(modeLrgb);

const toOklch = converter("oklch");
const toRgb = converter("rgb");
const mapToRgbGamut = toGamut("rgb", "oklch");
const ciede2000 = differenceCiede2000();

export const FALLBACK_COLOR = "#7A5C43";
export const SCANME_OFF_BLACK = "#161916";
export const SCANME_OFF_WHITE = "#F7F8F3";

export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeColorHex(value: string, fallback = FALLBACK_COLOR) {
  const normalized = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
  // 8-digit #RRGGBBAA (used by some presets' translucent surfaces): drop the alpha
  // pair so the color is judged as its opaque tone rather than collapsing to fallback.
  if (/^#[0-9A-F]{8}$/.test(normalized)) return normalized.slice(0, 7);
  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split("")
      .map((character) => character.repeat(2))
      .join("")}`;
  }
  return fallback;
}

export function colorToOklch(value: string): Oklch {
  return (
    toOklch(normalizeColorHex(value)) ?? {
      mode: "oklch",
      l: 0.5,
      c: 0,
      h: 0,
    }
  );
}

export function oklchToHex(color: Oklch) {
  return normalizeColorHex(formatHex(mapToRgbGamut(color)) ?? FALLBACK_COLOR);
}

export function contrastRatio(first: string, second: string) {
  return wcagContrast(normalizeColorHex(first), normalizeColorHex(second));
}

export function colorDifference(first: string, second: string) {
  return ciede2000(normalizeColorHex(first), normalizeColorHex(second));
}

export function mixColors(first: string, second: string, amount: number) {
  const from = colorToOklch(first);
  const to = colorToOklch(second);
  const t = clamp(amount);
  const fromHue = from.h ?? to.h ?? 0;
  const toHue = to.h ?? from.h ?? 0;
  const hueDelta = ((toHue - fromHue + 540) % 360) - 180;

  return oklchToHex({
    mode: "oklch",
    l: from.l + (to.l - from.l) * t,
    c: from.c + (to.c - from.c) * t,
    h: (fromHue + hueDelta * t + 360) % 360,
  });
}

export function compositeColors(
  background: string,
  foreground: string,
  opacity: number,
) {
  const base = toRgb(normalizeColorHex(background)) as Rgb | undefined;
  const overlay = toRgb(normalizeColorHex(foreground)) as Rgb | undefined;
  if (!base || !overlay) return normalizeColorHex(background);
  const alpha = clamp(opacity);

  return normalizeColorHex(
    formatHex({
      mode: "rgb",
      r: base.r + (overlay.r - base.r) * alpha,
      g: base.g + (overlay.g - base.g) * alpha,
      b: base.b + (overlay.b - base.b) * alpha,
    }) ?? background,
  );
}

function firstPassingContrast(
  foreground: string,
  backgrounds: string[],
  minimum: number,
  targetLightness: number,
) {
  const source = colorToOklch(foreground);
  for (let step = 1; step <= 48; step += 1) {
    const progress = step / 48;
    const candidate = oklchToHex({
      mode: "oklch",
      l: source.l + (targetLightness - source.l) * progress,
      c: source.c * (1 - progress * 0.42),
      h: source.h,
    });
    if (minimumContrast(candidate, backgrounds) >= minimum) return candidate;
  }
  return null;
}

export function minimumContrast(foreground: string, backgrounds: string[]) {
  if (!backgrounds.length) return 1;
  return Math.min(
    ...backgrounds.map((background) => contrastRatio(foreground, background)),
  );
}

export function safeNeutralForBackgrounds(backgrounds: string | string[]) {
  const normalizedBackgrounds = (Array.isArray(backgrounds)
    ? backgrounds
    : [backgrounds]
  ).map((color) => normalizeColorHex(color));

  return minimumContrast(SCANME_OFF_BLACK, normalizedBackgrounds) >=
    minimumContrast(SCANME_OFF_WHITE, normalizedBackgrounds)
    ? SCANME_OFF_BLACK
    : SCANME_OFF_WHITE;
}

export function ensureContrast(
  foreground: string,
  backgrounds: string | string[],
  minimum = 4.5,
) {
  const normalizedForeground = normalizeColorHex(foreground);
  const normalizedBackgrounds = (Array.isArray(backgrounds)
    ? backgrounds
    : [backgrounds]
  ).map((color) => normalizeColorHex(color));

  if (minimumContrast(normalizedForeground, normalizedBackgrounds) >= minimum) {
    return normalizedForeground;
  }

  const dark = firstPassingContrast(
    normalizedForeground,
    normalizedBackgrounds,
    minimum,
    0.055,
  );
  const light = firstPassingContrast(
    normalizedForeground,
    normalizedBackgrounds,
    minimum,
    0.96,
  );

  if (dark && light) {
    return colorDifference(normalizedForeground, dark) <=
      colorDifference(normalizedForeground, light)
      ? dark
      : light;
  }
  if (dark) return dark;
  if (light) return light;

  return safeNeutralForBackgrounds(normalizedBackgrounds);
}

export const FALLBACK_ACHROMATIC_HUE = 250;

export function deriveReadableTextVariant(
  backgrounds: string | string[],
  targetHue?: number,
  minimum = 4.5,
): string {
  const normalizedBackgrounds = (Array.isArray(backgrounds)
    ? backgrounds
    : [backgrounds]
  ).map((color) => normalizeColorHex(color));

  let hue = targetHue;
  if (hue === undefined || isNaN(hue)) {
    const firstOklch = colorToOklch(
      normalizedBackgrounds[0] ?? SCANME_OFF_WHITE,
    );
    hue = firstOklch.h ?? FALLBACK_ACHROMATIC_HUE;
  }
  hue = ((hue % 360) + 360) % 360;

  const darkBaseL = 0.18;
  const lightBaseL = 0.96;
  const textChroma = 0.011;

  const initialDark = oklchToHex({
    mode: "oklch",
    l: darkBaseL,
    c: textChroma,
    h: hue,
  });
  const initialLight = oklchToHex({
    mode: "oklch",
    l: lightBaseL,
    c: textChroma,
    h: hue,
  });

  const darkContrast = minimumContrast(initialDark, normalizedBackgrounds);
  const lightContrast = minimumContrast(initialLight, normalizedBackgrounds);

  const pickDark = darkContrast >= lightContrast;

  if (pickDark) {
    if (darkContrast >= minimum) return initialDark;
    for (let step = 1; step <= 30; step += 1) {
      const l = Math.max(0.06, darkBaseL - (darkBaseL - 0.06) * (step / 30));
      const c = Math.max(0.003, textChroma * (1 - (step / 30) * 0.5));
      const candidate = oklchToHex({ mode: "oklch", l, c, h: hue });
      if (
        candidate !== "#000000" &&
        minimumContrast(candidate, normalizedBackgrounds) >= minimum
      ) {
        return candidate;
      }
    }
    return initialDark;
  } else {
    if (lightContrast >= minimum) return initialLight;
    for (let step = 1; step <= 30; step += 1) {
      const l = Math.min(0.985, lightBaseL + (0.985 - lightBaseL) * (step / 30));
      const c = Math.max(0.003, textChroma * (1 - (step / 30) * 0.5));
      const candidate = oklchToHex({ mode: "oklch", l, c, h: hue });
      if (
        candidate !== "#FFFFFF" &&
        minimumContrast(candidate, normalizedBackgrounds) >= minimum
      ) {
        return candidate;
      }
    }
    return initialLight;
  }
}

export function readableTextColor(background: string, preferred?: string) {
  if (preferred) {
    return ensureContrast(preferred, background, 4.5);
  }
  return deriveReadableTextVariant(background);
}

// Guarantee a suggested color never reads as pure black or white: map exact and
// near-pure endpoints to the brand's off-black / off-white so swatches stay tasteful.
export function softenSuggestionColor(color: string) {
  const hex = normalizeColorHex(color);
  if (hex === "#000000") return SCANME_OFF_BLACK;
  if (hex === "#FFFFFF") return SCANME_OFF_WHITE;
  const oklch = colorToOklch(hex);
  if (oklch.l <= 0.06) return SCANME_OFF_BLACK;
  if (oklch.l >= 0.985) return SCANME_OFF_WHITE;
  return hex;
}

// Like ensureContrast, but aesthetics-first: keeps the source hue and most of its
// chroma, clamps lightness to a tasteful band (so it can never reach pure black/white),
// and returns the FIRST candidate that clears the contrast floor (a floor, not a
// maximum), breaking ties by the smaller perceptual distance to the source color.
export function harmoniousContrastColor(
  foreground: string,
  backgrounds: string | string[],
  minimum = 4.5,
  range: { min: number; max: number } = { min: 0.14, max: 0.92 },
  chromaRetention = 0.75,
) {
  const normalizedForeground = normalizeColorHex(foreground);
  const normalizedBackgrounds = (Array.isArray(backgrounds)
    ? backgrounds
    : [backgrounds]
  ).map((color) => normalizeColorHex(color));
  if (
    minimumContrast(normalizedForeground, normalizedBackgrounds) >= minimum
  ) {
    return normalizedForeground;
  }

  const source = colorToOklch(normalizedForeground);
  const chroma = source.c * chromaRetention;
  const hue = source.h ?? 0;
  const build = (lightness: number) =>
    oklchToHex({
      mode: "oklch",
      l: clamp(lightness, range.min, range.max),
      c: chroma,
      h: hue,
    });

  let darker: string | null = null;
  let lighter: string | null = null;
  const steps = 40;
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    if (!darker) {
      const candidate = build(source.l + (range.min - source.l) * progress);
      if (minimumContrast(candidate, normalizedBackgrounds) >= minimum) {
        darker = candidate;
      }
    }
    if (!lighter) {
      const candidate = build(source.l + (range.max - source.l) * progress);
      if (minimumContrast(candidate, normalizedBackgrounds) >= minimum) {
        lighter = candidate;
      }
    }
    if (darker && lighter) break;
  }

  if (darker && lighter) {
    return colorDifference(normalizedForeground, darker) <=
      colorDifference(normalizedForeground, lighter)
      ? darker
      : lighter;
  }
  return darker ?? lighter ?? safeNeutralForBackgrounds(normalizedBackgrounds);
}

function uniqueColors(colors: string[]) {
  return Array.from(new Set(colors.map((color) => normalizeColorHex(color))));
}

type BackgroundContext = {
  // The effective, visible background color(s) behind the identity/text.
  samples: string[];
  // "unknown" only when a real photo/video is displayed — its pixels can't be sampled.
  certainty: "known" | "unknown";
  // Worst-case light/dark frames for a displayed photo/video (overlay over black/white).
  mediaWorst?: [string, string];
};

// Resolve what is actually painted behind the content. Crucially, a "media" background
// with NO uploaded media renders exactly as the overlay composited over the page color —
// i.e. a plain solid. Only a genuinely displayed photo/video is "unknown".
export function resolveBackgroundContext(
  design: ScanMeLinksDesignV2,
  options: { mediaPresent: boolean },
): BackgroundContext {
  const background = design.background;
  switch (background.category) {
    case "flat":
      return { samples: [background.color], certainty: "known" };
    case "gradient":
      return {
        samples: uniqueColors([
          background.startColor,
          background.endColor,
          mixColors(background.startColor, background.endColor, 0.5),
        ]),
        certainty: "known",
      };
    case "pattern":
      return {
        samples: uniqueColors([
          background.backgroundColor,
          compositeColors(
            background.backgroundColor,
            background.patternColor,
            background.opacity,
          ),
        ]),
        certainty: "known",
      };
    case "texture":
      return {
        samples: uniqueColors([
          background.backgroundColor,
          compositeColors(
            background.backgroundColor,
            background.tintColor,
            background.intensity * 0.55,
          ),
        ]),
        certainty: "known",
      };
    case "animation":
      return {
        samples: uniqueColors([
          background.baseColor,
          mixColors(
            background.baseColor,
            background.accentColor,
            background.intensity * 0.65,
          ),
          background.accentColor,
        ]),
        certainty: "known",
      };
    case "media": {
      const effective = compositeColors(
        design.colors.page,
        background.overlayColor,
        background.overlayOpacity,
      );
      if (!options.mediaPresent) {
        // No upload yet → the overlay-over-page solid is exactly what shows.
        return { samples: [effective], certainty: "known" };
      }
      return {
        samples: [effective],
        certainty: "unknown",
        mediaWorst: [
          compositeColors(
            "#000000",
            background.overlayColor,
            background.overlayOpacity,
          ),
          compositeColors(
            "#FFFFFF",
            background.overlayColor,
            background.overlayOpacity,
          ),
        ],
      };
    }
  }
}

// Kept for the status-bar / "powered by" callers. Returns the worst-case frame pair only
// when a real photo/video is displayed (mediaPresent), otherwise the single visible tone.
export function backgroundContrastSamples(
  design: ScanMeLinksDesignV2,
  options: { mediaPresent?: boolean } = {},
) {
  const context = resolveBackgroundContext(design, {
    mediaPresent: options.mediaPresent ?? false,
  });
  return context.mediaWorst ?? context.samples;
}
