import { describe, expect, test } from "vitest";
import {
  IMPORT_DEFAULT_PRODUCT_TYPE,
  IMPORT_IMPLICIT_GROUP_TITLE,
  parseMenuImport,
  parsePrice,
} from "./menu-import";

const SAMPLE = `
# Piće | rakija
Šljivovica | 250 | Domaća, 45%
- 0.3 l | 250
- 0.5 l | 390
Domaća kafa | 180

# Jela
Ćevapi | 890 | Deset komada | sa lukom
Vino |  | samo po varijantama
- čaša | 350
- flaša | 1.900
`;

describe("menu import parser", () => {
  test("groups, items, variants, group-level productType default", () => {
    const result = parseMenuImport(SAMPLE);
    expect(result.warnings).toEqual([]);
    expect(result.groups).toBe(2);
    expect(result.items).toBe(4);
    expect(result.variants).toBe(4);
    const [pice, jela] = result.model.groups;
    expect(pice.shape).toBe("lista");
    expect(pice.base.title).toBe("Piće");
    expect(pice.items.map((i) => [i.name, i.productType, i.priceRsd])).toEqual([
      ["Šljivovica", "rakija", 250],
      ["Domaća kafa", "rakija", 180],
    ]);
    expect(pice.items[0].description).toBe("Domaća, 45%");
    expect(pice.items[0].variants.map((v) => [v.label, v.priceRsd])).toEqual([
      ["0.3 l", 250],
      ["0.5 l", 390],
    ]);
    expect(jela.items[0].productType).toBe(IMPORT_DEFAULT_PRODUCT_TYPE);
    expect(jela.items[0].description).toBe("Deset komada | sa lukom");
    expect(jela.items[1].priceRsd).toBeUndefined();
    expect(jela.items[1].variants[1].priceRsd).toBe(1900);
    // Every id is a fresh uuid; availability defaults to true.
    const ids = result.model.groups.flatMap((g) => [g.base.id, ...g.items.map((i) => i.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.model.groups.every((g) => g.items.every((i) => i.available))).toBe(true);
    expect(result.model.dayparts).toEqual([]);
  });

  test("items before any # land in an implicit group; warnings for junk lines", () => {
    const result = parseMenuImport(`- 0.3 l | 250\nKafa | abc\n | 100\nČaj | 120`);
    expect(result.model.groups).toHaveLength(1);
    expect(result.model.groups[0].base.title).toBe(IMPORT_IMPLICIT_GROUP_TITLE);
    expect(result.model.groups[0].items.map((i) => i.name)).toEqual(["Kafa", "Čaj"]);
    expect(result.model.groups[0].items[0].priceRsd).toBeUndefined();
    expect(result.warnings.map((w) => [w.line, w.code])).toEqual([
      [1, "variant_without_item"],
      [2, "bad_price"],
      [3, "empty_name"],
    ]);
  });

  test("parsePrice accepts Serbian formats and rejects junk", () => {
    expect(parsePrice("1.200")).toBe(1200);
    expect(parsePrice("1 200")).toBe(1200);
    expect(parsePrice("350,50")).toBe(351);
    expect(parsePrice("390 RSD")).toBe(390);
    expect(parsePrice("")).toBeUndefined();
    expect(parsePrice("abc")).toBeNull();
  });

  test("empty input yields an empty model", () => {
    const result = parseMenuImport("\n\n");
    expect(result.model).toEqual({ groups: [], dayparts: [] });
    expect(result.items).toBe(0);
  });
});
