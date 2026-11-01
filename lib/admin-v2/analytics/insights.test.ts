import { describe, expect, test } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { fmt } from "@/lib/i18n/format";
import { countOf } from "./format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { INSIGHT_LIMIT, INSIGHT_RULES, analyticsInsights, type Insight, type InsightId, type InsightTexts } from "./insights";
import type { AnalyticsData, AnalyticsModel, AudienceData, EngagementData } from "./types";

// ADMIN v2 X3 — „Uvidi“ are fixed rules over the numbers, in a fixed order.
// Every rule is checked on both sides of its threshold; the sentences are the
// dictionary's. Names and numbers are TEST values.

const d = adminEventsSr.analytics;
const texts: InsightTexts = {
  tier: (tier) => (d.tiers as Record<string, string>)[tier] ?? tier,
  and: d.v2.insights.and,
  otherDays: d.v2.insights.otherDays,
  scans: (count) => countOf(count, d.v2.units.scans),
};
const sentence = (item: Insight) => fmt(d.v2.insights.items[item.id], item.values);
/** `undefined` = that read has not arrived (no default: an explicit undefined must stay undefined). */
const run = (data: AnalyticsData, audience?: AudienceData, engagement?: EngagementData) => analyticsInsights({ data, audience, engagement }, texts);
const runFixture = (data: AnalyticsData = previewAnalytics) => run(data, previewAudience, previewEngagement);
const ids = (items: Insight[]) => items.map((item) => item.id);
const find = (items: Insight[], id: InsightId) => items.find((item) => item.id === id);

/** A small fair built by hand: `scans[model][day]`, one stand per model unless `stands` says otherwise. */
function fair(input: {
  days: string[];
  scans: number[][];
  today?: number;
  stands?: string[];
  tiers?: Array<AnalyticsModel["tier"]>;
  leads?: number;
  hours?: Array<[day: number, hour: number, scans: number]>;
}): AnalyticsData {
  const dayKeys = input.days.map((_, index) => `2026-10-${String(9 + index).padStart(2, "0")}`);
  const today = input.today ?? -1;
  const models: AnalyticsModel[] = input.scans.map((byDay, index) => {
    const total = byDay.reduce((sum, value) => sum + value, 0);
    const stand = input.stands?.[index] ?? String(index + 1);
    return {
      eventModelId: `m${index + 1}` as Id<"fairEventModels">, name: `Model ${index + 1}`, brandName: "TEST", exhibitorName: `TEST Izlagač ${stand}`, standCode: stand, mapLocationId: `hala-${stand}`,
      tier: input.tiers?.[index] ?? "included", scans: { today: today >= 0 ? byDay[today] : 0, total }, uniquePerModel: { today: today >= 0 ? byDay[today] : 0, total },
      leads: 0, votes: 0, rating: null,
    };
  });
  const perDay = input.days.map((_, day) => input.scans.reduce((sum, byDay) => sum + byDay[day], 0));
  const all = perDay.reduce((sum, value) => sum + value, 0);
  return {
    at: Date.parse("2026-10-12T10:00:00+02:00"), cutoff: Date.parse("2026-10-09T08:00:00+02:00"), todayKey: today >= 0 ? dayKeys[today] : "2026-10-20", capped: false,
    kpis: {
      scans: { today: today >= 0 ? perDay[today] : 0, total: all }, uniquePerModel: { today: today >= 0 ? perDay[today] : 0, total: all },
      leads: { today: 0, total: input.leads ?? 0, interest: input.leads ?? 0, testDrive: 0, capped: false }, audienceVotes: 0, surveys: { total: 0, capped: false }, shares: { total: 0, capped: false },
    },
    days: input.days.map((label, index) => ({ dateKey: dayKeys[index], label, scans: perDay[index], uniquePerModel: perDay[index] })),
    hours: (input.hours ?? []).map(([day, hour, scans]) => ({ dateKey: dayKeys[day], hour, scans, uniquePerModel: scans })),
    models,
    heat: { today: [], hour: [] },
  };
}

const engagementOf = (data: AnalyticsData, depth: EngagementData["depth"], stampVisitors = 0): EngagementData => ({
  ...previewEngagement,
  days: data.days.map((day) => ({ dateKey: day.dateKey, label: day.label, visitors: 0, leads: 0 })),
  models: data.models.map((model) => ({ eventModelId: model.eventModelId, scansByDay: data.days.map(() => 0) })),
  depth,
  stampVisitors,
  packages: [],
  capped: { ...previewEngagement.capped, days: true },
});
const audienceOf = (stamps: number, completed: number): AudienceData => ({ ...previewAudience, stamps: { total: stamps, passportsCompleted: completed, capped: false } });
/** Depth and passport that trigger no rule, so one rule can be looked at alone. */
const quietDepth = { one: 5, two: 5, three: 0, fourPlus: 0, visitors: 10 };
const quietAudience = audienceOf(0, 0);

