import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  FAIR_QR_BULK_MAX_ROWS,
  FAIR_QR_REASON_MAX_LENGTH,
  FAIR_QR_REASON_MIN_LENGTH,
  FAIR_QR_UNDO_WINDOW_MS,
  fairModelPath,
  type FairAdminIssueCode,
  type FairQrKind,
} from "../../lib/fair-contract";
import {
  FAIR_QR_LABEL_DEFAULT_FORMAT,
  normalizeFairQrLabel,
  parseFairQrSerialLabel,
  type FairQrLabelFormat,
} from "../../lib/fair-qr-label";
import { getDict } from "../../lib/i18n";
import { channelsFor, refreshInventory, syncChannel, textRequired } from "./accessOperations";
import { cardResolution } from "./accessResolution";
import { writeAdminAudit } from "./adminAudit";
import { normalizeCode } from "./codes";
import { activeAssignmentForModel, fairAdminError, optionalText, requireFairEvent } from "./fairCatalog";
import { fairSessionAdminUserId } from "./fairScans";
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

// -----------------------------------------------------------------------------
// N1 — a typed code: resolver code, SMQ serial or printed label (`SA26-007`)
// -----------------------------------------------------------------------------

/** Label groups the series probe reads at most: a series is one group, every other label (panels, resolver codes) one. */
const FAIR_QR_LABEL_FORMAT_PROBES = 24;
/** Longest text taken as a code (an SMQ serial is far shorter). */
const FAIR_QR_CODE_MAX_LENGTH = 64;

/**
 * The sticker series of an inventory (prefix, number width, highest number),
 * derived from its labels through `cards.by_businessId_and_label`: a loose
 * index scan reads the first label of each group and, for a series, its last
 * label — never every card. No series → FAIR_QR_LABEL_DEFAULT_FORMAT.
 */
export async function fairQrLabelFormatOf(ctx: Ctx, businessId: Id<"businesses"> | undefined): Promise<FairQrLabelFormat> {
  if (!businessId) return FAIR_QR_LABEL_DEFAULT_FORMAT;
  let best: FairQrLabelFormat | null = null;
  let after: string | null = null;
  for (let probe = 0; probe < FAIR_QR_LABEL_FORMAT_PROBES; probe += 1) {
    const from: string | null = after;
    const card = await ctx.db
      .query("cards")
      .withIndex("by_businessId_and_label", (q) => (from === null ? q.eq("businessId", businessId) : q.eq("businessId", businessId).gt("label", from)))
      .first();
    if (!card) break;
    const serial = card.label === card.label.trim().toUpperCase() ? parseFairQrSerialLabel(card.label) : null;
    if (!serial) {
      after = card.label;
      continue;
    }
    // Every label of the series sorts between `<prefix>-0` and `<prefix>-:` (":" follows "9").
    const last = await ctx.db
      .query("cards")
      .withIndex("by_businessId_and_label", (q) => q.eq("businessId", businessId).gte("label", `${serial.prefix}-0`).lt("label", `${serial.prefix}-:`))
      .order("desc")
      .first();
    const top = (last && parseFairQrSerialLabel(last.label)) ?? serial;
    if (!best || top.number > best.max) best = { prefix: serial.prefix, digits: top.digits, max: top.number };
    after = `${serial.prefix}-:`;
  }
  return best ?? FAIR_QR_LABEL_DEFAULT_FORMAT;
}

/**
 * The QR channel of a typed code: the SMQ serial or the 8-character resolver
 * code (both global; the caller checks the inventory), else the printed label
 * of a card of `inventoryBusinessId` — a sticker number in that inventory's
 * series (`7`, `sa26 7`, `SA26_007` → `SA26-007`, normalizeFairQrLabel) or
 * any other label typed whole (a panel). One indexed read per candidate.
 */
