// ScanMe Menu V1 — K10: the editor's view of a MenuDraftSnapshot. Runs on the
// invented izlog menu "Demo restoran" (two pages: the whole menu and a wine
// list; the wines stand on BOTH pages as the same articles).

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import type { MenuDraftSnapshot } from "../snapshot";
import { artikalIzSnapshota, prikazId, sadrzajIzSnapshota, straniceIzSnapshota } from "./iz-snapshota";

const NEMA_QR: ReadonlySet<string> = new Set();

function srednji(): MenuDraftSnapshot {
  return fixtureMenu("srednji").snapshot;
}

function stranicaPoNazivu(snapshot: MenuDraftSnapshot, naziv: string) {
  const page = snapshot.pages.find((candidate) => candidate.name === naziv);
  if (!page) throw new Error(`fixture page "${naziv}" missing`);
  return page;
}

/** The same snapshot with every list reversed: order must come from `order`, not from position. */
function obrnut(snapshot: MenuDraftSnapshot): MenuDraftSnapshot {
  return {
    ...snapshot,
    pages: snapshot.pages.slice().reverse(),
    sections: snapshot.sections.slice().reverse(),
    placements: snapshot.placements.slice().reverse(),
    articles: snapshot.articles.slice().reverse(),
  };
}

describe("prikazId", () => {
  test("a placement is '<sectionKey>/<articleKey>'", () => {
    expect(prikazId("sc_1", "ar_9")).toBe("sc_1/ar_9");
  });
});

describe("straniceIzSnapshota", () => {
  test("lists every page by order with its fields", () => {
    const snapshot = srednji();
    const strane = straniceIzSnapshota(snapshot, NEMA_QR);
    expect(strane.map((s) => s.naziv)).toEqual(["Kompletan meni", "Vinska karta"]);
    const glavna = stranicaPoNazivu(snapshot, "Kompletan meni");
    expect(strane[0]).toEqual({
      id: glavna.key,
      key: glavna.key,
      slug: "glavni",
      naziv: "Kompletan meni",
      podrazumevana: true,
      arhivirana: false,
      sakrivena: false,
      imaQr: false,
      brojPrikaza: snapshot.placements.filter((p) => p.pageKey === glavna.key).length,
    });
    expect(strane[1]).toMatchObject({ slug: "vinska-karta", podrazumevana: false, arhivirana: false, imaQr: false });
  });

  test("brojPrikaza counts the placements of each page", () => {
    const snapshot = srednji();
    const strane = straniceIzSnapshota(snapshot, NEMA_QR);
    for (const s of strane) {
      expect(s.brojPrikaza).toBe(snapshot.placements.filter((p) => p.pageKey === s.key).length);
    }
    // 4 white + 5 red wines.
    expect(strane[1].brojPrikaza).toBe(9);
    expect(strane[0].brojPrikaza).toBeGreaterThan(strane[1].brojPrikaza);
  });

  test("a page without placements has brojPrikaza 0", () => {
    const snapshot = srednji();
    const prazna = { ...snapshot, placements: snapshot.placements.filter((p) => p.pageKey !== stranicaPoNazivu(snapshot, "Vinska karta").key) };
    expect(straniceIzSnapshota(prazna, NEMA_QR)[1].brojPrikaza).toBe(0);
  });

  test("imaQr is true exactly for the pages a QR card points at", () => {
    const snapshot = srednji();
    const vina = stranicaPoNazivu(snapshot, "Vinska karta");
    const strane = straniceIzSnapshota(snapshot, new Set([vina.key, "pg_nepoznata"]));
    expect(strane.map((s) => s.imaQr)).toEqual([false, true]);
  });

  test("arhivirana and sakrivena come from archivedAt and visibility", () => {
    const snapshot = srednji();
    const vina = stranicaPoNazivu(snapshot, "Vinska karta");
    const izmenjen: MenuDraftSnapshot = {
      ...snapshot,
      pages: snapshot.pages.map((p) => (p.key === vina.key ? { ...p, archivedAt: 1_700_000_000_000, visibility: "hidden" as const } : p)),
    };
    const strane = straniceIzSnapshota(izmenjen, NEMA_QR);
    expect(strane[1]).toMatchObject({ arhivirana: true, sakrivena: true });
    expect(strane[0]).toMatchObject({ arhivirana: false, sakrivena: false });
  });

  test("the order comes from `order`, not from the position in the snapshot", () => {
    const strane = straniceIzSnapshota(obrnut(srednji()), NEMA_QR);
    expect(strane.map((s) => s.naziv)).toEqual(["Kompletan meni", "Vinska karta"]);
  });

  test("equal orders are broken by key", () => {
    const snapshot = srednji();
    const izjednaceno: MenuDraftSnapshot = { ...snapshot, pages: snapshot.pages.map((p) => ({ ...p, order: 5 })) };
    const kljucevi = straniceIzSnapshota(izjednaceno, NEMA_QR).map((s) => s.key);
    expect(kljucevi).toEqual(kljucevi.slice().sort());
    expect(straniceIzSnapshota(obrnut(izjednaceno), NEMA_QR).map((s) => s.key)).toEqual(kljucevi);
  });

  test("the snapshot's own page list is not reordered", () => {
    const snapshot = obrnut(srednji());
    const pre = snapshot.pages.map((p) => p.key);
    straniceIzSnapshota(snapshot, NEMA_QR);
    expect(snapshot.pages.map((p) => p.key)).toEqual(pre);
  });
});

