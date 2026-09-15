import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { requireAdmin } from "./lib/access";
import { allocationInput, money, paymentMethod } from "./lib/subscriptionValidators";
import { authorizeTarget, BILLING_BATCH, bounded, fail, fingerprint, minor, reconcileSubscription, requireBillingAccount, required, sameRequest, timestamp } from "./lib/subscriptions";
import { qualifyReferral } from "./subscriptionPricing";
import { projectFinancePayment } from "./lib/financeProjection";

// This verifies intent/capability only. A client must never be able to claim
// cash arrived. The provider-neutral admin receipt below is the settlement gate.
export const preparePayment = internalQuery({
  args: { accountId: v.id("accounts"), periodIds: v.array(v.id("subscriptionPeriods")) },
  returns: v.object({ amount: money, allocations: v.array(allocationInput) }),
  handler: async (ctx, args) => {
    bounded(args.periodIds);
    if (new Set(args.periodIds).size !== args.periodIds.length) fail("billing_duplicate_allocation");
    let total = 0, currency: string | undefined;
    const allocations = [];
    for (const periodId of args.periodIds) {
      const period = await ctx.db.get(periodId), sub = period && await ctx.db.get(period.subscriptionId);
      if (!period || !sub || sub.accountId !== args.accountId) fail("billing_target_not_in_account");
      await authorizeTarget(ctx, args.accountId, sub.target, "buy");
      if (sub.cancelledAt !== undefined || sub.suspended) fail("billing_reactivation_required");
      if (currency && period.price.effective.currency !== currency) fail("billing_currency_mismatch");
      currency = period.price.effective.currency;
      const amountMinor = period.price.effective.amountMinor - period.paidMinor;
      minor(amountMinor, currency); total += amountMinor; minor(total, currency);
      allocations.push({ periodId, amountMinor });
    }
    return { amount: { amountMinor: total, currency: currency! }, allocations };
  },
});

export const record = internalMutation({
  args: {
    accountId: v.id("accounts"), amount: money, unallocatedMinor: v.number(),
    method: paymentMethod, paidAt: v.number(), reference: v.optional(v.string()),
    provider: v.optional(v.string()), providerEventId: v.optional(v.string()),
    allocations: v.array(allocationInput), key: v.string(),
  }, returns: v.id("payments"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requireBillingAccount(ctx, args.accountId);
    required(args.key); timestamp(args.paidAt);
    minor(args.amount.amountMinor, args.amount.currency); minor(args.unallocatedMinor, args.amount.currency);
    if (args.amount.currency !== "RSD") fail("billing_currency_not_supported"); // No implicit FX or false legacy RSD mirror.
    if (args.amount.amountMinor === 0 || args.paidAt > Date.now()) fail("billing_invalid_payment");
    if (args.allocations.length > BILLING_BATCH) fail("billing_invalid_batch");
    if (args.providerEventId && !args.provider) fail("billing_provider_required");
    const hash = fingerprint({ ...args, allocations: [...args.allocations].sort((a, b) => a.periodId.localeCompare(b.periodId)) });
    const existing = await ctx.db.query("payments").withIndex("by_accountId_and_ledger_key", (q) => q.eq("accountId", args.accountId).eq("ledger.key", args.key)).unique();
    if (existing?.ledger) { sameRequest(existing.ledger, hash); return existing._id; }
    if (args.providerEventId) {
      const duplicate = await ctx.db.query("payments").withIndex("by_ledger_provider_and_ledger_providerEventId", (q) => q.eq("ledger.provider", args.provider).eq("ledger.providerEventId", args.providerEventId)).unique();
      if (duplicate) fail("billing_duplicate_provider_event");
    }
    const periods: Doc<"subscriptionPeriods">[] = [];
    const financeSnapshots: { category: "saas" | "premium"; serviceType?: Doc<"serviceProfiles">["type"]; period: Doc<"subscriptions">["period"] }[] = [];
    const seen = new Set<string>();
    let total = args.unallocatedMinor;
    for (const allocation of args.allocations) {
      minor(allocation.amountMinor, args.amount.currency);
      if (allocation.amountMinor === 0 || seen.has(allocation.periodId)) fail("billing_duplicate_or_empty_allocation");
      seen.add(allocation.periodId);
      const period = await ctx.db.get(allocation.periodId), sub = period && await ctx.db.get(period.subscriptionId);
      if (!period || !sub || period.accountId !== args.accountId || sub.accountId !== args.accountId) fail("billing_target_not_in_account");
      await authorizeTarget(ctx, args.accountId, sub.target, "buy");
      if (sub.cancelledAt !== undefined || sub.suspended) fail("billing_reactivation_required");
      if (period.price.effective.currency !== args.amount.currency) fail("billing_currency_mismatch");
      if (period.funded) fail("billing_period_already_funded");
      if (period.paidMinor + allocation.amountMinor > period.price.effective.amountMinor) fail("billing_overallocation");
      let serviceType: Doc<"serviceProfiles">["type"] | undefined;
      if (sub.target.kind === "service_instance") {
        const profile = await ctx.db.get(sub.target.serviceProfileId);
        if (!profile) fail("billing_target_not_in_account");
        serviceType = profile.type;
      }
      total += allocation.amountMinor;
      minor(total, args.amount.currency);
      periods.push(period);
      financeSnapshots.push({ category: sub.target.kind === "account_premium" ? "premium" : "saas", ...(serviceType ? { serviceType } : {}), period: sub.period });
    }
    if (total !== args.amount.amountMinor) fail("billing_unbalanced_payment");
    const now = Date.now(), actor = { kind: "admin" as const, userId: admin._id };
    const paymentId = await ctx.db.insert("payments", {
      accountId: args.accountId, amountRsd: args.amount.amountMinor / 100,
      method: args.provider ? "provider" : "manual", paidAt: args.paidAt,
      ...(args.reference ? { reference: args.reference } : {}), recordedByUserId: admin._id, createdAt: now,
      ledger: { amount: args.amount, unallocatedMinor: args.unallocatedMinor, method: args.method,
        ...(args.provider ? { provider: args.provider } : {}), ...(args.providerEventId ? { providerEventId: args.providerEventId } : {}),
        recordedBy: actor, key: args.key, fingerprint: hash },
    });
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i], amountMinor = args.allocations[i].amountMinor;
      await ctx.db.insert("paymentAllocations", { accountId: args.accountId, paymentId, subscriptionId: period.subscriptionId,
        periodId: period._id, start: period.start, end: period.end, amount: { amountMinor, currency: args.amount.currency }, price: period.price,
        financeCategory: financeSnapshots[i].category, ...(financeSnapshots[i].serviceType ? { financeServiceType: financeSnapshots[i].serviceType } : {}),
        financePeriod: financeSnapshots[i].period, createdAt: now });
      const paidMinor = period.paidMinor + amountMinor;
      await ctx.db.patch(period._id, { paidMinor, funded: paidMinor === period.price.effective.amountMinor });
    }
    for (const subscriptionId of new Set(periods.map((period) => period.subscriptionId))) await reconcileSubscription(ctx, subscriptionId, now, actor);
    await ctx.db.insert("paymentStates", { accountId: args.accountId, paymentId, paidAt: args.paidAt, state: "settled" });
    await ctx.db.insert("subscriptionEvents", { accountId: args.accountId, actor, action: "payment.recorded", paymentId, createdAt: now });
    await qualifyReferral(ctx, args.accountId, actor, now);
    await projectFinancePayment(ctx, paymentId);
    return paymentId;
  },
});

