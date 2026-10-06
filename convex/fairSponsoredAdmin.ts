import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fairAdminError, requireFairEvent } from "./lib/fairCatalog";
import { fairAudienceOptionCounts, fairVoteThreshold } from "./lib/fairInteractions";
import {
  FAIR_SPONSORED_ITEMS_CAP,
  FAIR_SPONSORED_SYNC_RESULTS,
  fairActiveSponsoredSnapshot,
  fairPublishSponsoredSnapshot,
  fairSponsoredAutoPublishOn,
  fairSponsoredEligible,
  fairSponsoredItems,
  fairSponsoredQuestionId,
  fairSponsoredVisual,
  syncFairSponsoredSnapshot,
} from "./lib/fairSponsored";
import { fairSponsoredSnapshotStatus, fairSponsoredSnapshotTrigger } from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — B5 admin: sponsored snapshot (BACKEND-HANDOFF §5.7,
// §7 fairAdmin "publish sponsored snapshot nakon ručne izmene Advanced
// liste"; MASTER §10). Admin UX A9 (ADMIN-UX §8, §12.1): the snapshot now
// follows the published Advanced models by itself (lib/fairSponsored.ts
// syncFairSponsoredSnapshot, called by the catalog mutations); the manual
// publish stays as "Osveži", and the per-event switch turns the automatic
// publish off. Every public function requires requireAdmin. The result
// question of each model is chosen with
// fairInteractionsAdmin.setSponsoredResultQuestion (B3) and frozen into the
// snapshot item when the snapshot is published.
// =============================================================================

const HISTORY_CAP = 10;
const syncResult = v.union(...FAIR_SPONSORED_SYNC_RESULTS.map((result) => v.literal(result)));

/**
 * Publishes a NEW immutable snapshot of every model of the event that is
 * `published` and Advanced at this moment (an activation is never applied
 * early). Order: stable shuffle by seed + Belgrade `dayKey`. The previous
 * `published` snapshot becomes `retired`; its items are never edited. An empty
 * list is allowed: it takes the rotation down until an Advanced model exists.
 * Always a new version (manual "Osveži"), even when nothing changed.
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
    const eligible = await fairSponsoredEligible(ctx, event._id, now);
    if (eligible.tooMany) fairAdminError("FAIR_SPONSORED_LIMIT", { max: FAIR_SPONSORED_ITEMS_CAP });
    const result = await fairPublishSponsoredSnapshot(ctx, { eventId: event._id, eligible, now, trigger: "admin", publishedByUserId: admin._id });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      action: "fair_sponsored_snapshot_published",
      detail: { eventId: event._id, snapshotId: result.snapshotId, version: result.version, itemCount: result.itemCount },
      now,
    });
    return result;
  },
});

/**
 * A9: turns the automatic publish of one event on or off (unset = on). Turning
 * it on brings the list up to date right away. Idempotent; audited.
 */
export const setSponsoredAutoPublish = mutation({
  args: { eventId: v.id("fairEvents"), enabled: v.boolean() },
  returns: v.object({ enabled: v.boolean(), changed: v.boolean(), sync: v.union(v.null(), syncResult) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const event = await requireFairEvent(ctx, args.eventId);
    const changed = fairSponsoredAutoPublishOn(event) !== args.enabled;
    if (changed) {
      await ctx.db.patch(event._id, { sponsoredAutoPublish: args.enabled, updatedAt: now });
      await writeAdminAudit(ctx, {
        actorUserId: admin._id,
        action: args.enabled ? "fair_sponsored_auto_enabled" : "fair_sponsored_auto_disabled",
        detail: { eventId: event._id },
        now,
      });
    }
    const sync = args.enabled ? await syncFairSponsoredSnapshot(ctx, event._id, now, admin._id) : null;
    return { enabled: args.enabled, changed, sync };
  },
});

/** A9: the scheduled automatic publish (after an import, or when a later package activation starts). */
export const syncSponsoredSnapshotJob = internalMutation({
  args: { eventId: v.id("fairEvents") },
  returns: syncResult,
  handler: async (ctx, args) => syncFairSponsoredSnapshot(ctx, args.eventId, Date.now()),
});

/**
 * Admin view of the rotation: the published snapshot with its ordered items
 * (and the picture each card shows: photo, brand logo or the event
 * placeholder), who published it (`auto` / `admin`), whether the automatic
 * publish is on, the last versions, and the current Advanced candidates
 * (stored tier and its activation moment; a query cannot read the clock, so
 * the tab compares `packageActivatedAt` with the browser time). No visitor
 * data, no metric.
 */
export const getSponsoredRotationAdmin = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    autoPublish: v.boolean(),
    active: v.union(
      v.null(),
      v.object({
        snapshotId: v.id("fairSponsoredSnapshots"),
        version: v.number(),
        dayKey: v.string(),
        seed: v.string(),
        publishedAt: v.optional(v.number()),
        trigger: fairSponsoredSnapshotTrigger,
        items: v.array(v.object({
          eventModelId: v.id("fairEventModels"),
          order: v.number(),
          audienceQuestionId: v.optional(v.id("fairAudienceQuestions")),
          visual: v.union(v.literal("photo"), v.literal("brand_logo"), v.literal("event_placeholder")),
          photoUrl: v.optional(v.string()),
          brandLogoUrl: v.optional(v.string()),
        })),
      }),
    ),
    history: v.array(v.object({
      snapshotId: v.id("fairSponsoredSnapshots"),
      version: v.number(),
      status: fairSponsoredSnapshotStatus,
      dayKey: v.string(),
      publishedAt: v.optional(v.number()),
      trigger: fairSponsoredSnapshotTrigger,
    })),
    candidates: v.array(v.object({
      eventModelId: v.id("fairEventModels"),
      packageActivatedAt: v.number(),
      audienceQuestionId: v.optional(v.id("fairAudienceQuestions")),
    })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const snapshot = await fairActiveSponsoredSnapshot(ctx, event._id);
    let active = null;
    if (snapshot) {
      const items = [];
      for (const item of await fairSponsoredItems(ctx, snapshot._id)) {
        const model = await ctx.db.get(item.eventModelId);
        const brand = model ? await ctx.db.get(model.brandId) : null;
        items.push({
          eventModelId: item.eventModelId,
          order: item.order,
          ...(item.audienceQuestionId ? { audienceQuestionId: item.audienceQuestionId } : {}),
          ...(model && brand ? await fairSponsoredVisual(ctx, model, brand) : { visual: "event_placeholder" as const }),
        });
      }
      active = {
        snapshotId: snapshot._id,
        version: snapshot.version,
        dayKey: snapshot.dayKey,
        seed: snapshot.seed,
        ...(snapshot.publishedAt !== undefined ? { publishedAt: snapshot.publishedAt } : {}),
        trigger: snapshot.trigger ?? "admin",
        items,
      };
    }
    const history = (
      await ctx.db
        .query("fairSponsoredSnapshots")
        .withIndex("by_eventId_and_version", (q) => q.eq("eventId", event._id))
        .order("desc")
        .take(HISTORY_CAP)
    ).map((row) => ({
      snapshotId: row._id,
      version: row.version,
      status: row.status,
      dayKey: row.dayKey,
      ...(row.publishedAt !== undefined ? { publishedAt: row.publishedAt } : {}),
      trigger: row.trigger ?? "admin",
    }));
    const rows = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_packageTier", (q) => q.eq("eventId", event._id).eq("packageTier", "advanced"))
      .take(FAIR_SPONSORED_ITEMS_CAP);
    const candidates = [];
    for (const model of rows) {
      if (model.status !== "published") continue;
      const audienceQuestionId = await fairSponsoredQuestionId(ctx, model._id);
      candidates.push({ eventModelId: model._id, packageActivatedAt: model.packageActivatedAt, ...(audienceQuestionId ? { audienceQuestionId } : {}) });
    }
    return { autoPublish: fairSponsoredAutoPublishOn(event), active, history, candidates };
  },
});

