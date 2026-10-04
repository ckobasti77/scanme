import {
  type FilterBuilder,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { isAdminEmail, requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import {
  adminDeliveryStateValidator,
  communicationChannelValidator,
  conversationStatusValidator,
  type ConversationStatus,
} from "./lib/adminCommunicationValidators";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import { communicationsSr } from "../lib/i18n/sr/communications";

const MAX_INBOX_PAGE = 50;
const MAX_MESSAGE_PAGE = 50;
const MAX_CONTENT = 4_000;
const UNASSIGNED = "unassigned";

type InboxFilters = {
  status?: ConversationStatus;
  channel?: Doc<"conversations">["channel"];
  assignee?: Id<"users"> | "unassigned";
};

function conversationFilter(args: InboxFilters) {
  return (q: FilterBuilder<DataModel["conversations"]>) => {
    const filters = [];
    if (args.status) filters.push(q.eq(q.field("status"), args.status));
    if (args.channel) filters.push(q.eq(q.field("channel"), args.channel));
    if (args.assignee) {
      filters.push(q.eq(q.field("assigneeKey"), String(args.assignee)));
    }
    return filters.length > 0
      ? q.and(...filters)
      : q.eq(q.field("accountId"), q.field("accountId"));
  };
}

const inboxItemValidator = v.object({
  id: v.id("conversations"),
  accountId: v.id("accounts"),
  accountName: v.string(),
  smkCode: v.string(),
  contactId: v.id("accountContacts"),
  contactName: v.string(),
  contactEmail: v.union(v.string(), v.null()),
  contactPhone: v.union(v.string(), v.null()),
  businessId: v.union(v.id("businesses"), v.null()),
  businessName: v.union(v.string(), v.null()),
  channel: communicationChannelValidator,
  status: conversationStatusValidator,
  assigneeAdminId: v.union(v.id("users"), v.null()),
  assigneeName: v.union(v.string(), v.null()),
  latestMessagePreview: v.string(),
  latestMessageAt: v.number(),
  latestMessageAuthorName: v.string(),
  adminUnreadCount: v.number(),
});

const messageValidator = v.object({
  id: v.id("conversationMessages"),
  direction: v.union(
    v.literal("client_to_admin"),
    v.literal("admin_to_client"),
    v.literal("manual"),
  ),
  authorKind: v.union(v.literal("admin"), v.literal("client")),
  authorDisplayName: v.string(),
  content: v.string(),
  createdAt: v.number(),
  deliveryState: v.union(adminDeliveryStateValidator, v.null()),
});

const detailValidator = v.object({
  conversation: inboxItemValidator,
});

function cleanContent(value: string) {
  const content = value.trim();
  if (!content || content.length > MAX_CONTENT) {
    throw new ConvexError("admin_communications_content_invalid");
  }
  return content;
}

function preview(content: string) {
  return content.replace(/\s+/g, " ").slice(0, 180);
}

function userName(user: Doc<"users">) {
  return user.name?.trim() || user.email?.trim() || communicationsSr.adminAuthorFallback;
}

function inboxItem(row: Doc<"conversations">) {
  return {
    id: row._id,
    accountId: row.accountId,
    accountName: row.accountName,
    smkCode: row.smkCode,
    contactId: row.contactId,
    contactName: row.contactName,
    contactEmail: row.contactEmail ?? null,
    contactPhone: row.contactPhone ?? null,
    businessId: row.businessId ?? null,
    businessName: row.businessName ?? null,
    channel: row.channel,
    status: row.status,
    assigneeAdminId: row.assigneeAdminId ?? null,
    assigneeName: row.assigneeName ?? null,
    latestMessagePreview: row.latestMessagePreview,
    latestMessageAt: row.latestMessageAt,
    latestMessageAuthorName: row.latestMessageAuthorName,
    adminUnreadCount: row.adminUnreadCount,
  };
}

function effectiveDeliveryState(
  conversation: Doc<"conversations">,
  message: Doc<"conversationMessages">,
) {
  if (
    conversation.channel !== "panel_chat" ||
    message.direction !== "admin_to_client"
  ) return null;
  if (
    conversation.clientOpenedConversationAt !== undefined &&
    conversation.clientOpenedConversationAt >= message.createdAt
  ) return "read" as const;
  if (
    conversation.clientOpenedPanelAt !== undefined &&
    conversation.clientOpenedPanelAt >= message.createdAt
  ) return "delivered" as const;
  return "sent" as const;
}

async function requireConversation(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new ConvexError("admin_communications_not_found");
  return conversation;
}

async function writeEvent(
  ctx: MutationCtx,
  entry: {
    conversationId: Id<"conversations">;
    accountId: Id<"accounts">;
    messageId?: Id<"conversationMessages">;
    event:
      | "client_message_received"
      | "admin_reply_sent"
      | "manual_entry_logged"
      | "status_changed"
      | "assignee_changed";
    actorKind: "admin" | "client";
    actorUserId?: Id<"users">;
    actorContactId?: Id<"accountContacts">;
    fromStatus?: ConversationStatus;
    toStatus?: ConversationStatus;
    previousAssigneeAdminId?: Id<"users">;
    nextAssigneeAdminId?: Id<"users">;
    now: number;
  },
) {
  await ctx.db.insert("conversationEvents", {
    conversationId: entry.conversationId,
    accountId: entry.accountId,
    ...(entry.messageId ? { messageId: entry.messageId } : {}),
    event: entry.event,
    actorKind: entry.actorKind,
    ...(entry.actorUserId ? { actorUserId: entry.actorUserId } : {}),
    ...(entry.actorContactId ? { actorContactId: entry.actorContactId } : {}),
    ...(entry.fromStatus ? { fromStatus: entry.fromStatus } : {}),
    ...(entry.toStatus ? { toStatus: entry.toStatus } : {}),
    ...(entry.previousAssigneeAdminId
      ? { previousAssigneeAdminId: entry.previousAssigneeAdminId }
      : {}),
    ...(entry.nextAssigneeAdminId
      ? { nextAssigneeAdminId: entry.nextAssigneeAdminId }
      : {}),
    createdAt: entry.now,
  });
}

export const listInbox = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(conversationStatusValidator),
    channel: v.optional(communicationChannelValidator),
    assignee: v.optional(v.union(v.id("users"), v.literal("unassigned"))),
    accountId: v.optional(v.id("accounts")),
    contactId: v.optional(v.id("accountContacts")),
  },
  returns: paginationResultValidator(inboxItemValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.paginationOpts.numItems > MAX_INBOX_PAGE) {
      throw new ConvexError("admin_communications_page_limit");
    }
    if (args.contactId && !args.accountId) {
      throw new ConvexError("admin_communications_contact_scope_invalid");
    }
    const search = args.search ? normalizeAdminSearchText(args.search) : "";
    let result;
    if (search) {
      result = await ctx.db
        .query("conversations")
        .withSearchIndex("search_inbox", (q) => {
          let indexed = q.search("searchText", search);
          if (args.status) indexed = indexed.eq("status", args.status);
          if (args.channel) indexed = indexed.eq("channel", args.channel);
          if (args.assignee) indexed = indexed.eq("assigneeKey", String(args.assignee));
          if (args.accountId) indexed = indexed.eq("accountId", args.accountId);
          if (args.contactId) indexed = indexed.eq("contactId", args.contactId);
          return indexed;
        })
        .paginate(args.paginationOpts);
    } else if (args.accountId && args.contactId) {
      result = await ctx.db
        .query("conversations")
        .withIndex("by_accountId_and_contactId_and_updatedAt", (q) =>
          q.eq("accountId", args.accountId!).eq("contactId", args.contactId!),
        )
        .order("desc")
        .filter(conversationFilter(args))
        .paginate(args.paginationOpts);
    } else if (args.accountId) {
      result = await ctx.db
        .query("conversations")
        .withIndex("by_accountId_and_updatedAt", (q) => q.eq("accountId", args.accountId!))
        .order("desc")
        .filter(conversationFilter(args))
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("conversations")
        .withIndex("by_updatedAt")
        .order("desc")
        .filter(conversationFilter(args))
        .paginate(args.paginationOpts);
    }
    return { ...result, page: result.page.map(inboxItem) };
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  returns: v.union(detailValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;
    return { conversation: inboxItem(conversation) };
  },
});

