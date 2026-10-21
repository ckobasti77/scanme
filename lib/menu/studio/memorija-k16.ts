// ScanMe Menu V1 — combos, translations and Room service on an in-memory menu
// (K16). The izlog runs the real editor without a backend; these functions
// keep the same rules as convex/menuCombos.ts, convex/menuTranslations.ts and
// convex/menuRoomService.ts:
//   - Room service content needs Premium; every write goes into the draft;
//     a manual price stays exactly as typed; "Preuzmi ceo meni" copies the
//     visible content of `Kompletan meni` once;
//   - typed translation text is confirmed at once; an AI suggestion is stored
//     NEXT TO it (never published) until the owner confirms it; a language
//     outside Settings or above the plan's limit is refused;
//   - a combo's components are a full new list; "Zadrži cenu" clears the flag
//     and never touches the price.
// Every function returns the next state and the outcome; nothing is mutated.

import { checkComboComponents } from "../combo";
import { ARTICLE_ERROR } from "../errors/article";
import { MENU_ERROR } from "../errors/core";
import { MENU_PLAN_ERROR } from "../errors/plan";
import { ROOM_SERVICE_ERROR } from "../errors/room-service";
import { TRANSLATION_ERROR } from "../errors/translation";
import { MENU_MAX_ROOM_SERVICE_BATCH, MENU_MAX_ROOM_SERVICE_CATEGORIES, MENU_TEXT } from "../limits";
import { moveItem, orderAfter, renumberedOrders } from "../order";
import { markupBpsToPercent, markupPercentToBps, resolvePriceWarning } from "../room-service-pricing";
import { isValidRsd } from "../rsd";
import { publishedLanguages, type MenuDraftSnapshot, type SnapshotRoomServiceItem, type SnapshotTranslations } from "../snapshot";
import { requiredText } from "../text";
import {
  fieldTranslation,
  withConfirmedSuggestion,
  withReviewedTranslation,
  withSuggestion,
  withTypedTranslation,
  withoutSuggestion,
  type MenuTranslationField,
  type MenuTranslations,
} from "../translation-status";
import { greska, kljuc, konflikt, nacrt, type MemorijaKorak, type MemorijaStanje } from "./memorija";
import type { StudioPrevodCilj, StudioRsPravila } from "./model";
import { granicaPrevoda, POLJA_PREVODA } from "./prevodi";

const OK = { ok: true as const, vrednost: null };

// =============================================================================
// Combos (menuCombos)
// =============================================================================

export function postaviSastav(
  stanje: MemorijaStanje,
  komboId: string,
  sastojci: readonly { artikalId: string; kolicina: number }[],
): MemorijaKorak {
  const combo = stanje.snapshot.articles.find((article) => article.key === komboId);
  if (!combo) return greska(stanje, MENU_ERROR.notFound);
  if (combo.kind !== "combo") return greska(stanje, ARTICLE_ERROR.notCombo);
  const lista = checkComboComponents(sastojci.map((s) => ({ articleId: s.artikalId, quantity: s.kolicina })), komboId);
  if (lista === null) return greska(stanje, ARTICLE_ERROR.comboComponentInvalid);
  for (const sastojak of lista) {
    const article = stanje.snapshot.articles.find((candidate) => candidate.key === sastojak.articleId);
    if (!article) return greska(stanje, MENU_ERROR.notFound);
    if (article.kind !== "item") return greska(stanje, ARTICLE_ERROR.comboComponentInvalid);
  }
  const sadasnji = stanje.snapshot.comboComponents.filter((row) => row.comboKey === komboId).sort((a, b) => a.order - b.order);
  const isti =
    sadasnji.length === lista.length && sadasnji.every((row, i) => row.componentKey === lista[i].articleId && row.quantity === lista[i].quantity);
  if (isti) return { stanje, ishod: OK };
  const redosled = renumberedOrders(lista.length);
  const comboComponents = [
    ...stanje.snapshot.comboComponents.filter((row) => row.comboKey !== komboId),
    ...lista.map((s, i) => ({ comboKey: komboId, componentKey: s.articleId, quantity: s.quantity, order: redosled[i] })),
  ];
  return { stanje: nacrt(stanje, { ...stanje.snapshot, comboComponents }), ishod: OK };
}

