// ScanMe Menu V1 — K11: the editor's order, article-state and `Izaberi više`
// actions on the in-memory menu (the izlog's backend). They follow the rules of
// the Convex mutations in convex/menuBulk.ts and menuStructure: row order
// (movePlacement / moveSection), live availability, hide / show, remove from a
// page, move to a section, add to a page, all-or-nothing prices and deletion
// with a token over the impact.
//
// Everything runs on the invented "Demo restoran" (fixtureMenu("srednji")):
// "Kompletan meni" has the sections Predjela, Supe i salate, Sa roštilja,
// Glavna jela, Prilozi, Dezerti, Pića and Vina; "Vinska karta" shows the SAME
// wine articles in Bela vina and Crvena vina.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { MENU_ERROR } from "../errors/core";
import { MENU_MAX_BULK_BATCH, MENU_MAX_PRICE_RSD } from "../limits";
import type { SnapshotPriceCheck, SnapshotRoomServiceCategory, SnapshotRoomServiceItem } from "../snapshot";
import { prikazId, sadrzajIzSnapshota } from "./iz-snapshota";
import {
  arhivirajStranicu,
  dodajNaStranicu,
  dodajPostojeci,
  dodajSekciju,
  noviKombo,
  obrisiArtikle,
  pocetnoStanje,
  postaviCene,
  postaviDostupnost,
  postaviVidljivost,
  premestiPrikaz,
  premestiSekciju,
  premestiUSekciju,
  sekcijeStranice,
  stanjeNacrta,
  ukloniSaStranice,
  uticajBrisanja,
  type MemorijaKorak,
  type MemorijaStanje,
} from "./memorija";
import type { StudioPromenaCene } from "./model";

const SADA = 1_760_000_000_000;
const M = "Kompletan meni";
const V = "Vinska karta";

// --- helpers ------------------------------------------------------------------

function stanje(opcije: Parameters<typeof pocetnoStanje>[1] = {}): MemorijaStanje {
  return pocetnoStanje(fixtureMenu("srednji").snapshot, opcije);
}

function artikal(s: MemorijaStanje, naziv: string) {
  const found = s.snapshot.articles.find((a) => a.name === naziv);
  if (!found) throw new Error(`fixture article "${naziv}" missing`);
  return found;
}

function stranica(s: MemorijaStanje, naziv: string) {
  const found = s.snapshot.pages.find((p) => p.name === naziv);
  if (!found) throw new Error(`fixture page "${naziv}" missing`);
  return found;
}

function sekcija(s: MemorijaStanje, stranicaNaziv: string, naziv: string) {
  const page = stranica(s, stranicaNaziv);
  const found = s.snapshot.sections.find((sec) => sec.pageKey === page.key && sec.name === naziv);
  if (!found) throw new Error(`fixture section "${naziv}" missing`);
  return found;
}

/** The row id "<sectionKey>/<articleKey>" of an article in a section. */
function red(s: MemorijaStanje, stranicaNaziv: string, sekcijaNaziv: string, artikalNaziv: string): string {
  return prikazId(sekcija(s, stranicaNaziv, sekcijaNaziv).key, artikal(s, artikalNaziv).key);
}

/** The work area of a page, as the editor reads it. */
function sadrzaj(s: MemorijaStanje, stranicaNaziv: string) {
  const result = sadrzajIzSnapshota(s.snapshot, stranica(s, stranicaNaziv).key);
  if (!result) throw new Error(`page "${stranicaNaziv}" has no content`);
  return result;
}

function sekcijaSadrzaja(s: MemorijaStanje, stranicaNaziv: string, sekcijaNaziv: string) {
  const found = sadrzaj(s, stranicaNaziv).sekcije.find((sec) => sec.naziv === sekcijaNaziv);
  if (!found) throw new Error(`section "${sekcijaNaziv}" missing from the work area`);
  return found;
}

/** Article names of one section, in the order the editor shows them. */
function nazivi(s: MemorijaStanje, stranicaNaziv: string, sekcijaNaziv: string): string[] {
  return sekcijaSadrzaja(s, stranicaNaziv, sekcijaNaziv).redovi.map((r) => r.artikal.naziv);
}

/** Section names of one page, in the order the editor shows them. */
function naziviSekcija(s: MemorijaStanje, stranicaNaziv: string): string[] {
  return sadrzaj(s, stranicaNaziv).sekcije.map((sec) => sec.naziv);
}

function sakriven(s: MemorijaStanje, stranicaNaziv: string, sekcijaNaziv: string, artikalNaziv: string): boolean {
  const found = sekcijaSadrzaja(s, stranicaNaziv, sekcijaNaziv).redovi.find((r) => r.artikal.naziv === artikalNaziv);
  if (!found) throw new Error(`row "${artikalNaziv}" missing`);
  return found.sakriven;
}

function cenaNaStranici(s: MemorijaStanje, stranicaNaziv: string, naziv: string): number | null | undefined {
  const found = sadrzaj(s, stranicaNaziv)
    .sekcije.flatMap((sec) => sec.redovi)
    .find((r) => r.artikal.naziv === naziv);
  return found === undefined ? undefined : found.artikal.cena;
}

function strogoRastuce(brojevi: readonly number[]): boolean {
  return brojevi.every((broj, index) => index === 0 || broj > brojevi[index - 1]);
}

/** The step must have succeeded; returns the next state and the value. */
function uspeh<T>(korak: MemorijaKorak<T>): { stanje: MemorijaStanje; vrednost: T } {
  if (!korak.ishod.ok) throw new Error(`expected success, got ${JSON.stringify(korak.ishod)}`);
  return { stanje: korak.stanje, vrednost: korak.ishod.vrednost };
}

/** The step must have been refused with this code and must have left the state untouched. */
function odbijeno<T>(korak: MemorijaKorak<T>, pre: MemorijaStanje, kod: string) {
  expect(korak.ishod).toEqual({ ok: false, vrsta: "greska", kod, ponovljivo: false });
  expect(korak.stanje).toBe(pre);
}

/** A successful no-op: the value is returned, the very same state comes back, no revision step. */
function bezPromene<T>(korak: MemorijaKorak<T>, pre: MemorijaStanje, vrednost: T) {
  expect(korak.ishod).toEqual({ ok: true, vrednost });
  expect(korak.stanje).toBe(pre);
  expect(korak.stanje.revizija).toBe(pre.revizija);
}

/** The state with a Room service category holding these articles. */
function saRoomService(s: MemorijaStanje, ...imena: string[]): MemorijaStanje {
  const kategorija: SnapshotRoomServiceCategory = { key: "rsc_test", name: "Za sobu", order: 0, translations: null };
  const items: SnapshotRoomServiceItem[] = imena.map((ime, order) => ({
    articleKey: artikal(s, ime).key,
    categoryKey: kategorija.key,
    order,
    markupApplies: true,
    manualPriceRsd: null,
    priceWarning: null,
    manualVariantPrices: null,
  }));
  return {
    ...s,
    snapshot: { ...s.snapshot, roomService: { ...s.snapshot.roomService, categories: [kategorija], items } },
  };
}

/** The state with a "Proveri cenu" flag on one article. */
function saPriceCheck(s: MemorijaStanje, naziv: string, priceCheck: SnapshotPriceCheck): MemorijaStanje {
  const kljuc = artikal(s, naziv).key;
  return {
    ...s,
    snapshot: {
      ...s.snapshot,
      articles: s.snapshot.articles.map((a) => (a.key === kljuc ? { ...a, priceCheck } : a)),
    },
  };
}

function promena(s: MemorijaStanje, naziv: string, nova: number, ocekivana?: number | null): StudioPromenaCene {
  const a = artikal(s, naziv);
  return { artikalId: a.key, ocekivana: ocekivana === undefined ? a.basePriceRsd : ocekivana, nova };
}

function zamrzni<T>(vrednost: T): T {
  if (vrednost !== null && typeof vrednost === "object" && !Object.isFrozen(vrednost)) {
    Object.freeze(vrednost);
    for (const dete of Object.values(vrednost)) zamrzni(dete);
  }
  return vrednost;
}

const nepostojeciArtikli = (n: number) => Array.from({ length: n }, (_, i) => `ar_nema${i}`);
const nepostojeciPrikazi = (n: number) => Array.from({ length: n }, (_, i) => `sc_nema/ar_nema${i}`);

const DEZERTI = [
  "Palačinke sa orasima",
  "Tiramisu",
  "Baklava",
  "Tufahije",
  "Čokoladni sufle",
  "Sladoled, kugla",
  "Voćna salata",
];
const SEKCIJE = ["Predjela", "Supe i salate", "Sa roštilja", "Glavna jela", "Prilozi", "Dezerti", "Pića", "Vina"];
const PRILOZI = ["Pomfrit", "Pečeni krompir", "Kajmak", "Ajvar", "Grilovano povrće", "Pogača"];

describe("fixture facts the tests below rely on", () => {
  test("section and row order of Demo restoran", () => {
    const s0 = stanje();
    expect(naziviSekcija(s0, M)).toEqual(SEKCIJE);
    expect(nazivi(s0, M, "Dezerti")).toEqual(DEZERTI);
    expect(nazivi(s0, M, "Prilozi")).toEqual(PRILOZI);
    expect(naziviSekcija(s0, V)).toEqual(["Bela vina", "Crvena vina"]);
    expect(nazivi(s0, V, "Bela vina")).toEqual(["Tamjanika", "Sauvignon Blanc", "Rizling", "Chardonnay"]);
  });
});

// --- premestiPrikaz ---------------------------------------------------------------

