import {
  type FilterBuilder,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  taskDueValidator,
  taskEventFieldValidator,
  taskEventKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
  taskSubjectKindValidator,
  taskSubjectValidator,
  taskTimePhaseValidator,
  type TaskActiveStatus,
  type TaskStatus,
  type TaskTimePhase,
  type TaskView,
} from "./lib/adminTaskValidators";
import { adminEmails, isAdminEmail, requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import {
  appendActionEvent,
  refreshActionSignals,
  syncAutomaticAction,
} from "./lib/adminActionEngine";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import {
  taskDueFacts,
  type TaskDueInput,
} from "../lib/admin-v1/task-time";
import { adminTasksSr } from "../lib/i18n/sr/admin-tasks";

const MAX_PAGE = 50;
const MAX_HISTORY_PAGE = 50;
const MAX_PARTICIPANTS = 20;
const MAX_TEAM_COUNT = 500;
const NO_DUE_SORT = 8_640_000_000_000_000;
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

type TaskSubject = Infer<typeof taskSubjectValidator>;
type TaskDue = Exclude<Infer<typeof taskDueValidator>, null>;
type DatabaseCtx = QueryCtx | MutationCtx;
type ResolvedSubject = {
  kind: Infer<typeof taskSubjectKindValidator>;
  label?: string;
  href?: string;
  orderOperationId?: Id<"orderOperations">;
};

const taskListItemValidator = v.object({
  id: v.id("clientTasks"),
  accountId: v.id("accounts"),
  accountName: v.string(),
  smkCode: v.string(),
  contactId: v.union(v.id("accountContacts"), v.null()),
  contactName: v.union(v.string(), v.null()),
  businessId: v.union(v.id("businesses"), v.null()),
  businessName: v.union(v.string(), v.null()),
  smlCode: v.union(v.string(), v.null()),
  conversationId: v.union(v.id("conversations"), v.null()),
  subject: v.union(taskSubjectValidator, v.null()),
  subjectKind: taskSubjectKindValidator,
  subjectLabel: v.union(v.string(), v.null()),
  subjectHref: v.union(v.string(), v.null()),
  title: v.string(),
  description: v.string(),
  assigneeId: v.id("users"),
  assigneeName: v.string(),
  participantCount: v.number(),
  priority: taskPriorityValidator,
  due: taskDueValidator,
  timePhase: taskTimePhaseValidator,
  status: taskStatusValidator,
  deferredUntil: v.union(v.number(), v.null()),
  deferredReason: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const participantValidator = v.object({
  id: v.id("clientTaskParticipants"),
  userId: v.id("users"),
  userName: v.string(),
});

const taskDetailValidator = v.object({
  task: taskListItemValidator,
  participants: v.array(participantValidator),
});

const taskEventValidator = v.object({
  id: v.id("clientTaskEvents"),
  event: taskEventKindValidator,
  field: taskEventFieldValidator,
  actorKind: v.union(v.literal("admin"), v.literal("system")),
  actorUserId: v.union(v.id("users"), v.null()),
  actorName: v.string(),
  before: v.union(v.string(), v.null()),
  after: v.union(v.string(), v.null()),
  reason: v.union(v.string(), v.null()),
  until: v.union(v.number(), v.null()),
  targetAdminId: v.union(v.id("users"), v.null()),
  createdAt: v.number(),
});

const adminOptionValidator = v.object({
  id: v.id("users"),
  name: v.string(),
  email: v.string(),
});

const accountOptionValidator = v.object({
  id: v.id("accounts"),
  name: v.string(),
  smkCode: v.string(),
});

const contactOptionValidator = v.object({
  id: v.id("accountContacts"),
  name: v.string(),
});

const venueOptionValidator = v.object({
  id: v.id("businesses"),
  name: v.string(),
  smlCode: v.string(),
});

const conversationOptionValidator = v.object({
  id: v.id("conversations"),
  label: v.string(),
});

function requiredText(value: string, code: string, max: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ConvexError(code);
  return normalized;
}

function optionalText(value: string | undefined, max: number) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ConvexError("admin_task_text_invalid");
  return normalized;
}

function validTime(value: number, code = "admin_task_time_invalid") {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime())) {
    throw new ConvexError(code);
  }
}

function adminName(user: Doc<"users">) {
  return user.name?.trim() || user.email?.trim() || adminTasksSr.adminActorFallback;
}

function taskViewFor(status: TaskStatus): TaskView {
  if (status === "deferred") return "deferred";
  if (status === "completed" || status === "cancelled") return "closed";
  return "active";
}

function dueFacts(due: TaskDue | null, now: number) {
  try {
    return taskDueFacts(due as TaskDueInput, now);
  } catch {
    throw new ConvexError("admin_task_due_invalid");
  }
}

function dueText(due: TaskDue | null) {
  if (!due) return "none";
  return due.kind === "date" ? `date:${due.date}` : `instant:${due.at}`;
}

