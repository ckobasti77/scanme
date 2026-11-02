// ScanMe Menu V1 — K10: the editor's actions on an in-memory menu (the izlog's
// backend). The same rules the Convex mutations enforce: one shared base price,
// compare-and-set on the value last seen, a page with a QR card is not deleted
// or archived, re-use before duplicating, and the real publish checks.
//
// Everything runs on the invented "Demo restoran" (fixtureMenu("srednji")):
// a whole-menu page and a wine list on which the wines are the SAME articles.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { MENU_ERROR } from "../errors/core";
import { MENU_MAX_PRICE_RSD } from "../limits";
import type { MenuDraftSnapshot } from "../snapshot";
import { sadrzajIzSnapshota, straniceIzSnapshota } from "./iz-snapshota";
import {
  arhivirajStranicu,
  brziUnos,
  brziUnosVise,
  dodajPostojeci,
  dodajSekciju,
  dodajStranicu,
  duplirajStranicu,
  noviKombo,
  objavi,
  obrisiSekciju,
  obrisiStranicu,
  pocetnoStanje,
  postaviCenu,
  pregledObjave,
  premestiStranicu,
  preimenujSekciju,
  preimenujStranicu,
  stanjeNacrta,
  vratiStranicu,
  type MemorijaKorak,
  type MemorijaStanje,
} from "./memorija";
import type { TabelaUnosRed } from "./model";

const SADA = 1_760_000_000_000;

// --- helpers ------------------------------------------------------------------

function stanje(opcije: Parameters<typeof pocetnoStanje>[1] = {}, snapshot?: MenuDraftSnapshot): MemorijaStanje {
  return pocetnoStanje(snapshot ?? fixtureMenu("srednji").snapshot, opcije);
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

function cenaNaStranici(s: MemorijaStanje, stranicaNaziv: string, naziv: string): number | null | undefined {
  const sadrzaj = sadrzajIzSnapshota(s.snapshot, stranica(s, stranicaNaziv).key);
  const red = sadrzaj?.sekcije.flatMap((sec) => sec.redovi).find((r) => r.artikal.naziv === naziv);
  return red === undefined ? undefined : red.artikal.cena;
}

function brojDefault(s: MemorijaStanje): number {
  return s.snapshot.pages.filter((p) => p.isDefault).length;
}

// --- initial state and draft state ---------------------------------------------

describe("pocetnoStanje", () => {
  test("a never published draft starts at revision 1", () => {
    const s = stanje();
    expect(s.revizija).toBe(1);
    expect(s.objavljeno).toBeNull();
    expect(s.objavljenaVerzija).toBeNull();
    expect(s.objavljenoU).toBeNull();
    expect(s.objavljenaRevizija).toBeNull();
    expect(s.brojac).toBe(0);
    expect(s.roomService).toBe(false);
    expect(s.premium).toBe(false);
    expect(s.nedostupni.size).toBe(0);
    expect(s.qrStranice.size).toBe(0);
  });

  test("options fill availability, QR pages, plan and the published version", () => {
    const snapshot = fixtureMenu("srednji").snapshot;
    const vina = snapshot.pages.find((p) => p.name === "Vinska karta")!;
    const s = pocetnoStanje(snapshot, {
      nedostupni: ["ar_x"],
      qrStranice: [vina.key],
      objavljeno: { verzija: 3, u: 12345 },
      roomService: true,
      premium: true,
    });
    expect([...s.nedostupni]).toEqual(["ar_x"]);
    expect(s.qrStranice.has(vina.key)).toBe(true);
    expect(s.objavljeno).toBe(snapshot);
    expect(s.objavljenaVerzija).toBe(3);
    expect(s.objavljenoU).toBe(12345);
    expect(s.objavljenaRevizija).toBe(1);
    expect(s.roomService).toBe(true);
    expect(s.premium).toBe(true);
  });
});

describe("stanjeNacrta", () => {
  test("never_published -> clean -> dirty after a change", () => {
    const s0 = stanje();
    expect(stanjeNacrta(s0)).toBe("never_published");

    const s1 = uspeh(objavi(s0, s0.revizija, undefined, SADA)).stanje;
    expect(stanjeNacrta(s1)).toBe("clean");

    const gibanica = artikal(s1, "Gibanica");
    const s2 = uspeh(postaviCenu(s1, gibanica.key, 560, 600)).stanje;
    expect(stanjeNacrta(s2)).toBe("dirty");
  });

  test("a draft that was edited but never published stays never_published", () => {
    const s0 = stanje();
    const s1 = uspeh(postaviCenu(s0, artikal(s0, "Gibanica").key, 560, 600)).stanje;
    expect(stanjeNacrta(s1)).toBe("never_published");
  });

  test("a state started as published is clean until the first change", () => {
    const s0 = stanje({ objavljeno: { verzija: 1, u: SADA } });
    expect(stanjeNacrta(s0)).toBe("clean");
    const s1 = uspeh(postaviCenu(s0, artikal(s0, "Gibanica").key, 560, 600)).stanje;
    expect(stanjeNacrta(s1)).toBe("dirty");
  });
});

// --- the shared base price ------------------------------------------------------

describe("postaviCenu", () => {
  test("one article, one price: the new price shows on every page where it stands", () => {
    const s0 = stanje();
    const tamjanika = artikal(s0, "Tamjanika");
    expect(s0.snapshot.placements.filter((p) => p.articleKey === tamjanika.key)).toHaveLength(2);
    expect(cenaNaStranici(s0, "Kompletan meni", "Tamjanika")).toBe(2200);
    expect(cenaNaStranici(s0, "Vinska karta", "Tamjanika")).toBe(2200);

    const { stanje: s1 } = uspeh(postaviCenu(s0, tamjanika.key, 2200, 2500));
    expect(cenaNaStranici(s1, "Kompletan meni", "Tamjanika")).toBe(2500);
    expect(cenaNaStranici(s1, "Vinska karta", "Tamjanika")).toBe(2500);
    expect(s1.revizija).toBe(s0.revizija + 1);
    // Other articles are not touched.
    expect(cenaNaStranici(s1, "Vinska karta", "Rizling")).toBe(1800);
    // The previous state is not mutated.
    expect(cenaNaStranici(s0, "Vinska karta", "Tamjanika")).toBe(2200);
    expect(s0.revizija).toBe(1);
  });

  test("a stale expected price is a conflict with both values; nothing changes", () => {
    const s0 = stanje();
    const tamjanika = artikal(s0, "Tamjanika");
    const korak = postaviCenu(s0, tamjanika.key, 1999, 2500);
    expect(korak.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano: 2200, pokusano: 2500 });
    expect(korak.stanje).toBe(s0);
    expect(cenaNaStranici(korak.stanje, "Vinska karta", "Tamjanika")).toBe(2200);
    expect(korak.stanje.revizija).toBe(1);
  });

  test("the same price is a successful no-op that does not bump the revision", () => {
    const s0 = stanje();
    const korak = postaviCenu(s0, artikal(s0, "Tamjanika").key, 2200, 2200);
    expect(korak.ishod).toEqual({ ok: true, vrednost: null });
    expect(korak.stanje).toBe(s0);
  });

  test("a price can be cleared, and set on an article that has none", () => {
    const s0 = stanje();
    const s1 = uspeh(postaviCenu(s0, artikal(s0, "Gibanica").key, 560, null)).stanje;
    expect(cenaNaStranici(s1, "Kompletan meni", "Gibanica")).toBeNull();
    const cevapi = artikal(s0, "Ćevapi"); // priced only through variants
    expect(cevapi.basePriceRsd).toBeNull();
    const s2 = uspeh(postaviCenu(s0, cevapi.key, null, 600)).stanje;
    expect(cenaNaStranici(s2, "Kompletan meni", "Ćevapi")).toBe(600);
  });

  test("invalid prices and unknown articles are refused", () => {
    const s0 = stanje();
    const kljuc = artikal(s0, "Tamjanika").key;
    for (const losa of [-1, 12.5, MENU_MAX_PRICE_RSD + 1, Number.NaN]) {
      odbijeno(postaviCenu(s0, kljuc, 2200, losa), s0, MENU_ERROR.invalidInput);
    }
    odbijeno(postaviCenu(s0, "ar_nema", 1, 2), s0, MENU_ERROR.notFound);
    // The ceiling itself is a valid price.
    expect(postaviCenu(s0, kljuc, 2200, MENU_MAX_PRICE_RSD).ishod.ok).toBe(true);
  });
});

