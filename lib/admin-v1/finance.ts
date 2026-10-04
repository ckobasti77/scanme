import { BELGRADE_TIME_ZONE } from "./task-time";

export const FINANCE_CURRENCY = "RSD" as const;

export type FinanceCollectedPeriod = "month" | "three_months" | "six_months" | "year" | "all_time";
export type FinanceExpectedPeriod = "next_month" | "three_months" | "six_months" | "year";
export type FinanceFilter =
  | "total"
  | "physical"
  | "saas"
  | "premium"
  | "scanme_links"
  | "google_review"
  | "scanme_menu";
export type FinanceProfitFilter = "total" | "physical" | "saas" | "premium";
export type FinanceCategory = "physical" | "saas" | "premium" | "unallocated";
export type FinancePaymentMethod = "bank_transfer" | "payment_card" | "cash" | "other";

export const COLLECTED_PERIODS: readonly FinanceCollectedPeriod[] = ["month", "three_months", "six_months", "year", "all_time"];
export const EXPECTED_PERIODS: readonly FinanceExpectedPeriod[] = ["next_month", "three_months", "six_months", "year"];
export const FINANCE_FILTERS: readonly FinanceFilter[] = ["total", "physical", "saas", "premium", "scanme_links", "google_review", "scanme_menu"];
export const PROFIT_FILTERS: readonly FinanceProfitFilter[] = ["total", "physical", "saas", "premium"];

const monthParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: BELGRADE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

const dateTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: BELGRADE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function numericParts(formatter: Intl.DateTimeFormat, at: number) {
  return Object.fromEntries(
    formatter.formatToParts(at).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

function parseMonthKey(key: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error("admin_finance_month_invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("admin_finance_month_invalid");
  return { year, month };
}

function localMidnightUtc(year: number, month: number, day: number) {
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let candidate = targetAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = numericParts(dateTimeParts, candidate);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const next = candidate + targetAsUtc - observedAsUtc;
    if (next === candidate) break;
    candidate = next;
  }
  return candidate;
}

export function financeMonthKey(at: number) {
  if (!Number.isSafeInteger(at) || at < 0) throw new Error("admin_finance_time_invalid");
  const parts = numericParts(monthParts, at);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function addFinanceMonths(key: string, months: number) {
  if (!Number.isInteger(months)) throw new Error("admin_finance_month_invalid");
  const { year, month } = parseMonthKey(key);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function financeMonthBounds(key: string) {
  const { year, month } = parseMonthKey(key);
  const next = parseMonthKey(addFinanceMonths(key, 1));
  return { start: localMidnightUtc(year, month, 1), end: localMidnightUtc(next.year, next.month, 1) };
}

function monthKeys(first: string, count: number) {
  return Array.from({ length: count }, (_, index) => addFinanceMonths(first, index));
}

export function collectedWindow(period: FinanceCollectedPeriod, now: number) {
  const current = financeMonthKey(now);
  const exclusiveEnd = now + 1;
  if (!Number.isSafeInteger(exclusiveEnd)) throw new Error("admin_finance_time_invalid");
  if (period === "all_time") return { start: null, end: exclusiveEnd, monthKeys: [] as string[] };
  const count = period === "month" ? 1 : period === "three_months" ? 3 : period === "six_months" ? 6 : Number(current.slice(5, 7));
  const first = period === "year" ? `${current.slice(0, 4)}-01` : addFinanceMonths(current, 1 - count);
  return { start: financeMonthBounds(first).start, end: exclusiveEnd, monthKeys: monthKeys(first, count) };
}

export function expectedWindow(period: FinanceExpectedPeriod, now: number) {
  const first = addFinanceMonths(financeMonthKey(now), 1);
  const count = period === "next_month" ? 1 : period === "three_months" ? 3 : period === "six_months" ? 6 : 12;
  const keys = monthKeys(first, count);
  return { start: financeMonthBounds(first).start, end: financeMonthBounds(addFinanceMonths(first, count)).start, monthKeys: keys };
}

export function isFinanceFilter(value: string | undefined): value is FinanceFilter {
  return Boolean(value && FINANCE_FILTERS.includes(value as FinanceFilter));
}

export function isProfitFilter(value: string | undefined): value is FinanceProfitFilter {
  return Boolean(value && PROFIT_FILTERS.includes(value as FinanceProfitFilter));
}

export function financeFilterMatches(filter: FinanceFilter, category: FinanceCategory, serviceType?: string) {
  if (filter === "total") return true;
  if (filter === "physical" || filter === "saas" || filter === "premium") return category === filter;
  return category === "saas" && serviceType === filter;
}

export function safeMinorSum(values: readonly number[]) {
  return values.reduce((sum, value) => {
    const next = sum + value;
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(next)) throw new Error("admin_finance_money_invalid");
    return next;
  }, 0);
}

export function stablePercent(amountMinor: number, denominatorMinor: number) {
  if (denominatorMinor <= 0) return 0;
  return Math.round((amountMinor * 10_000) / denominatorMinor) / 100;
}

export function stablePercentDistribution(amountsMinor: readonly number[], denominatorMinor: number) {
  if (amountsMinor.length === 0) return [];
  if (denominatorMinor <= 0) return amountsMinor.map(() => 0);
  if (!Number.isSafeInteger(denominatorMinor) || amountsMinor.some((amount) => !Number.isSafeInteger(amount))) {
    throw new Error("admin_finance_money_invalid");
  }
  const rows = amountsMinor.map((amountMinor, index) => {
    const exactBasisPoints = (amountMinor / denominatorMinor) * 10_000;
    const basisPoints = Math.floor(exactBasisPoints);
    return { index, basisPoints, remainder: exactBasisPoints - basisPoints };
  });
  const remaining = 10_000 - rows.reduce((sum, row) => sum + row.basisPoints, 0);
  const byRemainder = [...rows].sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) byRemainder[index % byRemainder.length].basisPoints += 1;
  return rows.sort((left, right) => left.index - right.index).map((row) => row.basisPoints / 100);
}
