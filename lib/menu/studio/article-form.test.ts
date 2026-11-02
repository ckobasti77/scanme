// ScanMe Menu V1 — the article detail as the editor types it (K15): text
// fields, quantity, the promotion form (price <-> percent) and add-on rules.

import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "../../belgrade-time";
import { MENU_MAX_QUANTITY, MENU_TEXT } from "../limits";
import type { MenuPromoPriceContext } from "../promo";
import {
  akcijaIzForme,
  formaIzAkcije,
  formatKolicina,
  izvedeneCene,
  novaAkcijaForma,
  opisPravila,
  parseProcenat,
  proveriGrupu,
  proveriJedinicu,
  proveriKolicinu,
  proveriNaziv,
  proveriOpis,
  type AkcijaForma,
  type GrupaFormaStanje,
} from "./article-form";

// -----------------------------------------------------------------------------
// Text fields
// -----------------------------------------------------------------------------

describe("proveriNaziv", () => {
  test("cleans whitespace", () => {
    expect(proveriNaziv("  Ćevapi   sa  lukom ")).toEqual({ ok: true, vrednost: "Ćevapi sa lukom" });
  });

  test("empty or blank is obavezno", () => {
    expect(proveriNaziv("")).toEqual({ ok: false, greska: "obavezno" });
    expect(proveriNaziv(" \n\t ")).toEqual({ ok: false, greska: "obavezno" });
  });

  test("the limit is MENU_TEXT.articleName characters after cleaning", () => {
    expect(proveriNaziv("a".repeat(MENU_TEXT.articleName)).ok).toBe(true);
    expect(proveriNaziv("a".repeat(MENU_TEXT.articleName + 1))).toEqual({ ok: false, greska: "predugo" });
    // Spaces that cleaning removes do not count.
    expect(proveriNaziv(`  ${"a".repeat(MENU_TEXT.articleName)}  `).ok).toBe(true);
  });
});

describe("proveriOpis", () => {
  test("empty means no description", () => {
    expect(proveriOpis("")).toEqual({ ok: true, vrednost: null });
    expect(proveriOpis("   ")).toEqual({ ok: true, vrednost: null });
  });

  test("keeps cleaned text and refuses over-long text", () => {
    expect(proveriOpis(" Domaći   kajmak ")).toEqual({ ok: true, vrednost: "Domaći kajmak" });
    expect(proveriOpis("x".repeat(MENU_TEXT.articleDescription)).ok).toBe(true);
    expect(proveriOpis("x".repeat(MENU_TEXT.articleDescription + 1))).toEqual({ ok: false, greska: "predugo" });
  });
});

describe("proveriJedinicu", () => {
  test("optional, limited to MENU_TEXT.quantityUnit", () => {
    expect(proveriJedinicu("")).toEqual({ ok: true, vrednost: null });
    expect(proveriJedinicu(" ml ")).toEqual({ ok: true, vrednost: "ml" });
    expect(proveriJedinicu("k".repeat(MENU_TEXT.quantityUnit)).ok).toBe(true);
    expect(proveriJedinicu("k".repeat(MENU_TEXT.quantityUnit + 1))).toEqual({ ok: false, greska: "predugo" });
  });
});

describe("proveriKolicinu", () => {
  test.each([
    ["0,33", 0.33],
    ["0.5", 0.5],
    ["250", 250],
    ["1.000", 1000],
    ["12.500", 12500],
    ["1 000", 1000],
    ["1 000", 1000],
    ["0,001", 0.001],
    ["1,5", 1.5],
    ["  250  ", 250],
    [String(MENU_MAX_QUANTITY), MENU_MAX_QUANTITY],
  ])("%j is %d", (tekst, vrednost) => {
    expect(proveriKolicinu(tekst)).toEqual({ ok: true, vrednost });
  });

  test("empty is no quantity", () => {
    expect(proveriKolicinu("")).toEqual({ ok: true, vrednost: null });
    expect(proveriKolicinu("   ")).toEqual({ ok: true, vrednost: null });
  });

  test.each([
    "0",
    "0,0",
    "-1",
    "-0,5",
    "1,2345",
    "abc",
    "1,2,3",
    "5,",
    ",5",
    "1e3",
    String(MENU_MAX_QUANTITY + 1),
    "1.000.000",
  ])("%j is neispravno", (tekst) => {
    expect(proveriKolicinu(tekst)).toEqual({ ok: false, greska: "neispravno" });
  });
});

