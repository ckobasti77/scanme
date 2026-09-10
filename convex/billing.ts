import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import {
  addBillingPeriod,
  DAY_MS,
  deriveBillingStatus,
  GRACE_DAYS,
  type BillingLifecycleStatus,
  type BillingPeriod,
} from "./lib/billingCycle";
import {
  getBillingPort,
  manualBillingPort,
  type BillingPortAdapter,
  type PaymentNotice,
} from "./lib/billingPort";

// =============================================================================
// TASK-32 — the billing lifecycle (RFC-002 §2.5–§2.6, between §4 tasks 5 and 6).
//
// The owner must know at any moment: who paid when, whose bill is next, whose
// lapsed, who is late. MANUAL PAYMENT ENTRY IS THE MAIN FLOW — the first fifty
// clients pay by bank transfer or cash, so the admin records a payment with a
// date and an amount, and that entry MOVES THE NEXT BILLING DATE. The provider
// path (later) funnels through the same billing port into the same tables.
//
// Stored facts (never labels): the `payments` history (one row per payment),
// the account's paid-through date (`accounts.planValidUntil`), and the
// cron-flipped `accounts.status: "expired"`. The four operational statuses are
// DERIVED in `deriveBillingStatus` (convex/lib/billingCycle.ts) — the admin
// table (task 12) only displays what `billingOverview` computes.
//
// Every manual change writes an adminAuditLog row in the same transaction.
// =============================================================================

// -----------------------------------------------------------------------------
// applyPayment — the ONE funnel every recorded payment passes through.
// Inserts the history row, advances the cycle, reactivates an expired account,
// and writes the audit row (manual entries). Shared by recordManualPayment,
// orders.markOrderPaid, and the future provider webhook
// (internal.billing.applyProviderPayment).
// -----------------------------------------------------------------------------

export interface ApplyPaymentParams {
  port: BillingPortAdapter;
  accountId: Id<"accounts">;
  orderId?: Id<"orders">;
  notice: PaymentNotice;
  /** Explicit paid-through override — beats every derivation. */
  coversUntil?: number;
  /** Caller-derived cadence (e.g. the order's period); accounts.planPeriod is the fallback. */
  period?: BillingPeriod;
  /**
   * true (manual renewals): a payment that cannot move the cycle is an error —
   * the admin must supply coversUntil. false (order settlement): record the
   * payment and leave the cycle untouched when no period is derivable.
   */
  requireCycleAdvance: boolean;
  /** Manual entries: the admin who acted — triggers the audit row. */
  actorUserId?: Id<"users">;
  now: number;
}

export async function applyPayment(
  ctx: MutationCtx,
  params: ApplyPaymentParams,
): Promise<{
  paymentId: Id<"payments">;
  coversUntil: number | null;
  reactivated: boolean;
}> {
  const account = await ctx.db.get(params.accountId);
  if (!account) throw new ConvexError("Nalog nije pronađen.");
  const { notice } = params;
  // Backdating is the norm (bank transfers land days late); the future is not.
  // One day of skew tolerated for timezone edges.
  if (notice.paidAt > params.now + DAY_MS) {
    throw new ConvexError("Datum uplate ne može biti u budućnosti.");
  }

  // Resolve the new paid-through date. Base = the LATER of the current
  // paid-through and the payment date: an early renewal extends from the
  // current coverage; a client returning after a long lapse starts a fresh
  // period from the payment, never stacking onto a long-dead date.
  let coversUntil = params.coversUntil;
  if (coversUntil === undefined) {
    const period = params.period ?? account.planPeriod;
    if (period) {
      const base = Math.max(account.planValidUntil ?? notice.paidAt, notice.paidAt);
      coversUntil = addBillingPeriod(base, period);
    }
  }
  if (coversUntil !== undefined && coversUntil <= notice.paidAt) {
    throw new ConvexError("Datum „važi do“ mora biti posle datuma uplate.");
  }
  if (coversUntil === undefined && params.requireCycleAdvance) {
    throw new ConvexError(
      "Nalog nema period naplate — unesite dokle uplata važi (coversUntil).",
    );
  }

  const paymentId = await ctx.db.insert("payments", {
    accountId: account._id,
    ...(params.orderId ? { orderId: params.orderId } : {}),
    amountRsd: notice.amountRsd,
    method: params.port.method,
    ...(notice.reference ? { reference: notice.reference } : {}),
    paidAt: notice.paidAt,
    ...(coversUntil !== undefined ? { coversUntil } : {}),
    ...(params.actorUserId ? { recordedByUserId: params.actorUserId } : {}),
    createdAt: params.now,
  });

  // A payment reactivates a lapsed account. A SUSPENDED account stays
  // suspended — that is an admin decision, and only an admin lifts it.
  const reactivated = account.status === "expired";
  await ctx.db.patch(account._id, {
    ...(coversUntil !== undefined ? { planValidUntil: coversUntil } : {}),
    planSource: params.port.source,
    ...(reactivated ? { status: "active" as const } : {}),
    updatedAt: params.now,
  });

  if (params.actorUserId) {
    await writeAdminAudit(ctx, {
      actorUserId: params.actorUserId,
      accountId: account._id,
      action: "record_payment",
      detail: {
        paymentId,
        ...(params.orderId ? { orderId: params.orderId } : {}),
        amountRsd: notice.amountRsd,
        paidAt: notice.paidAt,
        ...(notice.reference ? { reference: notice.reference } : {}),
        ...(coversUntil !== undefined ? { coversUntil } : {}),
        method: params.port.method,
        ...(reactivated ? { reactivated: true } : {}),
      },
      now: params.now,
    });
  }

  return { paymentId, coversUntil: coversUntil ?? null, reactivated };
}