function taskListItem(task: Doc<"clientTasks">) {
  return {
    id: task._id,
    accountId: task.accountId,
    accountName: task.accountName,
    smkCode: task.smkCode,
    contactId: task.contactId ?? null,
    contactName: task.contactName ?? null,
    businessId: task.businessId ?? null,
    businessName: task.businessName ?? null,
    smlCode: task.smlCode ?? null,
    conversationId: task.conversationId ?? null,
    subject: task.subject ?? null,
    subjectKind: task.subjectKind,
    subjectLabel: task.subjectLabel ?? null,
    subjectHref: task.subjectHref ?? null,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    participantCount: task.participantCount,
    priority: task.priority,
    due: task.due ?? null,
    timePhase: task.timePhase,
    status: task.status,
    deferredUntil: task.deferredUntil ?? null,
    deferredReason: task.deferredReason ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

async function requireTask(ctx: DatabaseCtx, taskId: Id<"clientTasks">) {
  const task = await ctx.db.get(taskId);
  if (!task) throw new ConvexError("admin_task_not_found");
  return task;
}

async function requireAdminUser(ctx: DatabaseCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || !isAdminEmail(user.email)) throw new ConvexError("admin_task_assignee_invalid");
  return user;
}

async function loadAdminUsers(ctx: DatabaseCtx) {
  const emails = [...adminEmails()].slice(0, 20);
  const admins = await Promise.all(
    emails.map((email) => ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique()),
  );
  return admins.filter((admin): admin is Doc<"users"> => Boolean(admin?.email));
}

async function existingCommand(
  ctx: DatabaseCtx,
  taskId: Id<"clientTasks">,
  commandId: string,
) {
  return ctx.db
    .query("clientTaskEvents")
    .withIndex("by_taskId_and_commandId", (q) =>
      q.eq("taskId", taskId).eq("commandId", commandId),
    )
    .unique();
}

async function appendTaskEvent(
  ctx: MutationCtx,
  input: Omit<Doc<"clientTaskEvents">, "_id" | "_creationTime">,
) {
  return ctx.db.insert("clientTaskEvents", input);
}

async function resolveSubject(
  ctx: DatabaseCtx,
  accountId: Id<"accounts">,
  subject: TaskSubject | null,
): Promise<ResolvedSubject> {
  if (!subject) return { kind: "none" as const };
  switch (subject.kind) {
    case "account": {
      if (subject.id !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      const row = await ctx.db.get(subject.id);
      if (!row) throw new ConvexError("admin_task_subject_not_found");
      return { kind: subject.kind, label: row.name, href: `/admin/klijenti/${row._id}` };
    }
    case "contact": {
      const row = await ctx.db.get(subject.id);
      if (!row || row.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: `${row.firstName} ${row.lastName}`.trim() };
    }
    case "venue": {
      const row = await ctx.db.get(subject.id);
      if (!row || row.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: row.name, href: `/admin/klijenti/${accountId}?venue=${row._id}` };
    }
    case "conversation": {
      const row = await ctx.db.get(subject.id);
      if (!row || row.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: row.latestMessagePreview, href: `/admin/inbox?conversation=${row._id}` };
    }
    case "service": {
      const row = await ctx.db.get(subject.id);
      if (!row) throw new ConvexError("admin_task_subject_not_found");
      const business = await ctx.db.get(row.businessId);
      if (!business || business.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: row.type, href: `/admin/klijenti/${accountId}?venue=${business._id}` };
    }
    case "subscription": {
      const row = await ctx.db.get(subject.id);
      if (!row || row.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: row.targetKey, href: `/admin/klijenti/${accountId}` };
    }
    case "order": {
      const row = await ctx.db.get(subject.id);
      if (!row || row.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      const operation = await ctx.db
        .query("orderOperations")
        .withIndex("by_orderId", (q) => q.eq("orderId", row._id))
        .unique();
      return {
        kind: subject.kind,
        label: row.smpCode ?? String(row._id),
        href: `/admin/operativa/porudzbine?order=${row._id}`,
        orderOperationId: operation?._id,
      };
    }
    case "order_line": {
      const row = await ctx.db.get(subject.id);
      if (!row || row.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: `${row.productLabel} · ${row.smlCode}`, href: `/admin/operativa/porudzbine?order=${row.orderId}`, orderOperationId: row.operationId };
    }
    case "print_job": {
      const row = await ctx.db.get(subject.id);
      if (!row) throw new ConvexError("admin_task_subject_not_found");
      const operation = await ctx.db.get(row.operationId);
      if (!operation || operation.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: row.printerName, href: `/admin/operativa/porudzbine?order=${row.orderId}`, orderOperationId: row.operationId };
    }
    case "delivery": {
      const row = await ctx.db.get(subject.id);
      if (!row) throw new ConvexError("admin_task_subject_not_found");
      const operation = await ctx.db.get(row.operationId);
      if (!operation || operation.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: row.method, href: `/admin/operativa/porudzbine?order=${row.orderId}`, orderOperationId: row.operationId };
    }
    case "action_item": {
      const row = await ctx.db.get(subject.id);
      if (!row || row.accountId !== accountId) throw new ConvexError("admin_task_subject_cross_account");
      return { kind: subject.kind, label: row.description ?? row.causeKind, href: row.contextHref };
    }
  }
}

async function validateContext(
  ctx: DatabaseCtx,
  input: {
    accountId: Id<"accounts">;
    contactId?: Id<"accountContacts">;
    businessId?: Id<"businesses">;
    conversationId?: Id<"conversations">;
  },
) {
  const [account, contact, business, conversation] = await Promise.all([
    ctx.db.get(input.accountId),
    input.contactId ? ctx.db.get(input.contactId) : null,
    input.businessId ? ctx.db.get(input.businessId) : null,
    input.conversationId ? ctx.db.get(input.conversationId) : null,
  ]);
  if (!account || account.adminV1MigrationVersion !== 1 || !account.smkCode) {
    throw new ConvexError("admin_task_account_required");
  }
  if (input.contactId && (!contact || contact.accountId !== account._id)) {
    throw new ConvexError("admin_task_contact_cross_account");
  }
  if (input.businessId && (!business || business.accountId !== account._id || business.kind === "celebration")) {
    throw new ConvexError("admin_task_venue_cross_account");
  }
  if (input.conversationId && (!conversation || conversation.accountId !== account._id)) {
    throw new ConvexError("admin_task_conversation_cross_account");
  }
  return { account, contact, business, conversation };
}

function searchText(input: {
  accountName: string;
  smkCode: string;
  businessName?: string;
  smlCode?: string;
  subjectLabel?: string;
  title: string;
}) {
  return normalizeAdminSearchText([
    input.accountName,
    input.smkCode,
    input.businessName,
    input.smlCode,
    input.subjectLabel,
    input.title,
  ].filter(Boolean).join(" "));
}

async function syncTaskAction(ctx: MutationCtx, task: Doc<"clientTasks">, now: number) {
  const active = task.status === "open" || task.status === "in_progress" || task.status === "deferred";
  const overdue = task.timePhase === "overdue" && task.status !== "deferred";
  const dueToday = task.timePhase === "today" && task.status !== "deferred";
  const actionItemId = await syncAutomaticAction(ctx, {
    domain: "task",
    sourceRecordId: String(task._id),
    causeKind: "client_task",
    sourceVersion: JSON.stringify({
      updatedAt: task.updatedAt,
      status: task.status,
      priority: task.priority,
      due: task.due ?? null,
      assigneeId: task.assigneeId,
    }),
    isOpen: active,
    accountId: task.accountId,
    ...(task.businessId ? { businessId: task.businessId } : {}),
    severity: overdue
      ? "blocking"
      : dueToday || task.priority === "urgent"
        ? "warning"
        : "information",
    assigneeId: task.assigneeId,
    ...(task.dueAt !== undefined ? { dueAt: task.dueAt } : {}),
    ...(task.due?.kind ? { duePrecision: task.due.kind } : {}),
    relevantAt: task.updatedAt,
    priority: {
      blocking: false,
      overdue,
      dueToday,
      needsReply: false,
      graceOrWarning: false,
      waitingOn: active ? "scanme" : "none",
    },
    contextHref: `/admin/zadaci?task=${task._id}`,
    description: task.title,
  }, now);
  if (
    task.status === "deferred" &&
    task.deferredUntil !== undefined &&
    task.deferredReason &&
    actionItemId
  ) {
    const item = await ctx.db.get(actionItemId);
    if (
      item &&
      (item.state !== "snoozed" ||
        item.snoozedUntil !== task.deferredUntil ||
        item.snoozeReason !== task.deferredReason)
    ) {
      await ctx.db.patch(item._id, {
        state: "snoozed",
        snoozedUntil: task.deferredUntil,
        snoozeReason: task.deferredReason,
        snoozedByUserId: task.updatedByUserId,
        updatedAt: now,
      });
      await appendActionEvent(ctx, {
        actionItemId: item._id,
        causeId: item.causeId,
        event: "snoozed",
        actor: { kind: "admin", userId: task.updatedByUserId },
        fromState: item.state,
        toState: "snoozed",
        reason: task.deferredReason,
        until: task.deferredUntil,
        createdAt: now,
      });
      await refreshActionSignals(ctx, task);
    }
  }
  return actionItemId;
}

async function scheduleDueTransitions(
  ctx: MutationCtx,
  taskId: Id<"clientTasks">,
  due: TaskDue | null,
  dueVersion: string,
  now: number,
) {
  const facts = dueFacts(due, now);
  if (facts.todayAt !== null && facts.todayAt > now) {
    await ctx.scheduler.runAt(facts.todayAt, internal.adminTasks.advanceTemporalState, {
      taskId,
      dueVersion,
      phase: "today",
    });
  }
  if (facts.overdueAt !== null && facts.overdueAt > now) {
    await ctx.scheduler.runAt(facts.overdueAt, internal.adminTasks.advanceTemporalState, {
      taskId,
      dueVersion,
      phase: "overdue",
    });
  }
}

function taskFilter(args: {
  assigneeId?: Id<"users">;
  accountId?: Id<"accounts">;
  businessId?: Id<"businesses">;
  subjectKind?: Infer<typeof taskSubjectKindValidator>;
}) {
  return (q: FilterBuilder<DataModel["clientTasks"]>) => {
    const filters = [];
    if (args.assigneeId) filters.push(q.eq(q.field("assigneeId"), args.assigneeId));
    if (args.accountId) filters.push(q.eq(q.field("accountId"), args.accountId));
    if (args.businessId) filters.push(q.eq(q.field("businessId"), args.businessId));
    if (args.subjectKind) filters.push(q.eq(q.field("subjectKind"), args.subjectKind));
    return filters.length > 0
      ? q.and(...filters)
      : q.eq(q.field("view"), q.field("view"));
  };
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    tab: v.union(
      v.literal("all"),
      v.literal("today"),
      v.literal("overdue"),
      v.literal("deferred"),
      v.literal("completed"),
    ),
    search: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    accountId: v.optional(v.id("accounts")),
    businessId: v.optional(v.id("businesses")),
    subjectKind: v.optional(taskSubjectKindValidator),
  },
  returns: paginationResultValidator(taskListItemValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.paginationOpts.numItems > MAX_PAGE) throw new ConvexError("admin_task_page_limit");
    const view: TaskView = args.tab === "deferred"
      ? "deferred"
      : args.tab === "completed"
        ? "closed"
        : "active";
    const phase: TaskTimePhase | undefined = args.tab === "today"
      ? "today"
      : args.tab === "overdue"
        ? "overdue"
        : undefined;
    const search = args.search ? normalizeAdminSearchText(args.search) : "";
    let result;
    if (search) {
      result = await ctx.db
        .query("clientTasks")
        .withSearchIndex("search_tasks", (q) => {
          let indexed = q.search("searchText", search).eq("view", view);
          if (phase) indexed = indexed.eq("timePhase", phase);
          if (args.assigneeId) indexed = indexed.eq("assigneeId", args.assigneeId);
          if (args.accountId) indexed = indexed.eq("accountId", args.accountId);
          if (args.businessId) indexed = indexed.eq("businessId", args.businessId);
          if (args.subjectKind) indexed = indexed.eq("subjectKind", args.subjectKind);
          return indexed;
        })
        .paginate(args.paginationOpts);
    } else if (args.assigneeId) {
      result = phase
        ? await ctx.db
            .query("clientTasks")
            .withIndex("by_assignee_view_phase_dueSortAt", (q) =>
              q.eq("assigneeId", args.assigneeId!).eq("view", view).eq("timePhase", phase),
            )
            .filter(taskFilter(args))
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("clientTasks")
            .withIndex("by_assignee_and_view_and_dueSortAt", (q) =>
              q.eq("assigneeId", args.assigneeId!).eq("view", view),
            )
            .filter(taskFilter(args))
            .paginate(args.paginationOpts);
    } else if (args.accountId) {
      result = await ctx.db
        .query("clientTasks")
        .withIndex("by_account_and_view_and_dueSortAt", (q) =>
          q.eq("accountId", args.accountId!).eq("view", view),
        )
        .filter((q) => {
          const filters = [taskFilter(args)(q)];
          if (phase) filters.push(q.eq(q.field("timePhase"), phase));
          return q.and(...filters);
        })
        .paginate(args.paginationOpts);
    } else if (args.businessId) {
      result = await ctx.db
        .query("clientTasks")
        .withIndex("by_business_and_view_and_dueSortAt", (q) =>
          q.eq("businessId", args.businessId!).eq("view", view),
        )
        .filter((q) => {
          const filters = [taskFilter(args)(q)];
          if (phase) filters.push(q.eq(q.field("timePhase"), phase));
          return q.and(...filters);
        })
        .paginate(args.paginationOpts);
    } else if (args.subjectKind) {
      result = await ctx.db
        .query("clientTasks")
        .withIndex("by_subjectKind_and_view_and_dueSortAt", (q) =>
          q.eq("subjectKind", args.subjectKind!).eq("view", view),
        )
        .filter((q) => phase ? q.eq(q.field("timePhase"), phase) : q.eq(q.field("view"), view))
        .paginate(args.paginationOpts);
    } else if (phase) {
      result = await ctx.db
        .query("clientTasks")
        .withIndex("by_view_and_timePhase_and_dueSortAt", (q) =>
          q.eq("view", view).eq("timePhase", phase),
        )
        .paginate(args.paginationOpts);
    } else if (view === "closed") {
      result = await ctx.db
        .query("clientTasks")
        .withIndex("by_view_and_updatedAt", (q) => q.eq("view", view))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("clientTasks")
        .withIndex("by_view_and_dueSortAt_and_priorityRank", (q) => q.eq("view", view))
        .paginate(args.paginationOpts);
    }
    return { ...result, page: result.page.map(taskListItem) };
  },
});

