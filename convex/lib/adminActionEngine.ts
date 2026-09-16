import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  ACTION_PRIORITY_RANK,
  actionPriorityAt,
  actionPriorityClass,
  stableActionCauseId,
  type ActionSeverity,
} from "../../lib/admin-v1/operational";
import type { AutomaticActionAdapterInput } from "./adminActionAdapters";
import { syncDashboardActionById } from "./adminDashboardProjection";

type DatabaseCtx = QueryCtx | MutationCtx;

const SEVERITY_RANK = {
  blocking: 0,
  warning: 1,
  information: 2,
} as const satisfies Record<ActionSeverity, number>;

function required(value: string, code: string, max = 500): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ConvexError(code);
  return normalized;
}

function optionalText(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new ConvexError("action_invalid_text");
  }
  return normalized;
}

function validTime(value: number, code = "action_invalid_time") {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime())) {
    throw new ConvexError(code);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function actionSignal(item: Doc<"actionItems"> | null) {
  return {
    severity: item?.severity ?? null,
    causeId: item?.causeId ?? null,
  };
}

export async function worstOpenActionForAccount(
  ctx: DatabaseCtx,
  accountId: Id<"accounts">,
) {
  return ctx.db
    .query("actionItems")
    .withIndex(
      "by_account_state_severity_priority",
      (q) => q.eq("accountId", accountId).eq("state", "open"),
    )
    .first();
}

export async function worstOpenActionForBusiness(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
) {
  return ctx.db
    .query("actionItems")
    .withIndex(
      "by_business_state_severity_priority",
      (q) => q.eq("businessId", businessId).eq("state", "open"),
    )
    .first();
}

async function worstOpenActionForProduct(
  ctx: DatabaseCtx,
  productRef: string,
) {
  return ctx.db
    .query("actionItems")
    .withIndex(
      "by_product_state_severity_priority",
      (q) => q.eq("productRef", productRef).eq("state", "open"),
    )
    .first();
}

export async function refreshActionSignals(
  ctx: MutationCtx,
  scope: {
    accountId?: Id<"accounts">;
    businessId?: Id<"businesses">;
    productRef?: string;
  },
) {
  if (scope.accountId) {
    const row = await ctx.db
      .query("adminClientReadModels")
      .withIndex("by_accountId", (q) => q.eq("accountId", scope.accountId!))
      .unique();
    if (row) {
      const signal = actionSignal(await worstOpenActionForAccount(ctx, scope.accountId));
      await ctx.db.patch(row._id, {
        signal,
        urgencyRank: signal.severity === "blocking" ? 0 : signal.severity === "warning" ? 1 : signal.severity === "information" ? 2 : 3,
      });
    }
  }
  if (scope.businessId) {
    const row = await ctx.db
      .query("adminVenueReadModels")
      .withIndex("by_businessId", (q) => q.eq("businessId", scope.businessId!))
      .unique();
    if (row) {
      const signal = actionSignal(await worstOpenActionForBusiness(ctx, scope.businessId));
      await ctx.db.patch(row._id, {
        signal,
        hasOpenAction: signal.severity !== null,
        urgencyRank: signal.severity === "blocking" ? 0 : signal.severity === "warning" ? 1 : signal.severity === "information" ? 2 : 3,
      });
    }
  }
  if (scope.productRef) {
    const row = await ctx.db
      .query("adminProductReadModels")
      .withIndex("by_sourceRecordId", (q) =>
        q.eq("sourceRecordId", scope.productRef!),
      )
      .unique();
    if (row) {
      const signal = actionSignal(await worstOpenActionForProduct(ctx, scope.productRef));
      await ctx.db.patch(row._id, {
        signal,
        urgencyRank: signal.severity === "blocking" ? 0 : signal.severity === "warning" ? 1 : signal.severity === "information" ? 2 : 3,
      });
    }
  }
}

export async function appendActionEvent(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"actionItems">;
    causeId: string;
    event: Doc<"actionItemEvents">["event"];
    actor: Doc<"actionItemEvents">["actor"];
    fromState?: Doc<"actionItems">["state"];
    toState?: Doc<"actionItems">["state"];
    reason?: string;
    until?: number;
    createdAt: number;
  },
) {
  return ctx.db.insert("actionItemEvents", input);
}

