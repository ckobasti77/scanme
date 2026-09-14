/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createDefaultProductSelection } from "../lib/scanme-pricing";
import {
  canRequestProvisioning,
  deriveFulfillment,
  paymentState,
} from "../lib/admin-v1/order-workflow";
import { stableActionCauseId } from "../lib/admin-v1/operational";
import { decodePhysicalSelection } from "./lib/adminOrderOperations";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-13T10:00:00.000Z");
const ADMIN = "admin11@scanme.test";
const OUTSIDER = "outsider11@scanme.test";
const page = (numItems = 20, cursor: string | null = null) => ({ numItems, cursor });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = ADMIN;
});

afterEach(() => vi.useRealTimers());

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN, name: "Teodora" });
    const outsiderId = await ctx.db.insert("users", { email: OUTSIDER, name: "Stranac" });
    const accountId = await ctx.db.insert("accounts", {
      name: "Bistro Most",
      plan: "premium",
      planPeriod: "monthly",
      status: "active",
      smkCode: "SMK-MOS-001",
      ownerDisplayName: "Mina Most",
      normalizedOwnerDisplayName: "mina most",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    });
    const businessId = await ctx.db.insert("businesses", {
      accountId,
      name: "Bistro Most Dorćol",
      normalizedName: "bistro most dorcol",
      slug: "bistro-most-admin-11",
      address: "Dobračina 10",
      city: "Beograd",
      kind: "business",
      smlCode: "SML-MOS-001",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      status: "active",
      createdAt: NOW - 9_000,
      updatedAt: NOW - 9_000,
    });
    const businessTwoId = await ctx.db.insert("businesses", {
      accountId,
      name: "Bistro Most Zemun",
      normalizedName: "bistro most zemun",
      slug: "bistro-most-zemun-admin-11",
      address: "Glavna 20",
      city: "Beograd",
      kind: "business",
      smlCode: "SML-MOS-002",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      status: "active",
      createdAt: NOW - 8_000,
      updatedAt: NOW - 8_000,
    });
    const otherAccountId = await ctx.db.insert("accounts", {
      name: "Drugi nalog",
      plan: "basic",
      status: "active",
      smkCode: "SMK-DRU-001",
      ownerDisplayName: "Drugi",
      normalizedOwnerDisplayName: "drugi",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const otherBusinessId = await ctx.db.insert("businesses", {
      accountId: otherAccountId,
      name: "Tuđi lokal",
      normalizedName: "tudji lokal",
      slug: "tudji-lokal-admin-11",
      kind: "business",
      smlCode: "SML-DRU-001",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    return { adminId, outsiderId, accountId, businessId, businessTwoId, otherAccountId, otherBusinessId };
  });
  const identity = (userId: Id<"users">) => ({ subject: userId, issuer: "https://admin-11.test" });
  return {
    t,
    ...ids,
    admin: t.withIdentity(identity(ids.adminId)),
    outsider: t.withIdentity(identity(ids.outsiderId)),
  };
}

async function createOperationalOrder(
  seeded: Awaited<ReturnType<typeof seed>>,
  input: { custom?: boolean; multi?: boolean } = {},
) {
  const base = createDefaultProductSelection("two-piece-stand");
  const first = {
    ...base,
    quantity: 2,
    ...(input.custom ? { design: { kind: "custom" as const, brief: "Tamna varijanta sa logotipom" } } : {}),
  };
  const physicalLines = [
    { businessId: seeded.businessId, boundService: "scanme_links" as const, selection: first },
    ...(input.multi
      ? [{ businessId: seeded.businessTwoId, boundService: "scanme_links" as const, selection: { ...createDefaultProductSelection("stickers"), quantity: 3 } }]
      : []),
  ];
  const created = await seeded.admin.mutation(api.orders.createOrder, {
    accountId: seeded.accountId,
    serviceLines: [{ businessId: seeded.businessId, service: "scanme_links", period: "monthly" }],
    physicalLines,
  });
  const before = await seeded.t.run((ctx) => ctx.db.get(created.orderId));
  const migrated = await seeded.admin.mutation(internal.adminOrderMigrations.migrateOne, {
    orderId: created.orderId,
    assigneeId: seeded.adminId,
    dryRun: false,
  });
  if (!migrated.operationId) throw new Error("migration failed");
  const detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: migrated.operationId });
  if (!detail) throw new Error("detail missing");
  return { ...created, before, operationId: migrated.operationId, detail };
}

async function fullyPay(seeded: Awaited<ReturnType<typeof seed>>, operationId: Id<"orderOperations">, amountMinor: number, key = "pay-full") {
  return seeded.admin.mutation(api.adminOrders.recordPayment, {
    operationId,
    amountMinor,
    method: "bank_transfer",
    paidAt: NOW - 1_000,
    reference: "IZVOD-11",
    key,
  });
}

