// ScanMe Menu V1 (K18) — what the publish dialog shows and whether `Objavi meni`
// may run. Pure logic; the data is invented.

import { describe, expect, test } from "vitest";
import type { AutosaveZbir } from "./autosave-queue";
import type { StudioCiljProblema, StudioPregledObjave, StudioSazetakObjave } from "./model";
import {
  brojProblema,
  grupisiProbleme,
  jeZastareo,
  problemResen,
  redoviPosledica,
  stanjeObjave,
  zahtevObjave,
} from "./publish-view";

// --- builders -----------------------------------------------------------------

function sazetak(overrides: Partial<StudioSazetakObjave> = {}): StudioSazetakObjave {
  return { cene: 0, novi: 0, uklonjeni: 0, sakriveno: 0, uklonjenoSaStranice: 0, obrisano: 0, redosled: 0, ...overrides };
}

const GRESKA = { kod: "missing_name", artikalKey: "ar_a" };
const UPOZORENJE = { kod: "missing_translation", artikalKey: null, jezik: "en", broj: 3 };

/** A review that may publish: right to publish, changes, no issues. */
function pregled(overrides: Partial<StudioPregledObjave> = {}): StudioPregledObjave {
  return {
    revizija: 7,
    stanje: "dirty",
    mozeObjavu: true,
    menjaSe: true,
    prevelik: false,
    greske: [],
    upozorenja: [],
    otisak: "otisak-abc",
    sazetak: null,
    ...overrides,
  };
}

function ulaz(
  p: StudioPregledObjave | null,
  overrides: { revizijaSada?: number | undefined; potvrdjeno?: boolean; cuvanje?: AutosaveZbir["stanje"] } = {},
) {
  return {
    pregled: p,
    revizijaSada: "revizijaSada" in overrides ? overrides.revizijaSada : (p?.revizija ?? 7),
    potvrdjeno: overrides.potvrdjeno ?? false,
    cuvanje: overrides.cuvanje ?? ("sacuvano" as AutosaveZbir["stanje"]),
  };
}

const cilj = (naziv: string): StudioCiljProblema => ({ naziv, stranicaKey: "pg_main", stranica: "Glavna", roomService: false });

// --- redoviPosledica ----------------------------------------------------------

describe("redoviPosledica", () => {
  test("no summary is no lines", () => {
    expect(redoviPosledica(null)).toEqual([]);
  });

  test("a summary of zeros is no lines", () => {
    expect(redoviPosledica(sazetak())).toEqual([]);
  });

  test("prices, new and removed articles are separate lines; a count of 0 is not a line", () => {
    expect(redoviPosledica(sazetak({ cene: 4, uklonjeni: 2 }))).toEqual([
      { vrsta: "cene", broj: 4 },
      { vrsta: "uklonjeni", broj: 2 },
    ]);
    expect(redoviPosledica(sazetak({ novi: 1 }))).toEqual([{ vrsta: "novi", broj: 1 }]);
  });

  test("structural changes are one line: the sum, with the non-zero parts in the master's order", () => {
    expect(redoviPosledica(sazetak({ redosled: 5, sakriveno: 2, obrisano: 1 }))).toEqual([
      {
        vrsta: "strukturne",
        broj: 8,
        detalji: [
          { vrsta: "sakriveno", broj: 2 },
          { vrsta: "obrisano", broj: 1 },
          { vrsta: "redosled", broj: 5 },
        ],
      },
    ]);
  });

  test("all four structural parts are listed in the order hidden, removed from page, deleted, order", () => {
    const [red] = redoviPosledica(sazetak({ redosled: 4, obrisano: 3, uklonjenoSaStranice: 2, sakriveno: 1 }));
    expect(red).toMatchObject({ vrsta: "strukturne", broj: 10 });
    expect(red.vrsta === "strukturne" ? red.detalji.map((d) => d.vrsta) : []).toEqual([
      "sakriveno",
      "uklonjenoSaStranice",
      "obrisano",
      "redosled",
    ]);
  });

  test("everything at once: prices, new, removed, then structural", () => {
    const redovi = redoviPosledica(sazetak({ redosled: 1, uklonjeni: 3, novi: 2, cene: 5 }));
    expect(redovi.map((red) => red.vrsta)).toEqual(["cene", "novi", "uklonjeni", "strukturne"]);
    expect(redovi.map((red) => red.broj)).toEqual([5, 2, 3, 1]);
  });
});

// --- grupisiProbleme / brojProblema -------------------------------------------

