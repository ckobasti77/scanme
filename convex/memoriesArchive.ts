import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireBusinessAccess } from "./lib/access";
import { fmt, getDict } from "../lib/i18n";
import { ARCHIVE_MAX_ITEMS } from "../lib/venue-blocks";

// =============================================================================
// TASK-23 — the host pulls the night out. This is where a Memories photo the
// guests took becomes a permanent pick on the venue's PUBLIC page: the host
// selects photos in the night gallery and they land in `eventArchiveItems` with
// `sourcePhotoId` set — the field that has waited since schema C for exactly
// this, tracing each archived pick back to the night it came from.
//
// The plumbing already existed (venue.archiveEvent writes the same table, the
// pastEvents block renders it); this file adds the HOST-CURATED path and its
// gates. The load-bearing rule lives in one gate below and is asserted in a
// test named for the failure: a `host_only` photo — a guest who tapped "samo ja
// i vlasnik" — must NEVER reach the venue's front page. It is refused here with
// the same non-disclosing `photoNotFound` the wall uses.
//
// Kept OUT of convex/memories.ts on purpose (that file is not to grow further).
// =============================================================================

const dict = getDict("memories");

// Load an event and gate the caller for its tenant — the funnel every archive
// mutation and the archive read share. Same gate as memories.hostDeletePhoto:
// an active member of the event's business, or an admin.
async function loadEventForArchive(
  ctx: MutationCtx | QueryCtx,
  eventId: Id<"events">,
): Promise<Doc<"events">> {
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError(dict.archiveEventNotFound);
  await requireBusinessAccess(ctx, event.businessId);
  return event;
}

// The event's current archive rows, ascending by `order` (order 0 is the cover,
// Step 3). Bounded by the cap + 1 so an over-cap event is still detectable.
async function currentItems(
  ctx: MutationCtx | QueryCtx,
  eventId: Id<"events">,
): Promise<Doc<"eventArchiveItems">[]> {
  return await ctx.db
    .query("eventArchiveItems")
    .withIndex("by_eventId_and_order", (q) => q.eq("eventId", eventId))
    .take(ARCHIVE_MAX_ITEMS + 1);
}

// pinPhotosToEvent — the host curates photos of a night onto an event's public
// archive. Every gate below is deliberate and each is a test (see
// convex/memoriesArchive.test.ts):
//
//  1. requireBusinessAccess(event.businessId) — via loadEventForArchive.
//  2. Cross-tenant is a HARD error, not a silent filter: a photo whose space
//     belongs to another business is refused with archiveCrossTenant.
//  3. `visibility === "everyone"` && `status === "ready"`, or refuse with the
//     non-disclosing photoNotFound — the venue page is public, indexed, and
//     permanent, so a host_only photo reaching it is the worst failure.
//  4. A committed asset (mediaAssetId) — reserved/processing rows have no bytes.
//  5. Idempotent per (eventId, mediaAssetId): re-pinning is a silent success,
//     no second row, no renumber.
//  6. Capped at ARCHIVE_MAX_ITEMS per event — over the cap is a ConvexError,
//     never a silent truncation.
export const pinPhotosToEvent = mutation({
  args: {
    eventId: v.id("events"),
    photoIds: v.array(v.id("memoriesPhotos")),
  },
  handler: async (ctx, args) => {
    const event = await loadEventForArchive(ctx, args.eventId);

    const existing = await currentItems(ctx, args.eventId);
    const pinnedAssets = new Set<Id<"mediaAssets">>(
      existing.map((row) => row.mediaAssetId),
    );
    let maxOrder = existing.reduce((max, row) => Math.max(max, row.order), -1);
    let count = existing.length;
    const now = Date.now();
    let pinned = 0;

    for (const photoId of args.photoIds) {
      const photo = await ctx.db.get(photoId);
      if (!photo) throw new ConvexError(dict.photoNotFound);
      const space = await ctx.db.get(photo.spaceId);
      if (!space) throw new ConvexError(dict.photoNotFound);
      // (2) A pin that crosses tenants is a hard error.
      if (space.businessId !== event.businessId) {
        throw new ConvexError(dict.archiveCrossTenant);
      }
      // (3) The consent boundary. host_only never reaches the public page.
      if (photo.visibility !== "everyone" || photo.status !== "ready") {
        throw new ConvexError(dict.photoNotFound);
      }
      // (4) No committed bytes → nothing to pin.
      if (!photo.mediaAssetId) throw new ConvexError(dict.photoNotFound);
      const mediaAssetId = photo.mediaAssetId;
      // (5) Idempotent per asset.
      if (pinnedAssets.has(mediaAssetId)) continue;
      // (6) Cap.
      if (count >= ARCHIVE_MAX_ITEMS) {
        throw new ConvexError(
          fmt(dict.archiveOverCap, { max: ARCHIVE_MAX_ITEMS }),
        );
      }
      maxOrder += 1;
      await ctx.db.insert("eventArchiveItems", {
        eventId: event._id,
        mediaAssetId,
        sourcePhotoId: photo._id,
        order: maxOrder,
        createdAt: now,
      });
      pinnedAssets.add(mediaAssetId);
      count += 1;
      pinned += 1;
    }

    return { pinned, total: count };
  },
});

// unpinPhotoFromEvent — removes the archive row for a pinned photo; does NOT
// touch the photo itself (the guest's night is untouched; only the venue pick
// is withdrawn). Idempotent: unpinning what is not pinned is a silent success.
export const unpinPhotoFromEvent = mutation({
  args: {
    eventId: v.id("events"),
    photoId: v.id("memoriesPhotos"),
  },
  handler: async (ctx, args) => {
    await loadEventForArchive(ctx, args.eventId);
    const items = await currentItems(ctx, args.eventId);
    const row = items.find((item) => item.sourcePhotoId === args.photoId);
    if (!row) return { removed: false };
    await ctx.db.delete(row._id);
    return { removed: true };
  },
});