export async function syncAutomaticAction(
  ctx: MutationCtx,
  raw: AutomaticActionAdapterInput,
  now: number,
): Promise<Id<"actionItems"> | null> {
  validTime(now);
  validTime(raw.relevantAt);
  if (raw.dueAt !== undefined) validTime(raw.dueAt);
  if (raw.duePrecision !== undefined && raw.dueAt === undefined) {
    throw new ConvexError("action_due_time_required");
  }
  const sourceRecordId = required(raw.sourceRecordId, "action_source_required");
  const causeKind = required(raw.causeKind, "action_cause_required");
  const sourceVersion = required(raw.sourceVersion, "action_source_version_required", 2_000);
  const contextHref = optionalText(raw.contextHref, 1_000);
  if (contextHref && !contextHref.startsWith("/")) {
    throw new ConvexError("action_context_must_be_internal");
  }
  const description = optionalText(raw.description, 2_000);
  const causeId = stableActionCauseId(raw.domain, sourceRecordId, causeKind);
  const existing = await ctx.db
    .query("actionItems")
    .withIndex("by_causeId", (q) => q.eq("causeId", causeId))
    .unique();
  if (!raw.isOpen) {
    if (!existing || existing.state === "resolved") return existing?._id ?? null;
    await ctx.db.patch(existing._id, {
      state: "resolved",
      resolvedAt: now,
      resolvedByKind: "system",
      snoozedUntil: undefined,
      snoozeReason: undefined,
      snoozedByUserId: undefined,
      updatedAt: now,
    });
    await appendActionEvent(ctx, {
      actionItemId: existing._id,
      causeId,
      event: "automatic_resolved",
      actor: { kind: "system", source: raw.domain },
      fromState: existing.state,
      toState: "resolved",
      createdAt: now,
    });
    await syncDashboardActionById(ctx, existing._id, now);
    await refreshActionSignals(ctx, existing);
    return existing._id;
  }

  const priorityClass = actionPriorityClass(raw.priority);
  const priorityRank = ACTION_PRIORITY_RANK[priorityClass];
  const priorityAt = actionPriorityAt({
    causeId,
    priorityClass,
    dueAt: raw.dueAt ?? null,
    relevantAt: raw.relevantAt,
  });
  const sourceFingerprint = canonical({
    sourceVersion,
    accountId: raw.accountId,
    businessId: raw.businessId,
    serviceProfileId: raw.serviceProfileId,
    productRef: raw.productRef,
    severity: raw.severity,
    assigneeId: raw.assigneeId,
    dueAt: raw.dueAt,
    duePrecision: raw.duePrecision,
    relevantAt: raw.relevantAt,
    priorityClass,
    contextHref,
    description,
  });
  const fields = {
    sourceDomain: raw.domain,
    sourceRecordId,
    causeKind,
    sourceVersion,
    sourceFingerprint,
    ...(raw.accountId ? { accountId: raw.accountId } : {}),
    ...(raw.businessId ? { businessId: raw.businessId } : {}),
    ...(raw.serviceProfileId ? { serviceProfileId: raw.serviceProfileId } : {}),
    ...(raw.productRef ? { productRef: raw.productRef } : {}),
    severity: raw.severity,
    severityRank: SEVERITY_RANK[raw.severity],
    ...(raw.assigneeId ? { assigneeId: raw.assigneeId } : {}),
    ...(raw.dueAt !== undefined ? { dueAt: raw.dueAt } : {}),
    ...(raw.duePrecision ? { duePrecision: raw.duePrecision } : {}),
    priorityClass,
    priorityRank,
    priorityAt,
    relevantAt: raw.relevantAt,
    ...(contextHref ? { contextHref } : {}),
    ...(description ? { description } : {}),
    resolutionRule: "source_fact_changed" as const,
  };
  if (!existing) {
    const actionItemId = await ctx.db.insert("actionItems", {
      causeId,
      ...fields,
      state: "open",
      createdAt: now,
      updatedAt: now,
    });
    await appendActionEvent(ctx, {
      actionItemId,
      causeId,
      event: "opened",
      actor: { kind: "system", source: raw.domain },
      toState: "open",
      createdAt: now,
    });
    await syncDashboardActionById(ctx, actionItemId, now);
    await refreshActionSignals(ctx, raw);
    return actionItemId;
  }
  if (existing.resolutionRule !== "source_fact_changed") {
    throw new ConvexError("action_cause_collision");
  }
  const wasResolved = existing.state === "resolved";
  const snoozeExpired =
    existing.state === "snoozed" &&
    existing.snoozedUntil !== undefined &&
    existing.snoozedUntil <= now;
  const nextState = wasResolved || snoozeExpired ? "open" : existing.state;
  const sourceChanged = existing.sourceFingerprint !== sourceFingerprint;
  if (!sourceChanged && nextState === existing.state) return existing._id;
  await ctx.db.patch(existing._id, {
    ...fields,
    state: nextState,
    ...(nextState === "open"
      ? {
          resolvedAt: undefined,
          resolvedByKind: undefined,
          resolutionNote: undefined,
          snoozedUntil: undefined,
          snoozeReason: undefined,
          snoozedByUserId: undefined,
        }
      : {}),
    updatedAt: now,
  });
  await appendActionEvent(ctx, {
    actionItemId: existing._id,
    causeId,
    event: wasResolved
      ? "reopened"
      : snoozeExpired
        ? "snooze_expired"
        : "source_updated",
    actor: { kind: "system", source: raw.domain },
    fromState: existing.state,
    toState: nextState,
    createdAt: now,
  });
  await syncDashboardActionById(ctx, existing._id, now);
  await refreshActionSignals(ctx, {
    accountId: raw.accountId ?? existing.accountId,
    businessId: raw.businessId ?? existing.businessId,
    productRef: raw.productRef ?? existing.productRef,
  });
  return existing._id;
}

