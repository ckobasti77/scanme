/// <reference types="vite/client" />

// TASK-64 (RFC-004 §2.12, §2.13, §4) — Tests for ordering configuration,
// items list with live available toggle, and venue ordering capability gate.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  PLAN_LIMITS,
  venueOrderingEnabled,
} from "./lib/plans";
import { BusinessAccessDeniedError } from "./lib/access";

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

type T = ReturnType<typeof newT>;

async function seedTestEnvironment(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();

    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });

    const ownerId = await ctx.db.insert("users", {
      email: "owner@dva-jelena.test",
      emailVerificationTime: now,
    });

    const outsiderId = await ctx.db.insert("users", {
      email: "outsider@other.test",
      emailVerificationTime: now,
    });

    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Dva Jelena",
      slug: "dva-jelena",
      status: "active",
      createdAt: now,
    });

    await ctx.db.insert("businessMemberships", {
      businessId,
      userId: ownerId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const venueProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: "dva-jelena-venue",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { adminId, ownerId, outsiderId, businessId, venueProfileId, now };
  });
}

function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: ISSUER });
}

describe("TASK-64: Venue Limits & venueOrderingEnabled (RFC-004 §2.12)", () => {
  test("PLAN_LIMITS defines ordering: false for basic and ordering: true for premium", () => {
    expect(PLAN_LIMITS.scanme_venue.basic.ordering).toBe(false);
    expect(PLAN_LIMITS.scanme_venue.premium.ordering).toBe(true);
  });

  test("venueOrderingEnabled helper returns false for null, undefined, basic or missing limits", () => {
    expect(venueOrderingEnabled(null)).toBe(false);
    expect(venueOrderingEnabled(undefined)).toBe(false);
    expect(venueOrderingEnabled({})).toBe(false);
    expect(venueOrderingEnabled(PLAN_LIMITS.scanme_venue.basic)).toBe(false);
    expect(venueOrderingEnabled({ ordering: false })).toBe(false);
  });

  test("venueOrderingEnabled returns true only when limits.ordering is explicitly true", () => {
    expect(venueOrderingEnabled(PLAN_LIMITS.scanme_venue.premium)).toBe(true);
    expect(venueOrderingEnabled({ ordering: true })).toBe(true);
  });
});