describe("grupisiProbleme", () => {
  test("no issues is nothing", () => {
    expect(grupisiProbleme([], undefined)).toEqual({ artikli: [], ostali: [] });
    expect(brojProblema(grupisiProbleme([], undefined))).toBe(0);
  });

  test("an article is ONE entry: codes in first-seen order without repeats", () => {
    const grupisani = grupisiProbleme(
      [
        { kod: "missing_name", artikalKey: "ar_a" },
        { kod: "negative_price", artikalKey: "ar_a" },
        { kod: "missing_name", artikalKey: "ar_a" },
      ],
      undefined,
    );
    expect(grupisani.artikli).toEqual([
      { artikalKey: "ar_a", kodovi: ["missing_name", "negative_price"], cilj: null, uVarijantama: false },
    ]);
    expect(grupisani.ostali).toEqual([]);
  });

  test("articles keep the order in which they were first seen", () => {
    const grupisani = grupisiProbleme(
      [
        { kod: "x", artikalKey: "ar_b" },
        { kod: "x", artikalKey: "ar_a" },
        { kod: "y", artikalKey: "ar_b" },
      ],
      undefined,
    );
    expect(grupisani.artikli.map((red) => red.artikalKey)).toEqual(["ar_b", "ar_a"]);
    expect(grupisani.artikli[0].kodovi).toEqual(["x", "y"]);
  });

  test("an issue without an article belongs to the whole publication, with language and count defaulted to null", () => {
    const grupisani = grupisiProbleme(
      [
        { kod: "missing_translation", artikalKey: null, jezik: "en", broj: 3 },
        { kod: "no_pages", artikalKey: null },
        { kod: "empty_key", artikalKey: "" },
      ],
      undefined,
    );
    expect(grupisani.artikli).toEqual([]);
    expect(grupisani.ostali).toEqual([
      { kod: "missing_translation", jezik: "en", broj: 3 },
      { kod: "no_pages", jezik: null, broj: null },
      { kod: "empty_key", jezik: null, broj: null },
    ]);
  });

  test("the target of an article comes from `ciljevi`; no entry or no map is null", () => {
    const a = cilj("Pljeskavica");
    const sa = grupisiProbleme(
      [
        { kod: "x", artikalKey: "ar_a" },
        { kod: "x", artikalKey: "ar_b" },
      ],
      { ar_a: a },
    );
    expect(sa.artikli[0].cilj).toBe(a);
    expect(sa.artikli[1].cilj).toBeNull();
    expect(grupisiProbleme([{ kod: "x", artikalKey: "ar_a" }], undefined).artikli[0].cilj).toBeNull();
  });

  test("uVarijantama is set by any issue of the article that names a variant or add-on group", () => {
    const grupisani = grupisiProbleme(
      [
        { kod: "x", artikalKey: "ar_a", entitetKey: null },
        { kod: "y", artikalKey: "ar_a", entitetKey: "va_mala" },
        { kod: "z", artikalKey: "ar_b" },
        { kod: "w", artikalKey: "ar_c", entitetKey: "ag_umaci" },
        { kod: "w", artikalKey: "ar_c" },
      ],
      undefined,
    );
    expect(grupisani.artikli.map((red) => [red.artikalKey, red.uVarijantama])).toEqual([
      ["ar_a", true],
      ["ar_b", false],
      ["ar_c", true],
    ]);
  });

  test("an article that only has a plain issue is not marked as being about variants", () => {
    const [red] = grupisiProbleme([{ kod: "x", artikalKey: "ar_a", entitetKey: undefined }], undefined).artikli;
    expect(red.uVarijantama).toBe(false);
  });
});

describe("brojProblema", () => {
  test("one per article plus the issues of the whole publication", () => {
    const grupisani = grupisiProbleme(
      [
        { kod: "a", artikalKey: "ar_a" },
        { kod: "b", artikalKey: "ar_a" },
        { kod: "c", artikalKey: "ar_a" },
        { kod: "d", artikalKey: "ar_b" },
        { kod: "e", artikalKey: null },
        { kod: "f", artikalKey: null },
      ],
      undefined,
    );
    expect(brojProblema(grupisani)).toBe(4);
  });

  test("works on a hand-built group too", () => {
    expect(brojProblema({ artikli: [], ostali: [{ kod: "x", jezik: null, broj: null }] })).toBe(1);
  });
});

// --- jeZastareo ---------------------------------------------------------------

