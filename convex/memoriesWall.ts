import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, mutation, type QueryCtx } from "./_generated/server";
import { requireBusinessAccess } from "./lib/access";
import { getDict } from "../lib/i18n";
import {
  latestSession,
  photoImage,
  spaceByCode,
} from "./memories";

// =============================================================================
// TASK-22 — the live wall (/zid/[code]). The screen in the room: a laptop wired
// to a TV that runs unattended for a whole night while hundreds of photos land.
//
// TWO invariants shape this module, both structural rather than conditional:
//
//   1. THE WORST FAILURE — a host_only photo on a projector in a full room —
//      is impossible by construction, not by a client-side filter. The feed is
//      an INDEXED read into ("ready","everyone"): every row the scan yields is
//      already public and committed. `hidden`, `host_only`, `reserved`,
//      `processing`, and `deleted` rows are different key values, so the index
//      never even visits them. The wall client is handed nothing else to leak.
//
//   2. MEMORY MUST NOT GROW over six hours. The feed is a BOUNDED newest-first
//      window (`.take(WALL_WINDOW)`), not the whole night — so the query's
//      result set is the same size at 02:00 with 400 photos as it is at 20:00
//      with four. The client renders a bounded subset of that window and drops
//      what scrolled past (components/memories/wall/*). Neither side accumulates.
//
// No query here reads the wall clock (RFC-001 §2.9): the "current session" is
// the latest materialized session, and upload-window state is irrelevant to the
// wall — people keep watching after uploads close.
// =============================================================================

const dict = getDict("memories");

// The window the wall holds in memory. Generous enough that the ambient wall
// always feels full and the featured-photo rotation has variety, small enough
// that the client only ever decodes a bounded handful of images. Six hours of
// uploads never enlarge this — the newest WALL_WINDOW is all that is ever sent.
const WALL_WINDOW = 60;

function wallImageOf(ctx: QueryCtx, photo: Doc<"memoriesPhotos">) {
  return photoImage(ctx, photo);
}

// The wall's photo feed for a space's current session. Reactive: Convex reruns
// it whenever a matching row commits, so a new photo arrives on the wall on its
// own. Returns null ONLY as the "closed" signal is handled by wallView — here a
// non-servable space simply yields an empty window, so the client renders its
// waiting state rather than an error (a dropped connection must never blank the
// room; see the client's offline handling).
export const wallFeed = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space || !space.wallEnabled || space.status === "archived") {
      return { photos: [] as WallPhoto[], sessionId: null, count: 0 };
    }
    const session = await latestSession(ctx, space._id);
    if (!session) {
      return { photos: [] as WallPhoto[], sessionId: null, count: 0 };
    }

    // Approve-before-wall reads the 4-key index with wallApproved=true; the
    // default wall reads the 3-key index. BOTH pin ("ready","everyone") in the
    // key, so neither can surface a host_only or non-ready photo. newest-first,
    // capped at the window — the memory bound lives in this .take().
    const rows = space.wallRequiresApproval
      ? await ctx.db
          .query("memoriesPhotos")
          .withIndex(
            "by_sessionId_and_status_and_visibility_and_wallApproved",
            (q) =>
              q
                .eq("sessionId", session._id)
                .eq("status", "ready")
                .eq("visibility", "everyone")
                .eq("wallApproved", true),
          )
          .order("desc")
          .take(WALL_WINDOW)
      : await ctx.db
          .query("memoriesPhotos")
          .withIndex("by_sessionId_and_status_and_visibility", (q) =>
            q
              .eq("sessionId", session._id)
              .eq("status", "ready")
              .eq("visibility", "everyone"),
          )
          .order("desc")
          .take(WALL_WINDOW);

    const photos: WallPhoto[] = [];
    for (const photo of rows) {
      const image = await wallImageOf(ctx, photo);
      // The only post-index skip is a null image (an asset purged between the
      // row read and hydration — a rare race), never a visibility decision.
      if (!image) continue;
      photos.push({
        photoId: photo._id,
        // The wall stages the newest arrival as its centrepiece; the client
        // uses createdAt to tell a just-committed photo from the existing
        // window it mounted with, so only genuinely new uploads get the moment.
        createdAt: photo.createdAt,
        image,
      });
    }
    // `count` is the night's true participation (the session rollup), NOT the
    // windowed photo array — the social-proof line reads "142 tonight" even
    // though only the newest WALL_WINDOW are ever sent to the screen.
    return { photos, sessionId: session._id, count: session.photoCount };
  },
});

type WallPhoto = {
  photoId: Id<"memoriesPhotos">;
  createdAt: number;
  image: NonNullable<Awaited<ReturnType<typeof photoImage>>>;
};

// The wall's chrome: the space's name and brand for the masthead, the join URL
// the persistent QR encodes, and the approval mode (so the client can render a
// truthful empty state). null → the page 404s: the space does not exist, the
// host has not enabled the wall, or it is archived. This is the ONLY wall gate
// that 404s; the feed above degrades to an empty window so a mid-night flag flip
// or a reconnect never throws a full room to an error screen.
export const wallView = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const space = await spaceByCode(ctx, args.code);
    if (!space || !space.wallEnabled || space.status === "archived") {
      return null;
    }
    const business = await ctx.db.get(space.businessId);
    const session = await latestSession(ctx, space._id);
    return {
      spaceName: space.name,
      businessName: business?.name ?? space.name,
      // The join code the QR encodes. The client builds the absolute URL from
      // its own origin (`/m/{code}`) so no site-URL env var is needed and the
      // QR always points at the deployment the wall is served from.
      joinCode: space.code,
      requiresApproval: space.wallRequiresApproval === true,
      session: session
        ? { id: session._id, status: session.status }
        : null,
    };
  },
});

// TASK-22 STEP 4 — the host approves (or un-approves) one photo for the wall,
// from the host gallery built in TASK-19. requireBusinessAccess-gated (an active
// member of the space's tenant OR an admin), exactly like hostDeletePhoto. Only
// a committed, everyone-visible photo can ever reach the wall, so approving a
// host_only or non-ready row is refused — it could never appear regardless, and
// refusing keeps the host's mental model honest. Idempotent: setting the value
// it already holds is a silent success.
export const setPhotoWallApproval = mutation({
  args: { photoId: v.id("memoriesPhotos"), approved: v.boolean() },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) throw new ConvexError(dict.photoNotFound);
    const space = await ctx.db.get(photo.spaceId);
    if (!space) throw new ConvexError(dict.spaceNotFound);
    await requireBusinessAccess(ctx, space.businessId);
    if (photo.status !== "ready" || photo.visibility !== "everyone") {
      // Not eligible for the wall in any mode — the same non-disclosure error.
      throw new ConvexError(dict.photoNotFound);
    }
    if ((photo.wallApproved === true) !== args.approved) {
      await ctx.db.patch(photo._id, {
        wallApproved: args.approved,
        updatedAt: Date.now(),
      });
    }
    return { approved: args.approved };
  },
});
