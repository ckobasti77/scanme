import { describe, expect, test } from "vitest";
import {
  applyQrFilters,
  clearQrFiltersPatch,
  compareQrRows,
  qrCodeFromSearch,
  qrHierarchyCountedIds,
  qrListQuery,
  qrPrintedLabel,
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

describe("printed sticker labels (Izlagači 2026)", () => {
  // TS26 = a TEST print series (the real one is SA26); a card without a label carries its resolver code.
  const labelled = [
    row("p1", "SMQ-TEST-0100", { label: "PANEL-2026-TEST" }),
    row("s10", "SMQ-TEST-0090", { label: "TS26-010" }),
    row("s2", "SMQ-TEST-0095", { label: "TS26-002" }),
    row("s100", "SMQ-TEST-0001", { label: "TS26-100" }),
    row("x1", "SMQ-TEST-0002", { label: "TX1000001" }),
    row("x0", null),
  ].map((entry) => (entry.cardId === "x1" ? { ...entry, resolverCode: "TX1000001" } : entry));

  test("a label equal to the resolver code is no printed label", () => {
    expect(qrPrintedLabel(labelled[1])).toBe("TS26-010");
    expect(qrPrintedLabel(labelled[4])).toBeNull();
    expect(qrPrintedLabel({ resolverCode: "7KQ2M9XA", label: " 7kq2m9xa " })).toBeNull();
    expect(qrPrintedLabel({ resolverCode: "7KQ2M9XA" })).toBeNull();
  });

  test("print order: sticker serials numerically, then panels, then codes without a label by SMQ", () => {
    expect([...labelled].sort(compareQrRows).map((entry) => entry.cardId)).toEqual(["s2", "s10", "s100", "p1", "x1", "x0"]);
    expect(applyQrFilters(labelled, models, {}).map((entry) => entry.cardId)).toEqual(["s2", "s10", "s100", "p1", "x1", "x0"]);
  });

  test("search by the label; a typed sticker serial opens the detail", () => {
    expect(applyQrFilters(labelled, models, { q: "ts26-010" }).map((entry) => entry.cardId)).toEqual(["s10"]);
    expect(applyQrFilters(labelled, models, { q: "panel" }).map((entry) => entry.cardId)).toEqual(["p1"]);
    expect(qrCodeFromSearch(" sa26-007 ")).toBe("SA26-007");
    expect(qrCodeFromSearch("TS26-100")).toBe("TS26-100");
    for (const text of ["PANEL-2026-EVENT", "TEST-A1", "SA26-", "-001"]) expect(qrCodeFromSearch(text)).toBeNull();
  });

  // N1 — the field team types sticker numbers the short way.
  const printed = [
    row("a7", "SMQ-TEST-0207", { label: "SA26-007" }),
    row("a17", "SMQ-TEST-0217", { label: "SA26-017" }),
    row("a70", "SMQ-TEST-0270", { label: "SA26-070" }),
    row("p1", "SMQ-TEST-0300", { label: "PANEL-2026-EVENT" }),
  ];

  test("a typed sticker number (7, sa26 7, SA26_007, O for zero) opens the detail of SA26-007", () => {
    for (const text of ["7", "07", "007", "sa26-7", "SA26 7", "SA26007", "SA26_007", "SA26–007", "OO7"]) expect({ text, code: qrCodeFromSearch(text) }).toEqual({ text, code: "SA26-007" });
    for (const text of ["0", "101", "1000", "sedam"]) expect({ text, code: qrCodeFromSearch(text) }).toEqual({ text, code: null });
    // Another series typed whole stays itself (never turned into SA26); the inventory decides whether it exists.
    expect(qrCodeFromSearch("sa27-007")).toBe("SA27-007");
    // The inventory's own series when the caller knows it.
    expect(qrCodeFromSearch("7", { prefix: "TS26", digits: 3, max: 250 })).toBe("TS26-007");
  });

  test("a sticker number in the list search finds exactly that sticker, not every code containing the digit", () => {
    for (const q of ["7", "sa26 7", "SA26_007", "sa26-007"]) expect({ q, ids: applyQrFilters(printed, models, { q }).map((entry) => entry.cardId) }).toEqual({ q, ids: ["a7"] });
    expect(applyQrFilters(printed, models, { q: "70" }).map((entry) => entry.cardId)).toEqual(["a70"]);
    expect(applyQrFilters(printed, models, { q: "panel" }).map((entry) => entry.cardId)).toEqual(["p1"]);
    expect(applyQrFilters(printed, models, { q: "smq-test-02" }).map((entry) => entry.cardId)).toEqual(["a7", "a17", "a70"]);
  });
});