describe("premestiPrikaz", () => {
  test("inside a section: a row goes directly before another row, up and down", () => {
    const s0 = stanje();
    const dezerti = sekcija(s0, M, "Dezerti");
    const r = (naziv: string) => red(s0, M, "Dezerti", naziv);

    const gore = uspeh(premestiPrikaz(s0, r("Voćna salata"), dezerti.key, r("Tiramisu"))).stanje;
    expect(nazivi(gore, M, "Dezerti")).toEqual([
      "Palačinke sa orasima",
      "Voćna salata",
      "Tiramisu",
      "Baklava",
      "Tufahije",
      "Čokoladni sufle",
      "Sladoled, kugla",
    ]);

    const dole = uspeh(premestiPrikaz(s0, r("Palačinke sa orasima"), dezerti.key, r("Tufahije"))).stanje;
    expect(nazivi(dole, M, "Dezerti")).toEqual([
      "Tiramisu",
      "Baklava",
      "Palačinke sa orasima",
      "Tufahije",
      "Čokoladni sufle",
      "Sladoled, kugla",
      "Voćna salata",
    ]);
  });

  test("null puts the row at the end; 'before the first row' puts it first", () => {
    const s0 = stanje();
    const dezerti = sekcija(s0, M, "Dezerti");
    const r = (naziv: string) => red(s0, M, "Dezerti", naziv);

    const naKraj = uspeh(premestiPrikaz(s0, r("Palačinke sa orasima"), dezerti.key, null)).stanje;
    expect(nazivi(naKraj, M, "Dezerti")).toEqual([
      "Tiramisu",
      "Baklava",
      "Tufahije",
      "Čokoladni sufle",
      "Sladoled, kugla",
      "Voćna salata",
      "Palačinke sa orasima",
    ]);

    const naPocetak = uspeh(premestiPrikaz(s0, r("Voćna salata"), dezerti.key, r("Palačinke sa orasima"))).stanje;
    expect(nazivi(naPocetak, M, "Dezerti")).toEqual(["Voćna salata", ...DEZERTI.slice(0, 6)]);
  });

  test("a real move bumps the revision by exactly one", () => {
    const s0 = stanje();
    const dezerti = sekcija(s0, M, "Dezerti");
    const s1 = uspeh(premestiPrikaz(s0, red(s0, M, "Dezerti", "Baklava"), dezerti.key, null)).stanje;
    expect(s1.revizija).toBe(s0.revizija + 1);
    const s2 = uspeh(premestiPrikaz(s1, red(s1, M, "Dezerti", "Tiramisu"), dezerti.key, null)).stanje;
    expect(s2.revizija).toBe(s0.revizija + 2);
    // The previous state is not touched.
    expect(nazivi(s0, M, "Dezerti")).toEqual(DEZERTI);
    expect(s0.revizija).toBe(1);
  });

  test("the section is renumbered strictly increasing; nothing else changes", () => {
    const s0 = stanje();
    const dezerti = sekcija(s0, M, "Dezerti");
    const s1 = uspeh(premestiPrikaz(s0, red(s0, M, "Dezerti", "Voćna salata"), dezerti.key, red(s0, M, "Dezerti", "Tiramisu")))
      .stanje;
    const redosledi = sekcijaSadrzaja(s1, M, "Dezerti").redovi.map((r) => r.redosled);
    expect(redosledi).toHaveLength(DEZERTI.length);
    expect(strogoRastuce(redosledi)).toBe(true);
    for (const naziv of SEKCIJE.filter((n) => n !== "Dezerti")) {
      expect(nazivi(s1, M, naziv)).toEqual(nazivi(s0, M, naziv));
    }
    expect(sadrzaj(s1, V)).toEqual(sadrzaj(s0, V));
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    expect(s1.snapshot.placements).toHaveLength(s0.snapshot.placements.length);
    expect(s1.snapshot.sections).toBe(s0.snapshot.sections);
  });

  test("a hidden row stays hidden when it moves", () => {
    const s0 = stanje();
    const glavna = sekcija(s0, M, "Glavna jela");
    expect(sakriven(s0, M, "Glavna jela", "Jagnjetina ispod sača")).toBe(true);
    const s1 = uspeh(
      premestiPrikaz(s0, red(s0, M, "Glavna jela", "Jagnjetina ispod sača"), glavna.key, red(s0, M, "Glavna jela", "Sarma")),
    ).stanje;
    expect(nazivi(s1, M, "Glavna jela")[0]).toBe("Jagnjetina ispod sača");
    expect(sakriven(s1, M, "Glavna jela", "Jagnjetina ispod sača")).toBe(true);
  });

  test("to another section of the same page: before a row, to the end, into an empty section", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    const baklava = red(s0, M, "Dezerti", "Baklava");

    const pred = uspeh(premestiPrikaz(s0, baklava, prilozi.key, red(s0, M, "Prilozi", "Pogača")));
    expect(nazivi(pred.stanje, M, "Prilozi")).toEqual([
      "Pomfrit",
      "Pečeni krompir",
      "Kajmak",
      "Ajvar",
      "Grilovano povrće",
      "Baklava",
      "Pogača",
    ]);
    expect(nazivi(pred.stanje, M, "Dezerti")).toEqual(DEZERTI.filter((n) => n !== "Baklava"));
    expect(pred.stanje.revizija).toBe(s0.revizija + 1);
    // The row now belongs to the new section; the page stays the same.
    const premesten = pred.stanje.snapshot.placements.filter((p) => p.articleKey === artikal(s0, "Baklava").key);
    expect(premesten).toHaveLength(1);
    expect(premesten[0]).toMatchObject({ sectionKey: prilozi.key, pageKey: prilozi.pageKey });
    expect(sekcijaSadrzaja(pred.stanje, M, "Prilozi").redovi[5].prikazId).toBe(`${prilozi.key}/${artikal(s0, "Baklava").key}`);

    const naKraj = uspeh(premestiPrikaz(s0, baklava, prilozi.key, null)).stanje;
    expect(nazivi(naKraj, M, "Prilozi")).toEqual([...PRILOZI, "Baklava"]);
    expect(strogoRastuce(sekcijaSadrzaja(naKraj, M, "Prilozi").redovi.map((r) => r.redosled))).toBe(true);

    const prazna = uspeh(dodajSekciju(s0, stranica(s0, M).key, "Slano"));
    const uPraznu = uspeh(premestiPrikaz(prazna.stanje, baklava, prazna.vrednost.id, null)).stanje;
    expect(nazivi(uPraznu, M, "Slano")).toEqual(["Baklava"]);
    expect(nazivi(uPraznu, M, "Dezerti")).toEqual(DEZERTI.filter((n) => n !== "Baklava"));
  });

  test("the source section keeps its other rows in order; the same article on another page is not touched", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    const s1 = uspeh(premestiPrikaz(s0, red(s0, M, "Vina", "Tamjanika"), prilozi.key, null)).stanje;
    expect(nazivi(s1, M, "Vina")).toEqual(nazivi(s0, M, "Vina").filter((n) => n !== "Tamjanika"));
    expect(nazivi(s1, M, "Prilozi")).toEqual([...PRILOZI, "Tamjanika"]);
    expect(sadrzaj(s1, V)).toEqual(sadrzaj(s0, V));
  });

  test("a move on one page does not reorder the same section's article on the other page", () => {
    const s0 = stanje();
    const bela = sekcija(s0, V, "Bela vina");
    const s1 = uspeh(premestiPrikaz(s0, red(s0, V, "Bela vina", "Tamjanika"), bela.key, null)).stanje;
    expect(nazivi(s1, V, "Bela vina")).toEqual(["Sauvignon Blanc", "Rizling", "Chardonnay", "Tamjanika"]);
    expect(sadrzaj(s1, M)).toEqual(sadrzaj(s0, M));
  });

  test("the same place is ok and the revision does not move", () => {
    const s0 = stanje();
    const dezerti = sekcija(s0, M, "Dezerti");
    const r = (naziv: string) => red(s0, M, "Dezerti", naziv);
    // Tiramisu already stands directly before Baklava.
    bezPromene(premestiPrikaz(s0, r("Tiramisu"), dezerti.key, r("Baklava")), s0, null);
    // The first row before the second one.
    bezPromene(premestiPrikaz(s0, r("Palačinke sa orasima"), dezerti.key, r("Tiramisu")), s0, null);
    // The last row to the end.
    bezPromene(premestiPrikaz(s0, r("Voćna salata"), dezerti.key, null), s0, null);
    // A row "before itself".
    bezPromene(premestiPrikaz(s0, r("Baklava"), dezerti.key, r("Baklava")), s0, null);
  });

  test("repeating a real move is a no-op", () => {
    const s0 = stanje();
    const dezerti = sekcija(s0, M, "Dezerti");
    const baklava = red(s0, M, "Dezerti", "Baklava");
    const pre = red(s0, M, "Dezerti", "Palačinke sa orasima");
    const s1 = uspeh(premestiPrikaz(s0, baklava, dezerti.key, pre)).stanje;
    expect(nazivi(s1, M, "Dezerti")[0]).toBe("Baklava");
    bezPromene(premestiPrikaz(s1, baklava, dezerti.key, pre), s1, null);
  });

  test("an unknown row or target section is not_found", () => {
    const s0 = stanje();
    const dezerti = sekcija(s0, M, "Dezerti");
    odbijeno(premestiPrikaz(s0, "sc_nema/ar_nema", dezerti.key, null), s0, MENU_ERROR.notFound);
    odbijeno(premestiPrikaz(s0, "bez-kose", dezerti.key, null), s0, MENU_ERROR.notFound);
    odbijeno(premestiPrikaz(s0, `${dezerti.key}/ar_nema`, dezerti.key, null), s0, MENU_ERROR.notFound);
    odbijeno(premestiPrikaz(s0, red(s0, M, "Dezerti", "Baklava"), "sc_nema", null), s0, MENU_ERROR.notFound);
    expect(MENU_ERROR.notFound).toBe("menu/not_found");
  });

  test("a target section of another page is invalid_input", () => {
    const s0 = stanje();
    const bela = sekcija(s0, V, "Bela vina");
    const dezerti = sekcija(s0, M, "Dezerti");
    odbijeno(premestiPrikaz(s0, red(s0, M, "Dezerti", "Baklava"), bela.key, null), s0, MENU_ERROR.invalidInput);
    odbijeno(premestiPrikaz(s0, red(s0, V, "Bela vina", "Tamjanika"), dezerti.key, null), s0, MENU_ERROR.invalidInput);
    expect(MENU_ERROR.invalidInput).toBe("menu/invalid_input");
  });

  test("a 'before' row that is missing or stands in another section is invalid_input", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    const baklava = red(s0, M, "Dezerti", "Baklava");
    odbijeno(premestiPrikaz(s0, baklava, prilozi.key, "sc_nema/ar_nema"), s0, MENU_ERROR.invalidInput);
    // Tiramisu stands in Dezerti, not in the target Prilozi.
    odbijeno(premestiPrikaz(s0, baklava, prilozi.key, red(s0, M, "Dezerti", "Tiramisu")), s0, MENU_ERROR.invalidInput);
  });

  test("a target section that already shows the article is placement_exists", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    const baklavaUPrilozima = uspeh(dodajPostojeci(s0, prilozi.key, artikal(s0, "Baklava").key)).stanje;
    const baklava = red(baklavaUPrilozima, M, "Dezerti", "Baklava");
    odbijeno(premestiPrikaz(baklavaUPrilozima, baklava, prilozi.key, null), baklavaUPrilozima, MENU_ERROR.placementExists);
    odbijeno(
      premestiPrikaz(baklavaUPrilozima, baklava, prilozi.key, red(baklavaUPrilozima, M, "Prilozi", "Pogača")),
      baklavaUPrilozima,
      MENU_ERROR.placementExists,
    );
    expect(MENU_ERROR.placementExists).toBe("menu/placement_exists");
  });

  test("a row of an archived page is page_archived", () => {
    const s0 = stanje();
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, V).key, SADA)).stanje;
    const bela = sekcija(arhivirano, V, "Bela vina");
    odbijeno(
      premestiPrikaz(arhivirano, red(arhivirano, V, "Bela vina", "Tamjanika"), bela.key, null),
      arhivirano,
      MENU_ERROR.pageArchived,
    );
    expect(MENU_ERROR.pageArchived).toBe("menu/page_archived");
  });
});

