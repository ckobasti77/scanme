import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { accessDestinationInput, accessHealth, accessKind, accessState, ACCESS_BATCH, PROVISION_BATCH, SUBJECT_CHANNEL_LIMIT } from "./lib/accessValidators";
import { accessDisplayContext, applyDestination, assertDestinationHealthy, channelProjectionPatch, channelsFor, createChannel, fingerprint, prepareDestination, refreshInventory, remember, replay, requireScope, subjectInScope, syncChannel, textRequired, uniqueCode } from "./lib/accessOperations";
import { channelProblem } from "./lib/accessResolution";
import { getOrderLine, refreshOperation } from "./lib/adminOrderOperations";
import { isDesignReady } from "../lib/admin-v1/order-workflow";
import { writeAdminAudit } from "./lib/adminAudit";
import { syncAutomaticAction } from "./lib/adminActionEngine";

const scope = { accountId: v.id("accounts"), businessId: v.id("businesses") };
const provisionArgs = { ...scope, requestId: v.id("orderProvisioningRequests"), expectedOffset: v.number(), channels: v.array(accessKind), destination: v.optional(accessDestinationInput), key: v.string() };

type ChannelStateChange = {
  state: Doc<"accessChannels">["state"];
  health?: Doc<"accessChannels">["health"];
  reason: string;
  resolutionNote?: string;
};

async function prepareChannelStateChange(
  ctx: MutationCtx,
  channel: Doc<"accessChannels">,
  subject: Doc<"accessSubjects">,
  input: ChannelStateChange,
) {
  if (channel.state === "problem" && input.state !== "problem" && !input.resolutionNote?.trim()) {
    throw new ConvexError("access_resolution_note_required");
  }
  if (channel.state === "problem" && input.state !== "problem" && channel.resumeState && input.state !== channel.resumeState) {
    throw new ConvexError("access_restore_previous_state_required");
  }
  const changed = {
    ...channel,
    health: input.health ?? channel.health,
    redirectEnabled: input.state === "problem" ? channel.redirectEnabled : input.state === "active",
    manualProblem: input.state === "problem" ? input.reason : undefined,
  };
  if (input.state !== "problem") {
    const target = subject.currentTargetId ? await ctx.db.get(subject.currentTargetId) : null;
    const problem = await channelProblem(ctx, changed, subject, target);
    if (problem) throw new ConvexError(problem);
  }
  return changed;
}

function validSelectedProducts(productIds: Id<"physicalProducts">[]) {
  return productIds.length >= 1 && productIds.length <= ACCESS_BATCH && new Set(productIds).size === productIds.length;
}

/** Keep operational failures outside the rolled-back unit creation transaction. */
export const provision = mutation({
  args: provisionArgs,
  returns: v.object({ productIds: v.array(v.id("physicalProducts")), problemReason: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ productIds: Id<"physicalProducts">[]; problemReason?: string }> => {
    const actor = await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("access_provision_request_missing");
    const line = await getOrderLine(ctx, request.orderLineId);
    if (line.accountId !== args.accountId || line.businessId !== args.businessId || line.operationId !== request.operationId) throw new ConvexError("access_cross_account_venue");
    const payload = { operation: "provision", ...args };
    const prior = await replay(ctx, args.key, payload);
    if (prior && !prior.failureReason) return { productIds: prior.productIds };
    let productIds: Id<"physicalProducts">[] = [];
    let problemReason: string | undefined;
    try {
      productIds = await ctx.runMutation(internal.adminProducts.provisionUnits, args);
    } catch (error) {
      const reason = error instanceof ConvexError && typeof error.data === "string" ? error.data : undefined;
      const operational = ["access_code_collision", "access_provision_conditions_not_met", "access_provision_legacy_assignments_conflict", "access_provision_ordinal_collision", "access_design_snapshot_missing"];
      if (!reason || !operational.includes(reason)) throw error;
      problemReason = reason;
      await remember(ctx, args.key, payload, { failureReason: reason });
    }
    const now = Date.now();
    const changed = request.accessProblem !== problemReason;
    if (changed) {
      await ctx.db.patch(request._id, { accessProblem: problemReason, accessProblemAt: now });
      await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: problemReason ? "access_provision_failed" : "access_provision_recovered", detail: { requestId: request._id, problemReason, key: args.key }, now });
    }
    await syncAutomaticAction(ctx, {
      domain: "order", sourceRecordId: request._id, causeKind: "access_provision", sourceVersion: problemReason ?? "ready",
      isOpen: !!problemReason, accountId: args.accountId, businessId: args.businessId, severity: "blocking",
      relevantAt: changed ? now : request.accessProblemAt ?? request.createdAt,
      priority: { blocking: true, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "scanme" },
    }, now);
    return { productIds, problemReason };
  },
});

