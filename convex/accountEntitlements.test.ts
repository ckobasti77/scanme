/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { getEntitlement } from "./lib/entitlements";
import type { AccountPlan } from "./lib/plans";

const modules = import.meta.glob("./**/*.ts");

async function seedBusinessAndSpace(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Nostalgija",
      slug: "kafana-nostalgija",
      status: "active",
      createdAt: now,
    });
    const memoriesProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_memories",
      // Memories profiles carry no public slug; a placeholder keeps the index
      // happy in tests.
      slug: `mem-${businessId}`,
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
      code: "ABCD2345",
      name: "Subota veče",
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
    const otherSpaceId = await ctx.db.insert("memoriesSpaces", {
      businessId,
      memoriesProfileId,
      code: "WXYZ6789",
      name: "Nedelja veče",
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
    return { businessId, memoriesProfileId, spaceId, otherSpaceId };
  });
}

async function insertAccount(
  t: ReturnType<typeof convexTest>,
  opts: {
    businessId: Id<"businesses">;
    plan: AccountPlan;
    status?: "active" | "suspended";
    overrides?: {
      photosPerGuest?: number;
      maxImageDimension?: number;
      retentionDays?: number;
      allowedBlockKeys?: string[];
    };
  },
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const accountId = await ctx.db.insert("accounts", {
      name: "Test nalog",
      plan: opts.plan,
      status: opts.status ?? "active",
      ...(opts.overrides ? { overrides: opts.overrides } : {}),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(opts.businessId, { accountId });
    return accountId;
  });
}

async function insertEntitlement(
  t: ReturnType<typeof convexTest>,
  row: {
    businessId: Id<"businesses">;
    planKey: string;
    status: "active" | "expired";
    spaceId?: Id<"memoriesSpaces">;
  },
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("entitlements", {
      businessId: row.businessId,
      product: "scanme_memories",
      planKey: row.planKey,
      ...(row.spaceId ? { spaceId: row.spaceId } : {}),
      status: row.status,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
  });
}

// The RFC risk-register #1 matrix: {no account, basic, premium, enterprise} ×
// {space/business override present/absent}. Steps 1–2 answers must be
// byte-identical to today; step 3 only answers where they resolve nothing.
describe("getEntitlement step 3 — account-plan fallback (RFC-002 §2.2.3)", () => {
  test("a solo account resolves its tier from account.plan", async () => {
    const cases: Array<{
      plan: AccountPlan;
      expectedKey: string;
      expectedPhotos: number;
    }> = [
      // ACCOUNT_PLAN_TIER: basic → basic (3), premium → premium (10),
      // enterprise → premium by default (bespoke goes through overrides).
      { plan: "basic", expectedKey: "basic", expectedPhotos: 3 },
      { plan: "premium", expectedKey: "premium", expectedPhotos: 10 },
      { plan: "enterprise", expectedKey: "premium", expectedPhotos: 10 },
    ];
    for (const { plan, expectedKey, expectedPhotos } of cases) {
      const t = convexTest(schema, modules);
      const { businessId } = await seedBusinessAndSpace(t);
      await insertAccount(t, { businessId, plan });

      const resolved = await t.run((ctx) =>
        getEntitlement(ctx, businessId, "scanme_memories"),
      );
      expect(resolved?.planKey).toBe(expectedKey);
      expect(resolved?.limits.photosPerGuest).toBe(expectedPhotos);
      expect(resolved?.status).toBe("active");
    }
  });

  test("a business-scoped row still wins over the account plan", async () => {
    const t = convexTest(schema, modules);
    const { businessId } = await seedBusinessAndSpace(t);
    await insertAccount(t, { businessId, plan: "premium" });
    await insertEntitlement(t, {
      businessId,
      planKey: "standard",
      status: "active",
    });

    // Today's answer, unchanged: the step-2 row wins, the account never fires.
    const resolved = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(resolved?.planKey).toBe("standard");
    expect(resolved?.limits.photosPerGuest).toBe(5);
  });

  test("a space-scoped row wins for its space; other scopes fall through to the account", async () => {
    const t = convexTest(schema, modules);
    const { businessId, spaceId, otherSpaceId } = await seedBusinessAndSpace(t);
    await insertAccount(t, { businessId, plan: "basic" });
    await insertEntitlement(t, {
      businessId,
      planKey: "premium",
      status: "active",
      spaceId,
    });

    // Step 1 wins for the granted space (RFC-001's per-event override).
    const granted = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", spaceId),
    );
    expect(granted?.planKey).toBe("premium");

    // Another space has no space-scoped row and no business-scoped row, so the
    // account baseline answers.
    const other = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", otherSpaceId),
    );
    expect(other?.planKey).toBe("basic");

    // Business scope alone also resolves the account baseline.
    const business = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(business?.planKey).toBe("basic");
  });

  test("no account and no rows still resolves null (degrades cleanly)", async () => {
    const t = convexTest(schema, modules);
    const { businessId, spaceId } = await seedBusinessAndSpace(t);
    const scoped = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", spaceId),
    );
    expect(scoped).toBeNull();
    const business = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(business).toBeNull();
  });

  test("a suspended account never resolves", async () => {
    const t = convexTest(schema, modules);
    const { businessId } = await seedBusinessAndSpace(t);
    await insertAccount(t, {
      businessId,
      plan: "premium",
      status: "suspended",
    });
    const resolved = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(resolved).toBeNull();
  });

  test("an expired business-scoped row does not block the account fallback", async () => {
    const t = convexTest(schema, modules);
    const { businessId } = await seedBusinessAndSpace(t);
    await insertAccount(t, { businessId, plan: "premium" });
    await insertEntitlement(t, {
      businessId,
      planKey: "basic",
      status: "expired",
    });

    // Yesterday this was null (expired rows never resolve); the account is
    // exactly the place the answer is allowed to change.
    const resolved = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(resolved?.planKey).toBe("premium");
    expect(resolved?.limits.photosPerGuest).toBe(10);
  });

  test("account.overrides merge over the mapped tier (Enterprise bespoke)", async () => {
    const t = convexTest(schema, modules);
    const { businessId } = await seedBusinessAndSpace(t);
    await insertAccount(t, {
      businessId,
      plan: "enterprise",
      overrides: { photosPerGuest: 25, retentionDays: 400 },
    });

    const resolved = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(resolved?.planKey).toBe("premium");
    expect(resolved?.limits.photosPerGuest).toBe(25);
    expect(resolved?.limits.retentionDays).toBe(400);
    // Keys the override does not name keep the mapped tier's defaults.
    expect(resolved?.limits.maxImageDimension).toBe(4096);
  });

  test("venue maps every plan to the placeholder basic tier", async () => {
    const t = convexTest(schema, modules);
    const { businessId } = await seedBusinessAndSpace(t);
    await insertAccount(t, { businessId, plan: "premium" });

    const resolved = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_venue"),
    );
    expect(resolved?.planKey).toBe("basic");
    expect(resolved?.limits.allowedBlockKeys).toEqual([]);
  });

  test("the ambiguous-row throw survives with an account present", async () => {
    const t = convexTest(schema, modules);
    const { businessId } = await seedBusinessAndSpace(t);
    await insertAccount(t, { businessId, plan: "premium" });
    await insertEntitlement(t, {
      businessId,
      planKey: "basic",
      status: "active",
    });
    await insertEntitlement(t, {
      businessId,
      planKey: "premium",
      status: "active",
    });

    await expect(
      t.run((ctx) => getEntitlement(ctx, businessId, "scanme_memories")),
    ).rejects.toThrow(/Multiple active business-scoped entitlements/);
  });
});
