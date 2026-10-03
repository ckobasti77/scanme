import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fairModelPath, type FairAdminIssueCode } from "../../lib/fair-contract";
import { channelsFor, refreshInventory, syncChannel, textRequired } from "./accessOperations";
import { cardResolution } from "./accessResolution";
import { writeAdminAudit } from "./adminAudit";
import { normalizeCode } from "./codes";
import { activeAssignmentForModel, fairAdminError, optionalText, requireFairEvent } from "./fairCatalog";
import { fairCardTargetProblem } from "./fairValidators";

// Sajam automobila 2026 — B1 QR inventory assignment (BACKEND-HANDOFF §5.1).
// A model gets a pre-made EXISTING QR identity (cards/accessSubjects/
// accessChannels/digitalQrCodes of the event's internal inventory business).
// Assignment = one fairQrAssignments row + a new immutable cardTargets row +
// accessDestinationHistory, in one transaction, through the same subject →
// target → channel sync the generic access flow uses. Asset ownership never
// changes. /r/[cardCode] stays the only printed route (B2 wires its fair hook).

type Ctx = QueryCtx | MutationCtx;

export async function activeAssignmentForChannel(ctx: Ctx, accessChannelId: Id<"accessChannels">) {
  return ctx.db
    .query("fairQrAssignments")
    .withIndex("by_accessChannelId_and_status", (q) => q.eq("accessChannelId", accessChannelId).eq("status", "assigned"))
    .first();
}

/** The event inventory's QR channel for a printed resolver code, or why not. */
export async function findInventoryChannel(
  ctx: Ctx,
  event: Doc<"fairEvents">,
  resolverCode: string,
): Promise<{ channel: Doc<"accessChannels"> } | { problem: FairAdminIssueCode }> {
  if (!event.qrInventoryBusinessId) return { problem: "FAIR_QR_INVENTORY_NOT_CONFIGURED" };
  const code = normalizeCode(resolverCode);
  if (!code) return { problem: "FAIR_QR_NOT_IN_INVENTORY" };
  const channel = await ctx.db.query("accessChannels").withIndex("by_resolverCode", (q) => q.eq("resolverCode", code)).first();
  if (!channel || channel.businessId !== event.qrInventoryBusinessId || channel.kind !== "qr") {
    return { problem: "FAIR_QR_NOT_IN_INVENTORY" };
  }
  return { channel };
}

/** Mirrors accessOperations.applyDestination for the fair_model destination. */
async function applyFairDestination(
  ctx: MutationCtx,
  subject: Doc<"accessSubjects">,
  eventModelId: Id<"fairEventModels">,
  actorUserId: Id<"users">,
  reason: string,
  now: number,
) {
  if (!subject.anchorCardId) fairAdminError("FAIR_QR_NOT_IN_INVENTORY", { reason: "anchor_missing" });
  const target = { cardId: subject.anchorCardId, kind: "fair_model" as const, fairEventModelId: eventModelId, createdByUserId: actorUserId, createdAt: now };
  if (fairCardTargetProblem(target)) fairAdminError("INVALID_INPUT", { field: "fairEventModelId" });
  const targetId = await ctx.db.insert("cardTargets", target);
  const patch = { currentTargetId: targetId, destinationKind: "fair_model" as const, destinationInput: { kind: "fair_model" as const, eventModelId }, updatedAt: now };
  await ctx.db.patch(subject._id, patch);
  await ctx.db.insert("accessDestinationHistory", {
    subjectId: subject._id,
    previousTargetId: subject.currentTargetId,
    targetId,
    actor: { kind: "admin", userId: actorUserId },
    reason,
    createdAt: now,
  });
  const updated = { ...subject, ...patch };
  for (const channel of await channelsFor(ctx, subject._id)) {
    await syncChannel(ctx, channel, updated, { kind: "admin", userId: actorUserId }, reason, now);
  }
  await refreshInventory(ctx, updated, now);
  return targetId;
}

/**
 * Atomic assign: at most one active assignment per channel and per model.
 * Re-assigning the same code to the same model is a no-op (idempotent).
 */
export async function assignFairQr(
  ctx: MutationCtx,
  input: { eventModelId: Id<"fairEventModels">; resolverCode: string; reason?: string },
  actorUserId: Id<"users">,
  now: number,
) {
  const model = await ctx.db.get(input.eventModelId);
  if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
  const event = await requireFairEvent(ctx, model.eventId);
  const found = await findInventoryChannel(ctx, event, input.resolverCode);
  if ("problem" in found) fairAdminError(found.problem);
  const { channel } = found;
  const channelAssignment = await activeAssignmentForChannel(ctx, channel._id);
  if (channelAssignment) {
    if (channelAssignment.eventModelId === model._id) return { assignmentId: channelAssignment._id, created: false };
    fairAdminError("FAIR_QR_ALREADY_ASSIGNED", { resolverCode: channel.resolverCode });
  }
  if (await activeAssignmentForModel(ctx, model._id)) fairAdminError("FAIR_MODEL_ALREADY_ASSIGNED");
  const subject = await ctx.db.get(channel.subjectId);
  if (!subject || subject.anchorCardId !== channel.cardId) fairAdminError("FAIR_QR_NOT_IN_INVENTORY", { reason: "mapping" });
  // A subject retargets every channel it owns; only a single-channel identity
  // can be one model's QR without dragging another printed code along.
  if ((await channelsFor(ctx, subject._id)).length !== 1) fairAdminError("FAIR_QR_SUBJECT_SHARED");
  const reason = optionalText(input.reason, "reason", 300) ?? "fair_qr_assigned";
  const assignmentId = await ctx.db.insert("fairQrAssignments", {
    eventId: event._id,
    eventModelId: model._id,
    accessChannelId: channel._id,
    accessSubjectId: subject._id,
    cardId: channel.cardId,
    resolverCode: channel.resolverCode,
    status: "assigned",
    assignedAt: now,
    assignedByUserId: actorUserId,
    reason,
  });
  const targetId = await applyFairDestination(ctx, subject, model._id, actorUserId, reason, now);
  await writeAdminAudit(ctx, {
    actorUserId,
    accountId: subject.accountId,
    businessId: subject.businessId,
    action: "fair_qr_assigned",
    detail: { channelId: channel._id, eventModelId: model._id, assignmentId, targetId, reason },
    now,
  });
  return { assignmentId, created: true };
}