/** One bounded chunk per command; request+ordinal remains the lifetime key. */
export const provisionUnits = internalMutation({
  args: provisionArgs,
  returns: v.array(v.id("physicalProducts")),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const payload = { operation: "provision", ...args };
    const prior = await replay(ctx, args.key, payload);
    if (prior && !prior.failureReason) return prior.productIds;
    if (!args.channels.length || args.channels.length > 2 || new Set(args.channels).size !== args.channels.length) throw new ConvexError("access_channel_required");
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("access_provision_request_missing");
    const line = await getOrderLine(ctx, request.orderLineId);
    if (line.accountId !== args.accountId || line.businessId !== args.businessId || line.operationId !== request.operationId) throw new ConvexError("access_cross_account_venue");
    const now = Date.now();
    const operation = await refreshOperation(ctx, request.operationId, actor._id, now);
    if (!operation.provisioningReady || operation.cancelledAt !== undefined || !isDesignReady(line.designKind, line.designState) || request.quantity !== line.quantity) throw new ConvexError("access_provision_conditions_not_met");
    const configuration = fingerprint({ channels: [...args.channels].sort(), destination: args.destination });
    if (request.accessFingerprint && request.accessFingerprint !== configuration) throw new ConvexError("access_provision_payload_mismatch");
    const offset = request.createdCount ?? 0;
    if (line.smfAssignedCount !== offset) throw new ConvexError("access_provision_legacy_assignments_conflict");
    if (args.expectedOffset !== offset || !Number.isSafeInteger(offset)) throw new ConvexError("access_provision_offset_mismatch");
    const count = Math.min(PROVISION_BATCH, request.quantity - offset);
    if (count <= 0) { await remember(ctx, args.key, payload); return []; }
    let designSnapshot = line.configSnapshot;
    if (line.designKind === "custom") {
      const approval = line.approvedSnapshotId ? await ctx.db.get(line.approvedSnapshotId) : null;
      if (!approval || approval.orderLineId !== line._id || approval.revision !== line.designRevision) throw new ConvexError("access_design_snapshot_missing");
      designSnapshot = approval.snapshot;
    }
    const prepared = args.destination ? await prepareDestination(ctx, line.businessId, args.destination) : null;
    const displayContext = await accessDisplayContext(ctx, args.accountId, args.businessId);
    const products: Id<"physicalProducts">[] = [];
    for (let ordinal = offset; ordinal < offset + count; ordinal++) {
      const existing = await ctx.db.query("physicalProducts").withIndex("by_provisioningRequestId_and_unitOrdinal", q => q.eq("provisioningRequestId", request._id).eq("unitOrdinal", ordinal)).unique();
      if (existing) throw new ConvexError("access_provision_ordinal_collision");
      const smfCode = await uniqueCode(ctx, "SMF");
      const subjectId = await ctx.db.insert("accessSubjects", { accountId: args.accountId, businessId: args.businessId, destinationKind: "legacy", createdAt: now, updatedAt: now });
      const productId = await ctx.db.insert("physicalProducts", {
        accountId: args.accountId, businessId: args.businessId, subjectId, smfCode, localSuffix: smfCode.slice(4),
        orderId: line.orderId, orderLineId: line._id, provisioningRequestId: request._id, unitOrdinal: ordinal,
        productType: line.productType, designSnapshot, designApprovalId: line.approvedSnapshotId, boundServices: line.boundServices,
        qc: "pending", createdByUserId: actor._id, createdAt: now, updatedAt: now,
      });
      await ctx.db.patch(subjectId, { physicalProductId: productId });
      for (const kind of args.channels) {
        const subject = (await ctx.db.get(subjectId))!;
        const created = await createChannel(ctx, subject, kind, actor._id, now, undefined, displayContext);
        await ctx.db.patch(created.channelId, {
          smfCode,
          ...channelProjectionPatch({ resolverCode: created.resolverCode, smfCode, kind }, displayContext),
        });
      }
      const subject = (await ctx.db.get(subjectId))!;
      if (prepared && args.destination) await applyDestination(ctx, subject, args.destination, prepared, actor._id, "provisioned", now);
      else {
        for (const channel of await channelsFor(ctx, subjectId)) await syncChannel(ctx, channel, subject, { kind: "admin", userId: actor._id }, "provisioned", now);
        await refreshInventory(ctx, subject, now);
      }
      await ctx.db.insert("orderSmfReferences", { operationId: operation._id, orderLineId: line._id, reference: smfCode, sourceRecordId: productId, assignedAt: now });
      await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: "physical_product_created", detail: { productId, smfCode, requestId: request._id, ordinal }, now });
      products.push(productId);
    }
    await ctx.db.patch(request._id, { state: offset + count === request.quantity ? "fulfilled" : "in_progress", accessFingerprint: configuration, createdCount: offset + count, completedAt: offset + count === request.quantity ? now : undefined });
    await ctx.db.patch(line._id, { smfAssignedCount: line.smfAssignedCount + count, updatedAt: now });
    await ctx.db.insert("orderEvents", { operationId: operation._id, orderId: operation.orderId, kind: "smf_assigned", axis: "fulfillment", commandId: `admin12:${args.key}`, actorUserId: actor._id, fromValue: String(line.smfAssignedCount), toValue: String(line.smfAssignedCount + count), createdAt: now });
    await refreshOperation(ctx, operation._id, actor._id, now);
    await remember(ctx, args.key, payload, { productIds: products });
    return products;
  },
});

