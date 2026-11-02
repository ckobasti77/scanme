import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { teamSidebarLive } from "@/lib/admin-v2/lists/team";
import { TEAM_URL_FIELDS, teamSidebar } from "@/lib/admin-v2/sidebar/configs/pages";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminTeamSr as dict } from "@/lib/i18n/sr/admin-team";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";

// ADMIN v2 / Tim — the choice of the member is in the sidebar only (no cards,
// no select), the view („Prikaz“) is in the sidebar and the URL, the header
// carries the member's name once. SSR markup, like the other admin views.

const mocks = vi.hoisted(() => ({
  search: "",
  members: [] as Array<Record<string, unknown>>,
  paginated: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === "adminTasks:teamOverview") return mocks.members;
    if (name === "adminTasks:listAdmins") return [];
    return undefined;
  },
  useMutation: () => async () => undefined,
  usePaginatedQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(query);
    mocks.paginated.push({ name, args });
    const filter = typeof args === "object" && args !== null ? (args as { assigneeId?: string; assignee?: string }) : {};
    const assigneeId = filter.assigneeId ?? filter.assignee;
    const results =
      name === "adminTasks:list" && assigneeId
        ? Array.from({ length: 5 }, (_, index) => ({
            id: `t${index + 1}`,
            smkCode: "SMK-TEST-001",
            smlCode: null,
            title: `TEST zadatak ${assigneeId} ${index + 1}`,
            accountName: "TEST Klijent",
            businessName: null,
            status: "open",
            timePhase: "none",
            assigneeId,
            assigneeName: "TEST zaduzeni",
          }))
        : name === "adminCommunications:listInbox" && assigneeId
          ? Array.from({ length: 4 }, (_, index) => ({
              id: `c${index + 1}`,
              smkCode: "SMK-TEST-001",
              accountName: `TEST razgovor ${assigneeId} ${index + 1}`,
              latestMessagePreview: "TEST poruka",
              assigneeAdminId: assigneeId,
            }))
          : [];
    return { results, status: "Exhausted", loadMore: () => undefined };
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tim",
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

// Imported after the mocks.
import { AdminTeamPreview, AdminTeamWorkspace } from "./admin-team";

beforeEach(() => {
  mocks.search = "";
  mocks.members = [];
  mocks.paginated = [];
});

const FIXTURE = { first: "TEST Operater A", second: "TEST Operater B", third: "TEST Operater C" };

function previewHtml(search = "") {
  mocks.search = search;
  return renderToStaticMarkup(<AdminTeamPreview />);
}

function workspaceHtml(search = "") {
  mocks.search = search;
  mocks.paginated = [];
  return renderToStaticMarkup(<AdminTeamWorkspace />);
}

/** The page without the rows of tasks and conversations (where the assignee is row data). */
function withoutRows(html: string) {
  return html.replace(/<article[\s\S]*?<\/article>/g, "");
}

const occurrences = (html: string, text: string) => html.split(text).length - 1;

describe("Tim page", () => {
  test("one header: a single h1 with the name of the chosen member, the member chosen only in the sidebar", () => {
    for (const html of [previewHtml(), previewHtml("?clan=preview-admin-b&tab=tasks")]) {
      expect(html.match(/<h1/g)).toHaveLength(1);
      // The only selects are the „Preraspodeli“ ones in the rows (data of the row).
      expect(withoutRows(html)).not.toContain("<select");
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('role="tab"');
      expect(html).not.toContain('role="radiogroup"');
      expect(html).not.toContain('type="search"');
    }
    expect(previewHtml()).toMatch(new RegExp(`<h1[^>]*>${FIXTURE.first}</h1>`));
    expect(previewHtml("?clan=preview-admin-b")).toMatch(new RegExp(`<h1[^>]*>${FIXTURE.second}</h1>`));
    expect(previewHtml("?clan=preview-admin-c")).toMatch(new RegExp(`<h1[^>]*>${FIXTURE.third}</h1>`));
    // An unknown member is the first one.
    expect(previewHtml("?clan=nepoznat")).toMatch(new RegExp(`<h1[^>]*>${FIXTURE.first}</h1>`));
  });

  test("the name is shown once and the e-mail of a member with a name is not shown", () => {
    for (const search of ["", "?tab=tasks", "?tab=conversations", "?clan=preview-admin-b"]) {
      const html = withoutRows(previewHtml(search));
      const name = search.includes("preview-admin-b") ? FIXTURE.second : FIXTURE.first;
      expect(occurrences(html, `>${name}<`)).toBe(1);
      expect(html).not.toContain("example.invalid");
    }
  });

  test("a member without a name is shown by the e-mail, once", () => {
    mocks.members = [{ id: "u1", name: "", email: "bez-imena@example.invalid", openTasks: 2, overdueTasks: 0, assignedConversations: 1, awaitingReaction: 0, countsCapped: false }];
    const html = workspaceHtml();
    expect(html).toMatch(/<h1[^>]*>bez-imena@example.invalid<\/h1>/);
    expect(occurrences(withoutRows(html), "bez-imena@example.invalid")).toBe(1);
  });

  test("the preview keeps its badge and says what it is", () => {
    const html = previewHtml();
    expect(html).toContain(dict.previewBadge);
    expect(html).toContain(dict.previewDescription);
  });

  test("four counters of the chosen member and two links with the member in the query", () => {
    const html = previewHtml("?clan=preview-admin-c");
    for (const label of [dict.openTasks, dict.overdueTasks, dict.conversations, dict.awaitingReaction]) expect(html).toContain(`${label}</span>`);
    expect(html).toMatch(/<strong[^>]*>8<\/strong>/);
    expect(html).toMatch(/<strong[^>]*>12<\/strong>/);
    expect(html).toContain('href="/admin/zadaci?assignee=preview-admin-c"');
    expect(html).toContain('href="/admin/inbox?assignee=preview-admin-c"');
    expect(html).toContain(dict.openAllTasks);
    expect(html).toContain(dict.openAllConversations);
  });

  test("the preview shows the tasks and conversations of the chosen member", () => {
    expect(previewHtml()).toContain("Pozovi zbog grace perioda");
    expect(previewHtml()).toContain("Da li kartice stižu ove nedelje?");
    expect(previewHtml()).not.toContain("Potvrdi prijem kartica");
    const second = previewHtml("?clan=preview-admin-b&tab=tasks");
    expect(second).toContain("Potvrdi prijem kartica");
    expect(second).not.toContain("Pozovi zbog grace perioda");
    expect(previewHtml("?clan=preview-admin-c&tab=conversations")).toContain(dict.noConversations);
  });

  test("the view comes from the URL: the overview has both lists, the others one", () => {
    const overview = previewHtml();
    expect(overview).toContain(dict.tasksTitle);
    expect(overview).toContain(dict.conversationsTitle);
    const tasks = previewHtml("?tab=tasks");
    expect(tasks).toContain(dict.tasksTitle);
    expect(tasks).not.toContain(dict.conversationsTitle);
    const conversations = previewHtml("?tab=conversations");
    expect(conversations).toContain(dict.conversationsTitle);
    expect(conversations).not.toContain(dict.tasksTitle);
    // An invalid view is the overview.
    expect(previewHtml("?tab=xyz")).toContain(dict.conversationsTitle);
  });

  test("the connected page sends the same arguments to the queries as before", () => {
    mocks.members = [
      { id: "u1", name: "TEST Član 1", email: "clan1@example.invalid", openTasks: 6, overdueTasks: 2, assignedConversations: 4, awaitingReaction: 1, countsCapped: false },
      { id: "u2", name: "TEST Član 2", email: "clan2@example.invalid", openTasks: 3, overdueTasks: 0, assignedConversations: 2, awaitingReaction: 0, countsCapped: true },
    ];
    workspaceHtml();
    expect(mocks.paginated).toEqual([
      { name: "adminTasks:list", args: { tab: "all", assigneeId: "u1" } },
      { name: "adminCommunications:listInbox", args: { assignee: "u1" } },
    ]);
    workspaceHtml("?clan=u2&tab=tasks");
    expect(mocks.paginated).toEqual([
      { name: "adminTasks:list", args: { tab: "all", assigneeId: "u2" } },
      { name: "adminCommunications:listInbox", args: { assignee: "u2" } },
    ]);
    workspaceHtml("?clan=nepoznat");
    expect(mocks.paginated[0]).toEqual({ name: "adminTasks:list", args: { tab: "all", assigneeId: "u1" } });
  });

  test("?clan=<other>&tab=tasks shows the tasks of the other member, the overview only the first three rows", () => {
    mocks.members = [
      { id: "u1", name: "TEST Član 1", email: "clan1@example.invalid", openTasks: 6, overdueTasks: 2, assignedConversations: 4, awaitingReaction: 1, countsCapped: false },
      { id: "u2", name: "TEST Član 2", email: "clan2@example.invalid", openTasks: 3, overdueTasks: 0, assignedConversations: 2, awaitingReaction: 0, countsCapped: true },
    ];
    const tasks = workspaceHtml("?clan=u2&tab=tasks");
    expect(tasks).toMatch(/<h1[^>]*>TEST Član 2<\/h1>/);
    expect(tasks.match(/<h3[^>]*>TEST zadatak u2 \d/g)).toHaveLength(5);
    expect(tasks).not.toContain("TEST zadatak u1");
    expect(tasks).not.toContain("TEST razgovor");
    expect(tasks).toContain(dict.countCapped);
    const overview = workspaceHtml("?clan=u2");
    expect(overview.match(/<h3[^>]*>TEST zadatak u2 \d/g)).toHaveLength(3);
    expect(overview.match(/<h3[^>]*>TEST razgovor u2 \d/g)).toHaveLength(3);
    expect(workspaceHtml("?tab=conversations").match(/<h3[^>]*>TEST razgovor u1 \d/g)).toHaveLength(4);
  });

  test("without members: the page title, the default empty state and nothing to choose", () => {
    const html = workspaceHtml();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${dict.pageTitle}</h1>`));
    expect(html).toContain(dict.pageSubtitle);
    expect(occurrences(html, dict.pageSubtitle)).toBe(1);
    expect(html).toContain('data-admin-primitive="empty"');
    expect(html).not.toContain(dict.openTasks);
    expect(html).not.toContain("<select");
    expect(mocks.paginated.map((call) => call.args)).toEqual(["skip", "skip"]);
  });

  test("the page carries the attributes of the reveal engine: counters as kpi, rows of tasks and conversations as rows", () => {
    const html = previewHtml();
    expect(html.match(/data-admin-reveal="kpi"/g)).toHaveLength(4);
    expect(html.match(/data-admin-tilt=""/g)).toHaveLength(4);
    expect(html.match(/<strong data-admin-count=""/g)).toHaveLength(4);
    // „Pregled“ lists the tasks and the conversations of the member: two row containers.
    expect(html.match(/data-admin-reveal="rows"/g)).toHaveLength(2);
  });
});

describe("Tim sidebar", () => {
  const members = [
    { id: "u1", name: "TEST Član 1", email: "clan1@example.invalid", openTasks: 6 },
    { id: "u2", name: "TEST Član 2", email: "clan2@example.invalid", openTasks: 0 },
    { id: "u3", name: "", email: "clan3@example.invalid", openTasks: 3 },
  ];
  const sidebarHtml = (search = "", memberId = "u1") =>
    renderToStaticMarkup(
      <AdminSidebarView
        config={resolveAdminSidebar("/admin/tim")}
        live={teamSidebarLive(members, memberId, () => undefined)}
        state={readUrlState(TEAM_URL_FIELDS, search)}
        onPatch={() => undefined}
      />,
    );

  test("the registry gives the configuration of the page: the member list and three views", () => {
    const config = resolveAdminSidebar("/admin/tim");
    expect(config).toBe(teamSidebar);
    expect(config.context?.list).toBe(true);
    expect(config.views?.items).toHaveLength(3);
  });

  test("the members are a radio list with the open tasks, without an accordion button", () => {
    const html = sidebarHtml();
    expect(html).toContain(`role="radiogroup" aria-label="${dict.selectMember}"`);
    expect(html).not.toContain("data-admin-filter-toggle");
    expect(html).not.toContain("aria-expanded");
    expect(html).toMatch(/>TEST Član 1<\/span><span[^>]*>6<\/span>/);
    expect(html).toMatch(/>TEST Član 2<\/span><span[^>]*>0<\/span>/);
    // A member without a name is listed by the e-mail.
    expect(html).toMatch(/>clan3@example.invalid<\/span><span[^>]*>3<\/span>/);
  });

  test("the chosen member is marked", () => {
    const checked = (html: string) => html.match(/<input type="radio" class="sr-only" name="[^"]*-clan" checked=""\/>[\s\S]*?<span[^>]*>([^<]*)<\/span>/)?.[1];
    expect(checked(sidebarHtml("", "u1"))).toBe("TEST Član 1");
    expect(checked(sidebarHtml("?clan=u2", "u2"))).toBe("TEST Član 2");
  });

  test("then „Prikaz“ with three views, the overview chosen by default", () => {
    const html = sidebarHtml();
    expect(html.indexOf(`aria-label="${dict.selectMember}"`)).toBeLessThan(html.indexOf(`aria-label="${adminUiSr.filters.view}"`));
    expect(html).toContain(`role="radiogroup" aria-label="${adminUiSr.filters.view}"`);
    for (const label of [dict.tabOverview, dict.tabTasks, dict.tabConversations]) expect(html).toContain(`>${label}</span>`);
    const views = html.slice(html.indexOf(`aria-label="${adminUiSr.filters.view}"`));
    expect(views.match(/type="radio"/g)).toHaveLength(3);
    expect(views.match(/checked=""/g)).toHaveLength(1);
    expect(views).toMatch(/checked=""[^>]*>[\s\S]*?>Pregled<\/span>/);
    expect(sidebarHtml("?tab=tasks").slice(html.indexOf(`aria-label="${adminUiSr.filters.view}"`))).toMatch(/checked=""[^>]*>[\s\S]*?>Zadaci<\/span>/);
  });
});
