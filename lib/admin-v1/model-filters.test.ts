import { describe, expect, test } from "vitest";
import {
  activeModelFilters,
  adjacentModels,
  applyModelFilters,
  clearModelFiltersPatch,
  hierarchyCountedIds,
  modelFacetCounts,
  modelGroups,
  modelHierarchy,
  modelListQuery,
  modelProblemKind,
  type FilterableModel,
} from "./model-filters";
import { hierarchyOptions } from "./hierarchy";
import { parseAdminQuery, patchAdminQuery, serializeAdminQuery } from "./query-state";

// Admin UX A3 — Modeli filters in the query string, facet counts, grouping
// and the detail's prethodni / sledeći.

const model = (id: string, participationId: string, brandId: string, extra: Partial<FilterableModel> = {}): FilterableModel => ({
  id, displayName: `TEST ${id}`, externalKey: `test-em26-${id}`, participationId, exhibitorName: `TEST Izlagač ${participationId.toUpperCase()}`,
  brandId, brandName: `TEST Brend ${brandId}`, tier: "starter", status: "published", qrCode: null, qrSmq: null, hasPhoto: false, issues: [], ...extra,
});

const models = [
  model("m5", "b", "b3", { tier: "advanced", qrCode: "R4T8W2PQ", qrSmq: "SMQ-TEST-0005", hasPhoto: true }),
  model("m1", "a", "b1", { variant: "Premium", qrCode: "7KQ2M9XA", qrSmq: "SMQ-TEST-0001", issues: [{ severity: "warning" }] }),
  model("m3", "a", "b2", { displayName: "TEST Škoda", status: "draft", tier: "included", issues: [{ severity: "error" }, { severity: "warning" }] }),
  model("m2", "a", "b1", { status: "withdrawn" }),
  model("m4", "b", "b3", { tier: "advanced" }),
];
const ids = (list: { id: string }[]) => list.map((row) => row.id);

describe("A3 Modeli filters", () => {
  test("without filters the list is ordered izlagač → brend → model", () => {
    expect(ids(applyModelFilters(models, {}))).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });

  test("the exhibitor narrows brands and models; brand and model narrow further (dependent hierarchy)", () => {
    expect(ids(applyModelFilters(models, { izlagac: "a" }))).toEqual(["m1", "m2", "m3"]);
    expect(ids(applyModelFilters(models, { izlagac: "a", brend: "b1" }))).toEqual(["m1", "m2"]);
    expect(ids(applyModelFilters(models, { izlagac: "a", brend: "b1", model: "m2" }))).toEqual(["m2"]);
    const hierarchy = modelHierarchy(models, (row) => row.displayName);
    const options = hierarchyOptions(hierarchy, { exhibitorId: "a" }, hierarchyCountedIds(models, {}));
    expect(options.brands.map((brand) => [brand.id, brand.count])).toEqual([["b1", 2], ["b2", 1]]);
    expect(ids(options.models)).toEqual(["m1", "m2", "m3"]);
  });

  test("search finds by name without diacritics, variant, external key, QR code and SMQ", () => {
    expect(ids(applyModelFilters(models, { q: "skoda" }))).toEqual(["m3"]);
    expect(ids(applyModelFilters(models, { q: "premium" }))).toEqual(["m1"]);
    expect(ids(applyModelFilters(models, { q: "test-em26-m4" }))).toEqual(["m4"]);
    expect(ids(applyModelFilters(models, { q: "r4t8w2pq" }))).toEqual(["m5"]);
    expect(ids(applyModelFilters(models, { q: "SMQ-TEST-0001" }))).toEqual(["m1"]);
    expect(applyModelFilters(models, { q: "nepostojeci" })).toEqual([]);
  });

  test("package, status, problems, QR and photo filters", () => {
    expect(ids(applyModelFilters(models, { paket: "napredni" }))).toEqual(["m4", "m5"]);
    expect(ids(applyModelFilters(models, { paket: "za-sve" }))).toEqual(["m3"]);
    expect(ids(applyModelFilters(models, { status: "nacrt" }))).toEqual(["m3"]);
    expect(ids(applyModelFilters(models, { status: "povucen" }))).toEqual(["m2"]);
    expect(ids(applyModelFilters(models, { problemi: "greske" }))).toEqual(["m3"]);
    expect(ids(applyModelFilters(models, { problemi: "upozorenja" }))).toEqual(["m1"]);
    expect(ids(applyModelFilters(models, { problemi: "bez" }))).toEqual(["m2", "m4", "m5"]);
    expect(ids(applyModelFilters(models, { qr: "ima" }))).toEqual(["m1", "m5"]);
    expect(ids(applyModelFilters(models, { qr: "nema", foto: "ima" }))).toEqual([]);
    expect(ids(applyModelFilters(models, { foto: "ima" }))).toEqual(["m5"]);
    expect(modelProblemKind(models[2])).toBe("greske");
    // An unknown value (old link) does not hide everything.
    expect(applyModelFilters(models, { status: "nepoznato" })).toHaveLength(5);
  });

  test("facet counts ignore their own facet and respect the others", () => {
    const counts = modelFacetCounts(models, { izlagac: "a", paket: "starter" });
    expect(counts.paket).toEqual({ "za-sve": 1, starter: 2, napredni: 0 });
    expect(counts.status).toEqual({ nacrt: 0, objavljen: 1, povucen: 1 });
    expect(counts.qr).toEqual({ ima: 1, nema: 1 });
  });

  test("the filters live in the query string and survive a round trip; Očisti keeps prikaz", () => {
    const query = { izlagac: "a", brend: "b1", q: "škoda x", paket: "starter", status: "objavljen", problemi: "bez", qr: "nema", foto: "ima", prikaz: "kartice" };
    const url = serializeAdminQuery(query);
    expect(url).toBe("?izlagac=a&brend=b1&q=%C5%A1koda+x&paket=starter&status=objavljen&problemi=bez&qr=nema&foto=ima&prikaz=kartice");
    expect(parseAdminQuery(url)).toEqual(query);
    expect(activeModelFilters(parseAdminQuery(url))).toEqual(["izlagac", "brend", "q", "paket", "status", "problemi", "qr", "foto"]);
    expect(patchAdminQuery(parseAdminQuery(url), clearModelFiltersPatch())).toEqual({ prikaz: "kartice" });
    expect(modelListQuery({ ...query, lead: "x", dan: "2026-10-09" })).toEqual(query);
  });

  test("groups are exhibitor · brand, only when there is more than one", () => {
    const list = applyModelFilters(models, {});
    expect(modelGroups(list)).toEqual([
      { key: "a:b1", exhibitorName: "TEST Izlagač A", brandName: "TEST Brend b1", count: 2 },
      { key: "a:b2", exhibitorName: "TEST Izlagač A", brandName: "TEST Brend b2", count: 1 },
      { key: "b:b3", exhibitorName: "TEST Izlagač B", brandName: "TEST Brend b3", count: 2 },
    ]);
    expect(modelGroups(applyModelFilters(models, { brend: "b3" }))).toBeNull();
  });

  test("prethodni / sledeći follow the filtered list", () => {
    const list = applyModelFilters(models, { izlagac: "a" });
    expect(adjacentModels(list, "m2")).toMatchObject({ index: 1, total: 3, previous: { id: "m1" }, next: { id: "m3" } });
    expect(adjacentModels(list, "m1")).toMatchObject({ previous: null, next: { id: "m2" } });
    expect(adjacentModels(list, "m5")).toMatchObject({ index: -1, previous: null, next: null });
  });
});