export const getTask = query({
  args: { taskId: v.id("clientTasks") },
  returns: v.union(taskDetailValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const participants = await ctx.db
      .query("clientTaskParticipants")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .take(MAX_PARTICIPANTS + 1);
    if (participants.length > MAX_PARTICIPANTS) throw new ConvexError("admin_task_participants_limit");
    return {
      task: taskListItem(task),
      participants: participants.map((participant) => ({
        id: participant._id,
        userId: participant.userId,
        userName: participant.userName,
      })),
    };
  },
});

export const listHistory = query({
  args: { taskId: v.id("clientTasks"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(taskEventValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.paginationOpts.numItems > MAX_HISTORY_PAGE) {
      throw new ConvexError("admin_task_history_page_limit");
    }
    await requireTask(ctx, args.taskId);
    const result = await ctx.db
      .query("clientTaskEvents")
      .withIndex("by_taskId_and_createdAt", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((event) => ({
        id: event._id,
        event: event.event,
        field: event.field,
        actorKind: event.actorKind,
        actorUserId: event.actorUserId ?? null,
        actorName: event.actorName,
        before: event.before ?? null,
        after: event.after ?? null,
        reason: event.reason ?? null,
        until: event.until ?? null,
        targetAdminId: event.targetAdminId ?? null,
        createdAt: event.createdAt,
      })),
    };
  },
});

export const listAdmins = query({
  args: {},
  returns: v.array(adminOptionValidator),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const admins = await loadAdminUsers(ctx);
    return admins.map((admin) => ({ id: admin._id, name: adminName(admin), email: admin.email! }));
  },
});

