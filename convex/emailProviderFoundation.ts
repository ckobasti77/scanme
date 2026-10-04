import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import {
  emailProviderAttachmentStateValidator,
  emailProviderMappingStateValidator,
  emailProviderOperationalStateValidator,
  emailProviderOutboxStateValidator,
  emailProviderValidator,
  type EmailProviderOutboxState,
} from "./lib/emailProviderValidators";
import { normalizeEmailAddress, normalizeProviderId } from "./lib/emailProvider";

const MAX_SAFE_CODE = 80;
const MAX_COMMAND_ID = 120;
const MAX_SUBJECT = 500;
const MAX_CONTENT = 50_000;
const MAX_REFERENCES = 50;
const MAX_ATTACHMENTS = 50;
const MAX_PROVIDER_STATE = 40;
const UNASSIGNED = "unassigned";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

const providerMessageLookupValidator = v.union(
  v.object({
    providerMessageRef: v.id("emailProviderMessages"),
    attachmentState: emailProviderAttachmentStateValidator,
  }),
  v.null(),
);

const checkpointValidator = v.object({
  checkpointReceivedAt: nullableNumber,
  checkpointProviderMessageId: nullableString,
  continuationStart: nullableNumber,
  retryAttempt: v.number(),
  nextAttemptAt: nullableNumber,
});

const attachmentInputValidator = v.object({
  providerAttachmentId: v.string(),
  fileName: v.string(),
  size: v.number(),
  inline: v.boolean(),
});

const inboundInputFields = {
  connectionId: v.id("emailProviderConnections"),
  providerAccountId: v.string(),
  providerMessageId: v.string(),
  folderId: v.string(),
  providerThreadId: v.optional(v.string()),
  rfcMessageId: v.optional(v.string()),
  inReplyTo: v.optional(v.string()),
  references: v.array(v.string()),
  senderAddress: v.string(),
  subject: v.string(),
  safePreview: v.string(),
  plainTextContent: v.string(),
  receivedAt: v.number(),
  providerReadState: v.optional(v.string()),
  hasAttachment: v.boolean(),
  now: v.number(),
};

function cleanSafeCode(value: string) {
  const code = value.trim();
  if (!code || code.length > MAX_SAFE_CODE || !/^[a-z0-9_]+$/.test(code)) {
    throw new ConvexError("email_provider_safe_code_invalid");
  }
  return code;
}

function cleanCommandId(value: string) {
  const commandId = value.trim();
  if (
    !commandId ||
    commandId.length > MAX_COMMAND_ID ||
    !/^[A-Za-z0-9_-]+$/.test(commandId)
  ) throw new ConvexError("email_provider_command_id_invalid");
  return commandId;
}

function cleanSubject(value: string) {
  const subject = value.trim();
  if (subject.length > MAX_SUBJECT) {
    throw new ConvexError("email_provider_subject_invalid");
  }
  return subject;
}

function cleanContent(value: string) {
  const content = value.trim();
  if (!content || content.length > MAX_CONTENT || /<\/?[a-z][^>]*>/i.test(content)) {
    throw new ConvexError("email_provider_plain_text_invalid");
  }
  return content;
}

function cleanHeaderSignal(value: string | undefined) {
  if (value === undefined) return undefined;
  const signal = value.trim();
  if (!signal || signal.length > 4_096 || /[\r\n]/.test(signal)) {
    throw new ConvexError("email_provider_header_invalid");
  }
  return signal;
}

function cleanReferences(values: string[]) {
  if (values.length > MAX_REFERENCES) {
    throw new ConvexError("email_provider_references_excessive");
  }
  return [...new Set(values.map((value) => {
    const signal = cleanHeaderSignal(value);
    if (!signal) throw new ConvexError("email_provider_header_invalid");
    return signal;
  }))];
}

async function requireConnection(
  ctx: MutationCtx,
  connectionId: Id<"emailProviderConnections">,
) {
  const connection = await ctx.db.get(connectionId);
  if (!connection) throw new ConvexError("email_provider_connection_not_found");
  return connection;
}

async function findConnection(ctx: MutationCtx) {
  return ctx.db
    .query("emailProviderConnections")
    .withIndex("by_provider", (q) => q.eq("provider", "zoho"))
    .unique();
}

async function writeProviderAudit(
  ctx: MutationCtx,
  entry: {
    connectionId?: Id<"emailProviderConnections">;
    event: Doc<"emailProviderAudit">["event"];
    outcome: Doc<"emailProviderAudit">["outcome"];
    safeCode?: string;
    providerMessageId?: string;
    sendCommandId?: string;
    runId?: string;
    count?: number;
    now: number;
  },
) {
  await ctx.db.insert("emailProviderAudit", {
    ...(entry.connectionId ? { connectionId: entry.connectionId } : {}),
    provider: "zoho",
    event: entry.event,
    outcome: entry.outcome,
    ...(entry.safeCode ? { safeCode: cleanSafeCode(entry.safeCode) } : {}),
    ...(entry.providerMessageId
      ? { providerMessageId: normalizeProviderId(entry.providerMessageId, "provider_message_id_invalid") }
      : {}),
    ...(entry.sendCommandId ? { sendCommandId: cleanCommandId(entry.sendCommandId) } : {}),
    ...(entry.runId ? { runId: cleanCommandId(entry.runId) } : {}),
    ...(entry.count !== undefined ? { count: entry.count } : {}),
    createdAt: entry.now,
  });
}

