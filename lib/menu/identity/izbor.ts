// ScanMe Menu V1 (K17) — the rules of a change to the menu appearance, shared
// by the Convex writer (convex/menuPresentation.ts) and the editor's memory
// implementation (lib/menu/studio/memorija-izgled.ts), so the izlog refuses
// exactly what the server refuses (master §7.1, §7.4, §15.2).
//
// A curated choice, never a free design tool: known palettes, the venue's
// brand palette only when it passes the automatic contrast check, known font
// pairs, three layouts with their Premium variants, density, emphasis, the
// menu-wide media display, the guest tools and the footer. The Premium gate
// applies to what a change CHOOSES, so an account that lost Premium can still
// change anything else, and re-sending a value it already has is no change
// (what guests get then: ./premium.ts).

import type { CasValue } from "../cas";
import { MENU_ERROR } from "../errors/core";
import { MENU_PLAN_ERROR } from "../errors/plan";
import { PRESENTATION_ERROR } from "../errors/presentation";
import { MENU_FILTER_CODES } from "../filters";
import type {
  MenuBranding,
  MenuDensity,
  MenuEmphasis,
  MenuLayout,
  MenuMediaMode,
  MenuPresentationValues,
} from "../presentation";
import { brendBoje, brendUloge, paletaIzBrenda } from "./brand-palette";
import type { KontrastGreska } from "./contrast";
import { parPoId } from "./font-pairs";
import { jeBrendPaleta, MENU_BREND_PALETA_TAMNA, paletaPoId } from "./palettes";
import type { MenuIzgledPlan } from "./premium";
import { varijantaRasporeda } from "./varijante";

export const MENU_IZGLED_POLJA = [
  "layout",
  "layoutVariant",
  "paletteId",
  "brandColors",
  "fontPairId",
  "density",
  "emphasis",
  "defaultMediaMode",
  "search",
  "filters",
  "currencyToggle",
  "branding",
] as const;
export type IzgledPolje = (typeof MENU_IZGLED_POLJA)[number];

/** One change of the appearance; `null` for `layoutVariant` / `brandColors` removes them. */
export type IzgledIzmena = {
  layout?: MenuLayout;
  layoutVariant?: string | null;
  paletteId?: string;
  brandColors?: string[] | null;
  fontPairId?: string;
  density?: MenuDensity;
  emphasis?: MenuEmphasis;
  defaultMediaMode?: MenuMediaMode;
  search?: boolean;
  filters?: string[];
  currencyToggle?: boolean;
  branding?: MenuBranding;
};

const LAYOUTI: readonly MenuLayout[] = ["flow", "categories", "compact"];
const GUSTINE: readonly MenuDensity[] = ["airy", "standard", "dense"];
const NAGLASCI: readonly MenuEmphasis[] = ["calm", "bold"];
const MEDIJI: readonly MenuMediaMode[] = ["image", "icon", "none"];
const BRENDING: readonly MenuBranding[] = ["standard", "reduced"];
const FILTERI: ReadonlySet<string> = new Set(MENU_FILTER_CODES);

/** A value as compare-and-set sees it: lists as JSON text, an absent variant or brand as null. */
function casVrednost(value: unknown): CasValue {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  return value as CasValue;
}

/** The current values of every field, for compare-and-set (lib/menu/cas.ts). */
export function izgledCas(values: MenuPresentationValues): Record<IzgledPolje, CasValue> {
  const out = {} as Record<IzgledPolje, CasValue>;
  for (const polje of MENU_IZGLED_POLJA) out[polje] = casVrednost(values[polje]);
  return out;
}

/** The fields a change names, in compare-and-set form. */
export function izmenaCas(izmena: IzgledIzmena): Partial<Record<IzgledPolje, CasValue>> {
  const out: Partial<Record<IzgledPolje, CasValue>> = {};
  for (const polje of MENU_IZGLED_POLJA) {
    if (izmena[polje] !== undefined) out[polje] = casVrednost(izmena[polje]);
  }
  return out;
}

export type IzgledProvera =
  | { ok: true; vrednosti: MenuPresentationValues; promena: boolean }
  | { ok: false; kod: string; greske: KontrastGreska[] };

function odbij(kod: string, greske: KontrastGreska[] = []): IzgledProvera {
  return { ok: false, kod, greske };
}

/**
 * Applies `izmena` to `pre` and checks the result. A layout change without a
 * variant drops a variant of the old layout. Returns the next values (and
 * whether anything changed) or the refusal code; the contrast pairs come
 * with `presentation/unreadable`.
 */