describe("ADMIN-11 independent gates and immutable adoption", () => {
  test("custom design and payment remain independent; only both create one idempotent provisioning request", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded, { custom: true });
    expect(order.detail.operation.paymentState).toBe("awaiting_payment");
    expect(order.detail.operation.designState).toBe("in_progress");
    expect(order.detail.provisioningRequests).toHaveLength(0);

    const lineId = order.detail.lines[0]._id;
    const firstSnapshot = order.detail.lines[0].configSnapshot;
    await seeded.admin.mutation(api.adminOrders.setDesignState, { orderLineId: lineId, state: "awaiting_approval", commandId: "design-ready-before-payment" });
    await seeded.admin.mutation(api.adminOrders.approveDesign, { orderLineId: lineId, snapshot: firstSnapshot, commandId: "approve-before-payment" });
    let detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(detail?.operation.paymentState).toBe("awaiting_payment");
    expect(detail?.operation.designState).toBe("approved");
    expect(detail?.provisioningRequests).toHaveLength(0);

    const approvalSnapshot = {
      ...firstSnapshot,
      design: { kind: "custom" as const, brief: "Finalna priprema posle korekcije" },
    };
    await seeded.admin.mutation(api.adminOrders.setDesignState, { orderLineId: lineId, state: "in_progress", designSnapshot: approvalSnapshot, commandId: "design-revision-before-payment" });
    await seeded.admin.mutation(api.adminOrders.recordPayment, {
      operationId: order.operationId,
      amountMinor: order.detail.operation.requiredMinor - 100,
      method: "cash",
      paidAt: NOW,
      key: "partial",
    });
    detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(detail?.operation.paymentState).toBe("awaiting_payment");
    expect(detail?.operation.designState).toBe("in_progress");
    expect(detail?.provisioningRequests).toHaveLength(0);

    await seeded.admin.mutation(api.adminOrders.recordPayment, {
      operationId: order.operationId,
      amountMinor: 100,
      method: "cash",
      paidAt: NOW,
      key: "balance",
    });
    detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(detail?.operation.paymentState).toBe("paid");
    expect(detail?.operation.designState).toBe("in_progress");
    expect(detail?.provisioningRequests).toHaveLength(0);

    await seeded.admin.mutation(api.adminOrders.setDesignState, { orderLineId: lineId, state: "awaiting_approval", commandId: "design-ready" });
    const approvalId = await seeded.admin.mutation(api.adminOrders.approveDesign, { orderLineId: lineId, snapshot: approvalSnapshot, commandId: "approve-v1" });
    const retryId = await seeded.admin.mutation(api.adminOrders.approveDesign, { orderLineId: lineId, snapshot: approvalSnapshot, commandId: "approve-v1" });
    expect(retryId).toBe(approvalId);
    detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(detail?.operation.provisioningReady).toBe(true);
    expect(detail?.provisioningRequests).toHaveLength(1);
    expect(detail?.lines[0].smfAssignedCount).toBe(0);
    expect(detail?.operation.fulfillmentState).toBe("awaiting_conditions");
    const nextActions = await seeded.t.run((ctx) => ctx.db
      .query("actionItems")
      .withIndex("by_source_record_state_priority", (q) =>
        q.eq("sourceDomain", "order").eq("sourceRecordId", String(order.orderId)).eq("state", "open"),
      )
      .take(20));
    expect(nextActions.filter((action) => action.causeKind === "next_scanme_step")).toHaveLength(1);
  });

  test("approval snapshot is immutable and a later revision requires a new approval", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded, { custom: true });
    const lineId = order.detail.lines[0]._id;
    await seeded.admin.mutation(api.adminOrders.setDesignState, { orderLineId: lineId, state: "awaiting_approval", commandId: "ready-v1" });
    const firstSnapshot = order.detail.lines[0].configSnapshot;
    const approvalId = await seeded.admin.mutation(api.adminOrders.approveDesign, { orderLineId: lineId, snapshot: firstSnapshot, commandId: "approve-v1" });
    await expect(seeded.admin.mutation(api.adminOrders.setDesignState, { orderLineId: lineId, state: "in_progress", commandId: "revise-without-snapshot" })).rejects.toThrow("admin_order_design_transition_invalid");
    const secondSnapshot = {
      ...firstSnapshot,
      design: { kind: "custom" as const, brief: "Nova odobrena priprema" },
    };
    await seeded.admin.mutation(api.adminOrders.setDesignState, { orderLineId: lineId, state: "in_progress", designSnapshot: secondSnapshot, commandId: "revise-v2" });
    const detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(detail?.lines[0].designRevision).toBe(2);
    expect(detail?.lines[0].approvedSnapshotId).toBeUndefined();
    expect(detail?.approvals.find((row) => row._id === approvalId)?.snapshot).toEqual(firstSnapshot);
    expect(detail?.operation.designState).toBe("in_progress");
    expect(detail?.provisioningRequests).toHaveLength(0);
  });

  test("migration keeps the original price snapshot byte-for-byte and exposes invalid legacy selection", async () => {
    const seeded = await seed();
    const good = await createOperationalOrder(seeded);
    const after = await seeded.t.run((ctx) => ctx.db.get(good.orderId));
    expect(JSON.stringify(after?.priceSnapshot)).toBe(JSON.stringify(good.before?.priceSnapshot));
    expect(good.detail.lines[0].lineTotalMinor).toBe(good.before!.priceSnapshot.oneTimeTotalRsd * 100);
    expect(good.detail.lines[0].currency).toBe("RSD");
    expect(good.detail.operation.createdByUserId).toBe(seeded.adminId);
    expect(good.detail.operation.createdByName).toBe("Teodora");

    const bad = await seeded.admin.mutation(api.orders.createOrder, {
      accountId: seeded.accountId,
      serviceLines: [{ businessId: seeded.businessId, service: "scanme_links", period: "monthly" }],
      physicalLines: [{ businessId: seeded.businessId, boundService: "scanme_links", selection: createDefaultProductSelection("stickers") }],
    });
    await seeded.t.run(async (ctx) => {
      const items = await ctx.db.query("orderItems").withIndex("by_orderId", (q) => q.eq("orderId", bad.orderId)).take(10);
      const physical = items.find((item) => item.kind === "physical")!;
      await ctx.db.patch(physical._id, { physicalSelection: undefined });
    });
    const migration = await seeded.admin.mutation(internal.adminOrderMigrations.migrateOne, { orderId: bad.orderId, assigneeId: seeded.adminId, dryRun: false });
    expect(migration.status).toBe("blocked");
    expect(migration.issueCodes).toContain("admin_order_physical_selection_missing");
    const issues = await seeded.t.run((ctx) => ctx.db.query("orderMigrationIssues").withIndex("by_orderId", (q) => q.eq("orderId", bad.orderId)).take(10));
    expect(issues).toHaveLength(1);
    await seeded.t.run(async (ctx) => {
      const items = await ctx.db.query("orderItems").withIndex("by_orderId", (q) => q.eq("orderId", bad.orderId)).take(10);
      const physical = items.find((item) => item.kind === "physical")!;
      await ctx.db.patch(physical._id, { physicalSelection: createDefaultProductSelection("stickers") });
    });
    const recovered = await seeded.admin.mutation(internal.adminOrderMigrations.migrateOne, { orderId: bad.orderId, assigneeId: seeded.adminId, dryRun: false });
    expect(recovered.status).toBe("ready");
    const resolvedIssues = await seeded.t.run((ctx) => ctx.db.query("orderMigrationIssues").withIndex("by_orderId", (q) => q.eq("orderId", bad.orderId)).take(10));
    expect(resolvedIssues[0].resolvedAt).toBe(NOW);
  });

  test("legacy selection is normalized at the adapter boundary without carrying opaque fields", () => {
    const legacy = {
      ...createDefaultProductSelection("compact-stand"),
      internalCheckoutOnly: { shouldNotReachAdmin11: true },
    };
    const decoded = decodePhysicalSelection(legacy);
    expect(decoded).toEqual(createDefaultProductSelection("compact-stand"));
    expect(decoded).not.toHaveProperty("internalCheckoutOnly");
    expect(() => decodePhysicalSelection({ ...legacy, material: "paper" })).toThrow("admin_order_material_invalid");
  });

  test("legacy paid state is an explicit allocation issue instead of a fabricated ADMIN-11 payment", async () => {
    const seeded = await seed();
    const created = await seeded.admin.mutation(api.orders.createOrder, {
      accountId: seeded.accountId,
      serviceLines: [{ businessId: seeded.businessId, service: "scanme_links", period: "monthly" }],
      physicalLines: [{ businessId: seeded.businessId, boundService: "scanme_links", selection: createDefaultProductSelection("stickers") }],
    });
    await seeded.t.run((ctx) => ctx.db.patch(created.orderId, { status: "paid" }));
    const migration = await seeded.admin.mutation(internal.adminOrderMigrations.migrateOne, {
      orderId: created.orderId,
      assigneeId: seeded.adminId,
      dryRun: false,
    });
    expect(migration.status).toBe("blocked");
    expect(migration.issueCodes).toContain("legacy_payment_allocation_required");
    expect(await seeded.admin.query(api.adminOrders.getOperationIdForOrder, { orderId: created.orderId })).toBeNull();
  });

  test("one combined receipt is allocated exactly across multiple orders and reverses atomically", async () => {
    const seeded = await seed();
    const first = await createOperationalOrder(seeded);
    const second = await createOperationalOrder(seeded);
    const firstAmount = first.detail.operation.requiredMinor;
    const secondAmount = second.detail.operation.requiredMinor;
    const args = {
      accountId: seeded.accountId,
      amountMinor: firstAmount + secondAmount,
      allocations: [
        { operationId: first.operationId, amountMinor: firstAmount },
        { operationId: second.operationId, amountMinor: secondAmount },
      ],
      method: "bank_transfer" as const,
      paidAt: NOW,
      reference: "OBJEDINJENA-11",
      key: "combined-two-orders",
    };
    const paymentId = await seeded.admin.mutation(api.adminOrders.recordCombinedPayment, args);
    expect(await seeded.admin.mutation(api.adminOrders.recordCombinedPayment, args)).toBe(paymentId);
    await expect(seeded.admin.mutation(api.adminOrders.recordCombinedPayment, { ...args, reference: "DRUGA-REFERENCA" })).rejects.toThrow("admin_order_idempotency_conflict");
    let details = await Promise.all([
      seeded.admin.query(api.adminOrders.getDetail, { operationId: first.operationId }),
      seeded.admin.query(api.adminOrders.getDetail, { operationId: second.operationId }),
    ]);
    expect(details.map((detail) => detail?.operation.paymentState)).toEqual(["paid", "paid"]);
    const allocations = await seeded.t.run((ctx) => ctx.db.query("orderPaymentAllocations").withIndex("by_paymentId", (q) => q.eq("paymentId", paymentId)).take(10));
    expect(allocations.map((allocation) => allocation.amountMinor).sort((left, right) => left - right)).toEqual([firstAmount, secondAmount].sort((left, right) => left - right));
    await seeded.admin.mutation(api.adminOrders.reversePayment, { paymentId, reason: "Stornirana objedinjena uplata", key: "reverse-combined" });
    details = await Promise.all([
      seeded.admin.query(api.adminOrders.getDetail, { operationId: first.operationId }),
      seeded.admin.query(api.adminOrders.getDetail, { operationId: second.operationId }),
    ]);
    expect(details.map((detail) => detail?.operation.paymentState)).toEqual(["reversed", "reversed"]);
  });
});

