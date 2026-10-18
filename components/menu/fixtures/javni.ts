// Izlog fixtures for the public menu (K13, plan K12 §5.4, §7.1): the three
// intentionally different venues — a simple café, a restaurant, a prestige
// restaurant — each with its own palette, font pair, density, emphasis,
// layout and media. The menus go through the REAL publish path:
// fixtureMenu → compileSnapshot → the public parts → parsePublicPage /
// parseSplitter, so the izlog shows exactly what a guest would get.
// Deterministic: fixed clock (IZLOG_SADA), no randomness. Images are the six
// small photos already in public/dev-venue; every fourth article has no
// resolved image, to show the icon fallback (master §7.9).

import { epochToBelgradeLocal } from "@/lib/belgrade-time";
import type { JavniPocetno } from "../javni/javni-meni";
import type { MenuKurs } from "@/lib/menu/currency";
import { MENU_FILTER_CODES } from "@/lib/menu/filters";
import { jePoznataPaleta } from "@/lib/menu/identity/palettes";
import { MENU_KNOWN_PRODUCT_TYPES, normalizeProductType } from "../menu-glyph-map";
import type {
  JavniLayoutParam,
  JavniMedijParam,
  JavniPrimer,
  PublicPreviewParams,
} from "@/lib/menu/izlog-params";
import type { MenuLayout, MenuMediaMode, MenuPresentationValues } from "@/lib/menu/presentation";
import { MENU_DEFAULT_PRESENTATION } from "@/lib/menu/presentation";
import {
  mogucnostiIzPrezentacije,
  type JavniRazdelnikView,
  type JavnaStranicaView,
  type PublicImage,
} from "@/lib/menu/public-view";
import {
  MENU_PART_SPLITTER,
  compileSnapshot,
  parsePublicPage,
  parseSplitter,
  type MenuDraftSnapshot,
  type PublicArticle,
  type PublicPageDoc,
} from "@/lib/menu/snapshot";
import { IZLOG_SADA } from "./lokal";
import { fixtureMenu } from "./meni";
import type { IzlogMenu, IzlogMenuSize } from "./tipovi";

type PrimerSpec = {
  size: IzlogMenuSize;
  /** Shown instead of the fixture's venue name (null = keep it). */
  naziv: string | null;
  presentation: Partial<MenuPresentationValues>;
  mediji: MenuMediaMode;
  /** Navigation of the non-default pages (master §3.3). */
  navigacija: "standalone" | "back" | "shared";
};

const PRIMERI: Record<JavniPrimer, PrimerSpec> = {
  // §21.1: one menu with sections, icons instead of photos, fast and readable.
  kafic: {
    size: "mali",
    naziv: null,
    presentation: { layout: "flow", paletteId: "espresso", fontPairId: "kafe", density: "standard", emphasis: "bold" },
    mediji: "icon",
    navigacija: "standalone",
  },
  // §21.2: food, drinks and wine on separate pages; a visual start by category.
  restoran: {
    size: "srednji",
    naziv: null,
    presentation: { layout: "categories", paletteId: "bordo", fontPairId: "klasika", density: "standard", emphasis: "calm" },
    mediji: "image",
    navigacija: "shared",
  },
  // §21.3: not a burger template — a calm typographic menu; the wine list has its own QR.
  prestizni: {
    size: "srednji",
    naziv: "Restoran Primer",
    presentation: { layout: "compact", paletteId: "ponoc", fontPairId: "elegancija", density: "airy", emphasis: "calm" },
    mediji: "none",
    navigacija: "standalone",
  },
};

const LAYOUT: Record<JavniLayoutParam, MenuLayout> = { tok: "flow", kategorije: "categories", kompaktno: "compact" };
const MEDIJ: Record<JavniMedijParam, MenuMediaMode> = { slika: "image", ikonica: "icon", bez: "none" };
const PAGE_ICONS: Record<string, string> = { glavni: "rostilj", "vinska-karta": "vino" };
// Fixture icon keys the Menu icon set names differently.
const ICON_ALIASES: Record<string, string> = { kafa: "domaca kafa" };
const KNOWN_ICONS = new Set(MENU_KNOWN_PRODUCT_TYPES);

/** The article's icon in the Menu set, or null when the fixture names none the set knows. */
function poznataIkonica(iconKey: string | null): string | null {
  if (!iconKey) return null;
  const key = ICON_ALIASES[normalizeProductType(iconKey)] ?? normalizeProductType(iconKey);
  return KNOWN_ICONS.has(key) ? key : null;
}
const SLIKE = ["/dev-venue/1.jpg", "/dev-venue/2.jpg", "/dev-venue/3.jpg", "/dev-venue/4.jpg", "/dev-venue/5.jpg", "/dev-venue/6.jpg"];

