/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { AS_OF, subscriptions as fixtureSubscriptions } from "../lib/admin-v1/fixtures";
import { periodEnd, type Target } from "./lib/subscriptions";
import { DAY_MS } from "../lib/admin-v1/rules";
import { getEntitlement } from "./lib/entitlements";

const modules = import.meta.glob("./**/*.ts");
const date = (day: string) => Date.parse(`${day}T10:00:00Z`);
const rsd = (amountMinor: number) => ({ amountMinor, currency: "RSD" });
const adminIdentity = (userId: Id<"users">) => ({ subject: userId, issuer: "https://admin03.test" });
type Backend = ReturnType<typeof convexTest>;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AS_OF); process.env.SCANME_ADMIN_EMAILS = "admin03@example.invalid"; });
afterEach(() => vi.useRealTimers());

async function seed(t: Backend, key = "main") {
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { email: "admin03@example.invalid" });
    const owner = await ctx.db.insert("users", { email: `owner-${key}@example.invalid` });
    const manager = await ctx.db.insert("users", { email: `manager-${key}@example.invalid` });
    const viewer = await ctx.db.insert("users", { email: `viewer-${key}@example.invalid` });
    const finance = await ctx.db.insert("users", { email: `finance-${key}@example.invalid` });
    const accountId = await ctx.db.insert("accounts", { name: key, plan: "premium", status: "active", planPeriod: "monthly", planValidUntil: date("2020-01-01"), adminV1MigrationVersion: 1, createdAt: 1, updatedAt: 1 });
    const businesses: Id<"businesses">[] = [];
    for (let i = 0; i < 4; i++) businesses.push(await ctx.db.insert("businesses", { accountId, name: `${key}-${i}`, slug: `${key}-${i}`, status: "active", kind: "business", createdAt: 1 }));
    const profiles: Id<"serviceProfiles">[] = [];
    for (let i = 0; i < 6; i++) profiles.push(await ctx.db.insert("serviceProfiles", { businessId: businesses[Math.min(i, 3)], type: i === 4 ? "google_review" : i === 5 ? "scanme_menu" : "scanme_links", slug: `${key}-service-${i}`, status: "active", totalScans: 0, totalPageViews: 0, totalConvertedSessions: 0, createdAt: 1, updatedAt: 1 }));
    for (const [userId, role, canBuyServices, canBuyPremium, venueAccess] of [
      [owner, "full_access", false, false, "all"], [manager, "venue_management", true, false, "selected"],
      [viewer, "view_only", false, false, "all"], [finance, "finance", true, true, "all"],
    ] as const) {
      const memberId = await ctx.db.insert("accountMemberships", { accountId, userId, role, active: true, canBuyServices, canBuyPremium, venueAccess, createdAt: 1, updatedAt: 1 });
      if (venueAccess === "selected") await ctx.db.insert("accountMembershipVenueScopes", { membershipId: memberId, accountId, businessId: businesses[3], createdAt: 1 });
    }
    return { admin, owner, manager, viewer, finance, accountId, businesses, profiles };
  });
  const admin = t.withIdentity(adminIdentity(ids.admin));
  const targets: Target[] = [...ids.profiles.map((serviceProfileId) => ({ kind: "service_instance" as const, serviceProfileId })), { kind: "account_premium" }];
  const migration = { accountId: ids.accountId, expectedUpdatedAt: 1, premiumDecision: "subscription" as const, reason: "Test: explicit source evidence", dryRun: false,
    subscriptions: fixtureSubscriptions.map((sub, i) => {
      if (sub.cycle.kind !== "running") throw new Error("fixture_cycle");
      return { target: targets[i], period: sub.period, start: sub.cycle.currentPeriodStart,
        reference: rsd(sub.price.reference.amountMinor), price: rsd(sub.price.effective.amountMinor),
        coverage: { kind: "paid" as const, end: sub.cycle.paidThrough, evidence: `test-source-${i}` } };
    }) };
  return { ...ids, adminClient: admin, targets, migration };
}
async function adopt(t: Backend, key = "main") {
  const seeded = await seed(t, key);
  await seeded.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, seeded.migration);
  const subs = await t.run(async (ctx) => {
    const list: Doc<"subscriptions">[] = [];
    for (const target of seeded.targets) {
      const key = target.kind === "account_premium" ? "premium" : `service:${target.serviceProfileId}`;
      list.push((await ctx.db.query("subscriptions").withIndex("by_accountId_and_targetKey", (q) => q.eq("accountId", seeded.accountId).eq("targetKey", key)).unique())!);
    }
    return list;
  });
  return { ...seeded, subs };
}
async function facts(t: Backend, id: Id<"subscriptions">) { return t.run(async (ctx) => (await ctx.db.get(id))!.facts); }
async function purchase(a: Awaited<ReturnType<typeof adopt>>, index: number, start: number) {
  return a.adminClient.mutation(internal.subscriptions.purchasePeriod, { subscriptionId: a.subs[index]._id, start });
}
async function pay(a: Awaited<ReturnType<typeof adopt>>, key: string, allocations: { periodId: Id<"subscriptionPeriods">; amountMinor: number }[], unallocatedMinor = 0) {
  return a.adminClient.mutation(internal.subscriptionPayments.record, { accountId: a.accountId, key,
    amount: rsd(allocations.reduce((sum, item) => sum + item.amountMinor, unallocatedMinor)), unallocatedMinor,
    paidAt: Date.now(), method: "bank_transfer", allocations });
}

