// ScanMe Menu V1 — the editor's live preview through the PUBLIC renderer (K13,
// plan K12 §4.3; replaces the interim K10 adapter). The draft the editor holds
// (StudioRadniSadrzaj) becomes the same JavnaStranicaView the public page
// gets from a published version, by the same rules as compilePage
// (lib/menu/snapshot.ts): hidden rows and empty sections stay out, the
// internal "Kompletan meni" is never a title, and "Privremeno nedostupno" is
// shown as on the public menu. What the editor model does not carry yet
// (variants' prices, add-ons, allergens, promotions, images) arrives with
// K15/K16; until then those parts of the preview are simply absent.

import type { JavnaStranicaView } from "../public-view";
import type { PublicArticle, PublicSection } from "../snapshot";
import type { StudioArtikal, StudioRadniSadrzaj } from "./model";

export type JavniPregled = {
  view: JavnaStranicaView;
  /** Article keys "Privremeno nedostupno" right now (live, like the public menu). */
  nedostupni: string[];
};

function artikal(row: StudioArtikal): PublicArticle {
  return {
    key: row.key,
    kind: row.vrsta,
    name: row.naziv,
    description: row.opis,
    quantityValue: row.kolicina,
    quantityUnit: row.jedinica,
    priceRsd: row.cena,
    variants: [],
    addonGroups: [],
    noteEnabled: false,
    media: { mode: row.medij, imageMediaId: null, iconKey: row.ikonica },
    allergens: null,
    tags: [],
    promo: null,
    combo: null,
  };
}

export function javniPregled(
  lokal: { naziv: string; slug: string },
  sadrzaj: StudioRadniSadrzaj,
  nedostupni: ReadonlySet<string>,
): JavniPregled {
  const sekcije: PublicSection[] = [];
  for (const sekcija of sadrzaj.sekcije) {
    const articles = sekcija.redovi.filter((red) => !red.sakriven).map((red) => artikal(red.artikal));
    if (articles.length === 0) continue;
    sekcije.push({ key: sekcija.key, name: sekcija.naziv, description: null, iconKey: null, articles });
  }
  const stranica = {
    key: sadrzaj.stranica.key,
    slug: "",
    // The default page has no public title; "Kompletan meni" exists only in the editor.
    title: sadrzaj.stranica.podrazumevana ? null : sadrzaj.stranica.naziv,
    isDefault: sadrzaj.stranica.podrazumevana,
    navigation: "standalone" as const,
    iconKey: null,
  };
  const shown = new Set(sekcije.flatMap((sekcija) => sekcija.articles.map((row) => row.key)));
  return {
    view: {
      lokal: { naziv: lokal.naziv, slug: lokal.slug, logoUrl: null },
      stranica,
      stranice: [stranica],
      sekcije,
      jezik: "sr",
      jezici: ["sr"],
      alergeniUkljuceni: false,
    },
    nedostupni: [...nedostupni].filter((key) => shown.has(key)).sort(),
  };
}
