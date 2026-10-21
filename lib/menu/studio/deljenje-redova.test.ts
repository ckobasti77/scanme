// ScanMe Menu V1 — K33 (audit C6): the answer of the server arrives as new
// objects for every row; the same data must keep the old objects so React.memo
// of a row can skip.

import { describe, expect, test } from "vitest";
import { jednakoPoVrednosti, zadrziIste, zadrziSadrzaj } from "./deljenje-redova";
import type { StudioArtikal, StudioRadniSadrzaj, StudioRed, StudioSekcija } from "./model";

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

/** `redova` rows in each of three sections (400 articles is `sadrzaj(134)`). */
function sadrzaj(redova = 3): StudioRadniSadrzaj {
  return {
    stranica: { id: "pg_1", key: "pg_1", naziv: "Kompletan meni", podrazumevana: true, arhivirana: false },
    sekcije: ["sc_a", "sc_b", "sc_c"].map((key) =>
      sekcija(
        key,
        Array.from({ length: redova }, (_, i) => red(key, `${key}_${i}`, 100 + i, i)),
      ),
    ),
    skraceno: false,
  };
}

/** What the next answer of the server looks like: the same data in brand-new objects. */
const nova = <T>(vrednost: T): T => JSON.parse(JSON.stringify(vrednost)) as T;