describe("ADMIN-11 physical fulfillment", () => {
  test("no real SMF means no printer dispatch; QC failure blocks delivery and emits one action", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded);
    await fullyPay(seeded, order.operationId, order.detail.operation.requiredMinor);
    const line = order.detail.lines[0];
    const printerId = await seeded.admin.mutation(api.adminOrders.savePrinter, { name: "Štampa Plus", contact: "office@example.invalid" });
    await expect(seeded.admin.mutation(api.adminOrders.createPrintJob, { operationId: order.operationId, printerId, lines: [{ orderLineId: line._id, quantity: 2 }], commandId: "job-no-smf" })).rejects.toThrow("admin_order_real_smf_required");
    const smfRowsBefore = await seeded.t.run((ctx) => ctx.db.query("orderSmfReferences").withIndex("by_orderLineId", (q) => q.eq("orderLineId", line._id)).take(10));
    expect(smfRowsBefore).toHaveLength(0);

    await seeded.admin.mutation(internal.adminOrders.recordSmfAssignments, {
      orderLineId: line._id,
      assignments: [
        { reference: "SMF-REAL-001", sourceRecordId: "physical-record-1" },
        { reference: "SMF-REAL-002", sourceRecordId: "physical-record-2" },
      ],
      actorUserId: seeded.adminId,
      commandId: "smf-return-1",
    });
    const jobId = await seeded.admin.mutation(api.adminOrders.createPrintJob, { operationId: order.operationId, printerId, lines: [{ orderLineId: line._id, quantity: 2 }], commandId: "job-1" });
    await seeded.admin.mutation(api.adminOrders.dispatchPrintJob, { printJobId: jobId, expectedAt: NOW + 86_400_000, commandId: "send-1" });
    await seeded.admin.mutation(api.adminOrders.receivePrintJob, { printJobId: jobId, orderLineId: line._id, quantity: 2, commandId: "receive-1" });
    const qcId = await seeded.admin.mutation(api.adminOrders.recordQualityCheck, { printJobId: jobId, orderLineId: line._id, result: "problem", quantity: 2, reason: "Pogrešan rez", remakeRequested: true, commandId: "qc-bad" });
    await expect(seeded.admin.mutation(api.adminOrders.createDelivery, { operationId: order.operationId, method: "personal", lines: [{ orderLineId: line._id, quantity: 1 }], courierFeeMinor: 0, commandId: "delivery-too-early" })).rejects.toThrow("admin_order_delivery_requires_passed_qc");
    const actionsBeforeRetry = await seeded.t.run((ctx) => ctx.db.query("actionItems").withIndex("by_source_record_state_priority", (q) => q.eq("sourceDomain", "order").eq("sourceRecordId", String(order.orderId)).eq("state", "open")).take(20));
    const retry = await seeded.admin.mutation(api.adminOrders.recordQualityCheck, { printJobId: jobId, orderLineId: line._id, result: "problem", quantity: 2, reason: "Pogrešan rez", remakeRequested: true, commandId: "qc-bad" });
    expect(retry).toBe(qcId);
    const actionsAfterRetry = await seeded.t.run((ctx) => ctx.db.query("actionItems").withIndex("by_source_record_state_priority", (q) => q.eq("sourceDomain", "order").eq("sourceRecordId", String(order.orderId)).eq("state", "open")).take(20));
    expect(actionsAfterRetry.length).toBe(actionsBeforeRetry.length);

    const remakeJobId = await seeded.admin.mutation(api.adminOrders.createPrintJob, {
      operationId: order.operationId,
      printerId,
      lines: [{ orderLineId: line._id, quantity: 2 }],
      remakeOfQualityCheckId: qcId,
      commandId: "remake-job-1",
    });
    await seeded.admin.mutation(api.adminOrders.dispatchPrintJob, { printJobId: remakeJobId, commandId: "remake-send-1" });
    await seeded.admin.mutation(api.adminOrders.receivePrintJob, { printJobId: remakeJobId, orderLineId: line._id, quantity: 2, commandId: "remake-receive-1" });
    await seeded.admin.mutation(api.adminOrders.recordQualityCheck, { printJobId: remakeJobId, orderLineId: line._id, result: "pass", quantity: 2, remakeRequested: false, commandId: "remake-qc-pass-1" });
    const remade = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(remade?.lines[0]).toMatchObject({
      sentToPrinterCount: 2,
      receivedCount: 2,
      qcPendingCount: 0,
      qcPassedCount: 2,
      qcProblemCount: 0,
    });
    expect(remade?.operation.fulfillmentState).toBe("ready_for_delivery");
  });

  test("late-printer action closes only after the full print job is received", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded);
    await fullyPay(seeded, order.operationId, order.detail.operation.requiredMinor);
    const line = order.detail.lines[0];
    await seeded.admin.mutation(internal.adminOrders.recordSmfAssignments, {
      orderLineId: line._id,
      assignments: [
        { reference: "SMF-LATE-1", sourceRecordId: "late-source-1" },
        { reference: "SMF-LATE-2", sourceRecordId: "late-source-2" },
      ],
      actorUserId: seeded.adminId,
      commandId: "smf-late",
    });
    const printerId = await seeded.admin.mutation(api.adminOrders.savePrinter, { name: "Štampa Plus" });
    const printJobId = await seeded.admin.mutation(api.adminOrders.createPrintJob, {
      operationId: order.operationId,
      printerId,
      lines: [{ orderLineId: line._id, quantity: 2 }],
      commandId: "job-late",
    });
    await seeded.admin.mutation(api.adminOrders.dispatchPrintJob, {
      printJobId,
      expectedAt: NOW + 1_000,
      commandId: "send-late",
    });
    await seeded.admin.mutation(internal.adminOrders.flagLatePrintJobs, { now: NOW + 2_000 });
    let lateAction = await seeded.t.run((ctx) => ctx.db
      .query("actionItems")
      .withIndex("by_causeId", (q) => q.eq("causeId", stableActionCauseId("order", String(printJobId), "printer_late")))
      .unique());
    expect(lateAction?.state).toBe("open");
    vi.setSystemTime(NOW + 2_000);
    await seeded.admin.mutation(api.adminOrders.receivePrintJob, {
      printJobId,
      orderLineId: line._id,
      quantity: 2,
      commandId: "receive-late",
    });
    lateAction = await seeded.t.run((ctx) => ctx.db
      .query("actionItems")
      .withIndex("by_causeId", (q) => q.eq("causeId", stableActionCauseId("order", String(printJobId), "printer_late")))
      .unique());
    expect(lateAction?.state).toBe("resolved");
  });

  test("successful QC emits only a pending activation signal and supports multiple deliveries with honest fees", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded);
    await fullyPay(seeded, order.operationId, order.detail.operation.requiredMinor);
    const line = order.detail.lines[0];
    await seeded.admin.mutation(internal.adminOrders.recordSmfAssignments, { orderLineId: line._id, assignments: [{ reference: "SMF-A", sourceRecordId: "source-a" }, { reference: "SMF-B", sourceRecordId: "source-b" }], actorUserId: seeded.adminId, commandId: "smf-good" });
    const printerId = await seeded.admin.mutation(api.adminOrders.savePrinter, { name: "Štampa Plus" });
    const jobOne = await seeded.admin.mutation(api.adminOrders.createPrintJob, { operationId: order.operationId, printerId, lines: [{ orderLineId: line._id, quantity: 1 }], commandId: "job-good-1" });
    const jobTwo = await seeded.admin.mutation(api.adminOrders.createPrintJob, { operationId: order.operationId, printerId, lines: [{ orderLineId: line._id, quantity: 1 }], commandId: "job-good-2" });
    await expect(seeded.admin.mutation(api.adminOrders.createPrintJob, { operationId: order.operationId, printerId, lines: [{ orderLineId: line._id, quantity: 1 }], commandId: "job-client", destination: "client" } as never)).rejects.toThrow();
    for (const [jobId, suffix] of [[jobOne, "1"], [jobTwo, "2"]] as const) {
      await seeded.admin.mutation(api.adminOrders.dispatchPrintJob, { printJobId: jobId, commandId: `send-good-${suffix}` });
      await seeded.admin.mutation(api.adminOrders.receivePrintJob, { printJobId: jobId, orderLineId: line._id, quantity: 1, commandId: `receive-good-${suffix}` });
      await seeded.admin.mutation(api.adminOrders.recordQualityCheck, { printJobId: jobId, orderLineId: line._id, result: "pass", quantity: 1, remakeRequested: false, commandId: `qc-good-${suffix}` });
    }
    let detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(detail?.printJobs).toHaveLength(2);
    expect(detail?.printJobs.every((job) => job.assigneeId === seeded.adminId && job.destination === "scanme")).toBe(true);
    expect(detail?.printJobLines.every((jobLine) => JSON.stringify(jobLine.printSnapshot) === JSON.stringify(line.configSnapshot))).toBe(true);
    expect(detail?.activationSignals).toHaveLength(2);
    expect(detail?.activationSignals[0].state).toBe("pending_admin_12");
    expect(detail?.operation.fulfillmentState).toBe("ready_for_delivery");

    const firstDelivery = await seeded.admin.mutation(api.adminOrders.createDelivery, { operationId: order.operationId, method: "courier", lines: [{ orderLineId: line._id, quantity: 1 }], courierReference: "AKS-1", courierFeeMinor: 55000, commandId: "delivery-1" });
    const secondDelivery = await seeded.admin.mutation(api.adminOrders.createDelivery, { operationId: order.operationId, method: "personal", lines: [{ orderLineId: line._id, quantity: 1 }], courierFeeMinor: 0, commandId: "delivery-2" });
    await expect(seeded.admin.mutation(api.adminOrders.createDelivery, { operationId: order.operationId, method: "personal", lines: [{ orderLineId: line._id, quantity: 1 }], courierFeeMinor: 1, commandId: "bad-personal-fee" })).rejects.toThrow("admin_order_personal_delivery_fee_must_be_zero");
    for (const [deliveryId, suffix] of [[firstDelivery, "1"], [secondDelivery, "2"]] as const) {
      await seeded.admin.mutation(api.adminOrders.startDelivery, { deliveryId, commandId: `start-${suffix}` });
      if (deliveryId === firstDelivery) {
        await seeded.admin.mutation(api.adminOrders.reportDeliveryProblem, { deliveryId, reason: "Kurir nije pronašao ulaz", commandId: "delivery-problem-1" });
      }
      await seeded.admin.mutation(api.adminOrders.completeDelivery, { deliveryId, commandId: `complete-${suffix}` });
    }
    detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(detail?.operation.fulfillmentState).toBe("delivered");
    expect(detail?.operation.view).toBe("completed");
    expect(detail?.deliveries).toHaveLength(2);
    expect(detail?.deliveries.find((delivery) => delivery.method === "courier")?.courierFeePayer).toBe("client_to_courier");
    expect(detail?.deliveries.find((delivery) => delivery.method === "personal")?.personalFeeMinor).toBe(0);
    expect(detail?.deliveries.every((delivery) => delivery.businessId === seeded.businessId && delivery.recipientName === "Bistro Most Dorćol")).toBe(true);
    expect(detail?.deliveries.every((delivery) => Boolean(delivery.completedByUserId && delivery.completedAt))).toBe(true);
    const deliveryProblemAction = await seeded.t.run((ctx) => ctx.db
      .query("actionItems")
      .withIndex("by_causeId", (q) => q.eq("causeId", stableActionCauseId("order", String(firstDelivery), "delivery_problem")))
      .unique());
    expect(deliveryProblemAction?.state).toBe("resolved");
    const evidence = await seeded.t.run(async (ctx) => ({
      events: await ctx.db.query("orderEvents").withIndex("by_operationId_and_createdAt", (q) => q.eq("operationId", order.operationId)).take(100),
      cards: await ctx.db.query("cards").take(100),
      payments: await ctx.db.query("payments").withIndex("by_orderId", (q) => q.eq("orderId", order.orderId)).take(20),
    }));
    expect(evidence.events.length).toBeGreaterThan(10);
    expect(evidence.events.every((event) => event.actorUserId === seeded.adminId && event.createdAt === NOW)).toBe(true);
    expect(evidence.cards).toHaveLength(0);
    expect(evidence.payments).toHaveLength(1);
  });

  test("payment reversal never rewinds physical fulfillment", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded);
    const paymentId = await fullyPay(seeded, order.operationId, order.detail.operation.requiredMinor);
    const line = order.detail.lines[0];
    await seeded.admin.mutation(internal.adminOrders.recordSmfAssignments, { orderLineId: line._id, assignments: [{ reference: "SMF-R1", sourceRecordId: "reversal-1" }, { reference: "SMF-R2", sourceRecordId: "reversal-2" }], actorUserId: seeded.adminId, commandId: "smf-reversal" });
    const before = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(before?.operation.fulfillmentState).toBe("ready_for_printer");
    await seeded.admin.mutation(api.adminOrders.reversePayment, { paymentId, reason: "Stvarni povraćaj uplate", key: "reverse-1" });
    const after = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(after?.operation.paymentState).toBe("reversed");
    expect(after?.operation.fulfillmentState).toBe("ready_for_printer");
    expect(after?.lines[0].smfAssignedCount).toBe(2);
  });

  test("cancelled operations reject later payment and design transitions", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded, { custom: true });
    await seeded.admin.mutation(api.adminOrders.cancel, {
      operationId: order.operationId,
      reason: "Klijent je odustao pre proizvodnje",
      commandId: "cancel-before-production",
    });
    await expect(fullyPay(seeded, order.operationId, order.detail.operation.requiredMinor)).rejects.toThrow("admin_order_cancelled");
    await expect(seeded.admin.mutation(api.adminOrders.setDesignState, {
      orderLineId: order.detail.lines[0]._id,
      state: "awaiting_approval",
      commandId: "design-after-cancel",
    })).rejects.toThrow("admin_order_cancelled");

    const printable = await createOperationalOrder(seeded);
    await fullyPay(seeded, printable.operationId, printable.detail.operation.requiredMinor, "pay-printable");
    await seeded.admin.mutation(internal.adminOrders.recordSmfAssignments, {
      orderLineId: printable.detail.lines[0]._id,
      assignments: [
        { reference: "SMF-CANCEL-1", sourceRecordId: "cancel-source-1" },
        { reference: "SMF-CANCEL-2", sourceRecordId: "cancel-source-2" },
      ],
      actorUserId: seeded.adminId,
      commandId: "smf-before-cancel",
    });
    const printerId = await seeded.admin.mutation(api.adminOrders.savePrinter, { name: "Štampa Plus" });
    const jobId = await seeded.admin.mutation(api.adminOrders.createPrintJob, {
      operationId: printable.operationId,
      printerId,
      lines: [{ orderLineId: printable.detail.lines[0]._id, quantity: 2 }],
      commandId: "draft-before-cancel",
    });
    await seeded.admin.mutation(api.adminOrders.cancel, {
      operationId: printable.operationId,
      reason: "Otkazano pre slanja štampariji",
      commandId: "cancel-draft",
    });
    await expect(seeded.admin.mutation(api.adminOrders.dispatchPrintJob, {
      printJobId: jobId,
      commandId: "dispatch-after-cancel",
    })).rejects.toThrow("admin_order_cancelled");
  });
});

