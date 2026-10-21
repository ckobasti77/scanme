// ScanMe Menu V1 (K16) — what the editor's translation views list (master §7.7).
//
// PURE, on the draft snapshot by keys, so the server (convex/menuTranslations.ts
// after loadDraft) and the izlog's memory build the SAME list:
//   - a page: its public title (when it has one), its sections, the articles
//     shown on it (once each), their variants when variants are on, and the
//     add-on groups (with their add-ons) linked to those articles;
//   - Room service: its own categories.
// Hidden rows are listed too: they are part of the draft and may be shown later.
// `idOf` turns a key into what the actions address (a Convex id on the server).

import { MENU_TEXT } from "../limits";
import type { MenuDraftSnapshot, SnapshotTranslations } from "../snapshot";
import type { MenuTranslationField, MenuTranslations } from "../translation-status";
import type { StudioPrevodStavka, StudioPrevodVrsta } from "./model";

/** The fields guests read, per kind of thing (and nothing else is translated). */
export const POLJA_PREVODA: Record<StudioPrevodVrsta, readonly MenuTranslationField[]> = {
  page: ["publicTitle"],
  section: ["name", "description"],
  article: ["name", "description"],
  variant: ["name"],
  addonGroup: ["name"],
  addonOption: ["name"],
  roomServiceCategory: ["name"],
};

/** A translation may be as long as the source field may be. */
export function granicaPrevoda(vrsta: StudioPrevodVrsta, polje: MenuTranslationField): number {
  if (polje === "publicTitle") return MENU_TEXT.pagePublicTitle;
  switch (vrsta) {
    case "section":
      return polje === "name" ? MENU_TEXT.sectionName : MENU_TEXT.sectionDescription;
    case "article":
      return polje === "name" ? MENU_TEXT.articleName : MENU_TEXT.articleDescription;
    case "variant":
      return MENU_TEXT.variantName;
    case "addonGroup":
      return MENU_TEXT.addonGroupName;
    case "addonOption":
      return MENU_TEXT.addonOptionName;
    case "roomServiceCategory":
      return MENU_TEXT.roomServiceCategoryName;
    case "page":
      return MENU_TEXT.pagePublicTitle;
  }
}

/** At most this many entities in one view (a very large page lists the first ones). */
export const STUDIO_PREVODI_MAX = 1_500;

type IdOf = (vrsta: StudioPrevodVrsta, key: string) => string;
const poKljucu: IdOf = (_vrsta, key) => key;

const tr = (value: SnapshotTranslations): MenuTranslations | null => (value as MenuTranslations | null) ?? null;

const poRedu = <T extends { order: number; key?: string }>(a: T, b: T) =>
  a.order - b.order || ((a.key ?? "") < (b.key ?? "") ? -1 : 1);

/** The article and its variants (the article detail lists exactly these). */
export function stavkeArtikla(
  snapshot: MenuDraftSnapshot,
  artikalKey: string,
  grupa: StudioPrevodStavka["grupa"],
  idOf: IdOf = poKljucu,
): StudioPrevodStavka[] {
  const article = snapshot.articles.find((candidate) => candidate.key === artikalKey);
  if (!article) return [];
  const stavke: StudioPrevodStavka[] = [
    {
      vrsta: "article",
      id: idOf("article", article.key),
      key: article.key,
      izvor: { name: article.name, description: article.description },
      prevodi: tr(article.translations),
      grupa,
      pripada: null,
    },
  ];
  if (article.variantsEnabled) {
    for (const variant of snapshot.variants.filter((v) => v.articleKey === article.key).sort(poRedu)) {
      stavke.push({
        vrsta: "variant",
        id: idOf("variant", variant.key),
        key: variant.key,
        izvor: { name: variant.name },
        prevodi: tr(variant.translations),
        grupa,
        pripada: article.name,
      });
    }
  }
  return stavke;
}

/** Everything a guest can read on one page, in the order of the page. */
export function prevodiStranice(
  snapshot: MenuDraftSnapshot,
  stranicaKey: string,
  idOf: IdOf = poKljucu,
): { stavke: StudioPrevodStavka[]; skraceno: boolean } | null {
  const page = snapshot.pages.find((candidate) => candidate.key === stranicaKey);
  if (!page) return null;
  const stavke: StudioPrevodStavka[] = [];
  if (page.publicTitle) {
    stavke.push({
      vrsta: "page",
      id: idOf("page", page.key),
      key: page.key,
      izvor: { publicTitle: page.publicTitle },
      prevodi: tr(page.translations),
      grupa: { vrsta: "stranica", naziv: null },
      pripada: null,
    });
  }
  const vidjeni = new Set<string>();
  const grupeDodataka: string[] = [];
  const articles = new Map(snapshot.articles.map((article) => [article.key, article]));
  for (const section of snapshot.sections.filter((s) => s.pageKey === page.key).sort(poRedu)) {
    const grupa = { vrsta: "sekcija" as const, naziv: section.name };
    stavke.push({
      vrsta: "section",
      id: idOf("section", section.key),
      key: section.key,
      izvor: { name: section.name, description: section.description },
      prevodi: tr(section.translations),
      grupa,
      pripada: null,
    });
    const placements = snapshot.placements.filter((p) => p.pageKey === page.key && p.sectionKey === section.key).sort(poRedu);
    for (const placement of placements) {
      if (vidjeni.has(placement.articleKey)) continue;
      vidjeni.add(placement.articleKey);
      stavke.push(...stavkeArtikla(snapshot, placement.articleKey, grupa, idOf));
      const article = articles.get(placement.articleKey);
      if (!article?.addonsEnabled) continue;
      for (const link of snapshot.articleAddonGroups.filter((l) => l.articleKey === article.key).sort(poRedu)) {
        if (!grupeDodataka.includes(link.groupKey)) grupeDodataka.push(link.groupKey);
      }
    }
  }
  const dodaci = { vrsta: "dodaci" as const, naziv: null };
  for (const groupKey of grupeDodataka) {
    const group = snapshot.addonGroups.find((candidate) => candidate.key === groupKey);
    if (!group) continue;
    stavke.push({
      vrsta: "addonGroup",
      id: idOf("addonGroup", group.key),
      key: group.key,
      izvor: { name: group.name },
      prevodi: tr(group.translations),
      grupa: dodaci,
      pripada: null,
    });
    for (const option of snapshot.addonOptions.filter((o) => o.groupKey === group.key).sort(poRedu)) {
      stavke.push({
        vrsta: "addonOption",
        id: idOf("addonOption", option.key),
        key: option.key,
        izvor: { name: option.name },
        prevodi: tr(option.translations),
        grupa: dodaci,
        pripada: group.name,
      });
    }
  }
  return { stavke: stavke.slice(0, STUDIO_PREVODI_MAX), skraceno: stavke.length > STUDIO_PREVODI_MAX };
}

/** The Room service categories (their names are what guests read above the articles). */
export function prevodiRoomServicea(snapshot: MenuDraftSnapshot, idOf: IdOf = poKljucu): StudioPrevodStavka[] {
  const grupa = { vrsta: "room-service" as const, naziv: null };
  return snapshot.roomService.categories
    .slice()
    .sort(poRedu)
    .map((category) => ({
      vrsta: "roomServiceCategory" as const,
      id: idOf("roomServiceCategory", category.key),
      key: category.key,
      izvor: { name: category.name },
      prevodi: tr(category.translations),
      grupa,
      pripada: null,
    }));
}
