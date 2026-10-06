import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  FAIR_QR_BULK_MAX_ROWS,
  FAIR_QR_REASON_MAX_LENGTH,
  FAIR_QR_REASON_MIN_LENGTH,
  fairModelPath,
  type FairAdminIssueCode,
} from "../../lib/fair-contract";
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
// changes. /r/[cardCode] stays the only printed route (B2 fair hook in cards.ts).

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

// -----------------------------------------------------------------------------
// A4 — QR detail, change of destination (reassign) and bulk assignment
// -----------------------------------------------------------------------------

/** A printed label of an inventory card: "SA26-001", "PANEL-2026-EVENT" (letters/digits in dash-separated parts). */
const FAIR_QR_LABEL_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const FAIR_QR_LABEL_MAX_LENGTH = 40;
/** Bound of the label lookup: one inventory business holds ~100 print codes + panels. */
export const FAIR_QR_LABEL_SCAN_LIMIT = 1000;

/** True when the typed text has the shape of a printed label (not a resolver code or an SMQ serial). */
export function isFairQrLabelText(code: string): boolean {
  const text = code.trim().toUpperCase();
  return text.length <= FAIR_QR_LABEL_MAX_LENGTH && !text.startsWith("SMQ-") && FAIR_QR_LABEL_PATTERN.test(text);
}

/**
 * A printed code as the admin types it: the 8-character resolver code, the
 * SMQ serial (`SMQ-…`) or, Izlagači 2026, the printed label of the
 * inventory card (`SA26-001`, `cards.label`), matched inside the event's
 * inventory only (bounded by FAIR_QR_LABEL_SCAN_LIMIT).
 */
export async function findInventoryCode(
  ctx: Ctx,
  event: Doc<"fairEvents">,
  code: string,
): Promise<{ channel: Doc<"accessChannels"> } | { problem: FairAdminIssueCode }> {
  if (!event.qrInventoryBusinessId) return { problem: "FAIR_QR_INVENTORY_NOT_CONFIGURED" };
  const inventoryBusinessId = event.qrInventoryBusinessId;
  const text = code.trim().toUpperCase();
  let channel: Doc<"accessChannels"> | null = null;
  if (text.startsWith("SMQ-")) {
    const digital = await ctx.db.query("digitalQrCodes").withIndex("by_smqCode", (q) => q.eq("smqCode", text)).first();
    channel = digital ? await ctx.db.get(digital.channelId) : null;
  } else {
    const resolverCode = normalizeCode(text);
    channel = resolverCode ? await ctx.db.query("accessChannels").withIndex("by_resolverCode", (q) => q.eq("resolverCode", resolverCode)).first() : null;
  }
  if (!channel && isFairQrLabelText(text)) {
    const cards = await ctx.db.query("cards").withIndex("by_businessId", (q) => q.eq("businessId", inventoryBusinessId)).take(FAIR_QR_LABEL_SCAN_LIMIT);
    const card = cards.find((row) => row.label.trim().toUpperCase() === text);
    channel = card?.accessChannelId ? await ctx.db.get(card.accessChannelId) : null;
  }
  if (!channel) return { problem: "FAIR_QR_NOT_FOUND" };
  if (channel.kind !== "qr") return { problem: "FAIR_QR_NOT_IN_INVENTORY" };
  if (channel.businessId !== event.qrInventoryBusinessId) {
    // Izlagači 2026: after the event moves to another inventory (the printed
    // SA26 one, fairExhibitorImport.linkEventQrInventory), a code of the old
    // inventory that still leads to one of its models stays reachable here:
    // its detail opens and „Ukloni vezu“ frees the model. A new assignment
    // still takes only codes of the current inventory (findInventoryChannel).
    const assignment = await activeAssignmentForChannel(ctx, channel._id);
    if (!assignment || assignment.eventId !== event._id) return { problem: "FAIR_QR_NOT_IN_INVENTORY" };
  }
  return { channel };
}

/** Reason of a change of destination: 3–300 characters after trimming. */
export function requireFairQrReason(reason: string): string {
  const text = reason.trim();
  if (text.length < FAIR_QR_REASON_MIN_LENGTH || text.length > FAIR_QR_REASON_MAX_LENGTH) {
    fairAdminError("FAIR_REASON_REQUIRED", { min: FAIR_QR_REASON_MIN_LENGTH, max: FAIR_QR_REASON_MAX_LENGTH });
  }
  return text;
}

/**
 * The checks assignFairQr makes before it writes, as a result instead of an
 * error (bulk dry run): one active assignment per channel and per model, the
 * channel is its subject's anchor and the only channel of that subject.
 */
