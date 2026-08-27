import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getEntitlement, upsertManualEntitlement } from "./lib/entitlements";
import { generateCode } from "./lib/codes";
import { remove as storageRemove } from "./lib/storage";
import { mintSpaceCards } from "./cards";

// =============================================================================
// TASK-24 — provisioning for the 200-phone load test (scripts/load/).
//
// Internal ⇒ deploy-key only (`npx convex run memoriesLoadSeed:seed`), exactly
// like memoriesDevSeed. NEVER run against a deployment with real data: the
// load run writes hundreds of photos and `reset` hard-deletes them again.
//
// Two spaces under one throwaway business:
//   - the LOAD space (standard plan, 5/guest, wall enabled) — the realistic
//     200×5 night, plus the commit-flood escalations;
//   - the QUOTA space (space-scoped basic plan, limit 3) — the H2 attack
//     target, where parallel reserves must still end at exactly 3 commits.
//
// Guests are minted here directly — as if their /r card scans had succeeded —
// because the harness's job is the upload protocol, not the resolver; the
// resolver's per-IP limits are answered by arithmetic in
// docs/perf/memories-load.md (Step 0, H3).
// =============================================================================

const LOAD_SLUG = "memories-load-test";
const LOAD_SPACE_NAME = "Load test — glavni prostor";
const QUOTA_SPACE_NAME = "Load test — kvota napad";

// reset: photos walked per transaction; each row costs up to 4 storage deletes
// + 2 doc deletes, so the batch stays small (mirrors PURGE_BATCH in
// convex/memories.ts).
const RESET_BATCH = 25;
// Bounded reads for guests / sessions / verify scans. The harness never seeds
// more than ~500 guests; verify reads whole-run photo sets (~a few thousand).
const GUESTS_READ_CAP = 1000;
const SESSIONS_READ_CAP = 25;
const PHOTOS_READ_CAP = 8000;
const PER_GUEST_READ_CAP = 50;

// 256-bit random key, hex-encoded — matches the guest-cookie key pattern
// ([A-Za-z0-9_-]{16,128}) without copying cards.ts's base64url helper.
function generateLoadGuestKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

async function guestKeysOf(
  ctx: QueryCtx,
  spaceId: Id<"memoriesSpaces">,
): Promise<string[]> {
  const guests = await ctx.db
    .query("memoriesGuests")
    .withIndex("by_spaceId_and_guestKey", (q) => q.eq("spaceId", spaceId))
    .take(GUESTS_READ_CAP);
  return guests.map((guest) => guest.guestKey);
}

async function topUpGuests(
  ctx: MutationCtx,
  space: Doc<"memoriesSpaces">,
  target: number,
  cardIds: Id<"cards">[],
  now: number,
): Promise<string[]> {
  const keys = await guestKeysOf(ctx, space._id);
  for (let i = keys.length; i < target; i += 1) {
    const guestKey = generateLoadGuestKey();
    await ctx.db.insert("memoriesGuests", {
      spaceId: space._id,
      guestKey,
      // Round-robin across the seeded table cards, like a real room.
      cardId: cardIds.length > 0 ? cardIds[i % cardIds.length] : undefined,
      photoCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    });
    keys.push(guestKey);
  }
  return keys;
}

