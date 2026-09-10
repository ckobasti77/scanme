import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { BILLING_WINDOWS } from "../../lib/admin-v1/catalog";
import { assertMoney, DAY_MS } from "../../lib/admin-v1/rules";
import { requireClientAccountAccess, requireClientAccountCapability, requireClientVenueAccess, requireClientVenueCapability } from "./clientAccountAccess";
import type { billingActor, lifecycleFacts, subscriptionTarget } from "./subscriptionValidators";

export type Target = Infer<typeof subscriptionTarget>;
export type Actor = Infer<typeof billingActor>;
export type Facts = Infer<typeof lifecycleFacts>;
type DatabaseCtx = QueryCtx | MutationCtx;
export const BILLING_BATCH = 50;

export function fail(code: string): never { throw new ConvexError(code); }
export function required(value: string): string {
  if (!value.trim() || value.length > 2_000) fail("billing_reason_or_key_required");
  return value.trim();
}
export function timestamp(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime())) fail("billing_invalid_time");
}
export function minor(value: number, currency = "RSD") { assertMoney({ amountMinor: value, currency }); }
export function targetKey(target: Target) { return target.kind === "account_premium" ? "premium" : `service:${target.serviceProfileId}`; }

/** Canonical payload equality detects key reuse with different financial intent. */
export function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${fingerprint(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function sameRequest(previous: { fingerprint: string }, next: string) {
  if (previous.fingerprint !== next) fail("billing_idempotency_conflict");
}
export function bounded<T>(items: T[]) {
  if (!items.length || items.length > BILLING_BATCH) fail("billing_invalid_batch");
  return items;
}

export async function requireBillingAccount(ctx: DatabaseCtx, accountId: Id<"accounts">) {
  const account = await ctx.db.get(accountId);
  if (!account || account.adminV1MigrationVersion !== 1 || account.billingModel !== "subscriptions_v1") fail("billing_migration_required");
  return account;
}
export async function assertLegacyBilling(ctx: DatabaseCtx, accountId: Id<"accounts">) {
  if ((await ctx.db.get(accountId))?.billingModel === "subscriptions_v1") fail("billing_use_subscriptions_v1");
}
export async function targetBusiness(ctx: DatabaseCtx, accountId: Id<"accounts">, target: Target) {
  if (target.kind === "account_premium") return undefined;
  const service = await ctx.db.get(target.serviceProfileId);
  const business = service && await ctx.db.get(service.businessId);
  if (!business || business.kind === "celebration" || business.accountId !== accountId) fail("billing_target_not_in_account");
  return business._id;
}
export async function authorizeTarget(ctx: DatabaseCtx, accountId: Id<"accounts">, target: Target, operation: "read" | "buy" | "cancel") {
  await requireBillingAccount(ctx, accountId);
  const businessId = await targetBusiness(ctx, accountId, target);
  const capability = operation === "cancel" ? "cancel_service" : target.kind === "account_premium" ? "buy_premium" : "buy_services";
  const access = businessId
    ? operation === "read" ? await requireClientVenueAccess(ctx, businessId) : await requireClientVenueCapability(ctx, businessId, capability)
    : operation === "read" ? await requireClientAccountAccess(ctx, accountId) : await requireClientAccountCapability(ctx, accountId, capability);
  return { actor: { kind: access.isAdmin ? "admin" : "client", userId: access.user._id } as Actor, businessId };
}

/** Anchor preserves Jan 31 -> Feb 28 -> Mar 31 and Feb 29 -> Feb 28 -> Feb 29. */
export function periodEnd(start: number, period: "monthly" | "annual", anchorAt: number): number {
  timestamp(start); timestamp(anchorAt);
  const from = new Date(start), anchor = new Date(anchorAt);
  const year = from.getUTCFullYear() + (period === "annual" ? 1 : 0);
  const month = period === "annual" ? anchor.getUTCMonth() : from.getUTCMonth() + 1;
  const result = new Date(start);
  result.setUTCDate(1);
  result.setUTCFullYear(year, month, 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  timestamp(result.getTime());
  return result.getTime();
}

export async function calculateFacts(ctx: DatabaseCtx, sub: Doc<"subscriptions">, now: number): Promise<Facts> {
  timestamp(now);
  const period = await ctx.db.query("subscriptionPeriods")
    .withIndex("by_subscriptionId_and_start", (q) => q.eq("subscriptionId", sub._id).lte("start", now)).order("desc").first();
  const future = await ctx.db.query("subscriptionPeriods")
    .withIndex("by_subscriptionId_and_start", (q) => q.eq("subscriptionId", sub._id).gt("start", now)).first();
  // If an unpaid renewal starts today, the immediately preceding funded period
  // supplies grace. A first unpaid purchase never grants access or grace.
  const previous = period && !period.funded ? await ctx.db.query("subscriptionPeriods")
    .withIndex("by_subscriptionId_and_start", (q) => q.eq("subscriptionId", sub._id).lt("start", period.start)).order("desc").first() : null;
  const covered = period?.funded ? period : previous?.funded && previous.end === period?.start ? previous : null;
  let status: Facts["status"] = "inactive";
  let warning = false;
  // Find the end of the contiguous paid run in two indexed reads, regardless
  // of how many periods were prepaid. A reversed period is an explicit gap.
  const gap = covered ? await ctx.db.query("subscriptionPeriods")
    .withIndex("by_subscriptionId_and_funded_and_start", (q) => q.eq("subscriptionId", sub._id).eq("funded", false).gte("start", covered.end)).first() : null;
  const lastCovered = covered ? await ctx.db.query("subscriptionPeriods")
    .withIndex("by_subscriptionId_and_start", (q) => gap
      ? q.eq("subscriptionId", sub._id).gte("start", covered.start).lt("start", gap.start)
      : q.eq("subscriptionId", sub._id).gte("start", covered.start)).order("desc").first() : null;
  const paidThrough = lastCovered?.end ?? covered?.end ?? null;
  const window = BILLING_WINDOWS[sub.period];
  const graceEndsAt = covered ? Math.max(paidThrough! + window.graceDays * DAY_MS,
    sub.graceOverride?.periodId === covered._id ? sub.graceOverride.endsAt : 0) : null;
  const transitions = [future?.start, sub.cancelledAt].filter((time): time is number => time !== undefined && time > now);
  if (covered) {
    status = now < paidThrough! ? "active" : now < graceEndsAt! ? "grace" : "suspended";
    warning = status === "active" && !sub.cancelAtPeriodEnd && now >= paidThrough! - window.warningDays * DAY_MS;
    for (const time of [paidThrough! - window.warningDays * DAY_MS, paidThrough!, graceEndsAt!]) if (time > now) transitions.push(time);
  }
  if (sub.suspended) { status = "suspended"; warning = false; }
  if (sub.cancelledAt !== undefined && sub.cancelledAt <= now) { status = "inactive"; warning = false; }
  return {
    status, warning, currentPeriodStart: covered?.start ?? null, paidThrough, graceEndsAt,
    nextTransitionAt: transitions.length ? Math.min(...transitions) : null,
  };
}

export async function reconcileSubscription(ctx: MutationCtx, subscriptionId: Id<"subscriptions">, now: number, actor: Actor) {
  const sub = await ctx.db.get(subscriptionId);
  if (!sub) fail("billing_subscription_missing");
  const facts = await calculateFacts(ctx, sub, now);
  const changed = fingerprint(facts) !== fingerprint(sub.facts);
  if (changed || sub.nextTransitionAt !== (facts.nextTransitionAt ?? undefined)) {
    await ctx.db.patch(sub._id, { facts, nextTransitionAt: facts.nextTransitionAt ?? undefined, updatedAt: now });
  }
  if (changed) {
    await ctx.db.insert("subscriptionEvents", { accountId: sub.accountId, subscriptionId, actor, action: "subscription.lifecycle", before: sub.facts, after: facts, createdAt: now });
  }
  return facts;
}

export async function effectivePrice(ctx: DatabaseCtx, sub: Pick<Doc<"subscriptions">, "accountId" | "targetKey" | "period">, start: number, now: number): Promise<Infer<typeof import("./subscriptionValidators").subscriptionPrice>> {
  // Latest agreement supersedes earlier ones. Expiry requires an explicit new
  // standard agreement; silently reviving a historical special price is unsafe.
  const agreement = await ctx.db.query("priceAgreements")
    .withIndex("by_accountId_and_targetKey_and_period_and_validFrom", (q) => q.eq("accountId", sub.accountId).eq("targetKey", sub.targetKey).eq("period", sub.period).lte("validFrom", start)).order("desc").first();
  if (!agreement || (agreement.validUntil !== null && start >= agreement.validUntil)) fail("billing_price_agreement_required");
  let effective = agreement.price;
  let discount = await ctx.db.query("discountRules")
    .withIndex("by_accountId_and_targetKey_and_validFrom", (q) => q.eq("accountId", sub.accountId).eq("targetKey", sub.targetKey).lte("validFrom", start)).order("desc").first();
  if (discount && discount.validUntil !== null && start >= discount.validUntil) discount = null;
  if (discount?.kind === "friend_waiver") {
    const tag = discount.tagId && await ctx.db.get(discount.tagId);
    if (!tag || tag.accountId !== sub.accountId || tag.kind !== "friend") discount = null;
  }
  if (discount?.kind === "referral_discount") {
    const referral = discount.referralId && await ctx.db.get(discount.referralId);
    if (!referral || referral.status !== "rewarded") discount = null;
  }
  if (discount) {
    const value = discount.value;
    if (value.kind === "fixed" && value.amount.currency !== effective.currency) fail("billing_currency_mismatch");
    const reduction = value.kind === "waiver" ? effective.amountMinor : value.kind === "fixed" ? value.amount.amountMinor
      : Number(BigInt(effective.amountMinor) * BigInt(value.basisPoints) / BigInt(10_000));
    effective = { ...effective, amountMinor: Math.max(0, effective.amountMinor - reduction) };
  }
  return { reference: agreement.reference, effective, agreementId: agreement._id, basis: agreement.kind, ...(discount ? { discountId: discount._id } : {}), capturedAt: now };
}

export async function premiumFact(ctx: DatabaseCtx, accountId: Id<"accounts">) {
  const sub = await ctx.db.query("subscriptions").withIndex("by_accountId_and_targetKey", (q) => q.eq("accountId", accountId).eq("targetKey", "premium")).unique();
  const status = sub?.facts.status;
  return status === "active" || status === "grace" ? status : null;
}
