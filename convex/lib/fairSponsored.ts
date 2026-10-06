import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { FairSponsoredActionKind, FairSponsoredModelCard, FairSponsoredSnapshotTrigger } from "../../lib/fair-contract";
import { writeAdminAudit } from "./adminAudit";
import { fairModelQuestions, fairModelTierAt } from "./fairInteractions";
import { fairTimeKeys } from "./fairScans";

// =============================================================================
// Sajam automobila 2026 — B5 sponsored snapshot core (BACKEND-HANDOFF §5.7, §7,
// §11 B5; MASTER §10; JOVAN-DELTA §2). Shared by convex/fairSponsoredAdmin.ts
// (manual publish), convex/fairPublic.ts (read-only rotation projections) and
// convex/fairInteractions.ts (garage `open_model` / `garage_add`). Admin UX
// A9 adds the automatic publish (syncFairSponsoredSnapshot) used by the
// catalog mutations of convex/fairAdmin.ts, fairImport.ts and
// fairInteractionsAdmin.ts.
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

/**
 * Picture of a sponsored card (MASTER §4.5, §10): the model's own photo, else
 * the brand logo, else the neutral event placeholder — never another
 * vehicle's photo. Shared by the public projections and the admin preview.
 */
export async function fairSponsoredVisual(
  ctx: Ctx,
  model: Pick<Doc<"fairEventModels">, "photoUrl" | "photoStorageId">,
  brand: Pick<Doc<"brands">, "logoStorageId">,
): Promise<{ visual: FairSponsoredModelCard["visual"]; photoUrl?: string; brandLogoUrl?: string }> {
  const photoUrl = model.photoUrl ?? (model.photoStorageId ? await ctx.storage.getUrl(model.photoStorageId) : null) ?? undefined;
  const brandLogoUrl = !photoUrl && brand.logoStorageId ? (await ctx.storage.getUrl(brand.logoStorageId)) ?? undefined : undefined;
  return {
    visual: photoUrl ? "photo" : brandLogoUrl ? "brand_logo" : "event_placeholder",
    ...(photoUrl ? { photoUrl } : {}),
    ...(brandLogoUrl ? { brandLogoUrl } : {}),
  };
}

/** The non-draft question chosen for the map (setSponsoredResultQuestion) of one model, if any. */
export async function fairSponsoredQuestionId(ctx: Ctx, eventModelId: Id<"fairEventModels">) {
  const chosen = (await fairModelQuestions(ctx, eventModelId)).find((question) => question.showOnSponsoredRotation && question.status !== "draft");
  return chosen?._id;
}

export type FairSponsoredEligible = {
  /** Published models whose package in force at `now` is Advanced → their map question. */
  items: Map<Id<"fairEventModels">, Id<"fairAudienceQuestions"> | undefined>;
  /** More stored-Advanced models than one snapshot may hold (FAIR_SPONSORED_LIMIT). */
  tooMany: boolean;
  /** Earliest later activation of a published stored-Advanced model (not applied early), or null. */
  nextActivationAt: number | null;
};

/** What a snapshot published at `now` would contain (bounded: ≤ cap + 1 models, one question read each). */
export async function fairSponsoredEligible(ctx: Ctx, eventId: Id<"fairEvents">, now: number): Promise<FairSponsoredEligible> {
  const rows = await ctx.db
    .query("fairEventModels")
    .withIndex("by_eventId_and_packageTier", (q) => q.eq("eventId", eventId).eq("packageTier", "advanced"))
    .take(FAIR_SPONSORED_ITEMS_CAP + 1);
  const items: FairSponsoredEligible["items"] = new Map();
  let nextActivationAt: number | null = null;
  if (rows.length > FAIR_SPONSORED_ITEMS_CAP) return { items, tooMany: true, nextActivationAt };
  for (const model of rows) {
    if (model.status !== "published") continue;
    if ((await fairModelTierAt(ctx, model, now)) === "advanced") items.set(model._id, await fairSponsoredQuestionId(ctx, model._id));
    else if (model.packageActivatedAt > now) nextActivationAt = Math.min(nextActivationAt ?? Infinity, model.packageActivatedAt);
  }
  return { items, tooMany: false, nextActivationAt };
}

/**
 * Publishes a NEW immutable snapshot of `eligible.items` (stable shuffle by
 * seed + Belgrade `dayKey`) and retires the previous `published` one; its
 * items are never edited. `trigger: "auto"` has no publishedByUserId.
 */
