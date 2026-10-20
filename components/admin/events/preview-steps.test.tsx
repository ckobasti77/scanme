import { describe, expect, test } from "vitest";
import { fairRecords } from "@/lib/admin-v2/analytics/records";
import { advanceLedger, missionBoard, type MissionInput } from "@/lib/admin-v2/missions";
import type { EventDashboardData } from "./dashboard-logic";
import { PREVIEW_STEP_SCANS, previewAnalytics, previewAnalyticsStep, previewAudience, previewEngagement, previewStep } from "./preview-analytics-fixtures";
import { PREVIEW_HUD, previewDashboard } from "./preview-dashboard-fixtures";

// ADMIN v2 X4 — the dev previews can show the same page "one poll later"
// (`?uzivo=<step>`), so the rolling numbers, a new record and a solved mission
// can be seen without Convex. TEST numbers only; step 0 is the fixture itself.

describe("?uzivo= of the previews", () => {
  test("only a whole step from 1 to 9 counts; anything else is the fixture as it is", () => {
    expect(["1", "3", "9"].map(previewStep)).toEqual([1, 3, 9]);
    expect(["0", "-2", "1.5", "x", "", null, undefined].map(previewStep)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(previewStep("40")).toBe(9);
  });

  test("step 0 returns the very fixtures (nothing moves on the first load)", () => {
    const step = previewAnalyticsStep(0);
    expect(step.data).toBe(previewAnalytics);
    expect(step.audience).toBe(previewAudience);
    expect(step.engagement).toBe(previewEngagement);
    expect(previewDashboard("dan3", 0)).toBe(previewDashboard("dan3"));
  });
});

describe("Analitika one poll later", () => {
  test("every step adds the same TEST scans to today, to the fair, to the current hour and to the leading model", () => {
    const base = previewAnalytics;
    const { data, engagement } = previewAnalyticsStep(2);
    const extra = 2 * PREVIEW_STEP_SCANS;
    expect(data.kpis.scans).toEqual({ today: base.kpis.scans.today + extra, total: base.kpis.scans.total + extra });
    expect(data.days.at(-1)?.scans).toBe((base.days.at(-1)?.scans ?? 0) + extra);
    expect(data.days.slice(0, -1)).toEqual(base.days.slice(0, -1));
    expect(data.models[0].scans).toEqual({ today: base.models[0].scans.today + extra, total: base.models[0].scans.total + extra });
    expect(data.models.slice(1)).toEqual(base.models.slice(1));
    const sum = (rows: typeof data.hours) => rows.reduce((total, row) => total + row.scans, 0);
    expect(sum(data.hours)).toBe(sum(base.hours) + extra);
    // The days of the engagement read stay in step with the counters.
    expect(engagement.models[0].scansByDay.at(-1)).toBe((previewEngagement.models[0].scansByDay.at(-1) ?? 0) + extra);
    expect(data.at).toBeGreaterThan(base.at);
  });

  test("the record of the hour falls at the third step, the first lead arrives at the second", () => {
    const record = (step: number) => {
      const { data, engagement } = previewAnalyticsStep(step);
      return fairRecords(data, engagement);
    };
    const start = record(0);
    expect(record(1).hour?.value).toBe(start.hour?.value);
    expect(record(2).hour?.value).toBe(start.hour?.value);
    expect(record(3).hour?.value).toBe(3 * PREVIEW_STEP_SCANS);
    expect(record(3).hour?.value).toBeGreaterThan(start.hour?.value ?? 0);
    expect(record(3).hour?.today).toBe(true);
    expect(start.firstLead).toBeNull();
    expect(record(1).firstLead).toBeNull();
    expect(record(2).firstLead).not.toBeNull();
    expect(previewAnalyticsStep(1).data.kpis.leads.total).toBe(0);
    expect(previewAnalyticsStep(2).data.kpis.leads.total).toBe(1);
  });
});

describe("Pregled one poll later", () => {
  const missions = (dashboard: EventDashboardData): MissionInput[] =>
    dashboard.actions.map((action) => ({ id: action.rule, label: action.rule, count: action.rule === "pii_purge_countdown" ? 1 : action.count, tone: action.tone }));
  const items = (dashboard: EventDashboardData) => dashboard.actions.reduce((total, action) => total + action.count, 0);

  test("each step solves one item, the most urgent first; a rule with nothing left stops firing", () => {
    const base = previewDashboard("dan3");
    expect(items(previewDashboard("dan3", 1))).toBe(items(base) - 1);
    expect(previewDashboard("dan3", 1).actions[0]).toMatchObject({ rule: base.actions[0].rule, count: base.actions[0].count - 1 });
    const fourth = previewDashboard("dan3", base.actions[0].count);
    expect(fourth.actions.map((action) => action.rule)).not.toContain(base.actions[0].rule);
    expect(previewDashboard("dan3", items(base)).actions).toEqual([]);
  });

  test("the reports number follows the solved items, and a fair day gets the scans of the step", () => {
    const base = previewDashboard("dan3");
    const step = previewDashboard("dan3", 2);
    expect(step.kpis.reports?.pendingReview).toBe((base.kpis.reports?.pendingReview ?? 0) - 2);
    expect(step.sections.izvestaji?.pendingReview).toBe(step.kpis.reports?.pendingReview);
    expect(step.kpis.scans.today).toBe(base.kpis.scans.today + 2 * PREVIEW_STEP_SCANS);
    // Before the fair nothing is scanned "today".
    expect(previewDashboard("pre", 2).kpis.scans.today).toBe(previewDashboard("pre").kpis.scans.today);
    // The countdown to the deletion is not an item somebody solves.
    const posle = previewDashboard("posle", 99);
    expect(posle.actions.map((action) => action.rule)).toEqual(["pii_purge_countdown"]);
  });

  test("the missions of the page move with the steps: 0 od 4, then 1 od 4, then everything solved", () => {
    const DAY = "2026-10-12";
    const base = previewDashboard("dan3");
    let ledger = advanceLedger(null, missions(base), DAY, true).ledger;
    expect(missionBoard(missions(base), ledger)).toMatchObject({ done: 0, total: 4, clear: "open" });
    const first = previewDashboard("dan3", base.actions[0].count);
    ledger = advanceLedger(ledger, missions(first), DAY, true).ledger;
    expect(missionBoard(missions(first), ledger)).toMatchObject({ done: 1, total: 4, clear: "open" });
    const all = previewDashboard("dan3", 9);
    ledger = advanceLedger(ledger, missions(all), DAY, true).ledger;
    expect(missionBoard(missions(all), ledger)).toMatchObject({ done: 4, total: 4, open: 0, clear: "celebrate" });
  });

  test("the TEST HUD of the other previews is the last fair day, with a TEST name", () => {
    expect(PREVIEW_HUD?.state.kind).toBe("live");
    expect(PREVIEW_HUD?.eventTitle.startsWith("TEST ")).toBe(true);
    expect(PREVIEW_HUD?.href).toBe("/admin/dogadjaji");
  });
});
