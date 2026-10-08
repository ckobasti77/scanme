import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { FAIR_ADMIN_LIST_LIMIT } from "../lib/fair-contract";
import { fairSettleFutureActivations } from "./lib/fairCatalog";
import { fairPackageTier } from "./lib/fairValidators";

// =============================================================================
// Sajam automobila 2026 — P1 (Aleksa, 8. 10. 2026): a package's rights start
// when it is assigned, not on the fair's first day. New writes already follow
// that rule (convex/lib/fairCatalog.ts upsertFairModel / upgrade). This
// INTERNAL migration settles the rows written before it: every activation of
// every fair event that still waits for a future moment moves to its
// assignment moment (fairSettleFutureActivations), so fairModelTierAt gives
// the paid rights right away.
//
// `dryRun` defaults to true (reports, writes nothing). Run on a deployment:
//   npx convex run fairPackages:migrateFutureActivations '{"dryRun":true}'
//   npx convex run fairPackages:migrateFutureActivations '{"dryRun":false}'
// Idempotent: a second run finds nothing to move.
// =============================================================================

const EVENTS_CAP = 50;

const movedModel = v.object({
  eventCode: v.string(),
  externalKey: v.string(),
  slug: v.string(),
  tier: fairPackageTier,
  from: v.number(),
  to: v.number(),
  activations: v.array(v.object({ from: v.number(), to: v.number() })),
});

export const migrateFutureActivations = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    dryRun: v.boolean(),
    now: v.number(),
    events: v.number(),
    modelsScanned: v.number(),
    capped: v.boolean(),
    moved: v.array(movedModel),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const now = Date.now();
    const events = await ctx.db.query("fairEvents").take(EVENTS_CAP + 1);
    let capped = events.length > EVENTS_CAP;
    let modelsScanned = 0;
    const moved: Infer<typeof movedModel>[] = [];
    for (const event of events.slice(0, EVENTS_CAP)) {
      const models = await ctx.db
        .query("fairEventModels")
        .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id))
        .take(FAIR_ADMIN_LIST_LIMIT + 1);
      if (models.length > FAIR_ADMIN_LIST_LIMIT) capped = true;
      let eventMoved = false;
      for (const model of models.slice(0, FAIR_ADMIN_LIST_LIMIT)) {
        modelsScanned += 1;
        const settled = await fairSettleFutureActivations(ctx, model, now, !dryRun);
        if (!settled) continue;
        eventMoved = true;
        moved.push({
          eventCode: event.code,
          externalKey: model.externalKey,
          slug: model.slug,
          tier: model.packageTier,
          from: settled.from,
          to: settled.to,
          activations: settled.activations.map(({ from, to }) => ({ from, to })),
        });
      }
      // Advanced models that are active now belong in the sponsored snapshot right away (A9 sync, own transaction).
      if (eventMoved && !dryRun) await ctx.scheduler.runAfter(0, internal.fairSponsoredAdmin.syncSponsoredSnapshotJob, { eventId: event._id });
    }
    return { dryRun, now, events: Math.min(events.length, EVENTS_CAP), modelsScanned, capped, moved };
  },
});
