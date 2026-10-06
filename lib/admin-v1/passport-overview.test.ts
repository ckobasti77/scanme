import { describe, expect, test } from "vitest";
import {
  applyPassportFilters,
  buildPassportRows,
  clearPassportFiltersPatch,
  passportStateCounts,
  passportStateOf,
  type PassportOverviewBrand,
  type PassportOverviewSource,
} from "./passport-overview";

// Admin UX A7 — `interakcije/pasos` rows: the state from the overview and the
// client's time, members with the withdrawn car that blocks completion, and
// the filters of the query string. TEST data only.

const OPENING = Date.parse("2026-10-09T00:00:00+02:00");
const BEFORE = OPENING - 3_600_000;
const AFTER = OPENING + 3_600_000;

const brand = (brandId: string, extra: Partial<PassportOverviewBrand> = {}): PassportOverviewBrand => ({
  brandId, participationId: "p-a", eligible: true, exhibited: 2, problems: [], tooManyModels: false, freezesAt: OPENING, passport: null, members: [], ...extra,
});
const published = (passportId: string, extra: Partial<NonNullable<PassportOverviewBrand["passport"]>> = {}) => ({ passportId, status: "published" as const, frozenAt: OPENING, ...extra });

const source: PassportOverviewSource = {
  eventStartsAt: OPENING,
  brands: [
    brand("b-volta", { passport: published("pass-volta"), members: [
      { eventModelId: "m2", status: "removed", removedAt: BEFORE, removedByAdmin: false },
      { eventModelId: "m1", status: "required", removedByAdmin: false },
      { eventModelId: "m3", status: "required", removedByAdmin: false },
    ] }),
    brand("b-amper", { passport: published("pass-amper", { hiddenAt: BEFORE }) }),
    brand("b-om", { participationId: "p-b", eligible: false, problems: [{ code: "model_below_starter", count: 1 }] }),
    brand("b-kulon", { participationId: "p-b", eligible: false, passport: published("pass-kulon", { status: "withdrawn" }) }),
    brand("b-dzul", { participationId: "p-b" }),
  ],
};
const names = {
  brands: new Map([["b-volta", "TEST Volta"], ["b-amper", "TEST Amper"], ["b-om", "TEST Om"], ["b-kulon", "TEST Kulon"], ["b-dzul", "TEST Džul"]]),
  exhibitors: new Map([["p-a", "TEST Izlagač A"], ["p-b", "TEST Izlagač B"]]),
  models: new Map([
    ["m1", { name: "TEST Volta X1", status: "published" as const }],
    ["m2", { name: "TEST Volta X2", status: "published" as const }],
    ["m3", { name: "TEST Volta X3", status: "withdrawn" as const }],
  ]),
};

describe("A7 passport state", () => {
  test("published and visible follows the catalog until the freeze; hidden wins; no passport is Nema uslov or Nije napravljen", () => {
    expect(passportStateOf(brand("b", { passport: published("x") }), BEFORE)).toBe("active");
    expect(passportStateOf(brand("b", { passport: published("x") }), OPENING)).toBe("frozen");
    // A manual freeze before the opening counts from its own moment.
    expect(passportStateOf(brand("b", { passport: published("x", { frozenAt: BEFORE - 1 }), freezesAt: BEFORE - 1 }), BEFORE)).toBe("frozen");
    expect(passportStateOf(brand("b", { passport: published("x", { hiddenAt: BEFORE }) }), AFTER)).toBe("hidden");
    expect(passportStateOf(brand("b", { eligible: false, passport: published("x", { status: "withdrawn", hiddenAt: BEFORE }) }), AFTER)).toBe("hidden");
    expect(passportStateOf(brand("b", { eligible: false, passport: published("x", { status: "withdrawn" }) }), BEFORE)).toBe("not_eligible");
    expect(passportStateOf(brand("b", { eligible: false }), BEFORE)).toBe("not_eligible");
    expect(passportStateOf(brand("b"), BEFORE)).toBe("missing");
    expect(passportStateOf(brand("b", { passport: { passportId: "x", status: "draft" } }), BEFORE)).toBe("missing");
  });

  test("rows: names, required members first, a required withdrawn car blocks completion; sorted by exhibitor and brand", () => {
    const rows = buildPassportRows(source, names, AFTER);
    expect(rows.map((row) => `${row.exhibitorName}/${row.brandName}/${row.state}`)).toEqual([
      "TEST Izlagač A/TEST Amper/hidden",
      "TEST Izlagač A/TEST Volta/frozen",
      "TEST Izlagač B/TEST Džul/missing",
      "TEST Izlagač B/TEST Kulon/not_eligible",
      "TEST Izlagač B/TEST Om/not_eligible",
    ]);
    const volta = rows.find((row) => row.brandId === "b-volta")!;
    expect(volta.members.map((member) => `${member.modelName}:${member.status}:${member.blocking}`)).toEqual([
      "TEST Volta X1:required:false", "TEST Volta X3:required:true", "TEST Volta X2:removed:false",
    ]);
    expect(volta).toMatchObject({ requiredCount: 2, blockingCount: 1, frozen: true, passportId: "pass-volta", passportStatus: "published" });
    expect(rows.find((row) => row.brandId === "b-amper")).toMatchObject({ hiddenAt: BEFORE, state: "hidden" });
    expect(buildPassportRows(source, names, BEFORE).find((row) => row.brandId === "b-volta")).toMatchObject({ state: "active", frozen: false });
  });

  test("filters: exhibitor, brand (from the model detail) and state; counts per state under the other filters", () => {
    const rows = buildPassportRows(source, names, AFTER);
    expect(applyPassportFilters(rows, { izlagac: "p-b" }).map((row) => row.brandId)).toEqual(["b-dzul", "b-kulon", "b-om"]);
    expect(applyPassportFilters(rows, { brend: "b-volta" }).map((row) => row.brandId)).toEqual(["b-volta"]);
    expect(applyPassportFilters(rows, { stanje: "bez-uslova" }).map((row) => row.brandId)).toEqual(["b-kulon", "b-om"]);
    expect(applyPassportFilters(rows, { stanje: "slobodan" })).toHaveLength(rows.length); // a QR value is ignored here
    expect(passportStateCounts(rows, { izlagac: "p-b", stanje: "aktivan" })).toEqual({ aktivan: 0, zamrznut: 0, sakriven: 0, "bez-uslova": 2, "nije-napravljen": 1 });
    expect(clearPassportFiltersPatch()).toEqual({ izlagac: null, brend: null, stanje: null });
  });
});
