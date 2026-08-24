/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { getEntitlement } from "./lib/entitlements";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";

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

async function insertEntitlement(
  t: ReturnType<typeof convexTest>,
  row: {
    businessId: Id<"businesses">;
    planKey: string;
    status: "active" | "expired";
    spaceId?: Id<"memoriesSpaces">;
    validUntil?: number;
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
      ...(row.validUntil !== undefined ? { validUntil: row.validUntil } : {}),
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("getEntitlement resolution order (RFC-001 §2.3)", () => {
  test("space-scoped active entitlement wins over business-scoped", async () => {
    const t = convexTest(schema, modules);
    const { businessId, spaceId } = await seedBusinessAndSpace(t);
    await insertEntitlement(t, { businessId, planKey: "basic", status: "active" });
    await insertEntitlement(t, {
      businessId,
      planKey: "premium",
      status: "active",
      spaceId,
    });

    const scoped = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", spaceId),
    );
    expect(scoped?.planKey).toBe("premium");
    expect(scoped?.limits.photosPerGuest).toBe(10);

    const business = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(business?.planKey).toBe("basic");
    expect(business?.limits.photosPerGuest).toBe(3);
  });

  test("falls back to business-scoped when no space-scoped exists", async () => {
    const t = convexTest(schema, modules);
    const { businessId, spaceId } = await seedBusinessAndSpace(t);
    await insertEntitlement(t, {
      businessId,
      planKey: "standard",
      status: "active",
    });

    const resolved = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", spaceId),
    );
    expect(resolved?.planKey).toBe("standard");
    expect(resolved?.limits.maxImageDimension).toBe(2560);
  });

  test("ignores an expired row at both scopes", async () => {
    const t = convexTest(schema, modules);
    const { businessId, spaceId } = await seedBusinessAndSpace(t);
    await insertEntitlement(t, {
      businessId,
      planKey: "premium",
      status: "expired",
      spaceId,
    });
    await insertEntitlement(t, {
      businessId,
      planKey: "basic",
      status: "expired",
    });

    const scoped = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", spaceId),
    );
    expect(scoped).toBeNull();
    const business = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(business).toBeNull();
  });

  test("returns null when nothing active exists", async () => {
    const t = convexTest(schema, modules);
    const { businessId, spaceId } = await seedBusinessAndSpace(t);
    const resolved = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", spaceId),
    );
    expect(resolved).toBeNull();
  });
});

describe("admin.approveActivation (RFC-001 §2.3)", () => {
  async function seedApproval(
    t: ReturnType<typeof convexTest>,
    businessId: Id<"businesses">,
    profileId: Id<"serviceProfiles">,
  ) {
    return t.run(async (ctx) => {
      const now = Date.now();
      const adminId = await ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        emailVerificationTime: now,
      });
      const requestId = await ctx.db.insert("serviceActivationRequests", {
        businessId,
        serviceProfileId: profileId,
        requestedService: "scanme_memories",
        status: "new",
        requestedAt: now,
        updatedAt: now,
        emailStatus: "queued",
      });
      return { adminId, requestId };
    });
  }

  test("one call yields active profile, readable entitlement, and closed request", async () => {
    process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
    const t = convexTest(schema, modules);
    const { businessId, memoriesProfileId } = await seedBusinessAndSpace(t);
    // Reset profile to inactive to prove the mutation flips it.
    await t.run((ctx) =>
      ctx.db.patch(memoriesProfileId, { status: "inactive" }),
    );
    const { adminId, requestId } = await seedApproval(
      t,
      businessId,
      memoriesProfileId,
    );
    const asAdmin = t.withIdentity({
      subject: adminId,
      issuer: "https://test.local",
    });

    const result = await asAdmin.mutation(api.admin.approveActivation, {
      requestId,
      planKey: "standard",
    });
    expect(result.activated).toBe(true);

    const profile = await t.run((ctx) => ctx.db.get(memoriesProfileId));
    expect(profile?.status).toBe("active");

    const request = await t.run((ctx) => ctx.db.get(requestId));
    expect(request?.status).toBe("closed");

    const entitlement = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(entitlement?.planKey).toBe("standard");
    expect(entitlement?.status).toBe("active");
    expect(entitlement?.limits.photosPerGuest).toBe(5);
  });

  test("a space-scoped grant resolves only for that space", async () => {
    process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
    const t = convexTest(schema, modules);
    const { businessId, memoriesProfileId, spaceId, otherSpaceId } =
      await seedBusinessAndSpace(t);
    const { adminId, requestId } = await seedApproval(
      t,
      businessId,
      memoriesProfileId,
    );
    const asAdmin = t.withIdentity({
      subject: adminId,
      issuer: "https://test.local",
    });

    await asAdmin.mutation(api.admin.approveActivation, {
      requestId,
      planKey: "premium",
      spaceId,
    });

    const forThatSpace = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", spaceId),
    );
    expect(forThatSpace?.planKey).toBe("premium");

    // Another space has no space-scoped grant and no business-scoped fallback.
    const otherSpace = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories", otherSpaceId),
    );
    expect(otherSpace).toBeNull();

    // Business scope alone also resolves nothing (the grant is space-scoped).
    const businessScope = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(businessScope).toBeNull();
  });
});

describe("entitlement expiry cron (RFC-001 §2.3)", () => {
  test("flips a past-validUntil active row to expired, leaves a future one alone", async () => {
    const t = convexTest(schema, modules);
    const { businessId, spaceId } = await seedBusinessAndSpace(t);
    const now = Date.now();
    const pastId = await insertEntitlement(t, {
      businessId,
      planKey: "basic",
      status: "active",
      validUntil: now - 60_000,
    });
    const futureId = await insertEntitlement(t, {
      businessId,
      planKey: "premium",
      status: "active",
      spaceId,
      validUntil: now + 60 * 60 * 1000,
    });
    // A perpetual (no validUntil) active row must also be left untouched.
    const perpetualId = await insertEntitlement(t, {
      businessId,
      planKey: "standard",
      status: "active",
    });

    const result = await t.mutation(
      internal.entitlements.sweepExpiredEntitlements,
      {},
    );
    expect(result.expired).toBe(1);

    const rows = await t.run(async (ctx) => ({
      past: await ctx.db.get(pastId),
      future: await ctx.db.get(futureId),
      perpetual: await ctx.db.get(perpetualId),
    }));
    expect(rows.past?.status).toBe("expired");
    expect(rows.future?.status).toBe("active");
    expect(rows.perpetual?.status).toBe("active");
  });
});
