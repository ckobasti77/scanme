import { describe, expect, test } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { leaderboard } from "./leaderboard";
import type { AnalyticsData, AnalyticsModel, AudienceData, EngagementData } from "./types";

// ADMIN v2 X3 — the model leaderboard. Fixtures: 15 TEST models, the reference
// day is Nedelja (index 2), so places are compared with the end of Subota.

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

/** The preview days (reference day = Nedelja) with these models and a fair total that is their sum. */
const dataOf = (models: AnalyticsModel[]): AnalyticsData => ({
  ...data,
  models,
  kpis: { ...data.kpis, scans: { today: 0, total: models.reduce((total, row) => total + row.scans.total, 0) } },
});
const engagementOf = (rows: Array<[string, [number, number, number]]>): EngagementData => ({
  ...engagement,
  models: rows.map(([key, scansByDay]) => ({ eventModelId: id(key), scansByDay })),
});
const audienceOf = (rows: Array<[string, number]>): AudienceData => ({ ...audience, models: rows.map(([key, visitors]) => ({ eventModelId: id(key), visitors })) });

describe("leaderboard order and places", () => {
  const rows = leaderboard(data, audience, engagement);

  test("is ordered by scans of the whole fair, with places 1 … n", () => {
    expect(rows).toHaveLength(15);
    expect(rows.map((row) => row.rank)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index - 1].scans.total).toBeGreaterThanOrEqual(rows[index].scans.total);
    }
  });

  test("the leader is the model with the most scans", () => {
    const most = Math.max(...data.models.map((row) => row.scans.total));
    expect(rows[0].scans.total).toBe(most);
    expect(rows[0].share).toBe(1);
  });

  test("equal scans: more unique first, then by brand and name", () => {
    const tied = leaderboard(
      dataOf([
        model("c", 5, { uniquePerModel: { today: 0, total: 3 } }),
        model("b", 5, { uniquePerModel: { today: 0, total: 4 }, brandName: "TEST Zeta" }),
        model("a", 5, { uniquePerModel: { today: 0, total: 3 }, brandName: "TEST Alfa" }),
      ]),
      undefined,
      undefined,
    );
    expect(tied.map((row) => row.eventModelId)).toEqual(["b", "a", "c"]);
  });
});

describe("leaderboard medals", () => {
  test("gold, silver, bronze for the first three, none after", () => {
    const rows = leaderboard(data, audience, engagement);
    expect(rows.slice(0, 3).map((row) => row.medal)).toEqual([1, 2, 3]);
    expect(rows.slice(3).every((row) => row.medal === null)).toBe(true);
  });

  test("a model without a scan gets no medal, even on the second place", () => {
    const rows = leaderboard(dataOf([model("a", 5), model("b", 0), model("c", 0)]), undefined, undefined);
    expect(rows.map((row) => row.medal)).toEqual([1, null, null]);
  });
});

