"use client";

import { Component, type FormEvent, type ReactNode, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Plus,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminPanel } from "./admin-primitives";
import { adminFinanceSr as dict } from "@/lib/i18n/sr/admin-finance";
import { cn } from "@/lib/utils";
import {
  financeMonthBounds,
  financeFilterMatches,
  isFinanceFilter,
  isProfitFilter,
  type FinanceCollectedPeriod,
  type FinanceExpectedPeriod,
  type FinanceFilter,
  type FinanceProfitFilter,
} from "@/lib/admin-v1/finance";
import { belgradeDateKey, belgradeLocalDateTimeToUtc } from "@/lib/admin-v1/task-time";

type Overview = FunctionReturnType<typeof api.adminFinance.overview>;
type PaymentPage = FunctionReturnType<typeof api.adminFinance.listPayments>;
type PaymentRow = PaymentPage["page"][number];
type PaymentDetail = FunctionReturnType<typeof api.adminFinance.paymentDetail>;
type Tab = "collected" | "expected" | "profit";

const date = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", dateStyle: "medium" });
const month = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", month: "short", year: "numeric" });

const FILTER_LABEL: Record<FinanceFilter, string> = {
  total: dict.filterTotal,
  physical: dict.filterPhysical,
  saas: dict.filterSaas,
  premium: dict.filterPremium,
  scanme_links: dict.filterLinks,
  google_review: dict.filterReview,
  scanme_menu: dict.filterMenu,
};
const CATEGORY_LABEL = {
  physical: dict.categoryPhysical,
  saas: dict.categorySaas,
  premium: dict.categoryPremium,
  unallocated: dict.categoryUnallocated,
} as const;
const METHOD_LABEL = {
  bank_transfer: dict.methodBank,
  payment_card: dict.methodCard,
  cash: dict.methodCash,
  other: dict.methodOther,
} as const;
const METHOD_ICON = { bank_transfer: Landmark, payment_card: CreditCard, cash: Banknote, other: WalletCards } as const;
const PERIOD_LABEL = { monthly: dict.paymentMonthly, annual: dict.paymentAnnual, one_time: dict.paymentOneTime, unallocated: dict.paymentUnallocated } as const;
const COLLECTED_PERIOD_LABEL: Record<FinanceCollectedPeriod, string> = { month: dict.periodMonth, three_months: dict.periodThree, six_months: dict.periodSix, year: dict.periodYear, all_time: dict.periodAll };
const MISSING_LABEL = { production: dict.missingProduction, hosting: dict.missingHosting, backend: dict.missingBackend, classification: dict.missingClassification } as const;

