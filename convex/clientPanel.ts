import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  BusinessAccessDeniedError,
  requireBusinessAccess,
  requireGoogleReviewPanelBySlug,
} from "./lib/access";
import { getEntitlement } from "./lib/entitlements";
import { aggregateMetricRowsForRange, getMetricRows, metricsRangeConfig } from "./lib/metrics";
import { getDestinationMetricRows, getServiceMetricRows } from "./lib/serviceMetrics";
import { requireSlug } from "./lib/validation";

const BELGRADE_TIME_ZONE = "Europe/Belgrade";

export const myPanels = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const memberships = await ctx.db
      .query("businessMemberships")
      .withIndex("by_userId_and_active", (q) =>
        q.eq("userId", userId).eq("active", true),
      )
      .take(20);

    const panels = [];
    for (const membership of memberships) {
      const business = await ctx.db.get(membership.businessId);
      if (business && business.status !== "inactive") {
        panels.push({ slug: business.slug, name: business.name });
      }
    }

    return panels;
  },
});

function dateKey(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function lastDateKeys(days: number) {
  const now = Date.now();
  return Array.from({ length: days }, (_, index) => dateKey(now - index * 24 * 60 * 60 * 1000));
}

export const publicLocation = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const slug = requireSlug(args.slug);
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!business || business.status === "inactive") return null;
    return { name: business.name };
  },
});

export const overview = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    let access;
    try {
      access = await requireGoogleReviewPanelBySlug(ctx, args.slug);
    } catch (error) {
      if (error instanceof BusinessAccessDeniedError) {
        return { status: "forbidden" as const };
      }
      throw error;
    }
    const profiles = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", access.business._id),
      )
      .take(10);
    const linksRequestRows = await ctx.db
      .query("serviceActivationRequests")
      .withIndex("by_businessId_and_requestedService", (q) =>
        q
          .eq("businessId", access.business._id)
          .eq("requestedService", "scanme_links"),
      )
      .order("desc")
      .take(10);
    const reviewRequestRows = await ctx.db
      .query("serviceActivationRequests")
      .withIndex("by_businessId_and_requestedService", (q) =>
        q
          .eq("businessId", access.business._id)
          .eq("requestedService", "google_review"),
      )
      .order("desc")
      .take(10);
    const links = profiles.find((profile) => profile.type === "scanme_links");
    const review = profiles.find((profile) => profile.type === "google_review");
    return {
      status: "available" as const,
      businessId: access.business._id,
      businessName: access.business.name,
      services: {
        scanMeLinks: {
          profileId: links?._id ?? null,
          active: links?.status === "active",
          clientEditingEnabled: links?.clientEditingEnabled ?? false,
          hasOpenRequest: linksRequestRows.some((request) => request.status !== "closed"),
        },
        googleReview: {
          profileId: review?._id ?? null,
          active: review?.status === "active" || access.link.active,
          hasOpenRequest: reviewRequestRows.some((request) => request.status !== "closed"),
        },
      },
    };
  },
});

