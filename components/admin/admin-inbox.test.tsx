import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { INBOX_CHANNELS, INBOX_STATUSES } from "@/lib/admin-v2/sidebar/configs/inbox";
import { inboxSidebarLive } from "@/lib/admin-v2/lists/inbox";
import { communicationsSr as dict } from "@/lib/i18n/sr/communications";

// ADMIN v2 — Inbox: the filters are in the sidebar of the admin frame; the page
// keeps the header, the conversations and the detail. SSR markup, no DOM.

const mocks = vi.hoisted(() => ({
  search: "",
  me: undefined as { id: string; name: string } | undefined,
  admins: undefined as { id: string; name: string; email: string }[] | undefined,
  listInboxArgs: [] as unknown[],
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args?: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref);
    if (name === "adminCommunications:me") return mocks.me;
    if (name === "adminTasks:listAdmins") return mocks.admins;
    return undefined;
  },
  useMutation: () => async () => undefined,
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    mocks.listInboxArgs.push(args);
    return { results: [], status: "LoadingFirstPage", loadMore: () => undefined };
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/inbox",
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

import { AdminConversationWorkspace, AdminInboxPreview } from "./admin-inbox";

beforeEach(() => {
  mocks.search = "";
  mocks.me = undefined;
  mocks.admins = undefined;
  mocks.listInboxArgs = [];
});

function preview(search = "") {
  mocks.search = search;
  return renderToStaticMarkup(<AdminInboxPreview />);
}

const lastArgs = () => mocks.listInboxArgs.at(-1);

describe("Inbox page", () => {
  test("one h1, the demo badge in the header and no filter block above the list", () => {
    const html = preview();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`>${dict.inboxTitle}</h1>`);
    expect(html).toContain(dict.previewBadge);
    // The only native select left is the status of the open conversation (the detail), not a filter.
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).toContain("conversation-status");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain("inbox-search");
    expect(html).not.toContain("inbox-status");
    expect(html).not.toContain("inbox-channel");
    expect(html).not.toContain("inbox-assignee");
    expect(html).not.toContain(`${dict.statusFilter}:`);
  });

  test("the conversation list carries the rows attribute, the open conversation is a card panel", () => {
    const html = preview();
    expect(html).toContain(`aria-label="${dict.conversationList}" data-admin-reveal="rows"`);
    expect(html).toContain('data-admin-reveal="card"');
  });

  test("the fixture rows follow the URL: all, by status, by assignee, by search", () => {
    const both = preview();
    expect(both).toContain("Bistro Zelen d.o.o.");
    expect(both).toContain("Studio Kadar");
    const needsReply = preview("?status=needs_reply");
    expect(needsReply).toContain("Bistro Zelen d.o.o.");
    expect(needsReply).not.toContain("Studio Kadar");
    const mine = preview("?assignee=mine");
    expect(mine).toContain("Studio Kadar");
    expect(mine).not.toContain("Bistro Zelen d.o.o.");
    const unassigned = preview("?assignee=unassigned&kanal=panel_chat");
    expect(unassigned).toContain("Bistro Zelen d.o.o.");
    expect(unassigned).not.toContain("Studio Kadar");
    const searched = preview("?q=logo");
    expect(searched).toContain("Studio Kadar");
    expect(searched).not.toContain("Bistro Zelen d.o.o.");
  });

  test("a filter without a match shows the empty state, not the detail", () => {
    const html = preview("?status=completed");
    expect(html).toContain(dict.noFilteredTitle);
    expect(html).toContain(dict.noFilteredBody);
    expect(html).not.toContain("Bistro Zelen d.o.o.");
    expect(html).not.toContain(dict.conversationDetail);
    // An invalid value is ignored: the list is whole.
    expect(preview("?status=nepostojeci")).toContain("Studio Kadar");
  });

  test("the header stays while the list loads; the filters reach the query", () => {
    mocks.search = "?status=needs_reply&q=logo&kanal=email&assignee=unassigned";
    const html = renderToStaticMarkup(<AdminConversationWorkspace />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(dict.inboxTitle);
    expect(html).toContain(dict.inboxSubtitle);
    expect(lastArgs()).toEqual({ search: "logo", status: "needs_reply", channel: "email", assignee: "unassigned" });
  });

  test("mine goes as the admin id once the admin is known", () => {
    mocks.search = "?assignee=mine";
    mocks.me = { id: "k57me", name: "TEST Admin" };
    renderToStaticMarkup(<AdminConversationWorkspace />);
    expect(lastArgs()).toEqual({ assignee: "k57me" });
  });

  test("mine waits for the admin: the list is not asked for until `me` answers", () => {
    mocks.search = "?assignee=mine&status=needs_reply";
    renderToStaticMarkup(<AdminConversationWorkspace />);
    expect(lastArgs()).toBe("skip");
    mocks.me = { id: "k57me", name: "TEST Admin" };
    renderToStaticMarkup(<AdminConversationWorkspace />);
    expect(lastArgs()).toEqual({ status: "needs_reply", assignee: "k57me" });
  });

  test("embedded in a profile: no h1, no URL filters, only the account and the contact", () => {
    mocks.search = "?status=needs_reply&q=logo&assignee=unassigned";
    const html = renderToStaticMarkup(
      <AdminConversationWorkspace embedded accountId={"acc1" as never} contactId={"con1" as never} contactName="TEST Kontakt" />,
    );
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("TEST Kontakt");
    expect(html).toContain(dict.profileOpenInbox);
    expect(lastArgs()).toEqual({ accountId: "acc1", contactId: "con1" });
  });
});

