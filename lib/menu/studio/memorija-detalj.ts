// ScanMe Menu V1 — the article detail's actions on an in-memory menu (K15).
// The same rules as the Convex mutations, so the izlog behaves as the app:
//   - text fields, variants, add-ons, allergens, tags and the promotion by
//     compare-and-set on the value the editor last saw (menuCatalog,
//     menuArticleOptions, menuArticleDetails, menuPromos);
//   - a LINKED add-on group changes for every linked article, or — with
//     `samoZaArtikal` — that article first gets an independent copy and the
//     copy changes (menuArticleOptions `onlyForArticleId`);
//   - a scheduled promotion that is switched on needs Premium;
//   - allergens are recorded only while the venue keeps them; an empty record
//     is no record ("unknown", never "safe").
// Every function returns the next state and the outcome; nothing is mutated.

import { normalizeAddonRules } from "../addons";
import { MENU_ALLERGEN_CODES, kanonskiAlergeni } from "../allergens";
import type { CasValue } from "../cas";
import { nextComboPriceCheck } from "../combo";
import { ARTICLE_ERROR } from "../errors/article";
import { MENU_ERROR } from "../errors/core";
import {
  MENU_MAX_ADDON_GROUPS_PER_ARTICLE,
  MENU_MAX_ADDON_OPTIONS_PER_GROUP,
  MENU_MAX_ARTICLE_BATCH,
  MENU_MAX_QUANTITY,
  MENU_MAX_VARIANTS_PER_ARTICLE,
  MENU_TEXT,
} from "../limits";
import { orderAfter } from "../order";
import { checkPromo, isPromoScheduled, type MenuPromo } from "../promo";
import { isValidRsd } from "../rsd";
import type { MenuDraftSnapshot, SnapshotAddonGroup, SnapshotArticle } from "../snapshot";
import { normalizeTags } from "../tags";
import { foldSerbian, normalizeArticleName, optionalText, requiredText } from "../text";
import { greska, kljuc, konflikt, nacrt, type MemorijaKorak, type MemorijaStanje } from "./memorija";
import type {
  StudioAlergeni,
  StudioDetaljArtikla,
  StudioGrupaUnos,
  StudioKandidat,
  StudioMedijArtikla,
  StudioPoljeArtikla,
  StudioPostojecaGrupa,
  StudioUticajGrupe,
} from "./model";

const OK = { ok: true as const, vrednost: null };

function artikal(stanje: MemorijaStanje, id: string): SnapshotArticle | null {
  return stanje.snapshot.articles.find((candidate) => candidate.key === id) ?? null;
}

function sArtiklom(stanje: MemorijaStanje, id: string, izmena: Partial<SnapshotArticle>): MenuDraftSnapshot {
  return {
    ...stanje.snapshot,
    articles: stanje.snapshot.articles.map((candidate) => (candidate.key === id ? { ...candidate, ...izmena } : candidate)),
  };
}

// -----------------------------------------------------------------------------
// Basic data (updateArticleFields)
// -----------------------------------------------------------------------------

const POLJA: Record<StudioPoljeArtikla, keyof SnapshotArticle> = {
  name: "name",
  description: "description",
  quantityValue: "quantityValue",
  quantityUnit: "quantityUnit",
};

function ocisti(polje: StudioPoljeArtikla, vrednost: CasValue): { ok: true; vrednost: string | number | null } | { ok: false } {
  if (polje === "name") {
    const ime = typeof vrednost === "string" ? requiredText(vrednost, MENU_TEXT.articleName) : null;
    return ime === null ? { ok: false } : { ok: true, vrednost: ime };
  }
  if (polje === "quantityValue") {
    if (vrednost === null) return { ok: true, vrednost: null };
    return typeof vrednost === "number" && Number.isFinite(vrednost) && vrednost > 0 && vrednost <= MENU_MAX_QUANTITY
      ? { ok: true, vrednost }
      : { ok: false };
  }
  if (vrednost === null) return { ok: true, vrednost: null };
  if (typeof vrednost !== "string") return { ok: false };
  const tekst = optionalText(vrednost, polje === "description" ? MENU_TEXT.articleDescription : MENU_TEXT.quantityUnit);
  if (tekst === false) return { ok: false };
  return { ok: true, vrednost: tekst ?? null };
}

