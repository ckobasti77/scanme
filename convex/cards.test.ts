/// <reference types="vite/client" />

// TASK-14 STEP 6 — the card layer, provable with convex-test: creation,
// immutable retargeting, per-kind resolution, requestId replay idempotency
// (the server-generated token records ONE cardScanEvents row), stat rollups,
// and guest minting on the memories branch.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";
const SPACE_CODE = "QRST7890";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof convexTest>;

async function seed(t: T) {
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
    const spaceId = await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code: SPACE_CODE,
      name: "Uspomene",
      mode: "recurring",
      status: "active",
      defaultVisibility: "everyone",
      guestVisibilityChoice: true,
      publicGalleryEnabled: false,
      wallEnabled: false,
      totalPhotos: 0,
      totalGuests: 0,
      createdAt: now,
      updatedAt: now,
    });
    const otherBusinessId = await ctx.db.insert("businesses", {
      name: "Tuđi Lokal",
      slug: "tudji-lokal",
      status: "active",
      createdAt: now,
    });
    return { adminId, businessId, spaceId, otherBusinessId };
  });
}

function asAdmin(t: T, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

function resolve(t: T, cardCode: string, requestId: string) {
  return t.mutation(api.cards.resolveAndRecord, {
    cardCode,
    requestId,
    deviceCategory: "mobile" as const,
    ipHash: "test-ip-hash",
  });
}

test("createCard mints a code and the memories target resolves to a fresh guest", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 4",
      target: { kind: "memories_space", spaceId },
    },
  );
  expect(cardCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);

  const outcome = await resolve(t, cardCode, "req-1");
  expect(outcome.kind).toBe("memories_space");
  if (outcome.kind !== "memories_space") throw new Error("unreachable");
  expect(outcome.code).toBe(SPACE_CODE);
  expect(outcome.guestKey).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // The guest row exists, keyed by the minted capability, attributed to the
  // TABLE (cardId) — quota per person, statistics per card.
  const guest = await t.run((ctx) =>
    ctx.db
      .query("memoriesGuests")
      .withIndex("by_spaceId_and_guestKey", (q) =>
        q.eq("spaceId", spaceId).eq("guestKey", outcome.guestKey!),
      )
      .unique(),
  );
  expect(guest?.cardId).toBe(cardId);
});

test("the same server requestId records one cardScanEvents row, not two", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 1",
      target: { kind: "memories_space", spaceId },
    },
  );

  await resolve(t, cardCode, "req-same");
  await resolve(t, cardCode, "req-same");

  const state = await t.run(async (ctx) => {
    const events = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
      .collect();
    const card = await ctx.db.get(cardId);
    const dailies = await ctx.db
      .query("dailyCardMetrics")
      .withIndex("by_cardId_and_dateKey", (q) => q.eq("cardId", cardId))
      .collect();
    return { events, card, dailies };
  });
  expect(state.events).toHaveLength(1);
  expect(state.card?.totalScans).toBe(1);
  expect(state.dailies).toHaveLength(1);
  expect(state.dailies[0].scans).toBe(1);

  // A fresh requestId counts again.
  await resolve(t, cardCode, "req-other");
  const after = await t.run((ctx) => ctx.db.get(cardId));
  expect(after?.totalScans).toBe(2);
});

test("unknown, disabled and target-less cards resolve to invalid", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);

  expect((await resolve(t, "ZZZZZZZ2", "req-a")).kind).toBe("invalid");
  expect((await resolve(t, "not-a-code", "req-b")).kind).toBe("invalid");

  const bare = await asAdmin(t, adminId).mutation(api.cards.createCard, {
    businessId,
    label: "Bez odredišta",
  });
  expect((await resolve(t, bare.cardCode, "req-c")).kind).toBe("invalid");

  await t.run((ctx) => ctx.db.patch(bare.cardId, { status: "disabled" }));
  expect((await resolve(t, bare.cardCode, "req-d")).kind).toBe("invalid");
});

test("retargeting appends an immutable target row and re-points resolution", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const admin = asAdmin(t, adminId);
  const { cardId, cardCode } = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Sto 2",
    target: { kind: "memories_space", spaceId },
  });
  expect((await resolve(t, cardCode, "req-1")).kind).toBe("memories_space");

  await admin.mutation(api.cards.retargetCard, {
    cardId,
    target: { kind: "url", url: "https://scanme.rs/" },
  });
  const outcome = await resolve(t, cardCode, "req-2");
  expect(outcome).toMatchObject({ kind: "url", url: "https://scanme.rs/" });

  // The old target row survives as the audit trail; currentTargetId moved.
  const state = await t.run(async (ctx) => {
    const targets = await ctx.db
      .query("cardTargets")
      .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
      .collect();
    const card = await ctx.db.get(cardId);
    return { targets, card };
  });
  expect(state.targets).toHaveLength(2);
  expect(state.card?.currentTargetId).toBe(
    state.targets.find((target) => target.kind === "url")?._id,
  );
});

test("venue and event targets resolve to clean business URLs", async () => {
  const t = newT();
  const { adminId, businessId } = await seed(t);
  const eventId = await t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("events", {
      businessId,
      slug: "otvaranje",
      title: "Otvaranje",
      status: "live",
      lifecycleRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
  const admin = asAdmin(t, adminId);
  const venueCard = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Ulaz",
    target: { kind: "venue" },
  });
  expect(await resolve(t, venueCard.cardCode, "req-v")).toEqual({
    kind: "venue",
    businessSlug: "kod-sarana",
  });
  const eventCard = await admin.mutation(api.cards.createCard, {
    businessId,
    label: "Plakat",
    target: { kind: "event", eventId },
  });
  expect(await resolve(t, eventCard.cardCode, "req-e")).toEqual({
    kind: "event",
    businessSlug: "kod-sarana",
    eventSlug: "otvaranje",
  });
});

test("cross-business targets and unsafe URLs are rejected at write time", async () => {
  const t = newT();
  const { adminId, otherBusinessId, spaceId } = await seed(t);
  const admin = asAdmin(t, adminId);
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId: otherBusinessId,
      label: "Pogrešan lokal",
      target: { kind: "memories_space", spaceId },
    }),
  ).rejects.toThrow("ne pripada");
  await expect(
    admin.mutation(api.cards.createCard, {
      businessId: otherBusinessId,
      label: "Nesiguran link",
      target: { kind: "url", url: "http://insecure.example.com/" },
    }),
  ).rejects.toThrow("https");
});

test("bot scans are recorded as events but never counted", async () => {
  const t = newT();
  const { adminId, businessId, spaceId } = await seed(t);
  const { cardCode, cardId } = await asAdmin(t, adminId).mutation(
    api.cards.createCard,
    {
      businessId,
      label: "Sto 9",
      target: { kind: "memories_space", spaceId },
    },
  );
  await t.mutation(api.cards.resolveAndRecord, {
    cardCode,
    requestId: "req-bot",
    deviceCategory: "bot",
    ipHash: "bot-hash",
  });
  const state = await t.run(async (ctx) => {
    const events = await ctx.db
      .query("cardScanEvents")
      .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
      .collect();
    const card = await ctx.db.get(cardId);
    return { events, card };
  });
  expect(state.events).toHaveLength(1);
  expect(state.events[0].deviceCategory).toBe("bot");
  expect(state.card?.totalScans).toBe(0);
});
