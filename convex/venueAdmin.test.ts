/// <reference types="vite/client" />

// TASK-11 STEP 1 — the Venue provisioning mutation, provable with convex-test:
// admin-gating, the derived `-venue` slug rule, idempotent granting, the
// drift-free entitlement upsert, and a deactivation that keeps every event and
// config row.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { getEntitlement } from "./lib/entitlements";

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

// NB: inside t.run, convex-test's ctx loses the schema's index types, so these
// helpers use .filter (per project memory), not .withIndex. The production code
// in venueAdmin.ts uses the real indexes.
async function venueProfiles(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
) {
  return t.run((ctx) =>
    ctx.db
      .query("serviceProfiles")
      .filter((q) =>
        q.and(
          q.eq(q.field("businessId"), businessId),
          q.eq(q.field("type"), "scanme_venue"),
        ),
      )
      .collect(),
  );
}

async function events(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
) {
  return t.run((ctx) =>
    ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("businessId"), businessId))
      .collect(),
  );
}

describe("grantVenue (RFC-001 §2.1.4)", () => {
  test("creates the venue profile with the derived -venue slug, an active status, a draft event + empty config, and a basic entitlement", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);

    const result = await as.mutation(api.venueAdmin.grantVenue, {
      businessId,
      planKey: "basic",
    });
    expect(result.created).toBe(true);
    expect(result.slug).toBe("klub-barok-venue");

    const profiles = await venueProfiles(t, businessId);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].slug).toBe("klub-barok-venue");
    expect(profiles[0].status).toBe("active");
    expect(profiles[0].clientEditingEnabled).toBe(true);

    const list = await events(t, businessId);
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("draft");

    const config = await t.run((ctx) =>
      ctx.db
        .query("venueEventConfigs")
        .filter((q) => q.eq(q.field("eventId"), list[0]._id))
        .unique(),
    );
    expect(config).not.toBeNull();
    expect(config!.publishedRevision).toBe(0);
    expect(config!.hasUnpublishedChanges).toBe(false);

    const entitlement = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_venue"),
    );
    expect(entitlement?.planKey).toBe("basic");
    expect(entitlement?.status).toBe("active");
  });

  test("granting twice is idempotent: no second profile, no second event, returns the existing one", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);

    const first = await as.mutation(api.venueAdmin.grantVenue, {
      businessId,
      planKey: "basic",
    });
    const second = await as.mutation(api.venueAdmin.grantVenue, {
      businessId,
      planKey: "basic",
    });

    expect(second.created).toBe(false);
    expect(second.venueProfileId).toBe(first.venueProfileId);
    expect(await venueProfiles(t, businessId)).toHaveLength(1);
    expect(await events(t, businessId)).toHaveLength(1);

    // Still exactly one active entitlement (upsert patched in place).
    const entitlements = await t.run((ctx) =>
      ctx.db
        .query("entitlements")
        .filter((q) =>
          q.and(
            q.eq(q.field("businessId"), businessId),
            q.eq(q.field("product"), "scanme_venue"),
          ),
        )
        .collect(),
    );
    expect(entitlements).toHaveLength(1);
  });

  test("re-granting reactivates a deactivated profile without a second profile", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);

    await as.mutation(api.venueAdmin.grantVenue, { businessId, planKey: "basic" });
    await as.mutation(api.venueAdmin.deactivateVenue, { businessId });
    expect((await venueProfiles(t, businessId))[0].status).toBe("inactive");

    const regrant = await as.mutation(api.venueAdmin.grantVenue, {
      businessId,
      planKey: "basic",
    });
    expect(regrant.created).toBe(false);
    expect((await venueProfiles(t, businessId))[0].status).toBe("active");
    expect(await venueProfiles(t, businessId)).toHaveLength(1);
  });

  test("a non-admin is rejected", async () => {
    const t = convexTest(schema, modules);
    const { clientId, businessId } = await seed(t);
    const asClient = t.withIdentity({ subject: clientId, issuer: ISSUER });

    await expect(
      asClient.mutation(api.venueAdmin.grantVenue, {
        businessId,
        planKey: "basic",
      }),
    ).rejects.toThrow(/administratorski/i);

    // And an unauthenticated caller is rejected too.
    await expect(
      t.mutation(api.venueAdmin.grantVenue, { businessId, planKey: "basic" }),
    ).rejects.toThrow(/prijavljeni/i);

    expect(await venueProfiles(t, businessId)).toHaveLength(0);
  });

  test("an unknown plan key is rejected", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);
    await expect(
      as.mutation(api.venueAdmin.grantVenue, {
        businessId,
        planKey: "enterprise",
      }),
    ).rejects.toThrow(/plan/i);
  });
});

describe("deactivateVenue (RFC-001 §2.1)", () => {
  test("deactivation flips the profile to inactive but leaves the event and config rows intact", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);

    await as.mutation(api.venueAdmin.grantVenue, { businessId, planKey: "basic" });
    const eventsBefore = await events(t, businessId);
    expect(eventsBefore).toHaveLength(1);

    await as.mutation(api.venueAdmin.deactivateVenue, { businessId });

    const profiles = await venueProfiles(t, businessId);
    expect(profiles[0].status).toBe("inactive");

    // The event and its config survive deactivation untouched.
    const eventsAfter = await events(t, businessId);
    expect(eventsAfter).toHaveLength(1);
    expect(eventsAfter[0]._id).toBe(eventsBefore[0]._id);
    const config = await t.run((ctx) =>
      ctx.db
        .query("venueEventConfigs")
        .filter((q) => q.eq(q.field("eventId"), eventsAfter[0]._id))
        .unique(),
    );
    expect(config).not.toBeNull();

    // The public page renders the graceful inactive state, never a 404.
    const state = await t.query(api.venue.publicVenuePageState, {
      businessSlug: "klub-barok",
    });
    expect(state?.state.kind).toBe("inactive");
  });

  test("deactivating a business with no Venue profile throws", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);
    await expect(
      as.mutation(api.venueAdmin.deactivateVenue, { businessId }),
    ).rejects.toThrow(/profil/i);
  });
});

describe("listVenueBusinesses (admin console read model)", () => {
  test("reports Venue state, plan tier, and current event per business; non-admin rejected", async () => {
    const t = convexTest(schema, modules);
    const { adminId, clientId, businessId } = await seed(t);
    const as = admin(t, adminId);

    // Before granting: the business appears with venue === null.
    let rows = await as.query(api.venueAdmin.listVenueBusinesses, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].venue).toBeNull();

    await as.mutation(api.venueAdmin.grantVenue, { businessId, planKey: "basic" });
    rows = await as.query(api.venueAdmin.listVenueBusinesses, {});
    expect(rows[0].venue?.status).toBe("active");
    expect(rows[0].venue?.planKey).toBe("basic");
    expect(rows[0].venue?.currentEvent?.status).toBe("draft");

    // A non-admin cannot read the console.
    const asClient = t.withIdentity({ subject: clientId, issuer: ISSUER });
    await expect(
      asClient.query(api.venueAdmin.listVenueBusinesses, {}),
    ).rejects.toThrow(/administratorski/i);
  });
});
