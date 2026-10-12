import { describe, expect, test } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { PACKAGE_GAP_MIN_MODELS, packageGap, packageRows, standExhibitors, standRanking, type PackageRow } from "./stands";
import type { AnalyticsData, AnalyticsModel, AudienceData } from "./types";

// ADMIN v2 X3 — the stand ranking and what a package brings. Fixtures: 15 TEST
// models on 4 map locations (stand 6 holds two exhibitors).

const data = previewAnalytics;
const audience = previewAudience;
const engagement = previewEngagement;
const id = (value: string) => value as Id<"fairEventModels">;

const model = (key: string, scans: number, over: Partial<AnalyticsModel> = {}): AnalyticsModel => ({
  eventModelId: id(key),
  name: `TEST ${key}`,
  brandName: "TEST Brend",
  exhibitorName: "TEST Izlagač",
  standCode: "1",
  mapLocationId: "test-1",
  tier: "included",
  scans: { today: 0, total: scans },
  uniquePerModel: { today: 0, total: scans },
  leads: 0,
  votes: 0,
  rating: null,
  ...over,
});
const dataOf = (models: AnalyticsModel[]): AnalyticsData => ({
  ...data,
  models,
  kpis: { ...data.kpis, scans: { today: 0, total: models.reduce((total, row) => total + row.scans.total, 0) } },
});

describe("standRanking with the fixtures", () => {
  const rows = standRanking(data, audience);
  const stand = (code: string) => rows.find((row) => row.standCode === code)!;

  test("is ordered by scans of the stand", () => {
    expect(rows.map((row) => row.standCode)).toEqual(["9", "6", "1B", "1A"]);
    for (let index = 1; index < rows.length; index += 1) expect(rows[index - 1].scans).toBeGreaterThanOrEqual(rows[index].scans);
  });

  test("the scans of the stands add up to the scans of the fair", () => {
    expect(rows.reduce((total, row) => total + row.scans, 0)).toBe(data.kpis.scans.total);
    expect(rows.reduce((total, row) => total + row.models, 0)).toBe(data.models.length);
  });

  test("stand 6 has two exhibitors in alphabetical order and two segments, the bigger first", () => {
    const six = stand("6");
    expect(six.exhibitors).toEqual(["TEST Izlagač B", "TEST Izlagač C"]);
    expect(six.segments).toHaveLength(2);
    expect(six.segments[0].scans).toBeGreaterThan(six.segments[1].scans);
    expect(six.segments.map((segment) => segment.exhibitor)).toEqual(["TEST Izlagač C", "TEST Izlagač B"]);
    expect(six.segments.reduce((total, segment) => total + segment.scans, 0)).toBe(six.scans);
    expect(six.segments.reduce((total, segment) => total + segment.models, 0)).toBe(six.models);
  });

  test("a stand with one exhibitor has one segment with all its scans", () => {
    const nine = stand("9");
    expect(nine.segments).toEqual([{ exhibitor: "TEST Izlagač A", scans: nine.scans, models: 3 }]);
  });

  test("the package of each stand", () => {
    expect(stand("9").tiers).toEqual(["advanced"]);
    expect(stand("6").tiers).toEqual(["included"]);
    expect(stand("1A").tiers).toEqual(["starter"]);
  });

  test("visitors come from the audience read; conversion is leads / those visitors", () => {
    expect(stand("9").visitors).toBe(168);
    expect(stand("6").visitors).toBe(101);
    expect(stand("1B").visitors).toBe(68);
    expect(stand("1A").visitors).toBe(26);
    // No lead at the preview fair: a real zero, not null.
    expect(rows.every((row) => row.conversion === 0)).toBe(true);
  });

  test("share is scans / the first stand's; the first is 1", () => {
    expect(rows[0].share).toBe(1);
    expect(rows[1].share).toBeCloseTo(rows[1].scans / rows[0].scans, 10);
  });

  test("fairShare is scans / all scans and adds up to 1", () => {
    for (const row of rows) expect(row.fairShare).toBeCloseTo(row.scans / data.kpis.scans.total, 10);
    expect(rows.reduce((total, row) => total + row.fairShare!, 0)).toBeCloseTo(1, 10);
  });

  test("today's scans, unique per model and votes are summed per stand", () => {
    expect(stand("9").scansToday).toBe(data.models.filter((row) => row.standCode === "9").reduce((total, row) => total + row.scans.today, 0));
    expect(stand("9").uniquePerModel).toBe(201);
    expect(stand("9").votes).toBe(2);
    expect(stand("1B").votes).toBe(1);
  });
});

