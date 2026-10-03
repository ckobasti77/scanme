/// <reference types="vite/client" />

// TASK-13 — clientPanel.venuePanel, the additive Venue read model for the owner
// panel, provable with convex-test: the access gate (product-agnostic, so a
// Venue business reaches it), the "none" gate (no section without an ACTIVE
// venue profile — the non-regression guarantee for Links/Review-only
// businesses), and that the lifecycle summary + duplicate source + past-event
// list track the materialized event state.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const CLIENT_EMAIL = "klijent@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
    const clientId = await ctx.db.insert("users", {
      email: CLIENT_EMAIL,
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Klub Barok",
      slug: "klub-barok",
      status: "active",
      createdAt: now,
    });
    return { adminId, clientId, businessId };
  });
}

function admin(t: ReturnType<typeof convexTest>, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

async function grantVenue(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: "klub-barok-venue",
      status: "active",
      clientEditingEnabled: true,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
}

// create → publish (→ optionally schedule + goLive), returning the eventId.
async function publishEvent(
  t: ReturnType<typeof convexTest>,
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
  await as.mutation(api.venue.saveDraft, { eventId, displayName: slug });
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
  return eventId;
}

describe("clientPanel.venuePanel access + gating", () => {
  test("forbidden for a signed-in user with no membership", async () => {
    const t = convexTest(schema, modules);
    const { clientId, businessId } = await seed(t);
    await grantVenue(t, businessId);
    const asClient = t.withIdentity({ subject: clientId, issuer: ISSUER });
    const result = await asClient.query(api.clientPanel.venuePanel, {
      slug: "klub-barok",
    });
    expect(result.status).toBe("forbidden");
  });

  test("none for a business with no venue profile (Links/Review-only stays unchanged)", async () => {
    const t = convexTest(schema, modules);
    const { adminId } = await seed(t);
    const result = await admin(t, adminId).query(api.clientPanel.venuePanel, {
      slug: "klub-barok",
    });
    expect(result.status).toBe("none");
  });

  test("none when the venue profile is deactivated", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const profileId = await grantVenue(t, businessId);
    await t.run((ctx) => ctx.db.patch(profileId, { status: "inactive" }));
    const result = await admin(t, adminId).query(api.clientPanel.venuePanel, {
      slug: "klub-barok",
    });
    expect(result.status).toBe("none");
  });
});

describe("clientPanel.venuePanel lifecycle read model", () => {
  test("surfaces the live event, its published/dirty state, and the duplicate source", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const venueProfileId = await grantVenue(t, businessId);
    const as = admin(t, adminId);
    const now = Date.now();

    const eventId = await publishEvent(t, adminId, venueProfileId, "petak");
    const { lifecycleRevision } = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 3_600_000,
      endsAt: now + 7_200_000,
    });
    await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: lifecycleRevision,
    });

    let result = await as.query(api.clientPanel.venuePanel, {
      slug: "klub-barok",
    });
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.activeEvent?.id).toBe(eventId);
    expect(result.activeEvent?.status).toBe("live");
    expect(result.activeEvent?.hasPublishedDesign).toBe(true);
    expect(result.activeEvent?.hasUnpublishedChanges).toBe(false);
    // The published live event is the duplicate source (last published design).
    expect(result.duplicateSource?.id).toBe(eventId);

    // Diverge the draft → the panel reports unpublished changes (the "visitors
    // see the previous version" signal).
    await as.mutation(api.venue.saveDraft, {
      eventId,
      displayName: "novo ime",
    });
    result = await as.query(api.clientPanel.venuePanel, { slug: "klub-barok" });
    if (result.status !== "available") throw new Error("expected available");
    expect(result.activeEvent?.hasUnpublishedChanges).toBe(true);
  });

  test("a live event with a distinct ended event yields a needsArchive prompt and a past-events list", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const venueProfileId = await grantVenue(t, businessId);
    const as = admin(t, adminId);
    const now = Date.now();

    // e1: publish → schedule → live → end (becomes the ended event).
    const e1 = await publishEvent(t, adminId, venueProfileId, "prosli");
    const s1 = await as.mutation(api.venue.scheduleEvent, {
      eventId: e1,
      startsAt: now + 3_600_000,
      endsAt: now + 7_200_000,
    });
    await t.mutation(internal.venue.goLive, {
      eventId: e1,
      expectedRevision: s1.lifecycleRevision,
    });
    await as.mutation(api.venue.endEventNow, { eventId: e1 });

    // e2: publish → schedule → live (the current active event).
    const e2 = await publishEvent(t, adminId, venueProfileId, "ovonedeljni");
    const s2 = await as.mutation(api.venue.scheduleEvent, {
      eventId: e2,
      startsAt: now + 3 * 3_600_000,
      endsAt: now + 4 * 3_600_000,
    });
    await t.mutation(internal.venue.goLive, {
      eventId: e2,
      expectedRevision: s2.lifecycleRevision,
    });

    const result = await as.query(api.clientPanel.venuePanel, {
      slug: "klub-barok",
    });
    if (result.status !== "available") throw new Error("expected available");
    expect(result.activeEvent?.id).toBe(e2);
    expect(result.needsArchive?.id).toBe(e1);
    expect(result.pastEvents.map((e) => e.id)).toContain(e1);
  });

  test("empty for a freshly granted venue with no events at all", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    await grantVenue(t, businessId);
    const result = await admin(t, adminId).query(api.clientPanel.venuePanel, {
      slug: "klub-barok",
    });
    if (result.status !== "available") throw new Error("expected available");
    expect(result.activeEvent).toBeNull();
    expect(result.pastEvents).toHaveLength(0);
    expect(result.duplicateSource).toBeNull();
  });
});

// TASK-18 — clientPanel.memoriesPanel: the additive Memories read model. The
// "none" gate is the non-regression guarantee — a business with only Links,
// Google Review or Venue never sees a Memories section.
describe("clientPanel.memoriesPanel access + gating", () => {
  test("none for a business with no memories profile (Links/Review/Venue-only stays unchanged)", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    // A Venue profile alone must NOT surface a Memories section.
    await grantVenue(t, businessId);
    const result = await admin(t, adminId).query(api.clientPanel.memoriesPanel, {
      slug: "klub-barok",
    });
    expect(result.status).toBe("none");
  });

  test("available with tonight's counts + plan once Memories is granted; none again after deactivation", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);
    const grant = await as.mutation(api.memoriesAdmin.grantMemories, {
      businessId,
      planKey: "standard",
    });

    // Seed a session with counts, mirroring a night in progress.
    await t.run((ctx) =>
      ctx.db.insert("memoriesSessions", {
        spaceId: grant.spaceId,
        dateKey: "2026-08-26",
        status: "open",
        openedAt: Date.now(),
        photoCount: 4,
        guestCount: 2,
        updatedAt: Date.now(),
      }),
    );

    let result = await as.query(api.clientPanel.memoriesPanel, {
      slug: "klub-barok",
    });
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.tenantKind).toBe("business");
    expect(result.space?.mode).toBe("recurring");
    expect(result.session?.photoCount).toBe(4);
    expect(result.plan?.planKey).toBe("standard");
    expect(result.plan?.photosPerGuest).toBe(5);

    // Deactivation flips the profile inactive → the section disappears.
    await as.mutation(api.memoriesAdmin.deactivateMemories, { businessId });
    result = await as.query(api.clientPanel.memoriesPanel, {
      slug: "klub-barok",
    });
    expect(result.status).toBe("none");
  });
});