export async function fairQrAssignCheck(
  ctx: Ctx,
  channel: Doc<"accessChannels">,
  eventModelId: Id<"fairEventModels">,
): Promise<{ status: "ok" } | { status: "unchanged" } | { status: "error"; issue: FairAdminIssueCode; assignedEventModelId?: Id<"fairEventModels"> }> {
  const channelAssignment = await activeAssignmentForChannel(ctx, channel._id);
  if (channelAssignment) {
    return channelAssignment.eventModelId === eventModelId
      ? { status: "unchanged" }
      : { status: "error", issue: "FAIR_QR_ALREADY_ASSIGNED", assignedEventModelId: channelAssignment.eventModelId };
  }
  if (await activeAssignmentForModel(ctx, eventModelId)) return { status: "error", issue: "FAIR_MODEL_ALREADY_ASSIGNED" };
  const subject = await ctx.db.get(channel.subjectId);
  if (!subject || subject.anchorCardId !== channel.cardId) return { status: "error", issue: "FAIR_QR_NOT_IN_INVENTORY" };
  if ((await channelsFor(ctx, subject._id)).length !== 1) return { status: "error", issue: "FAIR_QR_SUBJECT_SHARED" };
  return { status: "ok" };
}

/**
 * „Promeni odredište“: moves the code's active assignment to another model of
 * the same event in ONE transaction. The old row becomes `released` (with the
 * reason), the new one `assigned`, through assignFairQr (new immutable target,
 * destination history, channel sync). The channel never passes through the
 * `problem` state of a plain release. Any error throws before or during the
 * transaction, so nothing is written.
 */
export async function reassignFairQr(
  ctx: MutationCtx,
  input: { eventId: Id<"fairEvents">; code: string; toEventModelId: Id<"fairEventModels">; reason: string },
  actorUserId: Id<"users">,
  now: number,
) {
  const reason = requireFairQrReason(input.reason);
  const event = await requireFairEvent(ctx, input.eventId);
  const found = await findInventoryCode(ctx, event, input.code);
  if ("problem" in found) fairAdminError(found.problem);
  const { channel } = found;
  const current = await activeAssignmentForChannel(ctx, channel._id);
  if (!current) fairAdminError("FAIR_QR_NOT_ASSIGNED");
  if (current.eventId !== event._id) fairAdminError("FAIR_QR_OTHER_EVENT");
  const target = await ctx.db.get(input.toEventModelId);
  if (!target) fairAdminError("FAIR_MODEL_NOT_FOUND");
  if (target.eventId !== event._id) fairAdminError("FAIR_MODEL_OTHER_EVENT");
  if (target._id === current.eventModelId) fairAdminError("FAIR_QR_SAME_TARGET");
  if (await activeAssignmentForModel(ctx, target._id)) fairAdminError("FAIR_MODEL_ALREADY_ASSIGNED");
  await ctx.db.patch(current._id, { status: "released", releasedAt: now, releasedByUserId: actorUserId, reason });
  const assigned = await assignFairQr(ctx, { eventModelId: target._id, resolverCode: channel.resolverCode, reason }, actorUserId, now);
  const subject = await ctx.db.get(channel.subjectId);
  await writeAdminAudit(ctx, {
    actorUserId,
    accountId: subject?.accountId,
    businessId: subject?.businessId,
    action: "fair_qr_reassigned",
    detail: { channelId: channel._id, fromEventModelId: current.eventModelId, toEventModelId: target._id, fromAssignmentId: current._id, toAssignmentId: assigned.assignmentId, reason },
    now,
  });
  return { fromAssignmentId: current._id, toAssignmentId: assigned.assignmentId, fromEventModelId: current.eventModelId, toEventModelId: target._id };
}

export type FairQrBulkInputRow = { code: string; model: string };
export type FairQrBulkPlanRow = {
  index: number;
  code: string;
  model: string;
  status: "ok" | "unchanged" | "error";
  issue?: FairAdminIssueCode;
  resolverCode?: string;
  smqCode?: string;
  eventModelId?: Id<"fairEventModels">;
  /** FAIR_QR_ALREADY_ASSIGNED: the model that holds the code now. */
  assignedEventModelId?: Id<"fairEventModels">;
};

const BULK_CODE_MAX = 64;
const BULK_MODEL_MAX = 120;

/** A model of the event by its `externalKey` or its Convex id. */
async function findBulkModel(ctx: Ctx, eventId: Id<"fairEvents">, text: string): Promise<{ model: Doc<"fairEventModels"> } | { problem: FairAdminIssueCode }> {
  const byKey = await ctx.db
    .query("fairEventModels")
    .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", eventId).eq("externalKey", text.toLowerCase()))
    .first();
  if (byKey) return { model: byKey };
  const id = ctx.db.normalizeId("fairEventModels", text);
  const model = id ? await ctx.db.get(id) : null;
  if (!model) return { problem: "FAIR_MODEL_NOT_FOUND" };
  return model.eventId === eventId ? { model } : { problem: "FAIR_MODEL_OTHER_EVENT" };
}

/**
 * Plan of a pasted list of (code, model) pairs, one result per row in input
 * order. A code or a model that appears in more than one row is an error in
 * every such row: which sticker belongs to which car is then not clear. The
 * same plan runs in the dry run and again inside the commit transaction.
 */