/** "Zadrži cenu": clears "Proveri cenu"; the price stays exactly as it is. */
export function zadrziCenuKomboa(stanje: MemorijaStanje, komboId: string): MemorijaKorak {
  const combo = stanje.snapshot.articles.find((article) => article.key === komboId);
  if (!combo) return greska(stanje, MENU_ERROR.notFound);
  if (combo.kind !== "combo") return greska(stanje, ARTICLE_ERROR.notCombo);
  if (!combo.priceCheck) return { stanje, ishod: OK };
  const articles = stanje.snapshot.articles.map((article) => (article.key === komboId ? { ...article, priceCheck: null } : article));
  return { stanje: nacrt(stanje, { ...stanje.snapshot, articles }), ishod: OK };
}

// =============================================================================
// Translations (menuTranslations)
// =============================================================================

type Izvori = Partial<Record<MenuTranslationField, string | null>>;
type Entitet = { izvor: Izvori; prevodi: SnapshotTranslations };

function entitet(snapshot: MenuDraftSnapshot, cilj: StudioPrevodCilj): Entitet | null {
  const nadji = <T extends { key: string; translations: SnapshotTranslations }>(rows: readonly T[], izvor: (row: T) => Izvori) => {
    const row = rows.find((candidate) => candidate.key === cilj.id);
    return row ? { izvor: izvor(row), prevodi: row.translations } : null;
  };
  switch (cilj.vrsta) {
    case "page":
      return nadji(snapshot.pages, (row) => ({ publicTitle: row.publicTitle }));
    case "section":
      return nadji(snapshot.sections, (row) => ({ name: row.name, description: row.description }));
    case "article":
      return nadji(snapshot.articles, (row) => ({ name: row.name, description: row.description }));
    case "variant":
      return nadji(snapshot.variants, (row) => ({ name: row.name }));
    case "addonGroup":
      return nadji(snapshot.addonGroups, (row) => ({ name: row.name }));
    case "addonOption":
      return nadji(snapshot.addonOptions, (row) => ({ name: row.name }));
    case "roomServiceCategory":
      return nadji(snapshot.roomService.categories, (row) => ({ name: row.name }));
  }
}

function saPrevodima(snapshot: MenuDraftSnapshot, cilj: StudioPrevodCilj, prevodi: MenuTranslations | undefined): MenuDraftSnapshot {
  const translations = (prevodi ?? null) as SnapshotTranslations;
  const zameni = <T extends { key: string; translations: SnapshotTranslations }>(rows: readonly T[]): T[] =>
    rows.map((row) => (row.key === cilj.id ? { ...row, translations } : row));
  switch (cilj.vrsta) {
    case "page":
      return { ...snapshot, pages: zameni(snapshot.pages) };
    case "section":
      return { ...snapshot, sections: zameni(snapshot.sections) };
    case "article":
      return { ...snapshot, articles: zameni(snapshot.articles) };
    case "variant":
      return { ...snapshot, variants: zameni(snapshot.variants) };
    case "addonGroup":
      return { ...snapshot, addonGroups: zameni(snapshot.addonGroups) };
    case "addonOption":
      return { ...snapshot, addonOptions: zameni(snapshot.addonOptions) };
    case "roomServiceCategory":
      return { ...snapshot, roomService: { ...snapshot.roomService, categories: zameni(snapshot.roomService.categories) } };
  }
}

/** The translation languages the plan publishes; a language above the limit is refused as a plan limit. */
function proveriJezik(stanje: MemorijaStanje, jezik: string): string | null {
  const { source, languages, dropped } = publishedLanguages(stanje.snapshot.settings, stanje.premium ? 10 : 2);
  if (jezik === source) return TRANSLATION_ERROR.languageOff;
  if (dropped.includes(jezik)) return MENU_PLAN_ERROR.languageLimit;
  return languages.includes(jezik) ? null : TRANSLATION_ERROR.languageOff;
}

const isti = (a: MenuTranslations | undefined, b: SnapshotTranslations) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function upisi(stanje: MemorijaStanje, cilj: StudioPrevodCilj, pre: SnapshotTranslations, posle: MenuTranslations | undefined): MemorijaKorak {
  if (isti(posle, pre)) return { stanje, ishod: OK };
  return { stanje: nacrt(stanje, saPrevodima(stanje.snapshot, cilj, posle)), ishod: OK };
}

