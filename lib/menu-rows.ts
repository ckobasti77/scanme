// The mapping module between the two layers of the ScanMe Menu model
// (RFC-003 §4 TASK-51, amended by TASK-50):
//
//   inline  — `lib/menu-blocks.ts` `MenuModel`: items nested on their group,
//             variants and pairings nested on their item, array position as
//             the canonical order. The shape the editor edits and the render
//             draws.
//   rows    — the denormalized RFC-003 §2.13 tables (`menuGroups`,
//             `menuItems`, `itemVariants`, `itemPairings`, `menuDayparts`),
//             flat, related by ids, ordered by their `order` columns. The
//             shape Convex stores for the PUBLISHED menu.
//
// ONE translator each way, here, tested to round-trip (`menu-rows.test.ts`).
// `convex/menu.ts` imports `menuModelToRows` on publish; the public render
// (§4 TASK-52) imports `menuRowsToModel` — neither writes its own mapping,
// so the two cannot diverge (the §4 criterion).
//
// Pure: no Convex, no React. Ids are plain strings — a Convex `Id<>` is a
// branded string and passes straight through; the persistence layer decides
// what an id is (the editor uuid in a draft, `_id` in a stored row) and
// stamps `createdAt`/`updatedAt` itself. `menuId` is carried on the rows that
// the schema keys by menu; `daypartOverride` lives on `menus`, not on a row,
// so it rides beside the rows as an option.

import type {
  ItemPairing,
  ItemVariant,
  MenuDaypart,
  MenuGroup,
  MenuGroupBase,
  MenuGroupShape,
  MenuItem,
  MenuModel,
} from "./menu-blocks";

// ---------------------------------------------------------------------------
// Row shapes — RFC-003 §2.13 minus `createdAt`/`updatedAt` (persistence-only)
// ---------------------------------------------------------------------------

export type MenuGroupRow = {
  id: string;
  menuId: string;
  title: string;
  shape: MenuGroupShape;
  iconKey?: string;
  daypartKey?: string;
  order: number;
};

export type MenuItemRow = {
  id: string;
  menuId: string;
  groupId: string;
  name: string;
  description?: string;
  productType: string;
  priceRsd?: number;
  iconKey?: string;
  photoStorageId?: string;
  videoStorageId?: string;
  available: boolean;
  order: number;
};

export type ItemVariantRow = {
  id: string;
  itemId: string;
  label: string;
  priceRsd: number;
  order: number;
};

export type ItemPairingRow = {
  id: string;
  itemId: string;
  pairedItemId: string;
  order: number;
};

export type MenuDaypartRow = {
  id: string;
  menuId: string;
  key: string;
  label: string;
  startMinute: number;
  endMinute: number;
  order: number;
};

export type MenuRows = {
  groups: MenuGroupRow[];
  items: MenuItemRow[];
  variants: ItemVariantRow[];
  pairings: ItemPairingRow[];
  dayparts: MenuDaypartRow[];
};

// Drop `undefined` members so an optional column is ABSENT rather than
// present-as-undefined — the two must compare equal after a round trip and
// Convex stores an absent optional field as absent.
function defined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) {
    if (member !== undefined) out[key] = member;
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// inline → rows
// ---------------------------------------------------------------------------

/**
 * Flatten a `MenuModel` into the five row tables. Every `order` column is the
 * ARRAY POSITION within its parent (0-based) — array position is the
 * canonical order in the inline model, so the rows carry exactly that.
 * Ids pass through unchanged; `groupId`/`itemId`/`pairedItemId` reference the
 * inline ids, so a pairing to an item elsewhere in the menu survives as-is.
 */
export function menuModelToRows(model: MenuModel, menuId: string): MenuRows {
  const rows: MenuRows = {
    groups: [],
    items: [],
    variants: [],
    pairings: [],
    dayparts: [],
  };

  model.groups.forEach((group, groupOrder) => {
    rows.groups.push(
      defined({
        id: group.base.id,
        menuId,
        title: group.base.title,
        shape: group.shape,
        iconKey: group.base.iconKey,
        daypartKey: group.base.daypartKey,
        order: groupOrder,
      }),
    );
    group.items.forEach((item, itemOrder) => {
      rows.items.push(
        defined({
          id: item.id,
          menuId,
          groupId: group.base.id,
          name: item.name,
          description: item.description,
          productType: item.productType,
          priceRsd: item.priceRsd,
          iconKey: item.iconKey,
          photoStorageId: item.photoStorageId,
          videoStorageId: item.videoStorageId,
          available: item.available,
          order: itemOrder,
        }),
      );
      item.variants.forEach((variant, order) => {
        rows.variants.push({
          id: variant.id,
          itemId: item.id,
          label: variant.label,
          priceRsd: variant.priceRsd,
          order,
        });
      });
      item.pairings.forEach((pairing, order) => {
        rows.pairings.push({
          id: pairing.id,
          itemId: item.id,
          pairedItemId: pairing.pairedItemId,
          order,
        });
      });
    });
  });

  model.dayparts.forEach((daypart, order) => {
    rows.dayparts.push({
      id: daypart.id,
      menuId,
      key: daypart.key,
      label: daypart.label,
      startMinute: daypart.startMinute,
      endMinute: daypart.endMinute,
      order,
    });
  });

  return rows;
}

// ---------------------------------------------------------------------------
// rows → inline
// ---------------------------------------------------------------------------

// Sort by `order`; ties (which a well-formed table never has) break by id so
// the result is deterministic either way.
function byOrder<T extends { order: number; id: string }>(a: T, b: T): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function groupBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket) bucket.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