export async function fairPublishSponsoredSnapshot(
  ctx: MutationCtx,
  input: { eventId: Id<"fairEvents">; eligible: FairSponsoredEligible; now: number; trigger: FairSponsoredSnapshotTrigger; publishedByUserId?: Id<"users"> },
) {
  const { eventId, eligible, now, trigger } = input;
  const dayKey = fairTimeKeys(now).dateKey;
  const seed = fairSponsoredSeed(eventId);
  const order = fairSponsoredOrder([...eligible.items.keys()], seed, dayKey);
  const latest = await ctx.db
    .query("fairSponsoredSnapshots")
    .withIndex("by_eventId_and_version", (q) => q.eq("eventId", eventId))
    .order("desc")
    .first();
  const version = (latest?.version ?? 0) + 1;

  const retiredSnapshotIds: Id<"fairSponsoredSnapshots">[] = [];
  for (const previous of await fairPublishedSponsoredSnapshots(ctx, eventId)) {
    await ctx.db.patch(previous._id, { status: "retired" });
    retiredSnapshotIds.push(previous._id);
  }
  const snapshotId = await ctx.db.insert("fairSponsoredSnapshots", {
    eventId,
    version,
    dayKey,
    seed,
    status: "published",
    publishedAt: now,
    trigger,
    ...(input.publishedByUserId ? { publishedByUserId: input.publishedByUserId } : {}),
  });
  for (const [index, eventModelId] of order.entries()) {
    const audienceQuestionId = eligible.items.get(eventModelId);
    await ctx.db.insert("fairSponsoredSnapshotItems", {
      snapshotId,
      eventModelId,
      order: index,
      ...(audienceQuestionId ? { audienceQuestionId } : {}),
    });
  }
  return { snapshotId, version, dayKey, seed, publishedAt: now, itemCount: order.length, retiredSnapshotIds };
}

// -----------------------------------------------------------------------------
// Admin UX A9 — automatic snapshot (ADMIN-UX §8, §12.1; decision for Aleksa's
// review: MASTER §10 says the list is renewed by a manual admin action).
// -----------------------------------------------------------------------------

export type FairSponsoredSyncResult = "published" | "unchanged" | "disabled" | "too_many_models" | "missing_event";
export const FAIR_SPONSORED_SYNC_RESULTS = ["published", "unchanged", "disabled", "too_many_models", "missing_event"] as const satisfies readonly FairSponsoredSyncResult[];

/** Unset = on; only an explicit `false` keeps the list manual. */
export function fairSponsoredAutoPublishOn(event: Pick<Doc<"fairEvents">, "sponsoredAutoPublish">): boolean {
  return event.sponsoredAutoPublish !== false;
}

/** The active snapshot holds exactly these models with exactly these map questions (order is not compared). */
function sameSponsoredSet(items: readonly Doc<"fairSponsoredSnapshotItems">[], eligible: FairSponsoredEligible["items"]): boolean {
  if (items.length !== eligible.size) return false;
  return items.every((item) => eligible.has(item.eventModelId) && eligible.get(item.eventModelId) === item.audienceQuestionId);
}

/**
 * Re-publishes the event's snapshot when — and only when — the set of
 * published Advanced models in force (or one of their map questions) differs
 * from the active snapshot. Runs inside the mutation that changed the catalog
 * (OCC serializes concurrent changes, so two triggers cannot both publish the
 * same difference) or as the scheduled job after an import / at a later
 * package activation. Never throws for a business reason: a sync problem must
 * not block a model publish. An `actorUserId` (the admin whose change caused
 * it) only goes to the audit; the snapshot itself is the system's.
 */
export async function syncFairSponsoredSnapshot(
  ctx: MutationCtx,
  eventId: Id<"fairEvents">,
  now: number,
  actorUserId?: Id<"users">,
): Promise<FairSponsoredSyncResult> {
  const event = await ctx.db.get(eventId);
  if (!event) return "missing_event";
  if (!fairSponsoredAutoPublishOn(event)) return "disabled";
  const eligible = await fairSponsoredEligible(ctx, event._id, now);
  if (eligible.tooMany) return "too_many_models";

  // A package that starts later enters by itself at that moment: one
  // scheduled re-check per distinct moment (the event remembers the last one).
  const next = eligible.nextActivationAt;
  if (next !== null && event.sponsoredAutoCheckAt !== next) {
    await ctx.scheduler.runAt(next, internal.fairSponsoredAdmin.syncSponsoredSnapshotJob, { eventId: event._id });
    await ctx.db.patch(event._id, { sponsoredAutoCheckAt: next });
  }

  const active = await fairActiveSponsoredSnapshot(ctx, event._id);
  if (!active && eligible.items.size === 0) return "unchanged";
  if (active && sameSponsoredSet(await fairSponsoredItems(ctx, active._id), eligible.items)) return "unchanged";

  const published = await fairPublishSponsoredSnapshot(ctx, { eventId: event._id, eligible, now, trigger: "auto" });
  if (actorUserId) {
    await writeAdminAudit(ctx, {
      actorUserId,
      action: "fair_sponsored_snapshot_auto_published",
      detail: { eventId: event._id, snapshotId: published.snapshotId, version: published.version, itemCount: published.itemCount },
      now,
    });
  }
  return "published";
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
