// ScanMe Menu V1 — K16: combos, translations and Room service on the in-memory
// menu (the izlog's backend). They follow the rules of convex/menuCombos.ts,
// convex/menuTranslations.ts and convex/menuRoomService.ts:
//   - Room service needs Premium; a manual price stays exactly as typed; "Preuzmi
//     ceo meni" copies the visible content once;
//   - typed translations are confirmed at once, an AI suggestion is stored NEXT
//     to them and never published until confirmed;
//   - a combo's components are a full new list, "Zadrži cenu" clears the flag.
// Every successful change bumps the revision by exactly 1; a refusal or a no-op
// returns the very same state object.
//
// Fixtures: "Demo restoran" (fixtureMenu("srednji")) has no Room service and one
// combo "Ručak dana" (Teleća čorba, Punjene paprike, Kupus salata); "Hotel
// Primer" (fixtureMenu("veliki")) has three Room service categories, a 15 %
// markup for all, and "Club sendvič" with a manual Room service price of 950.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { MENU_ERROR } from "../errors/core";
import { confirmedTranslation, type MenuDraftSnapshot, type SnapshotArticle } from "../snapshot";
import { entityTranslationStatus, fieldTranslation, sourceHash, type MenuTranslations } from "../translation-status";
import {
  noviKombo,
  pocetnoStanje,
  postaviCene,
  postaviCenu,
  type MemorijaKorak,
  type MemorijaStanje,
} from "./memorija";
import {
  odbaciPredlog,
  postaviSastav,
  potvrdiPredlog,
  predloziPrevod,
  prevedi,
  prevodJeDobar,
  rsDodajArtikle,
  rsDodajKategoriju,
  rsObrisiKategoriju,
  rsPravila,
  rsPremestiKategoriju,
  rsPremestiStavku,
  rsPreimenujKategoriju,
  rsPreuzmiCeoMeni,
  rsResiUpozorenje,
  rsRucnaCena,
  rsUkloni,
  rsUvecanje,
  zadrziCenuKomboa,
} from "./memorija-k16";
import type { StudioPrevodCilj, StudioRsRed } from "./model";
import { roomServiceIzSnapshota } from "./room-service";

const SADA = 1_760_000_000_000;
const PREMIUM_REQUIRED = "plan/premium_required";

// --- helpers ------------------------------------------------------------------

type Opcije = Parameters<typeof pocetnoStanje>[1];

/** A menu state; `jezici` sets Settings → languages (source "sr"), `null` = never set. */
function stanje(size: "srednji" | "veliki", opcije: Opcije = {}, jezici?: string[] | null): MemorijaStanje {
  const snapshot = fixtureMenu(size).snapshot;
  const sa: MenuDraftSnapshot =
    jezici === undefined
      ? snapshot
      : { ...snapshot, settings: { ...snapshot.settings, languages: jezici === null ? null : { source: "sr", translations: jezici } } };
  return pocetnoStanje(sa, opcije);
}

const premiumSrednji = () => stanje("srednji", { premium: true, roomService: true });
const premiumVeliki = () => stanje("veliki", { premium: true, roomService: true });

function artikal(s: MemorijaStanje, naziv: string): SnapshotArticle {
  const found = s.snapshot.articles.find((a) => a.name === naziv);
  if (!found) throw new Error(`fixture article "${naziv}" missing`);
  return found;
}

const kljucArtikla = (s: MemorijaStanje, naziv: string) => artikal(s, naziv).key;

function sekcija(s: MemorijaStanje, naziv: string) {
  const found = s.snapshot.sections.find((sec) => sec.name === naziv);
  if (!found) throw new Error(`fixture section "${naziv}" missing`);
  return found;
}

/** The step must have succeeded; returns the next state and the value. */
function uspeh<T>(korak: MemorijaKorak<T>): { stanje: MemorijaStanje; vrednost: T } {
  if (!korak.ishod.ok) throw new Error(`expected success, got ${JSON.stringify(korak.ishod)}`);
  return { stanje: korak.stanje, vrednost: korak.ishod.vrednost };
}

/** A successful change: a new state with the revision raised by exactly 1. */
function promena<T>(korak: MemorijaKorak<T>, pre: MemorijaStanje): { stanje: MemorijaStanje; vrednost: T } {
  const rezultat = uspeh(korak);
  expect(rezultat.stanje).not.toBe(pre);
  expect(rezultat.stanje.revizija).toBe(pre.revizija + 1);
  return rezultat;
}

/** The step must have been refused with this code and must have left the state untouched. */
function odbijeno<T>(korak: MemorijaKorak<T>, pre: MemorijaStanje, kod: string) {
  expect(korak.ishod).toEqual({ ok: false, vrsta: "greska", kod, ponovljivo: false });
  expect(korak.stanje).toBe(pre);
}

/** A compare-and-set conflict that left the state untouched. */
function konfliktBezPromene<T>(korak: MemorijaKorak<T>, pre: MemorijaStanje, sacuvano: unknown, pokusano: unknown) {
  expect(korak.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano, pokusano });
  expect(korak.stanje).toBe(pre);
}

/** A successful no-op: the value is returned, the very same state comes back, no revision step. */
function bezPromene<T>(korak: MemorijaKorak<T>, pre: MemorijaStanje, vrednost: T) {
  expect(korak.ishod).toEqual({ ok: true, vrednost });
  expect(korak.stanje).toBe(pre);
  expect(korak.stanje.revizija).toBe(pre.revizija);
}

/** A Room service category (made with the real action) holding these articles. */
function saKategorijom(s: MemorijaStanje, naziv: string, ...imena: string[]): { stanje: MemorijaStanje; kategorijaId: string } {
  const dodata = uspeh(rsDodajKategoriju(s, naziv));
  const kategorijaId = dodata.vrednost.id;
  if (imena.length === 0) return { stanje: dodata.stanje, kategorijaId };
  const ids = imena.map((ime) => kljucArtikla(dodata.stanje, ime));
  return { stanje: uspeh(rsDodajArtikle(dodata.stanje, kategorijaId, ids)).stanje, kategorijaId };
}

function rsRedovi(s: MemorijaStanje): StudioRsRed[] {
  return roomServiceIzSnapshota(s.snapshot).kategorije.flatMap((kategorija) => kategorija.redovi);
}

function rsRed(s: MemorijaStanje, naziv: string): StudioRsRed {
  const found = rsRedovi(s).find((red) => red.naziv === naziv);
  if (!found) throw new Error(`Room service row "${naziv}" missing`);
  return found;
}

/** Article names of one Room service category, in the order the editor shows them. */
function rsNazivi(s: MemorijaStanje, kategorija: string): string[] {
  const found = roomServiceIzSnapshota(s.snapshot).kategorije.find((k) => k.naziv === kategorija);
  if (!found) throw new Error(`Room service category "${kategorija}" missing`);
  return found.redovi.map((red) => red.naziv);
}

const rsKategorije = (s: MemorijaStanje) => roomServiceIzSnapshota(s.snapshot).kategorije.map((k) => k.naziv);
const rsStavka = (s: MemorijaStanje, naziv: string) => s.snapshot.roomService.items.find((item) => item.articleKey === kljucArtikla(s, naziv))!;

const cilj = (s: MemorijaStanje, naziv: string): StudioPrevodCilj => ({ vrsta: "article", id: kljucArtikla(s, naziv) });
const prevodi = (s: MemorijaStanje, naziv: string) => artikal(s, naziv).translations;

/** The same state with another source name for an article (the owner edited it). */
function preimenovan(s: MemorijaStanje, stariNaziv: string, noviNaziv: string): MemorijaStanje {
  const key = kljucArtikla(s, stariNaziv);
  return { ...s, snapshot: { ...s.snapshot, articles: s.snapshot.articles.map((a) => (a.key === key ? { ...a, name: noviNaziv } : a)) } };
}

// =============================================================================
// Room service needs Premium
// =============================================================================

describe("Room service on Standard", () => {
  const s = stanje("veliki"); // premium: false; the fixture does have Room service content
  const kategorija = s.snapshot.roomService.categories[0].key;
  const stavka = s.snapshot.roomService.items[0].articleKey;
  const clan = s.snapshot.articles.find((a) => !s.snapshot.roomService.items.some((i) => i.articleKey === a.key))!.key;

  const akcije: [string, () => MemorijaKorak<unknown>][] = [
    ["rsPravila", () => rsPravila(s, { uvecanje: 15 }, { uvecanje: 20 })],
    ["rsDodajKategoriju", () => rsDodajKategoriju(s, "Nova")],
    ["rsPreimenujKategoriju", () => rsPreimenujKategoriju(s, kategorija, "Novo ime", "Doručak u sobi")],
    ["rsPremestiKategoriju", () => rsPremestiKategoriju(s, kategorija, 1)],
    ["rsObrisiKategoriju", () => rsObrisiKategoriju(s, kategorija)],
    ["rsPreuzmiCeoMeni", () => rsPreuzmiCeoMeni(s)],
    ["rsDodajArtikle", () => rsDodajArtikle(s, kategorija, [clan])],
    ["rsUkloni", () => rsUkloni(s, stavka)],
    ["rsPremestiStavku", () => rsPremestiStavku(s, stavka, kategorija, null)],
    ["rsUvecanje", () => rsUvecanje(s, [stavka], true)],
    ["rsRucnaCena", () => rsRucnaCena(s, stavka, null, 500)],
    ["rsResiUpozorenje", () => rsResiUpozorenje(s, stavka, "keepManual")],
  ];

  test.each(akcije)("%s is refused with plan/premium_required and leaves the state untouched", (_naziv, pozovi) => {
    odbijeno(pozovi(), s, PREMIUM_REQUIRED);
  });

  test("the Standard state is not changed by the refusals (no revision step)", () => {
    expect(s.revizija).toBe(1);
    for (const [, pozovi] of akcije) expect(pozovi().stanje.revizija).toBe(1);
  });
});

// =============================================================================
// Room service: categories
// =============================================================================