// -----------------------------------------------------------------------------
// The MAIN flow: the admin records a bank-transfer / cash payment. The entry
// moves the next billing date — by the account's planPeriod, or to an explicit
// coversUntil the admin supplies (required when the account has no period on
// file, e.g. a basic-plan account with paid services).
// -----------------------------------------------------------------------------

export const recordManualPayment = mutation({
  args: {
    accountId: v.id("accounts"),
    amountRsd: v.number(),
    paidAt: v.number(),
    reference: v.optional(v.string()),
    coversUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const notice = manualBillingPort.normalizeNotice({
      amountRsd: args.amountRsd,
      paidAt: args.paidAt,
      reference: args.reference,
    });
    if (!notice) {
      throw new ConvexError(
        "Neispravna uplata: iznos mora biti pozitivan broj, datum obavezan.",
      );
    }
    return applyPayment(ctx, {
      port: manualBillingPort,
      accountId: args.accountId,
      notice,
      ...(args.coversUntil !== undefined ? { coversUntil: args.coversUntil } : {}),
      requireCycleAdvance: true,
      actorUserId: admin._id,
      now: Date.now(),
    });
  },
});

// The provider seam, registered NOW so wiring a Serbian provider later touches
// only convex/lib/billingPort.ts (the adapter) and convex/http.ts (the webhook
// route that calls this). Nothing else changes shape.
export const applyProviderPayment = internalMutation({
  args: {
    portId: v.string(),
    accountId: v.id("accounts"),
    orderId: v.optional(v.id("orders")),
    rawNotice: v.any(),
  },
  handler: async (ctx, args) => {
    const port = getBillingPort(args.portId);
    const notice = port.normalizeNotice(args.rawNotice);
    if (!notice) {
      throw new ConvexError("Notifikacija o uplati nije prošla proveru adaptera.");
    }
    return applyPayment(ctx, {
      port,
      accountId: args.accountId,
      ...(args.orderId ? { orderId: args.orderId } : {}),
      notice,
      requireCycleAdvance: false,
      now: Date.now(),
    });
  },
});

// -----------------------------------------------------------------------------
// Corrections. The history is append-only: a wrong entry is VOIDED, never
// deleted. Voiding deliberately does NOT auto-rewind the cycle (replaying
// history is where correction bugs live) — the admin re-sets the date
// explicitly with setNextBillingAt. Both write the audit trail.
// -----------------------------------------------------------------------------

