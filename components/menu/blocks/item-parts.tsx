// The pieces every group shape composes an item from (TASK-51): the media
// slot (photo, else the accent tile — the no-empty-frame rule, §2.4), the
// name/description/price texts, the variant chips (§2.3) and the "nema više"
// badge (§2.6). Server-renderable: no hooks. The collapsed-items caret
// (`MoreCaret`) moved to its own client module for the §4 TASK-52 accordion and
// is re-exported here so the shape renderers' imports are unchanged.

import { fmt } from "@/lib/i18n";
import { menuSr as dict } from "@/lib/i18n/sr/menu";
import type { MenuItem } from "@/lib/menu-blocks";
import { cn } from "@/lib/utils";
import { MenuItemIconTile } from "../item-icon-tile";
import { formatRsd, menuStorageUrl } from "../menu-view";
import styles from "../menu-template.module.css";

// The image slot. A photo shows when its SIGNED URL resolved (menuStorageUrl
// drops bare ids); everything else is the accent tile — never an empty frame.
export function ItemMedia({
  item,
  className,
}: {
  item: MenuItem;
  className?: string;
}) {
  const url = menuStorageUrl(item.photoStorageId);
  return (
    <div className={cn(styles.media, className)} data-menu-media={url ? "photo" : "tile"}>
      {url ? (
        // Decorative in the list — the name beside it is the accessible text.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.mediaImg} src={url} alt="" loading="lazy" />
      ) : (
        <MenuItemIconTile productType={item.productType} iconKey={item.iconKey} />
      )}
    </div>
  );
}

export function ItemPrice({ item, className }: { item: MenuItem; className?: string }) {
  if (item.priceRsd === undefined) return null;
  return (
    <span className={cn(styles.price, className)}>
      {fmt(dict.priceRsd, { price: formatRsd(item.priceRsd) })}
    </span>
  );
}

export function UnavailableBadge({ item }: { item: MenuItem }) {
  if (item.available) return null;
  return <span className={styles.unavailableBadge}>{dict.unavailableBadge}</span>;
}

// Variants outside the variant table: chips under the item name (§2.3).
export function VariantChips({ item }: { item: MenuItem }) {
  if (item.variants.length === 0) return null;
  return (
    <ul className={styles.variantChips} aria-label={fmt(dict.variantsAria, { name: item.name })}>
      {item.variants.map((variant) => (
        <li key={variant.id} className={styles.variantChip}>
          <span>{variant.label}</span>
          <span className={styles.variantChipPrice}>
            {fmt(dict.priceRsd, { price: formatRsd(variant.priceRsd) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ItemName({ item, as: Tag = "h3" }: { item: MenuItem; as?: "h3" | "span" }) {
  return (
    <Tag className={styles.itemName}>
      {item.name}
      <UnavailableBadge item={item} />
    </Tag>
  );
}

export function ItemDescription({ item }: { item: MenuItem }) {
  if (!item.description) return null;
  return <p className={styles.itemDescription}>{item.description}</p>;
}

// The collapsed-items caret is a client component (§4 TASK-52) — re-exported so
// the shape renderers keep importing it from "./item-parts".
export { MoreCaret } from "./more-caret";

export function itemUnavailableAttr(item: MenuItem) {
  return item.available ? undefined : "true";
}
