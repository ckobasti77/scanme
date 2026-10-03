/// <reference types="vite/client" />

// TASK-14 STEP 6 — the Memories identity/quota layer, provable with
// convex-test: the (limit+1)th rejection at every tier, concurrency never
// exceeding the limit, additive grants admitting exactly extraPhotos more,
// delete-refunds, key isolation, the upload window, session lifecycles, the
// cutoff-shifted night key, and the cron sweeps.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { sessionDateKey } from "./memories";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";
const GUEST_KEY = "guest-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_GUEST_KEY = "guest-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SPACE_CODE = "ABCD2345";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

afterEach(() => {
  vi.useRealTimers();
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
    planKey?: "basic" | "standard" | "premium";
    mode?: "recurring" | "one_off";
    windowStartAt?: number;
    windowEndAt?: number;
    entitled?: boolean;
  } = {},
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
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
        planKey: opts.planKey ?? "basic",
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
      mode: opts.mode ?? "recurring",
      status: "active",
      windowStartAt: opts.windowStartAt,
      windowEndAt: opts.windowEndAt,
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
    return { adminId, businessId, spaceId, guestId };
  });
}

function reserve(t: T, guestKey = GUEST_KEY) {
  return t.mutation(api.memories.reserveUpload, {
    code: SPACE_CODE,
    guestKey,
  });
}

// `.filter` instead of `.withIndex` on purpose: inside a helper typed with the
// generic `T`, `t.run`'s ctx loses the schema's index types (known convex-test
// gotcha; same pattern as venue.test.ts helpers).
async function livePhotoCount(t: T, guestId: Id<"memoriesGuests">) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("memoriesPhotos")
      .filter((q) => q.eq(q.field("guestId"), guestId))
      .collect();
    return rows.filter((row) => row.status !== "deleted").length;
  });
}

describe("quota tiers", () => {
  for (const [planKey, limit] of [
    ["basic", 3],
    ["standard", 5],
    ["premium", 10],
  ] as const) {
    test(`the (limit+1)th reservation is rejected at ${planKey} (${limit})`, async () => {
      const t = newT();
      const { guestId } = await seedSpace(t, { planKey });
      for (let i = 0; i < limit; i += 1) {
        const result = await reserve(t);
        expect(result.limit).toBe(limit);
        expect(result.remaining).toBe(limit - i - 1);
      }
      await expect(reserve(t)).rejects.toThrow(`limit od ${limit}`);
      expect(await livePhotoCount(t, guestId)).toBe(limit);
    });
  }
});

test("concurrent reservations never exceed the limit", async () => {
  const t = newT();
  const { guestId } = await seedSpace(t, { planKey: "basic" });
  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, () => reserve(t)),
  );
  const fulfilled = attempts.filter((a) => a.status === "fulfilled").length;
  expect(fulfilled).toBe(3);
  // The property that matters: the count-and-insert share one serializable
  // transaction, so the table can never hold more live rows than the limit.
  expect(await livePhotoCount(t, guestId)).toBe(3);
});

test("a quotaAdjustments grant admits exactly extraPhotos more", async () => {
  const t = newT();
  const { adminId, spaceId, guestId } = await seedSpace(t, { planKey: "basic" });
  for (let i = 0; i < 3; i += 1) await reserve(t);
  await expect(reserve(t)).rejects.toThrow("limit od 3");

  const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });
  await asAdmin.mutation(api.memories.grantQuota, {
    spaceId,
    guestId,
    extraPhotos: 2,
    reason: "Slavljenica",
  });
  await reserve(t);
  const last = await reserve(t);
  expect(last.limit).toBe(5);
  expect(last.remaining).toBe(0);
  await expect(reserve(t)).rejects.toThrow("limit od 5");
  expect(await livePhotoCount(t, guestId)).toBe(5);
});

test("deleting a photo refunds a slot", async () => {
  const t = newT();
  const { guestId } = await seedSpace(t, { planKey: "basic" });
  const first = await reserve(t);
  for (let i = 0; i < 2; i += 1) await reserve(t);
  await expect(reserve(t)).rejects.toThrow("limit od 3");

  await t.mutation(api.memories.deleteMyPhoto, {
    code: SPACE_CODE,
    guestKey: GUEST_KEY,
    photoId: first.photoId,
  });
  const refunded = await reserve(t);
  expect(refunded.remaining).toBe(0);
  expect(await livePhotoCount(t, guestId)).toBe(3);
});

