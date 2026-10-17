// ScanMe Menu V1 (K04) — combos (master §5.4).
//
// A combo is its own article (kind "combo") assembled from existing ordinary
// articles. Its price is MANUAL and never recomputed: when a component's
// price changes or a component is deleted, the combo only gets a "check the
// combo price" flag (`priceCheck`). The published price changes only when the
// client decides (keeps the price or sets a new one).

import { MENU_MAX_COMBO_COMPONENTS, MENU_MAX_COMBO_QUANTITY } from "./limits";

/** Stored on menuArticles.priceCheck of a combo (validator in convex/lib/menuDomainValidators.ts). */
export type MenuComboPriceCheck = {
  /** When the first still-unresolved change happened. */
  since: number;
  /** Keys of component articles whose price changed (unique, ≤ MENU_MAX_COMBO_COMPONENTS). */
  changedComponentKeys: string[];
  /** Names of components deleted from the menu, as they were (unique, ≤ MENU_MAX_COMBO_COMPONENTS). */
  removedComponentNames: string[];
};

export type MenuComboChange =
  | { kind: "price_changed"; componentKey: string; at: number }
  | { kind: "removed"; componentName: string; at: number };

function appendUnique(list: readonly string[], value: string): string[] {
  if (list.includes(value)) return list.slice();
  return [...list, value].slice(-MENU_MAX_COMBO_COMPONENTS);
}

/**
 * The flag after one more component change. The first unresolved change
 * keeps its `since`; repeated changes of the same component do not grow the
 * lists. Never touches the combo price.
 */
export function nextComboPriceCheck(
  existing: MenuComboPriceCheck | null | undefined,
  change: MenuComboChange,
): MenuComboPriceCheck {
  const base: MenuComboPriceCheck = existing ?? {
    since: change.at,
    changedComponentKeys: [],
    removedComponentNames: [],
  };
  if (change.kind === "price_changed") {
    return {
      ...base,
      changedComponentKeys: appendUnique(base.changedComponentKeys, change.componentKey),
    };
  }
  return {
    ...base,
    changedComponentKeys: base.changedComponentKeys.slice(),
    removedComponentNames: appendUnique(base.removedComponentNames, change.componentName),
  };
}

export function sameComboPriceCheck(
  a: MenuComboPriceCheck | null | undefined,
  b: MenuComboPriceCheck | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.since === b.since &&
    a.changedComponentKeys.join("\u0000") === b.changedComponentKeys.join("\u0000") &&
    a.removedComponentNames.join("\u0000") === b.removedComponentNames.join("\u0000")
  );
}

export type ComboComponentInput<Id> = { articleId: Id; quantity: number };

/**
 * Validates a full component list: 1..MENU_MAX_COMBO_COMPONENTS entries,
 * whole quantities 1..MENU_MAX_COMBO_QUANTITY, each article once, never the
 * combo itself. Returns the list unchanged, or null when it is invalid (the
 * caller raises ARTICLE_ERROR.comboComponentInvalid or MENU_ERROR.invalidInput).
 */
export function checkComboComponents<Id>(
  components: readonly ComboComponentInput<Id>[],
  comboArticleId?: Id,
): ComboComponentInput<Id>[] | null {
  if (components.length === 0 || components.length > MENU_MAX_COMBO_COMPONENTS) return null;
  const seen = new Set<Id>();
  for (const component of components) {
    if (
      !Number.isInteger(component.quantity) ||
      component.quantity < 1 ||
      component.quantity > MENU_MAX_COMBO_QUANTITY
    ) {
      return null;
    }
    if (comboArticleId !== undefined && component.articleId === comboArticleId) return null;
    if (seen.has(component.articleId)) return null;
    seen.add(component.articleId);
  }
  return components.slice();
}

/**
 * What the components would cost one by one (an editor hint next to the manual
 * combo price, never a price rule). `complete` is false when a component has
 * no regular price; the total then counts only the priced ones.
 */
export function comboComponentsTotal(
  components: readonly { quantity: number; unitPriceRsd: number | null }[],
): { totalRsd: number; complete: boolean } {
  let totalRsd = 0;
  let complete = true;
  for (const component of components) {
    if (component.unitPriceRsd === null) {
      complete = false;
      continue;
    }
    totalRsd += component.unitPriceRsd * component.quantity;
  }
  return { totalRsd, complete };
}