export function izmeniPolje(
  stanje: MemorijaStanje,
  artikalId: string,
  polje: StudioPoljeArtikla,
  ocekivano: CasValue,
  vrednost: CasValue,
): MemorijaKorak {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  const cist = ocisti(polje, vrednost);
  if (!cist.ok) return greska(stanje, MENU_ERROR.invalidInput);
  const sada = article[POLJA[polje]] as string | number | null;
  if (sada !== ocekivano) return konflikt(stanje, sada, vrednost);
  if (sada === cist.vrednost) return { stanje, ishod: OK };
  return { stanje: nacrt(stanje, sArtiklom(stanje, artikalId, { [POLJA[polje]]: cist.vrednost })), ishod: OK };
}

// -----------------------------------------------------------------------------
// Image, icon or nothing (setArticleMedia)
// -----------------------------------------------------------------------------

export function postaviMedij(
  stanje: MemorijaStanje,
  artikalId: string,
  ocekivano: StudioMedijArtikla,
  novo: StudioMedijArtikla,
): MemorijaKorak {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  const sada: StudioMedijArtikla = { medij: article.mediaMode, ikonica: article.iconKey, slikaId: article.imageMediaId };
  const kljucM = (m: StudioMedijArtikla) => `${m.medij}|${m.ikonica ?? ""}|${m.slikaId ?? ""}`;
  if (kljucM(sada) !== kljucM(ocekivano)) return konflikt(stanje, kljucM(sada), kljucM(novo));
  if (novo.ikonica !== null && (novo.ikonica.trim() === "" || novo.ikonica.length > MENU_TEXT.iconKey)) {
    return greska(stanje, MENU_ERROR.invalidInput);
  }
  if (novo.medij === "image" && novo.slikaId === null) return greska(stanje, MENU_ERROR.invalidInput);
  if (novo.slikaId !== null && !stanje.slike?.has(novo.slikaId) && novo.slikaId !== article.imageMediaId) {
    return greska(stanje, MENU_ERROR.notFound);
  }
  if (kljucM(sada) === kljucM(novo)) return { stanje, ishod: OK };
  return {
    stanje: nacrt(stanje, sArtiklom(stanje, artikalId, { mediaMode: novo.medij, iconKey: novo.ikonica, imageMediaId: novo.slikaId })),
    ishod: OK,
  };
}

/** A finished upload (the server's commit): the new image becomes the article's image. */
export function sacuvajOtpremljenuSliku(
  stanje: MemorijaStanje,
  artikalId: string,
  url: string,
): MemorijaKorak<{ slikaId: string }> {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  const [slikaId, brojac] = kljuc(stanje, "md");
  const slike = new Map(stanje.slike ?? []);
  slike.set(slikaId, url);
  const snapshot = sArtiklom(stanje, artikalId, { mediaMode: "image", imageMediaId: slikaId });
  return { stanje: { ...nacrt(stanje, snapshot, brojac), slike }, ishod: { ok: true, vrednost: { slikaId } } };
}

// -----------------------------------------------------------------------------
// Switches and variants (menuArticleOptions)
// -----------------------------------------------------------------------------

export function postaviPrekidace(
  stanje: MemorijaStanje,
  artikalId: string,
  prekidaci: Partial<StudioDetaljArtikla["ukljuceno"]>,
): MemorijaKorak {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  if (prekidaci.varijante === undefined && prekidaci.dodaci === undefined && prekidaci.napomena === undefined) {
    return greska(stanje, MENU_ERROR.invalidInput);
  }
  if (prekidaci.varijante === true && article.kind === "combo") return greska(stanje, ARTICLE_ERROR.notCombo);
  const izmena: Partial<SnapshotArticle> = {
    ...(prekidaci.varijante !== undefined ? { variantsEnabled: prekidaci.varijante } : {}),
    ...(prekidaci.dodaci !== undefined ? { addonsEnabled: prekidaci.dodaci } : {}),
    ...(prekidaci.napomena !== undefined ? { noteEnabled: prekidaci.napomena } : {}),
  };
  const isto = Object.entries(izmena).every(([polje, vrednost]) => article[polje as keyof SnapshotArticle] === vrednost);
  if (isto) return { stanje, ishod: OK };
  return { stanje: nacrt(stanje, sArtiklom(stanje, artikalId, izmena)), ishod: OK };
}