export const voidPayment = mutation({
  args: {
    paymentId: v.id("payments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new ConvexError("Uplata nije pronađena.");
    if (payment.voidedAt !== undefined) {
      throw new ConvexError("Uplata je već stornirana.");
    }
    const now = Date.now();
    await ctx.db.patch(payment._id, {
      voidedAt: now,
      voidedByUserId: admin._id,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: payment.accountId,
      action: "void_payment",
      detail: {
        paymentId: payment._id,
        amountRsd: payment.amountRsd,
        paidAt: payment.paidAt,
        ...(args.reason ? { reason: args.reason } : {}),
      },
      now,
    });
    return { voided: true as const };
  },
});

export const setNextBillingAt = mutation({
  args: {
    accountId: v.id("accounts"),
    // null clears the cycle (perpetual — no tracked billing).
    nextBillingAt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError("Nalog nije pronađen.");
    const now = Date.now();
    // Extending a lapsed account into the future reactivates it; "suspended"
    // stays an admin decision and is untouched here too.
    const reactivate =
      account.status === "expired" &&
      (args.nextBillingAt === null || args.nextBillingAt > now);
    await ctx.db.patch(account._id, {
      planValidUntil: args.nextBillingAt ?? undefined,
      ...(reactivate ? { status: "active" as const } : {}),
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: account._id,
      action: "set_next_billing",
      detail: {
        from: account.planValidUntil ?? null,
        to: args.nextBillingAt,
        ...(reactivate ? { reactivated: true } : {}),
      },
      now,
    });
    return { nextBillingAt: args.nextBillingAt, reactivated: reactivate };
  },
});

// -----------------------------------------------------------------------------
// Reads: the payment history and the derived-status read model the task-12
// admin table will only display.
// -----------------------------------------------------------------------------

export const listPayments = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("payments")
      .withIndex("by_accountId_and_paidAt", (q) =>
        q.eq("accountId", args.accountId),
      )
      .order("desc")
      .take(100);
  },
});

export const listAuditLog = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("adminAuditLog")
      .withIndex("by_accountId_and_createdAt", (q) =>
        q.eq("accountId", args.accountId),
      )
      .order("desc")
      .take(100);
  },
});

// Has this active service ever been configured? One cheap indexed existence
// probe per service — the "no published config / no content" half of the
// paid-never-configured derivation (§2.6):
//   links    → a scanMeLinksConfigs row with a published revision;
//   review   → a google_review dynamicLink with a destination;
//   venue    → at least one event created;
//   memories → at least one space provisioned.
async function serviceConfigured(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
  profile: Doc<"serviceProfiles">,
): Promise<boolean> {
  switch (profile.type) {
    case "scanme_links": {
      const config = await ctx.db
        .query("scanMeLinksConfigs")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", profile._id),
        )
        .first();
      return config !== null && config.publishedRevision > 0;
    }
    case "google_review": {
      const link = await ctx.db
        .query("dynamicLinks")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", businessId).eq("type", "google_review"),
        )
        .first();
      return link !== null && link.destinationUrl.trim() !== "";
    }
    case "scanme_venue": {
      const event = await ctx.db
        .query("events")
        .withIndex("by_businessId_and_slug", (q) => q.eq("businessId", businessId))
        .first();
      return event !== null;
    }
    case "scanme_memories": {
      const space = await ctx.db
        .query("memoriesSpaces")
        .withIndex("by_businessId_and_status", (q) =>
          q.eq("businessId", businessId),
        )
        .first();
      return space !== null;
    }
    default:
      return true; // an unknown future service never trips the churn flag
  }
}

type AccountBillingRow = {
  accountId: Id<"accounts">;
  name: string;
  plan: Doc<"accounts">["plan"];
  planPeriod: Doc<"accounts">["planPeriod"] | null;
  /** Raw stored state — lets the UI tell suspended from expired. */
  accountStatus: Doc<"accounts">["status"];
  status: BillingLifecycleStatus;
  nextBillingAt: number | null;
  /** Whole days until the next bill; negative = late ("ko kasni"). */
  daysLeft: number | null;
  lastPaymentAt: number | null;
  lastPaymentAmountRsd: number | null;
  /** Active services with no content yet, deduped across locations. */
  unconfiguredServices: Doc<"serviceProfiles">["type"][];
};