// --- pages ------------------------------------------------------------------------

describe("dodajStranicu", () => {
  test("a new page: cleaned name, slug from the name, last in order, not the default", () => {
    const s0 = stanje();
    const { stanje: s1, vrednost } = uspeh(dodajStranicu(s0, "  Dnevna   ponuda "));
    expect(vrednost.id).toBe("pg_mem0001");
    const nova = s1.snapshot.pages.find((p) => p.key === vrednost.id)!;
    expect(nova).toMatchObject({
      name: "Dnevna ponuda",
      slug: "dnevna-ponuda",
      isDefault: false,
      archivedAt: null,
      visibility: "visible",
    });
    expect(nova.order).toBeGreaterThan(Math.max(...s0.snapshot.pages.map((p) => p.order)));
    expect(s1.brojac).toBe(1);
    expect(s1.revizija).toBe(2);
    expect(brojDefault(s1)).toBe(1);
    expect(straniceIzSnapshota(s1.snapshot, new Set()).map((p) => p.naziv)).toEqual([
      "Kompletan meni",
      "Vinska karta",
      "Dnevna ponuda",
    ]);
  });

  test("the slug is unique: a taken slug gets -2, -3", () => {
    let s = stanje();
    const slugovi: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { stanje: sledece, vrednost } = uspeh(dodajStranicu(s, "Vinska karta"));
      s = sledece;
      slugovi.push(s.snapshot.pages.find((p) => p.key === vrednost.id)!.slug);
    }
    expect(slugovi).toEqual(["vinska-karta-2", "vinska-karta-3", "vinska-karta-4"]);
    expect(new Set(s.snapshot.pages.map((p) => p.slug)).size).toBe(s.snapshot.pages.length);
  });

  test("a reserved slug is never reused, even when no page holds it", () => {
    let s = stanje();
    const slugovi: string[] = [];
    for (const naziv of ["Editor", "Glavni", "Room service", "API", "Zahtevi"]) {
      const { stanje: sledece, vrednost } = uspeh(dodajStranicu(s, naziv));
      s = sledece;
      slugovi.push(s.snapshot.pages.find((p) => p.key === vrednost.id)!.slug);
    }
    expect(slugovi).toEqual(["editor-2", "glavni-2", "room-service-2", "api-2", "zahtevi-2"]);
  });

  test("a name without Latin letters falls back to 'stranica'", () => {
    const s0 = stanje();
    const s1 = uspeh(dodajStranicu(s0, "!!!"));
    expect(s1.stanje.snapshot.pages.find((p) => p.key === s1.vrednost.id)!.slug).toBe("stranica");
    const s2 = uspeh(dodajStranicu(s1.stanje, "???"));
    expect(s2.stanje.snapshot.pages.find((p) => p.key === s2.vrednost.id)!.slug).toBe("stranica-2");
  });

  test("an empty or too long name is refused", () => {
    const s0 = stanje();
    odbijeno(dodajStranicu(s0, "   "), s0, MENU_ERROR.invalidInput);
    odbijeno(dodajStranicu(s0, "a".repeat(81)), s0, MENU_ERROR.invalidInput);
    expect(dodajStranicu(s0, "a".repeat(80)).ishod.ok).toBe(true);
  });
});

describe("preimenujStranicu", () => {
  test("renames, keeps the slug, and checks the name last seen", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const s1 = uspeh(preimenujStranicu(s0, vina.key, "  Vina i rakije ", "Vinska karta")).stanje;
    const preimenovana = s1.snapshot.pages.find((p) => p.key === vina.key)!;
    expect(preimenovana.name).toBe("Vina i rakije");
    expect(preimenovana.slug).toBe("vinska-karta");
    expect(s1.revizija).toBe(2);

    const konflikt = preimenujStranicu(s1, vina.key, "Drugo ime", "Vinska karta");
    expect(konflikt.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano: "Vina i rakije", pokusano: "Drugo ime" });
    expect(konflikt.stanje).toBe(s1);
  });

  test("the same name is a no-op; unknown pages and empty names are refused", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const nista = preimenujStranicu(s0, vina.key, "Vinska karta", "Vinska karta");
    expect(nista.ishod.ok).toBe(true);
    expect(nista.stanje).toBe(s0);
    odbijeno(preimenujStranicu(s0, "pg_nema", "X", "Y"), s0, MENU_ERROR.notFound);
    odbijeno(preimenujStranicu(s0, vina.key, "  ", "Vinska karta"), s0, MENU_ERROR.invalidInput);
  });
});