export function dodajVarijantu(
  stanje: MemorijaStanje,
  artikalId: string,
  naziv: string,
  cena: number | null,
): MemorijaKorak<{ id: string }> {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  if (article.kind === "combo") return greska(stanje, ARTICLE_ERROR.notCombo);
  const ime = requiredText(naziv, MENU_TEXT.variantName);
  if (ime === null || (cena !== null && !isValidRsd(cena))) return greska(stanje, MENU_ERROR.invalidInput);
  const postojece = stanje.snapshot.variants.filter((variant) => variant.articleKey === artikalId);
  if (postojece.length >= MENU_MAX_VARIANTS_PER_ARTICLE) return greska(stanje, MENU_ERROR.limitReached);
  const [key, brojac] = kljuc(stanje, "va");
  const poslednji = postojece.reduce<number | null>((max, variant) => (max === null || variant.order > max ? variant.order : max), null);
  const snapshot = {
    ...sArtiklom(stanje, artikalId, { variantsEnabled: true }),
    variants: [
      ...stanje.snapshot.variants,
      { key, articleKey: artikalId, name: ime, priceRsd: cena, order: orderAfter(poslednji), translations: null },
    ],
  };
  return { stanje: nacrt(stanje, snapshot, brojac), ishod: { ok: true, vrednost: { id: key } } };
}

export function izmeniVarijantu(
  stanje: MemorijaStanje,
  varijantaId: string,
  ocekivano: { naziv?: string; cena?: number | null },
  izmena: { naziv?: string; cena?: number | null },
  sada = 0,
): MemorijaKorak {
  const variant = stanje.snapshot.variants.find((candidate) => candidate.key === varijantaId);
  if (!variant) return greska(stanje, MENU_ERROR.notFound);
  if (izmena.naziv === undefined && izmena.cena === undefined) return greska(stanje, MENU_ERROR.invalidInput);
  if ((izmena.naziv !== undefined && ocekivano.naziv === undefined) || (izmena.cena !== undefined && ocekivano.cena === undefined)) {
    return greska(stanje, MENU_ERROR.invalidInput);
  }
  const ime = izmena.naziv !== undefined ? requiredText(izmena.naziv, MENU_TEXT.variantName) : variant.name;
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  if (izmena.cena !== undefined && izmena.cena !== null && !isValidRsd(izmena.cena)) return greska(stanje, MENU_ERROR.invalidInput);
  if (ocekivano.naziv !== undefined && ocekivano.naziv !== variant.name) return konflikt(stanje, variant.name, izmena.naziv ?? null);
  if (ocekivano.cena !== undefined && ocekivano.cena !== variant.priceRsd) return konflikt(stanje, variant.priceRsd, izmena.cena ?? null);
  const cena = izmena.cena !== undefined ? izmena.cena : variant.priceRsd;
  if (ime === variant.name && cena === variant.priceRsd) return { stanje, ishod: OK };
  let snapshot: MenuDraftSnapshot = {
    ...stanje.snapshot,
    variants: stanje.snapshot.variants.map((candidate) => (candidate.key === varijantaId ? { ...candidate, name: ime, priceRsd: cena } : candidate)),
  };
  // A variant price change reaches the combos that contain the article (onVariantPriceChanged).
  if (cena !== variant.priceRsd) {
    const kombo = new Set(stanje.snapshot.comboComponents.filter((row) => row.componentKey === variant.articleKey).map((row) => row.comboKey));
    snapshot = {
      ...snapshot,
      articles: snapshot.articles.map((candidate) =>
        kombo.has(candidate.key)
          ? { ...candidate, priceCheck: nextComboPriceCheck(candidate.priceCheck, { kind: "price_changed", componentKey: variant.articleKey, at: sada }) }
          : candidate,
      ),
    };
  }
  return { stanje: nacrt(stanje, snapshot), ishod: OK };
}

export function obrisiVarijantu(stanje: MemorijaStanje, varijantaId: string): MemorijaKorak {
  if (!stanje.snapshot.variants.some((variant) => variant.key === varijantaId)) return greska(stanje, MENU_ERROR.notFound);
  return {
    stanje: nacrt(stanje, { ...stanje.snapshot, variants: stanje.snapshot.variants.filter((variant) => variant.key !== varijantaId) }),
    ishod: OK,
  };
}

// -----------------------------------------------------------------------------
// Add-on groups: new, existing, linked (menuArticleOptions)
// -----------------------------------------------------------------------------

function brojVeza(snapshot: MenuDraftSnapshot, grupaKey: string): number {
  return snapshot.articleAddonGroups.filter((row) => row.groupKey === grupaKey).length;
}

function pravila(unos: StudioGrupaUnos) {
  return normalizeAddonRules({ selection: unos.izbor, required: unos.obavezna, minSelect: unos.min, maxSelect: unos.max });
}

