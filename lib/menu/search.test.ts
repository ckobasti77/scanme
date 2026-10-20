// ScanMe Menu V1 (K14) — search on one public menu page: diacritics and case
// never matter, every word must match, a word may hit the name, description,
// variant names or the section name, the page's section order is kept.

import { describe, expect, test } from "vitest";
import { MENU_PRETRAGA_MAX, artikalOdgovara, pretraziStranicu, reciUpita } from "./search";
import type { PublicArticle, PublicSection } from "./snapshot";

function clanak(over: Partial<PublicArticle> = {}): PublicArticle {
  return {
    key: "ar_test00000001",
    kind: "item",
    name: "Kafa",
    description: null,
    quantityValue: null,
    quantityUnit: null,
    priceRsd: 400,
    variants: [],
    addonGroups: [],
    noteEnabled: false,
    media: { mode: "none", imageMediaId: null, iconKey: null },
    allergens: null,
    tags: [],
    promo: null,
    combo: null,
    ...over,
  };
}

function sekcija(key: string, name: string, articles: PublicArticle[]): PublicSection {
  return { key, name, description: null, iconKey: null, articles };
}

function stranica(): PublicSection[] {
  return [
    sekcija("sc_1", "Roštilj", [
      clanak({ key: "ar_1", name: "Ćevapi", description: "Pet komada uz kajmak i luk" }),
      clanak({ key: "ar_2", name: "Pljeskavica", description: "Sa sirom" }),
    ]),
    sekcija("sc_2", "Jela s kuhinje", [
      clanak({ key: "ar_3", name: "Đuveč", description: "Pirinač i povrće" }),
      clanak({
        key: "ar_4",
        name: "Pasulj",
        variants: [
          { key: "va_1", name: "Mala porcija", priceRsd: 500 },
          { key: "va_2", name: "Velika porcija", priceRsd: 700 },
        ],
      }),
    ]),
    sekcija("sc_3", "Pića", [clanak({ key: "ar_5", name: "Kafa" }), clanak({ key: "ar_6", name: "Čaj" })]),
  ];
}

const kljucevi = (sekcije: PublicSection[]) => sekcije.map((s) => [s.key, s.articles.map((a) => a.key)]);

describe("reciUpita", () => {
  test("folds diacritics and case into plain words", () => {
    expect(reciUpita("Ćevapi")).toEqual(["cevapi"]);
    expect(reciUpita("ĐUVEČ")).toEqual(["djuvec"]);
    expect(reciUpita("Šljivovica Žuta")).toEqual(["sljivovica", "zuta"]);
  });

  test("extra spaces are trimmed and collapsed", () => {
    expect(reciUpita("   pasulj    velika   ")).toEqual(["pasulj", "velika"]);
  });

  test("empty and whitespace-only queries have no words", () => {
    expect(reciUpita("")).toEqual([]);
    expect(reciUpita("    \t  ")).toEqual([]);
  });

  test("a query longer than the limit is cut", () => {
    expect(reciUpita("x".repeat(MENU_PRETRAGA_MAX + 40))).toEqual(["x".repeat(MENU_PRETRAGA_MAX)]);
    expect(reciUpita("cevapi" + " ".repeat(MENU_PRETRAGA_MAX) + "zzzz")).toEqual(["cevapi"]);
  });
});

