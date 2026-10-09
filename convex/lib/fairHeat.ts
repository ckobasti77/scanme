import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { belgradeLocalToEpoch } from "../../lib/belgrade-time";
import { fairScanCountKey, readFairCount, type FairScanMetric } from "./fairCountShards";
import { fairAnalyticsCutoff, fairDayCountFrom } from "./fairPreEvent";
import { fairTimeKeys } from "./fairScans";

// =============================================================================
// SAJAM SUPER — the time windows of „Gde je gužva“ and of the admin analytics,
// read from the existing stand scan counters (fairMetricCountShards, B2), never
// from raw rows. Both windows start at the event's analytics cutoff (9. 10.
// 08:00 for Elektromobilnost), so pre-event scans never count; admin scans
// never bump a counter (B2), and a bot never has the fair visitor cookie, so it
// never makes a fair scan at all (lib/fair-server/visitor.ts).
// =============================================================================

const HOUR_MS = 3_600_000;
/** Models read to find the stands that can have scans (a scan always belongs to a model). */
export const FAIR_HEAT_MODELS_CAP = 1000;

export type FairHeatWindow = {
  cutoff: number;
  /** The Belgrade day of `at`. */
  today: { dateKey: string; startsAt: number; endsAt: number };
  /**
   * The last 60 minutes from hour buckets: the current hour in full and the
   * previous one weighted by the part of it still inside the 60 minutes.
   */
  hours: Array<{ hourKey: string; weight: number }>;
};

export function fairHeatWindow(event: Pick<Doc<"fairEvents">, "startsAt" | "code">, at: number): FairHeatWindow {
  const cutoff = fairAnalyticsCutoff(event);
  const { dateKey } = fairTimeKeys(at);
  const startsAt = belgradeLocalToEpoch(`${dateKey}T00:00`) ?? at;
  // 26 h after midnight is always the next Belgrade day (a DST day has 23 or 25 hours).
  const nextKey = fairTimeKeys(startsAt + 26 * HOUR_MS).dateKey;
  const endsAt = belgradeLocalToEpoch(`${nextKey}T00:00`) ?? startsAt + 24 * HOUR_MS;
  // Belgrade is a whole number of hours off UTC, so its hours start on UTC hours.
  const currentStart = Math.floor(at / HOUR_MS) * HOUR_MS;
  const hours: FairHeatWindow["hours"] = [];
  if (currentStart >= cutoff) hours.push({ hourKey: fairTimeKeys(currentStart).hourKey, weight: 1 });
  const previousStart = currentStart - HOUR_MS;
  const weight = 1 - (at - currentStart) / HOUR_MS;
  if (previousStart >= cutoff && weight > 0) hours.push({ hourKey: fairTimeKeys(previousStart).hourKey, weight });
  return { cutoff, today: { dateKey, startsAt, endsAt }, hours };
}

/** One stand's `metric` today (from the cutoff) and in the last hour (weighted, may be fractional). */
export async function fairStandWindowCounts(
  ctx: QueryCtx,
  metric: FairScanMetric,
  standId: Id<"fairStands">,
  window: FairHeatWindow,
): Promise<{ today: number; hour: number }> {
  const base = fairScanCountKey(metric, "stand", standId);
  const today = await fairDayCountFrom(ctx, base, window.today, window.cutoff);
  let hour = 0;
  for (const bucket of window.hours) hour += (await readFairCount(ctx, `${base}:${bucket.hourKey}`)) * bucket.weight;
  return { today, hour };
}

/**
 * The active stands of the event that hold a model: only they can have scans,
 * so a stand without a car is never read (most of the organizer's list).
 */
export async function fairStandsWithModels(ctx: QueryCtx, eventId: Id<"fairEvents">): Promise<{ stands: Doc<"fairStands">[]; capped: boolean }> {
  const models = await ctx.db
    .query("fairEventModels")
    .withIndex("by_eventId_and_standId", (q) => q.eq("eventId", eventId))
    .take(FAIR_HEAT_MODELS_CAP + 1);
  const standIds = [...new Set(models.slice(0, FAIR_HEAT_MODELS_CAP).map((model) => model.standId))];
  const stands: Doc<"fairStands">[] = [];
  for (const standId of standIds) {
    const stand = await ctx.db.get(standId);
    if (stand && stand.eventId === eventId && stand.status === "active") stands.push(stand);
  }
  return { stands, capped: models.length > FAIR_HEAT_MODELS_CAP };
}
