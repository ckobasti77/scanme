/// <reference types="vite/client" />

// TASK-15 STEP 5 — the reserve→commit protocol, provable with convex-test:
// the claim's state machine and entitlement resolution, the commit's
// idempotency per photoId and its state-machine gate (a valid secret alone
// commits nothing), real byte sizes from the _storage system table, the
// rollups, and the 24h reaper for crashed runs.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { PIPELINE_ERROR } from "../lib/memories-pipeline/protocol";

const modules = import.meta.glob("./**/*.ts");

const SECRET = "test-pipeline-secret-0123456789abcdef";
const GUEST_KEY = "guest-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_GUEST_KEY = "guest-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SPACE_CODE = "ABCD2345";
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env.SCANME_PIPELINE_SECRET = SECRET;
});

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof convexTest>;

async function seedSpace(
  t: T,
  opts: { planKey?: "basic" | "standard" | "premium"; withLogo?: boolean } = {},
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const logoStorageId = opts.withLogo
      ? await ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])]))
      : undefined;
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Kod Šarana",
      slug: "kod-sarana",
      status: "active",
      createdAt: now,
      ...(logoStorageId ? { logoStorageId } : {}),
    });
    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_memories",
      slug: "kod-sarana-memories",
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
      planKey: opts.planKey ?? "basic",
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
      publicGalleryEnabled: false,
      wallEnabled: false,
      totalPhotos: 0,
      totalGuests: 0,
      createdAt: now,
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
    return { businessId, spaceId, guestId };
  });
}

// Reserve a slot and PUT a fake original, exactly as the browser would.
async function reserveAndUpload(t: T, bytes = 64) {
  const reservation = await t.mutation(api.memories.reserveUpload, {
    code: SPACE_CODE,
    guestKey: GUEST_KEY,
  });
  const storageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(bytes).fill(7)])),
  );
  return { photoId: reservation.photoId, storageId, reservation };
}

function claim(
  t: T,
  photoId: Id<"memoriesPhotos">,
  storageId: Id<"_storage">,
  overrides: { secret?: string; guestKey?: string } = {},
) {
  return t.mutation(api.memoriesPipeline.uploadContext, {
    secret: overrides.secret ?? SECRET,
    code: SPACE_CODE,
    guestKey: overrides.guestKey ?? GUEST_KEY,
    photoId,
    storageId,
  });
}

// Store three fake variant blobs of known sizes and commit them.
async function storeVariants(t: T) {
  return t.run(async (ctx) => ({
    avif: {
      ref: await ctx.storage.store(new Blob([new Uint8Array(1111)])),
      width: 2048,
      height: 1365,
    },
    webp: {
      ref: await ctx.storage.store(new Blob([new Uint8Array(2222)])),
      width: 2048,
      height: 1365,
    },
    thumb: {
      ref: await ctx.storage.store(new Blob([new Uint8Array(333)])),
      width: 512,
      height: 341,
    },
  }));
}

function commit(
  t: T,
  photoId: Id<"memoriesPhotos">,
  originalStorageId: Id<"_storage">,
  variants: Awaited<ReturnType<typeof storeVariants>>,
  secret = SECRET,
) {
  return t.mutation(api.memoriesPipeline.commitProcessed, {
    secret,
    photoId,
    originalStorageId,
    variants,
  });
}

async function getPhoto(t: T, photoId: Id<"memoriesPhotos">) {
  return t.run(async (ctx) => ctx.db.get(photoId));
}

