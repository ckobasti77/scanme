import type { AnalyticsData, AudienceData, EngagementData } from "./types";

// ADMIN v2 X3 — depth of interest: „Koliko modela posetilac pogleda?“ and the
// passport funnel „Koliko njih ide do kraja?“ (stamps → completed passports).
// The input for the visitor app: most people scan one car.

export type DepthBucketId = "one" | "two" | "three" | "fourPlus";
export type DepthBucket = { id: DepthBucketId; visitors: number; share: number };

export type Depth = {
  buckets: DepthBucket[];
  visitors: number;
  /** Unique per model / distinct visitors (e.g. 1,39); null until both are known. */
  modelsPerVisitor: number | null;
  capped: boolean;
};

const BUCKETS: readonly DepthBucketId[] = ["one", "two", "three", "fourPlus"];

export function depthOfInterest(data: AnalyticsData, audience: AudienceData | undefined, engagement: EngagementData | undefined): Depth | null {
  if (!engagement) return null;
  const visitors = engagement.depth.visitors;
  const total = audience?.visitors.total ?? visitors;
  return {
    buckets: BUCKETS.map((id) => ({ id, visitors: engagement.depth[id], share: visitors > 0 ? engagement.depth[id] / visitors : 0 })),
    visitors,
    modelsPerVisitor: total > 0 ? data.kpis.uniquePerModel.total / total : null,
    capped: engagement.capped.visitors,
  };
}

export type PassportFunnel = {
  /** Visitors with at least one stamp; null until the engagement read is in. */
  stampVisitors: number | null;
  stamps: number;
  completed: number;
  /**
   * Completed passports / visitors with a stamp. Per stamp it would be low by
   * construction (a passport needs several stamps), so the share is of the
   * people who started one. null until the engagement read is in or without a stamp.
   */
  completion: number | null;
  capped: boolean;
};

export function passportFunnel(audience: AudienceData | undefined, engagement: EngagementData | undefined): PassportFunnel | null {
  if (!audience) return null;
  const { total, passportsCompleted, capped } = audience.stamps;
  return {
    stampVisitors: engagement?.stampVisitors ?? null,
    stamps: total,
    completed: passportsCompleted,
    completion: engagement && engagement.stampVisitors > 0 ? passportsCompleted / engagement.stampVisitors : null,
    capped: capped || Boolean(engagement?.capped.stamps),
  };
}