function money(amountMinor: number) {
  const absolute = Math.abs(amountMinor);
  const whole = Math.trunc(absolute / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${amountMinor < 0 ? "−" : ""}${whole},${fraction}\u00A0RSD`;
}

function parseMinor(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("money");
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("money");
  return result;
}

function paymentState(row: PaymentRow) {
  if (row.reversedMinor > 0) return dict.paymentReversed;
  if (row.refundedMinor > 0) return dict.paymentRefunded;
  return dict.paymentSettled;
}

function allocationLabel(allocation: PaymentRow["allocations"][number]) {
  return `${CATEGORY_LABEL[allocation.category]} — ${PERIOD_LABEL[allocation.period]}`;
}

function updateQuery(
  router: ReturnType<typeof useRouter>,
  pathname: string,
  params: ReturnType<typeof useSearchParams>,
  updates: Record<string, string | undefined>,
) {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
}

function MetricCard({ label, value, hint, state, icon: Icon }: { label: string; value: string; hint: string; state: "actual" | "future" | "complete" | "incomplete"; icon: typeof CircleDollarSign }) {
  const badge = state === "actual" ? dict.actualBadge : state === "future" ? dict.futureBadge : state === "incomplete" ? dict.incompleteBadge : dict.profit;
  return <AdminPanel className="min-w-0 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--admin-text-muted)]">{label}</p><p className="mt-2 truncate font-mono text-2xl font-semibold tabular-nums tracking-[-0.04em] sm:text-3xl">{value}</p></div>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--admin-surface-muted)] text-[var(--admin-text)]"><Icon className="size-5" aria-hidden="true" /></span>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--admin-text-muted)]"><span className={cn("rounded-full px-2 py-1 font-semibold", state === "incomplete" ? "bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]" : "bg-[var(--admin-accent-soft)] text-[var(--admin-accent-ink)]")}>{badge}</span><span>{hint}</span></div>
  </AdminPanel>;
}

function pointLabel(key: string) {
  if (key === "undated") return dict.undated;
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return date.format(Date.parse(`${key}T12:00:00Z`));
  if (/^\d{4}-\d{2}$/.test(key)) return month.format(financeMonthBounds(key).start);
  return key;
}

export function FinanceChart({ points, future }: { points: Overview["collected"]["series"]; future: boolean }) {
  const dated = points.filter((point) => !point.undated);
  const max = Math.max(1, ...dated.map((point) => point.amountMinor));
  const coordinates = dated.map((point, index) => ({
    x: dated.length === 1 ? 50 : (index / Math.max(1, dated.length - 1)) * 100,
    y: 92 - (Math.max(0, point.amountMinor) / max) * 76,
  }));
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = coordinates.length ? `M ${coordinates[0].x} 92 L ${coordinates.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${coordinates.at(-1)!.x} 92 Z` : "";
  return <AdminPanel className="min-w-0 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{dict.chartTitle}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-[var(--admin-text-muted)]">{dict.chartDescription}</p></div><span className="rounded-full bg-[var(--admin-surface-muted)] px-2.5 py-1 text-xs font-semibold">{future ? dict.futureBadge : dict.actualBadge}</span></div>
    {dated.length ? <div className="mt-5" role="img" aria-label={dict.chartDescription}>
      <svg viewBox="0 0 100 100" className="h-56 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
        {[16, 35, 54, 73, 92].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--admin-border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />)}
        <path d={area} fill="color-mix(in srgb, var(--admin-accent) 18%, transparent)" />
        <polyline points={polyline} fill="none" stroke="var(--admin-ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {coordinates.map((point, index) => <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="1.8" fill="var(--admin-accent)" stroke="var(--admin-ink)" strokeWidth="0.7" vectorEffect="non-scaling-stroke"><title>{`${pointLabel(dated[index].key)}: ${money(dated[index].amountMinor)}`}</title></circle>)}
      </svg>
      <div className="mt-2 flex justify-between gap-2 text-[0.68rem] text-[var(--admin-text-muted)]"><span>{pointLabel(dated[0].key)}</span>{dated.length > 1 ? <span>{pointLabel(dated.at(-1)!.key)}</span> : null}</div>
    </div> : <AdminEmptyState className="mt-4 min-h-52" title={dict.emptyTitle} body={dict.emptyBody} />}
    <details className="mt-4 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 text-sm">
      <summary className="min-h-11 cursor-pointer content-center font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]">{dict.chartTableCaption}</summary>
      <div className="overflow-x-auto"><table className="mt-2 w-full min-w-80 text-left"><caption className="sr-only">{dict.chartTableCaption}</caption><thead><tr><th className="py-2 pr-4">{dict.chartPeriod}</th><th className="py-2 text-right">{dict.chartAmount}</th></tr></thead><tbody>{points.map((point) => <tr key={point.key} className="border-t border-[var(--admin-border)]"><td className="py-2 pr-4">{pointLabel(point.key)}</td><td className="py-2 text-right font-mono tabular-nums">{money(point.amountMinor)}</td></tr>)}</tbody></table></div>
    </details>
  </AdminPanel>;
}

function MethodPanel({ methods, denominatorMinor, period }: { methods: Overview["methods"]; denominatorMinor: number; period: FinanceCollectedPeriod }) {
  return <AdminPanel className="p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{dict.methodsTitle}</h2><span className="rounded-full bg-[var(--admin-surface-muted)] px-2 py-1 text-xs font-semibold">{dict.actualBadge}</span></div><p className="mt-1 text-xs text-[var(--admin-text-muted)]">{dict.methodsDenominator}: <span className="font-mono tabular-nums">{money(denominatorMinor)}</span> · {COLLECTED_PERIOD_LABEL[period]}</p><div className="mt-4 grid gap-3">{methods.map((row) => { const Icon = METHOD_ICON[row.method]; return <div key={row.method} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--admin-surface-muted)]"><Icon className="size-4" aria-hidden="true" /></span><div className="min-w-0"><span className="block truncate text-sm font-medium">{METHOD_LABEL[row.method]}</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--admin-border)]"><span className="block h-full rounded-full bg-[var(--admin-ink)]" style={{ width: `${Math.max(0, Math.min(100, row.percent))}%` }} /></span></div><div className="text-right"><span className="block font-mono text-sm font-semibold tabular-nums">{money(row.amountMinor)}</span><span className="text-xs text-[var(--admin-text-muted)]">{row.percent.toFixed(2)}%</span></div></div>; })}</div></AdminPanel>;
}

function CategoryTable({ overview, tab }: { overview: Overview; tab: Tab }) {
  const expectedByCategory = new Map(overview.expected.categories.map((row) => [row.category, row]));
  return <AdminPanel className="min-w-0 overflow-hidden">
    <div className="border-b border-[var(--admin-border)] px-4 py-4 sm:px-5"><h2 className="text-base font-semibold">{dict.categoriesTitle}</h2></div>
    <div className="grid gap-3 p-4 md:hidden">
      {overview.categories.map((row) => <article key={row.category} className="rounded-xl border border-[var(--admin-border)] p-3">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{CATEGORY_LABEL[row.category]}</h3>{tab !== "expected" && !row.complete ? <span className="rounded-full bg-[var(--admin-danger-soft)] px-2 py-1 text-xs font-semibold text-[var(--admin-danger)]">{dict.incompleteBadge}</span> : null}</div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-[var(--admin-text-muted)]">{tab === "expected" ? dict.expected : dict.collected}</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{money(tab === "expected" ? expectedByCategory.get(row.category)?.amountMinor ?? 0 : row.collectedMinor)}</dd></div>
          {tab === "expected" && (expectedByCategory.get(row.category)?.undatedMinor ?? 0) > 0 ? <div><dt className="text-xs text-[var(--admin-text-muted)]">{dict.undated}</dt><dd className="mt-1 font-mono tabular-nums">{money(expectedByCategory.get(row.category)?.undatedMinor ?? 0)}</dd></div> : null}
          {tab === "profit" ? <><div><dt className="text-xs text-[var(--admin-text-muted)]">{dict.costs}</dt><dd className="mt-1 font-mono tabular-nums">{money(row.costsMinor)}</dd></div><div><dt className="text-xs text-[var(--admin-text-muted)]">{dict.profit}</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{row.profitMinor === null ? "—" : money(row.profitMinor)}</dd></div></> : null}
        </dl>
        {tab !== "expected" && row.missing.length ? <p className="mt-3 text-xs text-[var(--admin-danger)]">{row.missing.map((item) => MISSING_LABEL[item as keyof typeof MISSING_LABEL]).join(" · ")}</p> : null}
      </article>)}
    </div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[36rem] text-left text-sm"><caption className="sr-only">{dict.categoriesTitle}</caption>
      <thead className="bg-[var(--admin-surface-muted)] text-xs text-[var(--admin-text-muted)]"><tr><th className="px-5 py-3">{dict.category}</th><th className="px-5 py-3 text-right">{tab === "expected" ? dict.expected : dict.collected}</th>{tab === "expected" ? <th className="px-5 py-3 text-right">{dict.undated}</th> : tab === "profit" ? <><th className="px-5 py-3 text-right">{dict.refunds}</th><th className="px-5 py-3 text-right">{dict.costs}</th><th className="px-5 py-3 text-right">{dict.profit}</th></> : <th className="px-5 py-3 text-right">{dict.refunds}</th>}</tr></thead>
      <tbody>{overview.categories.map((row) => <tr key={row.category} className="border-t border-[var(--admin-border)]"><th className="px-5 py-4"><span className="font-semibold">{CATEGORY_LABEL[row.category]}</span>{tab !== "expected" && row.missing.length ? <span className="mt-1 block text-xs font-normal text-[var(--admin-danger)]">{row.missing.map((item) => MISSING_LABEL[item as keyof typeof MISSING_LABEL]).join(" · ")}</span> : null}</th><td className="px-5 py-4 text-right font-mono tabular-nums">{money(tab === "expected" ? expectedByCategory.get(row.category)?.amountMinor ?? 0 : row.collectedMinor)}</td>{tab === "expected" ? <td className="px-5 py-4 text-right font-mono tabular-nums">{money(expectedByCategory.get(row.category)?.undatedMinor ?? 0)}</td> : tab === "profit" ? <><td className="px-5 py-4 text-right font-mono tabular-nums">{money(row.refundsMinor)}</td><td className="px-5 py-4 text-right font-mono tabular-nums">{money(row.costsMinor)}</td><td className="px-5 py-4 text-right font-mono font-semibold tabular-nums">{row.profitMinor === null ? <span className="text-[var(--admin-danger)]">{dict.incompleteBadge}</span> : money(row.profitMinor)}</td></> : <td className="px-5 py-4 text-right font-mono tabular-nums">{money(row.refundsMinor)}</td>}</tr>)}</tbody>
    </table></div>
  </AdminPanel>;
}

function Payments({ rows, status, onLoadMore, onOpen }: { rows: PaymentRow[]; status: string; onLoadMore: () => void; onOpen: (row: PaymentRow, trigger: HTMLButtonElement) => void }) {
  if (status === "LoadingFirstPage") return <AdminPanel><AdminLoadingState /></AdminPanel>;
  if (!rows.length) return <AdminPanel><AdminEmptyState title={dict.emptyTitle} body={dict.emptyBody} /></AdminPanel>;
  return <AdminPanel className="min-w-0 overflow-hidden"><div className="border-b border-[var(--admin-border)] px-4 py-4 sm:px-5"><h2 className="text-base font-semibold">{dict.paymentsTitle}</h2><p className="mt-1 text-sm text-[var(--admin-text-muted)]">{dict.paymentsCaption}</p></div>
    <div className="grid gap-3 p-4 md:hidden">{rows.map((row) => <button key={row._id} type="button" onClick={(event) => onOpen(row, event.currentTarget)} className="min-h-11 rounded-xl border border-[var(--admin-border)] p-3 text-left transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)] motion-reduce:transition-none"><span className="flex items-center justify-between gap-2"><strong className="truncate">{row.accountName}</strong><span className="font-mono font-semibold tabular-nums">{money(row.amountMinor)}</span></span><span className="mt-2 block text-xs text-[var(--admin-text-muted)]">{row.allocations.map(allocationLabel).join(" · ")}</span><span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--admin-text-muted)]"><span>{date.format(row.paidAt)}</span><span>{METHOD_LABEL[row.method]}</span><span>{paymentState(row)}</span></span></button>)}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[58rem] text-left text-sm"><caption className="sr-only">{dict.paymentsCaption}</caption><thead className="bg-[var(--admin-surface-muted)] text-xs text-[var(--admin-text-muted)]"><tr><th className="px-5 py-3">{dict.paymentClient}</th><th className="px-5 py-3">{dict.paymentDate}</th><th className="px-5 py-3">{dict.paymentMethod}</th><th className="px-5 py-3">{dict.paymentAllocation}</th><th className="px-5 py-3">{dict.paymentState}</th><th className="px-5 py-3 text-right">{dict.chartAmount}</th><th><span className="sr-only">{dict.paymentOpen}</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row._id} className="border-t border-[var(--admin-border)]"><td className="px-5 py-4 font-semibold">{row.accountName}</td><td className="px-5 py-4 whitespace-nowrap">{date.format(row.paidAt)}</td><td className="px-5 py-4">{METHOD_LABEL[row.method]}</td><td className="px-5 py-4"><span className="block max-w-72 truncate">{row.allocations.map(allocationLabel).join(" · ")}</span></td><td className="px-5 py-4">{paymentState(row)}</td><td className="px-5 py-4 text-right font-mono font-semibold tabular-nums">{money(row.amountMinor)}</td><td className="px-5 py-4"><Button type="button" variant="ghost" size="icon" aria-label={dict.paymentOpen} onClick={(event) => onOpen(row, event.currentTarget)}><ArrowUpRight className="size-4" aria-hidden="true" /></Button></td></tr>)}</tbody></table></div>
    {status === "CanLoadMore" || status === "LoadingMore" ? <div className="border-t border-[var(--admin-border)] p-4 text-center"><Button type="button" variant="outline" disabled={status === "LoadingMore"} onClick={onLoadMore}>{status === "LoadingMore" ? dict.loadingMore : dict.loadMore}</Button></div> : null}
  </AdminPanel>;
}

function CostDialog({ open, onOpenChange, accountId, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; accountId?: Id<"accounts">; onSave: (payload: Parameters<ReturnType<typeof useMutation<typeof api.adminFinance.recordDirectCost>>>[0]) => Promise<void> }) {
  const [category, setCategory] = useState<"production" | "hosting" | "backend">("production");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const form = new FormData(event.currentTarget);
      const value = (name: string) => String(form.get(name) ?? "").trim();
      const occurred = value("occurredAt");
      const coveredStart = value("coveredStart");
      const coveredEnd = value("coveredEnd");
      const selectedAccount = value("accountId") || accountId;
      await onSave({
        ...(selectedAccount ? { accountId: selectedAccount as Id<"accounts"> } : {}),
        category,
        amountMinor: parseMinor(value("amount")),
        occurredAt: belgradeLocalDateTimeToUtc(`${occurred}T12:00`),
        ...(coveredStart ? { coveredStart: financeMonthBounds(coveredStart).start } : {}),
        ...(coveredEnd ? { coveredEnd: financeMonthBounds(coveredEnd).end } : {}),
        ...(value("orderId") ? { orderId: value("orderId") as Id<"orders"> } : {}),
        ...(value("orderLineId") ? { orderLineId: value("orderLineId") as Id<"orderLines"> } : {}),
        ...(value("printJobId") ? { printJobId: value("printJobId") as Id<"printJobs"> } : {}),
        ...(value("printerId") ? { printerId: value("printerId") as Id<"printers"> } : {}),
        ...(value("source") ? { sourceReference: value("source") } : {}),
        ...(value("note") ? { note: value("note") } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      onOpenChange(false);
    } catch { setError(dict.mutationError); } finally { setPending(false); }
  }
  const [today] = useState(() => belgradeDateKey(Date.now()));
  const currentMonth = today.slice(0, 7);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="admin-v1 max-h-[90dvh] overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] motion-reduce:animate-none motion-reduce:transition-none"><DialogHeader><DialogTitle>{dict.costTitle}</DialogTitle><DialogDescription>{dict.costDescription}</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4"><div className="grid gap-2"><Label htmlFor="finance-cost-category">{dict.costCategory}</Label><select id="finance-cost-category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="min-h-11 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3"><option value="production">{dict.costProduction}</option><option value="hosting">{dict.costHosting}</option><option value="backend">{dict.costBackend}</option></select></div><div className="grid gap-2 sm:grid-cols-2"><Field name="amount" label={dict.costAmount} inputMode="decimal" required defaultValue="0" /><Field name="occurredAt" label={dict.costOccurredAt} type="date" required defaultValue={today} /></div>{category === "production" ? <div className="grid gap-3"><Field name="accountId" label={dict.costAccountId} defaultValue={accountId ? String(accountId) : ""} required /><Field name="orderId" label={dict.costOrderId} required /><Field name="orderLineId" label={dict.costOrderLineId} /><Field name="printJobId" label={dict.costPrintJobId} /><Field name="printerId" label={dict.costPrinterId} /></div> : <div className="grid gap-3 sm:grid-cols-2"><Field name="coveredStart" label={dict.costCoveredStart} type="month" required defaultValue={currentMonth} /><Field name="coveredEnd" label={dict.costCoveredEnd} type="month" required defaultValue={currentMonth} /></div>}<Field name="source" label={dict.costSource} /><Field name="note" label={dict.costNote} />{error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{error}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{dict.cancel}</Button><Button type="submit" disabled={pending}>{pending ? dict.saving : dict.save}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ name, label, ...props }: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  const id = `finance-${name}`;
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} className="min-h-11" {...props} /></div>;
}

function PaymentDialog({ open, onOpenChange, row, detail, onRefund }: { open: boolean; onOpenChange: (open: boolean) => void; row: PaymentRow | null; detail: PaymentDetail | undefined; onRefund: (payload: Parameters<ReturnType<typeof useMutation<typeof api.adminFinance.refundPayment>>>[0]) => Promise<void> }) {
  const [refundOpen, setRefundOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [today] = useState(() => belgradeDateKey(Date.now()));
  if (!row) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const form = new FormData(event.currentTarget);
      const allocations = row!.allocations.map((allocation, index) => ({ logicalKey: allocation.logicalKey, amountMinor: parseMinor(String(form.get(`allocation-${index}`) ?? "0")) })).filter((allocation) => allocation.amountMinor > 0);
      const amountMinor = parseMinor(String(form.get("amount") ?? "0"));
      if (allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0) !== amountMinor) { setError(dict.refundUnbalanced); return; }
      await onRefund({ paymentId: row!.paymentId, amountMinor, allocations, refundedAt: belgradeLocalDateTimeToUtc(`${String(form.get("date"))}T12:00`), reason: String(form.get("reason") ?? ""), key: crypto.randomUUID() });
      setRefundOpen(false);
    } catch { setError(dict.mutationError); } finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="admin-v1 max-h-[90dvh] overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] motion-reduce:animate-none motion-reduce:transition-none sm:max-w-2xl">
      <DialogHeader><DialogTitle>{dict.detailTitle}</DialogTitle><DialogDescription>{dict.detailDescription}</DialogDescription></DialogHeader>
      {detail === undefined ? <AdminLoadingState /> : detail === null ? <AdminErrorState title={dict.errorTitle} body={dict.errorBody} /> : <div className="grid gap-5">
        <div className="grid gap-3 rounded-xl border border-[var(--admin-border)] p-4 sm:grid-cols-2">
          <div><span className="text-xs text-[var(--admin-text-muted)]">{dict.paymentClient}</span><strong className="mt-1 block">{row.accountName}</strong></div>
          <div><span className="text-xs text-[var(--admin-text-muted)]">{dict.chartAmount}</span><strong className="mt-1 block font-mono tabular-nums">{money(row.amountMinor)}</strong></div>
          <div><span className="text-xs text-[var(--admin-text-muted)]">{dict.paymentDate}</span><span className="mt-1 block">{date.format(row.paidAt)}</span></div>
          <div><span className="text-xs text-[var(--admin-text-muted)]">{dict.paymentMethod}</span><span className="mt-1 block">{METHOD_LABEL[row.method]}</span></div>
          {row.reference ? <div><span className="text-xs text-[var(--admin-text-muted)]">{dict.paymentReference}</span><span className="mt-1 block break-words">{row.reference}</span></div> : null}
          {row.recordedByUserId ? <div><span className="text-xs text-[var(--admin-text-muted)]">{dict.paymentActor}</span><span className="mt-1 block break-all font-mono text-xs">{String(row.recordedByUserId)}</span></div> : null}
        </div>
        <section><h3 className="font-semibold">{dict.detailAllocations}</h3><div className="mt-2 grid gap-2">{row.allocations.map((allocation) => <div key={allocation.logicalKey} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--admin-surface-muted)] p-3 text-sm"><span><strong>{CATEGORY_LABEL[allocation.category]}</strong><span className="ml-2 text-[var(--admin-text-muted)]">{PERIOD_LABEL[allocation.period]}</span>{allocation.subscriptionId || allocation.orderId ? <span className="mt-1 block break-all font-mono text-xs text-[var(--admin-text-muted)]">{String(allocation.subscriptionId ?? allocation.orderId)}</span> : null}</span><span className="font-mono font-semibold tabular-nums">{money(allocation.amountMinor)}</span></div>)}</div></section>
        <section><h3 className="font-semibold">{dict.detailAdjustments}</h3>{detail.adjustments.length ? <div className="mt-2 grid gap-2">{detail.adjustments.map((adjustment) => <div key={adjustment._id} className="rounded-xl border border-[var(--admin-border)] p-3 text-sm"><div className="flex justify-between gap-3"><strong>{adjustment.kind === "refund" ? dict.paymentRefunded : dict.paymentReversed}</strong><span className="font-mono tabular-nums">{money(adjustment.amount.amountMinor)}</span></div><p className="mt-1 text-[var(--admin-text-muted)]">{adjustment.change.reason}</p><p className="mt-2 break-all font-mono text-xs text-[var(--admin-text-muted)]">{date.format(adjustment.change.at)} · {adjustment.change.actor.kind === "system" ? adjustment.change.actor.source : String(adjustment.change.actor.userId)}</p></div>)}</div> : <p className="mt-2 text-sm text-[var(--admin-text-muted)]">{dict.detailNoAdjustments}</p>}</section>
        {refundOpen ? <form onSubmit={submit} className="grid gap-3 rounded-xl border border-[var(--admin-border)] p-4"><h3 className="font-semibold">{dict.refundTitle}</h3><p className="text-sm text-[var(--admin-text-muted)]">{dict.refundDescription}</p><Field name="amount" label={dict.refundAmount} inputMode="decimal" required /><Field name="date" label={dict.refundDate} type="date" required defaultValue={today} /><Field name="reason" label={dict.refundReason} required />{row.allocations.map((allocation, index) => <Field key={allocation.logicalKey} name={`allocation-${index}`} label={`${CATEGORY_LABEL[allocation.category]} — ${dict.refundAllocationAmount}`} inputMode="decimal" defaultValue="0" />)}{error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRefundOpen(false)}>{dict.cancel}</Button><Button type="submit" disabled={pending}>{pending ? dict.saving : dict.save}</Button></div></form> : <Button type="button" variant="outline" className="justify-self-start" onClick={() => setRefundOpen(true)}><RotateCcw className="size-4" aria-hidden="true" />{dict.refundAction}</Button>}
      </div>}
    </DialogContent>
  </Dialog>;
}

function Controls({ tab, setTab, collectedPeriod, setCollectedPeriod, expectedPeriod, setExpectedPeriod, filter, setFilter, profitFilter, setProfitFilter }: { tab: Tab; setTab: (value: Tab) => void; collectedPeriod: FinanceCollectedPeriod; setCollectedPeriod: (value: FinanceCollectedPeriod) => void; expectedPeriod: FinanceExpectedPeriod; setExpectedPeriod: (value: FinanceExpectedPeriod) => void; filter: FinanceFilter; setFilter: (value: FinanceFilter) => void; profitFilter: FinanceProfitFilter; setProfitFilter: (value: FinanceProfitFilter) => void }) {
  const periods = tab === "expected" ? (["next_month", "three_months", "six_months", "year"] as const) : (["month", "three_months", "six_months", "year", "all_time"] as const);
  const labels = { month: dict.periodMonth, next_month: dict.periodNextMonth, three_months: dict.periodThree, six_months: dict.periodSix, year: dict.periodYear, all_time: dict.periodAll } as const;
  const filters = tab === "profit" ? (["total", "physical", "saas", "premium"] as const) : (["total", "physical", "saas", "premium", "scanme_links", "google_review", "scanme_menu"] as const);
  return <div className="grid gap-3"><div role="tablist" aria-label={dict.pageTitle} className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1 sm:w-fit">{(["collected", "expected", "profit"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={cn("min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)] motion-reduce:transition-none", tab === item ? "bg-[var(--admin-ink)] text-[var(--admin-surface)]" : "hover:bg-[var(--admin-surface-muted)]")}>{item === "collected" ? dict.tabCollected : item === "expected" ? dict.tabExpected : dict.tabProfit}</button>)}</div><div className="flex flex-wrap items-end gap-3"><div><span className="mb-1.5 block text-xs font-semibold text-[var(--admin-text-muted)]">{dict.periodLabel}</span><div className="flex flex-wrap gap-1">{periods.map((period) => <button key={period} type="button" onClick={() => tab === "expected" ? setExpectedPeriod(period as FinanceExpectedPeriod) : setCollectedPeriod(period as FinanceCollectedPeriod)} className={cn("min-h-11 rounded-xl border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)] motion-reduce:transition-none", (tab === "expected" ? expectedPeriod : collectedPeriod) === period ? "border-[var(--admin-ink)] bg-[var(--admin-ink)] text-[var(--admin-surface)]" : "border-[var(--admin-border)] bg-[var(--admin-surface)] hover:bg-[var(--admin-surface-muted)]")}>{labels[period]}</button>)}</div></div><div><span className="mb-1.5 block text-xs font-semibold text-[var(--admin-text-muted)]">{dict.filterLabel}</span><div className="flex flex-wrap gap-1">{filters.map((item) => <button key={item} type="button" onClick={() => tab === "profit" ? setProfitFilter(item as FinanceProfitFilter) : setFilter(item as FinanceFilter)} className={cn("min-h-11 rounded-xl border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)] motion-reduce:transition-none", (tab === "profit" ? profitFilter : filter) === item ? "border-[var(--admin-accent-ink)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-ink)]" : "border-[var(--admin-border)] bg-[var(--admin-surface)] hover:bg-[var(--admin-surface-muted)]")}>{FILTER_LABEL[item]}</button>)}</div></div></div></div>;
}

export function FinanceSurface({ accountId, preview = false }: { accountId?: Id<"accounts">; preview?: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const requestedTab = params.get("tab"); const [tab, setTabState] = useState<Tab>(requestedTab === "expected" || requestedTab === "profit" ? requestedTab : "collected");
  const requestedFilter = params.get("filter") ?? undefined; const requestedProfit = params.get("profit") ?? undefined;
  const [collectedPeriod, setCollectedPeriodState] = useState<FinanceCollectedPeriod>(params.get("period") === "three_months" || params.get("period") === "six_months" || params.get("period") === "year" || params.get("period") === "all_time" ? params.get("period") as FinanceCollectedPeriod : "month");
  const [expectedPeriod, setExpectedPeriodState] = useState<FinanceExpectedPeriod>(params.get("future") === "three_months" || params.get("future") === "six_months" || params.get("future") === "year" ? params.get("future") as FinanceExpectedPeriod : "next_month");
  const [filter, setFilterState] = useState<FinanceFilter>(isFinanceFilter(requestedFilter) ? requestedFilter : "total");
  const [profitFilter, setProfitFilterState] = useState<FinanceProfitFilter>(isProfitFilter(requestedProfit) ? requestedProfit : "total");
  const [now] = useState(() => Date.now());
  const [costOpen, setCostOpen] = useState(false); const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null); const [notice, setNotice] = useState("");
  const costTriggerRef = useRef<HTMLButtonElement>(null); const paymentTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeFilter = tab === "profit" ? profitFilter : filter;
  const liveOverview = useQuery(api.adminFinance.overview, preview ? "skip" : { accountId, now, collectedPeriod, expectedPeriod, filter: activeFilter, profitFilter });
  const liveSummary = useQuery(api.adminFinance.overview, preview ? "skip" : { accountId, now, collectedPeriod: "month", expectedPeriod: "next_month", filter: "total", profitFilter: "total" });
  const payments = usePaginatedQuery(api.adminFinance.listPayments, preview ? "skip" : { accountId, filter: activeFilter }, { initialNumItems: 12 });
  const detail = useQuery(api.adminFinance.paymentDetail, !preview && selectedPayment ? { accountId, paymentId: selectedPayment.paymentId } : "skip");
  const saveCost = useMutation(api.adminFinance.recordDirectCost); const refund = useMutation(api.adminFinance.refundPayment);
  const overview = preview ? fixtureOverview : liveOverview;
  const summary = preview ? fixtureOverview : liveSummary;
  const paymentRows = preview ? fixturePayments.filter((row) => activeFilter === "total" || row.allocations.some((allocation) => financeFilterMatches(activeFilter, allocation.category, allocation.serviceType))) : payments.results;
  const paymentStatus = preview ? "Exhausted" : payments.status;
  const effectiveDetail = preview && selectedPayment ? fixtureDetail(selectedPayment) : detail;
  function setTab(value: Tab) { setTabState(value); updateQuery(router, pathname, params, { tab: value === "collected" ? undefined : value, ...(value === "profit" ? { filter: undefined } : { profit: undefined }) }); }
  function setCollectedPeriod(value: FinanceCollectedPeriod) { setCollectedPeriodState(value); updateQuery(router, pathname, params, { period: value === "month" ? undefined : value }); }
  function setExpectedPeriod(value: FinanceExpectedPeriod) { setExpectedPeriodState(value); updateQuery(router, pathname, params, { future: value === "next_month" ? undefined : value }); }
  function setFilter(value: FinanceFilter) { setFilterState(value); updateQuery(router, pathname, params, { filter: value === "total" ? undefined : value }); }
  function setProfitFilter(value: FinanceProfitFilter) { setProfitFilterState(value); updateQuery(router, pathname, params, { profit: value === "total" ? undefined : value }); }
  if (!overview || !summary) return <AdminPanel><AdminLoadingState /></AdminPanel>;
  const points = tab === "expected" ? overview.expected.series : overview.collected.series;
  return <div className="grid min-w-0 gap-5">
    {preview ? <div><span className="rounded-full bg-[var(--admin-accent)] px-2.5 py-1 text-xs font-bold text-[var(--admin-accent-ink)]">{dict.previewBadge}</span><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{dict.previewDescription}</p></div> : null}
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{dict.pageTitle}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-text-muted)]">{dict.pageSubtitle}</p></div><Button ref={costTriggerRef} type="button" variant="outline" onClick={() => setCostOpen(true)}><Plus className="size-4" aria-hidden="true" />{dict.costAction}</Button></header>
    {notice ? <p role="status" className="flex items-center gap-2 rounded-xl bg-[var(--admin-accent-soft)] px-3 py-2 text-sm font-medium text-[var(--admin-accent-ink)]"><CheckCircle2 className="size-4" aria-hidden="true" />{notice}</p> : null}
    <Controls tab={tab} setTab={setTab} collectedPeriod={collectedPeriod} setCollectedPeriod={setCollectedPeriod} expectedPeriod={expectedPeriod} setExpectedPeriod={setExpectedPeriod} filter={filter} setFilter={setFilter} profitFilter={profitFilter} setProfitFilter={setProfitFilter} />
    <section aria-label={dict.pageTitle} className="grid gap-3 md:grid-cols-3"><MetricCard label={dict.summaryCollected} value={money(summary.collected.amount.amountMinor)} hint={dict.summaryCurrentMonth} state="actual" icon={ReceiptText} /><MetricCard label={dict.summaryExpected} value={money(summary.expected.amount.amountMinor)} hint={dict.summaryNextMonth} state="future" icon={CalendarClock} /><MetricCard label={dict.summaryProfit} value={summary.profit.amount ? money(summary.profit.amount.amountMinor) : "—"} hint={summary.profit.complete ? dict.directCosts : summary.profit.missing.map((item) => MISSING_LABEL[item as keyof typeof MISSING_LABEL]).join(" · ")} state={summary.profit.complete ? "complete" : "incomplete"} icon={CircleDollarSign} /></section>
    {tab === "expected" && (overview.expected.undatedMinor || overview.expected.overdueMinor || overview.expected.unavailablePriceCount) ? <AdminPanel className="grid gap-2 p-4 text-sm"><p><strong>{dict.undated}:</strong> <span className="font-mono tabular-nums">{money(overview.expected.undatedMinor)}</span></p>{overview.expected.overdueMinor ? <p><strong>{dict.overdueKnown}:</strong> <span className="font-mono tabular-nums">{money(overview.expected.overdueMinor)}</span></p> : null}{overview.expected.unavailablePriceCount ? <p className="flex items-start gap-2 text-[var(--admin-danger)]"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{dict.priceUnavailable}: {overview.expected.unavailablePriceCount}</p> : null}</AdminPanel> : null}
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]"><FinanceChart points={points} future={tab === "expected"} /><MethodPanel methods={overview.methods} denominatorMinor={overview.collected.amount.amountMinor} period={collectedPeriod} /></div>
    <CategoryTable overview={overview} tab={tab} />
    <Payments rows={paymentRows} status={paymentStatus} onLoadMore={() => !preview && payments.loadMore(12)} onOpen={(row, trigger) => { paymentTriggerRef.current = trigger; setSelectedPayment(row); }} />
    <CostDialog open={costOpen} onOpenChange={(open) => { setCostOpen(open); if (!open) window.setTimeout(() => costTriggerRef.current?.focus(), 250); }} accountId={accountId} onSave={async (payload) => { if (preview) { setNotice(dict.mutationSuccess); return; } await saveCost(payload); setNotice(dict.mutationSuccess); }} />
    <PaymentDialog open={Boolean(selectedPayment)} onOpenChange={(open) => { if (!open) { setSelectedPayment(null); window.setTimeout(() => paymentTriggerRef.current?.focus(), 250); } }} row={selectedPayment} detail={effectiveDetail} onRefund={async (payload) => { if (preview) { setNotice(dict.mutationSuccess); return; } await refund(payload); setNotice(dict.mutationSuccess); }} />
  </div>;
}

export function AdminClientFinanceSummary({ accountId, preview }: { accountId: Id<"accounts">; preview?: boolean }) {
  const [now] = useState(() => Date.now());
  const result = useQuery(api.adminFinance.overview, preview ? "skip" : { accountId, now, collectedPeriod: "month", expectedPeriod: "next_month", filter: "total", profitFilter: "total" });
  const payments = usePaginatedQuery(api.adminFinance.listPayments, preview ? "skip" : { accountId, filter: "total" }, { initialNumItems: 3 });
  const overview = preview ? fixtureOverview : result;
  if (!overview) return <AdminLoadingState />;
  const recent = preview ? fixturePayments.slice(0, 3) : payments.results;
  return <div><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{dict.profileTitle}</h2><p className="mt-1 text-sm text-[var(--admin-text-muted)]">{dict.profileDescription}</p></div><Link href={`/admin/finansije?account=${accountId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4">{dict.profileOpenGlobal}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><MetricCard label={dict.tabCollected} value={money(overview.collected.amount.amountMinor)} hint={dict.summaryCurrentMonth} state="actual" icon={ReceiptText} /><MetricCard label={dict.tabExpected} value={money(overview.expected.amount.amountMinor)} hint={dict.summaryNextMonth} state="future" icon={CalendarClock} /><MetricCard label={dict.tabProfit} value={overview.profit.amount ? money(overview.profit.amount.amountMinor) : "—"} hint={overview.profit.complete ? dict.directCosts : dict.incompleteBadge} state={overview.profit.complete ? "complete" : "incomplete"} icon={CircleDollarSign} /></div><div className="mt-4 grid gap-3 lg:grid-cols-2"><section className="rounded-xl border border-[var(--admin-border)] p-4"><h3 className="font-semibold">{dict.profileObligations}</h3><dl className="mt-3 grid grid-cols-3 gap-3 text-sm"><div><dt className="text-xs text-[var(--admin-text-muted)]">{dict.profileDated}</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{money(overview.expected.datedMinor)}</dd></div><div><dt className="text-xs text-[var(--admin-text-muted)]">{dict.profileUndated}</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{money(overview.expected.undatedMinor)}</dd></div><div><dt className="text-xs text-[var(--admin-text-muted)]">{dict.profileOverdue}</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{money(overview.expected.overdueMinor)}</dd></div></dl></section><section className="rounded-xl border border-[var(--admin-border)] p-4"><h3 className="font-semibold">{dict.profileLastPayments}</h3>{recent.length ? <ul className="mt-3 grid gap-2">{recent.map((row) => <li key={row._id} className="flex items-center justify-between gap-3 text-sm"><span className="text-[var(--admin-text-muted)]">{date.format(row.paidAt)}</span><strong className="font-mono tabular-nums">{money(row.amountMinor)}</strong></li>)}</ul> : <p className="mt-3 text-sm text-[var(--admin-text-muted)]">{dict.profileNoPayments}</p>}</section></div></div>;
}

export class AdminFinanceErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} onRetry={() => window.location.reload()} /></AdminPanel> : this.props.children; }
}