export function novaGrupa(
  stanje: MemorijaStanje,
  artikalId: string,
  unos: StudioGrupaUnos,
  opcije: readonly { naziv: string; doplata: number }[],
): MemorijaKorak<{ id: string }> {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  const ime = requiredText(unos.naziv, MENU_TEXT.addonGroupName);
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  const rules = pravila(unos);
  if (rules === null) return greska(stanje, ARTICLE_ERROR.addonRulesInvalid);
  if (opcije.length > MENU_MAX_ADDON_OPTIONS_PER_GROUP) return greska(stanje, MENU_ERROR.limitReached);
  const ociscene = opcije.map((opcija) => ({ ime: requiredText(opcija.naziv, MENU_TEXT.addonOptionName), doplata: opcija.doplata }));
  if (ociscene.some((opcija) => opcija.ime === null || !isValidRsd(opcija.doplata))) return greska(stanje, MENU_ERROR.invalidInput);
  const veze = stanje.snapshot.articleAddonGroups.filter((row) => row.articleKey === artikalId);
  if (veze.length >= MENU_MAX_ADDON_GROUPS_PER_ARTICLE) return greska(stanje, MENU_ERROR.limitReached);
  let brojac = stanje.brojac;
  const novi = (prefiks: string) => {
    brojac += 1;
    return `${prefiks}_mem${String(brojac).padStart(4, "0")}`;
  };
  const key = novi("ag");
  const group: SnapshotAddonGroup = {
    key,
    name: ime,
    selection: rules.selection,
    required: rules.required,
    minSelect: rules.minSelect ?? null,
    maxSelect: rules.maxSelect ?? null,
    translations: null,
  };
  const snapshot: MenuDraftSnapshot = {
    ...sArtiklom(stanje, artikalId, { addonsEnabled: true }),
    addonGroups: [...stanje.snapshot.addonGroups, group],
    addonOptions: [
      ...stanje.snapshot.addonOptions,
      ...ociscene.map((opcija, order) => ({ key: novi("ao"), groupKey: key, name: opcija.ime!, priceDeltaRsd: opcija.doplata, order, translations: null })),
    ],
    articleAddonGroups: [
      ...stanje.snapshot.articleAddonGroups,
      { articleKey: artikalId, groupKey: key, order: orderAfter(veze.reduce<number | null>((max, row) => (max === null || row.order > max ? row.order : max), null)) },
    ],
  };
  return { stanje: nacrt(stanje, snapshot, brojac), ishod: { ok: true, vrednost: { id: key } } };
}

/** "Dodaj grupu → postojeća grupa": the groups of the menu by name, with their link counts. */
export function postojeceGrupe(stanje: MemorijaStanje): MemorijaKorak<StudioPostojecaGrupa[]> {
  const grupe = stanje.snapshot.addonGroups
    .map((group) => ({
      id: group.key,
      naziv: group.name,
      izbor: group.selection,
      obavezna: group.required,
      brojArtikala: brojVeza(stanje.snapshot, group.key),
    }))
    .sort((a, b) => (foldSerbian(a.naziv) < foldSerbian(b.naziv) ? -1 : foldSerbian(a.naziv) > foldSerbian(b.naziv) ? 1 : 0));
  return { stanje, ishod: { ok: true, vrednost: grupe } };
}

export function prikaciGrupu(stanje: MemorijaStanje, artikalId: string, grupaId: string): MemorijaKorak {
  if (!artikal(stanje, artikalId) || !stanje.snapshot.addonGroups.some((group) => group.key === grupaId)) {
    return greska(stanje, MENU_ERROR.notFound);
  }
  const veze = stanje.snapshot.articleAddonGroups.filter((row) => row.articleKey === artikalId);
  if (veze.some((row) => row.groupKey === grupaId)) return greska(stanje, ARTICLE_ERROR.addonGroupAttached);
  if (veze.length >= MENU_MAX_ADDON_GROUPS_PER_ARTICLE) return greska(stanje, MENU_ERROR.limitReached);
  const poslednji = veze.reduce<number | null>((max, row) => (max === null || row.order > max ? row.order : max), null);
  const snapshot = {
    ...sArtiklom(stanje, artikalId, { addonsEnabled: true }),
    articleAddonGroups: [...stanje.snapshot.articleAddonGroups, { articleKey: artikalId, groupKey: grupaId, order: orderAfter(poslednji) }],
  };
  return { stanje: nacrt(stanje, snapshot), ishod: OK };
}

