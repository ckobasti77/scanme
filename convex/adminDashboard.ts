import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { actionView, actionViewValidator, validTime } from "./adminActions";
import { compareActionPriority } from "../lib/admin-v1/operational";
import { requireAdmin } from "./lib/access";
import {
  dashboardProjectionComplete,
  readDashboardMetric,
} from "./lib/adminDashboardProjection";

const scope = v.union(v.literal("all"), v.literal("mine"));

const actionCounts = v.object({
  total: v.number(),
  urgent: v.number(),
  today: v.number(),
  needsReply: v.number(),
  graceOrWarning: v.number(),
  waitingScanme: v.number(),
  waitingClient: v.number(),
  calm: v.number(),
});

const dashboardAction = v.object({
  action: actionViewValidator,
  contextLabel: v.union(v.string(), v.null()),
  contextCode: v.union(v.string(), v.null()),
  href: v.string(),
});

function defaultActionHref(item: ReturnType<typeof actionView>) {
  if (item.context.href) return item.context.href;
  if (item.source.domain === "subscription" && item.accountId) {
    return `/admin/klijenti/${item.accountId}`;
  }
  if (item.source.domain === "task") return "/admin/zadaci";
  if (item.source.domain === "order") return "/admin/operativa/porudzbine";
  if (item.source.domain === "qr_nfc") return "/admin/operativa/qr";
  if (item.source.domain === "physical_product") return "/admin/operativa/proizvodi";
  if (item.source.domain === "inbox") return "/admin/inbox";
  return item.accountId ? `/admin/klijenti/${item.accountId}` : "/admin";
}

export const reactions = query({
  args: { scope, now: v.number(), limit: v.number() },
  returns: v.object({
    scope,
    projection: v.union(v.literal("complete"), v.literal("unavailable")),
    counts: v.union(actionCounts, v.null()),
    items: v.array(dashboardAction),
    capped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    validTime(args.now);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 12) {
      throw new ConvexError("admin_dashboard_action_limit");
    }
    const scopeKey = args.scope === "mine" ? `user:${admin._id}` : "all";
    const rows = args.scope === "mine"
      ? await ctx.db
          .query("actionItems")
          .withIndex("by_assignee_state_priority", (q) =>
            q.eq("assigneeId", admin._id).eq("state", "open"),
          )
          .take(args.limit + 1)
      : await ctx.db
          .query("actionItems")
          .withIndex("by_state_and_priorityRank_and_priorityAt_and_causeId", (q) =>
            q.eq("state", "open"),
          )
          .take(args.limit + 1);
    const selected = rows.slice(0, args.limit).sort(compareActionPriority);
    const items = await Promise.all(selected.map(async (item) => {
      const client = item.accountId
        ? await ctx.db
            .query("adminClientReadModels")
            .withIndex("by_accountId", (q) => q.eq("accountId", item.accountId!))
            .unique()
        : null;
      const view = actionView(item, args.now);
      return {
        action: view,
        contextLabel: client?.accountName ?? null,
        contextCode: client?.smkCode ?? item.productRef ?? null,
        href: defaultActionHref(view),
      };
    }));
    const complete = await dashboardProjectionComplete(ctx, "action");
    const metrics = [
      "actions.total",
      "actions.priority.blocking_or_overdue",
      "actions.priority.due_today",
      "actions.priority.needs_reply",
      "actions.priority.grace_or_warning",
      "actions.priority.waiting_scanme",
      "actions.priority.waiting_client",
      "actions.priority.other",
    ] as const;
    const values = complete
      ? await Promise.all(metrics.map((metric) => readDashboardMetric(ctx, scopeKey, metric)))
      : null;
    return {
      scope: args.scope,
      projection: complete ? "complete" as const : "unavailable" as const,
      counts: values ? {
        total: values[0],
        urgent: values[1],
        today: values[2],
        needsReply: values[3],
        graceOrWarning: values[4],
        waitingScanme: values[5],
        waitingClient: values[6],
        calm: values[7],
      } : null,
      items,
      capped: rows.length > args.limit,
    };
  },
});

export const subscriptions = query({
  args: {},
  returns: v.object({
    projection: v.union(v.literal("complete"), v.literal("unavailable")),
    counts: v.union(v.object({
      total: v.number(), active: v.number(), grace: v.number(),
      suspended: v.number(), inactive: v.number(), warning: v.number(),
    }), v.null()),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const complete = await dashboardProjectionComplete(ctx, "subscription");
    if (!complete) return { projection: "unavailable" as const, counts: null };
    const values = await Promise.all([
      "subscriptions.total", "subscriptions.status.active", "subscriptions.status.grace",
      "subscriptions.status.suspended", "subscriptions.status.inactive", "subscriptions.warning",
    ].map((metric) => readDashboardMetric(ctx, "global", metric)));
    return { projection: "complete" as const, counts: {
      total: values[0], active: values[1], grace: values[2],
      suspended: values[3], inactive: values[4], warning: values[5],
    } };
  },
});

export const products = query({
  args: {},
  returns: v.object({
    projection: v.union(v.literal("complete"), v.literal("unavailable")),
    counts: v.union(v.object({
      total: v.number(), active: v.number(), inactive: v.number(), problem: v.number(),
      qr: v.number(), nfc: v.number(), problemChannels: v.number(),
    }), v.null()),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const complete = await dashboardProjectionComplete(ctx, "product");
    if (!complete) return { projection: "unavailable" as const, counts: null };
    const values = await Promise.all([
      "products.total", "products.state.active", "products.state.inactive", "products.state.problem",
      "products.channels.qr", "products.channels.nfc", "products.channels.problem",
    ].map((metric) => readDashboardMetric(ctx, "global", metric)));
    return { projection: "complete" as const, counts: {
      total: values[0], active: values[1], inactive: values[2], problem: values[3],
      qr: values[4], nfc: values[5], problemChannels: values[6],
    } };
  },
});

const inboxItem = v.object({
  id: v.id("conversations"),
  accountName: v.string(),
  contactName: v.string(),
  channel: v.string(),
  status: v.string(),
  preview: v.string(),
  latestMessageAt: v.number(),
  unreadCount: v.number(),
  href: v.string(),
});

export const inbox = query({
  args: { limit: v.number() },
  returns: v.object({
    items: v.array(inboxItem),
    capped: v.boolean(),
    provider: v.union(
      v.object({ provider: v.string(), operationalState: v.string() }),
      v.null(),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 8) {
      throw new ConvexError("admin_dashboard_inbox_limit");
    }
    const rows = await ctx.db.query("conversations").withIndex("by_updatedAt").order("desc").take(args.limit + 1);
    const provider = await ctx.db
      .query("emailProviderConnections")
      .withIndex("by_provider", (q) => q.eq("provider", "zoho"))
      .unique();
    return {
      items: rows.slice(0, args.limit).map((row) => ({
        id: row._id,
        accountName: row.accountName,
        contactName: row.contactName,
        channel: row.channel,
        status: row.status,
        preview: row.latestMessagePreview,
        latestMessageAt: row.latestMessageAt,
        unreadCount: row.adminUnreadCount,
        href: `/admin/inbox?conversation=${row._id}`,
      })),
      capped: rows.length > args.limit,
      provider: provider ? { provider: provider.provider, operationalState: provider.operationalState } : null,
    };
  },
});