export const seed = internalMutation({
  args: {
    guests: v.optional(v.number()),
    cards: v.optional(v.number()),
    attackGuests: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const guestTarget = Math.min(Math.max(args.guests ?? 200, 1), 500);
    const cardTarget = Math.min(Math.max(args.cards ?? 25, 1), 50);
    const attackTarget = Math.min(Math.max(args.attackGuests ?? 40, 1), 200);
    const now = Date.now();

    let business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", LOAD_SLUG))
      .unique();
    let created = false;

    if (!business) {
      created = true;
      const seedUserId = await ctx.db.insert("users", {
        email: "memories-load-seed@scanme.dev",
        emailVerificationTime: now,
      });
      const businessId = await ctx.db.insert("businesses", {
        name: "Memories load test",
        slug: LOAD_SLUG,
        status: "demo",
        createdAt: now,
      });
      const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
        businessId,
        type: "scanme_memories",
        slug: `${LOAD_SLUG}-memories`,
        status: "active",
        clientEditingEnabled: false,
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
      // Business-level standard (5/guest) covers the load space …
      await upsertManualEntitlement(ctx, {
        businessId,
        product: "scanme_memories",
        planKey: "standard",
        now,
      });

      const loadSpaceId = await ctx.db.insert("memoriesSpaces", {
        businessId,
        memoriesProfileId,
        code: generateCode(),
        name: LOAD_SPACE_NAME,
        mode: "recurring",
        status: "active",
        nightCutoffHour: 6,
        defaultVisibility: "everyone",
        guestVisibilityChoice: true,
        publicGalleryEnabled: false,
        wallEnabled: true,
        totalPhotos: 0,
        totalGuests: 0,
        createdAt: now,
        updatedAt: now,
      });
      const quotaSpaceId = await ctx.db.insert("memoriesSpaces", {
        businessId,
        memoriesProfileId,
        code: generateCode(),
        name: QUOTA_SPACE_NAME,
        mode: "recurring",
        status: "active",
        nightCutoffHour: 6,
        defaultVisibility: "everyone",
        guestVisibilityChoice: false,
        publicGalleryEnabled: false,
        wallEnabled: false,
        totalPhotos: 0,
        totalGuests: 0,
        createdAt: now,
        updatedAt: now,
      });
      // … and the space-scoped basic (limit 3) wins on the quota space.
      await upsertManualEntitlement(ctx, {
        businessId,
        product: "scanme_memories",
        planKey: "basic",
        spaceId: quotaSpaceId,
        now,
      });

      const loadSpace = (await ctx.db.get(loadSpaceId))!;
      await mintSpaceCards(ctx, {
        space: loadSpace,
        count: cardTarget,
        startIndex: 1,
        prefix: "Sto",
        userId: seedUserId,
        now,
      });
      business = (await ctx.db.get(businessId))!;
    }

    const spaces = await ctx.db
      .query("memoriesSpaces")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id),
      )
      .take(10);
    const loadSpace = spaces.find((space) => space.name === LOAD_SPACE_NAME);
    const quotaSpace = spaces.find((space) => space.name === QUOTA_SPACE_NAME);
    if (!loadSpace || !quotaSpace) throw new Error("seed spaces missing");

    const cards = await ctx.db
      .query("cards")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .take(60);
    const cardIds = cards.map((card) => card._id);

    // Idempotent top-up: re-running with a larger --guests scales the room.
    const guestKeys = await topUpGuests(
      ctx,
      loadSpace,
      guestTarget,
      cardIds,
      now,
    );
    const attackGuestKeys = await topUpGuests(
      ctx,
      quotaSpace,
      attackTarget,
      [],
      now,
    );

    return {
      created,
      loadSpaceCode: loadSpace.code,
      quotaSpaceCode: quotaSpace.code,
      guestKeys,
      attackGuestKeys,
    };
  },
});

// -----------------------------------------------------------------------------
// reset — wipe the load photos between runs. Batched with a scheduler
// continuation (the repo's sweep pattern); one `npx convex run` kicks it and it
// reschedules itself until clean, then zeroes the rollups. Load-test assets are
// never pinned into Venue archives, so assets delete directly.
// -----------------------------------------------------------------------------

async function seedSpaces(ctx: QueryCtx): Promise<Doc<"memoriesSpaces">[]> {
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", LOAD_SLUG))
    .unique();
  if (!business) return [];
  return await ctx.db
    .query("memoriesSpaces")
    .withIndex("by_businessId_and_status", (q) =>
      q.eq("businessId", business._id),
    )
    .take(10);
}

