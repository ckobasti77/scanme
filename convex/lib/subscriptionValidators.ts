import { v } from "convex/values";

export const billingPeriod = v.union(v.literal("monthly"), v.literal("annual"));
export const subscriptionStatus = v.union(v.literal("inactive"), v.literal("active"), v.literal("grace"), v.literal("suspended"));
export const subscriptionTarget = v.union(
  v.object({ kind: v.literal("account_premium") }),
  v.object({ kind: v.literal("service_instance"), serviceProfileId: v.id("serviceProfiles") }),
);
export const money = v.object({ amountMinor: v.number(), currency: v.string() });
export const billingActor = v.union(
  v.object({ kind: v.union(v.literal("admin"), v.literal("client")), userId: v.id("users") }),
  v.object({ kind: v.literal("system"), source: v.string() }),
);
export const billingChange = v.object({ actor: billingActor, at: v.number(), reason: v.string() });
export const agreementKind = v.union(v.literal("standard"), v.literal("founders"), v.literal("enterprise"), v.literal("individual"));
export const discountValue = v.union(
  v.object({ kind: v.literal("waiver") }),
  v.object({ kind: v.literal("fixed"), amount: money }),
  v.object({ kind: v.literal("percentage"), basisPoints: v.number() }),
);
export const subscriptionPrice = v.object({
  reference: money, effective: money, agreementId: v.id("priceAgreements"),
  basis: agreementKind, discountId: v.optional(v.id("discountRules")), capturedAt: v.number(),
});
export const paymentMethod = v.union(v.literal("bank_transfer"), v.literal("payment_card"), v.literal("cash"), v.literal("other"));
export const paymentLedger = v.object({
  amount: money, unallocatedMinor: v.number(), method: paymentMethod,
  provider: v.optional(v.string()), providerEventId: v.optional(v.string()),
  recordedBy: billingActor, key: v.string(), fingerprint: v.string(),
});
export const allocationInput = v.object({ periodId: v.id("subscriptionPeriods"), amountMinor: v.number() });
export const lifecycleFacts = v.object({
  status: subscriptionStatus, warning: v.boolean(),
  currentPeriodStart: v.union(v.number(), v.null()),
  paidThrough: v.union(v.number(), v.null()), graceEndsAt: v.union(v.number(), v.null()),
  nextTransitionAt: v.union(v.number(), v.null()),
});
