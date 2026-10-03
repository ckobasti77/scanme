/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  addBillingPeriod,
  DAY_MS,
  deriveBillingStatus,
  EXPIRING_SOON_DAYS,
  GRACE_DAYS,
} from "./lib/billingCycle";
import { getEntitlement } from "./lib/entitlements";

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
  return {
    adminId,
    asAdmin: t.withIdentity({ subject: adminId, issuer: "https://test.local" }),
  };
}

async function seedAccount(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<Doc<"accounts">> = {},
) {
  return t.run((ctx) => {
    const now = Date.now();
    return ctx.db.insert("accounts", {
      name: "Kafana Test",
      plan: "premium",
      planPeriod: "annual",
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
  });
}

async function seedBusiness(
  t: ReturnType<typeof convexTest>,
  slug: string,
  accountId?: Id<"accounts">,
) {
  return t.run((ctx) =>
    ctx.db.insert("businesses", {
      name: `Lokal ${slug}`,
      slug,
      status: "active",
      ...(accountId ? { accountId } : {}),
      createdAt: Date.now(),
    }),
  );
}

async function seedServiceProfile(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
  type: Doc<"serviceProfiles">["type"],
  slug: string,
  status: "active" | "inactive" = "active",
) {
  return t.run((ctx) => {
    const now = Date.now();
    return ctx.db.insert("serviceProfiles", {
      businessId,
      type,
      slug,
      status,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function paymentsFor(
  t: ReturnType<typeof convexTest>,
  accountId: Id<"accounts">,
) {
  return t.run(async (ctx) => {
    const all = await ctx.db.query("payments").collect();
    return all.filter((payment) => payment.accountId === accountId);
  });
}

async function auditFor(
  t: ReturnType<typeof convexTest>,
  accountId: Id<"accounts">,
) {
  return t.run(async (ctx) => {
    const all = await ctx.db.query("adminAuditLog").collect();
    return all.filter((row) => row.accountId === accountId);
  });
}

// -----------------------------------------------------------------------------
// The pure half: calendar arithmetic and the four-status derivation.
// -----------------------------------------------------------------------------

describe("addBillingPeriod — calendar advance with day clamping", () => {
  test("plain month and year steps", () => {
    const mar15 = Date.UTC(2026, 2, 15, 10, 30);
    expect(addBillingPeriod(mar15, "monthly")).toBe(Date.UTC(2026, 3, 15, 10, 30));
    expect(addBillingPeriod(mar15, "annual")).toBe(Date.UTC(2027, 2, 15, 10, 30));
  });

  test("Jan 31 + month clamps to the end of February, never March 3", () => {
    const jan31 = Date.UTC(2026, 0, 31);
    expect(addBillingPeriod(jan31, "monthly")).toBe(Date.UTC(2026, 1, 28));
  });

  test("Feb 29 + year clamps to Feb 28", () => {
    const feb29 = Date.UTC(2024, 1, 29);
    expect(addBillingPeriod(feb29, "annual")).toBe(Date.UTC(2025, 1, 28));
  });
});

describe("deriveBillingStatus — the four operational statuses (§2.6)", () => {
  const now = Date.UTC(2026, 7, 31);
  const base = {
    accountStatus: "active" as const,
    hasActiveService: true,
    anyServiceConfigured: true,
    now,
  };

  test("active: far from due, configured", () => {
    expect(
      deriveBillingStatus({ ...base, nextBillingAt: now + 60 * DAY_MS }),
    ).toBe("active");
    // Exactly 14 days out is NOT yet "expiring".
    expect(
      deriveBillingStatus({
        ...base,
        nextBillingAt: now + EXPIRING_SOON_DAYS * DAY_MS,
      }),
    ).toBe("active");
    // No tracked cycle at all → active, not expired.
    expect(deriveBillingStatus({ ...base, nextBillingAt: null })).toBe("active");
  });

  test("expiring_soon: due inside 14 days, including already past due within grace", () => {
    expect(
      deriveBillingStatus({ ...base, nextBillingAt: now + 5 * DAY_MS }),
    ).toBe("expiring_soon");
    // Late but inside grace — "ko kasni" reads off the negative daysLeft.
    expect(
      deriveBillingStatus({
        ...base,
        nextBillingAt: now - (GRACE_DAYS - 1) * DAY_MS,
      }),
    ).toBe("expiring_soon");
  });

  test("expired: grace elapsed live, or the account row already flipped", () => {
    expect(
      deriveBillingStatus({ ...base, nextBillingAt: now - GRACE_DAYS * DAY_MS }),
    ).toBe("expired");
    expect(
      deriveBillingStatus({
        ...base,
        accountStatus: "expired",
        nextBillingAt: null,
      }),
    ).toBe("expired");
    expect(
      deriveBillingStatus({
        ...base,
        accountStatus: "suspended",
        nextBillingAt: now + 60 * DAY_MS,
      }),
    ).toBe("expired");
  });

  test("paid_never_configured: active service, nothing configured — and its priority", () => {
    expect(
      deriveBillingStatus({
        ...base,
        anyServiceConfigured: false,
        nextBillingAt: now + 60 * DAY_MS,
      }),
    ).toBe("paid_never_configured");
    // It beats expiring_soon (the call-them-now signal wins)…
    expect(
      deriveBillingStatus({
        ...base,
        anyServiceConfigured: false,
        nextBillingAt: now + 5 * DAY_MS,
      }),
    ).toBe("paid_never_configured");
    // …but a truly expired account is expired.
    expect(
      deriveBillingStatus({
        ...base,
        anyServiceConfigured: false,
        nextBillingAt: now - GRACE_DAYS * DAY_MS,
      }),
    ).toBe("expired");
    // No active service at all → not the churn flag.
    expect(
      deriveBillingStatus({
        ...base,
        hasActiveService: false,
        anyServiceConfigured: false,
        nextBillingAt: null,
      }),
    ).toBe("active");
  });
});

// -----------------------------------------------------------------------------
// recordManualPayment — THE MAIN FLOW: the admin's entry moves the cycle.
// -----------------------------------------------------------------------------

describe("recordManualPayment", () => {
  test("writes the history row, advances by planPeriod, and trails the audit", async () => {
    const t = convexTest(schema, modules);
    const { adminId, asAdmin } = await seedAdmin(t);
    const paidThrough = Date.now() + 10 * DAY_MS;
    const accountId = await seedAccount(t, { planValidUntil: paidThrough });

    const paidAt = Date.now() - 2 * DAY_MS; // backdated bank transfer
    const result = await asAdmin.mutation(api.billing.recordManualPayment, {
      accountId,
      amountRsd: 12000,
      paidAt,
      reference: "Nalog 123-456",
    });

    // Early renewal extends from the CURRENT paid-through, not the pay date.
    expect(result.coversUntil).toBe(addBillingPeriod(paidThrough, "annual"));

    const payments = await paymentsFor(t, accountId);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      amountRsd: 12000,
      method: "manual",
      reference: "Nalog 123-456",
      paidAt,
      coversUntil: result.coversUntil,
      recordedByUserId: adminId,
    });

    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.planValidUntil).toBe(result.coversUntil);
    expect(account?.planSource).toBe("manual");

    // Who / what / when, in the same transaction.
    const audit = await auditFor(t, accountId);
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe(adminId);
    expect(audit[0].action).toBe("record_payment");
    const detail = JSON.parse(audit[0].detail ?? "{}");
    expect(detail).toMatchObject({ amountRsd: 12000, paidAt });
  });

  test("a client returning after a long lapse starts a fresh period from the payment", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    const longDead = Date.now() - 90 * DAY_MS;
    const accountId = await seedAccount(t, {
      planPeriod: "monthly",
      planValidUntil: longDead,
      status: "expired",
    });

    const paidAt = Date.now() - DAY_MS;
    const result = await asAdmin.mutation(api.billing.recordManualPayment, {
      accountId,
      amountRsd: 3000,
      paidAt,
    });

    expect(result.coversUntil).toBe(addBillingPeriod(paidAt, "monthly"));
    expect(result.reactivated).toBe(true);
    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.status).toBe("active");
  });

  test("reactivation restores the account-plan tier in getEntitlement", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    const accountId = await seedAccount(t, { status: "expired" });
    const businessId = await seedBusiness(t, "kafana-vracen", accountId);

    const before = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(before).toBeNull(); // expired account resolves nothing (step 3 gate)

    await asAdmin.mutation(api.billing.recordManualPayment, {
      accountId,
      amountRsd: 9990,
      paidAt: Date.now(),
    });

    const after = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(after?.planKey).toBe("premium");
  });

  test("an explicit coversUntil beats the period derivation", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    const accountId = await seedAccount(t);
    const paidAt = Date.now();
    const coversUntil = paidAt + 45 * DAY_MS;

    const result = await asAdmin.mutation(api.billing.recordManualPayment, {
      accountId,
      amountRsd: 5000,
      paidAt,
      coversUntil,
    });
    expect(result.coversUntil).toBe(coversUntil);
  });

  test("no period on file and no coversUntil → loud error, cycle untouched", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    // A basic-plan account: free plan, no planPeriod — paid services only.
    const accountId = await seedAccount(t, { plan: "basic", planPeriod: undefined });

    await expect(
      asAdmin.mutation(api.billing.recordManualPayment, {
        accountId,
        amountRsd: 5000,
        paidAt: Date.now(),
      }),
    ).rejects.toThrow(/period naplate/);
    expect(await paymentsFor(t, accountId)).toHaveLength(0);
  });

  test("rejects junk: future dates, non-positive amounts, suspended stays suspended", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    const accountId = await seedAccount(t);

    await expect(
      asAdmin.mutation(api.billing.recordManualPayment, {
        accountId,
        amountRsd: 5000,
        paidAt: Date.now() + 3 * DAY_MS,
      }),
    ).rejects.toThrow(/budućnosti/);
    await expect(
      asAdmin.mutation(api.billing.recordManualPayment, {
        accountId,
        amountRsd: 0,
        paidAt: Date.now(),
      }),
    ).rejects.toThrow(/Neispravna uplata/);

    const suspendedId = await seedAccount(t, { status: "suspended" });
    await asAdmin.mutation(api.billing.recordManualPayment, {
      accountId: suspendedId,
      amountRsd: 5000,
      paidAt: Date.now(),
    });
    const suspended = await t.run((ctx) => ctx.db.get(suspendedId));
    expect(suspended?.status).toBe("suspended"); // only an admin lifts a suspension
  });

  test("non-admin is refused", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    const accountId = await seedAccount(t);
    const outsiderId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "gost@scanme.test",
        emailVerificationTime: Date.now(),
      }),
    );
    const asOutsider = t.withIdentity({
      subject: outsiderId,
      issuer: "https://test.local",
    });
    await expect(
      asOutsider.mutation(api.billing.recordManualPayment, {
        accountId,
        amountRsd: 5000,
        paidAt: Date.now(),
      }),
    ).rejects.toThrow(/administratorski/);
  });
});

