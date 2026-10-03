/// <reference types="vite/client" />

// TASK-22 — the live wall's server guarantees, proven not by looking at a screen
// but by asserting the QUERY. The worst failure this product can have is a
// host_only photo on a projector in a full room; these tests make that, and
// every other non-public photo reaching the wall, impossible by construction.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof convexTest>;

// A granted, active recurring space (wall off by default), an admin identity to
// drive host mutations, a guest to hang photos off, and an open session.
async function seedWallSpace(t: T) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: Date.now(),
    }),
  );
  const businessId = await t.run((ctx) =>
    ctx.db.insert("businesses", {
      name: "Kafana Kod Šarana",
      slug: "kod-sarana",
      status: "active",
      createdAt: Date.now(),
    }),
  );
  const as = t.withIdentity({ subject: adminId, issuer: ISSUER });
  const grant = await as.mutation(api.memoriesAdmin.grantMemories, {
    businessId,
    planKey: "basic",
  });
  const { sessionId, guestId } = await t.run(async (ctx) => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("memoriesSessions", {
      spaceId: grant.spaceId,
      dateKey: "2026-08-27",
      status: "open",
      openedAt: now,
      photoCount: 0,
      guestCount: 0,
      updatedAt: now,
    });
    const guestId = await ctx.db.insert("memoriesGuests", {
      spaceId: grant.spaceId,
      guestKey: "guest-key-wall-aaaaaaaaaaaaaaaaaaaaaaaa",
      photoCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    });
    return { sessionId, guestId };
  });
  return {
    as,
    businessId,
    spaceId: grant.spaceId,
    code: grant.code,
    sessionId,
    guestId,
  };
}

// Insert a photo row with a real stored asset (so photoImage hydrates) in an
// arbitrary status/visibility/approval state — the levers the wall must filter.
async function insertPhoto(
  t: T,
  opts: {
    spaceId: Id<"memoriesSpaces">;
    sessionId: Id<"memoriesSessions">;
    guestId: Id<"memoriesGuests">;
    businessId: Id<"businesses">;
    visibility: "everyone" | "host_only";
    status: "reserved" | "processing" | "ready" | "hidden" | "deleted";
    wallApproved?: boolean;
    at: number;
  },
) {
  return t.run(async (ctx) => {
    const variant = async (bytes: number) => ({
      ref: await ctx.storage.store(new Blob([new Uint8Array(bytes).fill(9)])),
      width: 120,
      height: 90,
      bytes,
    });
    const mediaAssetId =
      opts.status === "reserved" || opts.status === "processing"
        ? undefined
        : await ctx.db.insert("mediaAssets", {
            businessId: opts.businessId,
            kind: "image" as const,
            provider: "convex" as const,
            variants: {
              avif: await variant(11),
              webp: await variant(22),
              thumb: await variant(7),
            },
            status: "ready" as const,
            createdAt: opts.at,
          });
    return ctx.db.insert("memoriesPhotos", {
      spaceId: opts.spaceId,
      sessionId: opts.sessionId,
      guestId: opts.guestId,
      mediaAssetId,
      visibility: opts.visibility,
      status: opts.status,
      ...(opts.wallApproved !== undefined
        ? { wallApproved: opts.wallApproved }
        : {}),
      createdAt: opts.at,
      updatedAt: opts.at,
    });
  });
}

describe("wallView — the 404 gate", () => {
  test("null (→ 404) until the host enables the wall, non-null after", async () => {
    const t = newT();
    const { as, spaceId, code } = await seedWallSpace(t);
    expect(await t.query(api.memoriesWall.wallView, { code })).toBeNull();

    await as.mutation(api.memoriesHost.setSpaceVisibility, {
      spaceId,
      wallEnabled: true,
    });
    const view = await t.query(api.memoriesWall.wallView, { code });
    expect(view).not.toBeNull();
    expect(view!.joinCode).toBe(code);
    expect(view!.requiresApproval).toBe(false);
  });

  test("an archived space 404s even with the wall enabled", async () => {
    const t = newT();
    const { as, spaceId, code } = await seedWallSpace(t);
    await as.mutation(api.memoriesHost.setSpaceVisibility, {
      spaceId,
      wallEnabled: true,
    });
    await t.run((ctx) => ctx.db.patch(spaceId, { status: "archived" }));
    expect(await t.query(api.memoriesWall.wallView, { code })).toBeNull();
  });
});

