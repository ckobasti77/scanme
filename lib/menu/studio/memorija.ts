// ScanMe Menu V1 — the editor's actions on an in-memory menu (K10). The izlog
// (/dev/menu-editor-preview) runs the REAL editor on fixture data without a
// backend; these pure functions give it the same rules the Convex mutations
// enforce (shared base price, CAS on the value last seen, a page with a QR
// card cannot be deleted or archived, re-use before duplicating), and the
// publish preview runs the real checks (lib/menu/publish-checks.ts) and the
// real summary (lib/menu/publish-summary.ts) on the snapshot.
//
// Every function returns the next state and the outcome; the state is never
// mutated in place.

import { fmt } from "../../i18n/format";
import { menuDomenSr } from "../../i18n/sr/menu-domen";
import type { CasValue } from "../cas";
import { MENU_ERROR } from "../errors/core";
import { nextComboPriceCheck } from "../combo";
import { bulkDeletionConfirmToken, type ArticleDeletionImpact } from "../deletion";
import { MENU_MAX_BULK_BATCH, MENU_TEXT } from "../limits";
import { orderAfter, renumberedOrders } from "../order";
import { checkPublication } from "../publish-checks";
import { summarizePublication } from "../publish-summary";
import { isValidRsd } from "../rsd";
import { uniquePageSlug } from "../slugs";
import type { MenuDraftSnapshot, SnapshotArticle, SnapshotPlacement } from "../snapshot";
import { normalizeArticleName, requiredText } from "../text";
import type {
  BrziUnosRezultat,
  StudioIshod,
  StudioKandidat,
  StudioObjavaRezultat,
  StudioBrisanjeRezultat,
  StudioCeneRezultat,
  StudioPregledObjave,
  StudioPromenaCene,
  StudioSekcijaStranice,
  StudioUticajArtikla,
  StudioUticajBrisanja,
  TabelaRezultat,
  TabelaUnosRed,
} from "./model";
import { prikazId } from "./iz-snapshota";

export type MemorijaStanje = {
  snapshot: MenuDraftSnapshot;
  /** The published snapshot (null = never published). */
  objavljeno: MenuDraftSnapshot | null;
  objavljenaVerzija: number | null;
  objavljenoU: number | null;
  revizija: number;
  objavljenaRevizija: number | null;
  /** Article keys "Privremeno nedostupno" (live). */
  nedostupni: ReadonlySet<string>;
  /** Page keys an active QR card points at. */
  qrStranice: ReadonlySet<string>;
  /** Counter for new keys (deterministic). */
  brojac: number;
  /** Room service available and switched on (publish context). */
  roomService: boolean;
  premium: boolean;
};

export type MemorijaKorak<T = null> = { stanje: MemorijaStanje; ishod: StudioIshod<T> };

const OK = { ok: true as const, vrednost: null };

function greska<T>(stanje: MemorijaStanje, kod: string): MemorijaKorak<T> {
  return { stanje, ishod: { ok: false, vrsta: "greska", kod, ponovljivo: false } };
}

function konflikt<T>(stanje: MemorijaStanje, sacuvano: CasValue, pokusano: CasValue): MemorijaKorak<T> {
  return { stanje, ishod: { ok: false, vrsta: "konflikt", sacuvano, pokusano } };
}

function kljuc(stanje: MemorijaStanje, prefiks: string): [string, number] {
  const broj = stanje.brojac + 1;
  return [`${prefiks}_mem${String(broj).padStart(4, "0")}`, broj];
}

/** A changed draft: bumps the revision (what `touchDraft` does on the server). */
function nacrt(stanje: MemorijaStanje, snapshot: MenuDraftSnapshot, brojac = stanje.brojac): MemorijaStanje {
  return { ...stanje, snapshot, brojac, revizija: stanje.revizija + 1 };
}

export function pocetnoStanje(
  snapshot: MenuDraftSnapshot,
  opcije: {
    nedostupni?: readonly string[];
    qrStranice?: readonly string[];
    objavljeno?: { verzija: number; u: number } | null;
    roomService?: boolean;
    premium?: boolean;
  } = {},
): MemorijaStanje {
  const objavljeno = opcije.objavljeno ?? null;
  return {
    snapshot,
    objavljeno: objavljeno ? snapshot : null,
    objavljenaVerzija: objavljeno?.verzija ?? null,
    objavljenoU: objavljeno?.u ?? null,
    revizija: 1,
    objavljenaRevizija: objavljeno ? 1 : null,
    nedostupni: new Set(opcije.nedostupni ?? []),
    qrStranice: new Set(opcije.qrStranice ?? []),
    brojac: 0,
    roomService: opcije.roomService ?? false,
    premium: opcije.premium ?? false,
  };
}

export function stanjeNacrta(stanje: MemorijaStanje): "never_published" | "clean" | "dirty" {
  if (stanje.objavljenaRevizija === null) return "never_published";
  return stanje.objavljenaRevizija === stanje.revizija ? "clean" : "dirty";
}

// -----------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------

export function dodajStranicu(stanje: MemorijaStanje, naziv: string): MemorijaKorak<{ id: string }> {
  const ime = requiredText(naziv, MENU_TEXT.pageName);
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  const { snapshot } = stanje;
  const [key, brojac] = kljuc(stanje, "pg");
  const slug = uniquePageSlug(ime, new Set(snapshot.pages.map((page) => page.slug)));
  const poslednji = snapshot.pages.reduce<number | null>((max, page) => (max === null || page.order > max ? page.order : max), null);
  const page = {
    key,
    slug,
    name: ime,
    publicTitle: null,
    isDefault: false,
    order: orderAfter(poslednji),
    visibility: "visible" as const,
    archivedAt: null,
    iconKey: null,
    navigation: "standalone" as const,
    translations: null,
  };
  return { stanje: nacrt(stanje, { ...snapshot, pages: [...snapshot.pages, page] }, brojac), ishod: { ok: true, vrednost: { id: key } } };
}