/** Unlinks the group from the article; the group itself stays (it can be re-used). */
export function otkaciGrupu(stanje: MemorijaStanje, artikalId: string, grupaId: string): MemorijaKorak {
  if (!artikal(stanje, artikalId)) return greska(stanje, MENU_ERROR.notFound);
  if (!stanje.snapshot.articleAddonGroups.some((row) => row.articleKey === artikalId && row.groupKey === grupaId)) {
    return greska(stanje, ARTICLE_ERROR.addonGroupNotAttached);
  }
  return {
    stanje: nacrt(stanje, {
      ...stanje.snapshot,
      articleAddonGroups: stanje.snapshot.articleAddonGroups.filter((row) => !(row.articleKey === artikalId && row.groupKey === grupaId)),
    }),
    ishod: OK,
  };
}

/** "Koje artikle pogađa": the articles a group is linked to (addonGroupUsage). */
export function uticajGrupe(stanje: MemorijaStanje, grupaId: string): MemorijaKorak<StudioUticajGrupe> {
  if (!stanje.snapshot.addonGroups.some((group) => group.key === grupaId)) return greska(stanje, MENU_ERROR.notFound);
  const veze = stanje.snapshot.articleAddonGroups.filter((row) => row.groupKey === grupaId);
  const artikli = veze
    .slice(0, MENU_MAX_ARTICLE_BATCH)
    .flatMap((row) => {
      const article = artikal(stanje, row.articleKey);
      return article ? [{ id: article.key, naziv: article.name }] : [];
    });
  return { stanje, ishod: { ok: true, vrednost: { artikli, ukupno: veze.length, skraceno: veze.length > MENU_MAX_ARTICLE_BATCH } } };
}

/**
 * The group a change goes to: the group itself (no scope, or the scoped article
 * is its only link), or an independent copy for the scoped article made now
 * (new keys, same rules and add-ons; the link moves to the copy).
 */
function grupaZaIzmenu(
  stanje: MemorijaStanje,
  grupaId: string,
  samoZaArtikal: string | null,
): { stanje: MemorijaStanje; grupaKey: string; kopija: Map<string, string> | null } | string {
  const group = stanje.snapshot.addonGroups.find((candidate) => candidate.key === grupaId);
  if (!group) return MENU_ERROR.notFound;
  if (samoZaArtikal === null) return { stanje, grupaKey: grupaId, kopija: null };
  if (!stanje.snapshot.articleAddonGroups.some((row) => row.articleKey === samoZaArtikal && row.groupKey === grupaId)) {
    return ARTICLE_ERROR.addonGroupNotAttached;
  }
  if (brojVeza(stanje.snapshot, grupaId) <= 1) return { stanje, grupaKey: grupaId, kopija: null };
  let brojac = stanje.brojac;
  const novi = (prefiks: string) => {
    brojac += 1;
    return `${prefiks}_mem${String(brojac).padStart(4, "0")}`;
  };
  const key = novi("ag");
  const kopija = new Map<string, string>();
  const opcije = stanje.snapshot.addonOptions
    .filter((option) => option.groupKey === grupaId)
    .map((option) => {
      const nova = novi("ao");
      kopija.set(option.key, nova);
      return { ...option, key: nova, groupKey: key };
    });
  const snapshot: MenuDraftSnapshot = {
    ...stanje.snapshot,
    addonGroups: [...stanje.snapshot.addonGroups, { ...group, key }],
    addonOptions: [...stanje.snapshot.addonOptions, ...opcije],
    articleAddonGroups: stanje.snapshot.articleAddonGroups.map((row) =>
      row.articleKey === samoZaArtikal && row.groupKey === grupaId ? { ...row, groupKey: key } : row,
    ),
  };
  return { stanje: { ...stanje, snapshot, brojac }, grupaKey: key, kopija };
}

