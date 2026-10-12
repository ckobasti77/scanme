import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ANALYTICS_ANCHORS } from "@/lib/admin-v2/analytics/anchors";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { analyticsCsv, analyticsHourDay, analyticsModelRows, analyticsStandRows, formatPercent, type EventAnalyticsData } from "./analytics-logic";
import { previewAnalytics, previewAudience, previewEngagement, previewModelAnalytics } from "./preview-analytics-fixtures";
import { EventAnalyticsView, type AnalyticsViewProps } from "./sections/analitika-view";

const d = adminEventsSr.analytics;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** The fixture has no lead (as the fair had none); conversion is checked on a copy where stand 9 has some. */
const withLeads: EventAnalyticsData = {
  ...previewAnalytics,
  models: previewAnalytics.models.map((row, index) => (row.standCode === "9" ? { ...row, leads: index === 0 ? 6 : 3 } : row)),
};

const view = (props: Partial<AnalyticsViewProps> = {}) => renderToStaticMarkup(
  <EventAnalyticsView
    eventCode="test-elektromobilnost-2026"
    data={previewAnalytics}
    audience={previewAudience}
    engagement={previewEngagement}
    modelId={undefined}
    modelDetail={undefined}
    modelError={false}
    onModel={() => {}}
    onModelRetry={() => {}}
    links={{ leadSettings: "/admin/dogadjaji/test/leadovi/podesavanja", forms: "/admin/dogadjaji/test/interakcije" }}
    onRefresh={() => {}}
    refreshing={false}
    onExport={() => {}}
    {...props}
  />,
);

