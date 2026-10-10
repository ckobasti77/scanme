import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { accessState } from "./lib/accessValidators";
import { fairScanCountKey, readFairCount } from "./lib/fairCountShards";
import { fairAdminError, requireFairEvent } from "./lib/fairCatalog";
import {
  activeAssignmentForChannel,
  commitBulkQrAssign,
  fairQrKindOf,
  fairQrLabelFormatOf,
  fairQrModelFactsLoader,
  fairQrUndoOpen,
  findInventoryCode,
  linkFairSticker,
  planBulkQrAssign,
  reassignFairQr,
  undoFairStickerLink,
} from "./lib/fairQr";
import { fairModelStatus, fairQrAssignmentStatus, fairQrKind } from "./lib/fairValidators";
import {
  FAIR_QR_HISTORY_LIMIT,
  FAIR_QR_RECENT_LINKS_MAX,
  FAIR_QR_SCAN_STATS_MAX,
  FAIR_QR_UNDO_WINDOW_MS,
  fairModelPath,
} from "../lib/fair-contract";

// Admin UX A4 — QR inventory of one event: the detail of one printed code,
// its scan numbers, the change of destination (reassign) and the bulk
// assignment with a dry run. Every function starts with requireAdmin. Writes
// go through convex/lib/fairQr (the same subject → target → channel sync as
// assignQr); /r/[cardCode] stays the only printed route and the only place a
// scan is recorded — nothing here records or counts a scan.
//
// Scan numbers change with every scan, so the admin reads getQrDetail and
// getQrScanStats once and refreshes them on a 60 s poll (A0 nalaz 0.5), never
// through a reactive subscription.

const issueCode = v.string();

const modelCounts = v.object({ total: v.number(), unique: v.number() });

/** Fair scan numbers of one model (admin scans excluded, B2 shards). */
async function modelScanCounts(ctx: QueryCtx, eventModelId: Id<"fairEventModels">) {
  return {
    total: await readFairCount(ctx, fairScanCountKey("scan_total", "model", eventModelId)),
    unique: await readFairCount(ctx, fairScanCountKey("scan_unique", "model", eventModelId)),
  };
}

/** Time of the newest generic scan of the printed code (any visitor, also admin test scans). */
async function lastCardScanAt(ctx: QueryCtx, cardId: Id<"cards">) {
  const last = await ctx.db
    .query("cardScanEvents")
    .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
    .order("desc")
    .first();
  return last?.occurredAt ?? null;
}

const modelLabel = (model: Doc<"fairEventModels">) => (model.variant ? `${model.displayName} ${model.variant}` : model.displayName);

const historyRow = v.object({
  assignmentId: v.id("fairQrAssignments"),
  status: fairQrAssignmentStatus,
  eventId: v.id("fairEvents"),
  sameEvent: v.boolean(),
  eventModelId: v.id("fairEventModels"),
  modelLabel: v.union(v.string(), v.null()),
  assignedAt: v.number(),
  releasedAt: v.union(v.number(), v.null()),
  reason: v.union(v.string(), v.null()),
});

/**
 * One printed code (resolver code or SMQ) of the event's inventory: where it
 * leads now, its bounded assignment history (newest first) and its scan
 * numbers. null = the code is not in this event's inventory.
 */
