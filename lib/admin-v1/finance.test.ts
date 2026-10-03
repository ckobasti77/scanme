import { describe, expect, test } from "vitest";
import {
  addFinanceMonths,
  collectedWindow,
  expectedWindow,
  financeFilterMatches,
  financeMonthBounds,
  financeMonthKey,
  isFinanceFilter,
  isProfitFilter,
  stablePercent,
  stablePercentDistribution,
} from "./finance";

describe("ADMIN-14 finance calendar and filters", () => {
  test("uses Europe/Belgrade half-open month bounds through DST", () => {
    expect(financeMonthBounds("2026-03")).toEqual({
      start: Date.parse("2026-02-28T23:00:00.000Z"),
      end: Date.parse("2026-03-31T22:00:00.000Z"),
    });
    expect(financeMonthBounds("2026-10")).toEqual({
      start: Date.parse("2026-09-30T22:00:00.000Z"),
      end: Date.parse("2026-10-31T23:00:00.000Z"),
    });
    expect(financeMonthKey(Date.parse("2026-09-30T22:00:00Z"))).toBe("2026-10");
  });

  test("collected is current/YTD while expected always starts next month", () => {
    const now = Date.parse("2026-09-15T10:00:00Z");
    expect(collectedWindow("three_months", now).monthKeys).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(collectedWindow("year", now).monthKeys).toHaveLength(9);
    expect(expectedWindow("next_month", now).monthKeys).toEqual(["2026-10"]);
    expect(expectedWindow("year", now).monthKeys).toEqual(Array.from({ length: 12 }, (_, index) => addFinanceMonths("2026-10", index)));
    expect(addFinanceMonths("2026-12", 1)).toBe("2027-01");
    const leapFebruary = financeMonthBounds("2028-02");
    expect(leapFebruary.end - leapFebruary.start).toBe(29 * 24 * 60 * 60 * 1_000);
  });

  test("service filters are SaaS-only and hidden profit filters are rejected", () => {
    expect(financeFilterMatches("scanme_links", "saas", "scanme_links")).toBe(true);
    expect(financeFilterMatches("scanme_links", "physical", "scanme_links")).toBe(false);
    expect(isFinanceFilter("scanme_menu")).toBe(true);
    expect(isFinanceFilter("invented_service")).toBe(false);
    expect(isProfitFilter("premium")).toBe(true);
    expect(isProfitFilter("scanme_links")).toBe(false);
  });

  test("method percentages have stable two-decimal rounding", () => {
    expect(stablePercent(1, 3)).toBe(33.33);
    expect(stablePercent(0, 0)).toBe(0);
    expect(stablePercentDistribution([1, 1, 1], 3)).toEqual([33.34, 33.33, 33.33]);
    expect(stablePercentDistribution([280_000, 120_000, 65_000, 0], 465_000)).toEqual([60.21, 25.81, 13.98, 0]);
    expect(stablePercentDistribution([0, 0], 0)).toEqual([0, 0]);
  });
});