describe("sadrzajIzSnapshota", () => {
  test("an unknown page is null", () => {
    expect(sadrzajIzSnapshota(srednji(), "pg_nema")).toBeNull();
  });

  test("the page header", () => {
    const snapshot = srednji();
    const glavna = stranicaPoNazivu(snapshot, "Kompletan meni");
    const sadrzaj = sadrzajIzSnapshota(snapshot, glavna.key);
    expect(sadrzaj?.stranica).toEqual({
      id: glavna.key,
      key: glavna.key,
      naziv: "Kompletan meni",
      podrazumevana: true,
      arhivirana: false,
    });
    expect(sadrzaj?.skraceno).toBe(false);
  });

  test("sections come in order, each with its own rows", () => {
    const snapshot = srednji();
    const glavna = stranicaPoNazivu(snapshot, "Kompletan meni");
    const sadrzaj = sadrzajIzSnapshota(snapshot, glavna.key)!;
    expect(sadrzaj.sekcije.map((s) => s.naziv)).toEqual([
      "Predjela",
      "Supe i salate",
      "Sa roštilja",
      "Glavna jela",
      "Prilozi",
      "Dezerti",
      "Pića",
      "Vina",
    ]);
    expect(sadrzaj.sekcije.map((s) => s.redosled)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const sekcija of sadrzaj.sekcije) {
      expect(sekcija.id).toBe(sekcija.key);
      const placements = snapshot.placements.filter((p) => p.pageKey === glavna.key && p.sectionKey === sekcija.key);
      expect(sekcija.redovi).toHaveLength(placements.length);
    }
  });

  test("rows keep the placement order and carry the '<section>/<article>' id", () => {
    const snapshot = srednji();
    const glavna = stranicaPoNazivu(snapshot, "Kompletan meni");
    const predjela = sadrzajIzSnapshota(snapshot, glavna.key)!.sekcije[0];
    expect(predjela.redovi.slice(0, 3).map((r) => r.artikal.naziv)).toEqual([
      "Kajmak sa pogačom",
      "Pršut sa sirom",
      "Daska sa mezetom",
    ]);
    expect(predjela.redovi.map((r) => r.redosled)).toEqual(predjela.redovi.map((_, i) => i));
    for (const red of predjela.redovi) {
      expect(red.prikazId).toBe(`${predjela.key}/${red.artikal.key}`);
    }
  });

  test("the order comes from `order`, not from the position in the snapshot", () => {
    const snapshot = srednji();
    const glavna = stranicaPoNazivu(snapshot, "Kompletan meni");
    const normalan = sadrzajIzSnapshota(snapshot, glavna.key);
    expect(sadrzajIzSnapshota(obrnut(snapshot), glavna.key)).toEqual(normalan);
  });

  test("equal orders are broken by key (sections) and article key (rows)", () => {
    const snapshot = srednji();
    const glavna = stranicaPoNazivu(snapshot, "Kompletan meni");
    const izjednaceno: MenuDraftSnapshot = {
      ...snapshot,
      sections: snapshot.sections.map((s) => ({ ...s, order: 1 })),
      placements: snapshot.placements.map((p) => ({ ...p, order: 1 })),
    };
    const sadrzaj = sadrzajIzSnapshota(izjednaceno, glavna.key)!;
    const kljucevi = sadrzaj.sekcije.map((s) => s.key);
    expect(kljucevi).toEqual(kljucevi.slice().sort());
    for (const sekcija of sadrzaj.sekcije) {
      const artikli = sekcija.redovi.map((r) => r.artikal.key);
      expect(artikli).toEqual(artikli.slice().sort());
    }
  });

  test("a hidden placement is sakriven, the others are not", () => {
    const snapshot = srednji();
    const sadrzaj = sadrzajIzSnapshota(snapshot, stranicaPoNazivu(snapshot, "Kompletan meni").key)!;
    const redovi = sadrzaj.sekcije.flatMap((s) => s.redovi);
    const sakriveni = redovi.filter((r) => r.sakriven).map((r) => r.artikal.naziv);
    expect(sakriveni).toEqual(["Jagnjetina ispod sača"]);
    expect(redovi.length).toBeGreaterThan(50);
  });

  test("a page shows only its own sections and placements", () => {
    const snapshot = srednji();
    const vina = stranicaPoNazivu(snapshot, "Vinska karta");
    const sadrzaj = sadrzajIzSnapshota(snapshot, vina.key)!;
    expect(sadrzaj.sekcije.map((s) => s.naziv)).toEqual(["Bela vina", "Crvena vina"]);
    expect(sadrzaj.sekcije.map((s) => s.redovi.length)).toEqual([4, 5]);
    expect(sadrzaj.sekcije[0].redovi.map((r) => r.artikal.naziv)).toEqual([
      "Tamjanika",
      "Sauvignon Blanc",
      "Rizling",
      "Chardonnay",
    ]);
    expect(sadrzaj.stranica.podrazumevana).toBe(false);
  });

  test("the same article on two pages is one article with two different row ids", () => {
    const snapshot = srednji();
    const glavna = sadrzajIzSnapshota(snapshot, stranicaPoNazivu(snapshot, "Kompletan meni").key)!;
    const vina = sadrzajIzSnapshota(snapshot, stranicaPoNazivu(snapshot, "Vinska karta").key)!;
    const naGlavnoj = glavna.sekcije.flatMap((s) => s.redovi).find((r) => r.artikal.naziv === "Tamjanika")!;
    const naVinima = vina.sekcije.flatMap((s) => s.redovi).find((r) => r.artikal.naziv === "Tamjanika")!;
    expect(naGlavnoj.artikal.id).toBe(naVinima.artikal.id);
    expect(naGlavnoj.artikal.cena).toBe(2200);
    expect(naGlavnoj.prikazId).not.toBe(naVinima.prikazId);
  });

  test("a placement of an article that no longer exists is left out", () => {
    const snapshot = srednji();
    const glavna = stranicaPoNazivu(snapshot, "Kompletan meni");
    const kajmak = snapshot.articles.find((a) => a.name === "Kajmak sa pogačom")!;
    const bezArtikla: MenuDraftSnapshot = { ...snapshot, articles: snapshot.articles.filter((a) => a.key !== kajmak.key) };
    const predjela = sadrzajIzSnapshota(bezArtikla, glavna.key)!.sekcije[0];
    expect(predjela.redovi.map((r) => r.artikal.naziv)).not.toContain("Kajmak sa pogačom");
    expect(predjela.redovi[0].artikal.naziv).toBe("Pršut sa sirom");
  });

  test("a page with no sections gives an empty work area", () => {
    const snapshot = srednji();
    const glavna = stranicaPoNazivu(snapshot, "Kompletan meni");
    const prazno: MenuDraftSnapshot = { ...snapshot, sections: [], placements: [] };
    expect(sadrzajIzSnapshota(prazno, glavna.key)?.sekcije).toEqual([]);
  });

  test("an archived page reports arhivirana", () => {
    const snapshot = srednji();
    const vina = stranicaPoNazivu(snapshot, "Vinska karta");
    const izmenjen: MenuDraftSnapshot = {
      ...snapshot,
      pages: snapshot.pages.map((p) => (p.key === vina.key ? { ...p, archivedAt: 5 } : p)),
    };
    expect(sadrzajIzSnapshota(izmenjen, vina.key)?.stranica.arhivirana).toBe(true);
  });

  test("the snapshot is not mutated", () => {
    const snapshot = obrnut(srednji());
    const pre = JSON.stringify(snapshot);
    sadrzajIzSnapshota(snapshot, snapshot.pages[0].key);
    straniceIzSnapshota(snapshot, NEMA_QR);
    expect(JSON.stringify(snapshot)).toBe(pre);
  });
});