export const contextOptions = query({
  args: {
    search: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
  },
  returns: v.object({
    accounts: v.array(accountOptionValidator),
    contacts: v.array(contactOptionValidator),
    venues: v.array(venueOptionValidator),
    conversations: v.array(conversationOptionValidator),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = args.search ? normalizeAdminSearchText(args.search) : "";
    const accountRows = search
      ? await ctx.db
          .query("adminClientReadModels")
          .withSearchIndex("search_searchText", (q) => q.search("searchText", search))
          .take(20)
      : await ctx.db
          .query("adminClientReadModels")
          .withIndex("by_normalizedOwnerDisplayName")
          .take(20);
    if (!args.accountId) {
      return {
        accounts: accountRows.map((row) => ({ id: row.accountId, name: row.accountName, smkCode: row.smkCode })),
        contacts: [],
        venues: [],
        conversations: [],
      };
    }
    const [contacts, venues, conversations] = await Promise.all([
      ctx.db
        .query("accountContacts")
        .withIndex("by_accountId_and_status", (q) => q.eq("accountId", args.accountId!).eq("status", "active"))
        .take(50),
      ctx.db
        .query("businesses")
        .withIndex("by_accountId_and_clientStatus", (q) => q.eq("accountId", args.accountId!).eq("clientStatus", "active"))
        .take(50),
      ctx.db
        .query("conversations")
        .withIndex("by_accountId_and_updatedAt", (q) => q.eq("accountId", args.accountId!))
        .order("desc")
        .take(30),
    ]);
    return {
      accounts: accountRows.map((row) => ({ id: row.accountId, name: row.accountName, smkCode: row.smkCode })),
      contacts: contacts.map((row) => ({ id: row._id, name: `${row.firstName} ${row.lastName}`.trim() })),
      venues: venues
        .filter((row) => row.kind !== "celebration" && row.smlCode)
        .map((row) => ({ id: row._id, name: row.name, smlCode: row.smlCode! })),
      conversations: conversations.map((row) => ({ id: row._id, label: row.latestMessagePreview })),
    };
  },
});

export const create = mutation({
  args: {
    commandId: v.string(),
    accountId: v.id("accounts"),
    contactId: v.optional(v.id("accountContacts")),
    businessId: v.optional(v.id("businesses")),
    conversationId: v.optional(v.id("conversations")),
    subject: v.optional(taskSubjectValidator),
    title: v.string(),
    description: v.string(),
    assigneeId: v.id("users"),
    participantIds: v.array(v.id("users")),
    priority: taskPriorityValidator,
    due: taskDueValidator,
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const existing = await ctx.db
      .query("clientTasks")
      .withIndex("by_creator_and_command", (q) =>
        q.eq("createdByUserId", actor._id).eq("createCommandId", commandId),
      )
      .unique();
    if (existing) return { taskId: existing._id };
    const title = requiredText(args.title, "admin_task_title_required", 240);
    const description = args.description.trim();
    if (description.length > 4_000) throw new ConvexError("admin_task_description_invalid");
    const context = await validateContext(ctx, args);
    const assignee = await requireAdminUser(ctx, args.assigneeId);
    const participantIds = [...new Set(args.participantIds.map(String))];
    if (participantIds.length !== args.participantIds.length || participantIds.length > MAX_PARTICIPANTS) {
      throw new ConvexError("admin_task_participants_invalid");
    }
    if (participantIds.includes(String(assignee._id))) {
      throw new ConvexError("admin_task_participant_is_assignee");
    }
    const participants = await Promise.all(
      args.participantIds.map((participantId) => requireAdminUser(ctx, participantId)),
    );
    const subject = args.subject ?? null;
    const subjectInfo = await resolveSubject(ctx, args.accountId, subject);
    const due = args.due ?? null;
    const now = Date.now();
    const facts = dueFacts(due, now);
    const taskId = await ctx.db.insert("clientTasks", {
      accountId: context.account._id,
      accountName: context.account.name,
      smkCode: context.account.smkCode!,
      ...(context.contact
        ? { contactId: context.contact._id, contactName: `${context.contact.firstName} ${context.contact.lastName}`.trim() }
        : {}),
      ...(context.business
        ? { businessId: context.business._id, businessName: context.business.name, smlCode: context.business.smlCode }
        : {}),
      ...(context.conversation ? { conversationId: context.conversation._id } : {}),
      ...(subject ? { subject } : {}),
      subjectKind: subjectInfo.kind,
      ...(subjectInfo.label ? { subjectLabel: subjectInfo.label } : {}),
      ...(subjectInfo.href ? { subjectHref: subjectInfo.href } : {}),
      ...(subjectInfo.orderOperationId ? { orderOperationId: subjectInfo.orderOperationId } : {}),
      title,
      description,
      assigneeId: assignee._id,
      assigneeName: adminName(assignee),
      priority: args.priority,
      priorityRank: PRIORITY_RANK[args.priority],
      ...(due ? { due } : {}),
      ...(facts.dueAt !== null ? { dueAt: facts.dueAt } : {}),
      dueSortAt: facts.dueAt ?? NO_DUE_SORT,
      ...(facts.dueDay ? { dueDay: facts.dueDay } : {}),
      dueVersion: commandId,
      timePhase: facts.phase,
      status: "open",
      view: "active",
      participantCount: participants.length,
      searchText: searchText({
        accountName: context.account.name,
        smkCode: context.account.smkCode!,
        businessName: context.business?.name,
        smlCode: context.business?.smlCode,
        subjectLabel: subjectInfo.label,
        title,
      }),
      createCommandId: commandId,
      createdByUserId: actor._id,
      updatedByUserId: actor._id,
      createdAt: now,
      updatedAt: now,
    });
    for (const participant of participants) {
      await ctx.db.insert("clientTaskParticipants", {
        taskId,
        userId: participant._id,
        userName: adminName(participant),
        addedByUserId: actor._id,
        createdAt: now,
      });
    }
    await appendTaskEvent(ctx, {
      taskId,
      commandId,
      event: "created",
      field: "task",
      actorKind: "admin",
      actorUserId: actor._id,
      actorName: adminName(actor),
      after: "open",
      createdAt: now,
    });
    const task = await requireTask(ctx, taskId);
    await syncTaskAction(ctx, task, now);
    await scheduleDueTransitions(ctx, taskId, due, commandId, now);
    await writeAdminAudit(ctx, {
      actorUserId: actor._id,
      accountId: task.accountId,
      ...(task.businessId ? { businessId: task.businessId } : {}),
      action: "admin_v1_task_created",
      detail: { taskId, commandId },
      now,
    });
    return { taskId };
  },
});

async function recordChange(
  ctx: MutationCtx,
  actor: Doc<"users">,
  task: Doc<"clientTasks">,
  input: {
    commandId: string;
    event: Infer<typeof taskEventKindValidator>;
    field: Infer<typeof taskEventFieldValidator>;
    before?: string;
    after?: string;
    reason?: string;
    until?: number;
    targetAdminId?: Id<"users">;
    auditAction: string;
  },
  now: number,
) {
  await appendTaskEvent(ctx, {
    taskId: task._id,
    commandId: input.commandId,
    event: input.event,
    field: input.field,
    actorKind: "admin",
    actorUserId: actor._id,
    actorName: adminName(actor),
    ...(input.before !== undefined ? { before: input.before } : {}),
    ...(input.after !== undefined ? { after: input.after } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.until !== undefined ? { until: input.until } : {}),
    ...(input.targetAdminId ? { targetAdminId: input.targetAdminId } : {}),
    createdAt: now,
  });
  await syncTaskAction(ctx, task, now);
  await writeAdminAudit(ctx, {
    actorUserId: actor._id,
    accountId: task.accountId,
    ...(task.businessId ? { businessId: task.businessId } : {}),
    action: input.auditAction,
    detail: {
      taskId: task._id,
      commandId: input.commandId,
      before: input.before ?? null,
      after: input.after ?? null,
    },
    now,
  });
}

export const updateContent = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    title: v.string(),
    description: v.string(),
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId)) return { taskId: task._id };
    const title = requiredText(args.title, "admin_task_title_required", 240);
    const description = args.description.trim();
    if (description.length > 4_000) throw new ConvexError("admin_task_description_invalid");
    if (task.title === title && task.description === description) return { taskId: task._id };
    const now = Date.now();
    await ctx.db.patch(task._id, {
      title,
      description,
      searchText: searchText({
        accountName: task.accountName,
        smkCode: task.smkCode,
        businessName: task.businessName,
        smlCode: task.smlCode,
        subjectLabel: task.subjectLabel,
        title,
      }),
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    await recordChange(ctx, actor, updated, {
      commandId,
      event: "content_changed",
      field: "content",
      before: task.title,
      after: title,
      auditAction: "admin_v1_task_content_changed",
    }, now);
    return { taskId: task._id };
  },
});

