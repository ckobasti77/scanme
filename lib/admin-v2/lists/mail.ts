// ADMIN v2 — Pošta: the URL state of the sidebar (`nalog`, `folder`, `prikaz`,
// `q`) turned into the mailbox, the folder and the arguments of
// `adminMail.listMessages`, and what the page sends to the sidebar. Pure.

import { MAIL_FILTERS } from "@/lib/admin-v2/sidebar/configs/mail";
import type { SidebarLive, SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";

export type MailFilter = (typeof MAIL_FILTERS)[number];

/** The longest search the mail backend accepts (the field above the list had the same limit). */
export const MAIL_SEARCH_MAX = 100;

type MailboxRow = { key: string };
type FolderRow = { folderId: string; type: string };

/** The mailbox, the view and the search the URL asks for; without `nalog` (or with an unknown one) it is the first mailbox. */
export function mailSelection<Mailbox extends MailboxRow>(state: SidebarState, mailboxes: readonly Mailbox[]): { account: Mailbox | null; filter: MailFilter; search: string } {
  return {
    account: mailboxes.find((mailbox) => mailbox.key === state.nalog) ?? mailboxes[0] ?? null,
    filter: state.prikaz === "unread" ? "unread" : "all",
    search: (state.q ?? "").trim().slice(0, MAIL_SEARCH_MAX),
  };
}

function defaultFolder(folders: readonly FolderRow[]): FolderRow | undefined {
  return folders.find((folder) => folder.type === "Inbox") ?? folders[0];
}

/** The open folder: the one in the URL when the mailbox has it, otherwise Inbox, otherwise the first one. */
export function mailFolderId(state: SidebarState, folders: readonly FolderRow[]): string | null {
  return (folders.find((folder) => folder.folderId === state.folder) ?? defaultFolder(folders))?.folderId ?? null;
}

/** The arguments of `listMessages`: a search covers the whole mailbox, so the unread view does not apply to it. */
export function mailListArgs(folderId: string | null, start: number, limit: number, filter: MailFilter, search: string) {
  return { folderId: folderId ?? "", start, limit, unreadOnly: filter === "unread" && !search, search };
}

/** What a choice of folder writes: the default folder is not written, and choosing a folder ends the search. */
export function mailFolderPatch(folderId: string, folders: readonly FolderRow[]): SidebarPatch {
  return { folder: defaultFolder(folders)?.folderId === folderId ? null : folderId, q: null };
}

/** A mailbox has its own folders: changing it clears the folder; the first mailbox (the default) is never written. */
export function mailIntercept(mailboxes: readonly MailboxRow[]): (patch: SidebarPatch, state: SidebarState) => SidebarPatch {
  const first = mailboxes[0]?.key ?? null;
  const known = (key: string | null | undefined) => (key && mailboxes.some((mailbox) => mailbox.key === key) ? key : first);
  return (patch, state) => {
    if (!("nalog" in patch)) return patch;
    const chosen = known(patch.nalog);
    const next = { ...patch, nalog: chosen === first ? null : chosen };
    return chosen === known(state.nalog) || "folder" in patch ? next : { ...next, folder: null };
  };
}

/**
 * What Pošta sends to the sidebar: the folders with the open one (none while a
 * search runs: it covers the whole mailbox) and the mailboxes with the first
 * one as the value while `nalog` is absent.
 */
export function mailSidebarLive({ mailboxes, folders, folderId, search, onFolder }: {
  mailboxes: readonly (MailboxRow & { label: string })[];
  folders: readonly { folderId: string; label: string }[];
  folderId: string | null;
  search: string;
  onFolder: (folderId: string) => void;
}): SidebarLive {
  return {
    ...(folders.length ? { context: { value: search ? "" : folderId ?? "", options: folders.map((folder) => ({ value: folder.folderId, label: folder.label })), onChange: onFolder } } : {}),
    options: { nalog: mailboxes.map((mailbox) => ({ value: mailbox.key, label: mailbox.label })) },
    ...(mailboxes[0] ? { defaults: { nalog: mailboxes[0].key } } : {}),
    intercept: mailIntercept(mailboxes),
  };
}