describe("Inbox sidebar", () => {
  const html = renderToStaticMarkup(
    <AdminSidebarView
      config={resolveAdminSidebar("/admin/inbox")}
      live={inboxSidebarLive([{ id: "a1", name: "TEST Admin Prvi" }])}
      state={{}}
      onPatch={() => undefined}
    />,
  );

  test("one search, three groups: status (5), kanal (5) and the assignee", () => {
    expect(html).toContain(dict.searchLabel);
    expect(html).toContain(`placeholder="${dict.searchPlaceholder}"`);
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html.match(/data-admin-filter-toggle=""/g)).toHaveLength(3);
    for (const label of [dict.statusFilter, dict.channelFilter, dict.assigneeFilter]) expect(html).toContain(`>${label}</span>`);
  });

  test("status and kanal list their five values as radio rows; the assignee has mine, unassigned and the admins", () => {
    const labels: string[] = [
      dict.statusNew, dict.statusNeedsReply, dict.statusInProgress, dict.statusWaitingClient, dict.statusCompleted,
      dict.channelPanelChat, dict.channelEmail, dict.channelPhone, dict.channelInPerson, dict.channelCopiedMessage,
      dict.assigneeMine, dict.assigneeUnassigned, "TEST Admin Prvi",
    ];
    for (const label of labels) expect(html).toContain(`>${label}</span>`);
    expect(INBOX_STATUSES).toHaveLength(5);
    expect(INBOX_CHANNELS).toHaveLength(5);
    // "Sve" (no filter) plus 5 + 5 + 3 options, each a radio.
    expect(html.match(/type="radio"/g)).toHaveLength(3 + 5 + 5 + 3);
  });

  test("a chosen filter shows as a chip", () => {
    const chosen = renderToStaticMarkup(
      <AdminSidebarView
        config={resolveAdminSidebar("/admin/inbox")}
        live={inboxSidebarLive([{ id: "a1", name: "TEST Admin Prvi" }])}
        state={{ status: "needs_reply", assignee: "a1" }}
        onPatch={() => undefined}
      />,
    );
    expect(chosen).toContain(`${dict.statusFilter}: ${dict.statusNeedsReply}`);
    expect(chosen).toContain(`${dict.assigneeFilter}: TEST Admin Prvi`);
  });
});
