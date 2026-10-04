import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, requireFairEvent } from "./lib/fairCatalog";
import { fairModelQuestions, fairModelTierAt } from "./lib/fairInteractions";
import { fairTimeKeys } from "./lib/fairScans";
import {
  FAIR_SPONSORED_ITEMS_CAP,
  fairActiveSponsoredSnapshot,
  fairPublishedSponsoredSnapshots,
  fairSponsoredItems,
  fairSponsoredOrder,
  fairSponsoredSeed,
} from "./lib/fairSponsored";
import { fairSponsoredSnapshotStatus } from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — B5 admin: manual sponsored snapshot (BACKEND-HANDOFF
// §5.7, §7 fairAdmin "publish sponsored snapshot nakon ručne izmene Advanced
// liste"; MASTER §10 "Lista Naprednih modela objavljuje se/obnavlja ručnom
// admin akcijom nakon nadogradnje paketa"). Both functions require
// requireAdmin. The result question of each model is chosen with
// fairInteractionsAdmin.setSponsoredResultQuestion (B3) and frozen into the
// snapshot item when the snapshot is published.
// =============================================================================

const HISTORY_CAP = 10;

async function sponsoredQuestionId(ctx: Parameters<typeof fairModelQuestions>[0], eventModelId: Id<"fairEventModels">) {
  const chosen = (await fairModelQuestions(ctx, eventModelId)).find((question) => question.showOnSponsoredRotation && question.status !== "draft");
  return chosen?._id;
}

/**
 * Publishes a NEW immutable snapshot of every model of the event that is
 * `published` and Advanced at this moment (an activation is never applied
 * early). Order: stable shuffle by seed + Belgrade `dayKey`. The previous
 * `published` snapshot becomes `retired`; its items are never edited. An empty
 * list is allowed: it takes the rotation down until an Advanced model exists.
 */
export const publishSponsoredSnapshot = mutation({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    snapshotId: v.id("fairSponsoredSnapshots"),
    version: v.number(),
    dayKey: v.string(),
    seed: v.string(),
    publishedAt: v.number(),
    itemCount: v.number(),
    retiredSnapshotIds: v.array(v.id("fairSponsoredSnapshots")),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const event = await requireFairEvent(ctx, args.eventId);

    const rows = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_packageTier", (q) => q.eq("eventId", event._id).eq("packageTier", "advanced"))
      .take(FAIR_SPONSORED_ITEMS_CAP + 1);
    if (rows.length > FAIR_SPONSORED_ITEMS_CAP) fairAdminError("FAIR_SPONSORED_LIMIT", { max: FAIR_SPONSORED_ITEMS_CAP });
    const eligible = new Map<Id<"fairEventModels">, Doc<"fairEventModels">>();
    for (const model of rows) {
      if (model.status === "published" && (await fairModelTierAt(ctx, model, now)) === "advanced") eligible.set(model._id, model);
    }

    const dayKey = fairTimeKeys(now).dateKey;
    const seed = fairSponsoredSeed(event._id);
    const order = fairSponsoredOrder([...eligible.keys()], seed, dayKey);
    const latest = await ctx.db
      .query("fairSponsoredSnapshots")
      .withIndex("by_eventId_and_version", (q) => q.eq("eventId", event._id))
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;

    const retiredSnapshotIds: Id<"fairSponsoredSnapshots">[] = [];
    for (const previous of await fairPublishedSponsoredSnapshots(ctx, event._id)) {
      await ctx.db.patch(previous._id, { status: "retired" });
      retiredSnapshotIds.push(previous._id);
    }
    const snapshotId = await ctx.db.insert("fairSponsoredSnapshots", {
      eventId: event._id,
      version,
      dayKey,
      seed,
      status: "published",
      publishedAt: now,
      publishedByUserId: admin._id,
    });
    for (const [index, eventModelId] of order.entries()) {
      const audienceQuestionId = await sponsoredQuestionId(ctx, eventModelId);
      await ctx.db.insert("fairSponsoredSnapshotItems", {
        snapshotId,
        eventModelId,
        order: index,
        ...(audienceQuestionId ? { audienceQuestionId } : {}),
      });
    }
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: "fair_sponsored_snapshot_published",
      detail: { eventId: event._id, snapshotId, version, itemCount: order.length },
      now,
    });
    return { snapshotId, version, dayKey, seed, publishedAt: now, itemCount: order.length, retiredSnapshotIds };
  },
});

/**
 * Admin view of the rotation: the published snapshot with its ordered items,
 * the last versions, and the current Advanced candidates (stored tier and its
 * activation moment; a query cannot read the clock, so the tab compares
 * `packageActivatedAt` with the browser time). No visitor data, no metric.
 */
export const getSponsoredRotationAdmin = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    active: v.union(
      v.null(),
      v.object({
        snapshotId: v.id("fairSponsoredSnapshots"),
        version: v.number(),
        dayKey: v.string(),
        seed: v.string(),
        publishedAt: v.optional(v.number()),
        items: v.array(v.object({ eventModelId: v.id("fairEventModels"), order: v.number(), audienceQuestionId: v.optional(v.id("fairAudienceQuestions")) })),
      }),
    ),
    history: v.array(v.object({
      snapshotId: v.id("fairSponsoredSnapshots"),
      version: v.number(),
      status: fairSponsoredSnapshotStatus,
      dayKey: v.string(),
      publishedAt: v.optional(v.number()),
    })),
    candidates: v.array(v.object({
      eventModelId: v.id("fairEventModels"),
      packageActivatedAt: v.number(),
      audienceQuestionId: v.optional(v.id("fairAudienceQuestions")),
    })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const snapshot = await fairActiveSponsoredSnapshot(ctx, args.eventId);
    const active = snapshot
      ? {
          snapshotId: snapshot._id,
          version: snapshot.version,
          dayKey: snapshot.dayKey,
          seed: snapshot.seed,
          ...(snapshot.publishedAt !== undefined ? { publishedAt: snapshot.publishedAt } : {}),
          items: (await fairSponsoredItems(ctx, snapshot._id)).map((item) => ({
            eventModelId: item.eventModelId,
            order: item.order,
            ...(item.audienceQuestionId ? { audienceQuestionId: item.audienceQuestionId } : {}),
          })),
        }
      : null;
    const history = (
      await ctx.db
        .query("fairSponsoredSnapshots")
        .withIndex("by_eventId_and_version", (q) => q.eq("eventId", args.eventId))
        .order("desc")
        .take(HISTORY_CAP)
    ).map((row) => ({
      snapshotId: row._id,
      version: row.version,
      status: row.status,
      dayKey: row.dayKey,
      ...(row.publishedAt !== undefined ? { publishedAt: row.publishedAt } : {}),
    }));
    const rows = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_packageTier", (q) => q.eq("eventId", args.eventId).eq("packageTier", "advanced"))
      .take(FAIR_SPONSORED_ITEMS_CAP);
    const candidates = [];
    for (const model of rows) {
      if (model.status !== "published") continue;
      const audienceQuestionId = await sponsoredQuestionId(ctx, model._id);
      candidates.push({ eventModelId: model._id, packageActivatedAt: model.packageActivatedAt, ...(audienceQuestionId ? { audienceQuestionId } : {}) });
    }
    return { active, history, candidates };
  },
});