/** Typed text: confirmed at once (into the draft), compare-and-set on the confirmed text last seen. */
export function prevedi(
  stanje: MemorijaStanje,
  cilj: StudioPrevodCilj,
  jezik: string,
  polje: MenuTranslationField,
  ocekivano: string | null,
  vrednost: string | null,
): MemorijaKorak {
  const e = entitet(stanje.snapshot, cilj);
  if (!e) return greska(stanje, MENU_ERROR.notFound);
  if (!POLJA_PREVODA[cilj.vrsta].includes(polje)) return greska(stanje, MENU_ERROR.invalidInput);
  const jezikGreska = proveriJezik(stanje, jezik);
  if (jezikGreska) return greska(stanje, jezikGreska);
  const izvor = e.izvor[polje];
  if (!izvor) return greska(stanje, TRANSLATION_ERROR.nothingToTranslate);
  if (vrednost !== null && vrednost.trim().length > granicaPrevoda(cilj.vrsta, polje)) return greska(stanje, MENU_ERROR.invalidInput);
  const sadasnje = fieldTranslation(izvor, (e.prevodi as MenuTranslations | null)?.[jezik], polje).confirmed;
  if ((sadasnje ?? null) !== (ocekivano ?? null)) return konflikt(stanje, sadasnje, vrednost);
  return upisi(stanje, cilj, e.prevodi, withTypedTranslation(e.prevodi as MenuTranslations | null, jezik, polje, vrednost, izvor));
}

/**
 * Stores an AI suggestion (the izlog makes the text itself; the app asks the
 * AI service). Premium only; never published until confirmed.
 */
export function predloziPrevod(
  stanje: MemorijaStanje,
  cilj: StudioPrevodCilj,
  jezik: string,
  tekstovi: Partial<Record<MenuTranslationField, string>>,
  aiDostupno: boolean,
  sada = 0,
): MemorijaKorak<{ polja: number }> {
  if (!stanje.premium) return greska(stanje, MENU_PLAN_ERROR.premiumRequired);
  if (!aiDostupno) return greska(stanje, TRANSLATION_ERROR.aiDisabled);
  const e = entitet(stanje.snapshot, cilj);
  if (!e) return greska(stanje, MENU_ERROR.notFound);
  const jezikGreska = proveriJezik(stanje, jezik);
  if (jezikGreska) return greska(stanje, jezikGreska);
  const polja = POLJA_PREVODA[cilj.vrsta].filter((polje) => e.izvor[polje] && tekstovi[polje]);
  if (polja.length === 0) return greska(stanje, TRANSLATION_ERROR.nothingToTranslate);
  const posle = withSuggestion(e.prevodi as MenuTranslations | null, jezik, tekstovi, e.izvor, sada);
  const korak = upisi(stanje, cilj, e.prevodi, posle);
  return { stanje: korak.stanje, ishod: { ok: true, vrednost: { polja: polja.length } } };
}

export function potvrdiPredlog(
  stanje: MemorijaStanje,
  cilj: StudioPrevodCilj,
  jezik: string,
  izmene: Partial<Record<MenuTranslationField, string>> = {},
): MemorijaKorak {
  const e = entitet(stanje.snapshot, cilj);
  if (!e) return greska(stanje, MENU_ERROR.notFound);
  const jezikGreska = proveriJezik(stanje, jezik);
  if (jezikGreska) return greska(stanje, jezikGreska);
  // The same check as confirmSuggestion: only the kind's fields, each within its limit.
  for (const [polje, tekst] of Object.entries(izmene) as [MenuTranslationField, string | undefined][]) {
    if (!POLJA_PREVODA[cilj.vrsta].includes(polje) || (tekst !== undefined && tekst.trim().length > granicaPrevoda(cilj.vrsta, polje))) {
      return greska(stanje, MENU_ERROR.invalidInput);
    }
  }
  return upisi(stanje, cilj, e.prevodi, withConfirmedSuggestion(e.prevodi as MenuTranslations | null, jezik, izmene));
}

