import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { groupControlKind } from "@/lib/admin-v2/sidebar/accordion";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { tasksSidebarLive } from "@/lib/admin-v2/lists/tasks";
import { TASK_SUBJECTS, TASK_VIEWS, TASKS_URL_FIELDS, tasksSidebar } from "@/lib/admin-v2/sidebar/configs/tasks";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminTasksSr as dict } from "@/lib/i18n/sr/admin-tasks";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";

// ADMIN v2 / Zadaci — the page has no filter block above the list (one
// header, no tabs, no selects, no search field); the filters are in the
// sidebar and in the URL. SSR markup, like the other admin views.

const mocks = vi.hoisted(() => ({
  search: "",
  paginated: [] as unknown[],
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
  usePaginatedQuery: (_query: unknown, args: unknown) => {
    mocks.paginated.push(args);
    return { results: [], status: "LoadingFirstPage", loadMore: () => undefined };
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/zadaci",
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

// Imported after the mocks.
import { AdminTasksPreview, AdminTasksWorkspace } from "./admin-tasks";

beforeEach(() => {
  mocks.search = "";
  mocks.paginated = [];
});

function previewHtml(search = "") {
  mocks.search = search;
  return renderToStaticMarkup(<AdminTasksPreview />);
}

const FIXTURE_TITLES = {
  grace: "Pozovi zbog grace perioda",
  qr: "Proveri neispravan QR",
  cards: "Potvrdi prijem kartica",
  offer: "Pošalji ponudu za dopunu",
  design: "Uskladi dizajn kartice",
};

/** Titles of the fixture tasks that are in the markup (the table and the cards both list a row, so it is a set). */
function shown(html: string) {
  return Object.entries(FIXTURE_TITLES).filter(([, title]) => html.includes(title)).map(([key]) => key);
}

describe("Zadaci page", () => {
  test("one header: a single h1, no tabs, no selects, no search field above the list", () => {
    for (const html of [previewHtml(), previewHtml("?pogled=overdue&q=qr")]) {
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain(dict.pageTitle);
      expect(html).toContain(dict.pageSubtitle);
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('role="tab"');
      expect(html).not.toContain("<select");
      expect(html).not.toContain('type="search"');
      expect(html).not.toContain(`placeholder="${dict.searchPlaceholder}"`);
      expect(html).toContain(dict.createAction);
    }
  });

  test("the preview keeps its badge and says what it is", () => {
    const html = previewHtml();
    expect(html).toContain(dict.previewBadge);
    expect(html).toContain(dict.previewDescription);
  });

  test("the table and the cards follow the width of the list, not the window", () => {
    const html = previewHtml();
    expect(html).toContain("@container");
    expect(html).toContain("hidden @4xl:block");
    expect(html).toContain("@4xl:hidden");
    expect(html).not.toMatch(/\bmd:(hidden|block)\b/);
  });

  test("the table body and the card list carry the rows attribute, the preview note the text attribute", () => {
    const html = previewHtml();
    expect(html).toContain('<tbody data-admin-reveal="rows"');
    expect(html).toContain('data-admin-reveal="rows" class="grid gap-3 @4xl:hidden"');
    expect(html).toContain('<p data-admin-reveal="text"');
  });

  test("the preview filters by the URL", () => {
    expect(shown(previewHtml())).toEqual(["grace", "qr", "cards"]);
    expect(shown(previewHtml("?pogled=today"))).toEqual(["grace", "cards"]);
    expect(shown(previewHtml("?pogled=overdue"))).toEqual(["qr"]);
    expect(shown(previewHtml("?pogled=deferred"))).toEqual(["offer"]);
    expect(shown(previewHtml("?pogled=completed"))).toEqual(["design"]);
    expect(shown(previewHtml("?assignee=preview-admin-jovan"))).toEqual(["qr"]);
    expect(shown(previewHtml("?klijent=preview-account-vrbak"))).toEqual(["qr"]);
    expect(shown(previewHtml("?q=ponudu&pogled=deferred"))).toEqual(["offer"]);
    expect(shown(previewHtml("?objekat=venue"))).toEqual(["grace", "qr", "cards"]);
    expect(shown(previewHtml("?objekat=order"))).toEqual([]);
    // An invalid value is ignored.
    expect(shown(previewHtml("?pogled=xyz&objekat=none"))).toEqual(["grace", "qr", "cards"]);
  });

  test("the venue filter works in the preview (a venue of the chosen client)", () => {
    expect(shown(previewHtml("?klijent=preview-account-most&lokal=preview-business-0"))).toEqual(["grace"]);
    expect(shown(previewHtml("?klijent=preview-account-most&lokal=preview-business-3"))).toEqual([]);
    expect(shown(previewHtml("?pogled=deferred&klijent=preview-account-most&lokal=preview-business-3"))).toEqual(["offer"]);
  });

  test("nothing matches: the empty state, no filter block", () => {
    const html = previewHtml("?q=nepostojeci");
    expect(html).toContain(dict.noResultsTitle);
    expect(shown(html)).toEqual([]);
  });

  test("the connected page sends the same arguments to adminTasks.list as before", () => {
    const run = (search: string) => {
      mocks.search = search;
      mocks.paginated = [];
      const html = renderToStaticMarkup(<AdminTasksWorkspace />);
      return { html, args: mocks.paginated[0] };
    };
    const empty = run("");
    expect(empty.args).toEqual({ tab: "all" });
    expect(empty.html.match(/<h1/g)).toHaveLength(1);
    expect(empty.html).not.toContain('role="tablist"');
    expect(empty.html).not.toContain("<select");
    expect(run("?pogled=deferred").args).toEqual({ tab: "deferred" });
    expect(run("?pogled=xyz&objekat=none").args).toEqual({ tab: "all" });
    expect(run("?pogled=today&q=%20grace%20&assignee=test-admin-1&klijent=test-account-1&lokal=test-venue-1&objekat=venue&task=t1").args).toEqual({
      tab: "today",
      search: "grace",
      assigneeId: "test-admin-1",
      accountId: "test-account-1",
      businessId: "test-venue-1",
      subjectKind: "venue",
    });
  });
});

describe("Zadaci sidebar", () => {
  const live = tasksSidebarLive({
    admins: [{ id: "test-admin-1", name: "TEST Admin 1" }, { id: "test-admin-2", name: "TEST Admin 2" }],
    accounts: [{ id: "test-account-1", name: "TEST Klijent 1", smkCode: "SMK-TEST-001" }, { id: "test-account-2", name: "TEST Klijent 2", smkCode: "SMK-TEST-002" }],
    venues: [],
  });
  const sidebarHtml = (search = "") =>
    renderToStaticMarkup(
      <AdminSidebarView config={resolveAdminSidebar("/admin/zadaci")} live={live} state={readUrlState(TASKS_URL_FIELDS, search)} onPatch={() => undefined} />,
    );

  test("the registry gives the configuration of the page: five views, search, four groups", () => {
    const config = resolveAdminSidebar("/admin/zadaci");
    expect(config).toBe(tasksSidebar);
    expect(config.views?.items).toHaveLength(5);
    expect(config.groups?.map((group) => group.id)).toEqual(["assignee", "klijent", "lokal", "objekat"]);
  });

  test("the five views, one search and the four groups are drawn", () => {
    const html = sidebarHtml();
    for (const label of [dict.tabAll, dict.tabToday, dict.tabOverdue, dict.tabDeferred, dict.tabCompleted]) expect(html).toContain(`>${label}</span>`);
    expect(TASK_VIEWS).toHaveLength(5);
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain(`placeholder="${dict.searchPlaceholder}"`);
    for (const label of [dict.filterAssignee, dict.filterClient, dict.filterVenue, dict.filterSubject]) expect(html).toContain(`>${label}</span>`);
    expect(html.match(/data-admin-filter-toggle=""/g)).toHaveLength(4);
    expect(html).not.toContain('aria-expanded="true"');
  });

  test("the options come from the page: assignees by name, clients by name with the SMK code", () => {
    const html = sidebarHtml();
    expect(html).toContain(">TEST Admin 1</span>");
    expect(html).toContain(">TEST Klijent 2</span>");
    expect(html).not.toContain("SMK-TEST-001");
  });

  test("„Vezani objekat“ has eleven options and is a search-select", () => {
    expect(TASK_SUBJECTS).toHaveLength(11);
    expect(tasksSidebar.groups?.find((group) => group.id === "objekat")?.options).toHaveLength(11);
    expect(groupControlKind(11)).toBe("search");
    const html = sidebarHtml();
    expect(html.match(/role="combobox"/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="${adminUiSr.filters.searchIn.replace("{group}", dict.filterSubject)}"`);
  });

  test("„Lokal“ without a client says to choose the client first", () => {
    const html = sidebarHtml();
    expect(html).toContain(dict.filterVenueNeedsClient);
    // With a client chosen and its venues sent, the hint gives way to the options.
    const withVenues = renderToStaticMarkup(
      <AdminSidebarView
        config={resolveAdminSidebar("/admin/zadaci")}
        live={tasksSidebarLive({ admins: [], accounts: [{ id: "test-account-1", name: "TEST Klijent 1", smkCode: "SMK-TEST-001" }], venues: [{ id: "test-venue-1", name: "TEST Lokal 1", smlCode: "SML-TEST-001" }] })}
        state={readUrlState(TASKS_URL_FIELDS, "?klijent=test-account-1")}
        onPatch={() => undefined}
      />,
    );
    expect(withVenues).not.toContain(dict.filterVenueNeedsClient);
    expect(withVenues).toContain(">TEST Lokal 1</span>");
  });

  test("the header of a group names the choice and a chip removes it", () => {
    const html = sidebarHtml("?pogled=overdue&assignee=test-admin-2&klijent=test-account-1");
    expect(html).toContain(`<span class="text-[var(--admin-text-muted)]"> · TEST Admin 2</span>`);
    expect(html).toContain(`aria-label="${adminUiSr.filters.removeChip.replace("{label}", `${dict.filterClient}: TEST Klijent 1`)}"`);
  });
});