describe("formatKolicina", () => {
  test.each([
    [null, ""],
    [250, "250"],
    [0.33, "0,33"],
    [0.5, "0,5"],
    [1000, "1.000"],
    [1234.5, "1.234,5"],
    [100000, "100.000"],
    [0.001, "0,001"],
  ])("%s -> %j", (vrednost, tekst) => {
    expect(formatKolicina(vrednost)).toBe(tekst);
  });

  test("what the field shows is read back as the same value", () => {
    for (const v of [0.33, 0.5, 250, 1000, 12000, 0.001, 100000]) {
      expect(proveriKolicinu(formatKolicina(v))).toEqual({ ok: true, vrednost: v });
    }
  });

  // Found by this test and fixed in K15: what formatKolicina prints is read back, and a
  // leading zero group is a decimal, not thousands ("0.500" is half a litre, not 500).
  test("a quantity with thousands AND decimals is read back (1.234,5)", () => {
    expect(proveriKolicinu(formatKolicina(1234.5))).toEqual({ ok: true, vrednost: 1234.5 });
  });

  test("0.500 and 0.330 are decimals, 1.000 is a thousand, malformed groups are refused", () => {
    expect(proveriKolicinu("0.500")).toEqual({ ok: true, vrednost: 0.5 });
    expect(proveriKolicinu("0.330")).toEqual({ ok: true, vrednost: 0.33 });
    expect(proveriKolicinu("1.000")).toEqual({ ok: true, vrednost: 1000 });
    expect(proveriKolicinu("1.2.3")).toEqual({ ok: false, greska: "neispravno" });
    expect(proveriKolicinu("1,2,3")).toEqual({ ok: false, greska: "neispravno" });
  });
});

// -----------------------------------------------------------------------------
// Promotion
// -----------------------------------------------------------------------------

const osnovna = (cena: number | null): MenuPromoPriceContext => ({ basePriceRsd: cena, variantsEnabled: false, variants: [] });
const saVarijantama = (osnovnaCena: number | null = null): MenuPromoPriceContext => ({
  basePriceRsd: osnovnaCena,
  variantsEnabled: true,
  variants: [
    { key: "va1", priceRsd: 520 },
    { key: "va2", priceRsd: 880 },
  ],
});

const forma = (izmena: Partial<AkcijaForma> = {}): AkcijaForma => ({
  aktivna: true,
  nacin: "percent",
  vrednost: "",
  natpis: "promo",
  pocetak: "",
  kraj: "",
  ...izmena,
});

const greskaAkcije = (f: AkcijaForma, k: MenuPromoPriceContext, premium = true) => {
  const r = akcijaIzForme(f, k, premium);
  return r.ok ? null : r.greska;
};

describe("parseProcenat", () => {
  test.each([
    ["15", 15],
    ["15%", 15],
    ["15 %", 15],
    [" 7 % ", 7],
    ["100", 100],
    ["0", 0],
  ])("%j -> %d", (tekst, n) => {
    expect(parseProcenat(tekst)).toBe(n);
  });

  test.each(["", "abc", "1.5", "-5", "1000", "15%%", "%"])("%j -> null", (tekst) => {
    expect(parseProcenat(tekst)).toBeNull();
  });
});

