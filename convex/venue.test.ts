/// <reference types="vite/client" />

// TASK-08 Step 5 — the Venue backend, provable with convex-test (no browser):
// the full lifecycle walk and its guards, the draft/publish OCC contract, the
// entitlement gate, the reserved-slug rule, and published-only public reads.

import { convexTest } from "convex-test";
import type { Infer } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

// The pure block model brands storage ids as `string`; the validator brands
// them `Id<"_storage">`. The blocks built below set no storage ids, so the shape
// is identical at runtime; the cast bridges the compile-time brand.
type ArgBlock = Infer<typeof venueBlockValidator>;
const asArgBlocks = (blocks: VenueBlock[]) => blocks as unknown as ArgBlock[];

function block(type: VenueBlock["type"], id: string): VenueBlock {
  const b = defaults(type);
  return { ...b, base: { ...b.base, id, visible: true } } as VenueBlock;
}

async function seed(t: ReturnType<typeof convexTest>) {
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
    // Premium by default (TASK-43): the block catalog under test spans the
    // full set; plan-gate tests downgrade or delete this row explicitly.
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

function admin(t: ReturnType<typeof convexTest>, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

async function getEvent(t: ReturnType<typeof convexTest>, eventId: Id<"events">) {
  return t.run((ctx) => ctx.db.get(eventId));
}

async function getConfig(
  t: ReturnType<typeof convexTest>,
  eventId: Id<"events">,
) {
  return t.run((ctx) =>
    ctx.db
      .query("venueEventConfigs")
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .unique(),
  );
}

// Create → save one block → publish, returning the published draftRevision.
async function createSavePublish(
  t: ReturnType<typeof convexTest>,
  adminId: Id<"users">,
  venueProfileId: Id<"serviceProfiles">,
  slug: string,
  displayName: string,
) {
  const as = admin(t, adminId);
  const { eventId } = await as.mutation(api.venue.createEvent, {
    venueProfileId,
    slug,
    title: `Naslov ${slug}`,
  });
  await as.mutation(api.venue.saveDraft, {
    eventId,
    displayName,
    blocks: asArgBlocks([block("countdown", "c1")]),
  });
  const config = await getConfig(t, eventId);
  await as.mutation(api.venue.publishDraft, {
    eventId,
    expectedDraftRevision: config!.draftRevision,
  });
  return { eventId };
}

describe("lifecycle state machine (RFC-001 §2.2)", () => {
  test("full walk draft → scheduled → live → ended → archived", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();

    const { eventId } = await createSavePublish(
      t,
      adminId,
      venueProfileId,
      "nova-godina",
      "Objavljeno ime",
    );
    expect((await getEvent(t, eventId))?.status).toBe("draft");

    const { lifecycleRevision } = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 60 * 60 * 1000,
      endsAt: now + 2 * 60 * 60 * 1000,
    });
    expect((await getEvent(t, eventId))?.status).toBe("scheduled");

    await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: lifecycleRevision,
    });
    expect((await getEvent(t, eventId))?.status).toBe("live");

    await t.mutation(internal.venue.endEvent, {
      eventId,
      expectedRevision: lifecycleRevision,
    });
    expect((await getEvent(t, eventId))?.status).toBe("ended");

    // Archive with one media asset, then read it back through archivedEvents.
    const mediaAssetId = await t.run(async (ctx) => {
      const ref = await ctx.storage.store(
        new Blob(["webp"], { type: "image/webp" }),
      );
      const thumbRef = await ctx.storage.store(
        new Blob(["thumb"], { type: "image/webp" }),
      );
      return ctx.db.insert("mediaAssets", {
        businessId,
        kind: "image",
        provider: "convex",
        variants: {
          avif: { ref, width: 1200, height: 800, bytes: 100 },
          webp: { ref, width: 1200, height: 800, bytes: 100 },
          thumb: { ref: thumbRef, width: 300, height: 200, bytes: 20 },
        },
        status: "ready",
        createdAt: Date.now(),
      });
    });

    const archived = await as.mutation(api.venue.archiveEvent, {
      eventId,
      mediaAssetIds: [mediaAssetId],
    });
    expect(archived.itemCount).toBe(1);
    expect((await getEvent(t, eventId))?.status).toBe("archived");

    const list = await t.query(api.venue.archivedEvents, {
      businessSlug: "klub-barok",
    });
    expect(list).toHaveLength(1);
    expect(list[0].slug).toBe("nova-godina");
    expect(list[0].items).toHaveLength(1);
    expect(list[0].items[0].fullUrl).toBeTruthy();
    expect(list[0].items[0].thumbUrl).toBeTruthy();
  });

  // TASK-25 Step 0 item 3: archiveEvent enforces the same cap as the
  // host-curated pin path — an over-cap event would break every bounded
  // archive reader (currentItems reads cap + 1) and wedge reordering.
  test("archiveEvent refuses to push an event past ARCHIVE_MAX_ITEMS", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();
    const { eventId } = await createSavePublish(
      t,
      adminId,
      venueProfileId,
      "puna-arhiva",
      "Puna arhiva",
    );
    const { lifecycleRevision } = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 60 * 60 * 1000,
      endsAt: now + 2 * 60 * 60 * 1000,
    });
    await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: lifecycleRevision,
    });
    await t.mutation(internal.venue.endEvent, {
      eventId,
      expectedRevision: lifecycleRevision,
    });

    const makeAsset = () =>
      t.run(async (ctx) => {
        const ref = await ctx.storage.store(
          new Blob(["webp"], { type: "image/webp" }),
        );
        return ctx.db.insert("mediaAssets", {
          businessId,
          kind: "image",
          provider: "convex",
          variants: {
            avif: { ref, width: 1200, height: 800, bytes: 100 },
            webp: { ref, width: 1200, height: 800, bytes: 100 },
            thumb: { ref, width: 300, height: 200, bytes: 20 },
          },
          status: "ready",
          createdAt: Date.now(),
        });
      });

    // Fill the event to the cap with pre-existing (host-pinned) rows.
    const pinnedAssetId = await makeAsset();
    await t.run(async (ctx) => {
      const { ARCHIVE_MAX_ITEMS } = await import("../lib/venue-blocks");
      for (let i = 0; i < ARCHIVE_MAX_ITEMS; i += 1) {
        await ctx.db.insert("eventArchiveItems", {
          eventId,
          mediaAssetId: pinnedAssetId,
          order: i,
          createdAt: Date.now(),
        });
      }
    });

    // A fresh asset over the cap is a hard error, never a silent truncation.
    const freshAssetId = await makeAsset();
    await expect(
      as.mutation(api.venue.archiveEvent, {
        eventId,
        mediaAssetIds: [freshAssetId],
      }),
    ).rejects.toThrow(/Najviše/);

    // Re-archiving an already-pinned asset is a silent skip, not a new row.
    const archived = await as.mutation(api.venue.archiveEvent, {
      eventId,
      mediaAssetIds: [pinnedAssetId],
    });
    const { ARCHIVE_MAX_ITEMS } = await import("../lib/venue-blocks");
    expect(archived.itemCount).toBe(ARCHIVE_MAX_ITEMS);
  });

  test("a stale lifecycleRevision goLive no-ops; the current one flips", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();
    const { eventId } = await createSavePublish(
      t,
      adminId,
      venueProfileId,
      "koncert",
      "Koncert",
    );

    const first = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 60 * 60 * 1000,
      endsAt: now + 2 * 60 * 60 * 1000,
    });
    const second = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 3 * 60 * 60 * 1000,
      endsAt: now + 4 * 60 * 60 * 1000,
    });
    expect(second.lifecycleRevision).toBe(first.lifecycleRevision + 1);

    // The stale revision (the one from the first schedule) must not flip.
    const stale = await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: first.lifecycleRevision,
    });
    expect(stale.changed).toBe(false);
    expect(stale.reason).toBe("revision");
    expect((await getEvent(t, eventId))?.status).toBe("scheduled");

    // The current revision flips it.
    const fresh = await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: second.lifecycleRevision,
    });
    expect(fresh.changed).toBe(true);
    expect((await getEvent(t, eventId))?.status).toBe("live");
  });

  test("goLive rejects a second live event for the same business", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();

    const a = await createSavePublish(t, adminId, venueProfileId, "dogadjaj-a", "A");
    const b = await createSavePublish(t, adminId, venueProfileId, "dogadjaj-b", "B");

    // Non-overlapping windows so both schedule cleanly.
    const schedA = await as.mutation(api.venue.scheduleEvent, {
      eventId: a.eventId,
      startsAt: now + 1 * 60 * 60 * 1000,
      endsAt: now + 2 * 60 * 60 * 1000,
    });
    const schedB = await as.mutation(api.venue.scheduleEvent, {
      eventId: b.eventId,
      startsAt: now + 3 * 60 * 60 * 1000,
      endsAt: now + 4 * 60 * 60 * 1000,
    });

    await t.mutation(internal.venue.goLive, {
      eventId: a.eventId,
      expectedRevision: schedA.lifecycleRevision,
    });
    expect((await getEvent(t, a.eventId))?.status).toBe("live");

    await expect(
      t.mutation(internal.venue.goLive, {
        eventId: b.eventId,
        expectedRevision: schedB.lifecycleRevision,
      }),
    ).rejects.toThrow(/aktivan događaj/);
    expect((await getEvent(t, b.eventId))?.status).toBe("scheduled");
  });

  test("rescheduling cancels the previous scheduled functions and schedules new ones", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();
    const { eventId } = await createSavePublish(
      t,
      adminId,
      venueProfileId,
      "svirka",
      "Svirka",
    );

    await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 60 * 60 * 1000,
      endsAt: now + 2 * 60 * 60 * 1000,
    });
    const firstEvent = await getEvent(t, eventId);
    const oldGoLive = firstEvent!.scheduledGoLiveId!;
    const oldEnd = firstEvent!.scheduledEndId!;

    await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 3 * 60 * 60 * 1000,
      endsAt: now + 4 * 60 * 60 * 1000,
    });
    const secondEvent = await getEvent(t, eventId);
    const newGoLive = secondEvent!.scheduledGoLiveId!;
    const newEnd = secondEvent!.scheduledEndId!;

    expect(newGoLive).not.toBe(oldGoLive);
    expect(newEnd).not.toBe(oldEnd);

    // The previous scheduled functions are canceled; the new ones are pending.
    const states = await t.run(async (ctx) => ({
      oldGoLive: await ctx.db.system.get("_scheduled_functions", oldGoLive),
      oldEnd: await ctx.db.system.get("_scheduled_functions", oldEnd),
      newGoLive: await ctx.db.system.get("_scheduled_functions", newGoLive),
      newEnd: await ctx.db.system.get("_scheduled_functions", newEnd),
    }));
    expect(states.oldGoLive?.state.kind).toBe("canceled");
    expect(states.oldEnd?.state.kind).toBe("canceled");
    expect(states.newGoLive?.state.kind).toBe("pending");
    expect(states.newEnd?.state.kind).toBe("pending");
  });
});

