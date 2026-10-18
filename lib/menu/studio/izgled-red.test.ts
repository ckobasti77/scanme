// ScanMe Menu V1 (K17) — Izgled on the editor's save queue: one key per control,
// the group's fields as JSON text, and the choices still on the way laid over
// the server values. Pure logic: no DOM, no queue, no clock.

import { describe, expect, test } from "vitest";
import type { CasValue } from "../cas";
import { MENU_IZGLED_POLJA } from "../identity/izbor";
import { MENU_DEFAULT_PRESENTATION, type MenuPresentationValues } from "../presentation";
import {
  IZGLED_GRUPE,
  deoIzgleda,
  izgledIzTeksta,
  izgledKaoTekst,
  izgledSaCekanjem,
  kljucIzgleda,
  primeniZaPrikaz,
  type IzgledGrupa,
} from "./izgled-red";

const present = (over: Partial<MenuPresentationValues> = {}): MenuPresentationValues => ({
  ...MENU_DEFAULT_PRESENTATION,
  ...over,
});

const GRUPE = Object.keys(IZGLED_GRUPE) as IzgledGrupa[];

describe("the groups", () => {
  test("every field of the appearance is saved by exactly one group", () => {
    const polja = GRUPE.flatMap((grupa) => [...IZGLED_GRUPE[grupa]]);
    expect(new Set(polja).size).toBe(polja.length);
    expect([...polja].sort()).toEqual([...MENU_IZGLED_POLJA].sort());
  });

  test("a layout and its variant are saved together, so are the palette and its brand colours", () => {
    expect([...IZGLED_GRUPE.raspored]).toEqual(["layout", "layoutVariant"]);
    expect([...IZGLED_GRUPE.paleta]).toEqual(["paletteId", "brandColors"]);
  });
});

describe("kljucIzgleda", () => {
  test("starts with the izgled: prefix", () => {
    for (const grupa of GRUPE) expect(kljucIzgleda(grupa).startsWith("izgled:")).toBe(true);
  });

  test("is the prefix and the group name", () => {
    expect(kljucIzgleda("paleta")).toBe("izgled:paleta");
    expect(kljucIzgleda("raspored")).toBe("izgled:raspored");
  });

  test("is unique per group", () => {
    const kljucevi = GRUPE.map(kljucIzgleda);
    expect(new Set(kljucevi).size).toBe(kljucevi.length);
  });
});

describe("deoIzgleda", () => {
  test("returns the group's fields in the fixed order", () => {
    expect(Object.keys(deoIzgleda(MENU_DEFAULT_PRESENTATION, "raspored"))).toEqual(["layout", "layoutVariant"]);
    expect(Object.keys(deoIzgleda(MENU_DEFAULT_PRESENTATION, "paleta"))).toEqual(["paletteId", "brandColors"]);
    for (const grupa of GRUPE) {
      expect(Object.keys(deoIzgleda(MENU_DEFAULT_PRESENTATION, grupa))).toEqual([...IZGLED_GRUPE[grupa]]);
    }
  });

  test("an absent variant is null, not missing", () => {
    expect(deoIzgleda(present({ layout: "categories" }), "raspored")).toStrictEqual({ layout: "categories", layoutVariant: null });
  });

  test("a present variant is carried", () => {
    expect(deoIzgleda(present({ layoutVariant: "kartice" }), "raspored")).toStrictEqual({ layout: "flow", layoutVariant: "kartice" });
  });

  test("the palette group carries the palette and the brand colours (null when none)", () => {
    expect(deoIzgleda(MENU_DEFAULT_PRESENTATION, "paleta")).toStrictEqual({ paletteId: "default", brandColors: null });
    expect(deoIzgleda(present({ paletteId: "brend", brandColors: ["#B3261E"] }), "paleta")).toStrictEqual({
      paletteId: "brend",
      brandColors: ["#B3261E"],
    });
  });

  test("single-field groups carry just their field", () => {
    expect(deoIzgleda(present({ density: "dense" }), "gustina")).toStrictEqual({ density: "dense" });
    expect(deoIzgleda(present({ filters: ["vegan"] }), "filteri")).toStrictEqual({ filters: ["vegan"] });
    expect(deoIzgleda(present({ search: true }), "pretraga")).toStrictEqual({ search: true });
  });
});

describe("izgledKaoTekst and izgledIzTeksta", () => {
  test("the text is JSON", () => {
    expect(izgledKaoTekst({ density: "dense" })).toBe('{"density":"dense"}');
    expect(izgledKaoTekst({ layout: "flow", layoutVariant: null })).toBe('{"layout":"flow","layoutVariant":null}');
  });

  test("round trip for every group of a rich appearance", () => {
    const bogato = present({
      layout: "categories",
      layoutVariant: "lista",
      paletteId: "brend-tamna",
      brandColors: ["#B3261E", "", "#F5F5F5"],
      fontPairId: "galerija",
      density: "airy",
      emphasis: "bold",
      defaultMediaMode: "none",
      search: true,
      filters: ["vegan", "promo"],
      currencyToggle: true,
      branding: "reduced",
    });
    for (const grupa of GRUPE) {
      const deo = deoIzgleda(bogato, grupa);
      expect(izgledIzTeksta(izgledKaoTekst(deo))).toStrictEqual(deo);
    }
  });

  test("round trip keeps a null variant as null", () => {
    const deo = deoIzgleda(MENU_DEFAULT_PRESENTATION, "raspored");
    expect(izgledIzTeksta(izgledKaoTekst(deo))).toStrictEqual({ layout: "flow", layoutVariant: null });
  });

  test("an empty object is a valid (empty) change", () => {
    expect(izgledIzTeksta("{}")).toStrictEqual({});
  });

  test.each(["not json", "", "{", "[1,2]", "[]", "null", "5", '"text"', "true", "undefined"])(
    "the text %j is garbage: null",
    (tekst) => {
      expect(izgledIzTeksta(tekst)).toBeNull();
    },
  );

  test.each([[null], [5], [0], [true], [false]] as [CasValue][])("the non-string %j is null", (vrednost) => {
    expect(izgledIzTeksta(vrednost)).toBeNull();
  });
});

