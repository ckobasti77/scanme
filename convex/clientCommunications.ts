import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { BusinessAccessDeniedError, requireBusinessAccess } from "./lib/access";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";

const MAX_MESSAGES = 100;
const MAX_CONTENT = 4_000;
const MAX_CLIENT_MESSAGE_ID = 120;

const clientMessageValidator = v.object({
  id: v.id("conversationMessages"),
  mine: v.boolean(),
  content: v.string(),
  createdAt: v.number(),
});

const panelConversationValidator = v.union(
  v.object({ status: v.literal("unavailable") }),
  v.object({
    status: v.literal("available"),
    businessName: v.string(),
    contactName: v.string(),
    conversationId: v.union(v.id("conversations"), v.null()),
    messages: v.array(clientMessageValidator),
    messagesCapped: v.boolean(),
  }),
);

type DatabaseCtx = QueryCtx | MutationCtx;

async function clientContext(ctx: DatabaseCtx, slug: string) {
  let access;
  try {
    access = await requireBusinessAccess(ctx, slug);
  } catch (error) {
    if (error instanceof BusinessAccessDeniedError) return null;
    throw error;
  }
  if (
    access.accessRole === "admin" ||
    !access.business.accountId ||
    !access.accountMembership?.contactId
  ) return null;
  const [account, contact] = await Promise.all([
    ctx.db.get(access.business.accountId),
    ctx.db.get(access.accountMembership.contactId),
  ]);
  if (
    !account ||
    account.adminV1MigrationVersion !== 1 ||
    !account.smkCode ||
    !contact ||
    contact.accountId !== account._id ||
    contact.status !== "active"
  ) return null;
  return { access, account, contact, smkCode: account.smkCode };
}

async function findConversation(
  ctx: DatabaseCtx,
  businessId: Id<"businesses">,
  contactId: Id<"accountContacts">,
) {
  return ctx.db
    .query("conversations")
    .withIndex("by_businessId_and_contactId_and_channel", (q) =>
      q
        .eq("businessId", businessId)
        .eq("contactId", contactId)
        .eq("channel", "panel_chat"),
    )
    .unique();
}

function cleanContent(value: string) {
  const content = value.trim();
  if (!content || content.length > MAX_CONTENT) {
    throw new ConvexError("client_chat_content_invalid");
  }
  return content;
}

function cleanMessageId(value: string) {
  const id = value.trim();
  if (!id || id.length > MAX_CLIENT_MESSAGE_ID || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new ConvexError("client_chat_message_id_invalid");
  }
  return id;
}

export const getPanelConversation = query({
  args: { slug: v.string() },
  returns: panelConversationValidator,
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args.slug);
    if (!context) return { status: "unavailable" as const };
    const conversation = await findConversation(
      ctx,
      context.access.business._id,
      context.contact._id,
    );
    if (!conversation) {
      return {
        status: "available" as const,
        businessName: context.access.business.name,
        contactName: `${context.contact.firstName} ${context.contact.lastName}`.trim(),
        conversationId: null,
        messages: [],
        messagesCapped: false,
      };
    }
    const rows = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversationId_and_createdAt", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("desc")
      .take(MAX_MESSAGES + 1);
    return {
      status: "available" as const,
      businessName: context.access.business.name,
      contactName: `${context.contact.firstName} ${context.contact.lastName}`.trim(),
      conversationId: conversation._id,
      messages: rows
        .slice(0, MAX_MESSAGES)
        .reverse()
        .map((message) => ({
          id: message._id,
          mine: message.direction === "client_to_admin",
          content: message.content,
          createdAt: message.createdAt,
        })),
      messagesCapped: rows.length > MAX_MESSAGES,
    };
  },
});

export const markPanelAvailable = mutation({
  args: { slug: v.string() },
  returns: v.object({ marked: v.boolean() }),
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args.slug);
    if (!context) throw new ConvexError("client_chat_unavailable");
    const conversation = await findConversation(
      ctx,
      context.access.business._id,
      context.contact._id,
    );
    if (!conversation) return { marked: false };
    const now = Date.now();
    if ((conversation.clientOpenedPanelAt ?? 0) < now) {
      await ctx.db.patch(conversation._id, { clientOpenedPanelAt: now });
    }
    return { marked: true };
  },
});

