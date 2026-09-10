import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { billingPeriod, money, subscriptionTarget } from "./lib/subscriptionValidators";
import { BILLING_BATCH, fail, fingerprint, minor, periodEnd, reconcileSubscription, required, targetBusiness, targetKey, timestamp } from "./lib/subscriptions";

const migrationItem = v.object({
  target: subscriptionTarget, period: billingPeriod, start: v.number(),
  reference: money, price: money,
  coverage: v.union(v.object({ kind: v.literal("unpaid") }), v.object({ kind: v.literal("paid"), end: v.number(), evidence: v.string() })),
});

/** Explicit, bounded single-account cutover; no live invocation in ADMIN-03.
 * Account-wide expiry and active service flags are NOT evidence of payment.
 * Original payments/plan fields survive unchanged. No narrowing or reset.
 */
export const adoptAccount = internalMutation({
  args: {
    accountId: v.id("accounts"), expectedUpdatedAt: v.number(),
    subscriptions: v.array(migrationItem), premiumDecision: v.union(v.literal("starter"), v.literal("subscription")),
    reason: v.string(), dryRun: v.boolean(),
  }, returns: v.object({ dryRun: v.boolean(), subscriptions: v.number(), alreadyDone: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx), account = await ctx.db.get(args.accountId);
    if (!account || account.adminV1MigrationVersion !== 1) fail("billing_tenancy_migration_required");
    required(args.reason);
    if (args.subscriptions.length > BILLING_BATCH) fail("billing_migration_batch_limit");
    const { dryRun, ...intent } = args, hash = fingerprint(intent);
    const event = await ctx.db.query("subscriptionEvents").withIndex("by_accountId_and_key", (q) => q.eq("accountId", account._id).eq("key", "billing_migration_v1")).unique();
    if (event) {
      if (event.fingerprint !== hash) fail("billing_idempotency_conflict");
      return { dryRun, subscriptions: args.subscriptions.length, alreadyDone: true };
    }
    if (account.billingModel || account.updatedAt !== args.expectedUpdatedAt) fail("billing_migration_stale_account");
    const targets = new Set(args.subscriptions.map((item) => targetKey(item.target)));
    if (targets.size !== args.subscriptions.length) fail("billing_duplicate_target");
    if (targets.has("premium") !== (args.premiumDecision === "subscription")) fail("billing_explicit_premium_decision_required");
    const venues = await ctx.db.query("businesses").withIndex("by_account", (q) => q.eq("accountId", account._id)).take(BILLING_BATCH + 1);
    if (venues.length > BILLING_BATCH) fail("billing_migration_batch_limit");
    let profileCount = 0;
    for (const venue of venues) {
      const profiles = await ctx.db.query("serviceProfiles").withIndex("by_businessId", (q) => q.eq("businessId", venue._id)).take(BILLING_BATCH + 1);
      profileCount += profiles.length;
      if (profileCount > BILLING_BATCH) fail("billing_migration_batch_limit");
      for (const profile of profiles) {
        if (profile.status === "active" && ["scanme_links", "google_review", "scanme_menu"].includes(profile.type) && !targets.has(`service:${profile._id}`)) fail(`billing_unresolved_service:${profile._id}`);
      }
    }
    for (const item of args.subscriptions) {
      await targetBusiness(ctx, args.accountId, item.target); timestamp(item.start);
      minor(item.reference.amountMinor, item.reference.currency); minor(item.price.amountMinor, item.price.currency);
      if (item.reference.currency !== item.price.currency) fail("billing_currency_mismatch");
      if (item.coverage.kind === "paid") {
        required(item.coverage.evidence); timestamp(item.coverage.end);
        if (item.coverage.end <= item.start) fail("billing_invalid_period");
      }
    }
    if (dryRun) return { dryRun, subscriptions: args.subscriptions.length, alreadyDone: false };
    const now = Date.now(), actor = { kind: "admin" as const, userId: admin._id };
    await ctx.db.patch(account._id, { billingModel: "subscriptions_v1", updatedAt: now });
    for (const item of args.subscriptions) {
      const key = targetKey(item.target), businessId = await targetBusiness(ctx, account._id, item.target);
      const agreementId = await ctx.db.insert("priceAgreements", { accountId: account._id, target: item.target, targetKey: key, period: item.period,
        kind: "individual", reference: item.reference, price: item.price, validFrom: item.start, validUntil: null,
        change: { actor, at: now, reason: args.reason }, key: `migration:${key}`, fingerprint: fingerprint(item) });
      const subscriptionId = await ctx.db.insert("subscriptions", { accountId: account._id, target: item.target, targetKey: key,
        ...(businessId ? { businessId } : {}), period: item.period, startsAt: item.start, anchorAt: item.start,
        renewal: { kind: "manual" }, cancelAtPeriodEnd: false,
        facts: { status: "inactive", warning: false, currentPeriodStart: null, paidThrough: null, graceEndsAt: null, nextTransitionAt: null },
        key: `migration:${key}`, fingerprint: fingerprint(item), createdAt: now, updatedAt: now });
      await ctx.db.insert("subscriptionPeriods", { accountId: account._id, subscriptionId, start: item.start,
        end: item.coverage.kind === "paid" ? item.coverage.end : periodEnd(item.start, item.period, item.start),
        price: { reference: item.reference, effective: item.price, agreementId, basis: "individual", capturedAt: now },
        paidMinor: 0, funded: item.coverage.kind === "paid",
        ...(item.coverage.kind === "paid" ? { migrationEvidence: item.coverage.evidence } : {}), createdAt: now });
      await reconcileSubscription(ctx, subscriptionId, now, actor);
    }
    await ctx.db.insert("subscriptionEvents", { accountId: account._id, actor, action: "billing.migrated", reason: args.reason, key: "billing_migration_v1", fingerprint: hash, createdAt: now });
    return { dryRun, subscriptions: args.subscriptions.length, alreadyDone: false };
  },
});

/** Read-only legacy normalization. Unknown allocation/method remain explicit;
 * no duplicate receipt is inserted and no original row is patched. */
export const legacyPayments = internalQuery({
  args: { accountId: v.id("accounts"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ paymentId: v.id("payments"), amountMinor: v.union(v.number(), v.null()),
    unallocatedMinor: v.union(v.number(), v.null()), method: v.literal("other"),
    unresolved: v.array(v.string()), reversed: v.boolean() })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db.query("payments").withIndex("by_accountId_and_ledger_key", (q) => q.eq("accountId", args.accountId).eq("ledger.key", undefined)).paginate(args.paginationOpts);
    return { ...result, page: result.page.map((payment) => {
      const amountMinor = payment.ledger?.amount.amountMinor ?? payment.amountRsd * 100;
      const valid = Number.isSafeInteger(amountMinor) && amountMinor >= 0;
      return { paymentId: payment._id, amountMinor: valid ? amountMinor : null,
        unallocatedMinor: payment.ledger?.unallocatedMinor ?? (valid ? amountMinor : null), method: "other" as const,
        reversed: payment.voidedAt !== undefined,
        unresolved: payment.ledger ? [] : [...(!valid ? ["invalid_legacy_money"] : []), "legacy_method_unknown", "legacy_allocation_unknown", ...(payment.voidedAt !== undefined ? ["legacy_reversal_reason_missing"] : [])] };
    }) };
  },
});