export function preimenujStranicu(stanje: MemorijaStanje, id: string, naziv: string, ocekivano: string): MemorijaKorak {
  const page = stanje.snapshot.pages.find((candidate) => candidate.key === id);
  if (!page) return greska(stanje, MENU_ERROR.notFound);
  const ime = requiredText(naziv, MENU_TEXT.pageName);
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  if (page.name !== ocekivano) return konflikt(stanje, page.name, ime);
  if (page.name === ime) return { stanje, ishod: OK };
  const pages = stanje.snapshot.pages.map((candidate) => (candidate.key === id ? { ...candidate, name: ime } : candidate));
  return { stanje: nacrt(stanje, { ...stanje.snapshot, pages }), ishod: OK };
}

export function duplirajStranicu(stanje: MemorijaStanje, id: string): MemorijaKorak<{ id: string }> {
  const { snapshot } = stanje;
  const izvor = snapshot.pages.find((candidate) => candidate.key === id);
  if (!izvor) return greska(stanje, MENU_ERROR.notFound);
  let brojac = stanje.brojac;
  const novi = (prefiks: string) => {
    brojac += 1;
    return `${prefiks}_mem${String(brojac).padStart(4, "0")}`;
  };
  const key = novi("pg");
  const name = fmt(menuDomenSr.pageCopyName, { name: izvor.name }).slice(0, MENU_TEXT.pageName);
  const slug = uniquePageSlug(name, new Set(snapshot.pages.map((page) => page.slug)));
  const poslednji = Math.max(...snapshot.pages.map((page) => page.order));
  const page = { ...izvor, key, slug, name, isDefault: false, order: orderAfter(poslednji), archivedAt: null };
  const mapa = new Map<string, string>();
  const sections = snapshot.sections
    .filter((section) => section.pageKey === id)
    .map((section) => {
      const novaSekcija = novi("sc");
      mapa.set(section.key, novaSekcija);
      return { ...section, key: novaSekcija, pageKey: key };
    });
  const placements = snapshot.placements
    .filter((placement) => placement.pageKey === id)
    .map((placement) => ({ ...placement, pageKey: key, sectionKey: mapa.get(placement.sectionKey) ?? placement.sectionKey }));
  return {
    stanje: nacrt(
      stanje,
      {
        ...snapshot,
        pages: [...snapshot.pages, page],
        sections: [...snapshot.sections, ...sections],
        placements: [...snapshot.placements, ...placements],
      },
      brojac,
    ),
    ishod: { ok: true, vrednost: { id: key } },
  };
}

export function premestiStranicu(stanje: MemorijaStanje, id: string, naIndeks: number): MemorijaKorak {
  const pages = stanje.snapshot.pages.slice().sort((a, b) => a.order - b.order);
  const od = pages.findIndex((page) => page.key === id);
  if (od === -1) return greska(stanje, MENU_ERROR.notFound);
  const cilj = Math.max(0, Math.min(pages.length - 1, naIndeks));
  if (cilj === od) return { stanje, ishod: OK };
  const [stranica] = pages.splice(od, 1);
  pages.splice(cilj, 0, stranica);
  const redosled = renumberedOrders(pages.length);
  const sledece = pages.map((page, index) => ({ ...page, order: redosled[index] }));
  return { stanje: nacrt(stanje, { ...stanje.snapshot, pages: sledece }), ishod: OK };
}

function zivihOsim(stanje: MemorijaStanje, id: string): number {
  return stanje.snapshot.pages.filter((page) => page.key !== id && page.archivedAt === null).length;
}

function predajPodrazumevanu(pages: MenuDraftSnapshot["pages"], id: string): MenuDraftSnapshot["pages"] {
  const odlazi = pages.find((page) => page.key === id);
  if (!odlazi?.isDefault) return pages;
  const sledeca = pages
    .filter((page) => page.key !== id && page.archivedAt === null)
    .sort((a, b) => a.order - b.order)[0];
  return pages.map((page) =>
    page.key === id ? { ...page, isDefault: false } : sledeca && page.key === sledeca.key ? { ...page, isDefault: true } : page,
  );
}

export function arhivirajStranicu(stanje: MemorijaStanje, id: string, sada: number): MemorijaKorak {
  const page = stanje.snapshot.pages.find((candidate) => candidate.key === id);
  if (!page) return greska(stanje, MENU_ERROR.notFound);
  if (page.archivedAt !== null) return { stanje, ishod: OK };
  if (stanje.qrStranice.has(id)) return greska(stanje, MENU_ERROR.pageHasQr);
  if (zivihOsim(stanje, id) === 0) return greska(stanje, MENU_ERROR.lastPage);
  const pages = predajPodrazumevanu(stanje.snapshot.pages, id).map((candidate) =>
    candidate.key === id ? { ...candidate, archivedAt: sada } : candidate,
  );
  return { stanje: nacrt(stanje, { ...stanje.snapshot, pages }), ishod: OK };
}

export function vratiStranicu(stanje: MemorijaStanje, id: string): MemorijaKorak {
  const page = stanje.snapshot.pages.find((candidate) => candidate.key === id);
  if (!page) return greska(stanje, MENU_ERROR.notFound);
  if (page.archivedAt === null) return { stanje, ishod: OK };
  const pages = stanje.snapshot.pages.map((candidate) => (candidate.key === id ? { ...candidate, archivedAt: null } : candidate));
  return { stanje: nacrt(stanje, { ...stanje.snapshot, pages }), ishod: OK };
}

export function obrisiStranicu(stanje: MemorijaStanje, id: string): MemorijaKorak {
  const page = stanje.snapshot.pages.find((candidate) => candidate.key === id);
  if (!page) return greska(stanje, MENU_ERROR.notFound);
  if (stanje.qrStranice.has(id)) return greska(stanje, MENU_ERROR.pageHasQr);
  if (page.archivedAt === null && zivihOsim(stanje, id) === 0) return greska(stanje, MENU_ERROR.lastPage);
  const { snapshot } = stanje;
  return {
    stanje: nacrt(stanje, {
      ...snapshot,
      pages: predajPodrazumevanu(snapshot.pages, id).filter((candidate) => candidate.key !== id),
      sections: snapshot.sections.filter((section) => section.pageKey !== id),
      placements: snapshot.placements.filter((placement) => placement.pageKey !== id),
    }),
    ishod: OK,
  };
}

// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------

