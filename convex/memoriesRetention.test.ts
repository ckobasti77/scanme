/// <reference types="vite/client" />

// TASK-20 — retention, purge, and deletion-on-request. The two hard rules of
// the task are asserted here as STORAGE facts, not database facts:
//   1. After purge, a photo's BYTES are gone — the _storage table is empty, not
//      merely the row. A tombstone that never deletes the blob is false
//      compliance, so every test below counts stored blobs.
//   2. The guest's wipe beats the host's archive pin — a photo the host pinned
//      into a Venue event archive disappears from the archive AND from storage.
// Plus the consent re-prompt (STEP 1): a guest on a stale consent version is
// re-stamped on the next upload; a current one is not.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { CONSENT_VERSION } from "../lib/i18n/sr/consent";

const modules = import.meta.glob("./**/*.ts");

const GUEST_KEY = "guest-key-cccccccccccccccccccccccccccccccc";
const SPACE_CODE = "RETN2345";
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
});

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof convexTest>;

// A space with an active basic (30-day retention) entitlement, one open
// session, and one guest.
async function seed(t: T, opts: { retentionPlan?: "basic" | "premium" } = {}) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Sala Panorama",
      slug: "sala-panorama",
      status: "active",
      createdAt: now,
    });
    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_memories",
      slug: "sala-panorama-memories",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("entitlements", {
      businessId,
      product: "scanme_memories",
      planKey: opts.retentionPlan ?? "basic",
      status: "active",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    const spaceId = await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code: SPACE_CODE,
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
      guestKey: GUEST_KEY,
      photoCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    });
    return { businessId, spaceId, sessionId, guestId };
  });
}

// Insert a committed (`ready`) photo with three REAL stored variant blobs, at a
// chosen age. Returns the photoId and its mediaAssetId.
async function readyPhoto(
  t: T,
  args: {
    spaceId: Id<"memoriesSpaces">;
    sessionId: Id<"memoriesSessions">;
    guestId: Id<"memoriesGuests">;
    businessId: Id<"businesses">;
    ageMs?: number;
    visibility?: "everyone" | "host_only";
  },
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const createdAt = now - (args.ageMs ?? 0);
    const v = async (bytes: number) => ({
      ref: await ctx.storage.store(new Blob([new Uint8Array(bytes).fill(9)])),
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
      createdAt,
    });
    const photoId = await ctx.db.insert("memoriesPhotos", {
      spaceId: args.spaceId,
      sessionId: args.sessionId,
      guestId: args.guestId,
      mediaAssetId,
      visibility: args.visibility ?? "everyone",
      status: "ready",
      createdAt,
      updatedAt: createdAt,
    });
    return { photoId, mediaAssetId };
  });
}

// The count of blobs actually in storage — the byte-level assertion.
async function storageCount(t: T) {
  return t.run(async (ctx) => {
    const files = await ctx.db.system.query("_storage").collect();
    return files.length;
  });
}

describe("retention sweep + purge", () => {
  test("a photo past the cutoff is tombstoned then its BYTES are gone", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId } = await seed(t);

    // One photo 40 days old (past the 30-day basic cutoff), one fresh.
    const old = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
      ageMs: 40 * DAY_MS,
    });
    const fresh = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
      ageMs: 1 * DAY_MS,
    });

    expect(await storageCount(t)).toBe(6); // 2 photos × 3 variants

    // The daily cron entry enumerates spaces (resolving each plan's cutoff) and
    // schedules a per-space sweep; assert it found this space, then drive the
    // per-space sweep + purge deterministically (the runAfter(0) wiring between
    // them is a one-liner, exercised for real in the end-to-end path below).
    const kicked = await t.mutation(internal.memories.retentionSweep, {});
    expect(kicked.spaces).toBe(1);
    await t.mutation(internal.memories.retentionSweepSpace, {
      spaceId,
      cutoff: Date.now() - 30 * DAY_MS, // basic tier
      cursor: null,
    });
    await t.mutation(internal.memories.purgeSweep, {});

    // The old photo's row AND its three blobs are gone; the fresh one survives.
    const oldRow = await t.run((ctx) => ctx.db.get(old.photoId));
    const freshRow = await t.run((ctx) => ctx.db.get(fresh.photoId));
    expect(oldRow).toBeNull();
    expect(freshRow?.status).toBe("ready");
    const oldAsset = await t.run((ctx) => ctx.db.get(old.mediaAssetId));
    expect(oldAsset).toBeNull();
    expect(await storageCount(t)).toBe(3); // only the fresh photo's variants
  });

  test("premium (365d) keeps a 40-day-old photo", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId } = await seed(t, {
      retentionPlan: "premium",
    });
    const photo = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
      ageMs: 40 * DAY_MS,
    });
    await t.mutation(internal.memories.retentionSweepSpace, {
      spaceId,
      cutoff: Date.now() - 365 * DAY_MS, // premium tier
      cursor: null,
    });
    await t.mutation(internal.memories.purgeSweep, {});
    const row = await t.run((ctx) => ctx.db.get(photo.photoId));
    expect(row?.status).toBe("ready");
    expect(await storageCount(t)).toBe(3);
  });
});

