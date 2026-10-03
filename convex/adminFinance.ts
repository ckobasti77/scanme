import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { fingerprint, syncFinanceExpectedSubscription } from "./lib/subscriptions";
import { addFinanceCostRollups, markFinanceCostRequirementsKnown, projectFinancePayment, syncFinanceExpectedOrder } from "./lib/financeProjection";
import {
  collectedWindow,
  expectedWindow,
  financeFilterMatches,
  safeMinorSum,
  stablePercentDistribution,
  type FinanceCategory,
  type FinanceFilter,
} from "../lib/admin-v1/finance";
import { belgradeDateKey } from "../lib/admin-v1/task-time";
import { paymentMethod } from "./lib/subscriptionValidators";

const financeFilter = v.union(
  v.literal("total"), v.literal("physical"), v.literal("saas"), v.literal("premium"),
  v.literal("scanme_links"), v.literal("google_review"), v.literal("scanme_menu"),
);
const profitFilter = v.union(v.literal("total"), v.literal("physical"), v.literal("saas"), v.literal("premium"));
const collectedPeriod = v.union(v.literal("month"), v.literal("three_months"), v.literal("six_months"), v.literal("year"), v.literal("all_time"));
const expectedPeriod = v.union(v.literal("next_month"), v.literal("three_months"), v.literal("six_months"), v.literal("year"));
const category = v.union(v.literal("physical"), v.literal("saas"), v.literal("premium"), v.literal("unallocated"));
const amount = v.object({ amountMinor: v.number(), currency: v.literal("RSD") });
const seriesPoint = v.object({ key: v.string(), amountMinor: v.number(), undated: v.boolean() });
const categoryRow = v.object({
  category,
  collectedMinor: v.number(), refundsMinor: v.number(), costsMinor: v.number(),
  profitMinor: v.union(v.number(), v.null()), complete: v.boolean(), missing: v.array(v.string()),
});
const methodRow = v.object({ method: paymentMethod, amountMinor: v.number(), percent: v.number() });
const expectedCategoryRow = v.object({ category, amountMinor: v.number(), undatedMinor: v.number(), waivedCount: v.number() });

function scopeKey(accountId?: Id<"accounts">) {
  return accountId ? `account:${accountId}` : "global";
}

function assertTime(value: number, now?: number) {
  if (!Number.isSafeInteger(value) || value < 0 || (now !== undefined && value > now)) {
    throw new ConvexError("admin_finance_time_invalid");
  }
}

function text(value: string, code: string, max = 2_000) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ConvexError(code);
  return normalized;
}

function leafNet(row: Pick<Doc<"financeMonthlyRollups">, "collectedMinor" | "reversedMinor">) {
  const value = row.collectedMinor - row.reversedMinor;
  if (!Number.isSafeInteger(value)) throw new ConvexError("admin_finance_money_invalid");
  return value;
}

async function readDailyRollups(ctx: QueryCtx, key: string, start: number, end: number) {
  const rows = await ctx.db.query("financeDailyRollups").withIndex("by_scopeKey_and_dateKey", (q) =>
    q.eq("scopeKey", key).gte("dateKey", belgradeDateKey(start)).lte("dateKey", belgradeDateKey(end)),
  ).take(1_501);
  if (rows.length > 1_500) throw new ConvexError("admin_finance_daily_rollup_limit");
  return rows;
}

async function readMonthlyRollups(
  ctx: QueryCtx,
  key: string,
  months: string[],
  limit: number,
) {
  const rows = months.length
    ? await ctx.db.query("financeMonthlyRollups").withIndex("by_scopeKey_and_monthKey", (q) =>
        q.eq("scopeKey", key).gte("monthKey", months[0]).lte("monthKey", months.at(-1)!),
      ).take(limit + 1)
    : await ctx.db.query("financeMonthlyRollups").withIndex("by_scopeKey_and_monthKey", (q) => q.eq("scopeKey", key)).take(limit + 1);
  if (rows.length > limit) throw new ConvexError("admin_finance_rollup_limit");
  return rows;
}