describe("leaderboard change of place", () => {
  const rows = leaderboard(data, audience, engagement);
  const find = (key: string) => rows.find((row) => row.eventModelId === `test-preview-${key}`)!;

  test("exactly one model gained a place and exactly one lost one since the end of Subota", () => {
    const gained = rows.filter((row) => row.move === 1);
    const lost = rows.filter((row) => row.move === -1);
    expect(gained).toHaveLength(1);
    expect(lost).toHaveLength(1);
    // Cumulative to Subota: X1 56, X2 50, City 46 → City is second now, X2 third.
    expect(gained[0].eventModelId).toBe("test-preview-e1");
    expect(lost[0].eventModelId).toBe("test-preview-a2");
    expect(find("e1").rank).toBe(2);
    expect(find("a2").rank).toBe(3);
  });

  test("the others that had scans before keep their place (move 0), nobody is new", () => {
    const others = rows.filter((row) => row.eventModelId !== "test-preview-e1" && row.eventModelId !== "test-preview-a2");
    expect(others).toHaveLength(13);
    expect(others.every((row) => row.move === 0)).toBe(true);
    expect(rows.every((row) => !row.isNew)).toBe(true);
  });

  test("a model with its first scans on the reference day is new and has no move", () => {
    const rowsNew = leaderboard(
      dataOf([model("old", 8), model("fresh", 3)]),
      undefined,
      engagementOf([["old", [4, 4, 0]], ["fresh", [0, 0, 3]]]),
    );
    const fresh = rowsNew.find((row) => row.eventModelId === "fresh")!;
    expect(fresh.isNew).toBe(true);
    expect(fresh.move).toBeNull();
    const old = rowsNew.find((row) => row.eventModelId === "old")!;
    expect(old.isNew).toBe(false);
    expect(old.move).toBe(0);
  });

  test("a model without any scan is neither new nor moved", () => {
    const rowsEmpty = leaderboard(
      dataOf([model("old", 8), model("none", 0)]),
      undefined,
      engagementOf([["old", [4, 4, 0]], ["none", [0, 0, 0]]]),
    );
    const none = rowsEmpty.find((row) => row.eventModelId === "none")!;
    expect(none.isNew).toBe(false);
    expect(none.move).toBeNull();
  });

  test("a model that overtakes shows +1 and the one overtaken −1", () => {
    // Until the end of day two: P 10, Q 6. Now P 11, Q 14 → Q is first.
    const swapped = leaderboard(
      dataOf([model("p", 11), model("q", 14)]),
      undefined,
      engagementOf([["p", [5, 5, 1]], ["q", [3, 3, 8]]]),
    );
    expect(swapped.map((row) => [row.eventModelId, row.rank, row.move])).toEqual([
      ["q", 1, 1],
      ["p", 2, -1],
    ]);
  });

  test("an equal sum before is not a false move: today's order breaks the tie", () => {
    // Both had 5 until day two; P is ahead now, and stays ahead of Q in the previous order too.
    const tied = leaderboard(
      dataOf([model("p", 10), model("q", 8)]),
      undefined,
      engagementOf([["p", [5, 0, 5]], ["q", [5, 0, 3]]]),
    );
    expect(tied.map((row) => row.move)).toEqual([0, 0]);
  });

  test("on the first fair day there is no day before: no move, nobody new", () => {
    const first = leaderboard({ ...data, todayKey: "2026-10-09" }, audience, engagement);
    expect(first.every((row) => row.move === null)).toBe(true);
    expect(first.every((row) => !row.isNew)).toBe(true);
    // The trend per day is still there.
    expect(first[0].trend).not.toBeNull();
  });

  test("without the engagement read: no move, not new, no trend", () => {
    const without = leaderboard(data, audience, undefined);
    expect(without.every((row) => row.move === null)).toBe(true);
    expect(without.every((row) => !row.isNew)).toBe(true);
    expect(without.every((row) => row.trend === null)).toBe(true);
  });
});

describe("leaderboard numbers of a row", () => {
  const rows = leaderboard(data, audience, engagement);

  test("the trend is the model's scans per fair day", () => {
    const leader = rows[0];
    expect(leader.trend).toEqual([20, 36, 35]);
    expect(leader.trend!.reduce((total, value) => total + value, 0)).toBe(leader.scans.total);
  });

  test("share is scans / the leader's; fairShare is scans / all scans of the fair", () => {
    for (const row of rows) {
      expect(row.share).toBeCloseTo(row.scans.total / rows[0].scans.total, 10);
      expect(row.fairShare).toBeCloseTo(row.scans.total / data.kpis.scans.total, 10);
    }
    expect(rows.reduce((total, row) => total + row.fairShare!, 0)).toBeCloseTo(1, 10);
  });

  test("visitors come from the audience read; a model missing there has 0", () => {
    expect(rows[0].visitors).toBe(88);
    const partial = leaderboard(dataOf([model("a", 5), model("b", 3)]), audienceOf([["a", 4]]), undefined);
    expect(partial.map((row) => row.visitors)).toEqual([4, 0]);
  });

  test("visitors are null until the audience read is in", () => {
    expect(leaderboard(data, undefined, engagement).every((row) => row.visitors === null)).toBe(true);
  });

  test("conversion is leads / unique per model; null without a unique scan", () => {
    const converted = leaderboard(
      dataOf([model("a", 10, { leads: 2, uniquePerModel: { today: 0, total: 8 } }), model("b", 0, { leads: 0 })]),
      undefined,
      undefined,
    );
    expect(converted[0].conversion).toBeCloseTo(0.25, 10);
    expect(converted[1].conversion).toBeNull();
    // A real zero is not null.
    expect(rows[0].conversion).toBe(0);
  });

  test("fairShare is null when the fair has no scan; share is 0", () => {
    const empty = leaderboard(dataOf([model("a", 0)]), undefined, undefined);
    expect(empty[0].fairShare).toBeNull();
    expect(empty[0].share).toBe(0);
  });

  test("keeps the fields of the model it came from", () => {
    expect(rows[0].name).toBe("X1");
    expect(rows[0].brandName).toBe("TEST Volta");
  });

  test("an empty list of models is an empty leaderboard", () => {
    expect(leaderboard(dataOf([]), audience, engagement)).toEqual([]);
  });
});