describe("Room service categories", () => {
  test("rsDodajKategoriju adds a category at the end with a new key and bumps the revision once", () => {
    const s0 = premiumSrednji();
    const a = promena(rsDodajKategoriju(s0, "  Za   sobu "), s0);
    expect(a.vrednost.id).toMatch(/^rc_mem/);
    expect(rsKategorije(a.stanje)).toEqual(["Za sobu"]);
    const b = promena(rsDodajKategoriju(a.stanje, "Večera"), a.stanje);
    expect(b.vrednost.id).not.toBe(a.vrednost.id);
    expect(rsKategorije(b.stanje)).toEqual(["Za sobu", "Večera"]);
    // The input state is not mutated.
    expect(s0.snapshot.roomService.categories).toHaveLength(0);
  });

  test("an empty or too long name is refused", () => {
    const s0 = premiumSrednji();
    odbijeno(rsDodajKategoriju(s0, "   "), s0, MENU_ERROR.invalidInput);
    odbijeno(rsDodajKategoriju(s0, "x".repeat(81)), s0, MENU_ERROR.invalidInput);
  });

  test("rsPreimenujKategoriju renames by compare-and-set; the same name is a no-op", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Za sobu");
    konfliktBezPromene(rsPreimenujKategoriju(s1, kategorijaId, "Novo", "Neko drugo ime"), s1, "Za sobu", "Novo");
    bezPromene(rsPreimenujKategoriju(s1, kategorijaId, " Za   sobu ", "Za sobu"), s1, null);
    const s2 = promena(rsPreimenujKategoriju(s1, kategorijaId, "Doručak", "Za sobu"), s1).stanje;
    expect(rsKategorije(s2)).toEqual(["Doručak"]);
    odbijeno(rsPreimenujKategoriju(s1, "rc_missing", "Novo", "Za sobu"), s1, MENU_ERROR.notFound);
    odbijeno(rsPreimenujKategoriju(s1, kategorijaId, "  ", "Za sobu"), s1, MENU_ERROR.invalidInput);
  });

  test("rsObrisiKategoriju refuses a category that still has articles (room_service/category_not_empty)", () => {
    const s0 = premiumVeliki();
    const neprazna = s0.snapshot.roomService.categories[0].key;
    odbijeno(rsObrisiKategoriju(s0, neprazna), s0, "room_service/category_not_empty");
  });

  test("an empty category can be deleted; an unknown one is not found", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumVeliki(), "Prazna");
    expect(rsKategorije(s1)).toContain("Prazna");
    const s2 = promena(rsObrisiKategoriju(s1, kategorijaId), s1).stanje;
    expect(rsKategorije(s2)).toEqual(["Doručak u sobi", "Jela i užina", "Pića i dezert"]);
    odbijeno(rsObrisiKategoriju(s2, kategorijaId), s2, MENU_ERROR.notFound);
  });

  test("a category emptied with rsUkloni can be deleted, and the articles stay in the menu", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Za sobu", "Sarma");
    odbijeno(rsObrisiKategoriju(s1, kategorijaId), s1, "room_service/category_not_empty");
    const s2 = promena(rsUkloni(s1, kljucArtikla(s1, "Sarma")), s1).stanje;
    expect(s2.snapshot.roomService.items).toHaveLength(0);
    expect(s2.snapshot.articles.some((a) => a.name === "Sarma")).toBe(true);
    const s3 = promena(rsObrisiKategoriju(s2, kategorijaId), s2).stanje;
    expect(rsKategorije(s3)).toEqual([]);
  });

  test("rsPremestiKategoriju reorders; the same place is a no-op; the index is clamped", () => {
    const s0 = premiumVeliki();
    const prva = s0.snapshot.roomService.categories.find((c) => c.name === "Doručak u sobi")!.key;
    const s1 = promena(rsPremestiKategoriju(s0, prva, 2), s0).stanje;
    expect(rsKategorije(s1)).toEqual(["Jela i užina", "Pića i dezert", "Doručak u sobi"]);
    bezPromene(rsPremestiKategoriju(s1, prva, 2), s1, null);
    bezPromene(rsPremestiKategoriju(s1, prva, 99), s1, null);
    const s2 = promena(rsPremestiKategoriju(s1, prva, 0), s1).stanje;
    expect(rsKategorije(s2)).toEqual(["Doručak u sobi", "Jela i užina", "Pića i dezert"]);
  });

  test("rsPremestiKategoriju refuses a bad index or an unknown category", () => {
    const s0 = premiumVeliki();
    const prva = s0.snapshot.roomService.categories[0].key;
    odbijeno(rsPremestiKategoriju(s0, prva, -1), s0, MENU_ERROR.invalidInput);
    odbijeno(rsPremestiKategoriju(s0, prva, 1.5), s0, MENU_ERROR.invalidInput);
    odbijeno(rsPremestiKategoriju(s0, "rc_missing", 1), s0, MENU_ERROR.notFound);
  });
});

// =============================================================================
// Room service: "Preuzmi ceo meni"
// =============================================================================

describe("rsPreuzmiCeoMeni", () => {
  const SEKCIJE = ["Predjela", "Supe i salate", "Sa roštilja", "Glavna jela", "Prilozi", "Dezerti", "Pića", "Vina"];

  test("copies the visible sections and articles of the main page once", () => {
    const s0 = premiumSrednji();
    const vidljivih = s0.snapshot.articles.length - 1; // "Jagnjetina ispod sača" is hidden
    const { stanje: s1, vrednost } = promena(rsPreuzmiCeoMeni(s0), s0);
    expect(vrednost).toEqual({ kategorija: 8, artikala: vidljivih, vecU: 0 });
    expect(rsKategorije(s1)).toEqual(SEKCIJE);
    expect(s1.snapshot.roomService.items).toHaveLength(vidljivih);
    expect(rsNazivi(s1, "Predjela")).toHaveLength(12);
    expect(rsNazivi(s1, "Predjela")[0]).toBe("Kajmak sa pogačom");
    expect(rsNazivi(s1, "Glavna jela")).toHaveLength(11);
  });

  test("hidden articles are not copied", () => {
    const s1 = uspeh(rsPreuzmiCeoMeni(premiumSrednji())).stanje;
    expect(rsNazivi(s1, "Glavna jela")).not.toContain("Jagnjetina ispod sača");
    expect(s1.snapshot.roomService.items.some((item) => item.articleKey === kljucArtikla(s1, "Jagnjetina ispod sača"))).toBe(false);
  });

  test("a hidden section is not copied", () => {
    const s0 = premiumSrednji();
    const desert = sekcija(s0, "Dezerti");
    const s1 = {
      ...s0,
      snapshot: { ...s0.snapshot, sections: s0.snapshot.sections.map((sec) => (sec.key === desert.key ? { ...sec, visibility: "hidden" as const } : sec)) },
    };
    const r = uspeh(rsPreuzmiCeoMeni(s1));
    expect(rsKategorije(r.stanje)).not.toContain("Dezerti");
    expect(r.vrednost.kategorija).toBe(7);
  });

  test("new items start without a manual price, a warning or a markup selection", () => {
    const s1 = uspeh(rsPreuzmiCeoMeni(premiumSrednji())).stanje;
    for (const item of s1.snapshot.roomService.items) {
      expect(item).toMatchObject({ markupApplies: false, manualPriceRsd: null, priceWarning: null, manualVariantPrices: null });
    }
  });

  test("the categories and items have unique keys and ascending orders", () => {
    const s1 = uspeh(rsPreuzmiCeoMeni(premiumSrednji())).stanje;
    const { categories, items } = s1.snapshot.roomService;
    expect(new Set(categories.map((c) => c.key)).size).toBe(categories.length);
    expect(new Set(items.map((i) => i.articleKey)).size).toBe(items.length);
    const reda = categories.map((c) => c.order);
    expect(reda).toEqual(reda.slice().sort((a, b) => a - b));
    expect(new Set(reda).size).toBe(reda.length);
  });

  test("a second call adds nothing and counts what is already there", () => {
    const s0 = premiumSrednji();
    const { stanje: s1, vrednost } = uspeh(rsPreuzmiCeoMeni(s0));
    bezPromene(rsPreuzmiCeoMeni(s1), s1, { kategorija: 0, artikala: 0, vecU: vrednost.artikala });
  });

  test("an article that is already in Room service stays where it is and counts as already there", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Moja kategorija", "Pomfrit");
    const { stanje: s2, vrednost } = promena(rsPreuzmiCeoMeni(s1), s1);
    expect(vrednost.vecU).toBe(1);
    expect(vrednost.artikala).toBe(s1.snapshot.articles.length - 2); // not the hidden one, not Pomfrit
    expect(rsNazivi(s2, "Moja kategorija")).toEqual(["Pomfrit"]);
    expect(rsNazivi(s2, "Prilozi")).not.toContain("Pomfrit");
    expect(s2.snapshot.roomService.categories.some((c) => c.key === kategorijaId)).toBe(true);
  });

  test("a category with the same name is reused (its items are appended after the existing ones)", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Prilozi", "Sarma");
    const { stanje: s2, vrednost } = promena(rsPreuzmiCeoMeni(s1), s1);
    expect(vrednost.kategorija).toBe(7); // Prilozi already existed
    expect(s2.snapshot.roomService.categories.filter((c) => c.name === "Prilozi")).toHaveLength(1);
    expect(s2.snapshot.roomService.categories.find((c) => c.name === "Prilozi")!.key).toBe(kategorijaId);
    const nazivi = rsNazivi(s2, "Prilozi");
    expect(nazivi[0]).toBe("Sarma");
    expect(nazivi.slice(1)).toEqual(["Pomfrit", "Pečeni krompir", "Kajmak", "Ajvar", "Grilovano povrće", "Pogača"]);
    // Sarma is in Room service once, under Prilozi, not copied again under Glavna jela.
    expect(rsNazivi(s2, "Glavna jela")).not.toContain("Sarma");
  });

  test("a menu without a main page is not found", () => {
    const s0 = premiumSrednji();
    const bez = { ...s0, snapshot: { ...s0.snapshot, pages: s0.snapshot.pages.map((p) => ({ ...p, isDefault: false })) } };
    odbijeno(rsPreuzmiCeoMeni(bez), bez, MENU_ERROR.notFound);
  });

  test("an article shown in two sections of the main page is copied once", () => {
    const s0 = premiumSrednji();
    const kajmak = kljucArtikla(s0, "Kajmak sa pogačom");
    const dezerti = sekcija(s0, "Dezerti");
    const dvaPuta = {
      ...s0,
      snapshot: {
        ...s0.snapshot,
        placements: [...s0.snapshot.placements, { pageKey: dezerti.pageKey, sectionKey: dezerti.key, articleKey: kajmak, order: 999, visibility: "visible" as const }],
      },
    };
    const r = uspeh(rsPreuzmiCeoMeni(dvaPuta));
    expect(r.stanje.snapshot.roomService.items.filter((i) => i.articleKey === kajmak)).toHaveLength(1);
    expect(r.vrednost.vecU).toBe(1);
  });
});

