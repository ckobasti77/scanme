import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { fairScanCountKey, readFairCount } from "./lib/fairCountShards";

// Sajam automobila 2026 — B2 internal scan-count projection. Internal only
// (`npx convex run fairScans:modelScanCounts` on DEV, B6 reports later):
// anonymous counts per model/stand, never a visitor id or hash.

const RAW_ROWS_CAP = 1000;

const counts = v.object({ total: v.number(), unique: v.number() });

export const modelScanCounts = internalQuery({
  args: {
    eventModelId: v.id("fairEventModels"),
    dateKey: v.optional(v.string()),
    hourKey: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      model: counts,
      stand: counts,
      day: v.optional(counts),
      hour: v.optional(counts),
      // Cross-check from the raw rows (bounded by RAW_ROWS_CAP).
      raw: v.object({ scanEvents: v.number(), adminExcluded: v.number(), uniqueVisitors: v.number(), capped: v.boolean() }),
    }),
  ),
  handler: async (ctx, args) => {
    const model = await ctx.db.get(args.eventModelId);
    if (!model) return null;
    const read = async (scope: "model" | "stand", id: string, bucket?: string) => ({
      total: await readFairCount(ctx, fairScanCountKey("scan_total", scope, id, bucket)),
      unique: await readFairCount(ctx, fairScanCountKey("scan_unique", scope, id, bucket)),
    });
    const events = await ctx.db
      .query("fairScanEvents")
      .withIndex("by_eventModelId_and_occurredAt", (q) => q.eq("eventModelId", model._id))
      .take(RAW_ROWS_CAP);
    const uniques = await ctx.db
      .query("fairUniqueScans")
      .withIndex("by_eventModelId_and_firstScannedAt", (q) => q.eq("eventModelId", model._id))
      .take(RAW_ROWS_CAP);
    return {
      model: await read("model", model._id),
      stand: await read("stand", model.standId),
      ...(args.dateKey ? { day: await read("model", model._id, args.dateKey) } : {}),
      ...(args.hourKey ? { hour: await read("model", model._id, args.hourKey) } : {}),
      raw: {
        scanEvents: events.length,
        adminExcluded: events.filter((row) => row.isAdminExcluded).length,
        uniqueVisitors: uniques.length,
        capped: events.length === RAW_ROWS_CAP || uniques.length === RAW_ROWS_CAP,
      },
    };
  },
});
