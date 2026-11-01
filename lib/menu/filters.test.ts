// ScanMe Menu V1 (K14) — guest filters on a public menu page: only the
// venue's enabled filters that at least one article has are shown, several
// chosen filters combine with AND, and there is no price filter at all.

import { describe, expect, test } from "vitest";
import {
  MENU_FILTER_CODES,
  MENU_FILTER_PROMO,
  artikalProlazi,
  dostupniFilteri,
  filteriArtikla,
  filtrirajStranicu,
  isMenuFilterCode,
  normalizujFiltere,
} from "./filters";
import type { MenuPromo } from "./promo";
import { promoWindowFromBelgradeLocal } from "./promo";
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

function sekcija(key: string, articles: PublicArticle[]): PublicSection {
  return { key, name: `Sekcija ${key}`, description: null, iconKey: null, articles };
}

const cenaPromo = (priceRsd: number, over: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "price",
  priceRsd,
  ...over,
});

// Belgrade wall clock, the way the editor enters it.
const PROZOR = promoWindowFromBelgradeLocal("2026-10-20T08:00", "2026-10-20T22:00") as { startsAt: number; endsAt: number };
const U_PROZORU = PROZOR.startsAt + 60 * 60 * 1000;
const PRE_POCETKA = PROZOR.startsAt - 60 * 1000;
const NA_KRAJU = PROZOR.endsAt;

describe("the filter codes", () => {
  test("are the article tags plus promo, promo last", () => {
    expect(MENU_FILTER_CODES).toEqual([
      "vegan",
      "vegetarian",
      "spicy",
      "recommended",
      "new",
      "house_special",
      "homemade",
      "promo",
    ]);
    expect(MENU_FILTER_CODES[MENU_FILTER_CODES.length - 1]).toBe(MENU_FILTER_PROMO);
  });

  test("isMenuFilterCode accepts only the known codes", () => {
    for (const code of MENU_FILTER_CODES) expect(isMenuFilterCode(code)).toBe(true);
    expect(isMenuFilterCode("gluten")).toBe(false);
    expect(isMenuFilterCode("")).toBe(false);
    expect(isMenuFilterCode("VEGAN")).toBe(false);
  });
});

describe("there is no price filter", () => {
  test("no code looks like a price filter", () => {
    for (const code of MENU_FILTER_CODES) {
      expect(code.startsWith("price")).toBe(false);
      expect(code).not.toContain("cena");
      expect(code).not.toContain("raspon");
    }
  });

  test("price codes are not filter codes", () => {
    expect(isMenuFilterCode("price")).toBe(false);
    expect(isMenuFilterCode("price_range")).toBe(false);
    expect(isMenuFilterCode("priceMin")).toBe(false);
  });

  test("normalizujFiltere drops price codes", () => {
    expect(normalizujFiltere(["price", "price_range", "vegan"])).toEqual(["vegan"]);
    expect(normalizujFiltere(["price", "price_range", "priceMin"])).toEqual([]);
  });

  test("filtrirajStranicu with a price code returns the page unchanged", () => {
    const sekcije = [
      sekcija("sc_1", [clanak({ key: "ar_1", priceRsd: 100 }), clanak({ key: "ar_2", priceRsd: 9000 })]),
      sekcija("sc_2", [clanak({ key: "ar_3", priceRsd: 500 })]),
    ];
    const rezultat = filtrirajStranicu(sekcije, ["price_range"], U_PROZORU);
    expect(rezultat).toEqual(sekcije);
    rezultat.forEach((s, i) => expect(s).toBe(sekcije[i]));
    expect(filtrirajStranicu(sekcije, ["price", "priceMin"], U_PROZORU)).toEqual(sekcije);
  });
});

describe("normalizujFiltere", () => {
  test("drops unknown codes and duplicates and returns the canonical order", () => {
    expect(normalizujFiltere(["promo", "spicy", "nesto", "vegan", "spicy"])).toEqual(["vegan", "spicy", "promo"]);
  });

  test("empty stays empty", () => {
    expect(normalizujFiltere([])).toEqual([]);
  });
});

