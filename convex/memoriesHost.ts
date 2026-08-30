import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { requireBusinessAccess } from "./lib/access";
import { getDict } from "../lib/i18n";

// =============================================================================
// TASK-18 STEP 4 — the host's space controls, called from the Memories section
// of /[slug]/client-panel. All requireBusinessAccess-gated (admin OR an active
// membership of the space's tenant). These are the WRITE half of the host
// panel; the read model is clientPanel.memoriesPanel.
//
// Invariant (carried from convex/memories.ts): no mutation here reads the wall
// clock to DECIDE state that a query then re-derives — it writes materialized
// `status`/`windowEndAt`, and reserveUpload enforces against that. Closing a
// window is a real state write (status → "closed"), not a computed condition.
// =============================================================================

const dict = getDict("memories");

// The host visibility switches (RFC-001 §2.4 C.4; wall approval added in
// TASK-22 §STEP 4). Any subset may be set in one call; an omitted flag is left
// unchanged. `wallRequiresApproval` is the "nervous host" gate: with it on, a
// photo waits for the host's per-photo approval (memoriesWall.setPhotoWallApproval)
// before the wall query surfaces it.
export const setSpaceVisibility = mutation({
  args: {
    spaceId: v.id("memoriesSpaces"),
    publicGalleryEnabled: v.optional(v.boolean()),
    wallEnabled: v.optional(v.boolean()),
    wallRequiresApproval: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    await requireBusinessAccess(ctx, space.businessId);
    const patch: Record<string, boolean | number> = {};
    if (args.publicGalleryEnabled !== undefined) {
      patch.publicGalleryEnabled = args.publicGalleryEnabled;
    }
    if (args.wallEnabled !== undefined) {
      patch.wallEnabled = args.wallEnabled;
    }
    if (args.wallRequiresApproval !== undefined) {
      patch.wallRequiresApproval = args.wallRequiresApproval;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(space._id, { ...patch, updatedAt: Date.now() });
    }
    return {
      publicGalleryEnabled:
        args.publicGalleryEnabled ?? space.publicGalleryEnabled,
      wallEnabled: args.wallEnabled ?? space.wallEnabled,
      wallRequiresApproval:
        args.wallRequiresApproval ?? space.wallRequiresApproval ?? false,
    };
  },
});

// Pause or resume a space (active ⇄ paused). A paused space refuses uploads
// (reserveUpload requires status "active"), leaving every row intact. Only
// meaningful between active and paused — a closed/archived space is refused.
export const setSpacePaused = mutation({
  args: { spaceId: v.id("memoriesSpaces"), paused: v.boolean() },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    await requireBusinessAccess(ctx, space.businessId);
    if (space.status !== "active" && space.status !== "paused") {
      throw new ConvexError(dict.spaceStatusInvalid);
    }
    const next = args.paused ? "paused" : "active";
    if (space.status !== next) {
      await ctx.db.patch(space._id, { status: next, updatedAt: Date.now() });
    }
    return { status: next };
  },
});

// Extend a one_off upload window to a later close time. Reschedules the
// session's scheduled close, reopens a session/space the old window already
// closed, and clears the old scheduled close. one_off only.
export const extendSpaceWindow = mutation({
  args: { spaceId: v.id("memoriesSpaces"), windowEndAt: v.number() },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    await requireBusinessAccess(ctx, space.businessId);
    if (space.mode !== "one_off") throw new ConvexError(dict.spaceNotOneOff);
    const now = Date.now();
    if (
      args.windowEndAt <= now ||
      args.windowEndAt <= (space.windowStartAt ?? 0)
    ) {
      throw new ConvexError(dict.spaceWindowInvalid);
    }
    await ctx.db.patch(space._id, {
      windowEndAt: args.windowEndAt,
      // Extending reopens the space for uploads (covers extend-after-close).
      status: "active",
      updatedAt: now,
    });
    // Reschedule the session close and reopen it if it was already closed.
    const session = await ctx.db
      .query("memoriesSessions")
      .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", space._id))
      .first();
    if (session) {
      if (session.scheduledCloseId) {
        await ctx.scheduler.cancel(session.scheduledCloseId);
      }
      const scheduledCloseId = await ctx.scheduler.runAt(
        args.windowEndAt,
        internal.memories.closeSession,
        { sessionId: session._id },
      );
      await ctx.db.patch(session._id, {
        status: "open",
        closedAt: undefined,
        scheduledCloseId,
        updatedAt: now,
      });
    }
    return { windowEndAt: args.windowEndAt };
  },
});

// Close a one_off window early: stops uploads now (space status "closed",
// session closed), cancels the scheduled close. one_off only. Content intact.
export const closeSpaceWindow = mutation({
  args: { spaceId: v.id("memoriesSpaces") },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    await requireBusinessAccess(ctx, space.businessId);
    if (space.mode !== "one_off") throw new ConvexError(dict.spaceNotOneOff);
    const now = Date.now();
    await ctx.db.patch(space._id, {
      status: "closed",
      windowEndAt: now,
      updatedAt: now,
    });
    const session = await ctx.db
      .query("memoriesSessions")
      .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", space._id))
      .first();
    if (session && session.status === "open") {
      if (session.scheduledCloseId) {
        await ctx.scheduler.cancel(session.scheduledCloseId);
      }
      await ctx.db.patch(session._id, {
        status: "closed",
        closedAt: now,
        scheduledCloseId: undefined,
        updatedAt: now,
      });
    }
    return { closed: true as const };
  },
});