export function dodajSekciju(stanje: MemorijaStanje, stranicaId: string, naziv: string): MemorijaKorak<{ id: string }> {
  const page = stanje.snapshot.pages.find((candidate) => candidate.key === stranicaId);
  if (!page) return greska(stanje, MENU_ERROR.notFound);
  if (page.archivedAt !== null) return greska(stanje, MENU_ERROR.pageArchived);
  const ime = requiredText(naziv, MENU_TEXT.sectionName);
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  const [key, brojac] = kljuc(stanje, "sc");
  const poslednji = stanje.snapshot.sections
    .filter((section) => section.pageKey === stranicaId)
    .reduce<number | null>((max, section) => (max === null || section.order > max ? section.order : max), null);
  const section = {
    key,
    pageKey: stranicaId,
    name: ime,
    description: null,
    iconKey: null,
    order: orderAfter(poslednji),
    visibility: "visible" as const,
    translations: null,
  };
  return {
    stanje: nacrt(stanje, { ...stanje.snapshot, sections: [...stanje.snapshot.sections, section] }, brojac),
    ishod: { ok: true, vrednost: { id: key } },
  };
}

export function preimenujSekciju(stanje: MemorijaStanje, id: string, naziv: string, ocekivano: string): MemorijaKorak {
  const section = stanje.snapshot.sections.find((candidate) => candidate.key === id);
  if (!section) return greska(stanje, MENU_ERROR.notFound);
  const ime = requiredText(naziv, MENU_TEXT.sectionName);
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  if (section.name !== ocekivano) return konflikt(stanje, section.name, ime);
  if (section.name === ime) return { stanje, ishod: OK };
  const sections = stanje.snapshot.sections.map((candidate) => (candidate.key === id ? { ...candidate, name: ime } : candidate));
  return { stanje: nacrt(stanje, { ...stanje.snapshot, sections }), ishod: OK };
}

export function obrisiSekciju(stanje: MemorijaStanje, id: string): MemorijaKorak {
  if (!stanje.snapshot.sections.some((section) => section.key === id)) return greska(stanje, MENU_ERROR.notFound);
  const { snapshot } = stanje;
  return {
    stanje: nacrt(stanje, {
      ...snapshot,
      sections: snapshot.sections.filter((section) => section.key !== id),
      placements: snapshot.placements.filter((placement) => placement.sectionKey !== id),
    }),
    ishod: OK,
  };
}

// -----------------------------------------------------------------------------
// Articles
// -----------------------------------------------------------------------------

function slicni(snapshot: MenuDraftSnapshot, naziv: string): StudioKandidat[] {
  const normalizovano = normalizeArticleName(naziv);
  if (normalizovano === "") return [];
  return snapshot.articles
    .filter((article) => normalizeArticleName(article.name) === normalizovano)
    .slice(0, 5)
    .map((article) => ({ artikalId: article.key, naziv: article.name, cena: article.basePriceRsd }));
}

function noviArtikal(key: string, naziv: string, cena: number | null, vrsta: "item" | "combo" = "item"): SnapshotArticle {
  return {
    key,
    kind: vrsta,
    name: naziv,
    description: null,
    quantityValue: null,
    quantityUnit: null,
    basePriceRsd: cena,
    mediaMode: "none",
    imageMediaId: null,
    iconKey: null,
    variantsEnabled: false,
    addonsEnabled: false,
    noteEnabled: false,
    allergens: null,
    tags: null,
    promo: null,
    priceCheck: null,
    translations: null,
  };
}

function prikaz(snapshot: MenuDraftSnapshot, sekcijaKey: string, artikalKey: string): SnapshotPlacement | null {
  const section = snapshot.sections.find((candidate) => candidate.key === sekcijaKey);
  if (!section) return null;
  const poslednji = snapshot.placements
    .filter((placement) => placement.sectionKey === sekcijaKey)
    .reduce<number | null>((max, placement) => (max === null || placement.order > max ? placement.order : max), null);
  return { pageKey: section.pageKey, sectionKey: sekcijaKey, articleKey: artikalKey, order: orderAfter(poslednji), visibility: "visible" };
}

function aktivnaSekcija(stanje: MemorijaStanje, sekcijaId: string): string | null {
  const section = stanje.snapshot.sections.find((candidate) => candidate.key === sekcijaId);
  if (!section) return MENU_ERROR.notFound;
  const page = stanje.snapshot.pages.find((candidate) => candidate.key === section.pageKey);
  if (!page) return MENU_ERROR.notFound;
  if (page.archivedAt !== null) return MENU_ERROR.pageArchived;
  return null;
}

export function brziUnos(
  stanje: MemorijaStanje,
  sekcijaId: string,
  unos: { naziv: string; cena: number | null },
  dozvoliDuplikat: boolean,
): MemorijaKorak<BrziUnosRezultat> {
  const problem = aktivnaSekcija(stanje, sekcijaId);
  if (problem) return greska(stanje, problem);
  const naziv = requiredText(unos.naziv, MENU_TEXT.articleName);
  if (naziv === null || (unos.cena !== null && !isValidRsd(unos.cena))) return greska(stanje, MENU_ERROR.invalidInput);
  if (!dozvoliDuplikat) {
    const kandidati = slicni(stanje.snapshot, naziv);
    if (kandidati.length > 0) return { stanje, ishod: { ok: true, vrednost: { status: "slicno", kandidati } } };
  }
  const [key, brojac] = kljuc(stanje, "ar");
  const placement = prikaz(stanje.snapshot, sekcijaId, key)!;
  const snapshot = {
    ...stanje.snapshot,
    articles: [...stanje.snapshot.articles, noviArtikal(key, naziv, unos.cena)],
    placements: [...stanje.snapshot.placements, placement],
  };
  return {
    stanje: nacrt(stanje, snapshot, brojac),
    ishod: { ok: true, vrednost: { status: "dodato", artikalId: key, prikazId: prikazId(sekcijaId, key) } },
  };
}