describe("ADMIN-03 independent subscriptions and allocations", () => {
  test("multiple prepaid periods retain the full paid-through date; reversal respects the gap", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const september = await purchase(a, 1, date("2026-09-07"));
    const septemberPayment = await pay(a, "september", [{ periodId: september, amountMinor: 12_000 }]);
    const october = await purchase(a, 1, date("2026-10-07"));
    await pay(a, "october", [{ periodId: october, amountMinor: 12_000 }]);
    const november = await purchase(a, 1, date("2026-11-07"));
    await pay(a, "november", [{ periodId: november, amountMinor: 12_000 }]);
    expect((await facts(t, a.subs[1]._id)).paidThrough).toBe(date("2026-12-07"));
    await a.adminClient.mutation(internal.subscriptionPayments.reverse, { paymentId: septemberPayment, reason: "Test reversal of one covered period", key: "reverse-gap" });
    expect((await facts(t, a.subs[1]._id)).paidThrough).toBe(date("2026-09-07"));
    vi.setSystemTime(date("2026-10-07"));
    await t.mutation(internal.subscriptions.sweep, {});
    expect((await facts(t, a.subs[1]._id)).paidThrough).toBe(date("2026-12-07"));
    expect((await facts(t, a.subs[1]._id)).status).toBe("active");
  });
  test("I02: ADMIN-01 partial fixture, then remaining 18,000; other targets unchanged", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const before = await Promise.all(a.subs.map((sub) => facts(t, sub._id)));
    const month = await purchase(a, 1, date("2026-09-07"));
    const annual = await purchase(a, 4, date("2026-09-03"));
    const premium = await purchase(a, 6, date("2026-09-12"));
    await pay(a, "partial", [{ periodId: month, amountMinor: 12_000 }, { periodId: annual, amountMinor: 6_000 }, { periodId: premium, amountMinor: 15_000 }], 5_000);
    expect((await facts(t, a.subs[1]._id)).paidThrough).toBe(date("2026-10-07"));
    expect((await facts(t, a.subs[4]._id)).status).toBe("grace");
    expect((await facts(t, a.subs[6]._id)).paidThrough).toBe(date("2026-10-12"));
    for (const i of [0, 2, 3, 5]) expect(await facts(t, a.subs[i]._id)).toEqual(before[i]);
    await pay(a, "remainder", [{ periodId: annual, amountMinor: 18_000 }]);
    expect((await facts(t, a.subs[4]._id)).paidThrough).toBe(date("2027-09-03"));
    expect(await t.run((ctx) => ctx.db.get(annual))).toMatchObject({ paidMinor: 24_000, funded: true });
  });

  test("locked four venues: three paid monthly A survive nonpayment of fourth's three annual services", async () => {
    const t = convexTest(schema, modules), a = await seed(t);
    const migration = { ...a.migration, subscriptions: a.migration.subscriptions.map((item, i) => ({ ...item,
      start: i < 3 || i === 6 ? date("2026-08-20") : date("2025-08-20"), coverage: { kind: "paid" as const, end: date("2026-09-20"), evidence: "test independent source" } })) };
    await a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, migration);
    const rows = await t.run((ctx) => ctx.db.query("subscriptions").collect());
    vi.setSystemTime(date("2026-09-19"));
    const monthly = rows.filter((row) => row.period === "monthly" && row.target.kind === "service_instance");
    const allocations = [];
    for (const row of monthly) allocations.push({ periodId: await a.adminClient.mutation(internal.subscriptions.purchasePeriod, { subscriptionId: row._id, start: date("2026-09-20") }), amountMinor: 12_000 });
    await a.adminClient.mutation(internal.subscriptionPayments.record, { accountId: a.accountId, key: "three-only", amount: rsd(36_000), unallocatedMinor: 0, method: "cash", paidAt: Date.now(), allocations });
    vi.setSystemTime(date("2026-10-05"));
    await t.mutation(internal.subscriptions.sweep, {});
    for (const row of monthly) expect((await facts(t, row._id)).status).toBe("active");
    for (const row of rows.filter((row) => row.period === "annual")) expect((await facts(t, row._id)).status).toBe("suspended");
  });

  test("one payment covers all seven, keeps all renewal dates independent", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const allocations = [];
    for (let i = 0; i < a.subs.length; i++) allocations.push({ periodId: await purchase(a, i, a.subs[i].facts.paidThrough!), amountMinor: i === 6 ? 15_000 : i < 3 ? 12_000 : 24_000 });
    const paymentId = await pay(a, "all", allocations);
    const ledger = await t.run((ctx) => ctx.db.query("paymentAllocations").withIndex("by_paymentId", (q) => q.eq("paymentId", paymentId)).collect());
    expect(ledger).toHaveLength(7);
    expect(new Set(ledger.map((row) => row.end)).size).toBe(7);
    expect(ledger.reduce((sum, row) => sum + row.amount.amountMinor, 0)).toBe(123_000);
  });

  test("annual February 15 and September 15 renew on separate anniversaries", async () => {
    const t = convexTest(schema, modules), a = await seed(t);
    a.migration.subscriptions[3] = { ...a.migration.subscriptions[3], start: date("2025-02-15"), coverage: { kind: "paid", end: date("2026-02-15"), evidence: "Feb purchase" } };
    a.migration.subscriptions[4] = { ...a.migration.subscriptions[4], start: date("2025-09-15"), coverage: { kind: "paid", end: date("2026-09-15"), evidence: "Sep purchase" } };
    await a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, a.migration);
    const rows = await t.run((ctx) => ctx.db.query("subscriptions").collect());
    const ends = [];
    for (const start of [date("2026-02-15"), date("2026-09-15")]) {
      const sub = rows.find((row) => row.facts.paidThrough === start)!;
      const periodId = await a.adminClient.mutation(internal.subscriptions.purchasePeriod, { subscriptionId: sub._id, start });
      ends.push((await t.run((ctx) => ctx.db.get(periodId)))!.end);
    }
    expect(ends).toEqual([date("2027-02-15"), date("2027-09-15")]);
  });
});

