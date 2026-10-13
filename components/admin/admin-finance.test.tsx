import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { financeSidebarLive } from "@/lib/admin-v2/lists/finance";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminFinanceSr } from "@/lib/i18n/sr/admin-finance";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";

// ADMIN v2 — Finansije: the view, the period and the category are in the
// sidebar of the admin frame and in the URL; the page keeps the header and the
// numbers. SSR markup, like the other admin views.

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
  usePathname: () => "/dev/admin-finance-preview",
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ push() {}, replace() {} }),
}));

const { FinanceChart, FinanceSurface } = await import("./admin-finance");

const dict = adminFinanceSr;
const ROUTE = "/admin/finansije";

function pageHtml(search: string) {
  query = search;
  return renderToStaticMarkup(<FinanceSurface preview />);
}

function sidebarHtml(search = "") {
  return renderToStaticMarkup(<AdminSidebarView config={resolveAdminSidebar(ROUTE, search)} live={financeSidebarLive()} state={{}} onPatch={() => undefined} />);
}

describe("ADMIN-14 finance UI", () => {
  test("chart has an accessible table fallback whose rows preserve the total", () => {
    const points = [
      { key: "2026-09-01", amountMinor: 12_000, undated: false },
      { key: "2026-09-02", amountMinor: 8_000, undated: false },
    ];
    const html = renderToStaticMarkup(<FinanceChart points={points} future={false} />);
    expect(html).toContain("<svg");
    expect(html).toContain(dict.chartTableCaption);
    expect(html).toContain("120,00");
    expect(html).toContain("80,00");
    expect(points.reduce((sum, point) => sum + point.amountMinor, 0)).toBe(20_000);
  });

  test("future chart keeps an undated bucket in the accessible fallback", () => {
    const html = renderToStaticMarkup(<FinanceChart points={[
      { key: "2026-10", amountMinor: 10_000, undated: false },
      { key: "undated", amountMinor: 5_000, undated: true },
    ]} future />);
    expect(html).toContain(dict.futureBadge);
    expect(html).toContain(dict.undated);
  });
});

describe("Finansije page", () => {
  test("one h1 in the header with the action; no filter block on the page", () => {
    const html = pageHtml("");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`>${dict.pageTitle}</h1>`);
    expect(html).toContain(dict.costAction);
    // X6 — the header action is the primary button (the named class, not an ink fill the stylesheet matches by substring).
    expect(html).toMatch(new RegExp(`<button[^>]*admin-button-primary[^>]*>(?:(?!</button>).)*${dict.costAction}`));
    expect(html).not.toMatch(/<(?:button|a)\b[^>]*bg-\[var\(--admin-ink\)\]/);
    expect(html).toContain(dict.previewBadge);
    expect(html).toContain('data-tone="waiting"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="search"');
    // The only buttons of the page are the action and the payment rows: no period / category chips.
    for (const label of [dict.periodMonth, dict.periodThree, dict.periodYear, dict.periodAll, dict.filterPhysical, dict.filterLinks, dict.filterMenu]) {
      expect(html).not.toMatch(new RegExp(`<button[^>]*>${label}</button>`));
    }
    // The period and the category are not on the page as controls.
    expect(html).not.toContain("<input");
  });

  test("the layout follows the width of the screen, not of the window; the tables do not scroll sideways", () => {
    const html = pageHtml("");
    expect(html).toContain("@container");
    expect(html).toContain("@4xl:grid-cols-");
    expect(html).toContain("@2xl:grid-cols-3");
    expect(html).toContain("@2xl:block");
    expect(html).toContain("@6xl:block");
    expect(html).not.toMatch(/\b(?:md|lg|xl):(?:block|hidden|grid-cols)/);
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("min-w-[");
  });

  test("the default URL shows the collected view of this month", () => {
    const html = pageHtml("");
    expect(html).toContain(dict.actualBadge);
    expect(html).toContain("Bistro Zelen");
    expect(html).toContain("Hotel Dunav");
    expect(html).toContain("Kafe Most");
  });

  test("?tab=expected draws the chart of the future period", () => {
    const html = pageHtml("?tab=expected&future=three_months");
    expect(html).toContain(`${dict.futureBadge}</span>`);
    // The undated bucket is only in the future series.
    expect(html).toContain(`<td class="py-2 pr-4">${dict.undated}</td>`);
    expect(html).toContain(dict.overdueKnown);
    const collected = pageHtml("");
    expect(collected).not.toContain(`<td class="py-2 pr-4">${dict.undated}</td>`);
    expect(collected).not.toContain(dict.overdueKnown);
  });

  test("?tab=profit shows the profit columns of the category table", () => {
    const html = pageHtml("?tab=profit&profit=physical");
    expect(html).toContain(`<th class="px-5 py-3 text-right">${dict.profit}</th>`);
    expect(pageHtml("")).not.toContain(`<th class="px-5 py-3 text-right">${dict.profit}</th>`);
  });

  test("the category of the URL filters the payments, like the list query does", () => {
    const physical = pageHtml("?filter=physical");
    expect(physical).toContain("Hotel Dunav");
    expect(physical).not.toContain("Kafe Most");
    const links = pageHtml("?filter=scanme_links");
    expect(links).toContain("Kafe Most");
    expect(links).toContain("Bistro Zelen");
    expect(links).not.toContain("Hotel Dunav");
    // Profit has its own category; `filter` does not apply there.
    const profit = pageHtml("?tab=profit&filter=physical");
    expect(profit).toContain("Kafe Most");
    expect(profit).toContain("Hotel Dunav");
    expect(pageHtml("?tab=profit&profit=premium")).not.toContain("Kafe Most");
    // An invalid value reads as the default.
    expect(pageHtml("?filter=nepostojece")).toContain("Kafe Most");
  });

  test("the page carries the attributes of the reveal engine: amounts as kpi, chart drawn, bars and tables as rows", () => {
    const html = pageHtml("");
    expect(html.match(/data-admin-reveal="kpi"/g)).toHaveLength(3);
    expect(html.match(/data-admin-tilt=""/g)).toHaveLength(3);
    // The profit of the preview is incomplete („—“), so it is not a number to count up.
    expect(html.match(/data-admin-count=""/g)).toHaveLength(2);
    expect(html).toContain('data-admin-draw="line"');
    expect(html).toContain('data-admin-area=""');
    expect(html).toContain('data-admin-dot=""');
    expect(html).toContain('data-admin-draw="bars"');
    expect(html).toContain('data-admin-bar="x"');
    expect(html).toContain('<tbody data-admin-reveal="rows">');
    expect(html).toContain('data-admin-reveal="rows"');
  });
});

