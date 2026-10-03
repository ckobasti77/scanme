"use client";

// Lista (RFC-003 §2.1): one item per row, thumbnail-left — the default shape;
// drinks and standard dishes. First VISIBLE_COUNT rows, then the caret.
// Tapping/keyboard activating a row opens the item bottom-sheet (§4 TASK-53).

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

function ListaRow({ item }: { item: MenuItem }) {
  const trigger = useMenuItemTrigger(item.id);
  return (
    <li
      className={styles.listaRow}
      data-unavailable={itemUnavailableAttr(item)}
      {...trigger}
    >
      <ItemMedia item={item} className={styles.listaMedia} />
      <div className={styles.listaBody}>
        <div className={styles.listaLine}>
          <ItemName item={item} />
          <span className={styles.leader} aria-hidden="true" />
          <ItemPrice item={item} />
        </div>
        <ItemDescription item={item} />
        <VariantChips item={item} />
      </div>
    </li>
  );
}

export function ListaGroup({
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
      <ul className={styles.listaList}>
        {shown.map((item) => (
          <ListaRow key={item.id} item={item} />
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

