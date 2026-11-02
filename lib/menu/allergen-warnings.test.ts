// ScanMe Menu V1 (K14) — allergen warnings on a public menu page: a highlight,
// never a filter, never a promise of safety. Missing data is "nepoznato".

import { describe, expect, test } from "vitest";
import { MENU_ALLERGEN_CODES, type MenuAllergenCode } from "./allergens";
import { brojBezPodataka, brojUpozorenja, normalizujAlergene, upozorenjeArtikla } from "./allergen-warnings";
import type { PublicArticle, PublicSection, SnapshotAllergens } from "./snapshot";

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

const alergeni = (contains: string[], mayContain: string[] = []): SnapshotAllergens => ({
  contains,
  mayContain,
  otherText: null,
});

function sekcija(key: string, articles: PublicArticle[]): PublicSection {
  return { key, name: `Sekcija ${key}`, description: null, iconKey: null, articles };
}

const OZNACENI: MenuAllergenCode[] = ["milk", "gluten"];

describe("normalizujAlergene", () => {
  test("drops unknown codes and duplicates", () => {
    expect(normalizujAlergene(["milk", "nesto", "milk", "gluten", ""])).toEqual(["gluten", "milk"]);
  });

  test("returns the canonical order whatever the input order", () => {
    const obrnuto = [...MENU_ALLERGEN_CODES].reverse();
    expect(normalizujAlergene(obrnuto)).toEqual([...MENU_ALLERGEN_CODES]);
    expect(normalizujAlergene(["sesame", "eggs", "gluten"])).toEqual(["gluten", "eggs", "sesame"]);
  });

  test("empty and all-unknown input give an empty list", () => {
    expect(normalizujAlergene([])).toEqual([]);
    expect(normalizujAlergene(["x", "y"])).toEqual([]);
  });
});

describe("upozorenjeArtikla", () => {
  test("allergens off: null, even when something is marked and the article contains it", () => {
    const a = clanak({ allergens: alergeni(["milk"]) });
    expect(upozorenjeArtikla(a, OZNACENI, false)).toBeNull();
    expect(upozorenjeArtikla(clanak(), OZNACENI, false)).toBeNull();
  });

  test("nothing marked: null for every kind of record", () => {
    expect(upozorenjeArtikla(clanak({ allergens: alergeni(["milk"]) }), [], true)).toBeNull();
    expect(upozorenjeArtikla(clanak({ allergens: alergeni([], ["milk"]) }), [], true)).toBeNull();
    expect(upozorenjeArtikla(clanak({ allergens: null }), [], true)).toBeNull();
  });

  test("an article without a record and something marked is nepoznato, never null", () => {
    const ishod = upozorenjeArtikla(clanak({ allergens: null }), OZNACENI, true);
    expect(ishod).toEqual({ vrsta: "nepoznato" });
    expect(ishod).not.toBeNull();
  });

  test("contains a marked allergen: sadrzi with the marked ones only", () => {
    const a = clanak({ allergens: alergeni(["milk", "eggs", "fish"]) });
    expect(upozorenjeArtikla(a, OZNACENI, true)).toEqual({ vrsta: "sadrzi", sadrzi: ["milk"], tragovi: [] });
  });

  test("sadrzi lists the marked traces beside the ingredients", () => {
    const a = clanak({ allergens: alergeni(["milk", "eggs"], ["gluten", "sesame", "fish"]) });
    expect(upozorenjeArtikla(a, OZNACENI, true)).toEqual({ vrsta: "sadrzi", sadrzi: ["milk"], tragovi: ["gluten"] });
  });

  test("only traces: tragovi with the marked traces", () => {
    const a = clanak({ allergens: alergeni(["eggs"], ["gluten", "milk", "sesame"]) });
    expect(upozorenjeArtikla(a, OZNACENI, true)).toEqual({ vrsta: "tragovi", tragovi: ["gluten", "milk"] });
  });

  test("the record lists none of the marked ones: null, not a safe verdict", () => {
    const a = clanak({ allergens: alergeni(["eggs", "fish"], ["sesame"]) });
    expect(upozorenjeArtikla(a, OZNACENI, true)).toBeNull();
    const prazan = clanak({ allergens: alergeni([], []) });
    expect(upozorenjeArtikla(prazan, OZNACENI, true)).toBeNull();
  });

  test("there are only three kinds of warning, none of them safe", () => {
    const sviIshodi = [
      upozorenjeArtikla(clanak({ allergens: alergeni(["milk"]) }), OZNACENI, true),
      upozorenjeArtikla(clanak({ allergens: alergeni([], ["milk"]) }), OZNACENI, true),
      upozorenjeArtikla(clanak({ allergens: null }), OZNACENI, true),
      upozorenjeArtikla(clanak({ allergens: alergeni(["eggs"]) }), OZNACENI, true),
    ];
    const vrste = sviIshodi.map((x) => (x ? x.vrsta : null));
    expect(vrste).toEqual(["sadrzi", "tragovi", "nepoznato", null]);
    const tekst = JSON.stringify(sviIshodi).toLowerCase();
    expect(tekst).not.toContain("safe");
    expect(tekst).not.toContain("bezbed");
    expect(tekst).not.toContain("not_listed");
  });

  test("codes come back in the canonical order whatever the order in the record or the marking", () => {
    const a = clanak({ allergens: alergeni(["sesame", "milk", "gluten"], ["eggs", "fish"]) });
    const ishod = upozorenjeArtikla(a, ["fish", "sesame", "eggs", "gluten", "milk"], true);
    expect(ishod).toEqual({
      vrsta: "sadrzi",
      sadrzi: ["gluten", "milk", "sesame"],
      tragovi: ["eggs", "fish"],
    });
    const tragovi = upozorenjeArtikla(clanak({ allergens: alergeni([], ["sesame", "milk", "gluten"]) }), ["sesame", "milk", "gluten"], true);
    expect(tragovi).toEqual({ vrsta: "tragovi", tragovi: ["gluten", "milk", "sesame"] });
  });

  test("an unknown code in the record is ignored", () => {
    const a = clanak({ allergens: alergeni(["nesto", "milk"]) });
    expect(upozorenjeArtikla(a, ["milk"], true)).toEqual({ vrsta: "sadrzi", sadrzi: ["milk"], tragovi: [] });
    expect(upozorenjeArtikla(clanak({ allergens: alergeni(["nesto"]) }), ["milk"], true)).toBeNull();
  });
});