// =============================================================================
// Room service: articles
// =============================================================================

describe("rsDodajArtikle", () => {
  test("adds articles to the end of a category; one already in Room service is skipped", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Za sobu", "Sarma");
    const { stanje: s2, vrednost } = promena(
      rsDodajArtikle(s1, kategorijaId, [kljucArtikla(s1, "Sarma"), kljucArtikla(s1, "Musaka"), kljucArtikla(s1, "Gibanica")]),
      s1,
    );
    expect(vrednost).toEqual({ dodato: 2, vecU: 1 });
    expect(rsNazivi(s2, "Za sobu")).toEqual(["Sarma", "Musaka", "Gibanica"]);
    expect(rsStavka(s2, "Musaka")).toMatchObject({ markupApplies: false, manualPriceRsd: null, priceWarning: null });
  });

  test("all already there: a no-op that reports it", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Za sobu", "Sarma");
    bezPromene(rsDodajArtikle(s1, kategorijaId, [kljucArtikla(s1, "Sarma")]), s1, { dodato: 0, vecU: 1 });
  });

  test("the same id twice counts once", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Za sobu");
    const musaka = kljucArtikla(s1, "Musaka");
    expect(promena(rsDodajArtikle(s1, kategorijaId, [musaka, musaka]), s1).vrednost).toEqual({ dodato: 1, vecU: 0 });
  });

  test("an article is in Room service at most once, even across categories", () => {
    const { stanje: s1 } = saKategorijom(premiumSrednji(), "Prva", "Sarma");
    const { stanje: s2, kategorijaId: druga } = saKategorijom(s1, "Druga");
    const r = uspeh(rsDodajArtikle(s2, druga, [kljucArtikla(s2, "Sarma")]));
    expect(r.vrednost).toEqual({ dodato: 0, vecU: 1 });
    expect(rsNazivi(r.stanje, "Druga")).toEqual([]);
  });

  test("an unknown article refuses the whole batch with menu/not_found", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Za sobu");
    odbijeno(rsDodajArtikle(s1, kategorijaId, [kljucArtikla(s1, "Musaka"), "ar_missing"]), s1, MENU_ERROR.notFound);
  });

  test("an unknown category is not found", () => {
    const s0 = premiumSrednji();
    odbijeno(rsDodajArtikle(s0, "rc_missing", [kljucArtikla(s0, "Musaka")]), s0, MENU_ERROR.notFound);
  });

  test("0 ids and more than 200 ids are refused as invalid input", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumSrednji(), "Za sobu");
    odbijeno(rsDodajArtikle(s1, kategorijaId, []), s1, MENU_ERROR.invalidInput);
    odbijeno(rsDodajArtikle(s1, kategorijaId, Array.from({ length: 201 }, (_, i) => `ar_${i}`)), s1, MENU_ERROR.invalidInput);
  });

  test("exactly 200 distinct ids are accepted", () => {
    const { stanje: s1, kategorijaId } = saKategorijom(premiumVeliki(), "Veliki izbor");
    const ids = s1.snapshot.articles.slice(0, 200).map((a) => a.key);
    const uRs = new Set(s1.snapshot.roomService.items.map((i) => i.articleKey));
    const { stanje: s2, vrednost } = promena(rsDodajArtikle(s1, kategorijaId, ids), s1);
    const vec = ids.filter((id) => uRs.has(id)).length;
    expect(vrednost).toEqual({ dodato: 200 - vec, vecU: vec });
    expect(s2.snapshot.roomService.items).toHaveLength(s1.snapshot.roomService.items.length + 200 - vec);
  });
});

describe("rsUkloni, rsPremestiStavku", () => {
  function dveKategorije() {
    const a = saKategorijom(premiumSrednji(), "Doručak", "Sarma", "Musaka", "Gibanica");
    const b = saKategorijom(a.stanje, "Večera");
    return { s: b.stanje, A: a.kategorijaId, B: b.kategorijaId };
  }

  test("rsUkloni takes the article out of Room service; the article stays in the menu", () => {
    const { s } = dveKategorije();
    const s1 = promena(rsUkloni(s, kljucArtikla(s, "Musaka")), s).stanje;
    expect(rsNazivi(s1, "Doručak")).toEqual(["Sarma", "Gibanica"]);
    expect(s1.snapshot.articles.some((a) => a.name === "Musaka")).toBe(true);
    odbijeno(rsUkloni(s1, kljucArtikla(s1, "Musaka")), s1, MENU_ERROR.notFound);
  });

  test("moves an item directly before another one in the same category", () => {
    const { s, A } = dveKategorije();
    const s1 = promena(rsPremestiStavku(s, kljucArtikla(s, "Gibanica"), A, kljucArtikla(s, "Sarma")), s).stanje;
    expect(rsNazivi(s1, "Doručak")).toEqual(["Gibanica", "Sarma", "Musaka"]);
  });

  test("moves an item to the end of the same category (null)", () => {
    const { s, A } = dveKategorije();
    const s1 = promena(rsPremestiStavku(s, kljucArtikla(s, "Sarma"), A, null), s).stanje;
    expect(rsNazivi(s1, "Doručak")).toEqual(["Musaka", "Gibanica", "Sarma"]);
  });

  test("moves an item into another category", () => {
    const { s, B } = dveKategorije();
    const s1 = promena(rsPremestiStavku(s, kljucArtikla(s, "Sarma"), B, null), s).stanje;
    expect(rsNazivi(s1, "Doručak")).toEqual(["Musaka", "Gibanica"]);
    expect(rsNazivi(s1, "Večera")).toEqual(["Sarma"]);
    expect(rsStavka(s1, "Sarma").categoryKey).toBe(B);
    const s2 = promena(rsPremestiStavku(s1, kljucArtikla(s1, "Gibanica"), B, kljucArtikla(s1, "Sarma")), s1).stanje;
    expect(rsNazivi(s2, "Večera")).toEqual(["Gibanica", "Sarma"]);
  });

  test("the place it already has is a no-op", () => {
    const { s, A } = dveKategorije();
    bezPromene(rsPremestiStavku(s, kljucArtikla(s, "Sarma"), A, kljucArtikla(s, "Musaka")), s, null); // already right before Musaka
    bezPromene(rsPremestiStavku(s, kljucArtikla(s, "Gibanica"), A, null), s, null); // already last
    bezPromene(rsPremestiStavku(s, kljucArtikla(s, "Sarma"), A, kljucArtikla(s, "Sarma")), s, null);
  });

  test("an unknown item, category or neighbour is refused", () => {
    const { s, A, B } = dveKategorije();
    const sarma = kljucArtikla(s, "Sarma");
    odbijeno(rsPremestiStavku(s, "ar_missing", A, null), s, MENU_ERROR.notFound);
    odbijeno(rsPremestiStavku(s, sarma, "rc_missing", null), s, MENU_ERROR.notFound);
    // The neighbour must be in the target category.
    odbijeno(rsPremestiStavku(s, sarma, B, kljucArtikla(s, "Musaka")), s, MENU_ERROR.invalidInput);
  });
});

describe("rsUvecanje (selecting articles for the markup)", () => {
  test("selects and deselects; selecting again is a no-op", () => {
    const { stanje: s1 } = saKategorijom(premiumSrednji(), "Za sobu", "Sarma", "Musaka");
    const sarma = kljucArtikla(s1, "Sarma");
    const s2 = promena(rsUvecanje(s1, [sarma], true), s1).stanje;
    expect(rsStavka(s2, "Sarma").markupApplies).toBe(true);
    expect(rsStavka(s2, "Musaka").markupApplies).toBe(false);
    bezPromene(rsUvecanje(s2, [sarma], true), s2, null);
    const s3 = promena(rsUvecanje(s2, [sarma], false), s2).stanje;
    expect(rsStavka(s3, "Sarma").markupApplies).toBe(false);
  });

  test("refuses no ids, more than 200 ids, and an article that is not in Room service", () => {
    const { stanje: s1 } = saKategorijom(premiumSrednji(), "Za sobu", "Sarma");
    odbijeno(rsUvecanje(s1, [], true), s1, MENU_ERROR.invalidInput);
    odbijeno(rsUvecanje(s1, Array.from({ length: 201 }, (_, i) => `ar_${i}`), true), s1, MENU_ERROR.invalidInput);
    odbijeno(rsUvecanje(s1, [kljucArtikla(s1, "Musaka")], true), s1, MENU_ERROR.notFound);
  });
});

// =============================================================================
// Room service: rules
// =============================================================================

