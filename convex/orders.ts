import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { applyPayment } from "./billing";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { manualBillingPort } from "./lib/billingPort";
import { requireText } from "./lib/validation";
import {
  buildPriceSnapshot,
  PRICING_SERVICE_BY_SERVICE_TYPE,
  type ServiceType,
} from "./lib/orderSnapshot";
import { price } from "../lib/pricing/engine";
import type { BillingPeriod, PlanId, ServiceId } from "../lib/pricing/types";
import {
  normalizeQuantity,
  productUnitPrice,
  quantityDiscountRate,
  roundRsd,
  type ProductSelection,
} from "../lib/scanme-pricing";

// =============================================================================
// TASK-05 — the order layer, the price snapshot, and the billing-port stub
// (RFC-002 §2.5, §4 task 5).
//
// The entitlement (account plan) is the LIVE permission; the order is the
// IMMUTABLE record-as-sold. `createOrder` computes the price with the SAME pure
// engine the marketing page and the invoice use (lib/pricing) — never trusting a
// client-supplied number — and FREEZES that breakdown into `orders.priceSnapshot`
// (convex/lib/orderSnapshot.ts). A later `lib/pricing/constants.ts` edit prices
// the NEXT order differently but never rewrites a past snapshot: grandfathering
// lives here, deliberately out of the engine (§2.1, §2.5).
//
// Payment is a stub against the billing port — the same `source: "manual" |
// "billing"` + `externalRef` seam RFC-001 uses for entitlements. `markOrderPaid`
// is the manual admin action that moves `pending → paid` and provisions; a later
// provider webhook maps to `provisionPaidOrder` with `billingSource: "billing"`
// and no schema change. No field waits on the provider choice.
//
// Both entry points are admin-gated: this is the back-office billing surface.
// The self-serve four-step checkout (§2.3, tasks 6–10) is a separate front end
// that will call into this layer once onboarding creates the buyer's membership.
// =============================================================================

const accountPlanValidator = v.union(
  v.literal("basic"),
  v.literal("premium"),
  v.literal("enterprise"),
);

const planPeriodValidator = v.union(
  v.literal("monthly"),
  v.literal("annual"),
);

const serviceTypeValidator = v.union(
  v.literal("scanme_links"),
  v.literal("google_review"),
  v.literal("scanme_venue"),
  v.literal("scanme_memories"),
);

const serviceLineValidator = v.object({
  businessId: v.id("businesses"),
  service: serviceTypeValidator,
  period: planPeriodValidator,
});

const physicalLineValidator = v.object({
  businessId: v.id("businesses"),
  boundService: serviceTypeValidator,
  // The ProductSelection from the configurator (lib/scanme-pricing.ts). Stored
  // opaque; the server recomputes the line total from it so a client cannot
  // dictate a physical price any more than it can a service price.
  selection: v.any(),
});

// serviceType → the short slug fragment used when provisioning births a bare
// ownership profile. scanme_links reuses the business slug (matching
// admin.createBusiness); the others get a suffixed slug.
const SLUG_SUFFIX: Record<Exclude<ServiceType, "scanme_links">, string> = {
  google_review: "review",
  scanme_venue: "venue",
  scanme_memories: "memories",
};

// One physical line's total, computed exactly as computeOrderBreakdown does
// per line (lib/scanme-pricing.ts): unit price × quantity, less the quantity
// ladder. Recomputed server-side for price integrity.
export function physicalLineTotalRsd(selection: ProductSelection): number {
  const unitPrice = productUnitPrice(selection);
  const quantity = normalizeQuantity(selection.quantity);
  const lineSubtotal = roundRsd(unitPrice * quantity);
  const lineDiscount = roundRsd(lineSubtotal * quantityDiscountRate(quantity));
  return lineSubtotal - lineDiscount;
}

// Enforce the plan/period contract before it reaches the account row or the
// engine: premium is billed a period, basic (free) and enterprise (on request)
// are not. The engine throws on the same mismatch; validating here yields a
// clean message and a correct account row.
export function assertPlanPeriod(plan: PlanId, planPeriod: BillingPeriod | undefined) {
  if (plan === "premium" && !planPeriod) {
    throw new ConvexError("Premium plan zahteva period naplate (planPeriod).");
  }
  if (plan !== "premium" && planPeriod !== undefined) {
    throw new ConvexError(`Plan ${plan} ne sme imati period naplate.`);
  }
}