export const scanMeLinksMetrics = query({
  args: {
    slug: v.string(),
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
    destinationId: v.optional(v.id("serviceDestinations")),
  },
  handler: async (ctx, args) => {
    let access;
    try {
      access = await requireGoogleReviewPanelBySlug(ctx, args.slug);
    } catch (error) {
      if (error instanceof BusinessAccessDeniedError) {
        return { status: "forbidden" as const };
      }
      throw error;
    }
    const profile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", access.business._id).eq("type", "scanme_links"),
      )
      .unique();
    if (
      !profile ||
      (profile.status !== "active" && !profile.clientEditingEnabled)
    ) {
      return { status: "inactive" as const };
    }
    const range = args.range ?? "7d";
    let selectedDestination = null;
    if (args.destinationId) {
      selectedDestination = await ctx.db.get(args.destinationId);
      if (selectedDestination?.serviceProfileId !== profile._id) {
        return { status: "forbidden" as const };
      }
    }
    const rows = selectedDestination
      ? await getDestinationMetricRows(
          ctx,
          selectedDestination._id,
          range,
          selectedDestination.totalDirectVisits > 0 && selectedDestination.totalClicks === 0
            ? "directVisits"
            : "clicks",
        )
      : await getServiceMetricRows(ctx, profile._id, range, "scans");
    const destinations = [];
    for (const state of [
      "active",
      "inactive",
      "archived",
      "deleted",
    ] as const) {
      const destinationQuery = ctx.db
        .query("serviceDestinations")
        .withIndex("by_serviceProfileId_and_publishedState", (q) =>
          q
            .eq("serviceProfileId", profile._id)
            .eq("publishedState", state),
        );
      for await (const destination of destinationQuery) {
        destinations.push(destination);
      }
    }
    return {
      status: "available" as const,
      businessName: access.business.name,
      totalScans: profile.totalScans,
      totalPageViews: profile.totalPageViews,
      totalConvertedSessions: profile.totalConvertedSessions,
      ctr:
        profile.totalPageViews > 0
          ? profile.totalConvertedSessions / profile.totalPageViews
          : 0,
      range,
      rangeLabel: metricsRangeConfig[range].label,
      selectedDestinationId: selectedDestination?._id ?? null,
      daily: aggregateMetricRowsForRange(rows, range),
      destinations: destinations
        .filter((row) => Boolean(row.publishedState))
        .sort((a, b) => (a.publishedOrder ?? 0) - (b.publishedOrder ?? 0))
        .map((row) => ({
          id: row._id,
          label: row.publishedLabel ?? row.draftLabel,
          kind: row.kind,
          state: row.publishedState!,
          totalClicks: row.totalClicks,
          totalDirectVisits: row.totalDirectVisits,
        })),
    };
  },
});

