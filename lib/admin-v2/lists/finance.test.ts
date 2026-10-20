import { describe, expect, test } from "vitest";
import { COLLECTED_PERIODS, EXPECTED_PERIODS, FINANCE_FILTERS, PROFIT_FILTERS } from "@/lib/admin-v1/finance";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { FINANCE_TABS, FINANCE_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/finance";
import { financeIntercept, financeSidebarLive, financeView } from "./finance";

// ADMIN v2 — Finansije: the URL state turned into the choice the page asks
// `adminFinance.overview` / `listPayments` for.

const view = (search: string) => financeView(readUrlState(FINANCE_URL_FIELDS, search));

describe("financeView", () => {
  test("an empty URL is what the page started with before the sidebar", () => {
    expect(financeView({})).toEqual({
      tab: "collected",
      collectedPeriod: "month",
      expectedPeriod: "next_month",
      filter: "total",
      profitFilter: "total",
      activeFilter: "total",
    });
    expect(view("")).toEqual(financeView({}));
  });

  test("Naplaćeno: its period and its category", () => {
    expect(view("?period=year&filter=scanme_links")).toMatchObject({ tab: "collected", collectedPeriod: "year", filter: "scanme_links", activeFilter: "scanme_links" });
    for (const period of COLLECTED_PERIODS) expect(view(`?period=${period}`).collectedPeriod).toBe(period);
    for (const filter of FINANCE_FILTERS) expect(view(`?filter=${filter}`)).toMatchObject({ filter, activeFilter: filter });
  });

  test("Očekivano: its own period (`future`) and the shared category", () => {
    expect(view("?tab=expected&future=six_months&filter=saas")).toMatchObject({ tab: "expected", expectedPeriod: "six_months", collectedPeriod: "month", filter: "saas", activeFilter: "saas" });
    for (const future of EXPECTED_PERIODS) expect(view(`?tab=expected&future=${future}`).expectedPeriod).toBe(future);
  });

  test("Profit: the collected period and its own category (`profit`)", () => {
    expect(view("?tab=profit&period=three_months&profit=premium")).toMatchObject({ tab: "profit", collectedPeriod: "three_months", profitFilter: "premium", activeFilter: "premium" });
    for (const profit of PROFIT_FILTERS) expect(view(`?tab=profit&profit=${profit}`)).toMatchObject({ profitFilter: profit, activeFilter: profit });
  });

  test("the category of the other view does not decide the query", () => {
    // Profit ignores `filter`, the others ignore `profit`: the same rule the page had.
    expect(view("?tab=profit&filter=physical").activeFilter).toBe("total");
    expect(view("?tab=expected&profit=saas").activeFilter).toBe("total");
    expect(view("?profit=saas").activeFilter).toBe("total");
    expect(view("?tab=profit&filter=physical&profit=saas")).toMatchObject({ filter: "physical", profitFilter: "saas", activeFilter: "saas" });
  });

  test("every view with every value of its groups", () => {
    for (const tab of FINANCE_TABS) {
      const periods = tab === "expected" ? EXPECTED_PERIODS : COLLECTED_PERIODS;
      const filters = tab === "profit" ? PROFIT_FILTERS : FINANCE_FILTERS;
      for (const period of periods) {
        for (const filter of filters) {
          const search = `?tab=${tab}&${tab === "expected" ? "future" : "period"}=${period}&${tab === "profit" ? "profit" : "filter"}=${filter}`;
          const result = view(search);
          expect(result.tab).toBe(tab);
          expect(tab === "expected" ? result.expectedPeriod : result.collectedPeriod).toBe(period);
          expect(result.activeFilter).toBe(filter);
        }
      }
    }
  });

  test("an invalid value reads as the default", () => {
    expect(view("?tab=x&period=next_month&profit=scanme_links&filter=profit&future=all_time")).toEqual(financeView({}));
    expect(view("?tab=profit&profit=scanme_links").activeFilter).toBe("total");
    expect(financeView({ tab: "x", period: "x", future: "x", filter: "x", profit: "x" })).toEqual(financeView({}));
  });
});

describe("financeIntercept", () => {
  test("a change to Profit drops the category of the other views", () => {
    expect(financeIntercept({ tab: "profit" })).toEqual({ tab: "profit", filter: null });
  });

  test("a change to another view drops the category of Profit", () => {
    expect(financeIntercept({ tab: "expected" })).toEqual({ tab: "expected", profit: null });
    expect(financeIntercept({ tab: "collected" })).toEqual({ tab: "collected", profit: null });
    // Back to the default view: the key is cleared, not set.
    expect(financeIntercept({ tab: null })).toEqual({ tab: null, profit: null });
  });

  test("other changes go through untouched", () => {
    const period = { period: "year" };
    expect(financeIntercept(period)).toBe(period);
    const category = { filter: "saas" };
    expect(financeIntercept(category)).toBe(category);
    const profit = { profit: "premium" };
    expect(financeIntercept(profit)).toBe(profit);
  });

  test("the sidebar gets the intercept and nothing else", () => {
    const live = financeSidebarLive();
    expect(Object.keys(live)).toEqual(["intercept"]);
    expect(live.intercept?.({ tab: "profit" }, {})).toEqual({ tab: "profit", filter: null });
    expect(financeSidebarLive()).toBe(live);
  });
});