export const createDigital = mutation({
  args: { ...scope, destination: v.optional(accessDestinationInput), key: v.string() },
  returns: v.id("digitalQrCodes"),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const payload = { operation: "digital", ...args };
    const prior = await replay(ctx, args.key, payload);
    if (prior?.digitalQrId) return prior.digitalQrId;
    const now = Date.now();
    const smqCode = await uniqueCode(ctx, "SMQ");
    const subjectId = await ctx.db.insert("accessSubjects", { accountId: args.accountId, businessId: args.businessId, destinationKind: "legacy", createdAt: now, updatedAt: now });
    const displayContext = await accessDisplayContext(ctx, args.accountId, args.businessId);
    const channel = await createChannel(ctx, (await ctx.db.get(subjectId))!, "qr", actor._id, now, undefined, displayContext);
    const digitalQrId = await ctx.db.insert("digitalQrCodes", { accountId: args.accountId, businessId: args.businessId, smqCode, channelId: channel.channelId, originalSubjectId: subjectId, createdByUserId: actor._id, createdAt: now });
    await ctx.db.patch(subjectId, { digitalQrId });
    await ctx.db.patch(channel.channelId, {
      digitalQrId,
      smqCode,
      health: "healthy",
      redirectEnabled: true,
      ...channelProjectionPatch({ resolverCode: channel.resolverCode, smqCode, kind: "qr" }, displayContext),
    });
    const subject = (await ctx.db.get(subjectId))!;
    if (args.destination) await applyDestination(ctx, subject, args.destination, await prepareDestination(ctx, args.businessId, args.destination), actor._id, "digital_created", now);
    else await syncChannel(ctx, (await ctx.db.get(channel.channelId))!, subject, { kind: "admin", userId: actor._id }, "digital_created", now);
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: "digital_qr_created", detail: { digitalQrId, smqCode }, now });
    await remember(ctx, args.key, payload, { digitalQrId });
    return digitalQrId;
  },
});

