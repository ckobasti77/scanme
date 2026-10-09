/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { financeMonthBounds } from "../lib/admin-v1/finance";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-15T10:00:00Z");
const adminIdentity = (userId: Id<"users">) => ({ subject: userId, issuer: "https://admin14.test" });
const page = (numItems = 20, cursor: string | null = null) => ({ numItems, cursor });
const emptyPriceSnapshot = {
  engineVersion: 1,
  currency: "RSD" as const,
  lines: [],
  packages: [],
  groups: [],
  planLine: { plan: "basic" as const, period: null, amountRsd: 0, onRequest: false },
  servicesListRsd: 0,
  servicesChargedRsd: 0,
  savingsRsd: 0,
  recurringTotalRsd: 0,
  oneTimeTotalRsd: 0,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = "finance-admin@example.invalid";
});
afterEach(() => vi.useRealTimers());

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: "finance-admin@example.invalid", name: "Finansije Admin" });
    const outsiderId = await ctx.db.insert("users", { email: "outsider@example.invalid" });
    const accountId = await ctx.db.insert("accounts", { name: "Bistro Zelen", plan: "premium", status: "active", billingModel: "subscriptions_v1", adminV1MigrationVersion: 1, createdAt: 1, updatedAt: 1 });
    const otherAccountId = await ctx.db.insert("accounts", { name: "Drugi klijent", plan: "basic", status: "active", billingModel: "subscriptions_v1", adminV1MigrationVersion: 1, createdAt: 1, updatedAt: 1 });
    const businessId = await ctx.db.insert("businesses", { accountId, name: "Bistro Zelen Dorćol", slug: "bistro-zelen", status: "active", createdAt: 1 });
    const profileId = await ctx.db.insert("serviceProfiles", { businessId, type: "scanme_links", slug: "bistro-zelen-links", status: "active", totalScans: 0, totalPageViews: 0, totalConvertedSessions: 0, createdAt: 1, updatedAt: 1 });
    const agreementId = await ctx.db.insert("priceAgreements", {
      accountId,
      target: { kind: "service_instance", serviceProfileId: profileId },
      targetKey: `service:${profileId}`,
      period: "monthly",
      kind: "standard",
      reference: { amountMinor: 10_000, currency: "RSD" },
      price: { amountMinor: 10_000, currency: "RSD" },
      validFrom: 0,
      validUntil: null,
      change: { actor: { kind: "admin", userId: adminId }, at: 1, reason: "Test ugovor" },
      key: "agreement",
      fingerprint: "agreement",
    });
    const subscriptionId = await ctx.db.insert("subscriptions", {
      accountId,
      target: { kind: "service_instance", serviceProfileId: profileId },
      targetKey: `service:${profileId}`,
      businessId,
      period: "monthly",
      startsAt: Date.parse("2026-09-01T10:00:00Z"),
      anchorAt: Date.parse("2026-09-01T10:00:00Z"),
      renewal: { kind: "manual" },
      cancelAtPeriodEnd: false,
      facts: { status: "active", warning: false, currentPeriodStart: Date.parse("2026-09-01T10:00:00Z"), paidThrough: Date.parse("2026-10-01T10:00:00Z"), graceEndsAt: Date.parse("2026-10-08T10:00:00Z"), nextTransitionAt: Date.parse("2026-09-24T10:00:00Z") },
      nextTransitionAt: Date.parse("2026-09-24T10:00:00Z"),
      key: "subscription",
      fingerprint: "subscription",
      createdAt: 1,
      updatedAt: 1,
    });
    const periodId = await ctx.db.insert("subscriptionPeriods", {
      accountId,
      subscriptionId,
      start: Date.parse("2026-09-01T10:00:00Z"),
      end: Date.parse("2026-10-01T10:00:00Z"),
      price: { reference: { amountMinor: 10_000, currency: "RSD" }, effective: { amountMinor: 10_000, currency: "RSD" }, agreementId, basis: "standard", capturedAt: 1 },
      paidMinor: 0,
      funded: false,
      createdAt: 1,
    });
    return { adminId, outsiderId, accountId, otherAccountId, businessId, profileId, agreementId, subscriptionId, periodId };
  });
  return { t, ...ids, admin: t.withIdentity(adminIdentity(ids.adminId)), outsider: t.withIdentity(adminIdentity(ids.outsiderId)) };
}

async function seedSubscriptionPayment(seeded: Awaited<ReturnType<typeof seed>>, amountMinor = 10_000, unallocatedMinor = 0) {
  return seeded.admin.mutation(internal.subscriptionPayments.record, {
    accountId: seeded.accountId,
    amount: { amountMinor: amountMinor + unallocatedMinor, currency: "RSD" },
    unallocatedMinor,
    method: "bank_transfer",
    paidAt: Date.parse("2026-09-10T10:00:00Z"),
    allocations: [{ periodId: seeded.periodId, amountMinor }],
    key: `payment-${amountMinor}-${unallocatedMinor}`,
  });
}

