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
      needsConsent: true,
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
      needsConsent: true,
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

const FIRST_PAGE = { numItems: 50, cursor: null };

describe("publicGalleryMeta + publicGalleryPage", () => {
  test("meta is null unless the host opted the space in", async () => {
    const t = newT();
    await seedSpace(t, { publicGalleryEnabled: false });
    const { photoId } = await reserve(t);
    await commitPhoto(t, photoId);
    expect(
      await t.query(api.memories.publicGalleryMeta, { code: SPACE_CODE }),
    ).toBeNull();
    // The data path also refuses to serve photos for an un-opted space.
    const page = await t.query(api.memories.publicGalleryPage, {
      code: SPACE_CODE,
      paginationOpts: FIRST_PAGE,
    });
    expect(page.page).toEqual([]);
    expect(page.isDone).toBe(true);
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

    const meta = await t.query(api.memories.publicGalleryMeta, {
      code: SPACE_CODE,
    });
    expect(meta).not.toBeNull();
    const page = await t.query(api.memories.publicGalleryPage, {
      code: SPACE_CODE,
      paginationOpts: FIRST_PAGE,
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0].photoId).toBe(shown);
  });

  // STEP 0 regression: more `everyone` photos than one page fit returns EVERY
  // one across pages (no silent truncation), and a `host_only`-heavy newest
  // tail never crowds them out (visibility resolved by index, not post-cap).
  test("paginates every everyone photo across pages, never a host_only one", async () => {
    const t = newT();
    const { spaceId, guestId } = await seedSpace(t, {
      publicGalleryEnabled: true,
    });

    // Seed directly for volume: one session, 25 everyone + 10 host_only ready
    // photos each with a real stored asset. The host_only photos are committed
    // LAST (newest), so the old .take(N)-then-filter shape with a small page
    // would have surfaced the host_only tail and hidden everyone photos behind
    // it. With visibility in the index, the cursor walks only public rows.
    const { sessionId, everyone } = await t.run(async (ctx) => {
      const now = Date.now();
      const sessionId = await ctx.db.insert("memoriesSessions", {
        spaceId,
        dateKey: "2026-08-26",
        status: "open",
        openedAt: now,
        photoCount: 0,
        guestCount: 0,
        updatedAt: now,
      });
      const space = await ctx.db.get(spaceId);
      const mkAsset = async () => {
        const v = async (bytes: number) => ({
          ref: await ctx.storage.store(new Blob([new Uint8Array(bytes).fill(3)])),
          width: 80,
          height: 60,
          bytes,
        });
        return ctx.db.insert("mediaAssets", {
          businessId: space!.businessId,
          kind: "image" as const,
          provider: "convex" as const,
          variants: { avif: await v(11), webp: await v(22), thumb: await v(7) },
          status: "ready" as const,
          createdAt: now,
        });
      };
      const everyone: string[] = [];
      for (let i = 0; i < 25; i += 1) {
        const mediaAssetId = await mkAsset();
        const id = await ctx.db.insert("memoriesPhotos", {
          spaceId,
          sessionId,
          guestId,
          mediaAssetId,
          visibility: "everyone" as const,
          status: "ready" as const,
          createdAt: now + i,
          updatedAt: now + i,
        });
        everyone.push(id);
      }
      // host_only photos committed LAST → the newest rows.
      for (let i = 0; i < 10; i += 1) {
        const mediaAssetId = await mkAsset();
        await ctx.db.insert("memoriesPhotos", {
          spaceId,
          sessionId,
          guestId,
          mediaAssetId,
          visibility: "host_only" as const,
          status: "ready" as const,
          createdAt: now + 100 + i,
          updatedAt: now + 100 + i,
        });
      }
      return { sessionId, everyone };
    });
    void sessionId;

    // Walk every page with a page size (10) smaller than the everyone count.
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const res: {
        page: Array<{ photoId: string }>;
        isDone: boolean;
        continueCursor: string;
      } = await t.query(api.memories.publicGalleryPage, {
        code: SPACE_CODE,
        paginationOpts: { numItems: 10, cursor },
      });
      for (const item of res.page) seen.add(item.photoId);
      if (res.isDone) break;
      cursor = res.continueCursor;
    }

    // Every everyone photo surfaced across pages; not one host_only leaked.
    expect(seen.size).toBe(25);
    for (const id of everyone) expect(seen.has(id)).toBe(true);
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
