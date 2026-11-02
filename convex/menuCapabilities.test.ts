/// <reference types="vite/client" />

// ScanMe Menu V1 — K03: Standard vs Premium (master §2.2). Premium lives on the
// ACCOUNT, never on a single Menu service: one Premium grant on the account
// makes every venue under it Premium, and no other account is affected. The
// resolution only EXTENDS the existing entitlement chain (subscriptions_v1
// Premium → active business grant → account plan, enterprise → premium).

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { getMenuCapabilities, requireMenuCapability } from "./lib/menuCapabilities";
import {
  MENU_PREMIUM,
  MENU_PREMIUM_CAPABILITIES,
  MENU_STANDARD,
  type MenuCapabilities,
  type MenuTier,
} from "../lib/menu/capabilities";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addVenueToAccount,
  grantAccountPremium,
  seedMenuWorld,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

// Typed by the schema (ReturnType<typeof convexTest> would lose the index types).
const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

async function world(t: T) {
  return await t.run(async (ctx) => await seedMenuWorld(ctx));
}

/** A second venue under account A (its own business + Menu service). */
async function secondVenueOfA(t: T, w: Awaited<ReturnType<typeof world>>) {
  return await t.run(async (ctx) =>
    addVenueToAccount(ctx, {
      accountId: w.a.accountId,
      name: "Kafana kod Mike - Filijala",
      slug: "kafana-kod-mike-filijala",
      actorUserId: w.adminId,
    }),
  );
}

async function capsOf(t: T, businessId: Id<"businesses">): Promise<MenuCapabilities> {
  return await t.run(async (ctx) => await getMenuCapabilities(ctx, businessId));
}

/** The whole shape, spelled out, so a changed constant cannot hide behind MENU_STANDARD/PREMIUM. */
function expectTier(capabilities: MenuCapabilities, tier: MenuTier) {
  const premium = tier === "premium";
  expect(capabilities.tier).toBe(tier);
  expect(capabilities.maxLanguages).toBe(premium ? 10 : 2);
  for (const capability of MENU_PREMIUM_CAPABILITIES) {
    expect(capabilities[capability], capability).toBe(premium);
  }
  expect(capabilities).toEqual(premium ? MENU_PREMIUM : MENU_STANDARD);
}

async function featuresOf(t: T, menuServiceId: Id<"menuServices">) {
  const service = await t.run(async (ctx) => ctx.db.get(menuServiceId));
  return service!.features;
}

async function featureAudits(t: T, menuServiceId: Id<"menuServices">) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
  return rows.filter((row) => row.action === "feature.changed");
}

describe("Standard is the default", () => {
  test("a venue without any Premium resolves Standard: two languages and every Premium switch off", async () => {
    const t = newTest();
    const w = await world(t);
    const capabilities = await capsOf(t, w.a.businessId);
    expectTier(capabilities, "standard");
    expect(capabilities).toEqual(MENU_STANDARD);
    expect(capabilities).toMatchObject({
      tier: "standard",
      maxLanguages: 2,
      roomService: false,
      aiTranslations: false,
      scheduledPromos: false,
      extraLayouts: false,
      advancedAnalytics: false,
      csvExport: false,
      reducedBranding: false,
    });
  });
});

describe("Premium is a fact of the account, not of one service", () => {
  test("a plan Premium on account A makes BOTH its venues Premium; account B stays Standard", async () => {
    const t = newTest();
    const w = await world(t);
    const second = await secondVenueOfA(t, w);
    expectTier(await capsOf(t, w.a.businessId), "standard");
    expectTier(await capsOf(t, second.businessId), "standard");

    await t.run(async (ctx) => grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" }));

    const first = await capsOf(t, w.a.businessId);
    expectTier(first, "premium");
    expect(first).toMatchObject({ tier: "premium", maxLanguages: 10, roomService: true });
    expectTier(await capsOf(t, second.businessId), "premium");
    expectTier(await capsOf(t, w.b.businessId), "standard");
  });

  test("a subscription Premium (active) on account A makes both venues Premium; account B stays Standard", async () => {
    const t = newTest();
    const w = await world(t);
    const second = await secondVenueOfA(t, w);

    await t.run(async (ctx) =>
      grantAccountPremium(ctx, { accountId: w.a.accountId, via: "subscription", status: "active" }),
    );

    expectTier(await capsOf(t, w.a.businessId), "premium");
    expectTier(await capsOf(t, second.businessId), "premium");
    expectTier(await capsOf(t, w.b.businessId), "standard");
  });

  test.each([
    ["active", "premium"],
    ["grace", "premium"],
    ["suspended", "standard"],
    ["inactive", "standard"],
  ] as const)(
    "a subscription in status %s resolves %s for both venues of the account",
    async (status, tier) => {
      const t = newTest();
      const w = await world(t);
      const second = await secondVenueOfA(t, w);

      await t.run(async (ctx) =>
        grantAccountPremium(ctx, { accountId: w.a.accountId, via: "subscription", status }),
      );

      expectTier(await capsOf(t, w.a.businessId), tier);
      expectTier(await capsOf(t, second.businessId), tier);
      expectTier(await capsOf(t, w.b.businessId), "standard");
    },
  );

  test("the enterprise plan resolves Premium", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) =>
      grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan", plan: "enterprise" }),
    );
    expectTier(await capsOf(t, w.a.businessId), "premium");
    expectTier(await capsOf(t, w.b.businessId), "standard");
  });

  test.each(["suspended", "expired"] as const)(
    "a %s account with the Premium plan is Standard (the plan only counts while the account is active)",
    async (status) => {
      const t = newTest();
      const w = await world(t);
      await t.run(async (ctx) => {
        await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
        await ctx.db.patch(w.a.accountId, { status });
      });
      expectTier(await capsOf(t, w.a.businessId), "standard");
    },
  );
});