export const setPriority = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    priority: taskPriorityValidator,
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId) || task.priority === args.priority) {
      return { taskId: task._id };
    }
    const now = Date.now();
    await ctx.db.patch(task._id, {
      priority: args.priority,
      priorityRank: PRIORITY_RANK[args.priority],
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    await recordChange(ctx, actor, updated, {
      commandId,
      event: "priority_changed",
      field: "priority",
      before: task.priority,
      after: args.priority,
      auditAction: "admin_v1_task_priority_changed",
    }, now);
    return { taskId: task._id };
  },
});

export const setDue = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    due: taskDueValidator,
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId)) return { taskId: task._id };
    const due = args.due ?? null;
    if (dueText(task.due ?? null) === dueText(due)) return { taskId: task._id };
    const now = Date.now();
    const facts = dueFacts(due, now);
    await ctx.db.patch(task._id, {
      due: due ?? undefined,
      dueAt: facts.dueAt ?? undefined,
      dueSortAt: facts.dueAt ?? NO_DUE_SORT,
      dueDay: facts.dueDay ?? undefined,
      dueVersion: commandId,
      timePhase: task.view === "closed" ? "none" : facts.phase,
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    await recordChange(ctx, actor, updated, {
      commandId,
      event: "due_changed",
      field: "due",
      before: dueText(task.due ?? null),
      after: dueText(due),
      auditAction: "admin_v1_task_due_changed",
    }, now);
    await scheduleDueTransitions(ctx, task._id, due, commandId, now);
    return { taskId: task._id };
  },
});