// Resolve the account this order bills against: an existing one (Enterprise, or
// an already-provisioned solo), or a fresh solo account created from the plan.
// Either way the plan/period the order snapshots come from the ACCOUNT (Axis B
// is account-level), never from a separate client field.
export async function resolveOrderAccount(
  ctx: MutationCtx,
  args: {
    accountId?: Id<"accounts">;
    accountName?: string;
    plan?: PlanId;
    planPeriod?: BillingPeriod;
  },
  now: number,
): Promise<{ accountId: Id<"accounts">; plan: PlanId; planPeriod?: BillingPeriod }> {
  if (args.accountId) {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError("Nalog nije pronađen.");
    return {
      accountId: account._id,
      plan: account.plan,
      planPeriod: account.planPeriod,
    };
  }

  if (!args.plan) {
    throw new ConvexError("Nova porudžbina zahteva plan ili postojeći accountId.");
  }
  const name = requireText(args.accountName ?? "", "Naziv naloga", 2, 120);
  assertPlanPeriod(args.plan, args.planPeriod);
  const accountId = await ctx.db.insert("accounts", {
    name,
    plan: args.plan,
    status: "active",
    planSource: "manual",
    ...(args.planPeriod ? { planPeriod: args.planPeriod } : {}),
    createdAt: now,
    updatedAt: now,
  });
  return { accountId, plan: args.plan, planPeriod: args.planPeriod };
}

// Adopt every referenced location into the account, or verify it already
// belongs. A location with no account (the common solo case, or a legacy
// business) is linked here (§2.2.4 backfill, done inline at sale time); a
// location owned by a DIFFERENT account is a genuine conflict and throws, loud —
// an order never silently reparents someone else's location.
export async function linkBusinessesToAccount(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  businessIds: readonly Id<"businesses">[],
) {
  for (const businessId of businessIds) {
    const business = await ctx.db.get(businessId);
    if (!business) throw new ConvexError("Lokal nije pronađen.");
    if (business.accountId === undefined) {
      await ctx.db.patch(businessId, { accountId });
    } else if (business.accountId !== accountId) {
      throw new ConvexError(
        `Lokal "${business.slug}" već pripada drugom nalogu.`,
      );
    }
  }
}

// Derive the engine's item set from the order's own service lines — one entry
// per DISTINCT service. A service a location owns is priced once for the account
// (Axis A is per service, not per location); the same service on two locations
// must share a period, or the account would be subscribing to it twice at once.
export function buildEngineItems(
  serviceLines: readonly { service: ServiceType; period: BillingPeriod }[],
): { service: ServiceId; period: BillingPeriod }[] {
  const byService = new Map<ServiceId, BillingPeriod>();
  for (const line of serviceLines) {
    const service = PRICING_SERVICE_BY_SERVICE_TYPE[line.service];
    const seen = byService.get(service);
    if (seen !== undefined && seen !== line.period) {
      throw new ConvexError(
        `Usluga ${line.service} ne može biti i mesečna i godišnja u istoj porudžbini.`,
      );
    }
    byService.set(service, line.period);
  }
  return [...byService].map(([service, period]) => ({ service, period }));
}