/** Recheck external source changes without a scan or a per-row list query. */
export const refreshChannels = mutation({
  args: { ...scope, channelIds: v.array(v.id("accessChannels")) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    if (!args.channelIds.length || args.channelIds.length > ACCESS_BATCH || new Set(args.channelIds).size !== args.channelIds.length) throw new ConvexError("access_batch_invalid");
    const rows = [];
    for (const id of args.channelIds) {
      const channel = await ctx.db.get(id);
      if (!channel || channel.accountId !== args.accountId || channel.businessId !== args.businessId) throw new ConvexError("access_cross_account_venue");
      const subject = await subjectInScope(ctx, channel.subjectId, args.accountId, args.businessId);
      rows.push({ channel, subject });
    }
    const now = Date.now();
    let changed = 0;
    const refreshed = new Set<Id<"accessSubjects">>();
    for (const { channel, subject } of rows) {
      const result = await syncChannel(ctx, channel, subject, { kind: "admin", userId: actor._id }, "source_revalidated", now);
      if (result.state !== channel.state || result.problemReason !== channel.problemReason) {
        changed++;
        refreshed.add(subject._id);
      }
    }
    for (const subjectId of refreshed) await refreshInventory(ctx, rows.find(row => row.subject._id === subjectId)!.subject, now);
    if (changed) await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: "access_sources_revalidated", detail: { channelIds: args.channelIds, changed }, now });
    return changed;
  },
});

/** All selected products/channels resolve to a deduplicated set of subjects. */
export const bulkRetarget = mutation({
  args: { ...scope, productIds: v.array(v.id("physicalProducts")), channelIds: v.array(v.id("accessChannels")), destination: accessDestinationInput, reason: v.string(), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const payload = { operation: "retarget", ...args };
    if (await replay(ctx, args.key, payload)) return null;
    textRequired(args.reason);
    const count = args.productIds.length + args.channelIds.length;
    if (count < 1 || count > ACCESS_BATCH || new Set(args.productIds).size !== args.productIds.length || new Set(args.channelIds).size !== args.channelIds.length) throw new ConvexError("access_bulk_size_invalid");
    const subjects = new Map<Id<"accessSubjects">, Doc<"accessSubjects">>();
    for (const id of args.productIds) {
      const product = await ctx.db.get(id);
      if (!product) throw new ConvexError("access_product_missing");
      const subject = await subjectInScope(ctx, product.subjectId, args.accountId, args.businessId);
      subjects.set(subject._id, subject);
    }
    for (const id of args.channelIds) {
      const channel = await ctx.db.get(id);
      if (!channel) throw new ConvexError("access_channel_missing");
      const subject = await subjectInScope(ctx, channel.subjectId, args.accountId, args.businessId);
      subjects.set(subject._id, subject);
    }
    const prepared = await prepareDestination(ctx, args.businessId, args.destination);
    for (const subject of subjects.values()) await assertDestinationHealthy(ctx, subject, prepared, args.destination);
    for (const subject of subjects.values()) await applyDestination(ctx, subject, args.destination, prepared, actor._id, args.reason, Date.now());
    await remember(ctx, args.key, payload);
    return null;
  },
});

export const setChannelState = mutation({
  args: { ...scope, channelId: v.id("accessChannels"), state: accessState, health: v.optional(accessHealth), reason: v.string(), resolutionNote: v.optional(v.string()), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new ConvexError("access_channel_missing");
    const subject = await subjectInScope(ctx, channel.subjectId, args.accountId, args.businessId);
    const payload = { operation: "channel_state", ...args };
    if (await replay(ctx, args.key, payload)) return null;
    const reason = textRequired(args.reason);
    const changed = await prepareChannelStateChange(ctx, channel, subject, { state: args.state, health: args.health, reason, resolutionNote: args.resolutionNote });
    const now = Date.now();
    await syncChannel(ctx, changed, subject, { kind: "admin", userId: actor._id }, args.resolutionNote?.trim() || reason, now);
    await refreshInventory(ctx, subject, now);
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: "access_channel_changed", detail: { channelId: channel._id, from: channel.state, to: args.state, reason, resolutionNote: args.resolutionNote }, now });
    await remember(ctx, args.key, payload);
    return null;
  },
});

/**
 * Applies one status command only to channels that already exist on the
 * selected physical products. Missing QR/NFC hardware is never provisioned
 * implicitly by a bulk status action.
 */
