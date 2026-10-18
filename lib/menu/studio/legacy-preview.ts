// ScanMe Menu V1 — the editor's interim live preview (K10, K09 §1.5). Until
// the new public renderer exists (K13), the editor shows the draft through the
// EXISTING public renderer (components/menu/menu-template.tsx), fed from the
// editor's own data: one "lista" group per section, in the page's order. What
// guests would not see stays out (hidden placements, sections with no shown
// article); "Kompletan meni" is never a title; an article marked
// "Privremeno nedostupno" is shown as unavailable, as on the public menu.

import type { MenuGroup, MenuItem } from "../../menu-blocks";
import type { StudioRadniSadrzaj } from "./model";

/** The fields of components/menu/menu-view.ts MenuPageView this preview fills. */
export type StudioPregledView = {
  businessName: string;
  design: null;
  groups: MenuGroup[];
  blockImageUrls: Record<string, string>;
};

export function pregledIzSadrzaja(
  lokal: string,
  sadrzaj: StudioRadniSadrzaj,
  nedostupni: ReadonlySet<string>,
): StudioPregledView {
  const groups: MenuGroup[] = [];
  for (const sekcija of sadrzaj.sekcije) {
    const items: MenuItem[] = sekcija.redovi
      .filter((red) => !red.sakriven)
      .map((red) => ({
        id: red.prikazId,
        name: red.artikal.naziv,
        ...(red.artikal.opis ? { description: red.artikal.opis } : {}),
        productType: "jelo",
        ...(red.artikal.cena !== null ? { priceRsd: red.artikal.cena } : {}),
        ...(red.artikal.medij === "icon" && red.artikal.ikonica ? { iconKey: red.artikal.ikonica } : {}),
        available: !nedostupni.has(red.artikal.key),
        variants: [],
        pairings: [],
      }));
    if (items.length === 0) continue;
    groups.push({ shape: "lista", base: { id: sekcija.key, title: sekcija.naziv }, items });
  }
  return { businessName: lokal, design: null, groups, blockImageUrls: {} };
}