describe("promotion: percent and promo price in both directions", () => {
  test("450 minus 15 % is 383 (382,5 rounds half up)", () => {
    const rezultat = izvedeneCene(forma({ nacin: "percent", vrednost: "15" }), osnovna(450));
    expect(rezultat).toEqual([{ key: null, regularRsd: 450, promoRsd: 383, percent: 15 }]);
  });

  test("a promo price of 1290 on 1490 shows 13 %", () => {
    const rezultat = izvedeneCene(forma({ nacin: "price", vrednost: "1.290" }), osnovna(1490));
    expect(rezultat).toEqual([{ key: null, regularRsd: 1490, promoRsd: 1290, percent: 13 }]);
  });

  test("the preview ignores the schedule and the plan", () => {
    const f = forma({ nacin: "percent", vrednost: "20", pocetak: "2026-10-24T08:00", kraj: "2026-10-26T08:00" });
    expect(izvedeneCene(f, osnovna(1000))).toEqual([{ key: null, regularRsd: 1000, promoRsd: 800, percent: 20 }]);
  });

  test("percent gives regular -> promo for every variant", () => {
    const rezultat = izvedeneCene(forma({ nacin: "percent", vrednost: "10" }), saVarijantama());
    expect(rezultat).toEqual([
      { key: "va1", regularRsd: 520, promoRsd: 468, percent: 10 },
      { key: "va2", regularRsd: 880, promoRsd: 792, percent: 10 },
    ]);
  });

  test("a variant without a price falls back to the base price", () => {
    const k: MenuPromoPriceContext = {
      basePriceRsd: 400,
      variantsEnabled: true,
      variants: [
        { key: "a", priceRsd: null },
        { key: "b", priceRsd: 600 },
      ],
    };
    expect(izvedeneCene(forma({ nacin: "percent", vrednost: "50" }), k)).toEqual([
      { key: "a", regularRsd: 400, promoRsd: 200, percent: 50 },
      { key: "b", regularRsd: 600, promoRsd: 300, percent: 50 },
    ]);
  });

  test("variants that are switched off are ignored: the base price is the only price", () => {
    const k: MenuPromoPriceContext = { basePriceRsd: 450, variantsEnabled: false, variants: [{ key: "a", priceRsd: 100 }] };
    expect(izvedeneCene(forma({ nacin: "price", vrednost: "400" }), k)).toEqual([
      { key: null, regularRsd: 450, promoRsd: 400, percent: 11 },
    ]);
  });

  test("no preview while the form cannot make a promotion", () => {
    expect(izvedeneCene(forma({ nacin: "percent", vrednost: "" }), osnovna(450))).toBeNull();
    expect(izvedeneCene(forma({ nacin: "percent", vrednost: "100" }), osnovna(450))).toBeNull();
    expect(izvedeneCene(forma({ nacin: "price", vrednost: "450" }), osnovna(450))).toBeNull();
    expect(izvedeneCene(forma({ nacin: "price", vrednost: "300" }), saVarijantama())).toBeNull();
    expect(izvedeneCene(forma({ nacin: "percent", vrednost: "10" }), osnovna(null))).toBeNull();
  });
});

describe("akcijaIzForme: refusals", () => {
  test("price mode with variants: varijante", () => {
    expect(greskaAkcije(forma({ nacin: "price", vrednost: "300" }), saVarijantama())).toBe("varijante");
    expect(greskaAkcije(forma({ nacin: "price", vrednost: "300" }), saVarijantama(600))).toBe("varijante");
  });

  test("price not lower than the regular price: cena", () => {
    expect(greskaAkcije(forma({ nacin: "price", vrednost: "450" }), osnovna(450))).toBe("cena");
    expect(greskaAkcije(forma({ nacin: "price", vrednost: "451" }), osnovna(450))).toBe("cena");
    expect(greskaAkcije(forma({ nacin: "price", vrednost: "0" }), osnovna(450))).toBe("cena");
  });

  test("price just under the regular price is fine", () => {
    const r = akcijaIzForme(forma({ nacin: "price", vrednost: "449" }), osnovna(450), true);
    expect(r).toEqual({ ok: true, akcija: { active: true, mode: "price", priceRsd: 449, label: "promo" } });
  });

  test.each(["0", "100", "abc", "-5", "1.5", "150"])("percent %j: procenat", (vrednost) => {
    expect(greskaAkcije(forma({ nacin: "percent", vrednost }), osnovna(450))).toBe("procenat");
  });

  test("percent 1 and 99 are the bounds that work", () => {
    expect(akcijaIzForme(forma({ vrednost: "1" }), osnovna(450), true).ok).toBe(true);
    expect(akcijaIzForme(forma({ vrednost: "99" }), osnovna(450), true).ok).toBe(true);
  });

  test("empty value: vrednost (both modes)", () => {
    expect(greskaAkcije(forma({ nacin: "percent", vrednost: "" }), osnovna(450))).toBe("vrednost");
    expect(greskaAkcije(forma({ nacin: "percent", vrednost: "  " }), osnovna(450))).toBe("vrednost");
    expect(greskaAkcije(forma({ nacin: "price", vrednost: "" }), osnovna(450))).toBe("vrednost");
    expect(greskaAkcije(forma({ nacin: "price", vrednost: "abc" }), osnovna(450))).toBe("vrednost");
  });

  test("no regular price: bez_cene, whatever the value", () => {
    expect(greskaAkcije(forma({ nacin: "percent", vrednost: "10" }), osnovna(null))).toBe("bez_cene");
    expect(greskaAkcije(forma({ nacin: "percent", vrednost: "" }), osnovna(null))).toBe("bez_cene");
    expect(
      greskaAkcije(forma({ vrednost: "10" }), { basePriceRsd: null, variantsEnabled: true, variants: [{ key: "a", priceRsd: null }] }),
    ).toBe("bez_cene");
  });

  test("start after end, equal, or not a time: termin", () => {
    expect(greskaAkcije(forma({ vrednost: "10", pocetak: "2026-10-26T08:00", kraj: "2026-10-25T08:00" }), osnovna(450))).toBe("termin");
    expect(greskaAkcije(forma({ vrednost: "10", pocetak: "2026-10-25T08:00", kraj: "2026-10-25T08:00" }), osnovna(450))).toBe("termin");
    expect(greskaAkcije(forma({ vrednost: "10", pocetak: "sutra" }), osnovna(450))).toBe("termin");
    expect(greskaAkcije(forma({ vrednost: "10", kraj: "2026-10-25 08:00" }), osnovna(450))).toBe("termin");
  });
});

