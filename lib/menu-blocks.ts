// The ScanMe Menu block model as pure data + rules (RFC-003 §2.1, §2.3, §2.5 —
// TASK-49): the five group shapes as a block-kind union, the item / variant /
// pairing / daypart model, `defaults(shape)`, and the `clamp*` family, with
// **no Convex imports and no React** — a pure module the later Menu render and
// editor tasks (§4 TASK-51–54) import and normalize on write, exactly the way
// `convex/venue.ts` imports the Venue block model.
//
// FORKED from the Venue block model (RFC-003 §2.1) and deliberately NOT
// importing it: Menu and Venue are two products that diverge, and the §4
// criterion requires the fork to carry no import of the Venue module. The
// duplication is the point (same reasoning as the TASK-48 `menu-tokens.ts` fork).
//
// LAYERING SEAM. This model composes items, variants, and pairings **inline** on
// the group/item — the shape the editor and renderer manipulate. Persistence
// (RFC-003 §2.13) normalizes them into the `menuItems` / `itemVariants` /
// `itemPairings` tables; the map between the two layers is a later task's job
// (§4 TASK-51 / TASK-58). **Array position is the canonical order** here (as in
// the Venue model); the persistence mapping assigns the schema's `order` columns.

// ---------------------------------------------------------------------------
// The five group shapes — the block-kind union (RFC-003 §2.1)
// ---------------------------------------------------------------------------

// Enum values match the `menuGroups.shape` union in the schema (RFC-003 §2.13):
// `tabela_varijanti` carries the underscore.
export const MENU_GROUP_SHAPES = [
  "lista",
  "galerija",
  "traka",
  "istaknuto",
  "tabela_varijanti",
] as const;

export type MenuGroupShape = (typeof MENU_GROUP_SHAPES)[number];

// The fields every group carries regardless of shape (RFC-003 §2.13
// `menuGroups`). No `visible` flag: a menu group's visibility is governed by its
// daypart binding (§2.5), not a per-block toggle — the schema has no such column.
export type MenuGroupBase = {
  id: string;
  title: string;
  /** Category icon for the group's tiles (§2.4). */
  iconKey?: string;
  /** Binds the group to a daypart; absent ⇒ always shown (§2.5). */
  daypartKey?: string;
};

// The discriminated union. `shape` is the discriminant, so a group carries
// EXACTLY ONE shape literal and "two shapes in one group" is unrepresentable by
// type (a single literal field — no shape array, no per-item shape). The RFC
// deliberately rejected parameterizing shapes (the "N-per-row columns"
// rejection, §2.1), so the arms carry no per-shape config knobs; they differ
// only by the discriminant and its renderer/editor panel (§2.1).
export type MenuGroup =
  | { shape: "lista"; base: MenuGroupBase; items: MenuItem[] }
  | { shape: "galerija"; base: MenuGroupBase; items: MenuItem[] }
  | { shape: "traka"; base: MenuGroupBase; items: MenuItem[] }
  | { shape: "istaknuto"; base: MenuGroupBase; items: MenuItem[] }
  | { shape: "tabela_varijanti"; base: MenuGroupBase; items: MenuItem[] };

// ---------------------------------------------------------------------------
// The item, its product type, and its variants are first-class (RFC-003 §2.3)
// ---------------------------------------------------------------------------

// A variant is a priced row (`0.3 l` / `0.5 l`, `čaša` / `flaša`, `mala` /
// `velika`, extras) — never text in the description (§2.3).
export type ItemVariant = {
  id: string;
  label: string;
  priceRsd: number;
};

// "Ide uz" — a manual pairing the owner draws to another item (§2.3). A
// relation, never a sentence; `pairedItemId` references a `MenuItem.id` anywhere
// in the menu.
export type ItemPairing = {
  id: string;
  pairedItemId: string;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  // Drives the default category icon (§2.4) and which variant axes make sense
  // (§2.3). A FREE string (schema: `v.string()`), not a closed union — the set
  // (piće, jelo, poslastica, …) is owner-owned (§5 Q2).
  productType: string;
  // Absent when the item is priced only through variants (§2.3).
  priceRsd?: number;
  // Per-item icon override; else the productType's default (§2.4).
  iconKey?: string;
  // Premium only (§2.7); opaque Convex storage id.
  photoStorageId?: string;
  // Premium only (§2.7); plays in the item sheet, never the list (§2.5).
  videoStorageId?: string;
  // The live "nema više" flag (§2.6).
  available: boolean;
  variants: ItemVariant[];
  pairings: ItemPairing[];
};

