import { describe, expect, test } from "vitest";
import {
  buildHierarchy,
  changeHierarchy,
  hierarchyOptions,
  matchesSearch,
  nextActiveIndex,
  normalizeSearch,
  sanitizeHierarchyValue,
  searchHierarchyModels,
  type HierarchySourceRow,
} from "./hierarchy";

// Admin UX A3 — Izlagač → Brend → Model: dependent choices, counts, search.

const row = (id: string, exhibitorId: string, brandId: string, extra: Partial<HierarchySourceRow> = {}): HierarchySourceRow => ({
  id, label: `TEST ${id}`, exhibitorId, exhibitorLabel: `TEST Izlagač ${exhibitorId.toUpperCase()}`, brandId, brandLabel: `TEST Brend ${brandId}`, ...extra,
});

const data = buildHierarchy([
  row("m1", "a", "b1", { searchTerms: ["test-em26-volta-x1", "7KQ2M9XA", "SMQ-TEST-0001"] }),
  row("m2", "a", "b1"),
  row("m3", "a", "b2", { label: "TEST Škoda Đuro" }),
  row("m4", "b", "b3"),
  row("m5", "b", "b3"),
  row("m6", "c", "b4"),
]);

describe("A3 hierarchy", () => {
  test("is built from the rows: exhibitors, brands under their exhibitor, models in order", () => {
    expect(data.exhibitors.map((exhibitor) => exhibitor.id)).toEqual(["a", "b", "c"]);
    expect(data.brands.find((brand) => brand.id === "b1")?.exhibitorIds).toEqual(["a"]);
    expect(data.models.map((model) => model.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
  });

  test("choosing an exhibitor narrows brands and models; the counts follow", () => {
    const all = hierarchyOptions(data, {});
    expect(all.exhibitors.map((option) => [option.id, option.count])).toEqual([["a", 3], ["b", 2], ["c", 1]]);
    expect(all.brands).toHaveLength(4);
    expect(all.models).toHaveLength(6);

    const a = hierarchyOptions(data, { exhibitorId: "a" });
    expect(a.brands.map((option) => [option.id, option.count])).toEqual([["b1", 2], ["b2", 1]]);
    expect(a.models.map((model) => model.id)).toEqual(["m1", "m2", "m3"]);

    const brand = hierarchyOptions(data, { exhibitorId: "a", brandId: "b2" });
    expect(brand.models.map((model) => model.id)).toEqual(["m3"]);

    // Counts only include the models that pass the other filters.
    const counted = hierarchyOptions(data, {}, new Set(["m1", "m4"]));
    expect(counted.exhibitors.map((option) => option.count)).toEqual([1, 1, 0]);
  });

  test("choosing a brand sets its exhibitor, a model sets both; clearing a level clears the levels below", () => {
    expect(changeHierarchy(data, {}, "brand", "b3")).toEqual({ exhibitorId: "b", brandId: "b3" });
    expect(changeHierarchy(data, {}, "model", "m3")).toEqual({ exhibitorId: "a", brandId: "b2", modelId: "m3" });
    // Another exhibitor drops the brand and model that are not its own.
    expect(changeHierarchy(data, { exhibitorId: "a", brandId: "b1", modelId: "m1" }, "exhibitor", "b")).toEqual({ exhibitorId: "b" });
    // Another brand of the same exhibitor keeps the exhibitor, drops the model.
    expect(changeHierarchy(data, { exhibitorId: "a", brandId: "b1", modelId: "m1" }, "brand", "b2")).toEqual({ exhibitorId: "a", brandId: "b2" });
    expect(changeHierarchy(data, { exhibitorId: "a", brandId: "b1", modelId: "m1" }, "brand", undefined)).toEqual({ exhibitorId: "a" });
    expect(changeHierarchy(data, { exhibitorId: "a", brandId: "b1", modelId: "m1" }, "model", undefined)).toEqual({ exhibitorId: "a", brandId: "b1" });
    expect(changeHierarchy(data, { exhibitorId: "a", brandId: "b1" }, "exhibitor", undefined)).toEqual({});
  });

  test("a stale or contradictory value from the URL is cleaned up", () => {
    expect(sanitizeHierarchyValue(data, { exhibitorId: "nema", brandId: "nema", modelId: "nema" })).toEqual({});
    expect(sanitizeHierarchyValue(data, { exhibitorId: "b", brandId: "b1" })).toEqual({ exhibitorId: "b" });
    expect(sanitizeHierarchyValue(data, { exhibitorId: "c", modelId: "m1" })).toEqual({ exhibitorId: "a", brandId: "b1", modelId: "m1" });
  });

  test("search ignores case and diacritics and finds a model by name, external key, QR code or SMQ", () => {
    expect(normalizeSearch("  TEST Škoda   Đuro ")).toBe("test skoda djuro");
    expect(matchesSearch(normalizeSearch("TEST Škoda Đuro"), "skoda djuro")).toBe(true);
    expect(matchesSearch(normalizeSearch("TEST Škoda Đuro"), "ŠKODA")).toBe(true);
    expect(matchesSearch(normalizeSearch("TEST Škoda Đuro"), "skoda volta")).toBe(false);
    for (const query of ["skoda", "volta-x1", "7kq2m9xa", "smq-test-0001", "Izlagač C"]) {
      expect(searchHierarchyModels(data.models, query).total).toBeGreaterThan(0);
    }
    expect(searchHierarchyModels(data.models, "volta-x1").shown.map((model) => model.id)).toEqual(["m1"]);
    expect(searchHierarchyModels(data.models, "", 2)).toMatchObject({ total: 6, shown: [{ id: "m1" }, { id: "m2" }] });
  });

  test("combobox keyboard wraps around and jumps with Home/End", () => {
    expect(nextActiveIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextActiveIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextActiveIndex(0, "ArrowUp", 3)).toBe(2);
    expect(nextActiveIndex(1, "Home", 3)).toBe(0);
    expect(nextActiveIndex(0, "End", 3)).toBe(2);
    expect(nextActiveIndex(1, "a", 3)).toBe(1);
    expect(nextActiveIndex(0, "ArrowDown", 0)).toBe(-1);
  });
});