test("a grant scoped to another guest does not raise this guest's limit", async () => {
  const t = newT();
  const { adminId, spaceId } = await seedSpace(t, { planKey: "basic" });
  const otherGuestId = await t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("memoriesGuests", {
      spaceId,
      guestKey: OTHER_GUEST_KEY,
      photoCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    });
  });
  const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });
  await asAdmin.mutation(api.memories.grantQuota, {
    spaceId,
    guestId: otherGuestId,
    extraPhotos: 5,
  });
  for (let i = 0; i < 3; i += 1) await reserve(t);
  await expect(reserve(t)).rejects.toThrow("limit od 3");
});

test("a wrong guestKey yields an empty result, never another guest's data", async () => {
  const t = newT();
  await seedSpace(t, { planKey: "basic" });
  await reserve(t);

  const wrongKey = await t.query(api.memories.myPhotos, {
    code: SPACE_CODE,
    guestKey: "not-the-real-key-000000000000000000000",
  });
  expect(wrongKey).toEqual([]);

  const rightKey = await t.query(api.memories.myPhotos, {
    code: SPACE_CODE,
    guestKey: GUEST_KEY,
  });
  expect(rightKey).toHaveLength(1);

  // A wrong key cannot reserve either — and the refusal names no other guest.
  await expect(reserve(t, "another-unknown-key-000000000000000")).rejects.toThrow(
    "pristup nije prepoznat",
  );
});

test("a guest cannot delete another guest's photo", async () => {
  const t = newT();
  const { spaceId } = await seedSpace(t, { planKey: "basic" });
  const mine = await reserve(t);
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
  await expect(
    t.mutation(api.memories.deleteMyPhoto, {
      code: SPACE_CODE,
      guestKey: OTHER_GUEST_KEY,
      photoId: mine.photoId,
    }),
  ).rejects.toThrow("nije pronađena");
});

describe("upload window (one_off)", () => {
  test("reservation before the window opens is rejected", async () => {
    const t = newT();
    const now = Date.now();
    await seedSpace(t, {
      mode: "one_off",
      windowStartAt: now + 60 * 60 * 1000,
      windowEndAt: now + 5 * 60 * 60 * 1000,
    });
    await expect(reserve(t)).rejects.toThrow("još nije počelo");
  });

  test("reservation after the window closes is rejected", async () => {
    const t = newT();
    const now = Date.now();
    await seedSpace(t, {
      mode: "one_off",
      windowStartAt: now - 5 * 60 * 60 * 1000,
      windowEndAt: now - 60 * 60 * 1000,
    });
    await expect(reserve(t)).rejects.toThrow("je isteklo");
  });

  test("inside the window: activation creates the single session, then reservations flow", async () => {
    const t = newT();
    const now = Date.now();
    const { spaceId } = await seedSpace(t, {
      mode: "one_off",
      windowStartAt: now - 60 * 60 * 1000,
      windowEndAt: now + 5 * 60 * 60 * 1000,
    });
    // Before activation there is no session — rejected.
    await expect(reserve(t)).rejects.toThrow("nema otvorene sesije");

    const opened = await t.mutation(internal.memories.openOneOffSession, {
      spaceId,
    });
    expect(opened.created).toBe(true);
    // Idempotent: a second activation returns the same session.
    const reopened = await t.mutation(internal.memories.openOneOffSession, {
      spaceId,
    });
    expect(reopened).toEqual({ sessionId: opened.sessionId, created: false });

    const result = await reserve(t);
    expect(result.remaining).toBe(2);
  });

  test("a closed session is rejected", async () => {
    const t = newT();
    const now = Date.now();
    const { spaceId } = await seedSpace(t, {
      mode: "one_off",
      windowStartAt: now - 60 * 60 * 1000,
      windowEndAt: now + 5 * 60 * 60 * 1000,
    });
    const { sessionId } = await t.mutation(
      internal.memories.openOneOffSession,
      { spaceId },
    );
    await t.mutation(internal.memories.closeSession, { sessionId });
    await expect(reserve(t)).rejects.toThrow("zatvorena");
  });
});