export const bulkSetChannelState = mutation({
  args: { ...scope, productIds: v.array(v.id("physicalProducts")), kinds: v.array(accessKind), state: accessState, health: v.optional(accessHealth), reason: v.string(), resolutionNote: v.optional(v.string()), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const payload = { operation: "bulk_channel_state", ...args };
    if (await replay(ctx, args.key, payload)) return null;
    if (!validSelectedProducts(args.productIds) || !args.kinds.length || args.kinds.length > 2 || new Set(args.kinds).size !== args.kinds.length) {
      throw new ConvexError("access_bulk_size_invalid");
    }
    const reason = textRequired(args.reason);
    const selected: { product: Doc<"physicalProducts">; subject: Doc<"accessSubjects"> }[] = [];
    for (const productId of args.productIds) {
      const product = await ctx.db.get(productId);
      if (!product) throw new ConvexError("access_product_missing");
      selected.push({ product, subject: await subjectInScope(ctx, product.subjectId, args.accountId, args.businessId) });
    }
    const targets: { channel: Doc<"accessChannels">; subject: Doc<"accessSubjects">; productId: Id<"physicalProducts"> }[] = [];
    for (const { product, subject } of selected) {
      for (const channel of await channelsFor(ctx, subject._id)) {
        if (args.kinds.includes(channel.kind)) targets.push({ channel, subject, productId: product._id });
      }
    }
    if (!targets.length) throw new ConvexError("access_bulk_channel_absent");
    if (targets.length > ACCESS_BATCH) throw new ConvexError("access_bulk_channel_size_invalid");
    const changes = [];
    for (const target of targets) {
      changes.push({ ...target, changed: await prepareChannelStateChange(ctx, target.channel, target.subject, { state: args.state, health: args.health, reason, resolutionNote: args.resolutionNote }) });
    }
    const now = Date.now();
    const refreshed = new Map<Id<"accessSubjects">, Doc<"accessSubjects">>();
    for (const change of changes) {
      await syncChannel(ctx, change.changed, change.subject, { kind: "admin", userId: actor._id }, args.resolutionNote?.trim() || reason, now);
      refreshed.set(change.subject._id, change.subject);
    }
    for (const subject of refreshed.values()) await refreshInventory(ctx, subject, now);
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: "access_channels_bulk_changed", detail: { productIds: args.productIds, kinds: args.kinds, state: args.state, health: args.health, reason, resolutionNote: args.resolutionNote, channelIds: targets.map((target) => target.channel._id) }, now });
    await remember(ctx, args.key, payload);
    return null;
  },
});

/** One placement interval per selected real SMF unit; all ownership checks run before writes. */
export const bulkChangePlacement = mutation({
  args: { ...scope, productIds: v.array(v.id("physicalProducts")), name: v.string(), reason: v.string(), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await requireScope(ctx, args.accountId, args.businessId);
    const payload = { operation: "bulk_placement", ...args };
    if (await replay(ctx, args.key, payload)) return null;
    if (!validSelectedProducts(args.productIds)) throw new ConvexError("access_bulk_size_invalid");
    const name = textRequired(args.name, 80);
    const reason = textRequired(args.reason);
    const selected: { product: Doc<"physicalProducts">; subject: Doc<"accessSubjects">; previous: Doc<"productPlacements"> | null }[] = [];
    for (const productId of args.productIds) {
      const product = await ctx.db.get(productId);
      if (!product) throw new ConvexError("access_product_missing");
      const subject = await subjectInScope(ctx, product.subjectId, args.accountId, args.businessId);
      const previous = subject.currentPlacementId ? await ctx.db.get(subject.currentPlacementId) : null;
      if (subject.currentPlacementId && (!previous || previous.endedAt !== undefined || previous.productId !== product._id)) {
        throw new ConvexError("access_placement_interval_invalid");
      }
      selected.push({ product, subject, previous });
    }
    const now = Date.now();
    const placements: { productId: Id<"physicalProducts">; previousPlacementId: Id<"productPlacements"> | undefined; placementId: Id<"productPlacements"> }[] = [];
    for (const { product, subject, previous } of selected) {
      if (previous) await ctx.db.patch(previous._id, { endedAt: now });
      const placementId = await ctx.db.insert("productPlacements", { productId: product._id, businessId: product.businessId, name, startedAt: now, actor: { kind: "admin", userId: actor._id }, reason });
      await ctx.db.patch(subject._id, { currentPlacementId: placementId, updatedAt: now });
      await refreshInventory(ctx, { ...subject, currentPlacementId: placementId }, now);
      placements.push({ productId: product._id, previousPlacementId: previous?._id, placementId });
    }
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: "product_placements_bulk_changed", detail: { placements, name, reason }, now });
    await remember(ctx, args.key, payload);
    return null;
  },
});

