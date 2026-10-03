"use client";

// Istaknuto (RFC-003 §2.1): full-width, ONE item — the house specialty. A
// render bound (ISTAKNUTO_VISIBLE_ITEMS), never a destructive one: switching a
// group to Istaknuto keeps its other items in the draft; only the first shows.
// Premium-only per §2.7 — the gate is §4 TASK-55, not this renderer.
// Tapping/keyboard activating the card opens the item bottom-sheet (§4 TASK-53).

import {
  ISTAKNUTO_VISIBLE_ITEMS,
  type MenuGroup,
  type MenuItem,
} from "@/lib/menu-blocks";
import { useMenuItemTrigger } from "../menu-item-sheet-context";
import styles from "../menu-template.module.css";
import {
  ItemDescription,
  ItemMedia,
  ItemName,
  ItemPrice,
  itemUnavailableAttr,
  VariantChips,
} from "./item-parts";

function IstaknutoCard({ item }: { item: MenuItem }) {
  const trigger = useMenuItemTrigger(item.id);
  return (
    <article
      className={styles.istaknutoCard}
      data-unavailable={itemUnavailableAttr(item)}
      {...trigger}
    >
      <ItemMedia item={item} className={styles.istaknutoMedia} />
      <div className={styles.istaknutoBody}>
        <ItemName item={item} />
        <ItemDescription item={item} />
        <VariantChips item={item} />
        <ItemPrice item={item} className={styles.istaknutoPrice} />
      </div>
    </article>
  );
}

export function IstaknutoGroup({ group }: { group: MenuGroup }) {
  const items = group.items.slice(0, ISTAKNUTO_VISIBLE_ITEMS);
  if (items.length === 0) return null;
  return (
    <div className={styles.istaknutoList}>
      {items.map((item) => (
        <IstaknutoCard key={item.id} item={item} />
      ))}
    </div>
  );
}

