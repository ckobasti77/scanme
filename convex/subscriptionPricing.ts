import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/access";
import { agreementKind, billingPeriod, discountValue, money, subscriptionTarget } from "./lib/subscriptionValidators";
import { bounded, fail, fingerprint, minor, requireBillingAccount, required, sameRequest, syncFinanceExpectedSubscription, targetBusiness, targetKey, timestamp, type Actor, type Target } from "./lib/subscriptions";

async function syncTargetFinance(ctx: MutationCtx, accountId: Id<"accounts">, target: Target, now: number) {
  const subscription = await ctx.db.query("subscriptions")
    .withIndex("by_accountId_and_targetKey", (q) => q.eq("accountId", accountId).eq("targetKey", targetKey(target)))
    .unique();
  if (subscription) await syncFinanceExpectedSubscription(ctx, subscription._id, now);
}

function validity(from: number, until: number | null) {
  timestamp(from);
  if (until !== null) { timestamp(until); if (until <= from) fail("billing_invalid_validity"); }
}
function validateDiscount(value: Infer<typeof discountValue>) {
  if (value.kind === "fixed") minor(value.amount.amountMinor, value.amount.currency);
  if (value.kind === "percentage" && (!Number.isInteger(value.basisPoints) || value.basisPoints < 0 || value.basisPoints > 10_000)) fail("billing_invalid_discount");
}

export const agreePrice = internalMutation({
  args: {
    accountId: v.id("accounts"), target: subscriptionTarget, period: billingPeriod,
    kind: agreementKind, reference: money, price: money,
    validFrom: v.number(), validUntil: v.union(v.number(), v.null()), reason: v.string(), key: v.string(),
  }, returns: v.id("priceAgreements"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requireBillingAccount(ctx, args.accountId);
    await targetBusiness(ctx, args.accountId, args.target);
    required(args.reason); required(args.key); validity(args.validFrom, args.validUntil);
    minor(args.reference.amountMinor, args.reference.currency); minor(args.price.amountMinor, args.price.currency);
    if (args.reference.currency !== args.price.currency) fail("billing_currency_mismatch");
    const hash = fingerprint(args);
    const existing = await ctx.db.query("priceAgreements").withIndex("by_accountId_and_key", (q) => q.eq("accountId", args.accountId).eq("key", args.key)).unique();
    if (existing) { sameRequest(existing, hash); return existing._id; }
    const { reason, ...fields } = args;
    const now = Date.now(), actor = { kind: "admin" as const, userId: admin._id };
    const agreementId = await ctx.db.insert("priceAgreements", { ...fields, targetKey: targetKey(args.target), change: { actor, at: now, reason }, fingerprint: hash });
    await ctx.db.insert("subscriptionEvents", { accountId: args.accountId, actor, action: "price.agreed", reason, agreementId, createdAt: now });
    await syncTargetFinance(ctx, args.accountId, args.target, now);
    return agreementId;
  },
});

export async function insertDiscount(ctx: MutationCtx, args: {
  accountId: Id<"accounts">; target: Target; kind: "friend_waiver" | "manual" | "referral_discount";
  value: Infer<typeof discountValue>; validFrom: number; validUntil: number | null;
  tagId?: Id<"accountTags">; referralId?: Id<"referrals">; reason: string; key: string;
}, actor: Actor, now: number) {
  await requireBillingAccount(ctx, args.accountId);
  await targetBusiness(ctx, args.accountId, args.target);
  required(args.reason); required(args.key); validity(args.validFrom, args.validUntil); validateDiscount(args.value);
  if (args.kind === "friend_waiver") {
    const tag = args.tagId && await ctx.db.get(args.tagId);
    if (!tag || tag.accountId !== args.accountId || tag.kind !== "friend" || args.value.kind !== "waiver") fail("billing_friend_tag_required");
  }
  const hash = fingerprint(args);
  const existing = await ctx.db.query("discountRules").withIndex("by_accountId_and_key", (q) => q.eq("accountId", args.accountId).eq("key", args.key)).unique();
  if (existing) { sameRequest(existing, hash); return existing._id; }
  const { reason, ...fields } = args;
  const discountId = await ctx.db.insert("discountRules", { ...fields, targetKey: targetKey(args.target), change: { actor, at: now, reason }, fingerprint: hash });
  await ctx.db.insert("subscriptionEvents", { accountId: args.accountId, actor, action: "discount.agreed", reason, discountId, createdAt: now });
  await syncTargetFinance(ctx, args.accountId, args.target, now);
  return discountId;
}

export const setDiscount = internalMutation({
  args: {
    accountId: v.id("accounts"), target: subscriptionTarget,
    kind: v.union(v.literal("friend_waiver"), v.literal("manual")), value: discountValue,
    tagId: v.optional(v.id("accountTags")), validFrom: v.number(), validUntil: v.union(v.number(), v.null()),
    reason: v.string(), key: v.string(),
  }, returns: v.id("discountRules"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return insertDiscount(ctx, args, { kind: "admin", userId: admin._id }, Date.now());
  },
});