export const reset = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ done: boolean; deleted: number }> => {
    const spaces = await seedSpaces(ctx);
    let deleted = 0;

    for (const space of spaces) {
      if (deleted >= RESET_BATCH) break;
      const sessions = await ctx.db
        .query("memoriesSessions")
        .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", space._id))
        .take(SESSIONS_READ_CAP);
      for (const session of sessions) {
        if (deleted >= RESET_BATCH) break;
        const photos = await ctx.db
          .query("memoriesPhotos")
          .withIndex("by_sessionId_and_status", (q) =>
            q.eq("sessionId", session._id),
          )
          .take(RESET_BATCH - deleted);
        for (const photo of photos) {
          if (photo.originalStorageId) {
            await storageRemove(ctx, photo.originalStorageId);
          }
          if (photo.mediaAssetId) {
            const asset = await ctx.db.get(photo.mediaAssetId);
            if (asset) {
              await storageRemove(ctx, asset.variants.avif.ref as Id<"_storage">);
              await storageRemove(ctx, asset.variants.webp.ref as Id<"_storage">);
              await storageRemove(
                ctx,
                asset.variants.thumb.ref as Id<"_storage">,
              );
              await ctx.db.delete(asset._id);
            }
          }
          await ctx.db.delete(photo._id);
          deleted += 1;
        }
      }
    }

    if (deleted >= RESET_BATCH) {
      await ctx.scheduler.runAfter(0, internal.memoriesLoadSeed.reset, {});
      return { done: false, deleted };
    }

    // Clean: zero every rollup the load run inflated.
    const now = Date.now();
    for (const space of spaces) {
      if (space.totalPhotos !== 0) {
        await ctx.db.patch(space._id, { totalPhotos: 0, updatedAt: now });
      }
      const sessions = await ctx.db
        .query("memoriesSessions")
        .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", space._id))
        .take(SESSIONS_READ_CAP);
      for (const session of sessions) {
        if (session.photoCount !== 0) {
          await ctx.db.patch(session._id, { photoCount: 0, updatedAt: now });
        }
      }
      const guests = await ctx.db
        .query("memoriesGuests")
        .withIndex("by_spaceId_and_guestKey", (q) => q.eq("spaceId", space._id))
        .take(GUESTS_READ_CAP);
      for (const guest of guests) {
        if (guest.photoCount !== 0) {
          await ctx.db.patch(guest._id, { photoCount: 0, updatedAt: now });
        }
      }
    }
    return { done: true, deleted };
  },
});

// -----------------------------------------------------------------------------
// verify — the post-run ground truth, read straight from the indexes. The
// harness compares this against what it observed; verdict arithmetic lives in
// the report, raw facts live here.
// -----------------------------------------------------------------------------

export const verify = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const spaces = await seedSpaces(ctx);
    const space = spaces.find((candidate) => candidate.code === args.code);
    if (!space) return null;
    const session = await ctx.db
      .query("memoriesSessions")
      .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", space._id))
      .order("desc")
      .first();

    const entitlement = await getEntitlement(
      ctx,
      space.businessId,
      "scanme_memories",
      space._id,
    );

    const statusCounts: Record<string, number> = {
      reserved: 0,
      processing: 0,
      ready: 0,
      hidden: 0,
      deleted: 0,
    };
    if (session) {
      const photos = await ctx.db
        .query("memoriesPhotos")
        .withIndex("by_sessionId_and_status", (q) =>
          q.eq("sessionId", session._id),
        )
        .take(PHOTOS_READ_CAP);
      for (const photo of photos) statusCounts[photo.status] += 1;
    }

    const guests = session
      ? await ctx.db
          .query("memoriesGuests")
          .withIndex("by_spaceId_and_guestKey", (q) =>
            q.eq("spaceId", space._id),
          )
          .take(GUESTS_READ_CAP)
      : [];
    const perGuest: Array<{
      key: string;
      live: number;
      ready: number;
      rollup: number;
    }> = [];
    for (const guest of guests) {
      const rows = await ctx.db
        .query("memoriesPhotos")
        .withIndex("by_sessionId_and_guestId", (q) =>
          q.eq("sessionId", session!._id).eq("guestId", guest._id),
        )
        .take(PER_GUEST_READ_CAP);
      const live = rows.filter((row) => row.status !== "deleted").length;
      const ready = rows.filter((row) => row.status === "ready").length;
      perGuest.push({
        key: guest.guestKey.slice(0, 8),
        live,
        ready,
        rollup: guest.photoCount,
      });
    }

    return {
      space: {
        code: space.code,
        status: space.status,
        totalPhotos: space.totalPhotos,
      },
      session: session
        ? {
            dateKey: session.dateKey,
            status: session.status,
            photoCount: session.photoCount,
            guestCount: session.guestCount,
          }
        : null,
      limit: entitlement ? entitlement.limits.photosPerGuest : null,
      statusCounts,
      guests: perGuest,
    };
  },
});