export type JavniIzlogPrikaz =
  | {
      vrsta: "stranica";
      view: JavnaStranicaView;
      presentation: MenuPresentationValues;
      slike: Record<string, PublicImage>;
      nedostupni: string[];
      sadaMs: number;
      pocetniDetalj: string | null;
      pocetnaKategorija: string | null;
      /** K14 */
      kurs: MenuKurs | null;
      pocetno: JavniPocetno;
      jezikLinkovi: Record<string, string>;
    }
  | {
      vrsta: "razdelnik";
      view: JavniRazdelnikView;
      presentation: MenuPresentationValues;
      naslovne: Record<string, PublicImage | null>;
      jezikLinkovi: Record<string, string>;
    }
  | { vrsta: "stari" };

function izlogSlika(index: number): PublicImage {
  const src = SLIKE[index % SLIKE.length];
  return { thumbUrl: src, url: src, width: 640, height: 400 };
}

/** The fixture snapshot with the venue's presentation, page icons/navigation and media applied. */
function pripremi(
  menu: IzlogMenu,
  presentation: MenuPresentationValues,
  mediji: MenuMediaMode,
  navigacija: PrimerSpec["navigacija"],
  prazno: boolean,
): { snapshot: MenuDraftSnapshot; slike: Record<string, PublicImage> } {
  const slike: Record<string, PublicImage> = {};
  const articles = menu.snapshot.articles.map((article, index) => {
    if (mediji === "image") {
      const id = `izlog-slika-${index}`;
      if (index % 4 !== 3) slike[id] = izlogSlika(index);
      return { ...article, mediaMode: "image" as const, imageMediaId: id };
    }
    if (mediji === "icon") {
      // A venue that chose icons picks one per article; an article the fixture gives no
      // known icon shows none (never the same placeholder glyph on every row).
      const ikonica = poznataIkonica(article.iconKey);
      return { ...article, mediaMode: ikonica ? ("icon" as const) : ("none" as const), iconKey: ikonica, imageMediaId: null };
    }
    return { ...article, mediaMode: mediji, imageMediaId: null };
  });
  // Every page leads to the others the same way, so a guest is never stuck on one.
  const pages = menu.snapshot.pages.map((page) => ({
    ...page,
    iconKey: page.iconKey ?? PAGE_ICONS[page.slug] ?? null,
    navigation: navigacija,
  }));
  const defaultKey = pages.find((page) => page.isDefault)?.key;
  const placements = prazno
    ? menu.snapshot.placements.filter((placement) => placement.pageKey !== defaultKey)
    : menu.snapshot.placements;
  return {
    snapshot: { ...menu.snapshot, presentation, articles, pages, placements },
    slike,
  };
}

function compile(snapshot: MenuDraftSnapshot, languages: readonly string[], lang: string) {
  const version = compileSnapshot(snapshot, { languages, roomService: false, scheduledPromos: true });
  const publicParts = version.parts.filter((part) => part.scope === "public" && part.lang === lang);
  const splitterPart = publicParts.find((part) => part.pageKey === MENU_PART_SPLITTER);
  if (!splitterPart) throw new Error("izlog: the compiled version has no splitter");
  const splitter = parseSplitter(splitterPart.data);
  const page = (key: string): PublicPageDoc | null =>
    parsePublicPage(
      publicParts
        .filter((part) => part.pageKey === key)
        .sort((a, b) => a.part - b.part)
        .map((part) => part.data),
    );
  return { splitter, page };
}

/** How much an article shows in its detail (the `detalj=1` pick). */
function bogatstvo(article: PublicArticle): number {
  return (
    article.variants.length +
    article.addonGroups.length * 3 +
    (article.allergens ? 2 : 0) +
    (article.promo ? 3 : 0) +
    (article.combo ? 2 : 0) +
    (article.description ? 1 : 0)
  );
}