async function insertUnallocatedPayment(
  seeded: Awaited<ReturnType<typeof seed>>,
  input: { amountMinor: number; paidAt: number; method: "bank_transfer" | "payment_card" | "cash" | "other"; key: string },
) {
  return seeded.t.run(async (ctx) => {
    const paymentId = await ctx.db.insert("payments", {
      accountId: seeded.accountId,
      amountRsd: input.amountMinor / 100,
      method: "manual",
      paidAt: input.paidAt,
      recordedByUserId: seeded.adminId,
      ledger: {
        amount: { amountMinor: input.amountMinor, currency: "RSD" },
        unallocatedMinor: input.amountMinor,
        method: input.method,
        recordedBy: { kind: "admin", userId: seeded.adminId },
        key: input.key,
        fingerprint: input.key,
      },
      createdAt: input.paidAt,
    });
    await ctx.db.insert("paymentStates", { accountId: seeded.accountId, paymentId, paidAt: input.paidAt, state: "settled" });
    return paymentId;
  });
}

type OverviewOverrides = Partial<{
  accountId: Id<"accounts">;
  now: number;
  collectedPeriod: "month" | "three_months" | "six_months" | "year" | "all_time";
  expectedPeriod: "next_month" | "three_months" | "six_months" | "year";
  filter: "total" | "physical" | "saas" | "premium" | "scanme_links" | "google_review" | "scanme_menu";
  profitFilter: "total" | "physical" | "saas" | "premium";
}>;

async function overview(seeded: Awaited<ReturnType<typeof seed>>, overrides: OverviewOverrides = {}) {
  return seeded.admin.query(api.adminFinance.overview, {
    now: NOW,
    collectedPeriod: "month",
    expectedPeriod: "three_months",
    filter: "total",
    profitFilter: "total",
    ...overrides,
  });
}

