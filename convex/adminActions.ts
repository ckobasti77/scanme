import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import schema from "./schema";
import {
  ACTION_PRIORITY_RANK,
  actionPriorityAt,
  actionPriorityClass,
  compareActionPriority,
  stableActionCauseId,
} from "../lib/admin-v1/operational";
import { requireAdmin } from "./lib/access";
import {
  actionDuePrecisionValidator,
  actionPriorityClassValidator,
  actionResolutionRuleValidator,
  actionSeverityValidator,
  actionSourceDomainValidator,
  actionStateValidator,
} from "./lib/adminActionValidators";
import {
  actionSignal,
  appendActionEvent,
  refreshActionSignals,
} from "./lib/adminActionEngine";
import { writeAdminAudit } from "./lib/adminAudit";

const actionViewValidator = v.object({
  causeId: v.string(),
  source: v.object({
    domain: actionSourceDomainValidator,
    recordId: v.string(),
    causeKind: v.string(),
  }),
  accountId: v.union(v.id("accounts"), v.null()),
  businessId: v.union(v.id("businesses"), v.null()),
  serviceProfileId: v.union(v.id("serviceProfiles"), v.null()),
  productRef: v.union(v.string(), v.null()),
  severity: actionSeverityValidator,
  state: actionStateValidator,
  assigneeId: v.union(v.id("users"), v.null()),
  dueAt: v.union(v.number(), v.null()),
  duePrecision: v.union(actionDuePrecisionValidator, v.null()),
  snooze: v.union(
    v.object({
      until: v.number(),
      reason: v.string(),
      actorUserId: v.id("users"),
    }),
    v.null(),
  ),
  context: v.object({
    kind: v.literal("source_record"),
    href: v.union(v.string(), v.null()),
  }),
  resolutionRule: actionResolutionRuleValidator,
  description: v.union(v.string(), v.null()),
  priorityClass: actionPriorityClassValidator,
  relevantAt: v.number(),
  audit: v.object({
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
    resolvedByKind: v.union(v.literal("admin"), v.literal("system"), v.null()),
    resolvedByUserId: v.union(v.id("users"), v.null()),
    resolutionNote: v.union(v.string(), v.null()),
  }),
});

const prioritySignalsValidator = v.object({
  blocking: v.boolean(),
  overdue: v.boolean(),
  dueToday: v.boolean(),
  needsReply: v.boolean(),
  graceOrWarning: v.boolean(),
  waitingOn: v.union(
    v.literal("scanme"),
    v.literal("client"),
    v.literal("none"),
  ),
});

const SEVERITY_RANK = { blocking: 0, warning: 1, information: 2 } as const;

function validTime(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime())) {
    throw new ConvexError("action_invalid_time");
  }
}

function text(value: string, code: string, max = 2_000) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ConvexError(code);
  return normalized;
}

function actionView(item: Doc<"actionItems">, now: number) {
  const snoozeActive =
    item.state === "snoozed" &&
    item.snoozedUntil !== undefined &&
    item.snoozedUntil > now;
  const state = item.state === "snoozed" && !snoozeActive ? "open" : item.state;
  return {
    causeId: item.causeId,
    source: {
      domain: item.sourceDomain,
      recordId: item.sourceRecordId,
      causeKind: item.causeKind,
    },
    accountId: item.accountId ?? null,
    businessId: item.businessId ?? null,
    serviceProfileId: item.serviceProfileId ?? null,
    productRef: item.productRef ?? null,
    severity: item.severity,
    state,
    assigneeId: item.assigneeId ?? null,
    dueAt: item.dueAt ?? null,
    duePrecision: item.duePrecision ?? null,
    snooze: snoozeActive
      ? {
          until: item.snoozedUntil!,
          reason: item.snoozeReason!,
          actorUserId: item.snoozedByUserId!,
        }
      : null,
    context: {
      kind: "source_record" as const,
      href: item.contextHref ?? null,
    },
    resolutionRule: item.resolutionRule,
    description: item.description ?? null,
    priorityClass: item.priorityClass,
    relevantAt: item.relevantAt,
    audit: {
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      resolvedAt: item.resolvedAt ?? null,
      resolvedByKind: item.resolvedByKind ?? null,
      resolvedByUserId: item.resolvedByUserId ?? null,
      resolutionNote: item.resolutionNote ?? null,
    },
  };
}