// The operational read model (§2.6). Queries must not read the wall clock, so
// the client passes `now` and refreshes it — the derivation itself lives in
// the pure deriveBillingStatus. Sorted as a work queue: paid-never-configured
// first (the churn predictor), then by next billing date ascending, dateless
// accounts last. Bounded like admin.customers (200 accounts).
export const billingOverview = query({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<AccountBillingRow[]> => {
    await requireAdmin(ctx);
    const rows: AccountBillingRow[] = [];
    const accounts = await ctx.db.query("accounts").order("desc").take(200);

    for (const account of accounts) {
      // Last non-voided payment: newest few by paidAt, skip voided.
      const recent = await ctx.db
        .query("payments")
        .withIndex("by_accountId_and_paidAt", (q) =>
          q.eq("accountId", account._id),
        )
        .order("desc")
        .take(10);
      const lastPayment = recent.find((p) => p.voidedAt === undefined) ?? null;

      const businesses = await ctx.db
        .query("businesses")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .take(100);
      let hasActiveService = false;
      let anyServiceConfigured = false;
      const unconfigured = new Set<Doc<"serviceProfiles">["type"]>();
      for (const business of businesses) {
        if (business.archivedAt) continue;
        const profiles = await ctx.db
          .query("serviceProfiles")
          .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
          .take(20);
        for (const profile of profiles) {
          if (profile.status !== "active") continue;
          hasActiveService = true;
          if (await serviceConfigured(ctx, business._id, profile)) {
            anyServiceConfigured = true;
          } else {
            unconfigured.add(profile.type);
          }
        }
      }

      const nextBillingAt = account.planValidUntil ?? null;
      rows.push({
        accountId: account._id,
        name: account.name,
        plan: account.plan,
        planPeriod: account.planPeriod ?? null,
        accountStatus: account.status,
        status: deriveBillingStatus({
          accountStatus: account.status,
          nextBillingAt,
          hasActiveService,
          anyServiceConfigured,
          now: args.now,
        }),
        nextBillingAt,
        daysLeft:
          nextBillingAt === null
            ? null
            : Math.floor((nextBillingAt - args.now) / DAY_MS),
        lastPaymentAt: lastPayment?.paidAt ?? null,
        lastPaymentAmountRsd: lastPayment?.amountRsd ?? null,
        unconfiguredServices: [...unconfigured],
      });
    }

    rows.sort((a, b) => {
      const aFlag = a.status === "paid_never_configured" ? 0 : 1;
      const bFlag = b.status === "paid_never_configured" ? 0 : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      const aDue = a.nextBillingAt ?? Number.POSITIVE_INFINITY;
      const bDue = b.nextBillingAt ?? Number.POSITIVE_INFINITY;
      return aDue - bDue;
    });
    return rows;
  },
});

// -----------------------------------------------------------------------------
// The daily cron: translate elapsed time into stored state. Flips ACTIVE
// accounts whose paid-through date + grace has passed to "expired" — which is
// all it takes to cut getEntitlement step 3 (it requires status "active").
// Resumable and idempotent like the memories sweeps: flipped rows leave the
// "active" index range, so the next batch (and any concurrent re-run,
// serialized by OCC) naturally advances with no cursor; a full batch
// self-reschedules to drain the backlog within one day, not one batch per day.
// -----------------------------------------------------------------------------

const SWEEP_BATCH = 100;

export const sweepBillingCycles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - GRACE_DAYS * DAY_MS;
    // `.gt(0)` keeps undefined planValidUntil (perpetual accounts, which the
    // index orders FIRST) out of the range — otherwise a backlog of perpetual
    // rows could fill every batch and starve the sweep of progress.
    const due = await ctx.db
      .query("accounts")
      .withIndex("by_status_and_planValidUntil", (q) =>
        q
          .eq("status", "active")
          .gt("planValidUntil", 0)
          .lte("planValidUntil", cutoff),
      )
      .take(SWEEP_BATCH);

    let expired = 0;
    for (const account of due) {
      if (account.planValidUntil === undefined) continue; // belt-and-braces
      await ctx.db.patch(account._id, { status: "expired", updatedAt: now });
      expired += 1;
    }
    if (due.length === SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.billing.sweepBillingCycles, {});
    }
    return { scanned: due.length, expired };
  },
});
