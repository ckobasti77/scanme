// ScanMe Menu V1 — K11: where a moved article lands. Covers the pure layout
// helpers behind drag and drop and `Premesti`: the position lookup,
// `postaviNaMesto` (clamping, unknown ids), the plan that is sent to the server
// (`planIzRasporeda`, `planNaMesto`: index counted WITHOUT the moved row),
// `pomeriPrevlacenjem` (arrayMove semantics inside a section, before / after a
// row of another section, end of a section), `primeniPremestanje` (what the
// screen shows until the server confirms), and the section moves. A property
// check ties the plan and its application to `postaviNaMesto` for every row and
// every target in two layouts.

import { describe, expect, test } from "vitest";
import {
  planIzRasporeda,
  planNaMesto,
  planSekcije,
  pomeriPrevlacenjem,
  pozicijaPrikaza,
  postaviNaMesto,
  primeniPremestanje,
  primeniPremestanjeSekcije,
  rasporedIz,
  type PlanPremestanja,
  type Raspored,
} from "./reorder";

/** Three sections: a full one, one with two rows, an empty one. */
const L: Raspored = [
  { id: "s1", redovi: ["a", "b", "c"] },
  { id: "s2", redovi: ["d", "e"] },
  { id: "s3", redovi: [] },
];

/** A second shape: single-row sections, so a move can empty the source. */
const L2: Raspored = [
  { id: "s1", redovi: ["a"] },
  { id: "s2", redovi: ["b", "c"] },
  { id: "s3", redovi: ["d"] },
];

function kopija<T>(vrednost: T): T {
  return JSON.parse(JSON.stringify(vrednost)) as T;
}

type Red = { prikazId: string };
type Sekcija = { id: string; naziv: string; redovi: Red[] };

/** Section objects (with row objects) that mirror a layout. */
function sekcijeIz(raspored: Raspored): Sekcija[] {
  return raspored.map((sekcija) => ({
    id: sekcija.id,
    naziv: `Sekcija ${sekcija.id}`,
    redovi: sekcija.redovi.map((prikazId) => ({ prikazId })),
  }));
}

describe("rasporedIz and pozicijaPrikaza", () => {
  test("rasporedIz keeps only the ids, in order", () => {
    const sekcije = [
      { id: "s1", naziv: "Prva", redovi: [{ prikazId: "a", cena: 1 }, { prikazId: "b", cena: 2 }] },
      { id: "s2", naziv: "Druga", redovi: [] },
    ];
    expect(rasporedIz(sekcije)).toEqual([
      { id: "s1", redovi: ["a", "b"] },
      { id: "s2", redovi: [] },
    ]);
  });

  test("rasporedIz of nothing is an empty layout", () => {
    expect(rasporedIz([])).toEqual([]);
  });

  test("pozicijaPrikaza gives section, 0-based index and section length", () => {
    expect(pozicijaPrikaza(L, "a")).toEqual({ sekcijaId: "s1", indeks: 0, ukupno: 3 });
    expect(pozicijaPrikaza(L, "c")).toEqual({ sekcijaId: "s1", indeks: 2, ukupno: 3 });
    expect(pozicijaPrikaza(L, "e")).toEqual({ sekcijaId: "s2", indeks: 1, ukupno: 2 });
  });

  test("pozicijaPrikaza is null for a row that is not on the page", () => {
    expect(pozicijaPrikaza(L, "zzz")).toBeNull();
    expect(pozicijaPrikaza([], "a")).toBeNull();
  });
});

