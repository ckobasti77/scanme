// ADMIN v2 — Pošta: the folders of the chosen mailbox are the context (an
// always open list the page fills), „Sve / Nepročitane“ the view, the search
// of the whole mailbox the sidebar search and the mailbox a group that always
// has a value (the first mailbox until another is chosen). The search is
// written on Enter: every search is a call to Zoho.

import { sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { postaSr as dict } from "@/lib/i18n/sr/posta";
import type { SidebarConfig } from "../types";

export const MAIL_FILTERS = ["all", "unread"] as const;

export const mailSidebar: SidebarConfig = {
  id: "posta",
  // The folders come from the page; the choice is the page's `folder` key.
  context: { id: "folder", label: dict.foldersLabel, list: true },
  views: {
    key: "prikaz",
    label: dict.filterLabel,
    defaultValue: "all",
    items: [
      { value: "all", label: dict.filterAll },
      { value: "unread", label: dict.filterUnread },
    ],
  },
  search: { key: "q", label: dict.searchLabel, placeholder: dict.searchPlaceholder, submit: true },
  groups: [{ id: "nalog", label: dict.mailboxLabel, emptyText: dict.noConnectionTitle }],
};

/** `status` and `kod` of the OAuth callback are the page's own parameters and are not here. */
export const MAIL_URL_FIELDS = sidebarUrlFields(mailSidebar);