export const getStatus = query({
  args: {},
  returns: v.object({
    provider: emailProviderValidator,
    operationalState: emailProviderOperationalStateValidator,
    configured: v.boolean(),
    syncEnabled: v.boolean(),
    outboundEnabled: v.boolean(),
    accountVerified: v.boolean(),
    foldersVerified: v.boolean(),
    groupSendAsVerified: v.boolean(),
    lastSuccessfulSyncAt: nullableNumber,
    lastErrorCode: nullableString,
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const connection = await ctx.db
      .query("emailProviderConnections")
      .withIndex("by_provider", (q) => q.eq("provider", "zoho"))
      .unique();
    const configured = Boolean(
      connection?.providerAccountId &&
      connection.inboxFolderId &&
      connection.fromAddress,
    );
    const syncEnabled = Boolean(
      configured &&
      connection?.syncEnabled &&
      connection.accountVerifiedAt &&
      connection.foldersVerifiedAt,
    );
    const outboundEnabled = Boolean(
      syncEnabled &&
      connection?.outboundEnabled &&
      connection.groupSendAsVerified,
    );
    return {
      provider: "zoho" as const,
      operationalState: syncEnabled
        ? connection?.operationalState ?? "disabled"
        : "disabled",
      configured,
      syncEnabled,
      outboundEnabled,
      accountVerified: Boolean(connection?.accountVerifiedAt),
      foldersVerified: Boolean(connection?.foldersVerifiedAt),
      groupSendAsVerified: Boolean(connection?.groupSendAsVerified),
      lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt ?? null,
      lastErrorCode: connection?.lastErrorCode ?? null,
    };
  },
});

export const queueOutbound = mutation({
  args: {
    conversationId: v.id("conversations"),
    sendCommandId: v.string(),
    subject: v.string(),
    plainTextContent: v.string(),
    replyToProviderMessageId: v.optional(v.string()),
  },
  returns: v.object({
    outboxId: v.id("emailProviderOutbox"),
    state: emailProviderOutboxStateValidator,
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const [conversation, connection] = await Promise.all([
      ctx.db.get(args.conversationId),
      findConnection(ctx),
    ]);
    if (!conversation || conversation.channel !== "email" || !conversation.contactEmail) {
      throw new ConvexError("email_provider_conversation_invalid");
    }
    if (!connection || !connection.fromAddress) {
      throw new ConvexError("email_provider_not_configured");
    }
    const sendCommandId = cleanCommandId(args.sendCommandId);
    const subject = cleanSubject(args.subject);
    const plainTextContent = cleanContent(args.plainTextContent);
    const replyToProviderMessageId = args.replyToProviderMessageId
      ? normalizeProviderId(args.replyToProviderMessageId, "provider_reply_message_id_invalid")
      : undefined;
    const fromAddress = normalizeEmailAddress(connection.fromAddress);
    const toAddress = normalizeEmailAddress(conversation.contactEmail);
    const duplicate = await ctx.db
      .query("emailProviderOutbox")
      .withIndex("by_connectionId_and_sendCommandId", (q) =>
        q.eq("connectionId", connection._id).eq("sendCommandId", sendCommandId),
      )
      .unique();
    if (duplicate) {
      if (
        duplicate.conversationId !== conversation._id ||
        duplicate.fromAddress !== fromAddress ||
        duplicate.toAddress !== toAddress ||
        duplicate.subject !== subject ||
        duplicate.plainTextContent !== plainTextContent ||
        duplicate.replyToProviderMessageId !== replyToProviderMessageId
      ) throw new ConvexError("email_provider_command_conflict");
      return { outboxId: duplicate._id, state: duplicate.state, duplicate: true };
    }
    const now = Date.now();
    const outboxId = await ctx.db.insert("emailProviderOutbox", {
      connectionId: connection._id,
      conversationId: conversation._id,
      adminUserId: admin._id,
      sendCommandId,
      ...(replyToProviderMessageId ? { replyToProviderMessageId } : {}),
      fromAddress,
      toAddress,
      subject,
      plainTextContent,
      state: "pending",
      reconciliationAttempt: 0,
      createdAt: now,
      updatedAt: now,
    });
    await writeProviderAudit(ctx, {
      connectionId: connection._id,
      event: "outbox_queued",
      outcome: "info",
      sendCommandId,
      now,
    });
    return { outboxId, state: "pending" as const, duplicate: false };
  },
});

export const initializeDisabledConnection = internalMutation({
  args: {
    providerAccountId: v.string(),
    inboxFolderId: v.string(),
    sentFolderId: v.optional(v.string()),
    fromAddress: v.string(),
    now: v.number(),
  },
  returns: v.object({ connectionId: v.id("emailProviderConnections") }),
  handler: async (ctx, args) => {
    const providerAccountId = normalizeProviderId(args.providerAccountId, "provider_account_id_invalid");
    const inboxFolderId = normalizeProviderId(args.inboxFolderId, "provider_inbox_folder_id_invalid");
    const sentFolderId = args.sentFolderId
      ? normalizeProviderId(args.sentFolderId, "provider_sent_folder_id_invalid")
      : undefined;
    const fromAddress = normalizeEmailAddress(args.fromAddress);
    const existing = await ctx.db
      .query("emailProviderConnections")
      .withIndex("by_provider", (q) => q.eq("provider", "zoho"))
      .unique();
    const patch = {
      operationalState: "disabled" as const,
      providerAccountId,
      inboxFolderId,
      sentFolderId,
      fromAddress,
      syncEnabled: false,
      outboundEnabled: false,
      groupSendAsVerified: false,
      accountVerifiedAt: undefined,
      foldersVerifiedAt: undefined,
      lastErrorCode: undefined,
      updatedAt: args.now,
    };
    const connectionId = existing?._id ?? await ctx.db.insert("emailProviderConnections", {
      provider: "zoho",
      ...patch,
      createdAt: args.now,
    });
    if (existing) await ctx.db.patch(existing._id, patch);
    await writeProviderAudit(ctx, {
      connectionId,
      event: "connection_initialized",
      outcome: "info",
      now: args.now,
    });
    return { connectionId };
  },
});

export const acquireSyncLease = internalMutation({
  args: {
    connectionId: v.id("emailProviderConnections"),
    leaseToken: v.string(),
    acquiredAt: v.number(),
    expiresAt: v.number(),
  },
  returns: v.object({ acquired: v.boolean() }),
  handler: async (ctx, args) => {
    const connection = await requireConnection(ctx, args.connectionId);
    const leaseToken = cleanCommandId(args.leaseToken);
    if (
      !connection.syncEnabled ||
      !connection.providerAccountId ||
      !connection.inboxFolderId ||
      !connection.accountVerifiedAt ||
      !connection.foldersVerifiedAt ||
      args.expiresAt <= args.acquiredAt ||
      args.expiresAt > args.acquiredAt + 5 * 60 * 1_000
    ) return { acquired: false };
    const existing = await ctx.db
      .query("emailProviderSyncLeases")
      .withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id))
      .unique();
    if (
      existing &&
      existing.expiresAt > args.acquiredAt &&
      existing.leaseToken !== leaseToken
    ) return { acquired: false };
    if (existing) {
      await ctx.db.patch(existing._id, {
        leaseToken,
        acquiredAt: args.acquiredAt,
        expiresAt: args.expiresAt,
      });
    } else {
      await ctx.db.insert("emailProviderSyncLeases", {
        connectionId: connection._id,
        leaseToken,
        acquiredAt: args.acquiredAt,
        expiresAt: args.expiresAt,
      });
    }
    await ctx.db.patch(connection._id, {
      operationalState: "syncing",
      updatedAt: args.acquiredAt,
    });
    await writeProviderAudit(ctx, {
      connectionId: connection._id,
      event: "lease_acquired",
      outcome: "info",
      runId: leaseToken,
      now: args.acquiredAt,
    });
    return { acquired: true };
  },
});

