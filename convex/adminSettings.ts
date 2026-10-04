import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fingerprint } from "./lib/subscriptions";
import { agreementKind, billingPeriod, discountValue, subscriptionTarget } from "./lib/subscriptionValidators";

const INITIAL_PREMIUM_REFERENCE_MINOR = 1_490;

function assertFuturePrice(args: { amountMinor: number; validFrom: number; validUntil: number | null; reason: string; key: string }, now: number) {
  if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor < 0) throw new ConvexError("admin_settings_price_invalid");
  if (!Number.isSafeInteger(args.validFrom) || args.validFrom <= now) throw new ConvexError("admin_settings_price_must_be_future");
  if (args.validUntil !== null && (!Number.isSafeInteger(args.validUntil) || args.validUntil <= args.validFrom)) throw new ConvexError("admin_settings_validity_invalid");
  if (!args.reason.trim() || !args.key.trim()) throw new ConvexError("admin_settings_reason_and_key_required");
}

export const overview = query({
  args: {},
  returns: v.object({
    premiumReference: v.object({ amountMinor: v.number(), currency: v.literal("RSD"), validFrom: v.union(v.number(), v.null()), validUntil: v.union(v.number(), v.null()), version: v.number(), temporary: v.boolean() }),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const state = await ctx.db.query("adminBusinessRuleState").withIndex("by_scope", (q) => q.eq("scope", "global")).unique();
    const now = Date.now();
    const latest = await ctx.db.query("adminPremiumReferencePrices").withIndex("by_scope_and_validFrom", (q) => q.eq("scope", "global").lte("validFrom", now)).order("desc").first();
    return { premiumReference: latest
      ? { amountMinor: latest.amountMinor, currency: "RSD" as const, validFrom: latest.validFrom, validUntil: latest.validUntil, version: state?.version ?? latest.version, temporary: true }
      : { amountMinor: INITIAL_PREMIUM_REFERENCE_MINOR, currency: "RSD" as const, validFrom: null, validUntil: null, version: 0, temporary: true } };
  },
});

export const setPremiumReference = mutation({
  args: { amountMinor: v.number(), validFrom: v.number(), validUntil: v.union(v.number(), v.null()), reason: v.string(), key: v.string(), expectedVersion: v.number() },
  returns: v.object({ version: v.number(), duplicate: v.boolean() }),
  handler: async (ctx, args): Promise<{ version: number; duplicate: boolean }> => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    assertFuturePrice(args, now);
    const hash = fingerprint({ ...args, scope: "global" });
    const existing = await ctx.db.query("adminPremiumReferencePrices").withIndex("by_scope_and_key", (q) => q.eq("scope", "global").eq("key", args.key.trim())).unique();
    if (existing) {
      if (existing.fingerprint !== hash) throw new ConvexError("admin_settings_idempotency_conflict");
      return { version: existing.version, duplicate: true };
    }
    const state = await ctx.db.query("adminBusinessRuleState").withIndex("by_scope", (q) => q.eq("scope", "global")).unique();
    const currentVersion = state?.version ?? 0;
    if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion !== currentVersion) throw new ConvexError("admin_settings_conflict");
    const version = currentVersion + 1;
    await ctx.db.insert("adminPremiumReferencePrices", { scope: "global", amountMinor: args.amountMinor, currency: "RSD", validFrom: args.validFrom, validUntil: args.validUntil, version, reason: args.reason.trim(), key: args.key.trim(), fingerprint: hash, actorUserId: admin._id, createdAt: now });
    if (state) await ctx.db.patch(state._id, { version, updatedAt: now, updatedByUserId: admin._id });
    else await ctx.db.insert("adminBusinessRuleState", { scope: "global", version, updatedAt: now, updatedByUserId: admin._id });
    await writeAdminAudit(ctx, { actorUserId: admin._id, action: "admin_settings_premium_reference_scheduled", detail: { previousVersion: currentVersion, version, amountMinor: args.amountMinor, currency: "RSD", validFrom: args.validFrom, validUntil: args.validUntil, reason: args.reason.trim() }, now });
    return { version, duplicate: false };
  },
});

const targetRow = v.object({
  target: subscriptionTarget,
  period: billingPeriod,
});