export const metrics = query({
  args: {
    slug: v.string(),
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
    summaryRange: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("1y"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    let access;
    try {
      access = await requireGoogleReviewPanelBySlug(ctx, args.slug);
    } catch (error) {
      if (error instanceof BusinessAccessDeniedError) {
        return { status: "forbidden" as const };
      }
      throw error;
    }
    const { business, link } = access;
    const range = args.range ?? "7d";
    const summaryRange = args.summaryRange ?? range;
    const config = metricsRangeConfig[range];
    const summaryConfig = metricsRangeConfig[summaryRange];
    const metricRows = await getMetricRows(ctx, link._id, range);
    const summaryRows = summaryRange === range ? metricRows : await getMetricRows(ctx, link._id, summaryRange);
    const last7Keys = new Set(lastDateKeys(7));
    const last7Days = metricRows
      .filter((row) => last7Keys.has(row.dateKey))
      .reduce((sum, row) => sum + row.count, 0);
    const todayKey = dateKey(Date.now());
    return {
      status: "available" as const,
      businessName: business.name,
      total: link.scanCount,
      today: metricRows.find((row) => row.dateKey === todayKey)?.count ?? 0,
      last7Days,
      periodTotal: range === "all" ? link.scanCount : metricRows.reduce((sum, row) => sum + row.count, 0),
      range,
      rangeLabel: config.label,
      summaryRange,
      summaryRangeLabel: summaryConfig.label,
      summaryPeriodTotal: summaryRange === "all" ? link.scanCount : summaryRows.reduce((sum, row) => sum + row.count, 0),
      daily: aggregateMetricRowsForRange(metricRows, range),
    };
  },
});

// =============================================================================
// TASK-13 — Venue in the client panel: the owner's weekly event workflow.
//
// This is an ADDITIVE read model that sits BESIDE the queries above; none of
// them change shape (the existing Links/Google-Review panel is untouched). It
// uses the product-agnostic `requireBusinessAccess` (no dynamicLinks coupling,
// RFC-001 §2.1) so a business that owns Venue — even one without a Google Review
// row — can reach it. The result gates the whole Venue section: `none` for a
// business with no ACTIVE scanme_venue profile means the section never renders.
//
// It adds NO lifecycle logic: it reads materialized `status`, never the wall
// clock, and every mutation the UI calls lives in convex/venue.ts. The panel's
// job is legibility — surfacing which event is current, whether the published
// (public) design matches the latest draft, and what the owner should press.
// =============================================================================

type VenueEventSummary = {
  id: Id<"events">;
  slug: string;
  title: string;
  status: Doc<"events">["status"];
  startsAt: number | null;
  endsAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  hasUnpublishedChanges: boolean;
  hasPublishedDesign: boolean;
  draftRevision: number;
  publishedRevision: number;
  publishedAt: number | null;
};

type VenuePanelResult =
  | { status: "forbidden" }
  | { status: "none" }
  | {
      status: "available";
      businessSlug: string;
      businessName: string;
      venueProfileId: Id<"serviceProfiles">;
      // The event the owner is working on now: live → soonest scheduled →
      // newest draft (mirrors venue.editorBySlug's target, so "Uredi" opens the
      // same event this card describes).
      activeEvent: VenueEventSummary | null;
      // The most recent ended-but-not-archived event, surfaced as an
      // "awaiting archive" prompt (its Archive action).
      needsArchive: VenueEventSummary | null;
      // ended + archived, newest first — the "past events" list.
      pastEvents: VenueEventSummary[];
      // The most recently published design — the "duplicate previous" target
      // (duplicateEvent copies its published* into a new draft). The weekly path.
      duplicateSource: { id: Id<"events">; title: string } | null;
    };

async function venueEventSummary(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<VenueEventSummary> {
  const config = await ctx.db
    .query("venueEventConfigs")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .unique();
  return {
    id: event._id,
    slug: event.slug,
    title: event.title,
    status: event.status,
    startsAt: event.startsAt ?? null,
    endsAt: event.endsAt ?? null,
    archivedAt: event.archivedAt ?? null,
    createdAt: event.createdAt,
    hasUnpublishedChanges: config?.hasUnpublishedChanges ?? false,
    hasPublishedDesign: config?.publishedAt !== undefined,
    draftRevision: config?.draftRevision ?? 0,
    publishedRevision: config?.publishedRevision ?? 0,
    publishedAt: config?.publishedAt ?? null,
  };
}

// Recency key for ordering past events newest-first: an ended/archived event is
// ranked by when it actually ran (endsAt), falling back to archive/creation time.
function eventRecency(summary: VenueEventSummary) {
  return summary.endsAt ?? summary.archivedAt ?? summary.createdAt;
}

export const venuePanel = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<VenuePanelResult> => {
    let access;
    try {
      access = await requireBusinessAccess(ctx, args.slug);
    } catch (error) {
      if (error instanceof BusinessAccessDeniedError) {
        return { status: "forbidden" as const };
      }
      throw error;
    }
    const business = access.business;

    const profile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", business._id).eq("type", "scanme_venue"),
      )
      .unique();
    // The section appears ONLY for an active Venue profile (STEP 1). A
    // deactivated (inactive) profile reads as "none" — no trace in the panel.
    if (!profile || profile.status !== "active") {
      return { status: "none" as const };
    }

    // Gather events by status bucket (bounded per business; a venue runs a
    // handful of concurrent events, old ones archived).
    const live = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id).eq("status", "live"),
      )
      .first();
    const scheduled = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id).eq("status", "scheduled"),
      )
      .take(50);
    const drafts = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id).eq("status", "draft"),
      )
      .take(50);
    // Past events (ended + archived), newest first, via the startsAt index.
    const recent = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_startsAt", (q) =>
        q.eq("businessId", business._id),
      )
      .order("desc")
      .take(80);
    const pastDocs = recent.filter(
      (event) => event.status === "ended" || event.status === "archived",
    );

    // Build summaries for every distinct event once (one config read each).
    const byId = new Map<Id<"events">, Doc<"events">>();
    for (const event of [
      ...(live ? [live] : []),
      ...scheduled,
      ...drafts,
      ...pastDocs,
    ]) {
      byId.set(event._id, event);
    }
    const summaries = new Map<Id<"events">, VenueEventSummary>();
    for (const event of byId.values()) {
      summaries.set(event._id, await venueEventSummary(ctx, event));
    }
    const summaryOf = (event: Doc<"events">) => summaries.get(event._id)!;

    const pastEvents = pastDocs
      .map(summaryOf)
      .sort((a, b) => eventRecency(b) - eventRecency(a))
      .slice(0, 24);

    // activeEvent — the single most relevant event for the card: live → soonest
    // scheduled → newest draft → most recent ended/archived. The live→scheduled→
    // draft prefix matches venue.editorBySlug (so "Uredi" opens this same event);
    // the ended/archived fallback keeps the card populated so Archive/Duplicate
    // always have a home when nothing is active.
    let activeEvent: VenueEventSummary | null = live ? summaryOf(live) : null;
    if (!activeEvent && scheduled.length) {
      const soonest = scheduled.reduce((best, event) =>
        (event.startsAt ?? Infinity) < (best.startsAt ?? Infinity) ? event : best,
      );
      activeEvent = summaryOf(soonest);
    }
    if (!activeEvent && drafts.length) {
      const newest = drafts.reduce((best, event) =>
        event.createdAt > best.createdAt ? event : best,
      );
      activeEvent = summaryOf(newest);
    }
    if (!activeEvent && pastEvents.length) {
      activeEvent = pastEvents[0];
    }

    // needsArchive — a most-recent ended event that is NOT already the card's
    // focus (e.g. a live event is running while last week's event still awaits
    // archiving). Drives a small prompt; null when the ended event is the card.
    const mostRecentEnded =
      pastEvents.find((summary) => summary.status === "ended") ?? null;
    const needsArchive =
      mostRecentEnded && mostRecentEnded.id !== activeEvent?.id
        ? mostRecentEnded
        : null;

    // duplicateSource: the most recently published design across all gathered
    // events (a live event's published design is a valid source for next week).
    let duplicateSource: { id: Id<"events">; title: string } | null = null;
    let bestPublishedAt = -1;
    for (const summary of summaries.values()) {
      if (summary.publishedAt !== null && summary.publishedAt > bestPublishedAt) {
        bestPublishedAt = summary.publishedAt;
        duplicateSource = { id: summary.id, title: summary.title };
      }
    }

    return {
      status: "available" as const,
      businessSlug: business.slug,
      businessName: business.name,
      venueProfileId: profile._id,
      activeEvent,
      needsArchive,
      pastEvents,
      duplicateSource,
    };
  },
});