export function odbaciPredlog(stanje: MemorijaStanje, cilj: StudioPrevodCilj, jezik: string): MemorijaKorak {
  const e = entitet(stanje.snapshot, cilj);
  if (!e) return greska(stanje, MENU_ERROR.notFound);
  return upisi(stanje, cilj, e.prevodi, withoutSuggestion(e.prevodi as MenuTranslations | null, jezik));
}

export function prevodJeDobar(stanje: MemorijaStanje, cilj: StudioPrevodCilj, jezik: string): MemorijaKorak {
  const e = entitet(stanje.snapshot, cilj);
  if (!e) return greska(stanje, MENU_ERROR.notFound);
  const jezikGreska = proveriJezik(stanje, jezik);
  if (jezikGreska) return greska(stanje, jezikGreska);
  return upisi(stanje, cilj, e.prevodi, withReviewedTranslation(e.prevodi as MenuTranslations | null, jezik, e.izvor));
}

// =============================================================================
// Room service (menuRoomService) — Premium; ids are category keys and article keys
// =============================================================================

function rs(stanje: MemorijaStanje, snapshot: MenuDraftSnapshot["roomService"]): MenuDraftSnapshot {
  return { ...stanje.snapshot, roomService: snapshot };
}

const premium = (stanje: MemorijaStanje) => (stanje.premium ? null : greska<never>(stanje, MENU_PLAN_ERROR.premiumRequired));

export function rsPravila(stanje: MemorijaStanje, ocekivano: Partial<StudioRsPravila>, izmena: Partial<StudioRsPravila>): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const kljucevi = (Object.keys(izmena) as (keyof StudioRsPravila)[]).filter((k) => izmena[k] !== undefined);
  if (kljucevi.length === 0 || kljucevi.some((k) => !(k in ocekivano))) return greska(stanje, MENU_ERROR.invalidInput);
  const config = stanje.snapshot.roomService.config;
  const sadasnje: StudioRsPravila = {
    uvecanje: config?.markupBps ? markupBpsToPercent(config.markupBps) : null,
    obuhvat: config?.markupScope ?? "all",
    naknada: config?.deliveryFeeRsd ?? null,
  };
  for (const k of kljucevi) {
    if ((ocekivano[k] ?? null) !== sadasnje[k]) return konflikt(stanje, sadasnje[k], izmena[k] ?? null);
  }
  let markupBps = config?.markupBps ?? null;
  if (izmena.uvecanje !== undefined) {
    const bps = izmena.uvecanje === null ? 0 : markupPercentToBps(izmena.uvecanje);
    if (bps === null) return greska(stanje, MENU_ERROR.invalidInput);
    markupBps = bps > 0 ? bps : null;
  }
  if (izmena.naknada !== undefined && izmena.naknada !== null && !isValidRsd(izmena.naknada)) return greska(stanje, MENU_ERROR.invalidInput);
  const sledeci = {
    markupBps,
    markupScope: izmena.obuhvat ?? sadasnje.obuhvat,
    deliveryFeeRsd: izmena.naknada === undefined ? sadasnje.naknada : izmena.naknada === 0 ? null : izmena.naknada,
  };
  if (sledeci.markupBps === (config?.markupBps ?? null) && sledeci.markupScope === sadasnje.obuhvat && sledeci.deliveryFeeRsd === sadasnje.naknada) {
    return { stanje, ishod: OK };
  }
  return { stanje: nacrt(stanje, rs(stanje, { ...stanje.snapshot.roomService, config: sledeci })), ishod: OK };
}

export function rsDodajKategoriju(stanje: MemorijaStanje, naziv: string): MemorijaKorak<{ id: string }> {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const ime = requiredText(naziv, MENU_TEXT.roomServiceCategoryName);
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  const { categories } = stanje.snapshot.roomService;
  if (categories.length >= MENU_MAX_ROOM_SERVICE_CATEGORIES) return greska(stanje, MENU_ERROR.limitReached);
  const [key, brojac] = kljuc(stanje, "rc");
  const poslednji = categories.reduce<number | null>((max, c) => (max === null || c.order > max ? c.order : max), null);
  const kategorija = { key, name: ime, order: orderAfter(poslednji), translations: null };
  return {
    stanje: nacrt(stanje, rs(stanje, { ...stanje.snapshot.roomService, categories: [...categories, kategorija] }), brojac),
    ishod: { ok: true, vrednost: { id: key } },
  };
}

