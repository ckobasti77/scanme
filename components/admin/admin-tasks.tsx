"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Plus,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import {
  Component,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { adminTasksSr as dict } from "@/lib/i18n/sr/admin-tasks";
import { belgradeLocalDateTimeToUtc } from "@/lib/admin-v1/task-time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPanel,
  AdminStatus,
} from "./admin-primitives";
import { AdminDataView, type AdminColumn } from "./admin-ui";

type TaskResult = FunctionReturnType<typeof api.adminTasks.list>;
type TaskItem = TaskResult["page"][number];
type TaskDetail = NonNullable<
  FunctionReturnType<typeof api.adminTasks.getTask>
>;
type AdminOption = FunctionReturnType<typeof api.adminTasks.listAdmins>[number];
type TaskTab = "all" | "today" | "overdue" | "deferred" | "completed";
type TaskStatus = TaskItem["status"];
type TaskPriority = TaskItem["priority"];
type SubjectKind = TaskItem["subjectKind"];

const statusLabels: Record<TaskStatus, string> = {
  open: dict.statusOpen,
  in_progress: dict.statusInProgress,
  deferred: dict.statusDeferred,
  completed: dict.statusCompleted,
  cancelled: dict.statusCancelled,
};

const priorityLabels: Record<TaskPriority, string> = {
  low: dict.priorityLow,
  normal: dict.priorityNormal,
  high: dict.priorityHigh,
  urgent: dict.priorityUrgent,
};

