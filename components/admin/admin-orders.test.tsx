import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { ordersSidebarLive } from "@/lib/admin-v2/lists/orders";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import type { SidebarState } from "@/lib/admin-v2/sidebar/types";
import { adminOrdersSr } from "@/lib/i18n/sr/admin-orders";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

// ADMIN v2 — Porudžbine: the filters are in the sidebar of the admin frame and
// in the URL; the page keeps only the header and the list. SSR markup, like
// the other admin views.

// The shared next/link stub drops every prop except href/className; aria-current is checked here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

let query = "";
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/admin-orders-preview",
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ push() {}, replace() {} }),
}));

const { AdminOrdersPreview } = await import("./admin-orders");

const dict = adminOrdersSr;
const ROUTE = "/admin/operativa/porudzbine";
const admins = [{ id: "TESTadmin1", name: "TEST Admin Jedan" }, { id: "TESTadmin2", name: "TEST Admin Dva" }];

function pageHtml(search: string) {
  query = search;
  return renderToStaticMarkup(<AdminOrdersPreview />);
}

function sidebarHtml(state: SidebarState = {}) {
  return renderToStaticMarkup(<AdminSidebarView config={resolveAdminSidebar(ROUTE)} live={ordersSidebarLive(admins)} state={state} onPatch={() => undefined} />);
}

describe("Porudžbine page", () => {
  test("one h1 in the header; no filter block on the page", () => {
    const html = pageHtml("");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`>${dict.pageTitle}</h1>`);
    expect(html).toContain(adminV1Sr.navOperations);
    expect(html).toContain(dict.previewBadge);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain("<input");
    expect(html).not.toContain(dict.filterProblems);
  });

  test("the list chooses table or cards by the width of the list, not of the window", () => {
    const html = pageHtml("");
    expect(html).toContain("@container");
    // The table from 56 rem of list width, the cards below it; the three secondary columns from 72 rem.
    expect(html).toContain("hidden @4xl:block");
    expect(html).toContain("@4xl:hidden");
    expect(html).toContain("hidden @6xl:table-cell");
    expect(html).not.toMatch(/\b(?:lg|xl):(?:block|hidden)\b/);
    expect(html).not.toContain("overflow-x-auto");
  });

  test("the default URL shows the active orders, newest first", () => {
    const html = pageHtml("");
    expect(html).toContain("SMP-20260910-A0B0C0");
    expect(html).not.toContain("SMP-20260914-A4B4C4");
    const codes = [...html.matchAll(/<strong class="block text-sm">(SMP-[A-Z0-9-]+)<\/strong>/g)].map((match) => match[1]);
    expect(codes.slice(0, 4)).toEqual(["SMP-20260913-A3B3C3", "SMP-20260912-A2B2C2", "SMP-20260911-A1B1C1", "SMP-20260910-A0B0C0"]);
  });

  test("the URL chooses the view, the filters and the sort", () => {
    expect(pageHtml("?pogled=completed")).toContain("SMP-20260914-A4B4C4");
    expect(pageHtml("?pogled=completed")).not.toContain("SMP-20260910-A0B0C0");
    const problem = pageHtml("?problem=da");
    expect(problem).toContain("SMP-20260912-A2B2C2");
    expect(problem).not.toContain("SMP-20260910-A0B0C0");
    const payment = pageHtml("?uplata=awaiting_payment");
    expect(payment).toContain("SMP-20260910-A0B0C0");
    expect(payment).not.toContain("SMP-20260911-A1B1C1");
    const oldest = pageHtml("?sort=updated_asc");
    expect(oldest.indexOf("SMP-20260910-A0B0C0")).toBeLessThan(oldest.indexOf("SMP-20260913-A3B3C3"));
  });

  test("no match shows the empty state; a search with another sort says why the order is not the chosen one", () => {
    const none = pageHtml("?q=nepostojece");
    expect(none).toContain(dict.noResultsTitle);
    expect(none).not.toContain(dict.sortSearchHint);
    const hint = pageHtml("?q=TEST&sort=updated_asc");
    expect(hint).toContain(dict.sortSearchHint);
    expect(pageHtml("?sort=updated_asc")).not.toContain(dict.sortSearchHint);
    expect(pageHtml("?q=bistro")).not.toContain(dict.sortSearchHint);
  });
});

describe("Porudžbine sidebar", () => {
  test("the area navigation names Porudžbine as the current page", () => {
    const html = sidebarHtml();
    for (const label of [adminV1Sr.navProducts, adminV1Sr.navQrCodes, adminV1Sr.navOrders]) expect(html).toContain(label);
    expect(html).toMatch(new RegExp(`aria-current="page"[^>]*>(?:(?!</a>).)*${adminV1Sr.navOrders}`));
  });

  test("the three views, the search and the groups", () => {
    const html = sidebarHtml();
    for (const label of [dict.tabActive, dict.tabCompleted, dict.tabArchived]) expect(html).toContain(label);
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain(`placeholder="${dict.searchPlaceholder}"`);
    expect(html).toContain('aria-label="Pogledi"');
    for (const label of [dict.filterAssignee, dict.filterPayment, dict.filterDesign, dict.filterFulfillment, dict.problems]) {
      expect(html).toContain(`>${label}</span>`);
    }
    // Five groups, each a toggle of the accordion; the sort is a radio list of its own.
    expect(html.match(/data-admin-filter-toggle=""/g)).toHaveLength(5);
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).toContain(`aria-label="${dict.sortLabel}"`);
    for (const label of [dict.sortNewest, dict.sortOldest]) expect(html).toContain(`>${label}</span>`);
    // The assignees come from the page; Izvršenje has ten options, so it is a search-select.
    for (const admin of admins) expect(html).toContain(`>${admin.name}</span>`);
    expect(html.match(/role="combobox"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Pretraži: Izvršenje"');
    expect(html).not.toContain("<select");
  });

  test("a chosen filter shows as a chip and as the summary of its group", () => {
    const html = sidebarHtml({ uplata: "paid", assignee: "TESTadmin2", problem: "da" });
    expect(html).toContain(`${dict.filterPayment}: ${dict.paymentPaid}`);
    expect(html).toContain(`${dict.filterAssignee}: TEST Admin Dva`);
    expect(html).toContain(`${dict.problems}: ${dict.filterProblems}`);
  });
});
