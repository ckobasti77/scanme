/// <reference types="vite/client" />

// TASK-17 — the guest screens' read models and per-photo mutations:
// guestSpaceView's state/quota arithmetic (identical to reserveUpload's),
// myPhotosView returning only committed rows with signed URLs, the gallery's
// double gate (host opt-in AND per-photo visibility, filtered server-side),
// setMyPhotoVisibility's guards, and the consent stamp reserveUpload records
// in the same transaction as the slot.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { CONSENT_VERSION } from "../lib/i18n/sr/consent";

const modules = import.meta.glob("./**/*.ts");

const GUEST_KEY = "guest-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_GUEST_KEY = "guest-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SPACE_CODE = "ABCD2345";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
});

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof convexTest>;

async function seedSpace(
  t: T,
  opts: {
    entitled?: boolean;
    guestVisibilityChoice?: boolean;
    publicGalleryEnabled?: boolean;
  } = {},
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
    if (opts.entitled !== false) {
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_memories",
        planKey: "basic",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    }
    const spaceId = await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code: SPACE_CODE,
      name: "Uspomene",
      mode: "recurring",
      status: "active",
      nightCutoffHour: 6,
      defaultVisibility: "everyone",
      guestVisibilityChoice: opts.guestVisibilityChoice ?? true,
      publicGalleryEnabled: opts.publicGalleryEnabled ?? false,
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

function reserve(t: T) {
  return t.mutation(api.memories.reserveUpload, {
    code: SPACE_CODE,
    guestKey: GUEST_KEY,
  });
}

// Stand-in for the pipeline commit: attach a ready mediaAssets row with real
// stored blobs and bump the session rollup, exactly the fields the views read.
async function commitPhoto(t: T, photoId: Id<"memoriesPhotos">) {
  return t.run(async (ctx) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) throw new Error("photo missing");
    const space = await ctx.db.get(photo.spaceId);
    if (!space) throw new Error("space missing");
    const variant = async (bytes: number) => ({
      ref: await ctx.storage.store(
        new Blob([new Uint8Array(bytes).fill(7)]),
      ),
      width: 120,
      height: 90,
      bytes,
    });
    const now = Date.now();
    const mediaAssetId = await ctx.db.insert("mediaAssets", {
      businessId: space.businessId,
      kind: "image",
      provider: "convex",
      variants: {
        avif: await variant(1111),
        webp: await variant(2222),
        thumb: await variant(333),
      },
      status: "ready",
      createdAt: now,
    });
    await ctx.db.patch(photo._id, {
      status: "ready",
      mediaAssetId,
      updatedAt: now,
    });
    const session = await ctx.db.get(photo.sessionId);
    if (session) {
      await ctx.db.patch(session._id, {
        photoCount: session.photoCount + 1,
        updatedAt: now,
      });
    }
    return mediaAssetId;
  });
}

describe("guestSpaceView", () => {
  test("unknown code resolves to null", async () => {
    const t = newT();
    await seedSpace(t);
    expect(
      await t.query(api.memories.guestSpaceView, { code: "ZZZZ9999" }),
    ).toBeNull();
  });

  test("fresh guest sees the full basic quota and plan retention", async () => {
    const t = newT();
    await seedSpace(t);
    const view = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(view).not.toBeNull();
    expect(view!.entitled).toBe(true);
    expect(view!.retentionDays).toBe(30);
    expect(view!.status).toBe("active");
    expect(view!.session).toBeNull();
    expect(view!.guest).toEqual({
      limit: 3,
      remaining: 3,
      consentVersion: null,
    });
  });

  test("a reservation spends a visible slot and a release returns it", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId } = await reserve(t);
    let view = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(view!.guest!.remaining).toBe(2);

    await t.mutation(api.memories.releaseReservation, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId,
    });
    view = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(view!.guest!.remaining).toBe(3);
  });

  test("an unknown guestKey renders the space, not an error", async () => {
    const t = newT();
    await seedSpace(t);
    const view = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
      guestKey: OTHER_GUEST_KEY,
    });
    expect(view).not.toBeNull();
    expect(view!.guest).toBeNull();
  });

  test("no active entitlement reads as not entitled with a zero limit", async () => {
    const t = newT();
    await seedSpace(t, { entitled: false });
    const view = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(view!.entitled).toBe(false);
    expect(view!.retentionDays).toBeNull();
    expect(view!.guest).toEqual({
      limit: 0,
      remaining: 0,
      consentVersion: null,
    });
  });

  test("a paused space reports its materialized status", async () => {
    const t = newT();
    const { spaceId } = await seedSpace(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(spaceId, { status: "paused" });
    });
    const view = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
    });
    expect(view!.status).toBe("paused");
  });

  test("the social-proof count is the committed rollup, not reservations", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId } = await reserve(t);
    let view = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
    });
    // Reserved slot exists, session open, but nothing committed yet.
    expect(view!.session!.status).toBe("open");
    expect(view!.session!.photoCount).toBe(0);

    await commitPhoto(t, photoId);
    view = await t.query(api.memories.guestSpaceView, { code: SPACE_CODE });
    expect(view!.session!.photoCount).toBe(1);
  });
});