describe("TASK-64: Public ordering state query & Capability Gate (RFC-004 §2.12)", () => {
  test("returns { status: 'absent' } when code is invalid or unknown", async () => {
    const t = newT();
    const result = await t.query(api.ordering.publicOrderingState, {
      code: "NONEXIST",
    });
    expect(result).toEqual({ status: "absent" });
  });

  test("returns { status: 'locked', planKey: 'basic' } when venue has no entitlement", async () => {
    const t = newT();
    const { businessId, now } = await seedTestEnvironment(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("orderingConfig", {
        businessId,
        code: "ABCD2345",
        enabled: true,
        callWaiterEnabled: true,
        overdueMinutes: 7,
        reasons: ["Račun", "Voda"],
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t.query(api.ordering.publicOrderingState, {
      code: "ABCD2345",
    });
    expect(result).toEqual({ status: "locked", planKey: "basic" });
  });

  test("returns { status: 'locked', planKey: 'basic' } when venue has basic entitlement", async () => {
    const t = newT();
    const { businessId, now } = await seedTestEnvironment(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_venue",
        planKey: "basic",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("orderingConfig", {
        businessId,
        code: "ABCD2345",
        enabled: true,
        callWaiterEnabled: true,
        overdueMinutes: 7,
        reasons: ["Račun", "Voda"],
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t.query(api.ordering.publicOrderingState, {
      code: "ABCD2345",
    });
    expect(result).toEqual({ status: "locked", planKey: "basic" });
  });

  test("returns { status: 'available' } with config and items when venue has premium entitlement", async () => {
    const t = newT();
    const { businessId, now } = await seedTestEnvironment(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_venue",
        planKey: "premium",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("orderingConfig", {
        businessId,
        code: "ABCD2345",
        enabled: true,
        callWaiterEnabled: true,
        overdueMinutes: 7,
        reasons: ["Račun", "Voda"],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("orderingItems", {
        businessId,
        name: "Domaća kafa",
        priceRsd: 220,
        available: true,
        order: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t.query(api.ordering.publicOrderingState, {
      code: "ABCD2345",
    });

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.planKey).toBe("premium");
      expect(result.businessName).toBe("Kafana Dva Jelena");
      expect(result.config.enabled).toBe(true);
      expect(result.config.callWaiterEnabled).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Domaća kafa");
      expect(result.items[0].priceRsd).toBe(220);
      expect(result.items[0].available).toBe(true);
    }
  });

  test("capability vs config separation: entitled venue with enabled: false still returns status 'available' with config.enabled: false", async () => {
    const t = newT();
    const { businessId, now } = await seedTestEnvironment(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_venue",
        planKey: "premium",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("orderingConfig", {
        businessId,
        code: "ABCD2345",
        enabled: false, // venue chose to disable
        callWaiterEnabled: false, // call button disabled
        overdueMinutes: 7,
        reasons: ["Račun"],
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t.query(api.ordering.publicOrderingState, {
      code: "ABCD2345",
    });

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.config.enabled).toBe(false);
      expect(result.config.callWaiterEnabled).toBe(false);
    }
  });
});

describe("TASK-64: Owner Config & Items Management (RFC-004 §2.13)", () => {
  test("outsider is rejected by requireBusinessAccess", async () => {
    const t = newT();
    const { outsiderId, businessId } = await seedTestEnvironment(t);
    const outsider = asUser(t, outsiderId);

    await expect(
      outsider.query(api.ordering.getOwnerOrderingConfig, { businessId }),
    ).rejects.toThrow(BusinessAccessDeniedError);

    await expect(
      outsider.mutation(api.ordering.updateOrderingConfig, {
        businessId,
        enabled: true,
      }),
    ).rejects.toThrow(BusinessAccessDeniedError);
  });

  test("owner cannot update config or create items on Basic tier", async () => {
    const t = newT();
    const { ownerId, businessId, now } = await seedTestEnvironment(t);
    const owner = asUser(t, ownerId);

    await t.run(async (ctx) => {
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_venue",
        planKey: "basic",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    });

    // getOwnerOrderingConfig returns locked status
    const configResult = await owner.query(api.ordering.getOwnerOrderingConfig, {
      businessId,
    });
    expect(configResult.status).toBe("locked");
    expect(configResult.orderingEnabled).toBe(false);

    // Mutation throws ConvexError
    await expect(
      owner.mutation(api.ordering.updateOrderingConfig, {
        businessId,
        enabled: true,
      }),
    ).rejects.toThrow("Poručivanje nije omogućeno");

    await expect(
      owner.mutation(api.ordering.createOrderingItem, {
        businessId,
        name: "Espresso",
      }),
    ).rejects.toThrow("Poručivanje nije omogućeno");
  });

  test("owner can toggle config switches and manage orderingItems on Premium tier", async () => {
    const t = newT();
    const { ownerId, businessId, now } = await seedTestEnvironment(t);
    const owner = asUser(t, ownerId);

    await t.run(async (ctx) => {
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_venue",
        planKey: "premium",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    });

    // 1. Initial config query auto-detects no config yet
    const initial = await owner.query(api.ordering.getOwnerOrderingConfig, {
      businessId,
    });
    expect(initial.status).toBe("available");
    expect(initial.orderingEnabled).toBe(true);
    expect(initial.config).toBeNull();
    expect(initial.items).toHaveLength(0);

    // 2. Enable ordering and set callWaiterEnabled
    await owner.mutation(api.ordering.updateOrderingConfig, {
      businessId,
      enabled: true,
      callWaiterEnabled: true,
    });

    const afterConfig = await owner.query(
      api.ordering.getOwnerOrderingConfig,
      { businessId },
    );
    expect(afterConfig.status).toBe("available");
    if (afterConfig.status === "available") {
      expect(afterConfig.config?.enabled).toBe(true);
      expect(afterConfig.config?.callWaiterEnabled).toBe(true);
      expect(afterConfig.config?.code).toBeDefined();
    }

    // 3. Create items
    const { itemId: item1Id } = await owner.mutation(
      api.ordering.createOrderingItem,
      {
        businessId,
        name: "Ćevapi 10 kom",
        priceRsd: 850,
      },
    );

    const { itemId: item2Id } = await owner.mutation(
      api.ordering.createOrderingItem,
      {
        businessId,
        name: "Šopska salata",
        priceRsd: 350,
      },
    );

    // 4. Read items
    const withItems = await owner.query(api.ordering.getOwnerOrderingConfig, {
      businessId,
    });
    if (withItems.status === "available") {
      expect(withItems.items).toHaveLength(2);
      expect(withItems.items[0]._id).toBe(item1Id);
      expect(withItems.items[0].name).toBe("Ćevapi 10 kom");
      expect(withItems.items[0].priceRsd).toBe(850);
      expect(withItems.items[0].available).toBe(true);
      expect(withItems.items[1]._id).toBe(item2Id);
    }

    // 5. LIVE available toggle: setItemAvailable flips availability reactively
    await owner.mutation(api.ordering.setItemAvailable, {
      itemId: item1Id,
      available: false,
    });

    const afterToggle = await owner.query(
      api.ordering.getOwnerOrderingConfig,
      { businessId },
    );
    if (afterToggle.status === "available") {
      expect(afterToggle.items[0].available).toBe(false);
    }

    // Flip back
    await owner.mutation(api.ordering.setItemAvailable, {
      itemId: item1Id,
      available: true,
    });
    const afterRestore = await owner.query(
      api.ordering.getOwnerOrderingConfig,
      { businessId },
    );
    if (afterRestore.status === "available") {
      expect(afterRestore.items[0].available).toBe(true);
    }

    // 6. Update item
    await owner.mutation(api.ordering.updateOrderingItem, {
      itemId: item1Id,
      name: "Ćevapi 10 kom sa kajmakom",
      priceRsd: 950,
    });

    const afterUpdate = await owner.query(
      api.ordering.getOwnerOrderingConfig,
      { businessId },
    );
    if (afterUpdate.status === "available") {
      expect(afterUpdate.items[0].name).toBe("Ćevapi 10 kom sa kajmakom");
      expect(afterUpdate.items[0].priceRsd).toBe(950);
    }

    // 7. Delete item
    await owner.mutation(api.ordering.deleteOrderingItem, {
      itemId: item2Id,
    });

    const afterDelete = await owner.query(
      api.ordering.getOwnerOrderingConfig,
      { businessId },
    );
    if (afterDelete.status === "available") {
      expect(afterDelete.items).toHaveLength(1);
      expect(afterDelete.items[0]._id).toBe(item1Id);
    }
  });
});
