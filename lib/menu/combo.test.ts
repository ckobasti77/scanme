// ScanMe Menu V1 — K04: combos (master §5.4). The pure rules: the "check the
// combo price" flag, the shape of a component list and the editor's one-by-one
// total. The combo price itself is manual and is never computed here.

import { describe, expect, test } from "vitest";
import {
  checkComboComponents,
  comboComponentsTotal,
  nextComboPriceCheck,
  sameComboPriceCheck,
  type MenuComboPriceCheck,
} from "./combo";
import { MENU_MAX_COMBO_COMPONENTS, MENU_MAX_COMBO_QUANTITY } from "./limits";

describe("nextComboPriceCheck", () => {
  test("the first change opens the flag with its time and the changed component", () => {
    expect(nextComboPriceCheck(null, { kind: "price_changed", componentKey: "a_burger", at: 100 })).toEqual({
      since: 100,
      changedComponentKeys: ["a_burger"],
      removedComponentNames: [],
    });
    expect(nextComboPriceCheck(undefined, { kind: "removed", componentName: "Pomfrit", at: 100 })).toEqual({
      since: 100,
      changedComponentKeys: [],
      removedComponentNames: ["Pomfrit"],
    });
  });

  test("a later change keeps the first `since` and adds to the lists", () => {
    const first = nextComboPriceCheck(null, { kind: "price_changed", componentKey: "a_burger", at: 100 });
    const second = nextComboPriceCheck(first, { kind: "price_changed", componentKey: "a_fries", at: 250 });
    const third = nextComboPriceCheck(second, { kind: "removed", componentName: "Sok", at: 400 });
    expect(third).toEqual({
      since: 100,
      changedComponentKeys: ["a_burger", "a_fries"],
      removedComponentNames: ["Sok"],
    });
  });

  test("the same component or name again does not grow the lists", () => {
    let check: MenuComboPriceCheck | null = null;
    for (let at = 1; at <= 5; at += 1) {
      check = nextComboPriceCheck(check, { kind: "price_changed", componentKey: "a_burger", at });
      check = nextComboPriceCheck(check, { kind: "removed", componentName: "Sok", at });
    }
    expect(check).toEqual({
      since: 1,
      changedComponentKeys: ["a_burger"],
      removedComponentNames: ["Sok"],
    });
  });

  test("never changes the flag it was given", () => {
    const existing: MenuComboPriceCheck = {
      since: 100,
      changedComponentKeys: ["a_burger"],
      removedComponentNames: ["Sok"],
    };
    const copy = JSON.parse(JSON.stringify(existing));
    nextComboPriceCheck(existing, { kind: "price_changed", componentKey: "a_fries", at: 200 });
    nextComboPriceCheck(existing, { kind: "removed", componentName: "Voda", at: 200 });
    expect(existing).toEqual(copy);
  });

  test(`both lists are capped at ${MENU_MAX_COMBO_COMPONENTS}; the oldest entries make room`, () => {
    let check: MenuComboPriceCheck | null = null;
    for (let index = 0; index < MENU_MAX_COMBO_COMPONENTS + 5; index += 1) {
      check = nextComboPriceCheck(check, { kind: "price_changed", componentKey: `k${index}`, at: index });
      check = nextComboPriceCheck(check, { kind: "removed", componentName: `n${index}`, at: index });
    }
    expect(check?.changedComponentKeys).toHaveLength(MENU_MAX_COMBO_COMPONENTS);
    expect(check?.removedComponentNames).toHaveLength(MENU_MAX_COMBO_COMPONENTS);
    expect(check?.changedComponentKeys[0]).toBe("k5");
    expect(check?.changedComponentKeys.at(-1)).toBe(`k${MENU_MAX_COMBO_COMPONENTS + 4}`);
    expect(check?.removedComponentNames[0]).toBe("n5");
    expect(check?.removedComponentNames.at(-1)).toBe(`n${MENU_MAX_COMBO_COMPONENTS + 4}`);
    expect(check?.since).toBe(0);
  });
});

