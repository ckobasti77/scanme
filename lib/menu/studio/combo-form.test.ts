// ScanMe Menu V1 (K16) — the combo's focused view (master §5.4): the sum of the
// components is only a hint next to the manual combo price, the component list
// is checked like the server checks it.

import { describe, expect, test } from "vitest";
import { MENU_MAX_COMBO_COMPONENTS, MENU_MAX_COMBO_QUANTITY } from "../limits";
import { istiSastav, komboZbir, parseKolicinaSastojka, proveriSastav, type KomboSastojak } from "./combo-form";

const sastojak = (artikalId: string, kolicina: number, cena: number | null): KomboSastojak => ({
  artikalId,
  naziv: `Artikal ${artikalId}`,
  kolicina,
  cena,
});

/** n distinct components, quantity 1. */
const lista = (n: number) => Array.from({ length: n }, (_, i) => ({ artikalId: `a${i + 1}`, kolicina: 1 }));

describe("komboZbir", () => {
  test("sums the regular prices times the quantities", () => {
    const sastojci = [sastojak("a", 2, 420), sastojak("b", 1, 760), sastojak("c", 1, 260)];
    expect(komboZbir(sastojci, 1500)).toEqual({ zbir: 1860, potpun: true, razlika: -360 });
  });

  test("razlika is the combo price minus the sum: negative = the guest saves", () => {
    const sastojci = [sastojak("a", 1, 420), sastojak("b", 1, 760)];
    expect(komboZbir(sastojci, 1000).razlika).toBe(-180);
    expect(komboZbir(sastojci, 1400).razlika).toBe(220);
  });

  test("a combo priced exactly at the sum has a difference of 0, not null", () => {
    const sastojci = [sastojak("a", 1, 420), sastojak("b", 1, 760)];
    expect(komboZbir(sastojci, 1180)).toEqual({ zbir: 1180, potpun: true, razlika: 0 });
  });

  test("partial when a component has no price: only the priced ones are summed and there is no difference", () => {
    const sastojci = [sastojak("a", 2, 420), sastojak("b", 1, null), sastojak("c", 1, 260)];
    expect(komboZbir(sastojci, 1000)).toEqual({ zbir: 1100, potpun: false, razlika: null });
  });

  test("no difference without a combo price", () => {
    const sastojci = [sastojak("a", 1, 420), sastojak("b", 1, 760)];
    expect(komboZbir(sastojci, null)).toEqual({ zbir: 1180, potpun: true, razlika: null });
  });

  test("a combo price of 0 is a price (difference = -sum)", () => {
    expect(komboZbir([sastojak("a", 1, 420)], 0).razlika).toBe(-420);
  });

  test("no components: sum 0, complete, no difference", () => {
    expect(komboZbir([], 1000)).toEqual({ zbir: 0, potpun: true, razlika: null });
  });

  test("only unpriced components: sum 0, not complete", () => {
    expect(komboZbir([sastojak("a", 1, null)], 500)).toEqual({ zbir: 0, potpun: false, razlika: null });
  });

  test("a component priced 0 counts as priced", () => {
    expect(komboZbir([sastojak("a", 3, 0), sastojak("b", 1, 100)], 100)).toEqual({ zbir: 100, potpun: true, razlika: 0 });
  });

  test("it is informative: calling it never changes the inputs", () => {
    const sastojci = [sastojak("a", 2, 420), sastojak("b", 1, null)];
    const copy = structuredClone(sastojci);
    Object.freeze(sastojci);
    sastojci.forEach((s) => Object.freeze(s));
    komboZbir(sastojci, 1000);
    komboZbir(sastojci, null);
    expect(sastojci).toEqual(copy);
  });
});

