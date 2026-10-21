// ScanMe Menu V1 (K14, plan K12 §6.2) — what a guest who marked allergens
// sees on each article (master §7.3). A highlight, never a filter: nothing is
// hidden, and nothing is ever called safe.
//
//   sadrzi     the article lists a marked allergen as an ingredient (the
//              marked traces are listed beside it)
//   tragovi    only as possible traces ("Može sadržati tragove")
//   nepoznato  the venue recorded nothing for this article — said plainly,
//              because missing data never means "safe"
//   null       nothing to show: allergens are off, nothing is marked, or the
//              record lists none of the marked allergens (still NOT "safe":
//              the staff disclaimer stays on the page and in the detail)
//
// Built on allergenMatch (lib/menu/allergens.ts), so the editor and the guest
// read an article the same way.

import { allergenMatch, isMenuAllergenCode, MENU_ALLERGEN_CODES, type MenuAllergenCode } from "./allergens";
import type { PublicArticle, PublicSection } from "./snapshot";

export type UpozorenjeAlergena =
  | { vrsta: "sadrzi"; sadrzi: MenuAllergenCode[]; tragovi: MenuAllergenCode[] }
  | { vrsta: "tragovi"; tragovi: MenuAllergenCode[] }
  | { vrsta: "nepoznato" };

/** Known codes only, unique, in canonical order (the 14 categories, then `other`). */
export function normalizujAlergene(values: readonly string[]): MenuAllergenCode[] {
  const chosen = new Set(values.filter(isMenuAllergenCode));
  return MENU_ALLERGEN_CODES.filter((code) => chosen.has(code));
}

function presek(lista: readonly string[], oznaceni: ReadonlySet<string>): MenuAllergenCode[] {
  return normalizujAlergene(lista.filter((code) => oznaceni.has(code)));
}

export function upozorenjeArtikla(
  article: Pick<PublicArticle, "allergens">,
  oznaceni: readonly MenuAllergenCode[],
  ukljuceno: boolean,
): UpozorenjeAlergena | null {
  const zapis = article.allergens
    ? {
        contains: normalizujAlergene(article.allergens.contains),
        mayContain: normalizujAlergene(article.allergens.mayContain),
      }
    : null;
  const ishod = allergenMatch({ enabled: ukljuceno, marked: oznaceni, allergens: zapis });
  if (ishod === "unknown") return { vrsta: "nepoznato" };
  if (!zapis) return null;
  const skup = new Set<string>(oznaceni);
  if (ishod === "contains") {
    return { vrsta: "sadrzi", sadrzi: presek(zapis.contains, skup), tragovi: presek(zapis.mayContain, skup) };
  }
  if (ishod === "may_contain") return { vrsta: "tragovi", tragovi: presek(zapis.mayContain, skup) };
  return null;
}

/** How many articles of the page have no allergen record at all (said plainly, never "safe"). */
export function brojBezPodataka(sekcije: readonly PublicSection[], ukljuceno: boolean): number {
  if (!ukljuceno) return 0;
  let broj = 0;
  for (const sekcija of sekcije) for (const article of sekcija.articles) if (!article.allergens) broj += 1;
  return broj;
}

/** How many articles of the page carry a "Sadrži" or "Može sadržati tragove" warning. */
export function brojUpozorenja(
  sekcije: readonly PublicSection[],
  oznaceni: readonly MenuAllergenCode[],
  ukljuceno: boolean,
): number {
  if (!ukljuceno || oznaceni.length === 0) return 0;
  let broj = 0;
  for (const sekcija of sekcije) {
    for (const article of sekcija.articles) {
      const upozorenje = upozorenjeArtikla(article, oznaceni, ukljuceno);
      if (upozorenje && upozorenje.vrsta !== "nepoznato") broj += 1;
    }
  }
  return broj;
}