export const changePlacement = mutation({
  args: { ...scope, productId: v.id("physicalProducts"), name: v.string(), reason: v.string(), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError("access_product_missing");
    const subject = await subjectInScope(ctx, product.subjectId, args.accountId, args.businessId);
    const payload = { operation: "placement", ...args };
    if (await replay(ctx, args.key, payload)) return null;
    const name = textRequired(args.name, 80);
    const now = Date.now();
    if (subject.currentPlacementId) {
      const previous = await ctx.db.get(subject.currentPlacementId);
      if (!previous || previous.endedAt !== undefined || previous.productId !== product._id) throw new ConvexError("access_placement_interval_invalid");
      await ctx.db.patch(previous._id, { endedAt: now });
    }
    const placementId = await ctx.db.insert("productPlacements", { productId: product._id, businessId: product.businessId, name, startedAt: now, actor: { kind: "admin", userId: actor._id }, reason: args.reason.trim() });
    await ctx.db.patch(subject._id, { currentPlacementId: placementId, updatedAt: now });
    await refreshInventory(ctx, { ...subject, currentPlacementId: placementId }, now);
    await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: "product_placement_changed", detail: { productId: product._id, previousPlacementId: subject.currentPlacementId, placementId, reason: args.reason }, now });
    await remember(ctx, args.key, payload);
    return null;
  },
});

export const linkDigital = mutation({
  args: { ...scope, digitalQrId: v.id("digitalQrCodes"), productId: v.id("physicalProducts"), reason: v.string(), key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    const digital = await ctx.db.get(args.digitalQrId);
    if (!product || !digital) throw new ConvexError("access_link_subject_missing");
    const subject = await subjectInScope(ctx, product.subjectId, args.accountId, args.businessId);
    if (digital.accountId !== args.accountId || digital.businessId !== args.businessId) throw new ConvexError("access_cross_account_venue");
    const payload = { operation: "link", ...args };
    if (await replay(ctx, args.key, payload)) return null;
    textRequired(args.reason);
    if (digital.linkedProductId && digital.linkedProductId !== product._id) throw new ConvexError("access_already_linked");
    if (!digital.linkedProductId) {
      const channels = await channelsFor(ctx, subject._id);
      if (channels.length >= SUBJECT_CHANNEL_LIMIT) throw new ConvexError("access_channel_limit");
      const now = Date.now();
      const channel = await ctx.db.get(digital.channelId);
      if (!channel || channel.subjectId !== digital.originalSubjectId) throw new ConvexError("access_link_mapping_invalid");
      // Retain the original subject/targets/events; only future resolution and
      // future attribution use the product's one current destination.
      const displayContext = await accessDisplayContext(ctx, args.accountId, args.businessId);
      await ctx.db.patch(channel._id, {
        subjectId: subject._id,
        physicalProductId: product._id,
        smfCode: product.smfCode,
        binding: "physical",
        ...channelProjectionPatch({ resolverCode: channel.resolverCode, smfCode: product.smfCode, smqCode: digital.smqCode, kind: channel.kind }, displayContext),
        updatedAt: now,
      });
      await ctx.db.patch(digital._id, { linkedProductId: product._id, linkedAt: now, linkedByUserId: actor._id });
      await syncChannel(ctx, (await ctx.db.get(channel._id))!, subject, { kind: "admin", userId: actor._id }, args.reason, now);
      await refreshInventory(ctx, subject, now);
      await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: args.accountId, businessId: args.businessId, action: "digital_qr_linked", detail: { digitalQrId: digital._id, productId: product._id, originalSubjectId: digital.originalSubjectId, subjectId: subject._id, reason: args.reason }, now });
    }
    await remember(ctx, args.key, payload);
    return null;
  },
});