// =============================================================================
// TASK-18 STEP 4 — Memories in the client panel: where the host RUNS a space.
//
// An ADDITIVE read model beside `overview`/`venuePanel`; it gates itself with
// "none" for a business (or celebration) with no ACTIVE scanme_memories
// profile, so a Links/Review/Venue-only business sees an unchanged panel. It
// reads only materialized state — never the wall clock (the one_off window
// position it returns is the client's UX comparison; enforcement stays in
// reserveUpload). Every write the UI performs lives in convex/memoriesHost.ts
// or convex/cards.ts. Works for a celebration tenant identically: the tenant is
// a `businesses` row, so requireBusinessAccess + the same profile/space lookup
// serve it.
// =============================================================================

type MemoriesSessionSummary = {
  id: Id<"memoriesSessions">;
  dateKey: string;
  status: Doc<"memoriesSessions">["status"];
  photoCount: number;
  guestCount: number;
  openedAt: number;
};

type MemoriesPanelResult =
  | { status: "forbidden" }
  | { status: "none" }
  | {
      status: "available";
      businessSlug: string;
      businessName: string;
      tenantKind: "business" | "celebration";
      memoriesProfileId: Id<"serviceProfiles">;
      space: {
        id: Id<"memoriesSpaces">;
        code: string;
        name: string;
        mode: Doc<"memoriesSpaces">["mode"];
        status: Doc<"memoriesSpaces">["status"];
        windowStartAt: number | null;
        windowEndAt: number | null;
        publicGalleryEnabled: boolean;
        wallEnabled: boolean;
        wallRequiresApproval: boolean;
        guestVisibilityChoice: boolean;
        totalPhotos: number;
        totalGuests: number;
      } | null;
      session: MemoriesSessionSummary | null;
      pastNights: MemoriesSessionSummary[];
      // TASK-20 STEP 4 — the retention window, made concrete: the createdAt of
      // the oldest live photo, so the panel can say WHEN it will be deleted
      // (oldest + retentionDays). null when the space holds no live photos.
      oldestPhotoAt: number | null;
      entitled: boolean;
      // Plan limits in words (STEP 5), present only while the plan is active;
      // null means the plan has expired — the panel says what stopped.
      plan: {
        planKey: string;
        photosPerGuest: number;
        retentionDays: number;
        maxImageDimension: number;
      } | null;
    };

