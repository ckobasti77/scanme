// ScanMe Menu V1 (K13, plan K12 §5.3) — curated font pairs of the public menu:
// a heading face and a text face, only from the Fontsource packages already
// imported in app/layout.tsx (no new package, no network font). `osnovni` is
// the "default" pair: DM Sans, the face of the legacy menu. K17: the last three
// pairs are Premium design variants (master §2.2, §15.2).

import type { DesignFontKey } from "../../design-engine/typography";

export type ParFontova = {
  id: string;
  naslov: DesignFontKey;
  tekst: DesignFontKey;
  tezinaNaslova: 500 | 600 | 700;
  /** Headings in capitals with wide tracking (the calm prestige look). */
  velikaSlova: boolean;
  /** K17: a Premium design variant (the account's `extraLayouts` capability). */
  premium: boolean;
};

export const MENU_PAROVI_FONTOVA: readonly ParFontova[] = [
  { id: "osnovni", naslov: "dm-sans", tekst: "dm-sans", tezinaNaslova: 600, velikaSlova: false, premium: false },
  { id: "kafe", naslov: "space-grotesk", tekst: "nunito-sans", tezinaNaslova: 600, velikaSlova: false, premium: false },
  { id: "bistro", naslov: "archivo", tekst: "source-sans-3", tezinaNaslova: 700, velikaSlova: false, premium: false },
  { id: "klasika", naslov: "playfair-display", tekst: "source-sans-3", tezinaNaslova: 600, velikaSlova: false, premium: false },
  { id: "elegancija", naslov: "cormorant-garamond", tekst: "lora", tezinaNaslova: 500, velikaSlova: false, premium: false },
  { id: "knjiga", naslov: "libre-baskerville", tekst: "source-sans-3", tezinaNaslova: 700, velikaSlova: false, premium: false },
  { id: "savremeno", naslov: "manrope", tekst: "inter", tezinaNaslova: 700, velikaSlova: false, premium: false },
  // K17 — Premium: an editorial serif pair, a modern classic and a lively grotesque.
  { id: "galerija", naslov: "playfair-display", tekst: "lora", tezinaNaslova: 500, velikaSlova: false, premium: true },
  { id: "atelje", naslov: "cormorant-garamond", tekst: "manrope", tezinaNaslova: 600, velikaSlova: false, premium: true },
  { id: "grotesk", naslov: "space-grotesk", tekst: "inter", tezinaNaslova: 600, velikaSlova: false, premium: true },
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