describe("ADMIN-03 receipts, authorization and immutable history", () => {
  test("payment retries are atomic, payload conflicts and provider duplicates refused", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const periodId = await purchase(a, 1, date("2026-09-07"));
    const args = { accountId: a.accountId, key: "event", amount: rsd(12_000), unallocatedMinor: 0, method: "payment_card" as const,
      paidAt: Date.now(), provider: "test-adapter", providerEventId: "evt-1", allocations: [{ periodId, amountMinor: 12_000 }] };
    const ids = await Promise.all([a.adminClient.mutation(internal.subscriptionPayments.record, args), a.adminClient.mutation(internal.subscriptionPayments.record, args)]);
    expect(ids[0]).toBe(ids[1]);
    expect(await t.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("paymentAllocations").collect())).toHaveLength(1);
    await expect(a.adminClient.mutation(internal.subscriptionPayments.record, { ...args, amount: rsd(12_001) })).rejects.toThrow("idempotency_conflict");
    await expect(a.adminClient.mutation(internal.subscriptionPayments.record, { ...args, key: "new-key" })).rejects.toThrow("duplicate_provider_event");
  });

  test("concurrent partial receipts sum exactly; failed final allocation rolls back the whole receipt", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const periodId = await purchase(a, 1, date("2026-09-07"));
    await Promise.all([pay(a, "one", [{ periodId, amountMinor: 6_000 }]), pay(a, "two", [{ periodId, amountMinor: 6_000 }])]);
    expect(await t.run((ctx) => ctx.db.get(periodId))).toMatchObject({ paidMinor: 12_000, funded: true });
    const other = await purchase(a, 4, date("2026-09-03"));
    await expect(pay(a, "bad", [{ periodId: other, amountMinor: 6_000 }, { periodId, amountMinor: 1 }])).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(other))).toMatchObject({ paidMinor: 0, funded: false });
    expect(await t.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(2);
  });

  test.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("reject invalid minor amount %s", async (amount) => {
    const t = convexTest(schema, modules), a = await adopt(t);
    await expect(a.adminClient.mutation(internal.subscriptionPayments.record, { accountId: a.accountId, key: "bad", amount: rsd(amount), unallocatedMinor: amount, method: "other", paidAt: Date.now(), allocations: [] })).rejects.toThrow();
  });

  test("balance, currency, duplicate target and ownership failures write nothing", async () => {
    const t = convexTest(schema, modules), a = await adopt(t), b = await adopt(t, "other");
    const periodId = await purchase(a, 1, date("2026-09-07")), foreignPeriod = await purchase(b, 1, date("2026-09-07"));
    const args = { accountId: a.accountId, key: "bad", amount: rsd(10), unallocatedMinor: 0, method: "cash" as const, paidAt: Date.now(), allocations: [{ periodId, amountMinor: 10 }] };
    for (const change of [
      { amount: rsd(11) }, { amount: { amountMinor: 10, currency: "EUR" } },
      { allocations: [{ periodId: foreignPeriod, amountMinor: 10 }] },
      { amount: rsd(20), allocations: [args.allocations[0], args.allocations[0]] },
      { amount: rsd(12_001), allocations: [{ periodId, amountMinor: 12_001 }] },
    ]) await expect(a.adminClient.mutation(internal.subscriptionPayments.record, { ...args, ...change })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(0);
  });

  test("storno preserves original payment, allocations and price; leaves unrelated current period funded", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const month = await purchase(a, 1, date("2026-09-07")), annual = await purchase(a, 4, date("2026-09-03"));
    const paymentId = await pay(a, "receipt", [{ periodId: month, amountMinor: 12_000 }, { periodId: annual, amountMinor: 6_000 }], 100);
    const separate = await pay(a, "separate", [{ periodId: annual, amountMinor: 18_000 }]);
    const original = await t.run((ctx) => ctx.db.get(paymentId));
    const allocations = await t.run((ctx) => ctx.db.query("paymentAllocations").collect());
    const snapshot = (await t.run((ctx) => ctx.db.get(annual)))!.price;
    const args = { paymentId, key: "reverse", reason: "Test wrong receipt" };
    await expect(a.adminClient.mutation(internal.subscriptionPayments.reverse, { ...args, reason: " " })).rejects.toThrow();
    const adjustment = await a.adminClient.mutation(internal.subscriptionPayments.reverse, args);
    expect(await a.adminClient.mutation(internal.subscriptionPayments.reverse, args)).toBe(adjustment);
    expect(await t.run((ctx) => ctx.db.get(paymentId))).toEqual(original);
    expect(await t.run((ctx) => ctx.db.query("paymentAllocations").collect())).toEqual(allocations);
    expect(await t.run((ctx) => ctx.db.get(annual))).toMatchObject({ paidMinor: 18_000, funded: false, price: snapshot });
    expect((await facts(t, a.subs[1]._id)).status).toBe("grace");
    expect((await t.run((ctx) => ctx.db.get(adjustment)))!.change.reason).toBe(args.reason);
    expect((await t.run((ctx) => ctx.db.get(separate)))!.ledger!.amount.amountMinor).toBe(18_000);
    await expect(a.adminClient.mutation(internal.subscriptionPayments.reverse, { ...args, key: "twice" })).rejects.toThrow("already_reversed");
  });

  test("permissions: explicit buy/pay grants never confer cancel or settlement; cross-account/venue denied", async () => {
    const t = convexTest(schema, modules), a = await adopt(t), b = await adopt(t, "foreign");
    const periodId = await purchase(a, 4, date("2026-09-03"));
    const manager = t.withIdentity(adminIdentity(a.manager)), viewer = t.withIdentity(adminIdentity(a.viewer)), finance = t.withIdentity(adminIdentity(a.finance));
    const prepare = { accountId: a.accountId, periodIds: [periodId] };
    expect((await manager.query(internal.subscriptionPayments.preparePayment, prepare)).amount.amountMinor).toBe(24_000);
    expect((await finance.query(internal.subscriptionPayments.preparePayment, prepare)).amount.amountMinor).toBe(24_000);
    await expect(viewer.query(internal.subscriptionPayments.preparePayment, prepare)).rejects.toThrow();
    const monthly = await purchase(a, 1, date("2026-09-07")), premium = await purchase(a, 6, date("2026-09-12"));
    await expect(manager.query(internal.subscriptionPayments.preparePayment, { ...prepare, periodIds: [monthly] })).rejects.toThrow();
    await expect(manager.query(internal.subscriptionPayments.preparePayment, { ...prepare, periodIds: [premium] })).rejects.toThrow();
    expect((await finance.query(internal.subscriptionPayments.preparePayment, { ...prepare, periodIds: [premium] })).amount.amountMinor).toBe(15_000);
    for (const actor of [manager, finance, viewer, t]) await expect(actor.mutation(internal.subscriptions.control, { subscriptionId: a.subs[4]._id, key: "cancel", operation: "cancel_now", reason: "Test" })).rejects.toThrow();
    await expect(manager.mutation(internal.subscriptionPayments.record, { accountId: a.accountId, key: "fake-money", amount: rsd(24_000), unallocatedMinor: 0, method: "cash", paidAt: Date.now(), allocations: [{ periodId, amountMinor: 24_000 }] })).rejects.toThrow();
    await expect(manager.query(internal.subscriptions.get, { subscriptionId: b.subs[4]._id, now: Date.now() })).rejects.toThrow();
    await expect(t.query(internal.subscriptions.get, { subscriptionId: a.subs[4]._id, now: Date.now() })).rejects.toThrow();
    await t.run(async (ctx) => {
      const member = await ctx.db.query("accountMemberships").withIndex("by_accountId_and_userId", (q) => q.eq("accountId", a.accountId).eq("userId", a.manager)).unique();
      await ctx.db.patch(member!._id, { active: false });
    });
    await expect(manager.query(internal.subscriptionPayments.preparePayment, prepare)).rejects.toThrow();
  });
});

