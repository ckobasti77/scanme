/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-15T10:00:00Z");
const identity = (userId: Id<"users">) => ({ subject: userId, issuer: "https://admin-settings.test" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = "settings-admin@example.invalid";
});
afterEach(() => vi.useRealTimers());

test("keeps the temporary price, requires an admin, and writes only a future audited version", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    admin: await ctx.db.insert("users", { email: "settings-admin@example.invalid" }),
    outsider: await ctx.db.insert("users", { email: "outsider@example.invalid" }),
  }));
  await expect(t.query(api.adminSettings.overview, {})).rejects.toThrow("Niste prijavljeni");
  await expect(t.withIdentity(identity(ids.outsider)).query(api.adminSettings.overview, {})).rejects.toThrow("Nemate administratorski pristup");
  const admin = t.withIdentity(identity(ids.admin));
  expect((await admin.query(api.adminSettings.overview, {})).premiumReference.amountMinor).toBe(1_490);
  const input = { amountMinor: 1_790, validFrom: NOW + 86_400_000, validUntil: null, reason: "Test future reference", key: "future-price", expectedVersion: 0 };
  expect(await admin.mutation(api.adminSettings.setPremiumReference, input)).toEqual({ version: 1, duplicate: false });
  expect(await admin.mutation(api.adminSettings.setPremiumReference, input)).toEqual({ version: 1, duplicate: true });
  await expect(admin.mutation(api.adminSettings.setPremiumReference, { ...input, key: "stale-price", expectedVersion: 0 })).rejects.toThrow("admin_settings_conflict");
  const facts = await t.run(async (ctx) => ({
    prices: await ctx.db.query("adminPremiumReferencePrices").withIndex("by_scope_and_validFrom", (q) => q.eq("scope", "global")).collect(),
    audit: await ctx.db.query("adminAuditLog").collect(),
  }));
  expect(facts.prices).toHaveLength(1);
  expect(facts.audit).toEqual(expect.arrayContaining([expect.objectContaining({ action: "admin_settings_premium_reference_scheduled" })]));
});

test("uses the existing agreement, friend waiver, and referral rules without defaults", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { email: "settings-admin@example.invalid" });
    const first = await ctx.db.insert("accounts", { name: "Prvi", plan: "premium", status: "active", planPeriod: "monthly", billingModel: "subscriptions_v1", adminV1MigrationVersion: 1, createdAt: 1, updatedAt: 1 });
    const second = await ctx.db.insert("accounts", { name: "Drugi", plan: "premium", status: "active", planPeriod: "monthly", billingModel: "subscriptions_v1", adminV1MigrationVersion: 1, createdAt: 1, updatedAt: 1 });
    const tagId = await ctx.db.insert("accountTags", { accountId: first, kind: "friend", createdAt: 1, updatedAt: 1 });
    return { admin, first, second, tagId };
  });
  const admin = t.withIdentity(identity(ids.admin));
  const future = NOW + 86_400_000;
  const agreement = { accountId: ids.first, target: { kind: "account_premium" as const }, period: "monthly" as const, kind: "founders" as const, referenceMinor: 1_490, priceMinor: 990, validFrom: future, validUntil: null, reason: "Izričit doživotni founders ugovor", key: "founders-lifetime" };
  await expect(admin.mutation(api.adminSettings.createAgreement, agreement)).resolves.toBeDefined();
  await expect(admin.mutation(api.adminSettings.createAgreement, agreement)).resolves.toBeDefined();
  await expect(admin.mutation(api.adminSettings.setFriendWaiver, { accountId: ids.first, target: { kind: "account_premium" }, tagId: ids.tagId, validFrom: future, validUntil: null, reason: "Samo Premium target", key: "friend-premium" })).resolves.toBeDefined();
  const referralId = await admin.mutation(api.adminSettings.registerReferral, { referrerAccountId: ids.first, referredAccountId: ids.second, reason: "Eksplicitna preporuka", key: "referral" });
  await expect(admin.mutation(api.adminSettings.registerReferral, { referrerAccountId: ids.first, referredAccountId: ids.second, reason: "Izmenjen razlog", key: "referral" })).rejects.toThrow("idempotency_conflict");
  await expect(admin.mutation(api.adminSettings.rewardReferral, { referralId, targets: [{ kind: "account_premium" }], value: { kind: "percentage", basisPoints: 500 }, validFrom: NOW, validUntil: null, reason: "Nema retroaktivne nagrade", key: "past-reward" })).rejects.toThrow("reward_must_be_future");
  const facts = await t.run(async (ctx) => ({ agreements: await ctx.db.query("priceAgreements").collect(), discounts: await ctx.db.query("discountRules").collect(), referrals: await ctx.db.query("referrals").collect() }));
  expect(facts.agreements[0]).toMatchObject({ kind: "founders", validUntil: null, change: { reason: "Izričit doživotni founders ugovor" } });
  expect(facts.discounts[0]).toMatchObject({ kind: "friend_waiver", target: { kind: "account_premium" } });
  expect(facts.referrals[0]).toMatchObject({ status: "pending", change: { reason: "Eksplicitna preporuka" } });
});
