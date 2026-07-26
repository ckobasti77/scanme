import type { AccentTokens } from "@/lib/scanme-links";

type Rgb = { r: number; g: number; b: number };

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((value) => clamp(value).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function mix(first: Rgb, second: Rgb, amount: number): Rgb {
  return {
    r: first.r + (second.r - first.r) * amount,
    g: first.g + (second.g - first.g) * amount,
    b: first.b + (second.b - first.b) * amount,
  };
}

function luminance(rgb: Rgb) {
  const values = [rgb.r, rgb.g, rgb.b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function saturation(rgb: Rgb) {
  const values = [rgb.r, rgb.g, rgb.b].map((value) => value / 255);
  return Math.max(...values) - Math.min(...values);
}

function distance(first: Rgb, second: Rgb) {
  return Math.sqrt(
    (first.r - second.r) ** 2 +
      (first.g - second.g) ** 2 +
      (first.b - second.b) ** 2,
  );
}

export function createAccentTokens(hex: string): AccentTokens {
  const accentRgb = hexToRgb(hex);
  const dark = { r: 22, g: 20, b: 18 };
  const white = { r: 255, g: 255, b: 255 };
  const accent = rgbToHex(
    luminance(accentRgb) > 0.78
      ? mix(accentRgb, dark, 0.28)
      : luminance(accentRgb) < 0.08
        ? mix(accentRgb, white, 0.24)
        : accentRgb,
  );
  const normalized = hexToRgb(accent);
  return {
    accent,
    strong: rgbToHex(mix(normalized, dark, 0.42)),
    soft: rgbToHex(mix(normalized, white, 0.84)),
    border: rgbToHex(mix(normalized, white, 0.58)),
    focus: rgbToHex(mix(normalized, dark, 0.28)),
    onAccent: luminance(normalized) > 0.48 ? "#171511" : "#FFFFFF",
  };
}

export function selectAccentCandidates(colors: string[]) {
  const selected: string[] = [];
  for (const value of colors) {
    const hex = value.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex)) continue;
    const rgb = hexToRgb(hex);
    const lightness = luminance(rgb);
    if (lightness < 0.025 || lightness > 0.94 || saturation(rgb) < 0.08) continue;
    if (selected.some((candidate) => distance(hexToRgb(candidate), rgb) < 54)) {
      continue;
    }
    selected.push(createAccentTokens(hex).accent);
    if (selected.length === 3) break;
  }
  if (!selected.length) selected.push("#7A5C43");
  while (selected.length < 3) {
    const base = hexToRgb(selected[0]);
    const derived = rgbToHex(
      mix(base, selected.length === 1 ? { r: 22, g: 20, b: 18 } : { r: 255, g: 255, b: 255 }, 0.18),
    );
    if (!selected.includes(derived)) selected.push(derived);
    else break;
  }
  return selected.slice(0, 3);
}

export async function extractAccentCandidates(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const { getPalette } = await import("colorthief");
    const palette = await getPalette(bitmap, {
      colorCount: 10,
      quality: 6,
      colorSpace: "oklch",
    });
    return selectAccentCandidates((palette ?? []).map((color) => color.hex()));
  } finally {
    bitmap.close();
  }
}

