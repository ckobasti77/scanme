import { hexFromArgb, QuantizerCelebi } from "@material/material-color-utilities";
import {
  colorDifference,
  colorToOklch,
  FALLBACK_COLOR,
  normalizeColorHex,
} from "./scanme-color-science";
import type { AccentTokens } from "./scanme-links";

export type LogoSwatch = {
  hex: string;
  share: number; // 0..1, udeo piksela
  chroma: number; // OKLCH C
  lightness: number; // OKLCH L
};

export type LogoProfile = {
  swatches: LogoSwatch[]; // sve značajne boje, sortirane po udelu
  mass: LogoSwatch[]; // boje sa udelom iznad praga — ono što se vidi
  accent: string | null; // hromatska akcentna boja, ili null
  isMixed: boolean; // ima i tamnu i svetlu masu
  isAchromatic: boolean; // nijedna boja nema upotrebljiv hue
};

type Rgb = { r: number; g: number; b: number };
type PaletteSource = HTMLCanvasElement | ImageBitmap;

const MAX_SVG_RASTER_SIZE = 512;

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

async function rasterizeSvg(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
      };

      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error("SVG logotip nije moguće učitati."));
      };
      image.src = objectUrl;
    });

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("SVG logotip nema ispravne dimenzije.");
    }

    const scale = Math.min(
      1,
      MAX_SVG_RASTER_SIZE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("SVG logotip nije moguće obraditi.");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function extractAccentCandidates(file: File) {
  let source: PaletteSource;
  let release: () => void;

  if (file.type.toLowerCase() === "image/svg+xml") {
    const canvas = await rasterizeSvg(file);
    source = canvas;
    release = () => {
      canvas.width = 0;
      canvas.height = 0;
    };
  } else {
    const bitmap = await createImageBitmap(file);
    source = bitmap;
    release = () => bitmap.close();
  }

  try {
    const { getPalette } = await import("colorthief");
    const palette = await getPalette(source, {
      colorCount: 10,
      quality: 6,
      colorSpace: "oklch",
    });
    return selectAccentCandidates((palette ?? []).map((color) => color.hex()));
  } finally {
    release();
  }
}

export function buildLogoProfileFromColors(
  rawColors: Array<{ hex: string; count?: number; share?: number }>,
): LogoProfile {
  if (!rawColors.length) {
    return {
      swatches: [
        { hex: FALLBACK_COLOR, share: 1, chroma: 0.05, lightness: 0.45 },
      ],
      mass: [
        { hex: FALLBACK_COLOR, share: 1, chroma: 0.05, lightness: 0.45 },
      ],
      accent: null,
      isMixed: false,
      isAchromatic: true,
    };
  }

  // Normalize input colors to valid uppercase hex and counts
  const entries = rawColors.map((item) => ({
    hex: normalizeColorHex(item.hex),
    count: item.count ?? Math.max(1, Math.round((item.share ?? 1) * 10000)),
  }));

  // Sort descending by raw count
  entries.sort((a, b) => b.count - a.count);

  // Perceptual clustering (CIEDE2000 < 7) to merge antialiasing variations
  type Cluster = { hex: string; count: number };
  const clusters: Cluster[] = [];

  for (const entry of entries) {
    const existing = clusters.find(
      (cluster) => colorDifference(cluster.hex, entry.hex) < 7,
    );
    if (existing) {
      existing.count += entry.count;
    } else {
      clusters.push({ hex: entry.hex, count: entry.count });
    }
  }

  const totalCount = clusters.reduce((sum, c) => sum + c.count, 0) || 1;
  const rawWithShare = clusters.map((c) => ({
    hex: c.hex,
    share: c.count / totalCount,
  }));

  // Filter noise below 3% share
  let significant = rawWithShare.filter((c) => c.share >= 0.03);
  if (!significant.length) {
    significant = rawWithShare.slice(0, 1);
  }

  // Normalize shares of significant swatches so they sum to 1.0
  const sumShare = significant.reduce((sum, c) => sum + c.share, 0) || 1;
  const swatches: LogoSwatch[] = significant
    .map((c) => {
      const oklch = colorToOklch(c.hex);
      return {
        hex: c.hex,
        share: c.share / sumShare,
        chroma: oklch.c,
        lightness: oklch.l,
      };
    })
    .sort((a, b) => b.share - a.share);

  // Mass: swatches with share >= 0.05 (the visually dominant mass)
  let mass = swatches.filter((s) => s.share >= 0.05);
  if (!mass.length) {
    mass = swatches.slice(0, 1);
  }

  // isMixed: contains both dark mass (L < 0.45) and light mass (L > 0.55)
  const hasDarkMass = mass.some((s) => s.lightness < 0.45);
  const hasLightMass = mass.some((s) => s.lightness > 0.55);
  const isMixed = hasDarkMass && hasLightMass;

  // isAchromatic: no swatch has usable chroma (all < 0.025)
  const isAchromatic = swatches.every((s) => s.chroma < 0.025);

  // Accent: chromatic color with highest visual weight
  const chromatic = swatches.filter((s) => s.chroma >= 0.025);
  let accent: string | null = null;
  if (chromatic.length > 0) {
    const visualWeight = (s: LogoSwatch) =>
      Math.pow(s.chroma, 1.2) * Math.pow(s.share, 0.35);
    const sortedChromatic = [...chromatic].sort(
      (a, b) => visualWeight(b) - visualWeight(a),
    );
    accent = sortedChromatic[0].hex;
  }

  return {
    swatches,
    mass,
    accent,
    isMixed,
    isAchromatic,
  };
}

export function buildLogoProfileFromPixels(
  pixels: number[] | Uint32Array,
): LogoProfile {
  const pixelArray =
    pixels instanceof Uint32Array ? Array.from(pixels) : pixels;
  const countMap = QuantizerCelebi.quantize(pixelArray, 128);
  const rawColors: Array<{ hex: string; count: number }> = [];

  for (const [argb, count] of countMap.entries()) {
    const hex = normalizeColorHex(hexFromArgb(argb));
    rawColors.push({ hex, count });
  }

  return buildLogoProfileFromColors(rawColors);
}

export async function extractLogoProfile(file: File): Promise<LogoProfile> {
  let canvas: HTMLCanvasElement;
  let release: () => void;

  if (file.type.toLowerCase() === "image/svg+xml") {
    canvas = await rasterizeSvg(file);
    release = () => {
      canvas.width = 0;
      canvas.height = 0;
    };
  } else {
    const bitmap = await createImageBitmap(file);
    canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
    }
    bitmap.close();
    release = () => {
      canvas.width = 0;
      canvas.height = 0;
    };
  }

  try {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Logotip nije moguće obraditi.");
    }
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const opaquePixels: number[] = [];

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 16) continue; // Skip transparent pixels
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const argb = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
      opaquePixels.push(argb);
    }

    if (opaquePixels.length === 0) {
      return buildLogoProfileFromColors([{ hex: FALLBACK_COLOR, count: 1 }]);
    }

    return buildLogoProfileFromPixels(opaquePixels);
  } finally {
    release();
  }
}