describe("postaviNaMesto", () => {
  test("moves inside a section; the index counts the section without the moved row", () => {
    expect(postaviNaMesto(L, "a", "s1", 0)).toEqual(L);
    expect(postaviNaMesto(L, "a", "s1", 1)[0].redovi).toEqual(["b", "a", "c"]);
    expect(postaviNaMesto(L, "a", "s1", 2)[0].redovi).toEqual(["b", "c", "a"]);
    expect(postaviNaMesto(L, "c", "s1", 0)[0].redovi).toEqual(["c", "a", "b"]);
    expect(postaviNaMesto(L, "b", "s1", 1)[0].redovi).toEqual(["a", "b", "c"]);
  });

  test("moves to another section, including an empty one and leaving one empty", () => {
    const uDrugu = postaviNaMesto(L, "b", "s2", 1);
    expect(uDrugu[0].redovi).toEqual(["a", "c"]);
    expect(uDrugu[1].redovi).toEqual(["d", "b", "e"]);

    const uPraznu = postaviNaMesto(L, "a", "s3", 0);
    expect(uPraznu[0].redovi).toEqual(["b", "c"]);
    expect(uPraznu[2].redovi).toEqual(["a"]);

    const isprazni = postaviNaMesto(L2, "a", "s2", 0);
    expect(isprazni[0].redovi).toEqual([]);
    expect(isprazni[1].redovi).toEqual(["a", "b", "c"]);
  });

  test("clamps the index to the section and truncates a fraction", () => {
    expect(postaviNaMesto(L, "a", "s2", 99)[1].redovi).toEqual(["d", "e", "a"]);
    expect(postaviNaMesto(L, "a", "s2", -4)[1].redovi).toEqual(["a", "d", "e"]);
    expect(postaviNaMesto(L, "a", "s1", 99)[0].redovi).toEqual(["b", "c", "a"]);
    expect(postaviNaMesto(L, "c", "s1", -1)[0].redovi).toEqual(["c", "a", "b"]);
    expect(postaviNaMesto(L, "a", "s2", 1.9)[1].redovi).toEqual(["d", "a", "e"]);
  });

  test("an unknown row or an unknown section returns the SAME object", () => {
    expect(postaviNaMesto(L, "zzz", "s1", 0)).toBe(L);
    expect(postaviNaMesto(L, "a", "nema", 0)).toBe(L);
    expect(postaviNaMesto([], "a", "s1", 0)).toEqual([]);
  });

  test("sections the move does not touch keep their identity; the input is not changed", () => {
    const pocetni = kopija(L);
    const naDrugu = postaviNaMesto(L, "a", "s2", 0);
    expect(naDrugu[2]).toBe(L[2]);
    expect(naDrugu[0]).not.toBe(L[0]);
    expect(naDrugu[1]).not.toBe(L[1]);

    const unutra = postaviNaMesto(L, "a", "s1", 2);
    expect(unutra[1]).toBe(L[1]);
    expect(unutra[2]).toBe(L[2]);

    expect(L).toEqual(pocetni);
  });

  test("a move never loses or duplicates a row", () => {
    const rezultat = postaviNaMesto(L, "c", "s2", 1);
    expect(rezultat.flatMap((sekcija) => sekcija.redovi).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("planIzRasporeda", () => {
  test("the row ends up where it was: null", () => {
    expect(planIzRasporeda(L, L, "a")).toBeNull();
    expect(planIzRasporeda(L, kopija(L), "e")).toBeNull();
  });

  test("a row that is missing from either layout: null", () => {
    expect(planIzRasporeda(L, L, "zzz")).toBeNull();
    const bezA: Raspored = [{ id: "s1", redovi: ["b", "c"] }, L[1], L[2]];
    expect(planIzRasporeda(L, bezA, "a")).toBeNull();
    expect(planIzRasporeda(bezA, L, "a")).toBeNull();
  });

  test("within a section, down: stands before the row that follows it now", () => {
    const konacni: Raspored = [{ id: "s1", redovi: ["b", "a", "c"] }, L[1], L[2]];
    expect(planIzRasporeda(L, konacni, "a")).toEqual({ prikazId: "a", uSekciju: "s1", prePrikaza: "c" });
  });

  test("within a section, down to the end: prePrikaza is null", () => {
    const konacni: Raspored = [{ id: "s1", redovi: ["b", "c", "a"] }, L[1], L[2]];
    expect(planIzRasporeda(L, konacni, "a")).toEqual({ prikazId: "a", uSekciju: "s1", prePrikaza: null });
  });

  test("within a section, up", () => {
    const naVrh: Raspored = [{ id: "s1", redovi: ["c", "a", "b"] }, L[1], L[2]];
    expect(planIzRasporeda(L, naVrh, "c")).toEqual({ prikazId: "c", uSekciju: "s1", prePrikaza: "a" });
    const jedanGore: Raspored = [{ id: "s1", redovi: ["a", "c", "b"] }, L[1], L[2]];
    expect(planIzRasporeda(L, jedanGore, "c")).toEqual({ prikazId: "c", uSekciju: "s1", prePrikaza: "b" });
  });

  test("to another section: the start, the middle, the end and an empty section", () => {
    const naPocetak: Raspored = [{ id: "s1", redovi: ["b", "c"] }, { id: "s2", redovi: ["a", "d", "e"] }, L[2]];
    expect(planIzRasporeda(L, naPocetak, "a")).toEqual({ prikazId: "a", uSekciju: "s2", prePrikaza: "d" });

    const uSredinu: Raspored = [{ id: "s1", redovi: ["b", "c"] }, { id: "s2", redovi: ["d", "a", "e"] }, L[2]];
    expect(planIzRasporeda(L, uSredinu, "a")).toEqual({ prikazId: "a", uSekciju: "s2", prePrikaza: "e" });

    const naKraj: Raspored = [{ id: "s1", redovi: ["b", "c"] }, { id: "s2", redovi: ["d", "e", "a"] }, L[2]];
    expect(planIzRasporeda(L, naKraj, "a")).toEqual({ prikazId: "a", uSekciju: "s2", prePrikaza: null });

    const uPraznu: Raspored = [{ id: "s1", redovi: ["b", "c"] }, L[1], { id: "s3", redovi: ["a"] }];
    expect(planIzRasporeda(L, uPraznu, "a")).toEqual({ prikazId: "a", uSekciju: "s3", prePrikaza: null });
  });

  test("the plan applied to the start layout gives the final layout (other rows keep their order)", () => {
    const konacni = postaviNaMesto(L, "b", "s2", 1);
    const plan = planIzRasporeda(L, konacni, "b");
    expect(plan).toEqual({ prikazId: "b", uSekciju: "s2", prePrikaza: "e" });
    expect(rasporedIz(primeniPremestanje(sekcijeIz(L), plan as PlanPremestanja))).toEqual(konacni);
  });
});

describe("planNaMesto (the Premesti dialog)", () => {
  test("the same place: null", () => {
    expect(planNaMesto(L, "a", "s1", 0)).toBeNull();
    expect(planNaMesto(L, "b", "s1", 1)).toBeNull();
    expect(planNaMesto(L, "c", "s1", 2)).toBeNull();
    expect(planNaMesto(L, "c", "s1", 99)).toBeNull();
    expect(planNaMesto(L, "d", "s2", 0)).toBeNull();
  });

  test("the index is counted WITHOUT the moved row", () => {
    // [a, b, c]: index 1 puts "a" between b and c, index 2 puts it at the end.
    expect(planNaMesto(L, "a", "s1", 1)).toEqual({ prikazId: "a", uSekciju: "s1", prePrikaza: "c" });
    expect(planNaMesto(L, "a", "s1", 2)).toEqual({ prikazId: "a", uSekciju: "s1", prePrikaza: null });
    expect(planNaMesto(L, "a", "s1", 99)).toEqual({ prikazId: "a", uSekciju: "s1", prePrikaza: null });
    expect(planNaMesto(L, "c", "s1", 0)).toEqual({ prikazId: "c", uSekciju: "s1", prePrikaza: "a" });
    expect(planNaMesto(L, "c", "s1", 1)).toEqual({ prikazId: "c", uSekciju: "s1", prePrikaza: "b" });
  });

  test("to another section", () => {
    expect(planNaMesto(L, "a", "s2", 0)).toEqual({ prikazId: "a", uSekciju: "s2", prePrikaza: "d" });
    expect(planNaMesto(L, "a", "s2", 1)).toEqual({ prikazId: "a", uSekciju: "s2", prePrikaza: "e" });
    expect(planNaMesto(L, "a", "s2", 2)).toEqual({ prikazId: "a", uSekciju: "s2", prePrikaza: null });
    expect(planNaMesto(L, "a", "s3", 0)).toEqual({ prikazId: "a", uSekciju: "s3", prePrikaza: null });
    expect(planNaMesto(L, "d", "s1", 1)).toEqual({ prikazId: "d", uSekciju: "s1", prePrikaza: "b" });
  });

  test("an unknown row or section: null", () => {
    expect(planNaMesto(L, "zzz", "s1", 0)).toBeNull();
    expect(planNaMesto(L, "a", "nema", 0)).toBeNull();
  });
});

describe("pomeriPrevlacenjem", () => {
  test("over a row of the same section: arrayMove semantics", () => {
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "c", posle: false })[0].redovi).toEqual(["b", "c", "a"]);
    expect(pomeriPrevlacenjem(L, "c", { vrsta: "red", prikazId: "a", posle: false })[0].redovi).toEqual(["c", "a", "b"]);
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "b", posle: false })[0].redovi).toEqual(["b", "a", "c"]);
    expect(pomeriPrevlacenjem(L, "b", { vrsta: "red", prikazId: "a", posle: false })[0].redovi).toEqual(["b", "a", "c"]);
  });

  test("over a row of the same section, `posle` makes no difference", () => {
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "c", posle: true })[0].redovi).toEqual(["b", "c", "a"]);
    expect(pomeriPrevlacenjem(L, "c", { vrsta: "red", prikazId: "a", posle: true })[0].redovi).toEqual(["c", "a", "b"]);
  });

  test("over itself, an unknown row or an unknown dragged row: the same object", () => {
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "a", posle: false })).toBe(L);
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "zzz", posle: false })).toBe(L);
    expect(pomeriPrevlacenjem(L, "zzz", { vrsta: "red", prikazId: "a", posle: false })).toBe(L);
    expect(pomeriPrevlacenjem(L, "zzz", { vrsta: "sekcija", sekcijaId: "s2" })).toBe(L);
  });

  test("over a row of another section: before it", () => {
    const rezultat = pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "d", posle: false });
    expect(rezultat[0].redovi).toEqual(["b", "c"]);
    expect(rezultat[1].redovi).toEqual(["a", "d", "e"]);

    const izTrece = pomeriPrevlacenjem(L, "e", { vrsta: "red", prikazId: "b", posle: false });
    expect(izTrece[0].redovi).toEqual(["a", "e", "b", "c"]);
    expect(izTrece[1].redovi).toEqual(["d"]);
  });

  test("over a row of another section: after it with `posle`", () => {
    const rezultat = pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "d", posle: true });
    expect(rezultat[0].redovi).toEqual(["b", "c"]);
    expect(rezultat[1].redovi).toEqual(["d", "a", "e"]);

    expect(pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "e", posle: true })[1].redovi).toEqual(["d", "e", "a"]);
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "red", prikazId: "e", posle: false })[1].redovi).toEqual(["d", "a", "e"]);
    expect(pomeriPrevlacenjem(L, "d", { vrsta: "red", prikazId: "b", posle: true })[0].redovi).toEqual(["a", "b", "d", "c"]);
  });

  test("over another section (header or empty section): the end of that section", () => {
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "sekcija", sekcijaId: "s2" })[1].redovi).toEqual(["d", "e", "a"]);
    const uPraznu = pomeriPrevlacenjem(L, "a", { vrsta: "sekcija", sekcijaId: "s3" });
    expect(uPraznu[0].redovi).toEqual(["b", "c"]);
    expect(uPraznu[2].redovi).toEqual(["a"]);
  });

  test("over its own section or an unknown section: the same object", () => {
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "sekcija", sekcijaId: "s1" })).toBe(L);
    expect(pomeriPrevlacenjem(L, "a", { vrsta: "sekcija", sekcijaId: "nema" })).toBe(L);
  });

  test("the other rows keep their order inside every section, for every drag", () => {
    const sviRedovi = L.flatMap((sekcija) => sekcija.redovi);
    const bez = (raspored: Raspored, prikazId: string) =>
      raspored.map((sekcija) => ({ id: sekcija.id, redovi: sekcija.redovi.filter((id) => id !== prikazId) }));
    for (const prevlaceni of sviRedovi) {
      const mete = [
        ...sviRedovi.flatMap((prikazId) => [
          { vrsta: "red", prikazId, posle: false } as const,
          { vrsta: "red", prikazId, posle: true } as const,
        ]),
        ...L.map((sekcija) => ({ vrsta: "sekcija", sekcijaId: sekcija.id }) as const),
      ];
      for (const meta of mete) {
        const rezultat = pomeriPrevlacenjem(L, prevlaceni, meta);
        const oznaka = `${prevlaceni} over ${JSON.stringify(meta)}`;
        expect(bez(rezultat, prevlaceni), oznaka).toEqual(bez(L, prevlaceni));
        expect(rezultat.flatMap((sekcija) => sekcija.redovi).sort(), oznaka).toEqual([...sviRedovi].sort());
      }
    }
  });
});

