import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type DashboardSourceKind = "action" | "subscription" | "product";

type Contribution = {
  scopeKey: string;
  metric: string;
  amount: number;
};

const MAX_SOURCE_CONTRIBUTIONS = 12;

function contributionKey(value: Pick<Contribution, "scopeKey" | "metric">) {
  return `${value.scopeKey}\u0000${value.metric}`;
}

function assertContribution(value: Contribution) {
  if (!value.scopeKey || !value.metric || !Number.isSafeInteger(value.amount) || value.amount < 0) {
    throw new ConvexError("admin_dashboard_contribution_invalid");
  }
}

async function adjustRollup(
  ctx: MutationCtx,
  scopeKey: string,
  metric: string,
  delta: number,
  now: number,
) {
  if (delta === 0) return;
  const row = await ctx.db
    .query("adminDashboardRollups")
    .withIndex("by_scopeKey_and_metric", (q) =>
      q.eq("scopeKey", scopeKey).eq("metric", metric),
    )
    .unique();
  const count = (row?.count ?? 0) + delta;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new ConvexError("admin_dashboard_rollup_invalid");
  }
  if (row) {
    await ctx.db.patch(row._id, { count, updatedAt: now });
  } else {
    await ctx.db.insert("adminDashboardRollups", { scopeKey, metric, count, updatedAt: now });
  }
}

export async function reconcileDashboardContributions(
  ctx: MutationCtx,
  input: {
    sourceKind: DashboardSourceKind;
    sourceId: string;
    fingerprint: string;
    contributions: Contribution[];
    now: number;
  },
) {
  const desired = input.contributions.filter((entry) => entry.amount !== 0);
  if (desired.length > MAX_SOURCE_CONTRIBUTIONS) {
    throw new ConvexError("admin_dashboard_contribution_limit");
  }
  for (const entry of desired) assertContribution(entry);
  if (new Set(desired.map(contributionKey)).size !== desired.length) {
    throw new ConvexError("admin_dashboard_contribution_duplicate");
  }
  const existing = await ctx.db
    .query("adminDashboardContributions")
    .withIndex("by_sourceKind_and_sourceId", (q) =>
      q.eq("sourceKind", input.sourceKind).eq("sourceId", input.sourceId),
    )
    .take(MAX_SOURCE_CONTRIBUTIONS + 1);
  if (existing.length > MAX_SOURCE_CONTRIBUTIONS) {
    throw new ConvexError("admin_dashboard_existing_contribution_limit");
  }
  const desiredByKey = new Map(desired.map((entry) => [contributionKey(entry), entry]));
  const existingByKey = new Map(existing.map((entry) => [contributionKey(entry), entry]));

  for (const row of existing) {
    const next = desiredByKey.get(contributionKey(row));
    if (!next) {
      await adjustRollup(ctx, row.scopeKey, row.metric, -row.amount, input.now);
      await ctx.db.delete(row._id);
      continue;
    }
    const delta = next.amount - row.amount;
    await adjustRollup(ctx, row.scopeKey, row.metric, delta, input.now);
    if (delta !== 0 || row.fingerprint !== input.fingerprint) {
      await ctx.db.patch(row._id, {
        amount: next.amount,
        fingerprint: input.fingerprint,
        updatedAt: input.now,
      });
    }
  }

  for (const entry of desired) {
    if (existingByKey.has(contributionKey(entry))) continue;
    await adjustRollup(ctx, entry.scopeKey, entry.metric, entry.amount, input.now);
    await ctx.db.insert("adminDashboardContributions", {
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      ...entry,
      fingerprint: input.fingerprint,
      updatedAt: input.now,
    });
  }
}