describe("artikalIzSnapshota", () => {
  test("maps the article fields", () => {
    const snapshot = srednji();
    const kajmak = snapshot.articles.find((a) => a.name === "Kajmak sa pogačom")!;
    expect(artikalIzSnapshota(kajmak)).toEqual({
      id: kajmak.key,
      key: kajmak.key,
      vrsta: "item",
      naziv: "Kajmak sa pogačom",
      opis: "Domaći kajmak i topla pogača.",
      cena: 480,
      kolicina: null,
      jedinica: null,
      medij: "icon",
      ikonica: "kajmak",
      varijante: false,
      proveriCenu: false,
    });
  });

  test("quantity, variants without a base price and combos", () => {
    const snapshot = srednji();
    const supa = artikalIzSnapshota(snapshot.articles.find((a) => a.name === "Domaća pileća supa")!);
    expect(supa).toMatchObject({ kolicina: 0.3, jedinica: "l" });
    const cevapi = artikalIzSnapshota(snapshot.articles.find((a) => a.name === "Ćevapi")!);
    expect(cevapi).toMatchObject({ cena: null, varijante: true });
    const rucak = artikalIzSnapshota(snapshot.articles.find((a) => a.name === "Ručak dana")!);
    expect(rucak).toMatchObject({ vrsta: "combo", cena: 1150 });
  });

  test("proveriCenu is true when a price check is pending", () => {
    const snapshot = srednji();
    const rucak = snapshot.articles.find((a) => a.name === "Ručak dana")!;
    expect(artikalIzSnapshota(rucak).proveriCenu).toBe(false);
    expect(artikalIzSnapshota({ ...rucak, priceCheck: { since: 1, changedComponentKeys: [], removedComponentNames: [] } }).proveriCenu).toBe(true);
  });
});
