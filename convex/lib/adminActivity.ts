import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adminSearchSr } from "../../lib/i18n/sr/admin-search";
import { isAdminEmail } from "./access";

export type ActivityCategory =
  | "client"
  | "communication"
  | "task"
  | "order"
  | "finance"
  | "subscription"
  | "problem"
  | "product"
  | "service"
  | "support";

export type ActivityActorKind =
  | "admin"
  | "system"
  | "shared_mailbox"
  | "external"
  | "unknown";

export type ActivityProjectionInput = {
  sourceKey: string;
  sourceDomain: string;
  sourceRecordId: string;
  accountId?: Id<"accounts">;
  businessId?: Id<"businesses">;
  objectKind: string;
  objectLabel: string;
  action: string;
  category: ActivityCategory;
  actorKind: ActivityActorKind;
  actorUserId?: Id<"users">;
  actorDisplayName: string;
  occurredAt: number;
  summaryLabel: string;
  reason?: string;
  href: string;
};

function stableFingerprint(input: ActivityProjectionInput) {
  const value = JSON.stringify([
    input.sourceDomain,
    input.sourceRecordId,
    input.accountId ?? null,
    input.businessId ?? null,
    input.objectKind,
    input.objectLabel,
    input.action,
    input.category,
    input.actorKind,
    input.actorUserId ?? null,
    input.actorDisplayName,
    input.occurredAt,
    input.summaryLabel,
    input.reason ?? null,
    input.href,
  ]);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function actorKey(input: ActivityProjectionInput) {
  return input.actorUserId
    ? `user:${input.actorUserId}`
    : `kind:${input.actorKind}`;
}

export async function upsertActivityProjection(
  ctx: MutationCtx,
  input: ActivityProjectionInput,
) {
  const fingerprint = stableFingerprint(input);
  const key = actorKey(input);
  const actor = await ctx.db
    .query("adminActivityActors")
    .withIndex("by_actorKey", (q) => q.eq("actorKey", key))
    .unique();
  const actorFields = {
    actorKind: input.actorKind,
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    displayName: input.actorDisplayName.slice(0, 120),
    lastSeenAt: input.occurredAt,
  };
  if (actor) {
    if (input.occurredAt >= actor.lastSeenAt) await ctx.db.patch(actor._id, actorFields);
  } else {
    await ctx.db.insert("adminActivityActors", { actorKey: key, ...actorFields });
  }
  const fields = {
    fingerprint,
    sourceDomain: input.sourceDomain,
    sourceRecordId: input.sourceRecordId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.businessId ? { businessId: input.businessId } : {}),
    objectKind: input.objectKind,
    objectLabel: input.objectLabel.slice(0, 180),
    action: input.action.slice(0, 120),
    category: input.category,
    actorKind: input.actorKind,
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    actorKey: key,
    actorDisplayName: input.actorDisplayName.slice(0, 120),
    occurredAt: input.occurredAt,
    summaryLabel: input.summaryLabel.slice(0, 180),
    ...(input.reason ? { reason: input.reason.trim().slice(0, 240) } : {}),
    href: input.href,
    updatedAt: Date.now(),
  };
  const existing = await ctx.db
    .query("adminActivityRows")
    .withIndex("by_sourceKey", (q) => q.eq("sourceKey", input.sourceKey))
    .unique();
  if (existing) {
    if (existing.fingerprint !== fingerprint) await ctx.db.patch(existing._id, fields);
    return { id: existing._id, changed: existing.fingerprint !== fingerprint };
  }
  const id = await ctx.db.insert("adminActivityRows", {
    sourceKey: input.sourceKey,
    ...fields,
  });
  return { id, changed: true };
}

function categoryForAuditAction(action: string): ActivityCategory {
  if (action.includes("debug")) return "support";
  if (action.includes("conversation") || action.includes("communication")) return "communication";
  if (action.includes("task")) return "task";
  if (action.includes("order") || action.includes("print") || action.includes("quality") || action.includes("delivery")) return "order";
  if (action.includes("payment") || action.includes("finance") || action.includes("cost") || action.includes("refund") || action.includes("billing")) return "finance";
  if (action.includes("subscription") || action.includes("premium")) return "subscription";
  if (action.includes("problem") || action.includes("action_")) return "problem";
  if (action.includes("product") || action.includes("access_") || action.includes("digital_qr") || action.includes("card")) return "product";
  if (action.includes("service") || action.includes("menu")) return "service";
  return "client";
}