export function rsPreimenujKategoriju(stanje: MemorijaStanje, id: string, naziv: string, ocekivano: string): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const kategorija = stanje.snapshot.roomService.categories.find((c) => c.key === id);
  if (!kategorija) return greska(stanje, MENU_ERROR.notFound);
  const ime = requiredText(naziv, MENU_TEXT.roomServiceCategoryName);
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  if (kategorija.name !== ocekivano) return konflikt(stanje, kategorija.name, ime);
  if (kategorija.name === ime) return { stanje, ishod: OK };
  const categories = stanje.snapshot.roomService.categories.map((c) => (c.key === id ? { ...c, name: ime } : c));
  return { stanje: nacrt(stanje, rs(stanje, { ...stanje.snapshot.roomService, categories })), ishod: OK };
}

export function rsPremestiKategoriju(stanje: MemorijaStanje, id: string, naIndeks: number): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  if (!Number.isInteger(naIndeks) || naIndeks < 0) return greska(stanje, MENU_ERROR.invalidInput);
  const redom = stanje.snapshot.roomService.categories.slice().sort((a, b) => a.order - b.order);
  const od = redom.findIndex((c) => c.key === id);
  if (od === -1) return greska(stanje, MENU_ERROR.notFound);
  const pomereno = moveItem(redom, od, naIndeks);
  if (pomereno.every((c, i) => c.key === redom[i].key)) return { stanje, ishod: OK };
  const redosled = renumberedOrders(pomereno.length);
  const categories = pomereno.map((c, i) => ({ ...c, order: redosled[i] }));
  return { stanje: nacrt(stanje, rs(stanje, { ...stanje.snapshot.roomService, categories })), ishod: OK };
}

/** Only an empty category can go — articles never leave Room service silently. */
export function rsObrisiKategoriju(stanje: MemorijaStanje, id: string): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  if (!stanje.snapshot.roomService.categories.some((c) => c.key === id)) return greska(stanje, MENU_ERROR.notFound);
  if (stanje.snapshot.roomService.items.some((item) => item.categoryKey === id)) return greska(stanje, ROOM_SERVICE_ERROR.categoryNotEmpty);
  const categories = stanje.snapshot.roomService.categories.filter((c) => c.key !== id);
  return { stanje: nacrt(stanje, rs(stanje, { ...stanje.snapshot.roomService, categories })), ishod: OK };
}

function novaStavka(articleKey: string, categoryKey: string, order: number): SnapshotRoomServiceItem {
  // Markup reaches "selected" articles only once someone selects them (insertItem).
  return { articleKey, categoryKey, order, markupApplies: false, manualPriceRsd: null, priceWarning: null, manualVariantPrices: null };
}

function poslednjiRed(items: readonly SnapshotRoomServiceItem[], categoryKey: string): number | null {
  return items.filter((item) => item.categoryKey === categoryKey).reduce<number | null>((max, item) => (max === null || item.order > max ? item.order : max), null);
}

