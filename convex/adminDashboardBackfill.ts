import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import {
  markDashboardProjectionState,
  syncDashboardAction,
  syncDashboardProduct,
  syncDashboardSubscription,
} from "./lib/adminDashboardProjection";

const sourceKind = v.union(
  v.literal("action"),
  v.literal("subscription"),
  v.literal("product"),
);

export const runPage = internalMutation({
  args: {
    sourceKind,
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
    dryRun: v.boolean(),
    now: v.number(),
  },
  returns: v.object({
    sourceKind,
    cursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
    scanned: v.number(),
    projected: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
      throw new ConvexError("admin_dashboard_backfill_limit");
    }
    if (!Number.isSafeInteger(args.now) || args.now < 0) {
      throw new ConvexError("admin_dashboard_backfill_time");
    }
    const options = { cursor: args.cursor, numItems: args.limit };
    let cursor: string;
    let isDone: boolean;
    let scanned = 0;

    if (args.sourceKind === "action") {
      const page = await ctx.db.query("actionItems").paginate(options);
      cursor = page.continueCursor;
      isDone = page.isDone;
      scanned = page.page.length;
      if (!args.dryRun) {
        for (const row of page.page) await syncDashboardAction(ctx, row, args.now);
      }
    } else if (args.sourceKind === "subscription") {
      const page = await ctx.db.query("subscriptions").paginate(options);
      cursor = page.continueCursor;
      isDone = page.isDone;
      scanned = page.page.length;
      if (!args.dryRun) {
        for (const row of page.page) {
          await syncDashboardSubscription(ctx, row, row.facts, args.now);
        }
      }
    } else {
      const page = await ctx.db.query("productInventory").paginate(options);
      cursor = page.continueCursor;
      isDone = page.isDone;
      scanned = page.page.length;
      if (!args.dryRun) {
        for (const row of page.page) await syncDashboardProduct(ctx, row, args.now);
      }
    }

    if (!args.dryRun) {
      await markDashboardProjectionState(
        ctx,
        args.sourceKind,
        isDone ? "complete" : "pending",
        args.now,
      );
    }
    return {
      sourceKind: args.sourceKind,
      cursor: isDone ? null : cursor,
      isDone,
      scanned,
      projected: args.dryRun ? 0 : scanned,
      dryRun: args.dryRun,
    };
  },
});
