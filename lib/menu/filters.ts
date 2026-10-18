// ScanMe Menu V1 (K14, plan K12 §6.1) — the guest's filters on a public menu
// page (master §7.2). The venue chooses which supported filters exist
// (presentation.filters); a guest sees only those that at least one article
// of the page has, so an empty or inapplicable filter never shows. Several
// chosen filters combine with AND. The supported codes are the article tags
// plus `promo` (a promotion running right now). There is NO price-range
// filter, and no code is ever read as one (master §7.2, §20).
//
// Allergens are deliberately not filters: they warn and never hide (§7.3,
// lib/menu/allergen-warnings.ts).

import { MENU_TAG_CODES } from "./tags";
import { akcijaAktivna } from "./public-view";
import type { PublicArticle, PublicSection } from "./snapshot";

export const MENU_FILTER_PROMO = "promo";

/** Every supported filter, in the order a guest sees them. */
export const MENU_FILTER_CODES = [...MENU_TAG_CODES, MENU_FILTER_PROMO] as const;
export type MenuFilterCode = (typeof MENU_FILTER_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(MENU_FILTER_CODES);

export function isMenuFilterCode(value: string): value is MenuFilterCode {
  return CODE_SET.has(value);
}

/** Known codes only, unique, in canonical order (an unknown or price code is dropped). */
export function normalizujFiltere(values: readonly string[]): MenuFilterCode[] {
  const chosen = new Set(values);
  return MENU_FILTER_CODES.filter((code) => chosen.has(code));
}

/** The filter codes an article carries at `sadaMs`: its tags, "Preporuka" from a running promotion, `promo`. */
export function filteriArtikla(article: Pick<PublicArticle, "tags" | "promo">, sadaMs: number): Set<string> {
  const kodovi = new Set<string>(article.tags);
  if (akcijaAktivna(article, sadaMs)) {
    kodovi.add(MENU_FILTER_PROMO);
    // A promotion labelled "Preporuka" shows that badge (oznakeArtikla), so it filters as one too.
    if (article.promo?.label === "recommended") kodovi.add("recommended");
  }
  return kodovi;
}

/** The venue's filters that at least one article of the page has right now, in canonical order. */
export function dostupniFilteri(
  sekcije: readonly PublicSection[],
  ukljuceni: readonly string[],
  sadaMs: number,
): MenuFilterCode[] {
  const trazeni = normalizujFiltere(ukljuceni);
  if (trazeni.length === 0) return [];
  const prisutni = new Set<string>();
  for (const sekcija of sekcije) {
    for (const article of sekcija.articles) for (const kod of filteriArtikla(article, sadaMs)) prisutni.add(kod);
  }
  return trazeni.filter((kod) => prisutni.has(kod));
}

/** True when the article carries every chosen filter (AND). */
export function artikalProlazi(
  article: Pick<PublicArticle, "tags" | "promo">,
  izabrani: readonly string[],
  sadaMs: number,
): boolean {
  if (izabrani.length === 0) return true;
  const kodovi = filteriArtikla(article, sadaMs);
  return izabrani.every((kod) => kodovi.has(kod));
}

/** The page narrowed to the chosen filters; sections without articles are dropped. */
export function filtrirajStranicu(
  sekcije: readonly PublicSection[],
  izabrani: readonly string[],
  sadaMs: number,
): PublicSection[] {
  const kodovi = normalizujFiltere(izabrani);
  if (kodovi.length === 0) return [...sekcije];
  return sekcije
    .map((sekcija) => ({ ...sekcija, articles: sekcija.articles.filter((article) => artikalProlazi(article, kodovi, sadaMs)) }))
    .filter((sekcija) => sekcija.articles.length > 0);
}