describe("wallFeed — the worst failure is impossible", () => {
  test("shows ONLY ready + everyone; never host_only, hidden, or unprocessed", async () => {
    const t = newT();
    const { as, spaceId, sessionId, guestId, businessId, code } =
      await seedWallSpace(t);
    await as.mutation(api.memoriesHost.setSpaceVisibility, {
      spaceId,
      wallEnabled: true,
    });

    const common = { spaceId, sessionId, guestId, businessId };
    const shownA = await insertPhoto(t, {
      ...common,
      visibility: "everyone",
      status: "ready",
      at: 1000,
    });
    const shownB = await insertPhoto(t, {
      ...common,
      visibility: "everyone",
      status: "ready",
      at: 1001,
    });
    // Every one of these must be invisible to the wall:
    await insertPhoto(t, {
      ...common,
      visibility: "host_only",
      status: "ready",
      at: 2000,
    }); // the worst failure
    await insertPhoto(t, {
      ...common,
      visibility: "everyone",
      status: "hidden",
      at: 2001,
    }); // moderated
    await insertPhoto(t, {
      ...common,
      visibility: "everyone",
      status: "reserved",
      at: 2002,
    });
    await insertPhoto(t, {
      ...common,
      visibility: "everyone",
      status: "processing",
      at: 2003,
    });
    await insertPhoto(t, {
      ...common,
      visibility: "everyone",
      status: "deleted",
      at: 2004,
    });

    const feed = await t.query(api.memoriesWall.wallFeed, { code });
    const ids = feed.photos.map((p) => p.photoId);
    expect(new Set(ids)).toEqual(new Set([shownA, shownB]));
    // newest-first, and every row carries a hydrated image.
    expect(feed.photos[0].photoId).toBe(shownB);
    for (const p of feed.photos) {
      expect(p.image.webpUrl).toMatch(/^https?:/);
      expect(p.image.avifUrl).toMatch(/^https?:/);
    }
  });

  test("a disabled wall serves an empty feed even with ready public photos", async () => {
    const t = newT();
    const { spaceId, sessionId, guestId, businessId, code } =
      await seedWallSpace(t);
    // wall NOT enabled
    await insertPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
      visibility: "everyone",
      status: "ready",
      at: 1000,
    });
    const feed = await t.query(api.memoriesWall.wallFeed, { code });
    expect(feed.photos).toEqual([]);
  });
});

describe("approve-before-wall", () => {
  test("holds every everyone/ready photo until the host approves it", async () => {
    const t = newT();
    const { as, spaceId, sessionId, guestId, businessId, code } =
      await seedWallSpace(t);
    await as.mutation(api.memoriesHost.setSpaceVisibility, {
      spaceId,
      wallEnabled: true,
      wallRequiresApproval: true,
    });

    const photoId = await insertPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
      visibility: "everyone",
      status: "ready",
      at: 1000,
    });
    // Not approved yet → the wall holds it back.
    let feed = await t.query(api.memoriesWall.wallFeed, { code });
    expect(feed.photos).toEqual([]);

    await as.mutation(api.memoriesWall.setPhotoWallApproval, {
      photoId,
      approved: true,
    });
    feed = await t.query(api.memoriesWall.wallFeed, { code });
    expect(feed.photos.map((p) => p.photoId)).toEqual([photoId]);

    // And the host can take it back off the wall.
    await as.mutation(api.memoriesWall.setPhotoWallApproval, {
      photoId,
      approved: false,
    });
    feed = await t.query(api.memoriesWall.wallFeed, { code });
    expect(feed.photos).toEqual([]);
  });

  test("approval never lets a host_only photo onto the wall", async () => {
    const t = newT();
    const { as, spaceId, sessionId, guestId, businessId } =
      await seedWallSpace(t);
    const hostOnly = await insertPhoto(t, {
      spaceId,
      sessionId,
      guestId,
      businessId,
      visibility: "host_only",
      status: "ready",
      at: 1000,
    });
    // Even the host cannot approve a host_only photo for the wall.
    await expect(
      as.mutation(api.memoriesWall.setPhotoWallApproval, {
        photoId: hostOnly,
        approved: true,
      }),
    ).rejects.toThrow();
  });
});
