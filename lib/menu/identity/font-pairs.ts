// ScanMe Menu V1 (K13, plan K12 §5.3) — curated font pairs of the public menu:
// a heading face and a text face, only from the Fontsource packages already
// imported in app/layout.tsx (no new package, no network font). `osnovni` is
// the "default" pair: DM Sans, the face of the legacy menu.

import type { DesignFontKey } from "../../design-engine/typography";

export type ParFontova = {
  id: string;
  naslov: DesignFontKey;
  tekst: DesignFontKey;
  tezinaNaslova: 500 | 600 | 700;
  /** Headings in capitals with wide tracking (the calm prestige look). */
  velikaSlova: boolean;
};

export const MENU_PAROVI_FONTOVA: readonly ParFontova[] = [
  { id: "osnovni", naslov: "dm-sans", tekst: "dm-sans", tezinaNaslova: 600, velikaSlova: false },
  { id: "kafe", naslov: "space-grotesk", tekst: "nunito-sans", tezinaNaslova: 600, velikaSlova: false },
  { id: "bistro", naslov: "archivo", tekst: "source-sans-3", tezinaNaslova: 700, velikaSlova: false },
  { id: "klasika", naslov: "playfair-display", tekst: "source-sans-3", tezinaNaslova: 600, velikaSlova: false },
  { id: "elegancija", naslov: "cormorant-garamond", tekst: "lora", tezinaNaslova: 500, velikaSlova: false },
  { id: "knjiga", naslov: "libre-baskerville", tekst: "source-sans-3", tezinaNaslova: 700, velikaSlova: false },
  { id: "savremeno", naslov: "manrope", tekst: "inter", tezinaNaslova: 700, velikaSlova: false },
];

export const MENU_PODRAZUMEVANI_PAR = "osnovni";

const PO_ID = new Map(MENU_PAROVI_FONTOVA.map((par) => [par.id, par]));

/** The pair of a published `fontPairId`; "default" and unknown ids give `osnovni`. Never throws. */
export function parPoId(id: string | null | undefined): ParFontova {
  return PO_ID.get(id ?? "") ?? (PO_ID.get(MENU_PODRAZUMEVANI_PAR) as ParFontova);
}

export function jePoznatPar(id: string): boolean {
  return PO_ID.has(id);
}