// -----------------------------------------------------------------------------
// Corrections: void + explicit cycle set, both audited.
// -----------------------------------------------------------------------------

describe("corrections", () => {
  test("voidPayment flags the row, writes the trail, and refuses a double void", async () => {
    const t = convexTest(schema, modules);
    const { adminId, asAdmin } = await seedAdmin(t);
    const accountId = await seedAccount(t);
    const { paymentId } = await asAdmin.mutation(api.billing.recordManualPayment, {
      accountId,
      amountRsd: 21000, // the typo: should have been 12000
      paidAt: Date.now(),
    });

    await asAdmin.mutation(api.billing.voidPayment, {
      paymentId,
      reason: "pogrešan iznos",
    });
    const payment = await t.run((ctx) => ctx.db.get(paymentId));
    expect(payment?.voidedAt).toBeDefined();
    expect(payment?.voidedByUserId).toBe(adminId);

    await expect(
      asAdmin.mutation(api.billing.voidPayment, { paymentId }),
    ).rejects.toThrow(/već stornirana/);

    const audit = await auditFor(t, accountId);
    const voidRow = audit.find((row) => row.action === "void_payment");
    expect(voidRow).toBeDefined();
    expect(JSON.parse(voidRow?.detail ?? "{}")).toMatchObject({
      amountRsd: 21000,
      reason: "pogrešan iznos",
    });
  });

  test("setNextBillingAt sets, clears, reactivates, and trails", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    const accountId = await seedAccount(t, {
      status: "expired",
      planValidUntil: Date.now() - 30 * DAY_MS,
    });

    const to = Date.now() + 30 * DAY_MS;
    const result = await asAdmin.mutation(api.billing.setNextBillingAt, {
      accountId,
      nextBillingAt: to,
    });
    expect(result.reactivated).toBe(true);
    let account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.planValidUntil).toBe(to);
    expect(account?.status).toBe("active");

    await asAdmin.mutation(api.billing.setNextBillingAt, {
      accountId,
      nextBillingAt: null,
    });
    account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.planValidUntil).toBeUndefined();

    const audit = await auditFor(t, accountId);
    expect(
      audit.filter((row) => row.action === "set_next_billing"),
    ).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------------
// markOrderPaid — the order settlement records into the SAME history.
// -----------------------------------------------------------------------------

describe("markOrderPaid + payments (TASK-31 tail wired to the port)", () => {
  test("records one payment with the snapshot total, advances the cycle, provisions", async () => {
    const t = convexTest(schema, modules);
    const { adminId, asAdmin } = await seedAdmin(t);
    const businessId = await seedBusiness(t, "kafana-orders");

    const { orderId, accountId, priceSnapshot } = await asAdmin.mutation(
      api.orders.createOrder,
      {
        accountName: "Kafana Orders",
        plan: "premium",
        planPeriod: "annual",
        serviceLines: [
          { businessId, service: "scanme_memories", period: "annual" },
        ],
      },
    );

    const paidAt = Date.now() - DAY_MS;
    await asAdmin.mutation(api.orders.markOrderPaid, {
      orderId,
      externalRef: "izvod-42",
      paidAt,
    });

    const payments = await paymentsFor(t, accountId);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      orderId,
      amountRsd: priceSnapshot.recurringTotalRsd + priceSnapshot.oneTimeTotalRsd,
      method: "manual",
      reference: "izvod-42",
      paidAt,
      recordedByUserId: adminId,
      coversUntil: addBillingPeriod(paidAt, "annual"),
    });

    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.planValidUntil).toBe(addBillingPeriod(paidAt, "annual"));

    const audit = await auditFor(t, accountId);
    expect(audit.map((row) => row.action).sort()).toEqual([
      "create_order",
      "record_payment",
    ]);
  });

  test("a resumed run never double-records the payment", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    const businessId = await seedBusiness(t, "kafana-resume");
    const { orderId, accountId } = await asAdmin.mutation(api.orders.createOrder, {
      accountName: "Kafana Resume",
      plan: "premium",
      planPeriod: "monthly",
      serviceLines: [
        { businessId, service: "scanme_memories", period: "monthly" },
      ],
    });

    await asAdmin.mutation(api.orders.markOrderPaid, { orderId });
    // Simulate a crash between payment and the provisioned flip: rewind status.
    await t.run((ctx) => ctx.db.patch(orderId, { status: "paid" }));
    await asAdmin.mutation(api.orders.markOrderPaid, { orderId });

    expect(await paymentsFor(t, accountId)).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// The provider seam — the webhook's target funnels into the same tables.
// -----------------------------------------------------------------------------

describe("applyProviderPayment (the webhook seam)", () => {
  test("normalizes through the port and records like any payment", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    const accountId = await seedAccount(t);
    const paidAt = Date.now();

    await t.mutation(internal.billing.applyProviderPayment, {
      portId: "manual",
      accountId,
      rawNotice: { amountRsd: 9990, paidAt, reference: "TXN-1" },
    });
    const payments = await paymentsFor(t, accountId);
    expect(payments).toHaveLength(1);
    expect(payments[0].reference).toBe("TXN-1");

    await expect(
      t.mutation(internal.billing.applyProviderPayment, {
        portId: "manual",
        accountId,
        rawNotice: { amountRsd: -5 },
      }),
    ).rejects.toThrow(/proveru adaptera/);
  });
});

