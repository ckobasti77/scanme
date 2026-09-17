import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { adminDomainSr } from "../../lib/i18n/sr/admin-domain";
import { adminOrdersSr } from "../../lib/i18n/sr/admin-orders";
import { formatHumanCode } from "../../lib/admin-v1/catalog";
import { normalizeAdminSearchText } from "./adminV1Validators";
import { isAdminEmail } from "./access";
import { syncAutomaticAction } from "./adminActionEngine";
import { syncFinanceExpectedOrder } from "./financeProjection";
import { projectOrderEvent } from "./adminActivity";
import {
  canRequestProvisioning,
  deriveFulfillment,
  deriveOrderView,
  isDesignReady,
  paymentState,
} from "../../lib/admin-v1/order-workflow";
import type {
  AdminOrderDesignKind,
  AdminOrderDesignState,
} from "./adminOrderValidators";
import {
  compactBackgroundsForMaterial,
  getProduct,
  type ProductBackground,
  type ProductDimension,
  type ProductFinish,
  type ProductMaterial,
  type ProductSelection,
  type ProductShape,
  type TemplateId,
  type WoodType,
  type Orientation,
} from "../../lib/scanme-pricing";

export const ADMIN_ORDER_BATCH = 100;

type DatabaseCtx = QueryCtx | MutationCtx;

const PRODUCT_IDS = new Set(Object.keys(adminDomainSr.products));

function requiredChoice<T extends string>(
  row: Record<string, unknown>,
  key: string,
  choices: readonly T[],
): T {
  const value = row[key];
  if (typeof value !== "string" || !choices.includes(value as T)) {
    throw new ConvexError(`admin_order_${key}_invalid`);
  }
  return value as T;
}

export function decodePhysicalSelection(value: unknown): ProductSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConvexError("admin_order_physical_selection_missing");
  }
  const row = value as Record<string, unknown>;
  if (typeof row.productId !== "string" || !PRODUCT_IDS.has(row.productId)) {
    throw new ConvexError("admin_order_product_invalid");
  }
  const product = getProduct(row.productId);
  if (!product) throw new ConvexError("admin_order_product_invalid");
  if (!Number.isSafeInteger(row.quantity) || Number(row.quantity) < 1 || Number(row.quantity) > 10_000) {
    throw new ConvexError("admin_order_quantity_invalid");
  }
  const quantity = Number(row.quantity);
  const dimension = requiredChoice<ProductDimension>(row, "dimension", product.allowedDimensions);
  if (!row.design || typeof row.design !== "object" || Array.isArray(row.design)) {
    throw new ConvexError("admin_order_design_missing");
  }
  const design = row.design as Record<string, unknown>;
  let normalizedDesign: ProductSelection["design"];
  if (design.kind === "template") {
    const templateId = requiredChoice<TemplateId>(design, "templateId", product.allowedTemplateIds);
    normalizedDesign = { kind: "template", templateId };
  } else if (design.kind === "custom" && typeof design.brief === "string" && design.brief.length <= 2_000) {
    normalizedDesign = { kind: "custom", brief: design.brief };
  } else {
    throw new ConvexError("admin_order_design_invalid");
  }

  const common = { productId: product.id, quantity, dimension, design: normalizedDesign };
  switch (product.id) {
    case "stickers":
      return { ...common, shape: requiredChoice<ProductShape>(row, "shape", product.allowedShapes ?? []) };
    case "window-film":
      return {
        ...common,
        background: requiredChoice<ProductBackground>(row, "background", product.allowedBackgrounds ?? []),
        finish: requiredChoice<ProductFinish>(row, "finish", product.allowedFinishes ?? []),
      };
    case "two-piece-stand":
      return { ...common, orientation: requiredChoice<Orientation>(row, "orientation", product.allowedOrientations ?? []) };
    case "compact-stand": {
      const material = requiredChoice<ProductMaterial>(row, "material", product.allowedMaterials ?? []);
      return {
        ...common,
        material,
        background: requiredChoice<ProductBackground>(row, "background", compactBackgroundsForMaterial(material)),
      };
    }
    case "premium-engraved-stand":
      return {
        ...common,
        shape: requiredChoice<ProductShape>(row, "shape", product.allowedShapes ?? []),
        woodType: requiredChoice<WoodType>(row, "woodType", product.allowedWoodTypes ?? []),
      };
  }
}