describe("recurring nights", () => {
  test("a 01:00 reservation lands in the previous night's dateKey", async () => {
    // 2026-08-25T23:30Z = 01:30 on Aug 26 in Belgrade (CEST, UTC+2). With the
    // 06:00 cutoff, that photo belongs to the night of Aug 25. Fake only Date
    // so convex-test's own async machinery keeps real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-25T23:30:00Z"));
    expect(sessionDateKey(Date.now(), 6)).toBe("2026-08-25");

    const t = newT();
    await seedSpace(t, { planKey: "basic" });
    const result = await reserve(t);
    const session = await t.run((ctx) =>
      ctx.db
        .query("memoriesSessions")
        .withIndex("by_status_and_openedAt", (q) => q.eq("status", "open"))
        .unique(),
    );
    expect(session?.dateKey).toBe("2026-08-25");
    const photo = await t.run((ctx) => ctx.db.get(result.photoId));
    expect(photo?.sessionId).toBe(session?._id);
  });

  test("the first reservation of the night creates ONE open session; a closed night rejects", async () => {
    const t = newT();
    const { spaceId } = await seedSpace(t, { planKey: "basic" });
    await reserve(t);
    await reserve(t);
    const sessions = await t.run((ctx) =>
      ctx.db
        .query("memoriesSessions")
        .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", spaceId))
        .collect(),
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("open");
    expect(sessions[0].scheduledCloseId).toBeDefined();

    await t.mutation(internal.memories.closeSession, {
      sessionId: sessions[0]._id,
    });
    await expect(reserve(t)).rejects.toThrow("zatvorena");
  });
});

describe("gates", () => {
  test("a paused space rejects reservations", async () => {
    const t = newT();
    const { spaceId } = await seedSpace(t, { planKey: "basic" });
    await t.run((ctx) => ctx.db.patch(spaceId, { status: "paused" }));
    await expect(reserve(t)).rejects.toThrow("ne prima fotografije");
  });

  test("a space with no active entitlement rejects reservations", async () => {
    const t = newT();
    await seedSpace(t, { entitled: false });
    await expect(reserve(t)).rejects.toThrow("nije aktiviran");
  });

  test("a space-scoped entitlement wins over the business-scoped one", async () => {
    const t = newT();
    const { businessId, spaceId } = await seedSpace(t, { planKey: "basic" });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_memories",
        planKey: "premium",
        spaceId,
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    });
    const result = await reserve(t);
    expect(result.limit).toBe(10);
  });

  test("grantQuota validates scope and amount", async () => {
    const t = newT();
    const { adminId, spaceId } = await seedSpace(t, { planKey: "basic" });
    const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });
    await expect(
      asAdmin.mutation(api.memories.grantQuota, {
        spaceId,
        extraPhotos: 0,
      }),
    ).rejects.toThrow("ceo broj");
    await expect(
      asAdmin.mutation(api.memories.grantQuota, {
        spaceId,
        extraPhotos: 2.5,
      }),
    ).rejects.toThrow("ceo broj");
  });
});

describe("cron sweeps", () => {
  test("sweepStaleSessions closes rolled-over recurring nights and expired one_off windows", async () => {
    const t = newT();
    const now = Date.now();
    const { spaceId } = await seedSpace(t, { planKey: "basic" });
    // Tonight's real session (stays open) + a stale night (closes).
    await reserve(t);
    const staleId = await t.run((ctx) =>
      ctx.db.insert("memoriesSessions", {
        spaceId,
        dateKey: "2020-01-01",
        status: "open",
        openedAt: now - 48 * 60 * 60 * 1000,
        photoCount: 0,
        guestCount: 0,
        updatedAt: now - 48 * 60 * 60 * 1000,
      }),
    );
    const result = await t.mutation(internal.memories.sweepStaleSessions, {});
    expect(result.closed).toBe(1);
    const stale = await t.run((ctx) => ctx.db.get(staleId));
    expect(stale?.status).toBe("closed");
    const open = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("memoriesSessions")
          .withIndex("by_status_and_openedAt", (q) => q.eq("status", "open"))
          .collect()
      ).length,
    );
    expect(open).toBe(1);
  });

  test("purgeStaleReservations deletes only stale reserved rows", async () => {
    const t = newT();
    const { spaceId, guestId } = await seedSpace(t, { planKey: "basic" });
    const fresh = await reserve(t);
    const staleId = await t.run(async (ctx) => {
      const session = await ctx.db
        .query("memoriesSessions")
        .withIndex("by_spaceId_and_dateKey", (q) => q.eq("spaceId", spaceId))
        .first();
      const old = Date.now() - 25 * 60 * 60 * 1000;
      return ctx.db.insert("memoriesPhotos", {
        spaceId,
        sessionId: session!._id,
        guestId,
        visibility: "everyone",
        status: "reserved",
        createdAt: old,
        updatedAt: old,
      });
    });
    const result = await t.mutation(
      internal.memories.purgeStaleReservations,
      {},
    );
    expect(result.purged).toBe(1);
    expect(await t.run((ctx) => ctx.db.get(staleId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(fresh.photoId))).not.toBeNull();
  });
});