describe("jeZastareo", () => {
  test("no review is not stale", () => {
    expect(jeZastareo(null, 9)).toBe(false);
  });

  test("an unknown current revision is not stale", () => {
    expect(jeZastareo({ revizija: 3 }, undefined)).toBe(false);
  });

  test("the same revision is fresh; a different one is stale", () => {
    expect(jeZastareo({ revizija: 3 }, 3)).toBe(false);
    expect(jeZastareo({ revizija: 3 }, 4)).toBe(true);
  });

  test("revision 0 is a real revision, not 'unknown'", () => {
    expect(jeZastareo({ revizija: 3 }, 0)).toBe(true);
    expect(jeZastareo({ revizija: 0 }, 0)).toBe(false);
  });
});

// --- stanjeObjave -------------------------------------------------------------

describe("stanjeObjave: one reason per branch", () => {
  test("no review yet: ucitava", () => {
    expect(stanjeObjave(ulaz(null, { revizijaSada: 7 }))).toEqual({ moze: false, razlog: "ucitava" });
  });

  test("no right to publish: bez-dozvole", () => {
    expect(stanjeObjave(ulaz(pregled({ mozeObjavu: false })))).toEqual({ moze: false, razlog: "bez-dozvole" });
  });

  test("the draft changed after the review: zastarelo", () => {
    expect(stanjeObjave(ulaz(pregled({ revizija: 7 }), { revizijaSada: 8 }))).toEqual({ moze: false, razlog: "zastarelo" });
  });

  test("an unknown current revision does not make the review stale", () => {
    expect(stanjeObjave(ulaz(pregled(), { revizijaSada: undefined }))).toEqual({ moze: true, razlog: null });
  });

  test("own edits are being saved: cuva-se", () => {
    expect(stanjeObjave(ulaz(pregled(), { cuvanje: "cuva-se" }))).toEqual({ moze: false, razlog: "cuva-se" });
  });

  test("a version that would not fit: prevelik", () => {
    expect(stanjeObjave(ulaz(pregled({ prevelik: true })))).toEqual({ moze: false, razlog: "prevelik" });
  });

  test("errors: greske", () => {
    expect(stanjeObjave(ulaz(pregled({ greske: [GRESKA] })))).toEqual({ moze: false, razlog: "greske" });
  });

  test("nothing changes for guests: bez-promena", () => {
    expect(stanjeObjave(ulaz(pregled({ menjaSe: false })))).toEqual({ moze: false, razlog: "bez-promena" });
  });

  test("warnings that are not confirmed: potvrda", () => {
    expect(stanjeObjave(ulaz(pregled({ upozorenja: [UPOZORENJE] })))).toEqual({ moze: false, razlog: "potvrda" });
  });

  test("a clean review with changes may publish", () => {
    expect(stanjeObjave(ulaz(pregled()))).toEqual({ moze: true, razlog: null });
  });
});

describe("stanjeObjave: warnings and confirmation", () => {
  test("confirmed warnings allow publishing", () => {
    expect(stanjeObjave(ulaz(pregled({ upozorenja: [UPOZORENJE] }), { potvrdjeno: true }))).toEqual({
      moze: true,
      razlog: null,
    });
  });

  test("warnings without confirmation never allow publishing", () => {
    for (const upozorenja of [[UPOZORENJE], [UPOZORENJE, { ...UPOZORENJE, jezik: "de" }]]) {
      expect(stanjeObjave(ulaz(pregled({ upozorenja }), { potvrdjeno: false })).moze).toBe(false);
    }
  });

  test("confirmation of nothing changes nothing: no warnings, confirmed or not, may publish", () => {
    expect(stanjeObjave(ulaz(pregled(), { potvrdjeno: true })).moze).toBe(true);
    expect(stanjeObjave(ulaz(pregled(), { potvrdjeno: false })).moze).toBe(true);
  });

  test("confirming warnings does not unblock anything else", () => {
    expect(stanjeObjave(ulaz(pregled({ upozorenja: [UPOZORENJE], greske: [GRESKA] }), { potvrdjeno: true }))).toEqual({
      moze: false,
      razlog: "greske",
    });
    expect(stanjeObjave(ulaz(pregled({ upozorenja: [UPOZORENJE], menjaSe: false }), { potvrdjeno: true }))).toEqual({
      moze: false,
      razlog: "bez-promena",
    });
  });
});