export const releaseSyncLease = internalMutation({
  args: {
    connectionId: v.id("emailProviderConnections"),
    leaseToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailProviderSyncLeases")
      .withIndex("by_connectionId", (q) => q.eq("connectionId", args.connectionId))
      .unique();
    if (existing?.leaseToken === cleanCommandId(args.leaseToken)) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const getSyncCheckpoint = internalQuery({
  args: {
    connectionId: v.id("emailProviderConnections"),
    folderId: v.string(),
  },
  returns: checkpointValidator,
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db
      .query("emailProviderFolderCheckpoints")
      .withIndex("by_connectionId_and_folderId", (q) =>
        q.eq("connectionId", args.connectionId).eq("folderId", args.folderId),
      )
      .unique();
    return {
      checkpointReceivedAt: checkpoint?.checkpointReceivedAt ?? null,
      checkpointProviderMessageId: checkpoint?.checkpointProviderMessageId ?? null,
      continuationStart: checkpoint?.continuationStart ?? null,
      retryAttempt: checkpoint?.retryAttempt ?? 0,
      nextAttemptAt: checkpoint?.nextAttemptAt ?? null,
    };
  },
});

export const findProviderMessage = internalQuery({
  args: {
    connectionId: v.id("emailProviderConnections"),
    providerMessageId: v.string(),
  },
  returns: providerMessageLookupValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailProviderMessages")
      .withIndex("by_connectionId_and_providerMessageId", (q) =>
        q
          .eq("connectionId", args.connectionId)
          .eq("providerMessageId", normalizeProviderId(args.providerMessageId, "provider_message_id_invalid")),
      )
      .unique();
    return row
      ? { providerMessageRef: row._id, attachmentState: row.attachmentState }
      : null;
  },
});

async function findThreadConversation(
  ctx: MutationCtx,
  args: {
    connectionId: Id<"emailProviderConnections">;
    providerThreadId?: string;
    inReplyTo?: string;
    references: string[];
  },
) {
  if (args.providerThreadId) {
    const rows = await ctx.db
      .query("emailProviderMessages")
      .withIndex("by_connectionId_and_providerThreadId", (q) =>
        q.eq("connectionId", args.connectionId).eq("providerThreadId", args.providerThreadId),
      )
      .order("desc")
      .take(20);
    const mapped = rows.find((row) => row.conversationId);
    if (mapped?.conversationId) return mapped.conversationId;
  }
  const candidates = [args.inReplyTo, ...[...args.references].reverse()].filter(
    (value): value is string => Boolean(value),
  );
  for (const rfcMessageId of candidates.slice(0, MAX_REFERENCES)) {
    const rows = await ctx.db
      .query("emailProviderMessages")
      .withIndex("by_connectionId_and_rfcMessageId", (q) =>
        q.eq("connectionId", args.connectionId).eq("rfcMessageId", rfcMessageId),
      )
      .order("desc")
      .take(5);
    const mapped = rows.find((row) => row.conversationId);
    if (mapped?.conversationId) return mapped.conversationId;
  }
  return null;
}

async function insertStagedMessage(
  ctx: MutationCtx,
  args: {
    connectionId: Id<"emailProviderConnections">;
    providerAccountId: string;
    providerMessageId: string;
    folderId: string;
    providerThreadId?: string;
    rfcMessageId?: string;
    inReplyTo?: string;
    references: string[];
    senderAddress: string;
    subject: string;
    safePreview: string;
    plainTextContent?: string;
    receivedAt: number;
    providerReadState?: string;
    mappingState: "unmatched" | "ambiguous" | "poisoned";
    hasAttachment: boolean;
    poisonCode?: string;
    now: number;
  },
) {
  return ctx.db.insert("emailProviderMessages", {
    connectionId: args.connectionId,
    provider: "zoho",
    providerAccountId: args.providerAccountId,
    providerMessageId: args.providerMessageId,
    folderId: args.folderId,
    ...(args.providerThreadId ? { providerThreadId: args.providerThreadId } : {}),
    ...(args.rfcMessageId ? { rfcMessageId: args.rfcMessageId } : {}),
    ...(args.inReplyTo ? { inReplyTo: args.inReplyTo } : {}),
    references: args.references,
    senderAddress: args.senderAddress,
    subject: args.subject,
    safePreview: args.safePreview,
    ...(args.plainTextContent ? { plainTextContent: args.plainTextContent } : {}),
    receivedAt: args.receivedAt,
    ...(args.providerReadState ? { providerReadState: args.providerReadState } : {}),
    mappingState: args.mappingState,
    attachmentState: args.hasAttachment ? "pending" : "none",
    ...(args.poisonCode ? { poisonCode: args.poisonCode } : {}),
    createdAt: args.now,
    updatedAt: args.now,
  });
}

export const persistInbound = internalMutation({
  args: inboundInputFields,
  returns: v.object({
    providerMessageRef: v.id("emailProviderMessages"),
    mappingState: emailProviderMappingStateValidator,
    conversationId: v.union(v.id("conversations"), v.null()),
    conversationMessageId: v.union(v.id("conversationMessages"), v.null()),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const connection = await requireConnection(ctx, args.connectionId);
    const providerAccountId = normalizeProviderId(args.providerAccountId, "provider_account_id_invalid");
    const providerMessageId = normalizeProviderId(args.providerMessageId, "provider_message_id_invalid");
    const folderId = normalizeProviderId(args.folderId, "provider_folder_id_invalid");
    if (connection.providerAccountId !== providerAccountId) {
      throw new ConvexError("email_provider_account_not_allowed");
    }
    const existing = await ctx.db
      .query("emailProviderMessages")
      .withIndex("by_provider_and_providerAccountId_and_providerMessageId", (q) =>
        q
          .eq("provider", "zoho")
          .eq("providerAccountId", providerAccountId)
          .eq("providerMessageId", providerMessageId),
      )
      .unique();
    if (existing) {
      if (existing.connectionId !== connection._id) {
        throw new ConvexError("email_provider_idempotency_conflict");
      }
      return {
        providerMessageRef: existing._id,
        mappingState: existing.mappingState,
        conversationId: existing.conversationId ?? null,
        conversationMessageId: existing.conversationMessageId ?? null,
        duplicate: true,
      };
    }

    const providerThreadId = args.providerThreadId
      ? normalizeProviderId(args.providerThreadId, "provider_thread_id_invalid")
      : undefined;
    const rfcMessageId = cleanHeaderSignal(args.rfcMessageId);
    const inReplyTo = cleanHeaderSignal(args.inReplyTo);
    const references = cleanReferences(args.references);
    const senderAddress = normalizeEmailAddress(args.senderAddress);
    const subject = cleanSubject(args.subject);
    const plainTextContent = cleanContent(args.plainTextContent);
    const safePreview = (args.safePreview.trim() || plainTextContent).slice(0, 180);
    const providerReadState = args.providerReadState?.trim();
    if (providerReadState && providerReadState.length > MAX_PROVIDER_STATE) {
      throw new ConvexError("email_provider_read_state_invalid");
    }

    if (rfcMessageId) {
      const duplicates = await ctx.db
        .query("emailProviderMessages")
        .withIndex("by_connectionId_and_rfcMessageId", (q) =>
          q.eq("connectionId", connection._id).eq("rfcMessageId", rfcMessageId),
        )
        .order("desc")
        .take(5);
      const duplicate = duplicates.find((row) =>
        row.conversationMessageId && row.senderAddress === senderAddress
      );
      if (duplicate) {
        const providerMessageRef = await ctx.db.insert("emailProviderMessages", {
          connectionId: connection._id,
          provider: "zoho",
          providerAccountId,
          providerMessageId,
          folderId,
          ...(providerThreadId ? { providerThreadId } : {}),
          rfcMessageId,
          ...(inReplyTo ? { inReplyTo } : {}),
          references,
          senderAddress,
          subject,
          safePreview,
          plainTextContent,
          receivedAt: args.receivedAt,
          ...(providerReadState ? { providerReadState } : {}),
          mappingState: "matched",
          ...(duplicate.conversationId ? { conversationId: duplicate.conversationId } : {}),
          ...(duplicate.conversationMessageId
            ? { conversationMessageId: duplicate.conversationMessageId }
            : {}),
          duplicateOfMessageId: duplicate._id,
          attachmentState: args.hasAttachment ? "pending" : "none",
          createdAt: args.now,
          updatedAt: args.now,
        });
        return {
          providerMessageRef,
          mappingState: "matched" as const,
          conversationId: duplicate.conversationId ?? null,
          conversationMessageId: duplicate.conversationMessageId ?? null,
          duplicate: true,
        };
      }
    }

    const contacts = await ctx.db
      .query("accountContacts")
      .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", senderAddress))
      .take(3);
    const activeContacts = contacts.filter((contact) => contact.status === "active");
    if (activeContacts.length !== 1) {
      const mappingState = activeContacts.length === 0 ? "unmatched" as const : "ambiguous" as const;
      const providerMessageRef = await insertStagedMessage(ctx, {
        connectionId: connection._id,
        providerAccountId,
        providerMessageId,
        folderId,
        providerThreadId,
        rfcMessageId,
        inReplyTo,
        references,
        senderAddress,
        subject,
        safePreview,
        plainTextContent,
        receivedAt: args.receivedAt,
        providerReadState,
        mappingState,
        hasAttachment: args.hasAttachment,
        now: args.now,
      });
      await writeProviderAudit(ctx, {
        connectionId: connection._id,
        event: "message_staged",
        outcome: "info",
        safeCode: mappingState === "unmatched" ? "sender_unmatched" : "sender_ambiguous",
        providerMessageId,
        now: args.now,
      });
      return {
        providerMessageRef,
        mappingState,
        conversationId: null,
        conversationMessageId: null,
        duplicate: false,
      };
    }

    const contact = activeContacts[0];
    const account = await ctx.db.get(contact.accountId);
    if (!account || account.adminV1MigrationVersion !== 1 || !account.smkCode) {
      const providerMessageRef = await insertStagedMessage(ctx, {
        connectionId: connection._id,
        providerAccountId,
        providerMessageId,
        folderId,
        providerThreadId,
        rfcMessageId,
        inReplyTo,
        references,
        senderAddress,
        subject,
        safePreview,
        plainTextContent,
        receivedAt: args.receivedAt,
        providerReadState,
        mappingState: "unmatched",
        hasAttachment: args.hasAttachment,
        now: args.now,
      });
      await writeProviderAudit(ctx, {
        connectionId: connection._id,
        event: "message_staged",
        outcome: "info",
        safeCode: "account_unmatched",
        providerMessageId,
        now: args.now,
      });
      return {
        providerMessageRef,
        mappingState: "unmatched" as const,
        conversationId: null,
        conversationMessageId: null,
        duplicate: false,
      };
    }

    const contactName = `${contact.firstName} ${contact.lastName}`.trim();
    let conversationId = await findThreadConversation(ctx, {
      connectionId: connection._id,
      providerThreadId,
      inReplyTo,
      references,
    });
    let conversation = conversationId ? await ctx.db.get(conversationId) : null;
    if (conversation && (conversation.contactId !== contact._id || conversation.accountId !== account._id)) {
      const providerMessageRef = await insertStagedMessage(ctx, {
        connectionId: connection._id,
        providerAccountId,
        providerMessageId,
        folderId,
        providerThreadId,
        rfcMessageId,
        inReplyTo,
        references,
        senderAddress,
        subject,
        safePreview,
        plainTextContent,
        receivedAt: args.receivedAt,
        providerReadState,
        mappingState: "ambiguous",
        hasAttachment: args.hasAttachment,
        now: args.now,
      });
      await writeProviderAudit(ctx, {
        connectionId: connection._id,
        event: "message_staged",
        outcome: "failure",
        safeCode: "thread_contact_conflict",
        providerMessageId,
        now: args.now,
      });
      return {
        providerMessageRef,
        mappingState: "ambiguous" as const,
        conversationId: null,
        conversationMessageId: null,
        duplicate: false,
      };
    }
    if (!conversation) {
      conversation = await ctx.db
        .query("conversations")
        .withIndex("by_businessId_and_contactId_and_channel", (q) =>
          q.eq("businessId", undefined).eq("contactId", contact._id).eq("channel", "email"),
        )
        .unique();
      conversationId = conversation?._id ?? null;
    }
    const nextStatus = conversation
      ? conversation.status === "completed" || conversation.status === "waiting_client"
        ? "needs_reply" as const
        : conversation.status
      : "new" as const;
    const searchText = normalizeAdminSearchText(
      [account.name, account.smkCode, contactName, subject, safePreview].join(" "),
    );
    if (!conversationId) {
      conversationId = await ctx.db.insert("conversations", {
        accountId: account._id,
        accountName: account.name,
        smkCode: account.smkCode,
        contactId: contact._id,
        contactName,
        contactEmail: senderAddress,
        channel: "email",
        status: nextStatus,
        assigneeKey: UNASSIGNED,
        latestMessagePreview: safePreview,
        latestMessageAt: args.receivedAt,
        latestMessageDirection: "client_to_admin",
        latestMessageAuthorName: contactName,
        adminUnreadCount: 0,
        searchText,
        createdAt: args.now,
        updatedAt: args.now,
      });
      conversation = await ctx.db.get(conversationId);
    }
    if (!conversation) throw new ConvexError("email_provider_conversation_insert_failed");
    const conversationMessageId = await ctx.db.insert("conversationMessages", {
      conversationId: conversation._id,
      accountId: account._id,
      contactId: contact._id,
      channel: "email",
      direction: "client_to_admin",
      authorKind: "client",
      authorContactId: contact._id,
      authorDisplayName: contactName,
      content: plainTextContent,
      createdAt: args.receivedAt,
    });
    await ctx.db.patch(conversation._id, {
      status: nextStatus,
      latestMessagePreview: safePreview,
      latestMessageAt: args.receivedAt,
      latestMessageDirection: "client_to_admin",
      latestMessageAuthorName: contactName,
      adminUnreadCount: conversation.adminUnreadCount + 1,
      searchText,
      updatedAt: args.now,
    });
    await ctx.db.insert("conversationEvents", {
      conversationId: conversation._id,
      accountId: account._id,
      messageId: conversationMessageId,
      event: "client_message_received",
      actorKind: "client",
      actorContactId: contact._id,
      createdAt: args.now,
    });
    if (conversation.status !== nextStatus) {
      await ctx.db.insert("conversationEvents", {
        conversationId: conversation._id,
        accountId: account._id,
        event: "status_changed",
        actorKind: "client",
        actorContactId: contact._id,
        fromStatus: conversation.status,
        toStatus: nextStatus,
        createdAt: args.now,
      });
    }
    const providerMessageRef = await ctx.db.insert("emailProviderMessages", {
      connectionId: connection._id,
      provider: "zoho",
      providerAccountId,
      providerMessageId,
      folderId,
      ...(providerThreadId ? { providerThreadId } : {}),
      ...(rfcMessageId ? { rfcMessageId } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
      references,
      senderAddress,
      subject,
      safePreview,
      plainTextContent,
      receivedAt: args.receivedAt,
      ...(providerReadState ? { providerReadState } : {}),
      mappingState: "matched",
      conversationId: conversation._id,
      conversationMessageId,
      attachmentState: args.hasAttachment ? "pending" : "none",
      createdAt: args.now,
      updatedAt: args.now,
    });
    await writeProviderAudit(ctx, {
      connectionId: connection._id,
      event: "message_imported",
      outcome: "success",
      providerMessageId,
      now: args.now,
    });
    return {
      providerMessageRef,
      mappingState: "matched" as const,
      conversationId: conversation._id,
      conversationMessageId,
      duplicate: false,
    };
  },
});

export const recordPoison = internalMutation({
  args: {
    connectionId: v.id("emailProviderConnections"),
    providerAccountId: v.string(),
    providerMessageId: v.string(),
    folderId: v.string(),
    providerThreadId: v.optional(v.string()),
    senderAddress: v.string(),
    subject: v.string(),
    safePreview: v.string(),
    receivedAt: v.number(),
    providerReadState: v.optional(v.string()),
    hasAttachment: v.boolean(),
    safeCode: v.string(),
    now: v.number(),
  },
  returns: v.object({ providerMessageRef: v.id("emailProviderMessages"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const connection = await requireConnection(ctx, args.connectionId);
    const providerAccountId = normalizeProviderId(args.providerAccountId, "provider_account_id_invalid");
    const providerMessageId = normalizeProviderId(args.providerMessageId, "provider_message_id_invalid");
    if (connection.providerAccountId !== providerAccountId) {
      throw new ConvexError("email_provider_account_not_allowed");
    }
    const existing = await ctx.db
      .query("emailProviderMessages")
      .withIndex("by_connectionId_and_providerMessageId", (q) =>
        q.eq("connectionId", connection._id).eq("providerMessageId", providerMessageId),
      )
      .unique();
    if (existing) return { providerMessageRef: existing._id, duplicate: true };
    const safeCode = cleanSafeCode(args.safeCode);
    const providerMessageRef = await insertStagedMessage(ctx, {
      connectionId: connection._id,
      providerAccountId,
      providerMessageId,
      folderId: normalizeProviderId(args.folderId, "provider_folder_id_invalid"),
      providerThreadId: args.providerThreadId
        ? normalizeProviderId(args.providerThreadId, "provider_thread_id_invalid")
        : undefined,
      references: [],
      senderAddress: normalizeEmailAddress(args.senderAddress),
      subject: cleanSubject(args.subject),
      safePreview: args.safePreview.slice(0, 180),
      receivedAt: args.receivedAt,
      providerReadState: args.providerReadState?.slice(0, MAX_PROVIDER_STATE),
      mappingState: "poisoned",
      hasAttachment: args.hasAttachment,
      poisonCode: safeCode,
      now: args.now,
    });
    await writeProviderAudit(ctx, {
      connectionId: connection._id,
      event: "message_staged",
      outcome: "failure",
      safeCode,
      providerMessageId,
      now: args.now,
    });
    return { providerMessageRef, duplicate: false };
  },
});

export const persistAttachmentMetadata = internalMutation({
  args: {
    providerMessageRef: v.id("emailProviderMessages"),
    attachments: v.array(attachmentInputValidator),
    now: v.number(),
  },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args) => {
    if (args.attachments.length > MAX_ATTACHMENTS) {
      throw new ConvexError("email_provider_attachments_excessive");
    }
    const message = await ctx.db.get(args.providerMessageRef);
    if (!message) throw new ConvexError("email_provider_message_not_found");
    for (const attachment of args.attachments) {
      const providerAttachmentId = normalizeProviderId(
        attachment.providerAttachmentId,
        "provider_attachment_id_invalid",
      );
      const fileName = attachment.fileName.trim();
      if (!fileName || fileName.length > 255 || attachment.size < 0) {
        throw new ConvexError("email_provider_attachment_invalid");
      }
      const existing = await ctx.db
        .query("emailProviderAttachments")
        .withIndex("by_providerMessageId_and_providerAttachmentId", (q) =>
          q
            .eq("providerMessageId", message._id)
            .eq("providerAttachmentId", providerAttachmentId),
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("emailProviderAttachments", {
          providerMessageId: message._id,
          providerAttachmentId,
          fileName,
          size: attachment.size,
          inline: attachment.inline,
          downloadState: "metadata_only",
          createdAt: args.now,
          updatedAt: args.now,
        });
      }
    }
    await ctx.db.patch(message._id, {
      attachmentState: "complete",
      poisonCode: undefined,
      updatedAt: args.now,
    });
    return { count: args.attachments.length };
  },
});

export const recordAttachmentFailure = internalMutation({
  args: {
    providerMessageRef: v.id("emailProviderMessages"),
    safeCode: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.providerMessageRef);
    if (!message) throw new ConvexError("email_provider_message_not_found");
    const safeCode = cleanSafeCode(args.safeCode);
    await ctx.db.patch(message._id, {
      attachmentState: "failed",
      poisonCode: safeCode,
      updatedAt: args.now,
    });
    await writeProviderAudit(ctx, {
      connectionId: message.connectionId,
      event: "attachment_failed",
      outcome: "failure",
      safeCode,
      providerMessageId: message.providerMessageId,
      now: args.now,
    });
    return null;
  },
});

export const commitSyncCheckpoint = internalMutation({
  args: {
    connectionId: v.id("emailProviderConnections"),
    folderId: v.string(),
    leaseToken: v.string(),
    checkpointReceivedAt: nullableNumber,
    checkpointProviderMessageId: nullableString,
    continuationStart: nullableNumber,
    processedCount: v.number(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await requireConnection(ctx, args.connectionId);
    const lease = await ctx.db
      .query("emailProviderSyncLeases")
      .withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id))
      .unique();
    if (!lease || lease.leaseToken !== cleanCommandId(args.leaseToken)) {
      throw new ConvexError("email_provider_lease_not_owned");
    }
    const folderId = normalizeProviderId(args.folderId, "provider_folder_id_invalid");
    const checkpoint = await ctx.db
      .query("emailProviderFolderCheckpoints")
      .withIndex("by_connectionId_and_folderId", (q) =>
        q.eq("connectionId", connection._id).eq("folderId", folderId),
      )
      .unique();
    const update = {
      checkpointReceivedAt: args.checkpointReceivedAt ?? undefined,
      checkpointProviderMessageId: args.checkpointProviderMessageId ?? undefined,
      continuationStart: args.continuationStart ?? undefined,
      lastSuccessfulSyncAt: args.now,
      retryAttempt: 0,
      nextAttemptAt: undefined,
      updatedAt: args.now,
    };
    if (checkpoint) await ctx.db.patch(checkpoint._id, update);
    else {
      await ctx.db.insert("emailProviderFolderCheckpoints", {
        connectionId: connection._id,
        folderId,
        ...update,
      });
    }
    await ctx.db.patch(connection._id, {
      operationalState: "healthy",
      lastSuccessfulSyncAt: args.now,
      lastErrorCode: undefined,
      updatedAt: args.now,
    });
    await writeProviderAudit(ctx, {
      connectionId: connection._id,
      event: "sync_completed",
      outcome: "success",
      runId: lease.leaseToken,
      count: args.processedCount,
      now: args.now,
    });
    return null;
  },
});

export const recordSyncFailure = internalMutation({
  args: {
    connectionId: v.id("emailProviderConnections"),
    folderId: v.string(),
    leaseToken: v.string(),
    state: v.union(v.literal("degraded"), v.literal("auth_required")),
    safeCode: v.string(),
    retryAttempt: v.number(),
    nextAttemptAt: nullableNumber,
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await requireConnection(ctx, args.connectionId);
    const lease = await ctx.db
      .query("emailProviderSyncLeases")
      .withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id))
      .unique();
    if (!lease || lease.leaseToken !== cleanCommandId(args.leaseToken)) {
      throw new ConvexError("email_provider_lease_not_owned");
    }
    const folderId = normalizeProviderId(args.folderId, "provider_folder_id_invalid");
    const safeCode = cleanSafeCode(args.safeCode);
    const checkpoint = await ctx.db
      .query("emailProviderFolderCheckpoints")
      .withIndex("by_connectionId_and_folderId", (q) =>
        q.eq("connectionId", connection._id).eq("folderId", folderId),
      )
      .unique();
    const update = {
      retryAttempt: Math.max(1, Math.min(Math.floor(args.retryAttempt), 100)),
      nextAttemptAt: args.nextAttemptAt ?? undefined,
      updatedAt: args.now,
    };
    if (checkpoint) await ctx.db.patch(checkpoint._id, update);
    else {
      await ctx.db.insert("emailProviderFolderCheckpoints", {
        connectionId: connection._id,
        folderId,
        ...update,
      });
    }
    await ctx.db.patch(connection._id, {
      operationalState: args.state,
      lastErrorCode: safeCode,
      updatedAt: args.now,
    });
    await writeProviderAudit(ctx, {
      connectionId: connection._id,
      event: "sync_failed",
      outcome: "failure",
      safeCode,
      now: args.now,
    });
    return null;
  },
});