describe("pretraziStranicu", () => {
  test("without diacritics: cevapi finds Ćevapi, djuvec finds Đuveč", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "cevapi"))).toEqual([["sc_1", ["ar_1"]]]);
    expect(kljucevi(pretraziStranicu(stranica(), "djuvec"))).toEqual([["sc_2", ["ar_3"]]]);
  });

  test("with diacritics typed, the same articles are found", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "Ćevapi"))).toEqual([["sc_1", ["ar_1"]]]);
    expect(kljucevi(pretraziStranicu(stranica(), "đuveč"))).toEqual([["sc_2", ["ar_3"]]]);
  });

  test("case does not matter", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "CEVAPI"))).toEqual(kljucevi(pretraziStranicu(stranica(), "cevapi")));
    expect(kljucevi(pretraziStranicu(stranica(), "kAfA"))).toEqual([["sc_3", ["ar_5"]]]);
  });

  test("extra spaces around and between words are ignored", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "   cevapi   "))).toEqual([["sc_1", ["ar_1"]]]);
    expect(kljucevi(pretraziStranicu(stranica(), "  cevapi     kajmak  "))).toEqual([["sc_1", ["ar_1"]]]);
  });

  test("every word must match (AND)", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "cevapi kajmak"))).toEqual([["sc_1", ["ar_1"]]]);
    expect(pretraziStranicu(stranica(), "cevapi pasulj")).toEqual([]);
    expect(pretraziStranicu(stranica(), "cevapi nepostojece")).toEqual([]);
  });

  test("a word may match the description", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "kajmak"))).toEqual([["sc_1", ["ar_1"]]]);
    expect(kljucevi(pretraziStranicu(stranica(), "pirinac"))).toEqual([["sc_2", ["ar_3"]]]);
  });

  test("a word may match a variant name", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "velika"))).toEqual([["sc_2", ["ar_4"]]]);
    expect(kljucevi(pretraziStranicu(stranica(), "pasulj mala"))).toEqual([["sc_2", ["ar_4"]]]);
  });

  test("a word may match the section name, which brings in the whole section", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "rostilj"))).toEqual([["sc_1", ["ar_1", "ar_2"]]]);
    expect(kljucevi(pretraziStranicu(stranica(), "pica"))).toEqual([["sc_3", ["ar_5", "ar_6"]]]);
  });

  test("words may be spread over name and section name", () => {
    expect(kljucevi(pretraziStranicu(stranica(), "rostilj pljeskavica"))).toEqual([["sc_1", ["ar_2"]]]);
  });

  test("the result is grouped by section in page order and empty sections are dropped", () => {
    // "a" appears in a lot of texts: sections 1 and 2 match, "Pića" has Kafa/Čaj with an "a" too.
    const rezultat = pretraziStranicu(stranica(), "porcija");
    expect(rezultat.map((s) => s.key)).toEqual(["sc_2"]);
    const sve = pretraziStranicu(stranica(), "a");
    const redosled = sve.map((s) => s.key);
    expect(redosled).toEqual([...redosled].sort());
    for (const s of sve) expect(s.articles.length).toBeGreaterThan(0);
  });

  test("articles inside a section keep their order", () => {
    const stranicaZaRed = [
      sekcija("sc_a", "Jela", [
        clanak({ key: "ar_c", name: "Supa C" }),
        clanak({ key: "ar_a", name: "Supa A" }),
        clanak({ key: "ar_x", name: "Salata" }),
        clanak({ key: "ar_b", name: "Supa B" }),
      ]),
    ];
    expect(kljucevi(pretraziStranicu(stranicaZaRed, "supa"))).toEqual([["sc_a", ["ar_c", "ar_a", "ar_b"]]]);
  });

  test("a section keeps its own fields apart from the narrowed articles", () => {
    const ulaz = stranica();
    ulaz[0] = { ...ulaz[0], description: "Sa žara", iconKey: "grill" };
    const [prva] = pretraziStranicu(ulaz, "cevapi");
    expect(prva).toMatchObject({ key: "sc_1", name: "Roštilj", description: "Sa žara", iconKey: "grill" });
  });

  test("nothing matches: empty result", () => {
    expect(pretraziStranicu(stranica(), "xyzzy")).toEqual([]);
  });

  test("an empty or whitespace query returns the page unchanged", () => {
    const ulaz = stranica();
    for (const upit of ["", "   ", "\t \n"]) {
      const rezultat = pretraziStranicu(ulaz, upit);
      expect(rezultat).toEqual(ulaz);
      expect(rezultat).toHaveLength(ulaz.length);
      rezultat.forEach((s, i) => {
        expect(s).toBe(ulaz[i]);
        expect(s.articles).toBe(ulaz[i].articles);
      });
    }
  });

  test("a query longer than the limit is cut and does not crash", () => {
    const dug = "cevapi" + " ".repeat(MENU_PRETRAGA_MAX) + "ovo se odseca";
    expect(kljucevi(pretraziStranicu(stranica(), dug))).toEqual([["sc_1", ["ar_1"]]]);
    expect(() => pretraziStranicu(stranica(), "q".repeat(5000))).not.toThrow();
    expect(pretraziStranicu(stranica(), "q".repeat(5000))).toEqual([]);
  });

  test("does not mutate its input", () => {
    const ulaz = stranica();
    const pre = structuredClone(ulaz);
    pretraziStranicu(ulaz, "cevapi");
    pretraziStranicu(ulaz, "velika porcija");
    pretraziStranicu(ulaz, "");
    expect(ulaz).toEqual(pre);
  });

  test("an empty page stays empty", () => {
    expect(pretraziStranicu([], "cevapi")).toEqual([]);
    expect(pretraziStranicu([], "")).toEqual([]);
  });
});

describe("artikalOdgovara", () => {
  test("no words matches everything", () => {
    const s = stranica()[0];
    expect(artikalOdgovara(s.articles[0], s, [])).toBe(true);
  });

  test("matches against the folded text, so words must already be folded", () => {
    const s = stranica()[0];
    expect(artikalOdgovara(s.articles[0], s, ["cevapi"])).toBe(true);
    expect(artikalOdgovara(s.articles[0], s, ["cevapi", "nema"])).toBe(false);
  });
});