export const getQrDetail = query({
  args: { eventId: v.id("fairEvents"), code: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      cardId: v.id("cards"),
      accessChannelId: v.id("accessChannels"),
      resolverCode: v.string(),
      /** Izlagači 2026: the printed label of the card (`SA26-001`, cards.label). */
      label: v.string(),
      /** N1: a car sticker or a panel (a panel never links to a model). */
      kind: fairQrKind,
      smqCode: v.union(v.string(), v.null()),
      channelState: accessState,
      problemReason: v.union(v.string(), v.null()),
      redirectEnabled: v.boolean(),
      /** Generic ScanMe counter of the code (all scans, also admin and before the fair). */
      totalScansAllTime: v.number(),
      current: v.union(
        v.null(),
        v.object({
          assignmentId: v.id("fairQrAssignments"),
          eventId: v.id("fairEvents"),
          sameEvent: v.boolean(),
          eventTitle: v.union(v.string(), v.null()),
          eventModelId: v.id("fairEventModels"),
          modelLabel: v.union(v.string(), v.null()),
          modelStatus: v.union(fairModelStatus, v.null()),
          path: v.union(v.string(), v.null()),
          assignedAt: v.number(),
          reason: v.union(v.string(), v.null()),
          // N1: the car as the field team names it.
          brandName: v.union(v.string(), v.null()),
          exhibitorName: v.union(v.string(), v.null()),
          standCode: v.union(v.string(), v.null()),
          standName: v.union(v.string(), v.null()),
        }),
      ),
      history: v.array(historyRow),
      historyCapped: v.boolean(),
      /** Fair numbers of the model the code leads to in this event; null without such a model. */
      stats: v.union(v.null(), modelCounts),
      lastScanAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    if (!event.qrInventoryBusinessId) fairAdminError("FAIR_QR_INVENTORY_NOT_CONFIGURED");
    const found = await findInventoryCode(ctx, event, args.code);
    if ("problem" in found) return null;
    const { channel } = found;
    const card = await ctx.db.get(channel.cardId);
    if (!card) return null;
    const active = await activeAssignmentForChannel(ctx, channel._id);
    const released = await ctx.db
      .query("fairQrAssignments")
      .withIndex("by_accessChannelId_and_status", (q) => q.eq("accessChannelId", channel._id).eq("status", "released"))
      .order("desc")
      .take(FAIR_QR_HISTORY_LIMIT + 1);
    const all = [...(active ? [active] : []), ...released];
    const rows = all.slice(0, FAIR_QR_HISTORY_LIMIT);
    const models = new Map<Id<"fairEventModels">, Doc<"fairEventModels"> | null>();
    for (const row of rows) if (!models.has(row.eventModelId)) models.set(row.eventModelId, await ctx.db.get(row.eventModelId));
    const events = new Map<Id<"fairEvents">, Doc<"fairEvents"> | null>([[event._id, event]]);
    for (const row of rows) if (!events.has(row.eventId)) events.set(row.eventId, await ctx.db.get(row.eventId));
    const label = (id: Id<"fairEventModels">) => {
      const model = models.get(id);
      return model ? modelLabel(model) : null;
    };
    const currentModel = active ? models.get(active.eventModelId) ?? null : null;
    const currentEvent = active ? events.get(active.eventId) ?? null : null;
    const own = Boolean(active && active.eventId === event._id);
    const facts = active ? await fairQrModelFactsLoader(ctx)(active.eventModelId) : null;
    return {
      cardId: card._id,
      accessChannelId: channel._id,
      resolverCode: channel.resolverCode,
      label: card.label,
      kind: fairQrKindOf(await ctx.db.get(channel.subjectId)),
      smqCode: channel.smqCode ?? null,
      channelState: channel.state,
      problemReason: channel.problemReason ?? null,
      redirectEnabled: channel.redirectEnabled,
      totalScansAllTime: card.totalScans,
      current: active ? {
        assignmentId: active._id,
        eventId: active.eventId,
        sameEvent: own,
        eventTitle: currentEvent?.title ?? null,
        eventModelId: active.eventModelId,
        modelLabel: label(active.eventModelId),
        modelStatus: currentModel?.status ?? null,
        path: currentModel && currentEvent ? fairModelPath(currentEvent.slug, currentModel.slug) : null,
        assignedAt: active.assignedAt,
        reason: active.reason ?? null,
        brandName: facts?.brandName ?? null,
        exhibitorName: facts?.exhibitorName ?? null,
        standCode: facts?.standCode ?? null,
        standName: facts?.standName ?? null,
      } : null,
      history: rows.map((row) => ({
        assignmentId: row._id,
        status: row.status,
        eventId: row.eventId,
        sameEvent: row.eventId === event._id,
        eventModelId: row.eventModelId,
        modelLabel: label(row.eventModelId),
        assignedAt: row.assignedAt,
        releasedAt: row.releasedAt ?? null,
        reason: row.reason ?? null,
      })),
      historyCapped: all.length > FAIR_QR_HISTORY_LIMIT,
      stats: active && own ? await modelScanCounts(ctx, active.eventModelId) : null,
      lastScanAt: await lastCardScanAt(ctx, card._id),
    };
  },
});

/**
 * Scan columns of the QR list for up to FAIR_QR_SCAN_STATS_MAX cards of the
 * event's inventory. Numbers are the fair counts of the model the code leads
 * to in this event (one stable QR per model, MASTER §4.4); a free code or a
 * code of the other event has none. Cards outside the inventory are skipped.
 */
