// Izlog fixtures for the public menu (K13, plan K12 §5.4, §7.1): the three
// intentionally different venues — a simple café, a restaurant, a prestige
// restaurant — each with its own palette, font pair, density, emphasis,
// layout and media. The menus go through the REAL publish path:
// fixtureMenu → compileSnapshot → the public parts → parsePublicPage /
// parseSplitter, so the izlog shows exactly what a guest would get.
// Deterministic: fixed clock (IZLOG_SADA), no randomness. Images are the six
// small photos already in public/dev-venue; every fourth article has no
// resolved image, to show the icon fallback (master §7.9).

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
import type { JavniRazdelnikView, JavnaStranicaView, PublicImage } from "@/lib/menu/public-view";
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
    }
  | {
      vrsta: "razdelnik";
      view: JavniRazdelnikView;
      presentation: MenuPresentationValues;
      naslovne: Record<string, PublicImage | null>;
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

function compile(snapshot: MenuDraftSnapshot) {
  const version = compileSnapshot(snapshot, { languages: ["sr"], roomService: false, scheduledPromos: true });
  const publicParts = version.parts.filter((part) => part.scope === "public" && part.lang === "sr");
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
  };
  const mediji = params.mediji ? MEDIJ[params.mediji] : spec.mediji;
  const navigacija = stanje === "razdelnik" && spec.navigacija === "standalone" ? "back" : spec.navigacija;
  const { snapshot, slike } = pripremi(menu, presentation, mediji, navigacija, stanje === "prazno");
  const { splitter, page } = compile(snapshot);
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
    },
    presentation,
    slike,
    nedostupni: menu.unavailableArticleKeys,
    sadaMs: IZLOG_SADA,
    pocetniDetalj: najbogatiji?.key ?? null,
    pocetnaKategorija: kategorija,
  };
}
