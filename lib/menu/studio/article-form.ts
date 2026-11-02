// ScanMe Menu V1 — the article detail as the editor types it (K15; master
// §5.5, §5.7, §7.6). Pure: what the owner typed becomes the value the Convex
// mutation takes, or a reason the field can show. The server checks again
// (convex/menuCatalog.ts, convex/menuPromos.ts); these checks only keep a
// wrong value from ever being sent and say why at once.
//
// Promotion (akcija): the owner enters a promo PRICE or a discount PERCENT and
// sees the other value at once (lib/menu/promo.ts derives it, whole dinars,
// half up). A schedule (start and/or end) is Premium; on Standard the
// promotion is switched on and off by hand. Times are Belgrade wall-clock
// ("YYYY-MM-DDTHH:mm", the value of <input type="datetime-local">).

import { epochToBelgradeLocal } from "../../belgrade-time";
import { normalizeAddonRules } from "../addons";
import { MENU_MAX_QUANTITY, MENU_TEXT } from "../limits";
import {
  MENU_PROMO_MAX_PERCENT,
  MENU_PROMO_MIN_PERCENT,
  checkPromo,
  isPromoScheduled,
  promoPrices,
  promoWindowFromBelgradeLocal,
  regularPrices,
  type MenuPromo,
  type MenuPromoLabel,
  type MenuPromoMode,
  type MenuPromoPrice,
  type MenuPromoPriceContext,
} from "../promo";
import { cleanText } from "../text";
import type { StudioGrupaUnos } from "./model";
import { parseCenaUnos } from "./price-input";

// -----------------------------------------------------------------------------
// Text fields: name, description, quantity and unit
// -----------------------------------------------------------------------------

export type PoljeGreska = "obavezno" | "predugo" | "neispravno";

export type PoljeProvera<T> = { ok: true; vrednost: T } | { ok: false; greska: PoljeGreska };

/** The name: required, at most MENU_TEXT.articleName characters after cleaning. */
export function proveriNaziv(tekst: string): PoljeProvera<string> {
  const vrednost = cleanText(tekst);
  if (vrednost === "") return { ok: false, greska: "obavezno" };
  if (vrednost.length > MENU_TEXT.articleName) return { ok: false, greska: "predugo" };
  return { ok: true, vrednost };
}

/** The description: optional (empty = none), at most MENU_TEXT.articleDescription. */
export function proveriOpis(tekst: string): PoljeProvera<string | null> {
  const vrednost = cleanText(tekst);
  if (vrednost === "") return { ok: true, vrednost: null };
  if (vrednost.length > MENU_TEXT.articleDescription) return { ok: false, greska: "predugo" };
  return { ok: true, vrednost };
}

/** The unit ("ml", "g", "kom"): optional, at most MENU_TEXT.quantityUnit. */
export function proveriJedinicu(tekst: string): PoljeProvera<string | null> {
  const vrednost = cleanText(tekst);
  if (vrednost === "") return { ok: true, vrednost: null };
  if (vrednost.length > MENU_TEXT.quantityUnit) return { ok: false, greska: "predugo" };
  return { ok: true, vrednost };
}

/**
 * The quantity as printed: "250", "0,33", "0.5", "1.000" (thousands). Up to
 * three decimals, more than zero, at most MENU_MAX_QUANTITY; empty = none.
 */