function sessionSummary(
  session: Doc<"memoriesSessions">,
): MemoriesSessionSummary {
  return {
    id: session._id,
    dateKey: session.dateKey,
    status: session.status,
    photoCount: session.photoCount,
    guestCount: session.guestCount,
    openedAt: session.openedAt,
  };
}

export const memoriesPanel = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<MemoriesPanelResult> => {
    let access;
    try {
      access = await requireBusinessAccess(ctx, args.slug);
    } catch (error) {
      if (error instanceof BusinessAccessDeniedError) {
        return { status: "forbidden" as const };
      }
      throw error;
    }
    const business = access.business;

    const profile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", business._id).eq("type", "scanme_memories"),
      )
      .unique();
    // The section appears ONLY for an active Memories profile. A deactivated
    // (inactive) profile reads as "none" — no trace in the panel.
    if (!profile || profile.status !== "active") {
      return { status: "none" as const };
    }

    const space = await ctx.db
      .query("memoriesSpaces")
      .withIndex("by_memoriesProfileId", (q) =>
        q.eq("memoriesProfileId", profile._id),
      )
      .first();

    // Sessions newest-first (dateKey sorts lexicographically = chronologically).
    const sessions = space
      ? await ctx.db
          .query("memoriesSessions")
          .withIndex("by_spaceId_and_dateKey", (q) =>
            q.eq("spaceId", space._id),
          )
          .order("desc")
          .take(24)
      : [];
    const session = sessions[0] ? sessionSummary(sessions[0]) : null;
    const pastNights = sessions.slice(1).map(sessionSummary);

    // The oldest LIVE photo (ascending by createdAt) — the next one retention
    // will remove. Skips tombstones so the panel shows a real, servable photo's
    // deadline.
    const oldestPhoto = space
      ? await ctx.db
          .query("memoriesPhotos")
          .withIndex("by_spaceId_and_createdAt", (q) =>
            q.eq("spaceId", space._id),
          )
          .filter((q) => q.neq(q.field("status"), "deleted"))
          .first()
      : null;

    const entitlement = space
      ? await getEntitlement(
          ctx,
          business._id,
          "scanme_memories",
          space._id,
        )
      : await getEntitlement(ctx, business._id, "scanme_memories");

    return {
      status: "available" as const,
      businessSlug: business.slug,
      businessName: business.name,
      tenantKind:
        business.kind === "celebration" ? "celebration" : "business",
      memoriesProfileId: profile._id,
      space: space
        ? {
            id: space._id,
            code: space.code,
            name: space.name,
            mode: space.mode,
            status: space.status,
            windowStartAt: space.windowStartAt ?? null,
            windowEndAt: space.windowEndAt ?? null,
            publicGalleryEnabled: space.publicGalleryEnabled,
            wallEnabled: space.wallEnabled,
            wallRequiresApproval: space.wallRequiresApproval === true,
            guestVisibilityChoice: space.guestVisibilityChoice,
            totalPhotos: space.totalPhotos,
            totalGuests: space.totalGuests,
          }
        : null,
      session,
      pastNights,
      oldestPhotoAt: oldestPhoto?.createdAt ?? null,
      entitled: entitlement !== null,
      plan: entitlement
        ? {
            planKey: entitlement.planKey,
            photosPerGuest: entitlement.limits.photosPerGuest,
            retentionDays: entitlement.limits.retentionDays,
            maxImageDimension: entitlement.limits.maxImageDimension,
          }
        : null,
    };
  },
});