describe("duplirajStranicu", () => {
  test("copies the sections and placements with the SAME article keys", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const { stanje: s1, vrednost } = uspeh(duplirajStranicu(s0, vina.key));

    const kopija = s1.snapshot.pages.find((p) => p.key === vrednost.id)!;
    expect(kopija).toMatchObject({ name: "Vinska karta (kopija)", slug: "vinska-karta-kopija", isDefault: false, archivedAt: null });
    expect(kopija.order).toBeGreaterThan(vina.order);

    // No new articles; the placements point at the very same ones.
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    const original = sadrzajIzSnapshota(s1.snapshot, vina.key)!;
    const kopirano = sadrzajIzSnapshota(s1.snapshot, kopija.key)!;
    expect(kopirano.sekcije.map((sec) => sec.naziv)).toEqual(original.sekcije.map((sec) => sec.naziv));
    expect(kopirano.sekcije.map((sec) => sec.redovi.map((r) => r.artikal.key))).toEqual(
      original.sekcije.map((sec) => sec.redovi.map((r) => r.artikal.key)),
    );
    expect(kopirano.sekcije.map((sec) => sec.redovi.map((r) => r.artikal.cena))).toEqual(
      original.sekcije.map((sec) => sec.redovi.map((r) => r.artikal.cena)),
    );

    // The sections are new rows with new keys; the original is untouched.
    const noviKljucevi = kopirano.sekcije.map((sec) => sec.key);
    const stariKljucevi = original.sekcije.map((sec) => sec.key);
    expect(noviKljucevi.every((k) => !stariKljucevi.includes(k))).toBe(true);
    expect(new Set(s1.snapshot.sections.map((sec) => sec.key)).size).toBe(s1.snapshot.sections.length);
    expect(s1.snapshot.sections.length).toBe(s0.snapshot.sections.length + 2);
    expect(s1.snapshot.placements.length).toBe(s0.snapshot.placements.length + 9);
    // Row ids belong to the new sections.
    for (const sec of kopirano.sekcije) {
      for (const red of sec.redovi) expect(red.prikazId).toBe(`${sec.key}/${red.artikal.key}`);
    }
    expect(s1.revizija).toBe(s0.revizija + 1);
  });

  test("a price change after copying shows on the original and on the copy", () => {
    const s0 = stanje();
    const { stanje: s1, vrednost } = uspeh(duplirajStranicu(s0, stranica(s0, "Vinska karta").key));
    const s2 = uspeh(postaviCenu(s1, artikal(s1, "Merlot").key, 2200, 2300)).stanje;
    const cene = [stranica(s2, "Vinska karta").key, vrednost.id].map((kljuc) =>
      sadrzajIzSnapshota(s2.snapshot, kljuc)!.sekcije.flatMap((sec) => sec.redovi).find((r) => r.artikal.naziv === "Merlot")!.artikal.cena,
    );
    expect(cene).toEqual([2300, 2300]);
  });

  test("a copy is never the default page, so there is still exactly one default", () => {
    const s0 = stanje();
    const s1 = uspeh(duplirajStranicu(s0, stranica(s0, "Kompletan meni").key)).stanje;
    expect(brojDefault(s1)).toBe(1);
    expect(stranica(s1, "Kompletan meni").isDefault).toBe(true);
    expect(stranica(s1, "Kompletan meni (kopija)").isDefault).toBe(false);
  });

  test("hidden placements stay hidden in the copy", () => {
    const s0 = stanje();
    const glavna = stranica(s0, "Kompletan meni");
    const s1 = uspeh(duplirajStranicu(s0, glavna.key)).stanje;
    const kopija = stranica(s1, "Kompletan meni (kopija)");
    const sakriveni = (kljuc: string) =>
      s1.snapshot.placements.filter((p) => p.pageKey === kljuc && p.visibility === "hidden").map((p) => p.articleKey);
    expect(sakriveni(glavna.key)).toHaveLength(1);
    expect(sakriveni(kopija.key)).toEqual(sakriveni(glavna.key));
  });

  test("copying twice gives unique slugs; copying an archived page gives an active copy", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const s1 = uspeh(duplirajStranicu(s0, vina.key)).stanje;
    const drugo = uspeh(duplirajStranicu(s1, vina.key));
    const slugovi = drugo.stanje.snapshot.pages.map((p) => p.slug);
    expect(new Set(slugovi).size).toBe(slugovi.length);
    expect(drugo.stanje.snapshot.pages.find((p) => p.key === drugo.vrednost.id)!.slug).toBe("vinska-karta-kopija-2");

    const arhivirano = uspeh(arhivirajStranicu(s0, vina.key, SADA)).stanje;
    const izArhive = uspeh(duplirajStranicu(arhivirano, vina.key));
    expect(izArhive.stanje.snapshot.pages.find((p) => p.key === izArhive.vrednost.id)!.archivedAt).toBeNull();
  });

  test("the copy's name stays within the name limit", () => {
    const s0 = uspeh(dodajStranicu(stanje(), "a".repeat(80))).stanje;
    const duga = s0.snapshot.pages.find((p) => p.name === "a".repeat(80))!;
    const kopija = uspeh(duplirajStranicu(s0, duga.key));
    const ime = kopija.stanje.snapshot.pages.find((p) => p.key === kopija.vrednost.id)!.name;
    expect(ime.length).toBeLessThanOrEqual(80);
  });

  test("an unknown page is refused", () => {
    const s0 = stanje();
    odbijeno(duplirajStranicu(s0, "pg_nema"), s0, MENU_ERROR.notFound);
  });
});

describe("premestiStranicu", () => {
  test("moves a page to an index and renumbers; out-of-range indexes are clamped", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const s1 = uspeh(premestiStranicu(s0, vina.key, 0)).stanje;
    expect(straniceIzSnapshota(s1.snapshot, new Set()).map((p) => p.naziv)).toEqual(["Vinska karta", "Kompletan meni"]);
    expect(s1.revizija).toBe(2);
    const s2 = uspeh(premestiStranicu(s1, vina.key, 99)).stanje;
    expect(straniceIzSnapshota(s2.snapshot, new Set()).map((p) => p.naziv)).toEqual(["Kompletan meni", "Vinska karta"]);
  });

  test("moving to the current place is a no-op; an unknown page is refused", () => {
    const s0 = stanje();
    const nista = premestiStranicu(s0, stranica(s0, "Vinska karta").key, 1);
    expect(nista.stanje).toBe(s0);
    odbijeno(premestiStranicu(s0, "pg_nema", 0), s0, MENU_ERROR.notFound);
  });
});

describe("a page with a QR card", () => {
  test("cannot be deleted or archived", () => {
    const snapshot = fixtureMenu("srednji").snapshot;
    const vina = snapshot.pages.find((p) => p.name === "Vinska karta")!;
    const s0 = stanje({ qrStranice: [vina.key] });
    odbijeno(obrisiStranicu(s0, vina.key), s0, MENU_ERROR.pageHasQr);
    odbijeno(arhivirajStranicu(s0, vina.key, SADA), s0, MENU_ERROR.pageHasQr);
    expect(MENU_ERROR.pageHasQr).toBe("menu/page_has_qr");
  });

  test("the QR check comes before the last-page check", () => {
    const snapshot = fixtureMenu("srednji").snapshot;
    const glavna = snapshot.pages.find((p) => p.isDefault)!;
    const sama = uspeh(obrisiStranicu(stanje(), stranica(stanje(), "Vinska karta").key)).stanje;
    const s0 = { ...sama, qrStranice: new Set([glavna.key]) };
    odbijeno(obrisiStranicu(s0, glavna.key), s0, MENU_ERROR.pageHasQr);
    odbijeno(arhivirajStranicu(s0, glavna.key, SADA), s0, MENU_ERROR.pageHasQr);
  });

  test("a page without a QR card can still be deleted next to it", () => {
    const snapshot = fixtureMenu("srednji").snapshot;
    const glavna = snapshot.pages.find((p) => p.isDefault)!;
    const s0 = stanje({ qrStranice: [glavna.key] });
    expect(obrisiStranicu(s0, stranica(s0, "Vinska karta").key).ishod.ok).toBe(true);
  });
});

