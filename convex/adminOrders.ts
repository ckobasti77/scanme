import {
  type FilterBuilder,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { applyQc, productForReference, requireDispatchReady, selectQcProducts } from "./lib/accessOrderBridge";
import { accessKind } from "./lib/accessValidators";
import { fingerprint as accessFingerprint } from "./lib/accessOperations";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import schema from "./schema";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import {
  adminDeliveryMethodValidator,
  adminOrderDesignStateValidator,
  adminOrderFulfillmentStateValidator,
  adminOrderPaymentStateValidator,
  adminOrderPriorityValidator,
  adminOrderProductConfigValidator,
  adminOrderViewValidator,
} from "./lib/adminOrderValidators";
import {
  ADMIN_ORDER_BATCH,
  adminDisplayName,
  appendOrderEvent,
  decodePhysicalSelection,
  getOperation,
  getOrderLine,
  refreshOperation,
  requireAdminUser,
} from "./lib/adminOrderOperations";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import { paymentMethod } from "./lib/subscriptionValidators";
import { syncAutomaticAction } from "./lib/adminActionEngine";
import { adminOrdersSr } from "../lib/i18n/sr/admin-orders";

const MAX_PAGE = 50;
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 } as const;

function requiredText(value: string, code: string, max = 2_000) {
  const text = value.trim();
  if (!text || text.length > max) throw new ConvexError(code);
  return text;
}

function command(value: string) {
  return requiredText(value, "admin_order_command_required", 128);
}

function quantity(value: number, max = ADMIN_ORDER_BATCH) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ConvexError("admin_order_quantity_invalid");
  }
  return value;
}

function minor(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConvexError("admin_order_money_invalid");
  }
  return value;
}

async function syncPrinterLateAction(
  ctx: Parameters<typeof syncAutomaticAction>[0],
  operation: Doc<"orderOperations">,
  job: Doc<"printJobs">,
  isOpen: boolean,
  now: number,
) {
  await syncAutomaticAction(ctx, {
    domain: "order",
    sourceRecordId: String(job._id),
    causeKind: "printer_late",
    sourceVersion: `${job.state}:${job.updatedAt}:${job.expectedAt ?? "none"}`,
    isOpen,
    accountId: operation.accountId,
    severity: "warning",
    assigneeId: operation.assigneeId,
    ...(job.expectedAt !== undefined ? { dueAt: job.expectedAt, duePrecision: "instant" as const } : {}),
    relevantAt: job.sentAt ?? job.createdAt,
    priority: { blocking: false, overdue: isOpen, dueToday: false, needsReply: false, graceOrWarning: true, waitingOn: "scanme" },
    contextHref: `/admin/operativa/porudzbine?order=${operation.orderId}`,
    description: `${operation.smpCode}: ${adminOrdersSr.actionPrinterLate}`,
  }, now);
}

async function syncDeliveryProblemAction(
  ctx: Parameters<typeof syncAutomaticAction>[0],
  operation: Doc<"orderOperations">,
  delivery: Doc<"deliveries">,
  isOpen: boolean,
  reason: string | undefined,
  now: number,
) {
  await syncAutomaticAction(ctx, {
    domain: "order",
    sourceRecordId: String(delivery._id),
    causeKind: "delivery_problem",
    sourceVersion: `${delivery.state}:${delivery.updatedAt}:${reason ?? "resolved"}`,
    isOpen,
    accountId: operation.accountId,
    severity: "blocking",
    assigneeId: operation.assigneeId,
    relevantAt: now,
    priority: { blocking: true, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "scanme" },
    contextHref: `/admin/operativa/porudzbine?order=${operation.orderId}`,
    description: reason
      ? `${operation.smpCode}: ${adminOrdersSr.actionDeliveryProblem} — ${reason}`
      : `${operation.smpCode}: ${adminOrdersSr.actionDeliveryResolved}`,
  }, now);
}

function listFilter(args: {
  assigneeId?: Id<"users">;
  paymentState?: Doc<"orderOperations">["paymentState"];
  designState?: Doc<"orderOperations">["designState"];
  fulfillmentState?: Doc<"orderOperations">["fulfillmentState"];
  problemsOnly?: boolean;
}) {
  return (q: FilterBuilder<DataModel["orderOperations"]>) => {
    const filters = [];
    if (args.assigneeId) filters.push(q.eq(q.field("assigneeId"), args.assigneeId));
    if (args.paymentState) filters.push(q.eq(q.field("paymentState"), args.paymentState));
    if (args.designState) filters.push(q.eq(q.field("designState"), args.designState));
    if (args.fulfillmentState) filters.push(q.eq(q.field("fulfillmentState"), args.fulfillmentState));
    if (args.problemsOnly) filters.push(q.gt(q.field("problemCount"), 0));
    return filters.length ? q.and(...filters) : q.eq(q.field("view"), q.field("view"));
  };
}

const listItemValidator = v.object({
  id: v.id("orderOperations"),
  orderId: v.id("orders"),
  smpCode: v.string(),
  accountId: v.id("accounts"),
  accountName: v.string(),
  smkCode: v.string(),
  primaryBusinessName: v.union(v.string(), v.null()),
  primarySmlCode: v.union(v.string(), v.null()),
  paymentState: adminOrderPaymentStateValidator,
  designState: adminOrderDesignStateValidator,
  fulfillmentState: adminOrderFulfillmentStateValidator,
  view: adminOrderViewValidator,
  priority: adminOrderPriorityValidator,
  assigneeId: v.id("users"),
  assigneeName: v.string(),
  requiredMinor: v.number(),
  settledMinor: v.number(),
  lineCount: v.number(),
  unitCount: v.number(),
  problemCount: v.number(),
  notePreview: v.union(v.string(), v.null()),
  provisioningReady: v.boolean(),
  updatedAt: v.number(),
});

function listItem(row: Doc<"orderOperations">) {
  return {
    id: row._id,
    orderId: row.orderId,
    smpCode: row.smpCode,
    accountId: row.accountId,
    accountName: row.accountName,
    smkCode: row.smkCode,
    primaryBusinessName: row.primaryBusinessName ?? null,
    primarySmlCode: row.primarySmlCode ?? null,
    paymentState: row.paymentState,
    designState: row.designState,
    fulfillmentState: row.fulfillmentState,
    view: row.view,
    priority: row.priority,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    requiredMinor: row.requiredMinor,
    settledMinor: row.settledMinor,
    lineCount: row.lineCount,
    unitCount: row.unitCount,
    problemCount: row.problemCount,
    notePreview: row.note?.slice(0, 120) ?? null,
    provisioningReady: row.provisioningReady,
    updatedAt: row.updatedAt,
  };
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    view: adminOrderViewValidator,
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("updated_desc"), v.literal("updated_asc"))),
    assigneeId: v.optional(v.id("users")),
    paymentState: v.optional(adminOrderPaymentStateValidator),
    designState: v.optional(adminOrderDesignStateValidator),
    fulfillmentState: v.optional(adminOrderFulfillmentStateValidator),
    problemsOnly: v.optional(v.boolean()),
  },
  returns: paginationResultValidator(listItemValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.paginationOpts.numItems > MAX_PAGE) throw new ConvexError("admin_order_page_limit");
    const search = args.search ? normalizeAdminSearchText(args.search) : "";
    const sortDirection = args.sort === "updated_asc" ? "asc" : "desc";
    let result;
    if (search) {
      result = await ctx.db
        .query("orderOperations")
        .withSearchIndex("search_orders", (q) => {
          let indexed = q.search("searchText", search).eq("view", args.view);
          if (args.assigneeId) indexed = indexed.eq("assigneeId", args.assigneeId);
          if (args.paymentState) indexed = indexed.eq("paymentState", args.paymentState);
          if (args.designState) indexed = indexed.eq("designState", args.designState);
          if (args.fulfillmentState) indexed = indexed.eq("fulfillmentState", args.fulfillmentState);
          return indexed;
        })
        .filter((q) => args.problemsOnly ? q.gt(q.field("problemCount"), 0) : q.eq(q.field("view"), args.view))
        .paginate(args.paginationOpts);
    } else if (args.assigneeId) {
      result = await ctx.db
        .query("orderOperations")
        .withIndex("by_assigneeId_and_view_and_updatedAt", (q) =>
          q.eq("assigneeId", args.assigneeId!).eq("view", args.view),
        )
        .order(sortDirection)
        .filter(listFilter(args))
        .paginate(args.paginationOpts);
    } else if (args.paymentState) {
      result = await ctx.db
        .query("orderOperations")
        .withIndex("by_view_and_paymentState_and_updatedAt", (q) =>
          q.eq("view", args.view).eq("paymentState", args.paymentState!),
        )
        .order(sortDirection)
        .filter(listFilter(args))
        .paginate(args.paginationOpts);
    } else if (args.designState) {
      result = await ctx.db
        .query("orderOperations")
        .withIndex("by_view_and_designState_and_updatedAt", (q) =>
          q.eq("view", args.view).eq("designState", args.designState!),
        )
        .order(sortDirection)
        .filter(listFilter(args))
        .paginate(args.paginationOpts);
    } else if (args.fulfillmentState) {
      result = await ctx.db
        .query("orderOperations")
        .withIndex("by_view_and_fulfillmentState_and_updatedAt", (q) =>
          q.eq("view", args.view).eq("fulfillmentState", args.fulfillmentState!),
        )
        .order(sortDirection)
        .filter(listFilter(args))
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("orderOperations")
        .withIndex("by_view_and_updatedAt", (q) => q.eq("view", args.view))
        .order(sortDirection)
        .filter(listFilter(args))
        .paginate(args.paginationOpts);
    }
    return { ...result, page: result.page.map(listItem) };
  },
});

