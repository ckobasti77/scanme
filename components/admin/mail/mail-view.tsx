import {
  AlertTriangle,
  ArrowLeft,
  AtSign,
  ChevronLeft,
  Forward,
  PenLine,
  Reply,
  ReplyAll,
  ChevronRight,
  Download,
  FileText,
  Folder,
  ImageOff,
  Inbox,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { AdminMailAddress, AdminMailFolder, AdminMailMessage, AdminMailMessagePage } from "@/convex/lib/adminMailContract";
import { AdminEmptyState, AdminLoadingState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { adminFieldClass, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { fmt } from "@/lib/i18n/format";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import { cn } from "@/lib/utils";
import { MailHtmlFrame } from "./mail-html-frame";
import { mailHasRemoteImages } from "./mail-srcdoc";
import { mailErrorText, mailFolderLabel, mailFullTime, mailListTime, mailSize, type MailFailure } from "./mail-format";
import type { MailFilter, MailNotice, MailViewActions, MailViewModel } from "./use-mail-workspace";

// Admin UX Z1/Z2 — the Pošta screen (props only; the container and the preview
// pass the same model). Desktop ≥1280: folders | list | message. 1024–1279:
// folders as a row above list | message. Phone: a stack — folders and list,
// and an opened message replaces them (with "Nazad na listu").

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";
const smallButton = cn(
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50",
  focusRing,
);

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
const FOLDER_ICONS: Record<string, Icon> = { Inbox, Sent: Send, Drafts: FileText, Spam: ShieldAlert, Trash: Trash2 };

export function AdminMailView({ model, actions, badge }: { model: MailViewModel; actions: MailViewActions; badge?: string }) {
  return (
    <div className="grid min-w-0 gap-4" data-admin-mail={model.mode}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {badge ? <p className="text-xs font-semibold tracking-[0.12em] text-[var(--admin-text-muted)] uppercase">{badge}</p> : null}
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{dict.pageTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)]">{dict.pageSubtitle}</p>
        </div>
        {model.mode === "ready" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={adminSecondaryButtonClass} onClick={actions.openSignature}>
              <PenLine className="size-4" aria-hidden="true" />
              {dict.settings.open}
            </button>
            <button type="button" className={adminSecondaryButtonClass} onClick={actions.connect} disabled={model.busyConnect}>
              <Plus className="size-4" aria-hidden="true" />
              {model.busyConnect ? dict.connecting : dict.connect}
            </button>
            <button type="button" className={adminPrimaryButtonClass} onClick={() => actions.compose("new")}>
              <PenLine className="size-4" aria-hidden="true" />
              {dict.compose.newMessage}
            </button>
          </div>
        ) : model.mode !== "not_configured" ? (
          <button type="button" className={adminPrimaryButtonClass} onClick={actions.connect} disabled={model.busyConnect}>
            <Plus className="size-4" aria-hidden="true" />
            {model.busyConnect ? dict.connecting : dict.connect}
          </button>
        ) : null}
      </header>

      {model.notice ? <NoticeBar notice={model.notice} onDismiss={actions.dismissNotice} onOpenSent={actions.openSentFolder} /> : null}

      {model.connections.length > 0 ? <ConnectionsBar model={model} actions={actions} className={cn(model.selected && "hidden lg:flex")} /> : null}

      {model.mode === "not_configured" ? (
        <AdminPanel>
          <AdminEmptyState title={dict.notConfiguredTitle} body={dict.notConfiguredBody} />
        </AdminPanel>
      ) : model.mode === "no_connection" ? (
        <AdminPanel className="grid place-items-center gap-2 pb-8">
          <AdminEmptyState title={dict.noConnectionTitle} body={dict.noConnectionBody} className="min-h-0 pb-2" />
          <button type="button" className={adminPrimaryButtonClass} onClick={actions.connect} disabled={model.busyConnect}>
            <AtSign className="size-4" aria-hidden="true" />
            {model.busyConnect ? dict.connecting : dict.connect}
          </button>
        </AdminPanel>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] xl:grid-cols-[13.5rem_minmax(19rem,24rem)_minmax(0,1fr)]">
          <FolderPane model={model} actions={actions} className={cn("lg:col-span-2 xl:col-span-1", model.selected && "hidden lg:block")} />
          <ListPane model={model} actions={actions} className={cn(model.selected && "hidden lg:flex")} />
          <ReaderPane model={model} actions={actions} className={cn(!model.selected && "hidden lg:flex")} />
        </div>
      )}

      {model.mode === "ready" ? <p className="text-xs leading-5 text-[var(--admin-text-muted)]">{dict.privacyNote}</p> : null}
    </div>
  );
}