// --- premestiSekciju --------------------------------------------------------------

describe("premestiSekciju", () => {
  test("reorders the sections of one page and bumps the revision once", () => {
    const s0 = stanje();
    const vina = sekcija(s0, M, "Vina").key;
    const predjela = sekcija(s0, M, "Predjela").key;

    const naPocetak = uspeh(premestiSekciju(s0, vina, 0)).stanje;
    expect(naziviSekcija(naPocetak, M)).toEqual(["Vina", ...SEKCIJE.slice(0, 7)]);
    expect(naPocetak.revizija).toBe(s0.revizija + 1);

    const nadole = uspeh(premestiSekciju(s0, predjela, 2)).stanje;
    expect(naziviSekcija(nadole, M)).toEqual([
      "Supe i salate",
      "Sa roštilja",
      "Predjela",
      "Glavna jela",
      "Prilozi",
      "Dezerti",
      "Pića",
      "Vina",
    ]);

    const naKraj = uspeh(premestiSekciju(s0, predjela, 7)).stanje;
    expect(naziviSekcija(naKraj, M)).toEqual([...SEKCIJE.slice(1), "Predjela"]);
  });

  test("the rows go with their sections; the sections are renumbered strictly increasing", () => {
    const s0 = stanje();
    const s1 = uspeh(premestiSekciju(s0, sekcija(s0, M, "Dezerti").key, 0)).stanje;
    expect(s1.snapshot.placements).toBe(s0.snapshot.placements);
    expect(nazivi(s1, M, "Dezerti")).toEqual(DEZERTI);
    expect(strogoRastuce(sadrzaj(s1, M).sekcije.map((sec) => sec.redosled))).toBe(true);
    expect(s0.snapshot.sections.find((sec) => sec.name === "Dezerti")!.order).toBe(5);
  });

  test("only the sections of that page change", () => {
    const s0 = stanje();
    const s1 = uspeh(premestiSekciju(s0, sekcija(s0, V, "Crvena vina").key, 0)).stanje;
    expect(naziviSekcija(s1, V)).toEqual(["Crvena vina", "Bela vina"]);
    expect(sadrzaj(s1, M)).toEqual(sadrzaj(s0, M));
  });

  test("the same index is ok and does not step the revision", () => {
    const s0 = stanje();
    bezPromene(premestiSekciju(s0, sekcija(s0, M, "Predjela").key, 0), s0, null);
    bezPromene(premestiSekciju(s0, sekcija(s0, M, "Dezerti").key, 5), s0, null);
    bezPromene(premestiSekciju(s0, sekcija(s0, M, "Vina").key, 7), s0, null);
  });

  test("the index is clamped to the first and the last place", () => {
    const s0 = stanje();
    const dezerti = sekcija(s0, M, "Dezerti").key;
    const naPocetak = uspeh(premestiSekciju(s0, dezerti, -3)).stanje;
    expect(naziviSekcija(naPocetak, M)[0]).toBe("Dezerti");
    const naKraj = uspeh(premestiSekciju(s0, dezerti, 99)).stanje;
    expect(naziviSekcija(naKraj, M)[7]).toBe("Dezerti");
    expect(naziviSekcija(naKraj, M)).toHaveLength(8);
    // Clamped onto the place it already has: nothing to do.
    bezPromene(premestiSekciju(s0, sekcija(s0, M, "Vina").key, 99), s0, null);
    bezPromene(premestiSekciju(s0, sekcija(s0, M, "Predjela").key, -1), s0, null);
  });

  test("an unknown section is not_found, a section of an archived page is page_archived", () => {
    const s0 = stanje();
    odbijeno(premestiSekciju(s0, "sc_nema", 0), s0, MENU_ERROR.notFound);
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, V).key, SADA)).stanje;
    odbijeno(premestiSekciju(arhivirano, sekcija(arhivirano, V, "Crvena vina").key, 0), arhivirano, MENU_ERROR.pageArchived);
  });
});

// --- postaviDostupnost ------------------------------------------------------------

describe("postaviDostupnost", () => {
  test("is live: nedostupni changes, the revision and the draft do not", () => {
    const s0 = stanje();
    const gibanica = artikal(s0, "Gibanica").key;
    const tiramisu = artikal(s0, "Tiramisu").key;
    const { stanje: s1, vrednost } = uspeh(postaviDostupnost(s0, [gibanica, tiramisu], false));
    expect(vrednost).toEqual({ promenjeno: 2 });
    expect(s1.nedostupni).toEqual(new Set([gibanica, tiramisu]));
    expect(s1.revizija).toBe(s0.revizija);
    expect(s1.snapshot).toBe(s0.snapshot);
    // The previous state is not mutated.
    expect(s0.nedostupni.size).toBe(0);
  });

  test("a published draft stays clean: availability is not a draft change", () => {
    const s0 = stanje({ objavljeno: { verzija: 1, u: SADA } });
    expect(stanjeNacrta(s0)).toBe("clean");
    const s1 = uspeh(postaviDostupnost(s0, [artikal(s0, "Gibanica").key], false)).stanje;
    expect(s1.nedostupni.has(artikal(s0, "Gibanica").key)).toBe(true);
    expect(stanjeNacrta(s1)).toBe("clean");
    expect(s1.objavljenaRevizija).toBe(s0.objavljenaRevizija);
  });

  test("'Dostupno' brings articles back", () => {
    const gibanica = artikal(stanje(), "Gibanica").key;
    const s0 = stanje({ nedostupni: [gibanica] });
    const { stanje: s1, vrednost } = uspeh(postaviDostupnost(s0, [gibanica], true));
    expect(vrednost).toEqual({ promenjeno: 1 });
    expect(s1.nedostupni.size).toBe(0);
    expect(s1.revizija).toBe(s0.revizija);
    // The previous state still lists it.
    expect(s0.nedostupni.has(gibanica)).toBe(true);
  });

  test("promenjeno counts real changes only", () => {
    const s0 = stanje();
    const gibanica = artikal(s0, "Gibanica").key;
    const baklava = artikal(s0, "Baklava").key;
    const s1 = uspeh(postaviDostupnost(s0, [gibanica], false)).stanje;

    // Gibanica is already unavailable; only Baklava changes.
    const s2 = uspeh(postaviDostupnost(s1, [gibanica, baklava], false));
    expect(s2.vrednost).toEqual({ promenjeno: 1 });
    expect(s2.stanje.nedostupni).toEqual(new Set([gibanica, baklava]));

    // Baklava was not unavailable in s1; only Gibanica comes back.
    const s3 = uspeh(postaviDostupnost(s1, [gibanica, baklava], true));
    expect(s3.vrednost).toEqual({ promenjeno: 1 });
    expect(s3.stanje.nedostupni.size).toBe(0);
  });

  test("nothing to change: promenjeno 0 and the very same state", () => {
    const s0 = stanje();
    const gibanica = artikal(s0, "Gibanica").key;
    bezPromene(postaviDostupnost(s0, [gibanica], true), s0, { promenjeno: 0 });
    const s1 = uspeh(postaviDostupnost(s0, [gibanica], false)).stanje;
    bezPromene(postaviDostupnost(s1, [gibanica], false), s1, { promenjeno: 0 });
  });

  test("a repeated id counts once", () => {
    const s0 = stanje();
    const gibanica = artikal(s0, "Gibanica").key;
    const { vrednost, stanje: s1 } = uspeh(postaviDostupnost(s0, [gibanica, gibanica, gibanica], false));
    expect(vrednost).toEqual({ promenjeno: 1 });
    expect(s1.nedostupni.size).toBe(1);
  });

  test("no ids and more than 200 ids are invalid_input", () => {
    const s0 = stanje();
    odbijeno(postaviDostupnost(s0, [], false), s0, MENU_ERROR.invalidInput);
    odbijeno(postaviDostupnost(s0, nepostojeciArtikli(MENU_MAX_BULK_BATCH + 1), false), s0, MENU_ERROR.invalidInput);
  });

  test("an unknown id refuses the whole batch and changes nothing", () => {
    const s0 = stanje();
    const gibanica = artikal(s0, "Gibanica").key;
    const korak = postaviDostupnost(s0, [gibanica, "ar_nema"], false);
    odbijeno(korak, s0, MENU_ERROR.notFound);
    expect(korak.stanje.nedostupni.has(gibanica)).toBe(false);
    expect(korak.stanje.nedostupni.size).toBe(0);
  });
});

// --- postaviVidljivost ------------------------------------------------------------

