// ADMIN v2 — the list of `Inbox` as pure functions: the URL state of the
// sidebar (lib/admin-v2/sidebar/configs/inbox.ts) becomes the filter arguments
// of `adminCommunications.listInbox`, the options of the assignee group and,
// in the demo preview, the filtering of the fixture rows.

import type { Id } from "@/convex/_generated/dataModel";
import { communicationsSr as dict } from "@/lib/i18n/sr/communications";
import { INBOX_CHANNELS, INBOX_STATUSES } from "@/lib/admin-v2/sidebar/configs/inbox";
import type { SidebarLive, SidebarOption, SidebarState } from "@/lib/admin-v2/sidebar/types";

type InboxStatus = (typeof INBOX_STATUSES)[number];
type InboxChannel = (typeof INBOX_CHANNELS)[number];

/** The part of the `listInbox` arguments that depends on the filters. */
export type InboxListArgs = {
  search?: string;
  status?: InboxStatus;
  channel?: InboxChannel;
  assignee?: Id<"users"> | "unassigned";
};

/** The admin the demo preview plays („Moji razgovori“ shows this one's conversations). */
export const INBOX_PREVIEW_ME = "fixture-admin";

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return values.find((item) => item === value);
}

/**
 * Sidebar state → filter arguments. `mine` needs the known admin (`meId`):
 * without it the argument is not sent (the list shows everything until `me`
 * answers).
 */
export function inboxListArgs(state: SidebarState, meId?: string | null): InboxListArgs {
  const status = oneOf(INBOX_STATUSES, state.status);
  const channel = oneOf(INBOX_CHANNELS, state.kanal);
  const assignee = state.assignee;
  return {
    ...(state.q ? { search: state.q } : {}),
    ...(status ? { status } : {}),
    ...(channel ? { channel } : {}),
    ...(assignee === "mine"
      ? meId ? { assignee: meId as Id<"users"> } : {}
      : assignee === "unassigned"
        ? { assignee: "unassigned" as const }
        : assignee
          ? { assignee: assignee as Id<"users"> }
          : {}),
  };
}

/** Options of the „Zaduženi“ group: mine, unassigned, then the admins. */
export function inboxAssigneeOptions(admins: readonly { id: string; name: string }[]): SidebarOption[] {
  return [
    { value: "mine", label: dict.assigneeMine },
    { value: "unassigned", label: dict.assigneeUnassigned },
    ...admins.map((admin) => ({ value: admin.id, label: admin.name })),
  ];
}

/** What the page sends to the sidebar: only the options it knows from its data. */
export function inboxSidebarLive(admins: readonly { id: string; name: string }[]): SidebarLive {
  return { options: { assignee: inboxAssigneeOptions(admins) } };
}

type PreviewRow = {
  status: string;
  channel: string;
  assigneeAdminId: string | null;
  accountName: string;
  contactName: string;
  businessName: string | null;
  smkCode: string;
  latestMessagePreview: string;
};

function fold(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** The demo preview has no server: the same filters over the fixture rows. */
export function filterPreviewInbox<T extends PreviewRow>(rows: readonly T[], state: SidebarState, meId: string = INBOX_PREVIEW_ME): T[] {
  const needle = state.q ? fold(state.q) : "";
  return rows.filter((row) => {
    if (state.status && row.status !== state.status) return false;
    if (state.kanal && row.channel !== state.kanal) return false;
    if (state.assignee === "unassigned" && row.assigneeAdminId) return false;
    if (state.assignee && state.assignee !== "unassigned") {
      const wanted = state.assignee === "mine" ? meId : state.assignee;
      if (row.assigneeAdminId !== wanted) return false;
    }
    if (needle) {
      const haystack = fold([row.accountName, row.contactName, row.businessName ?? "", row.smkCode, row.latestMessagePreview].join(" "));
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
