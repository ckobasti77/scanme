import { v } from "convex/values";
import { query } from "./_generated/server";
import { fairHeatLevels, type FairHeatPeriod, type FairHeatResult } from "../lib/fair-heat";
import { requireFairGateway } from "./lib/fairGateway";
import { fairScanCountKey } from "./lib/fairCountShards";
import { fairHeatWindow, fairStandWindowCounts, fairStandsWithModels, fairWindowCounts } from "./lib/fairHeat";

// =============================================================================
// SAJAM SUPER Korak 3 — „Gde je gužva“ on the public map.
//
// The heat of every map location today and in the last hour, as LEVELS only
// (0–1 on the shared scale of lib/fair-heat.ts): the public never gets a count.
// Measure: unique scans per stand (scan_unique, one per visitor and model, B2),
// from the analytics cutoff, admin scans never counted. Locations shared by
// several stands (stand 6: Grand Motors and AUTO MIG) add up.
//
// Only the Next server calls it (FAIR_GATEWAY_SECRET), through the cached
// /api/fair/heat/[eventSlug] route: one call a minute however many visitors
// look, and no live subscription. The time comes in as `at` (a query never
// reads the clock).
// =============================================================================

const SLUG_MAX = 120;

const heatResult = v.object({
  enough: v.boolean(),
  levels: v.array(v.object({ locationId: v.string(), level: v.number() })),
  // 30 Oct 2026 (AMF map): the same scale per brand, for brands that share a
  // hall location with other exhibitors. Only published models are read.
  brandLevels: v.array(v.object({ brandId: v.string(), level: v.number() })),
});

function withBrands(result: FairHeatResult, brands: ReadonlyMap<string, number>, period: FairHeatPeriod) {
  const brandLevels = result.enough ? fairHeatLevels(brands, period).levels.map((row) => ({ brandId: row.locationId, level: row.level })) : [];
  return { ...result, brandLevels };
}

export const getMapHeat = query({
  args: { gatewaySecret: v.string(), eventSlug: v.string(), at: v.number() },
  returns: v.union(v.null(), v.object({ at: v.number(), today: heatResult, hour: heatResult })),
  handler: async (ctx, args) => {
    requireFairGateway(args.gatewaySecret);
    if (!args.eventSlug || args.eventSlug.length > SLUG_MAX) return null;
    const event = await ctx.db
      .query("fairEvents")
      .withIndex("by_slug", (q) => q.eq("slug", args.eventSlug))
      .first();
    if (!event || event.status === "draft") return null;
    const window = fairHeatWindow(event, args.at);
    const { stands, models } = await fairStandsWithModels(ctx, event._id);
    const today = new Map<string, number>();
    const hour = new Map<string, number>();
    for (const stand of stands) {
      const counts = await fairStandWindowCounts(ctx, "scan_unique", stand._id, window);
      today.set(stand.mapLocationId, (today.get(stand.mapLocationId) ?? 0) + counts.today);
      hour.set(stand.mapLocationId, (hour.get(stand.mapLocationId) ?? 0) + counts.hour);
    }
    const brandToday = new Map<string, number>();
    const brandHour = new Map<string, number>();
    for (const model of models) {
      if (model.status !== "published") continue;
      const counts = await fairWindowCounts(ctx, fairScanCountKey("scan_unique", "model", model._id), window);
      brandToday.set(model.brandId, (brandToday.get(model.brandId) ?? 0) + counts.today);
      brandHour.set(model.brandId, (brandHour.get(model.brandId) ?? 0) + counts.hour);
    }
    return { at: args.at, today: withBrands(fairHeatLevels(today, "today"), brandToday, "today"), hour: withBrands(fairHeatLevels(hour, "hour"), brandHour, "hour") };
  },
});