// K14: English names for part of the fixture menus. The rest is left untranslated on
// purpose, so the izlog shows the fallback to the source text (master §7.7).
const PREVODI_EN: Readonly<Record<string, string>> = {
  Kafa: "Coffee",
  Sokovi: "Juices",
  "Doručak": "Breakfast",
  Slatko: "Sweets",
  "Produžena kafa": "Long coffee",
  "Kafa sa mlekom": "Coffee with milk",
  "Topla čokolada": "Hot chocolate",
  "Domaća limunada": "Homemade lemonade",
  "Ceđena pomorandža": "Fresh orange juice",
  "Mineralna voda": "Sparkling water",
  "Kajgana sa slaninom": "Scrambled eggs with bacon",
  "Palačinke sa čokoladom": "Chocolate pancakes",
  Predjela: "Starters",
  "Supe i salate": "Soups and salads",
  "Sa roštilja": "From the grill",
  "Glavna jela": "Main courses",
  Prilozi: "Sides",
  Dezerti: "Desserts",
  "Pića": "Drinks",
  Vina: "Wines",
  "Vinska karta": "Wine list",
  "Bela vina": "White wines",
  "Crvena vina": "Red wines",
  "Ajvar sa tostom": "Ajvar with toast",
  "Domaći kulen": "Homemade kulen sausage",
  "Pržene lignje": "Fried squid",
  "Bruschetta sa paradajzom": "Tomato bruschetta",
  "Teleća čorba": "Veal soup",
  "Paradajz čorba": "Tomato soup",
  "Riblja čorba": "Fish soup",
  "Krem supa od pečuraka": "Cream of mushroom soup",
  "Šopska salata": "Shopska salad",
  "Grčka salata": "Greek salad",
  "Cezar salata sa piletinom": "Chicken Caesar salad",
  "Gurmanska pljeskavica": "Gourmet burger patty",
  "Pileći file na žaru": "Grilled chicken fillet",
  "Svinjski vrat": "Pork neck",
  "Jagnjeći kotleti": "Lamb chops",
  "Punjene paprike": "Stuffed peppers",
  "Gulaš od junetine": "Beef goulash",
  "Brancin na žaru": "Grilled sea bass",
  "Rižoto sa pečurkama": "Mushroom risotto",
  "Pečeni krompir": "Roast potatoes",
  "Grilovano povrće": "Grilled vegetables",
  "Čokoladni sufle": "Chocolate soufflé",
  "Voćna salata": "Fruit salad",
  "Točeno pivo": "Draught beer",
  "Gazirani sok": "Soft drink",
};

type Prevodi = MenuDraftSnapshot["articles"][number]["translations"];

/** Confirmed translations for the names this fixture knows; others keep what they had. */
function prevedi(translations: Prevodi, naziv: string | null, lang: string, polje: "name" | "publicTitle"): Prevodi {
  const prevod = naziv && lang === "en" ? PREVODI_EN[naziv] : undefined;
  if (!prevod) return translations;
  return { ...(translations ?? {}), [lang]: { ...(translations?.[lang] ?? {}), [polje]: prevod, status: "confirmed" as const } };
}

/** The menu in two languages (source + the asked one; `sr` adds English), part of it translated. */
function dvaJezika(snapshot: MenuDraftSnapshot, prevod: string): MenuDraftSnapshot {
  return {
    ...snapshot,
    settings: { ...snapshot.settings, languages: { source: "sr", translations: [prevod] } },
    sections: snapshot.sections.map((row) => ({ ...row, translations: prevedi(row.translations, row.name, prevod, "name") })),
    articles: snapshot.articles.map((row) => ({ ...row, translations: prevedi(row.translations, row.name, prevod, "name") })),
    pages: snapshot.pages.map((row) => ({
      ...row,
      translations: prevedi(row.translations, row.publicTitle, prevod, "publicTitle"),
    })),
  };
}

/** K14: the fixture EUR rate (an invented value, dated the izlog day; `kurs=star` = ten days older). */
function izlogKurs(star: boolean): MenuKurs {
  const dan = epochToBelgradeLocal(IZLOG_SADA - (star ? 10 : 0) * 24 * 60 * 60 * 1000).slice(0, 10);
  return { rate: 117.2, effectiveDate: dan, fetchedAt: IZLOG_SADA - 2 * 60 * 60 * 1000 };
}

/** The izlog address with one parameter changed (the language links stay inside the izlog). */
function izlogHref(params: PublicPreviewParams, jezik: string): string {
  const upit = new URLSearchParams();
  upit.set("primer", params.primer);
  if (params.layout) upit.set("layout", params.layout);
  if (params.mediji) upit.set("mediji", params.mediji);
  if (params.paleta) upit.set("paleta", params.paleta);
  if (params.stanje) upit.set("stanje", params.stanje);
  if (params.stranica) upit.set("stranica", params.stranica);
  if (params.alergeni.length > 0) upit.set("alergen", params.alergeni.join(","));
  if (params.valuta) upit.set("valuta", params.valuta);
  if (params.starKurs) upit.set("kurs", "star");
  if (params.pretraga) upit.set("pretraga", params.pretraga);
  if (params.filteri.length > 0) upit.set("filter", params.filteri.join(","));
  if (params.tema) upit.set("tema", params.tema);
  upit.set("jezik", jezik);
  return `/dev/menu-public-preview?${upit.toString()}`;
}

