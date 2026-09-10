"use client";

// Tabela varijanti (RFC-003 §2.1, §2.3): rows of variants with prices —
// rakije and wines by 0.3 l / 0.5 l, čaša / flaša. Each item is a small table
// of its variant rows; an item priced only at the top level gets one row.
// Tapping/keyboard activating an item opens the item bottom-sheet (§4 TASK-53).

import { fmt } from "@/lib/i18n";
import { menuSr as dict } from "@/lib/i18n/sr/menu";
import { splitVisibleItems, type MenuGroup, type MenuItem } from "@/lib/menu-blocks";
import { useMenuItemTrigger } from "../menu-item-sheet-context";
import { formatRsd } from "../menu-view";
import styles from "../menu-template.module.css";
import {
  ItemDescription,
  ItemMedia,
  ItemName,
  itemUnavailableAttr,
  MoreCaret,
} from "./item-parts";

function VariantRows({ item }: { item: MenuItem }) {
  const rows =
    item.variants.length > 0
      ? item.variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          priceRsd: variant.priceRsd,
        }))
      : item.priceRsd !== undefined
        ? [{ id: `${item.id}-osnovna`, label: "", priceRsd: item.priceRsd }]
        : [];
  if (rows.length === 0) return null;
  return (
    <table className={styles.tabela}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={styles.tabelaRow}>
            <th scope="row" className={styles.tabelaLabel}>
              {row.label}
            </th>
            <td className={styles.tabelaPrice}>
              {fmt(dict.priceRsd, { price: formatRsd(row.priceRsd) })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabelaVarijantiItem({ item }: { item: MenuItem }) {
  const trigger = useMenuItemTrigger(item.id);
  return (
    <li
      className={styles.tabelaItem}
      data-unavailable={itemUnavailableAttr(item)}
      {...trigger}
    >
      <div className={styles.tabelaHead}>
        <ItemMedia item={item} className={styles.tabelaMedia} />
        <div>
          <ItemName item={item} />
          <ItemDescription item={item} />
        </div>
      </div>
      <VariantRows item={item} />
    </li>
  );
}

export function TabelaVarijantiGroup({
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
      <ul className={styles.tabelaList}>
        {shown.map((item) => (
          <TabelaVarijantiItem key={item.id} item={item} />
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

