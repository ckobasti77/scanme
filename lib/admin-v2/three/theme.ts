import type { DrawQuality } from "./quality";

// ADMIN v3 V2 — how a scene of the 3D kit follows the theme (ZADATAK-V3 §3).
// The dark theme has the full depth: bloom and additive light. The light theme
// keeps the motion and the 3D but stays clean: no bloom pass at all (glow over
// a light surface washes the page out) and normal blending with the darker
// token colours (additive light disappears on a light surface). Pure: the
// stage reads the theme from `html[data-theme]` and the colours from the
// computed tokens.

export type StageTheme = "light" | "dark";

/** `html[data-theme]`: anything but "dark" is the light theme. */
export function themeOf(attribute: string | null | undefined): StageTheme {
  return attribute === "dark" ? "dark" : "light";
}

export type BloomParams = { strength: number; radius: number; threshold: number };

/**
 * The one bloom of the admin: only what is brighter than the threshold glows (a scene lifts those colours
 * itself). The radius is small on purpose: a wide one lays a haze over the whole canvas, and the scene
 * would stand in the panel as a lighter box.
 */
export const STAGE_BLOOM: BloomParams = { strength: 0.8, radius: 0.2, threshold: 0.72 };

/** null = no bloom pass: the light theme, and the low quality in both themes. */
export function bloomParams(theme: StageTheme, quality: DrawQuality): BloomParams | null {
  return theme === "dark" && quality === "high" ? STAGE_BLOOM : null;
}

export type StageBlend = "additive" | "normal";

/** Trails, halos and beams add light in the dark theme and are painted in the light one. */
export function blendMode(theme: StageTheme): StageBlend {
  return theme === "dark" ? "additive" : "normal";
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i;

const channel = (text: string) => {
  const value = text.endsWith("%") ? (Number.parseFloat(text) / 100) * 255 : Number.parseFloat(text);
  return Math.min(1, Math.max(0, value / 255));
};

/**
 * A computed token as sRGB channels 0–1: `#rgb`, `#rrggbb` (an alpha is dropped), `rgb(r, g, b)` and
 * `rgb(r g b / a)`. null for anything else, so the caller uses its fallback instead of a wrong colour.
 */
export function parseCssColor(value: string | null | undefined): [number, number, number] | null {
  const text = (value ?? "").trim();
  const hex = HEX.exec(text);
  if (hex) {
    const digits = hex[1];
    const wide = digits.length <= 4 ? [...digits.slice(0, 3)].map((digit) => digit + digit).join("") : digits.slice(0, 6);
    return [0, 2, 4].map((at) => Number.parseInt(wide.slice(at, at + 2), 16) / 255) as [number, number, number];
  }
  const rgb = RGB.exec(text);
  if (!rgb) return null;
  const channels = [channel(rgb[1]), channel(rgb[2]), channel(rgb[3])] as [number, number, number];
  return channels.some(Number.isNaN) ? null : channels;
}