describe("the last active page", () => {
  test("cannot be deleted or archived", () => {
    const s0 = stanje();
    const s1 = uspeh(obrisiStranicu(s0, stranica(s0, "Vinska karta").key)).stanje;
    const glavna = stranica(s1, "Kompletan meni");
    odbijeno(obrisiStranicu(s1, glavna.key), s1, MENU_ERROR.lastPage);
    odbijeno(arhivirajStranicu(s1, glavna.key, SADA), s1, MENU_ERROR.lastPage);
    expect(MENU_ERROR.lastPage).toBe("menu/last_page");
  });

  test("archived pages do not count as active", () => {
    const s0 = stanje();
    const s1 = uspeh(arhivirajStranicu(s0, stranica(s0, "Vinska karta").key, SADA)).stanje;
    const glavna = stranica(s1, "Kompletan meni");
    odbijeno(arhivirajStranicu(s1, glavna.key, SADA), s1, MENU_ERROR.lastPage);
    odbijeno(obrisiStranicu(s1, glavna.key), s1, MENU_ERROR.lastPage);
  });

  test("an archived page can be deleted even when it is not among the active ones", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const s1 = uspeh(arhivirajStranicu(s0, vina.key, SADA)).stanje;
    const s2 = uspeh(obrisiStranicu(s1, vina.key)).stanje;
    expect(s2.snapshot.pages.map((p) => p.name)).toEqual(["Kompletan meni"]);
  });
});

describe("arhivirajStranicu and vratiStranicu", () => {
  test("archiving stamps archivedAt and bumps the revision; the page can be restored", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const s1 = uspeh(arhivirajStranicu(s0, vina.key, SADA)).stanje;
    expect(stranica(s1, "Vinska karta").archivedAt).toBe(SADA);
    expect(s1.revizija).toBe(2);
    const s2 = uspeh(vratiStranicu(s1, vina.key)).stanje;
    expect(stranica(s2, "Vinska karta").archivedAt).toBeNull();
    expect(s2.revizija).toBe(3);
  });

  test("archiving an archived page, or restoring an active one, is a no-op", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    expect(vratiStranicu(s0, vina.key).stanje).toBe(s0);
    const s1 = uspeh(arhivirajStranicu(s0, vina.key, SADA)).stanje;
    const ponovo = arhivirajStranicu(s1, vina.key, SADA + 1);
    expect(ponovo.stanje).toBe(s1);
    expect(stranica(ponovo.stanje, "Vinska karta").archivedAt).toBe(SADA);
  });

  test("unknown pages are refused", () => {
    const s0 = stanje();
    odbijeno(arhivirajStranicu(s0, "pg_nema", SADA), s0, MENU_ERROR.notFound);
    odbijeno(vratiStranicu(s0, "pg_nema"), s0, MENU_ERROR.notFound);
  });

  test("archiving the default page hands isDefault to the next active page", () => {
    const s0 = stanje();
    const glavna = stranica(s0, "Kompletan meni");
    const s1 = uspeh(arhivirajStranicu(s0, glavna.key, SADA)).stanje;
    expect(stranica(s1, "Kompletan meni")).toMatchObject({ isDefault: false, archivedAt: SADA });
    expect(stranica(s1, "Vinska karta").isDefault).toBe(true);
    expect(brojDefault(s1)).toBe(1);
  });

  test("the default goes to the next ACTIVE page by order, skipping archived ones", () => {
    let s = stanje();
    s = uspeh(dodajStranicu(s, "Dnevna ponuda")).stanje; // order after the wine list
    s = uspeh(arhivirajStranicu(s, stranica(s, "Vinska karta").key, SADA)).stanje;
    s = uspeh(arhivirajStranicu(s, stranica(s, "Kompletan meni").key, SADA)).stanje;
    expect(stranica(s, "Dnevna ponuda").isDefault).toBe(true);
    expect(brojDefault(s)).toBe(1);
  });

  test("archiving a page that is not the default leaves the default alone", () => {
    const s0 = stanje();
    const s1 = uspeh(arhivirajStranicu(s0, stranica(s0, "Vinska karta").key, SADA)).stanje;
    expect(stranica(s1, "Kompletan meni").isDefault).toBe(true);
    expect(stranica(s1, "Vinska karta").isDefault).toBe(false);
  });
});

describe("obrisiStranicu", () => {
  test("removes the page with its sections and placements, but not the articles", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const s1 = uspeh(obrisiStranicu(s0, vina.key)).stanje;
    expect(s1.snapshot.pages.map((p) => p.name)).toEqual(["Kompletan meni"]);
    expect(s1.snapshot.sections.some((sec) => sec.pageKey === vina.key)).toBe(false);
    expect(s1.snapshot.placements.some((p) => p.pageKey === vina.key)).toBe(false);
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    // The wines still stand on the main page at the same price.
    expect(cenaNaStranici(s1, "Kompletan meni", "Tamjanika")).toBe(2200);
    expect(s1.revizija).toBe(2);
  });

  test("deleting the default page hands the default over", () => {
    const s0 = stanje();
    const s1 = uspeh(obrisiStranicu(s0, stranica(s0, "Kompletan meni").key)).stanje;
    expect(s1.snapshot.pages.map((p) => p.name)).toEqual(["Vinska karta"]);
    expect(s1.snapshot.pages[0].isDefault).toBe(true);
  });

  test("an unknown page is refused", () => {
    const s0 = stanje();
    odbijeno(obrisiStranicu(s0, "pg_nema"), s0, MENU_ERROR.notFound);
  });
});

// --- sections ----------------------------------------------------------------------

describe("sections", () => {
  test("dodajSekciju appends a section to an active page", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    const { stanje: s1, vrednost } = uspeh(dodajSekciju(s0, vina.key, "  Rakije "));
    expect(vrednost.id).toBe("sc_mem0001");
    const sadrzaj = sadrzajIzSnapshota(s1.snapshot, vina.key)!;
    expect(sadrzaj.sekcije.map((sec) => sec.naziv)).toEqual(["Bela vina", "Crvena vina", "Rakije"]);
    expect(sadrzaj.sekcije[2].redovi).toEqual([]);
    expect(s1.revizija).toBe(2);
  });

  test("dodajSekciju refuses unknown and archived pages and bad names", () => {
    const s0 = stanje();
    const vina = stranica(s0, "Vinska karta");
    odbijeno(dodajSekciju(s0, "pg_nema", "X"), s0, MENU_ERROR.notFound);
    odbijeno(dodajSekciju(s0, vina.key, "  "), s0, MENU_ERROR.invalidInput);
    odbijeno(dodajSekciju(s0, vina.key, "a".repeat(81)), s0, MENU_ERROR.invalidInput);
    const arhivirano = uspeh(arhivirajStranicu(s0, vina.key, SADA)).stanje;
    odbijeno(dodajSekciju(arhivirano, vina.key, "Rakije"), arhivirano, MENU_ERROR.pageArchived);
  });

  test("preimenujSekciju checks the name last seen", () => {
    const s0 = stanje();
    const bela = sekcija(s0, "Vinska karta", "Bela vina");
    const s1 = uspeh(preimenujSekciju(s0, bela.key, "Bela i roze", "Bela vina")).stanje;
    expect(s1.snapshot.sections.find((sec) => sec.key === bela.key)!.name).toBe("Bela i roze");
    const konflikt = preimenujSekciju(s1, bela.key, "Drugo", "Bela vina");
    expect(konflikt.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano: "Bela i roze", pokusano: "Drugo" });
    expect(konflikt.stanje).toBe(s1);
    expect(preimenujSekciju(s1, bela.key, "Bela i roze", "Bela i roze").stanje).toBe(s1);
    odbijeno(preimenujSekciju(s1, "sc_nema", "X", "Y"), s1, MENU_ERROR.notFound);
    odbijeno(preimenujSekciju(s1, bela.key, "", "Bela i roze"), s1, MENU_ERROR.invalidInput);
  });

  test("obrisiSekciju removes its placements and keeps the articles", () => {
    const s0 = stanje();
    const bela = sekcija(s0, "Vinska karta", "Bela vina");
    const s1 = uspeh(obrisiSekciju(s0, bela.key)).stanje;
    expect(s1.snapshot.sections.some((sec) => sec.key === bela.key)).toBe(false);
    expect(s1.snapshot.placements.some((p) => p.sectionKey === bela.key)).toBe(false);
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    expect(cenaNaStranici(s1, "Kompletan meni", "Tamjanika")).toBe(2200); // still on the main page
    odbijeno(obrisiSekciju(s1, bela.key), s1, MENU_ERROR.notFound);
  });
});

