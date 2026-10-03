import type { MutationCtx, QueryCtx } from "../_generated/server";

// =============================================================================
// Sajam automobila 2026 — B2 sharded counters for fair metrics (BACKEND-HANDOFF
// §5.2 fairMetricCountShards). Same pattern as convex/lib/countShards.ts
// (TASK-24), but its OWN table: the fair never writes memoriesCountShards.
//
// Raw rows (fairScanEvents, fairUniqueScans) stay the source of truth; these
// shards are the read projection that survives the 16 Nov 2026 PII purge as an
// anonymous aggregate (keys carry model/stand ids and Belgrade time buckets,
// never a visitor).
//
// Shard count: 8, not 16. A bump only conflicts (OCC) with a concurrent bump
// of the SAME key and SAME shard. The hottest fair key is one stand's all-time
// total; even a crowded stand sees a few scans per second, so 8 shards make a
// conflict rare and Convex retries it anyway. Half the shards halves every
// report read (B6 reads per model × day × hour).
// =============================================================================

export const FAIR_COUNT_SHARDS = 8;
// Extra rows tolerated so a historical duplicate shard row still sums.
const SHARD_READ_CAP = FAIR_COUNT_SHARDS * 2;

/** +delta on one random shard of `key` (get-or-insert races are OCC-safe). */
export async function bumpFairCount(ctx: MutationCtx, key: string, delta = 1): Promise<void> {
  const shard = Math.floor(Math.random() * FAIR_COUNT_SHARDS);
  const row = await ctx.db
    .query("fairMetricCountShards")
    .withIndex("by_key_and_shard", (q) => q.eq("key", key).eq("shard", shard))
    .first();
  if (row) {
    await ctx.db.patch(row._id, { value: row.value + delta });
  } else {
    await ctx.db.insert("fairMetricCountShards", { key, shard, value: delta });
  }
}

export async function readFairCount(ctx: QueryCtx, key: string): Promise<number> {
  const rows = await ctx.db
    .query("fairMetricCountShards")
    .withIndex("by_key_and_shard", (q) => q.eq("key", key))
    .take(SHARD_READ_CAP);
  let total = 0;
  for (const row of rows) total += row.value;
  return total;
}

// -----------------------------------------------------------------------------
// Scan metric keys: `<metric>:<scope>:<id>[:<dateKey>|:<hourKey>]`
//   scan_total:model:<eventModelId>                — all time
//   scan_total:model:<eventModelId>:2026-10-09     — Belgrade day
//   scan_total:model:<eventModelId>:2026-10-09T14  — Belgrade hour
// Same three buckets for scope `stand` and for metric `scan_unique`. A unique
// scan is attributed to the day/hour of the visitor's FIRST scan of that model
// (MASTER §5: one device + one QR = one unique, regardless of repeats), so the
// day buckets of `scan_unique` sum to the all-time unique count.
// -----------------------------------------------------------------------------

export type FairScanMetric = "scan_total" | "scan_unique";
export type FairScanScope = "model" | "stand";

export function fairScanCountKey(
  metric: FairScanMetric,
  scope: FairScanScope,
  id: string,
  bucket?: string,
): string {
  return bucket ? `${metric}:${scope}:${id}:${bucket}` : `${metric}:${scope}:${id}`;
}

/** The six keys one scan bumps for `metric`: model and stand × all/day/hour. */
export function fairScanCountKeys(
  metric: FairScanMetric,
  ids: { eventModelId: string; standId: string },
  time: { dateKey: string; hourKey: string },
): string[] {
  const keys: string[] = [];
  for (const [scope, id] of [["model", ids.eventModelId], ["stand", ids.standId]] as const) {
    keys.push(
      fairScanCountKey(metric, scope, id),
      fairScanCountKey(metric, scope, id, time.dateKey),
      fairScanCountKey(metric, scope, id, time.hourKey),
    );
  }
  return keys;
}
