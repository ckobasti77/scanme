import { describe, expect, test } from "vitest";
import {
  applyInteractionExhibitorFilters,
  buildInteractionExhibitorRows,
  bulkUpgradeModels,
  clearInteractionExhibitorFiltersPatch,
  interactionListQuery,
  interactionPackageCounts,
  interactionPackageFilter,
  interactionPartPatch,
  interactionPartQuery,
  interactionReportDay,
  scopeToExhibitor,
  upgradeTargets,
  type InteractionExhibitorSource,
} from "./interaction-exhibitors";

// Izlagači 2026 — `interakcije`: one card per exhibitor, the default view only
// with Starter/Napredni cars, and the query each part of the exhibitor's page
// reads. TEST data only.

const HOUR = 3_600_000;
const NOW = Date.parse("2026-10-09T12:00:00+02:00");
const day1 = { id: "d1", dateKey: "2026-10-09", label: "TEST dan 1", startsAt: NOW - 3 * HOUR, endsAt: NOW + 7 * HOUR };
const day2 = { id: "d2", dateKey: "2026-10-10", label: "TEST dan 2", startsAt: day1.startsAt + 24 * HOUR, endsAt: day1.endsAt + 24 * HOUR };
const model = (id: string, participationId: string, brandId: string, tier: "included" | "starter" | "advanced", extra: { status?: "published" | "draft" | "withdrawn"; packageActivatedAt?: number } = {}) => ({
  id, participationId, brandId, tier, packageActivatedAt: extra.packageActivatedAt ?? NOW - 48 * HOUR, status: extra.status ?? "published" as const,
});

function source(overrides: Partial<InteractionExhibitorSource> = {}): InteractionExhibitorSource {
  return {
    participations: [
      { id: "p-c", accountId: "a-c", businessId: "b-c", externalKey: "izl26-test-c" },
      { id: "p-b", accountId: "a-b", businessId: "b-b", externalKey: "izl26-test-b" },
      { id: "p-a", accountId: "a-a", businessId: "b-a", externalKey: "izl26-test-a" },
      { id: "p-w", accountId: "a-w", businessId: "b-w", externalKey: "izl26-test-w", status: "withdrawn" },
    ],
    models: [
      model("m1", "p-a", "br-volta", "advanced"),
      model("m2", "p-a", "br-volta", "starter"),
      model("m3", "p-a", "br-amper", "included"),
      model("m4", "p-a", "br-amper", "starter", { status: "withdrawn" }),
      model("m5", "p-b", "br-om", "included"),
      model("m6", "p-w", "br-om", "advanced"),
    ],
    accounts: new Map([
      ["a-a", { name: "TEST Firma Alfa", websiteUrl: "https://example.com/a" }],
      ["a-b", { name: "TEST nalog B", websiteUrl: null }],
      ["a-c", { name: "TEST Izlagač C", websiteUrl: null }],
    ]),
    businesses: new Map([
      ["b-a", { name: "TEST Izlagač A", logoUrl: "/fair/izlagaci/2026/test-a.jpg" }],
      ["b-b", { name: "TEST Izlagač B", logoUrl: null }],
    ]),
    brands: new Map([["br-volta", "TEST Volta"], ["br-amper", "TEST Amper"], ["br-om", "TEST Om"]]),
    days: [day1, day2],
    questions: [
      { id: "q1", modelId: "m1", dayId: "d1", status: "published", showOnSponsoredRotation: false },
      { id: "q2", modelId: "m2", dayId: "d1", status: "draft", showOnSponsoredRotation: false },
    ],
    surveys: [{ modelId: "m1", status: "published" }],
    passports: [
      { exhibitorId: "p-a", brandId: "br-volta", state: "active" },
      { exhibitorId: "p-b", brandId: "br-om", state: "missing" },
    ],
    ...overrides,
  };
}