describe("the existing entitlement chain keeps working", () => {
  test("an active business-scoped scanme_menu grant makes that venue Premium; its sibling and account B stay Standard", async () => {
    const t = newTest();
    const w = await world(t);
    const second = await secondVenueOfA(t, w);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("entitlements", {
        businessId: w.a.businessId,
        product: "scanme_menu",
        planKey: "premium",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    });

    expectTier(await capsOf(t, w.a.businessId), "premium");
    expectTier(await capsOf(t, second.businessId), "standard");
    expectTier(await capsOf(t, w.b.businessId), "standard");
  });

  test("an expired business-scoped grant does not make the venue Premium", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("entitlements", {
        businessId: w.a.businessId,
        product: "scanme_menu",
        planKey: "premium",
        status: "expired",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    });
    expectTier(await capsOf(t, w.a.businessId), "standard");
  });
});

describe("requireMenuCapability", () => {
  test("refuses with plan/premium_required on Standard, for every Premium switch", async () => {
    const t = newTest();
    const w = await world(t);
    for (const capability of MENU_PREMIUM_CAPABILITIES) {
      await expect(
        t.run(async (ctx) => await requireMenuCapability(ctx, w.a.businessId, capability)),
      ).rejects.toThrow(MENU_PLAN_ERROR.premiumRequired);
    }
  });

  test("returns the Premium capabilities once the account is Premium", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" }));

    const capabilities = await t.run(
      async (ctx) => await requireMenuCapability(ctx, w.a.businessId, "roomService"),
    );
    expectTier(capabilities, "premium");
    // Account B is still Standard: the grant does not leak across accounts.
    await expect(
      t.run(async (ctx) => await requireMenuCapability(ctx, w.b.businessId, "roomService")),
    ).rejects.toThrow(MENU_PLAN_ERROR.premiumRequired);
  });
});