export function izmeniGrupu(
  stanje: MemorijaStanje,
  grupaId: string,
  ocekivano: Partial<StudioGrupaUnos>,
  izmena: Partial<StudioGrupaUnos>,
  samoZaArtikal: string | null,
): MemorijaKorak {
  const group = stanje.snapshot.addonGroups.find((candidate) => candidate.key === grupaId);
  if (!group) return greska(stanje, MENU_ERROR.notFound);
  const kljucevi = (Object.keys(izmena) as (keyof StudioGrupaUnos)[]).filter((polje) => izmena[polje] !== undefined);
  if (kljucevi.length === 0 || kljucevi.some((polje) => ocekivano[polje] === undefined)) return greska(stanje, MENU_ERROR.invalidInput);
  const sada: StudioGrupaUnos = { naziv: group.name, izbor: group.selection, obavezna: group.required, min: group.minSelect, max: group.maxSelect };
  for (const polje of kljucevi) {
    if (ocekivano[polje] !== sada[polje]) return konflikt(stanje, sada[polje] as CasValue, izmena[polje] as CasValue);
  }
  const sledece: StudioGrupaUnos = { ...sada, ...Object.fromEntries(kljucevi.map((polje) => [polje, izmena[polje]])) };
  const ime = requiredText(sledece.naziv, MENU_TEXT.addonGroupName);
  if (ime === null) return greska(stanje, MENU_ERROR.invalidInput);
  const rules = pravila(sledece);
  if (rules === null) return greska(stanje, ARTICLE_ERROR.addonRulesInvalid);
  const novo = { name: ime, selection: rules.selection, required: rules.required, minSelect: rules.minSelect ?? null, maxSelect: rules.maxSelect ?? null };
  if (novo.name === group.name && novo.selection === group.selection && novo.required === group.required && novo.minSelect === group.minSelect && novo.maxSelect === group.maxSelect) {
    return { stanje, ishod: OK };
  }
  const meta = grupaZaIzmenu(stanje, grupaId, samoZaArtikal);
  if (typeof meta === "string") return greska(stanje, meta);
  const snapshot = {
    ...meta.stanje.snapshot,
    addonGroups: meta.stanje.snapshot.addonGroups.map((candidate) => (candidate.key === meta.grupaKey ? { ...candidate, ...novo } : candidate)),
  };
  return { stanje: nacrt(stanje, snapshot, meta.stanje.brojac), ishod: OK };
}

export function dodajOpciju(
  stanje: MemorijaStanje,
  grupaId: string,
  opcija: { naziv: string; doplata: number },
  samoZaArtikal: string | null,
): MemorijaKorak {
  const ime = requiredText(opcija.naziv, MENU_TEXT.addonOptionName);
  if (ime === null || !isValidRsd(opcija.doplata)) return greska(stanje, MENU_ERROR.invalidInput);
  if (!stanje.snapshot.addonGroups.some((group) => group.key === grupaId)) return greska(stanje, MENU_ERROR.notFound);
  const postojece = stanje.snapshot.addonOptions.filter((option) => option.groupKey === grupaId);
  if (postojece.length >= MENU_MAX_ADDON_OPTIONS_PER_GROUP) return greska(stanje, MENU_ERROR.limitReached);
  const meta = grupaZaIzmenu(stanje, grupaId, samoZaArtikal);
  if (typeof meta === "string") return greska(stanje, meta);
  const [key, brojac] = kljuc(meta.stanje, "ao");
  const uGrupi = meta.stanje.snapshot.addonOptions.filter((option) => option.groupKey === meta.grupaKey);
  const poslednji = uGrupi.reduce<number | null>((max, option) => (max === null || option.order > max ? option.order : max), null);
  const snapshot = {
    ...meta.stanje.snapshot,
    addonOptions: [
      ...meta.stanje.snapshot.addonOptions,
      { key, groupKey: meta.grupaKey, name: ime, priceDeltaRsd: opcija.doplata, order: orderAfter(poslednji), translations: null },
    ],
  };
  return { stanje: nacrt(stanje, snapshot, brojac), ishod: OK };
}

export function izmeniOpciju(
  stanje: MemorijaStanje,
  opcijaId: string,
  ocekivano: { naziv?: string; doplata?: number },
  izmena: { naziv?: string; doplata?: number },
  samoZaArtikal: string | null,
): MemorijaKorak {
  const option = stanje.snapshot.addonOptions.find((candidate) => candidate.key === opcijaId);
  if (!option) return greska(stanje, MENU_ERROR.notFound);
  if (izmena.naziv === undefined && izmena.doplata === undefined) return greska(stanje, MENU_ERROR.invalidInput);
  if ((izmena.naziv !== undefined && ocekivano.naziv === undefined) || (izmena.doplata !== undefined && ocekivano.doplata === undefined)) {
    return greska(stanje, MENU_ERROR.invalidInput);
  }
  const ime = izmena.naziv !== undefined ? requiredText(izmena.naziv, MENU_TEXT.addonOptionName) : option.name;
  if (ime === null || (izmena.doplata !== undefined && !isValidRsd(izmena.doplata))) return greska(stanje, MENU_ERROR.invalidInput);
  if (ocekivano.naziv !== undefined && ocekivano.naziv !== option.name) return konflikt(stanje, option.name, izmena.naziv ?? null);
  if (ocekivano.doplata !== undefined && ocekivano.doplata !== option.priceDeltaRsd) {
    return konflikt(stanje, option.priceDeltaRsd, izmena.doplata ?? null);
  }
  const doplata = izmena.doplata ?? option.priceDeltaRsd;
  if (ime === option.name && doplata === option.priceDeltaRsd) return { stanje, ishod: OK };
  const meta = grupaZaIzmenu(stanje, option.groupKey, samoZaArtikal);
  if (typeof meta === "string") return greska(stanje, meta);
  const cilj = meta.kopija?.get(opcijaId) ?? opcijaId;
  const snapshot = {
    ...meta.stanje.snapshot,
    addonOptions: meta.stanje.snapshot.addonOptions.map((candidate) =>
      candidate.key === cilj ? { ...candidate, name: ime, priceDeltaRsd: doplata } : candidate,
    ),
  };
  return { stanje: nacrt(stanje, snapshot, meta.stanje.brojac), ishod: OK };
}