async function lookupQrChannel(ctx: Ctx, inventoryBusinessId: Id<"businesses">, code: string): Promise<Doc<"accessChannels"> | null> {
  const text = code.trim().toUpperCase();
  if (!text || text.length > FAIR_QR_CODE_MAX_LENGTH) return null;
  if (text.startsWith("SMQ-")) {
    const digital = await ctx.db.query("digitalQrCodes").withIndex("by_smqCode", (q) => q.eq("smqCode", text)).first();
    return digital ? ctx.db.get(digital.channelId) : null;
  }
  const resolverCode = normalizeCode(text);
  if (resolverCode) {
    const channel = await ctx.db.query("accessChannels").withIndex("by_resolverCode", (q) => q.eq("resolverCode", resolverCode)).first();
    if (channel) return channel;
  }
  const sticker = normalizeFairQrLabel(text, await fairQrLabelFormatOf(ctx, inventoryBusinessId));
  for (const label of new Set([sticker, isFairQrLabelText(text) ? text : null])) {
    if (!label) continue;
    const card = await ctx.db
      .query("cards")
      .withIndex("by_businessId_and_label", (q) => q.eq("businessId", inventoryBusinessId).eq("label", label))
      .first();
    if (card?.accessChannelId) return ctx.db.get(card.accessChannelId);
  }
  return null;
}

/**
 * The CURRENT inventory's QR channel for a typed code (resolver code, SMQ or
 * printed label), or why not — every assignment path takes codes only from
 * here. A code that matches nothing is `missing` (FAIR_QR_NOT_IN_INVENTORY
 * for the B1 callers, FAIR_QR_NOT_FOUND where the admin types the code).
 */
export async function findInventoryChannel(
  ctx: Ctx,
  event: Doc<"fairEvents">,
  code: string,
  missing: FairAdminIssueCode = "FAIR_QR_NOT_IN_INVENTORY",
): Promise<{ channel: Doc<"accessChannels"> } | { problem: FairAdminIssueCode }> {
  if (!event.qrInventoryBusinessId) return { problem: "FAIR_QR_INVENTORY_NOT_CONFIGURED" };
  const channel = await lookupQrChannel(ctx, event.qrInventoryBusinessId, code);
  if (!channel) return { problem: missing };
  if (channel.businessId !== event.qrInventoryBusinessId || channel.kind !== "qr") {
    return { problem: "FAIR_QR_NOT_IN_INVENTORY" };
  }
  return { channel };
}

// -----------------------------------------------------------------------------
// N1 — guards of every new link
// -----------------------------------------------------------------------------

/** A subject that can be one car's sticker: never linked (`legacy`) or a fair model QR. A panel leads to its own URL. */
export function isFairStickerSubject(subject: Pick<Doc<"accessSubjects">, "destinationKind">): boolean {
  return subject.destinationKind === "legacy" || subject.destinationKind === "fair_model";
}

export function fairQrKindOf(subject: Pick<Doc<"accessSubjects">, "destinationKind"> | null): FairQrKind {
  return subject && !isFairStickerSubject(subject) ? "panel" : "sticker";
}

/**
 * Why this code may not get a NEW link to this model: a panel (or any
 * subject that is not a car sticker) or a withdrawn model / participation.
 * A draft model is allowed; the caller returns its status so the admin sees
 * that a scan reads „kartica nije aktivna“ until the model is published.
 */
async function fairStickerLinkProblem(ctx: Ctx, subject: Doc<"accessSubjects">, model: Doc<"fairEventModels">): Promise<FairAdminIssueCode | null> {
  if (!isFairStickerSubject(subject)) return "FAIR_QR_NOT_MODEL_STICKER";
  if (model.status === "withdrawn") return "FAIR_MODEL_WITHDRAWN";
  const participation = await ctx.db.get(model.participationId);
  if (participation?.status === "withdrawn") return "FAIR_MODEL_WITHDRAWN";
  return null;
}

