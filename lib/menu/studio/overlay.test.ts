// ScanMe Menu V1 — K10: the queued (not yet confirmed) prices laid over the
// server data. What no queued value touches keeps its identity, so React.memo
// skips it.

import { describe, expect, test } from "vitest";
import type { CasValue } from "../cas";
import { kljucCene } from "./autosave-queue";
import type { StudioArtikal, StudioRadniSadrzaj, StudioRed, StudioSekcija } from "./model";
import { sadrzajSaCekanjem } from "./overlay";

const artikal = (id: string, cena: number | null): StudioArtikal => ({
  id,
  key: id,
  vrsta: "item",
  naziv: `Jelo ${id}`,
  opis: null,
  cena,
  kolicina: null,
  jedinica: null,
  medij: "none",
  ikonica: null,
  varijante: false,
  proveriCenu: false,
});

const red = (sekcijaKey: string, id: string, cena: number | null, redosled = 0): StudioRed => ({
  prikazId: `${sekcijaKey}/${id}`,
  redosled,
  sakriven: false,
  artikal: artikal(id, cena),
});

const sekcija = (key: string, redovi: StudioRed[]): StudioSekcija => ({
  id: key,
  key,
  naziv: `Sekcija ${key}`,
  redosled: 0,
  redovi,
});

/** Page with two sections; "ar_c" is placed in both (a shared article). */
function sadrzaj(): StudioRadniSadrzaj {
  return {
    stranica: { id: "pg_1", key: "pg_1", naziv: "Kompletan meni", podrazumevana: true, arhivirana: false },
    sekcije: [
      sekcija("sc_a", [red("sc_a", "ar_a", 100, 0), red("sc_a", "ar_b", 200, 1), red("sc_a", "ar_c", 300, 2)]),
      sekcija("sc_b", [red("sc_b", "ar_c", 300, 0), red("sc_b", "ar_d", null, 1)]),
      sekcija("sc_c", [red("sc_c", "ar_e", 500, 0)]),
    ],
    skraceno: false,
  };
}

const cekanje = (...parovi: [string, CasValue][]) => new Map<string, CasValue>(parovi);

describe("sadrzajSaCekanjem: nothing to show", () => {
  test("nothing pending returns the very same object", () => {
    const ulaz = sadrzaj();
    expect(sadrzajSaCekanjem(ulaz, cekanje())).toBe(ulaz);
  });

  test("a pending key for an article that is not on the page changes nothing", () => {
    const ulaz = sadrzaj();
    expect(sadrzajSaCekanjem(ulaz, cekanje([kljucCene("ar_nema"), 999]))).toBe(ulaz);
  });

  test("a pending value equal to the shown one changes nothing", () => {
    const ulaz = sadrzaj();
    expect(sadrzajSaCekanjem(ulaz, cekanje([kljucCene("ar_a"), 100]))).toBe(ulaz);
    expect(sadrzajSaCekanjem(ulaz, cekanje([kljucCene("ar_d"), null]))).toBe(ulaz);
  });

  test("keys that are not prices are ignored", () => {
    const ulaz = sadrzaj();
    expect(sadrzajSaCekanjem(ulaz, cekanje(["naziv:ar_a", "Novi naziv"]))).toBe(ulaz);
  });
});

describe("sadrzajSaCekanjem: a queued price", () => {
  test("changes the price of the touched row only", () => {
    const ulaz = sadrzaj();
    const izlaz = sadrzajSaCekanjem(ulaz, cekanje([kljucCene("ar_b"), 250]));
    expect(izlaz).not.toBe(ulaz);
    const cene = izlaz.sekcije.flatMap((s) => s.redovi.map((r) => [r.prikazId, r.artikal.cena]));
    expect(cene).toEqual([
      ["sc_a/ar_a", 100],
      ["sc_a/ar_b", 250],
      ["sc_a/ar_c", 300],
      ["sc_b/ar_c", 300],
      ["sc_b/ar_d", null],
      ["sc_c/ar_e", 500],
    ]);
  });

  test("everything else keeps its identity", () => {
    const ulaz = sadrzaj();
    const izlaz = sadrzajSaCekanjem(ulaz, cekanje([kljucCene("ar_b"), 250]));
    // Untouched sections are the same objects.
    expect(izlaz.sekcije[1]).toBe(ulaz.sekcije[1]);
    expect(izlaz.sekcije[2]).toBe(ulaz.sekcije[2]);
    // The touched section is new, but its untouched rows are not.
    expect(izlaz.sekcije[0]).not.toBe(ulaz.sekcije[0]);
    expect(izlaz.sekcije[0].redovi[0]).toBe(ulaz.sekcije[0].redovi[0]);
    expect(izlaz.sekcije[0].redovi[2]).toBe(ulaz.sekcije[0].redovi[2]);
    expect(izlaz.sekcije[0].redovi[1]).not.toBe(ulaz.sekcije[0].redovi[1]);
    // The page itself and the other fields of the touched row carry over.
    expect(izlaz.stranica).toBe(ulaz.stranica);
    expect(izlaz.sekcije[0].redovi[1].prikazId).toBe("sc_a/ar_b");
    expect(izlaz.sekcije[0].redovi[1].artikal.naziv).toBe(ulaz.sekcije[0].redovi[1].artikal.naziv);
    expect(izlaz.sekcije[0].naziv).toBe(ulaz.sekcije[0].naziv);
  });

  test("a shared article changes on every page place at once", () => {
    const ulaz = sadrzaj();
    const izlaz = sadrzajSaCekanjem(ulaz, cekanje([kljucCene("ar_c"), 350]));
    expect(izlaz.sekcije[0].redovi[2].artikal.cena).toBe(350);
    expect(izlaz.sekcije[1].redovi[0].artikal.cena).toBe(350);
    // Section c holds no such article and stays the same object.
    expect(izlaz.sekcije[2]).toBe(ulaz.sekcije[2]);
  });

  test("several pending prices apply together", () => {
    const izlaz = sadrzajSaCekanjem(sadrzaj(), cekanje([kljucCene("ar_a"), 110], [kljucCene("ar_e"), 550], [kljucCene("ar_d"), 40]));
    expect(izlaz.sekcije[0].redovi[0].artikal.cena).toBe(110);
    expect(izlaz.sekcije[1].redovi[1].artikal.cena).toBe(40);
    expect(izlaz.sekcije[2].redovi[0].artikal.cena).toBe(550);
  });

  test("a pending null clears the price", () => {
    const izlaz = sadrzajSaCekanjem(sadrzaj(), cekanje([kljucCene("ar_a"), null]));
    expect(izlaz.sekcije[0].redovi[0].artikal.cena).toBeNull();
  });

  test("a pending price fills an article that had none", () => {
    const izlaz = sadrzajSaCekanjem(sadrzaj(), cekanje([kljucCene("ar_d"), 420]));
    expect(izlaz.sekcije[1].redovi[1].artikal.cena).toBe(420);
  });

  test("the input is never mutated", () => {
    const ulaz = sadrzaj();
    const pre = JSON.stringify(ulaz);
    sadrzajSaCekanjem(ulaz, cekanje([kljucCene("ar_b"), 250], [kljucCene("ar_c"), null]));
    expect(JSON.stringify(ulaz)).toBe(pre);
  });

  test("the result is stable: overlaying the same pending twice gives equal content", () => {
    const ulaz = sadrzaj();
    const pending = cekanje([kljucCene("ar_b"), 250]);
    expect(sadrzajSaCekanjem(ulaz, pending)).toEqual(sadrzajSaCekanjem(ulaz, pending));
  });
});
