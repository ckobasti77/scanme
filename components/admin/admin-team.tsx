"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ListTodo,
  MessageSquareText,
} from "lucide-react";
import Link from "next/link";
import { Component, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { adminTeamSr as dict } from "@/lib/i18n/sr/admin-team";
import { adminTasksSr as taskDict } from "@/lib/i18n/sr/admin-tasks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPanel,
  AdminStatus,
} from "./admin-primitives";
import { AdminDataView, type AdminColumn } from "./admin-ui";

type TeamMember = FunctionReturnType<
  typeof api.adminTasks.teamOverview
>[number];
type TeamTask = FunctionReturnType<typeof api.adminTasks.list>["page"][number];
type TeamConversation = FunctionReturnType<
  typeof api.adminCommunications.listInbox
>["page"][number];
type AdminOption = FunctionReturnType<typeof api.adminTasks.listAdmins>[number];

const statusLabels: Record<TeamTask["status"], string> = {
  open: taskDict.statusOpen,
  in_progress: taskDict.statusInProgress,
  deferred: taskDict.statusDeferred,
  completed: taskDict.statusCompleted,
  cancelled: taskDict.statusCancelled,
};

function commandId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `team-${Date.now()}-${Math.random()}`
  );
}

function TeamCard({
  member,
  selected,
  onSelect,
}: {
  member: TeamMember;
  selected: boolean;
  onSelect: () => void;
}) {
  const initial = member.name.trim().charAt(0).toUpperCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "min-h-11 rounded-[var(--admin-radius-panel)] border bg-[var(--admin-surface)] p-5 text-left shadow-[var(--admin-shadow-xs)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] motion-reduce:transition-none",
        selected
          ? "border-[var(--admin-accent)]"
          : "border-[var(--admin-border)] hover:border-[var(--admin-accent-border)]",
      )}
    >
      <span className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--admin-surface-muted)] text-lg font-semibold">
          {initial}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-lg">{member.name}</strong>
          <span className="block truncate text-xs text-[var(--admin-text-muted)]">
            {member.email}
          </span>
        </span>
      </span>
      <span className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={dict.openTasks}
          value={member.openTasks}
          icon={ListTodo}
        />
        <Metric
          label={dict.overdueTasks}
          value={member.overdueTasks}
          icon={AlertTriangle}
          problem={member.overdueTasks > 0}
        />
        <Metric
          label={dict.conversations}
          value={member.assignedConversations}
          icon={MessageSquareText}
        />
        <Metric
          label={dict.awaitingReaction}
          value={member.awaitingReaction}
          icon={CheckCircle2}
          problem={member.awaitingReaction > 0}
        />
      </span>
      {member.countsCapped ? (
        <span className="mt-3 block text-[0.68rem] text-[var(--admin-text-muted)]">
          {dict.countCapped}
        </span>
      ) : null}
    </button>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  problem = false,
}: {
  label: string;
  value: number;
  icon: typeof ListTodo;
  problem?: boolean;
}) {
  return (
    <span className="min-w-0">
      <span className="flex items-center gap-1.5 text-[0.68rem] text-[var(--admin-text-muted)]">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </span>
      <strong
        className={cn(
          "mt-1 block font-mono text-xl tabular-nums",
          problem && "text-[var(--admin-danger)]",
        )}
      >
        {value}
      </strong>
    </span>
  );
}