describe("stanjeObjave: only 'cuva-se' makes the dialog wait for the save", () => {
  test("a finished or failed save does not block (the dialog warns about unsaved edits instead)", () => {
    expect(stanjeObjave(ulaz(pregled(), { cuvanje: "sacuvano" })).moze).toBe(true);
    expect(stanjeObjave(ulaz(pregled(), { cuvanje: "greska" })).moze).toBe(true);
  });
});

describe("stanjeObjave: precedence", () => {
  test("a missing review beats everything", () => {
    expect(stanjeObjave(ulaz(null, { cuvanje: "cuva-se", potvrdjeno: false, revizijaSada: 99 }))).toEqual({
      moze: false,
      razlog: "ucitava",
    });
  });

  test("no right beats a stale review, saving, size, errors", () => {
    const p = pregled({ mozeObjavu: false, prevelik: true, greske: [GRESKA], menjaSe: false, upozorenja: [UPOZORENJE] });
    expect(stanjeObjave(ulaz(p, { revizijaSada: 99, cuvanje: "cuva-se" })).razlog).toBe("bez-dozvole");
  });

  test("a stale review beats errors", () => {
    const p = pregled({ greske: [GRESKA] });
    expect(stanjeObjave(ulaz(p, { revizijaSada: 8 })).razlog).toBe("zastarelo");
  });

  test("a stale review beats saving", () => {
    expect(stanjeObjave(ulaz(pregled(), { revizijaSada: 8, cuvanje: "cuva-se" })).razlog).toBe("zastarelo");
  });

  test("saving beats size and errors", () => {
    expect(stanjeObjave(ulaz(pregled({ prevelik: true, greske: [GRESKA] }), { cuvanje: "cuva-se" })).razlog).toBe("cuva-se");
  });

  test("size beats errors", () => {
    expect(stanjeObjave(ulaz(pregled({ prevelik: true, greske: [GRESKA] }))).razlog).toBe("prevelik");
  });

  test("errors beat warnings, even confirmed ones", () => {
    const p = pregled({ greske: [GRESKA], upozorenja: [UPOZORENJE] });
    expect(stanjeObjave(ulaz(p, { potvrdjeno: false })).razlog).toBe("greske");
    expect(stanjeObjave(ulaz(p, { potvrdjeno: true })).razlog).toBe("greske");
  });

  test("errors beat 'nothing changes'", () => {
    expect(stanjeObjave(ulaz(pregled({ greske: [GRESKA], menjaSe: false }))).razlog).toBe("greske");
  });

  test("'nothing changes' beats unconfirmed warnings", () => {
    expect(stanjeObjave(ulaz(pregled({ menjaSe: false, upozorenja: [UPOZORENJE] }))).razlog).toBe("bez-promena");
  });

  test("fixing the reasons one by one walks down the whole ladder to 'may publish'", () => {
    const losi = pregled({
      mozeObjavu: false,
      revizija: 7,
      prevelik: true,
      greske: [GRESKA],
      menjaSe: false,
      upozorenja: [UPOZORENJE],
    });
    const koraci: { p: StudioPregledObjave | null; revizijaSada: number; cuvanje: AutosaveZbir["stanje"]; potvrdjeno: boolean }[] = [
      { p: losi, revizijaSada: 8, cuvanje: "cuva-se", potvrdjeno: false },
      { p: { ...losi, mozeObjavu: true }, revizijaSada: 8, cuvanje: "cuva-se", potvrdjeno: false },
      { p: { ...losi, mozeObjavu: true }, revizijaSada: 7, cuvanje: "cuva-se", potvrdjeno: false },
      { p: { ...losi, mozeObjavu: true }, revizijaSada: 7, cuvanje: "sacuvano", potvrdjeno: false },
      { p: { ...losi, mozeObjavu: true, prevelik: false }, revizijaSada: 7, cuvanje: "sacuvano", potvrdjeno: false },
      { p: { ...losi, mozeObjavu: true, prevelik: false, greske: [] }, revizijaSada: 7, cuvanje: "sacuvano", potvrdjeno: false },
      {
        p: { ...losi, mozeObjavu: true, prevelik: false, greske: [], menjaSe: true },
        revizijaSada: 7,
        cuvanje: "sacuvano",
        potvrdjeno: false,
      },
      {
        p: { ...losi, mozeObjavu: true, prevelik: false, greske: [], menjaSe: true },
        revizijaSada: 7,
        cuvanje: "sacuvano",
        potvrdjeno: true,
      },
    ];
    const rezultat = koraci.map((korak) =>
      stanjeObjave({ pregled: korak.p, revizijaSada: korak.revizijaSada, cuvanje: korak.cuvanje, potvrdjeno: korak.potvrdjeno }),
    );
    expect(rezultat.map((stanje) => stanje.razlog)).toEqual([
      "bez-dozvole",
      "zastarelo",
      "cuva-se",
      "prevelik",
      "greske",
      "bez-promena",
      "potvrda",
      null,
    ]);
    expect(rezultat.map((stanje) => stanje.moze)).toEqual([false, false, false, false, false, false, false, true]);
  });
});