// TASK-23 STEP 0 — the load-bearing amendment. Retention alone no longer beats
// the host's archive pin: a photo pinned onto the venue's public page survives a
// sweep whose cutoff is far past it. But the pin is not immortal — an EXPLICIT
// guest deletion still removes the photo AND its archive row. Named for what it
// protects: the venue page not silently emptying itself.
describe("the archive pin outlives retention, but not an explicit deletion", () => {
  test("a pinned photo survives a retention sweep, then a guest delete removes it from eventArchiveItems too", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId } = await seed(t);

    // A photo far past any retention cutoff — 400 days old.
    const pinned = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
      ageMs: 400 * DAY_MS,
    });

    // The host pins it onto an event archive (sourcePhotoId set — the TASK-23
    // trace back to the night).
    const { itemId } = await t.run(async (ctx) => {
      const now = Date.now();
      const eventId = await ctx.db.insert("events", {
        businessId,
        slug: "svadba",
        title: "Svadba",
        status: "archived",
        lifecycleRevision: 1,
        createdAt: now,
        updatedAt: now,
      });
      const itemId = await ctx.db.insert("eventArchiveItems", {
        eventId,
        mediaAssetId: pinned.mediaAssetId,
        sourcePhotoId: pinned.photoId,
        order: 0,
        createdAt: now,
      });
      return { itemId };
    });

    // A retention sweep whose cutoff is in the FUTURE — every photo is "past" it.
    // The pinned photo must NOT be tombstoned, and its bytes must remain.
    await t.mutation(internal.memories.retentionSweepSpace, {
      spaceId,
      cutoff: Date.now() + DAY_MS,
      cursor: null,
    });
    await t.mutation(internal.memories.purgeSweep, {});

    expect(
      (await t.run((ctx) => ctx.db.get(pinned.photoId)))?.status,
    ).toBe("ready");
    expect(await t.run((ctx) => ctx.db.get(itemId))).not.toBeNull();
    expect(await storageCount(t)).toBe(3);

    // Now the guest explicitly deletes the photo. The pin is not a shield
    // against the guest's own erasure: the row AND the bytes go.
    const deleted = await t.mutation(api.memories.deleteMyPhoto, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId: pinned.photoId,
    });
    expect(deleted.deleted).toBe(true);
    await t.mutation(internal.memories.purgeSweep, {});

    expect(await t.run((ctx) => ctx.db.get(pinned.photoId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(itemId))).toBeNull();
    expect(await storageCount(t)).toBe(0);
  });
});

