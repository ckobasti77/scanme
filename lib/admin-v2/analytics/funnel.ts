import type { AnalyticsData, AudienceData, EngagementData } from "./types";

// ADMIN v2 X3 — the funnel: „Gde se gubi?“. Scans → distinct visitors →
// visitors who did more than scan (rated, voted, answered a survey or left a
// lead) → leads, with the share that passes each step. A step with a zero
// after a step with something is marked as the place where it is lost. From
// scans to visitors nobody is lost (the same phones scan again), so that step
// says how many scans one visitor made instead of a share.

export type FunnelStepId = "scans" | "visitors" | "engaged" | "leads";

export type FunnelStep = {
  id: FunnelStepId;
  /** null while its read is not in. */
  value: number | null;
  /** value / the previous step; null for the first two steps or when either is unknown or the previous is zero. */
  rate: number | null;
  /** Only on `visitors`: scans per visitor (e.g. 1,48); null elsewhere and until both are known. */
  perVisitor: number | null;
  /** Bar length: value / the first step (0–1). */
  share: number;
  /** A zero right after a step that has something. */
  problem: boolean;
  capped: boolean;
};

export function funnelSteps(data: AnalyticsData, audience: AudienceData | undefined, engagement: EngagementData | undefined): FunnelStep[] {
  const raw: Array<{ id: FunnelStepId; value: number | null; capped: boolean }> = [
    { id: "scans", value: data.kpis.scans.total, capped: data.capped },
    { id: "visitors", value: audience?.visitors.total ?? null, capped: Boolean(audience?.visitors.capped) },
    {
      id: "engaged",
      value: engagement?.engaged.visitors ?? null,
      capped: Boolean(engagement && (engagement.capped.visitors || engagement.capped.ratings || engagement.capped.votes || engagement.capped.surveys || engagement.capped.leads)),
    },
    { id: "leads", value: data.kpis.leads.total, capped: data.kpis.leads.capped },
  ];
  const top = raw[0].value ?? 0;
  return raw.map((step, index) => {
    const previous = index > 0 ? raw[index - 1].value : null;
    return {
      ...step,
      rate: step.id !== "visitors" && step.value !== null && previous !== null && previous > 0 ? step.value / previous : null,
      perVisitor: step.id === "visitors" && step.value !== null && step.value > 0 && previous !== null ? previous / step.value : null,
      share: step.value !== null && top > 0 ? Math.min(1, step.value / top) : 0,
      problem: index > 0 && step.value === 0 && (previous ?? 0) > 0,
    };
  });
}

/** The first step that loses everyone, or null. */
export function funnelProblem(steps: readonly FunnelStep[]): FunnelStep | null {
  return steps.find((step) => step.problem) ?? null;
}