// ---------------------------------------------------------------------------
// Dayparts — structure and bounds ONLY (RFC-003 §2.5). The time-of-day
// selection logic (which daypart is active now, in the venue's timezone, with a
// manual override) is §4 TASK-54, NOT this module.
// ---------------------------------------------------------------------------

export type MenuDaypart = {
  id: string;
  // ASCII key, no diacritics: "dorucak" | "rucak" | "vecera" (schema §2.13).
  key: string;
  label: string;
  // Minutes from midnight in the venue timezone.
  startMinute: number;
  endMinute: number;
};

// The whole menu as pure data. `daypartOverride` pins a daypart key and beats
// the clock (§2.5) — structure only; the clock logic is TASK-54.
export type MenuModel = {
  groups: MenuGroup[];
  dayparts: MenuDaypart[];
  daypartOverride?: string;
};

// ---------------------------------------------------------------------------
// Bounds and testable constants (RFC-003 §2.1, §2.3, §2.7)
// ---------------------------------------------------------------------------

// RFC-fixed (§2.1): the first 10 items of a group are visible; the rest sit
// behind the caret accordion. A bound in the model, not a per-theme flourish.
export const VISIBLE_COUNT = 10;

// The accordion is single-open: opening one group closes the previously open one
// (§2.1). Encoded as a constant + the pure `toggleAccordion` reducer below.
export const ACCORDION_MODE = "single-open" as const;

// Istaknuto renders one hero item (§2.1). A RENDER bound (how many show) — clamp
// is NON-destructive, so switching a group to Istaknuto never deletes items.
export const ISTAKNUTO_VISIBLE_ITEMS = 1;

// Sanity caps where the RFC is silent (chosen, like the Venue model's bounds). These
// bound the per-item variant/pairing rows; they are NOT the item/group ceilings
// (those are unlimited, below).
export const MAX_VARIANTS_PER_ITEM = 20;
export const MAX_PAIRINGS_PER_ITEM = 10;

// RFC-003 §2.7: groups and items are UNLIMITED on both tiers — a numeric ceiling
// was explicitly rejected. `null` means "no cap"; clamp never truncates counts.
export const MAX_GROUPS: number | null = null;
export const MAX_ITEMS_PER_GROUP: number | null = null;

// Inclusive numeric ranges, EXPORTED as the single source both `clamp*()` below
// and every editor control read — a slider's min/max must derive from the same
// constant the server clamps with, so a retyped copy cannot drift (the venue
// TASK-12 "constrained freedom" pattern).
export const MENU_BOUNDS = {
  // Minutes from midnight; 1440 = 24 h (RFC-003 §2.5).
  daypartMinute: [0, 1440],
  // RSD; a non-negative floor and a sane ceiling (chosen — RFC silent).
  price: [0, 1_000_000],
} as const satisfies Record<string, readonly [number, number]>;

const PRICE_RANGE = MENU_BOUNDS.price;
const DAYPART_MINUTE_RANGE = MENU_BOUNDS.daypartMinute;

const clampNum = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Cap a count only when the cap is a number; `null` ⇒ unlimited (§2.7).
const capCount = <T>(items: T[], cap: number | null): T[] =>
  cap === null ? items : items.slice(0, cap);

// ---------------------------------------------------------------------------
// defaults — a fresh, valid group of each shape (and its parts). `id` is left
// empty for the caller (mutation/editor) to assign a uuid, as in the Venue model.
// ---------------------------------------------------------------------------

function groupBaseDefaults(): MenuGroupBase {
  return { id: "", title: "" };
}

export function defaults(shape: MenuGroupShape): MenuGroup {
  const base = groupBaseDefaults();
  switch (shape) {
    case "lista":
    case "galerija":
    case "traka":
    case "istaknuto":
    case "tabela_varijanti":
      return { shape, base, items: [] };
  }
}

