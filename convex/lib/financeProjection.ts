import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { addFinanceMonths, financeMonthBounds, financeMonthKey } from "../../lib/admin-v1/finance";
import { belgradeDateKey } from "../../lib/admin-v1/task-time";

const MAX_PAYMENT_ALLOCATIONS = 100;
const GLOBAL_SCOPE = "global";

function financeFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(financeFingerprint).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${financeFingerprint(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

type ReceiptAllocation = {
  logicalKey: string;
  category: "physical" | "saas" | "premium" | "unallocated";
  serviceType?: Doc<"serviceProfiles">["type"];
  amountMinor: number;
  period: "monthly" | "annual" | "one_time" | "unallocated";
  coveredStart?: number;
  coveredEnd?: number;
  subscriptionId?: Id<"subscriptions">;
  orderId?: Id<"orders">;
};

function accountScope(accountId: Id<"accounts">) {
  return `account:${accountId}`;
}

function assertPositiveMinor(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ConvexError("admin_finance_money_invalid");
  return value;
}

async function sourceAllocations(ctx: MutationCtx, payment: Doc<"payments">): Promise<ReceiptAllocation[]> {
  if (!payment.ledger) throw new ConvexError("admin_finance_legacy_payment_unresolved");
  const subscriptionRows = await ctx.db
    .query("paymentAllocations")
    .withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id))
    .take(MAX_PAYMENT_ALLOCATIONS + 1);
  const orderRows = await ctx.db
    .query("orderPaymentAllocations")
    .withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id))
    .take(MAX_PAYMENT_ALLOCATIONS + 1);
  if (subscriptionRows.length + orderRows.length > MAX_PAYMENT_ALLOCATIONS) {
    throw new ConvexError("admin_finance_allocation_limit");
  }
  if (subscriptionRows.length > 0 && orderRows.length > 0) {
    throw new ConvexError("admin_finance_mixed_source_payment");
  }
  const result: ReceiptAllocation[] = [];
  for (const allocation of subscriptionRows) {
    if (allocation.accountId !== payment.accountId) throw new ConvexError("admin_finance_allocation_cross_account");
    if (allocation.financeCategory && allocation.financePeriod) {
      result.push({
        logicalKey: `subscription:${allocation._id}`,
        category: allocation.financeCategory,
        ...(allocation.financeServiceType ? { serviceType: allocation.financeServiceType } : {}),
        amountMinor: assertPositiveMinor(allocation.amount.amountMinor),
        period: allocation.financePeriod,
        coveredStart: allocation.start,
        coveredEnd: allocation.end,
        subscriptionId: allocation.subscriptionId,
      });
      continue;
    }
    const subscription = await ctx.db.get(allocation.subscriptionId);
    if (!subscription || subscription.accountId !== payment.accountId) {
      throw new ConvexError("admin_finance_allocation_cross_account");
    }
    if (subscription.target.kind === "account_premium") {
      result.push({
        logicalKey: `subscription:${allocation._id}`,
        category: "premium",
        amountMinor: assertPositiveMinor(allocation.amount.amountMinor),
        period: subscription.period,
        coveredStart: allocation.start,
        coveredEnd: allocation.end,
        subscriptionId: subscription._id,
      });
    } else {
      const profile = await ctx.db.get(subscription.target.serviceProfileId);
      const business = profile && await ctx.db.get(profile.businessId);
      if (!profile || !business || business.accountId !== payment.accountId) {
        throw new ConvexError("admin_finance_allocation_cross_account");
      }
      result.push({
        logicalKey: `subscription:${allocation._id}`,
        category: "saas",
        serviceType: profile.type,
        amountMinor: assertPositiveMinor(allocation.amount.amountMinor),
        period: subscription.period,
        coveredStart: allocation.start,
        coveredEnd: allocation.end,
        subscriptionId: subscription._id,
      });
    }
  }
  for (const allocation of orderRows) {
    if (allocation.accountId !== payment.accountId) {
      throw new ConvexError("admin_finance_allocation_cross_account");
    }
    result.push({
      logicalKey: `order:${allocation._id}`,
      category: "physical",
      amountMinor: assertPositiveMinor(allocation.amountMinor),
      period: "one_time",
      orderId: allocation.orderId,
    });
  }
  const allocatedMinor = result.reduce((sum, row) => sum + row.amountMinor, 0);
  const unallocatedMinor = payment.ledger.amount.amountMinor - allocatedMinor;
  if (unallocatedMinor !== payment.ledger.unallocatedMinor || unallocatedMinor < 0) {
    throw new ConvexError("admin_finance_unbalanced_projection");
  }
  if (unallocatedMinor > 0) {
    result.push({
      logicalKey: `payment:${payment._id}:unallocated`,
      category: "unallocated",
      amountMinor: unallocatedMinor,
      period: "unallocated",
    });
  }
  return result;
}

