// The product-type → glyph map (RFC-003 §2.4, §2.14 M.12 — TASK-50).
//
// `productType` on a menu item is a deliberately FREE string
// (`lib/menu-blocks.ts` `MenuItem.productType`, RFC-003 §2.3 / §5 Q2): the set
// of product types is the owner's decision, and TASK-49 knowingly left it
// open rather than closing it into a union. That means this map can never be
// exhaustive by construction — so `glyphForProductType` is written as a TOTAL
// function: every string in, a glyph component out, never `undefined`. The
// no-empty-frame rule (§2.4) depends on that totality, not on the map being
// complete.
//
// Adding a new icon later is a one-place edit: draw it in
// `domestic-icons.tsx`, add one row below.

import { UtensilsCrossed, type LucideIcon } from "lucide-react";
import {
  Ajvar,
  Burek,
  Cevapi,
  type DomesticIconComponent,
  DomacaKafa,
  Kajmak,
  Kolac,
  Palacinke,
  Pivo,
  Pljeskavica,
  Rakija,
  Riba,
  Rostilj,
  Salata,
  Sladoled,
  Sok,
  Supa,
  Testenina,
  TurskaKafa,
  Vino,
  Voda,
} from "./domestic-icons";

export type MenuIconComponent = DomesticIconComponent | LucideIcon;

/** The fallback tile glyph for any `productType` the map does not know. */
export const DEFAULT_MENU_GLYPH: MenuIconComponent = UtensilsCrossed;

// Canonical keys are ASCII, lowercase, diacritic-free (see
// `normalizeProductType` below) — the owner types "Ćevapi" or "cevapi" or
// "Roštilj", all of which normalize to the same lookup key.
//
// Exported (not module-private): a render site does the map lookup itself —
// `MENU_PRODUCT_TYPE_GLYPHS[key] ?? DEFAULT_MENU_GLYPH` — rather than calling
// `glyphForProductType`, mirroring the accepted shape in
// `components/scanme-links/template-icon.tsx` (`genericIcons[iconKey] ??
// LinkIcon`); a component resolved via a plain function call at render time
// trips `react-hooks/static-components`.
export const MENU_PRODUCT_TYPE_GLYPHS: Record<string, MenuIconComponent> = {
  rakija: Rakija,
  "domaca kafa": DomacaKafa,
  "turska kafa": TurskaKafa,
  pivo: Pivo,
  vino: Vino,
  sok: Sok,
  voda: Voda,
  burek: Burek,
  pljeskavica: Pljeskavica,
  cevapi: Cevapi,
  kajmak: Kajmak,
  ajvar: Ajvar,
  supa: Supa,
  corba: Supa,
  salata: Salata,
  riba: Riba,
  rostilj: Rostilj,
  testenina: Testenina,
  palacinke: Palacinke,
  sladoled: Sladoled,
  kolac: Kolac,
};

/** The known keys this task's snapshot test iterates over. */
export const MENU_KNOWN_PRODUCT_TYPES = Object.keys(
  MENU_PRODUCT_TYPE_GLYPHS,
) as readonly string[];

// Strips combining diacritics after NFD decomposition (U+0300–U+036F), so
// "Ćevapi" / "cevapi" / "ćEVAPI" all normalize to the same lookup key.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function normalizeProductType(productType: string): string {
  return productType
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .trim()
    .toLowerCase();
}

/**
 * Total: any string (including empty, whitespace, or a type the owner
 * invents tomorrow) resolves to a glyph component — never `undefined`, so a
 * photo-less item can never render an empty tile (RFC-003 §2.4).
 */
export function glyphForProductType(productType: string): MenuIconComponent {
  const key = normalizeProductType(productType);
  return MENU_PRODUCT_TYPE_GLYPHS[key] ?? DEFAULT_MENU_GLYPH;
}