describe("akcijaIzForme: plan", () => {
  const raspored = { pocetak: "2026-10-25T08:00", kraj: "2026-11-01T08:00" };

  test("an active schedule on Standard: premium", () => {
    expect(greskaAkcije(forma({ vrednost: "10", ...raspored }), osnovna(450), false)).toBe("premium");
    expect(greskaAkcije(forma({ vrednost: "10", pocetak: raspored.pocetak }), osnovna(450), false)).toBe("premium");
    expect(greskaAkcije(forma({ vrednost: "10", kraj: raspored.kraj }), osnovna(450), false)).toBe("premium");
  });

  test("an INACTIVE scheduled promotion saves on Standard", () => {
    const r = akcijaIzForme(forma({ aktivna: false, vrednost: "10", ...raspored }), osnovna(450), false);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.akcija.active).toBe(false);
      expect(r.akcija.startsAt).toBe(belgradeLocalToEpoch(raspored.pocetak));
      expect(r.akcija.endsAt).toBe(belgradeLocalToEpoch(raspored.kraj));
    }
  });

  test("an unscheduled promotion needs no Premium", () => {
    expect(akcijaIzForme(forma({ vrednost: "10" }), osnovna(450), false).ok).toBe(true);
  });

  test("Premium saves the schedule in Belgrade time across the DST change", () => {
    const r = akcijaIzForme(forma({ vrednost: "10", pocetak: "2026-10-24T08:00", kraj: "2026-10-25T08:00" }), osnovna(450), true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 24 Oct is CEST (UTC+2), 25 Oct 08:00 is already CET (UTC+1): 25 hours apart.
    expect(r.akcija.startsAt).toBe(Date.UTC(2026, 9, 24, 6, 0));
    expect(r.akcija.endsAt).toBe(Date.UTC(2026, 9, 25, 7, 0));
    expect(r.akcija.endsAt! - r.akcija.startsAt!).toBe(25 * 60 * 60 * 1000);
  });

  test("the saved promotion holds only the entered value of its mode", () => {
    const procenat = akcijaIzForme(forma({ vrednost: "15 %" }), osnovna(450), true);
    expect(procenat).toEqual({ ok: true, akcija: { active: true, mode: "percent", percent: 15, label: "promo" } });
    const cena = akcijaIzForme(forma({ nacin: "price", vrednost: "399", natpis: "bez" }), osnovna(480), true);
    expect(cena).toEqual({ ok: true, akcija: { active: true, mode: "price", priceRsd: 399 } });
    const preporuka = akcijaIzForme(forma({ vrednost: "10", natpis: "recommended", aktivna: false }), osnovna(480), true);
    expect(preporuka).toEqual({ ok: true, akcija: { active: false, mode: "percent", percent: 10, label: "recommended" } });
  });
});