async function addRollup(
  ctx: MutationCtx,
  input: {
    scopeKey: string;
    monthKey: string;
    allocation: ReceiptAllocation;
    method: Doc<"financeLedgerEntries">["method"];
    currency: string;
    entryKind: Doc<"financeLedgerEntries">["entryKind"];
    amountMinor: number;
    now: number;
  },
) {
  const serviceKey = input.allocation.serviceType ?? "none";
  const dimensionKey = `${input.currency}:${input.allocation.category}:${serviceKey}:${input.method}`;
  const existing = await ctx.db
    .query("financeMonthlyRollups")
    .withIndex("by_scopeKey_and_monthKey_and_dimensionKey", (q) =>
      q.eq("scopeKey", input.scopeKey).eq("monthKey", input.monthKey).eq("dimensionKey", dimensionKey),
    )
    .unique();
  const collectedMinor = (existing?.collectedMinor ?? 0) + (input.entryKind === "receipt" ? input.amountMinor : 0);
  const refundedMinor = (existing?.refundedMinor ?? 0) + (input.entryKind === "refund" ? input.amountMinor : 0);
  const reversedMinor = (existing?.reversedMinor ?? 0) + (input.entryKind === "reversal" ? input.amountMinor : 0);
  if (![collectedMinor, refundedMinor, reversedMinor].every(Number.isSafeInteger)) {
    throw new ConvexError("admin_finance_money_invalid");
  }
  if (existing) {
    await ctx.db.patch(existing._id, { collectedMinor, refundedMinor, reversedMinor, updatedAt: input.now });
  } else {
    await ctx.db.insert("financeMonthlyRollups", {
      scopeKey: input.scopeKey,
      monthKey: input.monthKey,
      dimensionKey,
      category: input.allocation.category,
      ...(input.allocation.serviceType ? { serviceType: input.allocation.serviceType } : {}),
      method: input.method,
      currency: input.currency,
      collectedMinor,
      refundedMinor,
      reversedMinor,
      updatedAt: input.now,
    });
  }
}

async function addDailyRollup(
  ctx: MutationCtx,
  input: {
    scopeKey: string;
    dateKey: string;
    allocation: ReceiptAllocation;
    method: Doc<"financeLedgerEntries">["method"];
    currency: string;
    entryKind: Doc<"financeLedgerEntries">["entryKind"];
    amountMinor: number;
    now: number;
  },
) {
  const serviceKey = input.allocation.serviceType ?? "none";
  const dimensionKey = `${input.currency}:${input.allocation.category}:${serviceKey}:${input.method}`;
  const existing = await ctx.db
    .query("financeDailyRollups")
    .withIndex("by_scopeKey_and_dateKey_and_dimensionKey", (q) =>
      q.eq("scopeKey", input.scopeKey).eq("dateKey", input.dateKey).eq("dimensionKey", dimensionKey),
    )
    .unique();
  const collectedMinor = (existing?.collectedMinor ?? 0) + (input.entryKind === "receipt" ? input.amountMinor : 0);
  const refundedMinor = (existing?.refundedMinor ?? 0) + (input.entryKind === "refund" ? input.amountMinor : 0);
  const reversedMinor = (existing?.reversedMinor ?? 0) + (input.entryKind === "reversal" ? input.amountMinor : 0);
  if (![collectedMinor, refundedMinor, reversedMinor].every(Number.isSafeInteger)) {
    throw new ConvexError("admin_finance_money_invalid");
  }
  if (existing) {
    await ctx.db.patch(existing._id, { collectedMinor, refundedMinor, reversedMinor, updatedAt: input.now });
  } else {
    await ctx.db.insert("financeDailyRollups", {
      scopeKey: input.scopeKey,
      dateKey: input.dateKey,
      dimensionKey,
      category: input.allocation.category,
      ...(input.allocation.serviceType ? { serviceType: input.allocation.serviceType } : {}),
      method: input.method,
      currency: input.currency,
      collectedMinor,
      refundedMinor,
      reversedMinor,
      updatedAt: input.now,
    });
  }
}

