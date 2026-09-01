/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { getEntitlement } from "./lib/entitlements";
import { createDefaultProductSelection } from "../lib/scanme-pricing";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://test.local";
const ADMIN_EMAIL = "admin@scanme.test";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

// A REGULAR buyer (not an admin email — so requireBusinessAccess is proven the
// self-serve way, through membership, not the admin bypass) plus one business
// they own via an active membership. This is the shape onboarding leaves behind:
// a signed-in owner with a location and no account yet.
async function seedBuyerWithBusiness(
  t: ReturnType<typeof convexTest>,
  slug: string,
  opts: { email?: string; memoriesProfileStatus?: "active" | "inactive" } = {},
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: opts.email ?? `owner-${slug}@buyer.test`,
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: `Lokal ${slug}`,
      slug,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId,
      businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    if (opts.memoriesProfileStatus) {
      await ctx.db.insert("serviceProfiles", {
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
    return { userId, businessId };
  });
}

async function entitlementRows(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
  product: "scanme_memories" | "scanme_venue",
) {
  return t.run((ctx) =>
    ctx.db
      .query("entitlements")
      .withIndex("by_businessId_and_product", (q) =>
        q.eq("businessId", businessId).eq("product", product),
      )
      .collect(),
  );
}

describe("checkout — the success criterion (RFC-002 §4 task 10)", () => {
  test("post-checkout, getEntitlement resolves the BOUGHT tier from the account plan, with ZERO entitlement rows", async () => {
    const t = convexTest(schema, modules);
    const { userId, businessId } = await seedBuyerWithBusiness(t, "kafana-premium");
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });

    const result = await asBuyer.mutation(api.checkout.checkout, {
      accountName: "Kafana Premium",
      plan: "premium",
      planPeriod: "annual",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "annual" },
        { businessId, service: "scanme_venue", period: "annual" },
      ],
    });
    expect(result.provisioning).toBe("complete");

    // The account carries the plan; the business was adopted onto it.
    const business = await t.run((ctx) => ctx.db.get(businessId));
    expect(business?.accountId).toBe(result.accountId);
    const account = await t.run((ctx) => ctx.db.get(result.accountId));
    expect(account?.plan).toBe("premium");
    expect(account?.status).toBe("active");

    // THE TEST: every bought service resolves its premium tier LIVE from the
    // account plan (getEntitlement step 3), derived — not written.
    const memories = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(memories?.planKey).toBe("premium");
    expect(memories?.limits.photosPerGuest).toBe(10);

    const venue = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_venue"),
    );
    expect(venue?.planKey).toBe("premium");
    expect(venue?.limits.analytics).toBe(true);

    // …with ZERO entitlement rows for either product. A written row would make
    // "Premium applies to every future service too" a lie at the next purchase.
    expect(await entitlementRows(t, businessId, "scanme_memories")).toHaveLength(0);
    expect(await entitlementRows(t, businessId, "scanme_venue")).toHaveLength(0);

    // Ownership was flipped on for both services.
    const profiles = await t.run((ctx) =>
      ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect(),
    );
    const active = profiles.filter((p) => p.status === "active");
    expect(active.map((p) => p.type).sort()).toEqual(
      ["scanme_memories", "scanme_venue"].sort(),
    );

    // The order carries the snapshot and is a pending stub (payment is separate).
    const order = await t.run((ctx) => ctx.db.get(result.orderId));
    expect(order?.status).toBe("pending");
    expect(order?.billingSource).toBe("manual");
    expect(order?.priceSnapshot.recurringTotalRsd).toBeGreaterThan(0);
  });

  test("a basic checkout resolves the basic tier — the free plan still owns services", async () => {
    const t = convexTest(schema, modules);
    const { userId, businessId } = await seedBuyerWithBusiness(t, "kafana-basic");
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });

    await asBuyer.mutation(api.checkout.checkout, {
      accountName: "Kafana Basic",
      plan: "basic",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "monthly" },
      ],
    });

    const memories = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(memories?.planKey).toBe("basic");
    expect(memories?.limits.photosPerGuest).toBe(3);
    expect(await entitlementRows(t, businessId, "scanme_memories")).toHaveLength(0);
  });

  test("an inactive existing profile is flipped on, never duplicated", async () => {
    const t = convexTest(schema, modules);
    const { userId, businessId } = await seedBuyerWithBusiness(t, "kafana-flip", {
      memoriesProfileStatus: "inactive",
    });
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });

    await asBuyer.mutation(api.checkout.checkout, {
      accountName: "Kafana Flip",
      plan: "premium",
      planPeriod: "annual",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "annual" },
      ],
    });

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
  });

  test("checkout requires access to every location (requireBusinessAccess, untouched)", async () => {
    const t = convexTest(schema, modules);
    const { businessId } = await seedBuyerWithBusiness(t, "kafana-locked");
    // A DIFFERENT signed-in user with no membership on the business.
    const strangerId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "stranger@nobody.test" }),
    );
    const asStranger = t.withIdentity({ subject: strangerId, issuer: ISSUER });
    await expect(
      asStranger.mutation(api.checkout.checkout, {
        accountName: "Otmica",
        plan: "basic",
        serviceLines: [
          { businessId, service: "scanme_memories", period: "monthly" },
        ],
      }),
    ).rejects.toThrow();
  });

  test("an unauthenticated checkout is refused", async () => {
    const t = convexTest(schema, modules);
    const { businessId } = await seedBuyerWithBusiness(t, "kafana-anon");
    await expect(
      t.mutation(api.checkout.checkout, {
        accountName: "Anon",
        plan: "basic",
        serviceLines: [
          { businessId, service: "scanme_memories", period: "monthly" },
        ],
      }),
    ).rejects.toThrow();
  });
});