export function obrisiOpciju(stanje: MemorijaStanje, opcijaId: string, samoZaArtikal: string | null): MemorijaKorak {
  const option = stanje.snapshot.addonOptions.find((candidate) => candidate.key === opcijaId);
  if (!option) return greska(stanje, MENU_ERROR.notFound);
  const meta = grupaZaIzmenu(stanje, option.groupKey, samoZaArtikal);
  if (typeof meta === "string") return greska(stanje, meta);
  const cilj = meta.kopija?.get(opcijaId) ?? opcijaId;
  const snapshot = { ...meta.stanje.snapshot, addonOptions: meta.stanje.snapshot.addonOptions.filter((candidate) => candidate.key !== cilj) };
  return { stanje: nacrt(stanje, snapshot, meta.stanje.brojac), ishod: OK };
}

/** "Primeni i na druge artikle": links the group; articles that have it or are full are skipped. */
export function primeniGrupuNa(
  stanje: MemorijaStanje,
  grupaId: string,
  artikalIds: readonly string[],
): MemorijaKorak<{ dodato: number; preskoceno: number }> {
  const ids = [...new Set(artikalIds)];
  if (ids.length === 0 || ids.length > MENU_MAX_ARTICLE_BATCH) return greska(stanje, MENU_ERROR.invalidInput);
  if (!stanje.snapshot.addonGroups.some((group) => group.key === grupaId)) return greska(stanje, MENU_ERROR.notFound);
  if (ids.some((id) => !artikal(stanje, id))) return greska(stanje, MENU_ERROR.notFound);
  let sledece = stanje;
  let dodato = 0;
  let preskoceno = 0;
  for (const id of ids) {
    const korak = prikaciGrupu(sledece, id, grupaId);
    if (korak.ishod.ok) {
      sledece = korak.stanje;
      dodato += 1;
    } else {
      preskoceno += 1;
    }
  }
  // One transaction on the server: one revision step.
  const ukupno = { ...sledece, revizija: dodato > 0 ? stanje.revizija + 1 : stanje.revizija };
  return { stanje: ukupno, ishod: { ok: true, vrednost: { dodato, preskoceno } } };
}

/** Articles by name anywhere in the menu, diacritics ignored, at most 50 (menuStudio.searchArticles). */
export function traziArtikle(stanje: MemorijaStanje, upit: string): MemorijaKorak<StudioKandidat[]> {
  const trazi = normalizeArticleName(upit);
  if (trazi === "") return { stanje, ishod: { ok: true, vrednost: [] } };
  const nadjeni = stanje.snapshot.articles
    .filter((article) => normalizeArticleName(article.name).includes(trazi))
    .sort((a, b) => (foldSerbian(a.name) < foldSerbian(b.name) ? -1 : 1))
    .slice(0, 50)
    .map((article) => ({ artikalId: article.key, naziv: article.name, cena: article.basePriceRsd, vrsta: article.kind }));
  return { stanje, ishod: { ok: true, vrednost: nadjeni } };
}

// -----------------------------------------------------------------------------
// Allergens and tags (menuArticleDetails)
// -----------------------------------------------------------------------------

// K34: the stored form (`kanonskiAlergeni`) lives in ../allergens, so the production editor imports it from
// there and not from this in-memory module; it is re-exported here so the existing imports keep working.
export { kanonskiAlergeni };

const kljucAlergena = (alergeni: StudioAlergeni | null) => (alergeni === null ? null : JSON.stringify(alergeni));