describe("rsPravila", () => {
  test("changes the markup by compare-and-set", () => {
    const s0 = premiumVeliki(); // 15 %, all, 300 RSD delivery
    expect(roomServiceIzSnapshota(s0.snapshot).pravila).toEqual({ uvecanje: 15, obuhvat: "all", naknada: 300 });
    const s1 = promena(rsPravila(s0, { uvecanje: 15 }, { uvecanje: 20 }), s0).stanje;
    expect(s1.snapshot.roomService.config).toEqual({ markupBps: 2000, markupScope: "all", deliveryFeeRsd: 300 });
    expect(roomServiceIzSnapshota(s1.snapshot).pravila.uvecanje).toBe(20);
  });

  test("a decimal percent is kept exactly (12.5 %)", () => {
    const s0 = premiumVeliki();
    const s1 = promena(rsPravila(s0, { uvecanje: 15 }, { uvecanje: 12.5 }), s0).stanje;
    expect(s1.snapshot.roomService.config?.markupBps).toBe(1250);
    expect(roomServiceIzSnapshota(s1.snapshot).pravila.uvecanje).toBe(12.5);
  });

  test("a stale expectation is a conflict that shows the saved value", () => {
    const s0 = premiumVeliki();
    konfliktBezPromene(rsPravila(s0, { uvecanje: 10 }, { uvecanje: 20 }), s0, 15, 20);
    konfliktBezPromene(rsPravila(s0, { naknada: null }, { naknada: 400 }), s0, 300, 400);
    konfliktBezPromene(rsPravila(s0, { obuhvat: "selected" }, { obuhvat: "all" }), s0, "all", "all");
  });

  test("a percent above 300 (or finer than 0.01) or a negative one is refused", () => {
    const s0 = premiumVeliki();
    odbijeno(rsPravila(s0, { uvecanje: 15 }, { uvecanje: 301 }), s0, MENU_ERROR.invalidInput);
    odbijeno(rsPravila(s0, { uvecanje: 15 }, { uvecanje: -1 }), s0, MENU_ERROR.invalidInput);
    odbijeno(rsPravila(s0, { uvecanje: 15 }, { uvecanje: 0.001 }), s0, MENU_ERROR.invalidInput);
    odbijeno(rsPravila(s0, { uvecanje: 15 }, { uvecanje: Number.NaN }), s0, MENU_ERROR.invalidInput);
  });

  test("300 % is the highest accepted", () => {
    const s0 = premiumVeliki();
    const s1 = promena(rsPravila(s0, { uvecanje: 15 }, { uvecanje: 300 }), s0).stanje;
    expect(s1.snapshot.roomService.config?.markupBps).toBe(30_000);
  });

  test("no markup (null) clears it", () => {
    const s0 = premiumVeliki();
    const s1 = promena(rsPravila(s0, { uvecanje: 15 }, { uvecanje: null }), s0).stanje;
    expect(s1.snapshot.roomService.config?.markupBps).toBeNull();
    expect(roomServiceIzSnapshota(s1.snapshot).pravila.uvecanje).toBeNull();
  });

  test("scope and delivery fee; a fee of 0 means none", () => {
    const s0 = premiumVeliki();
    const s1 = promena(rsPravila(s0, { obuhvat: "all", naknada: 300 }, { obuhvat: "selected", naknada: 450 }), s0).stanje;
    expect(s1.snapshot.roomService.config).toEqual({ markupBps: 1500, markupScope: "selected", deliveryFeeRsd: 450 });
    const s2 = promena(rsPravila(s1, { naknada: 450 }, { naknada: 0 }), s1).stanje;
    expect(s2.snapshot.roomService.config?.deliveryFeeRsd).toBeNull();
    odbijeno(rsPravila(s1, { naknada: 450 }, { naknada: -5 }), s1, MENU_ERROR.invalidInput);
    odbijeno(rsPravila(s1, { naknada: 450 }, { naknada: 2.5 }), s1, MENU_ERROR.invalidInput);
  });

  test("setting the value it already has is a no-op", () => {
    const s0 = premiumVeliki();
    bezPromene(rsPravila(s0, { uvecanje: 15 }, { uvecanje: 15 }), s0, null);
    bezPromene(rsPravila(s0, { obuhvat: "all", naknada: 300 }, { obuhvat: "all", naknada: 300 }), s0, null);
  });

  test("a menu with no Room service rules yet starts from `no markup, all, no fee`", () => {
    const s0 = premiumSrednji();
    expect(s0.snapshot.roomService.config).toBeNull();
    bezPromene(rsPravila(s0, { uvecanje: null }, { uvecanje: null }), s0, null);
    const s1 = promena(rsPravila(s0, { uvecanje: null }, { uvecanje: 10 }), s0).stanje;
    expect(s1.snapshot.roomService.config).toEqual({ markupBps: 1000, markupScope: "all", deliveryFeeRsd: null });
  });

  test("an empty change, or a field without an expectation, is invalid input", () => {
    const s0 = premiumVeliki();
    odbijeno(rsPravila(s0, { uvecanje: 15 }, {}), s0, MENU_ERROR.invalidInput);
    odbijeno(rsPravila(s0, { uvecanje: 15 }, { uvecanje: undefined }), s0, MENU_ERROR.invalidInput);
    odbijeno(rsPravila(s0, { uvecanje: 15 }, { naknada: 100 }), s0, MENU_ERROR.invalidInput);
  });
});

// =============================================================================
// Room service: manual prices and warnings
// =============================================================================

describe("rsRucnaCena", () => {
  function sSarmom() {
    return saKategorijom(premiumSrednji(), "Za sobu", "Sarma", "Musaka").stanje;
  }

  test("keeps the exact price typed (no rounding, no markup)", () => {
    const s0 = uspeh(rsPravila(sSarmom(), { uvecanje: null }, { uvecanje: 15 })).stanje;
    const sarma = kljucArtikla(s0, "Sarma");
    const s1 = promena(rsRucnaCena(s0, sarma, null, 599), s0).stanje;
    expect(rsStavka(s1, "Sarma").manualPriceRsd).toBe(599);
    expect(rsRed(s1, "Sarma")).toMatchObject({ rucna: 599, cena: 599, poreklo: "manual" });
  });

  test("0 is a real manual price", () => {
    const s0 = sSarmom();
    const s1 = promena(rsRucnaCena(s0, kljucArtikla(s0, "Sarma"), null, 0), s0).stanje;
    expect(rsRed(s1, "Sarma")).toMatchObject({ rucna: 0, cena: 0, poreklo: "manual" });
  });

  test("compare-and-set on the manual price last seen", () => {
    const s0 = sSarmom();
    const sarma = kljucArtikla(s0, "Sarma");
    const s1 = uspeh(rsRucnaCena(s0, sarma, null, 700)).stanje;
    konfliktBezPromene(rsRucnaCena(s1, sarma, null, 800), s1, 700, 800);
    konfliktBezPromene(rsRucnaCena(s1, sarma, 650, null), s1, 700, null);
    promena(rsRucnaCena(s1, sarma, 700, 800), s1);
  });

  test("null goes back to the rule", () => {
    const s0 = sSarmom();
    const sarma = kljucArtikla(s0, "Sarma");
    const s1 = uspeh(rsRucnaCena(s0, sarma, null, 700)).stanje;
    const s2 = promena(rsRucnaCena(s1, sarma, 700, null), s1).stanje;
    expect(rsStavka(s2, "Sarma").manualPriceRsd).toBeNull();
    expect(rsRed(s2, "Sarma").poreklo).toBe("inherited");
    expect(rsRed(s2, "Sarma").cena).toBe(820);
  });

  test("the same price again is a no-op", () => {
    const s0 = sSarmom();
    const sarma = kljucArtikla(s0, "Sarma");
    bezPromene(rsRucnaCena(s0, sarma, null, null), s0, null);
    const s1 = uspeh(rsRucnaCena(s0, sarma, null, 700)).stanje;
    bezPromene(rsRucnaCena(s1, sarma, 700, 700), s1, null);
  });

  test("an invalid price is refused (not whole, negative, above the maximum)", () => {
    const s0 = sSarmom();
    const sarma = kljucArtikla(s0, "Sarma");
    for (const cena of [-1, 1.5, 1_000_001, Number.NaN]) odbijeno(rsRucnaCena(s0, sarma, null, cena), s0, MENU_ERROR.invalidInput);
  });

  test("an article that is not in Room service is not found", () => {
    const s0 = sSarmom();
    odbijeno(rsRucnaCena(s0, kljucArtikla(s0, "Gibanica"), null, 500), s0, MENU_ERROR.notFound);
  });

  test("clears a pending warning even when the price is the same", () => {
    const s0 = sSarmom();
    const sarma = kljucArtikla(s0, "Sarma");
    const s1 = uspeh(rsRucnaCena(s0, sarma, null, 700)).stanje;
    const s2 = uspeh(postaviCenu(s1, sarma, 820, 900, SADA)).stanje;
    expect(rsStavka(s2, "Sarma").priceWarning).not.toBeNull();
    const s3 = promena(rsRucnaCena(s2, sarma, 700, 700), s2).stanje;
    expect(rsStavka(s3, "Sarma")).toMatchObject({ manualPriceRsd: 700, priceWarning: null });
  });

  test("a new manual price clears the warning", () => {
    const s0 = sSarmom();
    const sarma = kljucArtikla(s0, "Sarma");
    const s1 = uspeh(rsRucnaCena(s0, sarma, null, 700)).stanje;
    const s2 = uspeh(postaviCenu(s1, sarma, 820, 900, SADA)).stanje;
    const s3 = promena(rsRucnaCena(s2, sarma, 700, 750), s2).stanje;
    expect(rsStavka(s3, "Sarma")).toMatchObject({ manualPriceRsd: 750, priceWarning: null });
    expect(rsRed(s3, "Sarma").upozorenje).toBeNull();
  });
});

describe("rsResiUpozorenje", () => {
  /** Sarma has a manual Room service price of 700 and its base price went 820 -> 900 with a 10 % markup. */
  function sUpozorenjem() {
    const s0 = uspeh(rsPravila(saKategorijom(premiumSrednji(), "Za sobu", "Sarma", "Musaka").stanje, { uvecanje: null }, { uvecanje: 10 })).stanje;
    const sarma = kljucArtikla(s0, "Sarma");
    const s1 = uspeh(rsRucnaCena(s0, sarma, null, 700)).stanje;
    return { s: uspeh(postaviCenu(s1, sarma, 820, 900, SADA)).stanje, sarma };
  }

  test("keepManual keeps the manual price and clears the warning", () => {
    const { s, sarma } = sUpozorenjem();
    const s1 = promena(rsResiUpozorenje(s, sarma, "keepManual"), s).stanje;
    expect(rsStavka(s1, "Sarma")).toMatchObject({ manualPriceRsd: 700, priceWarning: null });
    expect(rsRed(s1, "Sarma")).toMatchObject({ cena: 700, poreklo: "manual", upozorenje: null });
  });

  test("recomputeFromMarkup clears the manual price (back to the rule, with the NEW base) and the warning", () => {
    const { s, sarma } = sUpozorenjem();
    const s1 = promena(rsResiUpozorenje(s, sarma, "recomputeFromMarkup"), s).stanje;
    expect(rsStavka(s1, "Sarma")).toMatchObject({ manualPriceRsd: null, priceWarning: null });
    expect(rsRed(s1, "Sarma")).toMatchObject({ cena: 990, poreklo: "computed", rucna: null, upozorenje: null }); // 900 + 10 %
  });

  test("without a warning it is a no-op, and an unknown article is not found", () => {
    const { s, sarma } = sUpozorenjem();
    const musaka = kljucArtikla(s, "Musaka");
    bezPromene(rsResiUpozorenje(s, musaka, "recomputeFromMarkup"), s, null);
    const s1 = uspeh(rsResiUpozorenje(s, sarma, "keepManual")).stanje;
    bezPromene(rsResiUpozorenje(s1, sarma, "recomputeFromMarkup"), s1, null);
    odbijeno(rsResiUpozorenje(s, "ar_missing", "keepManual"), s, MENU_ERROR.notFound);
  });
});