export const reverse = internalMutation({
  args: { paymentId: v.id("payments"), reason: v.string(), key: v.string() }, returns: v.id("paymentAdjustments"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx), reason = required(args.reason); required(args.key);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment?.ledger) fail("billing_legacy_payment_requires_review");
    const hash = fingerprint(args);
    const previous = await ctx.db.query("paymentAdjustments").withIndex("by_accountId_and_key", (q) => q.eq("accountId", payment.accountId).eq("key", args.key)).unique();
    if (previous) { sameRequest(previous, hash); return previous._id; }
    if (await ctx.db.query("paymentAdjustments").withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id)).unique()) fail("billing_payment_already_reversed");
    const allocations = await ctx.db.query("paymentAllocations").withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id)).take(BILLING_BATCH + 1);
    if (allocations.length > BILLING_BATCH) fail("billing_invalid_batch");
    const now = Date.now(), actor = { kind: "admin" as const, userId: admin._id };
    const adjustmentId = await ctx.db.insert("paymentAdjustments", { accountId: payment.accountId, paymentId: payment._id, kind: "reversal", amount: payment.ledger.amount, change: { actor, at: now, reason }, key: args.key, fingerprint: hash });
    for (const allocation of allocations) {
      const period = await ctx.db.get(allocation.periodId);
      if (!period) fail("billing_period_missing");
      const paidMinor = period.paidMinor - allocation.amount.amountMinor;
      minor(paidMinor);
      await ctx.db.patch(period._id, { paidMinor, funded: paidMinor === period.price.effective.amountMinor });
    }
    for (const subscriptionId of new Set(allocations.map((allocation) => allocation.subscriptionId))) await reconcileSubscription(ctx, subscriptionId, now, actor);
    const state = await ctx.db.query("paymentStates").withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id)).unique();
    if (!state) fail("billing_payment_state_missing");
    await ctx.db.patch(state._id, { state: "reversed" });
    const referral = await ctx.db.query("referrals").withIndex("by_qualifyingPaymentId", (q) => q.eq("qualifyingPaymentId", payment._id)).unique();
    if (referral && referral.status !== "cancelled") {
      // Past price snapshots stay intact; the qualifying evidence was reversed,
      // so no future reward is silently kept alive or issued a second time.
      await ctx.db.patch(referral._id, { status: "cancelled", updatedAt: now });
      await ctx.db.insert("subscriptionEvents", { accountId: referral.referrerAccountId, actor, action: "referral.qualifying_payment_reversed", referralId: referral._id, paymentId: payment._id, reason, createdAt: now });
    }
    await ctx.db.insert("subscriptionEvents", { accountId: payment.accountId, actor, action: "payment.reversed", paymentId: payment._id, adjustmentId, reason, createdAt: now });
    await projectFinancePayment(ctx, payment._id);
    return adjustmentId;
  },
});

export const history = internalQuery({
  args: { accountId: v.id("accounts"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("payments")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.query("payments").withIndex("by_accountId_and_paidAt", (q) => q.eq("accountId", args.accountId)).order("desc").paginate(args.paginationOpts);
  },
});
