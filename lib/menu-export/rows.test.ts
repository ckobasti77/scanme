import { describe, expect, test } from "vitest";
import { defaults, itemDefaults, type MenuModel } from "../menu-blocks";
import {
  assertExportSize,
  countItems,
  flattenMenu,
  formatRsd,
  MENU_MAX_ITEMS,
  priceText,
  stampDateText,
} from "./rows";

export function modelWithItems(count: number, groupSize = 50): MenuModel {
  const groups = [];
  let made = 0;
  let g = 0;
  while (made < count) {
    const group = defaults("lista");
    group.base = { id: `g-${g}`, title: `Grupa ${g}` };
    const take = Math.min(groupSize, count - made);
    for (let i = 0; i < take; i += 1) {
      group.items.push({
        ...itemDefaults(),
        id: `i-${made}`,
        name: `Stavka ${made}`,
        productType: "jelo",
        priceRsd: 100 + made,
      });
      made += 1;
    }
    groups.push(group);
    g += 1;
  }
  return { groups, dayparts: [] };
}

describe("menu export rows", () => {
  test("formatRsd matches the render's vector (1.650) and priceText appends RSD", () => {
    expect(formatRsd(1650)).toBe("1.650");
    expect(formatRsd(250)).toBe("250");
    expect(formatRsd(1234567)).toBe("1.234.567");
    expect(priceText(1900)).toBe("1.900 RSD");
  });

  test("flattenMenu keeps array order and copies variants/availability", () => {
    const model = modelWithItems(3, 2);
    model.groups[0].items[1].available = false;
    model.groups[0].items[1].variants = [{ id: "v", label: "0.5 l", priceRsd: 390 }];
    const groups = flattenMenu(model);
    expect(groups.map((g) => g.title)).toEqual(["Grupa 0", "Grupa 1"]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(["Stavka 0", "Stavka 1"]);
    expect(groups[0].rows[1].available).toBe(false);
    expect(groups[0].rows[1].variants).toEqual([{ label: "0.5 l", priceRsd: 390 }]);
    expect(groups[1].rows[0].groupTitle).toBe("Grupa 1");
  });

  test("countItems + the 2000 cap: 2000 passes, 2001 throws before anything is built", () => {
    expect(countItems(modelWithItems(7, 3))).toBe(7);
    expect(() => assertExportSize(modelWithItems(MENU_MAX_ITEMS))).not.toThrow();
    expect(() => assertExportSize(modelWithItems(MENU_MAX_ITEMS + 1))).toThrow(
      /2001 items exceeds MENU_MAX_ITEMS \(2000\)/,
    );
  });

  test("stampDateText renders dd.MM.yyyy.", () => {
    expect(
      stampDateText({ year: 2026, month: 9, day: 5, hour: 1, minute: 2, second: 3 }),
    ).toBe("05.09.2026.");
  });
});