function stringDetail(detail: Record<string, unknown>, key: string) {
  const value = detail[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeDetail(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function userDisplayName(user: Doc<"users"> | null) {
  const name = typeof user?.name === "string" ? user.name.trim() : "";
  if (name) return name;
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  return email || adminSearchSr.unknownAdmin;
}

async function actorFromUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Pick<ActivityProjectionInput, "actorKind" | "actorUserId" | "actorDisplayName">> {
  const user = await ctx.db.get(userId);
  return {
    actorKind: isAdminEmail(user?.email) ? "admin" : "external",
    actorUserId: userId,
    actorDisplayName: userDisplayName(user),
  };
}

export async function projectAdminAuditRow(
  ctx: MutationCtx,
  audit: Doc<"adminAuditLog">,
) {
  const detail = safeDetail(audit.detail);
  const actor = await actorFromUser(ctx, audit.actorUserId);
  const account = audit.accountId
    ? await ctx.db.query("adminClientReadModels").withIndex("by_accountId", (q) => q.eq("accountId", audit.accountId!)).unique()
    : null;
  const venue = audit.businessId
    ? await ctx.db.query("adminVenueReadModels").withIndex("by_businessId", (q) => q.eq("businessId", audit.businessId!)).unique()
    : null;

  const orderId = stringDetail(detail, "orderId");
  const conversationId = stringDetail(detail, "conversationId");
  const contactId = stringDetail(detail, "contactId");
  const productId = stringDetail(detail, "productId");
  const channelId = stringDetail(detail, "channelId");
  const taskId = stringDetail(detail, "taskId");
  const objectKind = orderId
    ? "order"
    : conversationId
      ? "conversation"
      : taskId
        ? "task"
        : productId
          ? "product"
          : channelId
            ? "channel"
            : contactId
              ? "contact"
              : venue
                ? "venue"
                : "account";
  const objectLabel = venue
    ? `${venue.venueName} · ${venue.smlCode}`
    : account
      ? `${account.accountName} · ${account.smkCode}`
      : audit.action;
  const href = orderId
    ? `/admin/operativa/porudzbine?order=${encodeURIComponent(orderId)}`
    : conversationId
      ? `/admin/inbox?conversation=${encodeURIComponent(conversationId)}`
      : taskId
        ? `/admin/zadaci?task=${encodeURIComponent(taskId)}`
        : productId && audit.businessId
          ? `/admin/operativa/proizvodi?venue=${audit.businessId}&product=${encodeURIComponent(productId)}`
          : channelId
            ? `/admin/operativa/qr?channel=${encodeURIComponent(channelId)}`
            : audit.accountId
              ? `/admin/klijenti/${audit.accountId}${contactId ? `?contact=${encodeURIComponent(contactId)}` : ""}`
              : "/admin/pretraga?view=activity";
  return upsertActivityProjection(ctx, {
    sourceKey: `adminAuditLog:${audit._id}`,
    sourceDomain: "admin_audit",
    sourceRecordId: String(audit._id),
    ...(audit.accountId ? { accountId: audit.accountId } : {}),
    ...(audit.businessId ? { businessId: audit.businessId } : {}),
    objectKind,
    objectLabel,
    action: audit.action,
    category: categoryForAuditAction(audit.action),
    ...actor,
    occurredAt: audit.createdAt,
    summaryLabel: objectLabel,
    ...(stringDetail(detail, "reason") ? { reason: stringDetail(detail, "reason") } : {}),
    href,
  });
}

export async function projectActionItemEvent(
  ctx: MutationCtx,
  event: Doc<"actionItemEvents">,
) {
  if (event.actor.kind === "admin") return null;
  const item = await ctx.db.get(event.actionItemId);
  if (!item) return null;
  const actor = { actorKind: "system" as const, actorDisplayName: adminSearchSr.actorSystem };
  return upsertActivityProjection(ctx, {
    sourceKey: `actionItemEvents:${event._id}`,
    sourceDomain: "action_item",
    sourceRecordId: String(event._id),
    ...(item.accountId ? { accountId: item.accountId } : {}),
    ...(item.businessId ? { businessId: item.businessId } : {}),
    objectKind: "problem",
    objectLabel: item.description ?? item.causeId,
    action: event.event,
    category: "problem",
    ...actor,
    occurredAt: event.createdAt,
    summaryLabel: item.description ?? item.causeId,
    ...(event.reason ? { reason: event.reason } : {}),
    href: item.contextHref ?? "/admin/pretraga?view=activity",
  });
}

export async function projectTaskEvent(
  ctx: MutationCtx,
  event: Doc<"clientTaskEvents">,
) {
  if (event.actorKind === "admin") return null;
  const task = await ctx.db.get(event.taskId);
  if (!task) return null;
  const actor = event.actorUserId
    ? await actorFromUser(ctx, event.actorUserId)
    : {
        actorKind: event.actorKind === "system" ? "system" as const : "unknown" as const,
        actorDisplayName: event.actorName || adminSearchSr.actorUnknown,
      };
  return upsertActivityProjection(ctx, {
    sourceKey: `clientTaskEvents:${event._id}`,
    sourceDomain: "task",
    sourceRecordId: String(event._id),
    accountId: task.accountId,
    ...(task.businessId ? { businessId: task.businessId } : {}),
    objectKind: "task",
    objectLabel: task.title,
    action: event.event,
    category: "task",
    ...actor,
    occurredAt: event.createdAt,
    summaryLabel: task.title,
    ...(event.reason ? { reason: event.reason } : {}),
    href: `/admin/zadaci?task=${task._id}`,
  });
}

export async function projectOrderEvent(
  ctx: MutationCtx,
  event: Doc<"orderEvents">,
) {
  const operation = await ctx.db.get(event.operationId);
  if (!operation) return null;
  const actor = await actorFromUser(ctx, event.actorUserId);
  if (actor.actorKind === "admin") return null;
  return upsertActivityProjection(ctx, {
    sourceKey: `orderEvents:${event._id}`,
    sourceDomain: "order",
    sourceRecordId: String(event._id),
    accountId: operation.accountId,
    ...(operation.primaryBusinessId ? { businessId: operation.primaryBusinessId } : {}),
    objectKind: "order",
    objectLabel: `${operation.smpCode} · ${operation.accountName}`,
    action: event.kind,
    category: "order",
    ...actor,
    occurredAt: event.createdAt,
    summaryLabel: operation.smpCode,
    ...(event.reason ? { reason: event.reason } : {}),
    href: `/admin/operativa/porudzbine?order=${operation.orderId}`,
  });
}

export async function projectAccessEvent(
  ctx: MutationCtx,
  event: Doc<"accessChannelEvents">,
) {
  if (event.actor.kind === "admin") return null;
  const channel = await ctx.db.get(event.channelId);
  if (!channel) return null;
  const actor = { actorKind: "system" as const, actorDisplayName: adminSearchSr.actorSystem };
  const code = channel.smqCode ?? channel.smfCode ?? channel.resolverCode;
  return upsertActivityProjection(ctx, {
    sourceKey: `accessChannelEvents:${event._id}`,
    sourceDomain: "access_channel",
    sourceRecordId: String(event._id),
    accountId: channel.accountId,
    businessId: channel.businessId,
    objectKind: "channel",
    objectLabel: code,
    action: "access_channel_state_changed",
    category: "product",
    ...actor,
    occurredAt: event.createdAt,
    summaryLabel: code,
    reason: event.reason,
    href: `/admin/operativa/qr?channel=${channel._id}&code=${encodeURIComponent(code)}`,
  });
}

export async function projectSubscriptionEvent(
  ctx: MutationCtx,
  event: Doc<"subscriptionEvents">,
) {
  const account = await ctx.db.query("adminClientReadModels").withIndex("by_accountId", (q) => q.eq("accountId", event.accountId)).unique();
  const actor = event.actor.kind === "system"
    ? { actorKind: "system" as const, actorDisplayName: adminSearchSr.actorSystem }
    : await actorFromUser(ctx, event.actor.userId);
  if (actor.actorKind === "admin") return null;
  const label = account ? `${account.accountName} · ${account.smkCode}` : adminSearchSr.subscriptionLabel;
  return upsertActivityProjection(ctx, {
    sourceKey: `subscriptionEvents:${event._id}`,
    sourceDomain: "subscription",
    sourceRecordId: String(event._id),
    accountId: event.accountId,
    objectKind: "subscription",
    objectLabel: label,
    action: event.action,
    category: "subscription",
    ...actor,
    occurredAt: event.createdAt,
    summaryLabel: label,
    ...(event.reason ? { reason: event.reason } : {}),
    href: `/admin/klijenti/${event.accountId}?section=finance`,
  });
}

export async function appendSubscriptionActivityEvent(
  ctx: MutationCtx,
  input: Omit<Doc<"subscriptionEvents">, "_id" | "_creationTime">,
) {
  const eventId = await ctx.db.insert("subscriptionEvents", input);
  const event = await ctx.db.get(eventId);
  if (event) await projectSubscriptionEvent(ctx, event);
  return eventId;
}

export async function projectConversationEvent(
  ctx: MutationCtx,
  event: Doc<"conversationEvents">,
  options?: { sharedMailbox?: boolean },
) {
  if (event.event !== "client_message_received" && !options?.sharedMailbox) return null;
  const conversation = await ctx.db.get(event.conversationId);
  if (!conversation) return null;
  const contact = event.actorContactId ? await ctx.db.get(event.actorContactId) : null;
  const actor = event.actorUserId ? await ctx.db.get(event.actorUserId) : null;
  const sharedMailbox = Boolean(options?.sharedMailbox);
  const actorKind: ActivityActorKind = sharedMailbox
    ? "shared_mailbox"
    : event.actorKind === "client"
      ? "external"
      : event.actorUserId
        ? "admin"
        : "unknown";
  const actorDisplayName = sharedMailbox
    ? adminSearchSr.sharedMailboxEvent
    : contact
      ? `${contact.firstName} ${contact.lastName}`.trim()
      : actor
        ? userDisplayName(actor)
        : adminSearchSr.actorUnknown;
  return upsertActivityProjection(ctx, {
    sourceKey: `conversationEvents:${event._id}`,
    sourceDomain: "conversation",
    sourceRecordId: String(event._id),
    accountId: event.accountId,
    ...(conversation.businessId ? { businessId: conversation.businessId } : {}),
    objectKind: "conversation",
    objectLabel: `${conversation.contactName} · ${conversation.smkCode}`,
    action: event.event,
    category: "communication",
    actorKind,
    ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
    actorDisplayName,
    occurredAt: event.createdAt,
    summaryLabel: conversation.contactName,
    href: `/admin/inbox?conversation=${event.conversationId}`,
  });
}
