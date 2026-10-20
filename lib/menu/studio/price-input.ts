// ScanMe Menu V1 — the price as the editor types it (K10, master §5.3).
// RSD in whole dinars is the only source of truth. The owner types the price
// the way it is printed ("1.490", "1 490", "1490 RSD"); the editor keeps the
// whole number and refuses anything that is not one, with a reason it can
// show next to the field. An empty field means "no price yet": allowed in the
// draft, but the article cannot be published without a price (master §5.5).

import { MENU_MAX_PRICE_RSD } from "../limits";

export type CenaGreska = "decimale" | "negativna" | "prevelika" | "neispravna";

export type CenaUnos = { ok: true; cena: number | null } | { ok: false; greska: CenaGreska };

/** Parses what the owner typed into a whole-dinar price (null = empty). */
export function parseCenaUnos(tekst: string): CenaUnos {
  let s = tekst.trim().replace(/\s*(rsd|din\.?|dinara)$/i, "").trim();
  if (s === "") return { ok: true, cena: null };
  if (s.startsWith("-")) return { ok: false, greska: "negativna" };
  // Spaces (incl. no-break and thin spaces) group thousands.
  s = s.replace(/[\s  ]/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Dots group thousands only in groups of three: "1.490", "12.000".
    s = s.replace(/\./g, "");
  } else if (/^(\d+|\d{1,3}(\.\d{3})+)[.,]\d+$/.test(s)) {
    // A comma, or a dot before fewer than three digits, is a decimal mark.
    return { ok: false, greska: "decimale" };
  }
  if (!/^\d+$/.test(s)) return { ok: false, greska: "neispravna" };
  const cena = Number(s);
  if (!Number.isSafeInteger(cena) || cena > MENU_MAX_PRICE_RSD) return { ok: false, greska: "prevelika" };
  return { ok: true, cena };
}

/** "1.490" — the number as the field shows it (no currency; the field says RSD). */
export function formatCenaPolje(cena: number | null): string {
  if (cena === null) return "";
  return String(cena).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
