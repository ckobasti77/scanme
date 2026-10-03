import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// =============================================================================
// TASK-24 — sharded counters for the two rollups every photo commit used to
// write into a single row: `session.photoCount` and `space.totalPhotos`.
//
// The load run (docs/perf/memories-load.md) proved the problem: with those two
// patches inside `commitProcessed`, EVERY protocol mutation of the night is in
// the OCC conflict domain of every commit (reserve/claim/commit read the very
// rows commits write). Measured on `dev:expert-pelican-136`: mutation p50
// inflated ~linearly with in-flight commits (~2 s @ 24, ~4 s @ 48, ~9 s @ 96)
// and total commit throughput plateaued at ~3.4/s regardless of offered load.
//
// The fix is the pattern from Convex's sharded-counter component, hand-rolled
// because the need is two counters and one increment site: SHARDS rows per
// counter key, each bump picks a random shard (two concurrent commits collide
// only when they draw the same shard), each read sums the shards. The doc
// fields (`session.photoCount`, `space.totalPhotos`) are no longer written by
// commits and act as the BASE the shard sum is added to — existing rows keep
// their historical value with no migration, new rows start at 0.
//
// `guest.photoCount` deliberately stays a direct patch: it is per-guest, and a
// real guest's commits are sequential by construction (the client queue).
//
// Deletion/moderation semantics are unchanged: nothing ever decremented these
// rollups — they count the night's commits, not the currently-live photos.
// =============================================================================

export const COUNT_SHARDS = 16;
// Reads take a few extra rows so a historical anomaly (duplicate shard row)
// would still sum correctly instead of undercounting.
const SHARD_READ_CAP = COUNT_SHARDS * 2;

export function sessionCountKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export function spaceCountKey(spaceId: string): string {
  return `space:${spaceId}`;
}

// +delta on one random shard. Get-or-insert races are safe: two concurrent
// first-bumps of one shard both read the empty index range, so OCC retries the
// loser, which then finds the winner's row and patches it.
export async function bumpShardedCount(
  ctx: MutationCtx,
  key: string,
  delta = 1,
): Promise<void> {
  const shard = Math.floor(Math.random() * COUNT_SHARDS);
  const row = await ctx.db
    .query("memoriesCountShards")
    .withIndex("by_key_and_shard", (q) => q.eq("key", key).eq("shard", shard))
    .first();
  if (row) {
    await ctx.db.patch(row._id, { value: row.value + delta });
  } else {
    await ctx.db.insert("memoriesCountShards", { key, shard, value: delta });
  }
}

export async function readShardedCount(
  ctx: QueryCtx,
  key: string,
): Promise<number> {
  const rows = await ctx.db
    .query("memoriesCountShards")
    .withIndex("by_key_and_shard", (q) => q.eq("key", key))
    .take(SHARD_READ_CAP);
  let total = 0;
  for (const row of rows) total += row.value;
  return total;
}

// The two reader-facing sums: base field (historical value) + live shards.
export async function sessionPhotoCount(
  ctx: QueryCtx,
  session: Doc<"memoriesSessions">,
): Promise<number> {
  return (
    session.photoCount + (await readShardedCount(ctx, sessionCountKey(session._id)))
  );
}

export async function spaceTotalPhotos(
  ctx: QueryCtx,
  space: Doc<"memoriesSpaces">,
): Promise<number> {
  return (
    space.totalPhotos + (await readShardedCount(ctx, spaceCountKey(space._id)))
  );
}
