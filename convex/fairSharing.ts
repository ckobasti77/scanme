import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  FAIR_PII_PURGE_AT_MS,
  FAIR_SHARE_COLLECTION_MAX_MODELS,
  isFairSubmissionId,
  isFairVisitorHash,
  type FairShareChannel,
  type FairTrafficKind,
} from "../lib/fair-contract";
import { fairInteractionError } from "./lib/fairInteractions";
import { fairTimeKeys, upsertFairVisitor } from "./lib/fairScans";
import { rateLimiter } from "./lib/rateLimits";

const CODE_HASH_PATTERN = /^[0-9a-f]{64}$/;
const TRAFFIC_KINDS: readonly string[] = ["direct_view", "share_action", "share_open"] satisfies FairTrafficKind[];
const SHARE_CHANNELS: readonly string[] = ["native", "whatsapp", "viber", "copy"] satisfies FairShareChannel[];

const shareCollectionView = v.object({
  id: v.string(),
  eventId: v.string(),
  eventModelIds: v.array(v.string()),
  expiresAt: v.number(),
});

const createShareCollectionResult = v.object({
  collectionId: v.string(),
  eventId: v.string(),
  eventModelIds: v.array(v.string()),
  expiresAt: v.number(),
  duplicate: v.boolean(),
});

const trafficResult = v.object({
  kind: v.union(v.literal("direct_view"), v.literal("share_action"), v.literal("share_open")),
  recordedAt: v.number(),
  duplicate: v.boolean(),
});

type ShareCollectionView = Infer<typeof shareCollectionView>;
type CreateShareCollectionResult = Infer<typeof createShareCollectionResult>;
type TrafficResult = Infer<typeof trafficResult>;

function requireHash(value: string) {
  if (!CODE_HASH_PATTERN.test(value)) fairInteractionError("INVALID_INPUT", { field: "codeHash" });
}

async function requireTrafficLimit(
  ctx: Parameters<typeof rateLimiter.limit>[0],
  visitorId: Id<"fairVisitors">,
) {
  const status = await rateLimiter.limit(ctx, "fairTraffic", { key: visitorId });
  if (!status.ok) fairInteractionError("RATE_LIMITED", { retryAfterMs: Math.ceil(status.retryAfter) });
}

export const createShareCollection = mutation({
  args: {
    visitorHash: v.string(),
    eventModelIds: v.array(v.string()),
    codeHash: v.string(),
    requestId: v.string(),
  },
  returns: createShareCollectionResult,
  handler: async (ctx, args): Promise<CreateShareCollectionResult> => {
    const now = Date.now();
    if (!isFairVisitorHash(args.visitorHash)) fairInteractionError("INVALID_INPUT", { field: "visitorHash" });
    if (!isFairSubmissionId(args.requestId)) fairInteractionError("INVALID_INPUT", { field: "requestId" });
    requireHash(args.codeHash);

    const prior = await ctx.db
      .query("fairShareCollections")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (prior) {
      return {
        collectionId: prior._id,
        eventId: prior.eventId,
        eventModelIds: prior.eventModelIds,
        expiresAt: prior.expiresAt,
        duplicate: true,
      };
    }

    if (args.eventModelIds.length < 1 || args.eventModelIds.length > FAIR_SHARE_COLLECTION_MAX_MODELS) {
      fairInteractionError("INVALID_INPUT", { field: "eventModelIds" });
    }
    if (new Set(args.eventModelIds).size !== args.eventModelIds.length) {
      fairInteractionError("INVALID_INPUT", { field: "eventModelIds" });
    }

    const models: Doc<"fairEventModels">[] = [];
    for (const rawId of args.eventModelIds) {
      const id = ctx.db.normalizeId("fairEventModels", rawId);
      const model = id ? await ctx.db.get(id) : null;
      if (!model || model.status !== "published") fairInteractionError("FAIR_MODEL_NOT_FOUND");
      models.push(model);
    }
    const eventId = models[0]!.eventId;
    if (models.some((model) => model.eventId !== eventId)) {
      fairInteractionError("INVALID_INPUT", { field: "eventModelIds" });
    }
    const event = await ctx.db.get(eventId);
    if (!event || event.status === "draft" || now >= FAIR_PII_PURGE_AT_MS) {
      fairInteractionError("EVENT_NOT_ACTIVE");
    }

    const visitorId = await upsertFairVisitor(ctx, args.visitorHash, now);
    await requireTrafficLimit(ctx, visitorId);
    const collectionId = await ctx.db.insert("fairShareCollections", {
      requestId: args.requestId,
      codeHash: args.codeHash,
      eventId,
      eventModelIds: models.map((model) => model._id),
      status: "active",
      createdAt: now,
      expiresAt: FAIR_PII_PURGE_AT_MS,
    });
    return {
      collectionId,
      eventId,
      eventModelIds: models.map((model) => model._id),
      expiresAt: FAIR_PII_PURGE_AT_MS,
      duplicate: false,
    };
  },
});