export const getQrScanStats = query({
  args: { eventId: v.id("fairEvents"), cardIds: v.array(v.id("cards")) },
  returns: v.array(v.object({
    cardId: v.id("cards"),
    eventModelId: v.union(v.id("fairEventModels"), v.null()),
    total: v.union(v.number(), v.null()),
    unique: v.union(v.number(), v.null()),
    lastScanAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    if (!event.qrInventoryBusinessId) fairAdminError("FAIR_QR_INVENTORY_NOT_CONFIGURED");
    if (args.cardIds.length > FAIR_QR_SCAN_STATS_MAX) fairAdminError("INVALID_INPUT", { field: "cardIds", max: FAIR_QR_SCAN_STATS_MAX });
    const rows = [];
    for (const cardId of new Set(args.cardIds)) {
      const card = await ctx.db.get(cardId);
      if (!card || card.businessId !== event.qrInventoryBusinessId) continue;
      const channel = card.accessChannelId ? await ctx.db.get(card.accessChannelId) : null;
      const assignment = channel ? await activeAssignmentForChannel(ctx, channel._id) : null;
      const own = assignment && assignment.eventId === event._id ? assignment : null;
      const counts = own ? await modelScanCounts(ctx, own.eventModelId) : null;
      rows.push({
        cardId,
        eventModelId: own?.eventModelId ?? null,
        total: counts?.total ?? null,
        unique: counts?.unique ?? null,
        lastScanAt: await lastCardScanAt(ctx, cardId),
      });
    }
    return rows;
  },
});

/** „Promeni odredište“: atomic move of the code's assignment to another model of the same event. */
export const reassignQr = mutation({
  args: { eventId: v.id("fairEvents"), code: v.string(), toEventModelId: v.id("fairEventModels"), reason: v.string() },
  returns: v.object({
    fromAssignmentId: v.id("fairQrAssignments"),
    toAssignmentId: v.id("fairQrAssignments"),
    fromEventModelId: v.id("fairEventModels"),
    toEventModelId: v.id("fairEventModels"),
    /** N1: status of the new model (draft → its scan reads „kartica nije aktivna“ until published). */
    modelStatus: fairModelStatus,
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return reassignFairQr(ctx, args, admin._id, Date.now());
  },
});

const bulkRow = v.object({ code: v.string(), model: v.string() });

/** Dry run of a pasted list of (SMQ or resolver code, model externalKey or id); writes nothing. */
export const bulkAssignQrDryRun = query({
  args: { eventId: v.id("fairEvents"), rows: v.array(bulkRow) },
  returns: v.object({
    rows: v.array(v.object({
      index: v.number(),
      code: v.string(),
      model: v.string(),
      status: v.union(v.literal("ok"), v.literal("unchanged"), v.literal("error")),
      issue: v.optional(issueCode),
      resolverCode: v.optional(v.string()),
      smqCode: v.optional(v.string()),
      eventModelId: v.optional(v.id("fairEventModels")),
      modelStatus: v.optional(fairModelStatus),
      assignedEventModelId: v.optional(v.id("fairEventModels")),
    })),
    summary: v.object({ ok: v.number(), unchanged: v.number(), errors: v.number() }),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    return planBulkQrAssign(ctx, event, args.rows);
  },
});

/** Applies only the correct rows of the same plan, in one transaction; a repeated commit changes nothing. */
export const bulkAssignQrCommit = mutation({
  args: { eventId: v.id("fairEvents"), rows: v.array(bulkRow), reason: v.optional(v.string()) },
  returns: v.object({
    rows: v.array(v.object({
      index: v.number(),
      status: v.union(v.literal("applied"), v.literal("unchanged"), v.literal("error")),
      issue: v.optional(issueCode),
      modelStatus: v.optional(fairModelStatus),
    })),
    summary: v.object({ applied: v.number(), unchanged: v.number(), errors: v.number() }),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    return commitBulkQrAssign(ctx, event, args.rows, args.reason, admin._id, Date.now());
  },
});

// -----------------------------------------------------------------------------
// N1 — „Poveži nalepnicu“ on the fair floor (phone): link, undo, recent links
// -----------------------------------------------------------------------------

/**
 * One atomic link of a typed sticker (label `7` / `SA26-007`, SMQ or resolver
 * code; current inventory only) to a car of the event: free → link; on car A
 * → move only when `expectedHolderModelId` is that holder (else
 * FAIR_QR_HOLDER_CHANGED, nothing written); the car has another sticker →
 * replace only with `replaceModelSticker` and the car's sticker the admin saw
 * (`expectedModelStickerCode`, resolver code; P2/RN N3: another one →
 * FAIR_QR_HOLDER_CHANGED, nothing written). Same car and sticker → unchanged.
 */
export const linkSticker = mutation({
  args: {
    eventId: v.id("fairEvents"),
    code: v.string(),
    eventModelId: v.id("fairEventModels"),
    expectedHolderModelId: v.union(v.id("fairEventModels"), v.null()),
    replaceModelSticker: v.optional(v.boolean()),
    expectedModelStickerCode: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    assignmentId: v.id("fairQrAssignments"),
    /** false = this sticker was already on this car; nothing was written. */
    created: v.boolean(),
    label: v.string(),
    resolverCode: v.string(),
    modelStatus: fairModelStatus,
    movedFromModelId: v.optional(v.id("fairEventModels")),
    replacedLabel: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return linkFairSticker(ctx, args, admin._id, Date.now());
  },
});

/** „Poništi“: within 15 minutes and while it is still the active link; restores the previous car or the replaced sticker. */
export const undoLink = mutation({
  args: { assignmentId: v.id("fairQrAssignments") },
  returns: v.object({
    undoneAssignmentId: v.id("fairQrAssignments"),
    /** The car the sticker went back to (it was moved from there), else null. */
    restoredToModelId: v.union(v.id("fairEventModels"), v.null()),
    restoredAssignmentId: v.union(v.id("fairQrAssignments"), v.null()),
    /** The car's former sticker, linked again (it was still free), else null. */
    restoredReplacedLabel: v.union(v.string(), v.null()),
    restoredReplacedAssignmentId: v.union(v.id("fairQrAssignments"), v.null()),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return undoFairStickerLink(ctx, args.assignmentId, admin._id, Date.now());
  },
});

const labelFormat = v.object({ prefix: v.string(), digits: v.number(), max: v.number() });

/**
 * The newest active links of the event (≤ FAIR_QR_RECENT_LINKS_MAX), each with
 * the car, exhibitor, stand, who linked it and when, and whether it can still
 * be undone at `now` (the client's clock — a query never reads the time; pass
 * it again to refresh `canUndo`). `labelFormat` is the inventory's sticker
 * series for the client-side preview of a typed number (lib/fair-qr-label).
 */
export const listRecentLinks = query({
  args: { eventId: v.id("fairEvents"), limit: v.optional(v.number()), now: v.number() },
  returns: v.object({
    labelFormat,
    links: v.array(v.object({
      assignmentId: v.id("fairQrAssignments"),
      label: v.string(),
      resolverCode: v.string(),
      eventModelId: v.id("fairEventModels"),
      modelName: v.union(v.string(), v.null()),
      modelVariant: v.union(v.string(), v.null()),
      modelStatus: v.union(fairModelStatus, v.null()),
      brandName: v.union(v.string(), v.null()),
      exhibitorName: v.union(v.string(), v.null()),
      standCode: v.union(v.string(), v.null()),
      standName: v.union(v.string(), v.null()),
      linkedAt: v.number(),
      linkedByUserId: v.id("users"),
      linkedByName: v.union(v.string(), v.null()),
      reason: v.union(v.string(), v.null()),
      undoUntil: v.number(),
      canUndo: v.boolean(),
    })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const limit = args.limit ?? FAIR_QR_RECENT_LINKS_MAX;
    if (!Number.isInteger(limit) || limit < 1 || limit > FAIR_QR_RECENT_LINKS_MAX) fairAdminError("INVALID_INPUT", { field: "limit", max: FAIR_QR_RECENT_LINKS_MAX });
    // Newest first: an assignment row is inserted at the moment of its link.
    const rows = await ctx.db
      .query("fairQrAssignments")
      .withIndex("by_eventId_and_status", (q) => q.eq("eventId", event._id).eq("status", "assigned"))
      .order("desc")
      .take(limit);
    const facts = fairQrModelFactsLoader(ctx);
    const users = new Map<Id<"users">, Doc<"users"> | null>();
    const links = [];
    for (const row of rows) {
      const [card, model] = await Promise.all([ctx.db.get(row.cardId), facts(row.eventModelId)]);
      if (!users.has(row.assignedByUserId)) users.set(row.assignedByUserId, await ctx.db.get(row.assignedByUserId));
      const user = users.get(row.assignedByUserId) ?? null;
      links.push({
        assignmentId: row._id,
        label: card?.label ?? row.resolverCode,
        resolverCode: row.resolverCode,
        eventModelId: row.eventModelId,
        modelName: model?.model.displayName ?? null,
        modelVariant: model?.model.variant ?? null,
        modelStatus: model?.model.status ?? null,
        brandName: model?.brandName ?? null,
        exhibitorName: model?.exhibitorName ?? null,
        standCode: model?.standCode ?? null,
        standName: model?.standName ?? null,
        linkedAt: row.assignedAt,
        linkedByUserId: row.assignedByUserId,
        linkedByName: user?.name ?? user?.email ?? null,
        reason: row.reason ?? null,
        undoUntil: row.assignedAt + FAIR_QR_UNDO_WINDOW_MS,
        canUndo: fairQrUndoOpen(row, args.now),
      });
    }
    return { labelFormat: await fairQrLabelFormatOf(ctx, event.qrInventoryBusinessId), links };
  },
});