describe("endEventNow (TASK-13 — the owner's manual end)", () => {
  test("ends a live event immediately and cancels the pending scheduled end", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();
    const { eventId } = await createSavePublish(
      t,
      adminId,
      venueProfileId,
      "petak-uzivo",
      "Petak",
    );
    const { lifecycleRevision } = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 3_600_000,
      endsAt: now + 7_200_000,
    });
    await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: lifecycleRevision,
    });
    expect((await getEvent(t, eventId))?.status).toBe("live");
    const scheduledEndId = (await getEvent(t, eventId))!.scheduledEndId!;

    const result = await as.mutation(api.venue.endEventNow, { eventId });
    expect(result.ended).toBe(true);
    expect((await getEvent(t, eventId))?.status).toBe("ended");

    // The now-moot scheduled end is cancelled so it cannot re-fire later.
    const endState = await t.run((ctx) =>
      ctx.db.system.get("_scheduled_functions", scheduledEndId),
    );
    expect(endState?.state.kind).toBe("canceled");
  });

  test("refuses when the event is not live", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const { eventId } = await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "samo-nacrt",
      title: "Samo nacrt",
    });
    await expect(
      as.mutation(api.venue.endEventNow, { eventId }),
    ).rejects.toThrow(/nije uživo/i);
  });
});

