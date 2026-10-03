export type RgbColor = { r: number; g: number; b: number };
export type HsvColor = { h: number; s: number; v: number };
export type HslColor = { h: number; s: number; l: number };
export type CmykColor = { c: number; m: number; y: number; k: number };

export function normalizeHexColor(value: string, fallback = "#000000") {
  const raw = value.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((character) => character + character)
          .join("")
      : raw.length === 8
        ? raw.slice(0, 6)
        : raw;
  return /^[\da-f]{6}$/i.test(expanded)
    ? `#${expanded.toUpperCase()}`
    : fallback;
}

export function isCompleteHexColor(value: string) {
  return /^#[\da-f]{6}$/i.test(value.trim());
}

export function hexToRgb(value: string): RgbColor {
  const hex = normalizeHexColor(value).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return {
    h: hue,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

export function stableHsvFromHex(
  value: string,
  fallback?: HsvColor,
): HsvColor {
  const next = rgbToHsv(hexToRgb(value));
  const isBlack = next.v <= 0.0001;
  const isAchromatic = next.s <= 0.0001;

  return {
    h: isAchromatic ? (fallback?.h ?? next.h) : next.h,
    s: isBlack ? (fallback?.s ?? next.s) : next.s,
    v: next.v,
  };
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;
  let channels: [number, number, number];

  if (hue < 60) channels = [chroma, x, 0];
  else if (hue < 120) channels = [x, chroma, 0];
  else if (hue < 180) channels = [0, chroma, x];
  else if (hue < 240) channels = [0, x, chroma];
  else if (hue < 300) channels = [x, 0, chroma];
  else channels = [chroma, 0, x];

  return {
    r: (channels[0] + match) * 255,
    g: (channels[1] + match) * 255,
    b: (channels[2] + match) * 255,
  };
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return {
    h: hue,
    s:
      delta === 0
        ? 0
        : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
    l: lightness * 100,
  };
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  let channels: [number, number, number];

  if (hue < 60) channels = [chroma, x, 0];
  else if (hue < 120) channels = [x, chroma, 0];
  else if (hue < 180) channels = [0, chroma, x];
  else if (hue < 240) channels = [0, x, chroma];
  else if (hue < 300) channels = [x, 0, chroma];
  else channels = [chroma, 0, x];

  return {
    r: (channels[0] + match) * 255,
    g: (channels[1] + match) * 255,
    b: (channels[2] + match) * 255,
  };
}

export function rgbToCmyk({ r, g, b }: RgbColor): CmykColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const key = 1 - Math.max(red, green, blue);

  if (key >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - red - key) / (1 - key)) * 100,
    m: ((1 - green - key) / (1 - key)) * 100,
    y: ((1 - blue - key) / (1 - key)) * 100,
    k: key * 100,
  };
}

export function cmykToRgb({ c, m, y, k }: CmykColor): RgbColor {
  const cyan = clamp(c, 0, 100) / 100;
  const magenta = clamp(m, 0, 100) / 100;
  const yellow = clamp(y, 0, 100) / 100;
  const key = clamp(k, 0, 100) / 100;
  return {
    r: 255 * (1 - cyan) * (1 - key),
    g: 255 * (1 - magenta) * (1 - key),
    b: 255 * (1 - yellow) * (1 - key),
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