export type FinanceExpectedSourceRow = {
  sourceKeySuffix: string;
  monthKey: string;
  category: "physical" | "saas" | "premium";
  serviceType?: Doc<"serviceProfiles">["type"];
  amountMinor: number;
  availability: "known" | "unavailable";
  waived: boolean;
  dueAt?: number;
};

async function addExpectedRollup(
  ctx: MutationCtx,
  row: Pick<Doc<"financeExpectedObligations">, "scopeKey" | "monthKey" | "category" | "serviceType" | "amountMinor" | "availability" | "waived">,
  direction: 1 | -1,
  now: number,
) {
  const dimensionKey = `RSD:${row.category}:${row.serviceType ?? "none"}`;
  const existing = await ctx.db.query("financeExpectedRollups")
    .withIndex("by_scopeKey_and_monthKey_and_dimensionKey", (q) =>
      q.eq("scopeKey", row.scopeKey).eq("monthKey", row.monthKey).eq("dimensionKey", dimensionKey),
    ).unique();
  if (!existing && direction === -1) throw new ConvexError("admin_finance_expected_projection_conflict");
  const amountMinor = (existing?.amountMinor ?? 0) + direction * row.amountMinor;
  const waivedCount = (existing?.waivedCount ?? 0) + direction * (row.waived ? 1 : 0);
  const unavailablePriceCount = (existing?.unavailablePriceCount ?? 0) + direction * (row.availability === "unavailable" ? 1 : 0);
  if (![amountMinor, waivedCount, unavailablePriceCount].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new ConvexError("admin_finance_expected_projection_conflict");
  }
  if (existing && amountMinor === 0 && waivedCount === 0 && unavailablePriceCount === 0) {
    await ctx.db.delete(existing._id);
  } else if (existing) {
    await ctx.db.patch(existing._id, { amountMinor, waivedCount, unavailablePriceCount, updatedAt: now });
  } else {
    await ctx.db.insert("financeExpectedRollups", {
      scopeKey: row.scopeKey,
      monthKey: row.monthKey,
      dimensionKey,
      category: row.category,
      ...(row.serviceType ? { serviceType: row.serviceType } : {}),
      currency: "RSD",
      amountMinor,
      waivedCount,
      unavailablePriceCount,
      updatedAt: now,
    });
  }
}

