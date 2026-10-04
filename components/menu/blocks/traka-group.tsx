"use client";

// Traka (RFC-003 §2.1): a horizontal scroll, quasi-carousel — daily specials,
// a themed shelf. Scroll-snap, no JS; the same first-10 rule as every shape.
// Tapping/keyboard activating a card opens the item bottom-sheet (§4 TASK-53).

import { splitVisibleItems, type MenuGroup, type MenuItem } from "@/lib/menu-blocks";
import { useMenuItemTrigger } from "../menu-item-sheet-context";
import styles from "../menu-template.module.css";
import {
  ItemDescription,
  ItemMedia,
  ItemName,
  ItemPrice,
  itemUnavailableAttr,
  MoreCaret,
  VariantChips,
} from "./item-parts";

function TrakaCard({ item }: { item: MenuItem }) {
  const trigger = useMenuItemTrigger(item.id);
  return (
    <li
      className={`${styles.card} ${styles.trakaCard}`}
      data-unavailable={itemUnavailableAttr(item)}
      {...trigger}
    >
      <ItemMedia item={item} className={styles.cardMedia} />
      <div className={styles.cardBody}>
        <ItemName item={item} />
        <ItemDescription item={item} />
        <VariantChips item={item} />
        <ItemPrice item={item} className={styles.cardPrice} />
      </div>
    </li>
  );
}

export function TrakaGroup({
  group,
  reveal = false,
}: {
  group: MenuGroup;
  reveal?: boolean;
}) {
  if (group.items.length === 0) return null;
  const { visible, collapsed } = splitVisibleItems(group.items);
  const shown = reveal ? group.items : visible;
  return (
    <>
      <ul className={styles.trakaScroller}>
        {shown.map((item) => (
          <TrakaCard key={item.id} item={item} />
        ))}
      </ul>
      <MoreCaret
        count={collapsed.length}
        groupId={group.base.id}
        expanded={reveal}
      />
    </>
  );
}

