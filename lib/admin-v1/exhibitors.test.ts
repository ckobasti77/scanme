import { describe, expect, test } from "vitest";
import { applyExhibitorFilters, buildExhibitorRows, clearExhibitorFiltersPatch, exhibitorSegmentCounts, type ExhibitorSource } from "./exhibitors";
import { parseAdminQuery } from "./query-state";

// Admin UX A5 — Izlagači: rows from the event catalog + A3 lead counts, filters.

const source: ExhibitorSource = {
  participations: [
    { id: "p-b", accountId: "a-b", exhibitorName: "TEST Šumadija Auto", codes: "SMK-TEST-B · SML-TEST-B", segment: "standard", status: "active" },
    { id: "p-a", accountId: "a-a", exhibitorName: "TEST Đurić Motors", codes: "SMK-TEST-A · SML-TEST-A", segment: "event_only", status: "active" },
    { id: "p-c", accountId: "a-c", exhibitorName: "TEST Bez modela", codes: "—", segment: "event_only", status: "draft" },
  ],
  stands: [
    { participationId: "p-a", code: "TEST-A1", displayName: "TEST štand A1" },
    { participationId: "p-a", code: "TEST-A2", displayName: "TEST štand A2" },
    { participationId: "p-b", code: "TEST-B1", displayName: "TEST štand B1" },
  ],
  models: [
    { participationId: "p-a", brandName: "TEST Volta", tier: "advanced", qrCode: "TQ001" },
    { participationId: "p-a", brandName: "TEST Amper", tier: "starter", qrCode: null },
    { participationId: "p-a", brandName: "TEST Volta", tier: "starter", qrCode: "TQ002" },
    { participationId: "p-b", brandName: "TEST Om", tier: "included", qrCode: "TQ003" },
  ],
};

describe("A5 exhibitor rows", () => {
  test("every participation (event_only and standard) with brands, models per package, QR n/m, stands; sorted by name", () => {
    const rows = buildExhibitorRows(source, { capped: false, byParticipation: [{ participationId: "p-a", total: 4, undelivered: 1 }] });
    expect(rows.map((row) => row.name)).toEqual(["TEST Bez modela", "TEST Đurić Motors", "TEST Šumadija Auto"]);
    const a = rows[1];
    expect(a.brands).toEqual(["TEST Amper", "TEST Volta"]);
    expect(a.models).toEqual({ total: 3, included: 0, starter: 2, advanced: 1 });
    expect(a.qr).toEqual({ assigned: 2, total: 3 });
    expect(a.leads).toEqual({ total: 4, undelivered: 1 });
    expect(a.stands).toEqual(["TEST štand A1 · TEST-A1", "TEST štand A2 · TEST-A2"]);
    expect(a.accountId).toBe("a-a");
    // An exhibitor without leads has 0; without models 0/0.
    expect(rows[2].leads).toEqual({ total: 0, undelivered: 0 });
    expect(rows[0].qr).toEqual({ assigned: 0, total: 0 });
  });

  test("lead counts still loading → null (shown as —), not 0", () => {
    expect(buildExhibitorRows(source).every((row) => row.leads === null)).toBe(true);
  });

  test("filters: segment from the query string, search by name, code, brand or stand without diacritics", () => {
    const rows = buildExhibitorRows(source);
    const names = (query: string) => applyExhibitorFilters(rows, parseAdminQuery(query)).map((row) => row.name);
    expect(names("?segment=standard")).toEqual(["TEST Šumadija Auto"]);
    expect(names("?segment=event-only")).toEqual(["TEST Bez modela", "TEST Đurić Motors"]);
    expect(names("?q=djuric")).toEqual(["TEST Đurić Motors"]);
    expect(names("?q=sumadija")).toEqual(["TEST Šumadija Auto"]);
    expect(names("?q=amper")).toEqual(["TEST Đurić Motors"]);
    expect(names("?q=test-b1")).toEqual(["TEST Šumadija Auto"]);
    expect(names("?q=volta&segment=standard")).toEqual([]);
    // An unknown segment value never reaches the filter.
    expect(names("?segment=vip")).toHaveLength(3);
  });

  test("segment counts follow the search; clearing removes both filters", () => {
    const rows = buildExhibitorRows(source);
    expect(exhibitorSegmentCounts(rows, {})).toEqual({ "event-only": 2, standard: 1 });
    expect(exhibitorSegmentCounts(rows, { q: "motors", segment: "standard" })).toEqual({ "event-only": 1, standard: 0 });
    expect(clearExhibitorFiltersPatch()).toEqual({ q: null, segment: null });
  });
});