const subjectLabels: Record<SubjectKind, string> = {
  none: dict.subjectNone,
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

const tabs: { value: TaskTab; label: string }[] = [
  { value: "all", label: dict.tabAll },
  { value: "today", label: dict.tabToday },
  { value: "overdue", label: dict.tabOverdue },
  { value: "deferred", label: dict.tabDeferred },
  { value: "completed", label: dict.tabCompleted },
];

const dateFormatter = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: "Europe/Belgrade",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: "Europe/Belgrade",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function commandId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random()}`
  );
}

function dueLabel(task: TaskItem) {
  if (!task.due) return dict.dueNone;
  if (task.timePhase === "overdue")
    return `${dict.dueOverdue} · ${task.due.kind === "date" ? task.due.date : dateTimeFormatter.format(task.due.at)}`;
  if (task.timePhase === "today")
    return `${dict.dueToday}${task.due.kind === "instant" ? ` · ${dateTimeFormatter.format(task.due.at)}` : ""}`;
  return task.due.kind === "date"
    ? dateFormatter.format(Date.parse(`${task.due.date}T12:00:00.000Z`))
    : dateTimeFormatter.format(task.due.at);
}

function statusTone(status: TaskStatus, phase: TaskItem["timePhase"]) {
  if (status === "completed" || status === "cancelled")
    return "neutral" as const;
  if (phase === "overdue") return "problem" as const;
  if (status === "in_progress" || phase === "today") return "waiting" as const;
  if (status === "open") return "active" as const;
  return "neutral" as const;
}

function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold",
        priority === "urgent" || priority === "high"
          ? "text-[var(--admin-danger)]"
          : "text-[var(--admin-text-muted)]",
      )}
    >
      <span className="size-2 rounded-full bg-current" aria-hidden="true" />
      {priorityLabels[priority]}
    </span>
  );
}

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function dueSortValue(task: TaskItem) {
  if (!task.due) return null;
  return task.due.kind === "date" ? Date.parse(`${task.due.date}T12:00:00Z`) : task.due.at;
}

const taskColumns = (onSelect: (id: Id<"clientTasks">) => void): AdminColumn<TaskItem>[] => [
  {
    id: "client",
    header: dict.colClient,
    sortValue: (task) => task.accountName,
    cell: (task) => (
      <>
        <strong className="block text-sm">{task.accountName}</strong>
        <span className="mt-1 block font-mono text-[0.68rem] text-[var(--admin-text-muted)]">
          {task.smkCode}
          {task.smlCode ? ` · ${task.smlCode}` : ""}
        </span>
      </>
    ),
  },
  {
    id: "task",
    header: dict.colTask,
    rowHeader: true,
    sortValue: (task) => task.title,
    className: "max-w-[26rem]",
    cell: (task) => (
      <>
        <strong className="block text-sm">{task.title}</strong>
        {task.businessName ? (
          <span className="mt-1 block text-xs text-[var(--admin-text-muted)]">
            {task.businessName}
          </span>
        ) : null}
      </>
    ),
  },
  {
    id: "due",
    header: dict.colDue,
    sortValue: dueSortValue,
    cell: (task) => (
      <span className={cn(task.timePhase === "overdue" && "font-semibold text-[var(--admin-danger)]")}>
        {dueLabel(task)}
      </span>
    ),
  },
  {
    id: "priority",
    header: dict.colPriority,
    sortValue: (task) => PRIORITY_RANK[task.priority],
    cell: (task) => <PriorityLabel priority={task.priority} />,
  },
  {
    id: "assignee",
    header: dict.colAssignee,
    sortValue: (task) => task.assigneeName,
    cell: (task) => task.assigneeName,
  },
  {
    id: "status",
    header: dict.colStatus,
    sortValue: (task) => statusLabels[task.status],
    cell: (task) => (
      <AdminStatus
        label={statusLabels[task.status]}
        tone={statusTone(task.status, task.timePhase)}
      />
    ),
  },
  {
    id: "open",
    header: dict.openDetail,
    headerHidden: true,
    align: "end",
    cell: (task) => (
      <button
        type="button"
        onClick={() => onSelect(task.id)}
        className="inline-grid size-11 place-items-center rounded-full hover:bg-[var(--admin-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
        aria-label={`${dict.openDetail}: ${task.title}`}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    ),
  },
];

function TaskList({
  rows,
  onSelect,
}: {
  rows: TaskItem[];
  onSelect: (id: Id<"clientTasks">) => void;
}) {
  return (
    <AdminDataView
      listKey="zadaci.lista"
      caption={dict.tableCaption}
      rows={rows}
      getRowId={(task) => task.id}
      columns={taskColumns(onSelect)}
      autoBreakpoint="md"
      tableClassName="min-w-[48rem]"
      renderCard={(task) => (
        <button
          type="button"
          onClick={() => onSelect(task.id)}
          className="min-h-11 w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--admin-focus)]"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block font-mono text-[0.68rem] text-[var(--admin-text-muted)]">
                {task.smkCode}
                {task.smlCode ? ` · ${task.smlCode}` : ""}
              </span>
              <strong className="mt-1 block break-words text-sm">
                {task.title}
              </strong>
              <span className="mt-1 block text-xs text-[var(--admin-text-muted)]">
                {task.accountName}
                {task.businessName ? ` · ${task.businessName}` : ""}
              </span>
            </span>
            <ChevronRight
              className="mt-1 size-4 shrink-0 text-[var(--admin-text-muted)]"
              aria-hidden="true"
            />
          </span>
          <span className="mt-4 flex flex-wrap items-center gap-2">
            <AdminStatus
              label={statusLabels[task.status]}
              tone={statusTone(task.status, task.timePhase)}
            />
            <PriorityLabel priority={task.priority} />
          </span>
          <span
            className={cn(
              "mt-3 flex items-center gap-2 text-xs",
              task.timePhase === "overdue"
                ? "font-semibold text-[var(--admin-danger)]"
                : "text-[var(--admin-text-muted)]",
            )}
          >
            <CalendarClock className="size-4" aria-hidden="true" />
            {dueLabel(task)}
            <span aria-hidden="true">·</span>
            <UserRound className="size-4" aria-hidden="true" />
            {task.assigneeName}
          </span>
        </button>
      )}
    />
  );
}

function Filters({
  tab,
  search,
  assignee,
  account,
  business,
  subject,
  admins,
  accounts,
  venues,
  onTab,
  onSearch,
  onAssignee,
  onAccount,
  onBusiness,
  onSubject,
}: {
  tab: TaskTab;
  search: string;
  assignee: string;
  account: string;
  business: string;
  subject: SubjectKind | "all";
  admins: AdminOption[];
  accounts: { id: Id<"accounts">; name: string; smkCode: string }[];
  venues: { id: Id<"businesses">; name: string; smlCode: string }[];
  onTab: (value: TaskTab) => void;
  onSearch: (value: string) => void;
  onAssignee: (value: string) => void;
  onAccount: (value: string) => void;
  onBusiness: (value: string) => void;
  onSubject: (value: SubjectKind | "all") => void;
}) {
  return (
    <AdminPanel className="grid gap-4 p-3 sm:p-4">
      <div
        className="flex max-w-full gap-0 overflow-hidden rounded-full bg-[var(--admin-surface-muted)] p-1 sm:gap-1"
        role="tablist"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => onTab(item.value)}
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-full px-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] sm:flex-none sm:px-4 sm:text-sm",
              tab === item.value
                ? "bg-[var(--admin-nav-active)] text-white shadow-sm"
                : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,0.55fr))]">
        <label className="relative block">
          <span className="sr-only">{dict.searchLabel}</span>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={dict.searchPlaceholder}
            className="min-h-11 pl-10"
          />
        </label>
        <NativeFilter
          label={dict.filterAssignee}
          value={assignee}
          onChange={onAssignee}
        >
          <option value="all">{dict.filterAll}</option>
          {admins.map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.name}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label={dict.filterClient}
          value={account}
          onChange={(value) => {
            onAccount(value);
            onBusiness("all");
          }}
        >
          <option value="all">{dict.filterAll}</option>
          {accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.smkCode}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label={dict.filterVenue}
          value={business}
          onChange={onBusiness}
          disabled={account === "all"}
        >
          <option value="all">{dict.noVenue}</option>
          {venues.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.smlCode}
            </option>
          ))}
        </NativeFilter>
        <NativeFilter
          label={dict.filterSubject}
          value={subject}
          onChange={(value) => onSubject(value as SubjectKind | "all")}
        >
          <option value="all">{dict.filterAll}</option>
          {(Object.keys(subjectLabels) as SubjectKind[])
            .filter((kind) => kind !== "none")
            .map((kind) => (
              <option key={kind} value={kind}>
                {subjectLabels[kind]}
              </option>
            ))}
        </NativeFilter>
      </div>
    </AdminPanel>
  );
}

function NativeFilter({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-[var(--admin-text-muted)]">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm text-[var(--admin-text)] outline-none focus:ring-2 focus:ring-[var(--admin-focus)] disabled:opacity-50"
      >
        {children}
      </select>
    </label>
  );
}

export function AdminTasksWorkspace({
  initialAssigneeId,
  initialTaskId,
}: {
  initialAssigneeId?: Id<"users">;
  initialTaskId?: Id<"clientTasks">;
} = {}) {
  const [tab, setTab] = useState<TaskTab>("all");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState<string>(initialAssigneeId ?? "all");
  const [account, setAccount] = useState("all");
  const [business, setBusiness] = useState("all");
  const [subject, setSubject] = useState<SubjectKind | "all">("all");
  const [selectedId, setSelectedId] = useState<Id<"clientTasks"> | null>(
    initialTaskId ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const admins = useQuery(api.adminTasks.listAdmins) ?? [];
  const baseOptions = useQuery(api.adminTasks.contextOptions, {});
  const scopedOptions = useQuery(
    api.adminTasks.contextOptions,
    account === "all" ? {} : { accountId: account as Id<"accounts"> },
  );
  const rows = usePaginatedQuery(
    api.adminTasks.list,
    {
      tab,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(assignee !== "all" ? { assigneeId: assignee as Id<"users"> } : {}),
      ...(account !== "all" ? { accountId: account as Id<"accounts"> } : {}),
      ...(business !== "all"
        ? { businessId: business as Id<"businesses"> }
        : {}),
      ...(subject !== "all" ? { subjectKind: subject } : {}),
    },
    { initialNumItems: 20 },
  );
  const filtered = Boolean(
    search.trim() ||
    assignee !== "all" ||
    account !== "all" ||
    business !== "all" ||
    subject !== "all" ||
    tab !== "all",
  );

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(2.1rem,4vw,3.75rem)] leading-none font-medium tracking-[-0.05em]">
            {dict.pageTitle}
          </h1>
          <p className="mt-2 text-sm text-[var(--admin-text-muted)] sm:text-base">
            {dict.pageSubtitle}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-11 rounded-full px-5"
        >
          <Plus className="size-4" aria-hidden="true" />
          {dict.createAction}
        </Button>
      </header>
      <Filters
        tab={tab}
        search={search}
        assignee={assignee}
        account={account}
        business={business}
        subject={subject}
        admins={admins}
        accounts={baseOptions?.accounts ?? []}
        venues={scopedOptions?.venues ?? []}
        onTab={setTab}
        onSearch={setSearch}
        onAssignee={setAssignee}
        onAccount={setAccount}
        onBusiness={setBusiness}
        onSubject={setSubject}
      />
      {rows.status === "LoadingFirstPage" ? (
        <AdminPanel>
          <AdminLoadingState />
        </AdminPanel>
      ) : rows.results.length === 0 ? (
        <AdminPanel>
          <AdminEmptyState
            title={filtered ? dict.noResultsTitle : dict.emptyTitle}
            body={filtered ? dict.noResultsBody : dict.emptyBody}
          />
        </AdminPanel>
      ) : (
        <div className="grid gap-4">
          <TaskList rows={rows.results} onSelect={setSelectedId} />
          {rows.status === "CanLoadMore" || rows.status === "LoadingMore" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 justify-self-center"
              disabled={rows.status === "LoadingMore"}
              onClick={() => rows.loadMore(20)}
            >
              {rows.status === "LoadingMore" ? dict.loadingMore : dict.loadMore}
            </Button>
          ) : null}
        </div>
      )}
      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        admins={admins}
        onCreated={(id) => {
          setSelectedId(id);
          setCreateOpen(false);
        }}
      />
      <TaskDetailSheet
        taskId={selectedId}
        admins={admins}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  admins,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admins: AdminOption[];
  onCreated: (id: Id<"clientTasks">) => void;
}) {
  const createTask = useMutation(api.adminTasks.create);
  const [clientSearch, setClientSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [subjectKind, setSubjectKind] = useState<
    "none" | "account" | "contact" | "venue" | "conversation"
  >("none");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueKind, setDueKind] = useState<"none" | "date" | "instant">("none");
  const [dueDate, setDueDate] = useState("");
  const [dueInstant, setDueInstant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = useQuery(api.adminTasks.contextOptions, {
    ...(clientSearch.trim() ? { search: clientSearch.trim() } : {}),
    ...(accountId ? { accountId: accountId as Id<"accounts"> } : {}),
  });

  function reset() {
    setClientSearch("");
    setAccountId("");
    setContactId("");
    setBusinessId("");
    setConversationId("");
    setSubjectKind("none");
    setTitle("");
    setDescription("");
    setAssigneeId("");
    setParticipantIds([]);
    setPriority("normal");
    setDueKind("none");
    setDueDate("");
    setDueInstant("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId || !assigneeId || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const subject =
        subjectKind === "account"
          ? { kind: "account" as const, id: accountId as Id<"accounts"> }
          : subjectKind === "contact" && contactId
            ? {
                kind: "contact" as const,
                id: contactId as Id<"accountContacts">,
              }
            : subjectKind === "venue" && businessId
              ? { kind: "venue" as const, id: businessId as Id<"businesses"> }
              : subjectKind === "conversation" && conversationId
                ? {
                    kind: "conversation" as const,
                    id: conversationId as Id<"conversations">,
                  }
                : undefined;
      const due =
        dueKind === "date" && dueDate
          ? { kind: "date" as const, date: dueDate }
          : dueKind === "instant" && dueInstant
            ? {
                kind: "instant" as const,
                at: belgradeLocalDateTimeToUtc(dueInstant),
              }
            : null;
      const result = await createTask({
        commandId: commandId(),
        accountId: accountId as Id<"accounts">,
        ...(contactId ? { contactId: contactId as Id<"accountContacts"> } : {}),
        ...(businessId ? { businessId: businessId as Id<"businesses"> } : {}),
        ...(conversationId
          ? { conversationId: conversationId as Id<"conversations"> }
          : {}),
        ...(subject ? { subject } : {}),
        title,
        description,
        assigneeId: assigneeId as Id<"users">,
        participantIds: participantIds as Id<"users">[],
        priority,
        due,
      });
      onCreated(result.taskId);
      reset();
    } catch {
      setError(dict.mutationError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="admin-v1 max-h-[92dvh] overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] sm:max-w-2xl motion-reduce:duration-0">
        <DialogHeader>
          <DialogTitle>{dict.createTitle}</DialogTitle>
          <DialogDescription>{dict.createDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="task-client-search">{dict.searchLabel}</Label>
            <Input
              id="task-client-search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder={dict.searchPlaceholder}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              label={dict.clientLabel}
              value={accountId}
              onChange={(value) => {
                setAccountId(value);
                setContactId("");
                setBusinessId("");
                setConversationId("");
              }}
              required
            >
              <option value="">{dict.selectClient}</option>
              {(options?.accounts ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.smkCode}
                </option>
              ))}
            </FormSelect>
            <FormSelect
              label={dict.assigneeLabel}
              value={assigneeId}
              onChange={(value) => {
                setAssigneeId(value);
                setParticipantIds((current) =>
                  current.filter((id) => id !== value),
                );
              }}
              required
            >
              <option value="">{dict.selectAssignee}</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </FormSelect>
            <FormSelect
              label={dict.contactLabel}
              value={contactId}
              onChange={setContactId}
              disabled={!accountId}
            >
              <option value="">{dict.selectOptional}</option>
              {(options?.contacts ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </FormSelect>
            <FormSelect
              label={dict.venueLabel}
              value={businessId}
              onChange={setBusinessId}
              disabled={!accountId}
            >
              <option value="">{dict.selectOptional}</option>
              {(options?.venues ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.smlCode}
                </option>
              ))}
            </FormSelect>
            <FormSelect
              label={dict.conversationLabel}
              value={conversationId}
              onChange={setConversationId}
              disabled={!accountId}
            >
              <option value="">{dict.selectOptional}</option>
              {(options?.conversations ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </FormSelect>
            <FormSelect
              label={dict.subjectLabel}
              value={subjectKind}
              onChange={(value) => setSubjectKind(value as typeof subjectKind)}
            >
              <option value="none">{dict.subjectNone}</option>
              <option value="account">{dict.subjectAccount}</option>
              <option value="contact" disabled={!contactId}>
                {dict.subjectContact}
              </option>
              <option value="venue" disabled={!businessId}>
                {dict.subjectVenue}
              </option>
              <option value="conversation" disabled={!conversationId}>
                {dict.subjectConversation}
              </option>
            </FormSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-title">{dict.titleLabel}</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={dict.titlePlaceholder}
              maxLength={240}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-description">{dict.descriptionLabel}</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={dict.descriptionPlaceholder}
              maxLength={4_000}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              label={dict.priorityLabel}
              value={priority}
              onChange={(value) => setPriority(value as TaskPriority)}
            >
              {(Object.keys(priorityLabels) as TaskPriority[]).map((value) => (
                <option key={value} value={value}>
                  {priorityLabels[value]}
                </option>
              ))}
            </FormSelect>
            <FormSelect
              label={dict.dueKindLabel}
              value={dueKind}
              onChange={(value) => setDueKind(value as typeof dueKind)}
            >
              <option value="none">{dict.dueNone}</option>
              <option value="date">{dict.dueDate}</option>
              <option value="instant">{dict.dueInstant}</option>
            </FormSelect>
          </div>
          {dueKind === "date" ? (
            <FieldInput
              label={dict.dueDateLabel}
              type="date"
              value={dueDate}
              onChange={setDueDate}
              required
            />
          ) : null}
          {dueKind === "instant" ? (
            <FieldInput
              label={dict.dueTimeLabel}
              type="datetime-local"
              value={dueInstant}
              onChange={setDueInstant}
              required
            />
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">
              {dict.participantsLabel}
            </legend>
            <div className="flex flex-wrap gap-2">
              {admins
                .filter((admin) => admin.id !== assigneeId)
                .map((admin) => (
                  <label
                    key={admin.id}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--admin-border)] px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={participantIds.includes(admin.id)}
                      onChange={(event) =>
                        setParticipantIds((current) =>
                          event.target.checked
                            ? [...current, admin.id]
                            : current.filter((id) => id !== admin.id),
                        )
                      }
                    />
                    {admin.name}
                  </label>
                ))}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-[var(--admin-danger)]">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {dict.cancel}
            </Button>
            <Button
              type="submit"
              disabled={busy || !accountId || !assigneeId || !title.trim()}
            >
              {busy ? dict.saving : dict.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  disabled,
  required,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  children: ReactNode;
}) {
  const id = `task-field-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--admin-focus)] disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}

