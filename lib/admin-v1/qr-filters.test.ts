import { describe, expect, test } from "vitest";
import {
  applyQrFilters,
  clearQrFiltersPatch,
  qrCodeFromSearch,
  qrHierarchyCountedIds,
  qrListQuery,
  qrStateCounts,
  qrStateOf,
  type FilterableQrRow,
} from "./qr-filters";

// Admin UX A4 — filters of the QR list: state of a code, the Izlagač → Brend
// → Model hierarchy of the model it leads to, search by SMQ / resolver code /
// model, counts next to the options and the query keys.

const model = (id: string, participationId: string, brandId: string, displayName: string) => ({
  id, participationId, brandId, displayName, variant: undefined, brandName: `TEST ${brandId}`, exhibitorName: `TEST Izlagač ${participationId}`, externalKey: `test-${id}`,
});
const models = new Map([
  ["m1", model("m1", "a", "volta", "TEST Volta X1")],
  ["m2", model("m2", "a", "amper", "TEST Amper M2")],
  ["m3", model("m3", "b", "kulon", "TEST Kulon K3")],
]);

const row = (cardId: string, smqCode: string | null, extra: Partial<FilterableQrRow> = {}): FilterableQrRow => ({
  cardId, resolverCode: `T${cardId.toUpperCase().padStart(7, "0")}`, smqCode, state: "problem", problemReason: "destination_missing", assignment: null, ...extra,
});
const rows: FilterableQrRow[] = [
  row("c3", "SMQ-TEST-0003", { state: "active", problemReason: null, assignment: { modelId: "m3", sameEvent: true } }),
  row("c1", "SMQ-TEST-0001", { state: "active", problemReason: null, assignment: { modelId: "m1", sameEvent: true } }),
  row("c2", "SMQ-TEST-0002", { state: "active", problemReason: null, assignment: { modelId: "m2", sameEvent: true } }),
  row("c4", "SMQ-TEST-0010"),
  row("c5", "SMQ-TEST-0011", { problemReason: "destination_fair_unassigned" }),
  row("c6", "SMQ-TEST-0020", { state: "active", problemReason: null, assignment: { modelId: "amf-1", sameEvent: false } }),
  row("c7", "SMQ-TEST-0030", { state: "inactive", problemReason: null }),
  row("c8", null, { problemReason: "health_damaged" }),
];

describe("qrStateOf", () => {
  test("slobodan, ovaj, drugi and neaktivan", () => {
    expect(rows.map((entry) => [entry.cardId, qrStateOf(entry)])).toEqual([
      ["c3", "ovaj"], ["c1", "ovaj"], ["c2", "ovaj"], ["c4", "slobodan"], ["c5", "slobodan"], ["c6", "drugi"], ["c7", "neaktivan"], ["c8", "neaktivan"],
    ]);
  });
});

describe("applyQrFilters", () => {
  const ids = (query: Parameters<typeof applyQrFilters>[2]) => applyQrFilters(rows, models, query).map((entry) => entry.cardId);

  test("without filters every code, in SMQ order (codes without SMQ last)", () => {
    expect(ids({})).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
  });

  test("state", () => {
    expect(ids({ stanje: "slobodan" })).toEqual(["c4", "c5"]);
    expect(ids({ stanje: "ovaj" })).toEqual(["c1", "c2", "c3"]);
    expect(ids({ stanje: "drugi" })).toEqual(["c6"]);
    expect(ids({ stanje: "neaktivan" })).toEqual(["c7", "c8"]);
    // An unknown value is ignored.
    expect(ids({ stanje: "nesto" })).toHaveLength(8);
  });

  test("hierarchy: only codes of this event's models match; exhibitor narrows, brand and model too", () => {
    expect(ids({ izlagac: "a" })).toEqual(["c1", "c2"]);
    expect(ids({ izlagac: "a", brend: "amper" })).toEqual(["c2"]);
    expect(ids({ model: "m3" })).toEqual(["c3"]);
    expect(ids({ izlagac: "b", stanje: "slobodan" })).toEqual([]);
  });

  test("search by SMQ, resolver code or model, without case or diacritics", () => {
    expect(ids({ q: "smq-test-001" })).toEqual(["c4", "c5"]);
    expect(ids({ q: rows[0].resolverCode.toLowerCase() })).toEqual(["c3"]);
    expect(ids({ q: "kulon" })).toEqual(["c3"]);
    // Every word must appear (same rule as the Modeli search).
    expect(ids({ q: "AMPER m2" })).toEqual(["c2"]);
    expect(ids({ q: "izlagač" })).toEqual(["c1", "c2", "c3"]);
  });

  test("counts next to each state follow the other filters; hierarchy numbers follow state and search", () => {
    expect(qrStateCounts(rows, models, {})).toEqual({ slobodan: 2, ovaj: 3, drugi: 1, neaktivan: 2 });
    expect(qrStateCounts(rows, models, { izlagac: "a", stanje: "slobodan" })).toEqual({ slobodan: 0, ovaj: 2, drugi: 0, neaktivan: 0 });
    expect([...qrHierarchyCountedIds(rows, models, { q: "volta" })]).toEqual(["m1"]);
    expect([...qrHierarchyCountedIds(rows, models, { izlagac: "b" })].sort()).toEqual(["m1", "m2", "m3"]);
  });
});

describe("query keys and a typed code", () => {
  test("the list keys travel to the detail; Očisti keeps prikaz", () => {
    expect(qrListQuery({ izlagac: "a", stanje: "ovaj", q: "x", prikaz: "kartice", paket: "starter", lead: "l1" })).toEqual({ izlagac: "a", stanje: "ovaj", q: "x", prikaz: "kartice" });
    expect(clearQrFiltersPatch()).toEqual({ izlagac: null, brend: null, model: null, stanje: null, q: null });
  });

  test("a whole resolver code (resolver normalization) or an SMQ serial is offered as a detail link", () => {
    expect(qrCodeFromSearch("7kq2m9xa")).toBe("7KQ2M9XA");
    expect(qrCodeFromSearch(" r4t8w2pq ")).toBe("R4T8W2PQ");
    expect(qrCodeFromSearch("lo0abcde")).toBe("100ABCDE");
    expect(qrCodeFromSearch("smq-test-0001")).toBe("SMQ-TEST-0001");
    for (const text of ["", undefined, "7KQ2", "7KQ2M9XAB", "volta", "SMQ-", "7KQ2M9U!"]) expect(qrCodeFromSearch(text)).toBeNull();
  });
});
