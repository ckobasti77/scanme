// ScanMe Menu V1 (K13, plan K12 §5) — the appearance of the public menu from
// the published presentation: palette + font pair + density + emphasis →
// `--menu-*` custom properties and a few data attributes. Runs on the SERVER
// (it pulls culori through compileMenuTokens); the page hands the finished
// tokens to the one client boundary, so the colour library never ships to
// the guest's phone (plan K12-4). The editor preview calls it in the editor
// bundle, which carries the colour library anyway.
//
// compileMenuTokens is reused unchanged (shared with the legacy renderer);
// this module only adds the heading face, density, the colour scheme and (K14)
// the allergen warning colour.

import {
  DEFAULT_MENU_DESIGN,
  compileMenuTokens,
  type MenuColors,
} from "../../design-engine/menu-tokens";
import { FONT_STACKS } from "../../design-engine/typography";
import { ensureContrast } from "../../scanme-color-science";
import type {
  MenuBranding,
  MenuDensity,
  MenuEmphasis,
  MenuLayout,
  MenuPresentationValues,
} from "../presentation";
import { parPoId } from "./font-pairs";
import { paletaPoId, type JavnaPaletaTon } from "./palettes";

export type JavniIzgled = {
  /** `--menu-*` custom properties for the style of the menu root. */
  tokeni: Record<string, string>;
  ton: JavnaPaletaTon;
  layout: MenuLayout;
  gustina: MenuDensity;
  naglasak: MenuEmphasis;
  brending: MenuBranding;
  paletaId: string;
  parId: string;
  /** The resolved colours (the browser theme colour, tests). */
  boje: MenuColors;
};

type Gustina = { redRazmak: number; sekcijaRazmak: number; teloPx: number; visinaReda: number };

/** Row gap, section gap, body size and line height per density (plan K12 §5.3). Body never below 16 px. */
export const MENU_GUSTINE: Record<MenuDensity, Gustina> = {
  airy: { redRazmak: 20, sekcijaRazmak: 56, teloPx: 17, visinaReda: 1.6 },
  standard: { redRazmak: 14, sekcijaRazmak: 40, teloPx: 16, visinaReda: 1.5 },
  dense: { redRazmak: 8, sekcijaRazmak: 28, teloPx: 16, visinaReda: 1.4 },
};

/**
 * The appearance of a published presentation. `boje` overrides the palette
 * colours (K17's brand palette, the editor izlog's dark design); unknown
 * palette and pair ids resolve to the defaults, so an old version never fails.
 */
export function javniIzgled(
  presentation: MenuPresentationValues,
  boje: MenuColors | null = null,
): JavniIzgled {
  const paleta = paletaPoId(presentation.paletteId);
  const par = parPoId(presentation.fontPairId);
  const gustina = MENU_GUSTINE[presentation.density] ?? MENU_GUSTINE.standard;
  const colors = boje ?? paleta.boje;
  const ton: JavnaPaletaTon = boje ? (isDark(boje.page) ? "tamna" : "svetla") : paleta.ton;

  const tokeni: Record<string, string> = {
    ...compileMenuTokens({
      ...DEFAULT_MENU_DESIGN,
      colors,
      typography: {
        fontKey: par.tekst,
        headingWeight: par.tezinaNaslova,
        bodyWeight: 400,
        alignment: "left",
        scale: "medium",
        lineHeight: gustina.visinaReda,
        verticalSpacing: gustina.redRazmak,
      },
      background: { category: "flat", color: colors.page },
    }),
    "--menu-heading-family": FONT_STACKS[par.naslov],
    "--menu-heading-case": par.velikaSlova ? "uppercase" : "none",
    "--menu-heading-tracking": par.velikaSlova ? "0.08em" : "-0.01em",
    "--menu-section-gap": `${gustina.sekcijaRazmak}px`,
    "--menu-body-size": `${gustina.teloPx / 16}rem`,
    "--menu-color-scheme": ton === "tamna" ? "dark" : "light",
    // K14: the allergen warning (master §7.3). A red that reads on the page and on cards (4.5:1);
    // it is never the only signal (an icon and the words "Sadrži" / "Može sadržati tragove" go with it).
    "--menu-warning": ensureContrast(ton === "tamna" ? "#FF8E80" : "#B42318", [colors.page, colors.surface], 4.5),
  };

  return {
    tokeni,
    ton,
    layout: presentation.layout,
    gustina: presentation.density,
    naglasak: presentation.emphasis,
    brending: presentation.branding,
    paletaId: boje ? "brend" : paleta.id,
    parId: par.id,
    boje: colors,
  };
}

/** Relative luminance below the middle grey: a dark page. */
function isDark(hex: string): boolean {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4) < 0.18;
}