/** "Preuzmi ceo meni": the visible sections and articles of `Kompletan meni`, copied once. */
export function rsPreuzmiCeoMeni(stanje: MemorijaStanje): MemorijaKorak<{ kategorija: number; artikala: number; vecU: number }> {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const { snapshot } = stanje;
  const glavna = snapshot.pages.find((page) => page.isDefault && page.archivedAt === null);
  if (!glavna) return greska(stanje, MENU_ERROR.notFound);
  const uRs = new Set(snapshot.roomService.items.map((item) => item.articleKey));
  let categories = snapshot.roomService.categories.slice();
  let items = snapshot.roomService.items.slice();
  let brojac = stanje.brojac;
  let kategorija = 0;
  let artikala = 0;
  let vecU = 0;
  const sekcije = snapshot.sections.filter((s) => s.pageKey === glavna.key && s.visibility === "visible").sort((a, b) => a.order - b.order);
  for (const sekcija of sekcije) {
    const novi: string[] = [];
    for (const placement of snapshot.placements
      .filter((p) => p.pageKey === glavna.key && p.sectionKey === sekcija.key && p.visibility === "visible")
      .sort((a, b) => a.order - b.order)) {
      if (uRs.has(placement.articleKey)) {
        vecU += 1;
        continue;
      }
      uRs.add(placement.articleKey);
      novi.push(placement.articleKey);
    }
    if (novi.length === 0) continue;
    let cilj = categories.find((c) => c.name === sekcija.name);
    if (!cilj) {
      if (categories.length >= MENU_MAX_ROOM_SERVICE_CATEGORIES) return greska(stanje, MENU_ERROR.limitReached);
      brojac += 1;
      const poslednji = categories.reduce<number | null>((max, c) => (max === null || c.order > max ? c.order : max), null);
      cilj = { key: `rc_mem${String(brojac).padStart(4, "0")}`, name: sekcija.name, order: orderAfter(poslednji), translations: null };
      categories = [...categories, cilj];
      kategorija += 1;
    }
    let red = poslednjiRed(items, cilj.key);
    for (const articleKey of novi) {
      red = orderAfter(red);
      items = [...items, novaStavka(articleKey, cilj.key, red)];
      artikala += 1;
    }
  }
  const vrednost = { kategorija, artikala, vecU };
  if (kategorija + artikala === 0) return { stanje, ishod: { ok: true, vrednost } };
  return { stanje: nacrt(stanje, rs(stanje, { ...snapshot.roomService, categories, items }), brojac), ishod: { ok: true, vrednost } };
}

export function rsDodajArtikle(
  stanje: MemorijaStanje,
  kategorijaId: string,
  artikalIds: readonly string[],
): MemorijaKorak<{ dodato: number; vecU: number }> {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const { snapshot } = stanje;
  if (!snapshot.roomService.categories.some((c) => c.key === kategorijaId)) return greska(stanje, MENU_ERROR.notFound);
  const ids = [...new Set(artikalIds)];
  if (ids.length === 0 || ids.length > MENU_MAX_ROOM_SERVICE_BATCH) return greska(stanje, MENU_ERROR.invalidInput);
  if (ids.some((id) => !snapshot.articles.some((article) => article.key === id))) return greska(stanje, MENU_ERROR.notFound);
  const uRs = new Set(snapshot.roomService.items.map((item) => item.articleKey));
  let items = snapshot.roomService.items.slice();
  let red = poslednjiRed(items, kategorijaId);
  let dodato = 0;
  let vecU = 0;
  for (const id of ids) {
    if (uRs.has(id)) {
      vecU += 1;
      continue;
    }
    red = orderAfter(red);
    items = [...items, novaStavka(id, kategorijaId, red)];
    dodato += 1;
  }
  const vrednost = { dodato, vecU };
  if (dodato === 0) return { stanje, ishod: { ok: true, vrednost } };
  return { stanje: nacrt(stanje, rs(stanje, { ...snapshot.roomService, items })), ishod: { ok: true, vrednost } };
}

function stavka(stanje: MemorijaStanje, stavkaId: string): SnapshotRoomServiceItem | null {
  return stanje.snapshot.roomService.items.find((item) => item.articleKey === stavkaId) ?? null;
}

function saStavkom(stanje: MemorijaStanje, stavkaId: string, izmena: Partial<SnapshotRoomServiceItem>): MenuDraftSnapshot {
  return rs(stanje, {
    ...stanje.snapshot.roomService,
    items: stanje.snapshot.roomService.items.map((item) => (item.articleKey === stavkaId ? { ...item, ...izmena } : item)),
  });
}

/** Takes the article out of Room service; the article stays in the menu. */
export function rsUkloni(stanje: MemorijaStanje, stavkaId: string): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  if (!stavka(stanje, stavkaId)) return greska(stanje, MENU_ERROR.notFound);
  const items = stanje.snapshot.roomService.items.filter((item) => item.articleKey !== stavkaId);
  return { stanje: nacrt(stanje, rs(stanje, { ...stanje.snapshot.roomService, items })), ishod: OK };
}

