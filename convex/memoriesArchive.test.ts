/// <reference types="vite/client" />

// TASK-23 — the host-curated archive. Each gate of pinPhotosToEvent is asserted
// here, and the load-bearing one is named for the FAILURE it prevents, not the
// function: a host_only photo (a guest who chose "samo ja i vlasnik") must never
// reach the venue's public, indexed, permanent page. Plus idempotency, the cap,
// cross-tenant refusal, unpin, and reorder's permutation guard.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ARCHIVE_MAX_ITEMS } from "../lib/venue-blocks";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

type T = ReturnType<typeof convexTest>;

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

// A business with a Memories space + one open session + one guest, and one
// archivable event. Returns the ids the tests pin against.
async function seed(t: T, opts: { slug?: string } = {}) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const slug = opts.slug ?? "sala-panorama";
    const businessId = await ctx.db.insert("businesses", {
      name: slug,
      slug,
      status: "active",
      createdAt: now,
    });
    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_memories",
      slug: `${slug}-memories`,
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const spaceId = await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code: `CODE${slug.slice(0, 4).toUpperCase()}`,
      name: "Uspomene",
      mode: "recurring",
      status: "active",
      nightCutoffHour: 6,
      defaultVisibility: "everyone",
      guestVisibilityChoice: true,
      publicGalleryEnabled: true,
      wallEnabled: false,
      totalPhotos: 0,
      totalGuests: 0,
      createdAt: now,
      updatedAt: now,
    });
    const sessionId = await ctx.db.insert("memoriesSessions", {
      spaceId,
      dateKey: "2026-08-26",
      status: "open",
      openedAt: now,
      photoCount: 0,
      guestCount: 0,
      updatedAt: now,
    });
    const guestId = await ctx.db.insert("memoriesGuests", {
      spaceId,
      guestKey: `guest-${slug}`,
      photoCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      businessId,
      slug: `${slug}-svadba`,
      title: "Svadba",
      status: "ended",
      lifecycleRevision: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { businessId, spaceId, sessionId, guestId, eventId };
  });
}

async function readyPhoto(
  t: T,
  args: {
    spaceId: Id<"memoriesSpaces">;
    sessionId: Id<"memoriesSessions">;
    guestId: Id<"memoriesGuests">;
    businessId: Id<"businesses">;
    visibility?: "everyone" | "host_only";
  },
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const v = async (bytes: number) => ({
      ref: await ctx.storage.store(new Blob([new Uint8Array(bytes).fill(7)])),
      width: 100,
      height: 75,
      bytes,
    });
    const mediaAssetId = await ctx.db.insert("mediaAssets", {
      businessId: args.businessId,
      kind: "image",
      provider: "convex",
      variants: { avif: await v(11), webp: await v(22), thumb: await v(7) },
      status: "ready",
      createdAt: now,
    });
    const photoId = await ctx.db.insert("memoriesPhotos", {
      spaceId: args.spaceId,
      sessionId: args.sessionId,
      guestId: args.guestId,
      mediaAssetId,
      visibility: args.visibility ?? "everyone",
      status: "ready",
      createdAt: now,
      updatedAt: now,
    });
    return { photoId, mediaAssetId };
  });
}

// A photo mid-pipeline: reserved, no committed asset.
async function reservedPhoto(
  t: T,
  args: {
    spaceId: Id<"memoriesSpaces">;
    sessionId: Id<"memoriesSessions">;
    guestId: Id<"memoriesGuests">;
  },
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("memoriesPhotos", {
      spaceId: args.spaceId,
      sessionId: args.sessionId,
      guestId: args.guestId,
      visibility: "everyone",
      status: "reserved",
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function asAdmin(t: T) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: Date.now(),
    }),
  );
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

async function archiveRows(t: T, eventId: Id<"events">) {
  // Inside t.run the schema index types are not in scope (convex-test gotcha),
  // so filter by field rather than withIndex — this is a test read, not a hot
  // path.
  return t.run((ctx) =>
    ctx.db
      .query("eventArchiveItems")
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .collect(),
  );
}

describe("pinPhotosToEvent access + tenancy", () => {
  test("an unauthenticated caller is refused", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, eventId } = await seed(t);
    const { photoId } = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
    });
    await expect(
      t.mutation(api.memoriesArchive.pinPhotosToEvent, {
        eventId,
        photoIds: [photoId],
      }),
    ).rejects.toThrow();
    expect(await archiveRows(t, eventId)).toEqual([]);
  });

  test("a photo from another business is refused — a cross-tenant pin is a hard error", async () => {
    const t = newT();
    const host = await seed(t);
    const other = await seed(t, { slug: "druga-sala" });
    // A ready, everyone-visible photo — but it belongs to the OTHER business.
    const foreign = await readyPhoto(t, {
      spaceId: other.spaceId,
      sessionId: other.sessionId,
      guestId: other.guestId,
      businessId: other.businessId,
    });
    const admin = await asAdmin(t);
    await expect(
      admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
        eventId: host.eventId,
        photoIds: [foreign.photoId],
      }),
    ).rejects.toThrow();
    expect(await archiveRows(t, host.eventId)).toEqual([]);
  });
});

