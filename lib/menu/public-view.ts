// ScanMe Menu V1 (K13, plan K12 §4.2) — the pure view logic of the public
// menu: what the three layouts and the splitter show, decided here so the
// components stay presentational and the rules are tested without a DOM.
//
//   anchors        stable, unique fragment ids per section / category / article
//   izborMedija    image, icon or nothing per article and layout (master §7.4;
//                  `Kompaktno` never shows media; a missing image falls back
//                  to the icon, master §7.9)
//   cenaPrikaz     base price, variants and the promotion at a moment (§7.6)
//   oznakeArtikla  tags and the promotion label, "Preporuka" once (K04)
//   imaDetalj      whether a row opens the article detail
//   kategorije     the cards of `Kategorije`
//
// Input is the published page (lib/menu/snapshot.ts Public*), never a draft.

import { promoPrices, promoStateAt } from "./promo";
import type { MenuLayout, MenuPresentationValues } from "./presentation";
import type { PublicArticle, PublicPageMeta, PublicSection } from "./snapshot";

/** A resolved article image: the small variant for lists, the large one for the detail. */
export type PublicImage = { thumbUrl: string; url: string; width: number; height: number };

export type JavniLokal = { naziv: string; slug: string; logoUrl: string | null };

/** One page as the renderer gets it. */
export type JavnaStranicaView = {
  lokal: JavniLokal;
  stranica: PublicPageMeta;
  /** Every public page of the version, in order (navigation between pages). */
  stranice: PublicPageMeta[];
  sekcije: PublicSection[];
  jezik: string;
  jezici: string[];
  alergeniUkljuceni: boolean;
  /** K14: what the venue turned on for guests; absent = none (the editor preview). */
  mogucnosti?: JavneMogucnosti;
};

/** K14: the guest tools of a published presentation (master §7.2, §5.3). */
export type JavneMogucnosti = {
  pretraga: boolean;
  /** The venue's filter codes; the renderer shows only those the page has. */
  filteri: string[];
  /** The RSD/EUR switch; shown only with a fresh rate. */
  valuta: boolean;
};

export function mogucnostiIzPrezentacije(
  presentation: Pick<MenuPresentationValues, "search" | "filters" | "currencyToggle">,
): JavneMogucnosti {
  return { pretraga: presentation.search, filteri: [...presentation.filters], valuta: presentation.currencyToggle };
}

/** The splitter as the renderer gets it. */
export type JavniRazdelnikView = {
  lokal: JavniLokal;
  stranice: PublicPageMeta[];
  jezik: string;
  jezici: string[];
};

// -----------------------------------------------------------------------------
// Anchors
// -----------------------------------------------------------------------------

const safe = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, "-");

export const sidroSekcije = (key: string) => `s-${safe(key)}`;
export const sidroKategorije = (key: string) => `k-${safe(key)}`;
export const sidroArtikla = (key: string) => `a-${safe(key)}`;

/** The category key in a `#k-…` fragment, when it names a category of the page. */
export function kategorijaIzHesa(hes: string, sekcije: readonly PublicSection[]): string | null {
  const id = hes.startsWith("#") ? hes.slice(1) : hes;
  return sekcije.find((section) => sidroKategorije(section.key) === id)?.key ?? null;
}

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

export type IzborMedija =
  | { vrsta: "slika"; slika: PublicImage }
  | { vrsta: "ikonica"; iconKey: string | null }
  | { vrsta: "bez" };

/**
 * What an article shows. `compact` never shows media. An image without a
 * resolved URL (not uploaded yet, purged, past the cap) shows the icon. An
 * article without its own icon takes its section's (`rezervnaIkonica`); with
 * neither the default glyph shows (iconKey null).
 */
export function izborMedija(
  article: Pick<PublicArticle, "media">,
  layout: MenuLayout,
  slike: Readonly<Record<string, PublicImage>>,
  rezervnaIkonica: string | null = null,
): IzborMedija {
  if (layout === "compact") return { vrsta: "bez" };
  const { mode, imageMediaId, iconKey } = article.media;
  if (mode === "none") return { vrsta: "bez" };
  if (mode === "image") {
    const slika = imageMediaId ? slike[imageMediaId] : undefined;
    if (slika) return { vrsta: "slika", slika };
  }
  return { vrsta: "ikonica", iconKey: iconKey ?? rezervnaIkonica };
}

// -----------------------------------------------------------------------------
// Price
// -----------------------------------------------------------------------------

export type CenaStavka = { key: string; naziv: string; rsd: number; akcijska: number | null };

export type CenaPrikaz =
  | { vrsta: "osnovna"; rsd: number; akcijska: number | null }
  | { vrsta: "varijante"; stavke: CenaStavka[] }
  | { vrsta: "bez" };

/** True when the article's promotion runs at `sadaMs` (master §7.6: the end gives the regular price back). */
export function akcijaAktivna(article: Pick<PublicArticle, "promo">, sadaMs: number): boolean {
  return article.promo !== null && promoStateAt(article.promo, sadaMs) === "active";
}