export function dodajPostojeci(stanje: MemorijaStanje, sekcijaId: string, artikalId: string): MemorijaKorak {
  const problem = aktivnaSekcija(stanje, sekcijaId);
  if (problem) return greska(stanje, problem);
  if (!stanje.snapshot.articles.some((article) => article.key === artikalId)) return greska(stanje, MENU_ERROR.notFound);
  if (stanje.snapshot.placements.some((placement) => placement.sectionKey === sekcijaId && placement.articleKey === artikalId)) {
    return greska(stanje, MENU_ERROR.placementExists);
  }
  const placement = prikaz(stanje.snapshot, sekcijaId, artikalId)!;
  return { stanje: nacrt(stanje, { ...stanje.snapshot, placements: [...stanje.snapshot.placements, placement] }), ishod: OK };
}

export function brziUnosVise(
  stanje: MemorijaStanje,
  stranicaId: string,
  redovi: readonly TabelaUnosRed[],
): MemorijaKorak<TabelaRezultat> {
  const sekcijeStranice = new Set(
    stanje.snapshot.sections.filter((section) => section.pageKey === stranicaId).map((section) => section.key),
  );
  if (redovi.length === 0) return greska(stanje, MENU_ERROR.invalidInput);
  for (const red of redovi) {
    if (!sekcijeStranice.has(red.sekcijaId)) return greska(stanje, MENU_ERROR.invalidInput);
    if (red.odluka === "postojeci" && !red.postojeciId) return greska(stanje, MENU_ERROR.invalidInput);
    if (red.odluka !== "postojeci" && red.odluka !== "preskoci") {
      if (requiredText(red.naziv, MENU_TEXT.articleName) === null) return greska(stanje, MENU_ERROR.invalidInput);
      if (red.cena !== null && !isValidRsd(red.cena)) return greska(stanje, MENU_ERROR.invalidInput);
    }
  }
  const slicno = redovi.flatMap((red, indeks) => {
    if (red.odluka !== undefined) return [];
    const kandidati = slicni(stanje.snapshot, red.naziv);
    return kandidati.length > 0 ? [{ indeks, kandidati }] : [];
  });
  if (slicno.length > 0) return { stanje, ishod: { ok: true, vrednost: { status: "slicno", redovi: slicno } } };

  let sledece = stanje;
  let novih = 0;
  let postojecih = 0;
  let preskoceno = 0;
  for (const red of redovi) {
    if (red.odluka === "preskoci") {
      preskoceno += 1;
      continue;
    }
    if (red.odluka === "postojeci") {
      const korak = dodajPostojeci(sledece, red.sekcijaId, red.postojeciId!);
      if (korak.ishod.ok) {
        sledece = korak.stanje;
        postojecih += 1;
      } else {
        preskoceno += 1;
      }
      continue;
    }
    const korak = brziUnos(sledece, red.sekcijaId, { naziv: red.naziv, cena: red.cena }, true);
    if (!korak.ishod.ok) return { stanje, ishod: korak.ishod };
    sledece = korak.stanje;
    novih += 1;
  }
  // One transaction on the server: one revision step.
  const ukupno = { ...sledece, revizija: novih + postojecih > 0 ? stanje.revizija + 1 : stanje.revizija };
  return { stanje: ukupno, ishod: { ok: true, vrednost: { status: "dodato", novih, postojecih, preskoceno } } };
}

export function noviKombo(
  stanje: MemorijaStanje,
  sekcijaId: string,
  unos: { naziv: string; cena: number | null; sastojci: readonly string[] },
): MemorijaKorak<{ id: string }> {
  const problem = aktivnaSekcija(stanje, sekcijaId);
  if (problem) return greska(stanje, problem);
  const naziv = requiredText(unos.naziv, MENU_TEXT.articleName);
  if (naziv === null || (unos.cena !== null && !isValidRsd(unos.cena))) return greska(stanje, MENU_ERROR.invalidInput);
  const obicni = new Set(stanje.snapshot.articles.filter((article) => article.kind === "item").map((article) => article.key));
  if (unos.sastojci.length === 0 || new Set(unos.sastojci).size !== unos.sastojci.length || unos.sastojci.some((key) => !obicni.has(key))) {
    return greska(stanje, "article/combo_component_invalid");
  }
  const [key, brojac] = kljuc(stanje, "ar");
  const snapshot = {
    ...stanje.snapshot,
    articles: [...stanje.snapshot.articles, noviArtikal(key, naziv, unos.cena, "combo")],
    placements: [...stanje.snapshot.placements, prikaz(stanje.snapshot, sekcijaId, key)!],
    comboComponents: [
      ...stanje.snapshot.comboComponents,
      ...unos.sastojci.map((componentKey, order) => ({ comboKey: key, componentKey, quantity: 1, order })),
    ],
  };
  return { stanje: nacrt(stanje, snapshot, brojac), ishod: { ok: true, vrednost: { id: key } } };
}