describe("ADMIN-03 agreements, selective waivers and referral", () => {
  test("ongoing explicit waiver renews through downtime without cash; expiry resumes charging", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    await a.adminClient.mutation(internal.subscriptionPricing.setDiscount, { accountId: a.accountId, target: a.targets[0], kind: "manual", value: { kind: "waiver" }, validFrom: 0, validUntil: date("2027-01-20"), key: "free", reason: "Test temporary free service" });
    vi.setSystemTime(date("2026-12-21"));
    await t.mutation(internal.subscriptions.sweep, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await facts(t, a.subs[0]._id)).paidThrough).toBe(date("2027-01-20"));
    expect((await facts(t, a.subs[0]._id)).status).toBe("active");
    expect(await t.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(0);
    vi.setSystemTime(date("2027-01-27"));
    await t.mutation(internal.subscriptions.sweep, {});
    expect((await facts(t, a.subs[0]._id)).status).toBe("suspended");
    const periodId = await purchase(a, 0, date("2027-01-20"));
    expect((await t.run((ctx) => ctx.db.get(periodId)))!.price.effective.amountMinor).toBe(12_000);
  });
  test("Friend tag alone grants nothing; only selected service/Premium waived, other prices intact", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const tagId = await t.run((ctx) => ctx.db.insert("accountTags", { accountId: a.accountId, kind: "friend", createdAt: 1, updatedAt: 1 }));
    for (const i of [0, 6]) await a.adminClient.mutation(internal.subscriptionPricing.setDiscount, {
      accountId: a.accountId, target: a.targets[i], kind: "friend_waiver", value: { kind: "waiver" }, tagId,
      validFrom: 0, validUntil: null, reason: "Test selected friend scope", key: `friend-${i}`,
    });
    for (const i of [0, 1, 6]) {
      const periodId = await purchase(a, i, a.subs[i].facts.paidThrough!);
      const period = (await t.run((ctx) => ctx.db.get(periodId)))!;
      expect(period.price.effective.amountMinor).toBe(i === 1 ? 12_000 : 0);
      expect(period.funded).toBe(i !== 1);
    }
    expect(await t.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("orders").collect())).toHaveLength(0);
    const other = await adopt(t, "other");
    await expect(a.adminClient.mutation(internal.subscriptionPricing.setDiscount, { accountId: other.accountId, target: other.targets[0], kind: "friend_waiver", value: { kind: "waiver" }, tagId,
      validFrom: 0, validUntil: null, reason: "Test wrong tag", key: "wrong" })).rejects.toThrow("friend_tag_required");
  });

  test.each(["founders", "enterprise", "individual"] as const)("%s agreement is explicit and snapshots survive later price change", async (kind) => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const args = { accountId: a.accountId, target: a.targets[1], period: "monthly" as const, kind, reference: rsd(12_000), price: rsd(9_991), validFrom: date("2026-09-01"), validUntil: null, reason: "Test exact agreement", key: "agreement" };
    const id = await a.adminClient.mutation(internal.subscriptionPricing.agreePrice, args);
    expect(await a.adminClient.mutation(internal.subscriptionPricing.agreePrice, args)).toBe(id);
    const periodId = await purchase(a, 1, date("2026-09-07"));
    const original = await t.run((ctx) => ctx.db.get(periodId));
    expect(original!.price).toMatchObject({ effective: rsd(9_991), basis: kind });
    await a.adminClient.mutation(internal.subscriptionPricing.agreePrice, { ...args, key: "future", validFrom: date("2026-09-02"), price: rsd(20_000) });
    expect(await t.run((ctx) => ctx.db.get(periodId))).toEqual(original);
    await expect(a.adminClient.mutation(internal.subscriptionPricing.agreePrice, { ...args, price: rsd(1) })).rejects.toThrow("idempotency_conflict");
  });

  test("expired founders terms require explicit replacement; percentage discounts use integer arithmetic", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    await a.adminClient.mutation(internal.subscriptionPricing.agreePrice, { accountId: a.accountId, target: a.targets[1], period: "monthly", kind: "founders", reference: rsd(12_000), price: rsd(10_001), validFrom: date("2026-09-01"), validUntil: date("2026-09-07"), reason: "Test fixed expiry", key: "expires" });
    await expect(purchase(a, 1, date("2026-09-07"))).rejects.toThrow("price_agreement_required");
    await a.adminClient.mutation(internal.subscriptionPricing.agreePrice, { accountId: a.accountId, target: a.targets[1], period: "monthly", kind: "standard", reference: rsd(10_001), price: rsd(10_001), validFrom: date("2026-09-07"), validUntil: null, reason: "Test replacement", key: "standard" });
    await a.adminClient.mutation(internal.subscriptionPricing.setDiscount, { accountId: a.accountId, target: a.targets[1], kind: "manual", value: { kind: "percentage", basisPoints: 3_333 }, validFrom: 0, validUntil: null, key: "pct", reason: "Test explicit discount" });
    const id = await purchase(a, 1, date("2026-09-07"));
    expect((await t.run((ctx) => ctx.db.get(id)))!.price.effective.amountMinor).toBe(6_668);
  });

  test("referral qualifies on first receipt, requires terms, rewards once; reversal revokes future reward", async () => {
    const t = convexTest(schema, modules), a = await adopt(t), b = await adopt(t, "referrer");
    const referralId = await a.adminClient.mutation(internal.subscriptionPricing.registerReferral, { referrerAccountId: b.accountId, referredAccountId: a.accountId, reason: "Test referral", key: "register-referral" });
    expect(await a.adminClient.mutation(internal.subscriptionPricing.registerReferral, { referrerAccountId: b.accountId, referredAccountId: a.accountId, reason: "Test referral", key: "register-referral" })).toBe(referralId);
    await expect(a.adminClient.mutation(internal.subscriptionPricing.registerReferral, { referrerAccountId: b.accountId, referredAccountId: a.accountId, reason: "Changed reason", key: "register-referral" })).rejects.toThrow("idempotency_conflict");
    const reward = { referralId, targets: [b.targets[6]], value: { kind: "fixed" as const, amount: rsd(100) }, validFrom: 0, validUntil: null, reason: "Test explicit referral terms", key: "reward" };
    await expect(a.adminClient.mutation(internal.subscriptionPricing.rewardReferral, reward)).rejects.toThrow("not_qualified");
    const periodId = await purchase(a, 1, date("2026-09-07"));
    const paymentId = await pay(a, "first", [{ periodId, amountMinor: 12_000 }]);
    expect(await t.run((ctx) => ctx.db.get(referralId))).toMatchObject({ status: "qualified", qualifyingPaymentId: paymentId });
    const discounts = await a.adminClient.mutation(internal.subscriptionPricing.rewardReferral, reward);
    expect(await a.adminClient.mutation(internal.subscriptionPricing.rewardReferral, reward)).toEqual(discounts);
    expect(await t.run((ctx) => ctx.db.query("discountRules").collect())).toHaveLength(1);
    await expect(a.adminClient.mutation(internal.subscriptionPricing.rewardReferral, { ...reward, key: "twice" })).rejects.toThrow("already_rewarded");
    const discounted = await purchase(b, 6, b.subs[6].facts.paidThrough!);
    const snapshot = (await t.run((ctx) => ctx.db.get(discounted)))!.price;
    expect(snapshot.effective.amountMinor).toBe(14_900);
    await a.adminClient.mutation(internal.subscriptionPayments.reverse, { paymentId, reason: "Test reversal", key: "reverse" });
    expect((await t.run((ctx) => ctx.db.get(referralId)))!.status).toBe("cancelled");
    expect((await t.run((ctx) => ctx.db.get(discounted)))!.price).toEqual(snapshot);
    await expect(a.adminClient.mutation(internal.subscriptionPricing.rewardReferral, reward)).rejects.toThrow("not_qualified");
  });

  test("unconfigured referral remains qualified, invalid/self/foreign/empty rewards refused", async () => {
    const t = convexTest(schema, modules), a = await adopt(t), b = await adopt(t, "referrer");
    await expect(a.adminClient.mutation(internal.subscriptionPricing.registerReferral, { referrerAccountId: a.accountId, referredAccountId: a.accountId, reason: "Test self referral", key: "self-referral" })).rejects.toThrow("self_referral");
    const periodId = await purchase(a, 1, date("2026-09-07"));
    await pay(a, "first", [{ periodId, amountMinor: 12_000 }]);
    const referralId = await a.adminClient.mutation(internal.subscriptionPricing.registerReferral, { referrerAccountId: b.accountId, referredAccountId: a.accountId, reason: "Test reversal referral", key: "register-reversal-referral" });
    expect((await t.run((ctx) => ctx.db.get(referralId)))!.status).toBe("qualified");
    expect(await t.run((ctx) => ctx.db.query("discountRules").collect())).toHaveLength(0);
    const args = { referralId, targets: [a.targets[1]], value: { kind: "percentage" as const, basisPoints: 1_000 }, validFrom: 0, validUntil: null, reason: "Test bad target", key: "bad" };
    await expect(a.adminClient.mutation(internal.subscriptionPricing.rewardReferral, args)).rejects.toThrow("target_not_in_account");
    await expect(a.adminClient.mutation(internal.subscriptionPricing.rewardReferral, { ...args, targets: [] })).rejects.toThrow();
  });
});

