import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { FairSponsoredActionKind } from "../../lib/fair-contract";

// =============================================================================
// Sajam automobila 2026 — B5 sponsored snapshot core (BACKEND-HANDOFF §5.7, §7,
// §11 B5; MASTER §10; JOVAN-DELTA §2). Shared by convex/fairSponsoredAdmin.ts
// (manual publish), convex/fairPublic.ts (read-only rotation projections) and
// convex/fairInteractions.ts (garage `open_model` / `garage_add`).
//
// A snapshot is an immutable, ordered list of every published Advanced model
// of one event. Publishing never edits an item: it inserts a NEW snapshot with
// the next version and retires the previous one, so at most one snapshot per
// event is `published`. The order is a stable shuffle by `seed` + `dayKey`
// (no Math.random, no personalization); the client picks the active item with
// lib/fair-client/rotation-slot.ts from `epochMs` = `publishedAt`, so every
// map and display shows the same model at the same moment.
//
// Nothing here records an impression: reads never write, and only the garage
// strip's two explicit actions become fairSponsoredEvents rows.
// =============================================================================

type Ctx = QueryCtx | MutationCtx;

/** Technical cap of one snapshot (not a business rule); publish refuses more. */
export const FAIR_SPONSORED_ITEMS_CAP = 200;
const PUBLISHED_PER_EVENT_CAP = 10;

/** Event-scoped seed stored on the snapshot (auditable; the order is reproducible from it). */
export function fairSponsoredSeed(eventId: Id<"fairEvents">): string {
  return `fair-sponsored-v1:${eventId}`;
}

/** 32-bit FNV-1a: tiny, deterministic and identical on every runtime. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Stable shuffle for one day: each model gets the key hash(seed|dayKey|id), so
 * the same day and seed always give the same order, and adding a model on the
 * same day inserts it without reordering the others. Ties break on the id.
 */
export function fairSponsoredOrder<T extends string>(ids: readonly T[], seed: string, dayKey: string): T[] {
  return [...new Set(ids)]
    .map((id) => ({ id, key: fnv1a(`${seed}|${dayKey}|${id}`) }))
    .sort((a, b) => a.key - b.key || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((row) => row.id);
}

/** The event's one `published` snapshot (or null). */
export async function fairActiveSponsoredSnapshot(ctx: Ctx, eventId: Id<"fairEvents">) {
  return ctx.db
    .query("fairSponsoredSnapshots")
    .withIndex("by_eventId_and_status", (q) => q.eq("eventId", eventId).eq("status", "published"))
    .first();
}

/** Every `published` snapshot of the event (normally 0 or 1), bounded; publish retires them. */
export async function fairPublishedSponsoredSnapshots(ctx: Ctx, eventId: Id<"fairEvents">) {
  return ctx.db
    .query("fairSponsoredSnapshots")
    .withIndex("by_eventId_and_status", (q) => q.eq("eventId", eventId).eq("status", "published"))
    .take(PUBLISHED_PER_EVENT_CAP);
}

/** Items of one snapshot in `order`, bounded. */
export async function fairSponsoredItems(ctx: Ctx, snapshotId: Id<"fairSponsoredSnapshots">): Promise<Doc<"fairSponsoredSnapshotItems">[]> {
  return ctx.db
    .query("fairSponsoredSnapshotItems")
    .withIndex("by_snapshotId_and_order", (q) => q.eq("snapshotId", snapshotId))
    .take(FAIR_SPONSORED_ITEMS_CAP);
}

// -----------------------------------------------------------------------------
// Garage sponsored conversions (fairMetricCountShards, anonymous; they survive
// the 16 Nov purge of fairSponsoredEvents.visitorId):
//   sponsored_<kind>:model:<eventModelId>                — all time
//   sponsored_<kind>:model:<eventModelId>:2026-10-09     — Belgrade day
//   sponsored_<kind>:model:<eventModelId>:2026-10-09T14  — Belgrade hour
// kind ∈ open_model | garage_add. There is no impression key anywhere.
// -----------------------------------------------------------------------------

export function fairSponsoredCountKeys(
  kind: FairSponsoredActionKind,
  eventModelId: string,
  time: { dateKey: string; hourKey: string },
): string[] {
  const base = `sponsored_${kind}:model:${eventModelId}`;
  return [base, `${base}:${time.dateKey}`, `${base}:${time.hourKey}`];
}