// =============================================================================
// Base price changes and Room service / combos (postaviCenu, postaviCene)
// =============================================================================

describe("postaviCenu and Room service: every RS row tells the origin of its price", () => {
  test("a manual Room service price stays and the change returns the warning", () => {
    const s0 = uspeh(rsPravila(saKategorijom(premiumSrednji(), "Za sobu", "Sarma", "Musaka").stanje, { uvecanje: null }, { uvecanje: 10 })).stanje;
    const sarma = kljucArtikla(s0, "Sarma");
    const s1 = uspeh(rsRucnaCena(s0, sarma, null, 700)).stanje;

    const { stanje: s2, vrednost } = promena(postaviCenu(s1, sarma, 820, 900, SADA), s1);
    expect(vrednost).toEqual({
      stavkaId: sarma,
      naziv: "Sarma",
      staraOsnovna: 820,
      novaOsnovna: 900,
      rsCena: 700, // the manual price, unchanged
      izracunata: 990, // the rule with the NEW base: 900 + 10 %
    });
    expect(artikal(s2, "Sarma").basePriceRsd).toBe(900);
    expect(rsStavka(s2, "Sarma")).toMatchObject({ manualPriceRsd: 700, priceWarning: { oldBaseRsd: 820, newBaseRsd: 900, at: SADA } });
    expect(rsRed(s2, "Sarma")).toMatchObject({
      osnovna: 900,
      rucna: 700,
      cena: 700,
      poreklo: "manual",
      upozorenje: vrednost,
    });
  });

  test("an article without a manual price returns null and its Room service price follows the new base", () => {
    const s0 = uspeh(rsPravila(saKategorijom(premiumSrednji(), "Za sobu", "Sarma", "Musaka").stanje, { uvecanje: null }, { uvecanje: 10 })).stanje;
    expect(rsRed(s0, "Musaka")).toMatchObject({ osnovna: 690, cena: 759, poreklo: "computed" });
    const { stanje: s1, vrednost } = promena(postaviCenu(s0, kljucArtikla(s0, "Musaka"), 690, 800, SADA), s0);
    expect(vrednost).toBeNull();
    expect(rsStavka(s1, "Musaka").priceWarning).toBeNull();
    expect(rsRed(s1, "Musaka")).toMatchObject({ osnovna: 800, cena: 880, poreklo: "computed", upozorenje: null });
  });

  test("an article that is not in Room service returns null", () => {
    const s0 = saKategorijom(premiumSrednji(), "Za sobu", "Sarma").stanje;
    expect(promena(postaviCenu(s0, kljucArtikla(s0, "Gibanica"), 560, 600, SADA), s0).vrednost).toBeNull();
  });

  test("works on Standard too (the base price is not a Premium feature)", () => {
    const s0 = stanje("srednji");
    const r = promena(postaviCenu(s0, kljucArtikla(s0, "Gibanica"), 560, 600, SADA), s0);
    expect(r.vrednost).toBeNull();
    expect(artikal(r.stanje, "Gibanica").basePriceRsd).toBe(600);
  });

  test("a second change keeps the first old base; going back to it clears the warning", () => {
    const s0 = premiumVeliki();
    const club = kljucArtikla(s0, "Club sendvič");
    expect(rsStavka(s0, "Club sendvič").manualPriceRsd).toBe(950);
    const w1 = promena(postaviCenu(s0, club, 780, 800, SADA), s0);
    expect(w1.vrednost).toMatchObject({ staraOsnovna: 780, novaOsnovna: 800, rsCena: 950, izracunata: 920 });
    const w2 = promena(postaviCenu(w1.stanje, club, 800, 850, SADA + 1), w1.stanje);
    expect(w2.vrednost).toMatchObject({ staraOsnovna: 780, novaOsnovna: 850, rsCena: 950, izracunata: 978 }); // 850 + 127.5 -> 128
    const w3 = promena(postaviCenu(w2.stanje, club, 850, 780, SADA + 2), w2.stanje);
    expect(w3.vrednost).toBeNull();
    expect(rsStavka(w3.stanje, "Club sendvič")).toMatchObject({ manualPriceRsd: 950, priceWarning: null });
  });

  test("the same price is a no-op, a stale expectation is a conflict", () => {
    const s0 = premiumVeliki();
    const club = kljucArtikla(s0, "Club sendvič");
    bezPromene(postaviCenu(s0, club, 780, 780, SADA), s0, null);
    konfliktBezPromene(postaviCenu(s0, club, 700, 800, SADA), s0, 780, 800);
  });

  test("origin and price per row: inherited, computed, manual", () => {
    const s0 = premiumSrednji();
    const { stanje: s1 } = saKategorijom(s0, "Za sobu", "Sarma", "Musaka", "Gibanica", "Espresso");
    // No markup yet: everything is the base price.
    expect(rsRed(s1, "Musaka")).toMatchObject({ cena: 690, poreklo: "inherited" });
    expect(rsRed(s1, "Gibanica")).toMatchObject({ cena: 560, poreklo: "inherited" });

    // A manual price for Sarma; a 10 % markup for all.
    const s2 = uspeh(rsRucnaCena(s1, kljucArtikla(s1, "Sarma"), null, 700)).stanje;
    const s3 = uspeh(rsPravila(s2, { uvecanje: null }, { uvecanje: 10 })).stanje;
    expect(rsRed(s3, "Sarma")).toMatchObject({ cena: 700, poreklo: "manual", rucna: 700 });
    expect(rsRed(s3, "Musaka")).toMatchObject({ cena: 759, poreklo: "computed", rucna: null });
    expect(rsRed(s3, "Gibanica")).toMatchObject({ cena: 616, poreklo: "computed" });

    // The markup only for selected articles: nobody is selected yet.
    const s4 = uspeh(rsPravila(s3, { obuhvat: "all" }, { obuhvat: "selected" })).stanje;
    expect(rsRed(s4, "Musaka")).toMatchObject({ cena: 690, poreklo: "inherited" });
    expect(rsRed(s4, "Sarma")).toMatchObject({ cena: 700, poreklo: "manual" });

    // Select Musaka only.
    const s5 = uspeh(rsUvecanje(s4, [kljucArtikla(s4, "Musaka")], true)).stanje;
    expect(rsRed(s5, "Musaka")).toMatchObject({ cena: 759, poreklo: "computed", uvecanje: true });
    expect(rsRed(s5, "Gibanica")).toMatchObject({ cena: 560, poreklo: "inherited", uvecanje: false });
  });

  test("an article without any price: no price, inherited; a manual price wins even without a base", () => {
    const s0 = premiumSrednji();
    const { stanje: s1 } = saKategorijom(s0, "Za sobu", "Espresso"); // base null, variants carry the prices
    expect(rsRed(s1, "Espresso")).toMatchObject({ osnovna: null, cena: null, poreklo: "inherited" });
    const s2 = uspeh(rsRucnaCena(s1, kljucArtikla(s1, "Espresso"), null, 150)).stanje;
    expect(rsRed(s2, "Espresso")).toMatchObject({ osnovna: null, cena: 150, poreklo: "manual" });
  });

  test("the fixture's own rows: the markup rows are computed, the manual row is manual", () => {
    const s0 = premiumVeliki();
    expect(rsRed(s0, "Club sendvič")).toMatchObject({ osnovna: 780, cena: 950, poreklo: "manual" });
    expect(rsRed(s0, "Klasični burger")).toMatchObject({ osnovna: 890, cena: 1024, poreklo: "computed" }); // 133.5 rounds up
  });
});

describe("postaviCenu and combos", () => {
  const combo = (s: MemorijaStanje) => artikal(s, "Ručak dana");

  test("a component price change flags the combo with `Proveri cenu` and leaves the combo price unchanged", () => {
    const s0 = stanje("srednji");
    expect(combo(s0)).toMatchObject({ kind: "combo", basePriceRsd: 1150, priceCheck: null });
    const telecaKljuc = kljucArtikla(s0, "Teleća čorba");
    const s1 = promena(postaviCenu(s0, telecaKljuc, 420, 450, SADA), s0).stanje;
    expect(combo(s1).basePriceRsd).toBe(1150);
    expect(combo(s1).priceCheck).toEqual({ since: SADA, changedComponentKeys: [telecaKljuc], removedComponentNames: [] });
    expect(artikal(s1, "Teleća čorba").basePriceRsd).toBe(450);
  });

  test("further component changes add to the flag and keep the first `since`; the same component is listed once", () => {
    const s0 = stanje("srednji");
    const s1 = uspeh(postaviCenu(s0, kljucArtikla(s0, "Teleća čorba"), 420, 450, SADA)).stanje;
    const s2 = uspeh(postaviCenu(s1, kljucArtikla(s1, "Punjene paprike"), 760, 800, SADA + 10)).stanje;
    const s3 = uspeh(postaviCenu(s2, kljucArtikla(s2, "Teleća čorba"), 450, 470, SADA + 20)).stanje;
    expect(combo(s3).priceCheck).toEqual({
      since: SADA,
      changedComponentKeys: [kljucArtikla(s3, "Teleća čorba"), kljucArtikla(s3, "Punjene paprike")],
      removedComponentNames: [],
    });
    expect(combo(s3).basePriceRsd).toBe(1150);
  });

  test("a price change of an article that is in no combo flags nothing", () => {
    const s0 = stanje("srednji");
    const s1 = uspeh(postaviCenu(s0, kljucArtikla(s0, "Gibanica"), 560, 600, SADA)).stanje;
    expect(s1.snapshot.articles.filter((a) => a.priceCheck !== null)).toHaveLength(0);
  });

  test("a new price on the combo clears its flag", () => {
    const s0 = stanje("srednji");
    const s1 = uspeh(postaviCenu(s0, kljucArtikla(s0, "Teleća čorba"), 420, 450, SADA)).stanje;
    const s2 = promena(postaviCenu(s1, combo(s1).key, 1150, 1200, SADA + 5), s1).stanje;
    expect(combo(s2)).toMatchObject({ basePriceRsd: 1200, priceCheck: null });
  });

  test("`Zadrži cenu` clears the flag and keeps the combo price", () => {
    const s0 = stanje("srednji");
    const s1 = uspeh(postaviCenu(s0, kljucArtikla(s0, "Teleća čorba"), 420, 450, SADA)).stanje;
    const s2 = promena(zadrziCenuKomboa(s1, combo(s1).key), s1).stanje;
    expect(combo(s2)).toMatchObject({ basePriceRsd: 1150, priceCheck: null });
    bezPromene(zadrziCenuKomboa(s2, combo(s2).key), s2, null);
  });

  test("`Zadrži cenu` on an unflagged combo is a no-op; a plain article or an unknown id is refused", () => {
    const s0 = stanje("srednji");
    bezPromene(zadrziCenuKomboa(s0, combo(s0).key), s0, null);
    odbijeno(zadrziCenuKomboa(s0, kljucArtikla(s0, "Sarma")), s0, "article/not_combo");
    odbijeno(zadrziCenuKomboa(s0, "ar_missing"), s0, MENU_ERROR.notFound);
  });
});

