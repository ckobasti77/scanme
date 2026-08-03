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

export function readableTextColor(background: string, preferred = "#1D211E") {
  return ensureContrast(preferred, background, 4.5);
}
