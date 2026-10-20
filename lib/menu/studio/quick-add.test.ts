// ScanMe Menu V1 — K10: quick entry. One row ("Naziv" + "Cena") and the table
// of up to 50 rows share one check; the server repeats it.

import { describe, expect, test } from "vitest";
import { MENU_TEXT } from "../limits";
import {
  jePrazanRed,
  MENU_STUDIO_MAX_QUICK_ROWS,
  proveriBrziRed,
  proveriTabelu,
  type TabelaRed,
} from "./quick-add";

describe("proveriBrziRed", () => {
  test("a clean name and a price pass", () => {
    expect(proveriBrziRed({ naziv: "Gibanica", cena: "560" })).toEqual({ ok: true, naziv: "Gibanica", cena: 560 });
  });

  test("the name is cleaned: trimmed and inner whitespace collapsed", () => {
    expect(proveriBrziRed({ naziv: "  Pasulj \t  sa   kobasicom \n", cena: "1.490" })).toEqual({
      ok: true,
      naziv: "Pasulj sa kobasicom",
      cena: 1490,
    });
  });

  test("an empty price is allowed in the draft", () => {
    expect(proveriBrziRed({ naziv: "Gibanica", cena: "" })).toEqual({ ok: true, naziv: "Gibanica", cena: null });
  });

  test("the name is required", () => {
    expect(proveriBrziRed({ naziv: "", cena: "100" })).toEqual({ ok: false, naziv: "obavezan", cena: null });
    expect(proveriBrziRed({ naziv: "  \t ", cena: "100" })).toEqual({ ok: false, naziv: "obavezan", cena: null });
  });

  test("the name may be exactly the maximum, one more is predugacak", () => {
    const najvise = "a".repeat(MENU_TEXT.articleName);
    expect(proveriBrziRed({ naziv: najvise, cena: "" })).toEqual({ ok: true, naziv: najvise, cena: null });
    expect(proveriBrziRed({ naziv: `${najvise}a`, cena: "" })).toEqual({
      ok: false,
      naziv: "predugacak",
      cena: null,
    });
    expect(MENU_TEXT.articleName).toBe(120);
  });

  test("the length is counted after cleaning, not before", () => {
    const saRazmacima = `  ${"a".repeat(MENU_TEXT.articleName)}   `;
    expect(proveriBrziRed({ naziv: saRazmacima, cena: "" }).ok).toBe(true);
  });

  test("a bad price is reported with its reason", () => {
    expect(proveriBrziRed({ naziv: "Gibanica", cena: "12,5" })).toEqual({ ok: false, naziv: null, cena: "decimale" });
    expect(proveriBrziRed({ naziv: "Gibanica", cena: "-1" })).toEqual({ ok: false, naziv: null, cena: "negativna" });
    expect(proveriBrziRed({ naziv: "Gibanica", cena: "abc" })).toEqual({ ok: false, naziv: null, cena: "neispravna" });
    expect(proveriBrziRed({ naziv: "Gibanica", cena: "1.000.001" })).toEqual({
      ok: false,
      naziv: null,
      cena: "prevelika",
    });
  });

  test("name and price errors are reported together, per field", () => {
    expect(proveriBrziRed({ naziv: "", cena: "x" })).toEqual({ ok: false, naziv: "obavezan", cena: "neispravna" });
    expect(proveriBrziRed({ naziv: "a".repeat(121), cena: "1,5" })).toEqual({
      ok: false,
      naziv: "predugacak",
      cena: "decimale",
    });
  });
});

describe("jePrazanRed", () => {
  test("a row is empty only when both name and price are blank", () => {
    expect(jePrazanRed({ naziv: "", cena: "" })).toBe(true);
    expect(jePrazanRed({ naziv: "  ", cena: " \t" })).toBe(true);
    expect(jePrazanRed({ naziv: "Gibanica", cena: "" })).toBe(false);
    expect(jePrazanRed({ naziv: "", cena: "100" })).toBe(false);
    expect(jePrazanRed({ naziv: " ", cena: "0" })).toBe(false);
  });
});