export const createOrder = mutation({
  args: {
    // Bill an existing account, OR create a fresh solo account from plan+name.
    accountId: v.optional(v.id("accounts")),
    accountName: v.optional(v.string()),
    plan: v.optional(accountPlanValidator),
    planPeriod: v.optional(planPeriodValidator),
    serviceLines: v.array(serviceLineValidator),
    physicalLines: v.optional(v.array(physicalLineValidator)),
    externalRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    if (args.serviceLines.length === 0) {
      // The engine prices a non-empty set, and every order carries a plan line;
      // a physical-only reorder is not modelled here.
      throw new ConvexError("Porudžbina mora imati bar jednu uslugu.");
    }

    const now = Date.now();
    const { accountId, plan, planPeriod } = await resolveOrderAccount(
      ctx,
      args,
      now,
    );
    assertPlanPeriod(plan, planPeriod);

    const physicalLines = args.physicalLines ?? [];
    const businessIds = [
      ...new Set([
        ...args.serviceLines.map((line) => line.businessId),
        ...physicalLines.map((line) => line.businessId),
      ]),
    ];
    await linkBusinessesToAccount(ctx, accountId, businessIds);

    // Price with the shared pure engine — the SAME numbers the marketing page and
    // the invoice compute. Freeze the breakdown into the snapshot.
    const engineItems = buildEngineItems(args.serviceLines);
    const breakdown = price({
      items: engineItems,
      plan,
      ...(planPeriod ? { planPeriod } : {}),
    });
    const chargedByService = new Map<ServiceId, number>(
      breakdown.lines.map((line) => [line.service, line.chargedRsd]),
    );

    const physicalTotals = physicalLines.map((line) =>
      physicalLineTotalRsd(line.selection as ProductSelection),
    );
    const oneTimeTotalRsd = physicalTotals.reduce((sum, total) => sum + total, 0);
    const priceSnapshot = buildPriceSnapshot(breakdown, oneTimeTotalRsd);

    const orderId = await ctx.db.insert("orders", {
      accountId,
      status: "pending",
      plan,
      ...(planPeriod ? { planPeriod } : {}),
      priceSnapshot,
      // TASK-32: the seam value comes from the billing-port adapter, no longer
      // a literal (convex/lib/billingPort.ts).
      billingSource: manualBillingPort.source,
      ...(args.externalRef ? { externalRef: args.externalRef } : {}),
      createdAt: now,
      updatedAt: now,
    });

    // One orderItem per service line. lineTotalRsd is the engine's per-service
    // charged amount; the ACCOUNT is billed the snapshot's recurringTotalRsd, not
    // the sum of these lines (which coincide for a solo account's distinct set).
    for (const line of args.serviceLines) {
      const service = PRICING_SERVICE_BY_SERVICE_TYPE[line.service];
      await ctx.db.insert("orderItems", {
        orderId,
        businessId: line.businessId,
        kind: "service",
        service: line.service,
        period: line.period,
        lineTotalRsd: chargedByService.get(service) ?? 0,
        createdAt: now,
      });
    }
    for (let i = 0; i < physicalLines.length; i += 1) {
      const line = physicalLines[i];
      await ctx.db.insert("orderItems", {
        orderId,
        businessId: line.businessId,
        kind: "physical",
        boundService: line.boundService,
        physicalSelection: line.selection,
        lineTotalRsd: physicalTotals[i],
        createdAt: now,
      });
    }

    // TASK-32: creating an order is a manual back-office act — trail it.
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId,
      action: "create_order",
      detail: {
        orderId,
        plan,
        ...(planPeriod ? { planPeriod } : {}),
        recurringTotalRsd: priceSnapshot.recurringTotalRsd,
        oneTimeTotalRsd: priceSnapshot.oneTimeTotalRsd,
      },
      now,
    });

    return { orderId, accountId, priceSnapshot };
  },
});

// Ensure a location owns a service (the ownership gate, §1.b): activate its
// existing profile, or birth a bare active ownership profile if none exists.
// Product-specific config (the Links config, the Review destination, …) is
// provisioned by each product's own flow — this only flips ownership on.
export async function ensureActiveServiceProfile(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  type: ServiceType,
  now: number,
): Promise<Id<"serviceProfiles">> {
  const existing = await ctx.db
    .query("serviceProfiles")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", businessId).eq("type", type),
    )
    .first();
  if (existing) {
    if (existing.status !== "active") {
      await ctx.db.patch(existing._id, { status: "active", updatedAt: now });
    }
    return existing._id;
  }

  const business = await ctx.db.get(businessId);
  if (!business) throw new ConvexError("Lokal nije pronađen.");
  const base =
    type === "scanme_links" ? business.slug : `${business.slug}-${SLUG_SUFFIX[type]}`;
  const clash = await ctx.db
    .query("serviceProfiles")
    .withIndex("by_slug", (q) => q.eq("slug", base))
    .unique();
  const slug = clash ? `${base}-${businessId}` : base;
  return ctx.db.insert("serviceProfiles", {
    businessId,
    type,
    slug,
    status: "active",
    totalScans: 0,
    totalPageViews: 0,
    totalConvertedSessions: 0,
    createdAt: now,
    updatedAt: now,
  });
}

