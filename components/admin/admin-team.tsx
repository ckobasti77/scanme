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
import { Component, useMemo, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  teamMemberName,
  teamSelection,
  teamSidebarLive,
  type TeamTab,
} from "@/lib/admin-v2/lists/team";
import { taskStatusTone } from "@/lib/admin-v2/lists/tasks";
import { TEAM_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/pages";
import { adminTeamSr as dict } from "@/lib/i18n/sr/admin-team";
import { adminTasksSr as taskDict } from "@/lib/i18n/sr/admin-tasks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { useAdminUrlState } from "@/components/admin/admin-ui/use-admin-query-state";
import { AdminPageHeader } from "@/components/admin/frame/admin-page-header";
import { useAdminSidebarLive } from "@/components/admin/frame/admin-sidebar-store";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPanel,
  AdminStatus,
} from "./admin-primitives";

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

/** „Pregled“ shows only the first few rows of each list. */
const OVERVIEW_ROWS = 3;

function commandId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `team-${Date.now()}-${Math.random()}`
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
  return (
    <div className="divide-y divide-[var(--admin-border)]">
      {rows.map((task) => (
        <article
          key={task.id}
          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
        >
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
              <AdminStatus
                label={statusLabels[task.status]}
                tone={taskStatusTone(task.status, task.timePhase)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
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
          </div>
        </article>
      ))}
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
        body={dict.noConversationsBody}
        className="min-h-44"
      />
    );
  return (
    <div className="divide-y divide-[var(--admin-border)]">
      {rows.map((conversation) => (
        <article
          key={conversation.id}
          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
        >
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
          <div className="flex flex-wrap gap-2 sm:justify-end">
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
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminTeamWorkspace() {
  const members = useQuery(api.adminTasks.teamOverview);
  const admins = useQuery(api.adminTasks.listAdmins) ?? [];
  const me = useQuery(api.adminCommunications.me);
  const [state, setState] = useAdminUrlState(TEAM_URL_FIELDS);
  const [error, setError] = useState("");
  const { memberId, tab } = teamSelection(state, members ?? []);
  const sidebar = useMemo(
    () =>
      members?.length
        ? teamSidebarLive(members, memberId, (clan) => setState({ clan }))
        : null,
    [members, memberId, setState],
  );
  useAdminSidebarLive(sidebar);
  const tasks = usePaginatedQuery(
    api.adminTasks.list,
    memberId ? { tab: "all", assigneeId: memberId as Id<"users"> } : "skip",
    { initialNumItems: 20 },
  );
  const conversations = usePaginatedQuery(
    api.adminCommunications.listInbox,
    memberId ? { assignee: memberId as Id<"users"> } : "skip",
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
      selectedId={memberId}
      tab={tab}
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

function TeamSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <AdminPanel className="overflow-hidden">
      <div className="border-b border-[var(--admin-border)] p-4 sm:p-5">
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      {children}
    </AdminPanel>
  );
}

function TeamView({
  members,
  admins,
  selectedId,
  tab,
  tasks,
  tasksLoading,
  conversations,
  conversationsLoading,
  meId,
  error,
  onAssignTask,
  onAssignConversation,
  preview = false,
}: {
  members: TeamMember[];
  admins: AdminOption[];
  selectedId: string;
  tab: TeamTab;
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
}) {
  const member = members.find((item) => item.id === selectedId);
  const badge = preview ? (
    <AdminStatus label={dict.previewBadge} tone="waiting" />
  ) : undefined;
  if (!member)
    return (
      <div className="grid gap-5 sm:gap-6">
        <AdminPageHeader
          title={dict.pageTitle}
          description={dict.pageSubtitle}
          badge={badge}
        />
        <AdminPanel>
          <AdminEmptyState />
        </AdminPanel>
      </div>
    );
  const taskRows = (rows: TeamTask[]) =>
    tasksLoading ? (
      <AdminLoadingState />
    ) : (
      <TaskRows
        rows={rows}
        admins={admins}
        meId={meId}
        onAssign={onAssignTask}
      />
    );
  const conversationRows = (rows: TeamConversation[]) =>
    conversationsLoading ? (
      <AdminLoadingState />
    ) : (
      <ConversationRows
        rows={rows}
        admins={admins}
        meId={meId}
        onAssign={onAssignConversation}
      />
    );
  return (
    <div className="grid gap-5 sm:gap-6">
      <AdminPageHeader
        eyebrow={dict.pageTitle}
        title={teamMemberName(member)}
        description={preview ? dict.previewDescription : undefined}
        badge={badge}
        actions={
          <>
            <Link
              href={`/admin/zadaci?assignee=${member.id}`}
              className={adminSecondaryButtonClass}
            >
              {dict.openAllTasks}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/admin/inbox?assignee=${member.id}`}
              className={adminSecondaryButtonClass}
            >
              {dict.openAllConversations}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </>
        }
      />
      <AdminPanel className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
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
        </div>
        {member.countsCapped ? (
          <p className="mt-3 text-[0.68rem] text-[var(--admin-text-muted)]">
            {dict.countCapped}
          </p>
        ) : null}
      </AdminPanel>
      {tab === "overview" ? (
        <>
          <TeamSection title={dict.tasksTitle}>
            {taskRows(tasks.slice(0, OVERVIEW_ROWS))}
          </TeamSection>
          <TeamSection title={dict.conversationsTitle}>
            {conversationRows(conversations.slice(0, OVERVIEW_ROWS))}
          </TeamSection>
        </>
      ) : null}
      {tab === "tasks" ? (
        <TeamSection title={dict.tasksTitle}>{taskRows(tasks)}</TeamSection>
      ) : null}
      {tab === "conversations" ? (
        <TeamSection title={dict.conversationsTitle}>
          {conversationRows(conversations)}
        </TeamSection>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const previewMembers: TeamMember[] = [
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

const previewAdmins: AdminOption[] = previewMembers.map(
  ({ id, name, email }) => ({ id, name, email }),
);

export function AdminTeamPreview() {
  const members = previewMembers;
  const admins = previewAdmins;
  const [state, setState] = useAdminUrlState(TEAM_URL_FIELDS);
  const { memberId, tab } = teamSelection(state, members);
  const sidebar = useMemo(
    () => teamSidebarLive(members, memberId, (clan) => setState({ clan })),
    [members, memberId, setState],
  );
  useAdminSidebarLive(sidebar);
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
  const filteredTasks = tasks.filter((task) => task.assigneeId === memberId);
  const filteredConversations = conversations.filter(
    (conversation) => conversation.assigneeAdminId === memberId,
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
      selectedId={memberId}
      tab={tab}
      tasks={filteredTasks}
      tasksLoading={false}
      conversations={filteredConversations}
      conversationsLoading={false}
      meId={members[0].id}
      error=""
      onAssignTask={assignTask}
      onAssignConversation={assignConversation}
      preview
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
