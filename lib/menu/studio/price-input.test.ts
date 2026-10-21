// ScanMe Menu V1 — K10: the price as the editor types it. Whole dinars only;
// the owner types it the way it is printed, anything else is refused with a reason.

import { describe, expect, test } from "vitest";
import { formatCenaPolje, parseCenaUnos } from "./price-input";

describe("parseCenaUnos: accepted input", () => {
  test.each([
    ["1490", 1490],
    ["1.490", 1490],
    ["1 490", 1490],
    ["1490 RSD", 1490],
    ["1490 din", 1490],
    ["1490 rsd", 1490],
    ["1490 DIN.", 1490],
    ["1490 dinara", 1490],
    ["1.490 RSD", 1490],
    ["1 490 din", 1490],
    ["  250  ", 250],
    ["0", 0],
    ["12.000", 12000],
    ["1.000.000", 1_000_000],
    ["1000000", 1_000_000],
  ])("%j is %j", (text, cena) => {
    expect(parseCenaUnos(text)).toEqual({ ok: true, cena });
  });

  test("no-break and thin spaces group thousands like a plain space", () => {
    expect(parseCenaUnos("1 490")).toEqual({ ok: true, cena: 1490 });
    expect(parseCenaUnos("1 490")).toEqual({ ok: true, cena: 1490 });
    expect(parseCenaUnos("1 490")).toEqual({ ok: true, cena: 1490 });
  });

  test("an empty field means no price yet", () => {
    expect(parseCenaUnos("")).toEqual({ ok: true, cena: null });
    expect(parseCenaUnos("   ")).toEqual({ ok: true, cena: null });
  });
});

describe("parseCenaUnos: refused input", () => {
  test("above the ceiling is prevelika", () => {
    expect(parseCenaUnos("1.000.001")).toEqual({ ok: false, greska: "prevelika" });
    expect(parseCenaUnos("1000001")).toEqual({ ok: false, greska: "prevelika" });
    expect(parseCenaUnos("99999999999999999999")).toEqual({ ok: false, greska: "prevelika" });
  });

  test.each(["1490,50", "12.5", "1.49", "1,5", "1.490,50", "0,5"])("%j has decimals", (text) => {
    expect(parseCenaUnos(text)).toEqual({ ok: false, greska: "decimale" });
  });

  test("negative input is negativna, whatever follows", () => {
    expect(parseCenaUnos("-5")).toEqual({ ok: false, greska: "negativna" });
    expect(parseCenaUnos("  -1.490 RSD")).toEqual({ ok: false, greska: "negativna" });
    expect(parseCenaUnos("-abc")).toEqual({ ok: false, greska: "negativna" });
  });

  test.each(["abc", "1..490", "1.4.9", "12a", "RSD 1490", "1490 eur", "."])(
    "%j is neispravna",
    (text) => {
      expect(parseCenaUnos(text)).toEqual({ ok: false, greska: "neispravna" });
    },
  );
});

describe("formatCenaPolje", () => {
  test("groups thousands with dots, no currency", () => {
    expect(formatCenaPolje(1490)).toBe("1.490");
    expect(formatCenaPolje(100)).toBe("100");
    expect(formatCenaPolje(1_000_000)).toBe("1.000.000");
    expect(formatCenaPolje(12_000)).toBe("12.000");
    expect(formatCenaPolje(0)).toBe("0");
  });

  test("no price is an empty field", () => {
    expect(formatCenaPolje(null)).toBe("");
  });

  test("what the field shows reads back as the same price", () => {
    for (const cena of [0, 7, 100, 999, 1000, 1490, 12_345, 999_999, 1_000_000]) {
      expect(parseCenaUnos(formatCenaPolje(cena))).toEqual({ ok: true, cena });
    }
  });
});