describe("primeniZaPrikaz", () => {
  test("lays the fields of a change over the values", () => {
    const rezultat = primeniZaPrikaz(MENU_DEFAULT_PRESENTATION, { density: "dense", search: true });
    expect(rezultat).toEqual({ ...MENU_DEFAULT_PRESENTATION, density: "dense", search: true });
  });

  test("a variant is set", () => {
    expect(primeniZaPrikaz(MENU_DEFAULT_PRESENTATION, { layoutVariant: "kartice" }).layoutVariant).toBe("kartice");
  });

  test("a null variant deletes the key", () => {
    const rezultat = primeniZaPrikaz(present({ layoutVariant: "kartice" }), { layout: "compact", layoutVariant: null });
    expect(rezultat.layout).toBe("compact");
    expect("layoutVariant" in rezultat).toBe(false);
  });

  test("null brand colours are set as null", () => {
    const rezultat = primeniZaPrikaz(present({ brandColors: ["#B3261E"] }), { paletteId: "topla", brandColors: null });
    expect(rezultat).toMatchObject({ paletteId: "topla", brandColors: null });
  });

  test("undefined fields are skipped", () => {
    const pre = present({ density: "airy" });
    expect(primeniZaPrikaz(pre, { density: undefined, emphasis: "bold" })).toEqual({ ...pre, emphasis: "bold" });
  });

  test("does not mutate the values", () => {
    const pre = present({ layoutVariant: "kartice", filters: ["vegan"] });
    const snimak = JSON.stringify(pre);
    primeniZaPrikaz(pre, { layoutVariant: null, filters: ["promo"], density: "dense" });
    expect(JSON.stringify(pre)).toBe(snimak);
    expect(JSON.stringify(MENU_DEFAULT_PRESENTATION)).toBe(JSON.stringify(present()));
  });
});

describe("izgledSaCekanjem", () => {
  const cekanje = (...redovi: [string, CasValue][]): ReadonlyMap<string, CasValue> => new Map(redovi);

  test("lays one waiting group over the server values", () => {
    const rezultat = izgledSaCekanjem(
      MENU_DEFAULT_PRESENTATION,
      cekanje([kljucIzgleda("gustina"), izgledKaoTekst({ density: "dense" })]),
    );
    expect(rezultat).toEqual({ ...MENU_DEFAULT_PRESENTATION, density: "dense" });
  });

  test("applies several waiting groups", () => {
    const rezultat = izgledSaCekanjem(
      MENU_DEFAULT_PRESENTATION,
      cekanje(
        [kljucIzgleda("gustina"), izgledKaoTekst({ density: "airy" })],
        [kljucIzgleda("paleta"), izgledKaoTekst({ paletteId: "brend", brandColors: ["#B3261E"] })],
        [kljucIzgleda("raspored"), izgledKaoTekst({ layout: "categories", layoutVariant: null })],
        [kljucIzgleda("filteri"), izgledKaoTekst({ filters: ["vegan"] })],
      ),
    );
    expect(rezultat).toEqual({
      ...MENU_DEFAULT_PRESENTATION,
      density: "airy",
      paletteId: "brend",
      brandColors: ["#B3261E"],
      layout: "categories",
      filters: ["vegan"],
    });
  });

  test("a waiting null variant removes the variant of the server values", () => {
    const rezultat = izgledSaCekanjem(
      present({ layoutVariant: "kartice" }),
      cekanje([kljucIzgleda("raspored"), izgledKaoTekst({ layout: "flow", layoutVariant: null })]),
    );
    expect("layoutVariant" in rezultat).toBe(false);
  });

  test("ignores keys that are not Izgled keys, even when their text looks like a change", () => {
    const pre = present({ density: "airy" });
    const rezultat = izgledSaCekanjem(
      pre,
      cekanje(["cena:ar_1", '{"density":"dense"}'], ["izlog:gustina", '{"density":"dense"}'], ["izgled", '{"density":"dense"}']),
    );
    expect(rezultat).toBe(pre);
  });

  test("applies the Izgled keys next to foreign ones", () => {
    const rezultat = izgledSaCekanjem(
      MENU_DEFAULT_PRESENTATION,
      cekanje(["cena:ar_1", 450], [kljucIzgleda("naglasak"), izgledKaoTekst({ emphasis: "bold" })]),
    );
    expect(rezultat.emphasis).toBe("bold");
  });

  test("returns the SAME object when nothing is waiting", () => {
    expect(izgledSaCekanjem(MENU_DEFAULT_PRESENTATION, cekanje())).toBe(MENU_DEFAULT_PRESENTATION);
  });

  test("returns the SAME object when no waiting Izgled text can be read", () => {
    const pre = present({ density: "dense" });
    const rezultat = izgledSaCekanjem(
      pre,
      cekanje([kljucIzgleda("gustina"), "not json"], [kljucIzgleda("naglasak"), null], [kljucIzgleda("mediji"), 7]),
    );
    expect(rezultat).toBe(pre);
  });

  test("does not mutate the server values", () => {
    const pre = present({ filters: ["promo"] });
    const snimak = JSON.stringify(pre);
    izgledSaCekanjem(pre, cekanje([kljucIzgleda("filteri"), izgledKaoTekst({ filters: ["vegan"] })]));
    expect(JSON.stringify(pre)).toBe(snimak);
  });
});