export function itemDefaults(): MenuItem {
  return {
    id: "",
    name: "",
    productType: "",
    available: true,
    variants: [],
    pairings: [],
  };
}

export function variantDefaults(): ItemVariant {
  return { id: "", label: "", priceRsd: 0 };
}

// A blank daypart. Real boundary windows for doručak / ručak / večera are
// owner-owned (§5 Q3), so nothing is invented here.
export function daypartDefaults(): MenuDaypart {
  return { id: "", key: "", label: "", startMinute: 0, endMinute: 0 };
}

// ---------------------------------------------------------------------------
// clamp — enforces the bounds. Idempotent: clamp(clamp(x)) === clamp(x).
// ---------------------------------------------------------------------------

export function clampItem(item: MenuItem): MenuItem {
  return {
    ...item,
    priceRsd:
      item.priceRsd === undefined
        ? undefined
        : clampNum(item.priceRsd, ...PRICE_RANGE),
    variants: item.variants
      .slice(0, MAX_VARIANTS_PER_ITEM)
      .map((variant) => ({
        ...variant,
        priceRsd: clampNum(variant.priceRsd, ...PRICE_RANGE),
      })),
    pairings: item.pairings.slice(0, MAX_PAIRINGS_PER_ITEM),
  };
}

export function clampGroup(group: MenuGroup): MenuGroup {
  return {
    ...group,
    items: capCount(group.items, MAX_ITEMS_PER_GROUP).map(clampItem),
  };
}

export function clampDaypart(daypart: MenuDaypart): MenuDaypart {
  return {
    ...daypart,
    startMinute: clampNum(daypart.startMinute, ...DAYPART_MINUTE_RANGE),
    endMinute: clampNum(daypart.endMinute, ...DAYPART_MINUTE_RANGE),
  };
}

export function clampMenu(model: MenuModel): MenuModel {
  return {
    ...model,
    groups: capCount(model.groups, MAX_GROUPS).map(clampGroup),
    dayparts: model.dayparts.map(clampDaypart),
  };
}

// ---------------------------------------------------------------------------
// The one-shape-per-group rule — the validator half of the §4 criterion. (The
// type half is the discriminated union above: a group is bound to a single
// shape literal by construction.)
// ---------------------------------------------------------------------------

export function isMenuGroupShape(value: unknown): value is MenuGroupShape {
  return (
    typeof value === "string" &&
    (MENU_GROUP_SHAPES as readonly string[]).includes(value)
  );
}

// Narrows an unknown to a MenuGroup, throwing if it is not a `{ shape, base,
// items }` bearing exactly one of the five shapes. A group whose `shape` is
// absent, or is not one of the five, does not pass.
export function assertMenuGroup(value: unknown): MenuGroup {
  if (typeof value !== "object" || value === null) {
    throw new Error("menu group must be an object");
  }
  const group = value as { shape?: unknown; items?: unknown };
  if (!isMenuGroupShape(group.shape)) {
    throw new Error(
      `menu group needs exactly one of ${MENU_GROUP_SHAPES.join(", ")}`,
    );
  }
  if (!Array.isArray(group.items)) {
    throw new Error("menu group must carry an items array");
  }
  return value as MenuGroup;
}

// ---------------------------------------------------------------------------
// The 10-visible / single-open-accordion rule as pure, UI-free helpers
// (RFC-003 §2.1). The render (§4 TASK-52) consumes these; the rule lives here.
// ---------------------------------------------------------------------------

// First VISIBLE_COUNT items are visible; the rest are collapsed behind the caret.
export function splitVisibleItems<T>(items: T[]): {
  visible: T[];
  collapsed: T[];
} {
  return {
    visible: items.slice(0, VISIBLE_COUNT),
    collapsed: items.slice(VISIBLE_COUNT),
  };
}

// Single-open accordion: toggling the open group closes it (→ null); opening a
// different group replaces the open one, so the previously open group closes.
export function toggleAccordion(
  openGroupId: string | null,
  groupId: string,
): string | null {
  return openGroupId === groupId ? null : groupId;
}