export async function qualifyReferral(ctx: MutationCtx, accountId: Id<"accounts">, actor: Actor, now: number) {
  const referral = await ctx.db.query("referrals").withIndex("by_referredAccountId", (q) => q.eq("referredAccountId", accountId)).unique();
  if (!referral || referral.status !== "pending") return;
  const first = await ctx.db.query("paymentStates").withIndex("by_accountId_and_state_and_paidAt", (q) => q.eq("accountId", accountId).eq("state", "settled")).first();
  if (!first) return;
  await ctx.db.patch(referral._id, { status: "qualified", qualifyingPaymentId: first.paymentId, updatedAt: now });
  await ctx.db.insert("subscriptionEvents", { accountId, actor, action: "referral.qualified", referralId: referral._id, paymentId: first.paymentId, createdAt: now });
}

export const registerReferral = internalMutation({
  args: { referrerAccountId: v.id("accounts"), referredAccountId: v.id("accounts"), reason: v.string(), key: v.string() }, returns: v.id("referrals"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requireBillingAccount(ctx, args.referrerAccountId); await requireBillingAccount(ctx, args.referredAccountId);
    required(args.reason); required(args.key);
    if (args.referrerAccountId === args.referredAccountId) fail("billing_self_referral");
    const hash = fingerprint(args);
    const duplicate = await ctx.db.query("subscriptionEvents").withIndex("by_accountId_and_key", (q) => q.eq("accountId", args.referredAccountId).eq("key", args.key)).unique();
    if (duplicate) {
      if (duplicate.fingerprint !== hash || !duplicate.referralId) fail("billing_idempotency_conflict");
      return duplicate.referralId;
    }
    const existing = await ctx.db.query("referrals").withIndex("by_referredAccountId", (q) => q.eq("referredAccountId", args.referredAccountId)).unique();
    if (existing) { if (existing.referrerAccountId !== args.referrerAccountId) fail("billing_referral_exists"); return existing._id; }
    const now = Date.now(), actor = { kind: "admin" as const, userId: admin._id };
    const id = await ctx.db.insert("referrals", { referrerAccountId: args.referrerAccountId, referredAccountId: args.referredAccountId, status: "pending", change: { actor, at: now, reason: args.reason }, key: args.key, fingerprint: hash, createdAt: now, updatedAt: now });
    await ctx.db.insert("subscriptionEvents", { accountId: args.referredAccountId, actor, action: "referral.registered", reason: args.reason, referralId: id, key: args.key, fingerprint: hash, createdAt: now });
    await qualifyReferral(ctx, args.referredAccountId, actor, now);
    return id;
  },
});

export const rewardReferral = internalMutation({
  args: { referralId: v.id("referrals"), targets: v.array(subscriptionTarget), value: discountValue, validFrom: v.number(), validUntil: v.union(v.number(), v.null()), reason: v.string(), key: v.string() },
  returns: v.array(v.id("discountRules")),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx), referral = await ctx.db.get(args.referralId);
    required(args.reason); required(args.key); bounded(args.targets);
    if (new Set(args.targets.map(targetKey)).size !== args.targets.length) fail("billing_duplicate_target");
    if (!referral || !referral.qualifyingPaymentId || (referral.status !== "qualified" && referral.status !== "rewarded")) fail("billing_referral_not_qualified");
    const receipt = await ctx.db.query("paymentStates").withIndex("by_paymentId", (q) => q.eq("paymentId", referral.qualifyingPaymentId!)).unique();
    if (receipt?.state !== "settled") fail("billing_referral_not_qualified");
    const hash = fingerprint(args);
    const previous = await ctx.db.query("subscriptionEvents").withIndex("by_accountId_and_key", (q) => q.eq("accountId", referral.referrerAccountId).eq("key", args.key)).unique();
    if (previous) {
      if (previous.fingerprint !== hash) fail("billing_idempotency_conflict");
      return (await ctx.db.query("discountRules").withIndex("by_referralId", (q) => q.eq("referralId", referral._id)).take(BILLING_REWARD_LIMIT)).map((row) => row._id);
    }
    if (referral.status === "rewarded") fail("billing_referral_already_rewarded");
    const now = Date.now(), actor = { kind: "admin" as const, userId: admin._id };
    const ids: Id<"discountRules">[] = [];
    for (const target of args.targets) ids.push(await insertDiscount(ctx, {
      accountId: referral.referrerAccountId, target, kind: "referral_discount", value: args.value,
      validFrom: args.validFrom, validUntil: args.validUntil, reason: args.reason,
      referralId: referral._id, key: `referral:${referral._id}:${targetKey(target)}`,
    }, actor, now));
    await ctx.db.patch(referral._id, { status: "rewarded", updatedAt: now });
    for (const target of args.targets) await syncTargetFinance(ctx, referral.referrerAccountId, target, now);
    await ctx.db.insert("subscriptionEvents", { accountId: referral.referrerAccountId, actor, action: "referral.rewarded", referralId: referral._id, reason: args.reason, key: args.key, fingerprint: hash, createdAt: now });
    return ids;
  },
});
const BILLING_REWARD_LIMIT = 50;