export function proveriIzmenuIzgleda(
  pre: MenuPresentationValues,
  izmena: IzgledIzmena,
  plan: MenuIzgledPlan,
): IzgledProvera {
  const polja = MENU_IZGLED_POLJA.filter((polje) => izmena[polje] !== undefined);
  const nepoznata = Object.keys(izmena).filter((kljuc) => !(MENU_IZGLED_POLJA as readonly string[]).includes(kljuc));
  if (polja.length === 0 || nepoznata.length > 0) return odbij(MENU_ERROR.invalidInput);

  const next: MenuPresentationValues = { ...pre, filters: [...pre.filters], brandColors: pre.brandColors ? [...pre.brandColors] : null };

  if (izmena.layout !== undefined) {
    if (!LAYOUTI.includes(izmena.layout)) return odbij(MENU_ERROR.invalidInput);
    next.layout = izmena.layout;
    if (izmena.layoutVariant === undefined && !varijantaRasporeda(next.layout, next.layoutVariant)) delete next.layoutVariant;
  }
  if (izmena.layoutVariant !== undefined) {
    if (izmena.layoutVariant === null) delete next.layoutVariant;
    else {
      const varijanta = varijantaRasporeda(next.layout, izmena.layoutVariant);
      if (!varijanta) return odbij(PRESENTATION_ERROR.variantMismatch);
      if (varijanta.premium && !plan.extraLayouts && varijanta.id !== pre.layoutVariant) return odbij(MENU_PLAN_ERROR.premiumRequired);
      next.layoutVariant = varijanta.id;
    }
  }

  if (izmena.brandColors !== undefined) {
    if (izmena.brandColors === null) next.brandColors = null;
    else {
      const uloge = brendUloge(izmena.brandColors);
      if (!uloge) return odbij(PRESENTATION_ERROR.invalidBrandColors);
      next.brandColors = brendBoje(uloge);
    }
  }
  if (izmena.paletteId !== undefined) {
    const id = izmena.paletteId;
    if (!jeBrendPaleta(id) && id !== "default" && paletaPoId(id).id !== id) return odbij(PRESENTATION_ERROR.unknownPalette);
    if (paletaPoId(id).id === id && paletaPoId(id).premium && !plan.extraLayouts && id !== pre.paletteId) {
      return odbij(MENU_PLAN_ERROR.premiumRequired);
    }
    next.paletteId = id;
  }
  // The brand palette is checked whenever it or its colours change (it was readable when set).
  if (jeBrendPaleta(next.paletteId) && (izmena.paletteId !== undefined || izmena.brandColors !== undefined)) {
    const uloge = brendUloge(next.brandColors);
    if (!uloge) return odbij(PRESENTATION_ERROR.invalidBrandColors);
    const ishod = paletaIzBrenda(uloge, next.paletteId === MENU_BREND_PALETA_TAMNA ? "tamna" : "svetla");
    if (!ishod.ok) return odbij(PRESENTATION_ERROR.unreadable, ishod.greske);
  }

  if (izmena.fontPairId !== undefined) {
    const par = parPoId(izmena.fontPairId);
    if (izmena.fontPairId !== "default" && par.id !== izmena.fontPairId) return odbij(PRESENTATION_ERROR.unknownFontPair);
    if (par.id === izmena.fontPairId && par.premium && !plan.extraLayouts && izmena.fontPairId !== pre.fontPairId) {
      return odbij(MENU_PLAN_ERROR.premiumRequired);
    }
    next.fontPairId = izmena.fontPairId;
  }
  if (izmena.density !== undefined) {
    if (!GUSTINE.includes(izmena.density)) return odbij(MENU_ERROR.invalidInput);
    next.density = izmena.density;
  }
  if (izmena.emphasis !== undefined) {
    if (!NAGLASCI.includes(izmena.emphasis)) return odbij(MENU_ERROR.invalidInput);
    next.emphasis = izmena.emphasis;
  }
  if (izmena.defaultMediaMode !== undefined) {
    if (!MEDIJI.includes(izmena.defaultMediaMode)) return odbij(MENU_ERROR.invalidInput);
    next.defaultMediaMode = izmena.defaultMediaMode;
  }
  if (izmena.search !== undefined) next.search = izmena.search;
  if (izmena.currencyToggle !== undefined) next.currencyToggle = izmena.currencyToggle;
  if (izmena.filters !== undefined) {
    // Known codes only; never a price range (master §7.2, §20).
    if (izmena.filters.length > MENU_FILTER_CODES.length || izmena.filters.some((kod) => !FILTERI.has(kod))) {
      return odbij(MENU_ERROR.invalidInput);
    }
    const izabrani = new Set(izmena.filters);
    next.filters = MENU_FILTER_CODES.filter((kod) => izabrani.has(kod));
  }
  if (izmena.branding !== undefined) {
    if (!BRENDING.includes(izmena.branding)) return odbij(MENU_ERROR.invalidInput);
    if (izmena.branding === "reduced" && !plan.reducedBranding && pre.branding !== "reduced") return odbij(MENU_PLAN_ERROR.premiumRequired);
    next.branding = izmena.branding;
  }

  const posle = izgledCas(next);
  const ranije = izgledCas(pre);
  const promena = MENU_IZGLED_POLJA.some((polje) => posle[polje] !== ranije[polje]);
  return { ok: true, vrednosti: next, promena };
}