export function cenaPrikaz(
  article: Pick<PublicArticle, "priceRsd" | "variants" | "promo">,
  sadaMs: number,
): CenaPrikaz {
  const promo = article.promo && akcijaAktivna(article, sadaMs)
    ? promoPrices(article.promo, {
        basePriceRsd: article.priceRsd,
        variantsEnabled: article.variants.length > 0,
        variants: article.variants.map((variant) => ({ key: variant.key, priceRsd: variant.priceRsd })),
      })
    : null;
  const akcijskaZa = (key: string | null) => {
    const entry = promo?.find((row) => row.key === key);
    return entry && entry.promoRsd < entry.regularRsd ? entry.promoRsd : null;
  };
  if (article.variants.length > 0) {
    return {
      vrsta: "varijante",
      stavke: article.variants.map((variant) => ({
        key: variant.key,
        naziv: variant.name,
        rsd: variant.priceRsd,
        akcijska: akcijskaZa(variant.key),
      })),
    };
  }
  if (article.priceRsd !== null) {
    return { vrsta: "osnovna", rsd: article.priceRsd, akcijska: akcijskaZa(null) };
  }
  return { vrsta: "bez" };
}

// -----------------------------------------------------------------------------
// Badges
// -----------------------------------------------------------------------------

export type OznakaArtikla =
  | { vrsta: "akcija" }
  | { vrsta: "oznaka"; kod: string };

/**
 * The badges of an article in a stable order: the running promotion's label
 * first, then the tags. "Preporuka" is both a tag and a promotion label
 * (master §5.5, §7.6); an article with both shows it once.
 */
export function oznakeArtikla(
  article: Pick<PublicArticle, "tags" | "promo">,
  sadaMs: number,
): OznakaArtikla[] {
  const out: OznakaArtikla[] = [];
  const kodovi = new Set<string>();
  if (article.promo && akcijaAktivna(article, sadaMs) && article.promo.label) {
    if (article.promo.label === "promo") out.push({ vrsta: "akcija" });
    else {
      out.push({ vrsta: "oznaka", kod: "recommended" });
      kodovi.add("recommended");
    }
  }
  for (const kod of article.tags) {
    if (kodovi.has(kod)) continue;
    kodovi.add(kod);
    out.push({ vrsta: "oznaka", kod });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Detail
// -----------------------------------------------------------------------------

/** About two lines of a description at the reading width; longer ones are clamped in the row. */
export const MENU_OPIS_U_REDU = 120;

/**
 * Whether a row opens the article detail. `Tok` and `Kategorije` always do (a
 * bigger image, everything about the article). `Kompaktno` only when the
 * detail adds what the row does not show, so a 400-line wine list is not 400
 * tab stops.
 */
export function imaDetalj(
  article: Pick<PublicArticle, "addonGroups" | "combo" | "description">,
  layout: MenuLayout,
  alergeniUkljuceni: boolean,
): boolean {
  if (layout !== "compact") return true;
  return (
    article.addonGroups.length > 0 ||
    (article.combo !== null && article.combo.components.length > 0) ||
    alergeniUkljuceni ||
    (article.description?.length ?? 0) > MENU_OPIS_U_REDU
  );
}

/** "0,33 l", "250 g": the quantity with a decimal comma; null when the article has none. */
export function kolicinaTekst(article: Pick<PublicArticle, "quantityValue" | "quantityUnit">): string | null {
  if (article.quantityValue === null || !article.quantityUnit) return null;
  return `${String(article.quantityValue).replace(".", ",")} ${article.quantityUnit}`;
}

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------

export type KategorijaKartica = {
  key: string;
  naziv: string;
  opis: string | null;
  broj: number;
  iconKey: string | null;
  /** The first article image of the section, when the layout shows images. */
  slika: PublicImage | null;
};

/** The cards of `Kategorije`, in page order. A section without articles has no card. */
export function kategorije(
  sekcije: readonly PublicSection[],
  slike: Readonly<Record<string, PublicImage>>,
): KategorijaKartica[] {
  return sekcije
    .filter((section) => section.articles.length > 0)
    .map((section) => {
      let slika: PublicImage | null = null;
      for (const article of section.articles) {
        const izbor = izborMedija(article, "categories", slike, section.iconKey);
        if (izbor.vrsta === "slika") {
          slika = izbor.slika;
          break;
        }
      }
      const prvaIkonica =
        section.articles.find((article) => article.media.mode === "icon" && article.media.iconKey)?.media.iconKey ?? null;
      return {
        key: section.key,
        naziv: section.name,
        opis: section.description,
        broj: section.articles.length,
        iconKey: section.iconKey ?? prvaIkonica,
        slika,
      };
    });
}

/** The category after `key`, for "Sledeća: …" (null on the last one). */
export function sledecaKategorija(
  sekcije: readonly PublicSection[],
  key: string,
): PublicSection | null {
  const shown = sekcije.filter((section) => section.articles.length > 0);
  const index = shown.findIndex((section) => section.key === key);
  return index >= 0 && index + 1 < shown.length ? shown[index + 1] : null;
}

// -----------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------

/** The public path of a page: the default page of a one-page menu is the menu link itself. */
export function putStranice(slug: string, stranica: Pick<PublicPageMeta, "slug">, stranice: readonly unknown[]): string {
  return stranice.length <= 1 ? `/${slug}/meni` : `/${slug}/meni/${stranica.slug}`;
}

export function brojArtikala(sekcije: readonly PublicSection[]): number {
  return sekcije.reduce((sum, section) => sum + section.articles.length, 0);
}