async function validateScope(
  ctx: MutationCtx,
  input: {
    accountId: Id<"accounts">;
    businessId?: Id<"businesses">;
    assigneeId?: Id<"users">;
  },
) {
  const account = await ctx.db.get(input.accountId);
  if (!account || account.adminV1MigrationVersion !== 1) {
    throw new ConvexError("action_account_not_found");
  }
  if (input.businessId) {
    const business = await ctx.db.get(input.businessId);
    if (!business || business.accountId !== account._id || business.kind === "celebration") {
      throw new ConvexError("action_business_not_in_account");
    }
  }
  if (input.assigneeId && !(await ctx.db.get(input.assigneeId))) {
    throw new ConvexError("action_assignee_not_found");
  }
}

export const list = internalQuery({
  args: {
    scope: v.union(v.literal("all"), v.literal("mine")),
    now: v.number(),
    limit: v.number(),
  },
  returns: v.array(actionViewValidator),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    validTime(args.now);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
      throw new ConvexError("action_invalid_limit");
    }
    const open = args.scope === "mine"
      ? await ctx.db
          .query("actionItems")
          .withIndex(
            "by_assignee_state_priority",
            (q) => q.eq("assigneeId", admin._id).eq("state", "open"),
          )
          .take(args.limit)
      : await ctx.db
          .query("actionItems")
          .withIndex("by_state_and_priorityRank_and_priorityAt_and_causeId", (q) =>
            q.eq("state", "open"),
          )
          .take(args.limit);
    // Scheduler normally reopens these exactly at `until`. This bounded branch
    // is the correctness fallback if a scheduled function is delayed.
    const staleLimit = Math.min(args.limit * 7, 700);
    const expiredSnoozes = args.scope === "mine"
      ? await ctx.db
          .query("actionItems")
          .withIndex("by_assigneeId_and_state_and_snoozedUntil", (q) =>
            q
              .eq("assigneeId", admin._id)
              .eq("state", "snoozed")
              .gt("snoozedUntil", 0)
              .lte("snoozedUntil", args.now),
          )
          .take(staleLimit)
      : await ctx.db
          .query("actionItems")
          .withIndex("by_state_and_snoozedUntil", (q) =>
            q
              .eq("state", "snoozed")
              .gt("snoozedUntil", 0)
              .lte("snoozedUntil", args.now),
          )
          .take(staleLimit);
    return [...new Map([...open, ...expiredSnoozes].map((item) => [item.causeId, item])).values()]
      .sort(compareActionPriority)
      .slice(0, args.limit)
      .map((item) => actionView(item, args.now));
  },
});

export const getByCauseId = internalQuery({
  args: { causeId: v.string(), now: v.number() },
  returns: v.union(actionViewValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    validTime(args.now);
    const item = await ctx.db
      .query("actionItems")
      .withIndex("by_causeId", (q) => q.eq("causeId", args.causeId))
      .unique();
    return item ? actionView(item, args.now) : null;
  },
});

export const listForSource = internalQuery({
  args: {
    domain: actionSourceDomainValidator,
    sourceRecordId: v.string(),
    now: v.number(),
    limit: v.number(),
  },
  returns: v.array(actionViewValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    validTime(args.now);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
      throw new ConvexError("action_invalid_limit");
    }
    const rows = await ctx.db
      .query("actionItems")
      .withIndex(
        "by_source_record_state_priority",
        (q) =>
          q
            .eq("sourceDomain", args.domain)
            .eq("sourceRecordId", args.sourceRecordId)
            .eq("state", "open"),
      )
      .take(args.limit);
    return rows
      .sort(compareActionPriority)
      .map((row) => actionView(row, args.now));
  },
});

export const resolutionContext = internalQuery({
  args: { actionItemId: v.id("actionItems"), now: v.number() },
  returns: actionViewValidator,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    validTime(args.now);
    const item = await ctx.db.get(args.actionItemId);
    if (!item) throw new ConvexError("action_not_found");
    // A read/open operation deliberately has no write path.
    return actionView(item, args.now);
  },
});