describe("postaviVidljivost", () => {
  test("hides rows: counts them, one revision step, the rows keep their place", () => {
    const s0 = stanje();
    const r = (naziv: string) => red(s0, M, "Dezerti", naziv);
    const { stanje: s1, vrednost } = uspeh(postaviVidljivost(s0, [r("Baklava"), r("Tufahije")], true));
    expect(vrednost).toEqual({ promenjeno: 2 });
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(sakriven(s1, M, "Dezerti", "Baklava")).toBe(true);
    expect(sakriven(s1, M, "Dezerti", "Tufahije")).toBe(true);
    expect(sakriven(s1, M, "Dezerti", "Tiramisu")).toBe(false);
    // "Sakrij" keeps order and article rows.
    expect(nazivi(s1, M, "Dezerti")).toEqual(DEZERTI);
    expect(sekcijaSadrzaja(s1, M, "Dezerti").redovi.map((x) => x.redosled)).toEqual(
      sekcijaSadrzaja(s0, M, "Dezerti").redovi.map((x) => x.redosled),
    );
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    // The previous state is not mutated.
    expect(sakriven(s0, M, "Dezerti", "Baklava")).toBe(false);
  });

  test("'Prikaži' shows hidden rows again", () => {
    const s0 = stanje();
    const jagnjetina = red(s0, M, "Glavna jela", "Jagnjetina ispod sača");
    expect(sakriven(s0, M, "Glavna jela", "Jagnjetina ispod sača")).toBe(true);
    const { stanje: s1, vrednost } = uspeh(postaviVidljivost(s0, [jagnjetina], false));
    expect(vrednost).toEqual({ promenjeno: 1 });
    expect(sakriven(s1, M, "Glavna jela", "Jagnjetina ispod sača")).toBe(false);
    expect(s1.revizija).toBe(s0.revizija + 1);
  });

  test("no-op when the rows are already in that state: no revision step", () => {
    const s0 = stanje();
    // Already hidden.
    bezPromene(postaviVidljivost(s0, [red(s0, M, "Glavna jela", "Jagnjetina ispod sača")], true), s0, { promenjeno: 0 });
    // Already visible.
    bezPromene(postaviVidljivost(s0, [red(s0, M, "Dezerti", "Baklava")], false), s0, { promenjeno: 0 });
  });

  test("only the real changes are counted", () => {
    const s0 = stanje();
    const { stanje: s1, vrednost } = uspeh(
      postaviVidljivost(
        s0,
        [red(s0, M, "Glavna jela", "Jagnjetina ispod sača"), red(s0, M, "Dezerti", "Baklava")],
        true,
      ),
    );
    expect(vrednost).toEqual({ promenjeno: 1 });
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(sakriven(s1, M, "Dezerti", "Baklava")).toBe(true);
  });

  test("hides the row on this page only: the same article on another page stays visible", () => {
    const s0 = stanje();
    const s1 = uspeh(postaviVidljivost(s0, [red(s0, M, "Vina", "Tamjanika")], true)).stanje;
    expect(sakriven(s1, M, "Vina", "Tamjanika")).toBe(true);
    expect(sakriven(s1, V, "Bela vina", "Tamjanika")).toBe(false);
    expect(s1.snapshot.placements.filter((p) => p.articleKey === artikal(s0, "Tamjanika").key)).toHaveLength(2);
  });

  test("a repeated row id counts once", () => {
    const s0 = stanje();
    const baklava = red(s0, M, "Dezerti", "Baklava");
    expect(uspeh(postaviVidljivost(s0, [baklava, baklava], true)).vrednost).toEqual({ promenjeno: 1 });
  });

  test("an unknown row refuses the whole batch", () => {
    const s0 = stanje();
    const baklava = red(s0, M, "Dezerti", "Baklava");
    odbijeno(postaviVidljivost(s0, [baklava, "sc_nema/ar_nema"], true), s0, MENU_ERROR.notFound);
    odbijeno(postaviVidljivost(s0, ["bez-kose"], true), s0, MENU_ERROR.notFound);
    expect(sakriven(s0, M, "Dezerti", "Baklava")).toBe(false);
  });

  test("no ids and more than 200 ids are invalid_input", () => {
    const s0 = stanje();
    odbijeno(postaviVidljivost(s0, [], true), s0, MENU_ERROR.invalidInput);
    odbijeno(postaviVidljivost(s0, nepostojeciPrikazi(MENU_MAX_BULK_BATCH + 1), true), s0, MENU_ERROR.invalidInput);
  });

  test("a row of an archived page is page_archived", () => {
    const s0 = stanje();
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, V).key, SADA)).stanje;
    odbijeno(
      postaviVidljivost(arhivirano, [red(arhivirano, V, "Bela vina", "Tamjanika")], true),
      arhivirano,
      MENU_ERROR.pageArchived,
    );
  });
});

// --- ukloniSaStranice -------------------------------------------------------------

describe("ukloniSaStranice", () => {
  test("the rows leave this page; the article stays in the menu and on other pages", () => {
    const s0 = stanje();
    const tamjanika = artikal(s0, "Tamjanika");
    const { stanje: s1, vrednost } = uspeh(ukloniSaStranice(s0, [red(s0, M, "Vina", "Tamjanika")]));
    expect(vrednost).toEqual({ uklonjeno: 1 });
    expect(nazivi(s1, M, "Vina")).toEqual(nazivi(s0, M, "Vina").filter((n) => n !== "Tamjanika"));
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    expect(s1.snapshot.articles.some((a) => a.key === tamjanika.key)).toBe(true);
    // Still on the wine list, at the same price.
    expect(nazivi(s1, V, "Bela vina")).toContain("Tamjanika");
    expect(cenaNaStranici(s1, V, "Tamjanika")).toBe(2200);
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(nazivi(s0, M, "Vina")).toContain("Tamjanika");
  });

  test("an article that stood on one page only is kept in the menu without a placement", () => {
    const s0 = stanje();
    const baklava = artikal(s0, "Baklava");
    const { stanje: s1, vrednost } = uspeh(ukloniSaStranice(s0, [red(s0, M, "Dezerti", "Baklava")]));
    expect(vrednost).toEqual({ uklonjeno: 1 });
    expect(s1.snapshot.articles.some((a) => a.key === baklava.key)).toBe(true);
    expect(s1.snapshot.placements.some((p) => p.articleKey === baklava.key)).toBe(false);
    expect(nazivi(s1, M, "Dezerti")).toEqual(DEZERTI.filter((n) => n !== "Baklava"));
  });

  test("many rows, from several sections and pages, in one revision step", () => {
    const s0 = stanje();
    const ids = [
      red(s0, M, "Dezerti", "Baklava"),
      red(s0, M, "Prilozi", "Pogača"),
      red(s0, M, "Vina", "Tamjanika"),
      red(s0, V, "Bela vina", "Tamjanika"),
    ];
    const { stanje: s1, vrednost } = uspeh(ukloniSaStranice(s0, ids));
    expect(vrednost).toEqual({ uklonjeno: 4 });
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(s1.snapshot.placements).toHaveLength(s0.snapshot.placements.length - 4);
    // Tamjanika is now on no page at all, but it is still an article of the menu.
    const tamjanika = artikal(s1, "Tamjanika");
    expect(s1.snapshot.placements.some((p) => p.articleKey === tamjanika.key)).toBe(false);
  });

  test("a repeated row id counts once", () => {
    const s0 = stanje();
    const baklava = red(s0, M, "Dezerti", "Baklava");
    expect(uspeh(ukloniSaStranice(s0, [baklava, baklava])).vrednost).toEqual({ uklonjeno: 1 });
  });

  test("an unknown row refuses the whole batch and removes nothing", () => {
    const s0 = stanje();
    odbijeno(ukloniSaStranice(s0, [red(s0, M, "Dezerti", "Baklava"), "sc_nema/ar_nema"]), s0, MENU_ERROR.notFound);
    expect(nazivi(s0, M, "Dezerti")).toEqual(DEZERTI);
  });

  test("no ids and more than 200 ids are invalid_input", () => {
    const s0 = stanje();
    odbijeno(ukloniSaStranice(s0, []), s0, MENU_ERROR.invalidInput);
    odbijeno(ukloniSaStranice(s0, nepostojeciPrikazi(MENU_MAX_BULK_BATCH + 1)), s0, MENU_ERROR.invalidInput);
  });

  test("one row of an archived page refuses the whole batch", () => {
    const s0 = stanje();
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, V).key, SADA)).stanje;
    odbijeno(
      ukloniSaStranice(arhivirano, [red(arhivirano, M, "Dezerti", "Baklava"), red(arhivirano, V, "Bela vina", "Tamjanika")]),
      arhivirano,
      MENU_ERROR.pageArchived,
    );
  });
});

// --- premestiUSekciju -------------------------------------------------------------

