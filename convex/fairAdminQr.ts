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
  findInventoryCode,
  planBulkQrAssign,
  reassignFairQr,
} from "./lib/fairQr";
import { fairModelStatus, fairQrAssignmentStatus } from "./lib/fairValidators";
import { FAIR_QR_HISTORY_LIMIT, FAIR_QR_SCAN_STATS_MAX, fairModelPath } from "../lib/fair-contract";

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
    return {
      cardId: card._id,
      accessChannelId: channel._id,
      resolverCode: channel.resolverCode,
      label: card.label,
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
    })),
    summary: v.object({ applied: v.number(), unchanged: v.number(), errors: v.number() }),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    return commitBulkQrAssign(ctx, event, args.rows, args.reason, admin._id, Date.now());
  },
});
