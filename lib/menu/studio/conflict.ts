// ScanMe Menu V1 — a conflict of the same value (K18; master §6.1: "konflikt
// iste vrednosti ne sme neprimetno pregaziti noviju izmenu").
//
// PURE. The save queue (./autosave-queue.ts) stops a key whose
// compare-and-set failed and keeps both values: the one saved meanwhile and
// the one this person tried. The field then shows both and offers exactly two
// ways out — keep mine (sent again over the saved value) or take the saved
// one — and says who else has the article open, when someone does. When both
// people wrote the same value there is nothing to choose.

import type { CasValue } from "../cas";
import { menuStudioObjavljivanjeSr } from "../../i18n/sr/menu-studio-objava";
import { recenicaOsoba } from "./presence-view";

const t = menuStudioObjavljivanjeSr.konflikt;

export type OpisKonflikta = {
  /** The value saved meanwhile, phrased for this field. */
  sacuvano: string;
  /** The value this person tried. */
  moja: string;
  /** Both wrote the same value: nothing to choose. */
  ista: boolean;
  /** "Ovaj artikal sada uređuje i Marko." or null when nobody else has it open. */
  drugi: string | null;
};

/** Values compare as their JSON (list and object values of the queue are JSON text already). */
export function isteVrednosti(a: CasValue, b: CasValue): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function opisKonflikta(
  stanje: { sacuvano: CasValue; pokusano: CasValue },
  prikaz: (vrednost: CasValue) => string,
  drugi: readonly string[] = [],
): OpisKonflikta {
  return {
    sacuvano: prikaz(stanje.sacuvano),
    moja: prikaz(stanje.pokusano),
    ista: isteVrednosti(stanje.sacuvano, stanje.pokusano),
    drugi: drugi.length > 0 ? recenicaOsoba(t.drugi, drugi) : null,
  };
}