export const reportManualProblem = internalMutation({
  args: {
    accountId: v.id("accounts"),
    businessId: v.optional(v.id("businesses")),
    productRef: v.optional(v.string()),
    causeKey: v.string(),
    causeKind: v.string(),
    description: v.string(),
    severity: actionSeverityValidator,
    assigneeId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    duePrecision: v.optional(actionDuePrecisionValidator),
    relevantAt: v.number(),
    priority: prioritySignalsValidator,
    contextHref: v.optional(v.string()),
  },
  returns: v.id("actionItems"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await validateScope(ctx, args);
    validTime(args.relevantAt);
    if (args.dueAt !== undefined) validTime(args.dueAt);
    if (args.duePrecision && args.dueAt === undefined) {
      throw new ConvexError("action_due_time_required");
    }
    const sourceRecordId = text(args.causeKey, "action_source_required", 500);
    const causeKind = text(args.causeKind, "action_cause_required", 500);
    const description = text(args.description, "action_description_required");
    const contextHref = args.contextHref?.trim();
    if (contextHref && (!contextHref.startsWith("/") || contextHref.length > 1_000)) {
      throw new ConvexError("action_context_must_be_internal");
    }
    const causeId = stableActionCauseId("manual_problem", sourceRecordId, causeKind);
    const priorityClass = actionPriorityClass(args.priority);
    const priorityRank = ACTION_PRIORITY_RANK[priorityClass];
    const priorityAt = actionPriorityAt({
      causeId,
      priorityClass,
      dueAt: args.dueAt ?? null,
      relevantAt: args.relevantAt,
    });
    const existing = await ctx.db
      .query("actionItems")
      .withIndex("by_causeId", (q) => q.eq("causeId", causeId))
      .unique();
    if (existing && existing.resolutionRule !== "manual_problem_resolution") {
      throw new ConvexError("action_cause_collision");
    }
    const fields = {
      sourceDomain: "manual_problem" as const,
      sourceRecordId,
      causeKind,
      sourceVersion: String(args.relevantAt),
      sourceFingerprint: JSON.stringify({
        description,
        severity: args.severity,
        assigneeId: args.assigneeId,
        dueAt: args.dueAt,
        priorityClass,
      }),
      accountId: args.accountId,
      ...(args.businessId ? { businessId: args.businessId } : {}),
      ...(args.productRef ? { productRef: args.productRef } : {}),
      severity: args.severity,
      severityRank: SEVERITY_RANK[args.severity],
      ...(args.assigneeId ? { assigneeId: args.assigneeId } : {}),
      ...(args.dueAt !== undefined ? { dueAt: args.dueAt } : {}),
      ...(args.duePrecision ? { duePrecision: args.duePrecision } : {}),
      priorityClass,
      priorityRank,
      priorityAt,
      relevantAt: args.relevantAt,
      ...(contextHref ? { contextHref } : {}),
      description,
      resolutionRule: "manual_problem_resolution" as const,
    };
    const now = Date.now();
    let actionItemId: Doc<"actionItems">["_id"];
    if (!existing) {
      actionItemId = await ctx.db.insert("actionItems", {
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
        actor: { kind: "admin", userId: admin._id },
        toState: "open",
        createdAt: now,
      });
    } else {
      actionItemId = existing._id;
      const reopening = existing.state === "resolved";
      const changed = existing.sourceFingerprint !== fields.sourceFingerprint;
      if (reopening || changed) {
        await ctx.db.patch(existing._id, {
          ...fields,
          state: reopening ? "open" : existing.state,
          ...(reopening
            ? {
                resolvedAt: undefined,
                resolvedByKind: undefined,
                resolvedByUserId: undefined,
                resolutionNote: undefined,
              }
            : {}),
          updatedAt: now,
        });
        await appendActionEvent(ctx, {
          actionItemId,
          causeId,
          event: reopening ? "reopened" : "source_updated",
          actor: { kind: "admin", userId: admin._id },
          fromState: existing.state,
          toState: reopening ? "open" : existing.state,
          createdAt: now,
        });
      }
    }
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: args.accountId,
      ...(args.businessId ? { businessId: args.businessId } : {}),
      action: "admin_v1_problem_reported",
      detail: { causeId },
      now,
    });
    await refreshActionSignals(ctx, args);
    return actionItemId;
  },
});