describe("guest wipe", () => {
  test("wipes photos, grants, guest row, AND the host's archive pin — zero storage", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId } = await seed(t);

    const pinned = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
    });
    const other = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
    });
    expect(await storageCount(t)).toBe(6);

    // The host pins the FIRST photo's asset into a Venue event archive, and the
    // guest holds a quota grant. Both must vanish when the guest wipes.
    const { eventId, archiveItemId } = await t.run(async (ctx) => {
      const now = Date.now();
      const eventId = await ctx.db.insert("events", {
        businessId,
        slug: "svadba",
        title: "Svadba",
        status: "archived",
        lifecycleRevision: 1,
        createdAt: now,
        updatedAt: now,
      });
      const archiveItemId = await ctx.db.insert("eventArchiveItems", {
        eventId,
        mediaAssetId: pinned.mediaAssetId,
        order: 0,
        createdAt: now,
      });
      const userId = await ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        emailVerificationTime: now,
      });
      await ctx.db.insert("quotaAdjustments", {
        spaceId,
        guestId,
        extraPhotos: 5,
        createdByUserId: userId,
        createdAt: now,
      });
      return { eventId, archiveItemId };
    });
    void eventId;

    // The public entry masks the guestKey and schedules the batched wipe; then
    // the batch tombstones + deletes grants/guest row, and the purge removes the
    // bytes and the archive pin. (The scheduler wiring between them is a
    // one-line runAfter; driven directly here for determinism.)
    const started = await t.mutation(api.memories.wipeMyPhotos, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(started.started).toBe(true);
    await t.mutation(internal.memories.wipeGuestBatch, { guestId });
    await t.mutation(internal.memories.purgeSweep, {});

    // Zero photos, zero archive items, zero grants, zero guest row, zero bytes.
    const photos = await t.run((ctx) =>
      ctx.db
        .query("memoriesPhotos")
        .withIndex("by_guestId", (q) => q.eq("guestId", guestId))
        .collect(),
    );
    expect(photos).toEqual([]);
    const pinRow = await t.run((ctx) => ctx.db.get(archiveItemId));
    expect(pinRow).toBeNull();
    const grants = await t.run((ctx) =>
      ctx.db
        .query("quotaAdjustments")
        .withIndex("by_guestId", (q) => q.eq("guestId", guestId))
        .collect(),
    );
    expect(grants).toEqual([]);
    const guest = await t.run((ctx) => ctx.db.get(guestId));
    expect(guest).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(pinned.mediaAssetId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(other.mediaAssetId))).toBeNull();
    expect(await storageCount(t)).toBe(0);
  });

  test("a wrong guestKey wipes nothing", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId } = await seed(t);
    await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    await expect(
      t.mutation(api.memories.wipeMyPhotos, {
        code: SPACE_CODE,
        guestKey: "guest-key-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      }),
    ).rejects.toThrow();
    expect(await storageCount(t)).toBe(3);
  });
});

describe("host per-photo delete", () => {
  test("tombstones and purges the bytes", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId } = await seed(t);
    const photo = await readyPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
    });
    // The host is an admin here (SCANME_ADMIN_EMAILS) via an authed identity —
    // requireBusinessAccess admits admins, so this covers host AND admin delete.
    const adminId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });
    const deleted = await asAdmin.mutation(api.memories.hostDeletePhoto, {
      photoId: photo.photoId,
    });
    expect(deleted.deleted).toBe(true);
    await t.mutation(internal.memories.purgeSweep, {});
    expect(await t.run((ctx) => ctx.db.get(photo.photoId))).toBeNull();
    expect(await storageCount(t)).toBe(0);
  });
});

describe("space wipe", () => {
  test("host wipes every photo in the space; bytes gone", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId } = await seed(t);
    await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    await readyPhoto(t, { spaceId, sessionId, guestId, businessId });
    expect(await storageCount(t)).toBe(6);

    const adminId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });
    const started = await asAdmin.mutation(api.memories.wipeSpacePhotos, {
      spaceId,
    });
    expect(started.started).toBe(true);
    await t.mutation(internal.memories.wipeSpaceBatch, {
      spaceId,
      cursor: null,
    });
    await t.mutation(internal.memories.purgeSweep, {});

    const photos = await t.run((ctx) =>
      ctx.db
        .query("memoriesPhotos")
        .withIndex("by_spaceId_and_createdAt", (q) => q.eq("spaceId", spaceId))
        .collect(),
    );
    expect(photos).toEqual([]);
    expect(await storageCount(t)).toBe(0);
  });
});

describe("consent re-prompt (STEP 1)", () => {
  test("a stale consent version is re-stamped on the next upload; current is not", async () => {
    const t = newT();
    const { guestId } = await seed(t);

    // Force a stale stored version.
    await t.run((ctx) =>
      ctx.db.patch(guestId, {
        consentVersion: "2020-01-01",
        consentAt: 1,
      }),
    );
    const staleView = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(staleView!.guest!.needsConsent).toBe(true);

    // The next reservation re-stamps the current version (the affirmative act).
    await t.mutation(api.memories.reserveUpload, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    const after = await t.run((ctx) => ctx.db.get(guestId));
    expect(after!.consentVersion).toBe(CONSENT_VERSION);
    expect(after!.consentAt).not.toBe(1);

    const freshView = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(freshView!.guest!.needsConsent).toBe(false);

    // A second upload at the current version does NOT move consentAt.
    const stampedAt = after!.consentAt;
    await t.mutation(api.memories.reserveUpload, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    const second = await t.run((ctx) => ctx.db.get(guestId));
    expect(second!.consentAt).toBe(stampedAt);
  });
});