async function readMonthlyCostRollups(ctx: QueryCtx, key: string, months: string[], limit: number) {
  const rows = months.length
    ? await ctx.db.query("financeMonthlyCostRollups").withIndex("by_scopeKey_and_monthKey", (q) =>
        q.eq("scopeKey", key).gte("monthKey", months[0]).lte("monthKey", months.at(-1)!),
      ).take(limit + 1)
    : await ctx.db.query("financeMonthlyCostRollups").withIndex("by_scopeKey_and_monthKey", (q) => q.eq("scopeKey", key)).take(limit + 1);
  if (rows.length > limit) throw new ConvexError("admin_finance_rollup_limit");
  return rows;
}

async function readRequirements(
  ctx: QueryCtx,
  key: string,
  months: string[],
) {
  const limit = months.length ? 2_000 : 5_000;
  const rows = months.length
    ? await ctx.db.query("financeCostRequirements").withIndex("by_scopeKey_and_monthKey", (q) =>
        q.eq("scopeKey", key).gte("monthKey", months[0]).lte("monthKey", months.at(-1)!),
      ).take(limit + 1)
    : await ctx.db.query("financeCostRequirements").withIndex("by_scopeKey_and_monthKey", (q) => q.eq("scopeKey", key)).take(limit + 1);
  if (rows.length > limit) throw new ConvexError("admin_finance_requirement_limit");
  return rows;
}

function missingForCategory(rows: Doc<"financeCostRequirements">[], selected: FinanceCategory) {
  return [...new Set(rows.filter((row) => row.state === "missing" && (
    selected === "physical" ? row.category === "production"
      : selected === "saas" ? row.category === "hosting" || row.category === "backend"
        : selected === "unallocated" ? row.category === "classification"
          : false
  )).map((row) => row.category))];
}

async function expectedFacts(
  ctx: QueryCtx,
  input: { accountId?: Id<"accounts">; now: number; period: "next_month" | "three_months" | "six_months" | "year"; filter: FinanceFilter },
) {
  const window = expectedWindow(input.period, input.now);
  const key = scopeKey(input.accountId);
  const read = async (monthKey: string) => {
    const rows = await ctx.db.query("financeExpectedRollups").withIndex("by_scopeKey_and_monthKey", (q) =>
      q.eq("scopeKey", key).eq("monthKey", monthKey),
    ).take(101);
    if (rows.length > 100) throw new ConvexError("admin_finance_expected_rollup_limit");
    return rows;
  };
  const dated = await ctx.db.query("financeExpectedRollups").withIndex("by_scopeKey_and_monthKey", (q) =>
    q.eq("scopeKey", key).gte("monthKey", window.monthKeys[0]).lte("monthKey", window.monthKeys.at(-1)!),
  ).take(501);
  if (dated.length > 500) throw new ConvexError("admin_finance_expected_rollup_limit");
  const overdue = await read("~overdue");
  const undated = await read("~undated");
  const selectedDated = dated.filter((row) => financeFilterMatches(input.filter, row.category, row.serviceType));
  const selectedOverdue = overdue.filter((row) => financeFilterMatches(input.filter, row.category, row.serviceType));
  const selectedUndated = undated.filter((row) => financeFilterMatches(input.filter, row.category, row.serviceType));
  const points = new Map(window.monthKeys.map((key) => [key, 0]));
  const byCategory = new Map<FinanceCategory, { amountMinor: number; undatedMinor: number; waivedCount: number }>([
    ["physical", { amountMinor: 0, undatedMinor: 0, waivedCount: 0 }],
    ["saas", { amountMinor: 0, undatedMinor: 0, waivedCount: 0 }],
    ["premium", { amountMinor: 0, undatedMinor: 0, waivedCount: 0 }],
    ["unallocated", { amountMinor: 0, undatedMinor: 0, waivedCount: 0 }],
  ]);
  for (const row of selectedDated) {
    points.set(row.monthKey, safeMinorSum([points.get(row.monthKey) ?? 0, row.amountMinor]));
    const aggregate = byCategory.get(row.category)!;
    aggregate.amountMinor = safeMinorSum([aggregate.amountMinor, row.amountMinor]);
    aggregate.waivedCount += row.waivedCount;
  }
  for (const row of selectedUndated) {
    const aggregate = byCategory.get(row.category)!;
    aggregate.undatedMinor = safeMinorSum([aggregate.undatedMinor, row.amountMinor]);
  }
  const overdueMinor = safeMinorSum(selectedOverdue.map((row) => row.amountMinor));
  const unavailablePriceCount = safeMinorSum([...selectedDated, ...selectedOverdue].map((row) => row.unavailablePriceCount));
  const rows = [...byCategory.entries()].map(([rowCategory, value]) => ({ category: rowCategory, ...value }));
  const datedMinor = safeMinorSum([...points.values()]);
  const undatedMinor = safeMinorSum(rows.map((row) => row.undatedMinor));
  return {
    amount: { amountMinor: safeMinorSum([datedMinor, undatedMinor]), currency: "RSD" as const },
    datedMinor,
    undatedMinor,
    overdueMinor,
    unavailablePriceCount,
    series: [...points.entries()].map(([key, amountMinor]) => ({ key, amountMinor, undated: false })).concat(undatedMinor ? [{ key: "undated", amountMinor: undatedMinor, undated: true }] : []),
    categories: rows,
  };
}

