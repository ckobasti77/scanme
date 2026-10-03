/// <reference types="vite/client" />

// TASK-16 STEP 0 — the reservation retry/release contract, provable with
// convex-test: releaseReservation frees the slot immediately (the quota
// refunds because the quota is an index count of live rows), refuses another
// guest's row through the masked lookup, and refuses rows that left the
// `reserved` state (processing / committed); renewUploadUrl mints fresh
// upload URLs against an existing slot without consuming quota, answers
// `alreadyReady` for a committed row, and never crosses guests.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const SECRET = "test-pipeline-secret-0123456789abcdef";
const GUEST_KEY = "guest-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_GUEST_KEY = "guest-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SPACE_CODE = "ABCD2345";

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
  opts: { planKey?: "basic" | "standard" | "premium" } = {},
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Kod Šarana",
      slug: "kod-sarana",
      status: "active",
      createdAt: now,
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
    const otherGuestId = await ctx.db.insert("memoriesGuests", {
      spaceId,
      guestKey: OTHER_GUEST_KEY,
      photoCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    });
    return { businessId, spaceId, guestId, otherGuestId };
  });
}

function reserve(t: T, guestKey = GUEST_KEY) {
  return t.mutation(api.memories.reserveUpload, {
    code: SPACE_CODE,
    guestKey,
  });
}

function release(t: T, photoId: Id<"memoriesPhotos">, guestKey = GUEST_KEY) {
  return t.mutation(api.memories.releaseReservation, {
    code: SPACE_CODE,
    guestKey,
    photoId,
  });
}

function renew(t: T, photoId: Id<"memoriesPhotos">, guestKey = GUEST_KEY) {
  return t.mutation(api.memories.renewUploadUrl, {
    code: SPACE_CODE,
    guestKey,
    photoId,
  });
}

// Walk one photo through the real pipeline halves to `ready`: upload a fake
// original, claim it (reserved → processing), store fake variants, commit.
async function commitPhoto(t: T, photoId: Id<"memoriesPhotos">) {
  const storageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(64).fill(7)])),
  );
  await t.mutation(api.memoriesPipeline.uploadContext, {
    secret: SECRET,
    code: SPACE_CODE,
    guestKey: GUEST_KEY,
    photoId,
    storageId,
  });
  const variants = await t.run(async (ctx) => ({
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
  await t.mutation(api.memoriesPipeline.commitProcessed, {
    secret: SECRET,
    photoId,
    originalStorageId: storageId,
    variants,
  });
  return storageId;
}

describe("releaseReservation (STEP 0)", () => {
  test("frees the slot immediately: a quota-blocked guest can reserve again", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "basic" });
    const first = await reserve(t);
    for (let i = 0; i < 2; i += 1) await reserve(t);
    await expect(reserve(t)).rejects.toThrow("limit od 3");

    const result = await release(t, first.photoId);
    expect(result).toEqual({ released: true });
    // Hard-deleted, exactly as the 24h reaper would have done — not a
    // tombstone (there is no blob or asset to purge).
    expect(await t.run((ctx) => ctx.db.get(first.photoId))).toBeNull();

    const refunded = await reserve(t);
    expect(refunded.remaining).toBe(0);
  });

  test("cannot free another guest's slot — masked as not-found, slot intact", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "basic" });
    const mine = await reserve(t);

    await expect(release(t, mine.photoId, OTHER_GUEST_KEY)).rejects.toThrow(
      "nije pronađena",
    );
    // The row survived: the owner's slot is still consumed.
    const row = await t.run((ctx) => ctx.db.get(mine.photoId));
    expect(row?.status).toBe("reserved");
  });

  test("refuses a row that already committed, and a row mid-pipeline", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "basic" });

    // Committed (`ready`): the slot is legitimately used.
    const committed = await reserve(t);
    await commitPhoto(t, committed.photoId);
    await expect(release(t, committed.photoId)).rejects.toThrow(
      "ne može da se poništi",
    );
    expect(
      await t.run(async (ctx) => (await ctx.db.get(committed.photoId))?.status),
    ).toBe("ready");

    // Mid-pipeline (`processing`, original pinned): the reaper's protocol
    // owns it — release must not orphan or double-free the pinned blob.
    const processing = await reserve(t);
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(32).fill(1)])),
    );
    await t.mutation(api.memoriesPipeline.uploadContext, {
      secret: SECRET,
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId: processing.photoId,
      storageId,
    });
    await expect(release(t, processing.photoId)).rejects.toThrow(
      "ne može da se poništi",
    );
  });

  test("refuses a guest-deleted (tombstoned) row", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "basic" });
    const reservation = await reserve(t);
    await commitPhoto(t, reservation.photoId);
    await t.mutation(api.memories.deleteMyPhoto, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId: reservation.photoId,
    });
    await expect(release(t, reservation.photoId)).rejects.toThrow(
      "ne može da se poništi",
    );
  });
});

describe("renewUploadUrl (STEP 0)", () => {
  test("mints a fresh URL for the guest's own reserved row without consuming quota", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "basic" });
    // Use the whole quota so any hidden re-reservation would throw.
    const first = await reserve(t);
    for (let i = 0; i < 2; i += 1) await reserve(t);
    await expect(reserve(t)).rejects.toThrow("limit od 3");

    const renewed = await renew(t, first.photoId);
    expect(renewed.alreadyReady).toBe(false);
    if (!renewed.alreadyReady) {
      expect(renewed.uploadUrl).toMatch(/^https?:\/\//);
    }
    // Renewing changed nothing about the quota: still exactly at the limit.
    await expect(reserve(t)).rejects.toThrow("limit od 3");
  });

  test("renews a processing row (crashed pipeline run) — the retry path", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "basic" });
    const reservation = await reserve(t);
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(32).fill(1)])),
    );
    await t.mutation(api.memoriesPipeline.uploadContext, {
      secret: SECRET,
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId: reservation.photoId,
      storageId,
    });
    const renewed = await renew(t, reservation.photoId);
    expect(renewed.alreadyReady).toBe(false);
  });

  test("answers alreadyReady for a committed row instead of failing the retry", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "basic" });
    const reservation = await reserve(t);
    await commitPhoto(t, reservation.photoId);
    const renewed = await renew(t, reservation.photoId);
    expect(renewed).toEqual({ alreadyReady: true });
  });

  test("never crosses guests, and a tombstoned row reads as not-found", async () => {
    const t = newT();
    await seedSpace(t, { planKey: "basic" });
    const mine = await reserve(t);
    await expect(renew(t, mine.photoId, OTHER_GUEST_KEY)).rejects.toThrow(
      "nije pronađena",
    );

    await commitPhoto(t, mine.photoId);
    await t.mutation(api.memories.deleteMyPhoto, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId: mine.photoId,
    });
    await expect(renew(t, mine.photoId)).rejects.toThrow("nije pronađena");
  });
});

describe("reserveUpload returns the plan dimension (TASK-16)", () => {
  for (const [planKey, dimension] of [
    ["basic", 2048],
    ["standard", 2560],
    ["premium", 4096],
  ] as const) {
    test(`${planKey} → maxImageDimension ${dimension}`, async () => {
      const t = newT();
      await seedSpace(t, { planKey });
      const reservation = await reserve(t);
      expect(reservation.maxImageDimension).toBe(dimension);
    });
  }
});