export function proveriKolicinu(tekst: string): PoljeProvera<number | null> {
  let s = tekst.trim().replace(/[\s  ]/g, "");
  if (s === "") return { ok: true, vrednost: null };
  if (s.includes(",")) {
    // A comma is the decimal mark, so dots group thousands: "1.234,5".
    if (!/^\d{1,3}(\.\d{3})*,\d+$/.test(s) && !/^\d+,\d+$/.test(s)) return { ok: false, greska: "neispravno" };
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    // Dots in groups of three after a non-zero lead group are thousands ("1.000"); "0.500" is a half.
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return { ok: false, greska: "neispravno" };
  const vrednost = Number(s);
  if (!Number.isFinite(vrednost) || vrednost <= 0 || vrednost > MENU_MAX_QUANTITY) {
    return { ok: false, greska: "neispravno" };
  }
  return { ok: true, vrednost };
}

/** "0,33", "250", "1.000" — the quantity as the field shows it. */
export function formatKolicina(vrednost: number | null): string {
  if (vrednost === null) return "";
  const [ceo, decimale] = String(Math.round(vrednost * 1000) / 1000).split(".");
  const grupisano = ceo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimale ? `${grupisano},${decimale}` : grupisano;
}

// -----------------------------------------------------------------------------
// Promotion (akcija)
// -----------------------------------------------------------------------------

export type AkcijaNatpis = MenuPromoLabel | "bez";

/** The promotion form as typed. Empty strings are empty fields. */
export type AkcijaForma = {
  aktivna: boolean;
  nacin: MenuPromoMode;
  /** The promo price ("1.290") or the percent ("15"). */
  vrednost: string;
  natpis: AkcijaNatpis;
  /** Belgrade "YYYY-MM-DDTHH:mm" or "". */
  pocetak: string;
  kraj: string;
};

export type AkcijaGreska =
  /** Nothing or not a number in the value field. */
  | "vrednost"
  /** The promo price is not lower than the regular price (or is under 1). */
  | "cena"
  /** The percent is not a whole number from 1 to 99. */
  | "procenat"
  /** A promo price with variants: one price cannot cover several. */
  | "varijante"
  /** The article has no regular price yet. */
  | "bez_cene"
  /** A start or end that is not a time, or a start that is not before the end. */
  | "termin"
  /** A schedule on Standard: zakazane akcije su Premium. */
  | "premium";

export type AkcijaRezultat = { ok: true; akcija: MenuPromo } | { ok: false; greska: AkcijaGreska };

/** The empty form of a new promotion: a percent (it works with variants too), switched on. */
export function novaAkcijaForma(kontekst: MenuPromoPriceContext): AkcijaForma {
  const saVarijantama = kontekst.variantsEnabled && kontekst.variants.length > 0;
  return { aktivna: true, nacin: saVarijantama ? "percent" : "price", vrednost: "", natpis: "promo", pocetak: "", kraj: "" };
}

/** The form of a stored promotion (null = a new one). */
export function formaIzAkcije(akcija: MenuPromo | null, kontekst: MenuPromoPriceContext): AkcijaForma {
  if (akcija === null) return novaAkcijaForma(kontekst);
  return {
    aktivna: akcija.active,
    nacin: akcija.mode,
    vrednost:
      akcija.mode === "price"
        ? akcija.priceRsd !== undefined
          ? String(akcija.priceRsd).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
          : ""
        : akcija.percent !== undefined
          ? String(akcija.percent)
          : "",
    natpis: akcija.label ?? "bez",
    pocetak: akcija.startsAt !== undefined ? epochToBelgradeLocal(akcija.startsAt) : "",
    kraj: akcija.endsAt !== undefined ? epochToBelgradeLocal(akcija.endsAt) : "",
  };
}

/** "15", "15%", "15 %" → 15; anything else → null. */
export function parseProcenat(tekst: string): number | null {
  const s = tekst.trim().replace(/\s*%$/, "").trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  return Number(s);
}

/**
 * The promotion to save, or the first reason it cannot be saved. `premium`
 * says whether the account may schedule (lib/menu/capabilities.ts
 * scheduledPromos); the server checks it again.
 */
export function akcijaIzForme(forma: AkcijaForma, kontekst: MenuPromoPriceContext, premium: boolean): AkcijaRezultat {
  if (regularPrices(kontekst).length === 0) return { ok: false, greska: "bez_cene" };
  const saVarijantama = kontekst.variantsEnabled && kontekst.variants.length > 0;
  let vrednost: Pick<MenuPromo, "priceRsd" | "percent">;
  if (forma.nacin === "price") {
    if (saVarijantama) return { ok: false, greska: "varijante" };
    const unos = parseCenaUnos(forma.vrednost);
    if (!unos.ok || unos.cena === null) return { ok: false, greska: "vrednost" };
    vrednost = { priceRsd: unos.cena };
  } else {
    if (forma.vrednost.trim() === "") return { ok: false, greska: "vrednost" };
    const procenat = parseProcenat(forma.vrednost);
    if (procenat === null || procenat < MENU_PROMO_MIN_PERCENT || procenat > MENU_PROMO_MAX_PERCENT) {
      return { ok: false, greska: "procenat" };
    }
    vrednost = { percent: procenat };
  }
  const termin = promoWindowFromBelgradeLocal(forma.pocetak || null, forma.kraj || null);
  if (termin === null) return { ok: false, greska: "termin" };
  const akcija: MenuPromo = {
    active: forma.aktivna,
    mode: forma.nacin,
    ...vrednost,
    ...(forma.natpis !== "bez" ? { label: forma.natpis } : {}),
    ...termin,
  };
  if (forma.aktivna && isPromoScheduled(akcija) && !premium) return { ok: false, greska: "premium" };
  const proverena = checkPromo(akcija, kontekst);
  if (proverena === null) return { ok: false, greska: forma.nacin === "price" ? "cena" : "procenat" };
  return { ok: true, akcija: proverena };
}

/**
 * What the guest would see while the promotion runs: regular → promo price of
 * every price the guest can pick (the derived value of the other mode). null
 * while the form cannot make a promotion yet (the field shows no preview).
 */
export function izvedeneCene(forma: AkcijaForma, kontekst: MenuPromoPriceContext): MenuPromoPrice[] | null {
  // The schedule and the plan do not change the prices: preview them on a plain promotion.
  const rezultat = akcijaIzForme({ ...forma, pocetak: "", kraj: "" }, kontekst, true);
  if (!rezultat.ok) return null;
  return promoPrices(rezultat.akcija, kontekst);
}

// -----------------------------------------------------------------------------
// Add-on group rules (lib/menu/addons.ts is the only rules source)
// -----------------------------------------------------------------------------

export type GrupaFormaStanje = { naziv: string; izbor: "single" | "multiple"; obavezna: boolean; min: string; max: string };

export function formaIzGrupe(unos: StudioGrupaUnos): GrupaFormaStanje {
  return {
    naziv: unos.naziv,
    izbor: unos.izbor,
    obavezna: unos.obavezna,
    min: unos.min === null ? "" : String(unos.min),
    max: unos.max === null ? "" : String(unos.max),
  };
}

export type GrupaFormaProvera = { ok: true; unos: StudioGrupaUnos } | { ok: false; greska: "naziv" | "predugo" | "pravila" };

/** The form as the rules the server takes, or the first reason it cannot be saved. */
export function proveriGrupu(forma: GrupaFormaStanje): GrupaFormaProvera {
  const naziv = cleanText(forma.naziv);
  if (naziv === "") return { ok: false, greska: "naziv" };
  if (naziv.length > MENU_TEXT.addonGroupName) return { ok: false, greska: "predugo" };
  const broj = (tekst: string) => (tekst.trim() === "" ? null : /^\d{1,2}$/.test(tekst.trim()) ? Number(tekst.trim()) : NaN);
  const min = forma.izbor === "multiple" ? broj(forma.min) : null;
  const max = forma.izbor === "multiple" ? broj(forma.max) : null;
  if (Number.isNaN(min) || Number.isNaN(max)) return { ok: false, greska: "pravila" };
  const pravila = normalizeAddonRules({ selection: forma.izbor, required: forma.obavezna, minSelect: min, maxSelect: max });
  if (pravila === null) return { ok: false, greska: "pravila" };
  return {
    ok: true,
    unos: { naziv, izbor: pravila.selection, obavezna: pravila.required, min: pravila.minSelect ?? null, max: pravila.maxSelect ?? null },
  };
}

export type PravilaOpis =
  | { vrsta: "jedanObavezan" | "jedanOpcion" | "viseObavezno" | "viseOpciono" }
  | { vrsta: "tacno" | "najvise" | "najmanje"; n: number }
  | { vrsta: "odDo"; min: number; max: number };

/** The rule of a group in words the guest would understand ("Obavezno, tačno 2"). */
export function opisPravila(grupa: Pick<StudioGrupaUnos, "izbor" | "obavezna" | "min" | "max">): PravilaOpis {
  if (grupa.izbor === "single") return { vrsta: grupa.obavezna ? "jedanObavezan" : "jedanOpcion" };
  const min = grupa.obavezna ? (grupa.min ?? 1) : 0;
  if (grupa.max !== null) {
    if (grupa.obavezna && min === grupa.max) return { vrsta: "tacno", n: min };
    if (grupa.obavezna) return { vrsta: "odDo", min, max: grupa.max };
    return { vrsta: "najvise", n: grupa.max };
  }
  if (grupa.obavezna && min > 1) return { vrsta: "najmanje", n: min };
  return { vrsta: grupa.obavezna ? "viseObavezno" : "viseOpciono" };
}