describe("jednakoPoVrednosti", () => {
  test("primitives, null and NaN", () => {
    expect(jednakoPoVrednosti(1, 1)).toBe(true);
    expect(jednakoPoVrednosti("a", "a")).toBe(true);
    expect(jednakoPoVrednosti(null, null)).toBe(true);
    expect(jednakoPoVrednosti(Number.NaN, Number.NaN)).toBe(true);
    expect(jednakoPoVrednosti(1, 2)).toBe(false);
    expect(jednakoPoVrednosti(null, 0)).toBe(false);
    expect(jednakoPoVrednosti(null, {})).toBe(false);
  });

  test("objects and arrays are compared by value, deeply", () => {
    expect(jednakoPoVrednosti({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true);
    expect(jednakoPoVrednosti({ a: 1, b: [1, { c: null }] }, { a: 1, b: [1, { c: 0 }] })).toBe(false);
    expect(jednakoPoVrednosti([1, 2], [1, 2, 3])).toBe(false);
    expect(jednakoPoVrednosti([], {})).toBe(false);
    expect(jednakoPoVrednosti({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(jednakoPoVrednosti({ a: undefined }, { b: undefined })).toBe(false);
  });
});

describe("zadrziIste: a list of rows", () => {
  const kljuc = (stavka: StudioRed) => stavka.prikazId;
  const lista = () => [red("s", "a", 100, 0), red("s", "b", 200, 1), red("s", "c", 300, 2)];

  test("the same data in new objects returns the old objects and the old array", () => {
    const prethodni = lista();
    const rezultat = zadrziIste(prethodni, nova(prethodni), kljuc);
    expect(rezultat).toBe(prethodni);
  });

  test("one changed row is the only new object", () => {
    const prethodni = lista();
    const dolazi = nova(prethodni);
    dolazi[1].artikal.cena = 250;
    const rezultat = zadrziIste(prethodni, dolazi, kljuc);
    expect(rezultat).not.toBe(prethodni);
    expect(rezultat[0]).toBe(prethodni[0]);
    expect(rezultat[1]).toBe(dolazi[1]);
    expect(rezultat[1]).not.toBe(prethodni[1]);
    expect(rezultat[1].artikal.cena).toBe(250);
    expect(rezultat[2]).toBe(prethodni[2]);
  });

  test("a change deep inside a row (name, hidden, order) is seen", () => {
    for (const izmena of [
      (r: StudioRed) => (r.artikal.naziv = "Drugo ime"),
      (r: StudioRed) => (r.sakriven = true),
      (r: StudioRed) => (r.redosled = 9),
      (r: StudioRed) => (r.artikal.opis = "Nov opis"),
      (r: StudioRed) => (r.artikal.cena = null),
    ]) {
      const prethodni = lista();
      const dolazi = nova(prethodni);
      izmena(dolazi[0]);
      const rezultat = zadrziIste(prethodni, dolazi, kljuc);
      expect(rezultat[0]).toBe(dolazi[0]);
      expect(rezultat[1]).toBe(prethodni[1]);
    }
  });

  test("the same array comes back for the same array", () => {
    const prethodni = lista();
    expect(zadrziIste(prethodni, prethodni, kljuc)).toBe(prethodni);
  });

  test("a changed order is a new array, with the old objects in the new places", () => {
    const prethodni = lista();
    const dolazi = nova(prethodni).reverse();
    const rezultat = zadrziIste(prethodni, dolazi, kljuc);
    expect(rezultat).not.toBe(prethodni);
    expect(rezultat.map(kljuc)).toEqual(["s/c", "s/b", "s/a"]);
    expect(rezultat[0]).toBe(prethodni[2]);
    expect(rezultat[1]).toBe(prethodni[1]);
    expect(rezultat[2]).toBe(prethodni[0]);
  });

  test("an added and a removed row make a new array and keep the rest", () => {
    const prethodni = lista();
    const dodat = [...nova(prethodni), red("s", "d", 400, 3)];
    const sDodatim = zadrziIste(prethodni, dodat, kljuc);
    expect(sDodatim).not.toBe(prethodni);
    expect(sDodatim).toHaveLength(4);
    expect(sDodatim.slice(0, 3)).toEqual(prethodni);
    sDodatim.slice(0, 3).forEach((stavka, i) => expect(stavka).toBe(prethodni[i]));

    const bezSrednjeg = nova(prethodni).filter((stavka) => stavka.prikazId !== "s/b");
    const sUklonjenim = zadrziIste(prethodni, bezSrednjeg, kljuc);
    expect(sUklonjenim).toHaveLength(2);
    expect(sUklonjenim[0]).toBe(prethodni[0]);
    expect(sUklonjenim[1]).toBe(prethodni[2]);
  });

  test("an empty list stays the old empty list; nothing before gives the new objects", () => {
    const prazno: StudioRed[] = [];
    expect(zadrziIste(prazno, [], kljuc)).toBe(prazno);
    const dolazi = lista();
    const rezultat = zadrziIste([], dolazi, kljuc);
    expect(rezultat).toHaveLength(3);
    rezultat.forEach((stavka, i) => expect(stavka).toBe(dolazi[i]));
  });

  test("neither input is changed", () => {
    const prethodni = lista();
    const dolazi = nova(prethodni);
    dolazi[0].artikal.cena = 1;
    const prethodniKopija = nova(prethodni);
    const dolaziKopija = nova(dolazi);
    zadrziIste(prethodni, dolazi, kljuc);
    expect(prethodni).toEqual(prethodniKopija);
    expect(dolazi).toEqual(dolaziKopija);
  });
});

describe("zadrziSadrzaj: the content of a page", () => {
  test("nothing before: the new content as it is", () => {
    const dolazi = sadrzaj();
    expect(zadrziSadrzaj(undefined, dolazi)).toBe(dolazi);
    expect(zadrziSadrzaj(null, dolazi)).toBe(dolazi);
  });

  test("the same data in new objects returns the very same content", () => {
    const prethodni = sadrzaj();
    expect(zadrziSadrzaj(prethodni, nova(prethodni))).toBe(prethodni);
  });

  test("one saved price: only that row, its section and the content are new", () => {
    const prethodni = sadrzaj(134); // 3 x 134 = 402 rows, like the big izlog menu
    const dolazi = nova(prethodni);
    dolazi.sekcije[1].redovi[70].artikal.cena = 999;
    const rezultat = zadrziSadrzaj(prethodni, dolazi);

    expect(rezultat).not.toBe(prethodni);
    expect(rezultat.stranica).toBe(prethodni.stranica);
    expect(rezultat.sekcije[0]).toBe(prethodni.sekcije[0]);
    expect(rezultat.sekcije[2]).toBe(prethodni.sekcije[2]);
    expect(rezultat.sekcije[1]).not.toBe(prethodni.sekcije[1]);

    let nepromenjenih = 0;
    let novih = 0;
    rezultat.sekcije.forEach((s, si) =>
      s.redovi.forEach((r, ri) => {
        if (r === prethodni.sekcije[si].redovi[ri]) nepromenjenih++;
        else novih++;
      }),
    );
    expect(novih).toBe(1);
    expect(nepromenjenih).toBe(401);
    expect(rezultat.sekcije[1].redovi[70].artikal.cena).toBe(999);
    expect(rezultat).toEqual(dolazi);
  });

  test("a renamed section or page keeps all the rows", () => {
    const prethodni = sadrzaj();
    const dolazi = nova(prethodni);
    dolazi.sekcije[0].naziv = "Preimenovana";
    dolazi.stranica.naziv = "Drugi naziv";
    const rezultat = zadrziSadrzaj(prethodni, dolazi);
    expect(rezultat).not.toBe(prethodni);
    expect(rezultat.stranica).toBe(dolazi.stranica);
    expect(rezultat.sekcije[0]).not.toBe(prethodni.sekcije[0]);
    expect(rezultat.sekcije[0].naziv).toBe("Preimenovana");
    expect(rezultat.sekcije[0].redovi).toBe(prethodni.sekcije[0].redovi);
    expect(rezultat.sekcije[1]).toBe(prethodni.sekcije[1]);
  });

  test("the truncation flag alone makes a new content and keeps every section", () => {
    const prethodni = sadrzaj();
    const dolazi = nova(prethodni);
    dolazi.skraceno = true;
    const rezultat = zadrziSadrzaj(prethodni, dolazi);
    expect(rezultat).not.toBe(prethodni);
    expect(rezultat.skraceno).toBe(true);
    expect(rezultat.stranica).toBe(prethodni.stranica);
    expect(rezultat.sekcije).toBe(prethodni.sekcije);
  });

  test("a row moved to another section: both sections are new, every row object is kept", () => {
    const prethodni = sadrzaj();
    const dolazi = nova(prethodni);
    const [pomeren] = dolazi.sekcije[0].redovi.splice(1, 1);
    dolazi.sekcije[2].redovi.push(pomeren);
    const rezultat = zadrziSadrzaj(prethodni, dolazi);

    expect(rezultat.sekcije[0]).not.toBe(prethodni.sekcije[0]);
    expect(rezultat.sekcije[1]).toBe(prethodni.sekcije[1]);
    expect(rezultat.sekcije[2]).not.toBe(prethodni.sekcije[2]);
    expect(rezultat.sekcije[0].redovi[0]).toBe(prethodni.sekcije[0].redovi[0]);
    expect(rezultat.sekcije[0].redovi[1]).toBe(prethodni.sekcije[0].redovi[2]);
    // The moved row is a row of another section now (its `prikazId` is its own), so it has no old twin there.
    expect(rezultat.sekcije[2].redovi.slice(0, 3)).toEqual(prethodni.sekcije[2].redovi);
    rezultat.sekcije[2].redovi.slice(0, 3).forEach((r, i) => expect(r).toBe(prethodni.sekcije[2].redovi[i]));
  });

  test("a moved section keeps its object; an added section is new", () => {
    const prethodni = sadrzaj();
    const dolazi = nova(prethodni);
    dolazi.sekcije.reverse();
    dolazi.sekcije.push(sekcija("sc_d", [red("sc_d", "d_0", 1)]));
    const rezultat = zadrziSadrzaj(prethodni, dolazi);
    expect(rezultat.sekcije.map((s) => s.id)).toEqual(["sc_c", "sc_b", "sc_a", "sc_d"]);
    expect(rezultat.sekcije[0]).toBe(prethodni.sekcije[2]);
    expect(rezultat.sekcije[1]).toBe(prethodni.sekcije[1]);
    expect(rezultat.sekcije[2]).toBe(prethodni.sekcije[0]);
    expect(rezultat.sekcije[3]).toBe(dolazi.sekcije[3]);
  });

  test("another page shares nothing", () => {
    const prethodni = sadrzaj();
    const dolazi: StudioRadniSadrzaj = {
      stranica: { id: "pg_2", key: "pg_2", naziv: "Pice", podrazumevana: false, arhivirana: false },
      sekcije: [sekcija("sc_x", [red("sc_x", "x_0", 5)])],
      skraceno: false,
    };
    const rezultat = zadrziSadrzaj(prethodni, dolazi);
    expect(rezultat.sekcije[0]).toBe(dolazi.sekcije[0]);
    expect(rezultat.stranica).toBe(dolazi.stranica);
  });
});
