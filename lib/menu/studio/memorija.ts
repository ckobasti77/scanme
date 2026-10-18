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
import { MENU_TEXT } from "../limits";
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
  StudioPregledObjave,
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
