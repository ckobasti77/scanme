// ScanMe Menu V1 (K14, plan K12 §6.1) — search on one public menu page
// (master §7.2: only when the venue turns it on). Diacritics and case never
// matter ("cevapi" finds "Ćevapi", "djuvec" finds "Đuveč"), every word of the
// query must appear, and a word may match the article's name, description,
// variant names or its section's name. The result keeps the page's sections
// and order; a section left without articles is dropped.

import type { PublicArticle, PublicSection } from "./snapshot";
import { cleanText, foldSerbian } from "./text";

/** The longest query the field accepts (a name or two, never a paragraph). */
export const MENU_PRETRAGA_MAX = 60;

/** The folded words of a query; empty = no search. */
export function reciUpita(upit: string): string[] {
  const clean = foldSerbian(cleanText(upit.slice(0, MENU_PRETRAGA_MAX)));
  return clean.length === 0 ? [] : clean.split(" ");
}

function tekstArtikla(article: PublicArticle, sekcija: PublicSection): string {
  return foldSerbian(
    [article.name, article.description ?? "", ...article.variants.map((variant) => variant.name), sekcija.name].join(" "),
  );
}

/** True when every word of the query appears in the article's searchable text. */
export function artikalOdgovara(article: PublicArticle, sekcija: PublicSection, reci: readonly string[]): boolean {
  if (reci.length === 0) return true;
  const tekst = tekstArtikla(article, sekcija);
  return reci.every((rec) => tekst.includes(rec));
}

/** The page narrowed to the query, grouped by section in page order. An empty query returns the page as is. */
export function pretraziStranicu(sekcije: readonly PublicSection[], upit: string): PublicSection[] {
  const reci = reciUpita(upit);
  if (reci.length === 0) return [...sekcije];
  return sekcije
    .map((sekcija) => ({ ...sekcija, articles: sekcija.articles.filter((article) => artikalOdgovara(article, sekcija, reci)) }))
    .filter((sekcija) => sekcija.articles.length > 0);
}