export const assign = internalMutation({
  args: {
    actionItemId: v.id("actionItems"),
    assigneeId: v.union(v.id("users"), v.null()),
  },
  returns: v.object({ assigneeId: v.union(v.id("users"), v.null()) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const item = await ctx.db.get(args.actionItemId);
    if (!item || item.state === "resolved") throw new ConvexError("action_not_open");
    if (args.assigneeId && !(await ctx.db.get(args.assigneeId))) {
      throw new ConvexError("action_assignee_not_found");
    }
    if ((item.assigneeId ?? null) === args.assigneeId) return { assigneeId: args.assigneeId };
    const now = Date.now();
    await ctx.db.patch(item._id, {
      assigneeId: args.assigneeId ?? undefined,
      updatedAt: now,
    });
    await appendActionEvent(ctx, {
      actionItemId: item._id,
      causeId: item.causeId,
      event: "assigned",
      actor: { kind: "admin", userId: admin._id },
      fromState: item.state,
      toState: item.state,
      createdAt: now,
    });
    return { assigneeId: args.assigneeId };
  },
});

export const snooze = internalMutation({
  args: { actionItemId: v.id("actionItems"), reason: v.string(), until: v.number() },
  returns: v.object({ state: v.literal("snoozed"), until: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reason = text(args.reason, "action_snooze_reason_required");
    validTime(args.until);
    const now = Date.now();
    if (args.until <= now) throw new ConvexError("action_snooze_must_be_future");
    const item = await ctx.db.get(args.actionItemId);
    if (!item || item.state === "resolved") throw new ConvexError("action_not_open");
    await ctx.db.patch(item._id, {
      state: "snoozed",
      snoozedUntil: args.until,
      snoozeReason: reason,
      snoozedByUserId: admin._id,
      updatedAt: now,
    });
    await appendActionEvent(ctx, {
      actionItemId: item._id,
      causeId: item.causeId,
      event: "snoozed",
      actor: { kind: "admin", userId: admin._id },
      fromState: item.state,
      toState: "snoozed",
      reason,
      until: args.until,
      createdAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(item.accountId ? { accountId: item.accountId } : {}),
      ...(item.businessId ? { businessId: item.businessId } : {}),
      action: "admin_v1_action_snoozed",
      detail: { causeId: item.causeId, until: args.until, reason },
      now,
    });
    await refreshActionSignals(ctx, item);
    await ctx.scheduler.runAt(args.until, internal.adminActions.restoreSnoozed, {
      actionItemId: item._id,
      expectedUntil: args.until,
    });
    return { state: "snoozed" as const, until: args.until };
  },
});

export const restoreSnoozed = internalMutation({
  args: { actionItemId: v.id("actionItems"), expectedUntil: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.actionItemId);
    const now = Date.now();
    if (
      !item ||
      item.state !== "snoozed" ||
      item.snoozedUntil !== args.expectedUntil ||
      args.expectedUntil > now
    ) {
      return false;
    }
    await ctx.db.patch(item._id, {
      state: "open",
      snoozedUntil: undefined,
      snoozeReason: undefined,
      snoozedByUserId: undefined,
      updatedAt: now,
    });
    await appendActionEvent(ctx, {
      actionItemId: item._id,
      causeId: item.causeId,
      event: "snooze_expired",
      actor: { kind: "system", source: "action_snooze" },
      fromState: "snoozed",
      toState: "open",
      createdAt: now,
    });
    await refreshActionSignals(ctx, item);
    return true;
  },
});

export const resolveManual = internalMutation({
  args: { actionItemId: v.id("actionItems"), note: v.string() },
  returns: v.object({ state: v.literal("resolved") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const note = text(args.note, "action_resolution_note_required");
    const item = await ctx.db.get(args.actionItemId);
    if (!item) throw new ConvexError("action_not_found");
    if (item.resolutionRule !== "manual_problem_resolution") {
      throw new ConvexError("action_source_fact_must_change");
    }
    if (item.state === "resolved") return { state: "resolved" as const };
    const now = Date.now();
    await ctx.db.patch(item._id, {
      state: "resolved",
      resolvedAt: now,
      resolvedByKind: "admin",
      resolvedByUserId: admin._id,
      resolutionNote: note,
      snoozedUntil: undefined,
      snoozeReason: undefined,
      snoozedByUserId: undefined,
      updatedAt: now,
    });
    await appendActionEvent(ctx, {
      actionItemId: item._id,
      causeId: item.causeId,
      event: "manual_resolved",
      actor: { kind: "admin", userId: admin._id },
      fromState: item.state,
      toState: "resolved",
      reason: note,
      createdAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(item.accountId ? { accountId: item.accountId } : {}),
      ...(item.businessId ? { businessId: item.businessId } : {}),
      action: "admin_v1_problem_resolved",
      detail: { causeId: item.causeId, note },
      now,
    });
    await refreshActionSignals(ctx, item);
    return { state: "resolved" as const };
  },
});

export const history = internalQuery({
  args: { actionItemId: v.id("actionItems"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("actionItemEvents")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db
      .query("actionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (q) =>
        q.eq("actionItemId", args.actionItemId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const clientSignal = internalQuery({
  args: { accountId: v.id("accounts") },
  returns: v.object({
    severity: v.union(actionSeverityValidator, v.null()),
    causeId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("actionItems")
      .withIndex(
        "by_account_state_severity_priority",
        (q) => q.eq("accountId", args.accountId).eq("state", "open"),
      )
      .first();
    return actionSignal(row);
  },
});
