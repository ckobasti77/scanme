// ScanMe Menu V1 — K11: `Izaberi više`. Covers the pure selection helpers:
// toggling one row, the three states of a section checkbox and its toggle,
// dropping ids that left the page (same set when nothing is dropped), the
// selected rows in page order, the articles behind them (each once, also when
// one article stands in two sections) and the limit of one action.

import { describe, expect, test } from "vitest";
import { MENU_MAX_BULK_BATCH } from "../limits";
import type { StudioArtikal, StudioRadniSadrzaj, StudioRed } from "./model";
import {
  STUDIO_MAX_IZBOR,
  artikliIzbora,
  izabraniRedovi,
  ocistiIzbor,
  prebaciIzbor,
  prebaciSekciju,
  prekoGranice,
  stanjeSekcije,
} from "./selection";

function artikal(id: string): StudioArtikal {
  return {
    id,
    key: `kljuc-${id}`,
    vrsta: "item",
    naziv: `Artikal ${id}`,
    opis: null,
    cena: 100,
    kolicina: null,
    jedinica: null,
    medij: "none",
    ikonica: null,
    varijante: false,
    proveriCenu: false,
  };
}

function red(prikazId: string, artikalId: string, redosled: number): StudioRed {
  return { prikazId, redosled, sakriven: false, artikal: artikal(artikalId) };
}

// Page: s1 [p1 -> a1, p2 -> a2], s2 [p3 -> a1 (the same article again), p4 -> a3], s3 empty.
const p1 = red("p1", "a1", 0);
const p2 = red("p2", "a2", 1);
const p3 = red("p3", "a1", 0);
const p4 = red("p4", "a3", 1);

const sadrzaj: StudioRadniSadrzaj = {
  stranica: { id: "str1", key: "glavna", naziv: "Glavna", podrazumevana: true, arhivirana: false },
  sekcije: [
    { id: "s1", key: "predjela", naziv: "Predjela", redosled: 0, redovi: [p1, p2] },
    { id: "s2", key: "glavna-jela", naziv: "Glavna jela", redosled: 1, redovi: [p3, p4] },
    { id: "s3", key: "deserti", naziv: "Deserti", redosled: 2, redovi: [] },
  ],
  skraceno: false,
};

describe("prebaciIzbor", () => {
  test("adds a row that is not selected", () => {
    expect(prebaciIzbor(new Set(), "p1")).toEqual(new Set(["p1"]));
    expect(prebaciIzbor(new Set(["p1"]), "p2")).toEqual(new Set(["p1", "p2"]));
  });

  test("removes a row that is selected", () => {
    expect(prebaciIzbor(new Set(["p1", "p2"]), "p1")).toEqual(new Set(["p2"]));
    expect(prebaciIzbor(new Set(["p1"]), "p1").size).toBe(0);
  });

  test("returns a new set and leaves the input alone", () => {
    const izabrani = new Set(["p1"]);
    const sledeci = prebaciIzbor(izabrani, "p2");
    expect(sledeci).not.toBe(izabrani);
    expect([...izabrani]).toEqual(["p1"]);
    expect(prebaciIzbor(prebaciIzbor(izabrani, "p2"), "p2")).toEqual(izabrani);
  });
});

describe("stanjeSekcije", () => {
  test("nista, deo, sve", () => {
    expect(stanjeSekcije(["p1", "p2"], new Set())).toBe("nista");
    expect(stanjeSekcije(["p1", "p2"], new Set(["p1"]))).toBe("deo");
    expect(stanjeSekcije(["p1", "p2"], new Set(["p2"]))).toBe("deo");
    expect(stanjeSekcije(["p1", "p2"], new Set(["p1", "p2"]))).toBe("sve");
  });

  test("an empty section is nista, even when other rows are selected", () => {
    expect(stanjeSekcije([], new Set())).toBe("nista");
    expect(stanjeSekcije([], new Set(["p1", "p3"]))).toBe("nista");
  });

  test("rows of other sections do not count", () => {
    expect(stanjeSekcije(["p1", "p2"], new Set(["p3", "p4"]))).toBe("nista");
    expect(stanjeSekcije(["p1", "p2"], new Set(["p1", "p2", "p3"]))).toBe("sve");
    expect(stanjeSekcije(["p1", "p2"], new Set(["p1", "p3"]))).toBe("deo");
  });
});