describe("proveriSastav", () => {
  test("a valid list passes", () => {
    expect(proveriSastav([{ artikalId: "a", kolicina: 1 }, { artikalId: "b", kolicina: 3 }])).toBeNull();
  });

  test("empty is `prazno`", () => {
    expect(proveriSastav([])).toBe("prazno");
  });

  test("at most 20 components: 20 pass, 21 are `previse`", () => {
    expect(MENU_MAX_COMBO_COMPONENTS).toBe(20);
    expect(proveriSastav(lista(20))).toBeNull();
    expect(proveriSastav(lista(21))).toBe("previse");
  });

  test("quantity is a whole number 1..20", () => {
    expect(MENU_MAX_COMBO_QUANTITY).toBe(20);
    expect(proveriSastav([{ artikalId: "a", kolicina: 1 }])).toBeNull();
    expect(proveriSastav([{ artikalId: "a", kolicina: 20 }])).toBeNull();
    for (const kolicina of [0, -1, 21, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(proveriSastav([{ artikalId: "a", kolicina }])).toBe("kolicina");
    }
  });

  test("the same article twice is `ponavljanje`", () => {
    expect(proveriSastav([{ artikalId: "a", kolicina: 1 }, { artikalId: "a", kolicina: 2 }])).toBe("ponavljanje");
  });

  test("one bad quantity among valid rows is reported", () => {
    expect(proveriSastav([{ artikalId: "a", kolicina: 1 }, { artikalId: "b", kolicina: 0 }])).toBe("kolicina");
  });

  test("a bad quantity is reported before a repeat, too many before a bad quantity", () => {
    expect(proveriSastav([{ artikalId: "a", kolicina: 0 }, { artikalId: "a", kolicina: 1 }])).toBe("kolicina");
    expect(proveriSastav([...lista(20), { artikalId: "x", kolicina: 0 }])).toBe("previse");
  });
});

describe("parseKolicinaSastojka", () => {
  test("whole numbers 1..20", () => {
    expect(parseKolicinaSastojka("1")).toBe(1);
    expect(parseKolicinaSastojka("7")).toBe(7);
    expect(parseKolicinaSastojka("20")).toBe(20);
  });

  test("outer spaces are ignored", () => {
    expect(parseKolicinaSastojka("  3 ")).toBe(3);
  });

  test("a leading zero is still a whole number", () => {
    expect(parseKolicinaSastojka("05")).toBe(5);
  });

  test("out of range is null", () => {
    expect(parseKolicinaSastojka("0")).toBeNull();
    expect(parseKolicinaSastojka("00")).toBeNull();
    expect(parseKolicinaSastojka("21")).toBeNull();
    expect(parseKolicinaSastojka("99")).toBeNull();
  });

  test("anything that is not 1-2 digits is null", () => {
    for (const text of ["", "  ", "abc", "1.5", "1,5", "-1", "+2", "100", "007", "2 0", "1e1"]) {
      expect(parseKolicinaSastojka(text), JSON.stringify(text)).toBeNull();
    }
  });
});

describe("istiSastav", () => {
  const a = [{ artikalId: "a", kolicina: 1 }, { artikalId: "b", kolicina: 2 }];

  test("same articles, order and quantities", () => {
    expect(istiSastav(a, [{ artikalId: "a", kolicina: 1 }, { artikalId: "b", kolicina: 2 }])).toBe(true);
    expect(istiSastav([], [])).toBe(true);
  });

  test("a different order is a different list", () => {
    expect(istiSastav(a, [a[1], a[0]])).toBe(false);
  });

  test("a different quantity or article is a different list", () => {
    expect(istiSastav(a, [{ artikalId: "a", kolicina: 1 }, { artikalId: "b", kolicina: 3 }])).toBe(false);
    expect(istiSastav(a, [{ artikalId: "a", kolicina: 1 }, { artikalId: "c", kolicina: 2 }])).toBe(false);
  });

  test("a different length is a different list", () => {
    expect(istiSastav(a, [a[0]])).toBe(false);
    expect(istiSastav([a[0]], a)).toBe(false);
    expect(istiSastav([], a)).toBe(false);
  });
});