describe("ADMIN v2 X3: Uvidi on the fair-shaped fixture", () => {
  test("six sentences, the most important first", () => {
    const items = runFixture();
    expect(ids(items)).toEqual(["no_leads_many", "later_days", "top_stand_today", "peak_hour", "single_model", "passport_low"]);
    expect(items.map(sentence)).toEqual([
      "Za 3 dana nijedan lead.",
      "Subota i nedelja: 1,7× više skenova po danu nego petak.",
      "Štand 9 ima 43 % današnjih skenova.",
      "Najjači sat: nedelja u 12:00, 39 skenova.",
      "71,6 % posetilaca skeniralo je samo jedan model.",
      "Pasoš je završilo 3 % posetilaca sa pečatom (5 od 164).",
    ]);
    // Only the missing leads are a problem; everything else is a fact.
    expect(items.map((item) => item.tone)).toEqual(["problem", "fact", "fact", "fact", "fact", "fact"]);
  });

  test("never more than six: the two weaker rules hold too, and wait their turn", () => {
    expect(runFixture()).toHaveLength(INSIGHT_LIMIT);
    // With leads the first rule is quiet and the seventh sentence comes up.
    const withLeads = runFixture({ ...previewAnalytics, kpis: { ...previewAnalytics.kpis, leads: { ...previewAnalytics.kpis.leads, total: 4 } } });
    expect(ids(withLeads)).toEqual(["later_days", "top_stand_today", "peak_hour", "single_model", "passport_low", "package_gap"]);
    expect(sentence(find(withLeads, "package_gap")!)).toBe("Napredni: 3,6× više skenova po modelu nego besplatan. To je korelacija, ne uzrok.");
  });

  test("the same numbers always give the same sentences (no randomness, no clock)", () => {
    expect(runFixture()).toEqual(runFixture());
  });

  test("while the two later reads are on the way, only the rules of the counters speak", () => {
    expect(ids(run(previewAnalytics))).toEqual(["no_leads_many", "later_days", "top_stand_today", "peak_hour", "package_gap"]);
    // The depth and the passport both need the engagement read (who scanned how much, who has a stamp): the audience alone adds nothing.
    expect(ids(run(previewAnalytics, previewAudience))).toEqual(["no_leads_many", "later_days", "top_stand_today", "peak_hour", "package_gap"]);
    expect(ids(run(previewAnalytics, undefined, previewEngagement))).toEqual(["no_leads_many", "later_days", "top_stand_today", "peak_hour", "single_model", "package_gap"]);
  });

  test("every rule has its sentence in the dictionary, and every placeholder is filled", () => {
    const seen = new Set<InsightId>();
    for (const item of [...runFixture(), ...runFixture({ ...previewAnalytics, kpis: { ...previewAnalytics.kpis, leads: { ...previewAnalytics.kpis.leads, total: 1 } } })]) {
      seen.add(item.id);
      expect(sentence(item)).not.toMatch(/[{}]/);
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);
    for (const template of Object.values(d.v2.insights.items)) expect(template.length).toBeGreaterThan(10);
  });
});

