import type { AccentTokens } from "@/lib/scanme-links";

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