/** THE price writer: one base price for every standard page (master §5.3). */
export function postaviCenu(
  stanje: MemorijaStanje,
  artikalId: string,
  ocekivana: number | null,
  nova: number | null,
): MemorijaKorak {
  const article = stanje.snapshot.articles.find((candidate) => candidate.key === artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  if (nova !== null && !isValidRsd(nova)) return greska(stanje, MENU_ERROR.invalidInput);
  if (article.basePriceRsd !== ocekivana) return konflikt(stanje, article.basePriceRsd, nova);
  if (article.basePriceRsd === nova) return { stanje, ishod: OK };
  const articles = stanje.snapshot.articles.map((candidate) => (candidate.key === artikalId ? { ...candidate, basePriceRsd: nova } : candidate));
  return { stanje: nacrt(stanje, { ...stanje.snapshot, articles }), ishod: OK };
}

// -----------------------------------------------------------------------------
// Publishing (master §6.1) — the real checks and summary on the snapshot
// -----------------------------------------------------------------------------

function provera(stanje: MemorijaStanje) {
  return checkPublication(stanje.snapshot, {
    roomServiceSwitch: stanje.roomService,
    capabilities: {
      roomService: stanje.premium,
      scheduledPromos: stanje.premium,
      maxLanguages: stanje.premium ? 10 : 2,
    },
  });
}

export function pregledObjave(stanje: MemorijaStanje, mozeObjavu: boolean): StudioPregledObjave {
  const check = provera(stanje);
  const sazetak = summarizePublication(stanje.objavljeno, stanje.snapshot);
  const stanjeN = stanjeNacrta(stanje);
  return {
    revizija: stanje.revizija,
    stanje: stanjeN,
    mozeObjavu,
    menjaSe: stanjeN !== "clean",
    prevelik: false,
    greske: check.errors.map((issue) => ({ kod: issue.code, artikalKey: issue.articleKey ?? null })),
    upozorenja: check.warnings.map((issue) => ({
      kod: issue.code,
      artikalKey: issue.articleKey ?? null,
      jezik: issue.lang ?? null,
      broj: issue.count ?? null,
    })),
    otisak: check.fingerprint,
    sazetak: {
      cene: sazetak.changedPrices,
      novi: sazetak.newArticles,
      uklonjeni: sazetak.removedArticles,
      sakriveno: sazetak.structural.hidden,
      uklonjenoSaStranice: sazetak.structural.removedFromPage,
      obrisano: sazetak.structural.deleted,
      redosled: sazetak.structural.reordered,
    },
  };
}

export function objavi(
  stanje: MemorijaStanje,
  revizija: number,
  potvrda: string | undefined,
  sada: number,
): MemorijaKorak<StudioObjavaRezultat> {
  const odbij = (razlog: "stale_draft" | "no_changes" | "validation_failed" | "confirmation_required") => ({
    stanje,
    ishod: { ok: true as const, vrednost: { status: "odbijeno" as const, razlog } },
  });
  if (revizija !== stanje.revizija) return odbij("stale_draft");
  if (stanjeNacrta(stanje) === "clean") return odbij("no_changes");
  const check = provera(stanje);
  if (!check.ok) return odbij("validation_failed");
  if (check.warnings.length > 0 && potvrda !== check.fingerprint) return odbij("confirmation_required");
  const verzija = (stanje.objavljenaVerzija ?? 0) + 1;
  return {
    stanje: {
      ...stanje,
      objavljeno: stanje.snapshot,
      objavljenaVerzija: verzija,
      objavljenoU: sada,
      objavljenaRevizija: stanje.revizija,
    },
    ishod: { ok: true, vrednost: { status: "objavljeno", verzija } },
  };
}

// -----------------------------------------------------------------------------
// K11 — order (drag and drop, `Premesti`), article states and `Izaberi više`
// -----------------------------------------------------------------------------

/** The placement behind a row id ("<sectionKey>/<articleKey>"). */
function nadjiPrikaz(snapshot: MenuDraftSnapshot, id: string): SnapshotPlacement | null {
  const kosa = id.indexOf("/");
  if (kosa <= 0) return null;
  const sekcija = id.slice(0, kosa);
  const artikal = id.slice(kosa + 1);
  return snapshot.placements.find((placement) => placement.sectionKey === sekcija && placement.articleKey === artikal) ?? null;
}

function istiPrikaz(a: SnapshotPlacement, b: SnapshotPlacement): boolean {
  return a.sectionKey === b.sectionKey && a.articleKey === b.articleKey;
}

function stranicaZaIzmenu(stanje: MemorijaStanje, pageKey: string): string | null {
  const page = stanje.snapshot.pages.find((candidate) => candidate.key === pageKey);
  if (!page) return MENU_ERROR.notFound;
  return page.archivedAt !== null ? MENU_ERROR.pageArchived : null;
}

/** Distinct ids of one group action (1–200), or null. */
function serija(ids: readonly string[]): string[] | null {
  const unique = [...new Set(ids)];
  return unique.length === 0 || unique.length > MENU_MAX_BULK_BATCH ? null : unique;
}

/** The placements of the rows, or an error code (a missing row refuses the whole batch). */
function prikaziSerije(stanje: MemorijaStanje, prikazIds: readonly string[]): SnapshotPlacement[] | string {
  const ids = serija(prikazIds);
  if (!ids) return MENU_ERROR.invalidInput;
  const placements: SnapshotPlacement[] = [];
  for (const id of ids) {
    const placement = nadjiPrikaz(stanje.snapshot, id);
    if (!placement) return MENU_ERROR.notFound;
    const problem = stranicaZaIzmenu(stanje, placement.pageKey);
    if (problem) return problem;
    placements.push(placement);
  }
  return placements;
}

function artikliSerije(stanje: MemorijaStanje, artikalIds: readonly string[]): SnapshotArticle[] | string {
  const ids = serija(artikalIds);
  if (!ids) return MENU_ERROR.invalidInput;
  const articles: SnapshotArticle[] = [];
  for (const id of ids) {
    const article = stanje.snapshot.articles.find((candidate) => candidate.key === id);
    if (!article) return MENU_ERROR.notFound;
    articles.push(article);
  }
  return articles;
}

function poslednjiRedosled(snapshot: MenuDraftSnapshot, sekcijaKey: string): number | null {
  return snapshot.placements
    .filter((placement) => placement.sectionKey === sekcijaKey)
    .reduce<number | null>((max, placement) => (max === null || placement.order > max ? placement.order : max), null);
}

const poRedu = (a: SnapshotPlacement, b: SnapshotPlacement) => a.order - b.order || (a.articleKey < b.articleKey ? -1 : 1);

/** One row into `uSekciju` (same page), directly before `prePrikaza` (null = the end): movePlacement. */
export function premestiPrikaz(stanje: MemorijaStanje, prikazIdArg: string, uSekciju: string, prePrikaza: string | null): MemorijaKorak {
  const { snapshot } = stanje;
  const placement = nadjiPrikaz(snapshot, prikazIdArg);
  if (!placement) return greska(stanje, MENU_ERROR.notFound);
  const cilj = snapshot.sections.find((section) => section.key === uSekciju);
  if (!cilj) return greska(stanje, MENU_ERROR.notFound);
  if (cilj.pageKey !== placement.pageKey) return greska(stanje, MENU_ERROR.invalidInput);
  const problem = stranicaZaIzmenu(stanje, placement.pageKey);
  if (problem) return greska(stanje, problem);
  const pre = prePrikaza === null ? null : nadjiPrikaz(snapshot, prePrikaza);
  if (prePrikaza !== null && (!pre || pre.sectionKey !== cilj.key)) return greska(stanje, MENU_ERROR.invalidInput);
  if (pre && istiPrikaz(pre, placement)) return { stanje, ishod: OK };
  const menjaSekciju = placement.sectionKey !== cilj.key;
  if (
    menjaSekciju &&
    snapshot.placements.some((candidate) => candidate.sectionKey === cilj.key && candidate.articleKey === placement.articleKey)
  ) {
    return greska(stanje, MENU_ERROR.placementExists);
  }
  if (!menjaSekciju) {
    const sada = snapshot.placements.filter((candidate) => candidate.sectionKey === cilj.key).sort(poRedu);
    const sledeci = sada[sada.findIndex((candidate) => istiPrikaz(candidate, placement)) + 1] ?? null;
    if ((sledeci === null && pre === null) || (sledeci !== null && pre !== null && istiPrikaz(sledeci, pre))) {
      return { stanje, ishod: OK };
    }
  }
  const ostali = snapshot.placements
    .filter((candidate) => candidate.sectionKey === cilj.key && !istiPrikaz(candidate, placement))
    .sort(poRedu);
  const mesto = pre ? ostali.findIndex((candidate) => istiPrikaz(candidate, pre)) : ostali.length;
  const pomeren: SnapshotPlacement = { ...placement, sectionKey: cilj.key };
  const novi = [...ostali.slice(0, mesto), pomeren, ...ostali.slice(mesto)];
  const redosled = renumberedOrders(novi.length);
  const nove = new Map(novi.map((candidate, index) => [candidate.articleKey, redosled[index]]));
  const placements = snapshot.placements.map((candidate) => {
    if (istiPrikaz(candidate, placement)) return { ...pomeren, order: nove.get(placement.articleKey)! };
    if (candidate.sectionKey === cilj.key) return { ...candidate, order: nove.get(candidate.articleKey)! };
    return candidate;
  });
  return { stanje: nacrt(stanje, { ...snapshot, placements }), ishod: OK };
}

/** A section to `naIndeks` among the sections of its page: moveSection. */
export function premestiSekciju(stanje: MemorijaStanje, sekcijaId: string, naIndeks: number): MemorijaKorak {
  const section = stanje.snapshot.sections.find((candidate) => candidate.key === sekcijaId);
  if (!section) return greska(stanje, MENU_ERROR.notFound);
  const problem = stranicaZaIzmenu(stanje, section.pageKey);
  if (problem) return greska(stanje, problem);
  const sekcije = stanje.snapshot.sections
    .filter((candidate) => candidate.pageKey === section.pageKey)
    .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));
  const od = sekcije.findIndex((candidate) => candidate.key === sekcijaId);
  const cilj = Math.max(0, Math.min(sekcije.length - 1, Math.trunc(naIndeks)));
  if (cilj === od) return { stanje, ishod: OK };
  const [pomerena] = sekcije.splice(od, 1);
  sekcije.splice(cilj, 0, pomerena);
  const redosled = renumberedOrders(sekcije.length);
  const nove = new Map(sekcije.map((candidate, index) => [candidate.key, redosled[index]]));
  const sections = stanje.snapshot.sections.map((candidate) =>
    nove.has(candidate.key) ? { ...candidate, order: nove.get(candidate.key)! } : candidate,
  );
  return { stanje: nacrt(stanje, { ...stanje.snapshot, sections }), ishod: OK };
}

