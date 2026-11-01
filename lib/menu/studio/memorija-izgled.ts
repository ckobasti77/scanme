// ScanMe Menu V1 (K17) — Izgled on the in-memory menu of the izlog: the same
// compare-and-set and the same rules as convex/menuPresentation.ts update
// (lib/menu/identity/izbor.ts), so the izlog refuses what the server refuses
// (an unreadable brand palette, a Premium variant on Standard) and a change
// lands in the draft — the published snapshot stays as it was until Objavi.

import { checkCas, type CasValue } from "../cas";
import { MENU_ERROR } from "../errors/core";
import { izgledCas, izmenaCas, proveriIzmenuIzgleda, type IzgledIzmena, type IzgledPolje } from "../identity/izbor";
import type { MenuIzgledPlan } from "../identity/premium";
import { MENU_DEFAULT_PRESENTATION, type MenuPresentationValues } from "../presentation";
import { greska, konflikt, nacrt, type MemorijaKorak, type MemorijaStanje } from "./memorija";
import { izgledKaoTekst, izmenaIzCas } from "./izgled-red";
import type { StudioIzgled } from "./model";

const OK = { ok: true as const, vrednost: null };

export function izgledPlan(stanje: MemorijaStanje): MenuIzgledPlan {
  return { extraLayouts: stanje.premium, reducedBranding: stanje.premium };
}

/** The draft appearance (defaults when the menu never had one). */
export function izgledNacrta(stanje: MemorijaStanje): MenuPresentationValues {
  return stanje.snapshot.presentation ?? MENU_DEFAULT_PRESENTATION;
}

/** What the editor's Izgled shows. */
export function izgledIzMemorije(stanje: MemorijaStanje): StudioIzgled {
  return { vrednosti: izgledNacrta(stanje), plan: izgledPlan(stanje) };
}

export function postaviIzgled(stanje: MemorijaStanje, ocekivano: IzgledIzmena, izmena: IzgledIzmena): MemorijaKorak {
  const pre = izgledNacrta(stanje);
  const polja = Object.keys(izmenaCas(izmena)) as IzgledPolje[];
  const ocekivanoCas = izmenaCas(ocekivano);
  const ocekivanaPolja = Object.keys(ocekivanoCas);
  if (polja.length === 0 || ocekivanaPolja.length !== polja.length || polja.some((polje) => !ocekivanaPolja.includes(polje))) {
    return greska(stanje, MENU_ERROR.invalidInput);
  }
  const expected: Partial<Record<IzgledPolje, CasValue>> = {};
  for (const polje of polja) expected[polje] = ocekivanoCas[polje] ?? null;
  const cas = checkCas<IzgledPolje>(izgledCas(pre), expected, izmenaCas(izmena));
  if (!cas.ok) {
    // The whole group as saved meanwhile and as tried (the editor queues Izgled by group).
    return konflikt(stanje, izgledKaoTekst(izmenaIzCas(cas.current)), izgledKaoTekst(izmena));
  }
  const provera = proveriIzmenuIzgleda(pre, izmena, izgledPlan(stanje));
  if (!provera.ok) return greska(stanje, provera.kod);
  if (!provera.promena) return { stanje, ishod: OK };
  return { stanje: nacrt(stanje, { ...stanje.snapshot, presentation: provera.vrednosti }), ishod: OK };
}