describe("premestiUSekciju", () => {
  test("rows go to the end of the target in page order, whatever order they were given in", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    // Given: Dezerti row, Predjela row, Dezerti row. Page order: Predjela, then Dezerti top to bottom.
    const ids = [
      red(s0, M, "Dezerti", "Voćna salata"),
      red(s0, M, "Predjela", "Gibanica"),
      red(s0, M, "Dezerti", "Baklava"),
    ];
    const { stanje: s1, vrednost } = uspeh(premestiUSekciju(s0, ids, prilozi.key));
    expect(vrednost).toEqual({ premesteno: 3, preskoceno: 0 });
    expect(nazivi(s1, M, "Prilozi")).toEqual([...PRILOZI, "Gibanica", "Baklava", "Voćna salata"]);
    expect(strogoRastuce(sekcijaSadrzaja(s1, M, "Prilozi").redovi.map((r) => r.redosled))).toBe(true);
    expect(nazivi(s1, M, "Dezerti")).toEqual(DEZERTI.filter((n) => n !== "Baklava" && n !== "Voćna salata"));
    expect(nazivi(s1, M, "Predjela")).not.toContain("Gibanica");
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    // No new placements: the same rows moved.
    expect(s1.snapshot.placements).toHaveLength(s0.snapshot.placements.length);
    // The other page is untouched.
    expect(sadrzaj(s1, V)).toEqual(sadrzaj(s0, V));
  });

  test("rows already in the target stay and are counted as skipped", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    const { stanje: s1, vrednost } = uspeh(
      premestiUSekciju(s0, [red(s0, M, "Prilozi", "Pomfrit"), red(s0, M, "Dezerti", "Tufahije")], prilozi.key),
    );
    expect(vrednost).toEqual({ premesteno: 1, preskoceno: 1 });
    expect(nazivi(s1, M, "Prilozi")).toEqual([...PRILOZI, "Tufahije"]);
    expect(nazivi(s1, M, "Prilozi")[0]).toBe("Pomfrit");
  });

  test("an article the target already shows is skipped and its row stays where it was", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    const sBaklavom = uspeh(dodajPostojeci(s0, prilozi.key, artikal(s0, "Baklava").key)).stanje;
    const { stanje: s1, vrednost } = uspeh(
      premestiUSekciju(
        sBaklavom,
        [red(sBaklavom, M, "Dezerti", "Baklava"), red(sBaklavom, M, "Dezerti", "Tufahije")],
        prilozi.key,
      ),
    );
    expect(vrednost).toEqual({ premesteno: 1, preskoceno: 1 });
    expect(nazivi(s1, M, "Dezerti")).toContain("Baklava");
    expect(nazivi(s1, M, "Dezerti")).not.toContain("Tufahije");
    expect(nazivi(s1, M, "Prilozi")).toEqual([...PRILOZI, "Baklava", "Tufahije"]);
  });

  test("two rows of the same article: the first one in page order arrives, the other is skipped", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    const dvaPuta = uspeh(dodajPostojeci(s0, sekcija(s0, M, "Dezerti").key, artikal(s0, "Gibanica").key)).stanje;
    const { stanje: s1, vrednost } = uspeh(
      premestiUSekciju(
        dvaPuta,
        [red(dvaPuta, M, "Dezerti", "Gibanica"), red(dvaPuta, M, "Predjela", "Gibanica")],
        prilozi.key,
      ),
    );
    expect(vrednost).toEqual({ premesteno: 1, preskoceno: 1 });
    expect(nazivi(s1, M, "Prilozi").filter((n) => n === "Gibanica")).toHaveLength(1);
    // Predjela comes first on the page, so that row moved; the Dezerti row stays.
    expect(nazivi(s1, M, "Predjela")).not.toContain("Gibanica");
    expect(nazivi(s1, M, "Dezerti")).toContain("Gibanica");
  });

  test("when nothing moves the state is the same and the revision does not step", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    bezPromene(premestiUSekciju(s0, [red(s0, M, "Prilozi", "Pomfrit")], prilozi.key), s0, { premesteno: 0, preskoceno: 1 });
  });

  test("rows of another page are invalid_input, even when the others are fine", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    odbijeno(
      premestiUSekciju(s0, [red(s0, M, "Dezerti", "Baklava"), red(s0, V, "Bela vina", "Tamjanika")], prilozi.key),
      s0,
      MENU_ERROR.invalidInput,
    );
  });

  test("an unknown row or target is not_found, no ids are invalid_input, an archived page is page_archived", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    odbijeno(premestiUSekciju(s0, [red(s0, M, "Dezerti", "Baklava"), "sc_nema/ar_nema"], prilozi.key), s0, MENU_ERROR.notFound);
    odbijeno(premestiUSekciju(s0, [red(s0, M, "Dezerti", "Baklava")], "sc_nema"), s0, MENU_ERROR.notFound);
    odbijeno(premestiUSekciju(s0, [], prilozi.key), s0, MENU_ERROR.invalidInput);
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, V).key, SADA)).stanje;
    odbijeno(
      premestiUSekciju(arhivirano, [red(arhivirano, V, "Bela vina", "Tamjanika")], sekcija(arhivirano, V, "Crvena vina").key),
      arhivirano,
      MENU_ERROR.pageArchived,
    );
  });
});

// --- dodajNaStranicu --------------------------------------------------------------

describe("dodajNaStranicu", () => {
  test("shows articles of another page in a section: same article, same price, appended in the given order", () => {
    const s0 = stanje();
    const bela = sekcija(s0, V, "Bela vina");
    const { stanje: s1, vrednost } = uspeh(
      dodajNaStranicu(s0, [artikal(s0, "Baklava").key, artikal(s0, "Gibanica").key], bela.key),
    );
    expect(vrednost).toEqual({ dodato: 2, preskoceno: 0 });
    expect(nazivi(s1, V, "Bela vina")).toEqual(["Tamjanika", "Sauvignon Blanc", "Rizling", "Chardonnay", "Baklava", "Gibanica"]);
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    expect(cenaNaStranici(s1, V, "Gibanica")).toBe(560);
    expect(cenaNaStranici(s1, V, "Baklava")).toBe(360);
    // One transaction: one revision step for two added rows.
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(strogoRastuce(sekcijaSadrzaja(s1, V, "Bela vina").redovi.map((r) => r.redosled))).toBe(true);
    const dodat = sekcijaSadrzaja(s1, V, "Bela vina").redovi[4];
    expect(dodat.prikazId).toBe(`${bela.key}/${artikal(s0, "Baklava").key}`);
    expect(dodat.sakriven).toBe(false);
    // The main page is untouched.
    expect(sadrzaj(s1, M)).toEqual(sadrzaj(s0, M));
  });

  test("an article the section already shows is skipped", () => {
    const s0 = stanje();
    const bela = sekcija(s0, V, "Bela vina");
    const { stanje: s1, vrednost } = uspeh(
      dodajNaStranicu(s0, [artikal(s0, "Gibanica").key, artikal(s0, "Tamjanika").key, artikal(s0, "Baklava").key], bela.key),
    );
    expect(vrednost).toEqual({ dodato: 2, preskoceno: 1 });
    expect(nazivi(s1, V, "Bela vina").filter((n) => n === "Tamjanika")).toHaveLength(1);
    expect(s1.revizija).toBe(s0.revizija + 1);
  });

  test("a repeated id is added once", () => {
    const s0 = stanje();
    const bela = sekcija(s0, V, "Bela vina");
    const gibanica = artikal(s0, "Gibanica").key;
    const { stanje: s1, vrednost } = uspeh(dodajNaStranicu(s0, [gibanica, gibanica], bela.key));
    expect(vrednost).toEqual({ dodato: 1, preskoceno: 0 });
    expect(nazivi(s1, V, "Bela vina").filter((n) => n === "Gibanica")).toHaveLength(1);
  });

  test("when everything is a duplicate nothing is written: same state, no revision step", () => {
    const s0 = stanje();
    const bela = sekcija(s0, V, "Bela vina");
    bezPromene(
      dodajNaStranicu(s0, [artikal(s0, "Tamjanika").key, artikal(s0, "Rizling").key], bela.key),
      s0,
      { dodato: 0, preskoceno: 2 },
    );
  });

  test("an unknown section or article is not_found and adds nothing", () => {
    const s0 = stanje();
    const bela = sekcija(s0, V, "Bela vina");
    odbijeno(dodajNaStranicu(s0, [artikal(s0, "Gibanica").key], "sc_nema"), s0, MENU_ERROR.notFound);
    odbijeno(dodajNaStranicu(s0, [artikal(s0, "Gibanica").key, "ar_nema"], bela.key), s0, MENU_ERROR.notFound);
    expect(nazivi(s0, V, "Bela vina")).not.toContain("Gibanica");
  });

  test("no ids are invalid_input; a section of an archived page is page_archived", () => {
    const s0 = stanje();
    const bela = sekcija(s0, V, "Bela vina");
    odbijeno(dodajNaStranicu(s0, [], bela.key), s0, MENU_ERROR.invalidInput);
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, V).key, SADA)).stanje;
    odbijeno(
      dodajNaStranicu(arhivirano, [artikal(arhivirano, "Gibanica").key], sekcija(arhivirano, V, "Bela vina").key),
      arhivirano,
      MENU_ERROR.pageArchived,
    );
  });
});

// --- sekcijeStranice --------------------------------------------------------------

describe("sekcijeStranice", () => {
  test("the sections of a page, in order, with id and name", () => {
    const s0 = stanje();
    const korak = sekcijeStranice(s0, stranica(s0, V).key);
    expect(korak.stanje).toBe(s0);
    expect(uspeh(korak).vrednost).toEqual([
      { id: sekcija(s0, V, "Bela vina").key, naziv: "Bela vina" },
      { id: sekcija(s0, V, "Crvena vina").key, naziv: "Crvena vina" },
    ]);
    expect(uspeh(sekcijeStranice(s0, stranica(s0, M).key)).vrednost.map((x) => x.naziv)).toEqual(SEKCIJE);
  });

  test("follows a reorder and a new section", () => {
    const s0 = stanje();
    const vina = stranica(s0, V).key;
    const s1 = uspeh(premestiSekciju(s0, sekcija(s0, V, "Crvena vina").key, 0)).stanje;
    const s2 = uspeh(dodajSekciju(s1, vina, "Rakije")).stanje;
    expect(uspeh(sekcijeStranice(s2, vina)).vrednost.map((x) => x.naziv)).toEqual(["Crvena vina", "Bela vina", "Rakije"]);
  });

  test("an archived page still lists its sections", () => {
    const s0 = stanje();
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, V).key, SADA)).stanje;
    expect(uspeh(sekcijeStranice(arhivirano, stranica(arhivirano, V).key)).vrednost.map((x) => x.naziv)).toEqual([
      "Bela vina",
      "Crvena vina",
    ]);
  });

  test("an unknown page is not_found", () => {
    const s0 = stanje();
    odbijeno(sekcijeStranice(s0, "pg_nema"), s0, MENU_ERROR.notFound);
  });
});

// --- postaviCene ------------------------------------------------------------------