describe("sameComboPriceCheck", () => {
  const flag: MenuComboPriceCheck = {
    since: 100,
    changedComponentKeys: ["a", "b"],
    removedComponentNames: ["Sok"],
  };

  test("two absent flags are the same; an absent and a present one are not", () => {
    expect(sameComboPriceCheck(null, null)).toBe(true);
    expect(sameComboPriceCheck(undefined, null)).toBe(true);
    expect(sameComboPriceCheck(flag, null)).toBe(false);
    expect(sameComboPriceCheck(undefined, flag)).toBe(false);
  });

  test("same content is the same, a different time, key or name is not", () => {
    expect(sameComboPriceCheck(flag, { ...flag, changedComponentKeys: ["a", "b"] })).toBe(true);
    expect(sameComboPriceCheck(flag, { ...flag, since: 101 })).toBe(false);
    expect(sameComboPriceCheck(flag, { ...flag, changedComponentKeys: ["a"] })).toBe(false);
    expect(sameComboPriceCheck(flag, { ...flag, changedComponentKeys: ["a", "c"] })).toBe(false);
    expect(sameComboPriceCheck(flag, { ...flag, removedComponentNames: [] })).toBe(false);
    expect(sameComboPriceCheck(flag, { ...flag, removedComponentNames: ["Voda"] })).toBe(false);
  });
});

describe("checkComboComponents", () => {
  const item = (articleId: string, quantity = 1) => ({ articleId, quantity });

  test("a well-formed list is returned as a copy", () => {
    const list = [item("a"), item("b", 2), item("c", MENU_MAX_COMBO_QUANTITY)];
    const checked = checkComboComponents(list);
    expect(checked).toEqual(list);
    expect(checked).not.toBe(list);
  });

  test("an empty list is invalid; so are more than the maximum", () => {
    expect(checkComboComponents([])).toBeNull();
    const max = Array.from({ length: MENU_MAX_COMBO_COMPONENTS }, (_, index) => item(`a${index}`));
    expect(checkComboComponents(max)).toHaveLength(MENU_MAX_COMBO_COMPONENTS);
    expect(checkComboComponents([...max, item("extra")])).toBeNull();
  });

  test("quantity is a whole number from 1 to the maximum", () => {
    expect(checkComboComponents([item("a", 1)])).not.toBeNull();
    expect(checkComboComponents([item("a", MENU_MAX_COMBO_QUANTITY)])).not.toBeNull();
    for (const bad of [0, -1, MENU_MAX_COMBO_QUANTITY + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkComboComponents([item("a", bad)])).toBeNull();
    }
    // One bad entry spoils the whole list.
    expect(checkComboComponents([item("a"), item("b", 0)])).toBeNull();
  });

  test("an article may appear once", () => {
    expect(checkComboComponents([item("a"), item("b"), item("a", 2)])).toBeNull();
  });

  test("the combo itself is never one of its components", () => {
    expect(checkComboComponents([item("a"), item("combo")], "combo")).toBeNull();
    expect(checkComboComponents([item("a"), item("b")], "combo")).not.toBeNull();
    // Without the combo id (a combo being created) there is nothing to compare.
    expect(checkComboComponents([item("a"), item("combo")])).not.toBeNull();
  });
});

describe("comboComponentsTotal", () => {
  test("adds quantity times price when every component has a price", () => {
    expect(
      comboComponentsTotal([
        { quantity: 1, unitPriceRsd: 650 },
        { quantity: 2, unitPriceRsd: 250 },
      ]),
    ).toEqual({ totalRsd: 1150, complete: true });
  });

  test("counts only the priced components and says the total is incomplete", () => {
    expect(
      comboComponentsTotal([
        { quantity: 1, unitPriceRsd: 650 },
        { quantity: 3, unitPriceRsd: null },
      ]),
    ).toEqual({ totalRsd: 650, complete: false });
    expect(comboComponentsTotal([{ quantity: 2, unitPriceRsd: null }])).toEqual({
      totalRsd: 0,
      complete: false,
    });
  });

  test("a free component (price 0) is priced, not missing", () => {
    expect(
      comboComponentsTotal([
        { quantity: 1, unitPriceRsd: 0 },
        { quantity: 1, unitPriceRsd: 300 },
      ]),
    ).toEqual({ totalRsd: 300, complete: true });
  });

  test("no components: nothing to add up", () => {
    expect(comboComponentsTotal([])).toEqual({ totalRsd: 0, complete: true });
  });
});
