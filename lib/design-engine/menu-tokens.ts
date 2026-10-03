// The Menu token compiler (RFC-003 §1.b, §2.4, TASK-48): a **fork** of
// `venue-tokens.ts`, not a shared dependency on it. Compiles a page-level Menu
// design document into `--menu-*` CSS custom properties, structurally
// parallel to Venue's `compileVenueTokens` and, before it, the frozen Links
// `designStyle()`. Deliberately duplicated rather than extracted: Menu and
// Venue are two products that will diverge, and a shared dependency between
// them costs more than the duplication does.
//
// Pure and unit-testable; no render, no route, no editor here (those are
// later Menu tasks). The TS `MenuDesign` shape is expected to mirror a future
// `menuDesignValidator` in convex, exactly as `VenueDesign` mirrors
// `venueDesignValidator` today.

import {
  colorToOklch,
  deriveReadableTextVariant,
  ensureContrast,
  mixColors,
} from "../scanme-color-science";
import type { ScanMeLinksBackgroundV2 } from "../scanme-links-design";
import { backgroundPresentation } from "./background";
import { clampDesign, type Capabilities } from "./capabilities";
import { deriveRoleColors } from "./palette";
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

// The Menu colour role set — identical shape to `VENUE_ROLES` (RFC-003 §1.b
// treats the role palette as product-parameterized, not Venue-specific); kept
// as its own list here rather than imported from Venue so the two products'
// role sets can diverge without a shared edit.
export const MENU_ROLES = [
  "page",
  "surface",
  "title",
  "body",
  "accent",
  "border",
  "focus",
  "icon",
] as const;

export type MenuRole = (typeof MENU_ROLES)[number];

/** Convenience for the Menu role set, built on the product-agnostic expansion. */
export function deriveMenuRoleColors(palette: string[]): Record<MenuRole, string> {
  return deriveRoleColors(MENU_ROLES, palette);
}

export type MenuColors = {
  page: string;
  surface: string;
  title: string;
  body: string;
  accent: string;
  border: string;
  focus: string;
  icon: string;
};

export type MenuTypography = {
  fontKey: DesignFontKey;
  headingWeight: DesignWeight;
  bodyWeight: DesignWeight;
  alignment: "left" | "center" | "right";
  scale: DesignScale;
  lineHeight: number;
  verticalSpacing: number;
};

export type MenuEffects = {
  textShadow: DesignShadow;
  logoShadow: DesignShadow;
};

export type MenuDesign = {
  version: 1;
  colors: MenuColors;
  typography: MenuTypography;
  background: ScanMeLinksBackgroundV2;
  effects?: MenuEffects;
};