export async function replaceFinanceExpectedSource(
  ctx: MutationCtx,
  input: {
    accountId: Id<"accounts">;
    source: { kind: "subscription"; id: Id<"subscriptions"> } | { kind: "order"; id: Id<"orderOperations"> };
    rows: FinanceExpectedSourceRow[];
    now: number;
  },
) {
  if (input.rows.length > 36) throw new ConvexError("admin_finance_expected_source_limit");
  let existing: Doc<"financeExpectedObligations">[];
  if (input.source.kind === "subscription") {
    const subscriptionId = input.source.id;
    existing = await ctx.db.query("financeExpectedObligations")
      .withIndex("by_subscriptionId_and_scopeKey", (q) => q.eq("subscriptionId", subscriptionId)).take(73);
  } else {
    const orderOperationId = input.source.id;
    existing = await ctx.db.query("financeExpectedObligations")
      .withIndex("by_orderOperationId_and_scopeKey", (q) => q.eq("orderOperationId", orderOperationId)).take(73);
  }
  if (existing.length > 72) throw new ConvexError("admin_finance_expected_source_limit");
  const desired = [GLOBAL_SCOPE, accountScope(input.accountId)].flatMap((scopeKey) => input.rows.map((row) => {
    if (!Number.isSafeInteger(row.amountMinor) || row.amountMinor < 0) throw new ConvexError("admin_finance_money_invalid");
    const sourceKey = `${scopeKey}:${input.source.kind}:${input.source.id}:${row.sourceKeySuffix}`;
    const stableFields = {
      scopeKey,
      sourceKey,
      accountId: input.accountId,
      sourceKind: input.source.kind,
      monthKey: row.monthKey,
      category: row.category,
      ...(row.serviceType ? { serviceType: row.serviceType } : {}),
      amountMinor: row.amountMinor,
      currency: "RSD" as const,
      availability: row.availability,
      waived: row.waived,
      ...(row.dueAt !== undefined ? { dueAt: row.dueAt } : {}),
      ...(input.source.kind === "subscription" ? { subscriptionId: input.source.id } : { orderOperationId: input.source.id }),
    };
    return { ...stableFields, fingerprint: financeFingerprint(stableFields), updatedAt: input.now };
  }));
  const previousByKey = new Map(existing.map((row) => [row.sourceKey, row.fingerprint]));
  if (existing.length === desired.length && desired.every((row) => previousByKey.get(row.sourceKey) === row.fingerprint)) return;
  for (const row of existing) {
    await addExpectedRollup(ctx, row, -1, input.now);
    await ctx.db.delete(row._id);
  }
  for (const row of desired) {
    const id = await ctx.db.insert("financeExpectedObligations", row);
    await addExpectedRollup(ctx, (await ctx.db.get(id))!, 1, input.now);
  }
}

export async function syncFinanceExpectedOrder(ctx: MutationCtx, operation: Doc<"orderOperations">, now: number) {
  const remainingMinor = Math.max(0, operation.requiredMinor - operation.settledMinor);
  const rows: FinanceExpectedSourceRow[] = operation.view === "active" && operation.fulfillmentState !== "cancelled" && remainingMinor > 0
    ? [{ sourceKeySuffix: "remaining", monthKey: "~undated", category: "physical", amountMinor: remainingMinor, availability: "known", waived: false }]
    : [];
  await replaceFinanceExpectedSource(ctx, { accountId: operation.accountId, source: { kind: "order", id: operation._id }, rows, now });
}

async function ensureRequirement(
  ctx: MutationCtx,
  scopeKey: string,
  accountId: Id<"accounts">,
  monthKey: string,
  allocation: ReceiptAllocation,
  now: number,
) {
  const requirements = allocation.category === "physical" && allocation.orderId
    ? [{ category: "production" as const, key: `production:${allocation.orderId}`, sourceId: String(allocation.orderId) }]
    : allocation.category === "saas"
      ? [
          { category: "hosting" as const, key: "hosting", sourceId: undefined },
          { category: "backend" as const, key: "backend", sourceId: undefined },
        ]
      : allocation.category === "unallocated"
        ? [{ category: "classification" as const, key: `classification:${allocation.logicalKey}`, sourceId: allocation.logicalKey }]
        : [];
  for (const requirement of requirements) {
    const existing = await ctx.db
      .query("financeCostRequirements")
      .withIndex("by_scopeKey_and_requirementKey_and_monthKey", (q) =>
        q.eq("scopeKey", scopeKey).eq("requirementKey", requirement.key).eq("monthKey", monthKey),
      )
      .unique();
    if (!existing) {
      let evidenceCostId: Id<"financeDirectCosts"> | undefined;
      if (requirement.category === "production" && allocation.orderId) {
        const costs = await ctx.db.query("financeDirectCosts").withIndex("by_orderId", (q) => q.eq("orderId", allocation.orderId)).take(51);
        if (costs.length > 50) throw new ConvexError("admin_finance_cost_evidence_limit");
        evidenceCostId = costs.at(-1)?._id;
      } else if (requirement.category === "hosting" || requirement.category === "backend") {
        evidenceCostId = (await ctx.db.query("financeCostCoverageFacts")
          .withIndex("by_scopeKey_and_category_and_monthKey", (q) => q.eq("scopeKey", scopeKey).eq("category", requirement.category).eq("monthKey", monthKey))
          .unique())?.evidenceCostId;
      }
      await ctx.db.insert("financeCostRequirements", {
        scopeKey,
        monthKey,
        requirementKey: requirement.key,
        category: requirement.category,
        ...(scopeKey === GLOBAL_SCOPE ? {} : { accountId }),
        ...(requirement.sourceId ? { sourceId: requirement.sourceId } : {}),
        state: evidenceCostId ? "known" : "missing",
        ...(evidenceCostId ? { evidenceCostId } : {}),
        updatedAt: now,
      });
    }
  }
}