const fixtureOverview: Overview = {
  scopeAccountId: null,
  collected: { amount: { amountMinor: 465_000, currency: "RSD" }, refunds: { amountMinor: 25_000, currency: "RSD" }, reversals: { amountMinor: 10_000, currency: "RSD" }, series: [
    { key: "2026-09-02", amountMinor: 95_000, undated: false }, { key: "2026-09-07", amountMinor: 140_000, undated: false }, { key: "2026-09-12", amountMinor: 230_000, undated: false },
  ] },
  expected: { amount: { amountMinor: 620_000, currency: "RSD" }, datedMinor: 520_000, undatedMinor: 100_000, overdueMinor: 35_000, unavailablePriceCount: 1, series: [{ key: "2026-10", amountMinor: 170_000, undated: false }, { key: "2026-11", amountMinor: 170_000, undated: false }, { key: "2026-12", amountMinor: 180_000, undated: false }, { key: "undated", amountMinor: 100_000, undated: true }], categories: [{ category: "physical", amountMinor: 0, undatedMinor: 100_000, waivedCount: 0 }, { category: "saas", amountMinor: 360_000, undatedMinor: 0, waivedCount: 1 }, { category: "premium", amountMinor: 160_000, undatedMinor: 0, waivedCount: 0 }, { category: "unallocated", amountMinor: 0, undatedMinor: 0, waivedCount: 0 }] },
  profit: { amount: null, complete: false, missing: ["backend"], costs: { amountMinor: 118_000, currency: "RSD" } },
  categories: [{ category: "physical", collectedMinor: 210_000, refundsMinor: 25_000, costsMinor: 86_000, profitMinor: 99_000, complete: true, missing: [] }, { category: "saas", collectedMinor: 165_000, refundsMinor: 0, costsMinor: 32_000, profitMinor: null, complete: false, missing: ["backend"] }, { category: "premium", collectedMinor: 90_000, refundsMinor: 0, costsMinor: 0, profitMinor: 90_000, complete: true, missing: [] }, { category: "unallocated", collectedMinor: 0, refundsMinor: 0, costsMinor: 0, profitMinor: 0, complete: true, missing: [] }],
  methods: [{ method: "bank_transfer", amountMinor: 280_000, percent: 60.21 }, { method: "payment_card", amountMinor: 120_000, percent: 25.81 }, { method: "cash", amountMinor: 65_000, percent: 13.98 }, { method: "other", amountMinor: 0, percent: 0 }],
};

