/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { getEntitlement } from "./lib/entitlements";
import { buildPriceSnapshot } from "./lib/orderSnapshot";
import { DEFAULT_PRICING_CONSTANTS, price } from "../lib/pricing/engine";
import {
  computeOrderBreakdown,
  createDefaultProductSelection,
} from "../lib/scanme-pricing";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  const adminId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: Date.now(),
    }),
  );
  return t.withIdentity({ subject: adminId, issuer: "https://test.local" });
}

async function seedBusiness(
  t: ReturnType<typeof convexTest>,
  slug: string,
  opts: { memoriesProfileStatus?: "active" | "inactive" } = {},
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: `Lokal ${slug}`,
      slug,
      status: "active",
      createdAt: now,
    });
    let memoriesProfileId: Id<"serviceProfiles"> | null = null;
    if (opts.memoriesProfileStatus) {
      memoriesProfileId = await ctx.db.insert("serviceProfiles", {
        businessId,
        type: "scanme_memories",
        slug: `${slug}-memories`,
        status: opts.memoriesProfileStatus,
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { businessId, memoriesProfileId };
  });
}

describe("createOrder — the price snapshot (RFC-002 §2.5)", () => {
  test("freezes the engine breakdown the buyer was quoted", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdmin(t);
    const { businessId } = await seedBusiness(t, "kafana-a");

    const result = await asAdmin.mutation(api.orders.createOrder, {
      accountName: "Kafana A",
      plan: "premium",
      planPeriod: "annual",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "annual" },
      ],
    });

    // The snapshot equals the pure engine's output frozen with a zero one-time
    // total — computed here from the SAME engine, so no currency literal is
    // asserted (RFC-002 §2.1: numbers are proven through the engine, not baked).
    const expected = buildPriceSnapshot(
      price({
        items: [{ service: "memories", period: "annual" }],
        plan: "premium",
        planPeriod: "annual",
      }),
      0,
    );
    expect(result.priceSnapshot).toEqual(expected);
    expect(result.priceSnapshot.recurringTotalRsd).toBe(
      expected.servicesChargedRsd + expected.planLine.amountRsd,
    );

    const stored = await t.run((ctx) => ctx.db.get(result.orderId));
    expect(stored?.status).toBe("pending");
    expect(stored?.priceSnapshot).toEqual(expected);
  });

  test("a physical line contributes the one-time total, kept apart from recurring", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdmin(t);
    const { businessId } = await seedBusiness(t, "kafana-fizicko");

    const selection = createDefaultProductSelection("two-piece-stand");
    const result = await asAdmin.mutation(api.orders.createOrder, {
      accountName: "Kafana Fizičko",
      plan: "basic",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "monthly" },
      ],
      physicalLines: [
        { businessId, boundService: "scanme_memories", selection },
      ],
    });

    const expectedOneTime = computeOrderBreakdown({
      service: "review",
      tier: "starter",
      period: "annual",
      products: [selection],
    }).oneTimeTotal;
    expect(expectedOneTime).toBeGreaterThan(0);
    expect(result.priceSnapshot.oneTimeTotalRsd).toBe(expectedOneTime);
    // The two kinds of money are never summed (§2.3): recurring carries the
    // plan+services, one-time carries the print — they live in separate fields.
    expect(result.priceSnapshot.recurringTotalRsd).not.toBe(expectedOneTime);

    const items = await t.run((ctx) =>
      ctx.db
        .query("orderItems")
        .withIndex("by_orderId", (q) => q.eq("orderId", result.orderId))
        .collect(),
    );
    expect(items.filter((i) => i.kind === "service")).toHaveLength(1);
    const physical = items.filter((i) => i.kind === "physical");
    expect(physical).toHaveLength(1);
    expect(physical[0].boundService).toBe("scanme_memories");
    expect(physical[0].lineTotalRsd).toBe(expectedOneTime);
  });

  test("only an admin may create an order", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t); // sets the admin allowlist, but we call unauthenticated
    const { businessId } = await seedBusiness(t, "kafana-anon");
    await expect(
      t.mutation(api.orders.createOrder, {
        accountName: "Anon",
        plan: "basic",
        serviceLines: [
          { businessId, service: "scanme_memories", period: "monthly" },
        ],
      }),
    ).rejects.toThrow();
  });
});

