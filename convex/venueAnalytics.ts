import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getEntitlement } from "./lib/entitlements";
import { venueAnalyticsEnabled } from "./lib/plans";
import { serviceMetricDateKey } from "./lib/serviceMetrics";
import { VENUE_BLOCK_TYPES } from "../lib/venue-blocks";
import { loadEventForEditor } from "./venue";

// =============================================================================
// TASK-43 — event analytics: page views, per-block engagement, reservation
// inquiries, rolled up per event per day.
//
// AGGREGATE ONLY (RFC-001 §2.10): the ingest mutations store counts and a
// per-block-type record — never an IP, user agent, guest identity, or any
// per-visitor row. The beacons are public and carry no idempotency token;
// like the card scan counters (convex/cards.ts), a determined caller can
// inflate these numbers — they are non-monetary statistics, and no security
// property depends on them.
//
// Collection always runs; the READ is what Premium gates (`analytics` in the
// venue plan limits), so an upgrade shows history from day one.
// =============================================================================

const KNOWN_BLOCK_TYPES = new Set<string>(VENUE_BLOCK_TYPES);

// Upsert the event's daily rollup row. Same transaction as the caller — the
// component pattern from convex/cards.ts dailyCardMetrics.
export async function bumpDailyEventMetrics(
  ctx: MutationCtx,
  eventId: Id<"events">,
  bump: { pageViews?: number; reservationSubmits?: number; blockTypes?: string[] },
) {
  const now = Date.now();
  const dateKey = serviceMetricDateKey(now);
  const row = await ctx.db
    .query("dailyEventMetrics")
    .withIndex("by_eventId_and_dateKey", (q) =>
      q.eq("eventId", eventId).eq("dateKey", dateKey),
    )
    .unique();
  const blockViews: Record<string, number> = { ...(row?.blockViews ?? {}) };
  for (const type of bump.blockTypes ?? []) {
    blockViews[type] = (blockViews[type] ?? 0) + 1;
  }
  if (row) {
    await ctx.db.patch(row._id, {
      pageViews: row.pageViews + (bump.pageViews ?? 0),
      reservationSubmits: row.reservationSubmits + (bump.reservationSubmits ?? 0),
      ...(bump.blockTypes?.length ? { blockViews } : {}),
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("dailyEventMetrics", {
      eventId,
      dateKey,
      pageViews: bump.pageViews ?? 0,
      reservationSubmits: bump.reservationSubmits ?? 0,
      ...(bump.blockTypes?.length ? { blockViews } : {}),
      updatedAt: now,
    });
  }
}

// Resolve (businessSlug, eventSlug) → a PUBLISHED event, or null. The beacons
// never throw: a stale page firing at a deleted event is noise, not an error.
async function publishedEventBySlugs(
  ctx: MutationCtx,
  businessSlug: string,
  eventSlug: string,
) {
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", businessSlug))
    .unique();
  if (!business) return null;
  const event = await ctx.db
    .query("events")
    .withIndex("by_businessId_and_slug", (q) =>
      q.eq("businessId", business._id).eq("slug", eventSlug),
    )
    .unique();
  if (!event) return null;
  const config = await ctx.db
    .query("venueEventConfigs")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .unique();
  if (!config || config.publishedAt === undefined) return null;
  return event;
}

// One page view. Fired once per render of a published venue/event page by the
// template beacon (components/venue/venue-analytics-client.tsx).
export const recordView = mutation({
  args: { businessSlug: v.string(), eventSlug: v.string() },
  handler: async (ctx, args) => {
    const event = await publishedEventBySlugs(
      ctx,
      args.businessSlug,
      args.eventSlug,
    );
    if (!event) return { ok: false as const };
    await bumpDailyEventMetrics(ctx, event._id, { pageViews: 1 });
    return { ok: true as const };
  },
});

// Which blocks the visitor actually reached (scrolled into view) — batched by
// the beacon into one call per page load, deduped per type client-side and
// clamped to the known type set here.
export const recordBlockViews = mutation({
  args: {
    businessSlug: v.string(),
    eventSlug: v.string(),
    blockTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const types = [...new Set(args.blockTypes)]
      .filter((type) => KNOWN_BLOCK_TYPES.has(type))
      .slice(0, VENUE_BLOCK_TYPES.length);
    if (types.length === 0) return { ok: false as const };
    const event = await publishedEventBySlugs(
      ctx,
      args.businessSlug,
      args.eventSlug,
    );
    if (!event) return { ok: false as const };
    await bumpDailyEventMetrics(ctx, event._id, { blockTypes: types });
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// The owner's read — Premium-gated server-side (the panel renders an upsell
// for "locked"; the data itself never leaves the server on Basic).
// -----------------------------------------------------------------------------

const METRICS_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
type MetricsRangeKey = keyof typeof METRICS_DAYS;

type EventMetricsResult =
  | { status: "locked"; planKey: string }
  | {
      status: "available";
      range: MetricsRangeKey;
      totals: { pageViews: number; reservationSubmits: number };
      daily: Array<{
        dateKey: string;
        pageViews: number;
        reservationSubmits: number;
      }>;
      blockViews: Array<{ blockType: string; views: number }>;
      reservations: {
        pending: number;
        confirmed: number;
        declined: number;
        expired: number;
      };
    };

// Bounded per-status count for the reservation summary; a venue event sees
// tens of requests, never thousands — the cap is a read guard, not a UX value.
const RESERVATION_COUNT_CAP = 1000;

async function countReservations(
  ctx: Parameters<typeof loadEventForEditor>[0],
  eventId: Id<"events">,
  status: "pending" | "confirmed" | "declined" | "expired" | undefined,
) {
  const rows = await ctx.db
    .query("venueReservations")
    .withIndex("by_eventId_and_status", (q) =>
      q.eq("eventId", eventId).eq("status", status),
    )
    .take(RESERVATION_COUNT_CAP);
  return rows.length;
}

export const eventMetrics = query({
  args: {
    eventId: v.id("events"),
    range: v.optional(
      v.union(v.literal("7d"), v.literal("30d"), v.literal("90d")),
    ),
  },
  handler: async (ctx, args): Promise<EventMetricsResult> => {
    const { event } = await loadEventForEditor(ctx, args.eventId);
    const entitlement = await getEntitlement(
      ctx,
      event.businessId,
      "scanme_venue",
    );
    if (!venueAnalyticsEnabled(entitlement?.limits)) {
      return { status: "locked", planKey: entitlement?.planKey ?? "basic" };
    }

    const range: MetricsRangeKey = args.range ?? "30d";
    const days = METRICS_DAYS[range];
    // Same clock-in-query precedent as clientPanel.metrics / serviceMetrics:
    // the date keys are the client's refresh concern, not a correctness one.
    const now = Date.now();
    const keys = Array.from({ length: days }, (_, index) =>
      serviceMetricDateKey(now - index * 24 * 60 * 60 * 1000),
    ).reverse();

    const daily: Array<{
      dateKey: string;
      pageViews: number;
      reservationSubmits: number;
    }> = [];
    const blockTotals: Record<string, number> = {};
    let pageViews = 0;
    let reservationSubmits = 0;
    for (const dateKey of keys) {
      const row = await ctx.db
        .query("dailyEventMetrics")
        .withIndex("by_eventId_and_dateKey", (q) =>
          q.eq("eventId", event._id).eq("dateKey", dateKey),
        )
        .unique();
      daily.push({
        dateKey,
        pageViews: row?.pageViews ?? 0,
        reservationSubmits: row?.reservationSubmits ?? 0,
      });
      pageViews += row?.pageViews ?? 0;
      reservationSubmits += row?.reservationSubmits ?? 0;
      for (const [type, views] of Object.entries(row?.blockViews ?? {})) {
        blockTotals[type] = (blockTotals[type] ?? 0) + views;
      }
    }

    // Legacy rows (status absent) predate the workflow; count them as pending
    // so the summary never under-reports open requests.
    const reservations = {
      pending:
        (await countReservations(ctx, event._id, "pending")) +
        (await countReservations(ctx, event._id, undefined)),
      confirmed: await countReservations(ctx, event._id, "confirmed"),
      declined: await countReservations(ctx, event._id, "declined"),
      expired: await countReservations(ctx, event._id, "expired"),
    };

    return {
      status: "available",
      range,
      totals: { pageViews, reservationSubmits },
      daily,
      blockViews: Object.entries(blockTotals)
        .map(([blockType, views]) => ({ blockType, views }))
        .sort((a, b) => b.views - a.views),
      reservations,
    };
  },
});