const ALLOWED_OUTBOX_TRANSITIONS: Record<EmailProviderOutboxState, readonly EmailProviderOutboxState[]> = {
  pending: ["sending"],
  sending: ["sent", "failed", "needs_reconciliation"],
  sent: [],
  failed: [],
  needs_reconciliation: ["sent", "failed"],
};

export const transitionOutbox = internalMutation({
  args: {
    outboxId: v.id("emailProviderOutbox"),
    expectedState: emailProviderOutboxStateValidator,
    nextState: emailProviderOutboxStateValidator,
    providerMessageId: v.optional(v.string()),
    providerMailId: v.optional(v.string()),
    safeCode: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.object({ state: emailProviderOutboxStateValidator, duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId);
    if (!outbox) throw new ConvexError("email_provider_outbox_not_found");
    const providerMessageId = args.providerMessageId
      ? normalizeProviderId(args.providerMessageId, "provider_send_message_id_invalid")
      : undefined;
    const providerMailId = cleanHeaderSignal(args.providerMailId);
    const safeCode = args.safeCode ? cleanSafeCode(args.safeCode) : undefined;
    if (outbox.state === args.nextState) {
      if (
        (outbox.providerMessageId ?? undefined) !== providerMessageId ||
        (outbox.providerMailId ?? undefined) !== providerMailId
      ) {
        throw new ConvexError("email_provider_outbox_transition_conflict");
      }
      return { state: outbox.state, duplicate: true };
    }
    if (
      outbox.state !== args.expectedState ||
      !ALLOWED_OUTBOX_TRANSITIONS[outbox.state].includes(args.nextState) ||
      (args.nextState === "sent" && !providerMessageId) ||
      (args.nextState !== "sent" && Boolean(providerMessageId || providerMailId))
    ) throw new ConvexError("email_provider_outbox_transition_invalid");
    await ctx.db.patch(outbox._id, {
      state: args.nextState,
      ...(providerMessageId ? { providerMessageId } : {}),
      ...(providerMailId ? { providerMailId } : {}),
      ...(safeCode ? { lastErrorCode: safeCode } : { lastErrorCode: undefined }),
      reconciliationAttempt: args.nextState === "needs_reconciliation"
        ? outbox.reconciliationAttempt + 1
        : outbox.reconciliationAttempt,
      updatedAt: args.now,
    });
    await writeProviderAudit(ctx, {
      connectionId: outbox.connectionId,
      event: "outbox_state_changed",
      outcome: args.nextState === "failed" ? "failure" : "info",
      ...(safeCode ? { safeCode } : {}),
      sendCommandId: outbox.sendCommandId,
      now: args.now,
    });
    return { state: args.nextState, duplicate: false };
  },
});

export const listOutboxForWork = internalQuery({
  args: {
    state: v.union(v.literal("pending"), v.literal("needs_reconciliation")),
    limit: v.number(),
  },
  returns: v.array(v.object({
    outboxId: v.id("emailProviderOutbox"),
    connectionId: v.id("emailProviderConnections"),
    conversationId: v.id("conversations"),
    sendCommandId: v.string(),
    state: emailProviderOutboxStateValidator,
  })),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
      throw new ConvexError("email_provider_outbox_limit_invalid");
    }
    const rows = await ctx.db
      .query("emailProviderOutbox")
      .withIndex("by_state_and_updatedAt", (q) => q.eq("state", args.state))
      .order("asc")
      .take(args.limit);
    return rows.map((row) => ({
      outboxId: row._id,
      connectionId: row.connectionId,
      conversationId: row.conversationId,
      sendCommandId: row.sendCommandId,
      state: row.state,
    }));
  },
});