/** The active fair link of any channel of this subject (adminProducts.bulkRetarget must not overwrite it). */
export async function activeFairAssignmentForSubject(ctx: Ctx, subjectId: Id<"accessSubjects">) {
  for (const channel of await channelsFor(ctx, subjectId)) {
    const assignment = await activeAssignmentForChannel(ctx, channel._id);
    if (assignment) return assignment;
  }
  return null;
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
 * The write of one new link: the assignment row, a new immutable target,
 * destination history, channel sync and the `fair_qr_assigned` audit — the
 * same for assignQr, the bulk commit, reassign, linkSticker and undo.
 */
async function insertFairAssignment(
  ctx: MutationCtx,
  input: {
    event: Doc<"fairEvents">;
    model: Doc<"fairEventModels">;
    channel: Doc<"accessChannels">;
    subject: Doc<"accessSubjects">;
    reason: string;
    previousAssignmentId?: Id<"fairQrAssignments">;
    replacedAssignmentId?: Id<"fairQrAssignments">;
  },
  actorUserId: Id<"users">,
  now: number,
) {
  const { event, model, channel, subject, reason, previousAssignmentId, replacedAssignmentId } = input;
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
    ...(previousAssignmentId ? { previousAssignmentId } : {}),
    ...(replacedAssignmentId ? { replacedAssignmentId } : {}),
  });
  const targetId = await applyFairDestination(ctx, subject, model._id, actorUserId, reason, now);
  await writeAdminAudit(ctx, {
    actorUserId,
    accountId: subject.accountId,
    businessId: subject.businessId,
    action: "fair_qr_assigned",
    detail: {
      channelId: channel._id, eventModelId: model._id, assignmentId, targetId, reason,
      ...(previousAssignmentId ? { previousAssignmentId } : {}),
      ...(replacedAssignmentId ? { replacedAssignmentId } : {}),
    },
    now,
  });
  return assignmentId;
}

/**
 * Atomic assign: at most one active assignment per channel and per model.
 * Re-assigning the same code to the same model is a no-op (idempotent).
 * N1: the code may be typed as resolver code, SMQ or printed label (current
 * inventory only); a panel or a withdrawn model / participation is refused;
 * a draft model is allowed and its status is returned.
 */
export async function assignFairQr(
  ctx: MutationCtx,
  input: { eventModelId: Id<"fairEventModels">; resolverCode: string; reason?: string; previousAssignmentId?: Id<"fairQrAssignments"> },
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
    if (channelAssignment.eventModelId === model._id) return { assignmentId: channelAssignment._id, created: false, modelStatus: model.status };
    fairAdminError("FAIR_QR_ALREADY_ASSIGNED", { resolverCode: channel.resolverCode });
  }
  const subject = await ctx.db.get(channel.subjectId);
  if (!subject || subject.anchorCardId !== channel.cardId) fairAdminError("FAIR_QR_NOT_IN_INVENTORY", { reason: "mapping" });
  const problem = await fairStickerLinkProblem(ctx, subject, model);
  if (problem) fairAdminError(problem);
  if (await activeAssignmentForModel(ctx, model._id)) fairAdminError("FAIR_MODEL_ALREADY_ASSIGNED");
  // A subject retargets every channel it owns; only a single-channel identity
  // can be one model's QR without dragging another printed code along.
  if ((await channelsFor(ctx, subject._id)).length !== 1) fairAdminError("FAIR_QR_SUBJECT_SHARED");
  const reason = optionalText(input.reason, "reason", 300) ?? "fair_qr_assigned";
  const assignmentId = await insertFairAssignment(ctx, { event, model, channel, subject, reason, previousAssignmentId: input.previousAssignmentId }, actorUserId, now);
  return { assignmentId, created: true, modelStatus: model.status };
}

/**
 * Marks one active row released. With `sync`, the code's channel is re-synced
 * (a free code reads `problem` / destination_fair_unassigned) and the release
 * is audited; without it the caller links the same code again in the same
 * transaction, so the channel never passes through `problem`.
 */
