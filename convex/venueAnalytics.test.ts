/// <reference types="vite/client" />

// TASK-43 — event analytics: aggregate ingest (page views + block views) and
// the Premium-gated owner read. Nothing personal is ever stored — the tests
// assert the rollup shape carries only counts.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { Infer } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { venueBlockValidator } from "./lib/venueValidators";
import { defaults, type VenueBlock } from "../lib/venue-blocks";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

type ArgBlock = Infer<typeof venueBlockValidator>;
const asArgBlocks = (blocks: VenueBlock[]) => blocks as unknown as ArgBlock[];

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Klub Barok",
      slug: "klub-barok",
      status: "active",
      createdAt: now,
    });
    const venueProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: "klub-barok-venue",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const entitlementId = await ctx.db.insert("entitlements", {
      businessId,
      product: "scanme_venue",
      planKey: "premium",
      status: "active",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    return { adminId, businessId, venueProfileId, entitlementId };
  });
}

function admin(t: T, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

async function publishEvent(
  t: T,
  adminId: Id<"users">,
  venueProfileId: Id<"serviceProfiles">,
  slug: string,
) {
  const as = admin(t, adminId);
  const { eventId } = await as.mutation(api.venue.createEvent, {
    venueProfileId,
    slug,
    title: `Naslov ${slug}`,
  });
  const countdown = defaults("countdown");
  countdown.base.id = "c1";
  await as.mutation(api.venue.saveDraft, {
    eventId,
    blocks: asArgBlocks([countdown]),
  });
  const config = await t.run((ctx) =>
    ctx.db
      .query("venueEventConfigs")
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .unique(),
  );
  await as.mutation(api.venue.publishDraft, {
    eventId,
    expectedDraftRevision: config!.draftRevision,
  });
  return { eventId };
}

const SLUGS = { businessSlug: "klub-barok", eventSlug: "svirka" };

describe("aggregate ingest", () => {
  test("recordView bumps the daily rollup; unpublished events are ignored", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    const { eventId } = await publishEvent(t, adminId, venueProfileId, "svirka");

    expect(await t.mutation(api.venueAnalytics.recordView, SLUGS)).toEqual({
      ok: true,
    });
    await t.mutation(api.venueAnalytics.recordView, SLUGS);
    const row = await t.run((ctx) =>
      ctx.db
        .query("dailyEventMetrics")
        .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", eventId))
        .unique(),
    );
    expect(row?.pageViews).toBe(2);
    // The rollup carries counts only — nothing about any visitor.
    expect(Object.keys(row!)).toEqual(
      expect.arrayContaining([
        "eventId",
        "dateKey",
        "pageViews",
        "reservationSubmits",
      ]),
    );

    // A never-published event never rolls up.
    const as = admin(t, adminId);
    await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "nacrt",
      title: "Nacrt",
    });
    expect(
      await t.mutation(api.venueAnalytics.recordView, {
        businessSlug: "klub-barok",
        eventSlug: "nacrt",
      }),
    ).toEqual({ ok: false });
  });

  test("recordBlockViews dedupes to known types and accumulates", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    const { eventId } = await publishEvent(t, adminId, venueProfileId, "svirka");

    await t.mutation(api.venueAnalytics.recordBlockViews, {
      ...SLUGS,
      blockTypes: ["countdown", "gallery", "countdown", "nepoznat-tip"],
    });
    await t.mutation(api.venueAnalytics.recordBlockViews, {
      ...SLUGS,
      blockTypes: ["countdown"],
    });
    const row = await t.run((ctx) =>
      ctx.db
        .query("dailyEventMetrics")
        .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", eventId))
        .unique(),
    );
    expect(row?.blockViews).toEqual({ countdown: 2, gallery: 1 });

    // Junk-only payloads never write.
    expect(
      await t.mutation(api.venueAnalytics.recordBlockViews, {
        ...SLUGS,
        blockTypes: ["x", "y"],
      }),
    ).toEqual({ ok: false });
  });
});

describe("the owner read (Premium-gated)", () => {
  test("basic is locked server-side; premium sees totals, blocks, reservations", async () => {
    const t = newT();
    const { adminId, entitlementId, venueProfileId } = await seed(t);
    const { eventId } = await publishEvent(t, adminId, venueProfileId, "svirka");
    const as = admin(t, adminId);

    await t.mutation(api.venueAnalytics.recordView, SLUGS);
    await t.mutation(api.venueAnalytics.recordBlockViews, {
      ...SLUGS,
      blockTypes: ["countdown"],
    });

    // Basic: the data never leaves the server.
    await t.run((ctx) => ctx.db.patch(entitlementId, { planKey: "basic" }));
    expect(
      await as.query(api.venueAnalytics.eventMetrics, { eventId }),
    ).toMatchObject({ status: "locked", planKey: "basic" });

    // Premium: totals + series + block breakdown + reservation summary.
    await t.run((ctx) => ctx.db.patch(entitlementId, { planKey: "premium" }));
    const metrics = await as.query(api.venueAnalytics.eventMetrics, {
      eventId,
      range: "7d",
    });
    expect(metrics.status).toBe("available");
    if (metrics.status === "available") {
      expect(metrics.totals.pageViews).toBe(1);
      expect(metrics.daily).toHaveLength(7);
      expect(metrics.blockViews).toEqual([
        { blockType: "countdown", views: 1 },
      ]);
      expect(metrics.reservations).toEqual({
        pending: 0,
        confirmed: 0,
        declined: 0,
        expired: 0,
      });
    }
  });

  test("the read requires editor access", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    const { eventId } = await publishEvent(t, adminId, venueProfileId, "svirka");
    await expect(
      t.query(api.venueAnalytics.eventMetrics, { eventId }),
    ).rejects.toThrow();
  });
});
