import { v } from "convex/values";

export const communicationChannelValidator = v.union(
  v.literal("panel_chat"),
  v.literal("email"),
  v.literal("phone"),
  v.literal("in_person"),
  v.literal("copied_message"),
);

export const conversationStatusValidator = v.union(
  v.literal("new"),
  v.literal("needs_reply"),
  v.literal("in_progress"),
  v.literal("waiting_client"),
  v.literal("completed"),
);

export const communicationDirectionValidator = v.union(
  v.literal("client_to_admin"),
  v.literal("admin_to_client"),
  v.literal("manual"),
);

export const communicationActorKindValidator = v.union(
  v.literal("admin"),
  v.literal("client"),
);

export const conversationEventKindValidator = v.union(
  v.literal("client_message_received"),
  v.literal("admin_reply_sent"),
  v.literal("manual_entry_logged"),
  v.literal("status_changed"),
  v.literal("assignee_changed"),
);

export const adminDeliveryStateValidator = v.union(
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("read"),
);

export type CommunicationChannel =
  | "panel_chat"
  | "email"
  | "phone"
  | "in_person"
  | "copied_message";

export type ConversationStatus =
  | "new"
  | "needs_reply"
  | "in_progress"
  | "waiting_client"
  | "completed";