export const getDetail = query({
  args: { operationId: v.id("orderOperations") },
  returns: v.union(v.object({
    operation: schema.doc("orderOperations"),
    lines: v.array(schema.doc("orderLines")),
    approvals: v.array(schema.doc("orderDesignApprovals")),
    provisioningRequests: v.array(schema.doc("orderProvisioningRequests")),
    printJobs: v.array(schema.doc("printJobs")),
    printJobLines: v.array(schema.doc("printJobLines")),
    printerReceipts: v.array(schema.doc("printerReceipts")),
    qualityChecks: v.array(schema.doc("qualityChecks")),
    activationSignals: v.array(schema.doc("orderActivationSignals")),
    deliveries: v.array(schema.doc("deliveries")),
    deliveryLines: v.array(schema.doc("deliveryLines")),
    tasks: v.array(schema.doc("clientTasks")),
  }), v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const operation = await ctx.db.get(args.operationId);
    if (!operation) return null;
    const bounded = async <T>(promise: Promise<T[]>, code: string) => {
      const rows = await promise;
      if (rows.length > ADMIN_ORDER_BATCH) throw new ConvexError(code);
      return rows;
    };
    const [lines, approvals, provisioningRequests, printJobs, printJobLines, printerReceipts, qualityChecks, activationSignals, deliveries, deliveryLines] = await Promise.all([
      bounded(ctx.db.query("orderLines").withIndex("by_operationId", (q) => q.eq("operationId", operation._id)).take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_lines"),
      bounded(ctx.db.query("orderDesignApprovals").withIndex("by_operationId_and_approvedAt", (q) => q.eq("operationId", operation._id)).take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_approvals"),
      bounded(ctx.db.query("orderProvisioningRequests").withIndex("by_operationId_and_createdAt", (q) => q.eq("operationId", operation._id)).take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_requests"),
      bounded(ctx.db.query("printJobs").withIndex("by_operationId_and_createdAt", (q) => q.eq("operationId", operation._id)).order("desc").take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_print_jobs"),
      bounded(ctx.db.query("printJobLines").withIndex("by_operationId", (q) => q.eq("operationId", operation._id)).take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_print_lines"),
      bounded(ctx.db.query("printerReceipts").withIndex("by_operationId_and_receivedAt", (q) => q.eq("operationId", operation._id)).take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_receipts"),
      bounded(ctx.db.query("qualityChecks").withIndex("by_operationId_and_checkedAt", (q) => q.eq("operationId", operation._id)).order("desc").take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_quality_checks"),
      bounded(ctx.db.query("orderActivationSignals").withIndex("by_operationId_and_createdAt", (q) => q.eq("operationId", operation._id)).take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_activation_signals"),
      bounded(ctx.db.query("deliveries").withIndex("by_operationId_and_createdAt", (q) => q.eq("operationId", operation._id)).order("desc").take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_deliveries"),
      bounded(ctx.db.query("deliveryLines").withIndex("by_operationId", (q) => q.eq("operationId", operation._id)).take(ADMIN_ORDER_BATCH + 1), "admin_order_too_many_delivery_lines"),
    ]);
    const taskPages = await Promise.all(
      (["active", "closed"] as const).map((view) =>
        ctx.db
          .query("clientTasks")
          .withIndex("by_orderOperationId_and_view_and_updatedAt", (q) =>
            q.eq("orderOperationId", operation._id).eq("view", view),
          )
          .order("desc")
          .take(ADMIN_ORDER_BATCH + 1),
      ),
    );
    if (taskPages.some((page) => page.length > ADMIN_ORDER_BATCH)) {
      throw new ConvexError("admin_order_too_many_tasks");
    }
    const tasks = taskPages.flat().sort((left, right) => right.updatedAt - left.updatedAt);
    return { operation, lines, approvals, provisioningRequests, printJobs, printJobLines, printerReceipts, qualityChecks, activationSignals, deliveries, deliveryLines, tasks };
  },
});

export const getOperationIdForOrder = query({
  args: { orderId: v.string() },
  returns: v.union(v.id("orderOperations"), v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const orderId = ctx.db.normalizeId("orders", args.orderId);
    if (!orderId) return null;
    const operation = await ctx.db.query("orderOperations").withIndex("by_orderId", (q) => q.eq("orderId", orderId)).unique();
    return operation?._id ?? null;
  },
});

export const listTimeline = query({
  args: { operationId: v.id("orderOperations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("orderEvents")),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.paginationOpts.numItems > MAX_PAGE) throw new ConvexError("admin_order_page_limit");
    await getOperation(ctx, args.operationId);
    return ctx.db
      .query("orderEvents")
      .withIndex("by_operationId_and_createdAt", (q) => q.eq("operationId", args.operationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const assign = mutation({
  args: {
    operationId: v.id("orderOperations"),
    assigneeId: v.id("users"),
    priority: adminOrderPriorityValidator,
    commandId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const operation = await getOperation(ctx, args.operationId);
    const eventCommand = command(args.commandId);
    const existing = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (existing) return null;
    const assignee = await requireAdminUser(ctx, args.assigneeId);
    const now = Date.now();
    await ctx.db.patch(operation._id, {
      assigneeId: assignee._id,
      assigneeName: adminDisplayName(assignee),
      priority: args.priority,
      priorityRank: PRIORITY_RANK[args.priority],
      updatedAt: now,
    });
    await appendOrderEvent(ctx, { operation, kind: "assigned", axis: "operation", commandId: eventCommand, actorUserId: actor._id, fromValue: String(operation.assigneeId), toValue: String(assignee._id), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_assigned", detail: { orderId: operation.orderId, assigneeId: assignee._id, priority: args.priority }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return null;
  },
});

export const setDesignState = mutation({
  args: {
    orderLineId: v.id("orderLines"),
    state: adminOrderDesignStateValidator,
    designSnapshot: v.optional(adminOrderProductConfigValidator),
    commandId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const line = await getOrderLine(ctx, args.orderLineId);
    const operation = await getOperation(ctx, line.operationId);
    const eventCommand = command(args.commandId);
    const existing = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (existing) return null;
    if (operation.fulfillmentState === "cancelled") throw new ConvexError("admin_order_cancelled");
    const designSnapshot = args.designSnapshot === undefined
      ? undefined
      : decodePhysicalSelection(args.designSnapshot);
    if (
      designSnapshot &&
      (designSnapshot.productId !== line.productType || designSnapshot.quantity !== line.quantity)
    ) {
      throw new ConvexError("admin_order_design_snapshot_line_mismatch");
    }
    if (line.designKind === "template") {
      throw new ConvexError("admin_order_template_design_is_ready");
    }
    if (args.state === "template_selected") {
      throw new ConvexError("admin_order_custom_design_invalid_state");
    }
    if (args.state === "approved") throw new ConvexError("admin_order_use_approve_design");
    if (designSnapshot && designSnapshot.design.kind !== "custom") {
      throw new ConvexError("admin_order_custom_design_snapshot_required");
    }
    const revisingApproved = line.designState === "approved";
    const validTransition =
      (line.designState === "in_progress" && args.state === "awaiting_approval") ||
      (line.designState === "in_progress" && args.state === "in_progress" && designSnapshot !== undefined) ||
      (line.designState === "awaiting_approval" && args.state === "in_progress" && designSnapshot !== undefined) ||
      (line.designState === "approved" && args.state === "in_progress" && designSnapshot !== undefined);
    if (!validTransition) throw new ConvexError("admin_order_design_transition_invalid");
    const now = Date.now();
    await ctx.db.patch(line._id, {
      designState: args.state,
      designRevision: revisingApproved ? line.designRevision + 1 : line.designRevision,
      ...(revisingApproved ? { approvedSnapshotId: undefined } : {}),
      ...(designSnapshot !== undefined ? { configSnapshot: designSnapshot } : {}),
      updatedAt: now,
    });
    await appendOrderEvent(ctx, { operation, kind: "design_changed", axis: "design", commandId: eventCommand, actorUserId: actor._id, fromValue: line.designState, toValue: args.state, now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, businessId: line.businessId, action: "admin_order_design_changed", detail: { orderId: operation.orderId, orderLineId: line._id, from: line.designState, to: args.state, revision: revisingApproved ? line.designRevision + 1 : line.designRevision }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return null;
  },
});

export const approveDesign = mutation({
  args: { orderLineId: v.id("orderLines"), snapshot: adminOrderProductConfigValidator, commandId: v.string() },
  returns: v.id("orderDesignApprovals"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const line = await getOrderLine(ctx, args.orderLineId);
    const operation = await getOperation(ctx, line.operationId);
    const eventCommand = command(args.commandId);
    const previousEvent = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previousEvent?.relatedRecordId) {
      const previousId = ctx.db.normalizeId("orderDesignApprovals", previousEvent.relatedRecordId);
      if (previousId) return previousId;
    }
    if (operation.fulfillmentState === "cancelled") throw new ConvexError("admin_order_cancelled");
    if (line.designKind !== "custom" || line.designState !== "awaiting_approval") {
      throw new ConvexError("admin_order_design_not_awaiting_approval");
    }
    const snapshot = decodePhysicalSelection(args.snapshot);
    if (
      snapshot.productId !== line.productType ||
      snapshot.quantity !== line.quantity ||
      snapshot.design.kind !== "custom"
    ) {
      throw new ConvexError("admin_order_design_snapshot_line_mismatch");
    }
    const sameRevision = await ctx.db.query("orderDesignApprovals").withIndex("by_orderLineId_and_revision", (q) => q.eq("orderLineId", line._id).eq("revision", line.designRevision)).unique();
    if (sameRevision) throw new ConvexError("admin_order_design_revision_already_approved");
    const now = Date.now();
    const approvalId = await ctx.db.insert("orderDesignApprovals", { operationId: operation._id, orderLineId: line._id, revision: line.designRevision, snapshot, approvedByUserId: actor._id, approvedAt: now });
    await ctx.db.patch(line._id, { designState: "approved", configSnapshot: snapshot, approvedSnapshotId: approvalId, updatedAt: now });
    await appendOrderEvent(ctx, { operation, kind: "design_approved", axis: "design", commandId: eventCommand, actorUserId: actor._id, fromValue: line.designState, toValue: "approved", relatedRecordId: String(approvalId), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, businessId: line.businessId, action: "admin_order_design_approved", detail: { orderId: operation.orderId, orderLineId: line._id, revision: line.designRevision, approvalId }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return approvalId;
  },
});

export const recordPayment = mutation({
  args: {
    operationId: v.id("orderOperations"),
    amountMinor: v.number(),
    method: paymentMethod,
    paidAt: v.number(),
    reference: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerEventId: v.optional(v.string()),
    key: v.string(),
  },
  returns: v.id("payments"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const operation = await getOperation(ctx, args.operationId);
    const key = command(args.key);
    const provider = args.provider === undefined ? undefined : requiredText(args.provider, "admin_order_payment_provider_invalid", 100);
    const providerEventId = args.providerEventId === undefined ? undefined : requiredText(args.providerEventId, "admin_order_provider_event_invalid", 200);
    const reference = args.reference === undefined ? undefined : requiredText(args.reference, "admin_order_payment_reference_invalid", 240);
    const fingerprint = JSON.stringify({ operationId: operation._id, amountMinor: args.amountMinor, method: args.method, paidAt: args.paidAt, reference, provider, providerEventId });
    const existing = await ctx.db.query("orderPaymentAllocations").withIndex("by_operationId_and_key", (q) => q.eq("operationId", operation._id).eq("key", key)).unique();
    if (existing) {
      const payment = await ctx.db.get(existing.paymentId);
      if (payment?.ledger?.fingerprint !== fingerprint) throw new ConvexError("admin_order_idempotency_conflict");
      return existing.paymentId;
    }
    if (operation.fulfillmentState === "cancelled") throw new ConvexError("admin_order_cancelled");
    const amountMinor = minor(args.amountMinor);
    if (amountMinor === 0 || !Number.isSafeInteger(args.paidAt) || args.paidAt > Date.now()) throw new ConvexError("admin_order_payment_invalid");
    if (providerEventId && !provider) throw new ConvexError("admin_order_payment_provider_required");
    if (providerEventId) {
      const duplicateProviderEvent = await ctx.db
        .query("payments")
        .withIndex("by_ledger_provider_and_ledger_providerEventId", (q) =>
          q.eq("ledger.provider", provider).eq("ledger.providerEventId", providerEventId),
        )
        .unique();
      if (duplicateProviderEvent) throw new ConvexError("admin_order_duplicate_provider_event");
    }
    if (operation.settledMinor + amountMinor > operation.requiredMinor) throw new ConvexError("admin_order_payment_overallocation");
    const now = Date.now();
    const ledger = {
      amount: { amountMinor, currency: "RSD" },
      unallocatedMinor: 0,
      method: args.method,
      ...(provider ? { provider } : {}),
      ...(providerEventId ? { providerEventId } : {}),
      recordedBy: { kind: "admin" as const, userId: actor._id },
      key: `order:${operation.orderId}:${key}`,
      fingerprint,
    };
    const paymentId = await ctx.db.insert("payments", {
      accountId: operation.accountId,
      orderId: operation.orderId,
      amountRsd: amountMinor / 100,
      method: provider ? "provider" : "manual",
      ...(reference ? { reference } : {}),
      paidAt: args.paidAt,
      recordedByUserId: actor._id,
      ledger,
      createdAt: now,
    });
    await ctx.db.insert("paymentStates", { accountId: operation.accountId, paymentId, paidAt: args.paidAt, state: "settled" });
    await ctx.db.insert("orderPaymentAllocations", { operationId: operation._id, orderId: operation.orderId, accountId: operation.accountId, paymentId, amountMinor, currency: "RSD", state: "settled", key, recordedByUserId: actor._id, createdAt: now });
    await appendOrderEvent(ctx, { operation, kind: "payment_recorded", axis: "payment", commandId: key, actorUserId: actor._id, fromValue: operation.paymentState, toValue: operation.settledMinor + amountMinor >= operation.requiredMinor ? "paid" : "awaiting_payment", relatedRecordId: String(paymentId), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_payment_recorded", detail: { orderId: operation.orderId, paymentId, amountMinor, method: args.method }, now });
    const refreshed = await refreshOperation(ctx, operation._id, actor._id, now);
    if (refreshed.paymentState === "paid") await ctx.db.patch(operation.orderId, { status: "paid", updatedAt: now });
    return paymentId;
  },
});

export const recordCombinedPayment = mutation({
  args: {
    accountId: v.id("accounts"),
    amountMinor: v.number(),
    allocations: v.array(v.object({ operationId: v.id("orderOperations"), amountMinor: v.number() })),
    method: paymentMethod,
    paidAt: v.number(),
    reference: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerEventId: v.optional(v.string()),
    key: v.string(),
  },
  returns: v.id("payments"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const key = command(args.key);
    const provider = args.provider === undefined ? undefined : requiredText(args.provider, "admin_order_payment_provider_invalid", 100);
    const providerEventId = args.providerEventId === undefined ? undefined : requiredText(args.providerEventId, "admin_order_provider_event_invalid", 200);
    const reference = args.reference === undefined ? undefined : requiredText(args.reference, "admin_order_payment_reference_invalid", 240);
    if (args.allocations.length < 2 || args.allocations.length > ADMIN_ORDER_BATCH) {
      throw new ConvexError("admin_order_combined_allocations_invalid");
    }
    if (new Set(args.allocations.map((allocation) => String(allocation.operationId))).size !== args.allocations.length) {
      throw new ConvexError("admin_order_combined_allocation_duplicate");
    }
    const amountMinor = minor(args.amountMinor);
    if (amountMinor === 0 || !Number.isSafeInteger(args.paidAt) || args.paidAt > Date.now()) {
      throw new ConvexError("admin_order_payment_invalid");
    }
    if (providerEventId && !provider) throw new ConvexError("admin_order_payment_provider_required");
    const allocations = args.allocations.map((allocation) => ({
      operationId: allocation.operationId,
      amountMinor: minor(allocation.amountMinor),
    }));
    if (allocations.some((allocation) => allocation.amountMinor === 0)) {
      throw new ConvexError("admin_order_combined_allocations_invalid");
    }
    const allocatedMinor = allocations.reduce((sum, allocation) => {
      const next = sum + allocation.amountMinor;
      if (!Number.isSafeInteger(next)) throw new ConvexError("admin_order_money_invalid");
      return next;
    }, 0);
    if (allocatedMinor !== amountMinor) {
      throw new ConvexError("admin_order_combined_allocation_mismatch");
    }
    const sortedAllocations = [...allocations].sort((left, right) => String(left.operationId).localeCompare(String(right.operationId)));
    const fingerprint = JSON.stringify({ accountId: args.accountId, amountMinor, allocations: sortedAllocations, method: args.method, paidAt: args.paidAt, reference, provider, providerEventId });
    const ledgerKey = `order-combined:${args.accountId}:${key}`;
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_accountId_and_ledger_key", (q) => q.eq("accountId", args.accountId).eq("ledger.key", ledgerKey))
      .unique();
    if (existing) {
      if (existing.ledger?.fingerprint !== fingerprint) throw new ConvexError("admin_order_idempotency_conflict");
      return existing._id;
    }
    if (providerEventId) {
      const duplicateProviderEvent = await ctx.db
        .query("payments")
        .withIndex("by_ledger_provider_and_ledger_providerEventId", (q) =>
          q.eq("ledger.provider", provider).eq("ledger.providerEventId", providerEventId),
        )
        .unique();
      if (duplicateProviderEvent) throw new ConvexError("admin_order_duplicate_provider_event");
    }
    const operations: Doc<"orderOperations">[] = [];
    for (const allocation of allocations) {
      const operation = await getOperation(ctx, allocation.operationId);
      if (operation.accountId !== args.accountId || operation.fulfillmentState === "cancelled") {
        throw new ConvexError("admin_order_combined_allocation_cross_account");
      }
      if (operation.settledMinor + allocation.amountMinor > operation.requiredMinor) {
        throw new ConvexError("admin_order_payment_overallocation");
      }
      operations.push(operation);
    }
    const now = Date.now();
    const ledger = {
      amount: { amountMinor, currency: "RSD" },
      unallocatedMinor: 0,
      method: args.method,
      ...(provider ? { provider } : {}),
      ...(providerEventId ? { providerEventId } : {}),
      recordedBy: { kind: "admin" as const, userId: actor._id },
      key: ledgerKey,
      fingerprint,
    };
    const paymentId = await ctx.db.insert("payments", {
      accountId: args.accountId,
      amountRsd: amountMinor / 100,
      method: provider ? "provider" : "manual",
      ...(reference ? { reference } : {}),
      paidAt: args.paidAt,
      recordedByUserId: actor._id,
      ledger,
      createdAt: now,
    });
    await ctx.db.insert("paymentStates", { accountId: args.accountId, paymentId, paidAt: args.paidAt, state: "settled" });
    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index];
      const operation = operations[index];
      const allocationKey = `combined:${key}:${operation._id}`;
      await ctx.db.insert("orderPaymentAllocations", {
        operationId: operation._id,
        orderId: operation.orderId,
        accountId: operation.accountId,
        paymentId,
        amountMinor: allocation.amountMinor,
        currency: "RSD",
        state: "settled",
        key: allocationKey,
        recordedByUserId: actor._id,
        createdAt: now,
      });
      await appendOrderEvent(ctx, {
        operation,
        kind: "payment_recorded",
        axis: "payment",
        commandId: allocationKey,
        actorUserId: actor._id,
        fromValue: operation.paymentState,
        toValue: operation.settledMinor + allocation.amountMinor >= operation.requiredMinor ? "paid" : "awaiting_payment",
        relatedRecordId: String(paymentId),
        now,
      });
      await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_payment_recorded", detail: { orderId: operation.orderId, paymentId, amountMinor: allocation.amountMinor, method: args.method, combined: true }, now });
      const refreshed = await refreshOperation(ctx, operation._id, actor._id, now);
      if (refreshed.paymentState === "paid") await ctx.db.patch(operation.orderId, { status: "paid", updatedAt: now });
    }
    return paymentId;
  },
});

export const reversePayment = mutation({
  args: { paymentId: v.id("payments"), reason: v.string(), key: v.string() },
  returns: v.id("paymentAdjustments"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const allocations = await ctx.db
      .query("orderPaymentAllocations")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .take(ADMIN_ORDER_BATCH + 1);
    if (allocations.length === 0) throw new ConvexError("admin_order_payment_not_found");
    if (allocations.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_payment_allocation_limit");
    const key = command(args.key);
    const reason = requiredText(args.reason, "admin_order_reversal_reason_required");
    const payment = await ctx.db.get(args.paymentId);
    if (!payment?.ledger) throw new ConvexError("admin_order_payment_ledger_missing");
    if (allocations.some((allocation) => allocation.accountId !== payment.accountId)) {
      throw new ConvexError("admin_order_payment_allocation_cross_account");
    }
    const fingerprint = JSON.stringify({ paymentId: payment._id, reason });
    const previous = await ctx.db.query("paymentAdjustments").withIndex("by_accountId_and_key", (q) => q.eq("accountId", payment.accountId).eq("key", `order:${key}`)).unique();
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ConvexError("admin_order_idempotency_conflict");
      return previous._id;
    }
    if (allocations.some((allocation) => allocation.state === "reversed")) {
      throw new ConvexError("admin_order_payment_already_reversed");
    }
    const operations: Doc<"orderOperations">[] = [];
    for (const allocation of allocations) operations.push(await getOperation(ctx, allocation.operationId));
    const now = Date.now();
    const adjustmentId = await ctx.db.insert("paymentAdjustments", {
      accountId: payment.accountId,
      paymentId: payment._id,
      kind: "reversal",
      amount: payment.ledger.amount,
      change: { actor: { kind: "admin", userId: actor._id }, at: now, reason },
      key: `order:${key}`,
      fingerprint,
    });
    for (const allocation of allocations) await ctx.db.patch(allocation._id, { state: "reversed", reversedAt: now });
    const state = await ctx.db.query("paymentStates").withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id)).unique();
    if (!state) throw new ConvexError("admin_order_payment_state_missing");
    await ctx.db.patch(state._id, { state: "reversed" });
    await ctx.db.patch(payment._id, { voidedAt: now, voidedByUserId: actor._id });
    for (const operation of operations) {
      await appendOrderEvent(ctx, { operation, kind: "payment_reversed", axis: "payment", commandId: `reversal:${key}:${operation._id}`, actorUserId: actor._id, fromValue: operation.paymentState, toValue: "reversed", reason, relatedRecordId: String(adjustmentId), now });
      await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_payment_reversed", detail: { orderId: operation.orderId, paymentId: payment._id, adjustmentId, reason }, now });
      await refreshOperation(ctx, operation._id, actor._id, now);
    }
    return adjustmentId;
  },
});

export const listPrinters = query({
  args: {},
  returns: v.array(schema.doc("printers")),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db
      .query("printers")
      .withIndex("by_active_and_name", (q) => q.eq("active", true))
      .take(10);
  },
});

export const savePrinter = mutation({
  args: { name: v.string(), contact: v.optional(v.string()) },
  returns: v.id("printers"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const name = requiredText(args.name, "admin_order_printer_name_required", 160);
    const active = await ctx.db.query("printers").withIndex("by_active_and_name", (q) => q.eq("active", true)).take(11);
    if (active.length > 10) throw new ConvexError("admin_order_printer_limit");
    const same = active.find((printer) => printer.name.toLocaleLowerCase("sr-Latn") === name.toLocaleLowerCase("sr-Latn"));
    const now = Date.now();
    if (same) {
      await ctx.db.patch(same._id, { ...(args.contact ? { contact: args.contact.trim() } : {}), updatedAt: now });
      return same._id;
    }
    if (active.length > 0) throw new ConvexError("admin_order_v1_single_printer");
    return ctx.db.insert("printers", {
      name,
      ...(args.contact ? { contact: requiredText(args.contact, "admin_order_printer_contact_invalid", 240) } : {}),
      active: true,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** ADMIN-12 seam: records references returned by real SMF creation; it creates none. */
export const recordSmfAssignments = internalMutation({
  args: {
    orderLineId: v.id("orderLines"),
    assignments: v.array(v.object({ reference: v.string(), sourceRecordId: v.string() })),
    actorUserId: v.id("users"),
    commandId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireAdminUser(ctx, args.actorUserId);
    const line = await getOrderLine(ctx, args.orderLineId);
    const operation = await getOperation(ctx, line.operationId);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previous) return null;
    if (!operation.provisioningReady) throw new ConvexError("admin_order_conditions_not_met");
    if (
      args.assignments.length === 0 ||
      args.assignments.length > ADMIN_ORDER_BATCH ||
      args.assignments.length > line.quantity - line.smfAssignedCount
    ) {
      throw new ConvexError("admin_order_smf_quantity_invalid");
    }
    const references = args.assignments.map((assignment) => requiredText(assignment.reference, "admin_order_smf_reference_required", 120));
    const sourceIds = args.assignments.map((assignment) => requiredText(assignment.sourceRecordId, "admin_order_smf_source_required", 160));
    if (new Set(references).size !== references.length || new Set(sourceIds).size !== sourceIds.length) {
      throw new ConvexError("admin_order_smf_reference_duplicate");
    }
    for (let index = 0; index < args.assignments.length; index += 1) {
      const product = await productForReference(ctx, references[index], line._id);
      if (product._id !== sourceIds[index]) throw new ConvexError("admin_order_real_smf_required");
      const duplicateRef = await ctx.db.query("orderSmfReferences").withIndex("by_reference", (q) => q.eq("reference", references[index])).unique();
      const duplicateSource = await ctx.db.query("orderSmfReferences").withIndex("by_sourceRecordId", (q) => q.eq("sourceRecordId", sourceIds[index])).unique();
      if (duplicateRef || duplicateSource) throw new ConvexError("admin_order_smf_reference_duplicate");
    }
    const now = Date.now();
    for (let index = 0; index < args.assignments.length; index += 1) {
      await ctx.db.insert("orderSmfReferences", { operationId: operation._id, orderLineId: line._id, reference: references[index], sourceRecordId: sourceIds[index], assignedAt: now });
    }
    await ctx.db.patch(line._id, { smfAssignedCount: line.smfAssignedCount + args.assignments.length, updatedAt: now });
    await appendOrderEvent(ctx, { operation, kind: "smf_assigned", axis: "fulfillment", commandId: eventCommand, actorUserId: args.actorUserId, fromValue: String(line.smfAssignedCount), toValue: String(line.smfAssignedCount + args.assignments.length), now });
    await writeAdminAudit(ctx, { actorUserId: args.actorUserId, accountId: operation.accountId, businessId: line.businessId, action: "admin_order_smf_references_recorded", detail: { orderId: operation.orderId, orderLineId: line._id, count: args.assignments.length }, now });
    await refreshOperation(ctx, operation._id, args.actorUserId, now);
    return null;
  },
});

export const createPrintJob = mutation({
  args: {
    operationId: v.id("orderOperations"),
    printerId: v.id("printers"),
    lines: v.array(v.object({ orderLineId: v.id("orderLines"), quantity: v.number() })),
    remakeOfQualityCheckId: v.optional(v.id("qualityChecks")),
    note: v.optional(v.string()),
    commandId: v.string(),
  },
  returns: v.id("printJobs"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const operation = await getOperation(ctx, args.operationId);
    const eventCommand = command(args.commandId);
    const existing = await ctx.db.query("printJobs").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (existing) return existing._id;
    const printer = await ctx.db.get(args.printerId);
    if (!printer?.active) throw new ConvexError("admin_order_printer_not_found");
    if (args.lines.length === 0 || args.lines.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_print_lines_invalid");
    if (new Set(args.lines.map((line) => String(line.orderLineId))).size !== args.lines.length) throw new ConvexError("admin_order_print_line_duplicate");
    let remakeCheck: Doc<"qualityChecks"> | null = null;
    if (args.remakeOfQualityCheckId) {
      remakeCheck = await ctx.db.get(args.remakeOfQualityCheckId);
      if (!remakeCheck || remakeCheck.operationId !== operation._id || remakeCheck.result !== "problem" || !remakeCheck.remakeRequested) {
        throw new ConvexError("admin_order_remake_invalid");
      }
      const previousRemake = await ctx.db
        .query("printJobs")
        .withIndex("by_remakeOfQualityCheckId", (q) => q.eq("remakeOfQualityCheckId", remakeCheck!._id))
        .unique();
      if (previousRemake) throw new ConvexError("admin_order_remake_already_created");
    }
    if (operation.fulfillmentState === "cancelled") throw new ConvexError("admin_order_cancelled");
    if (!remakeCheck && operation.paymentState !== "paid") {
      throw new ConvexError("admin_order_conditions_not_met");
    }
    const remakeJobLines = remakeCheck
      ? await ctx.db
          .query("printJobLines")
          .withIndex("by_printJobId", (q) => q.eq("printJobId", remakeCheck!.printJobId))
          .take(ADMIN_ORDER_BATCH + 1)
      : [];
    if (remakeJobLines.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_too_many_print_lines");
    const prepared: {
      line: Doc<"orderLines">;
      count: number;
      refs: string[];
      reservations: Doc<"orderSmfReferences">[];
      printSnapshot: Doc<"orderLines">["configSnapshot"];
    }[] = [];
    let totalQuantity = 0;
    for (const requested of args.lines) {
      const line = await getOrderLine(ctx, requested.orderLineId);
      if (line.operationId !== operation._id) throw new ConvexError("admin_order_cross_order_line");
      const count = quantity(requested.quantity, line.quantity);
      totalQuantity += count;
      if (totalQuantity > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_print_quantity_invalid");
      if (remakeCheck) {
        if (remakeCheck.orderLineId !== line._id || count !== remakeCheck.quantity) throw new ConvexError("admin_order_remake_quantity_invalid");
        const sourceLine = remakeJobLines.find((row) => row.orderLineId === line._id);
        if (!sourceLine || sourceLine.smfReferences.length < count) throw new ConvexError("admin_order_real_smf_required");
        if (!remakeCheck.physicalProductIds || remakeCheck.physicalProductIds.length !== count) throw new ConvexError("access_legacy_qc_mapping_required");
        const refs: string[] = [];
        for (const id of remakeCheck.physicalProductIds) {
          const product = await ctx.db.get(id);
          if (!product || product.orderLineId !== line._id || !sourceLine.smfReferences.includes(product.smfCode)) throw new ConvexError("admin_order_real_smf_required");
          refs.push(product.smfCode);
        }
        prepared.push({ line, count, refs, reservations: [], printSnapshot: sourceLine.printSnapshot });
        continue;
      }
      let printSnapshot = line.configSnapshot;
      if (line.designKind === "custom") {
        if (line.designState !== "approved" || !line.approvedSnapshotId) {
          throw new ConvexError("admin_order_conditions_not_met");
        }
        const approval = await ctx.db.get(line.approvedSnapshotId);
        if (!approval || approval.orderLineId !== line._id || approval.revision !== line.designRevision) {
          throw new ConvexError("admin_order_design_snapshot_missing");
        }
        printSnapshot = approval.snapshot;
      } else if (line.designState !== "template_selected") {
        throw new ConvexError("admin_order_conditions_not_met");
      }
      const available = await ctx.db
        .query("orderSmfReferences")
        .withIndex("by_orderLineId_and_printJobId", (q) =>
          q.eq("orderLineId", line._id).eq("printJobId", undefined),
        )
        .take(count);
      if (available.length !== count) throw new ConvexError("admin_order_real_smf_required");
      prepared.push({ line, count, refs: available.map((row) => row.reference), reservations: available, printSnapshot });
    }
    const now = Date.now();
    const printJobId = await ctx.db.insert("printJobs", {
      operationId: operation._id,
      orderId: operation.orderId,
      printerId: printer._id,
      printerName: printer.name,
      state: "draft",
      destination: "scanme",
      assigneeId: operation.assigneeId,
      assigneeName: operation.assigneeName,
      ...(args.note ? { note: requiredText(args.note, "admin_order_print_note_invalid", 2_000) } : {}),
      commandId: eventCommand,
      ...(remakeCheck ? { remakeOfQualityCheckId: remakeCheck._id } : {}),
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    for (const row of prepared) {
      await ctx.db.insert("printJobLines", { printJobId, operationId: operation._id, orderLineId: row.line._id, quantity: row.count, smfReferences: row.refs, printSnapshot: row.printSnapshot, createdAt: now });
      for (const ref of row.refs) {
        const product = await productForReference(ctx, ref, row.line._id);
        if (accessFingerprint(product.designSnapshot) !== accessFingerprint(row.printSnapshot)) throw new ConvexError("access_immutable_print_snapshot_mismatch");
        await ctx.db.patch(product._id, { printJobId, updatedAt: now });
      }
      for (const reference of row.reservations) {
        await ctx.db.patch(reference._id, { printJobId });
      }
    }
    await appendOrderEvent(ctx, { operation, kind: "print_job_created", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, toValue: "draft", relatedRecordId: String(printJobId), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_print_job_created", detail: { orderId: operation.orderId, printJobId, destination: "scanme", lineCount: prepared.length, remakeOfQualityCheckId: remakeCheck?._id }, now });
    return printJobId;
  },
});

export const dispatchPrintJob = mutation({
  args: { printJobId: v.id("printJobs"), expectedAt: v.optional(v.number()), commandId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const job = await ctx.db.get(args.printJobId);
    if (!job) throw new ConvexError("admin_order_print_job_not_found");
    const operation = await getOperation(ctx, job.operationId);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previous) return null;
    if (operation.fulfillmentState === "cancelled") throw new ConvexError("admin_order_cancelled");
    if (job.state !== "draft" || job.destination !== "scanme") throw new ConvexError("admin_order_print_dispatch_invalid");
    if (args.expectedAt !== undefined && (!Number.isSafeInteger(args.expectedAt) || args.expectedAt <= Date.now())) throw new ConvexError("admin_order_printer_deadline_invalid");
    const lines = await ctx.db.query("printJobLines").withIndex("by_printJobId", (q) => q.eq("printJobId", job._id)).take(ADMIN_ORDER_BATCH + 1);
    if (lines.length === 0 || lines.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_print_lines_invalid");
    const now = Date.now();
    for (const jobLine of lines) {
      if (jobLine.smfReferences.length !== jobLine.quantity) throw new ConvexError("admin_order_real_smf_required");
      const line = await getOrderLine(ctx, jobLine.orderLineId);
      await ctx.db.patch(line._id, {
        sentToPrinterCount: job.remakeOfQualityCheckId
          ? line.sentToPrinterCount
          : line.sentToPrinterCount + jobLine.quantity,
        updatedAt: now,
      });
    }
    await ctx.db.patch(job._id, { state: "sent", sentAt: now, ...(args.expectedAt ? { expectedAt: args.expectedAt } : {}), updatedAt: now });
    await appendOrderEvent(ctx, { operation, kind: "sent_to_printer", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, fromValue: job.state, toValue: "sent", relatedRecordId: String(job._id), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_sent_to_printer", detail: { orderId: operation.orderId, printJobId: job._id, destination: "scanme", expectedAt: args.expectedAt }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return null;
  },
});

export const receivePrintJob = mutation({
  args: { printJobId: v.id("printJobs"), orderLineId: v.id("orderLines"), quantity: v.number(), commandId: v.string() },
  returns: v.id("printerReceipts"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("printerReceipts").withIndex("by_commandId", (q) => q.eq("commandId", eventCommand)).unique();
    if (previous) return previous._id;
    const job = await ctx.db.get(args.printJobId);
    if (!job || (job.state !== "sent" && job.state !== "partially_received")) throw new ConvexError("admin_order_print_receipt_invalid");
    const operation = await getOperation(ctx, job.operationId);
    const line = await getOrderLine(ctx, args.orderLineId);
    if (line.operationId !== operation._id) throw new ConvexError("admin_order_cross_order_line");
    const jobLines = await ctx.db.query("printJobLines").withIndex("by_printJobId", (q) => q.eq("printJobId", job._id)).take(ADMIN_ORDER_BATCH + 1);
    if (jobLines.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_too_many_print_lines");
    const jobLine = jobLines.find((row) => row.orderLineId === line._id);
    if (!jobLine) throw new ConvexError("admin_order_print_line_not_found");
    const receipts = await ctx.db.query("printerReceipts").withIndex("by_printJobId_and_createdAt", (q) => q.eq("printJobId", job._id)).take(ADMIN_ORDER_BATCH + 1);
    if (receipts.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_too_many_receipts");
    const receivedForLine = receipts.filter((row) => row.orderLineId === line._id).reduce((sum, row) => sum + row.quantity, 0);
    const count = quantity(args.quantity, jobLine.quantity);
    if (receivedForLine + count > jobLine.quantity) throw new ConvexError("admin_order_receipt_over_quantity");
    const now = Date.now();
    const receiptId = await ctx.db.insert("printerReceipts", { printJobId: job._id, operationId: operation._id, orderLineId: line._id, quantity: count, receivedByUserId: actor._id, receivedAt: now, commandId: eventCommand });
    await ctx.db.patch(line._id, {
      receivedCount: job.remakeOfQualityCheckId ? line.receivedCount : line.receivedCount + count,
      qcPendingCount: line.qcPendingCount + count,
      updatedAt: now,
    });
    const totalJobQuantity = jobLines.reduce((sum, row) => sum + row.quantity, 0);
    const totalReceived = receipts.reduce((sum, row) => sum + row.quantity, 0) + count;
    await ctx.db.patch(job._id, { state: totalReceived === totalJobQuantity ? "received" : "partially_received", ...(totalReceived === totalJobQuantity ? { receivedAt: now } : {}), updatedAt: now });
    if (totalReceived === totalJobQuantity) {
      await syncPrinterLateAction(ctx, operation, job, false, now);
    }
    await appendOrderEvent(ctx, { operation, kind: "printer_receipt_recorded", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, fromValue: job.state, toValue: totalReceived === totalJobQuantity ? "received" : "partially_received", relatedRecordId: String(receiptId), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, businessId: line.businessId, action: "admin_order_printer_receipt_recorded", detail: { orderId: operation.orderId, printJobId: job._id, orderLineId: line._id, quantity: count }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return receiptId;
  },
});

export const recordQualityCheck = mutation({
  args: {
    verifiedChannelKinds: v.optional(v.array(accessKind)),
    physicalProductIds: v.optional(v.array(v.id("physicalProducts"))),
    printJobId: v.id("printJobs"),
    orderLineId: v.id("orderLines"),
    result: v.union(v.literal("pass"), v.literal("problem")),
    quantity: v.number(),
    reason: v.optional(v.string()),
    remakeRequested: v.boolean(),
    commandId: v.string(),
  },
  returns: v.id("qualityChecks"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("qualityChecks").withIndex("by_commandId", (q) => q.eq("commandId", eventCommand)).unique();
    if (previous) {
      if (JSON.stringify(previous.verifiedChannelKinds) !== JSON.stringify(args.verifiedChannelKinds)) throw new ConvexError("access_idempotency_payload_mismatch");
      if (previous.printJobId !== args.printJobId || previous.orderLineId !== args.orderLineId || previous.result !== args.result || previous.quantity !== args.quantity || previous.reason !== args.reason?.trim() || previous.remakeRequested !== args.remakeRequested || (args.physicalProductIds && JSON.stringify(previous.physicalProductIds) !== JSON.stringify(args.physicalProductIds))) throw new ConvexError("access_idempotency_payload_mismatch");
      return previous._id;
    }
    const job = await ctx.db.get(args.printJobId);
    if (!job || (job.state !== "received" && job.state !== "partially_received")) throw new ConvexError("admin_order_qc_before_receipt");
    const operation = await getOperation(ctx, job.operationId);
    const line = await getOrderLine(ctx, args.orderLineId);
    if (line.operationId !== operation._id) throw new ConvexError("admin_order_cross_order_line");
    const count = quantity(args.quantity, line.quantity);
    const [receipts, checks] = await Promise.all([
      ctx.db
        .query("printerReceipts")
        .withIndex("by_printJobId_and_createdAt", (q) => q.eq("printJobId", job._id))
        .take(ADMIN_ORDER_BATCH + 1),
      ctx.db
        .query("qualityChecks")
        .withIndex("by_printJobId_and_checkedAt", (q) => q.eq("printJobId", job._id))
        .take(ADMIN_ORDER_BATCH + 1),
    ]);
    if (receipts.length > ADMIN_ORDER_BATCH || checks.length > ADMIN_ORDER_BATCH) {
      throw new ConvexError("admin_order_qc_history_limit");
    }
    const receivedForLine = receipts
      .filter((receipt) => receipt.orderLineId === line._id)
      .reduce((sum, receipt) => sum + receipt.quantity, 0);
    const checkedForLine = checks
      .filter((check) => check.orderLineId === line._id)
      .reduce((sum, check) => sum + check.quantity, 0);
    const available = receivedForLine - checkedForLine;
    if (count > line.qcPendingCount) throw new ConvexError("admin_order_qc_quantity_unavailable");
    if (count > available) throw new ConvexError("admin_order_qc_quantity_unavailable");
    const reason = args.reason?.trim();
    if (args.result === "problem" && !reason) throw new ConvexError("admin_order_qc_reason_required");
    if (args.result === "pass" && args.remakeRequested) throw new ConvexError("admin_order_qc_remake_invalid");
    const physicalProductIds = await selectQcProducts(ctx, job, line, count, checks, args.physicalProductIds);
    const now = Date.now();
    const qualityCheckId = await ctx.db.insert("qualityChecks", {
      verifiedChannelKinds: args.verifiedChannelKinds,
      physicalProductIds,
      operationId: operation._id,
      orderLineId: line._id,
      printJobId: job._id,
      result: args.result,
      quantity: count,
      ...(reason ? { reason: requiredText(reason, "admin_order_qc_reason_invalid") } : {}),
      remakeRequested: args.result === "problem" && args.remakeRequested,
      checkedByUserId: actor._id,
      checkedAt: now,
      commandId: eventCommand,
    });
    if (args.result === "pass") {
      const resolvedProblems = job.remakeOfQualityCheckId ? Math.min(count, line.qcProblemCount) : 0;
      await ctx.db.patch(line._id, {
        qcPendingCount: line.qcPendingCount - count,
        qcPassedCount: line.qcPassedCount + count,
        qcProblemCount: line.qcProblemCount - resolvedProblems,
        updatedAt: now,
      });
      await ctx.db.insert("orderActivationSignals", {
        operationId: operation._id,
        orderLineId: line._id,
        qualityCheckId,
        state: "pending_admin_12",
        createdAt: now,
      });
    } else {
      await ctx.db.patch(line._id, {
        qcPendingCount: line.qcPendingCount - count,
        qcProblemCount: job.remakeOfQualityCheckId ? line.qcProblemCount : line.qcProblemCount + count,
        updatedAt: now,
      });
    }
    await appendOrderEvent(ctx, { operation, kind: "quality_control_recorded", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, fromValue: String(line.qcPassedCount), toValue: args.result, reason, relatedRecordId: String(qualityCheckId), now });
    await applyQc(ctx, (await ctx.db.get(qualityCheckId))!, now);
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, businessId: line.businessId, action: "admin_order_quality_control_recorded", detail: { orderId: operation.orderId, printJobId: job._id, orderLineId: line._id, qualityCheckId, result: args.result, quantity: count, remakeRequested: args.result === "problem" && args.remakeRequested }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return qualityCheckId;
  },
});

export const createDelivery = mutation({
  args: {
    operationId: v.id("orderOperations"),
    method: adminDeliveryMethodValidator,
    lines: v.array(v.object({ orderLineId: v.id("orderLines"), quantity: v.number(), physicalProductIds: v.optional(v.array(v.id("physicalProducts"))) })),
    courierService: v.optional(v.string()),
    courierReference: v.optional(v.string()),
    courierFeeMinor: v.optional(v.number()),
    recipientName: v.optional(v.string()),
    address: v.optional(v.string()),
    commandId: v.string(),
  },
  returns: v.id("deliveries"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const operation = await getOperation(ctx, args.operationId);
    const eventCommand = command(args.commandId);
    const existing = await ctx.db.query("deliveries").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (existing) {
      if (existing.accessFingerprint && existing.accessFingerprint !== accessFingerprint(args)) throw new ConvexError("access_idempotency_payload_mismatch");
      return existing._id;
    }
    if (args.lines.length === 0 || args.lines.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_delivery_lines_invalid");
    if (new Set(args.lines.map((line) => String(line.orderLineId))).size !== args.lines.length) throw new ConvexError("admin_order_delivery_line_duplicate");
    const courierFeeMinor = args.courierFeeMinor === undefined ? undefined : minor(args.courierFeeMinor);
    if (args.method === "personal" && courierFeeMinor !== undefined && courierFeeMinor !== 0) throw new ConvexError("admin_order_personal_delivery_fee_must_be_zero");
    const prepared: { line: Doc<"orderLines">; count: number; productIds: Id<"physicalProducts">[] }[] = [];
    let totalUnits = 0;
    for (const requested of args.lines) {
      const line = await getOrderLine(ctx, requested.orderLineId);
      if (line.operationId !== operation._id) throw new ConvexError("admin_order_cross_order_line");
      const count = quantity(requested.quantity, line.quantity);
      totalUnits += count;
      if (totalUnits > ADMIN_ORDER_BATCH) throw new ConvexError("access_delivery_batch_invalid");
      const available = line.qcPassedCount - line.deliveredCount - line.inDeliveryCount - line.deliveryReservedCount;
      if (count > available) throw new ConvexError("admin_order_delivery_requires_passed_qc");
      if (requested.physicalProductIds && (requested.physicalProductIds.length !== count || new Set(requested.physicalProductIds).size !== count)) throw new ConvexError("access_delivery_units_invalid");
      const products = requested.physicalProductIds
        ? await Promise.all(requested.physicalProductIds.map(id => ctx.db.get(id)))
        : await ctx.db.query("physicalProducts").withIndex("by_orderLineId_and_deliveryId_and_qc", q => q.eq("orderLineId", line._id).eq("deliveryId", undefined).eq("qc", "passed")).take(count);
      if (products.length !== count || new Set(products.map(p => p?._id)).size !== count) throw new ConvexError("access_delivery_units_invalid");
      const productIds: Id<"physicalProducts">[] = [];
      for (const product of products) {
        if (!product || product.orderLineId !== line._id || product.deliveryId) throw new ConvexError("access_delivery_units_invalid");
        await requireDispatchReady(ctx, product);
        productIds.push(product._id);
      }
      prepared.push({ line, count, productIds });
    }
    const businessId = prepared[0].line.businessId;
    if (prepared.some(({ line }) => line.businessId !== businessId)) {
      throw new ConvexError("admin_order_delivery_single_venue_required");
    }
    const business = await ctx.db.get(businessId);
    if (!business || business.accountId !== operation.accountId) {
      throw new ConvexError("admin_order_delivery_venue_invalid");
    }
    const recipientName = args.recipientName
      ? requiredText(args.recipientName, "admin_order_delivery_recipient_invalid", 160)
      : business.name;
    const storedAddress = args.address
      ? requiredText(args.address, "admin_order_delivery_address_invalid", 300)
      : [business.address, business.city].filter(Boolean).join(", ");
    if (!storedAddress) throw new ConvexError("admin_order_delivery_address_required");
    const now = Date.now();
    const deliveryId = await ctx.db.insert("deliveries", {
      accessFingerprint: accessFingerprint(args),
      operationId: operation._id,
      orderId: operation.orderId,
      businessId,
      businessName: business.name,
      recipientName,
      address: storedAddress,
      method: args.method,
      state: "draft",
      ...(args.method === "courier" && args.courierService ? { courierService: requiredText(args.courierService, "admin_order_courier_service_invalid", 160) } : {}),
      ...(args.method === "courier" && args.courierReference ? { courierReference: requiredText(args.courierReference, "admin_order_courier_reference_invalid", 240) } : {}),
      ...(args.method === "courier" && courierFeeMinor !== undefined ? { courierFeeMinor } : {}),
      ...(args.method === "courier" ? { courierFeePayer: "client_to_courier" as const } : {}),
      personalFeeMinor: 0,
      commandId: eventCommand,
      createdByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    for (const row of prepared) {
      await ctx.db.insert("deliveryLines", { deliveryId, operationId: operation._id, orderLineId: row.line._id, quantity: row.count, physicalProductIds: row.productIds, createdAt: now });
      for (const id of row.productIds) await ctx.db.patch(id, { deliveryId, updatedAt: now });
      await ctx.db.patch(row.line._id, {
        deliveryReservedCount: row.line.deliveryReservedCount + row.count,
        updatedAt: now,
      });
    }
    await appendOrderEvent(ctx, { operation, kind: "delivery_created", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, toValue: "draft", relatedRecordId: String(deliveryId), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_delivery_created", detail: { orderId: operation.orderId, deliveryId, method: args.method, courierFeeMinor, courierFeePayer: args.method === "courier" ? "client_to_courier" : undefined, personalFeeMinor: 0 }, now });
    return deliveryId;
  },
});

export const startDelivery = mutation({
  args: { deliveryId: v.id("deliveries"), commandId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new ConvexError("admin_order_delivery_not_found");
    const operation = await getOperation(ctx, delivery.operationId);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previous) return null;
    if (delivery.state !== "draft") throw new ConvexError("admin_order_delivery_start_invalid");
    const deliveryLines = await ctx.db.query("deliveryLines").withIndex("by_deliveryId", (q) => q.eq("deliveryId", delivery._id)).take(ADMIN_ORDER_BATCH + 1);
    if (deliveryLines.length === 0 || deliveryLines.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_delivery_lines_invalid");
    const now = Date.now();
    for (const deliveryLine of deliveryLines) {
      const line = await getOrderLine(ctx, deliveryLine.orderLineId);
      if (deliveryLine.quantity > line.deliveryReservedCount) throw new ConvexError("admin_order_delivery_reservation_invalid");
      if (!deliveryLine.physicalProductIds || deliveryLine.physicalProductIds.length !== deliveryLine.quantity) throw new ConvexError("access_legacy_delivery_mapping_required");
      for (const id of deliveryLine.physicalProductIds) {
        const product = await ctx.db.get(id);
        if (!product || product.deliveryId !== delivery._id || product.orderLineId !== line._id) throw new ConvexError("access_delivery_units_invalid");
        await requireDispatchReady(ctx, product);
      }
      await ctx.db.patch(line._id, {
        deliveryReservedCount: line.deliveryReservedCount - deliveryLine.quantity,
        inDeliveryCount: line.inDeliveryCount + deliveryLine.quantity,
        updatedAt: now,
      });
    }
    await ctx.db.patch(delivery._id, { state: "in_delivery", startedByUserId: actor._id, startedAt: now, updatedAt: now });
    await appendOrderEvent(ctx, { operation, kind: "delivery_started", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, fromValue: delivery.state, toValue: "in_delivery", relatedRecordId: String(delivery._id), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_delivery_started", detail: { orderId: operation.orderId, deliveryId: delivery._id, method: delivery.method, personalFeeMinor: delivery.personalFeeMinor }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return null;
  },
});

export const completeDelivery = mutation({
  args: { deliveryId: v.id("deliveries"), commandId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new ConvexError("admin_order_delivery_not_found");
    const operation = await getOperation(ctx, delivery.operationId);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previous) return null;
    if (delivery.state !== "in_delivery" && delivery.state !== "problem") throw new ConvexError("admin_order_delivery_complete_invalid");
    const deliveryLines = await ctx.db.query("deliveryLines").withIndex("by_deliveryId", (q) => q.eq("deliveryId", delivery._id)).take(ADMIN_ORDER_BATCH + 1);
    if (deliveryLines.length === 0 || deliveryLines.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_delivery_lines_invalid");
    const now = Date.now();
    for (const deliveryLine of deliveryLines) {
      const line = await getOrderLine(ctx, deliveryLine.orderLineId);
      if (line.inDeliveryCount < deliveryLine.quantity) throw new ConvexError("admin_order_delivery_quantity_invalid");
      await ctx.db.patch(line._id, { inDeliveryCount: line.inDeliveryCount - deliveryLine.quantity, deliveredCount: line.deliveredCount + deliveryLine.quantity, updatedAt: now });
    }
    await ctx.db.patch(delivery._id, { state: "delivered", completedByUserId: actor._id, completedAt: now, problemReason: undefined, updatedAt: now });
    await syncDeliveryProblemAction(ctx, operation, delivery, false, delivery.problemReason, now);
    await appendOrderEvent(ctx, { operation, kind: "delivery_completed", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, fromValue: delivery.state, toValue: "delivered", relatedRecordId: String(delivery._id), now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_delivery_completed", detail: { orderId: operation.orderId, deliveryId: delivery._id, method: delivery.method, completedByUserId: actor._id, personalFeeMinor: delivery.personalFeeMinor }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return null;
  },
});

export const reportDeliveryProblem = mutation({
  args: { deliveryId: v.id("deliveries"), reason: v.string(), commandId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new ConvexError("admin_order_delivery_not_found");
    const operation = await getOperation(ctx, delivery.operationId);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previous) return null;
    if (delivery.state !== "in_delivery") throw new ConvexError("admin_order_delivery_problem_invalid");
    const reason = requiredText(args.reason, "admin_order_delivery_problem_reason_required");
    const now = Date.now();
    await ctx.db.patch(delivery._id, { state: "problem", problemReason: reason, updatedAt: now });
    await appendOrderEvent(ctx, { operation, kind: "delivery_problem", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, fromValue: delivery.state, toValue: "problem", reason, relatedRecordId: String(delivery._id), now });
    await syncDeliveryProblemAction(ctx, operation, delivery, true, reason, now);
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_delivery_problem", detail: { orderId: operation.orderId, deliveryId: delivery._id, reason }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return null;
  },
});

export const cancel = mutation({
  args: { operationId: v.id("orderOperations"), reason: v.string(), commandId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const operation = await getOperation(ctx, args.operationId);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previous) return null;
    if (!["awaiting_conditions", "smf_assigned", "ready_for_printer"].includes(operation.fulfillmentState)) throw new ConvexError("admin_order_cancel_after_production");
    const reason = requiredText(args.reason, "admin_order_cancel_reason_required");
    const now = Date.now();
    await ctx.db.patch(operation._id, { cancelledAt: now, fulfillmentState: "cancelled", view: "completed", updatedAt: now });
    await ctx.db.patch(operation.orderId, { status: "cancelled", updatedAt: now });
    await appendOrderEvent(ctx, { operation, kind: "cancelled", axis: "fulfillment", commandId: eventCommand, actorUserId: actor._id, fromValue: operation.fulfillmentState, toValue: "cancelled", reason, now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_cancelled", detail: { orderId: operation.orderId, reason }, now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    return null;
  },
});

export const archive = mutation({
  args: { operationId: v.id("orderOperations"), commandId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const operation = await getOperation(ctx, args.operationId);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previous) return null;
    if (operation.view !== "completed") throw new ConvexError("admin_order_archive_before_completion");
    const now = Date.now();
    await ctx.db.patch(operation._id, { archivedAt: now, view: "archived", updatedAt: now });
    await appendOrderEvent(ctx, { operation, kind: "archived", axis: "operation", commandId: eventCommand, actorUserId: actor._id, fromValue: operation.view, toValue: "archived", now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_archived", detail: { orderId: operation.orderId }, now });
    return null;
  },
});

export const updateNote = mutation({
  args: { operationId: v.id("orderOperations"), note: v.string(), commandId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const operation = await getOperation(ctx, args.operationId);
    const eventCommand = command(args.commandId);
    const previous = await ctx.db.query("orderEvents").withIndex("by_operationId_and_commandId", (q) => q.eq("operationId", operation._id).eq("commandId", eventCommand)).unique();
    if (previous) return null;
    const note = args.note.trim();
    if (note.length > 4_000) throw new ConvexError("admin_order_note_invalid");
    const now = Date.now();
    await ctx.db.patch(operation._id, { ...(note ? { note } : { note: undefined }), updatedAt: now });
    await appendOrderEvent(ctx, { operation, kind: "note_changed", axis: "operation", commandId: eventCommand, actorUserId: actor._id, toValue: note ? "present" : "empty", now });
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: operation.accountId, action: "admin_order_note_changed", detail: { orderId: operation.orderId, hasNote: Boolean(note) }, now });
    return null;
  },
});

export const flagLatePrintJobs = internalMutation({
  args: { now: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!Number.isSafeInteger(args.now)) throw new ConvexError("admin_order_time_invalid");
    const rows = await ctx.db.query("printJobs").withIndex("by_state_and_expectedAt", (q) => q.eq("state", "sent").lte("expectedAt", args.now)).take(ADMIN_ORDER_BATCH + 1);
    if (rows.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_printer_check_limit");
    for (const job of rows) {
      const operation = await getOperation(ctx, job.operationId);
      await syncPrinterLateAction(ctx, operation, job, true, args.now);
    }
    return rows.length;
  },
});