describe("reserveUpload (TASK-15 addition)", () => {
  test("returns the storage upload URL alongside the slot", async () => {
    const t = newT();
    await seedSpace(t);
    const result = await t.mutation(api.memories.reserveUpload, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(typeof result.uploadUrl).toBe("string");
    expect(result.uploadUrl.length).toBeGreaterThan(0);
  });
});

describe("uploadContext — the claim", () => {
  test("claims a reserved slot: processing + pinned original + context", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId, storageId } = await reserveAndUpload(t);

    const context = await claim(t, photoId, storageId);
    expect(context.alreadyReady).toBe(false);
    if (context.alreadyReady) throw new Error("unreachable");
    expect(context.maxImageDimension).toBe(2048); // basic tier
    expect(context.businessLogoUrl).toBeNull();
    expect(typeof context.originalUrl).toBe("string");
    expect(typeof context.uploads.avif).toBe("string");
    expect(typeof context.uploads.webp).toBe("string");
    expect(typeof context.uploads.thumb).toBe("string");

    const photo = await getPhoto(t, photoId);
    expect(photo?.status).toBe("processing");
    expect(photo?.originalStorageId).toBe(storageId);
  });

  test("the clamp dimension follows the tier (standard → 2560)", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "standard" });
    const { photoId, storageId } = await reserveAndUpload(t);
    const context = await claim(t, photoId, storageId);
    if (context.alreadyReady) throw new Error("unreachable");
    expect(context.maxImageDimension).toBe(2560);
  });

  test("returns the business logo URL when the business has one", async () => {
    const t = newT();
    await seedSpace(t, { withLogo: true });
    const { photoId, storageId } = await reserveAndUpload(t);
    const context = await claim(t, photoId, storageId);
    if (context.alreadyReady) throw new Error("unreachable");
    expect(typeof context.businessLogoUrl).toBe("string");
  });

  test("rejects a wrong secret, and refuses to run unconfigured", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId, storageId } = await reserveAndUpload(t);
    await expect(
      claim(t, photoId, storageId, { secret: "wrong" }),
    ).rejects.toThrow(PIPELINE_ERROR.invalidSecret);

    delete process.env.SCANME_PIPELINE_SECRET;
    await expect(claim(t, photoId, storageId)).rejects.toThrow(
      PIPELINE_ERROR.disabled,
    );
  });

  test("masks another guest's photo as not found", async () => {
    const t = newT();
    const { spaceId } = await seedSpace(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("memoriesGuests", {
        spaceId,
        guestKey: OTHER_GUEST_KEY,
        photoCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      });
    });
    const { photoId, storageId } = await reserveAndUpload(t);
    await expect(
      claim(t, photoId, storageId, { guestKey: OTHER_GUEST_KEY }),
    ).rejects.toThrow(PIPELINE_ERROR.notFound);
  });

  test("rejects a missing original blob", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId, storageId } = await reserveAndUpload(t);
    await t.run(async (ctx) => ctx.storage.delete(storageId));
    await expect(claim(t, photoId, storageId)).rejects.toThrow(
      PIPELINE_ERROR.blobMissing,
    );
  });

  test("rejects an oversized original", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId } = await reserveAndUpload(t);
    const huge = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(26 * 1024 * 1024)])),
    );
    await expect(claim(t, photoId, huge)).rejects.toThrow(
      PIPELINE_ERROR.blobTooLarge,
    );
  });
});

