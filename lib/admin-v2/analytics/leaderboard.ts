import { sum } from "./format";
import { referenceDayIndex } from "./kpi";
import type { AnalyticsData, AnalyticsModel, AudienceData, EngagementData } from "./types";

// ADMIN v2 X3 — the model leaderboard: „Ko vodi i ko raste?“. Models by scans
// of the whole fair, medals for the first three, the change of place since the
// end of the day before and the scans of every fair day.

export type LeaderRow = AnalyticsModel & {
  /** 1-based place by scans of the whole fair. */
  rank: number;
  /** Gold, silver, bronze; null from the fourth place and for a model without a scan. */
  medal: 1 | 2 | 3 | null;
  /**
   * Places gained (+) or lost (−) since the end of the day before the
   * reference day; null when there is no day before, no day series yet, or
   * the model had no scan until then (`isNew`).
   */
  move: number | null;
  /** First scans on the reference day. */
  isNew: boolean;
  /** Scans per fair day; null until the engagement read is in. */
  trend: number[] | null;
  /** Scans / the leader's scans (bar length, 0–1). */
  share: number;
  /** Scans / all scans of the fair. */
  fairShare: number | null;
  /** Distinct visitors of the model; null until the audience read is in. */
  visitors: number | null;
  /** Leads / unique per model; null without a unique scan. */
  conversion: number | null;
};

const byScans = (a: AnalyticsModel, b: AnalyticsModel) =>
  b.scans.total - a.scans.total || b.uniquePerModel.total - a.uniquePerModel.total || `${a.brandName} ${a.name}`.localeCompare(`${b.brandName} ${b.name}`, "sr");

export function leaderboard(data: AnalyticsData, audience: AudienceData | undefined, engagement: EngagementData | undefined): LeaderRow[] {
  const ordered = [...data.models].sort(byScans);
  const top = ordered[0]?.scans.total ?? 0;
  const all = data.kpis.scans.total;
  const visitors = new Map(audience?.models.map((row) => [row.eventModelId as string, row.visitors]) ?? []);
  const byDay = new Map(engagement?.models.map((row) => [row.eventModelId as string, row.scansByDay]) ?? []);
  const day = referenceDayIndex(data);
  // Places at the end of the day before: scans of the days before the reference day.
  const before = new Map<string, number>();
  if (engagement && day >= 1) for (const model of ordered) before.set(model.eventModelId, sum((byDay.get(model.eventModelId) ?? []).slice(0, day)));
  // Equal counts keep today's order, so a tie never shows as a move.
  const previousOrder = [...ordered].filter((model) => (before.get(model.eventModelId) ?? 0) > 0).sort((a, b) => before.get(b.eventModelId)! - before.get(a.eventModelId)!);
  const previousRank = new Map(previousOrder.map((model, index) => [model.eventModelId as string, index + 1]));
  return ordered.map((model, index) => {
    const rank = index + 1;
    const was = previousRank.get(model.eventModelId);
    return {
      ...model,
      rank,
      medal: rank <= 3 && model.scans.total > 0 ? (rank as 1 | 2 | 3) : null,
      move: was === undefined ? null : was - rank,
      isNew: before.size > 0 && was === undefined && model.scans.total > 0,
      trend: byDay.get(model.eventModelId) ?? null,
      share: top > 0 ? model.scans.total / top : 0,
      fairShare: all > 0 ? model.scans.total / all : null,
      visitors: audience ? (visitors.get(model.eventModelId) ?? 0) : null,
      conversion: model.uniquePerModel.total > 0 ? model.leads / model.uniquePerModel.total : null,
    };
  });
}
