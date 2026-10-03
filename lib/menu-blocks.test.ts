import { describe, expect, it } from "vitest";
import {
  assertMenuGroup,
  clampDaypart,
  clampGroup,
  clampItem,
  clampMenu,
  daypartDefaults,
  defaults,
  isMenuGroupShape,
  itemDefaults,
  MAX_PAIRINGS_PER_ITEM,
  MAX_VARIANTS_PER_ITEM,
  MENU_BOUNDS,
  MENU_GROUP_SHAPES,
  splitVisibleItems,
  toggleAccordion,
  VISIBLE_COUNT,
  type ItemPairing,
  type ItemVariant,
  type MenuItem,
  type MenuModel,
} from "./menu-blocks";

// An item carrying `variants`/`pairings` counts and an out-of-range price.
function itemWith(variantCount: number, pairingCount = 0, priceRsd = 0): MenuItem {
  return {
    ...itemDefaults(),
    id: "i",
    name: "Rakija",
    productType: "pice",
    priceRsd,
    variants: Array.from({ length: variantCount }, (_, i): ItemVariant => ({
      id: `v${i}`,
      label: `0.${i} l`,
      priceRsd: 0,
    })),
    pairings: Array.from({ length: pairingCount }, (_, i): ItemPairing => ({
      id: `p${i}`,
      pairedItemId: `other${i}`,
    })),
  };
}

describe("defaults", () => {
  it("produces a group for every one of the five shapes", () => {
    expect(MENU_GROUP_SHAPES).toHaveLength(5);
    for (const shape of MENU_GROUP_SHAPES) {
      const group = defaults(shape);
      expect(group.shape).toBe(shape);
      expect(group.items).toEqual([]);
      expect(typeof group.base.id).toBe("string");
      expect(typeof group.base.title).toBe("string");
    }
  });

  it("are unchanged by clamp (defaults are already within bounds)", () => {
    for (const shape of MENU_GROUP_SHAPES) {
      expect(clampGroup(defaults(shape))).toEqual(defaults(shape));
    }
    expect(clampItem(itemDefaults())).toEqual(itemDefaults());
    expect(clampDaypart(daypartDefaults())).toEqual(daypartDefaults());
  });
});

describe("one shape per group (§2.1)", () => {
  it("isMenuGroupShape accepts the five and rejects anything else", () => {
    for (const shape of MENU_GROUP_SHAPES) {
      expect(isMenuGroupShape(shape)).toBe(true);
    }
    expect(isMenuGroupShape("koktel")).toBe(false);
    expect(isMenuGroupShape("lista_galerija")).toBe(false);
    expect(isMenuGroupShape("")).toBe(false);
    expect(isMenuGroupShape(undefined)).toBe(false);
  });

  it("assertMenuGroup rejects an unknown shape and a shape-less group", () => {
    expect(() => assertMenuGroup({ shape: "koktel", base: {}, items: [] })).toThrow();
    expect(() => assertMenuGroup({ base: {}, items: [] })).toThrow();
    expect(() => assertMenuGroup({ shape: "lista", base: {} })).toThrow();
    // A well-formed single-shape group passes and narrows.
    const ok = assertMenuGroup(defaults("galerija"));
    expect(ok.shape).toBe("galerija");
  });
});

describe("clamp — bounds", () => {
  it("caps variants and pairings per item to the exported limits", () => {
    const clamped = clampItem(itemWith(50, 40));
    expect(clamped.variants).toHaveLength(MAX_VARIANTS_PER_ITEM);
    expect(clamped.pairings).toHaveLength(MAX_PAIRINGS_PER_ITEM);
  });

  it("floors negative prices to MENU_BOUNDS.price and caps huge ones", () => {
    const clamped = clampItem({
      ...itemWith(1),
      priceRsd: -500,
      variants: [{ id: "v", label: "0.5 l", priceRsd: 1e9 }],
    });
    expect(clamped.priceRsd).toBe(MENU_BOUNDS.price[0]);
    expect(clamped.variants[0].priceRsd).toBe(MENU_BOUNDS.price[1]);
  });

  it("clamps daypart minutes to MENU_BOUNDS.daypartMinute", () => {
    const clamped = clampDaypart({
      id: "d",
      key: "dorucak",
      label: "Doručak",
      startMinute: -60,
      endMinute: 9999,
    });
    expect(clamped.startMinute).toBe(MENU_BOUNDS.daypartMinute[0]);
    expect(clamped.endMinute).toBe(MENU_BOUNDS.daypartMinute[1]);
  });
});

describe("clamp — unlimited groups and items (§2.7)", () => {
  it("does not truncate a large menu or a large group", () => {
    const bigGroup = { ...defaults("lista"), items: Array.from({ length: 100 }, () => itemWith(0)) };
    const model: MenuModel = {
      groups: Array.from({ length: 100 }, () => bigGroup),
      dayparts: [],
    };
    const clamped = clampMenu(model);
    expect(clamped.groups).toHaveLength(100);
    expect(clamped.groups[0].items).toHaveLength(100);
  });
});

describe("clamp — idempotency", () => {
  it("clampMenu(clampMenu(x)) === clampMenu(x)", () => {
    const model: MenuModel = {
      groups: [
        { ...defaults("tabela_varijanti"), items: [itemWith(50, 40, -9), itemWith(3, 2, 1e9)] },
        { ...defaults("galerija"), items: Array.from({ length: 30 }, () => itemWith(1)) },
      ],
      dayparts: [
        { id: "d1", key: "rucak", label: "Ručak", startMinute: -1, endMinute: 5000 },
      ],
      daypartOverride: "vecera",
    };
    const once = clampMenu(model);
    const twice = clampMenu(once);
    expect(twice).toEqual(once);
  });
});

describe("visibleCount and single-open accordion are testable constants (§2.1)", () => {
  it("VISIBLE_COUNT is 10 and splitVisibleItems slices there", () => {
    expect(VISIBLE_COUNT).toBe(10);
    const items = Array.from({ length: 14 }, (_, i) => i);
    const { visible, collapsed } = splitVisibleItems(items);
    expect(visible).toHaveLength(VISIBLE_COUNT);
    expect(collapsed).toHaveLength(4);
    expect(visible[0]).toBe(0);
    expect(collapsed[0]).toBe(10);
  });

  it("toggleAccordion is single-open: opening one closes the previous", () => {
    // Nothing open → open A.
    expect(toggleAccordion(null, "A")).toBe("A");
    // A open → open B closes A (only B is open).
    expect(toggleAccordion("A", "B")).toBe("B");
    // A open → tap A again closes it.
    expect(toggleAccordion("A", "A")).toBe(null);
  });
});