// -----------------------------------------------------------------------------
// The daily sweep: resumable, idempotent, grace-aware.
// -----------------------------------------------------------------------------

describe("sweepBillingCycles", () => {
  test("flips only active accounts past due + grace; leaves grace, perpetual, suspended", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const overdueId = await seedAccount(t, {
      planValidUntil: now - (GRACE_DAYS + 1) * DAY_MS,
    });
    const inGraceId = await seedAccount(t, {
      planValidUntil: now - (GRACE_DAYS - 1) * DAY_MS,
    });
    const perpetualId = await seedAccount(t, { planValidUntil: undefined });
    const suspendedId = await seedAccount(t, {
      status: "suspended",
      planValidUntil: now - 30 * DAY_MS,
    });

    await t.mutation(internal.billing.sweepBillingCycles, {});
    // Idempotent: a second run changes nothing further.
    await t.mutation(internal.billing.sweepBillingCycles, {});

    const statuses = await t.run(async (ctx) => ({
      overdue: (await ctx.db.get(overdueId))?.status,
      inGrace: (await ctx.db.get(inGraceId))?.status,
      perpetual: (await ctx.db.get(perpetualId))?.status,
      suspended: (await ctx.db.get(suspendedId))?.status,
    }));
    expect(statuses).toEqual({
      overdue: "expired",
      inGrace: "active",
      perpetual: "active",
      suspended: "suspended",
    });
  });

  test("a backlog larger than one batch drains through self-rescheduling", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const overdue = now - (GRACE_DAYS + 5) * DAY_MS;
    const ids: Id<"accounts">[] = [];
    await t.run(async (ctx) => {
      for (let i = 0; i < 105; i += 1) {
        ids.push(
          await ctx.db.insert("accounts", {
            name: `Dužnik ${i}`,
            plan: "premium",
            planPeriod: "monthly",
            status: "active",
            planValidUntil: overdue,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
    });

    vi.useFakeTimers();
    try {
      await t.mutation(internal.billing.sweepBillingCycles, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    const remaining = await t.run(async (ctx) => {
      const all = await ctx.db.query("accounts").collect();
      return all.filter((account) => account.status !== "expired").length;
    });
    expect(remaining).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// billingOverview — the read model the task-12 table only displays.
// -----------------------------------------------------------------------------

describe("billingOverview", () => {
  test("derives all four statuses and sorts the churn predictor to the top", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    const now = Date.now();

    // 1. Paid and configured, due far out → active.
    const configuredId = await seedAccount(t, {
      name: "Podešen",
      planValidUntil: now + 60 * DAY_MS,
    });
    const configuredBusiness = await seedBusiness(t, "podesen", configuredId);
    const configuredProfile = await seedServiceProfile(
      t,
      configuredBusiness,
      "scanme_memories",
      "podesen-memories",
    );
    await t.run((ctx) =>
      ctx.db.insert("memoriesSpaces", {
        businessId: configuredBusiness,
        memoriesProfileId: configuredProfile,
        code: "podesen1",
        name: "Sala",
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
      }),
    );

    // 2. Paid, service active, NOTHING configured → the churn predictor.
    const neverId = await seedAccount(t, {
      name: "Nikad podešen",
      planValidUntil: now + 60 * DAY_MS,
    });
    const neverBusiness = await seedBusiness(t, "nikad", neverId);
    await seedServiceProfile(t, neverBusiness, "scanme_memories", "nikad-memories");

    // 3. Due in five days → expiring soon.
    const expiringId = await seedAccount(t, {
      name: "Ističe",
      planValidUntil: now + 5 * DAY_MS,
    });

    // 4. Overdue beyond grace, cron not yet run → derived expired LIVE.
    const expiredId = await seedAccount(t, {
      name: "Istekao",
      planValidUntil: now - (GRACE_DAYS + 2) * DAY_MS,
    });

    const rows = await asAdmin.query(api.billing.billingOverview, { now });
    const byId = new Map(rows.map((row) => [row.accountId, row]));

    expect(byId.get(configuredId)?.status).toBe("active");
    expect(byId.get(neverId)?.status).toBe("paid_never_configured");
    expect(byId.get(neverId)?.unconfiguredServices).toEqual(["scanme_memories"]);
    expect(byId.get(expiringId)?.status).toBe("expiring_soon");
    expect(byId.get(expiringId)?.daysLeft).toBe(5);
    expect(byId.get(expiredId)?.status).toBe("expired");
    expect(byId.get(expiredId)?.daysLeft).toBeLessThan(0);

    // Work-queue order: the churn predictor first.
    expect(rows[0].accountId).toBe(neverId);
  });

  test("last payment skips voided rows", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin } = await seedAdmin(t);
    const accountId = await seedAccount(t);
    const now = Date.now();

    await asAdmin.mutation(api.billing.recordManualPayment, {
      accountId,
      amountRsd: 1000,
      paidAt: now - 10 * DAY_MS,
    });
    const { paymentId: wrongId } = await asAdmin.mutation(
      api.billing.recordManualPayment,
      { accountId, amountRsd: 99999, paidAt: now - DAY_MS },
    );
    await asAdmin.mutation(api.billing.voidPayment, { paymentId: wrongId });

    const rows = await asAdmin.query(api.billing.billingOverview, { now });
    const row = rows.find((candidate) => candidate.accountId === accountId);
    expect(row?.lastPaymentAmountRsd).toBe(1000);
    expect(row?.lastPaymentAt).toBe(now - 10 * DAY_MS);
  });
});