export async function syncSubscriptionActions(
  ctx: MutationCtx,
  subscription: Doc<"subscriptions">,
  facts: Doc<"subscriptions">["facts"],
  relevantAt: number,
  now: number,
) {
  const sourceVersion = canonical(facts);
  const shared = {
    domain: "subscription" as const,
    sourceRecordId: String(subscription._id),
    sourceVersion,
    accountId: subscription.accountId,
    ...(subscription.businessId ? { businessId: subscription.businessId } : {}),
    ...(subscription.target.kind === "service_instance"
      ? { serviceProfileId: subscription.target.serviceProfileId }
      : {}),
    assigneeId: undefined,
    relevantAt,
    duePrecision: "instant" as const,
    contextHref: undefined,
    description: undefined,
  };
  await syncAutomaticAction(ctx, {
    ...shared,
    causeKind: "suspended",
    isOpen: facts.status === "suspended",
    severity: "blocking",
    dueAt: facts.graceEndsAt ?? relevantAt,
    priority: {
      blocking: true,
      overdue: true,
      dueToday: false,
      needsReply: false,
      graceOrWarning: false,
      waitingOn: "none",
    },
  }, now);
  await syncAutomaticAction(ctx, {
    ...shared,
    causeKind: "grace",
    isOpen: facts.status === "grace",
    severity: "warning",
    dueAt: facts.graceEndsAt ?? relevantAt,
    priority: {
      blocking: false,
      overdue: false,
      dueToday: false,
      needsReply: false,
      graceOrWarning: true,
      waitingOn: "none",
    },
  }, now);
  await syncAutomaticAction(ctx, {
    ...shared,
    causeKind: "warning",
    isOpen: facts.status === "active" && facts.warning,
    severity: "warning",
    dueAt: facts.paidThrough ?? relevantAt,
    priority: {
      blocking: false,
      overdue: false,
      dueToday: false,
      needsReply: false,
      graceOrWarning: true,
      waitingOn: "none",
    },
  }, now);
}