/**
 * Atomic release. The immutable target stays; the released assignment row is
 * what stops the code from opening the model (accessResolution fair branch),
 * and the channel is re-synced into `problem` in the same transaction.
 */
export async function releaseFairQr(
  ctx: MutationCtx,
  input: { eventModelId: Id<"fairEventModels">; reason: string },
  actorUserId: Id<"users">,
  now: number,
) {
  const reason = textRequired(input.reason, 300);
  const assignment = await activeAssignmentForModel(ctx, input.eventModelId);
  if (!assignment) return { assignmentId: null, released: false };
  await ctx.db.patch(assignment._id, { status: "released", releasedAt: now, releasedByUserId: actorUserId, reason });
  const [channel, subject] = await Promise.all([ctx.db.get(assignment.accessChannelId), ctx.db.get(assignment.accessSubjectId)]);
  if (channel && subject) {
    await syncChannel(ctx, channel, subject, { kind: "admin", userId: actorUserId }, reason, now);
    await refreshInventory(ctx, subject, now);
  }
  await writeAdminAudit(ctx, {
    actorUserId,
    accountId: subject?.accountId,
    businessId: subject?.businessId,
    action: "fair_qr_released",
    detail: { channelId: assignment.accessChannelId, eventModelId: assignment.eventModelId, assignmentId: assignment._id, reason },
    now,
  });
  return { assignmentId: assignment._id, released: true };
}

export type FairResolveTest = {
  resolverCode: string;
  outcome: "fair_model" | "other" | "invalid";
  problem: string | null;
  channelState: Doc<"accessChannels">["state"] | null;
  targetKind: Doc<"cardTargets">["kind"] | null;
  eventModelId: Id<"fairEventModels"> | null;
  modelStatus: Doc<"fairEventModels">["status"] | null;
  assignmentId: Id<"fairQrAssignments"> | null;
  path: string | null;
};

/**
 * What /r/[cardCode] would open for this code, using the resolver's own
 * resolution (cardResolution) and gates — read-only: no scan row, no counter,
 * no channel sync. Until B2 wires the fair branch the live route still answers
 * "invalid" for fair_model; this reports the destination B2 must open.
 */
export async function fairResolveTest(ctx: Ctx, resolverCode: string): Promise<FairResolveTest> {
  const code = normalizeCode(resolverCode);
  const empty = { channelState: null, targetKind: null, eventModelId: null, modelStatus: null, assignmentId: null, path: null };
  if (!code) return { resolverCode, outcome: "invalid", problem: "code_invalid", ...empty };
  const card = await ctx.db.query("cards").withIndex("by_cardCode", (q) => q.eq("cardCode", code)).unique();
  if (!card) return { resolverCode: code, outcome: "invalid", problem: "code_unknown", ...empty };
  const { channel, target, problem } = await cardResolution(ctx, card);
  const blocked = problem
    ?? (!card.accessChannelId && card.status !== "active" ? "card_disabled" : undefined)
    ?? (channel && !channel.redirectEnabled ? "redirect_disabled" : undefined)
    ?? (channel && channel.state !== "active" ? `channel_${channel.state}` : undefined)
    ?? (!target ? "destination_missing" : undefined);
  const base = { resolverCode: code, channelState: channel?.state ?? null, targetKind: target?.kind ?? null };
  if (target?.kind !== "fair_model" || !target.fairEventModelId) {
    return { ...empty, ...base, outcome: blocked ? "invalid" : "other", problem: blocked ?? null };
  }
  const model = await ctx.db.get(target.fairEventModelId);
  const event = model ? await ctx.db.get(model.eventId) : null;
  const assignment = model ? await activeAssignmentForModel(ctx, model._id) : null;
  const path = model && event ? fairModelPath(event.slug, model.slug) : null;
  const fairProblem = blocked ?? (!model || !event ? "destination_fair_model_missing" : model.status !== "published" ? "fair_model_not_published" : undefined);
  return {
    ...base,
    outcome: fairProblem ? "invalid" : "fair_model",
    problem: fairProblem ?? null,
    eventModelId: model?._id ?? null,
    modelStatus: model?.status ?? null,
    assignmentId: assignment?._id ?? null,
    path,
  };
}