// --- articles ------------------------------------------------------------------------

describe("brziUnos", () => {
  test("an existing normalized name is 'slicno' with the candidates; nothing is added", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const tamjanika = artikal(s0, "Tamjanika");
    for (const naziv of ["TAMJANIKA ", "tamjanika", "  Tamjanika  "]) {
      const korak = brziUnos(s0, predjela.key, { naziv, cena: 100 }, false);
      expect(korak.ishod).toEqual({
        ok: true,
        vrednost: {
          status: "slicno",
          kandidati: [{ artikalId: tamjanika.key, naziv: "Tamjanika", cena: 2200 }],
        },
      });
      expect(korak.stanje).toBe(s0);
    }
  });

  test("diacritics, case and punctuation do not make a name different", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const korak = brziUnos(s0, predjela.key, { naziv: "cevapi", cena: null }, false);
    expect(korak.ishod).toMatchObject({ ok: true, vrednost: { status: "slicno", kandidati: [{ naziv: "Ćevapi", cena: null }] } });
    expect(brziUnos(s0, predjela.key, { naziv: "Pršut, sa sirom!", cena: null }, false).ishod).toMatchObject({
      ok: true,
      vrednost: { status: "slicno" },
    });
  });

  test("dozvoliDuplikat adds a new article anyway", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const { stanje: s1, vrednost } = uspeh(brziUnos(s0, predjela.key, { naziv: "TAMJANIKA ", cena: 100 }, true));
    expect(vrednost).toEqual({ status: "dodato", artikalId: "ar_mem0001", prikazId: `${predjela.key}/ar_mem0001` });
    expect(s1.snapshot.articles).toHaveLength(s0.snapshot.articles.length + 1);
    expect(s1.snapshot.articles.filter((a) => a.name === "TAMJANIKA")).toHaveLength(1);
    expect(s1.snapshot.articles.find((a) => a.name === "Tamjanika")!.basePriceRsd).toBe(2200);
  });

  test("a new article: cleaned name, price, placed last in its section, new revision", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const { stanje: s1, vrednost } = uspeh(brziUnos(s0, predjela.key, { naziv: "  Pita   sa višnjama ", cena: 450 }, false));
    if (vrednost.status !== "dodato") throw new Error("expected dodato");
    const novi = s1.snapshot.articles.find((a) => a.key === vrednost.artikalId)!;
    expect(novi).toMatchObject({ name: "Pita sa višnjama", basePriceRsd: 450, kind: "item", mediaMode: "none", variantsEnabled: false });
    expect(s1.revizija).toBe(2);
    expect(s1.brojac).toBe(1);
    const redovi = sadrzajIzSnapshota(s1.snapshot, predjela.pageKey)!.sekcije.find((sec) => sec.key === predjela.key)!.redovi;
    expect(redovi[redovi.length - 1]).toMatchObject({ prikazId: vrednost.prikazId, sakriven: false });
    expect(redovi[redovi.length - 1].artikal.cena).toBe(450);
    expect(cenaNaStranici(s1, "Kompletan meni", "Pita sa višnjama")).toBe(450);
  });

  test("a new article may have no price yet; keys never repeat", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const a = uspeh(brziUnos(s0, predjela.key, { naziv: "Prvo jelo", cena: null }, false));
    const b = uspeh(brziUnos(a.stanje, predjela.key, { naziv: "Drugo jelo", cena: 200 }, false));
    expect(a.stanje.snapshot.articles.find((x) => x.name === "Prvo jelo")!.basePriceRsd).toBeNull();
    expect(a.vrednost).toMatchObject({ artikalId: "ar_mem0001" });
    expect(b.vrednost).toMatchObject({ artikalId: "ar_mem0002" });
    expect(b.stanje.revizija).toBe(3);
  });

  test("bad input, unknown sections and archived pages are refused", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    odbijeno(brziUnos(s0, predjela.key, { naziv: "  ", cena: 100 }, false), s0, MENU_ERROR.invalidInput);
    odbijeno(brziUnos(s0, predjela.key, { naziv: "a".repeat(121), cena: 100 }, false), s0, MENU_ERROR.invalidInput);
    odbijeno(brziUnos(s0, predjela.key, { naziv: "Jelo", cena: 12.5 }, false), s0, MENU_ERROR.invalidInput);
    odbijeno(brziUnos(s0, predjela.key, { naziv: "Jelo", cena: -1 }, false), s0, MENU_ERROR.invalidInput);
    odbijeno(brziUnos(s0, "sc_nema", { naziv: "Jelo", cena: 1 }, false), s0, MENU_ERROR.notFound);
    const bela = sekcija(s0, "Vinska karta", "Bela vina");
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, "Vinska karta").key, SADA)).stanje;
    odbijeno(brziUnos(arhivirano, bela.key, { naziv: "Jelo", cena: 1 }, false), arhivirano, MENU_ERROR.pageArchived);
  });
});

describe("dodajPostojeci", () => {
  test("re-uses an existing article in another section", () => {
    const s0 = stanje();
    const bela = sekcija(s0, "Vinska karta", "Bela vina");
    const gibanica = artikal(s0, "Gibanica");
    const s1 = uspeh(dodajPostojeci(s0, bela.key, gibanica.key)).stanje;
    expect(s1.snapshot.articles).toBe(s0.snapshot.articles);
    const redovi = sadrzajIzSnapshota(s1.snapshot, bela.pageKey)!.sekcije[0].redovi;
    expect(redovi.map((r) => r.artikal.naziv)).toEqual(["Tamjanika", "Sauvignon Blanc", "Rizling", "Chardonnay", "Gibanica"]);
    expect(redovi[4].prikazId).toBe(`${bela.key}/${gibanica.key}`);
    expect(s1.revizija).toBe(2);
  });

  test("refuses a duplicate placement in the same section", () => {
    const s0 = stanje();
    const bela = sekcija(s0, "Vinska karta", "Bela vina");
    odbijeno(dodajPostojeci(s0, bela.key, artikal(s0, "Tamjanika").key), s0, "menu/placement_exists");
    expect(MENU_ERROR.placementExists).toBe("menu/placement_exists");
  });

  test("the same article may stand in two different sections", () => {
    const s0 = stanje();
    const crvena = sekcija(s0, "Vinska karta", "Crvena vina");
    expect(dodajPostojeci(s0, crvena.key, artikal(s0, "Tamjanika").key).ishod.ok).toBe(true);
  });

  test("unknown sections and articles, and archived pages, are refused", () => {
    const s0 = stanje();
    const bela = sekcija(s0, "Vinska karta", "Bela vina");
    odbijeno(dodajPostojeci(s0, "sc_nema", artikal(s0, "Gibanica").key), s0, MENU_ERROR.notFound);
    odbijeno(dodajPostojeci(s0, bela.key, "ar_nema"), s0, MENU_ERROR.notFound);
    const arhivirano = uspeh(arhivirajStranicu(s0, stranica(s0, "Vinska karta").key, SADA)).stanje;
    odbijeno(dodajPostojeci(arhivirano, bela.key, artikal(s0, "Gibanica").key), arhivirano, MENU_ERROR.pageArchived);
  });
});