async function insertEntry(
  ctx: MutationCtx,
  input: {
    scopeKey: string;
    payment: Doc<"payments">;
    allocation: ReceiptAllocation;
    entryKind: Doc<"financeLedgerEntries">["entryKind"];
    amountMinor: number;
    occurredAt: number;
    adjustmentId?: Id<"paymentAdjustments">;
    now: number;
  },
) {
  const sourceKey = `${input.scopeKey}:${input.entryKind}:${input.payment._id}:${input.adjustmentId ?? "receipt"}:${input.allocation.logicalKey}`;
  const hash = financeFingerprint({
    paymentId: input.payment._id,
    adjustmentId: input.adjustmentId,
    allocation: input.allocation,
    entryKind: input.entryKind,
    amountMinor: input.amountMinor,
    occurredAt: input.occurredAt,
  });
  const previous = await ctx.db.query("financeLedgerEntries").withIndex("by_sourceKey", (q) => q.eq("sourceKey", sourceKey)).unique();
  if (previous) {
    if (previous.fingerprint !== hash) throw new ConvexError("admin_finance_projection_conflict");
    return;
  }
  const currency = input.payment.ledger!.amount.currency;
  const method = input.payment.ledger!.method;
  await ctx.db.insert("financeLedgerEntries", {
    scopeKey: input.scopeKey,
    sourceKey,
    logicalKey: input.allocation.logicalKey,
    fingerprint: hash,
    accountId: input.payment.accountId,
    paymentId: input.payment._id,
    ...(input.adjustmentId ? { adjustmentId: input.adjustmentId } : {}),
    entryKind: input.entryKind,
    category: input.allocation.category,
    ...(input.allocation.serviceType ? { serviceType: input.allocation.serviceType } : {}),
    amountMinor: input.amountMinor,
    currency,
    method,
    occurredAt: input.occurredAt,
    period: input.allocation.period,
    ...(input.allocation.coveredStart !== undefined ? { coveredStart: input.allocation.coveredStart } : {}),
    ...(input.allocation.coveredEnd !== undefined ? { coveredEnd: input.allocation.coveredEnd } : {}),
    ...(input.allocation.subscriptionId ? { subscriptionId: input.allocation.subscriptionId } : {}),
    ...(input.allocation.orderId ? { orderId: input.allocation.orderId } : {}),
    ...(input.payment.recordedByUserId ? { recordedByUserId: input.payment.recordedByUserId } : {}),
    createdAt: input.now,
  });
  const monthKey = financeMonthKey(input.occurredAt);
  await addRollup(ctx, {
    scopeKey: input.scopeKey,
    monthKey,
    allocation: input.allocation,
    method,
    currency,
    entryKind: input.entryKind,
    amountMinor: input.amountMinor,
    now: input.now,
  });
  await addDailyRollup(ctx, {
    scopeKey: input.scopeKey,
    dateKey: belgradeDateKey(input.occurredAt),
    allocation: input.allocation,
    method,
    currency,
    entryKind: input.entryKind,
    amountMinor: input.amountMinor,
    now: input.now,
  });
  if (input.entryKind === "receipt") {
    await ensureRequirement(ctx, input.scopeKey, input.payment.accountId, monthKey, input.allocation, input.now);
  }
}

