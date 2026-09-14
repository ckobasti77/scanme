import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import {
  ADMIN_ORDER_BATCH,
  adminDisplayName,
  appendOrderEvent,
  decodePhysicalSelection,
  orderSearchText,
  refreshOperation,
  requireAdminUser,
  smpCodeFor,
} from "./lib/adminOrderOperations";
import { adminDomainSr } from "../lib/i18n/sr/admin-domain";
import { adminOrdersSr } from "../lib/i18n/sr/admin-orders";

const resultValidator = v.object({
  status: v.union(
    v.literal("ready"),
    v.literal("blocked"),
    v.literal("already_migrated"),
  ),
  operationId: v.union(v.id("orderOperations"), v.null()),
  smpCode: v.union(v.string(), v.null()),
  issueCodes: v.array(v.string()),
});

/**
 * ADMIN-11 widen step. It adopts one explicitly selected legacy order and is
 * never scheduled or run automatically. The immutable priceSnapshot and the
 * opaque physicalSelection on orderItems are read, not rewritten.
 */
export const migrateOne = internalMutation({
  args: {
    orderId: v.id("orders"),
    assigneeId: v.id("users"),
    dryRun: v.boolean(),
  },
  returns: resultValidator,
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const assignee = await requireAdminUser(ctx, args.assigneeId);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("admin_order_not_found");
    const account = await ctx.db.get(order.accountId);
    if (!account || account.adminV1MigrationVersion !== 1 || !account.smkCode) {
      throw new ConvexError("admin_order_account_not_migrated");
    }
    const existing = await ctx.db
      .query("orderOperations")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .unique();
    if (existing) {
      return {
        status: "already_migrated" as const,
        operationId: existing._id,
        smpCode: existing.smpCode,
        issueCodes: [],
      };
    }

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(ADMIN_ORDER_BATCH + 1);
    if (items.length > ADMIN_ORDER_BATCH) throw new ConvexError("admin_order_too_many_lines");
    const physicalItems = items.filter((item) => item.kind === "physical");
    if (physicalItems.length === 0) throw new ConvexError("admin_order_no_physical_lines");

    const legacyPayments = await ctx.db
      .query("payments")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(ADMIN_ORDER_BATCH + 1);
    if (legacyPayments.length > ADMIN_ORDER_BATCH) {
      throw new ConvexError("admin_order_too_many_legacy_payments");
    }

    const issues: { orderItemId?: typeof physicalItems[number]["_id"]; code: string; detail: string }[] = [];
    if (legacyPayments.length > 0 || order.status === "paid" || order.status === "provisioned" || order.status === "refunded") {
      issues.push({
        code: "legacy_payment_allocation_required",
        detail: adminOrdersSr.migrationPaymentAllocationRequired,
      });
    }
    if (order.status === "cancelled") {
      issues.push({
        code: "legacy_cancellation_review_required",
        detail: adminOrdersSr.migrationCancellationReviewRequired,
      });
    }
    const decoded: {
      item: typeof physicalItems[number];
      selection: ReturnType<typeof decodePhysicalSelection>;
      business: NonNullable<Awaited<ReturnType<typeof ctx.db.get<"businesses">>>>;
    }[] = [];
    for (const item of physicalItems) {
      try {
        const selection = decodePhysicalSelection(item.physicalSelection);
        const business = await ctx.db.get(item.businessId);
        if (!business || business.accountId !== order.accountId || !business.smlCode || business.adminV1MigrationVersion !== 1) {
          issues.push({ orderItemId: item._id, code: "venue_not_migrated", detail: adminOrdersSr.migrationVenueInvalid });
          continue;
        }
        if (!(item.boundServices?.length || item.boundService)) {
          issues.push({ orderItemId: item._id, code: "bound_service_missing", detail: adminOrdersSr.migrationBoundServiceMissing });
          continue;
        }
        decoded.push({ item, selection, business });
      } catch (error) {
        issues.push({
          orderItemId: item._id,
          code: error instanceof ConvexError ? String(error.data) : "physical_selection_invalid",
          detail: adminOrdersSr.migrationPhysicalSelectionInvalid,
        });
      }
    }

    if (issues.length > 0) {
      if (!args.dryRun) {
        const now = Date.now();
        for (const issue of issues) {
          const issueKey = `${order._id}:${issue.orderItemId ?? "order"}:${issue.code}`;
          const previous = await ctx.db
            .query("orderMigrationIssues")
            .withIndex("by_issueKey", (q) => q.eq("issueKey", issueKey))
            .unique();
          if (!previous) {
            await ctx.db.insert("orderMigrationIssues", {
              orderId: order._id,
              ...(issue.orderItemId ? { orderItemId: issue.orderItemId } : {}),
              code: issue.code,
              detail: issue.detail,
              issueKey,
              createdAt: now,
            });
          }
        }
      }
      return {
        status: "blocked" as const,
        operationId: null,
        smpCode: null,
        issueCodes: issues.map((issue) => issue.code),
      };
    }

    const smpCode = smpCodeFor(order);
    const duplicateCode = await ctx.db
      .query("orderOperations")
      .withIndex("by_smpCode", (q) => q.eq("smpCode", smpCode))
      .unique();
    if (duplicateCode) throw new ConvexError("admin_order_smp_collision");
    if (args.dryRun) {
      return { status: "ready" as const, operationId: null, smpCode, issueCodes: [] };
    }

    const now = Date.now();
    const createdBy = order.createdByUserId ? await ctx.db.get(order.createdByUserId) : null;
    const previousIssues = await ctx.db
      .query("orderMigrationIssues")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(ADMIN_ORDER_BATCH + 1);
    if (previousIssues.length > ADMIN_ORDER_BATCH) {
      throw new ConvexError("admin_order_too_many_migration_issues");
    }
    for (const issue of previousIssues) {
      if (issue.resolvedAt === undefined) await ctx.db.patch(issue._id, { resolvedAt: now });
    }
    const uniqueBusinesses = [...new Map(decoded.map(({ business }) => [business._id, business])).values()];
    const requiredMinor = decoded.reduce((sum, { item }) => sum + Math.round(item.lineTotalRsd * 100), 0);
    const operationId = await ctx.db.insert("orderOperations", {
      orderId: order._id,
      accountId: account._id,
      ...(createdBy
        ? { createdByUserId: createdBy._id, createdByName: adminDisplayName(createdBy) }
        : {}),
      accountName: account.name,
      smkCode: account.smkCode,
      smpCode,
      ...(uniqueBusinesses.length === 1
        ? {
            primaryBusinessId: uniqueBusinesses[0]._id,
            primaryBusinessName: uniqueBusinesses[0].name,
            primarySmlCode: uniqueBusinesses[0].smlCode,
          }
        : {}),
      paymentState: "awaiting_payment",
      designState: decoded.every(({ selection }) => selection.design.kind === "template")
        ? "template_selected"
        : "in_progress",
      fulfillmentState: "awaiting_conditions",
      view: "active",
      priority: "normal",
      priorityRank: 2,
      assigneeId: assignee._id,
      assigneeName: adminDisplayName(assignee),
      requiredMinor,
      settledMinor: 0,
      reversedMinor: 0,
      currency: "RSD",
      lineCount: decoded.length,
      unitCount: decoded.reduce((sum, { selection }) => sum + selection.quantity, 0),
      problemCount: 0,
      migrationIssueCount: 0,
      provisioningReady: false,
      searchText: orderSearchText({
        accountName: account.name,
        smkCode: account.smkCode,
        smpCode,
        businesses: uniqueBusinesses.map((business) => ({ name: business.name, smlCode: business.smlCode! })),
      }),
      migrationVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(order._id, { smpCode });
    for (const { item, selection, business } of decoded) {
      await ctx.db.insert("orderLines", {
        operationId,
        orderId: order._id,
        orderItemId: item._id,
        accountId: account._id,
        businessId: business._id,
        businessName: business.name,
        smlCode: business.smlCode!,
        productType: selection.productId,
        productLabel: adminDomainSr.products[selection.productId],
        quantity: selection.quantity,
        lineTotalMinor: Math.round(item.lineTotalRsd * 100),
        currency: "RSD",
        configSnapshot: selection,
        boundServices: item.boundServices ?? (item.boundService ? [item.boundService] : []),
        designKind: selection.design.kind,
        designState: selection.design.kind === "template" ? "template_selected" : "in_progress",
        designRevision: 1,
        smfAssignedCount: 0,
        sentToPrinterCount: 0,
        receivedCount: 0,
        qcPendingCount: 0,
        qcPassedCount: 0,
        qcProblemCount: 0,
        deliveryReservedCount: 0,
        inDeliveryCount: 0,
        deliveredCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    const operation = (await ctx.db.get(operationId))!;
    await appendOrderEvent(ctx, {
      operation,
      kind: "migrated",
      axis: "operation",
      commandId: `admin11:migrate:${order._id}`,
      actorUserId: actor._id,
      toValue: "migration_v1",
      now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: actor._id,
      accountId: account._id,
      action: "admin_order_migrated",
      detail: { orderId: order._id, operationId, smpCode, lineCount: decoded.length },
      now,
    });
    await refreshOperation(ctx, operationId, actor._id, now);
    return { status: "ready" as const, operationId, smpCode, issueCodes: [] };
  },
});