// --- zahtevObjave -------------------------------------------------------------

describe("zahtevObjave", () => {
  test("without warnings it sends only the reviewed revision", () => {
    const zahtev = zahtevObjave(pregled({ revizija: 12, otisak: "otisak-xyz" }));
    expect(zahtev).toStrictEqual({ revizija: 12, potvrda: undefined });
  });

  test("with warnings it also sends their fingerprint", () => {
    expect(zahtevObjave(pregled({ revizija: 12, otisak: "otisak-xyz", upozorenja: [UPOZORENJE] }))).toEqual({
      revizija: 12,
      potvrda: "otisak-xyz",
    });
  });

  test("errors alone do not make it send a fingerprint", () => {
    expect(zahtevObjave(pregled({ greske: [GRESKA] })).potvrda).toBeUndefined();
  });

  test("the fingerprint is the review's own, whatever the number of warnings", () => {
    const dva = zahtevObjave(pregled({ otisak: "o-2", upozorenja: [UPOZORENJE, { ...UPOZORENJE, jezik: "de" }] }));
    expect(dva.potvrda).toBe("o-2");
  });
});

// --- K18 screenshot critique ----------------------------------------------------

describe("stanjeObjave: a field in conflict locks publishing", () => {
  const cuvanje: AutosaveZbir["stanje"] = "greska";
  test("a conflict waits for the person's choice, after the save in flight and before every review reason", () => {
    expect(stanjeObjave({ pregled: pregled(), revizijaSada: 7, potvrdjeno: false, cuvanje, konflikata: 1 })).toEqual({ moze: false, razlog: "konflikt" });
    expect(stanjeObjave({ pregled: pregled({ greske: [GRESKA] }), revizijaSada: 7, potvrdjeno: false, cuvanje, konflikata: 2 }).razlog).toBe("konflikt");
    expect(stanjeObjave({ pregled: pregled(), revizijaSada: 7, potvrdjeno: false, cuvanje: "cuva-se", konflikata: 1 }).razlog).toBe("cuva-se");
    expect(stanjeObjave({ pregled: pregled(), revizijaSada: 8, potvrdjeno: false, cuvanje, konflikata: 1 }).razlog).toBe("zastarelo");
  });
  test("a failed save that is not a conflict does not lock publishing (the saved draft goes out)", () => {
    expect(stanjeObjave({ pregled: pregled(), revizijaSada: 7, potvrdjeno: false, cuvanje, konflikata: 0 })).toEqual({ moze: true, razlog: null });
    expect(stanjeObjave({ pregled: pregled({ upozorenja: [UPOZORENJE] }), revizijaSada: 7, potvrdjeno: true, cuvanje }).moze).toBe(true);
  });
});

describe("problemResen: the errors of publishing on what the editor shows now", () => {
  const artikal = { naziv: "Proja", cena: null, varijanteUkljucene: false, ceneVarijanti: [], prikaza: 0 };
  test("name, price (or a priced variant while variants are on) and a section", () => {
    expect(problemResen("name_missing", { ...artikal, naziv: "  " })).toBe(false);
    expect(problemResen("name_missing", artikal)).toBe(true);
    expect(problemResen("price_missing", artikal)).toBe(false);
    expect(problemResen("price_missing", { ...artikal, cena: 0 })).toBe(true);
    expect(problemResen("price_missing", { ...artikal, ceneVarijanti: [200] })).toBe(false);
    expect(problemResen("price_missing", { ...artikal, varijanteUkljucene: true, ceneVarijanti: [null] })).toBe(false);
    expect(problemResen("price_missing", { ...artikal, varijanteUkljucene: true, ceneVarijanti: [null, 200] })).toBe(true);
    expect(problemResen("section_missing", artikal)).toBe(false);
    expect(problemResen("section_missing", { ...artikal, prikaza: 1 })).toBe(true);
  });
  test("warnings are not judged here (Objavi checks them again)", () => {
    expect(problemResen("combo_price_check", artikal)).toBeNull();
    expect(problemResen("translation_missing", artikal)).toBeNull();
  });
});