export const overview = query({
  args: {
    accountId: v.optional(v.id("accounts")), now: v.number(),
    collectedPeriod, expectedPeriod, filter: financeFilter, profitFilter,
  },
  returns: v.object({
    scopeAccountId: v.union(v.id("accounts"), v.null()),
    collected: v.object({ amount, refunds: amount, reversals: amount, series: v.array(seriesPoint) }),
    expected: v.object({ amount, datedMinor: v.number(), undatedMinor: v.number(), overdueMinor: v.number(), unavailablePriceCount: v.number(), series: v.array(seriesPoint), categories: v.array(expectedCategoryRow) }),
    profit: v.object({ amount: v.union(amount, v.null()), complete: v.boolean(), missing: v.array(v.string()), costs: amount }),
    categories: v.array(categoryRow), methods: v.array(methodRow),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertTime(args.now);
    if (args.accountId && !(await ctx.db.get(args.accountId))) throw new ConvexError("admin_finance_account_missing");
    const key = scopeKey(args.accountId);
    const window = collectedWindow(args.collectedPeriod, args.now);
    const rollups = await readMonthlyRollups(ctx, key, window.monthKeys, args.collectedPeriod === "all_time" ? 1_500 : 600);
    const costs = await readMonthlyCostRollups(ctx, key, window.monthKeys, args.collectedPeriod === "all_time" ? 500 : 240);
    const requirements = await readRequirements(ctx, key, window.monthKeys);
    const currencies = new Set([...rollups.map((row) => row.currency), ...costs.map((row) => row.currency)]);
    if ([...currencies].some((currency) => currency !== "RSD")) throw new ConvexError("admin_finance_currency_not_supported");
    const selected = rollups.filter((row) => financeFilterMatches(args.filter, row.category, row.serviceType));
    const collectedMinor = safeMinorSum(selected.map(leafNet));
    const refundsMinor = safeMinorSum(selected.map((row) => row.refundedMinor));
    const reversalsMinor = safeMinorSum(selected.map((row) => row.reversedMinor));
    let seriesKeys = window.monthKeys;
    let series: { key: string; amountMinor: number; undated: boolean }[];
    if (args.collectedPeriod === "month") {
      const entries = await readDailyRollups(ctx, key, window.start!, args.now);
      const daily = new Map<string, number>();
      for (const entry of entries.filter((row) => financeFilterMatches(args.filter, row.category, row.serviceType))) {
        daily.set(entry.dateKey, safeMinorSum([daily.get(entry.dateKey) ?? 0, leafNet(entry)]));
      }
      series = [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([pointKey, amountMinor]) => ({ key: pointKey, amountMinor, undated: false }));
    } else {
      if (args.collectedPeriod === "all_time") seriesKeys = [...new Set(selected.map((row) => row.monthKey))].sort();
      series = seriesKeys.map((pointKey) => ({
        key: pointKey,
        amountMinor: safeMinorSum(selected.filter((row) => row.monthKey === pointKey).map(leafNet)),
        undated: false,
      }));
    }
    if (safeMinorSum(series.map((point) => point.amountMinor)) !== collectedMinor) throw new ConvexError("admin_finance_series_mismatch");
    const buildCategoryRows = (source: Doc<"financeMonthlyRollups">[]) =>
      (["physical", "saas", "premium", "unallocated"] as const).map((rowCategory) => {
        const leaves = source.filter((row) => row.category === rowCategory);
        const collected = safeMinorSum(leaves.map(leafNet));
        const refunds = safeMinorSum(leaves.map((row) => row.refundedMinor));
        const costMinor = rowCategory === "physical"
          ? safeMinorSum(costs.filter((row) => row.category === "production").map((row) => row.debitMinor - row.creditMinor))
          : rowCategory === "saas"
            ? safeMinorSum(costs.filter((row) => row.category === "hosting" || row.category === "backend").map((row) => row.debitMinor - row.creditMinor))
            : 0;
        const missing = missingForCategory(requirements, rowCategory);
        const complete = missing.length === 0;
        return { category: rowCategory, collectedMinor: collected, refundsMinor: refunds, costsMinor: costMinor, profitMinor: complete ? collected - refunds - costMinor : null, complete, missing };
      });
    const categoryRows = buildCategoryRows(selected);
    const profitRows = buildCategoryRows(rollups);
    const profitCategories = args.profitFilter === "total" ? profitRows : profitRows.filter((row) => row.category === args.profitFilter);
    const missing = [...new Set(profitCategories.flatMap((row) => row.missing))];
    const profitCosts = safeMinorSum(profitCategories.map((row) => row.costsMinor));
    const profitValue = missing.length ? null : safeMinorSum(profitCategories.map((row) => row.profitMinor ?? 0));
    const methodAmounts = new Map<Doc<"financeMonthlyRollups">["method"], number>([["bank_transfer", 0], ["payment_card", 0], ["cash", 0], ["other", 0]]);
    for (const row of selected) methodAmounts.set(row.method, safeMinorSum([methodAmounts.get(row.method) ?? 0, leafNet(row)]));
    const methodRows = [...methodAmounts.entries()];
    const methodPercents = stablePercentDistribution(methodRows.map(([, amountMinor]) => amountMinor), collectedMinor);
    const expected = await expectedFacts(ctx, { accountId: args.accountId, now: args.now, period: args.expectedPeriod, filter: args.filter });
    return {
      scopeAccountId: args.accountId ?? null,
      collected: { amount: { amountMinor: collectedMinor, currency: "RSD" as const }, refunds: { amountMinor: refundsMinor, currency: "RSD" as const }, reversals: { amountMinor: reversalsMinor, currency: "RSD" as const }, series },
      expected,
      profit: { amount: profitValue === null ? null : { amountMinor: profitValue, currency: "RSD" as const }, complete: missing.length === 0, missing, costs: { amountMinor: profitCosts, currency: "RSD" as const } },
      categories: categoryRows,
      methods: methodRows.map(([method, amountMinor], index) => ({ method, amountMinor, percent: methodPercents[index] })),
    };
  },
});

export const listPayments = query({
  args: { accountId: v.optional(v.id("accounts")), filter: financeFilter, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("financePaymentListRows")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.query("financePaymentListRows").withIndex("by_scopeKey_and_filterKey_and_paidAt", (q) =>
      q.eq("scopeKey", scopeKey(args.accountId)).eq("filterKey", args.filter),
    ).order("desc").paginate(args.paginationOpts);
  },
});

export const paymentDetail = query({
  args: { accountId: v.optional(v.id("accounts")), paymentId: v.id("payments") },
  returns: v.union(v.null(), v.object({
    payment: schema.doc("financePaymentDigests"),
    entries: v.array(schema.doc("financeLedgerEntries")),
    adjustments: v.array(schema.doc("paymentAdjustments")),
  })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const key = scopeKey(args.accountId);
    const payment = await ctx.db.query("financePaymentDigests").withIndex("by_scopeKey_and_paymentId", (q) => q.eq("scopeKey", key).eq("paymentId", args.paymentId)).unique();
    if (!payment) return null;
    const entries = await ctx.db.query("financeLedgerEntries").withIndex("by_scopeKey_and_paymentId_and_logicalKey", (q) => q.eq("scopeKey", key).eq("paymentId", args.paymentId)).take(101);
    const adjustments = await ctx.db.query("paymentAdjustments").withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId)).take(101);
    if (entries.length > 100 || adjustments.length > 100) throw new ConvexError("admin_finance_detail_limit");
    return { payment, entries, adjustments };
  },
});