describe("postaviCene (bulk) and Room service / combos", () => {
  test("raises the Room service warning for a manual-priced item and leaves its price", () => {
    const s0 = premiumVeliki();
    const club = kljucArtikla(s0, "Club sendvič");
    const burger = kljucArtikla(s0, "Klasični burger");
    const r = promena(
      postaviCene(
        s0,
        [
          { artikalId: club, ocekivana: 780, nova: 800 },
          { artikalId: burger, ocekivana: 890, nova: 900 },
        ],
        SADA,
      ),
      s0,
    );
    expect(r.vrednost).toEqual({ status: "promenjeno", broj: 2 });
    expect(rsStavka(r.stanje, "Club sendvič")).toMatchObject({ manualPriceRsd: 950, priceWarning: { oldBaseRsd: 780, newBaseRsd: 800, at: SADA } });
    expect(rsRed(r.stanje, "Club sendvič")).toMatchObject({ cena: 950, poreklo: "manual" });
    expect(rsRed(r.stanje, "Club sendvič").upozorenje).toMatchObject({ staraOsnovna: 780, novaOsnovna: 800, rsCena: 950, izracunata: 920 });
    // The item without a manual price has no warning and follows the new base.
    expect(rsStavka(r.stanje, "Klasični burger").priceWarning).toBeNull();
    expect(rsRed(r.stanje, "Klasični burger")).toMatchObject({ osnovna: 900, cena: 1035, poreklo: "computed" });
  });

  test("an unchanged price in the batch raises nothing", () => {
    const s0 = premiumVeliki();
    const club = kljucArtikla(s0, "Club sendvič");
    const r = promena(
      postaviCene(
        s0,
        [
          { artikalId: club, ocekivana: 780, nova: 780 },
          { artikalId: kljucArtikla(s0, "Klasični burger"), ocekivana: 890, nova: 900 },
        ],
        SADA,
      ),
      s0,
    );
    expect(r.vrednost).toEqual({ status: "promenjeno", broj: 1 });
    expect(rsStavka(r.stanje, "Club sendvič").priceWarning).toBeNull();
  });

  test("flags the combos of a changed component", () => {
    const s0 = stanje("srednji");
    const r = promena(postaviCene(s0, [{ artikalId: kljucArtikla(s0, "Kupus salata"), ocekivana: 260, nova: 300 }], SADA), s0);
    expect(artikal(r.stanje, "Ručak dana").priceCheck).toEqual({
      since: SADA,
      changedComponentKeys: [kljucArtikla(s0, "Kupus salata")],
      removedComponentNames: [],
    });
    expect(artikal(r.stanje, "Ručak dana").basePriceRsd).toBe(1150);
  });

  test("a combo whose own price is set in the batch loses the flag", () => {
    const s0 = stanje("srednji");
    const komboKljuc = kljucArtikla(s0, "Ručak dana");
    const r = promena(
      postaviCene(
        s0,
        [
          { artikalId: kljucArtikla(s0, "Kupus salata"), ocekivana: 260, nova: 300 },
          { artikalId: komboKljuc, ocekivana: 1150, nova: 1200 },
        ],
        SADA,
      ),
      s0,
    );
    expect(artikal(r.stanje, "Ručak dana")).toMatchObject({ basePriceRsd: 1200, priceCheck: null });
  });
});

// =============================================================================
// Combo components
// =============================================================================

describe("postaviSastav", () => {
  const lista = (s: MemorijaStanje, komboId: string) =>
    s.snapshot.comboComponents
      .filter((row) => row.comboKey === komboId)
      .sort((a, b) => a.order - b.order)
      .map((row) => ({ artikalId: row.componentKey, kolicina: row.quantity }));

  test("replaces the whole list and bumps the revision once", () => {
    const s0 = stanje("srednji");
    const kombo = kljucArtikla(s0, "Ručak dana");
    expect(lista(s0, kombo).map((c) => c.artikalId)).toEqual(
      ["Teleća čorba", "Punjene paprike", "Kupus salata"].map((n) => kljucArtikla(s0, n)),
    );
    const nova = [
      { artikalId: kljucArtikla(s0, "Sarma"), kolicina: 2 },
      { artikalId: kljucArtikla(s0, "Musaka"), kolicina: 1 },
    ];
    const s1 = promena(postaviSastav(s0, kombo, nova), s0).stanje;
    expect(lista(s1, kombo)).toEqual(nova);
    expect(artikal(s1, "Ručak dana").basePriceRsd).toBe(1150); // the manual price is untouched
  });

  test("does not touch the rows of other combos", () => {
    const s0 = stanje("srednji");
    const kombo = kljucArtikla(s0, "Ručak dana");
    const drugi = uspeh(noviKombo(s0, sekcija(s0, "Glavna jela").key, { naziv: "Drugi kombo", cena: 900, sastojci: [kljucArtikla(s0, "Gibanica")] }));
    const s1 = promena(postaviSastav(drugi.stanje, kombo, [{ artikalId: kljucArtikla(s0, "Sarma"), kolicina: 1 }]), drugi.stanje).stanje;
    expect(lista(s1, drugi.vrednost.id)).toEqual([{ artikalId: kljucArtikla(s0, "Gibanica"), kolicina: 1 }]);
  });

  test("the same list (articles, quantities, order) is a no-op", () => {
    const s0 = stanje("srednji");
    const kombo = kljucArtikla(s0, "Ručak dana");
    bezPromene(postaviSastav(s0, kombo, lista(s0, kombo)), s0, null);
    const s1 = uspeh(postaviSastav(s0, kombo, [{ artikalId: kljucArtikla(s0, "Sarma"), kolicina: 2 }])).stanje;
    bezPromene(postaviSastav(s1, kombo, lista(s1, kombo)), s1, null);
  });

  test("another order or quantity is a change", () => {
    const s0 = stanje("srednji");
    const kombo = kljucArtikla(s0, "Ručak dana");
    const obrnuto = lista(s0, kombo).reverse();
    const s1 = promena(postaviSastav(s0, kombo, obrnuto), s0).stanje;
    expect(lista(s1, kombo)).toEqual(obrnuto);
    const drugaKolicina = lista(s1, kombo).map((c, i) => (i === 0 ? { ...c, kolicina: 3 } : c));
    promena(postaviSastav(s1, kombo, drugaKolicina), s1);
  });

  test("works on Standard (combos are not a Premium feature)", () => {
    const s0 = stanje("srednji"); // premium: false
    const kombo = kljucArtikla(s0, "Ručak dana");
    promena(postaviSastav(s0, kombo, [{ artikalId: kljucArtikla(s0, "Sarma"), kolicina: 1 }]), s0);
  });

  test("an ordinary article is not a combo (article/not_combo)", () => {
    const s0 = stanje("srednji");
    odbijeno(postaviSastav(s0, kljucArtikla(s0, "Sarma"), [{ artikalId: kljucArtikla(s0, "Musaka"), kolicina: 1 }]), s0, "article/not_combo");
  });

  test("an unknown combo or component is not found", () => {
    const s0 = stanje("srednji");
    const kombo = kljucArtikla(s0, "Ručak dana");
    odbijeno(postaviSastav(s0, "ar_missing", [{ artikalId: kljucArtikla(s0, "Sarma"), kolicina: 1 }]), s0, MENU_ERROR.notFound);
    odbijeno(postaviSastav(s0, kombo, [{ artikalId: kljucArtikla(s0, "Sarma"), kolicina: 1 }, { artikalId: "ar_missing", kolicina: 1 }]), s0, MENU_ERROR.notFound);
  });

  test("a combo inside a combo, or the combo inside itself, is refused (article/combo_component_invalid)", () => {
    const s0 = stanje("srednji");
    const kombo = kljucArtikla(s0, "Ručak dana");
    const drugi = uspeh(noviKombo(s0, sekcija(s0, "Glavna jela").key, { naziv: "Drugi kombo", cena: 900, sastojci: [kljucArtikla(s0, "Gibanica")] }));
    odbijeno(postaviSastav(drugi.stanje, kombo, [{ artikalId: drugi.vrednost.id, kolicina: 1 }]), drugi.stanje, "article/combo_component_invalid");
    odbijeno(postaviSastav(s0, kombo, [{ artikalId: kombo, kolicina: 1 }]), s0, "article/combo_component_invalid");
  });

  test("an empty list, a repeated article, a quantity outside 1..20 or more than 20 components is refused", () => {
    const s0 = stanje("srednji");
    const kombo = kljucArtikla(s0, "Ručak dana");
    const sarma = kljucArtikla(s0, "Sarma");
    const KOD = "article/combo_component_invalid";
    odbijeno(postaviSastav(s0, kombo, []), s0, KOD);
    odbijeno(postaviSastav(s0, kombo, [{ artikalId: sarma, kolicina: 1 }, { artikalId: sarma, kolicina: 2 }]), s0, KOD);
    odbijeno(postaviSastav(s0, kombo, [{ artikalId: sarma, kolicina: 0 }]), s0, KOD);
    odbijeno(postaviSastav(s0, kombo, [{ artikalId: sarma, kolicina: 21 }]), s0, KOD);
    odbijeno(postaviSastav(s0, kombo, [{ artikalId: sarma, kolicina: 1.5 }]), s0, KOD);
    const dvadesetJedan = s0.snapshot.articles.filter((a) => a.kind === "item").slice(0, 21).map((a) => ({ artikalId: a.key, kolicina: 1 }));
    odbijeno(postaviSastav(s0, kombo, dvadesetJedan), s0, KOD);
  });

  test("the boundaries 20 components and quantity 20 are accepted", () => {
    const s0 = stanje("srednji");
    const kombo = kljucArtikla(s0, "Ručak dana");
    const dvadeset = s0.snapshot.articles.filter((a) => a.kind === "item").slice(0, 20).map((a) => ({ artikalId: a.key, kolicina: 20 }));
    const s1 = promena(postaviSastav(s0, kombo, dvadeset), s0).stanje;
    expect(lista(s1, kombo)).toEqual(dvadeset);
  });
});