describe("postaviCene", () => {
  test("every price fresh: all change in ONE revision step, on every page where the article stands", () => {
    const s0 = stanje();
    const { stanje: s1, vrednost } = uspeh(
      postaviCene(s0, [promena(s0, "Tamjanika", 2500), promena(s0, "Gibanica", 600), promena(s0, "Ćevapi", 700)]),
    );
    expect(vrednost).toEqual({ status: "promenjeno", broj: 3 });
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(artikal(s1, "Tamjanika").basePriceRsd).toBe(2500);
    expect(artikal(s1, "Gibanica").basePriceRsd).toBe(600);
    expect(artikal(s1, "Ćevapi").basePriceRsd).toBe(700);
    expect(cenaNaStranici(s1, M, "Tamjanika")).toBe(2500);
    expect(cenaNaStranici(s1, V, "Tamjanika")).toBe(2500);
    // Others are not touched; the previous state is not mutated.
    expect(artikal(s1, "Rizling").basePriceRsd).toBe(1800);
    expect(artikal(s0, "Tamjanika").basePriceRsd).toBe(2200);
    expect(s0.revizija).toBe(1);
  });

  test("one stale expected price: a conflict, NO price changes, the revision does not move", () => {
    const s0 = stanje();
    const korak = postaviCene(s0, [promena(s0, "Gibanica", 600), promena(s0, "Tamjanika", 2500, 1999)]);
    const { stanje: s1, vrednost } = uspeh(korak);
    expect(vrednost).toEqual({
      status: "konflikt",
      artikli: [{ artikalId: artikal(s0, "Tamjanika").key, sacuvano: 2200 }],
    });
    expect(s1).toBe(s0);
    expect(artikal(s1, "Gibanica").basePriceRsd).toBe(560);
    expect(artikal(s1, "Tamjanika").basePriceRsd).toBe(2200);
    expect(s1.revizija).toBe(s0.revizija);
  });

  test("every stale price is listed, in the order given, with the stored value", () => {
    const s0 = stanje();
    const { vrednost, stanje: s1 } = uspeh(
      postaviCene(s0, [
        promena(s0, "Gibanica", 600, 1),
        promena(s0, "Rizling", 1900),
        promena(s0, "Ćevapi", 700, 500),
        promena(s0, "Tamjanika", 2500, null),
      ]),
    );
    expect(vrednost).toEqual({
      status: "konflikt",
      artikli: [
        { artikalId: artikal(s0, "Gibanica").key, sacuvano: 560 },
        { artikalId: artikal(s0, "Ćevapi").key, sacuvano: null },
        { artikalId: artikal(s0, "Tamjanika").key, sacuvano: 2200 },
      ],
    });
    expect(s1).toBe(s0);
  });

  test("an article without a price takes one when the expected price is null", () => {
    const s0 = stanje();
    expect(artikal(s0, "Ćevapi").basePriceRsd).toBeNull();
    const s1 = uspeh(postaviCene(s0, [promena(s0, "Ćevapi", 650, null)])).stanje;
    expect(cenaNaStranici(s1, M, "Ćevapi")).toBe(650);
  });

  test("the same price is not a change: broj 0, same state; mixed with a real change counts only that one", () => {
    const s0 = stanje();
    bezPromene(postaviCene(s0, [promena(s0, "Gibanica", 560), promena(s0, "Tamjanika", 2200)]), s0, {
      status: "promenjeno",
      broj: 0,
    });
    const { stanje: s1, vrednost } = uspeh(postaviCene(s0, [promena(s0, "Gibanica", 560), promena(s0, "Tamjanika", 2500)]));
    expect(vrednost).toEqual({ status: "promenjeno", broj: 1 });
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(artikal(s1, "Gibanica").basePriceRsd).toBe(560);
  });

  test("the same article twice is invalid_input, even with identical lines", () => {
    const s0 = stanje();
    odbijeno(postaviCene(s0, [promena(s0, "Gibanica", 600), promena(s0, "Gibanica", 700)]), s0, MENU_ERROR.invalidInput);
    odbijeno(postaviCene(s0, [promena(s0, "Gibanica", 600), promena(s0, "Gibanica", 600)]), s0, MENU_ERROR.invalidInput);
  });

  test("an invalid new price refuses the whole batch", () => {
    const s0 = stanje();
    for (const losa of [-1, 12.5, MENU_MAX_PRICE_RSD + 1, Number.NaN]) {
      odbijeno(postaviCene(s0, [promena(s0, "Tamjanika", 2500), promena(s0, "Gibanica", losa)]), s0, MENU_ERROR.invalidInput);
    }
    expect(artikal(s0, "Tamjanika").basePriceRsd).toBe(2200);
    // The ceiling and zero are valid prices.
    expect(postaviCene(s0, [promena(s0, "Gibanica", MENU_MAX_PRICE_RSD)]).ishod.ok).toBe(true);
    expect(uspeh(postaviCene(s0, [promena(s0, "Gibanica", 0)])).vrednost).toEqual({ status: "promenjeno", broj: 1 });
  });

  test("an unknown article is not_found; the size of the batch is checked first", () => {
    const s0 = stanje();
    odbijeno(
      postaviCene(s0, [promena(s0, "Gibanica", 600), { artikalId: "ar_nema", ocekivana: 1, nova: 2 }]),
      s0,
      MENU_ERROR.notFound,
    );
    odbijeno(postaviCene(s0, []), s0, MENU_ERROR.invalidInput);
    const mnogo = (n: number): StudioPromenaCene[] =>
      nepostojeciArtikli(n).map((artikalId) => ({ artikalId, ocekivana: 1, nova: 2 }));
    odbijeno(postaviCene(s0, mnogo(MENU_MAX_BULK_BATCH + 1)), s0, MENU_ERROR.invalidInput);
    odbijeno(postaviCene(s0, mnogo(MENU_MAX_BULK_BATCH)), s0, MENU_ERROR.notFound);
  });

  test("a new combo price answers 'Proveri cenu': the flag is cleared", () => {
    const s0 = saPriceCheck(stanje(), "Ručak dana", {
      since: SADA,
      changedComponentKeys: [artikal(stanje(), "Teleća čorba").key],
      removedComponentNames: [],
    });
    const redPre = sekcijaSadrzaja(s0, M, "Glavna jela").redovi.find((r) => r.artikal.naziv === "Ručak dana")!;
    expect(redPre.artikal.proveriCenu).toBe(true);

    const { stanje: s1, vrednost } = uspeh(postaviCene(s0, [promena(s0, "Ručak dana", 1200)]));
    expect(vrednost).toEqual({ status: "promenjeno", broj: 1 });
    expect(artikal(s1, "Ručak dana")).toMatchObject({ basePriceRsd: 1200, priceCheck: null });
    const redPosle = sekcijaSadrzaja(s1, M, "Glavna jela").redovi.find((r) => r.artikal.naziv === "Ručak dana")!;
    expect(redPosle.artikal.proveriCenu).toBe(false);
    // The previous state still carries the flag.
    expect(artikal(s0, "Ručak dana").priceCheck).not.toBeNull();
  });

  test("a combo flag survives a conflict and an unchanged price", () => {
    const s0 = saPriceCheck(stanje(), "Ručak dana", { since: SADA, changedComponentKeys: [], removedComponentNames: ["Stari"] });
    const konflikt = uspeh(postaviCene(s0, [promena(s0, "Ručak dana", 1200, 1)]));
    expect(konflikt.vrednost).toMatchObject({ status: "konflikt" });
    expect(artikal(konflikt.stanje, "Ručak dana").priceCheck).not.toBeNull();
    bezPromene(postaviCene(s0, [promena(s0, "Ručak dana", 1150)]), s0, { status: "promenjeno", broj: 0 });
    expect(artikal(s0, "Ručak dana").priceCheck).not.toBeNull();
  });

  // K11 parity with menuBulk.setPrices (flagCombosForPriceChange, master §5.4).
  test("a component's new price flags its combo, which keeps its manual price", () => {
    const s0 = stanje();
    const telecaKey = artikal(s0, "Teleća čorba").key;
    const cenaKomboa = artikal(s0, "Ručak dana").basePriceRsd;
    const { stanje: s1 } = uspeh(postaviCene(s0, [promena(s0, "Teleća čorba", 450)], SADA));
    expect(artikal(s1, "Ručak dana")).toMatchObject({
      basePriceRsd: cenaKomboa,
      priceCheck: { since: SADA, changedComponentKeys: [telecaKey], removedComponentNames: [] },
    });
  });

  test("a combo priced in the same batch as its component ends without the flag", () => {
    const s0 = stanje();
    const { stanje: s1 } = uspeh(postaviCene(s0, [promena(s0, "Teleća čorba", 450), promena(s0, "Ručak dana", 1300)], SADA));
    expect(artikal(s1, "Ručak dana")).toMatchObject({ basePriceRsd: 1300, priceCheck: null });
  });
});

// --- batch size of every group action ---------------------------------------------

describe("the size of a group action", () => {
  const s0 = stanje();
  const prilozi = sekcija(s0, M, "Prilozi").key;
  const pozivi: [string, (n: number) => MemorijaKorak<unknown>][] = [
    ["postaviDostupnost", (n) => postaviDostupnost(s0, nepostojeciArtikli(n), false)],
    ["postaviVidljivost", (n) => postaviVidljivost(s0, nepostojeciPrikazi(n), true)],
    ["ukloniSaStranice", (n) => ukloniSaStranice(s0, nepostojeciPrikazi(n))],
    ["premestiUSekciju", (n) => premestiUSekciju(s0, nepostojeciPrikazi(n), prilozi)],
    ["dodajNaStranicu", (n) => dodajNaStranicu(s0, nepostojeciArtikli(n), prilozi)],
    ["uticajBrisanja", (n) => uticajBrisanja(s0, nepostojeciArtikli(n))],
    ["obrisiArtikle", (n) => obrisiArtikle(s0, nepostojeciArtikli(n), "token", SADA)],
  ];

  test.each(pozivi)("%s: 0 and 201 distinct ids are invalid_input, 200 pass the size check", (_naziv, poziv) => {
    odbijeno(poziv(0), s0, MENU_ERROR.invalidInput);
    odbijeno(poziv(MENU_MAX_BULK_BATCH + 1), s0, MENU_ERROR.invalidInput);
    odbijeno(poziv(MENU_MAX_BULK_BATCH), s0, MENU_ERROR.notFound);
  });
});

// --- uticajBrisanja ---------------------------------------------------------------

