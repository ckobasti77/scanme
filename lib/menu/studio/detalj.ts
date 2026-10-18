// ScanMe Menu V1 — the article detail of an in-memory menu (K15). The izlog
// keeps its menu as a MenuDraftSnapshot; this builds what the detail shows
// exactly as menuStudio.articleDetail does on the server: the article, its
// variants and add-on groups (with how many articles each group is linked
// to), allergens, tags, promotion and every page and section that shows it.
// Ids are the stable keys; a placement is "<sectionKey>/<articleKey>".

import type { MenuDraftSnapshot } from "../snapshot";
import { prikazId, artikalIzSnapshota } from "./iz-snapshota";
import type { StudioDetaljArtikla, StudioGrupaDodataka, StudioPrikazArtikla } from "./model";

const poRedu = <T extends { order: number; key?: string }>(a: T, b: T) =>
  a.order - b.order || ((a.key ?? "") < (b.key ?? "") ? -1 : 1);

/** The groups of one article, each with its add-ons and its number of linked articles. */
export function grupeArtikla(snapshot: MenuDraftSnapshot, artikalKey: string): StudioGrupaDodataka[] {
  const veze = new Map<string, number>();
  for (const row of snapshot.articleAddonGroups) veze.set(row.groupKey, (veze.get(row.groupKey) ?? 0) + 1);
  return snapshot.articleAddonGroups
    .filter((row) => row.articleKey === artikalKey)
    .sort((a, b) => a.order - b.order)
    .flatMap((row) => {
      const group = snapshot.addonGroups.find((candidate) => candidate.key === row.groupKey);
      if (!group) return [];
      return [
        {
          id: group.key,
          key: group.key,
          naziv: group.name,
          izbor: group.selection,
          obavezna: group.required,
          min: group.minSelect,
          max: group.maxSelect,
          brojArtikala: veze.get(group.key) ?? 1,
          opcije: snapshot.addonOptions
            .filter((option) => option.groupKey === group.key)
            .sort(poRedu)
            .map((option) => ({ id: option.key, key: option.key, naziv: option.name, doplata: option.priceDeltaRsd })),
        },
      ];
    });
}

/** Every appearance of the article, pages by order, then sections by order. */
export function prikaziArtikla(snapshot: MenuDraftSnapshot, artikalKey: string): StudioPrikazArtikla[] {
  const stranice = new Map(snapshot.pages.map((page) => [page.key, page]));
  const sekcije = new Map(snapshot.sections.map((section) => [section.key, section]));
  return snapshot.placements
    .filter((placement) => placement.articleKey === artikalKey)
    .flatMap((placement) => {
      const page = stranice.get(placement.pageKey);
      const section = sekcije.get(placement.sectionKey);
      if (!page || !section) return [];
      return [{ placement, page, section }];
    })
    .sort((a, b) => a.page.order - b.page.order || a.section.order - b.section.order || a.placement.order - b.placement.order)
    .map(({ placement, page, section }) => ({
      prikazId: prikazId(section.key, artikalKey),
      stranicaId: page.key,
      stranica: page.name,
      podrazumevana: page.isDefault,
      arhivirana: page.archivedAt !== null,
      sekcijaId: section.key,
      sekcija: section.name,
      sakriven: placement.visibility === "hidden",
    }));
}

/** The detail of one article, or null when it does not exist. `slikaUrl` resolves an image id. */
export function detaljIzSnapshota(
  snapshot: MenuDraftSnapshot,
  artikalKey: string,
  slikaUrl: (slikaId: string) => string | null = () => null,
): StudioDetaljArtikla | null {
  const article = snapshot.articles.find((candidate) => candidate.key === artikalKey);
  if (!article) return null;
  return {
    artikal: artikalIzSnapshota(article),
    slika: article.imageMediaId ? { id: article.imageMediaId, url: slikaUrl(article.imageMediaId) } : null,
    ukljuceno: { varijante: article.variantsEnabled, dodaci: article.addonsEnabled, napomena: article.noteEnabled },
    varijante: snapshot.variants
      .filter((variant) => variant.articleKey === article.key)
      .sort(poRedu)
      .map((variant) => ({ id: variant.key, key: variant.key, naziv: variant.name, cena: variant.priceRsd })),
    grupe: grupeArtikla(snapshot, article.key),
    alergeniUkljuceni: snapshot.settings.allergensEnabled === true,
    alergeni: article.allergens
      ? { sadrzi: [...article.allergens.contains], tragovi: [...article.allergens.mayContain], drugo: article.allergens.otherText }
      : null,
    oznake: [...(article.tags ?? [])],
    akcija: article.promo,
    prikazi: prikaziArtikla(snapshot, article.key),
  };
}
