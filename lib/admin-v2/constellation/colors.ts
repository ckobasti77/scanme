import type { ConstellationPriority, OrbitIndex, StarTone } from "./types";

// ADMIN v3 V2 — the colours of the Constellation. Stars are drawn with the
// admin's own signal tokens, never with colours of their own, so the scene
// reads like the rest of the Dashboard. The values are repeated here because
// the 3D scene cannot read CSS custom properties; colors.test.ts keeps them
// equal to app/globals.css.

export type TokenColor = {
  /** The CSS custom property. */
  token: string;
  light: string;
  dark: string;
};

/** blocking_or_overdue → danger; due_today → warning; other → success; everything else → neutral. */
export function starTone(priority: ConstellationPriority): StarTone {
  if (priority === "blocking_or_overdue") return "danger";
  if (priority === "due_today") return "warning";
  if (priority === "other") return "success";
  return "neutral";
}

/** The tone of an orbit (the colour of its „+N“ star): 1 danger, 2 warning, 3 neutral, 4 success. */
export function orbitTone(orbit: OrbitIndex): StarTone {
  if (orbit === 1) return "danger";
  if (orbit === 2) return "warning";
  if (orbit === 3) return "neutral";
  return "success";
}

export const STAR_TOKENS: Record<StarTone, TokenColor> = {
  danger: { token: "--admin-danger", light: "#c72b37", dark: "#ff8b92" },
  warning: { token: "--admin-warning", light: "#9a5b00", dark: "#ffc45f" },
  neutral: { token: "--admin-text-muted", light: "#5f6462", dark: "#b0b6af" },
  success: { token: "--admin-success", light: "#477d12", dark: "#a9dc70" },
};

/** The ScanMe core. The dark theme does not redefine this token, so both themes use the same green. */
export const CORE_TOKEN: TokenColor = { token: "--admin-nav-line", light: "#6fc05d", dark: "#6fc05d" };
/** The ring of the backlog. */
export const BACKLOG_TOKEN: TokenColor = STAR_TOKENS.danger;
/** The thin lines of the orbits. */
export const ORBIT_LINE_TOKEN: TokenColor = STAR_TOKENS.neutral;
/** What a star is drawn on: the strong surface of a card. */
export const SURFACE_TOKEN: TokenColor = { token: "--admin-surface-strong", light: "#fffefa", dark: "#292e2b" };