describe("ADMIN-11 authorization, multi-location and bounded list", () => {
  test("rejects non-admin access and cross-account task subjects", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded);
    await expect(seeded.outsider.query(api.adminOrders.list, { paginationOpts: page(), view: "active" })).rejects.toThrow("Nemate administratorski pristup");
    const line = order.detail.lines[0];
    await expect(seeded.admin.mutation(api.adminTasks.create, {
      commandId: "cross-order-line",
      accountId: seeded.otherAccountId,
      subject: { kind: "order_line", id: line._id },
      title: "Pogrešna veza",
      description: "",
      assigneeId: seeded.adminId,
      participantIds: [],
      priority: "normal",
      due: null,
    })).rejects.toThrow("admin_task_subject_cross_account");
    const linked = await seeded.admin.mutation(api.adminTasks.create, {
      commandId: "linked-order-line",
      accountId: seeded.accountId,
      subject: { kind: "order_line", id: line._id },
      title: "Proveri liniju porudžbine",
      description: "",
      assigneeId: seeded.adminId,
      participantIds: [],
      priority: "normal",
      due: null,
    });
    const detail = await seeded.admin.query(api.adminOrders.getDetail, { operationId: order.operationId });
    expect(detail?.tasks.map((task) => task._id)).toContain(linked.taskId);
  });

  test("a foreign venue blocks additive adoption instead of silently reparenting the line", async () => {
    const seeded = await seed();
    const created = await seeded.admin.mutation(api.orders.createOrder, {
      accountId: seeded.accountId,
      serviceLines: [{ businessId: seeded.businessId, service: "scanme_links", period: "monthly" }],
      physicalLines: [{ businessId: seeded.businessId, boundService: "scanme_links", selection: createDefaultProductSelection("stickers") }],
    });
    await seeded.t.run(async (ctx) => {
      const items = await ctx.db.query("orderItems").withIndex("by_orderId", (q) => q.eq("orderId", created.orderId)).take(10);
      const physical = items.find((item) => item.kind === "physical")!;
      await ctx.db.patch(physical._id, { businessId: seeded.otherBusinessId });
    });
    const result = await seeded.admin.mutation(internal.adminOrderMigrations.migrateOne, { orderId: created.orderId, assigneeId: seeded.adminId, dryRun: false });
    expect(result.status).toBe("blocked");
    expect(result.issueCodes).toContain("venue_not_migrated");
  });

  test("multi-line multi-venue order is represented without joins in the paginated list", async () => {
    const seeded = await seed();
    const order = await createOperationalOrder(seeded, { multi: true });
    expect(order.detail.lines).toHaveLength(2);
    expect(new Set(order.detail.lines.map((line) => line.businessId)).size).toBe(2);
    const result = await seeded.admin.query(api.adminOrders.list, { paginationOpts: page(1), view: "active", search: order.detail.operation.smpCode });
    expect(result.page).toHaveLength(1);
    expect(result.page[0].lineCount).toBe(2);
    expect(result.page[0].primaryBusinessName).toBeNull();
  });

  test("cursor pagination has no overlap or skipped operation", async () => {
    const seeded = await seed();
    const created = [];
    for (let index = 0; index < 3; index += 1) {
      vi.setSystemTime(NOW + index);
      created.push((await createOperationalOrder(seeded)).operationId);
    }
    const first = await seeded.admin.query(api.adminOrders.list, { paginationOpts: page(1), view: "active" });
    const second = await seeded.admin.query(api.adminOrders.list, { paginationOpts: page(1, first.continueCursor), view: "active" });
    const third = await seeded.admin.query(api.adminOrders.list, { paginationOpts: page(1, second.continueCursor), view: "active" });
    expect(new Set([...first.page, ...second.page, ...third.page].map((row) => row.id))).toEqual(new Set(created));
    const oldestFirst = await seeded.admin.query(api.adminOrders.list, { paginationOpts: page(3), view: "active", sort: "updated_asc" });
    expect(oldestFirst.page.map((row) => row.id)).toEqual(created);
  });
});

describe("ADMIN-11 pure workflow rules", () => {
  test("partial is not paid, both gates are required, and invalid fulfillment facts do not fake progress", () => {
    expect(paymentState({ requiredMinor: 1000, settledMinor: 999, reversedMinor: 0 })).toBe("awaiting_payment");
    expect(paymentState({ requiredMinor: 1000, settledMinor: 1000, reversedMinor: 0 })).toBe("paid");
    expect(canRequestProvisioning({ payment: "paid", designKind: "custom", design: "in_progress", fulfillment: "awaiting_conditions" })).toBe(false);
    expect(canRequestProvisioning({ payment: "awaiting_payment", designKind: "custom", design: "approved", fulfillment: "awaiting_conditions" })).toBe(false);
    expect(canRequestProvisioning({ payment: "paid", designKind: "custom", design: "approved", fulfillment: "awaiting_conditions" })).toBe(true);
    expect(deriveFulfillment({ cancelled: false, unitCount: 2, smfCount: 0, sentCount: 0, receivedCount: 0, qcPassedCount: 0, qcProblemCount: 0, inDeliveryCount: 0, deliveredCount: 0 })).toBe("awaiting_conditions");
  });
});