/** LIVE "Privremeno nedostupno" / "Dostupno": no draft change, no revision step. */
export function postaviDostupnost(
  stanje: MemorijaStanje,
  artikalIds: readonly string[],
  dostupno: boolean,
): MemorijaKorak<{ promenjeno: number }> {
  const articles = artikliSerije(stanje, artikalIds);
  if (typeof articles === "string") return greska(stanje, articles);
  const nedostupni = new Set(stanje.nedostupni);
  let promenjeno = 0;
  for (const article of articles) {
    if (dostupno && nedostupni.delete(article.key)) promenjeno += 1;
    if (!dostupno && !nedostupni.has(article.key)) {
      nedostupni.add(article.key);
      promenjeno += 1;
    }
  }
  return { stanje: promenjeno > 0 ? { ...stanje, nedostupni } : stanje, ishod: { ok: true, vrednost: { promenjeno } } };
}

/** "Sakrij" / "Prikaži" on this page (the rows keep their place): setVisibility. */
export function postaviVidljivost(
  stanje: MemorijaStanje,
  prikazIds: readonly string[],
  sakriveno: boolean,
): MemorijaKorak<{ promenjeno: number }> {
  const placements = prikaziSerije(stanje, prikazIds);
  if (typeof placements === "string") return greska(stanje, placements);
  const vidljivost: "hidden" | "visible" = sakriveno ? "hidden" : "visible";
  const meta = placements.filter((placement) => placement.visibility !== vidljivost);
  if (meta.length === 0) return { stanje, ishod: { ok: true, vrednost: { promenjeno: 0 } } };
  const sledece = stanje.snapshot.placements.map((candidate) =>
    meta.some((placement) => istiPrikaz(placement, candidate)) ? { ...candidate, visibility: vidljivost } : candidate,
  );
  return {
    stanje: nacrt(stanje, { ...stanje.snapshot, placements: sledece }),
    ishod: { ok: true, vrednost: { promenjeno: meta.length } },
  };
}

/** "Ukloni sa ove stranice": the rows go, the articles stay: removeFromPage. */
export function ukloniSaStranice(stanje: MemorijaStanje, prikazIds: readonly string[]): MemorijaKorak<{ uklonjeno: number }> {
  const placements = prikaziSerije(stanje, prikazIds);
  if (typeof placements === "string") return greska(stanje, placements);
  const sledece = stanje.snapshot.placements.filter(
    (candidate) => !placements.some((placement) => istiPrikaz(placement, candidate)),
  );
  return {
    stanje: nacrt(stanje, { ...stanje.snapshot, placements: sledece }),
    ishod: { ok: true, vrednost: { uklonjeno: placements.length } },
  };
}