describe("draft/publish contract (RFC-001 §1.d, §2.4)", () => {
  test("publishDraft throws on a mismatched expectedDraftRevision", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const { eventId } = await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "matine",
      title: "Matine",
    });
    await as.mutation(api.venue.saveDraft, {
      eventId,
      displayName: "Matine",
      blocks: asArgBlocks([block("richText", "r1")]),
    });

    await expect(
      as.mutation(api.venue.publishDraft, {
        eventId,
        expectedDraftRevision: 999,
      }),
    ).rejects.toThrow(/izmenjen/);
  });

  test("saveDraft clamps a 40-block payload down to 30 and clamps numerics", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const { eventId } = await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "festival",
      title: "Festival",
    });

    // block[0]: a gallery with out-of-range columns/gap. block[1..39]: spacers
    // with an out-of-range height. 40 blocks total.
    const gallery = block("gallery", "g0");
    if (gallery.type === "gallery") {
      gallery.props.columns = 99; // clamp → 4
      gallery.props.gap = 999; // clamp → 64
    }
    const blocks: VenueBlock[] = [gallery];
    for (let i = 1; i < 40; i += 1) {
      const spacer = block("spacer", `s${i}`);
      if (spacer.type === "spacer") spacer.props.height = 9999; // clamp → 400
      blocks.push(spacer);
    }

    await as.mutation(api.venue.saveDraft, {
      eventId,
      blocks: asArgBlocks(blocks),
    });

    const config = await getConfig(t, eventId);
    const stored = config!.draftBlocks!;
    expect(stored).toHaveLength(30);
    const first = stored[0];
    expect(first.type).toBe("gallery");
    if (first.type === "gallery") {
      expect(first.props.columns).toBe(4);
      expect(first.props.gap).toBe(64);
    }
    const second = stored[1];
    expect(second.type).toBe("spacer");
    if (second.type === "spacer") {
      expect(second.props.height).toBe(400);
    }
  });
});

