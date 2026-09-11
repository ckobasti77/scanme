"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  CheckCheck,
  ChevronRight,
  Inbox,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { communicationsSr as dict } from "@/lib/i18n/sr/communications";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
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
import { Textarea } from "@/components/ui/textarea";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPanel,
  AdminStatus,
} from "./admin-primitives";

type InboxResult = FunctionReturnType<typeof api.adminCommunications.listInbox>;
type InboxItem = InboxResult["page"][number];
type Detail = NonNullable<FunctionReturnType<typeof api.adminCommunications.getConversation>>;
type ConversationStatus = InboxItem["status"];
type Channel = InboxItem["channel"];
type ManualChannel = "phone" | "in_person" | "copied_message";

const statusLabels: Record<ConversationStatus, string> = {
  new: dict.statusNew,
  needs_reply: dict.statusNeedsReply,
  in_progress: dict.statusInProgress,
  waiting_client: dict.statusWaitingClient,
  completed: dict.statusCompleted,
};

const channelLabels: Record<Channel, string> = {
  panel_chat: dict.channelPanelChat,
  email: dict.channelEmail,
  phone: dict.channelPhone,
  in_person: dict.channelInPerson,
  copied_message: dict.channelCopiedMessage,
};

const statusTone: Record<ConversationStatus, "active" | "waiting" | "problem" | "neutral"> = {
  new: "problem",
  needs_reply: "problem",
  in_progress: "waiting",
  waiting_client: "waiting",
  completed: "neutral",
};