describe("standRanking without the audience read", () => {
  test("visitors are null", () => {
    expect(standRanking(data, undefined).every((row) => row.visitors === null)).toBe(true);
  });

  test("conversion is computed over the unique per model of the stand's models", () => {
    const models = [
      model("a", 20, { leads: 2, uniquePerModel: { today: 0, total: 10 } }),
      model("b", 10, { leads: 2, uniquePerModel: { today: 0, total: 10 } }),
    ];
    const [row] = standRanking(dataOf(models), undefined);
    expect(row.visitors).toBeNull();
    expect(row.conversion).toBeCloseTo(4 / 20, 10);
  });

  test("with the audience read conversion is over the stand's distinct visitors", () => {
    const models = [model("a", 20, { leads: 2, uniquePerModel: { today: 0, total: 10 } }), model("b", 10, { leads: 2, uniquePerModel: { today: 0, total: 10 } })];
    const known: AudienceData = { ...audience, locations: [{ locationId: "test-1", visitors: 16 }] };
    const [row] = standRanking(dataOf(models), known);
    expect(row.visitors).toBe(16);
    expect(row.conversion).toBeCloseTo(4 / 16, 10);
  });

  test("a stand missing from the audience read has 0 visitors, and no conversion", () => {
    const known: AudienceData = { ...audience, locations: [] };
    const [row] = standRanking(dataOf([model("a", 5, { leads: 1, uniquePerModel: { today: 0, total: 0 } })]), known);
    expect(row.visitors).toBe(0);
    expect(row.conversion).toBeNull();
  });
});

describe("standRanking: grouping and order rules", () => {
  test("packages of a stand are in the order Napredni, Starter, Besplatan", () => {
    const rows = standRanking(
      dataOf([model("a", 1, { tier: "included" }), model("b", 1, { tier: "starter" }), model("c", 1, { tier: "advanced" }), model("d", 1, { tier: "included" })]),
      undefined,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tiers).toEqual(["advanced", "starter", "included"]);
  });

  test("a model without a map location is grouped by its stand code", () => {
    const rows = standRanking(
      dataOf([model("a", 5, { mapLocationId: "", standCode: "7" }), model("b", 3, { mapLocationId: "", standCode: "7" }), model("c", 2, { mapLocationId: "", standCode: "8" })]),
      undefined,
    );
    expect(rows.map((row) => [row.locationId, row.models])).toEqual([["7", 2], ["8", 1]]);
  });

  test("equal scans: more unique first, then the stand code with numbers compared as numbers", () => {
    const rows = standRanking(
      dataOf([
        model("a", 5, { standCode: "10", mapLocationId: "l-10" }),
        model("b", 5, { standCode: "2", mapLocationId: "l-2" }),
        model("c", 5, { standCode: "3", mapLocationId: "l-3", uniquePerModel: { today: 0, total: 9 } }),
      ]),
      undefined,
    );
    expect(rows.map((row) => row.standCode)).toEqual(["3", "2", "10"]);
  });

  test("equal segments: by exhibitor name", () => {
    const [row] = standRanking(dataOf([model("a", 5, { exhibitorName: "TEST Z" }), model("b", 5, { exhibitorName: "TEST A" })]), undefined);
    expect(row.segments.map((segment) => segment.exhibitor)).toEqual(["TEST A", "TEST Z"]);
  });

  test("an empty exhibitor name is not listed among the exhibitors", () => {
    const [row] = standRanking(dataOf([model("a", 5, { exhibitorName: "" }), model("b", 5, { exhibitorName: "TEST A" })]), undefined);
    expect(row.exhibitors).toEqual(["TEST A"]);
  });

  test("no scan at all: share 0, fairShare null", () => {
    const [row] = standRanking(dataOf([model("a", 0)]), undefined);
    expect(row.share).toBe(0);
    expect(row.fairShare).toBeNull();
  });

  test("no models, no stands", () => {
    expect(standRanking(dataOf([]), audience)).toEqual([]);
  });
});