// The union is five structurally identical arms keyed by `shape`; building one
// from a runtime `shape` needs the exhaustive switch (as `defaults()` does).
function makeGroup(
  shape: MenuGroupShape,
  base: MenuGroupBase,
  items: MenuItem[],
): MenuGroup {
  switch (shape) {
    case "lista":
    case "galerija":
    case "traka":
    case "istaknuto":
    case "tabela_varijanti":
      return { shape, base, items };
  }
}

/**
 * Nest the five row tables back into a `MenuModel`. Every table is sorted by
 * its `order` column (ties by id) and nested through `groupId` / `itemId`,
 * so the array positions in the result ARE the stored order — a subsequent
 * `menuModelToRows` renumbers them 0..n-1, which is what makes the two
 * directions agree even when stored orders are sparse.
 *
 * Orphans — an item whose `groupId` names no group, a variant or pairing
 * whose `itemId` names no item — are dropped: they cannot be placed in the
 * tree. A pairing whose `pairedItemId` names no item is KEPT verbatim: the
 * relation is data the render decides how to show (§2.3), not a tree edge.
 */
export function menuRowsToModel(
  rows: MenuRows,
  options: { daypartOverride?: string } = {},
): MenuModel {
  const itemsByGroup = groupBy(rows.items, (row) => row.groupId);
  const variantsByItem = groupBy(rows.variants, (row) => row.itemId);
  const pairingsByItem = groupBy(rows.pairings, (row) => row.itemId);

  const groups = [...rows.groups].sort(byOrder).map((groupRow) => {
    const base = defined<MenuGroupBase>({
      id: groupRow.id,
      title: groupRow.title,
      iconKey: groupRow.iconKey,
      daypartKey: groupRow.daypartKey,
    });
    const items = (itemsByGroup.get(groupRow.id) ?? [])
      .slice()
      .sort(byOrder)
      .map((itemRow) => {
        const variants: ItemVariant[] = (variantsByItem.get(itemRow.id) ?? [])
          .slice()
          .sort(byOrder)
          .map((row) => ({
            id: row.id,
            label: row.label,
            priceRsd: row.priceRsd,
          }));
        const pairings: ItemPairing[] = (pairingsByItem.get(itemRow.id) ?? [])
          .slice()
          .sort(byOrder)
          .map((row) => ({ id: row.id, pairedItemId: row.pairedItemId }));
        return defined<MenuItem>({
          id: itemRow.id,
          name: itemRow.name,
          description: itemRow.description,
          productType: itemRow.productType,
          priceRsd: itemRow.priceRsd,
          iconKey: itemRow.iconKey,
          photoStorageId: itemRow.photoStorageId,
          videoStorageId: itemRow.videoStorageId,
          available: itemRow.available,
          variants,
          pairings,
        });
      });
    return makeGroup(groupRow.shape, base, items);
  });

  const dayparts: MenuDaypart[] = [...rows.dayparts]
    .sort(byOrder)
    .map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    }));

  return defined<MenuModel>({
    groups,
    dayparts,
    daypartOverride: options.daypartOverride,
  });
}

/** Total row count across the five tables — the size a publish writes. */
export function countMenuRows(rows: MenuRows): number {
  return (
    rows.groups.length +
    rows.items.length +
    rows.variants.length +
    rows.pairings.length +
    rows.dayparts.length
  );
}