describe("primeniPremestanje", () => {
  test("moves the row object to another section, before the named row", () => {
    const sekcije = sekcijeIz(L);
    const [a] = sekcije[0].redovi;
    const rezultat = primeniPremestanje(sekcije, { prikazId: "a", uSekciju: "s2", prePrikaza: "e" });
    expect(rasporedIz(rezultat)).toEqual([
      { id: "s1", redovi: ["b", "c"] },
      { id: "s2", redovi: ["d", "a", "e"] },
      { id: "s3", redovi: [] },
    ]);
    expect(rezultat[1].redovi[1]).toBe(a);
    expect(rezultat[0].naziv).toBe("Sekcija s1");
  });

  test("sections it does not touch keep their identity; the input is not changed", () => {
    const sekcije = sekcijeIz(L);
    const pocetni = kopija(sekcije);
    const rezultat = primeniPremestanje(sekcije, { prikazId: "a", uSekciju: "s2", prePrikaza: "e" });
    expect(rezultat[2]).toBe(sekcije[2]);
    expect(rezultat[0]).not.toBe(sekcije[0]);
    expect(rezultat[1]).not.toBe(sekcije[1]);
    expect(rezultat).not.toBe(sekcije);
    expect(sekcije).toEqual(pocetni);
  });

  test("inside one section the other sections keep their identity", () => {
    const sekcije = sekcijeIz(L);
    const rezultat = primeniPremestanje(sekcije, { prikazId: "c", uSekciju: "s1", prePrikaza: "a" });
    expect(rasporedIz(rezultat)[0].redovi).toEqual(["c", "a", "b"]);
    expect(rezultat[1]).toBe(sekcije[1]);
    expect(rezultat[2]).toBe(sekcije[2]);
  });

  test("prePrikaza null puts the row at the end, also in an empty section", () => {
    const sekcije = sekcijeIz(L);
    expect(rasporedIz(primeniPremestanje(sekcije, { prikazId: "a", uSekciju: "s1", prePrikaza: null }))[0].redovi).toEqual(["b", "c", "a"]);
    const uPraznu = primeniPremestanje(sekcije, { prikazId: "a", uSekciju: "s3", prePrikaza: null });
    expect(rasporedIz(uPraznu)[2].redovi).toEqual(["a"]);
    expect(rasporedIz(uPraznu)[0].redovi).toEqual(["b", "c"]);
  });

  test("a plan that changes nothing keeps the section identity", () => {
    const sekcije = sekcijeIz(L);
    const rezultat = primeniPremestanje(sekcije, { prikazId: "a", uSekciju: "s1", prePrikaza: "b" });
    expect(rezultat).toEqual(sekcije);
    expect(rezultat[0]).toBe(sekcije[0]);
  });

  test.each<[string, PlanPremestanja]>([
    ["an unknown row", { prikazId: "zzz", uSekciju: "s1", prePrikaza: null }],
    ["an unknown target section", { prikazId: "a", uSekciju: "nema", prePrikaza: null }],
    ["an unknown prePrikaza", { prikazId: "a", uSekciju: "s2", prePrikaza: "zzz" }],
    ["a prePrikaza that is in another section", { prikazId: "a", uSekciju: "s2", prePrikaza: "b" }],
  ])("%s: an equal copy, no throw", (_naziv, plan) => {
    const sekcije = sekcijeIz(L);
    let rezultat: Sekcija[] = [];
    expect(() => {
      rezultat = primeniPremestanje(sekcije, plan);
    }).not.toThrow();
    expect(rezultat).toEqual(sekcije);
    expect(rezultat).not.toBe(sekcije);
    rezultat.forEach((sekcija, index) => expect(sekcija).toBe(sekcije[index]));
  });
});