describe("uticajBrisanja", () => {
  test("lists the pages that show the article with the number of placements on each", () => {
    const s0 = stanje();
    const crvena = sekcija(s0, V, "Crvena vina");
    // Tamjanika on the main page once and on the wine list twice.
    const s1 = uspeh(dodajPostojeci(s0, crvena.key, artikal(s0, "Tamjanika").key)).stanje;
    const korak = uticajBrisanja(s1, [artikal(s1, "Tamjanika").key]);
    expect(korak.stanje).toBe(s1);
    const { vrednost } = uspeh(korak);
    expect(vrednost.prevelik).toBe(false);
    expect(vrednost.artikli).toEqual([
      {
        artikalId: artikal(s1, "Tamjanika").key,
        naziv: "Tamjanika",
        vrsta: "item",
        stranice: [
          { naziv: M, arhivirana: false, prikaza: 1 },
          { naziv: V, arhivirana: false, prikaza: 2 },
        ],
        kombo: [],
        varijante: 0,
        roomService: false,
      },
    ]);
    expect(typeof vrednost.token).toBe("string");
    expect(vrednost.token).not.toBe("");
  });

  test("marks an archived page as archived", () => {
    const s0 = stanje();
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, V).key, SADA)).stanje;
    const { vrednost } = uspeh(uticajBrisanja(arhivirano, [artikal(arhivirano, "Tamjanika").key]));
    expect(vrednost.artikli[0].stranice).toEqual([
      { naziv: M, arhivirana: false, prikaza: 1 },
      { naziv: V, arhivirana: true, prikaza: 1 },
    ]);
  });

  test("lists the combos that contain the article; a combo itself lists none", () => {
    const s0 = stanje();
    const { vrednost } = uspeh(
      uticajBrisanja(s0, [artikal(s0, "Teleća čorba").key, artikal(s0, "Ručak dana").key, artikal(s0, "Gibanica").key]),
    );
    expect(vrednost.artikli.map((a) => [a.naziv, a.vrsta, a.kombo])).toEqual([
      ["Teleća čorba", "item", ["Ručak dana"]],
      ["Ručak dana", "combo", []],
      ["Gibanica", "item", []],
    ]);
  });

  test("counts variants and flags Room service", () => {
    const s0 = saRoomService(stanje(), "Ćevapi");
    const { vrednost } = uspeh(uticajBrisanja(s0, [artikal(s0, "Ćevapi").key, artikal(s0, "Tamjanika").key]));
    expect(vrednost.artikli[0]).toMatchObject({ naziv: "Ćevapi", varijante: 2, roomService: true });
    expect(vrednost.artikli[1]).toMatchObject({ naziv: "Tamjanika", varijante: 0, roomService: false });
  });

  test("a repeated id is one article; the token does not depend on the order of the ids", () => {
    const s0 = stanje();
    const a = artikal(s0, "Tamjanika").key;
    const b = artikal(s0, "Teleća čorba").key;
    expect(uspeh(uticajBrisanja(s0, [a, a])).vrednost.artikli).toHaveLength(1);
    const ab = uspeh(uticajBrisanja(s0, [a, b])).vrednost;
    const ba = uspeh(uticajBrisanja(s0, [b, a])).vrednost;
    expect(ab.token).toBe(ba.token);
    expect(ab.artikli.map((x) => x.naziv)).toEqual(["Tamjanika", "Teleća čorba"]);
    expect(ba.artikli.map((x) => x.naziv)).toEqual(["Teleća čorba", "Tamjanika"]);
    // A different batch has a different token.
    expect(uspeh(uticajBrisanja(s0, [a])).vrednost.token).not.toBe(ab.token);
  });

  test("the token changes when the impact changes", () => {
    const s0 = stanje();
    const tamjanika = artikal(s0, "Tamjanika").key;
    const token0 = uspeh(uticajBrisanja(s0, [tamjanika])).vrednost.token;
    // Another placement.
    const sPrikaz = uspeh(dodajPostojeci(s0, sekcija(s0, V, "Crvena vina").key, tamjanika)).stanje;
    expect(uspeh(uticajBrisanja(sPrikaz, [tamjanika])).vrednost.token).not.toBe(token0);
    // A combo that now contains the article.
    const sKombo = uspeh(
      noviKombo(s0, sekcija(s0, M, "Prilozi").key, { naziv: "Vino i prilog", cena: 2500, sastojci: [tamjanika] }),
    ).stanje;
    expect(uspeh(uticajBrisanja(sKombo, [tamjanika])).vrednost.token).not.toBe(token0);
    // Availability is part of what the owner saw.
    const sNedostupno = uspeh(postaviDostupnost(s0, [tamjanika], false)).stanje;
    expect(uspeh(uticajBrisanja(sNedostupno, [tamjanika])).vrednost.token).not.toBe(token0);
    // Nothing changed: the same token.
    expect(uspeh(uticajBrisanja(s0, [tamjanika])).vrednost.token).toBe(token0);
  });

  test("an unknown article is not_found", () => {
    const s0 = stanje();
    odbijeno(uticajBrisanja(s0, [artikal(s0, "Gibanica").key, "ar_nema"]), s0, MENU_ERROR.notFound);
  });
});

// --- obrisiArtikle ----------------------------------------------------------------

function obrisi(s: MemorijaStanje, imena: string[], sada = SADA) {
  const ids = imena.map((ime) => artikal(s, ime).key);
  const { vrednost: uticaj } = uspeh(uticajBrisanja(s, ids));
  return obrisiArtikle(s, ids, uticaj.token, sada);
}

describe("obrisiArtikle", () => {
  test("a wrong token deletes nothing and returns the current impact", () => {
    const s0 = stanje();
    const ids = [artikal(s0, "Tamjanika").key];
    const uticaj = uspeh(uticajBrisanja(s0, ids)).vrednost;
    for (const losToken of ["", "x", "bulk1#del1|ar_x"]) {
      const korak = obrisiArtikle(s0, ids, losToken, SADA);
      expect(korak.ishod).toEqual({ ok: true, vrednost: { status: "potvrdi", uticaj } });
      expect(korak.stanje).toBe(s0);
    }
    expect(s0.snapshot.articles.some((a) => a.key === ids[0])).toBe(true);
    expect(s0.revizija).toBe(1);
  });

  test("a token of an impact that changed meanwhile is not accepted: the new impact is shown", () => {
    const s0 = stanje();
    const tamjanika = artikal(s0, "Tamjanika").key;
    const stariToken = uspeh(uticajBrisanja(s0, [tamjanika])).vrednost.token;
    const s1 = uspeh(dodajPostojeci(s0, sekcija(s0, V, "Crvena vina").key, tamjanika)).stanje;
    const korak = obrisiArtikle(s1, [tamjanika], stariToken, SADA);
    const { vrednost } = uspeh(korak);
    expect(vrednost.status).toBe("potvrdi");
    if (vrednost.status !== "potvrdi") throw new Error("expected potvrdi");
    expect(vrednost.uticaj.token).not.toBe(stariToken);
    expect(vrednost.uticaj.artikli[0].stranice.map((p) => p.prikaza)).toEqual([1, 2]);
    expect(korak.stanje).toBe(s1);
    // The fresh token goes through.
    expect(uspeh(obrisiArtikle(s1, [tamjanika], vrednost.uticaj.token, SADA)).vrednost).toEqual({ status: "obrisano", broj: 1 });
  });

  test("the right token deletes articles with their placements, variants, add-on links and Room service rows, in one revision step", () => {
    const s0 = saRoomService(stanje(), "Ćevapi");
    const imena = ["Tamjanika", "Ćevapi", "Vešalica"];
    const kljucevi = new Set(imena.map((ime) => artikal(s0, ime).key));
    // Sanity: the fixture really has something to remove for each of them.
    expect(s0.snapshot.placements.filter((p) => artikal(s0, "Tamjanika").key === p.articleKey)).toHaveLength(2);
    expect(s0.snapshot.variants.filter((v) => v.articleKey === artikal(s0, "Ćevapi").key)).toHaveLength(2);
    expect(s0.snapshot.articleAddonGroups.filter((l) => l.articleKey === artikal(s0, "Vešalica").key)).toHaveLength(1);
    expect(s0.snapshot.roomService.items).toHaveLength(1);

    const { stanje: s1, vrednost } = uspeh(obrisi(s0, imena));
    expect(vrednost).toEqual({ status: "obrisano", broj: 3 });
    expect(s1.revizija).toBe(s0.revizija + 1);

    expect(s1.snapshot.articles).toEqual(s0.snapshot.articles.filter((a) => !kljucevi.has(a.key)));
    expect(s1.snapshot.placements).toEqual(s0.snapshot.placements.filter((p) => !kljucevi.has(p.articleKey)));
    expect(s1.snapshot.variants).toEqual(s0.snapshot.variants.filter((v) => !kljucevi.has(v.articleKey)));
    expect(s1.snapshot.articleAddonGroups).toEqual(s0.snapshot.articleAddonGroups.filter((l) => !kljucevi.has(l.articleKey)));
    expect(s1.snapshot.roomService.items).toEqual([]);
    expect(s1.snapshot.roomService.categories).toEqual(s0.snapshot.roomService.categories);
    // Pages and sections stay; other articles keep their variants.
    expect(s1.snapshot.pages).toBe(s0.snapshot.pages);
    expect(s1.snapshot.sections).toBe(s0.snapshot.sections);
    expect(s1.snapshot.variants.length).toBeGreaterThan(0);
    // Read back in the editor.
    expect(nazivi(s1, M, "Vina")).not.toContain("Tamjanika");
    expect(nazivi(s1, V, "Bela vina")).toEqual(["Sauvignon Blanc", "Rizling", "Chardonnay"]);
    expect(nazivi(s1, M, "Sa roštilja")).not.toContain("Ćevapi");
    // The previous state still has them.
    expect(s0.snapshot.articles.some((a) => a.name === "Tamjanika")).toBe(true);
  });

  test("a combo that contained a deleted article loses the component and gets 'Proveri cenu' with its name", () => {
    const s0 = stanje();
    const { stanje: s1, vrednost } = uspeh(obrisi(s0, ["Teleća čorba"]));
    expect(vrednost).toEqual({ status: "obrisano", broj: 1 });
    const kombo = artikal(s1, "Ručak dana");
    expect(kombo.priceCheck).toEqual({ since: SADA, changedComponentKeys: [], removedComponentNames: ["Teleća čorba"] });
    expect(kombo.basePriceRsd).toBe(1150);
    expect(s1.snapshot.comboComponents.filter((c) => c.comboKey === kombo.key).map((c) => c.componentKey)).toEqual([
      artikal(s1, "Punjene paprike").key,
      artikal(s1, "Kupus salata").key,
    ]);
    const redKombo = sekcijaSadrzaja(s1, M, "Glavna jela").redovi.find((r) => r.artikal.naziv === "Ručak dana")!;
    expect(redKombo.artikal.proveriCenu).toBe(true);
    // The combo article and its place stay.
    expect(nazivi(s1, M, "Glavna jela")).toContain("Ručak dana");
    expect(artikal(s0, "Ručak dana").priceCheck).toBeNull();
  });

  test("several deleted components are all named, in the order of the combo", () => {
    const s0 = stanje();
    const { stanje: s1 } = uspeh(obrisi(s0, ["Kupus salata", "Teleća čorba"]));
    expect(artikal(s1, "Ručak dana").priceCheck).toEqual({
      since: SADA,
      changedComponentKeys: [],
      removedComponentNames: ["Teleća čorba", "Kupus salata"],
    });
    expect(s1.snapshot.comboComponents.filter((c) => c.comboKey === artikal(s1, "Ručak dana").key)).toHaveLength(1);
  });

  test("an older flag keeps its 'since' and its entries, and the new name is appended", () => {
    const s0 = saPriceCheck(stanje(), "Ručak dana", {
      since: 5,
      changedComponentKeys: ["ar_stari"],
      removedComponentNames: ["Stari sastojak"],
    });
    const { stanje: s1 } = uspeh(obrisi(s0, ["Punjene paprike"]));
    expect(artikal(s1, "Ručak dana").priceCheck).toEqual({
      since: 5,
      changedComponentKeys: ["ar_stari"],
      removedComponentNames: ["Stari sastojak", "Punjene paprike"],
    });
  });

  test("a name already in the flag is not repeated (appendUnique, as on the server)", () => {
    const s0 = saPriceCheck(stanje(), "Ručak dana", { since: 5, changedComponentKeys: [], removedComponentNames: ["Punjene paprike"] });
    const { stanje: s1 } = uspeh(obrisi(s0, ["Punjene paprike"]));
    expect(artikal(s1, "Ručak dana").priceCheck?.removedComponentNames).toEqual(["Punjene paprike"]);
  });

  test("only the combos that contained the article are flagged", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, M, "Prilozi");
    const sKombo = uspeh(
      noviKombo(s0, prilozi.key, {
        naziv: "Prilog set",
        cena: 500,
        sastojci: [artikal(s0, "Pomfrit").key, artikal(s0, "Ajvar").key],
      }),
    ).stanje;
    const posleCorbe = uspeh(obrisi(sKombo, ["Teleća čorba"])).stanje;
    expect(artikal(posleCorbe, "Ručak dana").priceCheck).not.toBeNull();
    expect(artikal(posleCorbe, "Prilog set").priceCheck).toBeNull();
    const poslePomfrita = uspeh(obrisi(sKombo, ["Pomfrit"])).stanje;
    expect(artikal(poslePomfrita, "Prilog set").priceCheck).toMatchObject({ removedComponentNames: ["Pomfrit"] });
    expect(artikal(poslePomfrita, "Ručak dana").priceCheck).toBeNull();
  });

  test("a combo and its component can be deleted together: no flag, no leftover component rows", () => {
    const s0 = stanje();
    const kljucKombo = artikal(s0, "Ručak dana").key;
    const kljucCorba = artikal(s0, "Teleća čorba").key;
    const { stanje: s1, vrednost } = uspeh(obrisi(s0, ["Ručak dana", "Teleća čorba"]));
    expect(vrednost).toEqual({ status: "obrisano", broj: 2 });
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(s1.snapshot.articles.some((a) => a.key === kljucKombo || a.key === kljucCorba)).toBe(false);
    expect(s1.snapshot.comboComponents).toEqual([]);
    expect(s1.snapshot.placements.some((p) => p.articleKey === kljucKombo || p.articleKey === kljucCorba)).toBe(false);
    // The other components stay, unflagged.
    for (const ime of ["Punjene paprike", "Kupus salata"]) {
      expect(artikal(s1, ime).priceCheck).toBeNull();
      expect(s1.snapshot.placements.some((p) => p.articleKey === artikal(s1, ime).key)).toBe(true);
    }
    expect(s1.snapshot.articles.every((a) => a.priceCheck === null)).toBe(true);
    // The order in the request does not matter.
    const obrnuto = uspeh(obrisi(s0, ["Teleća čorba", "Ručak dana"])).stanje;
    expect(obrnuto.snapshot.articles).toEqual(s1.snapshot.articles);
    expect(obrnuto.snapshot.comboComponents).toEqual([]);
  });

  test("deleting a combo alone removes its component rows and keeps the components", () => {
    const s0 = stanje();
    const { stanje: s1 } = uspeh(obrisi(s0, ["Ručak dana"]));
    expect(s1.snapshot.comboComponents).toEqual([]);
    for (const ime of ["Teleća čorba", "Punjene paprike", "Kupus salata"]) {
      expect(s1.snapshot.articles.some((a) => a.name === ime)).toBe(true);
      expect(artikal(s1, ime).priceCheck).toBeNull();
    }
    expect(nazivi(s1, M, "Glavna jela")).not.toContain("Ručak dana");
  });

  test("an unavailable article is deleted too; its live availability row is left for the next publish, as on the server", () => {
    const gibanica = artikal(stanje(), "Gibanica").key;
    const s0 = stanje({ nedostupni: [gibanica] });
    const { stanje: s1 } = uspeh(obrisi(s0, ["Gibanica"]));
    expect(s1.snapshot.articles.some((a) => a.key === gibanica)).toBe(false);
    expect(s1.nedostupni.has(gibanica)).toBe(true);
  });

  test("the token covers the availability the owner saw", () => {
    const s0 = stanje();
    const gibanica = artikal(s0, "Gibanica").key;
    const token = uspeh(uticajBrisanja(s0, [gibanica])).vrednost.token;
    const s1 = uspeh(postaviDostupnost(s0, [gibanica], false)).stanje;
    const korak = obrisiArtikle(s1, [gibanica], token, SADA);
    expect(uspeh(korak).vrednost.status).toBe("potvrdi");
    expect(korak.stanje).toBe(s1);
  });

  test("an unknown article, no ids and a repeated id", () => {
    const s0 = stanje();
    const gibanica = artikal(s0, "Gibanica").key;
    odbijeno(obrisiArtikle(s0, [gibanica, "ar_nema"], "x", SADA), s0, MENU_ERROR.notFound);
    odbijeno(obrisiArtikle(s0, [], "x", SADA), s0, MENU_ERROR.invalidInput);
    const token = uspeh(uticajBrisanja(s0, [gibanica])).vrednost.token;
    expect(uspeh(obrisiArtikle(s0, [gibanica, gibanica], token, SADA)).vrednost).toEqual({ status: "obrisano", broj: 1 });
  });
});