export async function syncDashboardAction(
  ctx: MutationCtx,
  item: Doc<"actionItems">,
  now: number,
) {
  const visible = item.state === "open";
  const scopeKeys = visible
    ? ["all", ...(item.assigneeId ? [`user:${item.assigneeId}`] : [])]
    : [];
  await reconcileDashboardContributions(ctx, {
    sourceKind: "action",
    sourceId: String(item._id),
    fingerprint: `${item.state}:${item.assigneeId ?? "none"}:${item.priorityClass}:${item.severity}:${item.updatedAt}`,
    contributions: scopeKeys.flatMap((scopeKey) => [
      { scopeKey, metric: "actions.total", amount: 1 },
      { scopeKey, metric: `actions.priority.${item.priorityClass}`, amount: 1 },
      { scopeKey, metric: `actions.severity.${item.severity}`, amount: 1 },
    ]),
    now,
  });
}

export async function syncDashboardActionById(
  ctx: MutationCtx,
  actionItemId: Id<"actionItems">,
  now: number,
) {
  const item = await ctx.db.get(actionItemId);
  if (item) await syncDashboardAction(ctx, item, now);
}

export async function syncDashboardSubscription(
  ctx: MutationCtx,
  subscription: Doc<"subscriptions">,
  facts: Doc<"subscriptions">["facts"],
  now: number,
) {
  await reconcileDashboardContributions(ctx, {
    sourceKind: "subscription",
    sourceId: String(subscription._id),
    fingerprint: JSON.stringify(facts),
    contributions: [
      { scopeKey: "global", metric: "subscriptions.total", amount: 1 },
      { scopeKey: "global", metric: `subscriptions.status.${facts.status}`, amount: 1 },
      ...(facts.warning
        ? [{ scopeKey: "global", metric: "subscriptions.warning", amount: 1 }]
        : []),
    ],
    now,
  });
}

export async function syncDashboardProduct(
  ctx: MutationCtx,
  row: Pick<
    Doc<"productInventory">,
    "_id" | "state" | "qrCount" | "nfcCount" | "problemChannelCount" | "updatedAt"
  >,
  now: number,
) {
  await reconcileDashboardContributions(ctx, {
    sourceKind: "product",
    sourceId: String(row._id),
    fingerprint: `${row.state}:${row.qrCount}:${row.nfcCount}:${row.problemChannelCount}:${row.updatedAt}`,
    contributions: [
      { scopeKey: "global", metric: "products.total", amount: 1 },
      { scopeKey: "global", metric: `products.state.${row.state}`, amount: 1 },
      { scopeKey: "global", metric: "products.channels.qr", amount: row.qrCount ?? 0 },
      { scopeKey: "global", metric: "products.channels.nfc", amount: row.nfcCount ?? 0 },
      { scopeKey: "global", metric: "products.channels.problem", amount: row.problemChannelCount ?? 0 },
    ],
    now,
  });
}

export async function readDashboardMetric(
  ctx: QueryCtx,
  scopeKey: string,
  metric: string,
) {
  return (await ctx.db
    .query("adminDashboardRollups")
    .withIndex("by_scopeKey_and_metric", (q) =>
      q.eq("scopeKey", scopeKey).eq("metric", metric),
    )
    .unique())?.count ?? 0;
}

export async function dashboardProjectionComplete(
  ctx: QueryCtx,
  sourceKind: DashboardSourceKind,
) {
  return (await ctx.db
    .query("adminDashboardProjectionStates")
    .withIndex("by_sourceKind", (q) => q.eq("sourceKind", sourceKind))
    .unique())?.state === "complete";
}

export async function markDashboardProjectionState(
  ctx: MutationCtx,
  sourceKind: DashboardSourceKind,
  state: "pending" | "complete",
  now: number,
) {
  const row = await ctx.db
    .query("adminDashboardProjectionStates")
    .withIndex("by_sourceKind", (q) => q.eq("sourceKind", sourceKind))
    .unique();
  if (row) await ctx.db.patch(row._id, { state, updatedAt: now });
  else await ctx.db.insert("adminDashboardProjectionStates", { sourceKind, state, updatedAt: now });
}