describe("ADMIN-03 additive migration and single writer", () => {
  test("new subscriptions require real target and purchase permission; duplicates and gaps rejected", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const profileId = await t.run((ctx) => ctx.db.insert("serviceProfiles", { businessId: a.businesses[3], type: "scanme_venue", slug: "new-service", status: "active", totalScans: 0, totalPageViews: 0, totalConvertedSessions: 0, createdAt: 1, updatedAt: 1 }));
    const target = { kind: "service_instance" as const, serviceProfileId: profileId };
    const args = { accountId: a.accountId, target, period: "monthly" as const, startsAt: Date.now(), key: "new" };
    const manager = t.withIdentity(adminIdentity(a.manager));
    const subscriptionId = await manager.mutation(internal.subscriptions.create, args);
    expect(await manager.mutation(internal.subscriptions.create, args)).toBe(subscriptionId);
    await expect(manager.mutation(internal.subscriptions.create, { ...args, key: "duplicate" })).rejects.toThrow("duplicate_target");
    await expect(manager.mutation(internal.subscriptions.create, { ...args, period: "annual" })).rejects.toThrow("idempotency_conflict");
    await expect(manager.mutation(internal.subscriptions.purchasePeriod, { subscriptionId, start: Date.now() })).rejects.toThrow("price_agreement_required");
    await a.adminClient.mutation(internal.subscriptionPricing.agreePrice, { accountId: a.accountId, target, period: "monthly", kind: "standard", reference: rsd(100), price: rsd(100), validFrom: 0, validUntil: null, reason: "Test price", key: "new-price" });
    const periodId = await manager.mutation(internal.subscriptions.purchasePeriod, { subscriptionId, start: Date.now() });
    expect(await manager.mutation(internal.subscriptions.purchasePeriod, { subscriptionId, start: Date.now() })).toBe(periodId);
    expect((await facts(t, subscriptionId)).status).toBe("inactive");
    await expect(manager.mutation(internal.subscriptions.purchasePeriod, { subscriptionId, start: Date.now() + DAY_MS })).rejects.toThrow("noncontiguous");
  });
  test("dry-run no writes, explicit evidence, retry, legacy source preserved and new dates never inferred", async () => {
    const t = convexTest(schema, modules), a = await seed(t);
    const originalAccount = await t.run((ctx) => ctx.db.get(a.accountId));
    const legacyId = await t.run((ctx) => ctx.db.insert("payments", { accountId: a.accountId, amountRsd: 123, method: "manual", paidAt: 1, createdAt: 1, voidedAt: 2 }));
    const originalPayment = await t.run((ctx) => ctx.db.get(legacyId));
    await a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, { ...a.migration, dryRun: true });
    expect(await t.run((ctx) => ctx.db.get(a.accountId))).toEqual(originalAccount);
    expect(await t.run((ctx) => ctx.db.query("subscriptions").collect())).toHaveLength(0);
    await expect(a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, { ...a.migration, subscriptions: a.migration.subscriptions.slice(1) })).rejects.toThrow("unresolved_service");
    await expect(a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, { ...a.migration, expectedUpdatedAt: 2 })).rejects.toThrow("stale_account");
    await a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, a.migration);
    expect((await a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, a.migration)).alreadyDone).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("subscriptions").collect())).toHaveLength(7);
    expect(await t.run((ctx) => ctx.db.get(legacyId))).toEqual(originalPayment);
    expect((await t.run((ctx) => ctx.db.get(a.accountId)))!.planValidUntil).toBe(originalAccount!.planValidUntil);
    const report = await a.adminClient.query(internal.subscriptionMigrations.legacyPayments, { accountId: a.accountId, paginationOpts: { cursor: null, numItems: 10 } });
    expect(report.page[0]).toEqual({ paymentId: legacyId, amountMinor: 12_300, unallocatedMinor: 12_300, method: "other", reversed: true, unresolved: ["legacy_method_unknown", "legacy_allocation_unknown", "legacy_reversal_reason_missing"] });
  });

  test("Starter is explicit; unpaid migration never grants paid service or creates a Premium row", async () => {
    const t = convexTest(schema, modules), a = await seed(t);
    await a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, { ...a.migration, premiumDecision: "starter", subscriptions: a.migration.subscriptions.slice(0, 6).map((row) => ({ ...row, coverage: { kind: "unpaid" } })) });
    expect(await a.adminClient.query(internal.subscriptions.premium, { accountId: a.accountId })).toBeNull();
    const rows = await t.run((ctx) => ctx.db.query("subscriptions").collect());
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.facts.status === "inactive")).toBe(true);
  });

  test("legacy payment/date/checkout/settlement/sweep refuse migrated accounts while old ones still work", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    await expect(a.adminClient.mutation(api.billing.recordManualPayment, { accountId: a.accountId, amountRsd: 1, paidAt: Date.now() })).rejects.toThrow("use_subscriptions_v1");
    await expect(a.adminClient.mutation(api.billing.setNextBillingAt, { accountId: a.accountId, nextBillingAt: Date.now() + DAY_MS })).rejects.toThrow("use_subscriptions_v1");
    await expect(a.adminClient.mutation(api.checkout.checkout, { accountId: a.accountId, serviceLines: [{ businessId: a.businesses[0], service: "scanme_links", period: "monthly" }] })).rejects.toThrow("use_subscriptions_v1");
    await expect(t.mutation(internal.billing.applyProviderPayment, { portId: "manual", accountId: a.accountId, rawNotice: { amountRsd: 1, paidAt: Date.now() } })).rejects.toThrow("use_subscriptions_v1");
    const legacyAccount = await t.run((ctx) => ctx.db.insert("accounts", { name: "legacy", plan: "basic", status: "active", planPeriod: "monthly", planValidUntil: 1, createdAt: 1, updatedAt: 1 }));
    await t.mutation(internal.billing.sweepBillingCycles, {});
    expect((await t.run((ctx) => ctx.db.get(a.accountId)))!.status).toBe("active");
    expect((await t.run((ctx) => ctx.db.get(legacyAccount)))!.status).toBe("expired");
    await a.adminClient.mutation(api.billing.recordManualPayment, { accountId: legacyAccount, amountRsd: 1, paidAt: Date.now() });
    expect((await t.run((ctx) => ctx.db.get(legacyAccount)))!.status).toBe("active");
  });
});