export function smpCodeFor(order: Doc<"orders">) {
  const date = new Date(order.createdAt);
  const day = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  let hash = 2_166_136_261;
  for (const character of String(order._id)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  }
  const suffix = (hash >>> 0).toString(36).padStart(7, "0").slice(-7).toUpperCase();
  return formatHumanCode("order", [day, suffix]);
}

export function adminDisplayName(user: Doc<"users">) {
  return user.name?.trim() || user.email?.trim() || "Admin";
}

export async function requireAdminUser(ctx: DatabaseCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || !isAdminEmail(user.email)) throw new ConvexError("admin_order_assignee_invalid");
  return user;
}

export async function getOperationByOrder(ctx: DatabaseCtx, orderId: Id<"orders">) {
  const operation = await ctx.db
    .query("orderOperations")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .unique();
  if (!operation) throw new ConvexError("admin_order_not_migrated");
  return operation;
}

export async function getOperation(ctx: DatabaseCtx, operationId: Id<"orderOperations">) {
  const operation = await ctx.db.get(operationId);
  if (!operation) throw new ConvexError("admin_order_not_found");
  return operation;
}

export async function getOrderLine(ctx: DatabaseCtx, orderLineId: Id<"orderLines">) {
  const line = await ctx.db.get(orderLineId);
  if (!line) throw new ConvexError("admin_order_line_not_found");
  return line;
}

