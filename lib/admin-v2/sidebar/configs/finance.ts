// ADMIN v2 — sidebar of `Finansije`: the view (Naplaćeno, Očekivano, Profit),
// the period and the category. The keys and values are the ones the page
// already keeps in the URL (`tab`, `period`, `future`, `filter`, `profit`);
// which period and category apply depends on the view. A period and a
// category always have a value, so their groups have no "Sve".

import { COLLECTED_PERIODS, EXPECTED_PERIODS, FINANCE_FILTERS, PROFIT_FILTERS, type FinanceCollectedPeriod, type FinanceExpectedPeriod, type FinanceFilter } from "@/lib/admin-v1/finance";
import { sidebarUrlFields, type UrlField } from "@/lib/admin-v2/query/url-state";
import { adminFinanceSr as dict } from "@/lib/i18n/sr/admin-finance";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import type { SidebarConfig, SidebarGroup, SidebarViews } from "../types";

export const FINANCE_TABS = ["collected", "expected", "profit"] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

const PERIOD_LABELS: Record<FinanceCollectedPeriod | FinanceExpectedPeriod, string> = {
  month: dict.periodMonth,
  next_month: dict.periodNextMonth,
  three_months: dict.periodThree,
  six_months: dict.periodSix,
  year: dict.periodYear,
  all_time: dict.periodAll,
};

const FILTER_LABELS: Record<FinanceFilter, string> = {
  total: dict.filterTotal,
  physical: dict.filterPhysical,
  saas: dict.filterSaas,
  premium: dict.filterPremium,
  scanme_links: dict.filterLinks,
  google_review: dict.filterReview,
  scanme_menu: dict.filterMenu,
};

const views: SidebarViews = {
  key: "tab",
  label: ui.filters.view,
  defaultValue: "collected",
  items: [
    { value: "collected", label: dict.tabCollected },
    { value: "expected", label: dict.tabExpected },
    { value: "profit", label: dict.tabProfit },
  ],
};

const collectedPeriod: SidebarGroup = { id: "period", label: dict.periodLabel, defaultValue: "month", options: COLLECTED_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] })) };
const expectedPeriod: SidebarGroup = { id: "future", label: dict.periodLabel, defaultValue: "next_month", options: EXPECTED_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] })) };
const category: SidebarGroup = { id: "filter", label: dict.filterLabel, defaultValue: "total", options: FINANCE_FILTERS.map((value) => ({ value, label: FILTER_LABELS[value] })) };
const profitCategory: SidebarGroup = { id: "profit", label: dict.filterLabel, defaultValue: "total", options: PROFIT_FILTERS.map((value) => ({ value, label: FILTER_LABELS[value] })) };

const GROUPS: Record<FinanceTab, readonly SidebarGroup[]> = {
  collected: [collectedPeriod, category],
  expected: [expectedPeriod, category],
  profit: [collectedPeriod, profitCategory],
};

export function financeTab(search: { get(name: string): string | null }): FinanceTab {
  const tab = search.get("tab");
  return tab === "expected" || tab === "profit" ? tab : "collected";
}

export function financeSidebar(search: { get(name: string): string | null }): SidebarConfig {
  const tab = financeTab(search);
  return { id: `finansije/${tab}`, views, groups: GROUPS[tab] };
}

/** Every key of Finansije (all three views), for the page. */
export const FINANCE_URL_FIELDS: UrlField[] = sidebarUrlFields({ id: "finansije", views, groups: [collectedPeriod, expectedPeriod, category, profitCategory] });
