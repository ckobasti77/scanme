// ScanMe Menu V1 (K18) — a conflict of the same value: what the field shows
// when someone saved meanwhile. Pure logic; the data is invented.

import { describe, expect, test } from "vitest";
import type { CasValue } from "../cas";
import { fmt } from "../../i18n/format";
import { menuStudioObjavljivanjeSr } from "../../i18n/sr/menu-studio-objava";
import { isteVrednosti, opisKonflikta } from "./conflict";

const konflikt = menuStudioObjavljivanjeSr.konflikt;
const prisustvo = menuStudioObjavljivanjeSr.prisustvo;

/** The field's phrasing: easy to tell apart from the raw value. */
const prikaz = (vrednost: CasValue) => `<${String(vrednost)}>`;

describe("isteVrednosti", () => {
  test("equal values are the same", () => {
    expect(isteVrednosti(120, 120)).toBe(true);
    expect(isteVrednosti("Kafa", "Kafa")).toBe(true);
    expect(isteVrednosti(true, true)).toBe(true);
    expect(isteVrednosti(null, null)).toBe(true);
  });

  test("different values are not the same", () => {
    expect(isteVrednosti(120, 150)).toBe(false);
    expect(isteVrednosti("Kafa", "Čaj")).toBe(false);
    expect(isteVrednosti(true, false)).toBe(false);
  });

  test("a value is only the same as one of its own type", () => {
    expect(isteVrednosti(1, "1")).toBe(false);
    expect(isteVrednosti(0, false)).toBe(false);
    expect(isteVrednosti(0, null)).toBe(false);
    expect(isteVrednosti("", null)).toBe(false);
  });

  test("list and object values are JSON text: the same text is the same value", () => {
    expect(isteVrednosti('["a","b"]', '["a","b"]')).toBe(true);
    expect(isteVrednosti('["a","b"]', '["b","a"]')).toBe(false);
  });

  test("a missing value counts as null", () => {
    expect(isteVrednosti(undefined as unknown as CasValue, null)).toBe(true);
    expect(isteVrednosti(undefined as unknown as CasValue, 0)).toBe(false);
  });
});

describe("opisKonflikta", () => {
  test("both values are phrased for the field: the saved one and mine", () => {
    const opis = opisKonflikta({ sacuvano: 120, pokusano: 150 }, prikaz);
    expect(opis.sacuvano).toBe("<120>");
    expect(opis.moja).toBe("<150>");
    expect(opis.ista).toBe(false);
  });

  test("the phrasing function is asked once for each value", () => {
    const pozivi: CasValue[] = [];
    opisKonflikta({ sacuvano: 120, pokusano: 150 }, (vrednost) => {
      pozivi.push(vrednost);
      return "x";
    });
    expect(pozivi).toEqual([120, 150]);
  });

  test("equal values: `ista` is true and both are still phrased", () => {
    const opis = opisKonflikta({ sacuvano: 150, pokusano: 150 }, prikaz);
    expect(opis).toEqual({ sacuvano: "<150>", moja: "<150>", ista: true, drugi: null });
  });

  test("a cleared value (null) is phrased and differs from a number", () => {
    const opis = opisKonflikta({ sacuvano: null, pokusano: 150 }, (vrednost) => (vrednost === null ? "bez cene" : String(vrednost)));
    expect(opis.sacuvano).toBe("bez cene");
    expect(opis.moja).toBe("150");
    expect(opis.ista).toBe(false);
  });

  test("nobody else has the article open: no sentence", () => {
    expect(opisKonflikta({ sacuvano: 1, pokusano: 2 }, prikaz).drugi).toBeNull();
    expect(opisKonflikta({ sacuvano: 1, pokusano: 2 }, prikaz, []).drugi).toBeNull();
  });

  test("one other person: the singular sentence", () => {
    const opis = opisKonflikta({ sacuvano: 1, pokusano: 2 }, prikaz, ["Marko"]);
    expect(opis.drugi).toBe(fmt(konflikt.drugi.jedan, { imena: "Marko" }));
  });

  test("two other people: the plural sentence with both names", () => {
    const opis = opisKonflikta({ sacuvano: 1, pokusano: 2 }, prikaz, ["Marko", "Ana"]);
    expect(opis.drugi).toBe(fmt(konflikt.drugi.vise, { imena: fmt(prisustvo.dvoje, { a: "Marko", b: "Ana" }) }));
  });

  test("more people: the first two are named and the rest counted, in the order given", () => {
    const opis = opisKonflikta({ sacuvano: 1, pokusano: 2 }, prikaz, ["Zoran", "Ana", "Marko"]);
    expect(opis.drugi).toBe(fmt(konflikt.drugi.vise, { imena: fmt(prisustvo.jos, { imena: "Zoran, Ana", n: 1 }) }));
  });

  test("the sentence does not depend on the values, and the values not on the people", () => {
    const a = opisKonflikta({ sacuvano: 1, pokusano: 2 }, prikaz, ["Marko"]);
    const b = opisKonflikta({ sacuvano: 5, pokusano: 5 }, prikaz, ["Marko"]);
    expect(a.drugi).toBe(b.drugi);
    expect(opisKonflikta({ sacuvano: 1, pokusano: 2 }, prikaz).sacuvano).toBe(a.sacuvano);
  });
});