export function postaviAlergene(
  stanje: MemorijaStanje,
  artikalId: string,
  ocekivano: StudioAlergeni | null,
  alergeni: StudioAlergeni | null,
): MemorijaKorak {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  const sve = [...(alergeni?.sadrzi ?? []), ...(alergeni?.tragovi ?? [])];
  if (sve.some((code) => !(MENU_ALLERGEN_CODES as readonly string[]).includes(code))) return greska(stanje, MENU_ERROR.invalidInput);
  if ((alergeni?.drugo ?? "").length > MENU_TEXT.allergenOtherText) return greska(stanje, MENU_ERROR.invalidInput);
  const sledece = kanonskiAlergeni(alergeni);
  if (sledece !== null && (sledece.sadrzi.includes("other") || sledece.tragovi.includes("other")) && sledece.drugo === null) {
    return greska(stanje, MENU_ERROR.invalidInput);
  }
  if (sledece !== null && stanje.snapshot.settings.allergensEnabled !== true) return greska(stanje, ARTICLE_ERROR.allergensDisabled);
  const sada = article.allergens
    ? kanonskiAlergeni({ sadrzi: article.allergens.contains, tragovi: article.allergens.mayContain, drugo: article.allergens.otherText })
    : null;
  if (kljucAlergena(sada) !== kljucAlergena(kanonskiAlergeni(ocekivano))) {
    return konflikt(stanje, kljucAlergena(sada), kljucAlergena(sledece));
  }
  if (kljucAlergena(sada) === kljucAlergena(sledece)) return { stanje, ishod: OK };
  const zapis = sledece === null ? null : { contains: sledece.sadrzi, mayContain: sledece.tragovi, otherText: sledece.drugo };
  return { stanje: nacrt(stanje, sArtiklom(stanje, artikalId, { allergens: zapis })), ishod: OK };
}

export function postaviOznake(
  stanje: MemorijaStanje,
  artikalId: string,
  ocekivano: readonly string[],
  oznake: readonly string[],
): MemorijaKorak {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  const sledece = normalizeTags(oznake);
  const ocekivane = normalizeTags(ocekivano);
  if (sledece === null || ocekivane === null) return greska(stanje, MENU_ERROR.invalidInput);
  const sada = normalizeTags(article.tags ?? []) ?? [];
  if (sada.join(",") !== ocekivane.join(",")) return konflikt(stanje, sada.join(","), sledece.join(","));
  if (sada.join(",") === sledece.join(",")) return { stanje, ishod: OK };
  return { stanje: nacrt(stanje, sArtiklom(stanje, artikalId, { tags: sledece.length > 0 ? sledece : null })), ishod: OK };
}

// -----------------------------------------------------------------------------
// Promotion (menuPromos.setPromo)
// -----------------------------------------------------------------------------

const kljucAkcije = (akcija: MenuPromo | null) =>
  akcija === null
    ? null
    : JSON.stringify([akcija.active, akcija.mode, akcija.priceRsd ?? null, akcija.percent ?? null, akcija.label ?? null, akcija.startsAt ?? null, akcija.endsAt ?? null]);

export function postaviAkciju(
  stanje: MemorijaStanje,
  artikalId: string,
  ocekivano: MenuPromo | null,
  akcija: MenuPromo | null,
): MemorijaKorak {
  const article = artikal(stanje, artikalId);
  if (!article) return greska(stanje, MENU_ERROR.notFound);
  if (kljucAkcije(article.promo) !== kljucAkcije(ocekivano)) return konflikt(stanje, kljucAkcije(article.promo), kljucAkcije(akcija));
  let sledeca: MenuPromo | null = null;
  if (akcija !== null) {
    const kontekst = {
      basePriceRsd: article.basePriceRsd,
      variantsEnabled: article.variantsEnabled,
      variants: stanje.snapshot.variants
        .filter((variant) => variant.articleKey === artikalId)
        .map((variant) => ({ key: variant.key, priceRsd: variant.priceRsd })),
    };
    sledeca = checkPromo(akcija, kontekst);
    if (sledeca === null) return greska(stanje, ARTICLE_ERROR.promoInvalid);
  }
  if (kljucAkcije(sledeca) === kljucAkcije(article.promo)) return { stanje, ishod: OK };
  if (sledeca !== null && sledeca.active && isPromoScheduled(sledeca) && !stanje.premium) {
    return greska(stanje, "plan/premium_required");
  }
  return { stanje: nacrt(stanje, sArtiklom(stanje, artikalId, { promo: sledeca })), ishod: OK };
}
