import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireAdmin } from "./lib/access";
import { requireClientAccountAccess } from "./lib/clientAccountAccess";
import { billingPeriod, lifecycleFacts, subscriptionTarget } from "./lib/subscriptionValidators";
import {
  authorizeTarget, BILLING_BATCH, calculateFacts, effectivePrice, fail,
  fingerprint, periodEnd, premiumFact, reconcileSubscription, required,
  sameRequest, targetKey, timestamp, type Actor,
} from "./lib/subscriptions";

// Internal until a real client screen calls these. Auth remains enforced here
// so a later transport wrapper cannot accidentally widen account/venue access.
export const create = internalMutation({
  args: { accountId: v.id("accounts"), target: subscriptionTarget, period: billingPeriod, startsAt: v.number(), key: v.string() },
  returns: v.id("subscriptions"),
  handler: async (ctx, args) => {
    const { actor, businessId } = await authorizeTarget(ctx, args.accountId, args.target, "buy");
    timestamp(args.startsAt); required(args.key);
    const hash = fingerprint(args);
    const existing = await ctx.db.query("subscriptions").withIndex("by_accountId_and_key", (q) => q.eq("accountId", args.accountId).eq("key", args.key)).unique();
    if (existing) { sameRequest(existing, hash); return existing._id; }
    const key = targetKey(args.target);
    if (await ctx.db.query("subscriptions").withIndex("by_accountId_and_targetKey", (q) => q.eq("accountId", args.accountId).eq("targetKey", key)).unique()) fail("billing_duplicate_target");
    const now = Date.now();
    const subscriptionId = await ctx.db.insert("subscriptions", {
      ...args, targetKey: key, ...(businessId ? { businessId } : {}), anchorAt: args.startsAt,
      renewal: { kind: "manual" }, cancelAtPeriodEnd: false,
      facts: { status: "inactive", warning: false, currentPeriodStart: null, paidThrough: null, graceEndsAt: null, nextTransitionAt: null },
      fingerprint: hash, createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("subscriptionEvents", { accountId: args.accountId, subscriptionId, actor, action: "subscription.created", createdAt: now });
    return subscriptionId;
  },
});

export async function openPeriod(ctx: MutationCtx, sub: Doc<"subscriptions">, start: number, now: number, actor: Actor): Promise<Id<"subscriptionPeriods">> {
  timestamp(start);
  const existing = await ctx.db.query("subscriptionPeriods").withIndex("by_subscriptionId_and_start", (q) => q.eq("subscriptionId", sub._id).eq("start", start)).unique();
  if (existing) return existing._id;
  if (sub.cancelledAt !== undefined || sub.suspended) fail("billing_reactivation_required");
  const last = await ctx.db.query("subscriptionPeriods").withIndex("by_subscriptionId_and_start", (q) => q.eq("subscriptionId", sub._id)).order("desc").first();
  if (last ? !last.funded || start !== last.end : start !== sub.startsAt) fail("billing_noncontiguous_period");
  const price = await effectivePrice(ctx, sub, start, now);
  const periodId = await ctx.db.insert("subscriptionPeriods", {
    accountId: sub.accountId, subscriptionId: sub._id, start,
    end: periodEnd(start, sub.period, sub.anchorAt), price, paidMinor: 0,
    funded: price.effective.amountMinor === 0, createdAt: now,
  });
  await ctx.db.insert("subscriptionEvents", { accountId: sub.accountId, subscriptionId: sub._id, actor, action: "subscription.period_opened", createdAt: now });
  await reconcileSubscription(ctx, sub._id, now, actor);
  const end = periodEnd(start, sub.period, sub.anchorAt);
  if (price.effective.amountMinor === 0 && end <= now) await ctx.db.patch(sub._id, { nextTransitionAt: end });
  return periodId;
}

export const purchasePeriod = internalMutation({
  args: { subscriptionId: v.id("subscriptions"), start: v.number() }, returns: v.id("subscriptionPeriods"),
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) fail("billing_subscription_missing");
    const { actor } = await authorizeTarget(ctx, sub.accountId, sub.target, "buy");
    return openPeriod(ctx, sub, args.start, Date.now(), actor);
  },
});

export const get = internalQuery({
  args: { subscriptionId: v.id("subscriptions"), now: v.number() },
  returns: v.object({ subscription: schema.doc("subscriptions"), facts: lifecycleFacts }),
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) fail("billing_subscription_missing");
    await authorizeTarget(ctx, sub.accountId, sub.target, "read");
    return { subscription: sub, facts: await calculateFacts(ctx, sub, args.now) };
  },
});

export const premium = internalQuery({
  args: { accountId: v.id("accounts") }, returns: v.union(v.literal("active"), v.literal("grace"), v.null()),
  handler: async (ctx, args) => { await requireClientAccountAccess(ctx, args.accountId); return premiumFact(ctx, args.accountId); },
});