export const getShareCollectionByCodeHash = query({
  args: { codeHash: v.string(), now: v.number() },
  returns: v.union(shareCollectionView, v.null()),
  handler: async (ctx, args): Promise<ShareCollectionView | null> => {
    if (!CODE_HASH_PATTERN.test(args.codeHash)) return null;
    const row = await ctx.db
      .query("fairShareCollections")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (!row || row.status !== "active" || args.now >= row.expiresAt) return null;
    return { id: row._id, eventId: row.eventId, eventModelIds: row.eventModelIds, expiresAt: row.expiresAt };
  },
});

export const recordTraffic = mutation({
  args: {
    visitorHash: v.string(),
    kind: v.string(),
    requestId: v.string(),
    eventModelId: v.optional(v.string()),
    shareCollectionId: v.optional(v.string()),
    channel: v.optional(v.string()),
    modelCount: v.optional(v.number()),
  },
  returns: trafficResult,
  handler: async (ctx, args): Promise<TrafficResult> => {
    const now = Date.now();
    if (!isFairVisitorHash(args.visitorHash)) fairInteractionError("INVALID_INPUT", { field: "visitorHash" });
    if (!isFairSubmissionId(args.requestId)) fairInteractionError("INVALID_INPUT", { field: "requestId" });
    if (!TRAFFIC_KINDS.includes(args.kind)) fairInteractionError("INVALID_INPUT", { field: "kind" });
    const kind = args.kind as FairTrafficKind;

    const prior = await ctx.db
      .query("fairTrafficEvents")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (prior) return { kind: prior.kind, recordedAt: prior.occurredAt, duplicate: true };

    const modelId = args.eventModelId ? ctx.db.normalizeId("fairEventModels", args.eventModelId) : null;
    const model = modelId ? await ctx.db.get(modelId) : null;
    const collectionId = args.shareCollectionId ? ctx.db.normalizeId("fairShareCollections", args.shareCollectionId) : null;
    const collection = collectionId ? await ctx.db.get(collectionId) : null;

    if (kind === "direct_view" && (!model || model.status !== "published" || collection)) {
      fairInteractionError("INVALID_INPUT");
    }
    if (kind === "share_open" && (!collection || model || args.channel || args.modelCount)) {
      fairInteractionError("INVALID_INPUT");
    }
    if (kind === "share_action") {
      if (!SHARE_CHANNELS.includes(args.channel ?? "")) fairInteractionError("INVALID_INPUT", { field: "channel" });
      if (!Number.isInteger(args.modelCount) || (args.modelCount ?? 0) < 1 || (args.modelCount ?? 0) > FAIR_SHARE_COLLECTION_MAX_MODELS) {
        fairInteractionError("INVALID_INPUT", { field: "modelCount" });
      }
      if ((args.modelCount === 1 && (!model || collection)) || ((args.modelCount ?? 0) > 1 && (!collection || model))) {
        fairInteractionError("INVALID_INPUT");
      }
    }

    const eventId = model?.eventId ?? collection?.eventId;
    if (!eventId) fairInteractionError("INVALID_INPUT");
    const visitorId = await upsertFairVisitor(ctx, args.visitorHash, now);
    await requireTrafficLimit(ctx, visitorId);
    const time = fairTimeKeys(now);
    await ctx.db.insert("fairTrafficEvents", {
      requestId: args.requestId,
      eventId,
      ...(model ? { eventModelId: model._id } : {}),
      ...(collection ? { shareCollectionId: collection._id } : {}),
      kind,
      ...(args.channel ? { channel: args.channel as FairShareChannel } : {}),
      ...(args.modelCount ? { modelCount: args.modelCount } : {}),
      occurredAt: now,
      dateKey: time.dateKey,
      hourKey: time.hourKey,
    });
    return { kind, recordedAt: now, duplicate: false };
  },
});
