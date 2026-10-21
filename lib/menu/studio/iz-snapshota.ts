// ScanMe Menu V1 — the editor's view of a MenuDraftSnapshot (K10). The izlog
// keeps its menu as a real snapshot (components/menu/fixtures, the same shape
// the publisher compiles), and this module turns it into the page column and
// the work area exactly as the Convex queries would. Ids are the stable keys;
// a placement is identified by "<sectionKey>/<articleKey>" (one article at
// most once per section).

import type { MenuDraftSnapshot, SnapshotArticle } from "../snapshot";
import type { StudioArtikal, StudioRadniSadrzaj, StudioStranica } from "./model";

export function prikazId(sekcijaKey: string, artikalKey: string): string {
  return `${sekcijaKey}/${artikalKey}`;
}

export function artikalIzSnapshota(article: SnapshotArticle): StudioArtikal {
  return {
    id: article.key,
    key: article.key,
    vrsta: article.kind,
    naziv: article.name,
    opis: article.description,
    cena: article.basePriceRsd,
    kolicina: article.quantityValue,
    jedinica: article.quantityUnit,
    medij: article.mediaMode,
    ikonica: article.iconKey,
    varijante: article.variantsEnabled,
    proveriCenu: article.priceCheck !== null,
  };
}

/** The page column: every page by order, with the pages a QR card points at. */
export function straniceIzSnapshota(
  snapshot: MenuDraftSnapshot,
  qrStranice: ReadonlySet<string>,
): StudioStranica[] {
  const brojPrikaza = new Map<string, number>();
  for (const placement of snapshot.placements) {
    brojPrikaza.set(placement.pageKey, (brojPrikaza.get(placement.pageKey) ?? 0) + 1);
  }
  return snapshot.pages
    .slice()
    .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1))
    .map((page) => ({
      id: page.key,
      key: page.key,
      slug: page.slug,
      naziv: page.name,
      podrazumevana: page.isDefault,
      arhivirana: page.archivedAt !== null,
      sakrivena: page.visibility === "hidden",
      imaQr: qrStranice.has(page.key),
      brojPrikaza: brojPrikaza.get(page.key) ?? 0,
    }));
}

/** The work area of one page (null when the page does not exist). */
export function sadrzajIzSnapshota(snapshot: MenuDraftSnapshot, stranicaKey: string): StudioRadniSadrzaj | null {
  const page = snapshot.pages.find((candidate) => candidate.key === stranicaKey);
  if (!page) return null;
  const artikli = new Map(snapshot.articles.map((article) => [article.key, article]));
  const sekcije = snapshot.sections
    .filter((section) => section.pageKey === page.key)
    .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1))
    .map((section) => ({
      id: section.key,
      key: section.key,
      naziv: section.name,
      redosled: section.order,
      redovi: snapshot.placements
        .filter((placement) => placement.pageKey === page.key && placement.sectionKey === section.key)
        .sort((a, b) => a.order - b.order || (a.articleKey < b.articleKey ? -1 : 1))
        .flatMap((placement) => {
          const article = artikli.get(placement.articleKey);
          if (!article) return [];
          return [
            {
              prikazId: prikazId(section.key, article.key),
              redosled: placement.order,
              sakriven: placement.visibility === "hidden",
              artikal: artikalIzSnapshota(article),
            },
          ];
        }),
    }));
  return {
    stranica: {
      id: page.key,
      key: page.key,
      naziv: page.name,
      podrazumevana: page.isDefault,
      arhivirana: page.archivedAt !== null,
    },
    sekcije,
    skraceno: false,
  };
}