describe("Finansije sidebar", () => {
  const radios = (html: string, group: string) => html.match(new RegExp(`<input type="radio"[^>]*name="[^"]*-${group}"`, "g"))?.length ?? 0;

  test("the three views", () => {
    const html = sidebarHtml();
    for (const label of [dict.tabCollected, dict.tabExpected, dict.tabProfit]) expect(html).toContain(label);
    expect(html).toContain(`aria-label="${adminUiSr.filters.view}"`);
    expect(html).not.toContain("<select");
  });

  test("Naplaćeno: Period (5) and Kategorija (7), each with its default marked and no Sve", () => {
    const html = sidebarHtml();
    expect(html.match(/data-admin-filter-toggle=""/g)).toHaveLength(2);
    expect(html).toContain(`>${dict.periodLabel}</span>`);
    expect(html).toContain(`>${dict.filterLabel}</span>`);
    expect(radios(html, "period")).toBe(5);
    expect(radios(html, "filter")).toBe(7);
    expect(html).toContain(`> · ${dict.periodMonth}</span>`);
    expect(html).toContain(`> · ${dict.filterTotal}</span>`);
    expect(html).toMatch(new RegExp(`<input type="radio"[^>]*checked=""[^>]*/><span[^>]*>${dict.periodMonth}<`));
    expect(html).toMatch(new RegExp(`<input type="radio"[^>]*checked=""[^>]*/><span[^>]*>${dict.filterTotal}<`));
    expect(html).not.toContain(`>${adminUiSr.filters.any}<`);
    expect(html).not.toContain(adminUiSr.filters.clearAll);
  });

  test("Očekivano: the future period (4) and the same categories (7)", () => {
    const html = sidebarHtml("?tab=expected");
    expect(radios(html, "future")).toBe(4);
    expect(radios(html, "period")).toBe(0);
    expect(radios(html, "filter")).toBe(7);
    expect(html).toContain(`> · ${dict.periodNextMonth}</span>`);
    expect(html).toMatch(new RegExp(`<input type="radio"[^>]*checked=""[^>]*/><span[^>]*>${dict.periodNextMonth}<`));
    expect(html).not.toContain(`>${adminUiSr.filters.any}<`);
  });

  test("Profit: the collected period (5) and the categories of profit (4)", () => {
    const html = sidebarHtml("?tab=profit");
    expect(radios(html, "period")).toBe(5);
    expect(radios(html, "profit")).toBe(4);
    expect(radios(html, "filter")).toBe(0);
    expect(html).toContain(`> · ${dict.periodMonth}</span>`);
    expect(html).toContain(`> · ${dict.filterTotal}</span>`);
    expect(html).not.toContain(dict.filterLinks);
    expect(html).not.toContain(`>${adminUiSr.filters.any}<`);
  });
});
