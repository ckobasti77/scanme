// ScanMe Menu V1 — the group price change of `Izaberi više` (K11; master
// §5.3, §13.4, docs/meni/planovi/K09.md §4.5).
//
// RSD in whole dinars is the only source of truth. A change is a percentage
// up or down, an amount added or taken away, or one price for all; every new
// price is rounded half up to a whole dinar (integer math, the same rule as
// the Room service markup). Before anything is written the owner sees, for
// every article, the old price, the new one and the difference:
//   - an article with variants is skipped: its variants carry their own
//     prices, and changing only its base price would be half a change
//     (K09 §8 ⚑7, conservative);
//   - an article without a price is skipped for a percentage or an amount
//     (there is nothing to change) and gets the price for "ista cena";
//   - a new price equal to the old one is skipped as "no change";
//   - a result below 0 or above 1.000.000 RSD is invalid and blocks the
//     whole change, listing those rows — never clamped, never silently dropped.
// Pure: no React, no Convex.

import { MENU_MAX_PRICE_RSD } from "./limits";
import { isValidRsd } from "./rsd";

export type SmerPromene = "povecaj" | "smanji";

export type PromenaCene =
  | { nacin: "procenat"; smer: SmerPromene; /** Percent, 0.01 steps. */ vrednost: number }
  | { nacin: "iznos"; smer: SmerPromene; /** Whole dinars. */ vrednost: number }
  | { nacin: "ista"; /** Whole dinars. */ vrednost: number };

/** Percent bounds of one change (inclusive). */
export const PROCENAT_MIN = 0.01;
export const PROCENAT_MAX = 300;

export type GreskaPromene = "procenat_opseg" | "procenat_smanjenje" | "procenat_decimale" | "iznos_ceo" | "iznos_opseg" | "cena_neispravna";

/** Why the change itself cannot be applied (null = it can). */
export function proveriPromenu(promena: PromenaCene): GreskaPromene | null {
  const { vrednost } = promena;
  if (!Number.isFinite(vrednost)) return promena.nacin === "procenat" ? "procenat_opseg" : promena.nacin === "iznos" ? "iznos_opseg" : "cena_neispravna";
  if (promena.nacin === "procenat") {
    if (vrednost < PROCENAT_MIN || vrednost > PROCENAT_MAX) return "procenat_opseg";
    // More than 100 % down is always a mistake: every price would go below zero.
    if (promena.smer === "smanji" && vrednost > 100) return "procenat_smanjenje";
    if (Math.abs(Math.round(vrednost * 100) - vrednost * 100) > 1e-6) return "procenat_decimale";
    return null;
  }
  if (promena.nacin === "iznos") {
    if (!Number.isInteger(vrednost)) return "iznos_ceo";
    if (vrednost < 1 || vrednost > MENU_MAX_PRICE_RSD) return "iznos_opseg";
    return null;
  }
  return isValidRsd(vrednost) ? null : "cena_neispravna";
}

/** Round half up of a / b for integers, b > 0 (floor((2a + b) / 2b) also for negative a). */
function podeliZaokruzi(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/**
 * The new price of one article (may be negative or above the maximum; the
 * plan marks such rows invalid). `stara` is a whole-dinar price.
 */
export function novaCena(stara: number, promena: PromenaCene): number {
  if (promena.nacin === "ista") return promena.vrednost;
  if (promena.nacin === "iznos") return promena.smer === "povecaj" ? stara + promena.vrednost : stara - promena.vrednost;
  const bps = Math.round(promena.vrednost * 100);
  const faktor = promena.smer === "povecaj" ? 10_000 + bps : 10_000 - bps;
  return podeliZaokruzi(stara * faktor, 10_000);
}

export type CenaArtikla = { artikalId: string; naziv: string; cena: number | null; varijante: boolean };

export type RazlogPreskakanja = "varijante" | "bez_cene" | "bez_promene";
export type RazlogNevazece = "negativna" | "prevelika";

export type PlanCena = {
  /** The articles whose price changes, in the order given. */
  promene: { artikalId: string; naziv: string; stara: number | null; nova: number; razlika: number | null }[];
  preskoceni: { artikalId: string; naziv: string; stara: number | null; razlog: RazlogPreskakanja }[];
  nevazeci: { artikalId: string; naziv: string; stara: number; nova: number; razlog: RazlogNevazece }[];
  /** True only when something changes and nothing is invalid. */
  mozePotvrdu: boolean;
};

/** The before → after preview for every article, and whether it may be applied. */
export function planCena(artikli: readonly CenaArtikla[], promena: PromenaCene): PlanCena {
  const plan: PlanCena = { promene: [], preskoceni: [], nevazeci: [], mozePotvrdu: false };
  if (proveriPromenu(promena) !== null) return plan;
  const videni = new Set<string>();
  for (const artikal of artikli) {
    if (videni.has(artikal.artikalId)) continue;
    videni.add(artikal.artikalId);
    const { artikalId, naziv, cena } = artikal;
    if (artikal.varijante) {
      plan.preskoceni.push({ artikalId, naziv, stara: cena, razlog: "varijante" });
      continue;
    }
    if (cena === null) {
      if (promena.nacin === "ista") {
        plan.promene.push({ artikalId, naziv, stara: null, nova: promena.vrednost, razlika: null });
      } else {
        plan.preskoceni.push({ artikalId, naziv, stara: null, razlog: "bez_cene" });
      }
      continue;
    }
    const nova = novaCena(cena, promena);
    if (nova < 0 || nova > MENU_MAX_PRICE_RSD) {
      plan.nevazeci.push({ artikalId, naziv, stara: cena, nova, razlog: nova < 0 ? "negativna" : "prevelika" });
      continue;
    }
    if (nova === cena) {
      plan.preskoceni.push({ artikalId, naziv, stara: cena, razlog: "bez_promene" });
      continue;
    }
    plan.promene.push({ artikalId, naziv, stara: cena, nova, razlika: nova - cena });
  }
  plan.mozePotvrdu = plan.promene.length > 0 && plan.nevazeci.length === 0;
  return plan;
}

/** What the server receives: every changed price with the price the owner saw (compare-and-set). */
export function izmeneCena(plan: PlanCena): { artikalId: string; ocekivana: number | null; nova: number }[] {
  return plan.promene.map((red) => ({ artikalId: red.artikalId, ocekivana: red.stara, nova: red.nova }));
}

/**
 * The value the owner typed for a percentage ("10", "10,5", "7.25"), or null
 * when it is not a number with at most two decimals.
 */
export function parseProcenat(tekst: string): number | null {
  const s = tekst.trim().replace(/\s*%$/, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}