export async function linesForOperation(ctx: DatabaseCtx, operationId: Id<"orderOperations">) {
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_operationId", (q) => q.eq("operationId", operationId))
    .take(ADMIN_ORDER_BATCH + 1);
  if (lines.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_too_many_lines");
  return lines;
}

function aggregateDesign(lines: Doc<"orderLines">[]): AdminOrderDesignState {
  if (lines.some((line) => line.designState === "in_progress")) return "in_progress";
  if (lines.some((line) => line.designState === "awaiting_approval")) return "awaiting_approval";
  if (lines.every((line) => line.designKind === "template" && line.designState === "template_selected")) {
    return "template_selected";
  }
  return "approved";
}

async function appendEvent(
  ctx: MutationCtx,
  input: {
    operation: Doc<"orderOperations">;
    kind: Doc<"orderEvents">["kind"];
    axis: Doc<"orderEvents">["axis"];
    commandId: string;
    actorUserId: Id<"users">;
    fromValue?: string;
    toValue?: string;
    reason?: string;
    relatedRecordId?: string;
    now: number;
  },
) {
  const existing = await ctx.db
    .query("orderEvents")
    .withIndex("by_operationId_and_commandId", (q) =>
      q.eq("operationId", input.operation._id).eq("commandId", input.commandId),
    )
    .unique();
  if (existing) return existing._id;
  const eventId = await ctx.db.insert("orderEvents", {
    operationId: input.operation._id,
    orderId: input.operation.orderId,
    kind: input.kind,
    axis: input.axis,
    commandId: input.commandId,
    actorUserId: input.actorUserId,
    ...(input.fromValue ? { fromValue: input.fromValue } : {}),
    ...(input.toValue ? { toValue: input.toValue } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.relatedRecordId ? { relatedRecordId: input.relatedRecordId } : {}),
    createdAt: input.now,
  });
  const event = await ctx.db.get(eventId);
  if (event) await projectOrderEvent(ctx, event);
  return eventId;
}

export { appendEvent as appendOrderEvent };

function orderAction(input: {
  operation: Doc<"orderOperations">;
  causeKind: string;
  isOpen: boolean;
  severity: "blocking" | "warning" | "information";
  waitingOn: "scanme" | "client" | "none";
  description: string;
  now: number;
}) {
  return {
    domain: "order" as const,
    sourceRecordId: String(input.operation.orderId),
    causeKind: input.causeKind,
    sourceVersion: `${input.operation.updatedAt}:${input.operation.paymentState}:${input.operation.designState}:${input.operation.fulfillmentState}:${input.operation.problemCount}`,
    isOpen: input.isOpen,
    accountId: input.operation.accountId,
    severity: input.severity,
    assigneeId: input.operation.assigneeId,
    relevantAt: input.now,
    priority: {
      blocking: input.severity === "blocking",
      overdue: false,
      dueToday: false,
      needsReply: false,
      graceOrWarning: input.severity === "warning",
      waitingOn: input.waitingOn,
    },
    contextHref: `/admin/operativa/porudzbine?order=${input.operation.orderId}`,
    description: input.description,
  };
}

async function syncOrderActions(ctx: MutationCtx, operation: Doc<"orderOperations">, now: number) {
  await syncAutomaticAction(ctx, orderAction({
    operation,
    causeKind: "payment_required",
    isOpen: operation.paymentState !== "paid" && operation.fulfillmentState !== "cancelled",
    severity: "blocking",
    waitingOn: "client",
    description: `${operation.smpCode}: ${adminOrdersSr.actionPaymentRequired}`,
    now,
  }), now);
  await syncAutomaticAction(ctx, orderAction({
    operation,
    causeKind: "design_required",
    isOpen:
      operation.fulfillmentState !== "cancelled" &&
      (operation.designState === "in_progress" || operation.designState === "awaiting_approval"),
    severity: "blocking",
    waitingOn: operation.designState === "awaiting_approval" ? "client" : "scanme",
    description: `${operation.smpCode}: ${adminOrdersSr.actionDesignRequired}`,
    now,
  }), now);
  await syncAutomaticAction(ctx, orderAction({
    operation,
    causeKind: "quality_problem",
    isOpen: operation.problemCount > 0 && operation.fulfillmentState !== "delivered" && operation.fulfillmentState !== "cancelled",
    severity: "blocking",
    waitingOn: "scanme",
    description: `${operation.smpCode}: ${adminOrdersSr.actionQualityProblem}`,
    now,
  }), now);
  await syncAutomaticAction(ctx, orderAction({
    operation,
    causeKind: "next_scanme_step",
    isOpen:
      (operation.provisioningReady && operation.fulfillmentState === "awaiting_conditions") ||
      operation.fulfillmentState === "smf_assigned" ||
      operation.fulfillmentState === "ready_for_printer" ||
      operation.fulfillmentState === "received",
    severity: "information",
    waitingOn: "scanme",
    description: `${operation.smpCode}: ${adminOrdersSr.actionNextStep}`,
    now,
  }), now);
  await syncAutomaticAction(ctx, orderAction({
    operation,
    causeKind: "ready_for_delivery",
    isOpen: operation.fulfillmentState === "ready_for_delivery",
    severity: "information",
    waitingOn: "scanme",
    description: `${operation.smpCode}: ${adminOrdersSr.actionReadyDelivery}`,
    now,
  }), now);
}

export async function refreshOperation(
  ctx: MutationCtx,
  operationId: Id<"orderOperations">,
  actorUserId: Id<"users">,
  now: number,
) {
  const operation = await getOperation(ctx, operationId);
  const lines = await linesForOperation(ctx, operationId);
  const allocations = await ctx.db
    .query("orderPaymentAllocations")
    .withIndex("by_orderId", (q) => q.eq("orderId", operation.orderId))
    .take(ADMIN_ORDER_BATCH + 1);
  if (allocations.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_too_many_payments");
  const settledMinor = allocations
    .filter((allocation) => allocation.state === "settled")
    .reduce((sum, allocation) => sum + allocation.amountMinor, 0);
  const reversedMinor = allocations
    .filter((allocation) => allocation.state === "reversed")
    .reduce((sum, allocation) => sum + allocation.amountMinor, 0);
  const nextPayment = paymentState({
    requiredMinor: operation.requiredMinor,
    settledMinor: settledMinor + reversedMinor,
    reversedMinor,
  });

  for (const line of lines) {
    if (!canRequestProvisioning({
      payment: nextPayment,
      designKind: line.designKind as AdminOrderDesignKind,
      design: line.designState,
      fulfillment: operation.fulfillmentState,
    })) continue;
    const requestKey = `admin11:${line._id}:provision:v1`;
    const existing = await ctx.db
      .query("orderProvisioningRequests")
      .withIndex("by_requestKey", (q) => q.eq("requestKey", requestKey))
      .unique();
    if (!existing) {
      const requestId = await ctx.db.insert("orderProvisioningRequests", {
        operationId,
        orderLineId: line._id,
        requestKey,
        quantity: line.quantity,
        state: "pending_admin_12",
        createdByUserId: actorUserId,
        createdAt: now,
      });
      await appendEvent(ctx, {
        operation,
        kind: "provisioning_requested",
        axis: "fulfillment",
        commandId: requestKey,
        actorUserId,
        toValue: "pending_admin_12",
        relatedRecordId: String(requestId),
        now,
      });
    }
  }

  const requestRows = await ctx.db
    .query("orderProvisioningRequests")
    .withIndex("by_operationId_and_createdAt", (q) => q.eq("operationId", operationId))
    .take(ADMIN_ORDER_BATCH + 1);
  if (requestRows.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_too_many_requests");
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const counters = lines.reduce(
    (sum, line) => ({
      smfCount: sum.smfCount + line.smfAssignedCount,
      sentCount: sum.sentCount + line.sentToPrinterCount,
      receivedCount: sum.receivedCount + line.receivedCount,
      qcPassedCount: sum.qcPassedCount + line.qcPassedCount,
      qcProblemCount: sum.qcProblemCount + line.qcProblemCount,
      inDeliveryCount: sum.inDeliveryCount + line.inDeliveryCount,
      deliveredCount: sum.deliveredCount + line.deliveredCount,
    }),
    { smfCount: 0, sentCount: 0, receivedCount: 0, qcPassedCount: 0, qcProblemCount: 0, inDeliveryCount: 0, deliveredCount: 0 },
  );
  const fulfillmentState = deriveFulfillment({
    cancelled: operation.cancelledAt !== undefined,
    unitCount,
    ...counters,
  });
  const designState = aggregateDesign(lines);
  const view = deriveOrderView(fulfillmentState, operation.archivedAt !== undefined);
  const patch = {
    paymentState: nextPayment,
    designState,
    fulfillmentState,
    view,
    settledMinor,
    reversedMinor,
    unitCount,
    problemCount: counters.qcProblemCount,
    provisioningReady:
      requestRows.length === lines.length &&
      lines.length > 0 &&
      nextPayment === "paid" &&
      lines.every((line) => isDesignReady(line.designKind, line.designState)),
    updatedAt: now,
  };
  await ctx.db.patch(operationId, patch);
  const refreshed = { ...operation, ...patch } as Doc<"orderOperations">;
  await syncOrderActions(ctx, refreshed, now);
  await syncFinanceExpectedOrder(ctx, refreshed, now);
  return refreshed;
}

export function orderSearchText(input: {
  accountName: string;
  smkCode: string;
  smpCode: string;
  businesses: { name: string; smlCode: string }[];
}) {
  return normalizeAdminSearchText([
    input.accountName,
    input.smkCode,
    input.smpCode,
    ...input.businesses.flatMap((business) => [business.name, business.smlCode]),
  ].join(" "));
}