describe("standRanking: place, medal and move (ADMIN v2 X4)", () => {
  // `before` = the scans until the end of the day before, `today` = the scans of today; a stand is one model.
  const stand = (code: string, before: number, today: number) =>
    model(code, before + today, { standCode: code, mapLocationId: `l-${code}`, scans: { today, total: before + today }, uniquePerModel: { today: 0, total: before + today } });
  const byCode = (rows: ReturnType<typeof standRanking>, code: string) => rows.find((row) => row.standCode === code)!;

  test("the place is 1-based; the first three stands with a scan wear a medal, the others none", () => {
    const rows = standRanking(data, audience);
    expect(rows.map((row) => [row.rank, row.medal])).toEqual([[1, 1], [2, 2], [3, 3], [4, null]]);
  });

  test("a stand without a scan has no medal, even among the first three", () => {
    const rows = standRanking(dataOf([stand("a", 4, 0), stand("b", 0, 0), stand("c", 0, 0)]), undefined);
    expect(rows.map((row) => [row.standCode, row.rank, row.medal])).toEqual([["a", 1, 1], ["b", 2, null], ["c", 3, null]]);
  });

  test("the move is the places gained since the end of the day before", () => {
    // Before today: a 10, b 8, c 5. Today b +5, c +9: b 13, c 14, a 10.
    const rows = standRanking(dataOf([stand("a", 10, 0), stand("b", 8, 5), stand("c", 5, 9)]), undefined);
    expect(rows.map((row) => row.standCode)).toEqual(["c", "b", "a"]);
    expect(rows.map((row) => row.move)).toEqual([2, 0, -2]);
    expect(rows.every((row) => !row.isNew)).toBe(true);
  });

  test("equal counts before today keep today's order: a tie is not a move", () => {
    const rows = standRanking(dataOf([stand("a", 5, 3), stand("b", 5, 1)]), undefined);
    expect(rows.map((row) => [row.standCode, row.move])).toEqual([["a", 0], ["b", 0]]);
  });

  test("a stand with its first scans today is new, with no move; the old stands each lose a place to it", () => {
    const rows = standRanking(dataOf([stand("a", 10, 0), stand("b", 6, 0), stand("c", 0, 12)]), undefined);
    expect(byCode(rows, "c")).toMatchObject({ rank: 1, move: null, isNew: true });
    expect(byCode(rows, "a")).toMatchObject({ rank: 2, move: -1, isNew: false });
    expect(byCode(rows, "b")).toMatchObject({ rank: 3, move: -1, isNew: false });
  });

  test("a stand that is still without a scan is not new", () => {
    const rows = standRanking(dataOf([stand("a", 10, 2), stand("b", 0, 0)]), undefined);
    expect(byCode(rows, "b")).toMatchObject({ move: null, isNew: false });
  });

  test("no scan today anywhere: nothing to compare, no move and nothing new", () => {
    const rows = standRanking(dataOf([stand("a", 10, 0), stand("b", 6, 0)]), undefined);
    expect(rows.every((row) => row.move === null && !row.isNew)).toBe(true);
  });

  test("no scan before today (the first day): nothing to compare, no move and nothing new", () => {
    const rows = standRanking(dataOf([stand("a", 0, 10), stand("b", 0, 6)]), undefined);
    expect(rows.every((row) => row.move === null && !row.isNew)).toBe(true);
    expect(rows.map((row) => row.medal)).toEqual([1, 2]);
  });

  test("the fixtures stand still: the order of the stands did not change today", () => {
    expect(standRanking(data, audience).every((row) => row.move === 0 && !row.isNew)).toBe(true);
  });
});

describe("standExhibitors", () => {
  test("lists every exhibitor once", () => {
    const names = standExhibitors(data);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(5);
    expect([...names].sort()).toEqual(["TEST Izlagač A", "TEST Izlagač B", "TEST Izlagač C", "TEST Izlagač D", "TEST Izlagač E"]);
  });
});

