import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { upsertManualEntitlement } from "./lib/entitlements";
import { generateCode } from "./lib/codes";
import { getUrl as storageGetUrl } from "./lib/storage";
import { provisionCelebration } from "./memoriesAdmin";
import { mintSpaceCards } from "./cards";
import type { Id } from "./_generated/dataModel";

// Dev tooling for TASK-14 curl QA: provisions, on a dev deployment, everything
// the /r/[cardCode] resolver needs end to end — a demo business, an active
// scanme_memories profile + basic entitlement, one ACTIVE recurring space, and
// two cards (one targeting the space, one targeting an external URL).
// Internal ⇒ callable only via `npx convex run` (deploy key) — never from a
// client. Idempotent: re-running returns the existing codes.
//
// Deliberately NO image/media/storage writes of any kind (TASK-14 scope), and
// no one_off space: openOneOffSession + window checks are covered by
// convex-test; the curl pass only needs a resolvable memories card.

const SEED_SLUG = "memories-primer";
const SEED_NAME = "Memories primer — Kafana Kod Šarana";

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingBusiness = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", SEED_SLUG))
      .unique();
    if (existingBusiness) {
      const space = await ctx.db
        .query("memoriesSpaces")
        .withIndex("by_businessId_and_status", (q) =>
          q.eq("businessId", existingBusiness._id).eq("status", "active"),
        )
        .first();
      const cards = await ctx.db
        .query("cards")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", existingBusiness._id),
        )
        .take(10);
      return {
        created: false,
        spaceCode: space?.code ?? null,
        cardCodes: cards.map((card) => card.cardCode),
      };
    }

    const now = Date.now();
    const seedUserId = await ctx.db.insert("users", {
      email: "memories-seed@scanme.dev",
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: SEED_NAME,
      slug: SEED_SLUG,
      status: "demo",
      createdAt: now,
    });
    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_memories",
      // Derived, never emitted by any URL — spaces are addressed by code.
      slug: `${SEED_SLUG}-memories`,
      status: "active",
      clientEditingEnabled: false,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await upsertManualEntitlement(ctx, {
      businessId,
      product: "scanme_memories",
      planKey: "basic",
      now,
    });

    const spaceCode = generateCode();
    const spaceId = await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code: spaceCode,
      name: "Kod Šarana — uspomene",
      mode: "recurring",
      status: "active",
      nightCutoffHour: 6,
      defaultVisibility: "everyone",
      guestVisibilityChoice: true,
      publicGalleryEnabled: false,
      wallEnabled: false,
      totalPhotos: 0,
      totalGuests: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Card 1 → the memories space ("Sto 1").
    const memoriesCardCode = generateCode();
    const memoriesCardId = await ctx.db.insert("cards", {
      businessId,
      cardCode: memoriesCardCode,
      label: "Sto 1",
      status: "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });
    const memoriesTargetId = await ctx.db.insert("cardTargets", {
      cardId: memoriesCardId,
      kind: "memories_space",
      spaceId,
      createdByUserId: seedUserId,
      createdAt: now,
    });
    await ctx.db.patch(memoriesCardId, { currentTargetId: memoriesTargetId });

    // Card 2 → an external URL (a second target kind for the curl pass).
    const urlCardCode = generateCode();
    const urlCardId = await ctx.db.insert("cards", {
      businessId,
      cardCode: urlCardCode,
      label: "Izlog",
      status: "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });
    const urlTargetId = await ctx.db.insert("cardTargets", {
      cardId: urlCardId,
      kind: "url",
      url: "https://scanme.rs/",
      createdByUserId: seedUserId,
      createdAt: now,
    });
    await ctx.db.patch(urlCardId, { currentTargetId: urlTargetId });

    return {
      created: true,
      spaceCode,
      cardCodes: [memoriesCardCode, urlCardCode],
    };
  },
});

// TASK-17 browser QA: drive the seeded space through the guest page's seven
// states (paused, closed, no entitlement, one_off window before/after, gallery
// on/off) without hand-editing the dashboard. Internal ⇒ deploy-key only.
// Example: npx convex run memoriesDevSeed:configureSpace '{"status":"paused"}'
export const configureSpace = internalMutation({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("closed"),
        v.literal("archived"),
      ),
    ),
    mode: v.optional(v.union(v.literal("recurring"), v.literal("one_off"))),
    windowStartAt: v.optional(v.number()),
    windowEndAt: v.optional(v.number()),
    publicGalleryEnabled: v.optional(v.boolean()),
    // TASK-22 browser QA: flip the wall (and its approve-before-wall gate) on
    // the seeded space without hand-editing the panel.
    wallEnabled: v.optional(v.boolean()),
    wallRequiresApproval: v.optional(v.boolean()),
    guestVisibilityChoice: v.optional(v.boolean()),
    entitled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", SEED_SLUG))
      .unique();
    if (!business) throw new Error("run memoriesDevSeed:seed first");
    const space = await ctx.db
      .query("memoriesSpaces")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", business._id),
      )
      .first();
    if (!space) throw new Error("seeded space missing");

    const { entitled, ...patch } = args;
    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(cleaned).length > 0) {
      await ctx.db.patch(space._id, { ...cleaned, updatedAt: Date.now() });
    }
    if (entitled !== undefined) {
      const rows = await ctx.db
        .query("entitlements")
        .withIndex("by_businessId_and_product", (q) =>
          q.eq("businessId", business._id).eq("product", "scanme_memories"),
        )
        .take(10);
      for (const row of rows) {
        await ctx.db.patch(row._id, {
          status: entitled ? "active" : "expired",
          updatedAt: Date.now(),
        });
      }
    }
    return { spaceId: space._id, code: space.code };
  },
});