describe("ADMIN-03 lifecycle, Premium and overrides", () => {
  test("annual Premium has the same exact 15-day warning/grace rules", async () => {
    const t = convexTest(schema, modules), a = await seed(t);
    a.migration.subscriptions[6] = { ...a.migration.subscriptions[6], period: "annual", start: date("2025-09-12"), coverage: { kind: "paid", end: date("2026-09-12"), evidence: "Test annual Premium" } };
    await a.adminClient.mutation(internal.subscriptionMigrations.adoptAccount, a.migration);
    const sub = await t.run((ctx) => ctx.db.query("subscriptions").withIndex("by_accountId_and_targetKey", (q) => q.eq("accountId", a.accountId).eq("targetKey", "premium")).unique());
    const end = date("2026-09-12");
    for (const [now, status, warning] of [[end - 15 * DAY_MS - 1, "active", false], [end - 15 * DAY_MS, "active", true], [end, "grace", false], [end + 15 * DAY_MS - 1, "grace", false], [end + 15 * DAY_MS, "suspended", false]] as const) {
      expect((await a.adminClient.query(internal.subscriptions.get, { subscriptionId: sub!._id, now })).facts).toMatchObject({ status, warning });
    }
  });
  test.each([[0, 7], [3, 15], [6, 7]])("7/15 exact warning, paidThrough and grace boundaries target %i", async (index, days) => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const end = a.subs[index].facts.paidThrough!;
    for (const [now, status, warning] of [
      [end - days * DAY_MS - 1, "active", false], [end - days * DAY_MS, "active", true],
      [end - 1, "active", true], [end, "grace", false],
      [end + days * DAY_MS - 1, "grace", false], [end + days * DAY_MS, "suspended", false],
    ] as const) {
      const result = await a.adminClient.query(internal.subscriptions.get, { subscriptionId: a.subs[index]._id, now });
      expect(result.facts).toMatchObject({ status, warning });
    }
  });

  test.each([
    ["2025-01-31", "monthly", "2025-02-28"], ["2024-01-31", "monthly", "2024-02-29"],
    ["2024-02-29", "annual", "2025-02-28"], ["2026-12-15", "monthly", "2027-01-15"],
  ] as const)("calendar %s %s", (start, period, end) => expect(periodEnd(date(start), period, date(start))).toBe(date(end)));

  test("calendar anchor survives short months and returns to leap day", () => {
    expect(periodEnd(date("2025-02-28"), "monthly", date("2025-01-31"))).toBe(date("2025-03-31"));
    expect(periodEnd(date("2027-02-28"), "annual", date("2024-02-29"))).toBe(date("2028-02-29"));
  });

  test("Premium on every location/product, no changes to service dates, then Starter has no badge", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const before = await Promise.all(a.subs.slice(0, 6).map((sub) => t.run((ctx) => ctx.db.get(sub._id))));
    for (const business of a.businesses) for (const product of ["scanme_venue", "scanme_memories"] as const) {
      expect((await t.run((ctx) => getEntitlement(ctx, business, product)))?.planKey).toBe("premium");
    }
    expect(await a.adminClient.query(internal.subscriptions.premium, { accountId: a.accountId })).toBe("active");
    await a.adminClient.mutation(internal.subscriptions.control, { subscriptionId: a.subs[6]._id, operation: "cancel_now", key: "stop-premium", reason: "Test requested cancellation" });
    expect(await a.adminClient.query(internal.subscriptions.premium, { accountId: a.accountId })).toBeNull();
    for (const business of a.businesses) expect((await t.run((ctx) => getEntitlement(ctx, business, "scanme_venue")))?.planKey).toBe("basic");
    for (let i = 0; i < 6; i++) expect(await t.run((ctx) => ctx.db.get(a.subs[i]._id))).toEqual(before[i]);
  });

  test("cancel-at-end, manual suspension/reactivation and reasoned grace extension are isolated/idempotent", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    const owner = t.withIdentity(adminIdentity(a.owner));
    const cancel = { subscriptionId: a.subs[0]._id, operation: "cancel_at_end" as const, key: "cancel", reason: "Test cancellation" };
    await owner.mutation(internal.subscriptions.control, cancel);
    const events = await t.run((ctx) => ctx.db.query("subscriptionEvents").collect());
    await owner.mutation(internal.subscriptions.control, cancel);
    expect(await t.run((ctx) => ctx.db.query("subscriptionEvents").collect())).toEqual(events);
    vi.setSystemTime(a.subs[0].facts.paidThrough!);
    await t.mutation(internal.subscriptions.sweep, {});
    expect((await facts(t, a.subs[0]._id)).status).toBe("inactive");
    const selected = a.subs[3]._id;
    await a.adminClient.mutation(internal.subscriptions.control, { subscriptionId: selected, operation: "suspend", key: "suspend", reason: "Test manual hold" });
    expect((await facts(t, selected)).status).toBe("suspended");
    await a.adminClient.mutation(internal.subscriptions.control, { subscriptionId: selected, operation: "reactivate", key: "resume", reason: "Test resolved" });
    expect((await facts(t, selected)).status).toBe("active");
    const result = await a.adminClient.mutation(internal.subscriptions.control, { subscriptionId: a.subs[1]._id, operation: "extend_grace", graceEndsAt: Date.now() + DAY_MS, key: "grace", reason: "Test bank delay" });
    expect(result.status).toBe("grace");
    await expect(a.adminClient.mutation(internal.subscriptions.control, { subscriptionId: selected, operation: "suspend", key: "bad", reason: " " })).rejects.toThrow();
  });

  test("sweep drains multiple batches, preserves retry and unrelated legacy accounts", async () => {
    const t = convexTest(schema, modules), a = await adopt(t);
    await t.run(async (ctx) => {
      const sourcePeriod = (await ctx.db.query("subscriptionPeriods").withIndex("by_subscriptionId_and_start", (q) => q.eq("subscriptionId", a.subs[0]._id)).first())!;
      for (let i = 0; i < 110; i++) {
        const { _id, _creationTime, ...sub } = a.subs[0];
        void _id; void _creationTime;
        const businessId = await ctx.db.insert("businesses", { accountId: a.accountId, name: `batch-${i}`, slug: `batch-${i}`, status: "active", createdAt: 1 });
        const profileId = await ctx.db.insert("serviceProfiles", { businessId, type: "scanme_links", slug: `batch-${i}`, status: "active", totalScans: 0, totalPageViews: 0, totalConvertedSessions: 0, createdAt: 1, updatedAt: 1 });
        const subscriptionId = await ctx.db.insert("subscriptions", { ...sub, target: { kind: "service_instance", serviceProfileId: profileId }, businessId, key: `batch-${i}`, targetKey: `service:${profileId}`, nextTransitionAt: AS_OF - 1 });
        await ctx.db.insert("subscriptionPeriods", { accountId: a.accountId, subscriptionId, start: AS_OF - 39 * DAY_MS, end: AS_OF - 8 * DAY_MS, price: sourcePeriod.price, paidMinor: 12_000, funded: true, createdAt: 1 });
      }
    });
    const first = await t.mutation(internal.subscriptions.sweep, {});
    expect(first.scanned).toBe(50);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.mutation(internal.subscriptions.sweep, {})).toEqual({ scanned: 0, changed: 0 });
    const all = await t.run((ctx) => ctx.db.query("subscriptions").collect());
    expect(all.filter((sub) => sub.key.startsWith("batch-")).every((sub) => sub.facts.status === "suspended")).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(a.accountId)))!.status).toBe("active");
  });
});