describe("checkout — payment is a stub against the billing port (RFC-002 §2.5)", () => {
  test("pending → paid via markOrderPaid records the payment and provisions", async () => {
    const t = convexTest(schema, modules);
    const { userId, businessId } = await seedBuyerWithBusiness(t, "kafana-pay");
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });

    const { orderId } = await asBuyer.mutation(api.checkout.checkout, {
      accountName: "Kafana Pay",
      plan: "premium",
      planPeriod: "annual",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "annual" },
      ],
    });

    // The buyer is an admin here so they may run the back-office payment action.
    const adminId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });
    const paid = await asAdmin.mutation(api.orders.markOrderPaid, { orderId });
    expect(paid.status).toBe("provisioned");

    const order = await t.run((ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe("provisioned");
    const payments = await t.run((ctx) =>
      ctx.db
        .query("payments")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .collect(),
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].amountRsd).toBe(
      order!.priceSnapshot.recurringTotalRsd + order!.priceSnapshot.oneTimeTotalRsd,
    );
  });
});

describe("checkout — the splitter (razdelnik, RFC-002 §2.4 / TASK-37)", () => {
  test("a physical line bound to Links + Memories is REFUSED, loud, at checkout — nothing is written", async () => {
    const t = convexTest(schema, modules);
    const { userId, businessId } = await seedBuyerWithBusiness(t, "kafana-blok");
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });

    await expect(
      asBuyer.mutation(api.checkout.checkout, {
        accountName: "Kafana Blok",
        plan: "basic",
        serviceLines: [
          { businessId, service: "scanme_links", period: "monthly" },
          { businessId, service: "scanme_memories", period: "monthly" },
        ],
        physicalLines: [
          {
            businessId,
            boundServices: ["scanme_links", "scanme_memories"],
            selection: createDefaultProductSelection("two-piece-stand"),
          },
        ],
      }),
    ).rejects.toThrow(/Memories/);

    // The refusal is BEFORE any write: no order, no account adoption.
    const orders = await t.run((ctx) => ctx.db.query("orders").collect());
    expect(orders).toHaveLength(0);
    const business = await t.run((ctx) => ctx.db.get(businessId));
    expect(business?.accountId).toBeUndefined();
  });

  test("a physical line bound to Links + Venue provisions a splitter card (kind splitter, one button each)", async () => {
    const t = convexTest(schema, modules);
    const { userId, businessId } = await seedBuyerWithBusiness(t, "kafana-razdelnik");
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });

    await asBuyer.mutation(api.checkout.checkout, {
      accountName: "Kafana Razdelnik",
      plan: "basic",
      serviceLines: [
        { businessId, service: "scanme_links", period: "monthly" },
        { businessId, service: "scanme_venue", period: "monthly" },
      ],
      physicalLines: [
        {
          businessId,
          boundServices: ["scanme_links", "scanme_venue"],
          selection: createDefaultProductSelection("two-piece-stand"),
        },
      ],
    });

    const cards = await t.run((ctx) =>
      ctx.db
        .query("cards")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect(),
    );
    expect(cards).toHaveLength(1);
    const target = await t.run((ctx) =>
      ctx.db
        .query("cardTargets")
        .withIndex("by_cardId", (q) => q.eq("cardId", cards[0]._id))
        .unique(),
    );
    expect(target?.kind).toBe("splitter");
    expect(target?.splitterItems).toHaveLength(2);
    const kinds = (target?.splitterItems ?? []).map((i) => i.kind).sort();
    expect(kinds).toEqual(["service_page", "venue"]);

    // The physical orderItem recorded the full binding and the minted card.
    const items = await t.run((ctx) =>
      ctx.db.query("orderItems").collect(),
    );
    const physical = items.find((i) => i.kind === "physical");
    expect(physical?.boundServices).toEqual(["scanme_links", "scanme_venue"]);
    expect(physical?.provisionedCardId).toBe(cards[0]._id);
  });
});