describe("SAJAM SUPER: Analitika logic", () => {
  test("stands sum their models; conversion = leads / the stand's distinct visitors", () => {
    const stands = analyticsStandRows(withLeads, previewAudience);
    const nine = stands.find((row) => row.locationId === "hala-9")!;
    const ofNine = withLeads.models.filter((row) => row.mapLocationId === "hala-9");
    expect(nine).toMatchObject({
      standCode: "9", models: 3, scans: sum(ofNine.map((row) => row.scans.total)), uniquePerModel: sum(ofNine.map((row) => row.uniquePerModel.total)),
      visitors: 168, leads: 12, votes: 3,
    });
    expect(nine.conversion).toBeCloseTo(12 / 168);
    // Visitors of a stand are never more than its unique-per-model pairs.
    for (const row of stands) expect(row.visitors!).toBeLessThanOrEqual(row.uniquePerModel);
    // Stand 6: two exhibitors on one location.
    expect(stands.find((row) => row.locationId === "hala-6")!.exhibitors).toEqual(["TEST Izlagač B", "TEST Izlagač C"]);
    expect(stands.map((row) => row.standCode)).toEqual(["9", "6", "1B", "1A"]);
    // Before the audience read answers, conversion falls back to unique per model.
    expect(analyticsStandRows(withLeads, undefined)[0]).toMatchObject({ visitors: null, conversion: 12 / nine.uniquePerModel });
  });

  test("models: sorted by scans, conversion = leads / unique per model, none without a unique scan", () => {
    const models = analyticsModelRows(withLeads, previewAudience);
    expect(models[0].name).toBe("X1");
    expect(models[0].conversion).toBeCloseTo(6 / models[0].uniquePerModel.total);
    const empty = analyticsModelRows({ ...previewAnalytics, models: [{ ...previewAnalytics.models[0], uniquePerModel: { today: 0, total: 0 } }] }, undefined);
    expect(empty[0].conversion).toBeNull();
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0.1818)).toBe("18,2 %");
  });

  test("the hour chart shows ?dan= when it exists, else today", () => {
    expect(analyticsHourDay(previewAnalytics, "2026-10-10")).toBe("2026-10-10");
    expect(analyticsHourDay(previewAnalytics, "1999-01-01")).toBe("2026-10-11");
    expect(analyticsHourDay({ ...previewAnalytics, todayKey: "2026-10-20" }, undefined)).toBe("2026-10-11");
  });

  test("CSV: BOM, every part, and a name never runs as a formula", () => {
    const csv = analyticsCsv({
      eventTitle: "TEST sajam",
      data: { ...previewAnalytics, models: [{ ...previewAnalytics.models[0], exhibitorName: "=HYPERLINK(\"x\")" }] },
      audience: previewAudience,
    });
    expect(csv.startsWith("﻿")).toBe(true);
    for (const part of ["Brojevi", "Skenovi po danu", "Skenovi po satu, od 08:00", "Rang modela", "Rang štandova", "Jedinstveni posetioci,117,310"]) expect(csv).toContain(part);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("\r\n");
  });

  test("CSV, ADMIN v2: the funnel, packages, depth, the passport, the insights and the scans of a model per day", () => {
    const csv = analyticsCsv({ eventTitle: "TEST sajam", data: previewAnalytics, audience: previewAudience, engagement: previewEngagement });
    for (const part of [
      `${d.v2.funnel.title}\r\n`, "Skenovi,460,\r\n", 'Jedinstveni posetioci,310,"1,48 skena po posetiocu"\r\n', "Angažovani,11,0.035\r\n", "Leadovi,0,0\r\n",
      `${d.v2.packages.title}\r\n`, "Napredni,3,214,71.3\r\n", "Besplatan,11,219,19.9\r\n",
      `${d.v2.depth.title}\r\n`, "1 model,222,0.716\r\n",
      `${d.v2.passport.title}\r\n`, "Pečati,210\r\n", "Završeni pasoši,5\r\n",
      `${d.v2.insights.title}\r\n`, "Za 3 dana nijedan lead.\r\n",
      // The model ranking carries one column per fair day.
      "Ocena,Petak,Subota,Nedelja\r\n", ",20,36,35\r\n",
    ]) expect({ part, found: csv.includes(part) }).toEqual({ part, found: true });
    // Without the engagement read the export still works and leaves its parts out.
    const early = analyticsCsv({ eventTitle: "TEST sajam", data: previewAnalytics, audience: undefined });
    expect(early).toContain(`${d.v2.funnel.title}\r\n`);
    expect(early).not.toContain(d.v2.depth.title);
    expect(early).not.toContain("Petak,Subota,Nedelja\r\n");
  });

  test("the view renders every part of Analitika v2, each under its anchor", () => {
    const html = view();
    for (const text of [
      "Jedinstveni po modelu", "Jedinstveni posetioci", "Rang modela", "Rang štandova", "Toplotna mapa", "Uređaji", "Izvezi CSV", "Osveži",
      d.v2.kpi.question, d.v2.insights.question, d.v2.funnel.question, d.v2.matrix.question, d.v2.leaderboard.question, d.v2.stands.question,
      d.v2.packages.question, d.v2.depth.question, d.v2.passport.question, d.v2.heat.question,
    ]) {
      expect({ text, found: html.includes(text) }).toEqual({ text, found: true });
    }
    // ADMIN v2: the title „Analitika“ is the H1 of the page header (the event frame), so the view has no second H1.
    expect(html).not.toContain("<h1");
    // Every part of „Na ovoj strani“ is on the page, once, in the order of the list.
    const order = ANALYTICS_ANCHORS.map((anchor) => html.indexOf(` id="${anchor.id}"`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const anchor of ANALYTICS_ANCHORS) expect(html.split(` id="${anchor.id}"`)).toHaveLength(2);
    // The two bar charts of the old view are gone: days are the KPI trend, hours the matrix.
    expect(html).not.toContain(`>${d.daysTitle}<`);
    expect(html).not.toContain(d.hoursTitle);
    // Admin heat map: the exact count is on the stand, the share in the list; 2D is drawn, 3D is not loaded.
    expect(html).toContain("Štand 9: 70 · 43,2 %");
    expect(html).toContain("data-heat-2d");
    expect(html).not.toContain("data-heat-3d");
    // Every chart has its table twin.
    expect(html.split("data-chart-table").length - 1).toBeGreaterThanOrEqual(9);
  });

  test("the numbers of the page are the aggregate of the fair: no lead is a marked problem, devices are one sentence", () => {
    const html = view();
    for (const text of [
      "ceo sajam 460", "ceo sajam 431", "ceo sajam 310",
      "Rekord sata", "39 skenova · nedelja u 12:00",
      "Za 3 dana nijedan lead.", "Subota i nedelja: 1,7× više skenova po danu nego petak.",
      "1,48 skena po posetiocu", "1,39",
      "3 % posetilaca sa pečatom završilo je pasoš (5 od 164).", "Pečata ukupno: 210",
      "Štand 9: 70 jedinstvenih po modelu · 43,2 %", "Bez skenova: Ispred hale.",
      "Telefon: 99,6 % skenova (454 od 456).", "Računar 2, tablet 0.", "Botovi (4) nisu uračunati.",
    ]) {
      expect({ text, found: html.includes(text) }).toEqual({ text, found: true });
    }
    expect(html).toContain("data-funnel-problem");
    expect(html).toContain("/admin/dogadjaji/test/leadovi/podesavanja");
    expect(html).toMatch(/data-insight="no_leads_many" data-tone="problem"/);
    // Devices are a sentence, not a chart: no bar and no table in that part.
    const devices = html.slice(html.indexOf(' id="uredjaji"'));
    expect(devices.slice(0, devices.indexOf("</section>"))).not.toMatch(/data-chart-table|<svg|<table/);
  });

  test("while the two later reads are on the way the page stands, with dashes instead of fake zeros", () => {
    const html = view({ audience: undefined, engagement: undefined });
    expect(html).toContain(d.v2.loadingPart);
    expect(html).toContain("Rang modela");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("ceo sajam 310");
    // The insights that need those reads wait; the ones from the counters are there.
    expect(html).toContain("Za 3 dana nijedan lead.");
    expect(html).not.toContain("skeniralo je samo jedan model");
  });

  test("an event without a scan: empty states, no problem marks, no insight", () => {
    const zero: EventAnalyticsData = {
      ...previewAnalytics,
      kpis: { ...previewAnalytics.kpis, scans: { today: 0, total: 0 }, uniquePerModel: { today: 0, total: 0 }, audienceVotes: 0, surveys: { total: 0, capped: false } },
      days: previewAnalytics.days.map((day) => ({ ...day, scans: 0, uniquePerModel: 0 })),
      hours: previewAnalytics.hours.map((row) => ({ ...row, scans: 0, uniquePerModel: 0 })),
      models: previewAnalytics.models.map((row) => ({ ...row, scans: { today: 0, total: 0 }, uniquePerModel: { today: 0, total: 0 }, votes: 0, rating: null })),
      heat: { today: [], hour: [] },
    };
    const html = view({
      data: zero,
      audience: { ...previewAudience, visitors: { today: 0, total: 0, capped: false }, models: [], locations: [], devices: { mobile: 0, tablet: 0, desktop: 0, unknown: 0, bots: 0, sample: 0, capped: false }, stamps: { total: 0, passportsCompleted: 0, capped: false } },
      engagement: { ...previewEngagement, days: previewEngagement.days.map((day) => ({ ...day, visitors: 0 })), models: previewEngagement.models.map((row) => ({ ...row, scansByDay: [0, 0, 0] })), depth: { one: 0, two: 0, three: 0, fourPlus: 0, visitors: 0 }, engaged: { visitors: 0, rating: 0, vote: 0, survey: 0, lead: 0 }, stampVisitors: 0, packages: [] },
    });
    for (const text of [d.v2.insights.empty, d.v2.matrix.empty, d.v2.depth.empty, d.v2.passport.empty, d.heatEmpty, d.v2.devices.empty]) {
      expect({ text, found: html.includes(text) }).toEqual({ text, found: true });
    }
    expect(html).not.toContain("data-funnel-problem");
    expect(html).not.toContain("data-chart-problem");
    expect(html).not.toContain("data-medal");
    expect(html).not.toContain("NaN");
  });

  test("`?model=` marks the open model in the leaderboard; an unknown id opens nothing", () => {
    const id = previewAnalytics.models[1].eventModelId;
    const open = view({ modelId: id, modelDetail: previewModelAnalytics(id) ?? undefined });
    expect(open.split("data-open").length - 1).toBe(1);
    expect(view({ modelId: "test-preview-nepostoji" })).not.toContain("data-open");
  });
});