describe("brziUnosVise", () => {
  function pripremi() {
    const s0 = stanje();
    const glavna = stranica(s0, "Kompletan meni");
    return {
      s0,
      glavna,
      predjela: sekcija(s0, "Kompletan meni", "Predjela"),
      deserti: sekcija(s0, "Kompletan meni", "Dezerti"),
      tamjanika: artikal(s0, "Tamjanika"),
    };
  }

  test("adds every row as a new article in one revision step", () => {
    const { s0, glavna, predjela, deserti } = pripremi();
    const redovi: TabelaUnosRed[] = [
      { sekcijaId: predjela.key, naziv: "Pita sa višnjama", cena: 450 },
      { sekcijaId: deserti.key, naziv: "Krempita", cena: 320 },
      { sekcijaId: deserti.key, naziv: "Rumenka", cena: null },
    ];
    const { stanje: s1, vrednost } = uspeh(brziUnosVise(s0, glavna.key, redovi));
    expect(vrednost).toEqual({ status: "dodato", novih: 3, postojecih: 0, preskoceno: 0 });
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(s1.snapshot.articles).toHaveLength(s0.snapshot.articles.length + 3);
    expect(cenaNaStranici(s1, "Kompletan meni", "Pita sa višnjama")).toBe(450);
    expect(cenaNaStranici(s1, "Kompletan meni", "Krempita")).toBe(320);
    expect(cenaNaStranici(s1, "Kompletan meni", "Rumenka")).toBeNull();
  });

  test("a similar name makes the whole batch 'slicno' and nothing is added (all or nothing)", () => {
    const { s0, glavna, predjela, deserti, tamjanika } = pripremi();
    const korak = brziUnosVise(s0, glavna.key, [
      { sekcijaId: predjela.key, naziv: "Pita sa višnjama", cena: 450 },
      { sekcijaId: deserti.key, naziv: "tamjanika", cena: 1 },
    ]);
    expect(korak.ishod).toEqual({
      ok: true,
      vrednost: {
        status: "slicno",
        redovi: [{ indeks: 1, kandidati: [{ artikalId: tamjanika.key, naziv: "Tamjanika", cena: 2200 }] }],
      },
    });
    expect(korak.stanje).toBe(s0);
    expect(korak.stanje.snapshot.articles).toHaveLength(s0.snapshot.articles.length);
  });

  test("every similar row is listed with its own table index", () => {
    const { s0, glavna, predjela } = pripremi();
    const korak = brziUnosVise(s0, glavna.key, [
      { sekcijaId: predjela.key, naziv: "Gibanica", cena: 1 },
      { sekcijaId: predjela.key, naziv: "Nesto novo", cena: 1 },
      { sekcijaId: predjela.key, naziv: "BAKLAVA", cena: 1 },
    ]);
    expect(korak.ishod.ok && korak.ishod.vrednost.status === "slicno" && korak.ishod.vrednost.redovi.map((r) => r.indeks)).toEqual([0, 2]);
  });

  test("with a decision for the similar row the batch goes through: novi, postojeci, preskoci", () => {
    const { s0, glavna, predjela, deserti, tamjanika } = pripremi();
    const redovi: TabelaUnosRed[] = [
      { sekcijaId: predjela.key, naziv: "Pita sa višnjama", cena: 450 },
      { sekcijaId: deserti.key, naziv: "tamjanika", cena: 1, odluka: "novi" },
      { sekcijaId: deserti.key, naziv: "tamjanika", cena: 1, odluka: "postojeci", postojeciId: tamjanika.key },
      { sekcijaId: deserti.key, naziv: "Gibanica", cena: 1, odluka: "preskoci" },
    ];
    const { stanje: s1, vrednost } = uspeh(brziUnosVise(s0, glavna.key, redovi));
    expect(vrednost).toEqual({ status: "dodato", novih: 2, postojecih: 1, preskoceno: 1 });
    // One transaction on the server: one revision step, however many rows.
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(s1.snapshot.articles).toHaveLength(s0.snapshot.articles.length + 2);
    // The existing article now stands in the dessert section too.
    expect(
      s1.snapshot.placements.some((p) => p.sectionKey === deserti.key && p.articleKey === tamjanika.key),
    ).toBe(true);
    // The skipped row left no trace.
    expect(s1.snapshot.articles.filter((a) => a.name === "Gibanica")).toHaveLength(1);
    // Rows land in the table order: the new duplicate first, then the existing article.
    const desertiRedovi = sadrzajIzSnapshota(s1.snapshot, glavna.key)!.sekcije.find((sec) => sec.key === deserti.key)!.redovi;
    expect(desertiRedovi.slice(-2).map((r) => r.artikal.naziv)).toEqual(["tamjanika", "Tamjanika"]);
  });

  test("a row decided as 'postojeci' that is already in the section is skipped, not an error", () => {
    const { s0, glavna, tamjanika } = pripremi();
    const vina = sekcija(s0, "Kompletan meni", "Vina");
    const korak = brziUnosVise(s0, glavna.key, [
      { sekcijaId: vina.key, naziv: "Tamjanika", cena: null, odluka: "postojeci", postojeciId: tamjanika.key },
    ]);
    expect(korak.ishod).toEqual({ ok: true, vrednost: { status: "dodato", novih: 0, postojecih: 0, preskoceno: 1 } });
    // Nothing was written, so the revision does not move.
    expect(korak.stanje.revizija).toBe(s0.revizija);
  });

  test("a batch of only skipped rows does not touch the revision", () => {
    const { s0, glavna, predjela } = pripremi();
    const korak = brziUnosVise(s0, glavna.key, [
      { sekcijaId: predjela.key, naziv: "", cena: null, odluka: "preskoci" },
      { sekcijaId: predjela.key, naziv: "Gibanica", cena: 1, odluka: "preskoci" },
    ]);
    expect(korak.ishod).toEqual({ ok: true, vrednost: { status: "dodato", novih: 0, postojecih: 0, preskoceno: 2 } });
    expect(korak.stanje.revizija).toBe(s0.revizija);
  });

  test("invalid batches are refused as a whole", () => {
    const { s0, glavna, predjela, tamjanika } = pripremi();
    const vinskaSekcija = sekcija(s0, "Vinska karta", "Bela vina");
    const dobar: TabelaUnosRed = { sekcijaId: predjela.key, naziv: "Pita sa višnjama", cena: 450 };
    // Empty batch.
    odbijeno(brziUnosVise(s0, glavna.key, []), s0, MENU_ERROR.invalidInput);
    // A section of another page.
    odbijeno(brziUnosVise(s0, glavna.key, [dobar, { sekcijaId: vinskaSekcija.key, naziv: "Jelo", cena: 1 }]), s0, MENU_ERROR.invalidInput);
    // Unknown section.
    odbijeno(brziUnosVise(s0, glavna.key, [{ sekcijaId: "sc_nema", naziv: "Jelo", cena: 1 }]), s0, MENU_ERROR.invalidInput);
    // 'postojeci' without the existing article.
    odbijeno(
      brziUnosVise(s0, glavna.key, [dobar, { sekcijaId: predjela.key, naziv: "x", cena: null, odluka: "postojeci" }]),
      s0,
      MENU_ERROR.invalidInput,
    );
    // A bad row after good ones: nothing is applied.
    odbijeno(brziUnosVise(s0, glavna.key, [dobar, { sekcijaId: predjela.key, naziv: "  ", cena: 1 }]), s0, MENU_ERROR.invalidInput);
    odbijeno(brziUnosVise(s0, glavna.key, [dobar, { sekcijaId: predjela.key, naziv: "Jelo", cena: 1.5 }]), s0, MENU_ERROR.invalidInput);
    odbijeno(brziUnosVise(s0, glavna.key, [dobar, { sekcijaId: predjela.key, naziv: "Jelo", cena: MENU_MAX_PRICE_RSD + 1 }]), s0, MENU_ERROR.invalidInput);
    // A valid 'postojeci' decision does not need a valid name.
    expect(
      brziUnosVise(s0, glavna.key, [{ sekcijaId: sekcija(s0, "Kompletan meni", "Dezerti").key, naziv: "", cena: null, odluka: "postojeci", postojeciId: tamjanika.key }]).ishod.ok,
    ).toBe(true);
  });
});