describe("planSekcije", () => {
  const ids = ["x", "y", "z"];

  test("the same index: null", () => {
    expect(planSekcije(ids, "x", 0)).toBeNull();
    expect(planSekcije(ids, "y", 1)).toBeNull();
    expect(planSekcije(ids, "z", 2)).toBeNull();
  });

  test("a new index is returned as it is", () => {
    expect(planSekcije(ids, "x", 1)).toBe(1);
    expect(planSekcije(ids, "x", 2)).toBe(2);
    expect(planSekcije(ids, "z", 0)).toBe(0);
  });

  test("clamps to the first and last place, truncates a fraction", () => {
    expect(planSekcije(ids, "x", 99)).toBe(2);
    expect(planSekcije(ids, "z", -5)).toBe(0);
    expect(planSekcije(ids, "z", 99)).toBeNull();
    expect(planSekcije(ids, "x", -1)).toBeNull();
    expect(planSekcije(ids, "x", 1.9)).toBe(1);
  });

  test("an unknown section or a single section: null", () => {
    expect(planSekcije(ids, "nema", 1)).toBeNull();
    expect(planSekcije([], "x", 0)).toBeNull();
    expect(planSekcije(["x"], "x", 5)).toBeNull();
  });
});

describe("primeniPremestanjeSekcije", () => {
  const s1 = { id: "s1", naziv: "Prva" };
  const s2 = { id: "s2", naziv: "Druga" };
  const s3 = { id: "s3", naziv: "Treca" };
  const sekcije = [s1, s2, s3];

  test("moves a section to the new index", () => {
    expect(primeniPremestanjeSekcije(sekcije, "s1", 2)).toEqual([s2, s3, s1]);
    expect(primeniPremestanjeSekcije(sekcije, "s3", 0)).toEqual([s3, s1, s2]);
    expect(primeniPremestanjeSekcije(sekcije, "s1", 1)).toEqual([s2, s1, s3]);
    expect(primeniPremestanjeSekcije(sekcije, "s2", 0)).toEqual([s2, s1, s3]);
  });

  test("clamps the index", () => {
    expect(primeniPremestanjeSekcije(sekcije, "s1", 99)).toEqual([s2, s3, s1]);
    expect(primeniPremestanjeSekcije(sekcije, "s3", -9)).toEqual([s3, s1, s2]);
  });

  test("keeps the section objects themselves and does not change the input", () => {
    const rezultat = primeniPremestanjeSekcije(sekcije, "s1", 2);
    expect(rezultat[2]).toBe(s1);
    expect(rezultat[0]).toBe(s2);
    expect(sekcije).toEqual([s1, s2, s3]);
  });

  test("nothing to change: an equal copy of the same objects", () => {
    for (const rezultat of [
      primeniPremestanjeSekcije(sekcije, "s2", 1),
      primeniPremestanjeSekcije(sekcije, "nema", 0),
      primeniPremestanjeSekcije(sekcije, "s3", 99),
    ]) {
      expect(rezultat).toEqual(sekcije);
      expect(rezultat).not.toBe(sekcije);
      rezultat.forEach((sekcija, index) => expect(sekcija).toBe(sekcije[index]));
    }
  });
});

