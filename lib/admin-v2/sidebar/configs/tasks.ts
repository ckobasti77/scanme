// ADMIN v2 — sidebar of `Zadaci`: the views, search, the assignee, the client
// with its venue and the linked object. The values are the arguments of
// `adminTasks.list`; `assignee` is the parameter the links from Tim already
// use. The assignee, client and venue options come from the page; the venue
// has options only after a client is chosen. X4: „Misije danas“ (the overdue
// and today tasks with the progress of the day) stands under the filters.

import { sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { adminTasksSr as dict } from "@/lib/i18n/sr/admin-tasks";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import type { SidebarConfig } from "../types";

export const TASK_VIEWS = ["all", "today", "overdue", "deferred", "completed"] as const;
/** Every subject kind a task can be linked to (`none` is not a filter). */
export const TASK_SUBJECTS = ["account", "contact", "venue", "conversation", "service", "subscription", "order", "order_line", "print_job", "delivery", "action_item"] as const;

const VIEW_LABELS: Record<(typeof TASK_VIEWS)[number], string> = {
  all: dict.tabAll,
  today: dict.tabToday,
  overdue: dict.tabOverdue,
  deferred: dict.tabDeferred,
  completed: dict.tabCompleted,
};

const SUBJECT_LABELS: Record<(typeof TASK_SUBJECTS)[number], string> = {
  account: dict.subjectAccount,
  contact: dict.subjectContact,
  venue: dict.subjectVenue,
  conversation: dict.subjectConversation,
  service: dict.subjectService,
  subscription: dict.subjectSubscription,
  order: dict.subjectOrder,
  order_line: dict.subjectOrderLine,
  print_job: dict.subjectPrintJob,
  delivery: dict.subjectDelivery,
  action_item: dict.subjectActionItem,
};

export const tasksSidebar: SidebarConfig = {
  id: "zadaci",
  views: { key: "pogled", label: ui.filters.views, defaultValue: "all", items: TASK_VIEWS.map((value) => ({ value, label: VIEW_LABELS[value] })) },
  search: { key: "q", label: dict.searchLabel, placeholder: dict.searchPlaceholder },
  groups: [
    { id: "assignee", label: dict.filterAssignee },
    { id: "klijent", label: dict.filterClient },
    { id: "lokal", label: dict.filterVenue, emptyText: dict.filterVenueNeedsClient },
    { id: "objekat", label: dict.filterSubject, options: TASK_SUBJECTS.map((value) => ({ value, label: SUBJECT_LABELS[value] })) },
  ],
  blocks: ["missions"],
};

export const TASKS_URL_FIELDS = sidebarUrlFields(tasksSidebar);