describe("filteriArtikla", () => {
  test("an article carries its tags", () => {
    expect([...filteriArtikla(clanak({ tags: ["vegan", "spicy"] }), U_PROZORU)].sort()).toEqual(["spicy", "vegan"]);
  });

  test("a running promotion adds promo, an upcoming or finished one does not", () => {
    const a = clanak({ promo: cenaPromo(300, PROZOR) });
    expect(filteriArtikla(a, U_PROZORU).has("promo")).toBe(true);
    expect(filteriArtikla(a, PRE_POCETKA).has("promo")).toBe(false);
    expect(filteriArtikla(a, NA_KRAJU).has("promo")).toBe(false);
  });

  test("a switched-off promotion never adds promo", () => {
    const a = clanak({ promo: cenaPromo(300, { active: false }) });
    expect(filteriArtikla(a, U_PROZORU).has("promo")).toBe(false);
  });

  test("a promotion labelled recommended makes the recommended filter apply", () => {
    const a = clanak({ promo: cenaPromo(300, { ...PROZOR, label: "recommended" }) });
    const unutra = filteriArtikla(a, U_PROZORU);
    expect(unutra.has("recommended")).toBe(true);
    expect(unutra.has("promo")).toBe(true);
    const napolju = filteriArtikla(a, PRE_POCETKA);
    expect(napolju.has("recommended")).toBe(false);
  });

  test("a promotion labelled promo does not add recommended", () => {
    const a = clanak({ promo: cenaPromo(300, { ...PROZOR, label: "promo" }) });
    expect(filteriArtikla(a, U_PROZORU).has("recommended")).toBe(false);
  });

  test("a manual promotion without a window is running", () => {
    expect(filteriArtikla(clanak({ promo: cenaPromo(300) }), U_PROZORU).has("promo")).toBe(true);
  });
});

describe("dostupniFilteri", () => {
  const sekcije = [
    sekcija("sc_1", [clanak({ key: "ar_1", tags: ["spicy"] }), clanak({ key: "ar_2", tags: ["vegan", "vegetarian"] })]),
    sekcija("sc_2", [clanak({ key: "ar_3", tags: ["homemade"] })]),
  ];

  test("returns only venue-enabled codes that at least one article has, in canonical order", () => {
    expect(dostupniFilteri(sekcije, ["homemade", "vegan", "spicy"], U_PROZORU)).toEqual(["vegan", "spicy", "homemade"]);
  });

  test("an enabled code that no article has is hidden", () => {
    expect(dostupniFilteri(sekcije, ["vegan", "new", "house_special"], U_PROZORU)).toEqual(["vegan"]);
  });

  test("a code the article has but the venue did not enable is hidden", () => {
    expect(dostupniFilteri(sekcije, ["vegan"], U_PROZORU)).toEqual(["vegan"]);
    expect(dostupniFilteri(sekcije, [], U_PROZORU)).toEqual([]);
  });

  test("unknown codes are dropped", () => {
    expect(dostupniFilteri(sekcije, ["price_range", "nesto", "spicy"], U_PROZORU)).toEqual(["spicy"]);
    expect(dostupniFilteri(sekcije, ["price_range", "nesto"], U_PROZORU)).toEqual([]);
  });

  test("an empty page has no filters", () => {
    expect(dostupniFilteri([], [...MENU_FILTER_CODES], U_PROZORU)).toEqual([]);
    expect(dostupniFilteri([sekcija("sc_x", [])], [...MENU_FILTER_CODES], U_PROZORU)).toEqual([]);
  });

  test("promo is available only while an article's promotion is active", () => {
    const sPromoom = [sekcija("sc_1", [clanak({ key: "ar_1", promo: cenaPromo(300, PROZOR) }), clanak({ key: "ar_2" })])];
    expect(dostupniFilteri(sPromoom, ["promo"], U_PROZORU)).toEqual(["promo"]);
    expect(dostupniFilteri(sPromoom, ["promo"], PRE_POCETKA)).toEqual([]);
    expect(dostupniFilteri(sPromoom, ["promo"], NA_KRAJU)).toEqual([]);
    expect(dostupniFilteri(sPromoom, ["promo"], NA_KRAJU + 24 * 60 * 60 * 1000)).toEqual([]);
  });

  test("promo is not offered when the venue did not enable it", () => {
    const sPromoom = [sekcija("sc_1", [clanak({ promo: cenaPromo(300) })])];
    expect(dostupniFilteri(sPromoom, ["vegan"], U_PROZORU)).toEqual([]);
  });

  test("a promotion labelled recommended makes recommended available", () => {
    const sPromoom = [sekcija("sc_1", [clanak({ promo: cenaPromo(300, { ...PROZOR, label: "recommended" }) })])];
    expect(dostupniFilteri(sPromoom, ["recommended", "promo"], U_PROZORU)).toEqual(["recommended", "promo"]);
    expect(dostupniFilteri(sPromoom, ["recommended", "promo"], PRE_POCETKA)).toEqual([]);
  });

  test("promo comes last even when listed first", () => {
    const stranica = [sekcija("sc_1", [clanak({ tags: ["new"], promo: cenaPromo(300) })])];
    expect(dostupniFilteri(stranica, ["promo", "new"], U_PROZORU)).toEqual(["new", "promo"]);
  });
});