/** Rows of one page to the end of a section of that page, in page order: moveToSection. */
export function premestiUSekciju(
  stanje: MemorijaStanje,
  prikazIds: readonly string[],
  sekcijaId: string,
): MemorijaKorak<{ premesteno: number; preskoceno: number }> {
  const cilj = stanje.snapshot.sections.find((section) => section.key === sekcijaId);
  if (!cilj) return greska(stanje, MENU_ERROR.notFound);
  const problem = stranicaZaIzmenu(stanje, cilj.pageKey);
  if (problem) return greska(stanje, problem);
  const placements = prikaziSerije(stanje, prikazIds);
  if (typeof placements === "string") return greska(stanje, placements);
  if (placements.some((placement) => placement.pageKey !== cilj.pageKey)) return greska(stanje, MENU_ERROR.invalidInput);
  const redSekcije = new Map(
    stanje.snapshot.sections
      .filter((section) => section.pageKey === cilj.pageKey)
      .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1))
      .map((section, index) => [section.key, index]),
  );
  const poStranici = placements
    .slice()
    .sort((a, b) => (redSekcije.get(a.sectionKey) ?? 0) - (redSekcije.get(b.sectionKey) ?? 0) || poRedu(a, b));
  let redosled = poslednjiRedosled(stanje.snapshot, cilj.key);
  const stizu = new Set<string>();
  const premestanja = new Map<SnapshotPlacement, number>();
  let preskoceno = 0;
  for (const placement of poStranici) {
    const vecTu = stanje.snapshot.placements.some(
      (candidate) => candidate.sectionKey === cilj.key && candidate.articleKey === placement.articleKey,
    );
    if (placement.sectionKey === cilj.key || vecTu || stizu.has(placement.articleKey)) {
      preskoceno += 1;
      continue;
    }
    stizu.add(placement.articleKey);
    redosled = orderAfter(redosled);
    premestanja.set(placement, redosled);
  }
  if (premestanja.size === 0) return { stanje, ishod: { ok: true, vrednost: { premesteno: 0, preskoceno } } };
  const sledece = stanje.snapshot.placements.map((candidate) => {
    const order = premestanja.get(candidate);
    return order === undefined ? candidate : { ...candidate, sectionKey: cilj.key, order };
  });
  return {
    stanje: nacrt(stanje, { ...stanje.snapshot, placements: sledece }),
    ishod: { ok: true, vrednost: { premesteno: premestanja.size, preskoceno } },
  };
}

/** "Dodaj na stranicu": the articles shown in a section (re-use, the same price): addToPage. */
export function dodajNaStranicu(
  stanje: MemorijaStanje,
  artikalIds: readonly string[],
  sekcijaId: string,
): MemorijaKorak<{ dodato: number; preskoceno: number }> {
  const problem = aktivnaSekcija(stanje, sekcijaId);
  if (problem) return greska(stanje, problem);
  const articles = artikliSerije(stanje, artikalIds);
  if (typeof articles === "string") return greska(stanje, articles);
  let snapshot = stanje.snapshot;
  let dodato = 0;
  let preskoceno = 0;
  for (const article of articles) {
    if (snapshot.placements.some((placement) => placement.sectionKey === sekcijaId && placement.articleKey === article.key)) {
      preskoceno += 1;
      continue;
    }
    snapshot = { ...snapshot, placements: [...snapshot.placements, prikaz(snapshot, sekcijaId, article.key)!] };
    dodato += 1;
  }
  return { stanje: dodato > 0 ? nacrt(stanje, snapshot) : stanje, ishod: { ok: true, vrednost: { dodato, preskoceno } } };
}

/** The sections of one page, for "Dodaj na stranicu" (pageSections). */
export function sekcijeStranice(stanje: MemorijaStanje, stranicaId: string): MemorijaKorak<StudioSekcijaStranice[]> {
  if (!stanje.snapshot.pages.some((page) => page.key === stranicaId)) return greska(stanje, MENU_ERROR.notFound);
  const sekcije = stanje.snapshot.sections
    .filter((section) => section.pageKey === stranicaId)
    .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1))
    .map((section) => ({ id: section.key, naziv: section.name }));
  return { stanje, ishod: { ok: true, vrednost: sekcije } };
}

/** `Promeni cene`: compare-and-set on every price first, all or nothing (setPrices). */
export function postaviCene(
  stanje: MemorijaStanje,
  promene: readonly StudioPromenaCene[],
  sada = 0,
): MemorijaKorak<StudioCeneRezultat> {
  const ids = promene.map((promena) => promena.artikalId);
  if (!serija(ids) || new Set(ids).size !== ids.length) return greska(stanje, MENU_ERROR.invalidInput);
  if (promene.some((promena) => !isValidRsd(promena.nova))) return greska(stanje, MENU_ERROR.invalidInput);
  const poKljucu = new Map(stanje.snapshot.articles.map((article) => [article.key, article]));
  if (ids.some((id) => !poKljucu.has(id))) return greska(stanje, MENU_ERROR.notFound);
  const konflikti = promene
    .filter((promena) => poKljucu.get(promena.artikalId)!.basePriceRsd !== promena.ocekivana)
    .map((promena) => ({ artikalId: promena.artikalId, sacuvano: poKljucu.get(promena.artikalId)!.basePriceRsd }));
  if (konflikti.length > 0) return { stanje, ishod: { ok: true, vrednost: { status: "konflikt", artikli: konflikti } } };
  const nove = new Map(promene.map((promena) => [promena.artikalId, promena.nova]));
  const promenjeni = new Set(
    promene.filter((promena) => poKljucu.get(promena.artikalId)!.basePriceRsd !== promena.nova).map((promena) => promena.artikalId),
  );
  const broj = promenjeni.size;
  // A combo keeps its manual price and gets "Proveri cenu" when a component's price changes
  // (flagCombosForPriceChange); a combo whose own price is set in the batch loses the flag.
  const komboPromene = new Map<string, string[]>();
  for (const row of stanje.snapshot.comboComponents) {
    if (!promenjeni.has(row.componentKey) || poKljucu.get(row.componentKey)?.kind !== "item") continue;
    komboPromene.set(row.comboKey, [...(komboPromene.get(row.comboKey) ?? []), row.componentKey]);
  }
  const articles = stanje.snapshot.articles.map((article) => {
    let sledeci = article;
    for (const componentKey of komboPromene.get(article.key) ?? []) {
      sledeci = { ...sledeci, priceCheck: nextComboPriceCheck(sledeci.priceCheck, { kind: "price_changed", componentKey, at: sada }) };
    }
    if (!promenjeni.has(article.key)) return sledeci;
    // A new combo price is the owner's answer to "Proveri cenu" (setBasePrice).
    return { ...sledeci, basePriceRsd: nove.get(article.key)!, ...(article.kind === "combo" ? { priceCheck: null } : {}) };
  });
  if (broj === 0) return { stanje, ishod: { ok: true, vrednost: { status: "promenjeno", broj: 0 } } };
  return {
    stanje: nacrt(stanje, { ...stanje.snapshot, articles }),
    ishod: { ok: true, vrednost: { status: "promenjeno", broj } },
  };
}