describe("ADMIN-14 payment projection and canonical aggregates", () => {
  test("cash uses paidAt, annual/monthly allocation is not spread, chart and methods reconcile", async () => {
    const seeded = await seed();
    await seedSubscriptionPayment(seeded);
    const result = await overview(seeded);
    expect(result.collected.amount.amountMinor).toBe(10_000);
    expect(result.collected.series.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(10_000);
    expect(result.methods.find((row) => row.method === "bank_transfer")).toMatchObject({ amountMinor: 10_000, percent: 100 });
    expect(result.categories.find((row) => row.category === "saas")?.collectedMinor).toBe(10_000);
    expect((await overview(seeded, { filter: "scanme_links" })).collected.amount.amountMinor).toBe(10_000);
    expect((await overview(seeded, { filter: "physical" })).collected.amount.amountMinor).toBe(0);
  });

  test("one mixed subscription payment stays one payment and splits SaaS and Premium exactly", async () => {
    const seeded = await seed();
    const premiumPeriodId = await seeded.t.run(async (ctx) => {
      const agreementId = await ctx.db.insert("priceAgreements", {
        accountId: seeded.accountId, target: { kind: "account_premium" }, targetKey: "premium", period: "monthly",
        kind: "individual", reference: { amountMinor: 20_000, currency: "RSD" }, price: { amountMinor: 20_000, currency: "RSD" },
        validFrom: 0, validUntil: null, change: { actor: { kind: "admin", userId: seeded.adminId }, at: 1, reason: "Test ugovor" },
        key: "premium-agreement", fingerprint: "premium-agreement",
      });
      const subscriptionId = await ctx.db.insert("subscriptions", {
        accountId: seeded.accountId, target: { kind: "account_premium" }, targetKey: "premium", period: "monthly",
        startsAt: Date.parse("2026-09-01T10:00:00Z"), anchorAt: Date.parse("2026-09-01T10:00:00Z"), renewal: { kind: "manual" },
        cancelAtPeriodEnd: false, facts: { status: "inactive", warning: false, currentPeriodStart: null, paidThrough: null, graceEndsAt: null, nextTransitionAt: null },
        key: "premium-subscription", fingerprint: "premium-subscription", createdAt: 1, updatedAt: 1,
      });
      return ctx.db.insert("subscriptionPeriods", {
        accountId: seeded.accountId, subscriptionId, start: Date.parse("2026-09-01T10:00:00Z"), end: Date.parse("2026-10-01T10:00:00Z"),
        price: { reference: { amountMinor: 20_000, currency: "RSD" }, effective: { amountMinor: 20_000, currency: "RSD" }, agreementId, basis: "individual", capturedAt: 1 },
        paidMinor: 0, funded: false, createdAt: 1,
      });
    });
    const paymentId = await seeded.admin.mutation(internal.subscriptionPayments.record, {
      accountId: seeded.accountId, amount: { amountMinor: 30_000, currency: "RSD" }, unallocatedMinor: 0,
      method: "payment_card", paidAt: Date.parse("2026-09-12T10:00:00Z"),
      allocations: [{ periodId: seeded.periodId, amountMinor: 10_000 }, { periodId: premiumPeriodId, amountMinor: 20_000 }], key: "mixed-payment",
    });
    const result = await overview(seeded);
    expect(result.collected.amount.amountMinor).toBe(30_000);
    expect(result.categories.reduce((sum, row) => sum + row.collectedMinor, 0)).toBe(result.collected.amount.amountMinor);
    expect(result.categories.find((row) => row.category === "saas")?.collectedMinor).toBe(10_000);
    expect(result.categories.find((row) => row.category === "premium")?.collectedMinor).toBe(20_000);
    expect((await overview(seeded, { filter: "premium", profitFilter: "premium" })).profit).toMatchObject({ complete: true, amount: { amountMinor: 20_000 }, costs: { amountMinor: 0 } });
    const list = await seeded.admin.query(api.adminFinance.listPayments, { filter: "total", paginationOpts: page() });
    expect(list.page).toHaveLength(1);
    expect(list.page[0].paymentId).toBe(paymentId);
    expect(list.page[0].allocations.map((row) => row.category).sort()).toEqual(["premium", "saas"]);
    expect((await seeded.admin.query(api.adminFinance.listPayments, { filter: "scanme_links", paginationOpts: page() })).page.map((row) => row.paymentId)).toEqual([paymentId]);
    expect((await seeded.admin.query(api.adminFinance.listPayments, { filter: "physical", paginationOpts: page() })).page).toHaveLength(0);
  });

  test("annual payment is recognized in full in paidAt month and retains annual coverage", async () => {
    const seeded = await seed();
    const annualPeriodId = await seeded.t.run(async (ctx) => {
      const profileId = await ctx.db.insert("serviceProfiles", { businessId: seeded.businessId, type: "google_review", slug: "annual-review", status: "active", totalScans: 0, totalPageViews: 0, totalConvertedSessions: 0, createdAt: 1, updatedAt: 1 });
      const agreementId = await ctx.db.insert("priceAgreements", {
        accountId: seeded.accountId, target: { kind: "service_instance", serviceProfileId: profileId }, targetKey: `service:${profileId}`, period: "annual",
        kind: "standard", reference: { amountMinor: 120_000, currency: "RSD" }, price: { amountMinor: 120_000, currency: "RSD" },
        validFrom: 0, validUntil: null, change: { actor: { kind: "admin", userId: seeded.adminId }, at: 1, reason: "Godišnji ugovor" }, key: "annual-agreement", fingerprint: "annual-agreement",
      });
      const subscriptionId = await ctx.db.insert("subscriptions", {
        accountId: seeded.accountId, target: { kind: "service_instance", serviceProfileId: profileId }, targetKey: `service:${profileId}`,
        businessId: seeded.businessId, period: "annual", startsAt: Date.parse("2026-09-01T10:00:00Z"), anchorAt: Date.parse("2026-09-01T10:00:00Z"),
        renewal: { kind: "manual" }, cancelAtPeriodEnd: false,
        facts: { status: "inactive", warning: false, currentPeriodStart: null, paidThrough: null, graceEndsAt: null, nextTransitionAt: null },
        key: "annual-subscription", fingerprint: "annual-subscription", createdAt: 1, updatedAt: 1,
      });
      return ctx.db.insert("subscriptionPeriods", {
        accountId: seeded.accountId, subscriptionId, start: Date.parse("2026-09-01T10:00:00Z"), end: Date.parse("2027-09-01T10:00:00Z"),
        price: { reference: { amountMinor: 120_000, currency: "RSD" }, effective: { amountMinor: 120_000, currency: "RSD" }, agreementId, basis: "standard", capturedAt: 1 },
        paidMinor: 0, funded: false, createdAt: 1,
      });
    });
    const paymentId = await seeded.admin.mutation(internal.subscriptionPayments.record, {
      accountId: seeded.accountId, amount: { amountMinor: 120_000, currency: "RSD" }, unallocatedMinor: 0,
      method: "bank_transfer", paidAt: Date.parse("2026-09-10T10:00:00Z"), allocations: [{ periodId: annualPeriodId, amountMinor: 120_000 }], key: "annual-payment",
    });
    const detail = await seeded.admin.query(api.adminFinance.paymentDetail, { paymentId });
    expect((await overview(seeded)).collected.amount.amountMinor).toBe(120_000);
    expect(detail?.entries).toHaveLength(1);
    expect(detail?.entries[0]).toMatchObject({ amountMinor: 120_000, period: "annual", coveredStart: Date.parse("2026-09-01T10:00:00Z"), coveredEnd: Date.parse("2027-09-01T10:00:00Z") });
  });

  test("unallocated money is visible and makes total profit incomplete", async () => {
    const seeded = await seed();
    await seedSubscriptionPayment(seeded, 10_000, 2_500);
    const result = await overview(seeded);
    expect(result.collected.amount.amountMinor).toBe(12_500);
    expect(result.categories.find((row) => row.category === "unallocated")).toMatchObject({ collectedMinor: 2_500, complete: false, missing: ["classification"] });
    expect(result.profit).toMatchObject({ complete: false, amount: null });
  });

  test("partial refund is immutable, allocation-exact, retry-safe and not a duplicate payment", async () => {
    const seeded = await seed();
    const paymentId = await seedSubscriptionPayment(seeded);
    const digest = await seeded.t.run((ctx) => ctx.db.query("financePaymentDigests").withIndex("by_scopeKey_and_paymentId", (q) => q.eq("scopeKey", "global").eq("paymentId", paymentId)).unique());
    const args = { paymentId, amountMinor: 2_000, allocations: [{ logicalKey: digest!.allocations[0].logicalKey, amountMinor: 2_000 }], refundedAt: NOW, reason: "Delimičan povraćaj", key: "refund-1" };
    const adjustmentId = await seeded.admin.mutation(api.adminFinance.refundPayment, args);
    expect(await seeded.admin.mutation(api.adminFinance.refundPayment, args)).toBe(adjustmentId);
    await expect(seeded.admin.mutation(api.adminFinance.refundPayment, { ...args, amountMinor: 2_001 })).rejects.toThrow("idempotency_conflict");
    const result = await overview(seeded);
    expect(result.collected.amount.amountMinor).toBe(10_000);
    expect(result.collected.refunds.amountMinor).toBe(2_000);
    const list = await seeded.admin.query(api.adminFinance.listPayments, { filter: "total", paginationOpts: page() });
    expect(list.page).toHaveLength(1);
    expect(list.page[0]).toMatchObject({ refundedMinor: 2_000, reversedMinor: 0 });
    expect((await seeded.admin.query(api.adminFinance.paymentDetail, { paymentId }))?.adjustments).toHaveLength(1);
  });

  test("reversal removes the false receipt without becoming a refund", async () => {
    const seeded = await seed();
    const paymentId = await seedSubscriptionPayment(seeded);
    await seeded.admin.mutation(internal.subscriptionPayments.reverse, { paymentId, reason: "Pogrešan unos", key: "reverse" });
    const result = await overview(seeded);
    expect(result.collected.amount.amountMinor).toBe(0);
    expect(result.collected.reversals.amountMinor).toBe(10_000);
    expect(result.collected.refunds.amountMinor).toBe(0);
  });

  test("expected starts next month, uses explicit price facts and keeps physical remainder undated", async () => {
    const seeded = await seed();
    const operationId = await seeded.t.run(async (ctx) => {
      const orderId = await ctx.db.insert("orders", { accountId: seeded.accountId, status: "pending", plan: "basic", priceSnapshot: emptyPriceSnapshot, createdAt: 1, updatedAt: 1 });
      const operationId = await ctx.db.insert("orderOperations", { orderId, accountId: seeded.accountId, accountName: "Bistro Zelen", smkCode: "SMK-001", smpCode: "SMP-001", paymentState: "awaiting_payment", designState: "template_selected", fulfillmentState: "awaiting_conditions", view: "active", priority: "normal", priorityRank: 2, assigneeId: seeded.adminId, assigneeName: "Admin", requiredMinor: 30_000, settledMinor: 10_000, reversedMinor: 0, currency: "RSD", lineCount: 1, unitCount: 1, problemCount: 0, migrationIssueCount: 0, provisioningReady: false, searchText: "bistro", migrationVersion: 1, createdAt: 1, updatedAt: 1 });
      const cancelledOrderId = await ctx.db.insert("orders", { accountId: seeded.accountId, status: "cancelled", plan: "basic", priceSnapshot: emptyPriceSnapshot, createdAt: 2, updatedAt: 2 });
      await ctx.db.insert("orderOperations", { orderId: cancelledOrderId, accountId: seeded.accountId, accountName: "Bistro Zelen", smkCode: "SMK-001", smpCode: "SMP-002", paymentState: "awaiting_payment", designState: "template_selected", fulfillmentState: "cancelled", view: "completed", priority: "normal", priorityRank: 2, assigneeId: seeded.adminId, assigneeName: "Admin", requiredMinor: 90_000, settledMinor: 0, reversedMinor: 0, currency: "RSD", lineCount: 1, unitCount: 1, problemCount: 0, migrationIssueCount: 0, provisioningReady: false, searchText: "otkazano", migrationVersion: 1, cancelledAt: NOW, createdAt: 2, updatedAt: 2 });
      return operationId;
    });
    expect(operationId).toBeTruthy();
    await seeded.admin.mutation(internal.adminFinance.backfillExpectedProjection, { source: "subscriptions", cursor: null, limit: 25, dryRun: false, now: NOW });
    await seeded.admin.mutation(internal.adminFinance.backfillExpectedProjection, { source: "orders", cursor: null, limit: 25, dryRun: false, now: NOW });
    const result = await overview(seeded);
    expect(result.expected.datedMinor).toBe(30_000);
    expect(result.expected.undatedMinor).toBe(20_000);
    expect(result.expected.amount.amountMinor).toBe(50_000);
    expect(result.expected.series.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(50_000);
    expect(result.expected.series[0].key).toBe("2026-10");
    expect(result.collected.amount.amountMinor).toBe(0);
  });

  test("new individual price changes future obligations but never reprices the historical receipt", async () => {
    const seeded = await seed();
    await seedSubscriptionPayment(seeded);
    await seeded.admin.mutation(internal.subscriptionPricing.agreePrice, {
      accountId: seeded.accountId, target: { kind: "service_instance", serviceProfileId: seeded.profileId }, period: "monthly",
      kind: "individual", reference: { amountMinor: 15_000, currency: "RSD" }, price: { amountMinor: 15_000, currency: "RSD" },
      validFrom: financeMonthBounds("2026-10").start, validUntil: null, reason: "Novi individualni dogovor", key: "future-individual-price",
    });
    const result = await overview(seeded);
    expect(result.collected.amount.amountMinor).toBe(10_000);
    expect(result.expected.datedMinor).toBe(45_000);
    const detail = await seeded.admin.query(api.adminFinance.paymentDetail, { paymentId: (await seeded.admin.query(api.adminFinance.listPayments, { filter: "total", paginationOpts: page() })).page[0].paymentId });
    expect(detail?.entries[0].amountMinor).toBe(10_000);
  });

  test("friend tag alone changes nothing; explicit waiver produces visible zero future obligations", async () => {
    const seeded = await seed();
    const tagId = await seeded.t.run((ctx) => ctx.db.insert("accountTags", { accountId: seeded.accountId, kind: "friend", label: "Prijatelj", createdAt: 1, updatedAt: 1 }));
    await seeded.admin.mutation(internal.adminFinance.backfillExpectedProjection, { source: "subscriptions", cursor: null, limit: 25, dryRun: false, now: NOW });
    expect((await overview(seeded)).expected.datedMinor).toBe(30_000);
    await seeded.admin.mutation(internal.subscriptionPricing.setDiscount, {
      accountId: seeded.accountId, target: { kind: "service_instance", serviceProfileId: seeded.profileId }, kind: "friend_waiver",
      value: { kind: "waiver" }, tagId, validFrom: financeMonthBounds("2026-10").start, validUntil: null,
      reason: "Eksplicitno odobreno oslobađanje", key: "friend-waiver",
    });
    const waived = await overview(seeded);
    expect(waived.expected.datedMinor).toBe(0);
    expect(waived.expected.categories.find((row) => row.category === "saas")?.waivedCount).toBe(3);
  });

  test("inactive subscription contributes no expected revenue and missing prices stay explicit", async () => {
    const seeded = await seed();
    await seeded.t.run(async (ctx) => {
      await ctx.db.patch(seeded.subscriptionId, { facts: { status: "inactive", warning: false, currentPeriodStart: null, paidThrough: null, graceEndsAt: null, nextTransitionAt: null }, updatedAt: NOW });
    });
    await seeded.admin.mutation(internal.adminFinance.backfillExpectedProjection, { source: "subscriptions", cursor: null, limit: 25, dryRun: false, now: NOW });
    expect((await overview(seeded)).expected).toMatchObject({ datedMinor: 0, unavailablePriceCount: 0 });
    await seeded.t.run(async (ctx) => {
      await ctx.db.patch(seeded.subscriptionId, { facts: { status: "active", warning: false, currentPeriodStart: Date.parse("2026-09-01T10:00:00Z"), paidThrough: Date.parse("2026-10-01T10:00:00Z"), graceEndsAt: Date.parse("2026-10-08T10:00:00Z"), nextTransitionAt: null }, updatedAt: NOW });
      await ctx.db.delete(seeded.agreementId);
    });
    await seeded.admin.mutation(internal.adminFinance.backfillExpectedProjection, { source: "subscriptions", cursor: null, limit: 25, dryRun: false, now: NOW });
    expect((await overview(seeded)).expected).toMatchObject({ datedMinor: 0, unavailablePriceCount: 3 });
  });

  test("overdue is separated and cancellation cuts off later projected periods", async () => {
    const seeded = await seed();
    await seeded.t.run((ctx) => ctx.db.patch(seeded.subscriptionId, {
      cancelledAt: Date.parse("2026-11-01T10:00:00Z"),
      cancelAtPeriodEnd: true,
      facts: {
        status: "grace", warning: false, currentPeriodStart: Date.parse("2026-08-01T10:00:00Z"),
        paidThrough: Date.parse("2026-09-01T10:00:00Z"), graceEndsAt: Date.parse("2026-09-22T10:00:00Z"), nextTransitionAt: Date.parse("2026-09-22T10:00:00Z"),
      },
      updatedAt: NOW,
    }));
    await seeded.admin.mutation(internal.adminFinance.backfillExpectedProjection, { source: "subscriptions", cursor: null, limit: 25, dryRun: false, now: NOW });
    const result = await overview(seeded);
    expect(result.expected.overdueMinor).toBe(10_000);
    expect(result.expected.datedMinor).toBe(10_000);
    expect(result.expected.series.filter((row) => !row.undated).map((row) => row.amountMinor)).toEqual([10_000, 0, 0]);
  });

  test("Belgrade month start is inclusive and the preceding millisecond is excluded", async () => {
    const seeded = await seed();
    const start = financeMonthBounds("2026-09").start;
    await insertUnallocatedPayment(seeded, { amountMinor: 1_000, paidAt: start - 1, method: "cash", key: "before-boundary" });
    await insertUnallocatedPayment(seeded, { amountMinor: 2_000, paidAt: start, method: "payment_card", key: "at-boundary" });
    await seeded.admin.mutation(internal.adminFinance.backfillPaymentProjection, { cursor: null, limit: 25, dryRun: false });
    const result = await overview(seeded);
    expect(result.collected.amount.amountMinor).toBe(2_000);
    expect(result.collected.series.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(2_000);
  });

  test("payment-method totals are stable and cursor pages do not overlap", async () => {
    const seeded = await seed();
    await insertUnallocatedPayment(seeded, { amountMinor: 1_000, paidAt: NOW - 3_000, method: "cash", key: "method-cash" });
    await insertUnallocatedPayment(seeded, { amountMinor: 3_000, paidAt: NOW - 2_000, method: "payment_card", key: "method-card" });
    await insertUnallocatedPayment(seeded, { amountMinor: 4_000, paidAt: NOW - 1_000, method: "bank_transfer", key: "method-bank" });
    await seeded.admin.mutation(internal.adminFinance.backfillPaymentProjection, { cursor: null, limit: 25, dryRun: false });
    const result = await overview(seeded);
    expect(result.methods.find((row) => row.method === "cash")).toMatchObject({ amountMinor: 1_000, percent: 12.5 });
    expect(result.methods.find((row) => row.method === "payment_card")).toMatchObject({ amountMinor: 3_000, percent: 37.5 });
    expect(result.methods.find((row) => row.method === "bank_transfer")).toMatchObject({ amountMinor: 4_000, percent: 50 });
    expect(result.methods.reduce((sum, row) => sum + row.percent, 0)).toBe(100);
    const first = await seeded.admin.query(api.adminFinance.listPayments, { filter: "total", paginationOpts: page(2) });
    const second = await seeded.admin.query(api.adminFinance.listPayments, { filter: "total", paginationOpts: page(2, first.continueCursor) });
    expect(first.page).toHaveLength(2);
    expect(second.page).toHaveLength(1);
    expect(new Set([...first.page, ...second.page].map((row) => row.paymentId)).size).toBe(3);
  });

  test("bounded backfill and payment-list cursors cover a larger fixture without overlap", async () => {
    const seeded = await seed();
    await seeded.t.run(async (ctx) => {
      for (let index = 0; index < 75; index += 1) {
        const paidAt = NOW - index * 1_000;
        const paymentId = await ctx.db.insert("payments", {
          accountId: seeded.accountId,
          amountRsd: 1,
          method: "manual",
          paidAt,
          recordedByUserId: seeded.adminId,
          ledger: {
            amount: { amountMinor: 100, currency: "RSD" },
            unallocatedMinor: 100,
            method: "bank_transfer",
            recordedBy: { kind: "admin", userId: seeded.adminId },
            key: `large-${index}`,
            fingerprint: `large-${index}`,
          },
          createdAt: paidAt,
        });
        await ctx.db.insert("paymentStates", { accountId: seeded.accountId, paymentId, paidAt, state: "settled" });
      }
    });
    let backfillCursor: string | null = null;
    let backfillDone = false;
    let scanned = 0;
    while (!backfillDone) {
      const batch: FunctionReturnType<typeof internal.adminFinance.backfillPaymentProjection> = await seeded.admin.mutation(internal.adminFinance.backfillPaymentProjection, { cursor: backfillCursor, limit: 25, dryRun: false });
      scanned += batch.scanned;
      backfillCursor = batch.continueCursor;
      backfillDone = batch.isDone;
    }
    expect(scanned).toBe(75);
    expect((await overview(seeded)).collected.amount.amountMinor).toBe(7_500);

    let listCursor: string | null = null;
    let listDone = false;
    const paymentIds: string[] = [];
    while (!listDone) {
      const batch: FunctionReturnType<typeof api.adminFinance.listPayments> = await seeded.admin.query(api.adminFinance.listPayments, { filter: "total", paginationOpts: page(17, listCursor) });
      paymentIds.push(...batch.page.map((row) => String(row.paymentId)));
      listCursor = batch.continueCursor;
      listDone = batch.isDone;
    }
    expect(paymentIds).toHaveLength(75);
    expect(new Set(paymentIds).size).toBe(75);
  });
});

describe("ADMIN-14 direct costs, scope and authorization", () => {
  async function seedPhysicalPayment(seeded: Awaited<ReturnType<typeof seed>>) {
    return seeded.t.run(async (ctx) => {
      const orderId = await ctx.db.insert("orders", { accountId: seeded.accountId, status: "paid", plan: "basic", priceSnapshot: emptyPriceSnapshot, createdAt: 1, updatedAt: 1 });
      const operationId = await ctx.db.insert("orderOperations", { orderId, accountId: seeded.accountId, accountName: "Bistro Zelen", smkCode: "SMK-001", smpCode: "SMP-001", paymentState: "paid", designState: "template_selected", fulfillmentState: "awaiting_conditions", view: "active", priority: "normal", priorityRank: 2, assigneeId: seeded.adminId, assigneeName: "Admin", requiredMinor: 50_000, settledMinor: 50_000, reversedMinor: 0, currency: "RSD", lineCount: 1, unitCount: 1, problemCount: 0, migrationIssueCount: 0, provisioningReady: false, searchText: "bistro", migrationVersion: 1, createdAt: 1, updatedAt: 1 });
      const paymentId = await ctx.db.insert("payments", { accountId: seeded.accountId, orderId, amountRsd: 500, method: "manual", paidAt: NOW - 1_000, recordedByUserId: seeded.adminId, ledger: { amount: { amountMinor: 50_000, currency: "RSD" }, unallocatedMinor: 0, method: "cash", recordedBy: { kind: "admin", userId: seeded.adminId }, key: "physical", fingerprint: "physical" }, createdAt: 1 });
      await ctx.db.insert("paymentStates", { accountId: seeded.accountId, paymentId, paidAt: NOW - 1_000, state: "settled" });
      await ctx.db.insert("orderPaymentAllocations", { operationId, orderId, accountId: seeded.accountId, paymentId, amountMinor: 50_000, currency: "RSD", state: "settled", key: "physical", recordedByUserId: seeded.adminId, createdAt: 1 });
      return { orderId, paymentId };
    });
  }

  test("missing production cost is incomplete while explicit zero is known", async () => {
    const seeded = await seed();
    const physical = await seedPhysicalPayment(seeded);
    await seeded.admin.mutation(internal.adminFinance.backfillPaymentProjection, { cursor: null, limit: 25, dryRun: false });
    let result = await overview(seeded, { profitFilter: "physical" });
    expect(result.profit).toMatchObject({ complete: false, amount: null, missing: ["production"] });
    const args = { accountId: seeded.accountId, category: "production" as const, amountMinor: 0, occurredAt: NOW, orderId: physical.orderId, sourceReference: "račun-0", note: "Štamparija potvrdila bez dodatnog troška", idempotencyKey: "cost-zero" };
    const costId = await seeded.admin.mutation(api.adminFinance.recordDirectCost, args);
    expect(await seeded.admin.mutation(api.adminFinance.recordDirectCost, args)).toBe(costId);
    result = await overview(seeded, { profitFilter: "physical" });
    expect(result.profit).toMatchObject({ complete: true, amount: { amountMinor: 50_000 }, costs: { amountMinor: 0 } });
  });

  test("physical profit subtracts both actual production cost and dated refund", async () => {
    const seeded = await seed();
    const physical = await seedPhysicalPayment(seeded);
    await seeded.admin.mutation(internal.adminFinance.backfillPaymentProjection, { cursor: null, limit: 25, dryRun: false });
    await seeded.admin.mutation(api.adminFinance.recordDirectCost, { accountId: seeded.accountId, category: "production", amountMinor: 20_000, occurredAt: NOW, orderId: physical.orderId, idempotencyKey: "physical-cost" });
    const digest = await seeded.t.run((ctx) => ctx.db.query("financePaymentDigests").withIndex("by_scopeKey_and_paymentId", (q) => q.eq("scopeKey", "global").eq("paymentId", physical.paymentId)).unique());
    await seeded.admin.mutation(api.adminFinance.refundPayment, {
      paymentId: physical.paymentId, amountMinor: 5_000, allocations: [{ logicalKey: digest!.allocations[0].logicalKey, amountMinor: 5_000 }],
      refundedAt: NOW, reason: "Delimičan povraćaj fizičke porudžbine", key: "physical-refund",
    });
    expect((await overview(seeded, { filter: "physical", profitFilter: "physical" })).profit).toMatchObject({ complete: true, amount: { amountMinor: 25_000 }, costs: { amountMinor: 20_000 } });
  });

  test("cost correction/reversal is append-only, reasoned and idempotent", async () => {
    const seeded = await seed();
    const physical = await seedPhysicalPayment(seeded);
    await seeded.admin.mutation(internal.adminFinance.backfillPaymentProjection, { cursor: null, limit: 25, dryRun: false });
    const costId = await seeded.admin.mutation(api.adminFinance.recordDirectCost, { accountId: seeded.accountId, category: "production", amountMinor: 20_000, occurredAt: NOW, orderId: physical.orderId, idempotencyKey: "cost-1" });
    const correction = { relatedCostId: costId, amountMinor: 2_000, direction: "credit" as const, occurredAt: NOW, reason: "Odobren rabat na računu", idempotencyKey: "cost-correction" };
    const correctionId = await seeded.admin.mutation(api.adminFinance.correctDirectCost, correction);
    expect(await seeded.admin.mutation(api.adminFinance.correctDirectCost, correction)).toBe(correctionId);
    await expect(seeded.admin.mutation(api.adminFinance.correctDirectCost, { ...correction, idempotencyKey: "blank-correction", reason: "   " })).rejects.toThrow("reason_required");
    const reversal = { relatedCostId: correctionId, occurredAt: NOW, reason: "Rabat je povučen", idempotencyKey: "cost-reversal" };
    await seeded.admin.mutation(api.adminFinance.reverseDirectCost, reversal);
    await expect(seeded.admin.mutation(api.adminFinance.reverseDirectCost, { ...reversal, idempotencyKey: "cost-reversal-2" })).rejects.toThrow("already_reversed");
    const result = await overview(seeded, { profitFilter: "physical" });
    expect(result.profit.costs.amountMinor).toBe(20_000);
    const history = await seeded.t.run(async (ctx) => ({
      costs: await ctx.db.query("financeDirectCosts").collect(),
      audit: await ctx.db.query("adminAuditLog").collect(),
    }));
    expect(history.costs.map((row) => row.eventKind).sort()).toEqual(["correction", "cost", "reversal"]);
    expect(history.costs.map((row) => row._id)).toEqual(expect.arrayContaining([costId, correctionId]));
    expect(history.audit.filter((row) => row.action.startsWith("admin_finance_cost_")).map((row) => row.action).sort()).toEqual([
      "admin_finance_cost_correction",
      "admin_finance_cost_cost",
      "admin_finance_cost_reversal",
    ]);
  });

  test("SaaS profit subtracts known costs while shared global costs do not invent a client allocation", async () => {
    const seeded = await seed();
    await seedSubscriptionPayment(seeded);
    const bounds = financeMonthBounds("2026-09");
    for (const [category, amountMinor] of [["hosting", 1_000], ["backend", 2_000]] as const) {
      await seeded.admin.mutation(api.adminFinance.recordDirectCost, {
        category, amountMinor, occurredAt: NOW, coveredStart: bounds.start, coveredEnd: bounds.end,
        sourceReference: `global-${category}`, idempotencyKey: `global-${category}`,
      });
    }
    expect((await overview(seeded, { profitFilter: "saas" })).profit).toMatchObject({ complete: true, amount: { amountMinor: 7_000 }, costs: { amountMinor: 3_000 } });
    expect((await overview(seeded, { accountId: seeded.accountId, profitFilter: "saas" })).profit).toMatchObject({ complete: false, amount: null, missing: ["hosting", "backend"] });
    for (const category of ["hosting", "backend"] as const) {
      await seeded.admin.mutation(api.adminFinance.recordDirectCost, {
        accountId: seeded.accountId, category, amountMinor: 0, occurredAt: NOW, coveredStart: bounds.start, coveredEnd: bounds.end,
        sourceReference: `account-${category}`, idempotencyKey: `account-${category}`,
      });
    }
    expect((await overview(seeded, { accountId: seeded.accountId, profitFilter: "saas" })).profit).toMatchObject({ complete: true, amount: { amountMinor: 10_000 } });
  });

  test("non-admin reads/writes and cross-account references are rejected", async () => {
    const seeded = await seed();
    const physical = await seedPhysicalPayment(seeded);
    await expect(seeded.t.query(api.adminFinance.overview, { now: NOW, collectedPeriod: "month", expectedPeriod: "next_month", filter: "total", profitFilter: "total" })).rejects.toThrow("Niste prijavljeni");
    await expect(seeded.outsider.query(api.adminFinance.overview, { now: NOW, collectedPeriod: "month", expectedPeriod: "next_month", filter: "total", profitFilter: "total" })).rejects.toThrow("Nemate administratorski pristup");
    await expect(seeded.outsider.mutation(api.adminFinance.recordDirectCost, { accountId: seeded.accountId, category: "production", amountMinor: 1, occurredAt: NOW, orderId: physical.orderId, idempotencyKey: "outsider" })).rejects.toThrow("Nemate administratorski pristup");
    await expect(seeded.admin.mutation(api.adminFinance.recordDirectCost, { accountId: seeded.otherAccountId, category: "production", amountMinor: 1, occurredAt: NOW, orderId: physical.orderId, idempotencyKey: "cross-account" })).rejects.toThrow("cross_account");
    await expect(seeded.admin.mutation(api.adminFinance.recordDirectCost, { accountId: seeded.accountId, category: "production", amountMinor: -1, occurredAt: NOW, orderId: physical.orderId, idempotencyKey: "negative" })).rejects.toThrow("money_invalid");
    await expect(seeded.admin.mutation(internal.subscriptionPayments.record, { accountId: seeded.accountId, amount: { amountMinor: 10_000, currency: "EUR" }, unallocatedMinor: 0, method: "bank_transfer", paidAt: NOW, allocations: [{ periodId: seeded.periodId, amountMinor: 10_000 }], key: "eur" })).rejects.toThrow("currency_not_supported");
  });

  test("dry-run writes nothing and account scope cannot see another account", async () => {
    const seeded = await seed();
    await seedSubscriptionPayment(seeded);
    await seeded.t.run(async (ctx) => {
      for (const row of await ctx.db.query("financeLedgerEntries").collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("financeMonthlyRollups").collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("financeDailyRollups").collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("financePaymentDigests").collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("financePaymentListRows").collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("financeCostRequirements").collect()) await ctx.db.delete(row._id);
    });
    const dry = await seeded.admin.mutation(internal.adminFinance.backfillPaymentProjection, { cursor: null, limit: 25, dryRun: true });
    expect(dry).toMatchObject({ scanned: 1, projected: 0 });
    expect(await seeded.t.run((ctx) => ctx.db.query("financePaymentDigests").collect())).toHaveLength(0);
    await seeded.admin.mutation(internal.adminFinance.backfillPaymentProjection, { cursor: null, limit: 25, dryRun: false });
    expect((await overview(seeded, { accountId: seeded.otherAccountId })).collected.amount.amountMinor).toBe(0);
    const global = await overview(seeded);
    const account = await overview(seeded, { accountId: seeded.accountId });
    expect(account.collected).toEqual(global.collected);
    expect(account.expected).toEqual(global.expected);
    expect(account.profit).toEqual(global.profit);
    expect(account.categories).toEqual(global.categories);
    expect(account.methods).toEqual(global.methods);
  });
});