describe("novaAkcijaForma / formaIzAkcije", () => {
  test("a new promotion: price mode for one price, percent when there are variants", () => {
    expect(novaAkcijaForma(osnovna(450))).toEqual({ aktivna: true, nacin: "price", vrednost: "", natpis: "promo", pocetak: "", kraj: "" });
    expect(novaAkcijaForma(saVarijantama()).nacin).toBe("percent");
    expect(novaAkcijaForma({ basePriceRsd: 450, variantsEnabled: true, variants: [] }).nacin).toBe("price");
    expect(formaIzAkcije(null, osnovna(450))).toEqual(novaAkcijaForma(osnovna(450)));
  });

  test("a stored promotion round-trips through the form (price, thousands dot)", () => {
    const k = osnovna(1490);
    const forma1 = forma({ nacin: "price", vrednost: "1.290", natpis: "recommended", pocetak: "2026-10-24T08:00", kraj: "2026-10-25T08:00" });
    const r = akcijaIzForme(forma1, k, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formaIzAkcije(r.akcija, k)).toEqual(forma1);
  });

  test("a stored promotion round-trips through the form (percent, no label, open end)", () => {
    const k = saVarijantama();
    const forma1 = forma({ aktivna: false, nacin: "percent", vrednost: "15", natpis: "bez", pocetak: "2026-10-25T08:00" });
    const r = akcijaIzForme(forma1, k, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.akcija).not.toHaveProperty("label");
    expect(r.akcija).not.toHaveProperty("endsAt");
    expect(formaIzAkcije(r.akcija, k)).toEqual(forma1);
  });

  test("the epoch a stored promotion carries is shown as Belgrade wall-clock time", () => {
    const forma1 = formaIzAkcije(
      { active: true, mode: "percent", percent: 10, startsAt: Date.UTC(2026, 9, 25, 7, 0) },
      osnovna(450),
    );
    expect(forma1.pocetak).toBe("2026-10-25T08:00");
    expect(forma1.kraj).toBe("");
  });
});

// -----------------------------------------------------------------------------
// Add-on groups
// -----------------------------------------------------------------------------

const grupa = (izmena: Partial<GrupaFormaStanje> = {}): GrupaFormaStanje => ({
  naziv: "Prilozi",
  izbor: "multiple",
  obavezna: false,
  min: "",
  max: "",
  ...izmena,
});

describe("proveriGrupu", () => {
  test("multiple, required, min 2 max 2", () => {
    expect(proveriGrupu(grupa({ naziv: " Izaberite  dva priloga ", obavezna: true, min: "2", max: "2" }))).toEqual({
      ok: true,
      unos: { naziv: "Izaberite dva priloga", izbor: "multiple", obavezna: true, min: 2, max: 2 },
    });
  });

  test("a minimum of 1 on a required group is the default and is dropped", () => {
    expect(proveriGrupu(grupa({ obavezna: true, min: "1", max: "3" }))).toEqual({
      ok: true,
      unos: { naziv: "Prilozi", izbor: "multiple", obavezna: true, min: null, max: 3 },
    });
  });

  test("optional multiple with only a maximum", () => {
    expect(proveriGrupu(grupa({ max: "3" }))).toEqual({
      ok: true,
      unos: { naziv: "Prilozi", izbor: "multiple", obavezna: false, min: null, max: 3 },
    });
  });

  test("max smaller than min: pravila", () => {
    expect(proveriGrupu(grupa({ obavezna: true, min: "3", max: "2" }))).toEqual({ ok: false, greska: "pravila" });
  });

  test("max below the implicit minimum of a required group: pravila is not raised for max 1", () => {
    // required default minimum is 1, so max 1 is fine ("exactly one" of several).
    expect(proveriGrupu(grupa({ obavezna: true, max: "1" })).ok).toBe(true);
  });

  test("a minimum on an optional group: pravila", () => {
    expect(proveriGrupu(grupa({ obavezna: false, min: "2" }))).toEqual({ ok: false, greska: "pravila" });
  });

  test.each(["abc", "1.5", "-1", "100", "1e1", "0", "31"])("a non-number or out-of-range maximum %j: pravila", (max) => {
    expect(proveriGrupu(grupa({ obavezna: true, max }))).toEqual({ ok: false, greska: "pravila" });
  });

  test("a non-number minimum: pravila", () => {
    expect(proveriGrupu(grupa({ obavezna: true, min: "dva" }))).toEqual({ ok: false, greska: "pravila" });
  });

  test("single choice: the min and max fields are not part of the rules", () => {
    expect(proveriGrupu(grupa({ naziv: "Stepen pečenja", izbor: "single", obavezna: true }))).toEqual({
      ok: true,
      unos: { naziv: "Stepen pečenja", izbor: "single", obavezna: true, min: null, max: null },
    });
    // Whatever was typed in the (hidden) fields is dropped, not an error.
    expect(proveriGrupu(grupa({ izbor: "single", min: "2", max: "5" }))).toEqual({
      ok: true,
      unos: { naziv: "Prilozi", izbor: "single", obavezna: false, min: null, max: null },
    });
  });

  test("name: required and limited", () => {
    expect(proveriGrupu(grupa({ naziv: "   " }))).toEqual({ ok: false, greska: "naziv" });
    expect(proveriGrupu(grupa({ naziv: "g".repeat(MENU_TEXT.addonGroupName) })).ok).toBe(true);
    expect(proveriGrupu(grupa({ naziv: "g".repeat(MENU_TEXT.addonGroupName + 1) }))).toEqual({ ok: false, greska: "predugo" });
  });
});