function FieldInput({
  label,
  type,
  value,
  onChange,
  required,
}: {
  label: string;
  type: "date" | "datetime-local";
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const id = `task-field-${type}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </div>
  );
}

function localInputValue(at: number) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function TaskDetailSheet({
  taskId,
  admins,
  onOpenChange,
}: {
  taskId: Id<"clientTasks"> | null;
  admins: AdminOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useQuery(api.adminTasks.getTask, taskId ? { taskId } : "skip");
  const history = usePaginatedQuery(
    api.adminTasks.listHistory,
    taskId ? { taskId } : "skip",
    { initialNumItems: 20 },
  );
  const me = useQuery(api.adminCommunications.me);
  return (
    <Sheet open={Boolean(taskId)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="admin-v1 w-full max-w-none overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 sm:max-w-xl motion-reduce:duration-0"
      >
        <SheetHeader className="border-b border-[var(--admin-border)] px-5 py-5 pr-14 text-left">
          <SheetTitle>{dict.detailTitle}</SheetTitle>
          <SheetDescription>{dict.detailDescription}</SheetDescription>
        </SheetHeader>
        {detail === undefined ? (
          <AdminLoadingState />
        ) : detail === null ? (
          <AdminErrorState title={dict.errorTitle} body={dict.errorBody} onRetry={() => window.location.reload()} />
        ) : (
          <TaskDetailContent
            key={detail.task.id}
            detail={detail}
            history={history}
            admins={admins}
            me={me ?? null}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailContent({
  detail,
  history,
  admins,
  me,
}: {
  detail: TaskDetail;
  history: ReturnType<
    typeof usePaginatedQuery<typeof api.adminTasks.listHistory>
  >;
  admins: AdminOption[];
  me: { id: Id<"users">; name: string } | null;
}) {
  const task = detail.task;
  const updateContent = useMutation(api.adminTasks.updateContent);
  const setPriority = useMutation(api.adminTasks.setPriority);
  const setDue = useMutation(api.adminTasks.setDue);
  const setAssignee = useMutation(api.adminTasks.setAssignee);
  const addParticipant = useMutation(api.adminTasks.addParticipant);
  const removeParticipant = useMutation(api.adminTasks.removeParticipant);
  const changeStatus = useMutation(api.adminTasks.changeStatus);
  const deferTask = useMutation(api.adminTasks.defer);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [dueKind, setDueKind] = useState<"none" | "date" | "instant">(
    task.due?.kind ?? "none",
  );
  const [dueDate, setDueDate] = useState(
    task.due?.kind === "date" ? task.due.date : "",
  );
  const [dueInstant, setDueInstant] = useState(
    task.due?.kind === "instant" ? localInputValue(task.due.at) : "",
  );
  const [participantId, setParticipantId] = useState("");
  const [deferUntil, setDeferUntil] = useState("");
  const [deferReason, setDeferReason] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availableParticipants = admins.filter(
    (admin) =>
      admin.id !== task.assigneeId &&
      !detail.participants.some(
        (participant) => participant.userId === admin.id,
      ),
  );

  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch {
      setError(dict.mutationError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-0">
      <section className="border-b border-[var(--admin-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[0.68rem] font-semibold text-[var(--admin-text-muted)]">
              {task.smkCode}
              {task.smlCode ? ` · ${task.smlCode}` : ""}
            </p>
            <h2 className="mt-1 break-words text-xl font-semibold tracking-[-0.03em]">
              {task.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
              {task.accountName}
              {task.businessName ? ` · ${task.businessName}` : ""}
            </p>
          </div>
          <AdminStatus
            label={statusLabels[task.status]}
            tone={statusTone(task.status, task.timePhase)}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--admin-text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4" aria-hidden="true" />
            {dueLabel(task)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-4" aria-hidden="true" />
            {task.assigneeName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersRound className="size-4" aria-hidden="true" />
            {task.participantCount} {dict.participantCount}
          </span>
        </div>
        {task.subjectLabel ? (
          task.subjectHref ? (
            <Link
              href={task.subjectHref}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--admin-accent-ink)] underline-offset-4 hover:underline"
            >
              {subjectLabels[task.subjectKind]} · {task.subjectLabel}
            </Link>
          ) : (
            <p className="mt-3 text-sm">
              {subjectLabels[task.subjectKind]} · {task.subjectLabel}
            </p>
          )
        ) : null}
      </section>

      <section className="grid gap-4 border-b border-[var(--admin-border)] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="task-detail-status">{dict.colStatus}</Label>
            <Select
              value={
                task.status === "deferred" ||
                task.status === "completed" ||
                task.status === "cancelled"
                  ? undefined
                  : task.status
              }
              onValueChange={(value) =>
                void run(() =>
                  changeStatus({
                    taskId: task.id,
                    commandId: commandId(),
                    status: value as "open" | "in_progress",
                  }),
                )
              }
              disabled={
                busy ||
                task.status === "deferred" ||
                task.status === "completed" ||
                task.status === "cancelled"
              }
            >
              <SelectTrigger
                id="task-detail-status"
                className="min-h-11 w-full"
              >
                <SelectValue placeholder={statusLabels[task.status]} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{dict.statusOpen}</SelectItem>
                <SelectItem value="in_progress">
                  {dict.statusInProgress}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-detail-priority">{dict.priorityLabel}</Label>
            <Select
              value={task.priority}
              onValueChange={(value) =>
                void run(() =>
                  setPriority({
                    taskId: task.id,
                    commandId: commandId(),
                    priority: value as TaskPriority,
                  }),
                )
              }
              disabled={busy}
            >
              <SelectTrigger
                id="task-detail-priority"
                className="min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(priorityLabels) as TaskPriority[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {priorityLabels[value]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="task-detail-assignee">{dict.assigneeLabel}</Label>
            <Select
              value={task.assigneeId}
              onValueChange={(value) =>
                void run(() =>
                  setAssignee({
                    taskId: task.id,
                    commandId: commandId(),
                    assigneeId: value as Id<"users">,
                  }),
                )
              }
              disabled={busy}
            >
              <SelectTrigger
                id="task-detail-assignee"
                className="min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {admins.map((admin) => (
                  <SelectItem key={admin.id} value={admin.id}>
                    {admin.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {me && me.id !== task.assigneeId ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 justify-self-start"
            disabled={busy}
            onClick={() =>
              void run(() =>
                setAssignee({
                  taskId: task.id,
                  commandId: commandId(),
                  assigneeId: me.id,
                }),
              )
            }
          >
            {dict.claim}
          </Button>
        ) : null}
      </section>

      <section className="grid gap-4 border-b border-[var(--admin-border)] p-5">
        <div className="grid gap-2">
          <Label htmlFor="task-detail-title">{dict.titleLabel}</Label>
          <Input
            id="task-detail-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={240}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="task-detail-description">
            {dict.descriptionLabel}
          </Label>
          <Textarea
            id="task-detail-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={4_000}
            rows={4}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 justify-self-start"
          disabled={busy || !title.trim()}
          onClick={() =>
            void run(() =>
              updateContent({
                taskId: task.id,
                commandId: commandId(),
                title,
                description,
              }),
            )
          }
        >
          {dict.saveContent}
        </Button>
      </section>

      <section className="grid gap-4 border-b border-[var(--admin-border)] p-5">
        <h3 className="font-semibold">{dict.colDue}</h3>
        <FormSelect
          label={dict.dueKindLabel}
          value={dueKind}
          onChange={(value) => setDueKind(value as typeof dueKind)}
        >
          <option value="none">{dict.dueNone}</option>
          <option value="date">{dict.dueDate}</option>
          <option value="instant">{dict.dueInstant}</option>
        </FormSelect>
        {dueKind === "date" ? (
          <FieldInput
            label={dict.dueDateLabel}
            type="date"
            value={dueDate}
            onChange={setDueDate}
            required
          />
        ) : null}
        {dueKind === "instant" ? (
          <FieldInput
            label={dict.dueTimeLabel}
            type="datetime-local"
            value={dueInstant}
            onChange={setDueInstant}
            required
          />
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="min-h-11 justify-self-start"
          disabled={
            busy ||
            (dueKind === "date" && !dueDate) ||
            (dueKind === "instant" && !dueInstant)
          }
          onClick={() =>
            void run(() =>
              setDue({
                taskId: task.id,
                commandId: commandId(),
                due:
                  dueKind === "date"
                    ? { kind: "date", date: dueDate }
                    : dueKind === "instant"
                      ? {
                          kind: "instant",
                          at: belgradeLocalDateTimeToUtc(dueInstant),
                        }
                      : null,
              }),
            )
          }
        >
          {dict.saveDue}
        </Button>
      </section>

      <section className="grid gap-4 border-b border-[var(--admin-border)] p-5">
        <h3 className="font-semibold">{dict.participantsLabel}</h3>
        <div className="flex flex-wrap gap-2">
          {detail.participants.map((participant) => (
            <span
              key={participant.id}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--admin-border)] px-3 text-sm"
            >
              {participant.userName}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    removeParticipant({
                      taskId: task.id,
                      commandId: commandId(),
                      participantId: participant.userId,
                    }),
                  )
                }
                className="rounded-full text-[var(--admin-text-muted)] hover:text-[var(--admin-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
                aria-label={`${dict.removeParticipant}: ${participant.userName}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {availableParticipants.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <FormSelect
              label={dict.addParticipant}
              value={participantId}
              onChange={setParticipantId}
            >
              <option value="">{dict.selectOptional}</option>
              {availableParticipants.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </FormSelect>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy || !participantId}
              onClick={() =>
                void run(async () => {
                  await addParticipant({
                    taskId: task.id,
                    commandId: commandId(),
                    participantId: participantId as Id<"users">,
                  });
                  setParticipantId("");
                })
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              {dict.addParticipant}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 border-b border-[var(--admin-border)] p-5">
        <h3 className="font-semibold">{dict.deferTitle}</h3>
        {task.status === "deferred" ? (
          <p className="rounded-xl bg-[var(--admin-warning-soft)] p-3 text-sm text-[var(--admin-warning)]">
            {task.deferredReason} ·{" "}
            {task.deferredUntil
              ? dateTimeFormatter.format(task.deferredUntil)
              : ""}
          </p>
        ) : null}
        <FieldInput
          label={dict.deferUntil}
          type="datetime-local"
          value={deferUntil}
          onChange={setDeferUntil}
          required
        />
        <div className="grid gap-2">
          <Label htmlFor="task-defer-reason">{dict.deferReason}</Label>
          <Textarea
            id="task-defer-reason"
            value={deferReason}
            onChange={(event) => setDeferReason(event.target.value)}
            placeholder={dict.deferReasonPlaceholder}
            rows={3}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 justify-self-start"
          disabled={busy || !deferUntil || !deferReason.trim()}
          onClick={() =>
            void run(() =>
              deferTask({
                taskId: task.id,
                commandId: commandId(),
                until: belgradeLocalDateTimeToUtc(deferUntil),
                reason: deferReason,
              }),
            )
          }
        >
          <Clock3 className="size-4" aria-hidden="true" />
          {dict.deferAction}
        </Button>
      </section>

      <section className="grid gap-4 border-b border-[var(--admin-border)] p-5">
        <div className="grid gap-2">
          <Label htmlFor="task-status-reason">{dict.reasonLabel}</Label>
          <Textarea
            id="task-status-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={dict.reasonPlaceholder}
            rows={2}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {task.status === "open" || task.status === "in_progress" ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  changeStatus({
                    taskId: task.id,
                    commandId: commandId(),
                    status: "completed",
                  }),
                )
              }
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {dict.completeAction}
            </Button>
          ) : null}
          {task.status === "open" || task.status === "in_progress" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 text-[var(--admin-danger)]"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void run(() =>
                  changeStatus({
                    taskId: task.id,
                    commandId: commandId(),
                    status: "cancelled",
                    reason,
                  }),
                )
              }
            >
              <CircleAlert className="size-4" aria-hidden="true" />
              {dict.cancelTaskAction}
            </Button>
          ) : null}
          {task.status === "deferred" ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void run(() =>
                  changeStatus({
                    taskId: task.id,
                    commandId: commandId(),
                    status: "open",
                    reason,
                  }),
                )
              }
            >
              {dict.resumeAction}
            </Button>
          ) : null}
          {task.status === "completed" || task.status === "cancelled" ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void run(() =>
                  changeStatus({
                    taskId: task.id,
                    commandId: commandId(),
                    status: "open",
                    reason,
                  }),
                )
              }
            >
              {dict.reopenAction}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-[var(--admin-danger)]">
            {error}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 p-5">
        <h3 className="font-semibold">{dict.historyTitle}</h3>
        {history.status === "LoadingFirstPage" ? (
          <AdminLoadingState compact />
        ) : history.results.length === 0 ? (
          <p className="text-sm text-[var(--admin-text-muted)]">
            {dict.historyEmpty}
          </p>
        ) : (
          <ol className="grid gap-3 border-l border-[var(--admin-border)] pl-4">
            {history.results.map((event) => (
              <li
                key={event.id}
                className="relative text-sm before:absolute before:-left-[1.27rem] before:top-1.5 before:size-2 before:rounded-full before:bg-[var(--admin-accent)]"
              >
                <p className="font-medium">
                  {event.actorName} ·{" "}
                  {event.field === "status"
                    ? dict.colStatus
                    : event.field === "priority"
                      ? dict.priorityLabel
                      : event.field === "due"
                        ? dict.colDue
                        : event.field === "assignee"
                          ? dict.assigneeLabel
                          : event.field === "participant"
                            ? dict.participantsLabel
                            : event.field === "subject"
                              ? dict.subjectLabel
                              : event.field === "deferral"
                                ? dict.deferTitle
                                : event.field === "content"
                                  ? dict.descriptionLabel
                                  : dict.detailTitle}
                </p>
                <p className="mt-1 break-words text-xs text-[var(--admin-text-muted)]">
                  {event.before ? `${event.before} → ` : ""}
                  {event.after ?? ""}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
                <time
                  className="mt-1 block text-[0.68rem] text-[var(--admin-text-muted)]"
                  dateTime={new Date(event.createdAt).toISOString()}
                >
                  {dateTimeFormatter.format(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
        {history.status === "CanLoadMore" ||
        history.status === "LoadingMore" ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 justify-self-start"
            disabled={history.status === "LoadingMore"}
            onClick={() => history.loadMore(20)}
          >
            {dict.historyLoadMore}
          </Button>
        ) : null}
      </section>
    </div>
  );
}

export class AdminTasksErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <AdminPanel>
          <AdminErrorState title={dict.errorTitle} body={dict.errorBody} />
        </AdminPanel>
      );
    return this.props.children;
  }
}

const previewAdmins = [
  {
    id: "preview-admin-teodora" as Id<"users">,
    name: "Teodora",
    email: "teodora@example.invalid",
  },
  {
    id: "preview-admin-jovan" as Id<"users">,
    name: "Jovan",
    email: "jovan@example.invalid",
  },
  {
    id: "preview-admin-aleksa" as Id<"users">,
    name: "Aleksa",
    email: "aleksa@example.invalid",
  },
];

const previewAccounts = [
  {
    id: "preview-account-most" as Id<"accounts">,
    name: "Bistro Most",
    smkCode: "SMK-MOS-001",
  },
  {
    id: "preview-account-vrbak" as Id<"accounts">,
    name: "Hotel Vrbak",
    smkCode: "SMK-VRB-014",
  },
  {
    id: "preview-account-piano" as Id<"accounts">,
    name: "Kafić Piano",
    smkCode: "SMK-PIA-008",
  },
];

function previewTask(index: number, overrides: Partial<TaskItem>): TaskItem {
  return {
    id: `preview-task-${index}` as Id<"clientTasks">,
    accountId: previewAccounts[index % previewAccounts.length].id,
    accountName: previewAccounts[index % previewAccounts.length].name,
    smkCode: previewAccounts[index % previewAccounts.length].smkCode,
    contactId: null,
    contactName: null,
    businessId: `preview-business-${index}` as Id<"businesses">,
    businessName: index % 2 ? "Centar" : "Dorćol",
    smlCode: `SML-00${index + 1}`,
    conversationId: null,
    subject: null,
    subjectKind: "venue",
    subjectLabel: index % 2 ? "Centar" : "Dorćol",
    subjectHref: null,
    title: "Proveri dogovor sa klijentom",
    description: "Potvrditi sledeći korak i zabeležiti ishod razgovora.",
    assigneeId: previewAdmins[index % previewAdmins.length].id,
    assigneeName: previewAdmins[index % previewAdmins.length].name,
    participantCount: index % 2,
    priority: "normal",
    due: { kind: "date", date: "2026-09-12" },
    timePhase: "future",
    status: "open",
    deferredUntil: null,
    deferredReason: null,
    createdAt: Date.parse("2026-09-10T10:00:00Z"),
    updatedAt: Date.parse("2026-09-11T10:00:00Z"),
    ...overrides,
  };
}

const initialPreviewTasks: TaskItem[] = [
  previewTask(0, {
    title: "Pozovi zbog grace perioda",
    priority: "urgent",
    timePhase: "today",
    due: { kind: "date", date: "2026-09-11" },
  }),
  previewTask(1, {
    title: "Proveri neispravan QR",
    priority: "high",
    timePhase: "overdue",
    due: { kind: "instant", at: Date.parse("2026-09-11T08:00:00Z") },
  }),
  previewTask(2, {
    title: "Potvrdi prijem kartica",
    priority: "normal",
    timePhase: "today",
    due: { kind: "date", date: "2026-09-11" },
    status: "in_progress",
  }),
  previewTask(3, {
    title: "Pošalji ponudu za dopunu",
    status: "deferred",
    deferredUntil: Date.parse("2026-09-13T08:00:00Z"),
    deferredReason: "Čekamo odluku klijenta.",
  }),
  previewTask(4, {
    title: "Uskladi dizajn kartice",
    status: "completed",
    timePhase: "none",
    due: null,
  }),
];

export function AdminTasksPreview() {
  const [rows, setRows] = useState(initialPreviewTasks);
  const [tab, setTab] = useState<TaskTab>("all");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [account, setAccount] = useState("all");
  const [business, setBusiness] = useState("all");
  const [subject, setSubject] = useState<SubjectKind | "all">("all");
  const [selectedId, setSelectedId] = useState<Id<"clientTasks"> | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = rows.find((task) => task.id === selectedId) ?? null;
  const visible = useMemo(
    () =>
      rows.filter((task) => {
        if (
          tab === "all" &&
          (task.status === "deferred" ||
            task.status === "completed" ||
            task.status === "cancelled")
        )
          return false;
        if (tab === "today" && task.timePhase !== "today") return false;
        if (tab === "overdue" && task.timePhase !== "overdue") return false;
        if (tab === "deferred" && task.status !== "deferred") return false;
        if (
          tab === "completed" &&
          task.status !== "completed" &&
          task.status !== "cancelled"
        )
          return false;
        if (assignee !== "all" && task.assigneeId !== assignee) return false;
        if (account !== "all" && task.accountId !== account) return false;
        if (subject !== "all" && task.subjectKind !== subject) return false;
        const needle = search.trim().toLocaleLowerCase("sr-Latn-RS");
        return (
          !needle ||
          `${task.accountName} ${task.smkCode} ${task.businessName} ${task.smlCode} ${task.title}`
            .toLocaleLowerCase("sr-Latn-RS")
            .includes(needle)
        );
      }),
    [rows, tab, assignee, account, subject, search],
  );
  const updateSelected = (patch: Partial<TaskItem>) => {
    if (!selectedId) return;
    setRows((current) =>
      current.map((task) =>
        task.id === selectedId ? { ...task, ...patch } : task,
      ),
    );
  };
  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <AdminStatus label={dict.previewBadge} tone="waiting" />
        <p className="text-xs text-[var(--admin-text-muted)]">
          {dict.previewDescription}
        </p>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(2.1rem,4vw,3.75rem)] leading-none font-medium tracking-[-0.05em]">
            {dict.pageTitle}
          </h1>
          <p className="mt-2 text-sm text-[var(--admin-text-muted)] sm:text-base">
            {dict.pageSubtitle}
          </p>
        </div>
        <Button
          type="button"
          className="min-h-11 rounded-full px-5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          {dict.createAction}
        </Button>
      </header>
      <Filters
        tab={tab}
        search={search}
        assignee={assignee}
        account={account}
        business={business}
        subject={subject}
        admins={previewAdmins}
        accounts={previewAccounts}
        venues={[]}
        onTab={setTab}
        onSearch={setSearch}
        onAssignee={setAssignee}
        onAccount={setAccount}
        onBusiness={setBusiness}
        onSubject={setSubject}
      />
      {visible.length ? (
        <TaskList rows={visible} onSelect={setSelectedId} />
      ) : (
        <AdminPanel>
          <AdminEmptyState
            title={dict.noResultsTitle}
            body={dict.noResultsBody}
          />
        </AdminPanel>
      )}
      <PreviewCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(title) => {
          const next = previewTask(rows.length + 1, {
            title,
            accountId: previewAccounts[0].id,
            accountName: previewAccounts[0].name,
            smkCode: previewAccounts[0].smkCode,
            assigneeId: previewAdmins[0].id,
            assigneeName: previewAdmins[0].name,
          });
          setRows((current) => [next, ...current]);
          setCreateOpen(false);
          setSelectedId(next.id);
        }}
      />
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          side="right"
          className="admin-v1 w-full max-w-none overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 sm:max-w-xl motion-reduce:duration-0"
        >
          <SheetHeader className="border-b border-[var(--admin-border)] p-5 pr-14 text-left">
            <SheetTitle>{dict.detailTitle}</SheetTitle>
            <SheetDescription>{dict.detailDescription}</SheetDescription>
          </SheetHeader>
          {selected ? (
            <PreviewDetail
              task={selected}
              admins={previewAdmins}
              onChange={updateSelected}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PreviewCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-v1 border-[var(--admin-border)] bg-[var(--admin-surface-strong)] motion-reduce:duration-0">
        <DialogHeader>
          <DialogTitle>{dict.createTitle}</DialogTitle>
          <DialogDescription>{dict.createDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormSelect
            label={dict.clientLabel}
            value={previewAccounts[0].id}
            onChange={() => undefined}
          >
            <option value={previewAccounts[0].id}>
              {previewAccounts[0].name} · {previewAccounts[0].smkCode}
            </option>
          </FormSelect>
          <FormSelect
            label={dict.assigneeLabel}
            value={previewAdmins[0].id}
            onChange={() => undefined}
          >
            <option value={previewAdmins[0].id}>{previewAdmins[0].name}</option>
          </FormSelect>
          <div className="grid gap-2">
            <Label htmlFor="preview-task-title">{dict.titleLabel}</Label>
            <Input
              id="preview-task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={dict.titlePlaceholder}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {dict.cancel}
          </Button>
          <Button
            type="button"
            disabled={!title.trim()}
            onClick={() => {
              onCreate(title.trim());
              setTitle("");
            }}
          >
            {dict.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDetail({
  task,
  admins,
  onChange,
}: {
  task: TaskItem;
  admins: AdminOption[];
  onChange: (patch: Partial<TaskItem>) => void;
}) {
  const [reason, setReason] = useState("Čeka se potvrda klijenta.");
  const [until, setUntil] = useState("2099-01-01T12:00");
  return (
    <div className="grid gap-0">
      <section className="border-b border-[var(--admin-border)] p-5">
        <p className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">
          {task.smkCode} · {task.smlCode}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{task.title}</h2>
        <p className="mt-2 text-sm text-[var(--admin-text-muted)]">
          {task.accountName} · {task.businessName}
        </p>
        <div className="mt-4">
          <AdminStatus
            label={statusLabels[task.status]}
            tone={statusTone(task.status, task.timePhase)}
          />
        </div>
      </section>
      <section className="grid gap-4 border-b border-[var(--admin-border)] p-5">
        <FormSelect
          label={dict.assigneeLabel}
          value={task.assigneeId}
          onChange={(value) => {
            const admin = admins.find((item) => item.id === value)!;
            onChange({ assigneeId: admin.id, assigneeName: admin.name });
          }}
        >
          {admins.map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.name}
            </option>
          ))}
        </FormSelect>
        <FormSelect
          label={dict.priorityLabel}
          value={task.priority}
          onChange={(value) => onChange({ priority: value as TaskPriority })}
        >
          {(Object.keys(priorityLabels) as TaskPriority[]).map((value) => (
            <option key={value} value={value}>
              {priorityLabels[value]}
            </option>
          ))}
        </FormSelect>
      </section>
      <section className="grid gap-4 border-b border-[var(--admin-border)] p-5">
        <h3 className="font-semibold">{dict.deferTitle}</h3>
        <FieldInput
          label={dict.deferUntil}
          type="datetime-local"
          value={until}
          onChange={setUntil}
        />
        <div className="grid gap-2">
          <Label htmlFor="preview-defer-reason">{dict.deferReason}</Label>
          <Textarea
            id="preview-defer-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={dict.deferReasonPlaceholder}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 justify-self-start"
          disabled={!until || !reason.trim()}
          onClick={() =>
            onChange({
              status: "deferred",
              deferredUntil: belgradeLocalDateTimeToUtc(until),
              deferredReason: reason,
            })
          }
        >
          {dict.deferAction}
        </Button>
      </section>
      <section className="flex flex-wrap gap-2 p-5">
        {task.status === "completed" || task.status === "cancelled" ? (
          <Button
            type="button"
            className="min-h-11"
            onClick={() => onChange({ status: "open" })}
          >
            {dict.reopenAction}
          </Button>
        ) : (
          <Button
            type="button"
            className="min-h-11"
            onClick={() => onChange({ status: "completed", timePhase: "none" })}
          >
            {dict.completeAction}
          </Button>
        )}
      </section>
    </div>
  );
}