// TASK-18 browser QA: provision a CELEBRATION end to end through the real
// provisioning + card-mint cores (convex/memoriesAdmin.provisionCelebration and
// convex/cards.mintSpaceCards) — the exact code the admin console runs, minus
// the requireAdmin gate the convex-tests already cover. Its one_off window is
// opened wide (−1h … +30d) so the guest upload loop is testable NOW. Internal ⇒
// deploy-key only. Idempotent: re-running returns the existing celebration's
// code + card codes.
const SEED_CELEBRATION_TITLE = "QA proslava — Jovana i Marko";

export const seedCelebration = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("celebrations")
      .withIndex("by_status_and_eventDate", (q) => q.eq("status", "booked"))
      .take(200);
    const found = existing.find((c) => c.title === SEED_CELEBRATION_TITLE);
    if (found) {
      const space = await ctx.db
        .query("memoriesSpaces")
        .withIndex("by_businessId_and_status", (q) =>
          q.eq("businessId", found.businessId),
        )
        .first();
      const cards = space
        ? await ctx.db
            .query("cards")
            .withIndex("by_businessId", (q) =>
              q.eq("businessId", found.businessId),
            )
            .take(20)
        : [];
      return {
        created: false,
        code: space?.code ?? null,
        spaceId: space?._id ?? null,
        cardCodes: cards.map((c) => c.cardCode),
      };
    }

    const result = await provisionCelebration(ctx, {
      kind: "svadba",
      title: SEED_CELEBRATION_TITLE,
      celebrantNames: "Jovana i Marko",
      eventDate: now,
      venueName: "Sala Grand",
      acquisitionChannel: "direct",
      contactName: "Jovana Jovanović",
      contactPhone: "+381601234567",
      planKey: "premium",
      windowStartAt: now - 60 * 60 * 1000,
      windowEndAt: now + 30 * 24 * 60 * 60 * 1000,
    });

    // A seed user to attribute the cards' createdByUserId to.
    const seedUserId = await ctx.db.insert("users", {
      email: "memories-celebration-seed@scanme.dev",
      emailVerificationTime: now,
    });
    const space = (await ctx.db.get(result.spaceId))!;
    const { created } = await mintSpaceCards(ctx, {
      space,
      count: 3,
      startIndex: 1,
      prefix: "Sto",
      userId: seedUserId,
      now,
    });

    return {
      created: true,
      code: result.code,
      slug: result.slug,
      spaceId: result.spaceId,
      sessionId: result.sessionId,
      cardCodes: created.map((c) => c.cardCode),
    };
  },
});

// TASK-18 browser QA: read exactly the counts the host panel binds to
// (session photo/guest counts + space totals + plan), so the walk-through can
// watch them move on upload without an authenticated panel render. Internal ⇒
// deploy-key only.
export const celebrationSnapshot = internalQuery({
  args: { spaceId: v.id("memoriesSpaces") },
  handler: async (ctx, args) => {
    const space = await ctx.db.get(args.spaceId);
    if (!space) return null;
    const session = await ctx.db
      .query("memoriesSessions")
      .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", space._id))
      .order("desc")
      .first();
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_businessId", (q) => q.eq("businessId", space.businessId))
      .take(50);
    return {
      spaceStatus: space.status,
      totalPhotos: space.totalPhotos,
      totalGuests: space.totalGuests,
      session: session
        ? {
            status: session.status,
            photoCount: session.photoCount,
            guestCount: session.guestCount,
          }
        : null,
      cards: cards.map((c) => ({
        label: c.label,
        code: c.cardCode,
        totalScans: c.totalScans,
      })),
    };
  },
});

// TASK-15 curl QA: the pipeline's end-to-end proof needs to download the
// stored variants of a processed photo to assert on the actual bytes (no
// EXIF, clamped dimensions, watermark present). Internal ⇒ callable only via
// `npx convex run` with a deploy key; no public surface serves media before
// the TASK-17 galleries.
export const photoAssets = internalQuery({
  args: { photoId: v.id("memoriesPhotos") },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return null;
    const asset = photo.mediaAssetId
      ? await ctx.db.get(photo.mediaAssetId)
      : null;
    if (!asset) return { status: photo.status, variants: null };
    const urlFor = (ref: string) =>
      storageGetUrl(ctx, ref as Id<"_storage">);
    return {
      status: photo.status,
      variants: {
        avif: { ...asset.variants.avif, url: await urlFor(asset.variants.avif.ref) },
        webp: { ...asset.variants.webp, url: await urlFor(asset.variants.webp.ref) },
        thumb: { ...asset.variants.thumb, url: await urlFor(asset.variants.thumb.ref) },
      },
    };
  },
});