const fixturePayments: PaymentRow[] = [
  { _id: "fixture-payment-list-1" as Id<"financePaymentListRows">, _creationTime: 1, scopeKey: "global", filterKey: "total", accountId: "fixture-account-1" as Id<"accounts">, accountName: "Bistro Zelen", paymentId: "fixture-payment-1" as Id<"payments">, amountMinor: 240_000, currency: "RSD", paidAt: Date.parse("2026-09-12T10:00:00Z"), method: "bank_transfer", reference: "IZVOD-0912", recordedByUserId: "fixture-admin" as Id<"users">, allocations: [{ logicalKey: "fixture-annual", category: "saas", serviceType: "scanme_links", amountMinor: 150_000, period: "annual", coveredStart: Date.parse("2026-09-01"), coveredEnd: Date.parse("2027-09-01"), subscriptionId: "fixture-sub" as Id<"subscriptions"> }, { logicalKey: "fixture-premium", category: "premium", amountMinor: 90_000, period: "annual", coveredStart: Date.parse("2026-09-01"), coveredEnd: Date.parse("2027-09-01"), subscriptionId: "fixture-premium-sub" as Id<"subscriptions"> }], refundedMinor: 25_000, reversedMinor: 0, updatedAt: 1 },
  { _id: "fixture-payment-list-2" as Id<"financePaymentListRows">, _creationTime: 2, scopeKey: "global", filterKey: "total", accountId: "fixture-account-2" as Id<"accounts">, accountName: "Hotel Dunav", paymentId: "fixture-payment-2" as Id<"payments">, amountMinor: 160_000, currency: "RSD", paidAt: Date.parse("2026-09-07T10:00:00Z"), method: "payment_card", allocations: [{ logicalKey: "fixture-physical", category: "physical", amountMinor: 160_000, period: "one_time", orderId: "fixture-order" as Id<"orders"> }], refundedMinor: 0, reversedMinor: 0, updatedAt: 2 },
  { _id: "fixture-payment-list-3" as Id<"financePaymentListRows">, _creationTime: 3, scopeKey: "global", filterKey: "total", accountId: "fixture-account-3" as Id<"accounts">, accountName: "Kafe Most", paymentId: "fixture-payment-3" as Id<"payments">, amountMinor: 65_000, currency: "RSD", paidAt: Date.parse("2026-09-02T10:00:00Z"), method: "cash", allocations: [{ logicalKey: "fixture-links", category: "saas", serviceType: "scanme_links", amountMinor: 65_000, period: "monthly", coveredStart: Date.parse("2026-09-01"), coveredEnd: Date.parse("2026-10-01"), subscriptionId: "fixture-links-sub" as Id<"subscriptions"> }], refundedMinor: 0, reversedMinor: 0, updatedAt: 3 },
];

function fixtureDetail(row: PaymentRow): PaymentDetail {
  return { payment: { ...row, _id: row._id as unknown as Id<"financePaymentDigests"> }, entries: [], adjustments: row.refundedMinor ? [{ _id: "fixture-adjustment" as Id<"paymentAdjustments">, _creationTime: 1, accountId: row.accountId, paymentId: row.paymentId, kind: "refund", amount: { amountMinor: row.refundedMinor, currency: "RSD" }, change: { actor: { kind: "admin", userId: "fixture-admin" as Id<"users"> }, at: Date.parse("2026-09-14T10:00:00Z"), reason: "Dogovoreni delimičan povraćaj" }, occurredAt: Date.parse("2026-09-14T10:00:00Z"), allocations: [{ logicalKey: row.allocations[0].logicalKey, amountMinor: row.refundedMinor }], key: "fixture-refund", fingerprint: "fixture-refund" }] : [] };
}
