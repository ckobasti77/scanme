// ScanMe Menu V1 (K17) — the venue's own palette from its brand colours
// (master §15.2: "palete i uloge boja namenjene brendu lokala"; plan K12 §5.5).
//
// Up to three brand colours, each with a fixed role, stored in
// `brandColors` by position:
//   [0] glavna boja (the accent: prices, links, the active section) — required;
//   [1] pozadina (the page) — "" = derived;
//   [2] tekst (headings and text) — "" = derived.
// What the venue leaves empty is derived with the design engine's colour
// science (lib/scanme-color-science.ts, OKLCH): a calm page tinted with the
// brand's own hue, readable text of the same hue. What the venue sets is used
// as is — never silently "fixed" — and the automatic contrast check
// (./contrast.ts) refuses an unreadable combination instead.
//
// Plan K12 §5.5 proposed generateMaterialRoles → deriveMenuRoleColors. Measured
// in K17 it puts the page on the COMPLEMENTARY hue (a red brand gets a cyan
// page) and fails contrast for dark and yellow brands, so the page is derived
// here on the brand hue instead (ODLUKA K17).

import type { MenuColors } from "../../design-engine/menu-tokens";
import {
  colorToOklch,
  contrastRatio,
  deriveReadableTextVariant,
  ensureContrast,
  mixColors,
  oklchToHex,
} from "../../scanme-color-science";
import { proveriKontrast, type KontrastGreska } from "./contrast";
import type { JavnaPaletaTon } from "./palettes";

export const MENU_BREND_MAX_BOJA = 3;

const HEX = /^#[0-9A-F]{6}$/;

export type BrendUloge = {
  /** The main brand colour (accent). */
  akcenat: string;
  /** The page colour; null = derived from the accent's hue. */
  pozadina: string | null;
  /** Headings and text; null = derived (readable). */
  tekst: string | null;
};

function boja(value: string): string | null {
  const hex = value.trim().toUpperCase();
  return HEX.test(hex) ? hex : null;
}

/**
 * The roles of stored `brandColors`; null when they are absent or invalid
 * (not 1–3 entries, a colour that is not #RRGGBB, an empty main colour).
 */
export function brendUloge(brandColors: readonly string[] | null | undefined): BrendUloge | null {
  if (!brandColors || brandColors.length < 1 || brandColors.length > MENU_BREND_MAX_BOJA) return null;
  const [prva, druga = "", treca = ""] = brandColors;
  const akcenat = boja(prva);
  if (!akcenat) return null;
  const pozadina = druga.trim() === "" ? null : boja(druga);
  const tekst = treca.trim() === "" ? null : boja(treca);
  if ((druga.trim() !== "" && !pozadina) || (treca.trim() !== "" && !tekst)) return null;
  return { akcenat, pozadina, tekst };
}

/** The stored form of roles: `[akcenat, pozadina | "", tekst | ""]`, trailing empties dropped. */
export function brendBoje(uloge: BrendUloge): string[] {
  const boje = [uloge.akcenat, uloge.pozadina ?? "", uloge.tekst ?? ""];
  while (boje.length > 1 && boje[boje.length - 1] === "") boje.pop();
  return boje;
}

export type BrendIshod = { ok: boolean; boje: MenuColors; greske: KontrastGreska[] };

/** OKLCH lightness of the derived page and card per tone; a whisper of the brand hue. */
const STRANA = {
  svetla: { page: 0.972, surface: 0.995, chroma: 0.012 },
  tamna: { page: 0.18, surface: 0.225, chroma: 0.014 },
} as const;

/**
 * The eight menu roles from the venue's brand roles, then the automatic
 * contrast check. `ton` decides the derived page (light or dark) when the
 * venue did not set one. Deterministic: the published version stores only
 * the roles, and the renderer derives the same colours again.
 */
export function paletaIzBrenda(uloge: BrendUloge, ton: JavnaPaletaTon): BrendIshod {
  const akcenat = uloge.akcenat;
  const hue = colorToOklch(akcenat).h ?? 0;
  const strana = STRANA[ton];

  const page =
    uloge.pozadina ?? oklchToHex({ mode: "oklch", l: strana.page, c: strana.chroma, h: hue });
  const tamnaStrana = colorToOklch(page).l < 0.5;
  // Cards sit a step lighter than the page on both tones.
  const surface = uloge.pozadina
    ? mixColors(page, "#FFFFFF", tamnaStrana ? 0.06 : 0.55)
    : oklchToHex({ mode: "oklch", l: strana.surface, c: strana.chroma * 0.5, h: hue });

  const title = uloge.tekst ?? deriveReadableTextVariant([page, surface], hue, 4.5);
  // A text colour the venue set is honoured as is (and checked); a derived one is made readable.
  const body = uloge.tekst
    ? mixColors(title, page, 0.16)
    : ensureContrast(mixColors(title, page, 0.16), [page, surface], 4.5);
  const border = mixColors(title, surface, 0.82);
  const focus = ensureContrast(akcenat, [page, surface], 3);
  const icon = contrastRatio(akcenat, surface) >= 3 ? akcenat : ensureContrast(akcenat, surface, 3);

  const boje: MenuColors = { page, surface, title, body, accent: akcenat, border, focus, icon };
  const provera = proveriKontrast(boje);
  return { ok: provera.ok, boje, greske: provera.greske };
}