const dateFormatter = new Intl.DateTimeFormat("sr-Latn-RS", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function errorMessage(error: unknown) {
  void error;
  return dict.mutationError;
}

function ChannelIcon({ channel }: { channel: Channel }) {
  const Icon = channel === "panel_chat"
    ? MessageSquareText
    : channel === "email"
      ? Mail
      : channel === "phone"
        ? Phone
        : channel === "in_person"
          ? UsersRound
          : Inbox;
  return <Icon className="size-4" aria-hidden="true" />;
}

function Receipt({ state }: { state: "sent" | "delivered" | "read" }) {
  const Icon = state === "sent" ? Check : CheckCheck;
  const label = state === "sent"
    ? dict.sentReceipt
    : state === "delivered"
      ? dict.deliveredReceipt
      : dict.readReceipt;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.68rem]",
        state === "read" ? "text-[var(--admin-accent-ink)]" : "text-[var(--admin-text-muted)]",
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ConversationList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: InboxItem[];
  selectedId: Id<"conversations"> | null;
  onSelect: (id: Id<"conversations">) => void;
}) {
  return (
    <div aria-label={dict.conversationList} className="divide-y divide-[var(--admin-border)]">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onSelect(row.id)}
          aria-current={selectedId === row.id ? "true" : undefined}
          className={cn(
            "grid w-full min-w-0 gap-2 px-4 py-4 text-left transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]",
            selectedId === row.id && "bg-[var(--admin-surface-muted)]",
          )}
        >
          <span className="flex min-w-0 items-start justify-between gap-3">
            <span className="min-w-0">
              <strong className="block truncate text-sm">{row.accountName}</strong>
              <span className="mt-0.5 block truncate text-xs text-[var(--admin-text-muted)]">
                {row.contactName}{row.businessName ? ` · ${row.businessName}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {row.adminUnreadCount > 0 ? (
                <span className="size-2 rounded-full bg-[var(--admin-danger)]" title={dict.unreadLabel}>
                  <span className="sr-only">{dict.unreadLabel}</span>
                </span>
              ) : null}
              <ChevronRight className="size-4 text-[var(--admin-text-muted)]" aria-hidden="true" />
            </span>
          </span>
          <span className="line-clamp-2 break-words text-sm leading-5 text-[var(--admin-text-muted)]">
            {row.latestMessagePreview}
          </span>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--admin-text-muted)]">
              <ChannelIcon channel={row.channel} />
              {channelLabels[row.channel]}
            </span>
            <time className="text-[0.68rem] tabular-nums text-[var(--admin-text-muted)]" dateTime={new Date(row.latestMessageAt).toISOString()}>
              {dateFormatter.format(row.latestMessageAt)}
            </time>
          </span>
        </button>
      ))}
    </div>
  );
}

function MessageHistory({ detail }: { detail: Detail }) {
  return (
    <div className="grid gap-3" aria-live="polite">
      {detail.messagesCapped ? (
        <p className="text-xs text-[var(--admin-text-muted)]">{dict.messagesCapped}</p>
      ) : null}
      {detail.messages.map((message) => {
        const outgoing = message.direction === "admin_to_client";
        return (
          <article
            key={message.id}
            className={cn(
              "max-w-[92%] rounded-2xl border px-3.5 py-3 sm:max-w-[78%]",
              outgoing
                ? "ml-auto border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)]"
                : message.direction === "manual"
                  ? "border-[var(--admin-border)] bg-[var(--admin-surface-muted)]"
                  : "border-[var(--admin-border)] bg-[var(--admin-surface-strong)]",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.68rem] text-[var(--admin-text-muted)]">
              <strong className="text-[var(--admin-text)]">{message.authorDisplayName}</strong>
              <span className="inline-flex items-center gap-1.5">
                <time dateTime={new Date(message.createdAt).toISOString()}>{dateFormatter.format(message.createdAt)}</time>
                {message.deliveryState ? <Receipt state={message.deliveryState} /> : null}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
          </article>
        );
      })}
    </div>
  );
}

function ReplyForm({
  disabled,
  busy,
  error,
  onSubmit,
}: {
  disabled: boolean;
  busy: boolean;
  error: string;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) return;
    await onSubmit(content);
    setContent("");
  }
  if (disabled) {
    return <p className="text-sm leading-6 text-[var(--admin-text-muted)]">{dict.replyUnavailable}</p>;
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3">
      <Label htmlFor="admin-conversation-reply">{dict.replyLabel}</Label>
      <Textarea
        id="admin-conversation-reply"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={dict.replyPlaceholder}
        maxLength={4_000}
        rows={3}
        disabled={busy}
        required
      />
      {error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{error}</p> : null}
      <Button type="submit" disabled={busy || !content.trim()} className="justify-self-start">
        {dict.sendReply}
      </Button>
    </form>
  );
}

function ConversationDetail({
  detail,
  me,
  busy,
  error,
  onReply,
  onStatus,
  onAssign,
  onManual,
}: {
  detail: Detail;
  me: { id: Id<"users">; name: string };
  busy: boolean;
  error: string;
  onReply: (content: string) => Promise<void>;
  onStatus: (status: ConversationStatus) => Promise<void>;
  onAssign: (id: Id<"users"> | null) => Promise<void>;
  onManual: () => void;
}) {
  const row = detail.conversation;
  return (
    <section aria-label={dict.conversationDetail} className="grid min-w-0 grid-rows-[auto_minmax(12rem,1fr)_auto]">
      <header className="border-b border-[var(--admin-border)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[0.68rem] font-semibold text-[var(--admin-text-muted)]">{row.smkCode}</p>
            <h2 className="mt-1 break-words text-xl font-semibold tracking-[-0.03em]">{row.accountName}</h2>
            <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
              {row.contactName}{row.businessName ? ` · ${row.businessName}` : ""}
            </p>
          </div>
          <AdminStatus label={statusLabels[row.status]} tone={statusTone[row.status]} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="conversation-status">{dict.statusLabel}</Label>
            <Select value={row.status} onValueChange={(value) => void onStatus(value as ConversationStatus)} disabled={busy}>
              <SelectTrigger id="conversation-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(statusLabels) as ConversationStatus[]).map((status) => (
                  <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{dict.assigneeLabel}</span>
            <div className="flex min-h-9 items-center gap-2 text-sm">
              <UserRound className="size-4 text-[var(--admin-text-muted)]" aria-hidden="true" />
              <span className="min-w-0 truncate">{row.assigneeName ?? dict.noAssignee}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
            {row.assigneeAdminId === me.id ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onAssign(null)}>{dict.removeAssignee}</Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onAssign(me.id)}>{dict.assignToMe}</Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onManual}><Plus className="size-4" aria-hidden="true" />{dict.manualOpen}</Button>
          </div>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-[var(--admin-danger)]">{error}</p> : null}
      </header>
      <div className="min-w-0 overflow-y-auto p-4 sm:p-5"><MessageHistory detail={detail} /></div>
      <div className="border-t border-[var(--admin-border)] p-4 sm:p-5">
        <ReplyForm disabled={row.channel !== "panel_chat"} busy={busy} error={error} onSubmit={onReply} />
      </div>
    </section>
  );
}

function ManualDialog({
  open,
  busy,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (channel: ManualChannel, content: string) => Promise<void>;
}) {
  const [channel, setChannel] = useState<ManualChannel>("phone");
  const [content, setContent] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) return;
    await onSubmit(channel, content);
    setContent("");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-v1 border-[var(--admin-border)] bg-[var(--admin-surface-strong)] motion-reduce:duration-0">
        <DialogHeader>
          <DialogTitle>{dict.manualTitle}</DialogTitle>
          <DialogDescription>{dict.manualDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="manual-channel">{dict.manualChannel}</Label>
            <Select value={channel} onValueChange={(value) => setChannel(value as ManualChannel)} disabled={busy}>
              <SelectTrigger id="manual-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">{dict.channelPhone}</SelectItem>
                <SelectItem value="in_person">{dict.channelInPerson}</SelectItem>
                <SelectItem value="copied_message">{dict.channelCopiedMessage}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-note">{dict.manualNote}</Label>
            <Textarea id="manual-note" value={content} onChange={(event) => setContent(event.target.value)} placeholder={dict.manualPlaceholder} maxLength={4_000} rows={5} disabled={busy} required />
          </div>
          {error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{dict.cancel}</Button>
            <Button type="submit" disabled={busy || !content.trim()}>{dict.manualSave}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type WorkspaceScope = {
  accountId?: Id<"accounts">;
  contactId?: Id<"accountContacts">;
  accountName?: string;
  contactName?: string;
  embedded?: boolean;
};

export function AdminConversationWorkspace(scope: WorkspaceScope = {}) {
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [status, setStatus] = useState<ConversationStatus | "all">("all");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [assignee, setAssigneeFilter] = useState<"all" | "mine" | "unassigned">("all");
  const me = useQuery(api.adminCommunications.me);
  const inbox = usePaginatedQuery(
    api.adminCommunications.listInbox,
    {
      ...(search ? { search } : {}),
      ...(status !== "all" ? { status } : {}),
      ...(channel !== "all" ? { channel } : {}),
      ...(assignee === "mine" && me ? { assignee: me.id } : {}),
      ...(assignee === "unassigned" ? { assignee: "unassigned" as const } : {}),
      ...(scope.accountId ? { accountId: scope.accountId } : {}),
      ...(scope.contactId ? { contactId: scope.contactId } : {}),
    },
    { initialNumItems: 20 },
  );
  const [selectedId, setSelectedId] = useState<Id<"conversations"> | null>(null);
  const selected = selectedId && inbox.results.some((row) => row.id === selectedId)
    ? selectedId
    : inbox.results[0]?.id ?? null;
  const detail = useQuery(
    api.adminCommunications.getConversation,
    selected ? { conversationId: selected } : "skip",
  );
  const reply = useMutation(api.adminCommunications.reply);
  const setConversationStatus = useMutation(api.adminCommunications.setStatus);
  const setConversationAssignee = useMutation(api.adminCommunications.setAssignee);
  const markAdminRead = useMutation(api.adminCommunications.markAdminRead);
  const logManual = useMutation(api.adminCommunications.logManualEntry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const manualReturnFocus = useRef<HTMLElement | null>(null);

  function openManual() {
    manualReturnFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setError("");
    setManualOpen(true);
  }

  function changeManualOpen(open: boolean) {
    setManualOpen(open);
    if (!open) {
      setError("");
      requestAnimationFrame(() => manualReturnFocus.current?.focus());
    }
  }

  useEffect(() => {
    if (!selected || detail === undefined || detail === null || detail.conversation.adminUnreadCount === 0) return;
    void markAdminRead({ conversationId: selected });
  }, [detail, markAdminRead, selected]);

  async function run(work: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError("");
    try {
      await work();
      after?.();
    } catch (nextError) {
      setError(errorMessage(nextError) || dict.mutationError);
    } finally {
      setBusy(false);
    }
  }

  const manualContext = detail?.conversation ?? (scope.accountId && scope.contactId
    ? {
        accountId: scope.accountId,
        contactId: scope.contactId,
        accountName: scope.accountName ?? "",
        contactName: scope.contactName ?? "",
        businessId: null,
      }
    : null);
  const filtered = Boolean(search || status !== "all" || channel !== "all" || assignee !== "all");

  if (inbox.status === "LoadingFirstPage" || me === undefined) {
    return <AdminPanel><AdminLoadingState label={dict.conversationList} /></AdminPanel>;
  }

  return (
    <div className="grid min-w-0 gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {scope.embedded ? <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-text-muted)]">{dict.profileScope}</p> : null}
          <h1 className={cn("font-semibold tracking-[-0.04em]", scope.embedded ? "mt-1 text-2xl" : "text-3xl sm:text-4xl")}>{scope.embedded ? scope.contactName : dict.inboxTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)]">{scope.embedded ? dict.profileScope : dict.inboxSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scope.embedded ? <Button asChild variant="outline"><Link href="/admin/inbox">{dict.profileOpenInbox}</Link></Button> : null}
          {manualContext ? <Button type="button" variant="outline" onClick={openManual}><Plus className="size-4" aria-hidden="true" />{dict.manualOpen}</Button> : null}
        </div>
      </header>

      {!scope.embedded ? (
        <AdminPanel className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(16rem,1.4fr)_repeat(3,minmax(10rem,0.7fr))]">
          <form
            className="relative sm:col-span-2 xl:col-span-1"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchDraft.trim());
            }}
          >
            <Label htmlFor="inbox-search" className="sr-only">{dict.searchLabel}</Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
            <Input id="inbox-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={dict.searchPlaceholder} className="pl-9" />
          </form>
          <div className="grid gap-1.5">
            <Label htmlFor="inbox-status">{dict.statusFilter}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as ConversationStatus | "all")}>
              <SelectTrigger id="inbox-status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{dict.filterAll}</SelectItem>{(Object.keys(statusLabels) as ConversationStatus[]).map((value) => <SelectItem key={value} value={value}>{statusLabels[value]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inbox-channel">{dict.channelFilter}</Label>
            <Select value={channel} onValueChange={(value) => setChannel(value as Channel | "all")}>
              <SelectTrigger id="inbox-channel"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{dict.filterAll}</SelectItem>{(Object.keys(channelLabels) as Channel[]).map((value) => <SelectItem key={value} value={value}>{channelLabels[value]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inbox-assignee">{dict.assigneeFilter}</Label>
            <Select value={assignee} onValueChange={(value) => setAssigneeFilter(value as typeof assignee)}>
              <SelectTrigger id="inbox-assignee"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{dict.filterAll}</SelectItem><SelectItem value="mine">{dict.assigneeMine}</SelectItem><SelectItem value="unassigned">{dict.assigneeUnassigned}</SelectItem></SelectContent>
            </Select>
          </div>
        </AdminPanel>
      ) : null}

      {inbox.results.length === 0 ? (
        <AdminPanel>
          <AdminEmptyState title={filtered ? dict.noFilteredTitle : dict.noConversationsTitle} body={filtered ? dict.noFilteredBody : dict.noConversationsBody} />
        </AdminPanel>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,0.78fr)_minmax(0,1.45fr)]">
          <AdminPanel className="min-w-0 overflow-hidden">
            <ConversationList rows={inbox.results} selectedId={selected} onSelect={setSelectedId} />
            {inbox.status === "CanLoadMore" ? (
              <div className="border-t border-[var(--admin-border)] p-3"><Button type="button" variant="outline" className="w-full" onClick={() => inbox.loadMore(20)}>{dict.loadMore}</Button></div>
            ) : inbox.status === "LoadingMore" ? <AdminLoadingState compact label={dict.loadingMore} /> : null}
          </AdminPanel>
          <AdminPanel className="min-w-0 overflow-hidden">
            {detail === undefined || me === undefined ? <AdminLoadingState label={dict.conversationDetail} /> : detail === null ? <AdminErrorState title={dict.errorTitle} body={dict.errorBody} /> : (
              <ConversationDetail
                detail={detail}
                me={me}
                busy={busy}
                error={error}
                onReply={async (content) => run(() => reply({ conversationId: detail.conversation.id, content }))}
                onStatus={async (nextStatus) => run(() => setConversationStatus({ conversationId: detail.conversation.id, status: nextStatus }))}
                onAssign={async (id) => run(() => setConversationAssignee({ conversationId: detail.conversation.id, assigneeAdminId: id }))}
                onManual={openManual}
              />
            )}
          </AdminPanel>
        </div>
      )}

      {manualContext ? (
        <ManualDialog
          open={manualOpen}
          busy={busy}
          error={error}
          onOpenChange={changeManualOpen}
          onSubmit={async (manualChannel, content) => run(
            () => logManual({
              accountId: manualContext.accountId,
              contactId: manualContext.contactId,
              ...(manualContext.businessId ? { businessId: manualContext.businessId } : {}),
              channel: manualChannel,
              content,
            }),
            () => changeManualOpen(false),
          )}
        />
      ) : null}
    </div>
  );
}

export function AdminInboxWorkspace() {
  return <AdminConversationWorkspace />;
}

export class AdminInboxErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} /></AdminPanel>
      : this.props.children;
  }
}

const fixtureRows = [
  {
    id: "fixture-conversation-1" as Id<"conversations">,
    accountId: "fixture-account" as Id<"accounts">,
    accountName: "Bistro Zelen d.o.o.",
    smkCode: "SMK-BZE-001",
    contactId: "fixture-contact" as Id<"accountContacts">,
    contactName: "Ana Petrović",
    contactEmail: "ana@bistrozelen.rs",
    contactPhone: "+381 64 123 45 67",
    businessId: "fixture-business" as Id<"businesses">,
    businessName: "Bistro Zelen Dorćol",
    channel: "panel_chat" as const,
    status: "needs_reply" as const,
    assigneeAdminId: null,
    assigneeName: null,
    latestMessagePreview: "Možete li da proverite zašto nova stavka još nije vidljiva u meniju?",
    latestMessageAt: Date.parse("2026-09-11T11:42:00Z"),
    latestMessageAuthorName: "Ana Petrović",
    adminUnreadCount: 1,
  },
  {
    id: "fixture-conversation-2" as Id<"conversations">,
    accountId: "fixture-account-2" as Id<"accounts">,
    accountName: "Studio Kadar",
    smkCode: "SMK-SKA-004",
    contactId: "fixture-contact-2" as Id<"accountContacts">,
    contactName: "Miloš Jovanović",
    contactEmail: null,
    contactPhone: "+381 63 555 80 11",
    businessId: null,
    businessName: null,
    channel: "phone" as const,
    status: "waiting_client" as const,
    assigneeAdminId: "fixture-admin" as Id<"users">,
    assigneeName: adminV1Sr.fixtureIdentity,
    latestMessagePreview: "Dogovoreno je da klijent pošalje finalni logo do petka.",
    latestMessageAt: Date.parse("2026-09-11T09:20:00Z"),
    latestMessageAuthorName: "Demo admin",
    adminUnreadCount: 0,
  },
] satisfies InboxItem[];

const fixtureDetail = {
  conversation: fixtureRows[0],
  messages: [
    { id: "fixture-message-1" as Id<"conversationMessages">, direction: "admin_to_client" as const, authorKind: "admin" as const, authorDisplayName: adminV1Sr.fixtureIdentity, content: "Naravno. Koju ste stavku poslednju objavili?", createdAt: Date.parse("2026-09-11T11:35:00Z"), deliveryState: "read" as const },
    { id: "fixture-message-2" as Id<"conversationMessages">, direction: "client_to_admin" as const, authorKind: "client" as const, authorDisplayName: "Ana Petrović", content: "Možete li da proverite zašto nova stavka još nije vidljiva u meniju?", createdAt: Date.parse("2026-09-11T11:42:00Z"), deliveryState: null },
  ],
  messagesCapped: false,
} satisfies Detail;

export function AdminInboxPreview() {
  const [selected, setSelected] = useState<Id<"conversations">>(fixtureRows[0].id);
  const [manualOpen, setManualOpen] = useState(false);
  const manualReturnFocus = useRef<HTMLElement | null>(null);
  function openManual() {
    manualReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setManualOpen(true);
  }
  function changeManualOpen(open: boolean) {
    setManualOpen(open);
    if (!open) requestAnimationFrame(() => manualReturnFocus.current?.focus());
  }
  const detail = useMemo(() => selected === fixtureRows[0].id ? fixtureDetail : { ...fixtureDetail, conversation: fixtureRows[1], messages: [{ ...fixtureDetail.messages[0], id: "fixture-message-3" as Id<"conversationMessages">, direction: "manual" as const, content: fixtureRows[1].latestMessagePreview, deliveryState: null }] }, [selected]);
  return (
    <div className="grid gap-4">
      <header><span className="rounded-full bg-[var(--admin-accent)] px-2.5 py-1 text-[0.68rem] font-bold text-[var(--admin-accent-ink)]">{dict.previewBadge}</span><h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{dict.inboxTitle}</h1><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{dict.inboxSubtitle}</p></header>
      <AdminPanel className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(16rem,1.4fr)_repeat(3,minmax(10rem,0.7fr))]"><Input aria-label={dict.searchLabel} placeholder={dict.searchPlaceholder} /><Button variant="outline">{dict.statusFilter}: {dict.filterAll}</Button><Button variant="outline">{dict.channelFilter}: {dict.filterAll}</Button><Button variant="outline">{dict.assigneeFilter}: {dict.filterAll}</Button></AdminPanel>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,0.78fr)_minmax(0,1.45fr)]">
        <AdminPanel className="min-w-0 overflow-hidden"><ConversationList rows={fixtureRows} selectedId={selected} onSelect={setSelected} /></AdminPanel>
        <AdminPanel className="min-w-0 overflow-hidden"><ConversationDetail detail={detail} me={{ id: "fixture-admin" as Id<"users">, name: adminV1Sr.fixtureIdentity }} busy={false} error="" onReply={async () => undefined} onStatus={async () => undefined} onAssign={async () => undefined} onManual={openManual} /></AdminPanel>
      </div>
      <ManualDialog open={manualOpen} busy={false} error="" onOpenChange={changeManualOpen} onSubmit={async () => changeManualOpen(false)} />
    </div>
  );
}
