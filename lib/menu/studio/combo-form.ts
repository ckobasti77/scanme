// ScanMe Menu V1 (K16) — the combo's focused view in the editor (master §5.4).
//
// PURE. A combo is its own article made of existing articles, with a price
// the owner sets by hand. The sum of the components' regular prices is shown
// as a HINT only: it never sets, changes or suggests-by-itself the combo price.
// When a component's price changes, the combo gets "Proveri cenu"; the
// published combo price stays until the owner keeps it or types a new one.

import { checkComboComponents, comboComponentsTotal } from "../combo";
import { MENU_MAX_COMBO_COMPONENTS, MENU_MAX_COMBO_QUANTITY } from "../limits";

export type KomboSastojak = {
  artikalId: string;
  naziv: string;
  kolicina: number;
  /** The component's regular (base) price; null = it has none. */
  cena: number | null;
};

export type KomboZbir = {
  /** Sum of regular prices × quantities of the priced components. */
  zbir: number;
  /** False when a component has no regular price (the sum is then partial). */
  potpun: boolean;
  /** Combo price minus the sum (negative = the guest saves); null without a combo price or a complete sum. */
  razlika: number | null;
};

/** The informative sum next to the manual combo price. Never a price rule. */
export function komboZbir(sastojci: readonly KomboSastojak[], cenaKomboa: number | null): KomboZbir {
  const { totalRsd, complete } = comboComponentsTotal(
    sastojci.map((sastojak) => ({ quantity: sastojak.kolicina, unitPriceRsd: sastojak.cena })),
  );
  return {
    zbir: totalRsd,
    potpun: complete,
    razlika: cenaKomboa !== null && complete && sastojci.length > 0 ? cenaKomboa - totalRsd : null,
  };
}

export type SastavGreska = "prazno" | "previse" | "kolicina" | "ponavljanje";

/** The list the editor would save: 1..20 components, whole quantities 1..20, each article once. */
export function proveriSastav(sastojci: readonly { artikalId: string; kolicina: number }[]): SastavGreska | null {
  if (sastojci.length === 0) return "prazno";
  if (sastojci.length > MENU_MAX_COMBO_COMPONENTS) return "previse";
  if (sastojci.some((s) => !Number.isInteger(s.kolicina) || s.kolicina < 1 || s.kolicina > MENU_MAX_COMBO_QUANTITY)) {
    return "kolicina";
  }
  if (new Set(sastojci.map((s) => s.artikalId)).size !== sastojci.length) return "ponavljanje";
  // The same rule as the server (lib/menu/combo.ts): a list that passes here passes there.
  return checkComboComponents(sastojci.map((s) => ({ articleId: s.artikalId, quantity: s.kolicina }))) === null
    ? "kolicina"
    : null;
}

/** The quantity field: a whole number 1..20, else null. */
export function parseKolicinaSastojka(tekst: string): number | null {
  const cleaned = tekst.trim();
  if (!/^\d{1,2}$/.test(cleaned)) return null;
  const broj = Number(cleaned);
  return broj >= 1 && broj <= MENU_MAX_COMBO_QUANTITY ? broj : null;
}

/** Two component lists are the same (same articles, order and quantities): saving would be a no-op. */
export function istiSastav(
  a: readonly { artikalId: string; kolicina: number }[],
  b: readonly { artikalId: string; kolicina: number }[],
): boolean {
  return a.length === b.length && a.every((s, i) => s.artikalId === b[i].artikalId && s.kolicina === b[i].kolicina);
}