describe("packageRows", () => {
  test("with and without the engagement read the numbers are the same", () => {
    expect(packageRows(data, undefined)).toEqual(packageRows(data, engagement));
  });

  test("the order is advanced, starter, included", () => {
    expect(packageRows(data, engagement).map((row) => row.tier)).toEqual(["advanced", "starter", "included"]);
    expect(packageRows(data, undefined).map((row) => row.tier)).toEqual(["advanced", "starter", "included"]);
  });

  test("scans, models and scans per model add up from the models", () => {
    const rows = packageRows(data, undefined);
    expect(rows.reduce((total, row) => total + row.scans, 0)).toBe(data.kpis.scans.total);
    expect(rows.reduce((total, row) => total + row.models, 0)).toBe(data.models.length);
    for (const row of rows) expect(row.scansPerModel).toBeCloseTo(row.scans / row.models, 1);
  });

  test("share is scansPerModel / the best package; the best is 1", () => {
    const rows = packageRows(data, undefined);
    const best = Math.max(...rows.map((row) => row.scansPerModel));
    expect(Math.max(...rows.map((row) => row.share))).toBe(1);
    for (const row of rows) expect(row.share).toBeCloseTo(row.scansPerModel / best, 10);
  });

  test("a partial day series (capped.days) falls back to the local numbers", () => {
    const capped = { ...engagement, capped: { ...engagement.capped, days: true }, packages: [] };
    const rows = packageRows(data, capped);
    expect(rows).not.toHaveLength(0);
    expect(rows).toEqual(packageRows(data, undefined));
  });

  test("the engagement packages are used when the read is whole", () => {
    const custom = { ...engagement, packages: [{ tier: "advanced" as const, models: 2, scans: 10, scansPerModel: 5 }] };
    const rows = packageRows(data, custom);
    expect(rows).toEqual([{ tier: "advanced", models: 2, scans: 10, scansPerModel: 5, share: 1 }]);
  });

  test("scans per model is rounded to one decimal", () => {
    const rows = packageRows(
      dataOf([model("a", 1, { tier: "included" }), model("b", 1, { tier: "included" }), model("c", 1, { tier: "included" }), model("d", 3, { tier: "advanced" })]),
      undefined,
    );
    expect(rows.map((row) => [row.tier, row.scansPerModel])).toEqual([["advanced", 3], ["included", 1]]);
    const odd = packageRows(dataOf([model("a", 1, { tier: "starter" }), model("b", 1, { tier: "starter" }), model("c", 1, { tier: "starter" }), model("d", 0, { tier: "starter" })]), undefined);
    expect(odd[0].scansPerModel).toBe(0.8);
  });

  test("with no scan per model the share is 0, not NaN", () => {
    const rows = packageRows(dataOf([model("a", 0)]), undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0].share).toBe(0);
  });
});

describe("packageGap", () => {
  const row = (tier: string, models: number, scansPerModel: number): PackageRow => ({ tier, models, scans: models * scansPerModel, scansPerModel, share: 0 });

  test("names the best and the weakest package and how many times they differ", () => {
    const rows = packageRows(data, engagement);
    const gap = packageGap(rows)!;
    expect(gap.best.tier).toBe("advanced");
    expect(gap.worst.tier).toBe("included");
    expect(gap.times).toBeCloseTo(gap.best.scansPerModel / gap.worst.scansPerModel, 10);
    expect(gap.times).toBeGreaterThan(1);
  });

  test("with the fixtures the package of one model is not an average and stays out of the comparison", () => {
    const rows = packageRows(data, engagement);
    const starter = rows.find((entry) => entry.tier === "starter")!;
    expect(starter.models).toBeLessThan(PACKAGE_GAP_MIN_MODELS);
    expect(starter.scansPerModel).toBeGreaterThan(0);
    const gap = packageGap(rows)!;
    expect([gap.best.tier, gap.worst.tier]).not.toContain("starter");
    expect(rows.filter((entry) => entry.models >= PACKAGE_GAP_MIN_MODELS).map((entry) => entry.tier)).toEqual(["advanced", "included"]);
  });

  test("hand-made rows", () => {
    const gap = packageGap([row("starter", 2, 6), row("advanced", 2, 12), row("included", 4, 3)])!;
    expect(gap.best.tier).toBe("advanced");
    expect(gap.worst.tier).toBe("included");
    expect(gap.times).toBe(4);
  });

  test("a package with a single model is not compared, even when it is the best or the weakest", () => {
    expect(PACKAGE_GAP_MIN_MODELS).toBe(2);
    // One model with 12 would be the best and one with 1 the weakest, but neither is an average.
    const gap = packageGap([row("starter", 2, 6), row("advanced", 1, 12), row("included", 4, 3), row("other", 1, 1)])!;
    expect(gap.best.tier).toBe("starter");
    expect(gap.worst.tier).toBe("included");
    expect(gap.times).toBe(2);
  });

  test("a package without models or without scans is not compared", () => {
    expect(packageGap([row("advanced", 2, 8), row("starter", 0, 0), row("included", 3, 0)])).toBeNull();
    const gap = packageGap([row("advanced", 2, 8), row("starter", 0, 100), row("included", 3, 2)])!;
    expect(gap.best.tier).toBe("advanced");
    expect(gap.worst.tier).toBe("included");
  });

  test("null with fewer than two packages with scans", () => {
    expect(packageGap([])).toBeNull();
    expect(packageGap([row("advanced", 2, 8)])).toBeNull();
  });

  test("null when only one package has at least two models", () => {
    expect(packageGap([row("advanced", 2, 8), row("starter", 1, 20), row("included", 1, 2)])).toBeNull();
    expect(packageGap([row("advanced", 1, 8), row("included", 1, 2)])).toBeNull();
  });

  test("null when the packages are equally good (nothing to compare)", () => {
    expect(packageGap([row("advanced", 2, 5), row("included", 3, 5)])).toBeNull();
  });
});