function uticajArtikla(
  stanje: MemorijaStanje,
  article: SnapshotArticle,
): { uticaj: ArticleDeletionImpact; prikaz: StudioUticajArtikla } {
  const { snapshot } = stanje;
  const poStranici = new Map<string, number>();
  for (const placement of snapshot.placements) {
    if (placement.articleKey === article.key) poStranici.set(placement.pageKey, (poStranici.get(placement.pageKey) ?? 0) + 1);
  }
  const stranice = snapshot.pages
    .filter((page) => poStranici.has(page.key))
    .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));
  const komboKljucevi = [
    ...new Set(snapshot.comboComponents.filter((row) => row.componentKey === article.key).map((row) => row.comboKey)),
  ];
  const kombo = komboKljucevi
    .map((key) => snapshot.articles.find((candidate) => candidate.key === key && candidate.kind === "combo"))
    .filter((combo): combo is SnapshotArticle => combo !== undefined);
  const varijante = snapshot.variants.filter((variant) => variant.articleKey === article.key).length;
  const roomService = snapshot.roomService.items.some((item) => item.articleKey === article.key);
  const uticaj: ArticleDeletionImpact = {
    articleKey: article.key,
    pages: stranice.map((page) => ({
      pageKey: page.key,
      name: page.name,
      archived: page.archivedAt !== null,
      placements: poStranici.get(page.key)!,
    })),
    combos: kombo.map((combo) => ({ articleKey: combo.key, name: combo.name })),
    comboComponents: snapshot.comboComponents.filter((row) => row.comboKey === article.key).length,
    variants: varijante,
    addonGroupLinks: snapshot.articleAddonGroups.filter((row) => row.articleKey === article.key).length,
    inRoomService: roomService,
    unavailable: stanje.nedostupni.has(article.key),
  };
  return {
    uticaj,
    prikaz: {
      artikalId: article.key,
      naziv: article.name,
      vrsta: article.kind,
      stranice: uticaj.pages.map((page) => ({ naziv: page.name, arhivirana: page.archived, prikaza: page.placements })),
      kombo: uticaj.combos.map((combo) => combo.name),
      varijante,
      roomService,
    },
  };
}

function uticajSerije(stanje: MemorijaStanje, articles: readonly SnapshotArticle[]): StudioUticajBrisanja {
  const svi = articles.map((article) => uticajArtikla(stanje, article));
  return {
    artikli: svi.map((jedan) => jedan.prikaz),
    token: bulkDeletionConfirmToken(svi.map((jedan) => jedan.uticaj)),
    prevelik: false,
  };
}

/** What deleting the articles removes, per article (deleteImpact). */
export function uticajBrisanja(stanje: MemorijaStanje, artikalIds: readonly string[]): MemorijaKorak<StudioUticajBrisanja> {
  const articles = artikliSerije(stanje, artikalIds);
  if (typeof articles === "string") return greska(stanje, articles);
  return { stanje, ishod: { ok: true, vrednost: uticajSerije(stanje, articles) } };
}

/**
 * "Obriši artikal" for one or many: only with the token of the impact shown;
 * otherwise nothing is deleted and the current impact comes back (deleteArticles).
 * Combos that contained a deleted article lose it and get "Proveri cenu".
 */
export function obrisiArtikle(
  stanje: MemorijaStanje,
  artikalIds: readonly string[],
  token: string,
  sada: number,
): MemorijaKorak<StudioBrisanjeRezultat> {
  const articles = artikliSerije(stanje, artikalIds);
  if (typeof articles === "string") return greska(stanje, articles);
  const uticaj = uticajSerije(stanje, articles);
  if (uticaj.token !== token) return { stanje, ishod: { ok: true, vrednost: { status: "potvrdi", uticaj } } };
  const kljucevi = new Set(articles.map((article) => article.key));
  const { snapshot } = stanje;
  const pogodjeniKombo = new Map<string, string[]>();
  for (const row of snapshot.comboComponents) {
    if (!kljucevi.has(row.componentKey) || kljucevi.has(row.comboKey)) continue;
    const ime = snapshot.articles.find((article) => article.key === row.componentKey)!.name;
    pogodjeniKombo.set(row.comboKey, [...(pogodjeniKombo.get(row.comboKey) ?? []), ime]);
  }
  const sledeci: MenuDraftSnapshot = {
    ...snapshot,
    articles: snapshot.articles
      .filter((article) => !kljucevi.has(article.key))
      .map((article) => {
        const imena = pogodjeniKombo.get(article.key);
        if (!imena) return article;
        // detachComponentFromCombos: each removed component's name once (lib/menu/combo.ts).
        let priceCheck = article.priceCheck;
        for (const componentName of imena) priceCheck = nextComboPriceCheck(priceCheck, { kind: "removed", componentName, at: sada });
        return { ...article, priceCheck };
      }),
    placements: snapshot.placements.filter((placement) => !kljucevi.has(placement.articleKey)),
    variants: snapshot.variants.filter((variant) => !kljucevi.has(variant.articleKey)),
    articleAddonGroups: snapshot.articleAddonGroups.filter((row) => !kljucevi.has(row.articleKey)),
    comboComponents: snapshot.comboComponents.filter((row) => !kljucevi.has(row.comboKey) && !kljucevi.has(row.componentKey)),
    roomService: { ...snapshot.roomService, items: snapshot.roomService.items.filter((item) => !kljucevi.has(item.articleKey)) },
  };
  return { stanje: nacrt(stanje, sledeci), ishod: { ok: true, vrednost: { status: "obrisano", broj: articles.length } } };
}