const directCostInput = {
  accountId: v.optional(v.id("accounts")),
  category: v.union(v.literal("production"), v.literal("hosting"), v.literal("backend")),
  amountMinor: v.number(), occurredAt: v.number(),
  coveredStart: v.optional(v.number()), coveredEnd: v.optional(v.number()),
  orderId: v.optional(v.id("orders")), orderLineId: v.optional(v.id("orderLines")),
  printJobId: v.optional(v.id("printJobs")), printerId: v.optional(v.id("printers")),
  sourceReference: v.optional(v.string()), note: v.optional(v.string()), idempotencyKey: v.string(),
};

async function validateCostReferences(ctx: MutationCtx, args: {
  accountId?: Id<"accounts">; category: "production" | "hosting" | "backend";
  orderId?: Id<"orders">; orderLineId?: Id<"orderLines">; printJobId?: Id<"printJobs">; printerId?: Id<"printers">;
}) {
  if (args.category === "production" && (!args.accountId || !args.orderId)) throw new ConvexError("admin_finance_production_reference_required");
  if (args.category !== "production" && (args.orderId || args.orderLineId || args.printJobId || args.printerId)) throw new ConvexError("admin_finance_cost_reference_invalid");
  if (!args.orderId) return;
  const order = await ctx.db.get(args.orderId);
  if (!order || order.accountId !== args.accountId) throw new ConvexError("admin_finance_cost_cross_account");
  if (args.orderLineId) {
    const line = await ctx.db.get(args.orderLineId);
    if (!line || line.orderId !== args.orderId || line.accountId !== args.accountId) throw new ConvexError("admin_finance_cost_cross_account");
  }
  if (args.printJobId) {
    const job = await ctx.db.get(args.printJobId);
    if (!job || job.orderId !== args.orderId) throw new ConvexError("admin_finance_cost_cross_account");
    if (args.printerId && job.printerId !== args.printerId) throw new ConvexError("admin_finance_cost_cross_account");
  }
}

