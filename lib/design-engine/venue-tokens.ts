// The Venue token compiler (RFC-001 §2.5, STEP 4 of TASK-07): the first
// consumer of `createTokenCompiler`. It compiles a page-level Venue design
// document into `--venue-*` CSS custom properties, structurally parallel to
// what the frozen Links `designStyle()` produces — but namespaced to `venue`
// and reusing the lifted `background`/`shadows` helpers.
//
// Pure and unit-testable; the React `VenueTemplate` that spreads these onto its
// root is TASK-08. The TS `VenueDesign` shape mirrors `venueDesignValidator` in
// convex/lib/venueValidators.ts.

import type { ScanMeLinksBackgroundV2 } from "../scanme-links-design";
import { backgroundPresentation } from "./background";
import { clampDesign, type Capabilities } from "./capabilities";
import { logoShadowCss, shadowCss } from "./shadows";
import { createTokenCompiler, type TokenValues } from "./tokens";
import { type DesignFontKey, FONT_STACKS } from "./typography";

type DesignWeight = 400 | 500 | 600 | 700;
type DesignScale = "small" | "medium" | "large";
type DesignShadow = {
  enabled: boolean;
  color: string;
  x: number;
  y: number;
  blur: number;
  opacity: number;
};

export type VenueColors = {
  page: string;
  surface: string;
  title: string;
  body: string;
  accent: string;
  border: string;
  focus: string;
  icon: string;
};

export type VenueTypography = {
  fontKey: DesignFontKey;
  headingWeight: DesignWeight;
  bodyWeight: DesignWeight;
  alignment: "left" | "center" | "right";
  scale: DesignScale;
  lineHeight: number;
  verticalSpacing: number;
};

export type VenueEffects = {
  textShadow: DesignShadow;
  logoShadow: DesignShadow;
};

export type VenueDesign = {
  version: 1;
  colors: VenueColors;
  typography: VenueTypography;
  background: ScanMeLinksBackgroundV2;
  effects?: VenueEffects;
};

// A known-good default design — a flat off-white page in the ScanMe neutrals.
// The flat background keeps the token output pure `--venue-*` (see the note on
// `backgroundPresentation` below).
export const DEFAULT_VENUE_DESIGN: VenueDesign = {
  version: 1,
  colors: {
    page: "#F7F8F3",
    surface: "#FFFFFF",
    title: "#161916",
    body: "#3A3F3A",
    accent: "#7A5C43",
    border: "#DADED2",
    focus: "#7A5C43",
    icon: "#7A5C43",
  },
  typography: {
    fontKey: "dm-sans",
    headingWeight: 600,
    bodyWeight: 400,
    alignment: "left",
    scale: "medium",
    lineHeight: 1.5,
    verticalSpacing: 16,
  },
  background: { category: "flat", color: "#F7F8F3" },
};

// Venue's preset/capability catalog, built on the generic `Capabilities`
// (§2.5). It is intentionally a **single entry** (`default`): the RFC leaves
// Venue plan tiers and per-tier block/preset allow-lists unspecified (open
// question #1), so inventing a multi-preset catalog would be speculative.
// `clampDesign` here fills missing top-level design keys from `defaults` and
// returns the full default for a null/absent design — the deep normalization of
// individual colour roles is the palette derivation's job (deriveVenueRoleColors).
export const VENUE_CAPABILITIES: Capabilities<VenueDesign> = {
  defaults: DEFAULT_VENUE_DESIGN,
};

export const VENUE_PRESET_CAPABILITIES = {
  default: VENUE_CAPABILITIES,
} as const;

export function clampVenueDesign(
  design: VenueDesign | null | undefined,
): VenueDesign {
  return clampDesign(design, VENUE_CAPABILITIES);
}

const compile = createTokenCompiler("venue");

/**
 * Compile a page-level Venue design into `--venue-*` custom properties.
 *
 * Note on backgrounds: the lifted, frozen `backgroundPresentation` helper emits
 * a Links-namespaced page custom property in its `media` branch (a shared-helper
 * detail of the Links render path). The Venue template (TASK-08) supplies or
 * remaps that variable for media backgrounds; every other category — flat,
 * gradient, pattern, texture, animation — produces `--venue-*`-only output, and
 * the default design is flat, so this compiler's own output stays clean.
 */
export function compileVenueTokens(design: VenueDesign): Record<string, string> {
  const { colors, typography, background, effects } = design;
  const bg = backgroundPresentation(background);
  const values: TokenValues = {
    page: colors.page,
    surface: colors.surface,
    title: colors.title,
    body: colors.body,
    accent: colors.accent,
    border: colors.border,
    focus: colors.focus,
    icon: colors.icon,
    "font-family": FONT_STACKS[typography.fontKey],
    "heading-weight": String(typography.headingWeight),
    "body-weight": String(typography.bodyWeight),
    "text-align": typography.alignment,
    scale: typography.scale,
    "line-height": String(typography.lineHeight),
    "vertical-spacing": `${typography.verticalSpacing}px`,
    "background-base-image": bg.baseImage,
    "background-detail-image": bg.detailImage,
    "background-detail-size": bg.detailSize,
    "background-detail-opacity": String(bg.detailOpacity),
    "text-shadow": effects ? shadowCss(effects.textShadow) : undefined,
    "logo-shadow": effects ? logoShadowCss(effects.logoShadow) : undefined,
  };
  return compile(values);
}