describe("brojUpozorenja", () => {
  const stranica = (): PublicSection[] => [
    sekcija("sc_1", [
      clanak({ key: "ar_1", allergens: alergeni(["milk"]) }), // sadrzi
      clanak({ key: "ar_2", allergens: alergeni([], ["gluten"]) }), // tragovi
      clanak({ key: "ar_3", allergens: null }), // nepoznato
    ]),
    sekcija("sc_2", [
      clanak({ key: "ar_4", allergens: alergeni(["eggs"]) }), // nista od oznacenog
      clanak({ key: "ar_5", allergens: alergeni(["gluten", "milk"]) }), // sadrzi
    ]),
  ];

  test("counts sadrzi and tragovi but not nepoznato", () => {
    expect(brojUpozorenja(stranica(), OZNACENI, true)).toBe(3);
  });

  test("0 when allergens are off", () => {
    expect(brojUpozorenja(stranica(), OZNACENI, false)).toBe(0);
  });

  test("0 when nothing is marked", () => {
    expect(brojUpozorenja(stranica(), [], true)).toBe(0);
  });

  test("0 for an empty page", () => {
    expect(brojUpozorenja([], OZNACENI, true)).toBe(0);
    expect(brojUpozorenja([sekcija("sc_x", [])], OZNACENI, true)).toBe(0);
  });

  test("only unknown articles: 0", () => {
    const samoNepoznati = [sekcija("sc_1", [clanak({ key: "ar_1" }), clanak({ key: "ar_2" })])];
    expect(brojUpozorenja(samoNepoznati, OZNACENI, true)).toBe(0);
  });
});

describe("brojBezPodataka", () => {
  test("counts articles with no record; 0 when the venue keeps no allergens", () => {
    const sekcije = [
      sekcija("s1", [clanak({ key: "a1", allergens: null }), clanak({ key: "a2", allergens: alergeni(["milk"]) })]),
      sekcija("s2", [clanak({ key: "a3", allergens: null }), clanak({ key: "a4", allergens: alergeni([]) })]),
    ];
    expect(brojBezPodataka(sekcije, true)).toBe(2);
    expect(brojBezPodataka(sekcije, false)).toBe(0);
  });
});

describe("nothing is hidden", () => {
  test("warnings never remove or change articles or sections", () => {
    const sekcije = [
      sekcija("sc_1", [
        clanak({ key: "ar_1", allergens: alergeni(["milk"]) }),
        clanak({ key: "ar_2", allergens: null }),
        clanak({ key: "ar_3", allergens: alergeni(["eggs"]) }),
      ]),
      sekcija("sc_2", [clanak({ key: "ar_4", allergens: alergeni([], ["gluten"]) })]),
    ];
    const pre = structuredClone(sekcije);
    for (const sekcijaUlaz of sekcije) {
      for (const a of sekcijaUlaz.articles) upozorenjeArtikla(a, OZNACENI, true);
    }
    brojUpozorenja(sekcije, OZNACENI, true);
    expect(sekcije).toEqual(pre);
    expect(sekcije.map((s) => s.articles.length)).toEqual([3, 1]);
  });
});