describe("myPhotosView", () => {
  test("returns only committed rows, with all three signed variant URLs", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId: pending } = await reserve(t);
    const { photoId: committed } = await reserve(t);
    await commitPhoto(t, committed);

    const photos = await t.query(api.memories.myPhotosView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(photos).toHaveLength(1);
    expect(photos[0].photoId).toBe(committed);
    expect(photos[0].image.thumbUrl).toMatch(/^https?:/);
    expect(photos[0].image.avifUrl).toMatch(/^https?:/);
    expect(photos[0].image.webpUrl).toMatch(/^https?:/);
    expect(photos[0].image.width).toBe(120);
    expect(
      photos.some((photo) => photo.photoId === pending),
    ).toBe(false);
  });

  test("a wrong guestKey yields an empty list, never another guest's rows", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId } = await reserve(t);
    await commitPhoto(t, photoId);
    expect(
      await t.query(api.memories.myPhotosView, {
        code: SPACE_CODE,
        guestKey: OTHER_GUEST_KEY,
      }),
    ).toEqual([]);
  });
});

describe("publicGalleryView", () => {
  test("null unless the host opted the space in", async () => {
    const t = newT();
    await seedSpace(t, { publicGalleryEnabled: false });
    const { photoId } = await reserve(t);
    await commitPhoto(t, photoId);
    expect(
      await t.query(api.memories.publicGalleryView, { code: SPACE_CODE }),
    ).toBeNull();
  });

  test("serves only ready photos everyone may see — host_only never leaves", async () => {
    const t = newT();
    await seedSpace(t, { publicGalleryEnabled: true });
    const { photoId: shown } = await reserve(t);
    await commitPhoto(t, shown);
    const { photoId: hidden } = await reserve(t);
    await commitPhoto(t, hidden);
    await t.mutation(api.memories.setMyPhotoVisibility, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId: hidden,
      visibility: "host_only",
    });
    const { photoId: pending } = await reserve(t);
    void pending;

    const gallery = await t.query(api.memories.publicGalleryView, {
      code: SPACE_CODE,
    });
    expect(gallery).not.toBeNull();
    expect(gallery!.photos).toHaveLength(1);
    expect(gallery!.photos[0].photoId).toBe(shown);
  });
});

describe("setMyPhotoVisibility", () => {
  test("the owner flips visibility on a committed photo", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId } = await reserve(t);
    await commitPhoto(t, photoId);
    await t.mutation(api.memories.setMyPhotoVisibility, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId,
      visibility: "host_only",
    });
    const photos = await t.query(api.memories.myPhotosView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(photos[0].visibility).toBe("host_only");
  });

  test("refused when the space does not offer the choice", async () => {
    const t = newT();
    await seedSpace(t, { guestVisibilityChoice: false });
    const { photoId } = await reserve(t);
    await expect(
      t.mutation(api.memories.setMyPhotoVisibility, {
        code: SPACE_CODE,
        guestKey: GUEST_KEY,
        photoId,
        visibility: "host_only",
      }),
    ).rejects.toThrow(/vidljivosti nije dostupan/);
  });

  test("another guest's key is masked as photo-not-found", async () => {
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
    const { photoId } = await reserve(t);
    await expect(
      t.mutation(api.memories.setMyPhotoVisibility, {
        code: SPACE_CODE,
        guestKey: OTHER_GUEST_KEY,
        photoId,
        visibility: "host_only",
      }),
    ).rejects.toThrow(/nije pronađena/);
  });

  test("a deleted photo is gone for visibility purposes too", async () => {
    const t = newT();
    await seedSpace(t);
    const { photoId } = await reserve(t);
    await commitPhoto(t, photoId);
    await t.mutation(api.memories.deleteMyPhoto, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
      photoId,
    });
    await expect(
      t.mutation(api.memories.setMyPhotoVisibility, {
        code: SPACE_CODE,
        guestKey: GUEST_KEY,
        photoId,
        visibility: "host_only",
      }),
    ).rejects.toThrow(/nije pronađena/);
  });
});

describe("consent stamping", () => {
  test("the first reservation stamps the current version, once", async () => {
    const t = newT();
    const { guestId } = await seedSpace(t);
    await reserve(t);
    const first = await t.run(async (ctx) => ctx.db.get(guestId));
    expect(first!.consentVersion).toBe(CONSENT_VERSION);
    expect(first!.consentAt).toBeTypeOf("number");

    await reserve(t);
    const second = await t.run(async (ctx) => ctx.db.get(guestId));
    expect(second!.consentVersion).toBe(CONSENT_VERSION);
    expect(second!.consentAt).toBe(first!.consentAt);

    // The view echoes the stamped version so the UI could re-prompt on a bump.
    const view = await t.query(api.memories.guestSpaceView, {
      code: SPACE_CODE,
      guestKey: GUEST_KEY,
    });
    expect(view!.guest!.consentVersion).toBe(CONSENT_VERSION);
  });
});