// reorderArchiveItems — the full ordered list, rewriting `order` to the new
// positions. order 0 is the cover (Step 3), so this is also how the host picks
// which photo fronts the event. Rejects a list that is not a permutation of the
// event's CURRENT item ids rather than partially applying it — a stale client
// list must fail loudly, not silently reshuffle a subset.
export const reorderArchiveItems = mutation({
  args: {
    eventId: v.id("events"),
    itemIds: v.array(v.id("eventArchiveItems")),
  },
  handler: async (ctx, args) => {
    await loadEventForArchive(ctx, args.eventId);
    const items = await currentItems(ctx, args.eventId);

    // Permutation check: same length, same set, no duplicates.
    const currentIds = new Set(items.map((item) => item._id));
    if (args.itemIds.length !== items.length) {
      throw new ConvexError(dict.archiveReorderMismatch);
    }
    const seen = new Set<Id<"eventArchiveItems">>();
    for (const id of args.itemIds) {
      if (!currentIds.has(id) || seen.has(id)) {
        throw new ConvexError(dict.archiveReorderMismatch);
      }
      seen.add(id);
    }

    for (let index = 0; index < args.itemIds.length; index += 1) {
      await ctx.db.patch(args.itemIds[index], { order: index });
    }
    return { reordered: args.itemIds.length };
  },
});

// -----------------------------------------------------------------------------
// Read models for the picker (components/client-panel/memories-host-gallery).
// -----------------------------------------------------------------------------

// eventArchive — one event's ordered pins, resolved to thumbnails. Feeds the
// picker's "already pinned" cross-reference (by sourcePhotoId), the ordered
// cover/reorder view (order 0 = "naslovna"), the running count vs the cap, and
// the "where they went" link (the event's public venue page).
export const eventArchive = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await loadEventForArchive(ctx, args.eventId);
    const business = await ctx.db.get(event.businessId);
    const rows = await currentItems(ctx, args.eventId);
    const items: Array<{
      itemId: Id<"eventArchiveItems">;
      sourcePhotoId: Id<"memoriesPhotos"> | null;
      mediaAssetId: Id<"mediaAssets">;
      order: number;
      thumbUrl: string | null;
    }> = [];
    for (const row of rows) {
      const asset = await ctx.db.get(row.mediaAssetId);
      const thumbUrl =
        asset && asset.status === "ready"
          ? await ctx.storage.getUrl(asset.variants.thumb.ref as Id<"_storage">)
          : null;
      items.push({
        itemId: row._id,
        sourcePhotoId: row.sourcePhotoId ?? null,
        mediaAssetId: row.mediaAssetId,
        order: row.order,
        thumbUrl,
      });
    }
    return {
      eventId: event._id,
      eventSlug: event.slug,
      eventTitle: event.title,
      businessSlug: business?.slug ?? "",
      cap: ARCHIVE_MAX_ITEMS,
      count: items.length,
      items,
    };
  },
});

type ArchiveEventTarget = {
  id: Id<"events">;
  title: string;
  slug: string;
  status: Doc<"events">["status"];
  startsAt: number | null;
  endsAt: number | null;
};

// The picker lists this many events, newest first. A weekly venue reaches it
// after ~2 years; the pin target is almost always the latest night, so the
// tail is genuinely irrelevant — but the cut must be VISIBLE, not silent
// (the GALLERY_READ_CAP lesson): the query reads cap + 1 and reports
// `truncated` so the picker can say the list is incomplete.
export const ARCHIVE_TARGETS_CAP = 100;

// archiveTargets — which event(s) a night's photos can be pinned to, resolved
// from the session's space (Step 2 "Which event"):
//  - one_off  → the space's linked event (space.eventId); no choice to make,
//    unless the space has none (then the picker falls back to the list).
//  - recurring → the business's events, newest first, defaulting to the one
//    whose window contains the session (else the newest). Any lifecycle state
//    may receive pins — the host curates an event that ended weeks ago.
export const archiveTargets = query({
  args: { sessionId: v.id("memoriesSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const space = await ctx.db.get(session.spaceId);
    if (!space) return null;
    const access = await requireBusinessAccess(ctx, space.businessId);
    const business = access.business;

    const window = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_startsAt", (q) =>
        q.eq("businessId", business._id),
      )
      .order("desc")
      .take(ARCHIVE_TARGETS_CAP + 1);
    const truncated = window.length > ARCHIVE_TARGETS_CAP;
    const events = window.slice(0, ARCHIVE_TARGETS_CAP);

    const targets: ArchiveEventTarget[] = events.map((event) => ({
      id: event._id,
      title: event.title,
      slug: event.slug,
      status: event.status,
      startsAt: event.startsAt ?? null,
      endsAt: event.endsAt ?? null,
    }));

    let defaultEventId: Id<"events"> | null =
      space.mode === "one_off" ? (space.eventId ?? null) : null;
    if (!defaultEventId) {
      const containing = events.find(
        (event) =>
          event.startsAt !== undefined &&
          event.endsAt !== undefined &&
          event.startsAt <= session.openedAt &&
          session.openedAt <= event.endsAt,
      );
      defaultEventId = containing?._id ?? events[0]?._id ?? null;
    }

    return {
      businessSlug: business.slug,
      mode: space.mode,
      defaultEventId,
      events: targets,
      truncated,
    };
  },
});