async function releaseAssignment(
  ctx: MutationCtx,
  assignment: Doc<"fairQrAssignments">,
  reason: string,
  actorUserId: Id<"users">,
  now: number,
  sync: boolean,
) {
  await ctx.db.patch(assignment._id, { status: "released", releasedAt: now, releasedByUserId: actorUserId, reason });
  if (!sync) return;
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
  await releaseAssignment(ctx, assignment, reason, actorUserId, now, true);
  return { assignmentId: assignment._id, released: true };
}

// -----------------------------------------------------------------------------
// A4 — QR detail, change of destination (reassign) and bulk assignment
// -----------------------------------------------------------------------------

/** A printed label of an inventory card: "SA26-001", "PANEL-2026-EVENT" (letters/digits in dash-separated parts). */
const FAIR_QR_LABEL_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const FAIR_QR_LABEL_MAX_LENGTH = 40;

/** True when the typed text has the shape of a printed label (not a resolver code or an SMQ serial). */
export function isFairQrLabelText(code: string): boolean {
  const text = code.trim().toUpperCase();
  return text.length <= FAIR_QR_LABEL_MAX_LENGTH && !text.startsWith("SMQ-") && FAIR_QR_LABEL_PATTERN.test(text);
}

/**
 * A printed code as the admin types it: the 8-character resolver code, the
 * SMQ serial (`SMQ-…`) or, Izlagači 2026, the printed label of the
 * inventory card (`SA26-001`, `cards.label`; N1: also `7`, `sa26 7` …),
 * matched inside the event's inventory only (lookupQrChannel, indexed).
 */