describe("menuServices.context carries the capabilities", () => {
  test("A's owner sees Standard before and Premium after the account is upgraded", async () => {
    const t = newTest();
    const w = await world(t);

    const before = await as(t, w.ownerId).query(api.menuServices.context, { businessSlug: SLUG_A });
    expect(before?.capabilities).toEqual(MENU_STANDARD);

    await t.run(async (ctx) => grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" }));

    const after = await as(t, w.ownerId).query(api.menuServices.context, { businessSlug: SLUG_A });
    expect(after?.capabilities).toEqual(MENU_PREMIUM);
  });
});

describe("menuServices.setFeature", () => {
  test("owner and manager switch callWaiter on and off at Standard, every real change audited", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;

    await as(t, w.ownerId).mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "callWaiter",
      enabled: true,
    });
    expect((await featuresOf(t, id)).callWaiter).toBe(true);

    await as(t, w.managerId).mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "callWaiter",
      enabled: false,
    });
    expect((await featuresOf(t, id)).callWaiter).toBe(false);

    await as(t, w.managerId).mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "callWaiter",
      enabled: true,
    });
    expect((await featuresOf(t, id)).callWaiter).toBe(true);

    const audits = await featureAudits(t, id);
    expect(audits).toHaveLength(3);
    expect(audits[0]).toMatchObject({
      action: "feature.changed",
      actorKind: "user",
      actorUserId: w.ownerId,
      details: { feature: "callWaiter", enabled: true },
    });
    expect(audits[1]).toMatchObject({
      actorUserId: w.managerId,
      details: { feature: "callWaiter", enabled: false },
    });
  });

  test("an editor is forbidden; finance, view-only, outsiders and another account's owner get not_found", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;

    await expect(
      as(t, w.editorId).mutation(api.menuServices.setFeature, {
        menuServiceId: id,
        feature: "callWaiter",
        enabled: true,
      }),
    ).rejects.toThrow(MENU_ERROR.forbidden);

    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      await expect(
        as(t, userId).mutation(api.menuServices.setFeature, {
          menuServiceId: id,
          feature: "callWaiter",
          enabled: true,
        }),
      ).rejects.toThrow(MENU_ERROR.notFound);
    }

    expect((await featuresOf(t, id)).callWaiter).toBe(false);
    expect(await featureAudits(t, id)).toHaveLength(0);
  });

  test("a no-op (same value) succeeds and writes no audit row", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;

    // callWaiter is already off.
    const result = await as(t, w.ownerId).mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "callWaiter",
      enabled: false,
    });
    expect(result).toEqual({ ok: true });
    expect(await featureAudits(t, id)).toHaveLength(0);

    await as(t, w.ownerId).mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "callWaiter",
      enabled: true,
    });
    expect(await featureAudits(t, id)).toHaveLength(1);
    await as(t, w.ownerId).mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "callWaiter",
      enabled: true,
    });
    expect(await featureAudits(t, id)).toHaveLength(1);
  });

  test("room service ON needs the Premium account; OFF never does", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;
    const roomService = (enabled: boolean) =>
      as(t, w.ownerId).mutation(api.menuServices.setFeature, {
        menuServiceId: id,
        feature: "roomService",
        enabled,
      });

    // Standard: refused, nothing written.
    await expect(roomService(true)).rejects.toThrow(MENU_PLAN_ERROR.premiumRequired);
    expect((await featuresOf(t, id)).roomService).toBe(false);
    expect(await featureAudits(t, id)).toHaveLength(0);

    // Premium on the account: allowed.
    await t.run(async (ctx) => grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" }));
    expect(await roomService(true)).toEqual({ ok: true });
    expect((await featuresOf(t, id)).roomService).toBe(true);
    expect(await featureAudits(t, id)).toHaveLength(1);

    // Premium lost: turning it OFF needs no Premium, and the audit row is written.
    await t.run(async (ctx) => ctx.db.patch(w.a.accountId, { plan: "basic" }));
    expect(await roomService(false)).toEqual({ ok: true });
    expect((await featuresOf(t, id)).roomService).toBe(false);
    const audits = await featureAudits(t, id);
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({ details: { feature: "roomService", enabled: false } });

    // And it cannot come back on without Premium.
    await expect(roomService(true)).rejects.toThrow(MENU_PLAN_ERROR.premiumRequired);
    expect((await featuresOf(t, id)).roomService).toBe(false);
  });

  test("room service on a subscription-Premium account is allowed; another account's Standard venue is still refused", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) =>
      grantAccountPremium(ctx, { accountId: w.a.accountId, via: "subscription", status: "active" }),
    );

    await as(t, w.managerId).mutation(api.menuServices.setFeature, {
      menuServiceId: w.a.menuServiceId,
      feature: "roomService",
      enabled: true,
    });
    expect((await featuresOf(t, w.a.menuServiceId)).roomService).toBe(true);

    await expect(
      as(t, w.otherOwnerId).mutation(api.menuServices.setFeature, {
        menuServiceId: w.b.menuServiceId,
        feature: "roomService",
        enabled: true,
      }),
    ).rejects.toThrow(MENU_PLAN_ERROR.premiumRequired);
    expect((await featuresOf(t, w.b.menuServiceId)).roomService).toBe(false);
  });

  test("a no-op roomService ON on a service that already has it succeeds even after Premium is lost", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;
    await t.run(async (ctx) => grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" }));
    await as(t, w.ownerId).mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "roomService",
      enabled: true,
    });
    await t.run(async (ctx) => ctx.db.patch(w.a.accountId, { plan: "basic" }));

    const result = await as(t, w.ownerId).mutation(api.menuServices.setFeature, {
      menuServiceId: id,
      feature: "roomService",
      enabled: true,
    });
    expect(result).toEqual({ ok: true });
    expect((await featuresOf(t, id)).roomService).toBe(true);
    expect(await featureAudits(t, id)).toHaveLength(1);
  });
});
