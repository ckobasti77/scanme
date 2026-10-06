"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  AdminMailConnectionView,
  AdminMailFolder,
  AdminMailMessage,
  AdminMailMessagePage,
  AdminMailStatus,
} from "@/convex/lib/adminMailContract";
import { useMinuteNow } from "@/components/admin/admin-ui/use-minute-now";
import { fmt } from "@/lib/i18n/format";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import { mailErrorText, mailFailure, type MailFailure } from "./mail-format";

// Admin UX Z1 — state of the Pošta screen, shared by the Convex container and
// the fixture preview (the preview runs this same code over TEST data). Every
// read is keyed: a result is shown only for the key it was loaded for, so a
// late answer for another folder/message never lands on the screen.

export const MAIL_PAGE_SIZE = 25;

export type MailAccountOption = {
  key: string;
  connectionId: Id<"adminMailConnections">;
  accountId: string;
  emailAddress: string;
  label: string;
};

/** What the screen needs from the backend (Convex actions or TEST fixtures). */
export type MailSource = {
  listFolders(account: MailAccountOption): Promise<AdminMailFolder[]>;
  listMessages(
    account: MailAccountOption,
    args: { folderId: string; start: number; limit: number; unreadOnly: boolean; search: string },
  ): Promise<AdminMailMessagePage>;
  getMessage(account: MailAccountOption, args: { folderId: string; messageId: string }): Promise<AdminMailMessage>;
  markRead(account: MailAccountOption, messageId: string): Promise<void>;
  downloadAttachment(account: MailAccountOption, args: { folderId: string; messageId: string; attachmentId: string }): Promise<void>;
  connect(): Promise<void>;
  disconnect(connectionId: Id<"adminMailConnections">): Promise<void>;
};

export type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; failure: MailFailure }
  | { status: "ready"; data: T };

export type MailNotice = { tone: "success" | "error" | "info"; text: string };
export type MailFilter = "all" | "unread";

export type MailViewModel = {
  mode: "not_configured" | "no_connection" | "ready";
  notice: MailNotice | null;
  connections: AdminMailConnectionView[];
  busyConnect: boolean;
  busyConnectionId: string | null;
  accounts: MailAccountOption[];
  accountKey: string | null;
  folders: Loadable<AdminMailFolder[]>;
  folderId: string | null;
  filter: MailFilter;
  searchDraft: string;
  search: string;
  start: number;
  pageSize: number;
  list: Loadable<AdminMailMessagePage>;
  selected: { folderId: string; messageId: string } | null;
  message: Loadable<AdminMailMessage>;
  readIds: ReadonlySet<string>;
  showImages: boolean;
  markingRead: boolean;
  downloadingId: string | null;
  readerFailure: MailFailure | null;
  now: number;
};

export type MailViewActions = {
  connect(): void;
  disconnect(connection: AdminMailConnectionView): void;
  dismissNotice(): void;
  selectAccount(key: string): void;
  selectFolder(folderId: string): void;
  setFilter(filter: MailFilter): void;
  setSearchDraft(value: string): void;
  submitSearch(): void;
  clearSearch(): void;
  goToStart(start: number): void;
  retryFolders(): void;
  retryList(): void;
  selectMessage(folderId: string, messageId: string): void;
  closeMessage(): void;
  retryMessage(): void;
  showImages(): void;
  markRead(): void;
  download(attachmentId: string): void;
};

export function mailAccountOptions(connections: AdminMailConnectionView[]): MailAccountOption[] {
  return connections
    .filter((connection) => connection.status === "active")
    .flatMap((connection) =>
      connection.accounts.map((account) => ({
        key: `${connection.connectionId}:${account.accountId}`,
        connectionId: connection.connectionId,
        accountId: account.accountId,
        emailAddress: account.emailAddress,
        label: account.emailAddress,
      })),
    );
}

/** One keyed read: `loading` until the answer for exactly this key (and retry round) arrives. */
function useKeyedLoad<T>(key: string | null, load: () => Promise<T>): [Loadable<T>, () => void] {
  const [state, setState] = useState<{ key: string; round: number; result: Loadable<T> } | null>(null);
  const [round, setRound] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    if (key === null) return;
    let live = true;
    loadRef.current().then(
      (data) => {
        if (live) setState({ key, round, result: { status: "ready", data } });
      },
      (error: unknown) => {
        if (live) setState({ key, round, result: { status: "error", failure: mailFailure(error) } });
      },
    );
    return () => {
      live = false;
    };
  }, [key, round]);
  const retry = useCallback(() => setRound((value) => value + 1), []);
  if (key === null) return [{ status: "idle" }, retry];
  if (!state || state.key !== key || state.round !== round) return [{ status: "loading" }, retry];
  return [state.result, retry];
}

