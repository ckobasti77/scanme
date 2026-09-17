import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import {
  projectAdminAuditRow,
  projectAccessEvent,
  projectActionItemEvent,
  projectConversationEvent,
  projectOrderEvent,
  projectSubscriptionEvent,
  projectTaskEvent,
  upsertActivityProjection,
} from "./lib/adminActivity";

const categoryValidator = v.union(
  v.literal("client"),
  v.literal("communication"),
  v.literal("task"),
  v.literal("order"),
  v.literal("finance"),
  v.literal("subscription"),
  v.literal("problem"),
  v.literal("product"),
  v.literal("service"),
  v.literal("support"),
);

const actorKindValidator = v.union(
  v.literal("admin"),
  v.literal("system"),
  v.literal("shared_mailbox"),
  v.literal("external"),
  v.literal("unknown"),
);

const activityRowValidator = v.object({
  id: v.id("adminActivityRows"),
  sourceKey: v.string(),
  sourceDomain: v.string(),
  sourceRecordId: v.string(),
  accountId: v.union(v.id("accounts"), v.null()),
  businessId: v.union(v.id("businesses"), v.null()),
  objectKind: v.string(),
  objectLabel: v.string(),
  action: v.string(),
  category: categoryValidator,
  actorKind: actorKindValidator,
  actorUserId: v.union(v.id("users"), v.null()),
  actorKey: v.string(),
  actorDisplayName: v.string(),
  occurredAt: v.number(),
  summaryLabel: v.string(),
  reason: v.union(v.string(), v.null()),
  href: v.string(),
});

function view(row: import("./_generated/dataModel").Doc<"adminActivityRows">) {
  return {
    id: row._id,
    sourceKey: row.sourceKey,
    sourceDomain: row.sourceDomain,
    sourceRecordId: row.sourceRecordId,
    accountId: row.accountId ?? null,
    businessId: row.businessId ?? null,
    objectKind: row.objectKind,
    objectLabel: row.objectLabel,
    action: row.action,
    category: row.category,
    actorKind: row.actorKind,
    actorUserId: row.actorUserId ?? null,
    actorKey: row.actorKey,
    actorDisplayName: row.actorDisplayName,
    occurredAt: row.occurredAt,
    summaryLabel: row.summaryLabel,
    reason: row.reason ?? null,
    href: row.href,
  };
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    accountId: v.optional(v.id("accounts")),
    businessId: v.optional(v.id("businesses")),
    category: v.optional(categoryValidator),
    actorKey: v.optional(v.string()),
  },
  returns: paginationResultValidator(activityRowValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new ConvexError("admin_activity_limit_invalid");
    }
    const actorKey = args.actorKey?.trim();
    if (actorKey && actorKey.length > 160) {
      throw new ConvexError("admin_activity_actor_invalid");
    }
    if (args.businessId) {
      const business = await ctx.db.get(args.businessId);
      if (!business || business.kind === "celebration") {
        throw new ConvexError("admin_activity_business_invalid");
      }
      if (args.accountId && business.accountId !== args.accountId) {
        throw new ConvexError("admin_activity_scope_mismatch");
      }
    }

    const result = args.businessId
      ? args.category && actorKey
        ? await ctx.db.query("adminActivityRows").withIndex("by_business_category_actor_occurredAt", (q) => q.eq("businessId", args.businessId).eq("category", args.category!).eq("actorKey", actorKey)).order("desc").paginate(args.paginationOpts)
        : args.category
          ? await ctx.db.query("adminActivityRows").withIndex("by_business_category_occurredAt", (q) => q.eq("businessId", args.businessId).eq("category", args.category!)).order("desc").paginate(args.paginationOpts)
          : actorKey
            ? await ctx.db.query("adminActivityRows").withIndex("by_business_actor_occurredAt", (q) => q.eq("businessId", args.businessId).eq("actorKey", actorKey)).order("desc").paginate(args.paginationOpts)
            : await ctx.db.query("adminActivityRows").withIndex("by_business_occurredAt", (q) => q.eq("businessId", args.businessId)).order("desc").paginate(args.paginationOpts)
      : args.accountId
        ? args.category && actorKey
          ? await ctx.db.query("adminActivityRows").withIndex("by_account_category_actor_occurredAt", (q) => q.eq("accountId", args.accountId).eq("category", args.category!).eq("actorKey", actorKey)).order("desc").paginate(args.paginationOpts)
          : args.category
            ? await ctx.db.query("adminActivityRows").withIndex("by_account_category_occurredAt", (q) => q.eq("accountId", args.accountId).eq("category", args.category!)).order("desc").paginate(args.paginationOpts)
            : actorKey
              ? await ctx.db.query("adminActivityRows").withIndex("by_account_actor_occurredAt", (q) => q.eq("accountId", args.accountId).eq("actorKey", actorKey)).order("desc").paginate(args.paginationOpts)
              : await ctx.db.query("adminActivityRows").withIndex("by_account_occurredAt", (q) => q.eq("accountId", args.accountId)).order("desc").paginate(args.paginationOpts)
        : args.category && actorKey
          ? await ctx.db.query("adminActivityRows").withIndex("by_category_actor_occurredAt", (q) => q.eq("category", args.category!).eq("actorKey", actorKey)).order("desc").paginate(args.paginationOpts)
          : args.category
            ? await ctx.db.query("adminActivityRows").withIndex("by_category_and_occurredAt", (q) => q.eq("category", args.category!)).order("desc").paginate(args.paginationOpts)
            : actorKey
              ? await ctx.db.query("adminActivityRows").withIndex("by_actorKey_and_occurredAt", (q) => q.eq("actorKey", actorKey)).order("desc").paginate(args.paginationOpts)
              : await ctx.db.query("adminActivityRows").withIndex("by_occurredAt").order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(view) };
  },
});