async function insertCost(ctx: MutationCtx, input: Omit<Doc<"financeDirectCosts">, "_id" | "_creationTime">) {
  const id = await ctx.db.insert("financeDirectCosts", input);
  const cost = (await ctx.db.get(id))!;
  await addFinanceCostRollups(ctx, cost);
  await markFinanceCostRequirementsKnown(ctx, { costId: id, accountId: cost.accountId, category: cost.category, orderId: cost.orderId, coveredStart: cost.coveredStart, coveredEnd: cost.coveredEnd, now: cost.createdAt });
  await writeAdminAudit(ctx, { actorUserId: cost.actorUserId, accountId: cost.accountId, action: `admin_finance_cost_${cost.eventKind}`, detail: { costId: id, category: cost.category, amountMinor: cost.amountMinor, direction: cost.direction, reason: cost.reason }, now: cost.createdAt });
  return id;
}

export const recordDirectCost = mutation({
  args: directCostInput,
  returns: v.id("financeDirectCosts"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    assertTime(args.occurredAt, Date.now());
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor < 0) throw new ConvexError("admin_finance_money_invalid");
    await validateCostReferences(ctx, args);
    if (args.category !== "production" && (args.coveredStart === undefined || args.coveredEnd === undefined || args.coveredEnd <= args.coveredStart)) throw new ConvexError("admin_finance_cost_period_required");
    const idempotencyKey = text(args.idempotencyKey, "admin_finance_idempotency_required", 200);
    const hash = fingerprint(args);
    const previous = await ctx.db.query("financeDirectCosts").withIndex("by_actorUserId_and_idempotencyKey", (q) => q.eq("actorUserId", actor._id).eq("idempotencyKey", idempotencyKey)).unique();
    if (previous) {
      if (previous.fingerprint !== hash) throw new ConvexError("admin_finance_idempotency_conflict");
      return previous._id;
    }
    const now = Date.now();
    return insertCost(ctx, {
      scopeKey: args.accountId ? scopeKey(args.accountId) : "global",
      ...(args.accountId ? { accountId: args.accountId } : {}),
      category: args.category,
      eventKind: "cost",
      direction: "debit",
      amountMinor: args.amountMinor,
      currency: "RSD",
      occurredAt: args.occurredAt,
      ...(args.coveredStart !== undefined ? { coveredStart: args.coveredStart } : {}),
      ...(args.coveredEnd !== undefined ? { coveredEnd: args.coveredEnd } : {}),
      ...(args.orderId ? { orderId: args.orderId } : {}),
      ...(args.orderLineId ? { orderLineId: args.orderLineId } : {}),
      ...(args.printJobId ? { printJobId: args.printJobId } : {}),
      ...(args.printerId ? { printerId: args.printerId } : {}),
      ...(args.sourceReference ? { sourceReference: text(args.sourceReference, "admin_finance_source_invalid", 240) } : {}),
      ...(args.note ? { note: text(args.note, "admin_finance_note_invalid") } : {}),
      actorUserId: actor._id,
      idempotencyKey,
      fingerprint: hash,
      createdAt: now,
    });
  },
});