describe("checkout — Enterprise fan-out is resumable without duplicates (RFC-002 §2.5, risk #5)", () => {
  // Drive the provisioning continuation to completion, following nextIndex — the
  // exact resume a crash recovery uses. convex-test does not auto-run scheduled
  // functions, so nothing double-executes.
  async function drainProvisioning(
    t: ReturnType<typeof convexTest>,
    orderId: Id<"orders">,
    ownerUserId: Id<"users">,
    startIndex: number,
  ) {
    let index = startIndex;
    for (let guard = 0; guard < 1000; guard += 1) {
      const result = await t.mutation(
        internal.checkout.provisionCheckoutOrder,
        { orderId, ownerUserId, index },
      );
      if (result.done) return;
      index = result.nextIndex;
    }
    throw new Error("provisioning did not terminate");
  }

  async function seedAdminAndLocations(
    t: ReturnType<typeof convexTest>,
    n: number,
  ) {
    return t.run(async (ctx) => {
      const now = Date.now();
      const adminId = await ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        emailVerificationTime: now,
      });
      const businessIds: Id<"businesses">[] = [];
      for (let i = 0; i < n; i += 1) {
        businessIds.push(
          await ctx.db.insert("businesses", {
            name: `Lokal ${i + 1}`,
            slug: `lanac-lokal-${i + 1}`,
            status: "active",
            createdAt: now,
          }),
        );
      }
      return { adminId, businessIds };
    });
  }

  test("a large order fans provisioning over the scheduler; a resume from index 0 makes no duplicates", async () => {
    const t = convexTest(schema, modules);
    const N = 13; // > PROVISION_BATCH (10): the fan-out spans multiple steps
    const { adminId, businessIds } = await seedAdminAndLocations(t, N);
    const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });

    const { orderId, provisioning } = await asAdmin.mutation(
      api.checkout.checkout,
      {
        accountName: "Kafanski lanac",
        plan: "premium",
        planPeriod: "annual",
        serviceLines: businessIds.map((businessId) => ({
          businessId,
          service: "scanme_memories" as const,
          period: "annual" as const,
        })),
      },
    );
    // The first batch ran inline; the rest was handed to the scheduler.
    expect(provisioning).toBe("fanned");

    // Resume from index 0 — the most adversarial resume, re-processing the batch
    // checkout already ran inline. Idempotent writes converge without dupes.
    await drainProvisioning(t, orderId, adminId, 0);

    // Every location owns Memories exactly once, and its tier resolves premium.
    for (const businessId of businessIds) {
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
      const resolved = await t.run((ctx) =>
        getEntitlement(ctx, businessId, "scanme_memories"),
      );
      expect(resolved?.planKey).toBe("premium");
    }
  });

  test("the entry's scheduled continuation completes the fan-out end-to-end", async () => {
    const t = convexTest(schema, modules);
    const N = 15;
    const { adminId, businessIds } = await seedAdminAndLocations(t, N);
    const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });

    vi.useFakeTimers();
    try {
      await asAdmin.mutation(api.checkout.checkout, {
        accountName: "Lanac sa schedulerom",
        plan: "premium",
        planPeriod: "annual",
        serviceLines: businessIds.map((businessId) => ({
          businessId,
          service: "scanme_memories" as const,
          period: "annual" as const,
        })),
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      for (const businessId of businessIds) {
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
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