export const setAssignee = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    assigneeId: v.id("users"),
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId) || task.assigneeId === args.assigneeId) {
      return { taskId: task._id };
    }
    const participant = await ctx.db
      .query("clientTaskParticipants")
      .withIndex("by_taskId_and_userId", (q) =>
        q.eq("taskId", task._id).eq("userId", args.assigneeId),
      )
      .unique();
    if (participant) throw new ConvexError("admin_task_assignee_is_participant");
    const assignee = await requireAdminUser(ctx, args.assigneeId);
    const now = Date.now();
    await ctx.db.patch(task._id, {
      assigneeId: assignee._id,
      assigneeName: adminName(assignee),
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    await recordChange(ctx, actor, updated, {
      commandId,
      event: "assignee_changed",
      field: "assignee",
      before: String(task.assigneeId),
      after: String(assignee._id),
      targetAdminId: assignee._id,
      auditAction: "admin_v1_task_assignee_changed",
    }, now);
    return { taskId: task._id };
  },
});

export const addParticipant = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    participantId: v.id("users"),
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId)) return { taskId: task._id };
    if (task.assigneeId === args.participantId) {
      throw new ConvexError("admin_task_participant_is_assignee");
    }
    const existing = await ctx.db
      .query("clientTaskParticipants")
      .withIndex("by_taskId_and_userId", (q) =>
        q.eq("taskId", task._id).eq("userId", args.participantId),
      )
      .unique();
    if (existing) throw new ConvexError("admin_task_participant_duplicate");
    if (task.participantCount >= MAX_PARTICIPANTS) {
      throw new ConvexError("admin_task_participants_limit");
    }
    const participant = await requireAdminUser(ctx, args.participantId);
    const now = Date.now();
    await ctx.db.insert("clientTaskParticipants", {
      taskId: task._id,
      userId: participant._id,
      userName: adminName(participant),
      addedByUserId: actor._id,
      createdAt: now,
    });
    await ctx.db.patch(task._id, {
      participantCount: task.participantCount + 1,
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    await recordChange(ctx, actor, updated, {
      commandId,
      event: "participant_added",
      field: "participant",
      after: String(participant._id),
      targetAdminId: participant._id,
      auditAction: "admin_v1_task_participant_added",
    }, now);
    return { taskId: task._id };
  },
});

