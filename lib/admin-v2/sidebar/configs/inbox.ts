// ADMIN v2 — sidebar of `Inbox`: search, status, channel and the assignee.
// The values are the arguments of `adminCommunications.listInbox`;
// `assignee` is the parameter the links from Tim already use. Its options
// (mine, unassigned, the admins) come from the page.

import { sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { communicationsSr as dict } from "@/lib/i18n/sr/communications";
import type { SidebarConfig } from "../types";

export const INBOX_STATUSES = ["new", "needs_reply", "in_progress", "waiting_client", "completed"] as const;
export const INBOX_CHANNELS = ["panel_chat", "email", "phone", "in_person", "copied_message"] as const;

const STATUS_LABELS: Record<(typeof INBOX_STATUSES)[number], string> = {
  new: dict.statusNew,
  needs_reply: dict.statusNeedsReply,
  in_progress: dict.statusInProgress,
  waiting_client: dict.statusWaitingClient,
  completed: dict.statusCompleted,
};

const CHANNEL_LABELS: Record<(typeof INBOX_CHANNELS)[number], string> = {
  panel_chat: dict.channelPanelChat,
  email: dict.channelEmail,
  phone: dict.channelPhone,
  in_person: dict.channelInPerson,
  copied_message: dict.channelCopiedMessage,
};

export const inboxSidebar: SidebarConfig = {
  id: "inbox",
  search: { key: "q", label: dict.searchLabel, placeholder: dict.searchPlaceholder },
  groups: [
    { id: "status", label: dict.statusFilter, options: INBOX_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })) },
    { id: "kanal", label: dict.channelFilter, options: INBOX_CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] })) },
    { id: "assignee", label: dict.assigneeFilter },
  ],
};

export const INBOX_URL_FIELDS = sidebarUrlFields(inboxSidebar);