describe("prebaciSekciju", () => {
  test("none selected: selects all rows of the section", () => {
    expect(prebaciSekciju(new Set(), ["p1", "p2"])).toEqual(new Set(["p1", "p2"]));
  });

  test("some selected: selects all rows of the section", () => {
    expect(prebaciSekciju(new Set(["p1"]), ["p1", "p2"])).toEqual(new Set(["p1", "p2"]));
  });

  test("all selected: clears the rows of the section only", () => {
    expect(prebaciSekciju(new Set(["p1", "p2", "p3"]), ["p1", "p2"])).toEqual(new Set(["p3"]));
    expect(prebaciSekciju(new Set(["p1", "p2"]), ["p1", "p2"]).size).toBe(0);
  });

  test("keeps the selection of other sections when selecting", () => {
    expect(prebaciSekciju(new Set(["p3"]), ["p1", "p2"])).toEqual(new Set(["p1", "p2", "p3"]));
  });

  test("an empty section changes nothing", () => {
    expect(prebaciSekciju(new Set(["p1"]), [])).toEqual(new Set(["p1"]));
  });

  test("returns a new set and leaves the input alone", () => {
    const izabrani = new Set(["p1"]);
    const sledeci = prebaciSekciju(izabrani, ["p1", "p2"]);
    expect(sledeci).not.toBe(izabrani);
    expect([...izabrani]).toEqual(["p1"]);
  });

  test("clicking a section checkbox twice goes all -> none -> all", () => {
    const sekcija = ["p1", "p2"];
    const prvi = prebaciSekciju(new Set<string>(), sekcija);
    expect(stanjeSekcije(sekcija, prvi)).toBe("sve");
    const drugi = prebaciSekciju(prvi, sekcija);
    expect(stanjeSekcije(sekcija, drugi)).toBe("nista");
    expect(stanjeSekcije(sekcija, prebaciSekciju(drugi, sekcija))).toBe("sve");
  });
});

describe("ocistiIzbor", () => {
  test("an empty selection comes back as the same set", () => {
    const prazan = new Set<string>();
    expect(ocistiIzbor(prazan, sadrzaj)).toBe(prazan);
  });

  test("the same set when every id is still on the page", () => {
    const izabrani = new Set(["p1", "p4"]);
    expect(ocistiIzbor(izabrani, sadrzaj)).toBe(izabrani);
  });

  test("drops the ids that are not on the page", () => {
    const izabrani = new Set(["p1", "uklonjen", "p3", "premesten"]);
    const ociscen = ocistiIzbor(izabrani, sadrzaj);
    expect(ociscen).not.toBe(izabrani);
    expect(ociscen).toEqual(new Set(["p1", "p3"]));
    expect(izabrani.size).toBe(4);
  });

  test("a page without rows drops everything", () => {
    const prazno: StudioRadniSadrzaj = { ...sadrzaj, sekcije: [{ ...sadrzaj.sekcije[2] }] };
    expect(ocistiIzbor(new Set(["p1", "p2"]), prazno).size).toBe(0);
    expect(ocistiIzbor(new Set(["p1"]), { ...sadrzaj, sekcije: [] }).size).toBe(0);
  });
});

describe("izabraniRedovi", () => {
  test("the selected rows in page order, not in selection order", () => {
    const redovi = izabraniRedovi(sadrzaj, new Set(["p4", "p1", "p3"]));
    expect(redovi.map((r) => r.prikazId)).toEqual(["p1", "p3", "p4"]);
  });

  test("returns the row objects of the page", () => {
    const redovi = izabraniRedovi(sadrzaj, new Set(["p2", "p3"]));
    expect(redovi[0]).toBe(p2);
    expect(redovi[1]).toBe(p3);
  });

  test("the same article in two sections is two rows (two placements)", () => {
    const redovi = izabraniRedovi(sadrzaj, new Set(["p1", "p3"]));
    expect(redovi.map((r) => r.prikazId)).toEqual(["p1", "p3"]);
    expect(redovi.map((r) => r.artikal.id)).toEqual(["a1", "a1"]);
  });

  test("nothing selected, or ids that are not on the page: empty", () => {
    expect(izabraniRedovi(sadrzaj, new Set())).toEqual([]);
    expect(izabraniRedovi(sadrzaj, new Set(["nema"]))).toEqual([]);
  });
});

describe("artikliIzbora", () => {
  test("each article once, in page order", () => {
    const artikli = artikliIzbora([p1, p2, p3, p4]);
    expect(artikli.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
  });

  test("the same article in two sections is returned once, as the first row's article", () => {
    const artikli = artikliIzbora([p1, p3]);
    expect(artikli).toHaveLength(1);
    expect(artikli[0]).toBe(p1.artikal);
  });

  test("works from the selected rows of the page", () => {
    const artikli = artikliIzbora(izabraniRedovi(sadrzaj, new Set(["p3", "p1", "p4"])));
    expect(artikli.map((a) => a.id)).toEqual(["a1", "a3"]);
  });

  test("no rows, no articles", () => {
    expect(artikliIzbora([])).toEqual([]);
  });
});

describe("prekoGranice", () => {
  test("the limit of one action is MENU_MAX_BULK_BATCH = 200", () => {
    expect(MENU_MAX_BULK_BATCH).toBe(200);
    expect(STUDIO_MAX_IZBOR).toBe(200);
    expect(STUDIO_MAX_IZBOR).toBe(MENU_MAX_BULK_BATCH);
  });

  test("up to the limit is fine, one more is too many", () => {
    expect(prekoGranice(0)).toBe(false);
    expect(prekoGranice(1)).toBe(false);
    expect(prekoGranice(199)).toBe(false);
    expect(prekoGranice(200)).toBe(false);
    expect(prekoGranice(201)).toBe(true);
    expect(prekoGranice(1000)).toBe(true);
  });
});