describe("buildInteractionExhibitorRows", () => {
  test("one row per live exhibitor with logo, website, brands and live cars by package; with interactions first", () => {
    const rows = buildInteractionExhibitorRows(source(), NOW);
    expect(rows.map((row) => row.id)).toEqual(["p-a", "p-b", "p-c"]);
    const [a, b, c] = rows;
    expect(a).toMatchObject({
      name: "TEST Izlagač A", accountId: "a-a", logoUrl: "/fair/izlagaci/2026/test-a.jpg", websiteUrl: "https://example.com/a",
      brands: ["TEST Amper", "TEST Volta"], models: { total: 3, advanced: 1, starter: 1, included: 1 }, hasInteractions: true,
    });
    // Business name first, then the account name; no logo stays null.
    expect(b).toMatchObject({ name: "TEST Izlagač B", logoUrl: null, websiteUrl: null, hasInteractions: false, models: { total: 1, included: 1 } });
    expect(c).toMatchObject({ name: "TEST Izlagač C", brands: [], hasInteractions: false, models: { total: 0 } });
  });

  test("Glas publike on the report day: cars entitled that day and how many have a published question; Ankete and passports", () => {
    const [a, b, c] = buildInteractionExhibitorRows(source(), NOW);
    // m1 (Napredni) has a published question, m2 (Starter) only a draft.
    expect(a.questions).toEqual({ covered: 1, required: 2 });
    expect(a.surveys).toEqual({ published: 1, advanced: 1 });
    expect(a.passports).toEqual(["active"]);
    expect(b.questions).toEqual({ covered: 0, required: 0 });
    expect(b.passports).toEqual(["missing"]);
    expect(c.surveys).toEqual({ published: 0, advanced: 0 });
    expect(c.passports).toEqual([]);
    // `?dan=` of day 2: nothing published yet.
    expect(buildInteractionExhibitorRows(source(), NOW, "2026-10-10")[0].questions).toEqual({ covered: 0, required: 2 });
  });

  test("a package counts once it runs: not before its start today; on a later day when it runs at that day's start", () => {
    const later = source({ models: [model("m1", "p-a", "br-volta", "starter", { packageActivatedAt: NOW + 2 * HOUR }), model("m2", "p-a", "br-volta", "starter", { packageActivatedAt: day2.startsAt + HOUR })] });
    expect(buildInteractionExhibitorRows(later, NOW)[0].questions).toEqual({ covered: 0, required: 0 });
    expect(buildInteractionExhibitorRows(later, NOW, "2026-10-10")[0].questions).toEqual({ covered: 0, required: 1 });
  });

  test("interaction data still loading → null, not zero", () => {
    const [a] = buildInteractionExhibitorRows(source({ questions: undefined, surveys: undefined, passports: undefined }), NOW);
    expect(a).toMatchObject({ questions: null, surveys: null, passports: null });
  });

  test("the report day: `?dan=`, else today, else the next fair day", () => {
    expect(interactionReportDay([day1, day2], NOW)?.id).toBe("d1");
    expect(interactionReportDay([day1, day2], NOW, "2026-10-10")?.id).toBe("d2");
    expect(interactionReportDay([day1, day2], day1.startsAt - 48 * HOUR)?.id).toBe("d1");
    expect(interactionReportDay([], NOW)).toBeUndefined();
  });
});

describe("filters of the list", () => {
  const rows = buildInteractionExhibitorRows(source(), NOW);
  const ids = (query: Parameters<typeof applyInteractionExhibitorFilters>[1]) => applyInteractionExhibitorFilters(rows, query).map((row) => row.id);

  test("default view: only exhibitors with a Starter or Napredni car; `svi` shows everyone", () => {
    expect(interactionPackageFilter(undefined)).toBe("interakcije");
    expect(interactionPackageFilter("premium")).toBe("interakcije");
    expect(ids({})).toEqual(["p-a"]);
    expect(ids({ paket: "svi" })).toEqual(["p-a", "p-b", "p-c"]);
    expect(ids({ paket: "napredni" })).toEqual(["p-a"]);
    expect(ids({ paket: "starter" })).toEqual(["p-a"]);
    expect(ids({ paket: "za-sve" })).toEqual(["p-b", "p-c"]);
  });

  test("search by exhibitor, account or brand without case or diacritics; `stanje` = a passport in that state", () => {
    expect(ids({ paket: "svi", q: "izlagac b" })).toEqual(["p-b"]);
    expect(ids({ paket: "svi", q: "amper" })).toEqual(["p-a"]);
    expect(ids({ paket: "svi", q: "alfa" })).toEqual(["p-a"]);
    expect(ids({ paket: "svi", stanje: "nije-napravljen" })).toEqual(["p-b"]);
    expect(ids({ stanje: "nije-napravljen" })).toEqual([]);
  });

  test("package counts follow the search and the passport filter; Očisti keeps the default view", () => {
    expect(interactionPackageCounts(rows, {})).toEqual({ interakcije: 1, svi: 3, napredni: 1, starter: 1, "za-sve": 2 });
    expect(interactionPackageCounts(rows, { q: "izlagac b" })).toEqual({ interakcije: 0, svi: 1, napredni: 0, starter: 0, "za-sve": 1 });
    expect(clearInteractionExhibitorFiltersPatch()).toEqual({ q: null, paket: null, stanje: null });
  });
});