describe("ADMIN v2 X3: the preview fixture has the shape of the fair", () => {
  test("15 TEST models on 4 stands, 3 days, no lead; the parts add up to the totals", () => {
    const { models, days, hours, kpis, heat } = previewAnalytics;
    expect(models).toHaveLength(15);
    expect(new Set(models.map((row) => row.mapLocationId)).size).toBe(4);
    expect(days.map((day) => day.scans)).toEqual([104, 177, 179]);
    expect(kpis).toMatchObject({ scans: { today: 179, total: 460 }, uniquePerModel: { today: 162, total: 431 }, leads: { total: 0 }, audienceVotes: 3, surveys: { total: 2 }, shares: { total: 0 } });
    expect(sum(models.map((row) => row.scans.total))).toBe(kpis.scans.total);
    expect(sum(models.map((row) => row.scans.today))).toBe(kpis.scans.today);
    expect(sum(models.map((row) => row.uniquePerModel.total))).toBe(kpis.uniquePerModel.total);
    expect(sum(models.map((row) => row.uniquePerModel.today))).toBe(kpis.uniquePerModel.today);
    expect(sum(models.map((row) => row.leads))).toBe(0);
    expect(sum(models.map((row) => row.votes))).toBe(kpis.audienceVotes);
    for (const [index, day] of days.entries()) {
      expect(sum(hours.filter((row) => row.dateKey === day.dateKey).map((row) => row.scans))).toBe(day.scans);
      expect(sum(hours.filter((row) => row.dateKey === day.dateKey).map((row) => row.uniquePerModel))).toBe(day.uniquePerModel);
      expect(sum(previewEngagement.models.map((row) => row.scansByDay[index]))).toBe(day.scans);
    }
    expect(Math.max(...hours.map((row) => row.scans))).toBe(39);
    expect(sum(days.map((day) => day.uniquePerModel))).toBe(kpis.uniquePerModel.total);
    expect(sum(heat.today.map((row) => row.count))).toBe(kpis.uniquePerModel.today);
    for (const row of models) {
      expect(row.uniquePerModel.total).toBeLessThanOrEqual(row.scans.total);
      expect(row.uniquePerModel.today).toBeLessThanOrEqual(row.scans.today);
    }
    // The leading model holds about a fifth of the scans.
    expect(Math.max(...models.map((row) => row.scans.total)) / kpis.scans.total).toBeGreaterThan(0.17);
    expect(Math.max(...models.map((row) => row.scans.total)) / kpis.scans.total).toBeLessThan(0.23);
  });

  test("only TEST names, and the visitor numbers agree with each other", () => {
    for (const row of previewAnalytics.models) {
      expect(row.brandName.startsWith("TEST ")).toBe(true);
      expect(row.exhibitorName.startsWith("TEST ")).toBe(true);
      expect(row.eventModelId.startsWith("test-preview-")).toBe(true);
    }
    expect(previewAudience.visitors).toEqual({ today: 117, total: 310, capped: false });
    expect(previewAudience.devices).toMatchObject({ mobile: 454, desktop: 2, tablet: 0, bots: 4 });
    expect(previewAudience.stamps).toMatchObject({ total: 210, passportsCompleted: 5 });
    const { depth, days, packages, engaged } = previewEngagement;
    expect(depth.one + depth.two + depth.three + depth.fourPlus).toBe(depth.visitors);
    expect(depth.visitors).toBe(previewAudience.visitors.total);
    // 431 visitor–model pairs: everyone in "4+" scanned exactly four.
    expect(depth.one + 2 * depth.two + 3 * depth.three + 4 * depth.fourPlus).toBe(previewAnalytics.kpis.uniquePerModel.total);
    expect(days.at(-1)!.visitors).toBe(previewAudience.visitors.today);
    expect(sum(packages.map((row) => row.scans))).toBe(previewAnalytics.kpis.scans.total);
    expect(sum(packages.map((row) => row.models))).toBe(15);
    expect(engaged.visitors).toBeLessThanOrEqual(engaged.rating + engaged.vote + engaged.survey + engaged.lead);
    expect(engaged.lead).toBe(0);
  });

  test("the detail of every TEST model agrees with its row in the ranking", () => {
    for (const [index, row] of previewAnalytics.models.entries()) {
      const detail = previewModelAnalytics(row.eventModelId)!;
      expect(detail.days.map((day) => day.scans)).toEqual(previewEngagement.models[index].scansByDay);
      expect(sum(detail.days.map((day) => day.uniquePerModel))).toBe(row.uniquePerModel.total);
      for (const day of detail.days) {
        expect(day.uniquePerModel).toBeLessThanOrEqual(day.scans);
        expect(sum(detail.hours.filter((hour) => hour.dateKey === day.dateKey).map((hour) => hour.scans))).toBe(day.scans);
        expect(sum(detail.hours.filter((hour) => hour.dateKey === day.dateKey).map((hour) => hour.uniquePerModel))).toBe(day.uniquePerModel);
      }
      for (const hour of detail.hours) expect(hour.uniquePerModel).toBeLessThanOrEqual(hour.scans);
      expect(detail.ratings.count).toBe(row.rating?.count ?? 0);
      expect(sum(detail.ratings.buckets)).toBe(detail.ratings.count);
      expect(detail.votes.total).toBe(row.votes);
      expect(detail.leads.total).toBe(0);
    }
    expect(previewModelAnalytics("test-preview-nepostoji")).toBeNull();
  });
});