export const markConversationRead = mutation({
  args: { slug: v.string() },
  returns: v.object({ marked: v.boolean() }),
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args.slug);
    if (!context) throw new ConvexError("client_chat_unavailable");
    const conversation = await findConversation(
      ctx,
      context.access.business._id,
      context.contact._id,
    );
    if (!conversation) return { marked: false };
    const now = Date.now();
    await ctx.db.patch(conversation._id, {
      clientOpenedPanelAt: Math.max(conversation.clientOpenedPanelAt ?? 0, now),
      clientOpenedConversationAt: Math.max(
        conversation.clientOpenedConversationAt ?? 0,
        now,
      ),
    });
    return { marked: true };
  },
});

export const sendPanelMessage = mutation({
  args: {
    slug: v.string(),
    clientMessageId: v.string(),
    content: v.string(),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    messageId: v.id("conversationMessages"),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args.slug);
    if (!context) throw new ConvexError("client_chat_unavailable");
    const content = cleanContent(args.content);
    const clientMessageId = cleanMessageId(args.clientMessageId);
    const duplicate = await ctx.db
      .query("conversationMessages")
      .withIndex("by_accountId_and_clientMessageId", (q) =>
        q
          .eq("accountId", context.account._id)
          .eq("clientMessageId", clientMessageId),
      )
      .unique();
    if (duplicate) {
      if (
        duplicate.authorContactId !== context.contact._id ||
        duplicate.content !== content ||
        duplicate.businessId !== context.access.business._id
      ) throw new ConvexError("client_chat_idempotency_conflict");
      return {
        conversationId: duplicate.conversationId,
        messageId: duplicate._id,
        duplicate: true,
      };
    }

    const now = Date.now();
    const contactName = `${context.contact.firstName} ${context.contact.lastName}`.trim();
    const existing = await findConversation(
      ctx,
      context.access.business._id,
      context.contact._id,
    );
    const nextStatus = existing
      ? existing.status === "completed" || existing.status === "waiting_client"
        ? "needs_reply" as const
        : existing.status
      : "new" as const;
    const latestPreview = content.replace(/\s+/g, " ").slice(0, 180);
    const searchText = normalizeAdminSearchText(
      [
        context.account.name,
        context.smkCode,
        contactName,
        context.access.business.name,
        latestPreview,
      ].join(" "),
    );
    const conversationId = existing?._id ?? await ctx.db.insert("conversations", {
      accountId: context.account._id,
      accountName: context.account.name,
      smkCode: context.smkCode,
      contactId: context.contact._id,
      contactName,
      ...(context.contact.normalizedEmail
        ? { contactEmail: context.contact.normalizedEmail }
        : {}),
      ...(context.contact.normalizedPhone
        ? { contactPhone: context.contact.normalizedPhone }
        : {}),
      businessId: context.access.business._id,
      businessName: context.access.business.name,
      channel: "panel_chat",
      status: nextStatus,
      assigneeKey: "unassigned",
      latestMessagePreview: latestPreview,
      latestMessageAt: now,
      latestMessageDirection: "client_to_admin",
      latestMessageAuthorName: contactName,
      adminUnreadCount: 1,
      searchText,
      clientOpenedPanelAt: now,
      clientOpenedConversationAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId,
      accountId: context.account._id,
      contactId: context.contact._id,
      businessId: context.access.business._id,
      channel: "panel_chat",
      direction: "client_to_admin",
      authorKind: "client",
      authorUserId: context.access.user._id,
      authorContactId: context.contact._id,
      authorDisplayName: contactName,
      content,
      clientMessageId,
      createdAt: now,
    });
    await ctx.db.patch(conversationId, {
      status: nextStatus,
      latestMessagePreview: latestPreview,
      latestMessageAt: now,
      latestMessageDirection: "client_to_admin",
      latestMessageAuthorName: contactName,
      adminUnreadCount: (existing?.adminUnreadCount ?? 0) + 1,
      searchText,
      clientOpenedPanelAt: now,
      clientOpenedConversationAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("conversationEvents", {
      conversationId,
      accountId: context.account._id,
      messageId,
      event: "client_message_received",
      actorKind: "client",
      actorUserId: context.access.user._id,
      actorContactId: context.contact._id,
      createdAt: now,
    });
    if (existing && existing.status !== nextStatus) {
      await ctx.db.insert("conversationEvents", {
        conversationId,
        accountId: context.account._id,
        event: "status_changed",
        actorKind: "client",
        actorUserId: context.access.user._id,
        actorContactId: context.contact._id,
        fromStatus: existing.status,
        toStatus: nextStatus,
        createdAt: now,
      });
    }
    return { conversationId, messageId, duplicate: false };
  },
});
