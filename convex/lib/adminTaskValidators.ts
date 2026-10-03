import { v } from "convex/values";

export const taskPriorityValidator = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent"),
);

export const taskStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("deferred"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const taskActiveStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
);

export const taskViewValidator = v.union(
  v.literal("active"),
  v.literal("deferred"),
  v.literal("closed"),
);

export const taskTimePhaseValidator = v.union(
  v.literal("none"),
  v.literal("future"),
  v.literal("today"),
  v.literal("overdue"),
);

export const taskDueValidator = v.union(
  v.object({ kind: v.literal("date"), date: v.string() }),
  v.object({ kind: v.literal("instant"), at: v.number() }),
  v.null(),
);

export const taskSubjectValidator = v.union(
  v.object({ kind: v.literal("account"), id: v.id("accounts") }),
  v.object({ kind: v.literal("contact"), id: v.id("accountContacts") }),
  v.object({ kind: v.literal("venue"), id: v.id("businesses") }),
  v.object({ kind: v.literal("conversation"), id: v.id("conversations") }),
  v.object({ kind: v.literal("service"), id: v.id("serviceProfiles") }),
  v.object({ kind: v.literal("subscription"), id: v.id("subscriptions") }),
  v.object({ kind: v.literal("order"), id: v.id("orders") }),
  v.object({ kind: v.literal("order_line"), id: v.id("orderLines") }),
  v.object({ kind: v.literal("print_job"), id: v.id("printJobs") }),
  v.object({ kind: v.literal("delivery"), id: v.id("deliveries") }),
  v.object({ kind: v.literal("action_item"), id: v.id("actionItems") }),
);

export const taskSubjectKindValidator = v.union(
  v.literal("none"),
  v.literal("account"),
  v.literal("contact"),
  v.literal("venue"),
  v.literal("conversation"),
  v.literal("service"),
  v.literal("subscription"),
  v.literal("order"),
  v.literal("order_line"),
  v.literal("print_job"),
  v.literal("delivery"),
  v.literal("action_item"),
);

export const taskEventKindValidator = v.union(
  v.literal("created"),
  v.literal("content_changed"),
  v.literal("status_changed"),
  v.literal("priority_changed"),
  v.literal("due_changed"),
  v.literal("assignee_changed"),
  v.literal("participant_added"),
  v.literal("participant_removed"),
  v.literal("subject_changed"),
  v.literal("deferred"),
  v.literal("resumed"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("reopened"),
);

export const taskEventFieldValidator = v.union(
  v.literal("task"),
  v.literal("content"),
  v.literal("status"),
  v.literal("priority"),
  v.literal("due"),
  v.literal("assignee"),
  v.literal("participant"),
  v.literal("subject"),
  v.literal("deferral"),
);

export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskStatus = "open" | "in_progress" | "deferred" | "completed" | "cancelled";
export type TaskActiveStatus = "open" | "in_progress";
export type TaskView = "active" | "deferred" | "closed";
export type TaskTimePhase = "none" | "future" | "today" | "overdue";