export const correctDirectCost = mutation({
  args: { relatedCostId: v.id("financeDirectCosts"), amountMinor: v.number(), direction: v.union(v.literal("debit"), v.literal("credit")), occurredAt: v.number(), reason: v.string(), note: v.optional(v.string()), idempotencyKey: v.string() },
  returns: v.id("financeDirectCosts"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const related = await ctx.db.get(args.relatedCostId);
    if (!related) throw new ConvexError("admin_finance_cost_missing");
    assertTime(args.occurredAt, Date.now());
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor < 0) throw new ConvexError("admin_finance_money_invalid");
    const reason = text(args.reason, "admin_finance_reason_required");
    const idempotencyKey = text(args.idempotencyKey, "admin_finance_idempotency_required", 200);
    const hash = fingerprint(args);
    const previous = await ctx.db.query("financeDirectCosts").withIndex("by_actorUserId_and_idempotencyKey", (q) => q.eq("actorUserId", actor._id).eq("idempotencyKey", idempotencyKey)).unique();
    if (previous) { if (previous.fingerprint !== hash) throw new ConvexError("admin_finance_idempotency_conflict"); return previous._id; }
    return insertCost(ctx, {
      scopeKey: related.scopeKey,
      ...(related.accountId ? { accountId: related.accountId } : {}),
      category: related.category,
      eventKind: "correction",
      direction: args.direction,
      amountMinor: args.amountMinor,
      currency: related.currency,
      occurredAt: args.occurredAt,
      ...(related.coveredStart !== undefined ? { coveredStart: related.coveredStart } : {}),
      ...(related.coveredEnd !== undefined ? { coveredEnd: related.coveredEnd } : {}),
      ...(related.orderId ? { orderId: related.orderId } : {}),
      ...(related.orderLineId ? { orderLineId: related.orderLineId } : {}),
      ...(related.printJobId ? { printJobId: related.printJobId } : {}),
      ...(related.printerId ? { printerId: related.printerId } : {}),
      ...(args.note ? { note: text(args.note, "admin_finance_note_invalid") } : {}),
      relatedCostId: related._id,
      reason,
      actorUserId: actor._id,
      idempotencyKey,
      fingerprint: hash,
      createdAt: Date.now(),
    });
  },
});