function NoticeBar({ notice, onDismiss, onOpenSent }: { notice: MailNotice; onDismiss: () => void; onOpenSent: () => void }) {
  const tone = {
    success: "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
    error: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
    info: "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text)]",
  }[notice.tone];
  return (
    <div role={notice.tone === "error" ? "alert" : "status"} className={cn("flex items-start justify-between gap-3 rounded-[var(--admin-radius-control)] border px-4 py-3 text-sm font-medium", tone)}>
      <p className="min-w-0 leading-6">
        {notice.text}
        {notice.action === "openSent" ? (
          <button type="button" onClick={onOpenSent} className={cn("ml-2 font-semibold underline underline-offset-2", focusRing)}>
            {dict.compose.openSent}
          </button>
        ) : null}
      </p>
      <button type="button" onClick={onDismiss} aria-label={dict.dismissNotice} className={cn("grid size-8 shrink-0 place-items-center rounded-full", focusRing)}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ConnectionsBar({ model, actions, className }: { model: MailViewModel; actions: MailViewActions; className?: string }) {
  return (
    <AdminPanel aria-label={dict.connectionsLabel} className={cn("flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:p-4", className)}>
      <h2 className="w-full text-sm font-semibold sm:w-auto">{dict.connectionsLabel}</h2>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
        {model.connections.map((connection) => {
          const busy = model.busyConnectionId === connection.connectionId;
          return (
            <li key={connection.connectionId} className="flex max-w-full min-w-0 flex-wrap items-center gap-2 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] py-1.5 pr-1.5 pl-3">
              <span className="min-w-0 truncate text-sm font-medium">{connection.primaryEmail}</span>
              <AdminStatus
                tone={connection.status === "active" ? "active" : "problem"}
                label={connection.status === "active" ? dict.connectionActive : dict.connectionAuthRequired}
              />
              {connection.status === "auth_required" ? (
                <button type="button" className={smallButton} onClick={actions.connect} disabled={model.busyConnect}>
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {dict.reconnect}
                </button>
              ) : null}
              <button type="button" className={smallButton} onClick={() => actions.disconnect(connection)} disabled={busy}>
                <Unplug className="size-3.5" aria-hidden="true" />
                {dict.disconnect}
              </button>
            </li>
          );
        })}
      </ul>
    </AdminPanel>
  );
}

function Problem({ failure, onRetry, onReconnect }: { failure: MailFailure; onRetry?: () => void; onReconnect?: () => void }) {
  return (
    <div role="alert" className="grid justify-items-center gap-3 px-5 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm leading-6">{mailErrorText(failure)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {failure.code === "ZOHO_AUTH_REQUIRED" && onReconnect ? (
          <button type="button" className={adminSecondaryButtonClass} onClick={onReconnect}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {dict.reconnect}
          </button>
        ) : onRetry ? (
          <button type="button" className={adminSecondaryButtonClass} onClick={onRetry}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {dict.retry}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FolderPane({ model, actions, className }: { model: MailViewModel; actions: MailViewActions; className?: string }) {
  const account = model.accounts.find((option) => option.key === model.accountKey);
  return (
    <AdminPanel aria-label={dict.foldersLabel} className={cn("min-w-0 p-3", className)}>
      {model.accounts.length > 1 ? (
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--admin-text-muted)]">
          {dict.mailboxLabel}
          <select className={adminFieldClass} value={model.accountKey ?? ""} onChange={(event) => actions.selectAccount(event.target.value)}>
            {model.accounts.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : account ? (
        <p className="truncate px-1 text-xs text-[var(--admin-text-muted)]">
          {dict.mailboxLabel}: <strong className="font-semibold text-[var(--admin-text)]">{account.emailAddress}</strong>
        </p>
      ) : null}
      <h2 className="sr-only">{dict.foldersLabel}</h2>
      {model.folders.status === "error" ? (
        <Problem failure={model.folders.failure} onRetry={actions.retryFolders} onReconnect={actions.connect} />
      ) : model.folders.status !== "ready" ? (
        <AdminLoadingState compact label={dict.loadingFolders} />
      ) : model.folders.data.length === 0 ? (
        <p className="px-1 py-4 text-sm text-[var(--admin-text-muted)]">{dict.foldersEmpty}</p>
      ) : (
        <nav aria-label={dict.foldersLabel} className="mt-2">
          <ul className="flex gap-1.5 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
            {model.folders.data.map((folder) => (
              <li key={folder.folderId} className="shrink-0">
                <FolderButton folder={folder} active={!model.search && folder.folderId === model.folderId} onSelect={actions.selectFolder} />
              </li>
            ))}
          </ul>
        </nav>
      )}
    </AdminPanel>
  );
}

function FolderButton({ folder, active, onSelect }: { folder: AdminMailFolder; active: boolean; onSelect: (folderId: string) => void }) {
  const Icon = FOLDER_ICONS[folder.type] ?? Folder;
  return (
    <button
      type="button"
      onClick={() => onSelect(folder.folderId)}
      aria-current={active ? "true" : undefined}
      title={folder.path ?? undefined}
      className={cn(
        "inline-flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium whitespace-nowrap transition-colors",
        active ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "hover:bg-[var(--admin-surface-muted)]",
        focusRing,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{mailFolderLabel(folder)}</span>
    </button>
  );
}

const FILTERS: { value: MailFilter; label: string }[] = [
  { value: "all", label: dict.filterAll },
  { value: "unread", label: dict.filterUnread },
];

function ListPane({ model, actions, className }: { model: MailViewModel; actions: MailViewActions; className?: string }) {
  return (
    <AdminPanel aria-label={dict.listLabel} className={cn("flex min-w-0 flex-col overflow-hidden", className)}>
      <div className="grid gap-2 border-b border-[var(--admin-border)] p-3">
        <form
          role="search"
          className="flex min-w-0 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            actions.submitSearch();
          }}
        >
          <label htmlFor="admin-mail-search" className="sr-only">{dict.searchLabel}</label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--admin-text-muted)]" aria-hidden="true" />
            <input
              id="admin-mail-search"
              type="search"
              value={model.searchDraft}
              onChange={(event) => actions.setSearchDraft(event.target.value)}
              placeholder={dict.searchPlaceholder}
              maxLength={100}
              className={cn(adminFieldClass, "pl-9")}
            />
          </div>
          <button type="submit" className={adminSecondaryButtonClass}>{dict.searchSubmit}</button>
        </form>
        {model.search ? (
          <p className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-[var(--admin-text-muted)]">
            <span className="min-w-0 break-words">{fmt(dict.searchScope, { query: model.search })}</span>
            <button type="button" className={smallButton} onClick={actions.clearSearch}>
              <X className="size-3.5" aria-hidden="true" />
              {dict.searchClear}
            </button>
          </p>
        ) : (
          <div role="group" aria-label={dict.filterLabel} className="inline-flex w-fit gap-0.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={model.filter === option.value}
                onClick={() => actions.setFilter(option.value)}
                className={cn(
                  "min-h-9 rounded-full px-3.5 text-xs font-semibold",
                  model.filter === option.value ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]",
                  focusRing,
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-[16rem] flex-1">
        {model.list.status === "error" ? (
          <Problem failure={model.list.failure} onRetry={actions.retryList} onReconnect={actions.connect} />
        ) : model.list.status !== "ready" ? (
          <AdminLoadingState label={dict.loadingList} />
        ) : model.list.data.messages.length === 0 ? (
          <AdminEmptyState
            title={model.search ? dict.searchEmptyTitle : dict.listEmptyTitle}
            body={model.search ? dict.searchEmptyBody : model.filter === "unread" ? dict.unreadEmptyBody : dict.listEmptyBody}
          />
        ) : (
          <MessageRows page={model.list.data} model={model} actions={actions} />
        )}
      </div>
      {model.list.status === "ready" && (model.start > 1 || model.list.data.hasMore) ? (
        <nav aria-label={dict.pagination} className="flex items-center justify-between gap-2 border-t border-[var(--admin-border)] p-3">
          <button type="button" className={smallButton} disabled={model.start <= 1} onClick={() => actions.goToStart(model.start - model.pageSize)}>
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            {dict.pagePrevious}
          </button>
          <span className="text-xs text-[var(--admin-text-muted)] tabular-nums">
            {fmt(dict.pageRange, { from: model.start, to: model.start + model.list.data.messages.length - 1 })}
          </span>
          <button type="button" className={smallButton} disabled={!model.list.data.hasMore} onClick={() => actions.goToStart(model.start + model.pageSize)}>
            {dict.pageNext}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </AdminPanel>
  );
}

function MessageRows({ page, model, actions }: { page: AdminMailMessagePage; model: MailViewModel; actions: MailViewActions }) {
  return (
    <ul className="divide-y divide-[var(--admin-border)]">
      {page.messages.map((row) => {
        const unread = row.unread && !model.readIds.has(row.messageId);
        const active = model.selected?.messageId === row.messageId;
        return (
          <li key={`${row.folderId}:${row.messageId}`}>
            <button
              type="button"
              onClick={() => actions.selectMessage(row.folderId, row.messageId)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "grid w-full min-w-0 gap-1 px-4 py-3 text-left transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus,var(--admin-ink))] focus-visible:outline-none focus-visible:ring-inset",
                active && "bg-[var(--admin-surface-muted)]",
              )}
            >
              <span className="flex min-w-0 items-baseline justify-between gap-3">
                <span className={cn("min-w-0 truncate text-sm", unread ? "font-bold" : "font-medium")}>
                  {row.fromName ?? (row.fromAddress || dict.unknownSender)}
                </span>
                <time className="shrink-0 text-[0.7rem] text-[var(--admin-text-muted)] tabular-nums" dateTime={row.receivedAt ? new Date(row.receivedAt).toISOString() : undefined}>
                  {mailListTime(row.receivedAt, model.now)}
                </time>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                {unread ? (
                  <span className="size-2 shrink-0 rounded-full bg-[var(--admin-ink)]">
                    <span className="sr-only">{dict.unread}</span>
                  </span>
                ) : null}
                <span className={cn("min-w-0 flex-1 truncate text-sm", unread && "font-semibold")}>{row.subject || dict.noSubject}</span>
                {row.hasAttachment ? <Paperclip role="img" aria-label={dict.hasAttachment} className="size-3.5 shrink-0 text-[var(--admin-text-muted)]" /> : null}
              </span>
              {row.summary ? <span className="line-clamp-2 text-xs leading-5 break-words text-[var(--admin-text-muted)]">{row.summary}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ReaderPane({ model, actions, className }: { model: MailViewModel; actions: MailViewActions; className?: string }) {
  return (
    <AdminPanel aria-label={dict.readerLabel} className={cn("flex min-w-0 flex-col overflow-hidden lg:self-start", className)}>
      {model.selected ? (
        <div className="border-b border-[var(--admin-border)] p-2 lg:hidden">
          <button type="button" className={smallButton} onClick={actions.closeMessage}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {dict.back}
          </button>
        </div>
      ) : null}
      {!model.selected ? (
        <AdminEmptyState title={dict.readerEmptyTitle} body={dict.readerEmptyBody} className="flex-1" />
      ) : model.message.status === "error" ? (
        <Problem failure={model.message.failure} onRetry={actions.retryMessage} onReconnect={actions.connect} />
      ) : model.message.status !== "ready" ? (
        <AdminLoadingState label={dict.loadingMessage} />
      ) : (
        <MessageReader message={model.message.data} model={model} actions={actions} />
      )}
    </AdminPanel>
  );
}

function AddressLine({ addresses }: { addresses: AdminMailAddress[] }) {
  return (
    <>
      {addresses.map((address, index) => (
        <span key={`${address.address}:${index}`} className="break-words">
          {index > 0 ? ", " : null}
          {address.name ? <>{address.name} <span className="text-[var(--admin-text-muted)]">&lt;{address.address}&gt;</span></> : address.address}
        </span>
      ))}
    </>
  );
}

function HeaderRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[var(--admin-text-muted)]">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function MessageReader({ message, model, actions }: { message: AdminMailMessage; model: MailViewModel; actions: MailViewActions }) {
  const unread = message.unread && !model.readIds.has(message.messageId);
  const subject = message.subject || dict.noSubject;
  const remoteImages = message.body.kind === "html" && mailHasRemoteImages(message.body.content);
  return (
    <article className="grid min-w-0 gap-4 p-4 sm:p-5">
      <header className="grid min-w-0 gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.02em] break-words">{subject}</h2>
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <HeaderRow label={dict.from}>{message.from ? <AddressLine addresses={[message.from]} /> : dict.unknownSender}</HeaderRow>
          {message.to.length > 0 ? <HeaderRow label={dict.to}><AddressLine addresses={message.to} /></HeaderRow> : null}
          {message.cc.length > 0 ? <HeaderRow label={dict.cc}><AddressLine addresses={message.cc} /></HeaderRow> : null}
          {message.receivedAt ? (
            <HeaderRow label={dict.date}>
              <time dateTime={new Date(message.receivedAt).toISOString()}>{mailFullTime(message.receivedAt)}</time>
            </HeaderRow>
          ) : null}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={dict.compose.messageActions} className="flex flex-wrap gap-2">
            <button type="button" className={smallButton} onClick={() => actions.compose("reply")}>
              <Reply className="size-3.5" aria-hidden="true" />
              {dict.compose.reply}
            </button>
            <button type="button" className={smallButton} onClick={() => actions.compose("reply_all")}>
              <ReplyAll className="size-3.5" aria-hidden="true" />
              {dict.compose.replyAll}
            </button>
            <button type="button" className={smallButton} onClick={() => actions.compose("forward")}>
              <Forward className="size-3.5" aria-hidden="true" />
              {dict.compose.forward}
            </button>
          </div>
          {unread ? (
            <button type="button" className={smallButton} onClick={actions.markRead} disabled={model.markingRead}>
              {dict.markRead}
            </button>
          ) : (
            <AdminStatus tone="neutral" label={dict.markedRead} />
          )}
        </div>
        {model.readerFailure ? (
          <p role="alert" className="text-sm font-medium text-[var(--admin-danger)]">{mailErrorText(model.readerFailure)}</p>
        ) : null}
      </header>

      {message.body.kind === "html" ? (
        <div className="grid min-w-0 gap-2">
          {remoteImages ? (
            model.showImages ? (
              <p className="text-xs text-[var(--admin-text-muted)]">{dict.imagesShown}</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--admin-radius-control)] border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-3 py-2 text-sm text-[var(--admin-warning)]">
                <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                  <ImageOff className="size-4 shrink-0" aria-hidden="true" />
                  {dict.imagesBlocked}
                </span>
                <button type="button" className={smallButton} onClick={actions.showImages}>{dict.showImages}</button>
              </div>
            )
          ) : null}
          <MailHtmlFrame html={message.body.content} allowRemoteImages={model.showImages} title={fmt(dict.htmlFrameTitle, { subject })} />
        </div>
      ) : (
        <pre className="max-h-[62vh] min-w-0 overflow-auto rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-4 font-[inherit] text-sm leading-6 break-words whitespace-pre-wrap">
          {message.body.content}
        </pre>
      )}

      {message.attachments.length > 0 ? (
        <section aria-label={dict.attachmentsLabel} className="grid gap-2">
          <h3 className="text-sm font-semibold">{dict.attachmentsLabel}</h3>
          <ul className="flex min-w-0 flex-wrap gap-2">
            {message.attachments.map((attachment) => {
              const busy = model.downloadingId === attachment.attachmentId;
              return (
                <li key={attachment.attachmentId} className="max-w-full min-w-0">
                  <button
                    type="button"
                    onClick={() => actions.download(attachment.attachmentId)}
                    disabled={model.downloadingId !== null}
                    aria-label={fmt(dict.download, { name: attachment.fileName, size: mailSize(attachment.size) })}
                    className={cn(smallButton, "max-w-full justify-start")}
                  >
                    <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">{attachment.fileName}</span>
                    <span className="shrink-0 font-normal text-[var(--admin-text-muted)]">{busy ? dict.downloading : mailSize(attachment.size)}</span>
                    <Download className="size-3.5 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