/**
 * A9: the vote total of each Advanced candidate's chosen map question, for
 * the "fewer than 5 votes" note. Vote counters change with every vote, so the
 * tab reads this once and refreshes it on a timer (usePolledQuery, A0 nalaz
 * 0.5) instead of subscribing. Totals only — no option split, no visitor.
 */
export const getSponsoredQuestionVotes = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    threshold: v.number(),
    questions: v.array(v.object({ eventModelId: v.id("fairEventModels"), questionId: v.id("fairAudienceQuestions"), votes: v.number() })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const rows = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_packageTier", (q) => q.eq("eventId", event._id).eq("packageTier", "advanced"))
      .take(FAIR_SPONSORED_ITEMS_CAP);
    const questions: { eventModelId: Id<"fairEventModels">; questionId: Id<"fairAudienceQuestions">; votes: number }[] = [];
    for (const model of rows) {
      if (model.status !== "published") continue;
      const questionId = await fairSponsoredQuestionId(ctx, model._id);
      const question = questionId ? await ctx.db.get(questionId) : null;
      if (!question) continue;
      const { counts } = await fairAudienceOptionCounts(ctx, question);
      questions.push({ eventModelId: model._id, questionId: question._id, votes: counts.reduce((sum, count) => sum + count, 0) });
    }
    return { threshold: fairVoteThreshold(event), questions };
  },
});
