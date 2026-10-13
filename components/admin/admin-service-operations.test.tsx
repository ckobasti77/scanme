import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { SERVICE_SORTS, SERVICE_VIEWS } from "@/lib/admin-v2/sidebar/configs/services";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminServicesSr as dict } from "@/lib/i18n/sr/admin-services";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

// ADMIN v2 Usluge — one component for Links, Review and Meni. The views,
// search and sort are in the sidebar of the frame and in the URL; the screen
// has the header, the list and the detail panel and nothing else above them.

const { query } = vi.hoisted(() => ({ query: { current: "" } }));

vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: () => undefined }),
  useQuery: () => undefined,
  useMutation: () => () => Promise.resolve(),
}));
// The shared next/link stub drops aria-current; the sidebar navigation is checked by it.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/admin-services-preview",
  useSearchParams: () => new URLSearchParams(query.current),
  useRouter: () => ({ push() {}, replace() {} }),
}));

import { AdminServiceOperations } from "./admin-service-operations";

type ServiceType = "scanme_links" | "google_review" | "scanme_menu";

beforeEach(() => {
  query.current = "";
});

function page(serviceType: ServiceType, search = "") {
  query.current = search;
  return renderToStaticMarkup(<AdminServiceOperations serviceType={serviceType} preview />);
}

function sidebar(path: string, state: Record<string, string> = {}) {
  return renderToStaticMarkup(<AdminSidebarView config={resolveAdminSidebar(path)} live={{}} state={state} onPatch={() => undefined} />);
}

describe("Usluge page", () => {
  test("one h1 with the service title, the area as the eyebrow, the demo badge in the header", () => {
    for (const [type, title] of [["scanme_links", dict.titleLinks], ["google_review", dict.titleReview], ["scanme_menu", dict.titleMenu]] as const) {
      const html = page(type);
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain(`>${title}</h1>`);
      expect(html).toContain(`uppercase [overflow-wrap:anywhere]">${adminV1Sr.navServices}</p>`);
      expect(html).toContain(dict.previewDescription);
      expect(html).toContain(dict.previewBadge);
    }
  });

  test("no pills to the other services, no select, no chips, no search field above the list", () => {
    const html = page("google_review");
    expect(html).not.toContain("/admin/usluge/review");
    expect(html).not.toContain("/dev/admin-services-preview?service=");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain(`>${dict.filterGrace}<`);
    expect(html).not.toContain(dict.sortLabel);
  });

  test("the list is of the service in the URL view; the detail panel stays on the screen", () => {
    const links = page("scanme_links");
    expect(links).toContain("Probni lokal — Kej");
    expect(links).not.toContain("Probni lokal — Centar");
    expect(links).toContain(dict.tableCaption);
    expect(links).toContain("<aside");
    expect(links).toContain(dict.selectedVenue);
    expect(page("google_review")).toContain("Probni lokal — Centar");
  });

  test("a view from the URL narrows the list; no match shows the filtered empty state", () => {
    expect(page("scanme_menu", "?pogled=problem")).toContain("Probni lokal — Terasa");
    const none = page("scanme_menu", "?pogled=active");
    expect(none).not.toContain("Probni lokal — Terasa");
    expect(none).toContain(dict.emptyFilteredTitle);
    expect(page("scanme_links", "?q=nema-takvog")).toContain(dict.emptyFilteredTitle);
    expect(page("scanme_links", "?q=SML-DEMO-01")).toContain("Probni lokal — Kej");
  });

  test("an invalid view or sort is ignored", () => {
    const html = page("scanme_links", "?pogled=warning&sort=x");
    expect(html).toContain("Probni lokal — Kej");
    expect(html).not.toContain(dict.emptyFilteredTitle);
  });

  test("the table and the cards follow the width of the list, not of the window", () => {
    const html = page("scanme_links");
    expect(html).toContain("@4xl:grid-cols-");
    expect(html).toContain("@4xl:block");
    expect(html).toContain("@4xl:hidden");
    expect(html).not.toMatch(/\bxl:/);
    expect(html).not.toContain("overflow-x-auto");
    // The list panel does not clip (it would switch the sticky header off); only the detail panel does.
    expect(html.split("<aside")[0]).not.toContain("overflow-hidden");
  });
});

describe("Usluge sidebar", () => {
  test("area navigation with three links and the current service marked", () => {
    const html = sidebar("/admin/usluge/review");
    expect(html).toContain(`aria-label="${adminUiSr.frame.areaNav}"`);
    for (const path of ["/admin/usluge/links", "/admin/usluge/review", "/admin/usluge/meni"]) expect(html).toContain(`href="${path}"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/admin\/usluge\/review"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/admin\/usluge\/review"/);
    for (const label of [dict.tabLinks, dict.tabReview, dict.tabMenu]) expect(html).toContain(label);
  });

  test("five views, one search, three sorts", () => {
    const html = sidebar("/admin/usluge/review");
    const views = html.split(`aria-label="${adminUiSr.filters.views}"`)[1].split('data-sidebar-block="filters"')[0];
    expect(views.match(/type="radio"/g)).toHaveLength(SERVICE_VIEWS.length);
    for (const label of [dict.filterAll, dict.filterActive, dict.filterGrace, dict.filterPaused, dict.filterProblem]) expect(views).toContain(`>${label}</span>`);
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain(dict.searchLabel);
    expect(html).toContain(`placeholder="${dict.searchPlaceholder}"`);
    const sort = html.split(`aria-label="${adminUiSr.filters.sort}"`)[1];
    expect(sort.match(/type="radio"/g)).toHaveLength(SERVICE_SORTS.length);
    for (const label of [dict.sortUrgency, dict.sortName, dict.sortRecent]) expect(sort).toContain(`>${label}</span>`);
  });

  test("the same sidebar for the other two services, with their own current page", () => {
    for (const [path, label] of [["/admin/usluge/links", dict.tabLinks], ["/admin/usluge/meni", dict.tabMenu]] as const) {
      const html = sidebar(path);
      expect(html.match(/type="radio"/g)).toHaveLength(SERVICE_VIEWS.length + SERVICE_SORTS.length);
      expect(html).toMatch(new RegExp(`aria-current="page"[^>]*><span[^>]*>${label}</span>`));
    }
  });

  test("the chosen view and sort are checked", () => {
    const html = sidebar("/admin/usluge/review", { pogled: "grace", sort: "name" });
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });
});

describe("Usluge reveal attributes", () => {
  test("the table body and the mobile rows are rows of the reveal engine", () => {
    const html = page("scanme_links");
    expect(html).toContain('<tbody data-admin-reveal="rows"');
    expect(html).toContain('<div data-admin-reveal="rows" class="divide-y');
    expect(html).toContain('data-admin-reveal="card"');
  });
});