describe("access + entitlement gate (RFC-001 §2.9, TASK-43 tiers)", () => {
  test("an override allow-list wins over the plan tier", async () => {
    const t = convexTest(schema, modules);
    const { adminId, entitlementId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);

    // Restrict the seeded entitlement to countdown only via overrides.
    await t.run(async (ctx) => {
      await ctx.db.patch(entitlementId, {
        overrides: { allowedBlockKeys: ["countdown"] },
      });
    });

    const { eventId } = await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "gala",
      title: "Gala",
    });

    // A countdown block is allowed.
    await as.mutation(api.venue.saveDraft, {
      eventId,
      blocks: asArgBlocks([block("countdown", "c1")]),
    });

    // A gallery block is outside the allow-list.
    await expect(
      as.mutation(api.venue.saveDraft, {
        eventId,
        blocks: asArgBlocks([block("gallery", "g1")]),
      }),
    ).rejects.toThrow(/Premium/);
  });

  test("no entitlement resolves the FREE basic set — core allowed, premium blocks refused", async () => {
    const t = convexTest(schema, modules);
    const { adminId, entitlementId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    // Delete the seeded premium row: the gate must fall back to Basic,
    // never to "everything" (TASK-43 — Premium is otherwise unsellable).
    await t.run(async (ctx) => {
      await ctx.db.delete(entitlementId);
    });
    const { eventId } = await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "bazar",
      title: "Bazar",
    });
    await expect(
      as.mutation(api.venue.saveDraft, {
        eventId,
        blocks: asArgBlocks([
          block("countdown", "c1"),
          block("map", "m0"),
          block("share", "s1"),
        ]),
      }),
    ).resolves.toBeDefined();
    for (const premiumType of [
      "gallery",
      "priceList",
      "reservation",
      "profileCards",
      "pastEvents",
    ] as const) {
      await expect(
        as.mutation(api.venue.saveDraft, {
          eventId,
          blocks: asArgBlocks([block(premiumType, `x-${premiumType}`)]),
        }),
      ).rejects.toThrow(/Premium/);
    }
  });

  test("Basic caps active events at one; Premium schedules ahead freely", async () => {
    const t = convexTest(schema, modules);
    const { adminId, entitlementId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();
    const hour = 3_600_000;

    const first = await createSavePublish(t, adminId, venueProfileId, "petak", "A");
    const second = await createSavePublish(t, adminId, venueProfileId, "subota", "B");

    await as.mutation(api.venue.scheduleEvent, {
      eventId: first.eventId,
      startsAt: now + hour,
      endsAt: now + 2 * hour,
    });

    // Basic: one active event is the ceiling — a second schedule is refused,
    // in the same transaction as the write.
    await t.run(async (ctx) => {
      await ctx.db.patch(entitlementId, { planKey: "basic" });
    });
    await expect(
      as.mutation(api.venue.scheduleEvent, {
        eventId: second.eventId,
        startsAt: now + 3 * hour,
        endsAt: now + 4 * hour,
      }),
    ).rejects.toThrow(/najviše/);
    // RESCHEDULING the one scheduled event never counts itself.
    await as.mutation(api.venue.scheduleEvent, {
      eventId: first.eventId,
      startsAt: now + hour,
      endsAt: now + 3 * hour,
    });

    // Premium: unlimited scheduled ahead — the same second schedule passes.
    await t.run(async (ctx) => {
      await ctx.db.patch(entitlementId, { planKey: "premium" });
    });
    await as.mutation(api.venue.scheduleEvent, {
      eventId: second.eventId,
      startsAt: now + 4 * hour,
      endsAt: now + 5 * hour,
    });
  });

  test("the public view filters premium blocks after a downgrade", async () => {
    const t = convexTest(schema, modules);
    const { adminId, entitlementId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);

    const { eventId } = await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "smotra",
      title: "Smotra",
    });
    await as.mutation(api.venue.saveDraft, {
      eventId,
      blocks: asArgBlocks([block("countdown", "c1"), block("gallery", "g1")]),
    });
    const config = await getConfig(t, eventId);
    await as.mutation(api.venue.publishDraft, {
      eventId,
      expectedDraftRevision: config!.draftRevision,
    });

    let view = await t.query(api.venue.publicEventView, {
      businessSlug: "klub-barok",
      eventSlug: "smotra",
    });
    expect(view!.blocks.map((b) => b.type)).toEqual(["countdown", "gallery"]);

    // The plan lapses to basic: the published gallery bytes stop leaving the
    // server — no republish involved (TASK-43 read-time gate).
    await t.run(async (ctx) => {
      await ctx.db.patch(entitlementId, { planKey: "basic" });
    });
    view = await t.query(api.venue.publicEventView, {
      businessSlug: "klub-barok",
      eventSlug: "smotra",
    });
    expect(view!.blocks.map((b) => b.type)).toEqual(["countdown"]);
  });

  test("an event slugged 'arhiva' is rejected", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    await expect(
      as.mutation(api.venue.createEvent, {
        venueProfileId,
        slug: "arhiva",
        title: "Arhiva",
      }),
    ).rejects.toThrow(/rezervisana/);
  });
});

