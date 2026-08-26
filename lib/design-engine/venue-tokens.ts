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

// Inclusive numeric ranges for the page-level design document (TASK-12).
// The RFC leaves these unspecified; they are the one source BOTH
// clampVenueDesign below and the editor's page-panel sliders read, so the UI
// can never offer a value the render path would take away.
export const VENUE_DESIGN_BOUNDS = {
  verticalSpacing: [8, 40],
  lineHeight: [1.2, 2],
  gradientAngle: [0, 360],
  gradientCenter: [0, 100],
  patternScale: [4, 96],
  patternOpacity: [0, 1],
  textureIntensity: [0, 1],
  mediaZoom: [1, 3],
  mediaPosition: [0, 100],
  overlayOpacity: [0, 1],
  animationSpeed: [0.25, 3],
  animationIntensity: [0, 1],
  shadowOffset: [-40, 40],
  shadowBlur: [0, 80],
  shadowOpacity: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

const bound = (
  value: number,
  [min, max]: readonly [number, number],
): number => Math.min(max, Math.max(min, value));

function clampVenueShadow(shadow: DesignShadow): DesignShadow {
  return {
    ...shadow,
    x: bound(shadow.x, VENUE_DESIGN_BOUNDS.shadowOffset),
    y: bound(shadow.y, VENUE_DESIGN_BOUNDS.shadowOffset),
    blur: bound(shadow.blur, VENUE_DESIGN_BOUNDS.shadowBlur),
    opacity: bound(shadow.opacity, VENUE_DESIGN_BOUNDS.shadowOpacity),
  };
}

function clampVenueBackground(
  background: ScanMeLinksBackgroundV2,
): ScanMeLinksBackgroundV2 {
  switch (background.category) {
    case "gradient":
      return {
        ...background,
        angle: bound(background.angle, VENUE_DESIGN_BOUNDS.gradientAngle),
        centerX: bound(background.centerX, VENUE_DESIGN_BOUNDS.gradientCenter),
        centerY: bound(background.centerY, VENUE_DESIGN_BOUNDS.gradientCenter),
      };
    case "pattern":
      return {
        ...background,
        scale: bound(background.scale, VENUE_DESIGN_BOUNDS.patternScale),
        opacity: bound(background.opacity, VENUE_DESIGN_BOUNDS.patternOpacity),
      };
    case "texture":
      return {
        ...background,
        intensity: bound(
          background.intensity,
          VENUE_DESIGN_BOUNDS.textureIntensity,
        ),
      };
    case "media":
      return {
        ...background,
        zoom: bound(background.zoom, VENUE_DESIGN_BOUNDS.mediaZoom),
        positionX: bound(background.positionX, VENUE_DESIGN_BOUNDS.mediaPosition),
        positionY: bound(background.positionY, VENUE_DESIGN_BOUNDS.mediaPosition),
        overlayOpacity: bound(
          background.overlayOpacity,
          VENUE_DESIGN_BOUNDS.overlayOpacity,
        ),
      };
    case "animation":
      return {
        ...background,
        speed: bound(background.speed, VENUE_DESIGN_BOUNDS.animationSpeed),
        intensity: bound(
          background.intensity,
          VENUE_DESIGN_BOUNDS.animationIntensity,
        ),
      };
    case "flat":
      return background;
  }
}

export function clampVenueDesign(
  design: VenueDesign | null | undefined,
): VenueDesign {
  const filled = clampDesign(design, VENUE_CAPABILITIES);
  return {
    ...filled,
    typography: {
      ...filled.typography,
      verticalSpacing: bound(
        filled.typography.verticalSpacing,
        VENUE_DESIGN_BOUNDS.verticalSpacing,
      ),
      lineHeight: bound(
        filled.typography.lineHeight,
        VENUE_DESIGN_BOUNDS.lineHeight,
      ),
    },
    background: clampVenueBackground(filled.background),
    effects: filled.effects
      ? {
          textShadow: clampVenueShadow(filled.effects.textShadow),
          logoShadow: clampVenueShadow(filled.effects.logoShadow),
        }
      : filled.effects,
  };
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
