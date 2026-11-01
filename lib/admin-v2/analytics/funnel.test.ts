import { describe, expect, test } from "vitest";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { funnelProblem, funnelSteps } from "./funnel";
import type { AnalyticsData } from "./types";

// ADMIN v2 X3 — the funnel „Gde se gubi?“: scans → visitors → engaged → leads.

const data = previewAnalytics;
const audience = previewAudience;
const engagement = previewEngagement;

const withLeads = (total: number): AnalyticsData => ({ ...data, kpis: { ...data.kpis, leads: { ...data.kpis.leads, total } } });

describe("funnelSteps with the fixtures", () => {
  const steps = funnelSteps(data, audience, engagement);

  test("the four steps in order with their values", () => {
    expect(steps.map((step) => step.id)).toEqual(["scans", "visitors", "engaged", "leads"]);
    expect(steps.map((step) => step.value)).toEqual([460, 310, 11, 0]);
  });

  test("the rate is the share of the previous step; the first two steps have none (nobody is lost from scans to visitors)", () => {
    expect(steps[0].rate).toBeNull();
    expect(steps[1].rate).toBeNull();
    expect(steps[2].rate).toBeCloseTo(11 / 310, 10);
    expect(steps[3].rate).toBe(0);
  });

  test("the visitors step says scans per visitor instead of a rate; the other steps have none", () => {
    expect(steps[1].perVisitor).toBeCloseTo(460 / 310, 10);
    expect(steps[1].perVisitor!).toBeGreaterThan(1);
    expect(steps.filter((step) => step.id !== "visitors").map((step) => step.perVisitor)).toEqual([null, null, null]);
  });

  test("the bar share is value / the first step and stays within 0–1", () => {
    expect(steps[0].share).toBe(1);
    expect(steps[1].share).toBeCloseTo(310 / 460, 10);
    expect(steps[2].share).toBeCloseTo(11 / 460, 10);
    expect(steps[3].share).toBe(0);
    for (const step of steps) {
      expect(step.share).toBeGreaterThanOrEqual(0);
      expect(step.share).toBeLessThanOrEqual(1);
    }
  });

  test("only the leads step is a problem (a zero right after a step with something)", () => {
    expect(steps.map((step) => step.problem)).toEqual([false, false, false, true]);
    expect(funnelProblem(steps)).toBe(steps[3]);
    expect(funnelProblem(steps)?.id).toBe("leads");
  });

  test("no step is capped when no read is partial", () => {
    expect(steps.every((step) => !step.capped)).toBe(true);
  });
});

describe("funnelSteps with leads", () => {
  test("a lead means no problem anywhere", () => {
    const steps = funnelSteps(withLeads(2), audience, engagement);
    expect(steps[3].value).toBe(2);
    expect(steps[3].rate).toBeCloseTo(2 / 11, 10);
    expect(steps.some((step) => step.problem)).toBe(false);
    expect(funnelProblem(steps)).toBeNull();
  });
});

describe("funnelSteps while a read is missing", () => {
  test("without the audience and the engagement the middle steps are unknown", () => {
    const steps = funnelSteps(data, undefined, undefined);
    expect(steps[1].value).toBeNull();
    expect(steps[2].value).toBeNull();
    expect(steps[1].rate).toBeNull();
    expect(steps[2].rate).toBeNull();
    expect(steps[1].perVisitor).toBeNull();
    expect(steps[1].share).toBe(0);
    expect(steps[2].share).toBe(0);
  });

  test("an unknown step is never a false problem, and neither is the step after it", () => {
    const steps = funnelSteps(data, undefined, undefined);
    // Leads: 0 after an unknown step: the previous value is not known, so no problem and no rate.
    expect(steps[3].value).toBe(0);
    expect(steps[3].rate).toBeNull();
    expect(steps.some((step) => step.problem)).toBe(false);
    expect(funnelProblem(steps)).toBeNull();
  });

  test("with only the audience the engaged step is unknown", () => {
    const steps = funnelSteps(data, audience, undefined);
    expect(steps[1].value).toBe(310);
    expect(steps[2].value).toBeNull();
    expect(steps[3].problem).toBe(false);
  });
});

describe("funnelSteps: no one engaged", () => {
  const nobody = { ...engagement, engaged: { ...engagement.engaged, visitors: 0 } };

  test("zero engaged next to visitors is the problem on `engaged`", () => {
    const steps = funnelSteps(data, audience, nobody);
    expect(steps[2].value).toBe(0);
    expect(steps[2].problem).toBe(true);
    expect(funnelProblem(steps)?.id).toBe("engaged");
  });

  test("the step after a zero is not a problem again (the previous is 0)", () => {
    const steps = funnelSteps(data, audience, nobody);
    expect(steps[3].problem).toBe(false);
    expect(steps[3].rate).toBeNull();
  });

  test("funnelProblem returns the first problem step", () => {
    const steps = funnelSteps(data, audience, nobody);
    expect(steps.filter((step) => step.problem)).toHaveLength(1);
    expect(funnelProblem(steps)).toBe(steps[2]);
  });
});

describe("funnelSteps: nobody visited", () => {
  test("with no scan nothing is lost and nothing is a problem", () => {
    const empty: AnalyticsData = { ...data, kpis: { ...data.kpis, scans: { today: 0, total: 0 } } };
    const emptyAudience = { ...audience, visitors: { today: 0, total: 0, capped: false } };
    const emptyEngagement = { ...engagement, engaged: { ...engagement.engaged, visitors: 0 } };
    const steps = funnelSteps(empty, emptyAudience, emptyEngagement);
    expect(steps.map((step) => step.value)).toEqual([0, 0, 0, 0]);
    expect(steps.map((step) => step.share)).toEqual([0, 0, 0, 0]);
    expect(steps.some((step) => step.problem)).toBe(false);
    expect(steps.every((step) => step.rate === null)).toBe(true);
    // No visitor: scans per visitor would be a division by zero, so it is unknown.
    expect(steps.every((step) => step.perVisitor === null)).toBe(true);
    expect(funnelProblem(steps)).toBeNull();
  });
});

describe("funnelSteps: partial reads", () => {
  test("a capped read marks its step", () => {
    const steps = funnelSteps(
      { ...data, capped: true, kpis: { ...data.kpis, leads: { ...data.kpis.leads, capped: true } } },
      { ...audience, visitors: { ...audience.visitors, capped: true } },
      { ...engagement, capped: { ...engagement.capped, ratings: true } },
    );
    expect(steps.map((step) => step.capped)).toEqual([true, true, true, true]);
  });

  test("a capped read of another step does not mark the funnel", () => {
    const steps = funnelSteps(data, audience, { ...engagement, capped: { ...engagement.capped, stamps: true, days: true } });
    expect(steps.map((step) => step.capped)).toEqual([false, false, false, false]);
  });
});