describe("public queries read published state only (RFC-001 §2.7)", () => {
  test("publicVenueView returns published data and never draft data", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();

    const { eventId } = await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "nocna-mora",
      title: "Noćna mora",
    });
    // Publish: displayName "Objavljeno" with a single block.
    await as.mutation(api.venue.saveDraft, {
      eventId,
      displayName: "Objavljeno",
      blocks: asArgBlocks([block("countdown", "c1")]),
    });
    let config = await getConfig(t, eventId);
    await as.mutation(api.venue.publishDraft, {
      eventId,
      expectedDraftRevision: config!.draftRevision,
    });

    // Diverge the draft: new displayName and two blocks, NOT published.
    await as.mutation(api.venue.saveDraft, {
      eventId,
      displayName: "Nacrt (ne sme se videti)",
      blocks: asArgBlocks([block("countdown", "c1"), block("spacer", "s1")]),
    });

    // Make it the live event.
    const sched = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 60 * 60 * 1000,
      endsAt: now + 2 * 60 * 60 * 1000,
    });
    await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: sched.lifecycleRevision,
    });

    const view = await t.query(api.venue.publicVenueView, {
      businessSlug: "klub-barok",
    });
    expect(view).not.toBeNull();
    expect(view!.displayName).toBe("Objavljeno");
    expect(view!.displayName).not.toBe("Nacrt (ne sme se videti)");
    // Published had exactly one block; the (unpublished) draft has two.
    expect(view!.blocks).toHaveLength(1);
    expect(view!.event.status).toBe("live");

    config = await getConfig(t, eventId);
    expect(config!.hasUnpublishedChanges).toBe(true); // draft is dirty…
    // …but the public view is unaffected by that dirty draft.
  });

  test("publicVenueView returns null when there is no live event", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    await createSavePublish(t, adminId, venueProfileId, "prazno", "Prazno");
    const view = await t.query(api.venue.publicVenueView, {
      businessSlug: "klub-barok",
    });
    expect(view).toBeNull();
  });

  test("publicEventView returns a specific published event; draft-only ⇒ null", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const { eventId } = await createSavePublish(
      t,
      adminId,
      venueProfileId,
      "leto",
      "Leto",
    );
    const published = await t.query(api.venue.publicEventView, {
      businessSlug: "klub-barok",
      eventSlug: "leto",
    });
    expect(published?.displayName).toBe("Leto");

    // A never-published event exposes nothing.
    await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "zima",
      title: "Zima",
    });
    void eventId;
    const draftOnly = await t.query(api.venue.publicEventView, {
      businessSlug: "klub-barok",
      eventSlug: "zima",
    });
    expect(draftOnly).toBeNull();
  });
});