export const listActors = query({
  args: {},
  returns: v.array(v.object({
    actorKey: v.string(),
    actorKind: actorKindValidator,
    displayName: v.string(),
  })),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("adminActivityActors")
      .withIndex("by_lastSeenAt")
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      actorKey: row.actorKey,
      actorKind: row.actorKind,
      displayName: row.displayName,
    }));
  },
});

export const backfill = internalMutation({
  args: {
    source: v.union(
      v.literal("admin_audit"),
      v.literal("conversation"),
      v.literal("action_item"),
      v.literal("task"),
      v.literal("order"),
      v.literal("access_channel"),
      v.literal("subscription"),
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    examined: v.number(),
    written: v.number(),
  }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) {
      throw new ConvexError("admin_activity_backfill_limit_invalid");
    }
    const paginationOpts = { cursor: args.cursor ?? null, numItems: args.limit };
    if (args.source === "admin_audit") {
      const page = await ctx.db.query("adminAuditLog").withIndex("by_createdAt").paginate(paginationOpts);
      let written = 0;
      if (!args.dryRun) {
        for (const row of page.page) {
          const result = await projectAdminAuditRow(ctx, row);
          if (result.changed) written += 1;
        }
      }
      return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
    }
    if (args.source === "conversation") {
      const page = await ctx.db.query("conversationEvents").paginate(paginationOpts);
      let written = 0;
      if (!args.dryRun) {
        for (const row of page.page) {
          const result = await projectConversationEvent(ctx, row);
          if (result?.changed) written += 1;
        }
      }
      return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
    }
    if (args.source === "action_item") {
      const page = await ctx.db.query("actionItemEvents").paginate(paginationOpts);
      let written = 0;
      if (!args.dryRun) for (const row of page.page) if ((await projectActionItemEvent(ctx, row))?.changed) written += 1;
      return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
    }
    if (args.source === "task") {
      const page = await ctx.db.query("clientTaskEvents").paginate(paginationOpts);
      let written = 0;
      if (!args.dryRun) for (const row of page.page) if ((await projectTaskEvent(ctx, row))?.changed) written += 1;
      return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
    }
    if (args.source === "order") {
      const page = await ctx.db.query("orderEvents").paginate(paginationOpts);
      let written = 0;
      if (!args.dryRun) for (const row of page.page) if ((await projectOrderEvent(ctx, row))?.changed) written += 1;
      return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
    }
    if (args.source === "access_channel") {
      const page = await ctx.db.query("accessChannelEvents").paginate(paginationOpts);
      let written = 0;
      if (!args.dryRun) for (const row of page.page) if ((await projectAccessEvent(ctx, row))?.changed) written += 1;
      return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
    }
    const page = await ctx.db.query("subscriptionEvents").paginate(paginationOpts);
    let written = 0;
    if (!args.dryRun) {
      for (const row of page.page) {
        const result = await projectSubscriptionEvent(ctx, row);
        if (result?.changed) written += 1;
      }
    }
    return { continueCursor: page.continueCursor, isDone: page.isDone, examined: page.page.length, written };
  },
});

// Provider/system workflows use this internal seam when no human user exists.
// It deliberately cannot manufacture an admin actor.
export const recordNonAdminEvent = internalMutation({
  args: {
    sourceKey: v.string(),
    sourceDomain: v.string(),
    sourceRecordId: v.string(),
    accountId: v.optional(v.id("accounts")),
    businessId: v.optional(v.id("businesses")),
    objectKind: v.string(),
    objectLabel: v.string(),
    action: v.string(),
    category: categoryValidator,
    actorKind: v.union(v.literal("system"), v.literal("shared_mailbox"), v.literal("unknown")),
    actorDisplayName: v.string(),
    occurredAt: v.number(),
    summaryLabel: v.string(),
    reason: v.optional(v.string()),
    href: v.string(),
  },
  returns: v.object({ id: v.id("adminActivityRows"), changed: v.boolean() }),
  handler: async (ctx, args) => upsertActivityProjection(ctx, args),
});