export const removeParticipant = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    participantId: v.id("users"),
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId)) return { taskId: task._id };
    const participant = await ctx.db
      .query("clientTaskParticipants")
      .withIndex("by_taskId_and_userId", (q) =>
        q.eq("taskId", task._id).eq("userId", args.participantId),
      )
      .unique();
    if (!participant) throw new ConvexError("admin_task_participant_not_found");
    const now = Date.now();
    await ctx.db.delete(participant._id);
    await ctx.db.patch(task._id, {
      participantCount: Math.max(0, task.participantCount - 1),
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    await recordChange(ctx, actor, updated, {
      commandId,
      event: "participant_removed",
      field: "participant",
      before: String(args.participantId),
      targetAdminId: args.participantId,
      auditAction: "admin_v1_task_participant_removed",
    }, now);
    return { taskId: task._id };
  },
});

export const setSubject = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    subject: v.union(taskSubjectValidator, v.null()),
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId)) return { taskId: task._id };
    const current = task.subject ? `${task.subject.kind}:${task.subject.id}` : "none";
    const next = args.subject ? `${args.subject.kind}:${args.subject.id}` : "none";
    if (current === next) return { taskId: task._id };
    const subjectInfo = await resolveSubject(ctx, task.accountId, args.subject);
    const now = Date.now();
    await ctx.db.patch(task._id, {
      subject: args.subject ?? undefined,
      subjectKind: subjectInfo.kind,
      subjectLabel: subjectInfo.label,
      subjectHref: subjectInfo.href,
      orderOperationId: subjectInfo.orderOperationId,
      searchText: searchText({
        accountName: task.accountName,
        smkCode: task.smkCode,
        businessName: task.businessName,
        smlCode: task.smlCode,
        subjectLabel: subjectInfo.label,
        title: task.title,
      }),
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    await recordChange(ctx, actor, updated, {
      commandId,
      event: "subject_changed",
      field: "subject",
      before: current,
      after: next,
      auditAction: "admin_v1_task_subject_changed",
    }, now);
    return { taskId: task._id };
  },
});

export const changeStatus = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    reason: v.optional(v.string()),
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId) || task.status === args.status) {
      return { taskId: task._id };
    }
    const reason = optionalText(args.reason, 1_000);
    const wasClosed = task.status === "completed" || task.status === "cancelled";
    const reopening = wasClosed && (args.status === "open" || args.status === "in_progress");
    const resuming = task.status === "deferred" && (args.status === "open" || args.status === "in_progress");
    if (task.status === "deferred" && !resuming) throw new ConvexError("admin_task_status_transition_invalid");
    if (wasClosed && !reopening) throw new ConvexError("admin_task_status_transition_invalid");
    if ((args.status === "cancelled" || reopening || resuming) && !reason) {
      throw new ConvexError("admin_task_status_reason_required");
    }
    const now = Date.now();
    const currentFacts = dueFacts(task.due ?? null, now);
    await ctx.db.patch(task._id, {
      status: args.status,
      view: taskViewFor(args.status),
      timePhase: taskViewFor(args.status) === "closed" ? "none" : currentFacts.phase,
      resumeStatus: undefined,
      deferredUntil: undefined,
      deferredReason: undefined,
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    const event = reopening
      ? "reopened"
      : resuming
        ? "resumed"
        : args.status === "completed"
          ? "completed"
          : args.status === "cancelled"
            ? "cancelled"
            : "status_changed";
    await recordChange(ctx, actor, updated, {
      commandId,
      event,
      field: "status",
      before: task.status,
      after: args.status,
      ...(reason ? { reason } : {}),
      auditAction: `admin_v1_task_${event}`,
    }, now);
    return { taskId: task._id };
  },
});