// =============================================================================
// Translations
// =============================================================================

describe("prevedi (typed translation)", () => {
  const TELECA = "Teleća čorba";

  test("confirms the text at once, made from the current source, and bumps the revision once", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    const s1 = promena(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "Veal soup"), s0).stanje;
    expect(prevodi(s1, TELECA)).toEqual({ en: { status: "confirmed", name: "Veal soup", nameHash: sourceHash(TELECA) } });
    expect(confirmedTranslation(prevodi(s1, TELECA), "en", "name")).toBe("Veal soup");
    expect(fieldTranslation(TELECA, prevodi(s1, TELECA)?.en, "name").status).toBe("done");
    expect(prevodi(s0, TELECA)).toBeNull(); // the old state is not mutated
  });

  test("the description is a field of an article too; a source without one has nothing to translate", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    const s1 = promena(prevedi(s0, cilj(s0, "Sarma"), "en", "description", null, "Homemade sarma"), s0).stanje;
    expect(prevodi(s1, "Sarma")?.en.description).toBe("Homemade sarma");
    odbijeno(prevedi(s0, cilj(s0, TELECA), "en", "description", null, "Rich"), s0, "translation/nothing_to_translate");
  });

  test("clearing the text (null) with the last seen text removes the translation", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    const s1 = uspeh(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "Veal soup")).stanje;
    const s2 = promena(prevedi(s1, cilj(s1, TELECA), "en", "name", "Veal soup", null), s1).stanje;
    expect(prevodi(s2, TELECA)).toBeNull();
  });

  test("compare-and-set on the confirmed text last seen", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    const s1 = uspeh(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "Veal soup")).stanje;
    konfliktBezPromene(prevedi(s1, cilj(s1, TELECA), "en", "name", null, "Calf soup"), s1, "Veal soup", "Calf soup");
    konfliktBezPromene(prevedi(s0, cilj(s0, TELECA), "en", "name", "Something else", "Calf soup"), s0, null, "Calf soup");
    const s2 = promena(prevedi(s1, cilj(s1, TELECA), "en", "name", "Veal soup", "Calf soup"), s1).stanje;
    expect(prevodi(s2, TELECA)?.en.name).toBe("Calf soup");
  });

  test("the same text again is a no-op", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    const s1 = uspeh(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "Veal soup")).stanje;
    bezPromene(prevedi(s1, cilj(s1, TELECA), "en", "name", "Veal soup", "Veal soup"), s1, null);
    bezPromene(prevedi(s0, cilj(s0, TELECA), "en", "name", null, null), s0, null);
  });

  test("a language that is not in Settings is refused (translation/language_off); so is the source language", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    odbijeno(prevedi(s0, cilj(s0, TELECA), "de", "name", null, "Kalbssuppe"), s0, "translation/language_off");
    odbijeno(prevedi(s0, cilj(s0, TELECA), "sr", "name", null, "Teleća čorba"), s0, "translation/language_off");
    const bezJezika = stanje("srednji"); // languages never set
    expect(bezJezika.snapshot.settings.languages).toBeNull();
    odbijeno(prevedi(bezJezika, cilj(bezJezika, TELECA), "en", "name", null, "Veal soup"), bezJezika, "translation/language_off");
  });

  test("Standard publishes only the first translation language: the second is plan/language_limit", () => {
    const s0 = stanje("srednji", {}, ["en", "de"]);
    promena(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "Veal soup"), s0);
    odbijeno(prevedi(s0, cilj(s0, TELECA), "de", "name", null, "Kalbssuppe"), s0, "plan/language_limit");
  });

  test("Premium takes the second language", () => {
    const s0 = stanje("srednji", { premium: true }, ["en", "de"]);
    const s1 = promena(prevedi(s0, cilj(s0, TELECA), "de", "name", null, "Kalbssuppe"), s0).stanje;
    expect(confirmedTranslation(prevodi(s1, TELECA), "de", "name")).toBe("Kalbssuppe");
  });

  test("a field that the kind does not have is invalid input", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    odbijeno(prevedi(s0, cilj(s0, TELECA), "en", "publicTitle", null, "Soup"), s0, MENU_ERROR.invalidInput);
    const stranica = s0.snapshot.pages.find((p) => p.name === "Vinska karta")!;
    odbijeno(prevedi(s0, { vrsta: "page", id: stranica.key }, "en", "name", null, "Wine list"), s0, MENU_ERROR.invalidInput);
    const varijanta = s0.snapshot.variants[0];
    odbijeno(prevedi(s0, { vrsta: "variant", id: varijanta.key }, "en", "description", null, "x"), s0, MENU_ERROR.invalidInput);
  });

  test("an unknown thing is not found", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    odbijeno(prevedi(s0, { vrsta: "article", id: "ar_missing" }, "en", "name", null, "x"), s0, MENU_ERROR.notFound);
  });

  test("an empty source has nothing to translate", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    const glavna = s0.snapshot.pages.find((p) => p.isDefault)!;
    odbijeno(prevedi(s0, { vrsta: "page", id: glavna.key }, "en", "publicTitle", null, "Menu"), s0, "translation/nothing_to_translate");
  });

  test("a translation longer than the source field may be is refused; exactly the limit is accepted", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    odbijeno(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "x".repeat(121)), s0, MENU_ERROR.invalidInput);
    promena(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "x".repeat(120)), s0);
  });

  test("works for a page title, a variant, a section and a Room service category", () => {
    const s0 = stanje("veliki", { premium: true }); // languages: sr -> en
    const stranica = s0.snapshot.pages.find((p) => p.name === "Bar")!;
    const s1 = promena(prevedi(s0, { vrsta: "page", id: stranica.key }, "en", "publicTitle", null, "Bar"), s0).stanje;
    expect(s1.snapshot.pages.find((p) => p.key === stranica.key)?.translations?.en.publicTitle).toBe("Bar");

    const varijanta = s1.snapshot.variants[0];
    const s2 = promena(prevedi(s1, { vrsta: "variant", id: varijanta.key }, "en", "name", null, "Five pieces"), s1).stanje;
    expect(s2.snapshot.variants.find((v) => v.key === varijanta.key)?.translations?.en.name).toBe("Five pieces");

    const odeljak = s2.snapshot.sections[0];
    const s3 = promena(prevedi(s2, { vrsta: "section", id: odeljak.key }, "en", "name", null, "Eggs"), s2).stanje;
    expect(s3.snapshot.sections.find((sec) => sec.key === odeljak.key)?.translations?.en.name).toBe("Eggs");

    const kategorija = s3.snapshot.roomService.categories[0];
    const s4 = promena(prevedi(s3, { vrsta: "roomServiceCategory", id: kategorija.key }, "en", "name", null, "Breakfast in the room"), s3).stanje;
    expect(s4.snapshot.roomService.categories[0].translations?.en.name).toBe("Breakfast in the room");
  });

  test("translations of other languages and fields are kept", () => {
    const s0 = stanje("srednji", { premium: true }, ["en", "de"]);
    const s1 = uspeh(prevedi(s0, cilj(s0, "Sarma"), "en", "name", null, "Sarma")).stanje;
    const s2 = uspeh(prevedi(s1, cilj(s1, "Sarma"), "de", "name", null, "Sarma (DE)")).stanje;
    const s3 = uspeh(prevedi(s2, cilj(s2, "Sarma"), "en", "description", null, "Homemade")).stanje;
    const t = prevodi(s3, "Sarma") as MenuTranslations;
    expect(t.en).toMatchObject({ name: "Sarma", description: "Homemade" });
    expect(t.de).toMatchObject({ name: "Sarma (DE)" });
  });
});

