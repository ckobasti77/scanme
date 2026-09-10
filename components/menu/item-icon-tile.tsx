// The accent icon tile renderer (RFC-003 §2.4, §2.14 M.12 — TASK-50): the
// no-empty-frame rule made concrete. A photo-less menu item shows this tile
// — never an empty frame, never a broken-image glyph, never grey (§2.4). On
// Basic every item is a tile (Basic has no photos, §2.7); on Premium it is
// the fallback for any item without a photo.
//
// Reuses the *pattern* of `components/scanme-links/template-icon.tsx`
// (glyph lookup with a guaranteed fallback) in a new Menu-only component; the
// frozen Links tile CSS and component are neither imported from nor edited
// (§6 freeze ledger).

import { cn } from "@/lib/utils";
import styles from "./item-icon-tile.module.css";
import {
  DEFAULT_MENU_GLYPH,
  MENU_PRODUCT_TYPE_GLYPHS,
  normalizeProductType,
} from "./menu-glyph-map";

export function MenuItemIconTile({
  productType,
  iconKey,
  className,
}: {
  /** `MenuItem.productType` — a free string (`lib/menu-blocks.ts`). */
  productType: string;
  /** `MenuItem.iconKey` — a per-item override; else `productType`'s default. */
  iconKey?: string;
  className?: string;
}) {
  // A map lookup, not a function call, so the resolved glyph reads as stable
  // to `react-hooks/static-components` — the same shape
  // `template-icon.tsx`'s `genericIcons[iconKey] ?? LinkIcon` uses.
  const key = normalizeProductType(iconKey || productType);
  const Glyph = MENU_PRODUCT_TYPE_GLYPHS[key] ?? DEFAULT_MENU_GLYPH;
  return (
    <div className={cn(styles.tile, className)}>
      <Glyph aria-hidden="true" className={styles.glyph} />
    </div>
  );
}