describe("artikalProlazi", () => {
  test("no chosen filters lets everything through", () => {
    expect(artikalProlazi(clanak(), [], U_PROZORU)).toBe(true);
  });

  test("AND: vegan + spicy needs both", () => {
    const oba = clanak({ tags: ["vegan", "spicy"] });
    const samoVegan = clanak({ tags: ["vegan"] });
    const samoSpicy = clanak({ tags: ["spicy"] });
    expect(artikalProlazi(oba, ["vegan", "spicy"], U_PROZORU)).toBe(true);
    expect(artikalProlazi(samoVegan, ["vegan", "spicy"], U_PROZORU)).toBe(false);
    expect(artikalProlazi(samoSpicy, ["vegan", "spicy"], U_PROZORU)).toBe(false);
    expect(artikalProlazi(clanak(), ["vegan"], U_PROZORU)).toBe(false);
  });

  test("tag + promo needs the tag and a running promotion", () => {
    const a = clanak({ tags: ["vegan"], promo: cenaPromo(300, PROZOR) });
    expect(artikalProlazi(a, ["vegan", "promo"], U_PROZORU)).toBe(true);
    expect(artikalProlazi(a, ["vegan", "promo"], NA_KRAJU)).toBe(false);
  });
});

describe("filtrirajStranicu", () => {
  const stranica = () => [
    sekcija("sc_1", [
      clanak({ key: "ar_1", tags: ["vegan", "spicy"] }),
      clanak({ key: "ar_2", tags: ["vegan"] }),
      clanak({ key: "ar_3", tags: ["spicy"] }),
    ]),
    sekcija("sc_2", [clanak({ key: "ar_4", tags: ["homemade"] })]),
    sekcija("sc_3", [clanak({ key: "ar_5", tags: ["spicy", "vegan"] }), clanak({ key: "ar_6" })]),
  ];

  const kljucevi = (sekcije: PublicSection[]) => sekcije.map((s) => [s.key, s.articles.map((a) => a.key)]);

  test("one filter keeps matching articles, drops empty sections and keeps order", () => {
    expect(kljucevi(filtrirajStranicu(stranica(), ["vegan"], U_PROZORU))).toEqual([
      ["sc_1", ["ar_1", "ar_2"]],
      ["sc_3", ["ar_5"]],
    ]);
  });

  test("two filters combine with AND", () => {
    expect(kljucevi(filtrirajStranicu(stranica(), ["vegan", "spicy"], U_PROZORU))).toEqual([
      ["sc_1", ["ar_1"]],
      ["sc_3", ["ar_5"]],
    ]);
  });

  test("no article matches: empty page", () => {
    expect(filtrirajStranicu(stranica(), ["new"], U_PROZORU)).toEqual([]);
  });

  test("promo filter follows the clock", () => {
    const sekcije = [
      sekcija("sc_1", [clanak({ key: "ar_1", promo: cenaPromo(300, PROZOR) }), clanak({ key: "ar_2" })]),
      sekcija("sc_2", [clanak({ key: "ar_3" })]),
    ];
    expect(kljucevi(filtrirajStranicu(sekcije, ["promo"], U_PROZORU))).toEqual([["sc_1", ["ar_1"]]]);
    expect(filtrirajStranicu(sekcije, ["promo"], NA_KRAJU)).toEqual([]);
  });

  test("an empty or unknown-only selection returns the page unchanged", () => {
    const ulaz = stranica();
    expect(filtrirajStranicu(ulaz, [], U_PROZORU)).toEqual(ulaz);
    expect(filtrirajStranicu(ulaz, ["nesto"], U_PROZORU)).toEqual(ulaz);
  });

  test("keeps the other fields of a section", () => {
    const ulaz = [{ ...sekcija("sc_1", [clanak({ tags: ["vegan"] })]), name: "Predjela", description: "Hladna", iconKey: "leaf" }];
    expect(filtrirajStranicu(ulaz, ["vegan"], U_PROZORU)[0]).toMatchObject({ name: "Predjela", description: "Hladna", iconKey: "leaf" });
  });

  test("does not mutate its input", () => {
    const ulaz = stranica();
    const pre = structuredClone(ulaz);
    filtrirajStranicu(ulaz, ["vegan", "spicy"], U_PROZORU);
    expect(ulaz).toEqual(pre);
  });
});

// K34 (master §7.2): the venue chooses which supported filters guests get.
describe("prebaciFilter", () => {
  test("switches one code on or off and keeps the canonical order", async () => {
    const { prebaciFilter: prebaci, MENU_FILTER_CODES: kodovi } = await import("./filters");
    expect(prebaci(["promo"], "vegan", true)).toEqual(["vegan", "promo"]);
    expect(prebaci(["vegan", "promo"], "vegan", false)).toEqual(["promo"]);
    expect(prebaci([...kodovi], "spicy", false)).toEqual(kodovi.filter((kod) => kod !== "spicy"));
  });

  test("is idempotent and drops unknown or price codes it finds", async () => {
    const { prebaciFilter: prebaci } = await import("./filters");
    expect(prebaci(["vegan"], "vegan", true)).toEqual(["vegan"]);
    expect(prebaci([], "promo", false)).toEqual([]);
    expect(prebaci(["price_range", "vegan", "nepoznato"], "promo", true)).toEqual(["vegan", "promo"]);
  });
});