export const listMessages = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.paginationOpts.numItems > MAX_MESSAGE_PAGE) {
      throw new ConvexError("admin_communications_message_page_limit");
    }
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new ConvexError("admin_communications_not_found");
    const result = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversationId_and_createdAt", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((message) => ({
        id: message._id,
        direction: message.direction,
        authorKind: message.authorKind,
        authorDisplayName: message.authorDisplayName,
        content: message.content,
        createdAt: message.createdAt,
        deliveryState: effectiveDeliveryState(conversation, message),
      })),
    };
  },
});

export const markAdminRead = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.object({ unreadCount: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const conversation = await requireConversation(ctx, args.conversationId);
    if (conversation.adminUnreadCount > 0) {
      await ctx.db.patch(conversation._id, { adminUnreadCount: 0 });
    }
    return { unreadCount: 0 };
  },
});

export const reply = mutation({
  args: { conversationId: v.id("conversations"), content: v.string() },
  returns: v.object({ messageId: v.id("conversationMessages") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const conversation = await requireConversation(ctx, args.conversationId);
    if (conversation.channel !== "panel_chat") {
      throw new ConvexError("admin_communications_reply_channel_invalid");
    }
    const content = cleanContent(args.content);
    const now = Date.now();
    const authorDisplayName = userName(admin);
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId: conversation._id,
      accountId: conversation.accountId,
      contactId: conversation.contactId,
      ...(conversation.businessId ? { businessId: conversation.businessId } : {}),
      channel: conversation.channel,
      direction: "admin_to_client",
      authorKind: "admin",
      authorUserId: admin._id,
      authorDisplayName,
      content,
      createdAt: now,
    });
    await ctx.db.patch(conversation._id, {
      status: "waiting_client",
      latestMessagePreview: preview(content),
      latestMessageAt: now,
      latestMessageDirection: "admin_to_client",
      latestMessageAuthorName: authorDisplayName,
      updatedAt: now,
    });
    await writeEvent(ctx, {
      conversationId: conversation._id,
      accountId: conversation.accountId,
      messageId,
      event: "admin_reply_sent",
      actorKind: "admin",
      actorUserId: admin._id,
      now,
    });
    if (conversation.status !== "waiting_client") {
      await writeEvent(ctx, {
        conversationId: conversation._id,
        accountId: conversation.accountId,
        event: "status_changed",
        actorKind: "admin",
        actorUserId: admin._id,
        fromStatus: conversation.status,
        toStatus: "waiting_client",
        now,
      });
    }
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: conversation.accountId,
      ...(conversation.businessId ? { businessId: conversation.businessId } : {}),
      action: "admin_v1_conversation_reply_sent",
      detail: { conversationId: conversation._id, messageId },
      now,
    });
    return { messageId };
  },
});