export const reverseDirectCost = mutation({
  args: { relatedCostId: v.id("financeDirectCosts"), occurredAt: v.number(), reason: v.string(), idempotencyKey: v.string() },
  returns: v.id("financeDirectCosts"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const related = await ctx.db.get(args.relatedCostId);
    if (!related) throw new ConvexError("admin_finance_cost_missing");
    assertTime(args.occurredAt, Date.now());
    const reason = text(args.reason, "admin_finance_reason_required");
    const idempotencyKey = text(args.idempotencyKey, "admin_finance_idempotency_required", 200);
    const hash = fingerprint(args);
    const previous = await ctx.db.query("financeDirectCosts").withIndex("by_actorUserId_and_idempotencyKey", (q) => q.eq("actorUserId", actor._id).eq("idempotencyKey", idempotencyKey)).unique();
    if (previous) { if (previous.fingerprint !== hash) throw new ConvexError("admin_finance_idempotency_conflict"); return previous._id; }
    const reversals = await ctx.db.query("financeDirectCosts").withIndex("by_relatedCostId", (q) => q.eq("relatedCostId", related._id)).take(51);
    if (reversals.some((row) => row.eventKind === "reversal")) throw new ConvexError("admin_finance_cost_already_reversed");
    return insertCost(ctx, {
      scopeKey: related.scopeKey,
      ...(related.accountId ? { accountId: related.accountId } : {}),
      category: related.category,
      eventKind: "reversal",
      direction: related.direction === "debit" ? "credit" : "debit",
      amountMinor: related.amountMinor,
      currency: related.currency,
      occurredAt: args.occurredAt,
      ...(related.coveredStart !== undefined ? { coveredStart: related.coveredStart } : {}),
      ...(related.coveredEnd !== undefined ? { coveredEnd: related.coveredEnd } : {}),
      ...(related.orderId ? { orderId: related.orderId } : {}),
      ...(related.orderLineId ? { orderLineId: related.orderLineId } : {}),
      ...(related.printJobId ? { printJobId: related.printJobId } : {}),
      ...(related.printerId ? { printerId: related.printerId } : {}),
      relatedCostId: related._id,
      reason,
      actorUserId: actor._id,
      idempotencyKey,
      fingerprint: hash,
      createdAt: Date.now(),
    });
  },
});