export const defer = mutation({
  args: {
    taskId: v.id("clientTasks"),
    commandId: v.string(),
    until: v.number(),
    reason: v.string(),
  },
  returns: v.object({ taskId: v.id("clientTasks") }),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const commandId = requiredText(args.commandId, "admin_task_command_required", 128);
    const task = await requireTask(ctx, args.taskId);
    if (await existingCommand(ctx, task._id, commandId)) return { taskId: task._id };
    const reason = requiredText(args.reason, "admin_task_defer_reason_required", 1_000);
    validTime(args.until, "admin_task_defer_time_invalid");
    const now = Date.now();
    if (args.until <= now) throw new ConvexError("admin_task_defer_must_be_future");
    const resumeStatus: TaskActiveStatus = task.status === "in_progress"
      ? "in_progress"
      : task.status === "deferred"
        ? task.resumeStatus ?? "open"
        : task.status === "open"
          ? "open"
          : (() => { throw new ConvexError("admin_task_defer_status_invalid"); })();
    await ctx.db.patch(task._id, {
      status: "deferred",
      view: "deferred",
      resumeStatus,
      deferredUntil: args.until,
      deferredReason: reason,
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    const updated = await requireTask(ctx, task._id);
    await recordChange(ctx, actor, updated, {
      commandId,
      event: "deferred",
      field: "deferral",
      before: task.status,
      after: "deferred",
      reason,
      until: args.until,
      auditAction: "admin_v1_task_deferred",
    }, now);
    await ctx.scheduler.runAt(args.until, internal.adminTasks.resumeDeferred, {
      taskId: task._id,
      expectedUntil: args.until,
    });
    return { taskId: task._id };
  },
});

export const advanceTemporalState = internalMutation({
  args: {
    taskId: v.id("clientTasks"),
    dueVersion: v.string(),
    phase: v.union(v.literal("today"), v.literal("overdue")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.dueVersion !== args.dueVersion || !task.due || task.view === "closed") return null;
    const now = Date.now();
    const facts = dueFacts(task.due, now);
    if (facts.phase !== args.phase || task.timePhase === facts.phase) return null;
    await ctx.db.patch(task._id, { timePhase: facts.phase, updatedAt: now });
    await syncTaskAction(ctx, await requireTask(ctx, task._id), now);
    return null;
  },
});

export const resumeDeferred = internalMutation({
  args: { taskId: v.id("clientTasks"), expectedUntil: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (
      !task ||
      task.status !== "deferred" ||
      task.deferredUntil !== args.expectedUntil ||
      args.expectedUntil > Date.now()
    ) return null;
    const now = Date.now();
    const status = task.resumeStatus ?? "open";
    const facts = dueFacts(task.due ?? null, now);
    await ctx.db.patch(task._id, {
      status,
      view: "active",
      timePhase: facts.phase,
      resumeStatus: undefined,
      deferredUntil: undefined,
      deferredReason: undefined,
      updatedAt: now,
    });
    const commandId = `defer-expired:${args.expectedUntil}`;
    if (!(await existingCommand(ctx, task._id, commandId))) {
      await appendTaskEvent(ctx, {
        taskId: task._id,
        commandId,
        event: "resumed",
        field: "deferral",
        actorKind: "system",
        actorName: adminTasksSr.systemActor,
        before: "deferred",
        after: status,
        createdAt: now,
      });
    }
    await syncTaskAction(ctx, await requireTask(ctx, task._id), now);
    return null;
  },
});

const dashboardGroupValidator = v.object({
  items: v.array(taskListItemValidator),
  capped: v.boolean(),
});

export const dashboardAdapter = query({
  args: { now: v.number(), limit: v.number() },
  returns: v.object({
    today: dashboardGroupValidator,
    overdue: dashboardGroupValidator,
    mine: dashboardGroupValidator,
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    validTime(args.now);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 12) {
      throw new ConvexError("admin_task_dashboard_limit");
    }
    const take = args.limit + 1;
    const [today, overdue, mine] = await Promise.all([
      ctx.db
        .query("clientTasks")
        .withIndex("by_view_and_timePhase_and_dueSortAt", (q) =>
          q.eq("view", "active").eq("timePhase", "today"),
        )
        .take(take),
      ctx.db
        .query("clientTasks")
        .withIndex("by_view_and_timePhase_and_dueSortAt", (q) =>
          q.eq("view", "active").eq("timePhase", "overdue"),
        )
        .take(take),
      ctx.db
        .query("clientTasks")
        .withIndex("by_assignee_and_view_and_dueSortAt", (q) =>
          q.eq("assigneeId", admin._id).eq("view", "active"),
        )
        .take(take),
    ]);
    const group = (rows: Doc<"clientTasks">[]) => ({
      items: rows.slice(0, args.limit).map(taskListItem),
      capped: rows.length > args.limit,
    });
    return { today: group(today), overdue: group(overdue), mine: group(mine) };
  },
});

const teamMemberValidator = v.object({
  id: v.id("users"),
  name: v.string(),
  email: v.string(),
  openTasks: v.number(),
  overdueTasks: v.number(),
  assignedConversations: v.number(),
  awaitingReaction: v.number(),
  countsCapped: v.boolean(),
});

export const teamOverview = query({
  args: {},
  returns: v.array(teamMemberValidator),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const admins = await loadAdminUsers(ctx);
    return Promise.all(admins.map(async (admin) => {
      const [openTasks, overdueTasks, conversations] = await Promise.all([
        ctx.db
          .query("clientTasks")
          .withIndex("by_assignee_and_view_and_dueSortAt", (q) =>
            q.eq("assigneeId", admin._id).eq("view", "active"),
          )
          .take(MAX_TEAM_COUNT + 1),
        ctx.db
          .query("clientTasks")
          .withIndex("by_assignee_view_phase_dueSortAt", (q) =>
            q.eq("assigneeId", admin._id).eq("view", "active").eq("timePhase", "overdue"),
          )
          .take(MAX_TEAM_COUNT + 1),
        ctx.db
          .query("conversations")
          .withIndex("by_assigneeKey_and_updatedAt", (q) => q.eq("assigneeKey", String(admin._id)))
          .take(MAX_TEAM_COUNT + 1),
      ]);
      const visibleConversations = conversations.slice(0, MAX_TEAM_COUNT);
      const awaitingConversationCount = visibleConversations.filter(
        (conversation) => conversation.status === "new" || conversation.status === "needs_reply",
      ).length;
      return {
        id: admin._id,
        name: adminName(admin),
        email: admin.email!,
        openTasks: Math.min(openTasks.length, MAX_TEAM_COUNT),
        overdueTasks: Math.min(overdueTasks.length, MAX_TEAM_COUNT),
        assignedConversations: Math.min(conversations.length, MAX_TEAM_COUNT),
        awaitingReaction: Math.min(overdueTasks.length, MAX_TEAM_COUNT) + awaitingConversationCount,
        countsCapped:
          openTasks.length > MAX_TEAM_COUNT ||
          overdueTasks.length > MAX_TEAM_COUNT ||
          conversations.length > MAX_TEAM_COUNT,
      };
    }));
  },
});
