/// <reference types="vite/client" />

// TASK-47 (RFC-003 §2.13) — proves the six new Menu tables validate and round-
// trip through the real Convex schema. An insert throws on any shape mismatch,
// so a successful insert proves the validator; the get + expect proves the
// round-trip. The menu attaches to a serviceProfile (seeded here as an existing
// service type — `scanme_menu` on serviceTypeValidator is deferred, see
// docs/tasks/BLOCKED.md TASK-47), proving existing tables still validate under
// the new schema.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedMenuShell(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Stara Vremena",
      slug: "kafana-stara-vremena",
      status: "active",
      createdAt: now,
    });
    // Menu attaches to any serviceProfile; scanme_menu on the service-type union
    // is deferred (BLOCKED TASK-47), so seed with an existing type.
    const serviceProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: "kafana-stara-vremena-venue",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { businessId, serviceProfileId, now };
  });
}

describe("menu schema (RFC-003 §2.13, TASK-47)", () => {
  test("menus → menuGroups → menuItems round-trip insert and read", async () => {
    const t = convexTest(schema, modules);
    const { businessId, serviceProfileId, now } = await seedMenuShell(t);

    const menuId = await t.run(async (ctx) =>
      ctx.db.insert("menus", {
        businessId,
        serviceProfileId,
        status: "draft",
        design: { version: 1, tokens: {} },
        createdAt: now,
        updatedAt: now,
      }),
    );

    const groupId = await t.run(async (ctx) =>
      ctx.db.insert("menuGroups", {
        menuId,
        title: "Predjela",
        shape: "lista",
        order: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const itemId = await t.run(async (ctx) =>
      ctx.db.insert("menuItems", {
        menuId,
        groupId,
        name: "Kajmak",
        productType: "meze",
        priceRsd: 350,
        available: true,
        order: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const [menu, group, item] = await t.run(async (ctx) => [
      await ctx.db.get(menuId),
      await ctx.db.get(groupId),
      await ctx.db.get(itemId),
    ]);

    expect(menu?.status).toBe("draft");
    expect(menu?.serviceProfileId).toBe(serviceProfileId);
    expect(group?.menuId).toBe(menuId);
    expect(group?.shape).toBe("lista");
    expect(item?.groupId).toBe(groupId);
    expect(item?.available).toBe(true);
    expect(item?.priceRsd).toBe(350);
  });

  test("itemVariants, itemPairings and menuDayparts validate and read back", async () => {
    const t = convexTest(schema, modules);
    const { businessId, serviceProfileId, now } = await seedMenuShell(t);

    const { menuId, itemA, itemB } = await t.run(async (ctx) => {
      const menuId = await ctx.db.insert("menus", {
        businessId,
        serviceProfileId,
        status: "published",
        design: { version: 1 },
        daypartOverride: "rucak",
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const groupId = await ctx.db.insert("menuGroups", {
        menuId,
        title: "Pića",
        shape: "tabela_varijanti",
        iconKey: "rakija",
        daypartKey: "rucak",
        order: 1,
        createdAt: now,
        updatedAt: now,
      });
      const itemA = await ctx.db.insert("menuItems", {
        menuId,
        groupId,
        name: "Domaća rakija",
        productType: "rakija",
        available: true,
        order: 0,
        createdAt: now,
        updatedAt: now,
      });
      const itemB = await ctx.db.insert("menuItems", {
        menuId,
        groupId,
        name: "Točeno pivo",
        productType: "pivo",
        available: true,
        order: 1,
        createdAt: now,
        updatedAt: now,
      });
      return { menuId, itemA, itemB };
    });

    const variantId = await t.run(async (ctx) =>
      ctx.db.insert("itemVariants", {
        itemId: itemA,
        label: "0.3 l",
        priceRsd: 300,
        order: 0,
      }),
    );
    const pairingId = await t.run(async (ctx) =>
      ctx.db.insert("itemPairings", {
        itemId: itemA,
        pairedItemId: itemB,
        order: 0,
      }),
    );
    const daypartId = await t.run(async (ctx) =>
      ctx.db.insert("menuDayparts", {
        menuId,
        key: "rucak",
        label: "Ručak",
        startMinute: 720,
        endMinute: 960,
        order: 0,
      }),
    );

    const [variant, pairing, daypart] = await t.run(async (ctx) => [
      await ctx.db.get(variantId),
      await ctx.db.get(pairingId),
      await ctx.db.get(daypartId),
    ]);

    expect(variant?.itemId).toBe(itemA);
    expect(variant?.priceRsd).toBe(300);
    expect(pairing?.pairedItemId).toBe(itemB);
    expect(daypart?.key).toBe("rucak");
    expect(daypart?.startMinute).toBe(720);
  });
});