describe("the snapshot survives a price change (RFC-002 §2.5 — the proving test)", () => {
  test("raising a constant tomorrow leaves today's snapshot BYTE-IDENTICAL", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdmin(t);
    const { businessId } = await seedBusiness(t, "kafana-grandfather");

    const input = {
      items: [{ service: "memories" as const, period: "annual" as const }],
      plan: "premium" as const,
      planPeriod: "annual" as const,
    };

    const { orderId } = await asAdmin.mutation(api.orders.createOrder, {
      accountName: "Kafana Grandfather",
      plan: "premium",
      planPeriod: "annual",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "annual" },
      ],
    });

    const before = await t.run((ctx) => ctx.db.get(orderId));
    const snapshotJsonBefore = JSON.stringify(before?.priceSnapshot);

    // The live engine prices this cart off the current constant — the same value
    // the stored snapshot carries.
    const originalAnnual = DEFAULT_PRICING_CONSTANTS.service.memories.annual;
    expect(price(input).servicesChargedRsd).toBe(originalAnnual);
    expect(before?.priceSnapshot.servicesChargedRsd).toBe(originalAnnual);

    try {
      // "Raise the price tomorrow" — literally edit the pricing constant.
      DEFAULT_PRICING_CONSTANTS.service.memories.annual = originalAnnual + 5000;

      // The live engine now prices the identical cart higher…
      expect(price(input).servicesChargedRsd).toBe(originalAnnual + 5000);

      // …but the order sold yesterday is untouched — byte-for-byte.
      const after = await t.run((ctx) => ctx.db.get(orderId));
      expect(JSON.stringify(after?.priceSnapshot)).toBe(snapshotJsonBefore);
      expect(after?.priceSnapshot.servicesChargedRsd).toBe(originalAnnual);
    } finally {
      DEFAULT_PRICING_CONSTANTS.service.memories.annual = originalAnnual;
    }
  });
});

describe("markOrderPaid — the billing-port stub (RFC-002 §2.5)", () => {
  test("pending → paid provisions ownership; the tier resolves from the account plan", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdmin(t);
    // The location already has an INACTIVE memories profile — provisioning must
    // flip ownership on, not birth a second profile.
    const { businessId, memoriesProfileId } = await seedBusiness(
      t,
      "kafana-paid",
      { memoriesProfileStatus: "inactive" },
    );

    const { orderId, accountId } = await asAdmin.mutation(
      api.orders.createOrder,
      {
        accountName: "Kafana Paid",
        plan: "premium",
        planPeriod: "annual",
        serviceLines: [
          { businessId, service: "scanme_memories", period: "annual" },
        ],
      },
    );

    // Before payment: no ownership, and no live tier.
    const beforeProfile = await t.run((ctx) => ctx.db.get(memoriesProfileId!));
    expect(beforeProfile?.status).toBe("inactive");

    const paid = await asAdmin.mutation(api.orders.markOrderPaid, { orderId });
    expect(paid.status).toBe("provisioned");
    expect(paid.provisioned).toBe(1);

    const order = await t.run((ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe("provisioned");

    // Ownership: the existing profile is now active, and no duplicate was made.
    const profiles = await t.run((ctx) =>
      ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", businessId).eq("type", "scanme_memories"),
        )
        .collect(),
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0].status).toBe("active");

    // The account was adopted onto the location, and its premium plan resolves
    // the memories tier LIVE through getEntitlement step 3 — with ZERO
    // per-business entitlement rows written (§2.2.3).
    const business = await t.run((ctx) => ctx.db.get(businessId));
    expect(business?.accountId).toBe(accountId);

    const entitlement = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(entitlement?.planKey).toBe("premium");
    expect(entitlement?.limits.photosPerGuest).toBe(10);

    const rows = await t.run((ctx) =>
      ctx.db
        .query("entitlements")
        .withIndex("by_businessId_and_product", (q) =>
          q.eq("businessId", businessId).eq("product", "scanme_memories"),
        )
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });

  test("a second markOrderPaid is idempotent", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedAdmin(t);
    const { businessId } = await seedBusiness(t, "kafana-idem", {
      memoriesProfileStatus: "inactive",
    });
    const { orderId } = await asAdmin.mutation(api.orders.createOrder, {
      accountName: "Kafana Idem",
      plan: "premium",
      planPeriod: "annual",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "annual" },
      ],
    });

    await asAdmin.mutation(api.orders.markOrderPaid, { orderId });
    const again = await asAdmin.mutation(api.orders.markOrderPaid, { orderId });
    expect(again.status).toBe("provisioned");
    expect(again.alreadyDone).toBe(true);
  });
});