export async function projectFinancePayment(ctx: MutationCtx, paymentId: Id<"payments">) {
  const payment = await ctx.db.get(paymentId);
  if (!payment?.ledger) return { status: "unresolved_legacy" as const };
  if (payment.ledger.amount.currency !== "RSD") throw new ConvexError("admin_finance_currency_not_supported");
  const allocations = await sourceAllocations(ctx, payment);
  const adjustments = await ctx.db
    .query("paymentAdjustments")
    .withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id))
    .take(MAX_PAYMENT_ALLOCATIONS + 1);
  if (adjustments.length > MAX_PAYMENT_ALLOCATIONS) throw new ConvexError("admin_finance_adjustment_limit");
  const now = Date.now();
  const scopes = [GLOBAL_SCOPE, accountScope(payment.accountId)];
  for (const scopeKey of scopes) {
    for (const allocation of allocations) {
      await insertEntry(ctx, {
        scopeKey,
        payment,
        allocation,
        entryKind: "receipt",
        amountMinor: allocation.amountMinor,
        occurredAt: payment.paidAt,
        now,
      });
    }
    for (const adjustment of adjustments) {
      const occurredAt = adjustment.occurredAt ?? adjustment.change.at;
      const adjustmentAllocations = adjustment.kind === "reversal"
        ? allocations.map((allocation) => ({ allocation, amountMinor: allocation.amountMinor }))
        : (adjustment.allocations ?? []).map((row) => {
            const allocation = allocations.find((candidate) => candidate.logicalKey === row.logicalKey);
            if (!allocation) throw new ConvexError("admin_finance_refund_allocation_missing");
            return { allocation, amountMinor: assertPositiveMinor(row.amountMinor) };
          });
      for (const row of adjustmentAllocations) {
        await insertEntry(ctx, {
          scopeKey,
          payment,
          allocation: row.allocation,
          entryKind: adjustment.kind,
          amountMinor: row.amountMinor,
          occurredAt,
          adjustmentId: adjustment._id,
          now,
        });
      }
    }
    const account = await ctx.db.get(payment.accountId);
    if (!account) throw new ConvexError("admin_finance_account_missing");
    const digest = await ctx.db
      .query("financePaymentDigests")
      .withIndex("by_scopeKey_and_paymentId", (q) => q.eq("scopeKey", scopeKey).eq("paymentId", payment._id))
      .unique();
    const refundedMinor = adjustments.filter((row) => row.kind === "refund").reduce((sum, row) => {
      const next = sum + row.amount.amountMinor;
      if (!Number.isSafeInteger(next)) throw new ConvexError("admin_finance_money_invalid");
      return next;
    }, 0);
    const reversedMinor = adjustments.filter((row) => row.kind === "reversal").reduce((sum, row) => {
      const next = sum + row.amount.amountMinor;
      if (!Number.isSafeInteger(next)) throw new ConvexError("admin_finance_money_invalid");
      return next;
    }, 0);
    const fields = {
      scopeKey,
      accountId: payment.accountId,
      accountName: account.name,
      paymentId: payment._id,
      amountMinor: payment.ledger.amount.amountMinor,
      currency: payment.ledger.amount.currency,
      paidAt: payment.paidAt,
      method: payment.ledger.method,
      ...(payment.reference ? { reference: payment.reference } : {}),
      ...(payment.recordedByUserId ? { recordedByUserId: payment.recordedByUserId } : {}),
      allocations,
      refundedMinor,
      reversedMinor,
      updatedAt: now,
    };
    if (digest) await ctx.db.patch(digest._id, fields);
    else await ctx.db.insert("financePaymentDigests", fields);
    const filterKeys = new Set<string>(["total"]);
    for (const allocation of allocations) {
      if (allocation.category !== "unallocated") filterKeys.add(allocation.category);
      if (allocation.category === "saas" && allocation.serviceType) filterKeys.add(allocation.serviceType);
    }
    const listRows = await ctx.db.query("financePaymentListRows")
      .withIndex("by_scopeKey_and_paymentId_and_filterKey", (q) => q.eq("scopeKey", scopeKey).eq("paymentId", payment._id))
      .take(11);
    if (listRows.length > 10) throw new ConvexError("admin_finance_payment_filter_limit");
    for (const listRow of listRows) if (!filterKeys.has(listRow.filterKey)) await ctx.db.delete(listRow._id);
    for (const filterKey of filterKeys) {
      const listRow = listRows.find((row) => row.filterKey === filterKey);
      const listFields = { ...fields, filterKey };
      if (listRow) await ctx.db.patch(listRow._id, listFields);
      else await ctx.db.insert("financePaymentListRows", listFields);
    }
  }
  return { status: "projected" as const, allocations: allocations.length };
}