export async function planBulkQrAssign(ctx: Ctx, event: Doc<"fairEvents">, rows: readonly FairQrBulkInputRow[]) {
  if (!event.qrInventoryBusinessId) fairAdminError("FAIR_QR_INVENTORY_NOT_CONFIGURED");
  if (rows.length > FAIR_QR_BULK_MAX_ROWS) fairAdminError("FAIR_BULK_TOO_LARGE", { max: FAIR_QR_BULK_MAX_ROWS });
  const resolved: { row: FairQrBulkPlanRow; channel?: Doc<"accessChannels">; model?: Doc<"fairEventModels"> }[] = [];
  for (const [index, input] of rows.entries()) {
    const code = input.code.trim();
    const model = input.model.trim();
    const row: FairQrBulkPlanRow = { index, code, model, status: "error" };
    if (!code || !model || code.length > BULK_CODE_MAX || model.length > BULK_MODEL_MAX) {
      resolved.push({ row: { ...row, issue: "FAIR_BULK_ROW_INVALID" } });
      continue;
    }
    const foundCode = await findInventoryCode(ctx, event, code);
    const foundModel = await findBulkModel(ctx, event._id, model);
    const channel = "channel" in foundCode ? foundCode.channel : undefined;
    const target = "model" in foundModel ? foundModel.model : undefined;
    if (channel) Object.assign(row, { resolverCode: channel.resolverCode, ...(channel.smqCode ? { smqCode: channel.smqCode } : {}) });
    if (target) row.eventModelId = target._id;
    const issue = "problem" in foundCode ? foundCode.problem : "problem" in foundModel ? foundModel.problem : undefined;
    resolved.push({ row: issue ? { ...row, issue } : row, channel, model: target });
  }
  const codeUses = new Map<string, number>();
  const modelUses = new Map<string, number>();
  for (const { channel, model } of resolved) {
    if (channel) codeUses.set(channel._id, (codeUses.get(channel._id) ?? 0) + 1);
    if (model) modelUses.set(model._id, (modelUses.get(model._id) ?? 0) + 1);
  }
  const planned: FairQrBulkPlanRow[] = [];
  for (const { row, channel, model } of resolved) {
    if (row.issue || !channel || !model) {
      planned.push(row);
      continue;
    }
    if ((codeUses.get(channel._id) ?? 0) > 1) {
      planned.push({ ...row, issue: "FAIR_BULK_DUPLICATE_CODE" });
      continue;
    }
    if ((modelUses.get(model._id) ?? 0) > 1) {
      planned.push({ ...row, issue: "FAIR_BULK_DUPLICATE_MODEL" });
      continue;
    }
    const check = await fairQrAssignCheck(ctx, channel, model._id);
    if (check.status === "error") {
      planned.push({ ...row, issue: check.issue, ...(check.assignedEventModelId ? { assignedEventModelId: check.assignedEventModelId } : {}) });
    } else {
      planned.push({ ...row, status: check.status });
    }
  }
  const summary = {
    ok: planned.filter((row) => row.status === "ok").length,
    unchanged: planned.filter((row) => row.status === "unchanged").length,
    errors: planned.filter((row) => row.status === "error").length,
  };
  return { rows: planned, summary };
}

/** Applies only the `ok` rows of a fresh plan; a repeated commit finds them `unchanged`. */
export async function commitBulkQrAssign(
  ctx: MutationCtx,
  event: Doc<"fairEvents">,
  rows: readonly FairQrBulkInputRow[],
  reason: string | undefined,
  actorUserId: Id<"users">,
  now: number,
) {
  const plan = await planBulkQrAssign(ctx, event, rows);
  const assignReason = optionalText(reason, "reason", FAIR_QR_REASON_MAX_LENGTH) ?? "fair_qr_bulk_assigned";
  const results: { index: number; status: "applied" | "unchanged" | "error"; issue?: FairAdminIssueCode }[] = [];
  for (const row of plan.rows) {
    if (row.status === "ok" && row.eventModelId && row.resolverCode) {
      await assignFairQr(ctx, { eventModelId: row.eventModelId, resolverCode: row.resolverCode, reason: assignReason }, actorUserId, now);
      results.push({ index: row.index, status: "applied" });
    } else {
      results.push({ index: row.index, status: row.status === "unchanged" ? "unchanged" : "error", ...(row.issue ? { issue: row.issue } : {}) });
    }
  }
  const summary = {
    applied: results.filter((row) => row.status === "applied").length,
    unchanged: plan.summary.unchanged,
    errors: plan.summary.errors,
  };
  if (summary.applied) {
    await writeAdminAudit(ctx, { actorUserId, businessId: event.qrInventoryBusinessId, action: "fair_qr_bulk_assigned", detail: { eventId: event._id, ...summary, reason: assignReason }, now });
  }
  return { rows: results, summary };
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
 * no channel sync. The live route opens the same path through the B2 fair
 * branch of cards.resolveAndRecord (convex/lib/fairScans.ts openableFairModel).
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
