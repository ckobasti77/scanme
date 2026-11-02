// ScanMe Menu V1 (K13) — an article or page icon from the Menu icon set
// (components/menu/menu-glyph-map.ts, the same set the editor offers). A
// missing or unknown key takes `rezerva` (the section's icon), then the
// default glyph — never an empty frame.
// Always decorative: the name next to it says what it is.

import { DEFAULT_MENU_GLYPH, MENU_PRODUCT_TYPE_GLYPHS, normalizeProductType } from "../menu-glyph-map";

export function JavniGlif({
  iconKey,
  rezerva = null,
  className,
}: {
  iconKey: string | null;
  rezerva?: string | null;
  className?: string;
}) {
  // Map lookups, not a function call (react-hooks/static-components).
  const Glyph =
    MENU_PRODUCT_TYPE_GLYPHS[normalizeProductType(iconKey ?? "")] ??
    MENU_PRODUCT_TYPE_GLYPHS[normalizeProductType(rezerva ?? "")] ??
    DEFAULT_MENU_GLYPH;
  return <Glyph aria-hidden="true" className={className} />;
}