describe("the exhibitor's page", () => {
  test("the list filters travel to the page and back; the part keys stay on the page", () => {
    const query = { paket: "svi", q: "volta", stanje: "aktivan", dan: "2026-10-10", prikaz: "kartice", model: "m1", anketa: "m1", forma: "m2", brend: "br-volta", status: "nacrt" } as const;
    expect(interactionListQuery(query)).toEqual({ paket: "svi", q: "volta", stanje: "aktivan", dan: "2026-10-10", prikaz: "kartice" });
  });

  test("each part reads its own keys: one car chosen in Glas publike does not open Ankete or Forme", () => {
    const query = { model: "m1", dan: "2026-10-10", status: "nacrt", anketa: "m2", forma: "m3", brend: "br-volta", stanje: "aktivan", paket: "svi" } as const;
    expect(interactionPartQuery("glas-publike", query)).toEqual({ model: "m1", dan: "2026-10-10", status: "nacrt" });
    expect(interactionPartQuery("ankete", query)).toEqual({ model: "m2" });
    expect(interactionPartQuery("pasos", query)).toEqual({ brend: "br-volta", stanje: "aktivan" });
    expect(interactionPartQuery("forme", query)).toEqual({ model: "m3" });
    expect(interactionPartQuery("ankete", {})).toEqual({});
  });

  test("a part's change lands in its own page keys; the exhibitor (`izlagac`) is fixed by the page", () => {
    expect(interactionPartPatch("glas-publike", { model: "m1", dan: null, izlagac: "p-b" })).toEqual({ model: "m1", dan: null });
    expect(interactionPartPatch("ankete", { model: "m2" })).toEqual({ anketa: "m2" });
    expect(interactionPartPatch("ankete", { model: null })).toEqual({ anketa: null });
    expect(interactionPartPatch("pasos", { izlagac: null, brend: null, stanje: null })).toEqual({ brend: null, stanje: null });
    expect(interactionPartPatch("forme", { model: "m3", izlagac: "p-a" })).toEqual({ forma: "m3" });
  });

  test("Glas publike / Ankete data of one exhibitor: its cars and only their questions and surveys", () => {
    const view = {
      models: [{ id: "m1", exhibitorId: "p-a" }, { id: "m5", exhibitorId: "p-b" }],
      days: [day1],
      questions: [{ id: "q1", modelId: "m1" }, { id: "q9", modelId: "m5" }],
      surveys: [{ id: "s1", modelId: "m5" }],
    };
    expect(scopeToExhibitor(view, "p-a")).toEqual({ models: [{ id: "m1", exhibitorId: "p-a" }], days: [day1], questions: [{ id: "q1", modelId: "m1" }], surveys: [] });
  });
});

describe("packages from the list and the page (only up, MASTER §4.4)", () => {
  test("the packages a car can still get", () => {
    expect(upgradeTargets("included")).toEqual(["starter", "advanced"]);
    expect(upgradeTargets("starter")).toEqual(["advanced"]);
    expect(upgradeTargets("advanced")).toEqual([]);
  });

  test("all cars to a package: only live cars below it", () => {
    const cars = [model("m1", "p-a", "b", "advanced"), model("m2", "p-a", "b", "starter"), model("m3", "p-a", "b", "included"), model("m4", "p-a", "b", "included", { status: "withdrawn" })];
    expect(bulkUpgradeModels(cars, "starter").map((row) => row.id)).toEqual(["m3"]);
    expect(bulkUpgradeModels(cars, "advanced").map((row) => row.id)).toEqual(["m2", "m3"]);
  });
});