describe("noviKombo", () => {
  test("creates a combo of plain articles and places it", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const prebranac = artikal(s0, "Prebranac");
    const gibanica = artikal(s0, "Gibanica");
    const { stanje: s1, vrednost } = uspeh(
      noviKombo(s0, predjela.key, { naziv: " Kombo  dana ", cena: 900, sastojci: [prebranac.key, gibanica.key] }),
    );
    expect(vrednost.id).toBe("ar_mem0001");
    const kombo = s1.snapshot.articles.find((a) => a.key === vrednost.id)!;
    expect(kombo).toMatchObject({ kind: "combo", name: "Kombo dana", basePriceRsd: 900 });
    expect(s1.snapshot.comboComponents.filter((c) => c.comboKey === kombo.key)).toEqual([
      { comboKey: kombo.key, componentKey: prebranac.key, quantity: 1, order: 0 },
      { comboKey: kombo.key, componentKey: gibanica.key, quantity: 1, order: 1 },
    ]);
    expect(cenaNaStranici(s1, "Kompletan meni", "Kombo dana")).toBe(900);
    expect(s1.revizija).toBe(2);
  });

  test("refuses empty, repeated, unknown and non-plain components", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const prebranac = artikal(s0, "Prebranac");
    const kombo = "article/combo_component_invalid";
    const unos = (sastojci: string[]) => ({ naziv: "Kombo dana", cena: 900, sastojci });
    odbijeno(noviKombo(s0, predjela.key, unos([])), s0, kombo);
    odbijeno(noviKombo(s0, predjela.key, unos([prebranac.key, prebranac.key])), s0, kombo);
    odbijeno(noviKombo(s0, predjela.key, unos(["ar_nema"])), s0, kombo);
    odbijeno(noviKombo(s0, predjela.key, unos([artikal(s0, "Ručak dana").key])), s0, kombo); // a combo is not a component
  });

  test("bad name, bad price, unknown section", () => {
    const s0 = stanje();
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const sastojci = [artikal(s0, "Prebranac").key];
    odbijeno(noviKombo(s0, predjela.key, { naziv: " ", cena: 900, sastojci }), s0, MENU_ERROR.invalidInput);
    odbijeno(noviKombo(s0, predjela.key, { naziv: "Kombo", cena: -5, sastojci }), s0, MENU_ERROR.invalidInput);
    odbijeno(noviKombo(s0, "sc_nema", { naziv: "Kombo", cena: 900, sastojci }), s0, MENU_ERROR.notFound);
  });
});

// --- publishing ---------------------------------------------------------------------

describe("pregledObjave", () => {
  test("a never published draft: never_published, will change, the summary counts new articles", () => {
    const s0 = stanje();
    const pregled = pregledObjave(s0, true);
    expect(pregled.stanje).toBe("never_published");
    expect(pregled.menjaSe).toBe(true);
    expect(pregled.revizija).toBe(1);
    expect(pregled.mozeObjavu).toBe(true);
    expect(pregled.prevelik).toBe(false);
    expect(pregled.greske).toEqual([]);
    expect(pregled.upozorenja).toEqual([]);
    expect(pregled.sazetak).not.toBeNull();
    expect(pregled.sazetak!.novi).toBeGreaterThan(0);
    expect(pregled.sazetak).toMatchObject({ cene: 0, uklonjeni: 0 });
    expect(typeof pregled.otisak).toBe("string");
  });

  test("mozeObjavu is passed through", () => {
    expect(pregledObjave(stanje(), false).mozeObjavu).toBe(false);
  });

  test("a published draft without changes: clean, nothing to publish, an empty summary", () => {
    const s0 = stanje({ objavljeno: { verzija: 1, u: SADA } });
    const pregled = pregledObjave(s0, true);
    expect(pregled.stanje).toBe("clean");
    expect(pregled.menjaSe).toBe(false);
    expect(pregled.sazetak).toMatchObject({ cene: 0, novi: 0, uklonjeni: 0, sakriveno: 0, uklonjenoSaStranice: 0, obrisano: 0, redosled: 0 });
  });

  test("a changed price is dirty and counted once, however many pages show it", () => {
    const s0 = stanje({ objavljeno: { verzija: 1, u: SADA } });
    const s1 = uspeh(postaviCenu(s0, artikal(s0, "Tamjanika").key, 2200, 2500)).stanje;
    const pregled = pregledObjave(s1, true);
    expect(pregled.stanje).toBe("dirty");
    expect(pregled.menjaSe).toBe(true);
    expect(pregled.revizija).toBe(2);
    expect(pregled.sazetak).toMatchObject({ cene: 1, novi: 0, uklonjeni: 0 });
  });

  test("a new article is counted as new", () => {
    const s0 = stanje({ objavljeno: { verzija: 1, u: SADA } });
    const predjela = sekcija(s0, "Kompletan meni", "Predjela");
    const s1 = uspeh(brziUnos(s0, predjela.key, { naziv: "Pita sa višnjama", cena: 450 }, false)).stanje;
    expect(pregledObjave(s1, true).sazetak).toMatchObject({ novi: 1, cene: 0 });
  });

  test("an article that guests see and that has no price is a price_missing error", () => {
    const s0 = stanje();
    const kajmak = artikal(s0, "Kajmak sa pogačom");
    const s1 = uspeh(postaviCenu(s0, kajmak.key, 480, null)).stanje;
    const pregled = pregledObjave(s1, true);
    expect(pregled.greske).toEqual([{ kod: "price_missing", artikalKey: kajmak.key }]);
  });

  test("an article that only exists hidden is not checked for a price", () => {
    const s0 = stanje();
    const skriven = artikal(s0, "Jagnjetina ispod sača");
    const s1 = uspeh(postaviCenu(s0, skriven.key, 2890, null)).stanje;
    expect(pregledObjave(s1, true).greske).toEqual([]);
  });

  test("an article that was left on no page is only a warning", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, "Kompletan meni", "Prilozi");
    const s1 = uspeh(obrisiSekciju(s0, prilozi.key)).stanje;
    const pregled = pregledObjave(s1, true);
    expect(pregled.greske).toEqual([]);
    expect(pregled.upozorenja.length).toBeGreaterThan(0);
    expect(pregled.upozorenja.every((u) => u.kod === "article_unplaced" && u.artikalKey !== null)).toBe(true);
  });
});

