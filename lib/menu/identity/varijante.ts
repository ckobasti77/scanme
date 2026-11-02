// ScanMe Menu V1 (K17) — the Premium variants of the three layouts (master
// §7.1, §15.2: "tri kvalitetna početna layouta, uz dodatne Premium
// varijante"). A variant only re-arranges what its layout already shows; it
// never adds media to `Kompaktno` and never changes what a guest can do. The
// renderer reads it as `data-varijanta` on the menu root (CSS only).
//
//   kartice     — Tok with every article on its own card (two columns from 768 px)
//   lista       — Kategorije with the categories as a list of rows, not tiles
//   dve-kolone  — Kompaktno in two text columns from 1024 px (long wine lists)

import type { MenuLayout } from "../presentation";

export type VarijantaRasporeda = {
  id: string;
  layout: MenuLayout;
  /** Every variant is Premium (the account's `extraLayouts` capability). */
  premium: true;
};

export const MENU_VARIJANTE_RASPOREDA: readonly VarijantaRasporeda[] = [
  { id: "kartice", layout: "flow", premium: true },
  { id: "lista", layout: "categories", premium: true },
  { id: "dve-kolone", layout: "compact", premium: true },
];

/** The variant `id` of `layout`, or null (unknown id, absent, or a variant of another layout). */
export function varijantaRasporeda(layout: MenuLayout, id: string | null | undefined): VarijantaRasporeda | null {
  if (!id) return null;
  return MENU_VARIJANTE_RASPOREDA.find((varijanta) => varijanta.id === id && varijanta.layout === layout) ?? null;
}

export function varijanteRasporeda(layout: MenuLayout): VarijantaRasporeda[] {
  return MENU_VARIJANTE_RASPOREDA.filter((varijanta) => varijanta.layout === layout);
}