describe("planNaMesto + primeniPremestanje agree with postaviNaMesto", () => {
  test.each([
    ["three sections with an empty one", L],
    ["single-row sections", L2],
  ])("every row to every target (%s)", (_naziv, raspored) => {
    const sekcije = sekcijeIz(raspored);
    const redovi = raspored.flatMap((sekcija) => sekcija.redovi);
    let provereno = 0;
    for (const prikazId of redovi) {
      for (const cilj of raspored) {
        for (let indeks = -1; indeks <= redovi.length + 1; indeks += 1) {
          const oznaka = `${prikazId} -> ${cilj.id}[${indeks}]`;
          const ocekivano = postaviNaMesto(raspored, prikazId, cilj.id, indeks);
          const plan = planNaMesto(raspored, prikazId, cilj.id, indeks);
          if (plan === null) {
            // Nothing is written: the layout must be unchanged.
            expect(ocekivano, oznaka).toEqual(raspored);
          } else {
            expect(plan.prikazId, oznaka).toBe(prikazId);
            expect(plan.uSekciju, oznaka).toBe(cilj.id);
            expect(rasporedIz(primeniPremestanje(sekcije, plan)), oznaka).toEqual(ocekivano);
          }
          provereno += 1;
        }
      }
    }
    expect(provereno).toBe(redovi.length * raspored.length * (redovi.length + 3));
  });
});