// A known-good default design — a flat off-white page in the ScanMe neutrals,
// identical values to `DEFAULT_VENUE_DESIGN` (no Menu-specific defaults were
// specified by RFC-003; this is the same known-safe starting point).
export const DEFAULT_MENU_DESIGN: MenuDesign = {
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

// Menu's preset/capability catalog, built on the generic `Capabilities`,
// mirroring `VENUE_CAPABILITIES`. A single `default` entry: RFC-003 does not
// specify Menu plan-tier preset allow-lists, so a multi-preset catalog would
// be speculative (§2 "Simplicity First").
export const MENU_CAPABILITIES: Capabilities<MenuDesign> = {
  defaults: DEFAULT_MENU_DESIGN,
};

export const MENU_PRESET_CAPABILITIES = {
  default: MENU_CAPABILITIES,
} as const;

// Inclusive numeric ranges for the page-level design document, identical to
// `VENUE_DESIGN_BOUNDS` — same background categories, same a11y floor on
// `overlayOpacity` (RFC-003 §2.4 carries the a11y-floor logic over verbatim).
export const MENU_DESIGN_BOUNDS = {
  verticalSpacing: [8, 40],
  lineHeight: [1.2, 2],
  gradientAngle: [0, 360],
  gradientCenter: [0, 100],
  patternScale: [4, 96],
  patternOpacity: [0, 1],
  textureIntensity: [0, 1],
  mediaZoom: [1, 3],
  mediaPosition: [0, 100],
  overlayOpacity: [0.25, 1],
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

function clampMenuShadow(shadow: DesignShadow): DesignShadow {
  return {
    ...shadow,
    x: bound(shadow.x, MENU_DESIGN_BOUNDS.shadowOffset),
    y: bound(shadow.y, MENU_DESIGN_BOUNDS.shadowOffset),
    blur: bound(shadow.blur, MENU_DESIGN_BOUNDS.shadowBlur),
    opacity: bound(shadow.opacity, MENU_DESIGN_BOUNDS.shadowOpacity),
  };
}

function clampMenuBackground(
  background: ScanMeLinksBackgroundV2,
): ScanMeLinksBackgroundV2 {
  switch (background.category) {
    case "gradient":
      return {
        ...background,
        angle: bound(background.angle, MENU_DESIGN_BOUNDS.gradientAngle),
        centerX: bound(background.centerX, MENU_DESIGN_BOUNDS.gradientCenter),
        centerY: bound(background.centerY, MENU_DESIGN_BOUNDS.gradientCenter),
      };
    case "pattern":
      return {
        ...background,
        scale: bound(background.scale, MENU_DESIGN_BOUNDS.patternScale),
        opacity: bound(background.opacity, MENU_DESIGN_BOUNDS.patternOpacity),
      };
    case "texture":
      return {
        ...background,
        intensity: bound(
          background.intensity,
          MENU_DESIGN_BOUNDS.textureIntensity,
        ),
      };
    case "media":
      return {
        ...background,
        zoom: bound(background.zoom, MENU_DESIGN_BOUNDS.mediaZoom),
        positionX: bound(background.positionX, MENU_DESIGN_BOUNDS.mediaPosition),
        positionY: bound(background.positionY, MENU_DESIGN_BOUNDS.mediaPosition),
        overlayOpacity: bound(
          background.overlayOpacity,
          MENU_DESIGN_BOUNDS.overlayOpacity,
        ),
      };
    case "animation":
      return {
        ...background,
        speed: bound(background.speed, MENU_DESIGN_BOUNDS.animationSpeed),
        intensity: bound(
          background.intensity,
          MENU_DESIGN_BOUNDS.animationIntensity,
        ),
      };
    case "flat":
      return background;
  }
}

export function clampMenuDesign(
  design: MenuDesign | null | undefined,
): MenuDesign {
  const filled = clampDesign(design, MENU_CAPABILITIES);
  return {
    ...filled,
    typography: {
      ...filled.typography,
      verticalSpacing: bound(
        filled.typography.verticalSpacing,
        MENU_DESIGN_BOUNDS.verticalSpacing,
      ),
      lineHeight: bound(
        filled.typography.lineHeight,
        MENU_DESIGN_BOUNDS.lineHeight,
      ),
    },
    background: clampMenuBackground(filled.background),
    effects: filled.effects
      ? {
          textShadow: clampMenuShadow(filled.effects.textShadow),
          logoShadow: clampMenuShadow(filled.effects.logoShadow),
        }
      : filled.effects,
  };
}

const compile = createTokenCompiler("menu");

/**
 * Compile a page-level Menu design into `--menu-*` custom properties.
 *
 * Note on backgrounds: the lifted, frozen `backgroundPresentation` helper
 * emits a Links-namespaced page custom property in its `media` branch (a
 * shared-helper detail of the Links render path). The Menu render (a later
 * task) supplies or remaps that variable for media backgrounds; every other
 * category — flat, gradient, pattern, texture, animation — produces
 * `--menu-*`-only output, and the default design is flat, so this compiler's
 * own output stays clean.
 *
 * Contrast floors (RFC-003 §2.4): `accent-text` and `on-accent` are the
 * accessible variants the accent icon tiles read — an accent-tinted tile
 * (§2.4 pločica) must still contrast against its glyph and against the page.
 */
export function compileMenuTokens(design: MenuDesign): Record<string, string> {
  const { colors, typography, background, effects } = design;
  const bg = backgroundPresentation(background);
  // Derived, floored companions, identical discipline to Venue's a11y floors.
  // The stored roles have no contrast guarantee where the template uses them
  // as TEXT: `accent` is the verbatim logo colour, `page` sits on accent in
  // primary actions (and on the accent icon tiles, §2.4), muting `body` via
  // color-mix discards the palette's own 4.5 floor, and `border` is a
  // deliberately faint hairline that cannot double as an input boundary.
  const pageHue = colorToOklch(colors.page).h;
  const accentText = ensureContrast(
    colors.accent,
    [colors.page, colors.surface],
    4.5,
  );
  const onAccent = deriveReadableTextVariant(colors.accent, pageHue, 4.5);
  const bodyMuted = ensureContrast(
    mixColors(colors.body, colors.page, 0.24),
    [colors.page, colors.surface],
    4.5,
  );
  const inputBorder = ensureContrast(colors.border, colors.surface, 3);
  const values: TokenValues = {
    page: colors.page,
    surface: colors.surface,
    title: colors.title,
    body: colors.body,
    accent: colors.accent,
    "accent-text": accentText,
    "on-accent": onAccent,
    "body-muted": bodyMuted,
    "input-border": inputBorder,
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