describe("reconcile cron (RFC-001 §2.2)", () => {
  test("flips overdue scheduled→live and live→ended it swept", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();
    const { eventId } = await createSavePublish(
      t,
      adminId,
      venueProfileId,
      "reconcile-me",
      "Reconcile",
    );
    await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 60 * 60 * 1000,
      endsAt: now + 2 * 60 * 60 * 1000,
    });
    // Force the stored times into the past so the sweep considers them overdue.
    await t.run((ctx) =>
      ctx.db.patch(eventId, {
        startsAt: now - 2 * 60 * 60 * 1000,
        endsAt: now - 60 * 60 * 1000,
      }),
    );

    const first = await t.mutation(internal.venue.reconcileEventLifecycle, {});
    expect(first.wentLive).toBe(1);
    expect((await getEvent(t, eventId))?.status).toBe("live");

    const second = await t.mutation(internal.venue.reconcileEventLifecycle, {});
    expect(second.ended).toBe(1);
    expect((await getEvent(t, eventId))?.status).toBe("ended");
  });
});

// -----------------------------------------------------------------------------
// TASK-09 — publicVenuePageState, the lifecycle read the routes hang off.
// (The reservation surface moved to convex/venueReservations.test.ts in
// TASK-43, together with the zone/hold workflow it now carries.)
// -----------------------------------------------------------------------------

describe("publicVenuePageState (TASK-09 lifecycle read)", () => {
  test("null for a missing business or a business without a Venue profile", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect(
      await t.query(api.venue.publicVenuePageState, {
        businessSlug: "ne-postoji",
      }),
    ).toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.insert("businesses", {
        name: "Bez Venue",
        slug: "bez-venue",
        status: "active",
        createdAt: Date.now(),
      });
    });
    expect(
      await t.query(api.venue.publicVenuePageState, {
        businessSlug: "bez-venue",
      }),
    ).toBeNull();
  });

  test("walks before → live → after with the same event", async () => {
    const t = convexTest(schema, modules);
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const now = Date.now();

    // No events at all → the empty "before" state, never null.
    let state = await t.query(api.venue.publicVenuePageState, {
      businessSlug: "klub-barok",
    });
    expect(state).not.toBeNull();
    expect(state!.state.kind).toBe("before");
    if (state!.state.kind === "before") {
      expect(state!.state.view).toBeNull();
    }

    const { eventId } = await createSavePublish(
      t,
      adminId,
      venueProfileId,
      "sezona",
      "Objavljeno",
    );
    const { lifecycleRevision } = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 3_600_000,
      endsAt: now + 7_200_000,
    });

    state = await t.query(api.venue.publicVenuePageState, {
      businessSlug: "klub-barok",
    });
    expect(state!.state.kind).toBe("before");
    if (state!.state.kind === "before") {
      expect(state!.state.view?.event.slug).toBe("sezona");
    }

    await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: lifecycleRevision,
    });
    state = await t.query(api.venue.publicVenuePageState, {
      businessSlug: "klub-barok",
    });
    expect(state!.state.kind).toBe("live");

    await t.mutation(internal.venue.endEvent, {
      eventId,
      expectedRevision: lifecycleRevision,
    });
    state = await t.query(api.venue.publicVenuePageState, {
      businessSlug: "klub-barok",
    });
    expect(state!.state.kind).toBe("after");
    if (state!.state.kind === "after") {
      expect(state!.state.lastEvent?.slug).toBe("sezona");
    }
  });

  test("an inactive profile renders the inactive state, never 404", async () => {
    const t = convexTest(schema, modules);
    const { venueProfileId } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(venueProfileId, { status: "inactive" });
    });
    const state = await t.query(api.venue.publicVenuePageState, {
      businessSlug: "klub-barok",
    });
    expect(state).not.toBeNull();
    expect(state!.state.kind).toBe("inactive");
  });
});