describe("objavi", () => {
  test("publishes version 1, then reports no_changes on a second publish", () => {
    const s0 = stanje();
    const prvo = uspeh(objavi(s0, s0.revizija, undefined, SADA));
    expect(prvo.vrednost).toEqual({ status: "objavljeno", verzija: 1 });
    const s1 = prvo.stanje;
    expect(s1.objavljeno).toBe(s0.snapshot);
    expect(s1.objavljenaVerzija).toBe(1);
    expect(s1.objavljenoU).toBe(SADA);
    expect(s1.objavljenaRevizija).toBe(s0.revizija);
    expect(stanjeNacrta(s1)).toBe("clean");
    // The draft itself was not changed by publishing.
    expect(s1.revizija).toBe(s0.revizija);
    expect(s1.snapshot).toBe(s0.snapshot);

    const drugo = objavi(s1, s1.revizija, undefined, SADA + 1000);
    expect(drugo.ishod).toEqual({ ok: true, vrednost: { status: "odbijeno", razlog: "no_changes" } });
    expect(drugo.stanje).toBe(s1);
  });

  test("a change after publishing makes version 2", () => {
    const s0 = stanje();
    const s1 = uspeh(objavi(s0, s0.revizija, undefined, SADA)).stanje;
    const s2 = uspeh(postaviCenu(s1, artikal(s1, "Gibanica").key, 560, 600)).stanje;
    const drugo = uspeh(objavi(s2, s2.revizija, undefined, SADA + 5000));
    expect(drugo.vrednost).toEqual({ status: "objavljeno", verzija: 2 });
    expect(drugo.stanje.objavljenoU).toBe(SADA + 5000);
    expect(drugo.stanje.objavljeno).toBe(s2.snapshot);
    expect(stanjeNacrta(drugo.stanje)).toBe("clean");
    // The live version is a snapshot of the draft at that moment: later edits do not leak into it.
    const s3 = uspeh(postaviCenu(drugo.stanje, artikal(s2, "Gibanica").key, 600, 650)).stanje;
    expect(s3.objavljeno!.articles.find((a) => a.name === "Gibanica")!.basePriceRsd).toBe(600);
  });

  test("a stale revision is refused with stale_draft", () => {
    const s0 = stanje();
    const s1 = uspeh(postaviCenu(s0, artikal(s0, "Gibanica").key, 560, 600)).stanje;
    const korak = objavi(s1, s0.revizija, undefined, SADA);
    expect(korak.ishod).toEqual({ ok: true, vrednost: { status: "odbijeno", razlog: "stale_draft" } });
    expect(korak.stanje).toBe(s1);
    // A revision from the future is just as stale.
    expect(objavi(s1, s1.revizija + 1, undefined, SADA).ishod).toEqual({
      ok: true,
      vrednost: { status: "odbijeno", razlog: "stale_draft" },
    });
  });

  test("staleness is checked before everything else", () => {
    const s0 = stanje({ objavljeno: { verzija: 1, u: SADA } });
    // Clean state, but a wrong revision: stale_draft, not no_changes.
    expect(objavi(s0, 99, undefined, SADA).ishod).toEqual({ ok: true, vrednost: { status: "odbijeno", razlog: "stale_draft" } });
  });

  test("validation errors block publishing", () => {
    const s0 = stanje();
    const s1 = uspeh(postaviCenu(s0, artikal(s0, "Kajmak sa pogačom").key, 480, null)).stanje;
    const korak = objavi(s1, s1.revizija, undefined, SADA);
    expect(korak.ishod).toEqual({ ok: true, vrednost: { status: "odbijeno", razlog: "validation_failed" } });
    expect(korak.stanje).toBe(s1);
    expect(s1.objavljenaVerzija).toBeNull();
    // Even a confirmation of the warnings does not override an error.
    const otisak = pregledObjave(s1, true).otisak;
    expect(objavi(s1, s1.revizija, otisak, SADA).ishod).toEqual({
      ok: true,
      vrednost: { status: "odbijeno", razlog: "validation_failed" },
    });
  });

  test("warnings need the exact fingerprint", () => {
    const s0 = stanje();
    const prilozi = sekcija(s0, "Kompletan meni", "Prilozi");
    const s1 = uspeh(obrisiSekciju(s0, prilozi.key)).stanje;
    const pregled = pregledObjave(s1, true);
    expect(pregled.upozorenja.length).toBeGreaterThan(0);

    const bez = objavi(s1, s1.revizija, undefined, SADA);
    expect(bez.ishod).toEqual({ ok: true, vrednost: { status: "odbijeno", razlog: "confirmation_required" } });
    expect(bez.stanje).toBe(s1);
    expect(objavi(s1, s1.revizija, "pogresan-otisak", SADA).ishod).toEqual({
      ok: true,
      vrednost: { status: "odbijeno", razlog: "confirmation_required" },
    });

    const potvrdjeno = uspeh(objavi(s1, s1.revizija, pregled.otisak, SADA));
    expect(potvrdjeno.vrednost).toEqual({ status: "objavljeno", verzija: 1 });
    expect(potvrdjeno.stanje.objavljenaVerzija).toBe(1);
  });

  test("a changed warning asks again: an old fingerprint no longer confirms", () => {
    const s0 = stanje();
    const s1 = uspeh(obrisiSekciju(s0, sekcija(s0, "Kompletan meni", "Prilozi").key)).stanje;
    const stariOtisak = pregledObjave(s1, true).otisak;
    const s2 = uspeh(obrisiSekciju(s1, sekcija(s1, "Kompletan meni", "Dezerti").key)).stanje;
    expect(pregledObjave(s2, true).otisak).not.toBe(stariOtisak);
    expect(objavi(s2, s2.revizija, stariOtisak, SADA).ishod).toEqual({
      ok: true,
      vrednost: { status: "odbijeno", razlog: "confirmation_required" },
    });
  });

  test("a missing translation is a warning with a fingerprint (large fixture)", () => {
    const s0 = pocetnoStanje(fixtureMenu("veliki").snapshot);
    const pregled = pregledObjave(s0, true);
    expect(pregled.greske).toEqual([]);
    expect(pregled.upozorenja.map((u) => u.kod)).toEqual(["translation_missing"]);
    expect(pregled.upozorenja[0]).toMatchObject({ jezik: "en", artikalKey: null });
    expect(pregled.upozorenja[0].broj).toBeGreaterThan(0);

    expect(objavi(s0, s0.revizija, undefined, SADA).ishod).toEqual({
      ok: true,
      vrednost: { status: "odbijeno", razlog: "confirmation_required" },
    });
    expect(uspeh(objavi(s0, s0.revizija, pregled.otisak, SADA)).vrednost).toEqual({ status: "objavljeno", verzija: 1 });
  });
});