describe("commitProcessed — idempotent, state-machine-validated", () => {
  test("commits in one transaction: asset, ready flip, original delete, rollups", async () => {
    const t = newT();
    const { spaceId, guestId } = await seedSpace(t);
    const { photoId, storageId } = await reserveAndUpload(t);
    await claim(t, photoId, storageId);
    const variants = await storeVariants(t);

    const result = await commit(t, photoId, storageId, variants);
    expect(result.alreadyReady).toBe(false);

    const photo = await getPhoto(t, photoId);
    expect(photo?.status).toBe("ready");
    expect(photo?.mediaAssetId).toBe(result.mediaAssetId);
    expect(photo?.originalStorageId).toBeUndefined();

    await t.run(async (ctx) => {
      // The asset row records the REAL byte sizes from the _storage system
      // table — never the caller's word — plus the transform's dimensions.
      const asset = await ctx.db.get(result.mediaAssetId);
      expect(asset?.variants.avif).toEqual({
        ref: variants.avif.ref,
        width: 2048,
        height: 1365,
        bytes: 1111,
      });
      expect(asset?.variants.webp.bytes).toBe(2222);
      expect(asset?.variants.thumb.bytes).toBe(333);
      expect(asset?.status).toBe("ready");

      // The original blob is gone.
      expect(await ctx.db.system.get("_storage", storageId)).toBeNull();

      // photoCount rollups (§2.8) — stats, never enforcement. Since TASK-24
      // the session/space rollups are SHARDED (convex/lib/countShards.ts):
      // the commit must NOT touch the session/space docs (that single-row
      // write serialized the whole night — docs/perf/memories-load.md) and
      // must instead land one +1 in the counter shards.
      const space = await ctx.db.get(spaceId);
      expect(space?.totalPhotos).toBe(0);
      const guest = await ctx.db.get(guestId);
      expect(guest?.photoCount).toBe(1);
      // Known convex-test gotcha: ids read back through t.run lose their
      // table brand, so ctx.db.get returns the all-tables union — cast.
      const session = (await ctx.db.get(photo!.sessionId)) as
        | Doc<"memoriesSessions">
        | null;
      expect(session?.photoCount).toBe(0);
      // (withIndex in t.run loses schema index types — filter instead.)
      const shards = await ctx.db.query("memoriesCountShards").collect();
      const sumFor = (key: string) =>
        shards
          .filter((row) => row.key === key)
          .reduce((total, row) => total + row.value, 0);
      expect(sumFor(`session:${photo!.sessionId}`)).toBe(1);
      expect(sumFor(`space:${spaceId}`)).toBe(1);
    });
  });

  test("a second commit for the same photoId creates no second asset row", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId, storageId } = await reserveAndUpload(t);
    await claim(t, photoId, storageId);
    const variants = await storeVariants(t);

    const first = await commit(t, photoId, storageId, variants);
    const second = await commit(t, photoId, storageId, variants);
    expect(second.alreadyReady).toBe(true);
    expect(second.mediaAssetId).toBe(first.mediaAssetId);

    const assetCount = await t.run(async (ctx) => {
      const assets = await ctx.db.query("mediaAssets").collect();
      return assets.length;
    });
    expect(assetCount).toBe(1);
  });

  test("a valid secret cannot commit a photo that was never claimed", async () => {
    const t = newT();
    await seedSpace(t);
    // Reserved, but uploadContext never ran — the state machine, not the
    // secret, is what admits a commit.
    const { photoId, storageId } = await reserveAndUpload(t);
    const variants = await storeVariants(t);
    await expect(commit(t, photoId, storageId, variants)).rejects.toThrow(
      PIPELINE_ERROR.wrongState,
    );
    expect((await getPhoto(t, photoId))?.status).toBe("reserved");
  });

  test("a valid secret cannot commit onto hidden or deleted photos", async () => {
    const t = newT();
    await seedSpace(t);
    const variants = await storeVariants(t);
    for (const status of ["hidden", "deleted"] as const) {
      const { photoId, storageId } = await reserveAndUpload(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(photoId, { status });
      });
      await expect(commit(t, photoId, storageId, variants)).rejects.toThrow(
        PIPELINE_ERROR.wrongState,
      );
    }
  });

  test("a superseded run cannot commit; the fresh claim can", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId, storageId: originalA } = await reserveAndUpload(t);
    await claim(t, photoId, originalA);

    // The client re-uploaded and re-claimed: originalB supersedes originalA,
    // and the superseded blob is deleted so nothing orphans.
    const originalB = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(96).fill(9)])),
    );
    await claim(t, photoId, originalB);
    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", originalA)).toBeNull();
    });

    const variants = await storeVariants(t);
    await expect(commit(t, photoId, originalA, variants)).rejects.toThrow(
      PIPELINE_ERROR.staleRun,
    );
    const result = await commit(t, photoId, originalB, variants);
    expect(result.alreadyReady).toBe(false);
  });

  test("rejects a variant ref that does not exist in storage", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId, storageId } = await reserveAndUpload(t);
    await claim(t, photoId, storageId);
    const variants = await storeVariants(t);
    await t.run(async (ctx) => ctx.storage.delete(variants.avif.ref));
    await expect(commit(t, photoId, storageId, variants)).rejects.toThrow(
      PIPELINE_ERROR.variantMissing,
    );
  });

  test("rejects nonsense variant dimensions", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId, storageId } = await reserveAndUpload(t);
    await claim(t, photoId, storageId);
    const variants = await storeVariants(t);
    variants.avif.width = 0;
    await expect(commit(t, photoId, storageId, variants)).rejects.toThrow(
      PIPELINE_ERROR.variantInvalid,
    );
  });
});

describe("the 24h reaper (STEP 4)", () => {
  test("a stale processing row and its orphan original are reaped; fresh rows survive", async () => {
    const t = newT();
    await seedSpace(t);

    // A crashed run: claimed 25h ago, never committed.
    const stale = await reserveAndUpload(t);
    await claim(t, stale.photoId, stale.storageId);
    // A live run claimed just now.
    const fresh = await reserveAndUpload(t);
    await claim(t, fresh.photoId, fresh.storageId);
    // A stale reservation that never uploaded (TASK-14 behaviour, unchanged).
    const abandoned = await t.mutation(api.memories.reserveUpload, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });

    await t.run(async (ctx) => {
      const past = Date.now() - DAY_MS - 60 * 60 * 1000;
      await ctx.db.patch(stale.photoId, { updatedAt: past });
      await ctx.db.patch(abandoned.photoId, { updatedAt: past });
    });

    const result = await t.mutation(
      internal.memories.purgeStaleReservations,
      {},
    );
    expect(result.purged).toBe(1);
    expect(result.purgedProcessing).toBe(1);

    await t.run(async (ctx) => {
      // The crashed run's doc AND its pinned original are gone — a crash
      // costs storage for one day, not forever.
      expect(await ctx.db.get(stale.photoId)).toBeNull();
      expect(await ctx.db.system.get("_storage", stale.storageId)).toBeNull();
      expect(await ctx.db.get(abandoned.photoId)).toBeNull();
      // The fresh run is untouched.
      const freshPhoto = await ctx.db.get(fresh.photoId);
      expect(freshPhoto?.status).toBe("processing");
      expect(
        await ctx.db.system.get("_storage", fresh.storageId),
      ).not.toBeNull();
    });
  });
});
