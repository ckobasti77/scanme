// deriveRoleColors — the 5-role → N-role expansion, parameterized over a role
// list (RFC-001 §2.5, STEP 3 of TASK-07).
//
// This parallels `deriveColors` in lib/scanme-palette.ts (lines ~249–296),
// which performs the identical expansion but hardcoded to the Links 11-role
// set. That file is READ-ONLY for this task, so the logic is reproduced here
// by copy rather than shared. Unifying the two — having Links call
// `deriveRoleColors(LINKS_ROLES, palette)` — is deliberately deferred while the
// ScanMe Links freeze / golden harness holds; doing it now would edit the
// frozen palette path for zero user value.
//
// The colour-science and Material-colour helpers are RE-EXPORTED, not
// reimplemented — those modules are read-only and remain the one source of
// truth for the maths.

import {
  colorToOklch,
  contrastRatio,
  deriveReadableTextVariant,
  ensureContrast,
  mixColors,
  normalizeColorHex,
} from "../scanme-color-science";

export * from "../scanme-color-science";
export * from "../scanme-material-color";
// The scheme-type axis of generateMaterialRoles. Re-exported (not retyped) so
// Venue editor controls enumerate the engine's own option set.
export {
  PALETTE_SCHEME_TYPES,
  DEFAULT_PALETTE_SCHEME,
  type PaletteSchemeType,
} from "../scanme-palette";

// The Venue colour role set — the Links 11 minus the three button-specific
// roles (`button`/`buttonHover`/`buttonText`): Venue has no page-global button
// style, so blocks own their own surfaces. Matches `venueColorsValidator` in
// convex/lib/venueValidators.ts.
export const VENUE_ROLES = [
  "page",
  "surface",
  "title",
  "body",
  "accent",
  "border",
  "focus",
  "icon",
] as const;

export type VenueRole = (typeof VENUE_ROLES)[number];

// The full canonical role map a 5-colour palette expands into — identical maths
// to `deriveColors`. `deriveRoleColors` projects a requested role list out of
// this, so the same expansion serves any product's role subset.
function expandPalette(palette: string[]): Record<string, string> {
  if (palette.length < 5) {
    throw new Error(
      `deriveRoleColors: expected a 5-colour palette, got ${palette.length}`,
    );
  }
  const [page, surface, accent, title, button] = palette.map((color) =>
    normalizeColorHex(color),
  );
  const bgHue = colorToOklch(page).h;
  const safeTitle =
    contrastRatio(title, page) >= 4.5 && contrastRatio(title, surface) >= 4.5
      ? title
      : deriveReadableTextVariant([page, surface], bgHue, 4.5);
  const safeButton = ensureContrast(button, [page, surface], 3);
  const body = ensureContrast(
    mixColors(safeTitle, page, 0.16),
    [page, surface],
    4.5,
  );
  const buttonText = deriveReadableTextVariant(safeButton, bgHue, 4.5);
  const buttonHover = mixColors(safeButton, buttonText, 0.1);
  const border = mixColors(safeTitle, surface, 0.8);
  const focus = ensureContrast(accent, page, 3);
  const icon =
    contrastRatio(accent, surface) >= 3
      ? accent
      : ensureContrast(mixColors(accent, safeTitle, 0.22), surface, 3);
  return {
    page,
    surface,
    title: safeTitle,
    body,
    accent,
    border,
    focus,
    button: safeButton,
    buttonHover,
    buttonText,
    icon,
  };
}

/**
 * Expand a 5-colour palette (`[background, surface, accent, text, button]`, the
 * order `generateMaterialRoles` returns) into exactly the requested roles.
 * Parameterized over `roleList` so the same expansion serves Venue, Links, or
 * any future product's role set.
 */
export function deriveRoleColors<Role extends string>(
  roleList: readonly Role[],
  palette: string[],
): Record<Role, string> {
  const full = expandPalette(palette);
  const out = {} as Record<Role, string>;
  for (const role of roleList) {
    const value = full[role];
    if (value === undefined) {
      throw new Error(`deriveRoleColors: unknown role "${role}"`);
    }
    out[role] = value;
  }
  return out;
}

/** Convenience for the Venue role set. */
export function deriveVenueRoleColors(
  palette: string[],
): Record<VenueRole, string> {
  return deriveRoleColors(VENUE_ROLES, palette);
}