describe("predloziPrevod (AI suggestion)", () => {
  const TELECA = "Teleća čorba";
  const premiumEn = () => stanje("srednji", { premium: true }, ["en"]);

  test("stores a suggestion WITHOUT changing the confirmed text (nothing is published)", () => {
    const s0 = premiumEn();
    const { stanje: s1, vrednost } = promena(predloziPrevod(s0, cilj(s0, TELECA), "en", { name: "Veal soup" }, true, SADA), s0);
    expect(vrednost).toEqual({ polja: 1 });
    const t = prevodi(s1, TELECA);
    expect(t?.en.status).toBe("suggested");
    expect(t?.en.suggestion).toEqual({ name: "Veal soup", nameHash: sourceHash(TELECA), at: SADA });
    expect(confirmedTranslation(t, "en", "name")).toBeNull();
    expect(fieldTranslation(TELECA, t?.en, "name")).toEqual({ status: "suggested", confirmed: null, suggestion: "Veal soup" });
  });

  test("next to a confirmed text the confirmed text stays as it was", () => {
    const s0 = premiumEn();
    const s1 = uspeh(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "Veal soup")).stanje;
    const s2 = promena(predloziPrevod(s1, cilj(s1, TELECA), "en", { name: "Calf broth" }, true, SADA), s1).stanje;
    expect(confirmedTranslation(prevodi(s2, TELECA), "en", "name")).toBe(confirmedTranslation(prevodi(s1, TELECA), "en", "name"));
    expect(confirmedTranslation(prevodi(s2, TELECA), "en", "name")).toBe("Veal soup");
    expect(prevodi(s2, TELECA)?.en.suggestion?.name).toBe("Calf broth");
    expect(prevodi(s2, TELECA)?.en.status).toBe("confirmed");
  });

  test("counts only the fields that have both a source and a suggested text", () => {
    const s0 = premiumEn();
    expect(promena(predloziPrevod(s0, cilj(s0, TELECA), "en", { name: "Veal soup", description: "Invented" }, true, SADA), s0).vrednost).toEqual({
      polja: 1,
    }); // Teleća čorba has no description
    expect(promena(predloziPrevod(s0, cilj(s0, "Sarma"), "en", { name: "Sarma", description: "Homemade" }, true, SADA), s0).vrednost).toEqual({
      polja: 2,
    });
  });

  test("is refused on Standard (plan/premium_required), also without AI", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    odbijeno(predloziPrevod(s0, cilj(s0, TELECA), "en", { name: "Veal soup" }, true, SADA), s0, PREMIUM_REQUIRED);
    odbijeno(predloziPrevod(s0, cilj(s0, TELECA), "en", { name: "Veal soup" }, false, SADA), s0, PREMIUM_REQUIRED);
  });

  test("is refused without AI (translation/ai_disabled)", () => {
    const s0 = premiumEn();
    odbijeno(predloziPrevod(s0, cilj(s0, TELECA), "en", { name: "Veal soup" }, false, SADA), s0, "translation/ai_disabled");
  });

  test("nothing to translate, a language outside Settings and an unknown thing are refused", () => {
    const s0 = premiumEn();
    odbijeno(predloziPrevod(s0, cilj(s0, TELECA), "en", {}, true, SADA), s0, "translation/nothing_to_translate");
    odbijeno(predloziPrevod(s0, cilj(s0, TELECA), "en", { description: "Only a description" }, true, SADA), s0, "translation/nothing_to_translate");
    odbijeno(predloziPrevod(s0, cilj(s0, TELECA), "de", { name: "Kalbssuppe" }, true, SADA), s0, "translation/language_off");
    odbijeno(predloziPrevod(s0, { vrsta: "article", id: "ar_missing" }, "en", { name: "x" }, true, SADA), s0, MENU_ERROR.notFound);
  });

  test("the same suggestion again is a no-op", () => {
    const s0 = premiumEn();
    const s1 = uspeh(predloziPrevod(s0, cilj(s0, TELECA), "en", { name: "Veal soup" }, true, SADA)).stanje;
    bezPromene(predloziPrevod(s1, cilj(s1, TELECA), "en", { name: "Veal soup" }, true, SADA), s1, { polja: 1 });
  });
});

describe("potvrdiPredlog, odbaciPredlog, prevodJeDobar", () => {
  const TELECA = "Teleća čorba";
  const sPredlogom = () => {
    const s0 = stanje("srednji", { premium: true }, ["en"]);
    return uspeh(predloziPrevod(s0, cilj(s0, "Sarma"), "en", { name: "Sarma (stuffed cabbage)", description: "Homemade sarma" }, true, SADA)).stanje;
  };

  test("potvrdiPredlog publishes the suggested text: it becomes the confirmed translation, the suggestion is gone", () => {
    const s0 = sPredlogom();
    expect(confirmedTranslation(prevodi(s0, "Sarma"), "en", "name")).toBeNull();
    const s1 = promena(potvrdiPredlog(s0, cilj(s0, "Sarma"), "en"), s0).stanje;
    const t = prevodi(s1, "Sarma");
    expect(t?.en.status).toBe("confirmed");
    expect(t?.en.suggestion).toBeUndefined();
    expect(confirmedTranslation(t, "en", "name")).toBe("Sarma (stuffed cabbage)");
    expect(confirmedTranslation(t, "en", "description")).toBe("Homemade sarma");
    expect(fieldTranslation("Sarma", t?.en, "name").status).toBe("done");
  });

  test("potvrdiPredlog with an edited field takes the owner's text for that field", () => {
    const s0 = sPredlogom();
    const s1 = promena(potvrdiPredlog(s0, cilj(s0, "Sarma"), "en", { name: "Stuffed cabbage rolls" }), s0).stanje;
    expect(confirmedTranslation(prevodi(s1, "Sarma"), "en", "name")).toBe("Stuffed cabbage rolls");
    expect(confirmedTranslation(prevodi(s1, "Sarma"), "en", "description")).toBe("Homemade sarma");
  });

  test("potvrdiPredlog without a suggestion is a no-op; an unknown thing or a language outside Settings is refused", () => {
    const s0 = stanje("srednji", { premium: true }, ["en"]);
    bezPromene(potvrdiPredlog(s0, cilj(s0, TELECA), "en"), s0, null);
    odbijeno(potvrdiPredlog(s0, { vrsta: "article", id: "ar_missing" }, "en"), s0, MENU_ERROR.notFound);
    odbijeno(potvrdiPredlog(s0, cilj(s0, TELECA), "de"), s0, "translation/language_off");
  });

  test("odbaciPredlog drops the suggestion and keeps the confirmed text", () => {
    const s0 = stanje("srednji", { premium: true }, ["en"]);
    const s1 = uspeh(prevedi(s0, cilj(s0, "Sarma"), "en", "name", null, "Sarma")).stanje;
    const s2 = uspeh(predloziPrevod(s1, cilj(s1, "Sarma"), "en", { name: "Stuffed cabbage" }, true, SADA)).stanje;
    const s3 = promena(odbaciPredlog(s2, cilj(s2, "Sarma"), "en"), s2).stanje;
    expect(prevodi(s3, "Sarma")).toEqual({ en: { status: "confirmed", name: "Sarma", nameHash: sourceHash("Sarma") } });
  });

  test("odbaciPredlog on a suggestion-only entry leaves no translation at all", () => {
    const s0 = sPredlogom();
    const s1 = promena(odbaciPredlog(s0, cilj(s0, "Sarma"), "en"), s0).stanje;
    expect(prevodi(s1, "Sarma")).toBeNull();
  });

  test("odbaciPredlog without a suggestion is a no-op; an unknown thing is refused", () => {
    const s0 = stanje("srednji", { premium: true }, ["en"]);
    bezPromene(odbaciPredlog(s0, cilj(s0, TELECA), "en"), s0, null);
    odbijeno(odbaciPredlog(s0, { vrsta: "article", id: "ar_missing" }, "en"), s0, MENU_ERROR.notFound);
  });

  test("prevodJeDobar turns a stale translation into a done one", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    const s1 = uspeh(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "Veal soup")).stanje;
    const s2 = preimenovan(s1, TELECA, "Teleća čorba sa knedlama");
    expect(entityTranslationStatus({ name: "Teleća čorba sa knedlama" }, prevodi(s2, "Teleća čorba sa knedlama"), "en")).toBe("stale");
    const s3 = promena(prevodJeDobar(s2, cilj(s2, "Teleća čorba sa knedlama"), "en"), s2).stanje;
    const t = prevodi(s3, "Teleća čorba sa knedlama");
    expect(entityTranslationStatus({ name: "Teleća čorba sa knedlama" }, t, "en")).toBe("done");
    expect(t?.en.name).toBe("Veal soup");
    expect(t?.en.nameHash).toBe(sourceHash("Teleća čorba sa knedlama"));
  });

  test("prevodJeDobar on a translation that is not stale, or has none, is a no-op; a language outside Settings is refused", () => {
    const s0 = stanje("srednji", {}, ["en"]);
    bezPromene(prevodJeDobar(s0, cilj(s0, TELECA), "en"), s0, null);
    const s1 = uspeh(prevedi(s0, cilj(s0, TELECA), "en", "name", null, "Veal soup")).stanje;
    bezPromene(prevodJeDobar(s1, cilj(s1, TELECA), "en"), s1, null);
    odbijeno(prevodJeDobar(s1, cilj(s1, TELECA), "de"), s1, "translation/language_off");
    odbijeno(prevodJeDobar(s1, { vrsta: "article", id: "ar_missing" }, "en"), s1, MENU_ERROR.notFound);
  });

  // Parity with the server (convex/menuTranslations.ts confirmSuggestion): an edited
  // field the kind does not have, or an edited text above the field limit, is
  // menu/invalid_input (found by this test, fixed in K16).
  test("potvrdiPredlog refuses an edited field the kind does not have (parity with the server)", () => {
    const s0 = stanje("srednji", { premium: true }, ["en"]);
    const varijanta = s0.snapshot.variants[0];
    const c: StudioPrevodCilj = { vrsta: "variant", id: varijanta.key };
    const s1 = uspeh(predloziPrevod(s0, c, "en", { name: "Small" }, true, SADA)).stanje;
    odbijeno(potvrdiPredlog(s1, c, "en", { description: "A variant has no description" }), s1, MENU_ERROR.invalidInput);
  });

  test("potvrdiPredlog refuses an edited text above the field limit (parity with the server)", () => {
    const s0 = stanje("srednji", { premium: true }, ["en"]);
    const c = cilj(s0, "Sarma");
    const s1 = uspeh(predloziPrevod(s0, c, "en", { name: "Sarma" }, true, SADA)).stanje;
    odbijeno(potvrdiPredlog(s1, c, "en", { name: "x".repeat(121) }), s1, MENU_ERROR.invalidInput);
  });
});

describe("an AI suggestion is never published without confirmation (izlog memory)", () => {
  test("suggested -> still the source text; confirmed -> the translation", () => {
    const s0 = stanje("srednji", { premium: true }, ["en"]);
    const c = cilj(s0, "Gibanica");
    const s1 = uspeh(predloziPrevod(s0, c, "en", { name: "Gibanica (cheese pie)" }, true, SADA)).stanje;
    expect(confirmedTranslation(prevodi(s1, "Gibanica"), "en", "name")).toBeNull();
    const s2 = uspeh(potvrdiPredlog(s1, c, "en")).stanje;
    expect(confirmedTranslation(prevodi(s2, "Gibanica"), "en", "name")).toBe("Gibanica (cheese pie)");
  });

  test("a rejected suggestion never becomes confirmed", () => {
    const s0 = stanje("srednji", { premium: true }, ["en"]);
    const c = cilj(s0, "Gibanica");
    const s1 = uspeh(predloziPrevod(s0, c, "en", { name: "Gibanica (cheese pie)" }, true, SADA)).stanje;
    const s2 = uspeh(odbaciPredlog(s1, c, "en")).stanje;
    expect(confirmedTranslation(prevodi(s2, "Gibanica"), "en", "name")).toBeNull();
  });
});