export const setStatus = mutation({
  args: {
    conversationId: v.id("conversations"),
    status: conversationStatusValidator,
  },
  returns: v.object({ status: conversationStatusValidator }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const conversation = await requireConversation(ctx, args.conversationId);
    if (conversation.status === args.status) return { status: args.status };
    const now = Date.now();
    await ctx.db.patch(conversation._id, { status: args.status, updatedAt: now });
    await writeEvent(ctx, {
      conversationId: conversation._id,
      accountId: conversation.accountId,
      event: "status_changed",
      actorKind: "admin",
      actorUserId: admin._id,
      fromStatus: conversation.status,
      toStatus: args.status,
      now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: conversation.accountId,
      ...(conversation.businessId ? { businessId: conversation.businessId } : {}),
      action: "admin_v1_conversation_status_changed",
      detail: {
        conversationId: conversation._id,
        before: conversation.status,
        after: args.status,
      },
      now,
    });
    return { status: args.status };
  },
});

export const setAssignee = mutation({
  args: {
    conversationId: v.id("conversations"),
    assigneeAdminId: v.union(v.id("users"), v.null()),
  },
  returns: v.object({ assigneeAdminId: v.union(v.id("users"), v.null()) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const conversation = await requireConversation(ctx, args.conversationId);
    let assigneeName: string | undefined;
    if (args.assigneeAdminId) {
      const assignee = await ctx.db.get(args.assigneeAdminId);
      if (!assignee || !isAdminEmail(assignee.email)) {
        throw new ConvexError("admin_communications_assignee_invalid");
      }
      assigneeName = userName(assignee);
    }
    if ((conversation.assigneeAdminId ?? null) === args.assigneeAdminId) {
      return { assigneeAdminId: args.assigneeAdminId };
    }
    const now = Date.now();
    await ctx.db.patch(conversation._id, {
      assigneeAdminId: args.assigneeAdminId ?? undefined,
      assigneeName,
      assigneeKey: args.assigneeAdminId ? String(args.assigneeAdminId) : UNASSIGNED,
      updatedAt: now,
    });
    await writeEvent(ctx, {
      conversationId: conversation._id,
      accountId: conversation.accountId,
      event: "assignee_changed",
      actorKind: "admin",
      actorUserId: admin._id,
      ...(conversation.assigneeAdminId
        ? { previousAssigneeAdminId: conversation.assigneeAdminId }
        : {}),
      ...(args.assigneeAdminId ? { nextAssigneeAdminId: args.assigneeAdminId } : {}),
      now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: conversation.accountId,
      action: "admin_v1_conversation_assignee_changed",
      detail: {
        conversationId: conversation._id,
        before: conversation.assigneeAdminId ?? null,
        after: args.assigneeAdminId,
      },
      now,
    });
    return { assigneeAdminId: args.assigneeAdminId };
  },
});

export const logManualEntry = mutation({
  args: {
    accountId: v.id("accounts"),
    contactId: v.id("accountContacts"),
    businessId: v.optional(v.id("businesses")),
    channel: v.union(
      v.literal("phone"),
      v.literal("in_person"),
      v.literal("copied_message"),
    ),
    content: v.string(),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    messageId: v.id("conversationMessages"),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const [account, contact, business] = await Promise.all([
      ctx.db.get(args.accountId),
      ctx.db.get(args.contactId),
      args.businessId ? ctx.db.get(args.businessId) : null,
    ]);
    if (
      !account ||
      account.adminV1MigrationVersion !== 1 ||
      !account.smkCode ||
      !contact ||
      contact.accountId !== account._id ||
      (args.businessId && !business) ||
      (business && business.accountId !== account._id)
    ) throw new ConvexError("admin_communications_context_invalid");
    const content = cleanContent(args.content);
    const now = Date.now();
    const authorDisplayName = userName(admin);
    const contactName = `${contact.firstName} ${contact.lastName}`.trim();
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_businessId_and_contactId_and_channel", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("contactId", contact._id)
          .eq("channel", args.channel),
      )
      .unique();
    const searchText = normalizeAdminSearchText(
      [account.name, account.smkCode, contactName, business?.name, preview(content)]
        .filter(Boolean)
        .join(" "),
    );
    const conversationId = existing?._id ?? await ctx.db.insert("conversations", {
      accountId: account._id,
      accountName: account.name,
      smkCode: account.smkCode,
      contactId: contact._id,
      contactName,
      ...(contact.normalizedEmail ? { contactEmail: contact.normalizedEmail } : {}),
      ...(contact.normalizedPhone ? { contactPhone: contact.normalizedPhone } : {}),
      ...(business ? { businessId: business._id, businessName: business.name } : {}),
      channel: args.channel,
      status: "in_progress",
      assigneeAdminId: admin._id,
      assigneeName: authorDisplayName,
      assigneeKey: String(admin._id),
      latestMessagePreview: preview(content),
      latestMessageAt: now,
      latestMessageDirection: "manual",
      latestMessageAuthorName: authorDisplayName,
      adminUnreadCount: 0,
      searchText,
      createdAt: now,
      updatedAt: now,
    });
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId,
      accountId: account._id,
      contactId: contact._id,
      ...(business ? { businessId: business._id } : {}),
      channel: args.channel,
      direction: "manual",
      authorKind: "admin",
      authorUserId: admin._id,
      authorDisplayName,
      content,
      createdAt: now,
    });
    await ctx.db.patch(conversationId, {
      latestMessagePreview: preview(content),
      latestMessageAt: now,
      latestMessageDirection: "manual",
      latestMessageAuthorName: authorDisplayName,
      searchText,
      updatedAt: now,
    });
    await writeEvent(ctx, {
      conversationId,
      accountId: account._id,
      messageId,
      event: "manual_entry_logged",
      actorKind: "admin",
      actorUserId: admin._id,
      now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: account._id,
      ...(business ? { businessId: business._id } : {}),
      action: "admin_v1_manual_communication_logged",
      detail: { conversationId, messageId, channel: args.channel },
      now,
    });
    return { conversationId, messageId };
  },
});

export const me = query({
  args: {},
  returns: v.object({ id: v.id("users"), name: v.string() }),
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    return { id: admin._id, name: userName(admin) };
  },
});