describe("opisPravila: all eight kinds", () => {
  test("single required / optional", () => {
    expect(opisPravila({ izbor: "single", obavezna: true, min: null, max: null })).toEqual({ vrsta: "jedanObavezan" });
    expect(opisPravila({ izbor: "single", obavezna: false, min: null, max: null })).toEqual({ vrsta: "jedanOpcion" });
  });

  test("multiple, required, no bounds -> viseObavezno; min 1 is the same", () => {
    expect(opisPravila({ izbor: "multiple", obavezna: true, min: null, max: null })).toEqual({ vrsta: "viseObavezno" });
    expect(opisPravila({ izbor: "multiple", obavezna: true, min: 1, max: null })).toEqual({ vrsta: "viseObavezno" });
  });

  test("multiple, optional, no bounds -> viseOpciono", () => {
    expect(opisPravila({ izbor: "multiple", obavezna: false, min: null, max: null })).toEqual({ vrsta: "viseOpciono" });
  });

  test("required with min == max -> tacno", () => {
    expect(opisPravila({ izbor: "multiple", obavezna: true, min: 2, max: 2 })).toEqual({ vrsta: "tacno", n: 2 });
    expect(opisPravila({ izbor: "multiple", obavezna: true, min: null, max: 1 })).toEqual({ vrsta: "tacno", n: 1 });
  });

  test("required with min < max -> odDo", () => {
    expect(opisPravila({ izbor: "multiple", obavezna: true, min: 2, max: 4 })).toEqual({ vrsta: "odDo", min: 2, max: 4 });
    expect(opisPravila({ izbor: "multiple", obavezna: true, min: null, max: 3 })).toEqual({ vrsta: "odDo", min: 1, max: 3 });
  });

  test("optional with a maximum -> najvise", () => {
    expect(opisPravila({ izbor: "multiple", obavezna: false, min: null, max: 3 })).toEqual({ vrsta: "najvise", n: 3 });
  });

  test("required with a minimum above 1 and no maximum -> najmanje", () => {
    expect(opisPravila({ izbor: "multiple", obavezna: true, min: 3, max: null })).toEqual({ vrsta: "najmanje", n: 3 });
  });

  test("an optional group ignores a stray min", () => {
    expect(opisPravila({ izbor: "multiple", obavezna: false, min: 3, max: null })).toEqual({ vrsta: "viseOpciono" });
  });

  test("every kind is reachable", () => {
    const vrste = new Set(
      [
        opisPravila({ izbor: "single", obavezna: true, min: null, max: null }),
        opisPravila({ izbor: "single", obavezna: false, min: null, max: null }),
        opisPravila({ izbor: "multiple", obavezna: true, min: null, max: null }),
        opisPravila({ izbor: "multiple", obavezna: false, min: null, max: null }),
        opisPravila({ izbor: "multiple", obavezna: true, min: 2, max: 2 }),
        opisPravila({ izbor: "multiple", obavezna: false, min: null, max: 3 }),
        opisPravila({ izbor: "multiple", obavezna: true, min: 3, max: null }),
        opisPravila({ izbor: "multiple", obavezna: true, min: 2, max: 4 }),
      ].map((opis) => opis.vrsta),
    );
    expect(vrste.size).toBe(8);
  });
});