describe("pinPhotosToEvent — the consent boundary", () => {
  // The load-bearing test, named for the failure it prevents.
  test("a host_only photo never reaches the public venue page", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, eventId } = await seed(t);
    const priv = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
      visibility: "host_only",
    });
    const admin = await asAdmin(t);
    await expect(
      admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
        eventId,
        photoIds: [priv.photoId],
      }),
    ).rejects.toThrow();
    expect(await archiveRows(t, eventId)).toEqual([]);
  });

  test("a reserved photo (no committed bytes) is refused", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, eventId } = await seed(t);
    const photoId = await reservedPhoto(t, { spaceId, sessionId, guestId });
    const admin = await asAdmin(t);
    await expect(
      admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
        eventId,
        photoIds: [photoId],
      }),
    ).rejects.toThrow();
    expect(await archiveRows(t, eventId)).toEqual([]);
  });
});

describe("pinPhotosToEvent — writes, idempotency, cap", () => {
  test("pins set sourcePhotoId and order continues from the current max", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, eventId } = await seed(t);
    const a = await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    const b = await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    const admin = await asAdmin(t);
    const res = await admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
      eventId,
      photoIds: [a.photoId, b.photoId],
    });
    expect(res.pinned).toBe(2);
    const rows = await archiveRows(t, eventId);
    expect(rows.map((r) => r.order).sort()).toEqual([0, 1]);
    const byPhoto = new Map(rows.map((r) => [r.sourcePhotoId, r]));
    expect(byPhoto.has(a.photoId)).toBe(true);
    expect(byPhoto.has(b.photoId)).toBe(true);
  });

  test("re-pinning an already-pinned photo is a silent no-op, not a second row", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, eventId } = await seed(t);
    const a = await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    const admin = await asAdmin(t);
    await admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
      eventId,
      photoIds: [a.photoId],
    });
    const second = await admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
      eventId,
      photoIds: [a.photoId],
    });
    expect(second.pinned).toBe(0);
    expect((await archiveRows(t, eventId)).length).toBe(1);
  });

  test("pinning past ARCHIVE_MAX_ITEMS is a hard error, not a silent truncation", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, eventId } = await seed(t);
    const admin = await asAdmin(t);
    // Fill the archive to the cap directly (fast), then attempt one more.
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < ARCHIVE_MAX_ITEMS; i += 1) {
        const asset = await ctx.db.insert("mediaAssets", {
          businessId,
          kind: "image",
          provider: "convex",
          variants: {
            avif: { ref: await ctx.storage.store(new Blob([new Uint8Array(1)])), width: 1, height: 1, bytes: 1 },
            webp: { ref: await ctx.storage.store(new Blob([new Uint8Array(1)])), width: 1, height: 1, bytes: 1 },
            thumb: { ref: await ctx.storage.store(new Blob([new Uint8Array(1)])), width: 1, height: 1, bytes: 1 },
          },
          status: "ready",
          createdAt: now,
        });
        await ctx.db.insert("eventArchiveItems", {
          eventId,
          mediaAssetId: asset,
          order: i,
          createdAt: now,
        });
      }
    });
    const overflow = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
    });
    await expect(
      admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
        eventId,
        photoIds: [overflow.photoId],
      }),
    ).rejects.toThrow();
    expect((await archiveRows(t, eventId)).length).toBe(ARCHIVE_MAX_ITEMS);
  });
});

describe("unpin + reorder", () => {
  test("unpin removes the archive row and leaves the photo untouched", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, eventId } = await seed(t);
    const a = await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    const admin = await asAdmin(t);
    await admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
      eventId,
      photoIds: [a.photoId],
    });
    const res = await admin.mutation(api.memoriesArchive.unpinPhotoFromEvent, {
      eventId,
      photoId: a.photoId,
    });
    expect(res.removed).toBe(true);
    expect(await archiveRows(t, eventId)).toEqual([]);
    // The photo itself is still there.
    expect(
      (await t.run((ctx) => ctx.db.get(a.photoId)))?.status,
    ).toBe("ready");
    // Unpinning again is a silent success.
    const again = await admin.mutation(api.memoriesArchive.unpinPhotoFromEvent, {
      eventId,
      photoId: a.photoId,
    });
    expect(again.removed).toBe(false);
  });

  test("reorder rewrites order; the first item is the cover", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, eventId } = await seed(t);
    const a = await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    const b = await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    const admin = await asAdmin(t);
    await admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
      eventId,
      photoIds: [a.photoId, b.photoId],
    });
    const rows = await archiveRows(t, eventId);
    const bItem = rows.find((r) => r.sourcePhotoId === b.photoId)!;
    const aItem = rows.find((r) => r.sourcePhotoId === a.photoId)!;
    // Put b first (make it the cover).
    await admin.mutation(api.memoriesArchive.reorderArchiveItems, {
      eventId,
      itemIds: [bItem._id, aItem._id],
    });
    const after = await archiveRows(t, eventId);
    const cover = after.find((r) => r.order === 0);
    expect(cover?.sourcePhotoId).toBe(b.photoId);
  });

  test("a reorder list that is not a permutation is rejected outright", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, eventId } = await seed(t);
    const a = await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    const b = await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    const admin = await asAdmin(t);
    await admin.mutation(api.memoriesArchive.pinPhotosToEvent, {
      eventId,
      photoIds: [a.photoId, b.photoId],
    });
    const rows = await archiveRows(t, eventId);
    const one = rows[0]._id;
    // A subset (wrong length) must not be partially applied.
    await expect(
      admin.mutation(api.memoriesArchive.reorderArchiveItems, {
        eventId,
        itemIds: [one],
      }),
    ).rejects.toThrow();
    // Duplicates are rejected too.
    await expect(
      admin.mutation(api.memoriesArchive.reorderArchiveItems, {
        eventId,
        itemIds: [one, one],
      }),
    ).rejects.toThrow();
  });
});