export async function markFinanceCostRequirementsKnown(
  ctx: MutationCtx,
  input: {
    costId: Id<"financeDirectCosts">;
    accountId?: Id<"accounts">;
    category: "production" | "hosting" | "backend";
    orderId?: Id<"orders">;
    coveredStart?: number;
    coveredEnd?: number;
    now: number;
  },
) {
  const scopes = input.accountId ? [GLOBAL_SCOPE, accountScope(input.accountId)] : [GLOBAL_SCOPE];
  for (const scopeKey of scopes) {
    if (input.category === "production") {
      if (!input.orderId) throw new ConvexError("admin_finance_production_reference_required");
      const rows = await ctx.db
        .query("financeCostRequirements")
        .withIndex("by_scopeKey_and_requirementKey_and_monthKey", (q) =>
          q.eq("scopeKey", scopeKey).eq("requirementKey", `production:${input.orderId}`),
        )
        .take(121);
      if (rows.length > 120) throw new ConvexError("admin_finance_cost_coverage_limit");
      for (const row of rows) await ctx.db.patch(row._id, { state: "known", evidenceCostId: input.costId, updatedAt: input.now });
      continue;
    }
    if (input.coveredStart === undefined || input.coveredEnd === undefined || input.coveredEnd <= input.coveredStart) {
      throw new ConvexError("admin_finance_cost_period_required");
    }
    const recurringCategory = input.category;
    const first = financeMonthKey(input.coveredStart);
    let key = first;
    for (let index = 0; index < 120; index += 1) {
      const bounds = financeMonthBounds(key);
      if (bounds.start >= input.coveredEnd) break;
      const coverage = await ctx.db.query("financeCostCoverageFacts")
        .withIndex("by_scopeKey_and_category_and_monthKey", (q) => q.eq("scopeKey", scopeKey).eq("category", recurringCategory).eq("monthKey", key))
        .unique();
      if (coverage) await ctx.db.patch(coverage._id, { evidenceCostId: input.costId, updatedAt: input.now });
      else await ctx.db.insert("financeCostCoverageFacts", { scopeKey, monthKey: key, category: recurringCategory, evidenceCostId: input.costId, updatedAt: input.now });
      const requirement = await ctx.db
        .query("financeCostRequirements")
        .withIndex("by_scopeKey_and_requirementKey_and_monthKey", (q) =>
          q.eq("scopeKey", scopeKey).eq("requirementKey", input.category).eq("monthKey", key),
        )
        .unique();
      if (requirement) await ctx.db.patch(requirement._id, { state: "known", evidenceCostId: input.costId, updatedAt: input.now });
      key = addFinanceMonths(key, 1);
    }
  }
}

export async function addFinanceCostRollups(ctx: MutationCtx, cost: Doc<"financeDirectCosts">) {
  const monthKey = financeMonthKey(cost.occurredAt);
  const scopes = cost.accountId ? [GLOBAL_SCOPE, accountScope(cost.accountId)] : [GLOBAL_SCOPE];
  for (const scopeKey of scopes) {
    const dimensionKey = `${cost.currency}:${cost.category}`;
    const existing = await ctx.db
      .query("financeMonthlyCostRollups")
      .withIndex("by_scopeKey_and_monthKey_and_dimensionKey", (q) =>
        q.eq("scopeKey", scopeKey).eq("monthKey", monthKey).eq("dimensionKey", dimensionKey),
      )
      .unique();
    const debitMinor = (existing?.debitMinor ?? 0) + (cost.direction === "debit" ? cost.amountMinor : 0);
    const creditMinor = (existing?.creditMinor ?? 0) + (cost.direction === "credit" ? cost.amountMinor : 0);
    if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor)) throw new ConvexError("admin_finance_money_invalid");
    if (existing) await ctx.db.patch(existing._id, { debitMinor, creditMinor, updatedAt: cost.createdAt });
    else await ctx.db.insert("financeMonthlyCostRollups", {
      scopeKey,
      monthKey,
      dimensionKey,
      category: cost.category,
      currency: cost.currency,
      debitMinor,
      creditMinor,
      updatedAt: cost.createdAt,
    });
  }
}