export function useMailWorkspace({
  status,
  source,
  initialNotice = null,
  initialMessage = null,
}: {
  status: AdminMailStatus;
  source: MailSource;
  initialNotice?: MailNotice | null;
  initialMessage?: { folderId: string; messageId: string } | null;
}): { model: MailViewModel; actions: MailViewActions } {
  const now = useMinuteNow();
  const accounts = useMemo(() => mailAccountOptions(status.connections), [status.connections]);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const account = accounts.find((option) => option.key === accountChoice) ?? accounts[0] ?? null;
  const accountKey = account?.key ?? null;

  const [folderChoice, setFolderChoice] = useState<{ accountKey: string; folderId: string } | null>(null);
  const [filter, setFilterState] = useState<MailFilter>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [start, setStart] = useState(1);
  const [selection, setSelection] = useState<{ accountKey: string | null; folderId: string; messageId: string } | null>(
    initialMessage ? { accountKey: null, ...initialMessage } : null,
  );
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [imagesFor, setImagesFor] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [readerFailure, setReaderFailure] = useState<MailFailure | null>(null);
  const [notice, setNotice] = useState<MailNotice | null>(initialNotice);
  const [busyConnect, setBusyConnect] = useState(false);
  const [busyConnectionId, setBusyConnectionId] = useState<string | null>(null);

  const ready = status.configured && account !== null;

  const [folders, retryFolders] = useKeyedLoad(ready && account ? `folders:${account.key}` : null, () => source.listFolders(account!));
  const folderList = folders.status === "ready" ? folders.data : [];
  const chosenFolder = folderChoice && folderChoice.accountKey === accountKey && folderList.some((folder) => folder.folderId === folderChoice.folderId)
    ? folderChoice.folderId
    : null;
  const folderId = chosenFolder ?? (folderList.find((folder) => folder.type === "Inbox") ?? folderList[0])?.folderId ?? null;

  const listArgs = { folderId: folderId ?? "", start, limit: MAIL_PAGE_SIZE, unreadOnly: filter === "unread" && !search, search };
  const [list, retryList] = useKeyedLoad(
    ready && account && folderId ? `list:${JSON.stringify([account.key, listArgs])}` : null,
    () => source.listMessages(account!, listArgs),
  );

  // A selection made before the accounts were known (preview deep link) belongs to the first account.
  const selected = selection && (selection.accountKey === null || selection.accountKey === accountKey)
    ? { folderId: selection.folderId, messageId: selection.messageId }
    : null;
  const messageKey = ready && account && selected ? `message:${account.key}:${selected.folderId}:${selected.messageId}` : null;
  const [message, retryMessage] = useKeyedLoad(messageKey, () => source.getMessage(account!, selected!));

  const mode: MailViewModel["mode"] = !status.configured ? "not_configured" : accounts.length === 0 ? "no_connection" : "ready";

  const actions: MailViewActions = {
    connect() {
      setBusyConnect(true);
      source.connect().then(
        () => setBusyConnect(false),
        (error: unknown) => {
          setBusyConnect(false);
          setNotice({ tone: "error", text: mailErrorText(mailFailure(error)) });
        },
      );
    },
    disconnect(connection) {
      if (!window.confirm(fmt(dict.disconnectConfirm, { email: connection.primaryEmail }))) return;
      setBusyConnectionId(connection.connectionId);
      source.disconnect(connection.connectionId).then(
        () => setBusyConnectionId(null),
        (error: unknown) => {
          setBusyConnectionId(null);
          setNotice({ tone: "error", text: mailErrorText(mailFailure(error)) });
        },
      );
    },
    dismissNotice: () => setNotice(null),
    selectAccount(key) {
      setAccountChoice(key);
      setFolderChoice(null);
      setStart(1);
      setSelection(null);
    },
    selectFolder(nextFolderId) {
      if (accountKey) setFolderChoice({ accountKey, folderId: nextFolderId });
      setSearch("");
      setSearchDraft("");
      setStart(1);
      setSelection(null);
    },
    setFilter(next) {
      setFilterState(next);
      setStart(1);
    },
    setSearchDraft,
    submitSearch() {
      setSearch(searchDraft.trim());
      setStart(1);
      setSelection(null);
    },
    clearSearch() {
      setSearch("");
      setSearchDraft("");
      setStart(1);
    },
    goToStart: (next) => setStart(Math.max(1, next)),
    retryFolders,
    retryList,
    selectMessage(nextFolderId, messageId) {
      setSelection({ accountKey, folderId: nextFolderId, messageId });
      setReaderFailure(null);
    },
    closeMessage: () => setSelection(null),
    retryMessage,
    showImages: () => setImagesFor(messageKey),
    markRead() {
      if (!account || !selected) return;
      const messageId = selected.messageId;
      setMarkingRead(true);
      setReaderFailure(null);
      source.markRead(account, messageId).then(
        () => {
          setMarkingRead(false);
          setReadIds((current) => new Set(current).add(messageId));
        },
        (error: unknown) => {
          setMarkingRead(false);
          setReaderFailure(mailFailure(error));
        },
      );
    },
    download(attachmentId) {
      if (!account || !selected) return;
      setDownloadingId(attachmentId);
      setReaderFailure(null);
      source.downloadAttachment(account, { ...selected, attachmentId }).then(
        () => setDownloadingId(null),
        (error: unknown) => {
          setDownloadingId(null);
          setReaderFailure(mailFailure(error));
        },
      );
    },
  };

  return {
    model: {
      mode,
      notice,
      connections: status.connections,
      busyConnect,
      busyConnectionId,
      accounts,
      accountKey,
      folders,
      folderId,
      filter,
      searchDraft,
      search,
      start,
      pageSize: MAIL_PAGE_SIZE,
      list,
      selected,
      message,
      readIds,
      showImages: messageKey !== null && imagesFor === messageKey,
      markingRead,
      downloadingId,
      readerFailure,
      now,
    },
    actions,
  };
}
