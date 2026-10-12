// ADMIN v2 — Finansije: the URL state of the sidebar (`?tab=&period=&future=
// &filter=&profit=`) turned into the choice the page asks `adminFinance` for.
// An absent key is the default. Pure.

import {
  COLLECTED_PERIODS,
  EXPECTED_PERIODS,
  FINANCE_FILTERS,
  PROFIT_FILTERS,
  type FinanceCollectedPeriod,
  type FinanceExpectedPeriod,
  type FinanceFilter,
  type FinanceProfitFilter,
} from "@/lib/admin-v1/finance";
import { FINANCE_TABS, type FinanceTab } from "@/lib/admin-v2/sidebar/configs/finance";
import type { SidebarLive, SidebarPatch, SidebarState } from "@/lib/admin-v2/sidebar/types";

export type FinanceView = {
  tab: FinanceTab;
  collectedPeriod: FinanceCollectedPeriod;
  expectedPeriod: FinanceExpectedPeriod;
  filter: FinanceFilter;
  profitFilter: FinanceProfitFilter;
  /** The category the view uses: Profit has its own, the others share `filter`. */
  activeFilter: FinanceFilter;
};

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return values.find((candidate) => candidate === value);
}

export function financeView(state: SidebarState): FinanceView {
  const tab = oneOf(FINANCE_TABS, state.tab) ?? "collected";
  const filter = oneOf(FINANCE_FILTERS, state.filter) ?? "total";
  const profitFilter = oneOf(PROFIT_FILTERS, state.profit) ?? "total";
  return {
    tab,
    collectedPeriod: oneOf(COLLECTED_PERIODS, state.period) ?? "month",
    expectedPeriod: oneOf(EXPECTED_PERIODS, state.future) ?? "next_month",
    filter,
    profitFilter,
    activeFilter: tab === "profit" ? profitFilter : filter,
  };
}

/**
 * Changing the view drops the category of the other view (Profit has its own
 * list of categories): to Profit it clears `filter`, to the others `profit`.
 * Any other change goes through untouched.
 */
export function financeIntercept(patch: SidebarPatch): SidebarPatch {
  if (!("tab" in patch)) return patch;
  return patch.tab === "profit" ? { filter: null, ...patch } : { profit: null, ...patch };
}

const LIVE: SidebarLive = { intercept: financeIntercept };

/** What the page sends to the sidebar: the dependent category. */
export function financeSidebarLive(): SidebarLive {
  return LIVE;
}