describe("proveriTabelu", () => {
  const sekcije = new Set(["sc_a", "sc_b"]);
  const red = (naziv: string, cena: string, sekcijaId = "sc_a"): TabelaRed => ({ naziv, cena, sekcijaId });

  test("blank rows are ignored and the table's own indexes are kept", () => {
    const ishod = proveriTabelu(
      [red("", ""), red("Gibanica", "560"), red(" ", " "), red("Baklava", "360", "sc_b"), red("", "")],
      sekcije,
    );
    expect(ishod).toEqual({
      ok: true,
      redovi: [
        { indeks: 1, naziv: "Gibanica", cena: 560, sekcijaId: "sc_a" },
        { indeks: 3, naziv: "Baklava", cena: 360, sekcijaId: "sc_b" },
      ],
    });
  });

  test("names are cleaned and an empty price becomes null", () => {
    const ishod = proveriTabelu([red("  Prebranac   sa lukom ", "")], sekcije);
    expect(ishod).toEqual({
      ok: true,
      redovi: [{ indeks: 0, naziv: "Prebranac sa lukom", cena: null, sekcijaId: "sc_a" }],
    });
  });

  test("a table with nothing filled in is prazno", () => {
    expect(proveriTabelu([], sekcije)).toEqual({ ok: false, razlog: "prazno", greske: [] });
    expect(proveriTabelu([red("", ""), red("  ", "")], sekcije)).toEqual({ ok: false, razlog: "prazno", greske: [] });
  });

  test("exactly the maximum of filled rows passes, one more is previse", () => {
    const redovi = (n: number) => Array.from({ length: n }, (_, i) => red(`Jelo ${i + 1}`, String(100 + i)));
    const ok = proveriTabelu(redovi(MENU_STUDIO_MAX_QUICK_ROWS), sekcije);
    expect(ok.ok).toBe(true);
    expect(MENU_STUDIO_MAX_QUICK_ROWS).toBe(50);
    expect(proveriTabelu(redovi(MENU_STUDIO_MAX_QUICK_ROWS + 1), sekcije)).toEqual({
      ok: false,
      razlog: "previse",
      greske: [],
    });
  });

  test("blank rows do not count towards the maximum", () => {
    const redovi = [
      ...Array.from({ length: MENU_STUDIO_MAX_QUICK_ROWS }, (_, i) => red(`Jelo ${i + 1}`, "100")),
      ...Array.from({ length: 10 }, () => red("", "")),
    ];
    expect(proveriTabelu(redovi, sekcije).ok).toBe(true);
  });

  test("a row aimed at an unknown section is reported with sekcija: true", () => {
    const ishod = proveriTabelu([red("Gibanica", "560", "sc_nema")], sekcije);
    expect(ishod).toEqual({
      ok: false,
      razlog: "greske",
      greske: [{ indeks: 0, naziv: null, cena: null, sekcija: true, duplikat: null }],
    });
  });

  test("mixed errors are listed per row index, valid rows are not listed", () => {
    const ishod = proveriTabelu(
      [
        red("Gibanica", "560"), // 0 ok
        red("", ""), // 1 blank, ignored
        red("", "300"), // 2 name missing
        red("Baklava", "3,5"), // 3 decimals
        red("Tufahije", "390", "sc_x"), // 4 bad section
        red("a".repeat(121), "abc", "sc_y"), // 5 everything wrong
        red("Palačinke", ""), // 6 ok, no price
      ],
      sekcije,
    );
    expect(ishod).toEqual({
      ok: false,
      razlog: "greske",
      greske: [
        { indeks: 2, naziv: "obavezan", cena: null, sekcija: false, duplikat: null },
        { indeks: 3, naziv: null, cena: "decimale", sekcija: false, duplikat: null },
        { indeks: 4, naziv: null, cena: null, sekcija: true, duplikat: null },
        { indeks: 5, naziv: "predugacak", cena: "neispravna", sekcija: true, duplikat: null },
      ],
    });
  });

  test("a price without a name is an error, not a blank row", () => {
    const ishod = proveriTabelu([red("", "100")], sekcije);
    expect(ishod).toEqual({
      ok: false,
      razlog: "greske",
      greske: [{ indeks: 0, naziv: "obavezan", cena: null, sekcija: false, duplikat: null }],
    });
  });
});

describe("proveriTabelu: the same name twice in one table (K10)", () => {
  test("the later row points at the first one; spelling, case and spaces do not matter", () => {
    const sekcije = new Set(["s1"]);
    const rezultat = proveriTabelu(
      [
        { naziv: "Limunada", cena: "290", sekcijaId: "s1" },
        { naziv: "Kafa", cena: "180", sekcijaId: "s1" },
        { naziv: "  limunada ", cena: "300", sekcijaId: "s1" },
      ],
      sekcije,
    );
    expect(rezultat).toEqual({
      ok: false,
      razlog: "greske",
      greske: [{ indeks: 2, naziv: null, cena: null, sekcija: false, duplikat: 0 }],
    });
  });
});