function MemberPicker({
  members,
  selectedId,
  onChange,
}: {
  members: TeamMember[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-[var(--admin-text-muted)]">
      {dict.selectMember}
      <select
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm text-[var(--admin-text)] outline-none focus:ring-2 focus:ring-[var(--admin-focus)]"
      >
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function TaskRows({
  rows,
  admins,
  meId,
  onAssign,
}: {
  rows: TeamTask[];
  admins: AdminOption[];
  meId: Id<"users"> | null;
  onAssign: (taskId: Id<"clientTasks">, adminId: Id<"users">) => void;
}) {
  if (!rows.length)
    return (
      <AdminEmptyState
        title={dict.noTasks}
        body={taskDict.emptyBody}
        className="min-h-44"
      />
    );
  const taskStatus = (task: TeamTask) => (
    <AdminStatus
      label={statusLabels[task.status]}
      tone={
        task.timePhase === "overdue"
          ? "problem"
          : task.status === "in_progress"
            ? "waiting"
            : "active"
      }
    />
  );
  const columns: AdminColumn<TeamTask>[] = [
    {
      id: "task",
      header: taskDict.colTask,
      rowHeader: true,
      sortValue: (task) => task.title,
      cell: (task) => (
        <>
          <strong className="block break-words text-sm font-semibold">{task.title}</strong>
          <span className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">
            {task.smkCode}
            {task.smlCode ? ` · ${task.smlCode}` : ""}
          </span>
        </>
      ),
    },
    {
      id: "client",
      header: taskDict.colClient,
      sortValue: (task) => task.accountName,
      cell: (task) => (
        <span className="text-xs text-[var(--admin-text-muted)]">
          {task.accountName}
          {task.businessName ? ` · ${task.businessName}` : ""}
        </span>
      ),
    },
    { id: "status", header: taskDict.colStatus, sortValue: (task) => statusLabels[task.status], cell: taskStatus },
    { id: "assignee", header: taskDict.colAssignee, sortValue: (task) => task.assigneeName, cell: (task) => task.assigneeName },
  ];
  return (
    <div className="p-4 sm:p-5">
      <AdminDataView
        listKey="tim.zadaci"
        caption={dict.tasksTitle}
        rows={rows}
        getRowId={(task) => task.id}
        columns={columns}
        tableClassName="min-w-[52rem]"
        renderCard={(task) => (
          <div className="min-w-0">
            <span className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">
              {task.smkCode}
              {task.smlCode ? ` · ${task.smlCode}` : ""}
            </span>
            <h3 className="mt-1 break-words text-sm font-semibold">
              {task.title}
            </h3>
            <p className="mt-1 text-xs text-[var(--admin-text-muted)]">
              {task.accountName}
              {task.businessName ? ` · ${task.businessName}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {taskStatus(task)}
              <span className="text-xs text-[var(--admin-text-muted)]">
                {task.assigneeName}
              </span>
            </div>
          </div>
        )}
        rowActions={(task) => (
          <>
            {meId && task.assigneeId !== meId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => onAssign(task.id, meId)}
              >
                {dict.claim}
              </Button>
            ) : null}
            <select
              aria-label={`${dict.reassign}: ${task.title}`}
              value={task.assigneeId}
              onChange={(event) =>
                onAssign(task.id, event.target.value as Id<"users">)
              }
              className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--admin-focus)]"
            >
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </select>
            <Link
              href={`/admin/zadaci?task=${task.id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--admin-border)] px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              <span className="sr-only">{taskDict.openDetail}</span>
            </Link>
          </>
        )}
      />
    </div>
  );
}

function ConversationRows({
  rows,
  admins,
  meId,
  onAssign,
}: {
  rows: TeamConversation[];
  admins: AdminOption[];
  meId: Id<"users"> | null;
  onAssign: (conversationId: Id<"conversations">, adminId: Id<"users">) => void;
}) {
  if (!rows.length)
    return (
      <AdminEmptyState
        title={dict.noConversations}
        body={dict.pageSubtitle}
        className="min-h-44"
      />
    );
  const columns: AdminColumn<TeamConversation>[] = [
    {
      id: "client",
      header: taskDict.colClient,
      rowHeader: true,
      sortValue: (conversation) => conversation.accountName,
      cell: (conversation) => (
        <>
          <strong className="block text-sm font-semibold">{conversation.accountName}</strong>
          <span className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">{conversation.smkCode}</span>
        </>
      ),
    },
    {
      id: "message",
      header: dict.colLatestMessage,
      cell: (conversation) => (
        <span className="line-clamp-2 break-words text-sm text-[var(--admin-text-muted)]">
          {conversation.latestMessagePreview}
        </span>
      ),
    },
  ];
  return (
    <div className="p-4 sm:p-5">
      <AdminDataView
        listKey="tim.razgovori"
        caption={dict.conversationsTitle}
        rows={rows}
        getRowId={(conversation) => conversation.id}
        columns={columns}
        tableClassName="min-w-[48rem]"
        renderCard={(conversation) => (
          <div className="min-w-0">
            <span className="font-mono text-[0.68rem] text-[var(--admin-text-muted)]">
              {conversation.smkCode}
            </span>
            <h3 className="mt-1 text-sm font-semibold">
              {conversation.accountName}
            </h3>
            <p className="mt-1 line-clamp-2 break-words text-sm text-[var(--admin-text-muted)]">
              {conversation.latestMessagePreview}
            </p>
          </div>
        )}
        rowActions={(conversation) => (
          <>
            {meId && conversation.assigneeAdminId !== meId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => onAssign(conversation.id, meId)}
              >
                {dict.claim}
              </Button>
            ) : null}
            <select
              aria-label={`${dict.reassign}: ${conversation.accountName}`}
              value={conversation.assigneeAdminId ?? ""}
              onChange={(event) =>
                onAssign(conversation.id, event.target.value as Id<"users">)
              }
              className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--admin-focus)]"
            >
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </select>
            <Link
              href={`/admin/inbox?conversation=${conversation.id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--admin-border)] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              <span className="sr-only">{dict.openAllConversations}</span>
            </Link>
          </>
        )}
      />
    </div>
  );
}

export function AdminTeamWorkspace() {
  const members = useQuery(api.adminTasks.teamOverview);
  const admins = useQuery(api.adminTasks.listAdmins) ?? [];
  const me = useQuery(api.adminCommunications.me);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const effectiveSelectedId = selectedId || members?.[0]?.id || "";
  const tasks = usePaginatedQuery(
    api.adminTasks.list,
    effectiveSelectedId
      ? { tab: "all", assigneeId: effectiveSelectedId as Id<"users"> }
      : "skip",
    { initialNumItems: 20 },
  );
  const conversations = usePaginatedQuery(
    api.adminCommunications.listInbox,
    effectiveSelectedId
      ? { assignee: effectiveSelectedId as Id<"users"> }
      : "skip",
    { initialNumItems: 20 },
  );
  const setTaskAssignee = useMutation(api.adminTasks.setAssignee);
  const setConversationAssignee = useMutation(
    api.adminCommunications.setAssignee,
  );
  async function assignTask(taskId: Id<"clientTasks">, adminId: Id<"users">) {
    setError("");
    try {
      await setTaskAssignee({
        taskId,
        commandId: commandId(),
        assigneeId: adminId,
      });
    } catch {
      setError(taskDict.mutationError);
    }
  }
  async function assignConversation(
    conversationId: Id<"conversations">,
    adminId: Id<"users">,
  ) {
    setError("");
    try {
      await setConversationAssignee({
        conversationId,
        assigneeAdminId: adminId,
      });
    } catch {
      setError(taskDict.mutationError);
    }
  }
  if (members === undefined)
    return (
      <AdminPanel>
        <AdminLoadingState label={dict.loading} />
      </AdminPanel>
    );
  return (
    <TeamView
      members={members}
      admins={admins}
      selectedId={effectiveSelectedId}
      onSelectedId={setSelectedId}
      tasks={tasks.results}
      tasksLoading={tasks.status === "LoadingFirstPage"}
      conversations={conversations.results}
      conversationsLoading={conversations.status === "LoadingFirstPage"}
      meId={me?.id ?? null}
      error={error}
      onAssignTask={(taskId, adminId) => void assignTask(taskId, adminId)}
      onAssignConversation={(conversationId, adminId) =>
        void assignConversation(conversationId, adminId)
      }
    />
  );
}

function TeamView({
  members,
  admins,
  selectedId,
  onSelectedId,
  tasks,
  tasksLoading,
  conversations,
  conversationsLoading,
  meId,
  error,
  onAssignTask,
  onAssignConversation,
  preview = false,
  initialTab = "overview",
}: {
  members: TeamMember[];
  admins: AdminOption[];
  selectedId: string;
  onSelectedId: (id: string) => void;
  tasks: TeamTask[];
  tasksLoading: boolean;
  conversations: TeamConversation[];
  conversationsLoading: boolean;
  meId: Id<"users"> | null;
  error: string;
  onAssignTask: (taskId: Id<"clientTasks">, adminId: Id<"users">) => void;
  onAssignConversation: (
    conversationId: Id<"conversations">,
    adminId: Id<"users">,
  ) => void;
  preview?: boolean;
  /** Dev preview `?tab=`: `tasks` or `conversations` shows that list first. */
  initialTab?: "overview" | "tasks" | "conversations";
}) {
  return (
    <div className="grid gap-5 sm:gap-6">
      {preview ? (
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatus label={dict.previewBadge} tone="waiting" />
          <p className="text-xs text-[var(--admin-text-muted)]">
            {dict.previewDescription}
          </p>
        </div>
      ) : null}
      <header>
        <h1 className="text-[clamp(2.1rem,4vw,3.75rem)] leading-none font-medium tracking-[-0.05em]">
          {dict.pageTitle}
        </h1>
        <p className="mt-2 text-sm text-[var(--admin-text-muted)] sm:text-base">
          {dict.pageSubtitle}
        </p>
      </header>
      {members.length ? (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            {members.map((member) => (
              <TeamCard
                key={member.id}
                member={member}
                selected={selectedId === member.id}
                onSelect={() => onSelectedId(member.id)}
              />
            ))}
          </div>
          <Tabs defaultValue={initialTab} className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--admin-border)] pb-3">
              <TabsList className="h-auto min-h-11 max-w-full rounded-full bg-[var(--admin-surface-muted)] p-1">
                <TabsTrigger
                  value="overview"
                  className="min-h-9 rounded-full px-4 data-[state=active]:bg-[var(--admin-nav-active)] data-[state=active]:text-white"
                >
                  {dict.tabOverview}
                </TabsTrigger>
                <TabsTrigger
                  value="tasks"
                  className="min-h-9 rounded-full px-4 data-[state=active]:bg-[var(--admin-nav-active)] data-[state=active]:text-white"
                >
                  {dict.tabTasks}
                </TabsTrigger>
                <TabsTrigger
                  value="conversations"
                  className="min-h-9 rounded-full px-4 data-[state=active]:bg-[var(--admin-nav-active)] data-[state=active]:text-white"
                >
                  {dict.tabConversations}
                </TabsTrigger>
              </TabsList>
              <MemberPicker
                members={members}
                selectedId={selectedId}
                onChange={onSelectedId}
              />
            </div>
            <TabsContent value="overview">
              <AdminPanel className="p-5 sm:p-6">
                <h2 className="text-xl font-semibold">
                  {members.find((member) => member.id === selectedId)?.name}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)]">
                  {dict.pageSubtitle}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={`/admin/zadaci?assignee=${selectedId}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--admin-border)] px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
                  >
                    {dict.openAllTasks}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href={`/admin/inbox?assignee=${selectedId}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--admin-border)] px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
                  >
                    {dict.openAllConversations}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </AdminPanel>
            </TabsContent>
            <TabsContent value="tasks">
              <AdminPanel className="overflow-hidden">
                <div className="border-b border-[var(--admin-border)] p-4 sm:p-5">
                  <h2 className="text-xl font-semibold">{dict.tasksTitle}</h2>
                </div>
                {tasksLoading ? (
                  <AdminLoadingState />
                ) : (
                  <TaskRows
                    rows={tasks}
                    admins={admins}
                    meId={meId}
                    onAssign={onAssignTask}
                  />
                )}
              </AdminPanel>
            </TabsContent>
            <TabsContent value="conversations">
              <AdminPanel className="overflow-hidden">
                <div className="border-b border-[var(--admin-border)] p-4 sm:p-5">
                  <h2 className="text-xl font-semibold">
                    {dict.conversationsTitle}
                  </h2>
                </div>
                {conversationsLoading ? (
                  <AdminLoadingState />
                ) : (
                  <ConversationRows
                    rows={conversations}
                    admins={admins}
                    meId={meId}
                    onAssign={onAssignConversation}
                  />
                )}
              </AdminPanel>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <AdminPanel>
          <AdminEmptyState title={dict.pageTitle} body={dict.pageSubtitle} />
        </AdminPanel>
      )}
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AdminTeamPreview({ tab }: { tab?: string } = {}) {
  const members = [
    {
      id: "preview-admin-teodora" as Id<"users">,
      name: "Teodora",
      email: "teodora@example.invalid",
      openTasks: 6,
      overdueTasks: 2,
      assignedConversations: 9,
      awaitingReaction: 4,
      countsCapped: false,
    },
    {
      id: "preview-admin-jovan" as Id<"users">,
      name: "Jovan",
      email: "jovan@example.invalid",
      openTasks: 5,
      overdueTasks: 1,
      assignedConversations: 8,
      awaitingReaction: 2,
      countsCapped: false,
    },
    {
      id: "preview-admin-aleksa" as Id<"users">,
      name: "Aleksa",
      email: "aleksa@example.invalid",
      openTasks: 8,
      overdueTasks: 3,
      assignedConversations: 12,
      awaitingReaction: 5,
      countsCapped: false,
    },
  ];
  const admins = members.map(({ id, name, email }) => ({ id, name, email }));
  const [selectedId, setSelectedId] = useState<string>(members[0].id);
  const [tasks, setTasks] = useState<TeamTask[]>([
    {
      id: "preview-team-task-1" as Id<"clientTasks">,
      accountId: "preview-account-1" as Id<"accounts">,
      accountName: "Bistro Most",
      smkCode: "SMK-MOS-001",
      contactId: null,
      contactName: null,
      businessId: null,
      businessName: "Dorćol",
      smlCode: "SML-MOS-001",
      conversationId: null,
      subject: null,
      subjectKind: "venue",
      subjectLabel: "Dorćol",
      subjectHref: null,
      title: "Pozovi zbog grace perioda",
      description: "",
      assigneeId: members[0].id,
      assigneeName: members[0].name,
      participantCount: 0,
      priority: "urgent",
      due: { kind: "date", date: "2026-09-11" },
      timePhase: "today",
      status: "open",
      deferredUntil: null,
      deferredReason: null,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "preview-team-task-2" as Id<"clientTasks">,
      accountId: "preview-account-2" as Id<"accounts">,
      accountName: "Hotel Vrbak",
      smkCode: "SMK-VRB-014",
      contactId: null,
      contactName: null,
      businessId: null,
      businessName: "Zlatibor",
      smlCode: "SML-VRB-002",
      conversationId: null,
      subject: null,
      subjectKind: "venue",
      subjectLabel: "Zlatibor",
      subjectHref: null,
      title: "Potvrdi prijem kartica",
      description: "",
      assigneeId: members[1].id,
      assigneeName: members[1].name,
      participantCount: 0,
      priority: "high",
      due: { kind: "instant", at: Date.parse("2026-09-11T08:00:00Z") },
      timePhase: "overdue",
      status: "in_progress",
      deferredUntil: null,
      deferredReason: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ]);
  const [conversations, setConversations] = useState<TeamConversation[]>([
    {
      id: "preview-conversation-1" as Id<"conversations">,
      accountId: "preview-account-1" as Id<"accounts">,
      accountName: "Bistro Most",
      smkCode: "SMK-MOS-001",
      contactId: "preview-contact-1" as Id<"accountContacts">,
      contactName: "Mina Most",
      contactEmail: null,
      contactPhone: null,
      businessId: null,
      businessName: "Dorćol",
      channel: "panel_chat" as const,
      status: "needs_reply" as const,
      assigneeAdminId: members[0].id,
      assigneeName: members[0].name,
      latestMessagePreview: "Da li kartice stižu ove nedelje?",
      latestMessageAt: Date.parse("2026-09-11T10:00:00Z"),
      latestMessageAuthorName: "Mina Most",
      adminUnreadCount: 1,
    },
  ]);
  const filteredTasks = tasks.filter((task) => task.assigneeId === selectedId);
  const filteredConversations = conversations.filter(
    (conversation) => conversation.assigneeAdminId === selectedId,
  );
  const assignTask = (taskId: Id<"clientTasks">, adminId: Id<"users">) => {
    const admin = admins.find((item) => item.id === adminId)!;
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, assigneeId: admin.id, assigneeName: admin.name }
          : task,
      ),
    );
  };
  const assignConversation = (
    conversationId: Id<"conversations">,
    adminId: Id<"users">,
  ) => {
    const admin = admins.find((item) => item.id === adminId)!;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              assigneeAdminId: admin.id,
              assigneeName: admin.name,
            }
          : conversation,
      ),
    );
  };
  return (
    <TeamView
      members={members}
      admins={admins}
      selectedId={selectedId}
      onSelectedId={setSelectedId}
      tasks={filteredTasks}
      tasksLoading={false}
      conversations={filteredConversations}
      conversationsLoading={false}
      meId={members[0].id}
      error=""
      onAssignTask={assignTask}
      onAssignConversation={assignConversation}
      preview
      initialTab={tab === "tasks" || tab === "conversations" ? tab : "overview"}
    />
  );
}

export class AdminTeamErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <AdminPanel>
        <AdminErrorState title={dict.errorTitle} body={dict.errorBody} onRetry={() => window.location.reload()} />
      </AdminPanel>
    ) : (
      this.props.children
    );
  }
}