export const agreementDirectory = query({
  args: {},
  returns: v.object({
    accounts: v.array(v.object({ accountId: v.id("accounts"), name: v.string() })),
    friendTags: v.array(v.object({ accountId: v.id("accounts"), tagId: v.id("accountTags") })),
    agreements: v.array(v.object({ id: v.id("priceAgreements"), accountId: v.id("accounts"), period: billingPeriod, kind: agreementKind, priceMinor: v.number(), validFrom: v.number(), validUntil: v.union(v.number(), v.null()), reason: v.string() })),
    referrals: v.array(v.object({ id: v.id("referrals"), referrerAccountId: v.id("accounts"), referredAccountId: v.id("accounts"), status: v.union(v.literal("pending"), v.literal("qualified"), v.literal("rewarded"), v.literal("cancelled")), updatedAt: v.number() })),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [accounts, agreements, referrals, friendTags] = await Promise.all([
      ctx.db.query("adminClientReadModels").withIndex("by_normalizedOwnerDisplayName").take(101),
      ctx.db.query("priceAgreements").withIndex("by_validFrom").order("desc").take(51),
      ctx.db.query("referrals").withIndex("by_updatedAt").order("desc").take(51),
      ctx.db.query("accountTags").withIndex("by_kind", (q) => q.eq("kind", "friend")).take(51),
    ]);
    if (accounts.length > 100 || agreements.length > 50 || referrals.length > 50 || friendTags.length > 50) throw new ConvexError("admin_settings_read_limit");
    return {
      accounts: accounts.map((row) => ({ accountId: row.accountId, name: row.accountName })),
      friendTags: friendTags.map((row) => ({ accountId: row.accountId, tagId: row._id })),
      agreements: agreements.map((row) => ({ id: row._id, accountId: row.accountId, period: row.period, kind: row.kind, priceMinor: row.price.amountMinor, validFrom: row.validFrom, validUntil: row.validUntil, reason: row.change.reason })),
      referrals: referrals.map((row) => ({ id: row._id, referrerAccountId: row.referrerAccountId, referredAccountId: row.referredAccountId, status: row.status, updatedAt: row.updatedAt })),
    };
  },
});

export const targetsForAccount = query({
  args: { accountId: v.id("accounts") },
  returns: v.array(targetRow),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("subscriptions").withIndex("by_accountId_and_targetKey", (q) => q.eq("accountId", args.accountId)).take(51);
    if (rows.length > 50) throw new ConvexError("admin_settings_target_limit");
    return rows.map((row) => ({ target: row.target, period: row.period }));
  },
});

export const createAgreement = mutation({
  args: { accountId: v.id("accounts"), target: subscriptionTarget, period: billingPeriod, kind: agreementKind, referenceMinor: v.number(), priceMinor: v.number(), validFrom: v.number(), validUntil: v.union(v.number(), v.null()), reason: v.string(), key: v.string() },
  returns: v.id("priceAgreements"),
  handler: async (ctx, args): Promise<Id<"priceAgreements">> => {
    await requireAdmin(ctx);
    return ctx.runMutation(internal.subscriptionPricing.agreePrice, {
      accountId: args.accountId, target: args.target, period: args.period, kind: args.kind,
      reference: { amountMinor: args.referenceMinor, currency: "RSD" }, price: { amountMinor: args.priceMinor, currency: "RSD" },
      validFrom: args.validFrom, validUntil: args.validUntil, reason: args.reason, key: args.key,
    });
  },
});

export const registerReferral = mutation({
  args: { referrerAccountId: v.id("accounts"), referredAccountId: v.id("accounts"), reason: v.string(), key: v.string() },
  returns: v.id("referrals"),
  handler: async (ctx, args): Promise<Id<"referrals">> => {
    await requireAdmin(ctx);
    return ctx.runMutation(internal.subscriptionPricing.registerReferral, args);
  },
});

export const setFriendWaiver = mutation({
  args: { accountId: v.id("accounts"), target: subscriptionTarget, tagId: v.id("accountTags"), validFrom: v.number(), validUntil: v.union(v.number(), v.null()), reason: v.string(), key: v.string() },
  returns: v.id("discountRules"),
  handler: async (ctx, args): Promise<Id<"discountRules">> => {
    await requireAdmin(ctx);
    return ctx.runMutation(internal.subscriptionPricing.setDiscount, {
      ...args,
      kind: "friend_waiver",
      value: { kind: "waiver" },
    });
  },
});

export const rewardReferral = mutation({
  args: { referralId: v.id("referrals"), targets: v.array(subscriptionTarget), value: discountValue, validFrom: v.number(), validUntil: v.union(v.number(), v.null()), reason: v.string(), key: v.string() },
  returns: v.array(v.id("discountRules")),
  handler: async (ctx, args): Promise<Id<"discountRules">[]> => {
    await requireAdmin(ctx);
    if (!Number.isSafeInteger(args.validFrom) || args.validFrom <= Date.now()) throw new ConvexError("admin_settings_reward_must_be_future");
    if (args.validUntil !== null && (!Number.isSafeInteger(args.validUntil) || args.validUntil <= args.validFrom)) throw new ConvexError("admin_settings_validity_invalid");
    return ctx.runMutation(internal.subscriptionPricing.rewardReferral, args);
  },
});