export async function findInventoryCode(
  ctx: Ctx,
  event: Doc<"fairEvents">,
  code: string,
): Promise<{ channel: Doc<"accessChannels"> } | { problem: FairAdminIssueCode }> {
  if (!event.qrInventoryBusinessId) return { problem: "FAIR_QR_INVENTORY_NOT_CONFIGURED" };
  const channel = await lookupQrChannel(ctx, event.qrInventoryBusinessId, code);
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
 * channel is its subject's anchor and the only channel of that subject; N1:
 * a car sticker (not a panel) and a model / participation not withdrawn.
 */
export async function fairQrAssignCheck(
  ctx: Ctx,
  channel: Doc<"accessChannels">,
  model: Doc<"fairEventModels">,
): Promise<{ status: "ok" } | { status: "unchanged" } | { status: "error"; issue: FairAdminIssueCode; assignedEventModelId?: Id<"fairEventModels"> }> {
  const channelAssignment = await activeAssignmentForChannel(ctx, channel._id);
  if (channelAssignment) {
    return channelAssignment.eventModelId === model._id
      ? { status: "unchanged" }
      : { status: "error", issue: "FAIR_QR_ALREADY_ASSIGNED", assignedEventModelId: channelAssignment.eventModelId };
  }
  const subject = await ctx.db.get(channel.subjectId);
  if (!subject || subject.anchorCardId !== channel.cardId) return { status: "error", issue: "FAIR_QR_NOT_IN_INVENTORY" };
  const problem = await fairStickerLinkProblem(ctx, subject, model);
  if (problem) return { status: "error", issue: problem };
  if (await activeAssignmentForModel(ctx, model._id)) return { status: "error", issue: "FAIR_MODEL_ALREADY_ASSIGNED" };
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
  await releaseAssignment(ctx, current, reason, actorUserId, now, false);
  // N1: the new row remembers the previous car, so undoLink can move the code back.
  const assigned = await assignFairQr(ctx, { eventModelId: target._id, resolverCode: channel.resolverCode, reason, previousAssignmentId: current._id }, actorUserId, now);
  await auditFairQrMove(ctx, channel, current, assigned.assignmentId, target._id, reason, actorUserId, now);
  return { fromAssignmentId: current._id, toAssignmentId: assigned.assignmentId, fromEventModelId: current.eventModelId, toEventModelId: target._id, modelStatus: assigned.modelStatus };
}

async function auditFairQrMove(
  ctx: MutationCtx,
  channel: Doc<"accessChannels">,
  from: Doc<"fairQrAssignments">,
  toAssignmentId: Id<"fairQrAssignments">,
  toEventModelId: Id<"fairEventModels">,
  reason: string,
  actorUserId: Id<"users">,
  now: number,
) {
  const subject = await ctx.db.get(channel.subjectId);
  await writeAdminAudit(ctx, {
    actorUserId,
    accountId: subject?.accountId,
    businessId: subject?.businessId,
    action: "fair_qr_reassigned",
    detail: { channelId: channel._id, fromEventModelId: from.eventModelId, toEventModelId, fromAssignmentId: from._id, toAssignmentId, reason },
    now,
  });
}

// -----------------------------------------------------------------------------
// N1 — field linking: linkSticker, undoLink
// -----------------------------------------------------------------------------

const fieldReasons = getDict("admin-events").qrFieldReasons;

/** The printed label of a code's card (`SA26-007`), else its resolver code. */
async function printedLabelOf(ctx: Ctx, cardId: Id<"cards">, resolverCode: string) {
  return (await ctx.db.get(cardId))?.label ?? resolverCode;
}

/**
 * „Poveži nalepnicu“ (field, phone): ONE atomic call that leaves the sticker
 * on this car.
 * - free sticker → linked;
 * - the sticker is on car A of this event → moved, but only when the admin
 *   confirmed exactly that holder (`expectedHolderModelId`); any other holder
 *   (or none) → FAIR_QR_HOLDER_CHANGED and nothing is written;
 * - the car already has another sticker → replaced only with
 *   `replaceModelSticker` (the old sticker is released), else
 *   FAIR_MODEL_ALREADY_ASSIGNED.
 * The same car and sticker again → the existing row, nothing written. The new
 * row remembers the moved-from row and the replaced row for undoLink.
 */
export async function linkFairSticker(
  ctx: MutationCtx,
  input: {
    eventId: Id<"fairEvents">;
    code: string;
    eventModelId: Id<"fairEventModels">;
    expectedHolderModelId: Id<"fairEventModels"> | null;
    replaceModelSticker?: boolean;
  },
  actorUserId: Id<"users">,
  now: number,
) {
  const event = await requireFairEvent(ctx, input.eventId);
  const found = await findInventoryChannel(ctx, event, input.code, "FAIR_QR_NOT_FOUND");
  if ("problem" in found) fairAdminError(found.problem);
  const { channel } = found;
  const model = await ctx.db.get(input.eventModelId);
  if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
  if (model.eventId !== event._id) fairAdminError("FAIR_MODEL_OTHER_EVENT");
  const label = await printedLabelOf(ctx, channel.cardId, channel.resolverCode);
  const base = { label, resolverCode: channel.resolverCode, modelStatus: model.status };

  const holder = await activeAssignmentForChannel(ctx, channel._id);
  if (holder?.eventModelId === model._id) return { ...base, assignmentId: holder._id, created: false };
  if (holder && holder.eventId !== event._id) fairAdminError("FAIR_QR_OTHER_EVENT");
  if ((holder?.eventModelId ?? null) !== input.expectedHolderModelId) {
    fairAdminError("FAIR_QR_HOLDER_CHANGED", holder ? { holderModelId: holder.eventModelId } : { holderModelId: "none" });
  }
  const subject = await ctx.db.get(channel.subjectId);
  if (!subject || subject.anchorCardId !== channel.cardId) fairAdminError("FAIR_QR_NOT_IN_INVENTORY", { reason: "mapping" });
  const problem = await fairStickerLinkProblem(ctx, subject, model);
  if (problem) fairAdminError(problem);
  if ((await channelsFor(ctx, subject._id)).length !== 1) fairAdminError("FAIR_QR_SUBJECT_SHARED");
  const replaced = await activeAssignmentForModel(ctx, model._id);
  if (replaced && !input.replaceModelSticker) fairAdminError("FAIR_MODEL_ALREADY_ASSIGNED", { resolverCode: replaced.resolverCode });

  // Every check passed: from here on the writes.
  if (replaced) await releaseAssignment(ctx, replaced, fieldReasons.replace, actorUserId, now, true);
  if (holder) await releaseAssignment(ctx, holder, fieldReasons.move, actorUserId, now, false);
  const reason = holder ? fieldReasons.move : fieldReasons.link;
  const assignmentId = await insertFairAssignment(
    ctx,
    { event, model, channel, subject, reason, previousAssignmentId: holder?._id, replacedAssignmentId: replaced?._id },
    actorUserId,
    now,
  );
  if (holder) await auditFairQrMove(ctx, channel, holder, assignmentId, model._id, reason, actorUserId, now);
  return {
    ...base,
    assignmentId,
    created: true,
    ...(holder ? { movedFromModelId: holder.eventModelId } : {}),
    ...(replaced ? { replacedLabel: await printedLabelOf(ctx, replaced.cardId, replaced.resolverCode) } : {}),
  };
}

/** True while an active row can still be undone (FAIR_QR_UNDO_WINDOW_MS after the link). */
export function fairQrUndoOpen(assignment: Pick<Doc<"fairQrAssignments">, "status" | "assignedAt">, now: number) {
  return assignment.status === "assigned" && now - assignment.assignedAt <= FAIR_QR_UNDO_WINDOW_MS;
}

/**
 * „Poništi“: within FAIR_QR_UNDO_WINDOW_MS and while the row is still the
 * active link. Releases it and restores what it changed: a moved sticker goes
 * back to its previous car (if that car has had no sticker since, else
 * FAIR_QR_UNDO_SUPERSEDED and nothing is written); a replaced sticker comes
 * back to this car while it is still free. Audit `fair_qr_link_undone`.
 */
export async function undoFairStickerLink(
  ctx: MutationCtx,
  assignmentId: Id<"fairQrAssignments">,
  actorUserId: Id<"users">,
  now: number,
) {
  const row = await ctx.db.get(assignmentId);
  if (!row || row.status !== "assigned") fairAdminError("FAIR_QR_UNDO_SUPERSEDED");
  if (!fairQrUndoOpen(row, now)) fairAdminError("FAIR_QR_UNDO_EXPIRED");
  const [event, channel, subject] = await Promise.all([ctx.db.get(row.eventId), ctx.db.get(row.accessChannelId), ctx.db.get(row.accessSubjectId)]);
  if (!event || !channel || !subject) fairAdminError("FAIR_QR_UNDO_SUPERSEDED");

  // The previous car takes the sticker back only in the state it was left in.
  const previous = row.previousAssignmentId ? await ctx.db.get(row.previousAssignmentId) : null;
  const previousModel = previous ? await ctx.db.get(previous.eventModelId) : null;
  if (previous) {
    if (!previousModel || (await activeAssignmentForModel(ctx, previousModel._id))) fairAdminError("FAIR_QR_UNDO_SUPERSEDED");
    if (await fairStickerLinkProblem(ctx, subject, previousModel)) fairAdminError("FAIR_QR_UNDO_SUPERSEDED");
  }
  // The car's former sticker comes back only while it is still free.
  const replaced = row.replacedAssignmentId ? await ctx.db.get(row.replacedAssignmentId) : null;
  const model = await ctx.db.get(row.eventModelId);
  let replacedBack: { channel: Doc<"accessChannels">; subject: Doc<"accessSubjects"> } | null = null;
  if (replaced && model && !(await activeAssignmentForChannel(ctx, replaced.accessChannelId))) {
    const [replacedChannel, replacedSubject] = await Promise.all([ctx.db.get(replaced.accessChannelId), ctx.db.get(replaced.accessSubjectId)]);
    if (replacedChannel && replacedSubject && replacedSubject.anchorCardId === replacedChannel.cardId && !(await fairStickerLinkProblem(ctx, replacedSubject, model))) {
      replacedBack = { channel: replacedChannel, subject: replacedSubject };
    }
  }

  await releaseAssignment(ctx, row, fieldReasons.undo, actorUserId, now, !previous);
  let restoredAssignmentId: Id<"fairQrAssignments"> | null = null;
  if (previous && previousModel) {
    restoredAssignmentId = await insertFairAssignment(ctx, { event, model: previousModel, channel, subject, reason: fieldReasons.restore }, actorUserId, now);
  }
  let restoredReplacedAssignmentId: Id<"fairQrAssignments"> | null = null;
  if (replacedBack && model) {
    restoredReplacedAssignmentId = await insertFairAssignment(
      ctx,
      { event, model, channel: replacedBack.channel, subject: replacedBack.subject, reason: fieldReasons.restore },
      actorUserId,
      now,
    );
  }
  await writeAdminAudit(ctx, {
    actorUserId,
    accountId: subject.accountId,
    businessId: subject.businessId,
    action: "fair_qr_link_undone",
    detail: {
      assignmentId: row._id, channelId: row.accessChannelId, eventModelId: row.eventModelId,
      restoredAssignmentId, restoredReplacedAssignmentId,
    },
    now,
  });
  return {
    undoneAssignmentId: row._id,
    restoredToModelId: previous && previousModel ? previousModel._id : null,
    restoredAssignmentId,
    restoredReplacedLabel: replacedBack && replaced ? await printedLabelOf(ctx, replaced.cardId, replaced.resolverCode) : null,
    restoredReplacedAssignmentId,
  };
}

// -----------------------------------------------------------------------------
// N1 — what an admin read shows about a code and its car
// -----------------------------------------------------------------------------

/** One read per document per request (cards of one page share exhibitors, stands and brands). */
function cachedGet<T extends TableNames>(ctx: Ctx) {
  const cache = new Map<Id<T>, Promise<Doc<T> | null>>();
  return (id: Id<T>): Promise<Doc<T> | null> => {
    let hit = cache.get(id);
    if (!hit) {
      hit = ctx.db.get(id);
      cache.set(id, hit);
    }
    return hit;
  };
}

export type FairQrModelFacts = {
  model: Doc<"fairEventModels">;
  brandName: string | null;
  exhibitorName: string | null;
  standCode: string | null;
  standName: string | null;
};

/**
 * The car a code leads to, as the field team names it: model, brand,
 * exhibitor (business name, else account name — like the admin catalog) and
 * stand. Cached per request.
 */
export function fairQrModelFactsLoader(ctx: Ctx) {
  const models = cachedGet<"fairEventModels">(ctx);
  const participations = cachedGet<"fairParticipations">(ctx);
  const stands = cachedGet<"fairStands">(ctx);
  const brands = cachedGet<"brands">(ctx);
  const businesses = cachedGet<"businesses">(ctx);
  const accounts = cachedGet<"accounts">(ctx);
  return async (eventModelId: Id<"fairEventModels">): Promise<FairQrModelFacts | null> => {
    const model = await models(eventModelId);
    if (!model) return null;
    const [participation, stand, brand] = await Promise.all([participations(model.participationId), stands(model.standId), brands(model.brandId)]);
    const business = participation ? await businesses(participation.businessId) : null;
    const account = participation && !business ? await accounts(participation.accountId) : null;
    return {
      model,
      brandName: brand?.name ?? null,
      exhibitorName: business?.name ?? account?.name ?? participation?.externalKey ?? null,
      standCode: stand?.code ?? null,
      standName: stand?.displayName ?? null,
    };
  };
}

// -----------------------------------------------------------------------------
// N1 — admin shortcut of the printed-code resolver
// -----------------------------------------------------------------------------

/** Fair reasons a sticker does not open a model: never linked, released, or its model is gone. */
const FAIR_STICKER_UNLINKED_PROBLEMS = new Set(["destination_missing", "destination_fair_unassigned", "destination_fair_model_missing"]);
/** Events sharing one QR inventory (the two fairs of 2026 can). */
const FAIR_INVENTORY_EVENTS_LIMIT = 10;

/** The event a free sticker of this inventory is linked for: the running or next one, else the one that ended last (archived events never). */
async function fairEventForInventory(ctx: Ctx, businessId: Id<"businesses">, now: number) {
  const events = (await ctx.db
    .query("fairEvents")
    .withIndex("by_qrInventoryBusinessId", (q) => q.eq("qrInventoryBusinessId", businessId))
    .take(FAIR_INVENTORY_EVENTS_LIMIT))
    .filter((event) => event.status !== "archived");
  const upcoming = events.filter((event) => event.endsAt > now).sort((a, b) => a.startsAt - b.startsAt);
  return upcoming[0] ?? events.sort((a, b) => b.endsAt - a.endsAt)[0] ?? null;
}

/**
 * `/r/[cardCode]` for a signed-in ScanMe admin (the forwarded session, as the
 * fair scan hook reads it) who scans a car sticker of a fair QR inventory
 * that would not open a model for a fair reason — never linked, released, or
 * linked to a model that is not published: „Poveži nalepnicu“ of that event
 * instead of /r/nevazeca. Called BEFORE any scan row is written. Visitors,
 * non-admins, published links, panels, disabled or damaged codes and cards
 * outside a fair inventory get null here and the resolver goes on unchanged.
 */
export async function fairAdminLinkShortcut(
  ctx: MutationCtx,
  card: Doc<"cards">,
  resolution: { channel: Doc<"accessChannels"> | null; subject: Doc<"accessSubjects"> | null; target: Doc<"cardTargets"> | null; problem: string | undefined },
): Promise<{ eventSlug: string; cardCode: string } | null> {
  const { channel, subject, target, problem } = resolution;
  if (!channel || !subject || channel.kind !== "qr" || !channel.redirectEnabled || !isFairStickerSubject(subject)) return null;
  if (problem ? !FAIR_STICKER_UNLINKED_PROBLEMS.has(problem) : target?.kind !== "fair_model" || !target.fairEventModelId) return null;
  if (!(await fairSessionAdminUserId(ctx))) return null;
  let linkedEventId: Id<"fairEvents"> | null = null;
  if (!problem && target?.fairEventModelId) {
    const model = await ctx.db.get(target.fairEventModelId);
    if (!model || model.status === "published") return null;
    linkedEventId = model.eventId;
  }
  const inventoryEvent = await fairEventForInventory(ctx, card.businessId, Date.now());
  if (!inventoryEvent) return null;
  const event = (linkedEventId ? await ctx.db.get(linkedEventId) : null) ?? inventoryEvent;
  return { eventSlug: event.slug, cardCode: card.cardCode };
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
  /** N1: status of the found model (a draft is allowed; its scan reads „kartica nije aktivna“ until published). */
  modelStatus?: Doc<"fairEventModels">["status"];
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
    // N1: a new assignment takes codes of the CURRENT inventory only (label, SMQ or resolver code).
    const foundCode = await findInventoryChannel(ctx, event, code, "FAIR_QR_NOT_FOUND");
    const foundModel = await findBulkModel(ctx, event._id, model);
    const channel = "channel" in foundCode ? foundCode.channel : undefined;
    const target = "model" in foundModel ? foundModel.model : undefined;
    if (channel) Object.assign(row, { resolverCode: channel.resolverCode, ...(channel.smqCode ? { smqCode: channel.smqCode } : {}) });
    if (target) Object.assign(row, { eventModelId: target._id, modelStatus: target.status });
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
    const check = await fairQrAssignCheck(ctx, channel, model);
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
  const results: { index: number; status: "applied" | "unchanged" | "error"; issue?: FairAdminIssueCode; modelStatus?: Doc<"fairEventModels">["status"] }[] = [];
  for (const row of plan.rows) {
    if (row.status === "ok" && row.eventModelId && row.resolverCode) {
      const assigned = await assignFairQr(ctx, { eventModelId: row.eventModelId, resolverCode: row.resolverCode, reason: assignReason }, actorUserId, now);
      results.push({ index: row.index, status: "applied", modelStatus: assigned.modelStatus });
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
