import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { fairIsPreEvent } from "../lib/fair-contract";
import { fairScanCountKey, readFairCount } from "./lib/fairCountShards";

// Sajam automobila 2026 — B2 internal scan-count projection. Internal only
// (`npx convex run fairScans:modelScanCounts` on DEV, B6 reports later):
// anonymous counts per model/stand, never a visitor id or hash.
// P1: the raw cross-check leaves pre-event rows out (they are in no counter)
// and reports how many there are apart.

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
      raw: v.object({
        scanEvents: v.number(),
        adminExcluded: v.number(),
        uniqueVisitors: v.number(),
        capped: v.boolean(),
        // P1: pre-event scan rows of the model (only when there are any).
        preEventScanEvents: v.optional(v.number()),
      }),
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
    const startsAt = (await ctx.db.get(model.eventId))?.startsAt ?? 0;
    const fairEvents = events.filter((row) => row.preEvent !== true && !fairIsPreEvent(row.occurredAt, { startsAt }));
    const fairUniques = uniques.filter((row) => row.preEvent !== true && !fairIsPreEvent(row.lastScannedAt, { startsAt }));
    const preEventScanEvents = events.length - fairEvents.length;
    return {
      model: await read("model", model._id),
      stand: await read("stand", model.standId),
      ...(args.dateKey ? { day: await read("model", model._id, args.dateKey) } : {}),
      ...(args.hourKey ? { hour: await read("model", model._id, args.hourKey) } : {}),
      raw: {
        scanEvents: fairEvents.length,
        adminExcluded: fairEvents.filter((row) => row.isAdminExcluded).length,
        uniqueVisitors: fairUniques.length,
        capped: events.length === RAW_ROWS_CAP || uniques.length === RAW_ROWS_CAP,
        ...(preEventScanEvents > 0 ? { preEventScanEvents } : {}),
      },
    };
  },
});