export const refundPayment = mutation({
  args: { paymentId: v.id("payments"), amountMinor: v.number(), allocations: v.array(v.object({ logicalKey: v.string(), amountMinor: v.number() })), refundedAt: v.number(), reason: v.string(), key: v.string() },
  returns: v.id("paymentAdjustments"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    assertTime(args.refundedAt, Date.now());
    const reason = text(args.reason, "admin_finance_reason_required");
    const key = text(args.key, "admin_finance_idempotency_required", 200);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment?.ledger) throw new ConvexError("admin_finance_payment_missing");
    await projectFinancePayment(ctx, payment._id);
    const hash = fingerprint({ ...args, allocations: [...args.allocations].sort((a, b) => a.logicalKey.localeCompare(b.logicalKey)) });
    const previous = await ctx.db.query("paymentAdjustments").withIndex("by_accountId_and_key", (q) => q.eq("accountId", payment.accountId).eq("key", `finance:${key}`)).unique();
    if (previous) { if (previous.fingerprint !== hash) throw new ConvexError("admin_finance_idempotency_conflict"); return previous._id; }
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0 || args.allocations.length === 0 || args.allocations.length > 100) throw new ConvexError("admin_finance_refund_invalid");
    if (safeMinorSum(args.allocations.map((row) => row.amountMinor)) !== args.amountMinor || new Set(args.allocations.map((row) => row.logicalKey)).size !== args.allocations.length) throw new ConvexError("admin_finance_refund_unbalanced");
    const originals = await ctx.db.query("financeLedgerEntries").withIndex("by_scopeKey_and_paymentId_and_logicalKey", (q) => q.eq("scopeKey", "global").eq("paymentId", payment._id)).take(201);
    const adjustments = await ctx.db.query("paymentAdjustments").withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id)).take(101);
    if (originals.length > 200 || adjustments.length > 100) throw new ConvexError("admin_finance_refund_limit");
    if (adjustments.some((row) => row.kind === "reversal")) throw new ConvexError("admin_finance_payment_reversed");
    for (const allocation of args.allocations) {
      if (!Number.isSafeInteger(allocation.amountMinor) || allocation.amountMinor <= 0) throw new ConvexError("admin_finance_refund_invalid");
      const original = originals.find((row) => row.entryKind === "receipt" && row.logicalKey === allocation.logicalKey);
      if (!original) throw new ConvexError("admin_finance_refund_allocation_missing");
      const alreadyRefunded = safeMinorSum(adjustments.filter((row) => row.kind === "refund").flatMap((row) => row.allocations ?? []).filter((row) => row.logicalKey === allocation.logicalKey).map((row) => row.amountMinor));
      if (alreadyRefunded + allocation.amountMinor > original.amountMinor) throw new ConvexError("admin_finance_refund_overallocation");
    }
    const now = Date.now();
    const adjustmentId = await ctx.db.insert("paymentAdjustments", {
      accountId: payment.accountId,
      paymentId: payment._id,
      kind: "refund",
      amount: { amountMinor: args.amountMinor, currency: payment.ledger.amount.currency },
      change: { actor: { kind: "admin", userId: actor._id }, at: now, reason },
      occurredAt: args.refundedAt,
      allocations: args.allocations,
      key: `finance:${key}`,
      fingerprint: hash,
    });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: payment.accountId, action: "admin_finance_payment_refunded", detail: { paymentId: payment._id, adjustmentId, amountMinor: args.amountMinor, reason }, now });
    await projectFinancePayment(ctx, payment._id);
    return adjustmentId;
  },
});

// Widen/backfill seam only. It is never scheduled and dryRun performs no writes.
export const backfillPaymentProjection = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number(), dryRun: v.boolean() },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), scanned: v.number(), projected: v.number(), unresolvedLegacy: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 25) throw new ConvexError("admin_finance_backfill_limit");
    const page = await ctx.db.query("payments").paginate({ cursor: args.cursor, numItems: args.limit });
    let projected = 0;
    let unresolvedLegacy = 0;
    for (const payment of page.page) {
      if (!payment.ledger) { unresolvedLegacy += 1; continue; }
      if (!args.dryRun) { await projectFinancePayment(ctx, payment._id); projected += 1; }
    }
    return { continueCursor: page.continueCursor, isDone: page.isDone, scanned: page.page.length, projected, unresolvedLegacy };
  },
});

// Separate bounded seam for historical expected obligations. Never scheduled;
// dry-run reports the page without changing projection state.
export const backfillExpectedProjection = internalMutation({
  args: {
    source: v.union(v.literal("subscriptions"), v.literal("orders")),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
    dryRun: v.boolean(),
    now: v.number(),
  },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), scanned: v.number(), projected: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertTime(args.now);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 25) throw new ConvexError("admin_finance_backfill_limit");
    if (args.source === "subscriptions") {
      const page = await ctx.db.query("subscriptions").paginate({ cursor: args.cursor, numItems: args.limit });
      if (!args.dryRun) for (const subscription of page.page) await syncFinanceExpectedSubscription(ctx, subscription._id, args.now);
      return { continueCursor: page.continueCursor, isDone: page.isDone, scanned: page.page.length, projected: args.dryRun ? 0 : page.page.length };
    }
    const page = await ctx.db.query("orderOperations").paginate({ cursor: args.cursor, numItems: args.limit });
    if (!args.dryRun) for (const operation of page.page) await syncFinanceExpectedOrder(ctx, operation, args.now);
    return { continueCursor: page.continueCursor, isDone: page.isDone, scanned: page.page.length, projected: args.dryRun ? 0 : page.page.length };
  },
});