/** Moves an item into a category, directly before `preStavke` (null = the end). */
export function rsPremestiStavku(stanje: MemorijaStanje, stavkaId: string, uKategoriju: string, preStavke: string | null): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const item = stavka(stanje, stavkaId);
  if (!item || !stanje.snapshot.roomService.categories.some((c) => c.key === uKategoriju)) return greska(stanje, MENU_ERROR.notFound);
  if (preStavke === stavkaId) return { stanje, ishod: OK };
  const ostali = stanje.snapshot.roomService.items
    .filter((i) => i.categoryKey === uKategoriju && i.articleKey !== stavkaId)
    .sort((a, b) => a.order - b.order);
  const indeks = preStavke === null ? ostali.length : ostali.findIndex((i) => i.articleKey === preStavke);
  if (indeks === -1) return greska(stanje, MENU_ERROR.invalidInput);
  const novi = [...ostali.slice(0, indeks), item, ...ostali.slice(indeks)];
  const pre = stanje.snapshot.roomService.items.filter((i) => i.categoryKey === uKategoriju).sort((a, b) => a.order - b.order);
  if (item.categoryKey === uKategoriju && pre.length === novi.length && pre.every((i, n) => i.articleKey === novi[n].articleKey)) {
    return { stanje, ishod: OK };
  }
  const redosled = renumberedOrders(novi.length);
  const poKljucu = new Map(novi.map((i, n) => [i.articleKey, redosled[n]]));
  const items = stanje.snapshot.roomService.items.map((i) =>
    poKljucu.has(i.articleKey) ? { ...i, categoryKey: uKategoriju, order: poKljucu.get(i.articleKey)! } : i,
  );
  return { stanje: nacrt(stanje, rs(stanje, { ...stanje.snapshot.roomService, items })), ishod: OK };
}

/** Which items are "selected" for the markup (read when it applies to selected articles). */
export function rsUvecanje(stanje: MemorijaStanje, stavkaIds: readonly string[], primeni: boolean): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const ids = [...new Set(stavkaIds)];
  if (ids.length === 0 || ids.length > MENU_MAX_ROOM_SERVICE_BATCH) return greska(stanje, MENU_ERROR.invalidInput);
  if (ids.some((id) => !stavka(stanje, id))) return greska(stanje, MENU_ERROR.notFound);
  const skup = new Set(ids);
  let promenjeno = 0;
  const items = stanje.snapshot.roomService.items.map((item) => {
    if (!skup.has(item.articleKey) || item.markupApplies === primeni) return item;
    promenjeno += 1;
    return { ...item, markupApplies: primeni };
  });
  if (promenjeno === 0) return { stanje, ishod: OK };
  return { stanje: nacrt(stanje, rs(stanje, { ...stanje.snapshot.roomService, items })), ishod: OK };
}

/** The manual Room service price, kept exactly as typed (null = back to the rule); clears a pending warning. */
export function rsRucnaCena(stanje: MemorijaStanje, stavkaId: string, ocekivana: number | null, nova: number | null): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const item = stavka(stanje, stavkaId);
  if (!item) return greska(stanje, MENU_ERROR.notFound);
  if (nova !== null && !isValidRsd(nova)) return greska(stanje, MENU_ERROR.invalidInput);
  if (item.manualPriceRsd !== ocekivana) return konflikt(stanje, item.manualPriceRsd, nova);
  if (item.manualPriceRsd === nova && !item.priceWarning) return { stanje, ishod: OK };
  return { stanje: nacrt(stanje, saStavkom(stanje, stavkaId, { manualPriceRsd: nova, priceWarning: null })), ishod: OK };
}

/** "Zadrži ručnu cenu" (keepManual) or "Ponovo izračunaj prema markup-u" (recomputeFromMarkup). */
export function rsResiUpozorenje(stanje: MemorijaStanje, stavkaId: string, akcija: "keepManual" | "recomputeFromMarkup"): MemorijaKorak {
  const odbijeno = premium(stanje);
  if (odbijeno) return odbijeno;
  const item = stavka(stanje, stavkaId);
  if (!item) return greska(stanje, MENU_ERROR.notFound);
  if (!item.priceWarning) return { stanje, ishod: OK };
  const polja = resolvePriceWarning(akcija, item.manualPriceRsd);
  return { stanje: nacrt(stanje, saStavkom(stanje, stavkaId, { manualPriceRsd: polja.manualPriceRsd, priceWarning: null })), ishod: OK };
}