describe("ADMIN v2 X3: Uvidi, rule by rule", () => {
  test("no scans: no insight at all", () => {
    expect(run(fair({ days: ["Petak", "Subota"], scans: [[0, 0]] }), quietAudience, undefined)).toEqual([]);
  });

  test("no lead: one day says „dan“, more days say „dana“; a single lead silences the rule", () => {
    const one = run(fair({ days: ["Petak", "Subota"], scans: [[5, 0]] }), quietAudience, undefined);
    expect(sentence(find(one, "no_leads_one")!)).toBe("Za 1 dan nijedan lead.");
    expect(find(one, "no_leads_many")).toBeUndefined();
    const two = run(fair({ days: ["Petak", "Subota"], scans: [[5, 5]] }), quietAudience, undefined);
    expect(sentence(find(two, "no_leads_many")!)).toBe("Za 2 dana nijedan lead.");
    expect(two[0].tone).toBe("problem");
    const withLead = run(fair({ days: ["Petak", "Subota"], scans: [[5, 5]], leads: 1 }), quietAudience, undefined);
    expect(ids(withLead).filter((id) => id.startsWith("no_leads"))).toEqual([]);
  });

  test("later days against the first: from 1,3× per day, counted only on days with scans", () => {
    const at = (later: number) => find(run(fair({ days: ["Petak", "Subota"], scans: [[100, later]], leads: 1 }), quietAudience, undefined), "later_days");
    expect(at(129)).toBeUndefined();
    expect(sentence(at(130)!)).toBe("Subota: 1,3× više skenova po danu nego petak.");
    expect(INSIGHT_RULES.laterDaysTimes).toBe(1.3);
    // Two later days are averaged (150 and 250 → 2× of 100) and named; a day without a scan is left out.
    const three = find(run(fair({ days: ["Petak", "Subota", "Nedelja"], scans: [[100, 150, 250]], leads: 1 }), quietAudience, undefined), "later_days")!;
    expect(sentence(three)).toBe("Subota i nedelja: 2× više skenova po danu nego petak.");
    const gap = find(run(fair({ days: ["Petak", "Subota", "Nedelja"], scans: [[100, 0, 200]], leads: 1 }), quietAudience, undefined), "later_days")!;
    expect(sentence(gap)).toBe("Nedelja: 2× više skenova po danu nego petak.");
    // More than two later days are not listed by name; a label that is not a plain word keeps its capitals.
    const many = find(run(fair({ days: ["TEST dan 1", "TEST dan 2", "TEST dan 3", "TEST dan 4"], scans: [[10, 20, 20, 20]], leads: 1 }), quietAudience, undefined), "later_days")!;
    expect(sentence(many)).toBe("Ostali dani: 2× više skenova po danu nego TEST dan 1.");
    // One day only: nothing to compare.
    expect(find(run(fair({ days: ["Petak"], scans: [[100]], leads: 1 }), quietAudience, undefined), "later_days")).toBeUndefined();
  });

  test("the leading stand: from 40 % of today's scans on a fair day, of all scans after the fair", () => {
    const today = (first: number, second: number) => run(fair({ days: ["Petak"], scans: [[first], [second], [100 - first - second]], today: 0, leads: 1 }), quietAudience, undefined);
    expect(find(today(39, 31), "top_stand_today")).toBeUndefined();
    expect(sentence(find(today(40, 30), "top_stand_today")!)).toBe("Štand 1 ima 40 % današnjih skenova.");
    expect(find(today(40, 30), "top_stand_total")).toBeUndefined();
    // After the fair (today is not a fair day) the whole fair is the base.
    const after = run(fair({ days: ["Petak"], scans: [[45], [30], [25]], leads: 1 }), quietAudience, undefined);
    expect(sentence(find(after, "top_stand_total")!)).toBe("Štand 1 ima 45 % svih skenova.");
    expect(find(after, "top_stand_today")).toBeUndefined();
    expect(find(run(fair({ days: ["Petak"], scans: [[39], [31], [30]], leads: 1 }), quietAudience, undefined), "top_stand_total")).toBeUndefined();
    // Two models of one stand count together; the stand of today may differ from the leader of the whole fair.
    const moved = run(fair({ days: ["Petak", "Subota"], scans: [[60, 5], [5, 30], [5, 25]], stands: ["A", "B", "B"], today: 1, leads: 1 }), quietAudience, undefined);
    expect(sentence(find(moved, "top_stand_today")!)).toBe("Štand B ima 91,7 % današnjih skenova.");
  });

  test("the busiest hour is named whenever there is an hour series; the first of equal hours wins", () => {
    const data = fair({ days: ["Petak", "Subota"], scans: [[20, 20]], leads: 1, hours: [[0, 10, 7], [0, 11, 9], [1, 11, 9], [1, 12, 3]] });
    expect(sentence(find(run(data, quietAudience, undefined), "peak_hour")!)).toBe("Najjači sat: petak u 11:00, 9 skenova.");
    // The noun follows the number: 1 sken, 2 skena, 21 sken, 12 skenova.
    const peakOf = (scans: number) => sentence(find(run(fair({ days: ["Petak"], scans: [[scans]], leads: 1, hours: [[0, 10, scans]] }), quietAudience, undefined), "peak_hour")!);
    expect(peakOf(1)).toBe("Najjači sat: petak u 10:00, 1 sken.");
    expect(peakOf(2)).toBe("Najjači sat: petak u 10:00, 2 skena.");
    expect(peakOf(12)).toBe("Najjači sat: petak u 10:00, 12 skenova.");
    expect(peakOf(21)).toBe("Najjači sat: petak u 10:00, 21 sken.");
    expect(find(run(fair({ days: ["Petak"], scans: [[20]], leads: 1 }), quietAudience, undefined), "peak_hour")).toBeUndefined();
  });

  test("one model only: from 60 % of the visitors; it waits for the engagement read", () => {
    const data = fair({ days: ["Petak"], scans: [[100]], leads: 1 });
    const at = (one: number) => find(run(data, quietAudience, engagementOf(data, { one, two: 100 - one, three: 0, fourPlus: 0, visitors: 100 })), "single_model");
    expect(at(59)).toBeUndefined();
    expect(sentence(at(60)!)).toBe("60 % posetilaca skeniralo je samo jedan model.");
    expect(find(run(data, quietAudience, undefined), "single_model")).toBeUndefined();
    expect(find(run(data, quietAudience, engagementOf(data, { one: 0, two: 0, three: 0, fourPlus: 0, visitors: 0 })), "single_model")).toBeUndefined();
  });

  test("the passport: below 5 % of the visitors with a stamp completed one; nobody with a stamp, no sentence", () => {
    const data = fair({ days: ["Petak"], scans: [[100]], leads: 1 });
    // 500 stamps of 200 visitors: the share is of the people, whatever the number of stamps.
    const at = (completed: number, stampVisitors = 200) => find(run(data, audienceOf(500, completed), engagementOf(data, quietDepth, stampVisitors)), "passport_low");
    expect(at(10)).toBeUndefined(); // exactly 5 %
    expect(sentence(at(9)!)).toBe("Pasoš je završilo 4,5 % posetilaca sa pečatom (9 od 200).");
    expect(sentence(at(0)!)).toBe("Pasoš je završilo 0 % posetilaca sa pečatom (0 od 200).");
    // Per stamp 9 of 500 would be 1,8 %: that is not what is said.
    expect(sentence(at(9)!)).not.toContain("500");
    expect(at(0, 0)).toBeUndefined();
    // It waits for both reads: the passports come with the audience, the people with the engagement.
    expect(find(run(data, audienceOf(500, 1), undefined), "passport_low")).toBeUndefined();
    expect(find(run(data, undefined, engagementOf(data, quietDepth, 200)), "passport_low")).toBeUndefined();
  });

  test("packages: from 2× scans per model between the best and the weakest, always called a correlation", () => {
    const at = (advanced: number) => find(run(fair({ days: ["Petak"], scans: [[advanced], [advanced], [10], [10]], tiers: ["advanced", "advanced", "included", "included"], leads: 1 }), quietAudience, undefined), "package_gap");
    expect(at(19)).toBeUndefined();
    const gap = at(20)!;
    expect(sentence(gap)).toBe("Napredni: 2× više skenova po modelu nego besplatan. To je korelacija, ne uzrok.");
    expect(d.v2.insights.items.package_gap).toContain("korelacija");
    // One package only: nothing to compare.
    expect(find(run(fair({ days: ["Petak"], scans: [[50], [10]], leads: 1 }), quietAudience, undefined), "package_gap")).toBeUndefined();
    // A package of one model is not an average: it is left out of the comparison, however far it is.
    expect(find(run(fair({ days: ["Petak"], scans: [[90], [10], [10]], tiers: ["advanced", "included", "included"], leads: 1 }), quietAudience, undefined), "package_gap")).toBeUndefined();
    const withStarter = find(run(fair({ days: ["Petak"], scans: [[30], [30], [1], [10], [10]], tiers: ["advanced", "advanced", "starter", "included", "included"], leads: 1 }), quietAudience, undefined), "package_gap")!;
    expect(sentence(withStarter)).toBe("Napredni: 3× više skenova po modelu nego besplatan. To je korelacija, ne uzrok.");
  });

  test("the leading model: from a fifth of all scans", () => {
    const at = (scans: number[]) => find(run(fair({ days: ["Petak"], scans: scans.map((value) => [value]), leads: 1 }), quietAudience), "top_model");
    // 19 of 100 is below a fifth; 20 of 100 is not.
    expect(at([19, 19, 19, 19, 19, 5])).toBeUndefined();
    expect(sentence(at([20, 20, 20, 20, 20])!)).toBe("TEST Model 1 nosi 20 % svih skenova.");
    expect(sentence(at([30, 25, 25, 20])!)).toBe("TEST Model 1 nosi 30 % svih skenova.");
    expect(INSIGHT_RULES.topModelShare).toBe(0.2);
  });

  test("the order is the order of the rules, whatever the data", () => {
    const order: InsightId[] = ["no_leads_one", "no_leads_many", "later_days", "top_stand_today", "top_stand_total", "peak_hour", "single_model", "passport_low", "package_gap", "top_model"];
    for (const data of [previewAnalytics, { ...previewAnalytics, todayKey: "2026-10-20", kpis: { ...previewAnalytics.kpis, scans: { ...previewAnalytics.kpis.scans, today: 0 } } }]) {
      const got = ids(runFixture(data));
      expect([...got].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(got);
    }
  });
});