export function javniIzlog(params: PublicPreviewParams): JavniIzlogPrikaz {
  if (params.stariRenderer) return { vrsta: "stari" };
  const spec = PRIMERI[params.primer];
  const stanje = params.stanje ?? (params.long ? "veliki" : null);
  const size: IzlogMenuSize = stanje === "veliki" ? "veliki" : stanje === "razdelnik" ? "srednji" : spec.size;
  const menu = fixtureMenu(size);
  const paletteId =
    params.paleta && jePoznataPaleta(params.paleta)
      ? params.paleta
      : params.darkDesign
        ? "ponoc"
        : spec.presentation.paletteId ?? MENU_DEFAULT_PRESENTATION.paletteId;
  const presentation: MenuPresentationValues = {
    ...MENU_DEFAULT_PRESENTATION,
    ...spec.presentation,
    paletteId,
    ...(params.layout ? { layout: LAYOUT[params.layout] } : {}),
    // K14: search and every filter for the tool states and the large menu; the EUR switch for valuta/kurs.
    ...(params.pretraga || params.filteri.length > 0 || stanje === "veliki"
      ? { search: true, filters: [...MENU_FILTER_CODES] }
      : {}),
    ...(params.valuta || params.starKurs ? { currencyToggle: true } : {}),
  };
  const mediji = params.mediji ? MEDIJ[params.mediji] : spec.mediji;
  const navigacija = stanje === "razdelnik" && spec.navigacija === "standalone" ? "back" : spec.navigacija;
  const pripremljeno = pripremi(menu, presentation, mediji, navigacija, stanje === "prazno");
  const slike = pripremljeno.slike;
  // K14: `alergen=` means the venue keeps allergens; `jezik=` publishes a second language.
  let snapshot = params.alergeni.length > 0
    ? { ...pripremljeno.snapshot, settings: { ...pripremljeno.snapshot.settings, allergensEnabled: true } }
    : pripremljeno.snapshot;
  const prevod = params.jezik ? (params.jezik === "sr" ? "en" : params.jezik) : null;
  if (prevod) snapshot = dvaJezika(snapshot, prevod);
  const languages = prevod ? ["sr", prevod] : ["sr"];
  const lang = params.jezik ?? "sr";
  const { splitter, page } = compile(snapshot, languages, lang);
  const jezikLinkovi = Object.fromEntries(splitter.languages.map((kod) => [kod, izlogHref(params, kod)]));
  const lokal = { naziv: spec.naziv ?? menu.venueName, slug: menu.slug, logoUrl: null };

  if (stanje === "razdelnik") {
    const naslovne: Record<string, PublicImage | null> = {};
    splitter.pages.forEach((meta, index) => {
      naslovne[meta.key] = mediji === "image" && index === 0 ? izlogSlika(0) : null;
    });
    return {
      vrsta: "razdelnik",
      view: { lokal, stranice: splitter.pages, jezik: splitter.lang, jezici: splitter.languages },
      presentation,
      naslovne,
      jezikLinkovi,
    };
  }

  const meta =
    splitter.pages.find((row) => row.slug === params.stranica) ??
    splitter.pages.find((row) => row.isDefault) ??
    splitter.pages[0];
  const doc = meta ? page(meta.key) : null;
  if (!meta || !doc) throw new Error("izlog: the compiled version has no page");
  const shown = doc.sections.filter((section) => section.articles.length > 0);
  const kategorija = params.kategorija !== null ? shown[params.kategorija - 1]?.key ?? null : null;
  const najbogatiji = params.detalj
    ? doc.sections
        .flatMap((section) => section.articles)
        .reduce<PublicArticle | null>((best, article) => (!best || bogatstvo(article) > bogatstvo(best) ? article : best), null)
    : null;
  return {
    vrsta: "stranica",
    view: {
      lokal,
      stranica: doc.page,
      stranice: splitter.pages,
      sekcije: doc.sections,
      jezik: splitter.lang,
      jezici: splitter.languages,
      alergeniUkljuceni: splitter.allergensEnabled,
      mogucnosti: mogucnostiIzPrezentacije(presentation),
    },
    presentation,
    slike,
    nedostupni: menu.unavailableArticleKeys,
    sadaMs: IZLOG_SADA,
    pocetniDetalj: najbogatiji?.key ?? null,
    pocetnaKategorija: kategorija,
    kurs: presentation.currencyToggle ? izlogKurs(params.starKurs) : null,
    pocetno: {
      upit: params.pretraga ?? undefined,
      filteri: params.filteri,
      alergeni: params.alergeni,
      valuta: params.valuta ?? undefined,
    },
    jezikLinkovi,
  };
}