export const list = internalQuery({
  args: { accountId: v.id("accounts"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("subscriptions")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.query("subscriptions").withIndex("by_accountId_and_targetKey", (q) => q.eq("accountId", args.accountId)).paginate(args.paginationOpts);
  },
});

export const control = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"), key: v.string(), reason: v.string(),
    operation: v.union(v.literal("cancel_now"), v.literal("cancel_at_end"), v.literal("suspend"), v.literal("reactivate"), v.literal("extend_grace")),
    graceEndsAt: v.optional(v.number()),
  }, returns: lifecycleFacts,
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) fail("billing_subscription_missing");
    const { actor } = await authorizeTarget(ctx, sub.accountId, sub.target, "cancel");
    if (args.operation === "suspend" || args.operation === "extend_grace" || args.operation === "reactivate") await requireAdmin(ctx);
    const reason = required(args.reason); required(args.key);
    const hash = fingerprint(args);
    const prior = await ctx.db.query("subscriptionEvents").withIndex("by_accountId_and_key", (q) => q.eq("accountId", sub.accountId).eq("key", args.key)).unique();
    if (prior) {
      if (prior.fingerprint !== hash || !prior.after) fail("billing_idempotency_conflict");
      return prior.after;
    }
    const now = Date.now(), before = await calculateFacts(ctx, sub, now);
    const change = { actor, at: now, reason };
    switch (args.operation) {
      case "cancel_now": await ctx.db.patch(sub._id, { cancelledAt: now, cancelAtPeriodEnd: false, lastOverride: change }); break;
      case "cancel_at_end": await ctx.db.patch(sub._id, { cancelledAt: Math.max(now, before.paidThrough ?? now), cancelAtPeriodEnd: true, lastOverride: change }); break;
      case "suspend": await ctx.db.patch(sub._id, { suspended: change, lastOverride: change }); break;
      case "reactivate": await ctx.db.patch(sub._id, { suspended: undefined, cancelledAt: undefined, cancelAtPeriodEnd: false, lastOverride: change }); break;
      case "extend_grace": {
        if (args.graceEndsAt === undefined || before.paidThrough === null || args.graceEndsAt <= Math.max(now, before.graceEndsAt ?? 0)) fail("billing_invalid_grace");
        timestamp(args.graceEndsAt);
        const period = await ctx.db.query("subscriptionPeriods").withIndex("by_subscriptionId_and_start", (q) => q.eq("subscriptionId", sub._id).eq("start", before.currentPeriodStart!)).unique();
        if (!period) fail("billing_period_missing");
        await ctx.db.patch(sub._id, { graceOverride: { periodId: period._id, endsAt: args.graceEndsAt }, lastOverride: change });
        break;
      }
    }
    const after = await reconcileSubscription(ctx, sub._id, now, actor);
    await ctx.db.insert("subscriptionEvents", { accountId: sub.accountId, subscriptionId: sub._id, actor, action: `subscription.${args.operation}`, reason, before, after, key: args.key, fingerprint: hash, createdAt: now });
    return after;
  },
});

/** Due rows leave the index after reconciliation; retry never repeats effects. */
export const sweep = internalMutation({
  args: {}, returns: v.object({ scanned: v.number(), changed: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db.query("subscriptions").withIndex("by_nextTransitionAt", (q) => q.gt("nextTransitionAt", 0).lte("nextTransitionAt", now)).take(BILLING_BATCH);
    let changed = 0;
    let catchingUp = false;
    for (const sub of due) {
      const actor = { kind: "system" as const, source: "subscription_lifecycle" };
      const last = await ctx.db.query("subscriptionPeriods").withIndex("by_subscriptionId_and_start", (q) => q.eq("subscriptionId", sub._id)).order("desc").first();
      if (last?.funded && last.end <= now && sub.cancelledAt === undefined && !sub.suspended) {
        // Waivers/explicit zero prices renew without fabricating a cash receipt.
        // One period per row per batch bounds catch-up after downtime.
        let nextPrice = null;
        try { nextPrice = await effectivePrice(ctx, sub, last.end, now); }
        catch (error) { if (!(error instanceof ConvexError) || error.data !== "billing_price_agreement_required") throw error; }
        if (nextPrice?.effective.amountMinor === 0) {
          const id = await openPeriod(ctx, sub, last.end, now, actor);
          const opened = (await ctx.db.get(id))!;
          if (opened.end <= now) {
            await ctx.db.patch(sub._id, { nextTransitionAt: opened.end });
            catchingUp = true;
            changed++;
            continue;
          }
        }
      }
      const after = await reconcileSubscription(ctx, sub._id, now, actor);
      if (fingerprint(after) !== fingerprint(sub.facts)) changed++;
    }
    if (due.length === BILLING_BATCH || catchingUp) await ctx.scheduler.runAfter(0, internal.subscriptions.sweep, {});
    return { scanned: due.length, changed };
  },
});