// --- purity -----------------------------------------------------------------------

describe("purity: the input state is never mutated", () => {
  test("a frozen state rejects mutation (the control for the test below)", () => {
    const pre = zamrzni(stanje());
    expect(Object.isFrozen(pre)).toBe(true);
    expect(Object.isFrozen(pre.snapshot.placements)).toBe(true);
    expect(Object.isFrozen(pre.snapshot.placements[0])).toBe(true);
    expect(() => pre.snapshot.placements.push(pre.snapshot.placements[0])).toThrow(TypeError);
  });

  test("every K11 action leaves a deep-frozen input as it was", () => {
    const osnova = saRoomService(
      saPriceCheck(stanje({ nedostupni: [artikal(stanje(), "Tiramisu").key] }), "Ručak dana", {
        since: 7,
        changedComponentKeys: [],
        removedComponentNames: ["Stari"],
      }),
      "Ćevapi",
    );
    const pre = zamrzni(osnova);
    const snapshotPre = JSON.stringify(pre.snapshot);
    const nedostupniPre = [...pre.nedostupni];

    const r = (stranicaNaziv: string, sekcijaNaziv: string, naziv: string) => red(pre, stranicaNaziv, sekcijaNaziv, naziv);
    const dezerti = sekcija(pre, M, "Dezerti").key;
    const prilozi = sekcija(pre, M, "Prilozi").key;
    const bela = sekcija(pre, V, "Bela vina").key;
    const idsBrisanja = ["Tamjanika", "Ćevapi", "Vešalica", "Teleća čorba"].map((ime) => artikal(pre, ime).key);
    const tokenBrisanja = uspeh(uticajBrisanja(pre, idsBrisanja)).vrednost.token;

    // [label, call, the state is expected to change]
    const pozivi: [string, () => MemorijaKorak<unknown>, boolean][] = [
      ["premestiPrikaz (inside a section)", () => premestiPrikaz(pre, r(M, "Dezerti", "Voćna salata"), dezerti, r(M, "Dezerti", "Tiramisu")), true],
      ["premestiPrikaz (to another section)", () => premestiPrikaz(pre, r(M, "Dezerti", "Baklava"), prilozi, null), true],
      ["premestiPrikaz (same place)", () => premestiPrikaz(pre, r(M, "Dezerti", "Voćna salata"), dezerti, null), false],
      ["premestiPrikaz (refused)", () => premestiPrikaz(pre, r(M, "Dezerti", "Baklava"), bela, null), false],
      ["premestiSekciju", () => premestiSekciju(pre, sekcija(pre, M, "Vina").key, 0), true],
      ["postaviDostupnost (unavailable)", () => postaviDostupnost(pre, [artikal(pre, "Gibanica").key], false), true],
      ["postaviDostupnost (available)", () => postaviDostupnost(pre, [artikal(pre, "Tiramisu").key], true), true],
      ["postaviVidljivost (hide)", () => postaviVidljivost(pre, [r(M, "Dezerti", "Baklava")], true), true],
      ["postaviVidljivost (show)", () => postaviVidljivost(pre, [r(M, "Glavna jela", "Jagnjetina ispod sača")], false), true],
      ["ukloniSaStranice", () => ukloniSaStranice(pre, [r(M, "Vina", "Tamjanika"), r(M, "Dezerti", "Baklava")]), true],
      ["premestiUSekciju", () => premestiUSekciju(pre, [r(M, "Dezerti", "Baklava"), r(M, "Predjela", "Gibanica")], prilozi), true],
      ["dodajNaStranicu", () => dodajNaStranicu(pre, [artikal(pre, "Gibanica").key, artikal(pre, "Baklava").key], bela), true],
      ["sekcijeStranice", () => sekcijeStranice(pre, stranica(pre, V).key), false],
      [
        "postaviCene (with a flagged combo)",
        () => postaviCene(pre, [promena(pre, "Ručak dana", 1200), promena(pre, "Tamjanika", 2500), promena(pre, "Ćevapi", 700)]),
        true,
      ],
      ["postaviCene (conflict)", () => postaviCene(pre, [promena(pre, "Tamjanika", 2500, 1)]), false],
      ["uticajBrisanja", () => uticajBrisanja(pre, idsBrisanja), false],
      ["obrisiArtikle (wrong token)", () => obrisiArtikle(pre, idsBrisanja, "x", SADA), false],
      ["obrisiArtikle (right token)", () => obrisiArtikle(pre, idsBrisanja, tokenBrisanja, SADA), true],
    ];

    for (const [naziv, poziv, menjaSe] of pozivi) {
      // A write into the frozen input would throw a TypeError right here.
      const korak = poziv();
      expect(korak.stanje === pre, naziv).toBe(!menjaSe);
    }

    expect(JSON.stringify(pre.snapshot)).toBe(snapshotPre);
    expect([...pre.nedostupni]).toEqual(nedostupniPre);
    expect(pre.revizija).toBe(1);
    expect(pre.brojac).toBe(0);
  });
});
