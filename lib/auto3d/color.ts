// Boje 3D Rendgen pregledača: heks ↔ sRGB, mešanje u linearnom prostoru i WCAG kontrast
// (docs/auto3d/planovi/A03.md §2.3). Čisto, bez three-a, da ga koriste i testovi i UI.

export type Rgb = [number, number, number];

/** `#RRGGBB` → sRGB komponente 0–1. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`boja: očekivan #RRGGBB, dobijeno ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB komponente 0–1 → `#RRGGBB` (velika slova). */
export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Meša dve boje u linearnom sRGB-u: k = 0 daje `a`, k = 1 daje `b`. */
export function mixHex(a: string, b: string, k: number): string {
  const ca = hexToRgb(a).map(srgbToLinear);
  const cb = hexToRgb(b).map(srgbToLinear);
  return rgbToHex(ca.map((v, i) => linearToSrgb(v + (cb[i] - v) * k)) as Rgb);
}

/** Svetlija boja za hover: udeo k ka beloj, u linearnom prostoru. */
export function lighten(hex: string, k: number): string {
  return mixHex(hex, "#FFFFFF", k);
}

/** Relativna luminansa po WCAG 2.x. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG odnos kontrasta (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