// Provision a paid order: activate ownership for every purchased service on its
// location. The TIER is left to getEntitlement step 3 — the account plan resolves
// it live, with zero per-business entitlement writes (§2.2.3). Idempotent per
// orderItem, so a re-run (a retried webhook, a resumed admin action) never
// double-provisions. Shared by the manual path and, later, the billing webhook.
async function provisionPaidOrder(
  ctx: MutationCtx,
  items: readonly Doc<"orderItems">[],
  now: number,
): Promise<number> {
  let provisioned = 0;
  for (const item of items) {
    if (item.kind !== "service" || !item.service) continue;
    await ensureActiveServiceProfile(ctx, item.businessId, item.service, now);
    provisioned += 1;
  }
  return provisioned;
}

// The cadence an order payment advances the account's cycle by: the plan's
// period when the plan is billed, else the one period every service line
// shares. Mixed-period orders (rare) return undefined — the payment is still
// recorded, the cycle is set by the admin explicitly (billing.setNextBillingAt).
function orderCyclePeriod(
  order: Doc<"orders">,
  items: readonly Doc<"orderItems">[],
): "monthly" | "annual" | undefined {
  if (order.planPeriod) return order.planPeriod;
  const periods = new Set<"monthly" | "annual">();
  for (const item of items) {
    if (item.kind === "service" && item.period) periods.add(item.period);
  }
  return periods.size === 1 ? [...periods][0] : undefined;
}

// The manual admin action that a real provider webhook will one day stand in
// for — both now speak through the billing port (convex/lib/billingPort.ts).
// Moves the order pending → paid, RECORDS THE PAYMENT into the history
// (TASK-32: one payments row, amount defaulting to the snapshot's recurring +
// one-time total, backdatable via paidAt), advances the account's billing
// cycle when the order has a derivable period, provisions, then marks the
// order provisioned. Idempotent from `pending` or a half-done `paid` — the
// payment insert is guarded by the order's existing payments row, so a resumed
// run never double-records. Refuses a cancelled/refunded order.
export const markOrderPaid = mutation({
  args: {
    orderId: v.id("orders"),
    externalRef: v.optional(v.string()),
    // TASK-32 (additive): the real banked amount and date when they differ
    // from the snapshot/now — bank transfers land late and sometimes short.
    amountRsd: v.optional(v.number()),
    paidAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Porudžbina nije pronađena.");
    if (order.status === "provisioned") {
      return { status: "provisioned" as const, provisioned: 0, alreadyDone: true };
    }
    if (order.status !== "pending" && order.status !== "paid") {
      throw new ConvexError(
        `Porudžbina u statusu "${order.status}" ne može biti naplaćena.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(order._id, {
      status: "paid",
      billingSource: manualBillingPort.source,
      ...(args.externalRef ? { externalRef: args.externalRef } : {}),
      updatedAt: now,
    });

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect();

    // One payments row per order (idempotent on re-run). A zero-amount order
    // (free basic plan, nothing physical) records no payment — nothing moved.
    const existingPayment = await ctx.db
      .query("payments")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .first();
    if (!existingPayment) {
      const amountRsd =
        args.amountRsd ??
        order.priceSnapshot.recurringTotalRsd + order.priceSnapshot.oneTimeTotalRsd;
      if (amountRsd > 0) {
        const notice = manualBillingPort.normalizeNotice({
          amountRsd,
          paidAt: args.paidAt ?? now,
          reference: args.externalRef,
        });
        if (!notice) {
          throw new ConvexError(
            "Neispravna uplata: iznos mora biti pozitivan broj, datum obavezan.",
          );
        }
        const period = orderCyclePeriod(order, items);
        await applyPayment(ctx, {
          port: manualBillingPort,
          accountId: order.accountId,
          orderId: order._id,
          notice,
          ...(period ? { period } : {}),
          requireCycleAdvance: false,
          actorUserId: admin._id,
          now,
        });
      }
    }

    const provisioned = await provisionPaidOrder(ctx, items, now);

    await ctx.db.patch(order._id, { status: "provisioned", updatedAt: now });
    return { status: "provisioned" as const, provisioned, alreadyDone: false };
  },
});

// Read one order with its lines — for the invoice and the admin order view.
export const getOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect();
    return { order, items };
  },
});
