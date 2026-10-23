"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckSquare2,
  CircleDollarSign,
  Clock3,
  Inbox,
  Pause,
  QrCode,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {
  Component,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n/format";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPanel,
  AdminStatus,
} from "./admin-primitives";

type ReactionData = FunctionReturnType<typeof api.adminDashboard.reactions>;
type SubscriptionData = FunctionReturnType<typeof api.adminDashboard.subscriptions>;
type ProductData = FunctionReturnType<typeof api.adminDashboard.products>;
type FinanceData = FunctionReturnType<typeof api.adminFinance.overview>;
type TaskData = FunctionReturnType<typeof api.adminTasks.dashboardAdapter>;
type InboxData = FunctionReturnType<typeof api.adminDashboard.inbox>;
type DashboardScope = "all" | "mine";

export type AdminDashboardFixture = {
  now: number;
  reactions: Record<DashboardScope, ReactionData>;
  subscriptions: SubscriptionData;
  products: ProductData;
  finance: FinanceData;
  tasks: TaskData;
  inbox: InboxData;
  errorWidget?: "subscriptions";
  loadingWidget?: "subscriptions";
};

const panelClass = "overflow-hidden border-[var(--admin-border)] bg-[var(--admin-surface-strong)]";
const linkClass = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[var(--admin-text)] transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2";

export function AdminDashboardFoundation({
  initialNow,
  fixture,
}: {
  initialNow?: number;
  fixture?: AdminDashboardFixture;
}) {
  const [scope, setScope] = useState<DashboardScope>("all");
  const [now, setNow] = useState(fixture?.now ?? initialNow ?? 0);

  useEffect(() => {
    if (fixture) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [fixture]);

  if (now === 0) {
    return (
      <div className="mx-auto grid w-full max-w-[112rem] gap-5">
        <h1 className="text-[clamp(2.2rem,5vw,4.75rem)] leading-[0.92] font-medium tracking-[-0.06em]">
          {adminV1Sr.dashboardTitle}
        </h1>
        <PanelLoading />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[112rem] min-w-0 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(15rem,0.6fr)_minmax(15rem,0.6fr)] xl:gap-6">
      {fixture ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] px-4 py-3 text-sm text-[var(--admin-warning)] xl:col-span-3">
          <strong>{adminV1Sr.dashboardFixtureBadge}</strong>
          <span>{adminV1Sr.dashboardFixtureDescription}</span>
        </div>
      ) : null}

      <DashboardWidgetBoundary key={`reaction-${scope}`} contents>
        {fixture ? (
          <ReactionBundle data={fixture.reactions[scope]} now={now} scope={scope} onScopeChange={setScope} fixture />
        ) : (
          <ReactionLive now={now} scope={scope} onScopeChange={setScope} />
        )}
      </DashboardWidgetBoundary>
      <DashboardWidgetBoundary>
        {fixture?.errorWidget === "subscriptions" ? <FixtureWidgetFailure /> : fixture?.loadingWidget === "subscriptions" ? <RingLoading /> : fixture ? <SubscriptionWidget data={fixture.subscriptions} /> : <SubscriptionLive />}
      </DashboardWidgetBoundary>
      <DashboardWidgetBoundary>
        {fixture ? <ProductWidget data={fixture.products} /> : <ProductLive />}
      </DashboardWidgetBoundary>
      <DashboardWidgetBoundary>
        {fixture ? <FinanceWidget data={fixture.finance} /> : <FinanceLive now={now} />}
      </DashboardWidgetBoundary>
      <DashboardWidgetBoundary>
        {fixture ? <TasksWidget data={fixture.tasks} scope={scope} /> : <TasksLive now={now} scope={scope} />}
      </DashboardWidgetBoundary>
      <DashboardWidgetBoundary>
        {fixture ? <InboxWidget data={fixture.inbox} now={now} /> : <InboxLive now={now} />}
      </DashboardWidgetBoundary>
    </div>
  );
}

function ReactionLive({ now, scope, onScopeChange }: { now: number; scope: DashboardScope; onScopeChange: (scope: DashboardScope) => void }) {
  const data = useQuery(api.adminDashboard.reactions, { now, scope, limit: 8 });
  if (!data) return <ReactionLoading scope={scope} onScopeChange={onScopeChange} now={now} />;
  return <ReactionBundle data={data} now={now} scope={scope} onScopeChange={onScopeChange} />;
}

function ReactionLoading({ scope, onScopeChange, now }: { scope: DashboardScope; onScopeChange: (scope: DashboardScope) => void; now: number }) {
  return (
    <>
      <div className="xl:col-span-3"><DashboardHeader count={null} now={now} scope={scope} onScopeChange={onScopeChange} /></div>
      <AdminPanel className={cn(panelClass, "min-h-24 xl:col-span-3")}><AdminLoadingState compact /></AdminPanel>
      <AdminPanel className={cn(panelClass, "min-h-[28rem]")}><AdminLoadingState /></AdminPanel>
    </>
  );
}

function ReactionBundle({ data, now, scope, onScopeChange, fixture = false }: { data: ReactionData; now: number; scope: DashboardScope; onScopeChange: (scope: DashboardScope) => void; fixture?: boolean }) {
  return (
    <>
      <div className="xl:col-span-3"><DashboardHeader count={data.counts?.total ?? null} now={now} scope={scope} onScopeChange={onScopeChange} /></div>
      <div className="xl:col-span-3">{data.counts ? <SignalStrip counts={data.counts} /> : <ProjectionUnavailable compact />}</div>
      <ReactionList data={data} now={now} fixture={fixture} />
    </>
  );
}

function DashboardHeader({ count, now, scope, onScopeChange }: { count: number | null; now: number; scope: DashboardScope; onScopeChange: (scope: DashboardScope) => void }) {
  const countLabel = count === null
    ? adminV1Sr.dashboardCountUnavailable
    : count === 0
      ? adminV1Sr.dashboardCountZero
      : count === 1
        ? adminV1Sr.dashboardCountOne
        : fmt(adminV1Sr.dashboardCountMany, { count });
  const date = useMemo(() => new Intl.DateTimeFormat("sr-Latn-RS", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Belgrade",
  }).format(now), [now]);
  return (
    <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--admin-text-muted)] first-letter:uppercase">{date}</p>
        <h1 className="mt-2 text-[clamp(2.2rem,5vw,4.75rem)] leading-[0.92] font-medium tracking-[-0.06em] text-balance">{countLabel}</h1>
      </div>
      <div role="group" aria-label={adminV1Sr.dashboardScopeLabel} className="inline-grid min-h-[3.25rem] grid-cols-2 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-1 shadow-[var(--admin-shadow-xs)]">
        {(["all", "mine"] as const).map((value) => (
          <button key={value} type="button" aria-pressed={scope === value} onClick={() => onScopeChange(value)} className={cn("min-h-11 rounded-full px-4 text-sm font-semibold transition-colors", scope === value ? "bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "text-[var(--admin-text-muted)] hover:text-[var(--admin-text)]")}>{value === "all" ? adminV1Sr.dashboardScopeAll : adminV1Sr.dashboardScopeMine}</button>
        ))}
      </div>
    </header>
  );
}

function SignalStrip({ counts }: { counts: NonNullable<ReactionData["counts"]> }) {
  const signals: { label: string; value: number; tone: "danger" | "warning" | "neutral" | "success"; title?: string }[] = [
    { label: adminV1Sr.dashboardSignalUrgent, value: counts.urgent, tone: "danger" },
    { label: adminV1Sr.dashboardSignalToday, value: counts.today, tone: "warning" },
    { label: adminV1Sr.dashboardSignalWaitingClient, value: counts.waitingClient, tone: "neutral" },
    { label: adminV1Sr.dashboardSignalCalm, value: counts.calm, tone: "success", title: adminV1Sr.dashboardSignalCalmHelp },
  ];
  return (
    <AdminPanel className={cn(panelClass, "grid grid-cols-2 divide-x divide-y divide-[var(--admin-border)] sm:grid-cols-4 sm:divide-y-0")}>
      {signals.map((signal) => (
        <div key={signal.label} title={signal.title} className="flex min-h-20 items-center justify-between gap-3 px-4 py-3 sm:min-h-24 sm:px-5">
          <span className="text-sm font-semibold text-[var(--admin-text-muted)]">{signal.label}</span>
          <span data-tone={signal.tone} className={cn("font-mono text-3xl font-semibold tracking-[-0.05em] tabular-nums", signal.tone === "danger" && "text-[var(--admin-danger)]", signal.tone === "warning" && "text-[var(--admin-warning)]", signal.tone === "success" && "text-[var(--admin-success)]")}>{signal.value}</span>
        </div>
      ))}
    </AdminPanel>
  );
}

function ReactionList({ data, now, fixture = false }: { data: ReactionData; now: number; fixture?: boolean }) {
  if (data.projection === "unavailable") return <AdminPanel className={cn(panelClass, "min-h-[28rem]")}><ProjectionUnavailable /></AdminPanel>;
  return (
    <AdminPanel className={cn(panelClass, "min-h-[28rem]")}>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--admin-border)] px-5 py-5 sm:px-6">
        <div><h2 className="text-xl font-semibold tracking-[-0.03em]">{adminV1Sr.dashboardReactionTitle}</h2><p className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">{adminV1Sr.dashboardReactionHint}</p></div>
        <AlertTriangle className="mt-1 size-5 text-[var(--admin-danger)]" aria-hidden="true" />
      </div>
      {data.items.length === 0 ? <AdminEmptyState title={adminV1Sr.dashboardReactionEmptyTitle} body={adminV1Sr.dashboardReactionEmptyBody} className="min-h-[22rem]" /> : <ol className="divide-y divide-[var(--admin-border)]">{data.items.map((item) => <ReactionRow key={item.action.causeId} item={item} now={now} fixture={fixture} />)}</ol>}
      {data.capped ? <p className="border-t border-[var(--admin-border)] px-5 py-3 text-xs font-semibold text-[var(--admin-text-muted)]">{adminV1Sr.dashboardMoreActions}</p> : null}
    </AdminPanel>
  );
}

function ReactionRow({ item, now, fixture }: { item: ReactionData["items"][number]; now: number; fixture: boolean }) {
  const [dialog, setDialog] = useState<"snooze" | "resolve" | null>(null);
  const causeLabel = causeTitle(item.action.source.domain);
  const context = [item.contextLabel, item.contextCode].filter(Boolean).join(" · ");
  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <span className={cn("mt-1 size-2.5 rounded-full sm:mt-0", item.action.severity === "blocking" ? "bg-[var(--admin-danger)]" : item.action.severity === "warning" ? "bg-[var(--admin-warning)]" : "bg-[var(--admin-text-muted)]")} aria-hidden="true" />
      <div className="min-w-0"><p className="font-semibold tracking-[-0.015em]">{item.action.description ?? causeLabel}</p><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--admin-text-muted)]"><span>{context || causeLabel}</span><span>{relativeTime(item.action.relevantAt, now)}</span><span>{item.action.assigneeId ? adminV1Sr.dashboardScopeMine : adminV1Sr.dashboardUnassigned}</span></div></div>
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        <button type="button" onClick={() => setDialog("snooze")} className={linkClass}><Pause className="size-4" aria-hidden="true" />{adminV1Sr.dashboardSnooze}</button>
        {item.action.resolutionRule === "manual_problem_resolution" ? <button type="button" onClick={() => setDialog("resolve")} className={cn(linkClass, "bg-[var(--admin-ink)] text-[var(--admin-on-ink)] hover:bg-[var(--admin-text-muted)]")}>{adminV1Sr.dashboardResolve}</button> : <Link href={item.href} className={cn(linkClass, "bg-[var(--admin-ink)] text-[var(--admin-on-ink)] hover:bg-[var(--admin-text-muted)]")}>{adminV1Sr.dashboardResolve}<ArrowUpRight className="size-4" aria-hidden="true" /></Link>}
      </div>
      <ActionDialog mode={dialog} onOpenChange={(open) => { if (!open) setDialog(null); }} actionItemId={item.action.actionItemId} fixture={fixture} />
    </li>
  );
}

function ActionDialog({ mode, onOpenChange, actionItemId, fixture }: { mode: "snooze" | "resolve" | null; onOpenChange: (open: boolean) => void; actionItemId: Id<"actionItems">; fixture: boolean }) {
  const snooze = useMutation(api.adminActions.snoozeFromDashboard);
  const resolve = useMutation(api.adminActions.resolveManualFromDashboard);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function submit() {
    setPending(true); setError(false);
    try {
      if (fixture) {
        onOpenChange(false); setReason(""); setUntil("");
        return;
      }
      if (mode === "snooze") await snooze({ actionItemId, reason, until: new Date(until).getTime() });
      else if (mode === "resolve") await resolve({ actionItemId, note: reason });
      onOpenChange(false); setReason(""); setUntil("");
    } catch { setError(true); } finally { setPending(false); }
  }
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="admin-v1 rounded-[var(--admin-radius-panel)] border-[var(--admin-border)] bg-[var(--admin-surface-strong)] text-[var(--admin-text)]">
        <DialogHeader><DialogTitle>{mode === "snooze" ? adminV1Sr.dashboardSnoozeTitle : adminV1Sr.dashboardResolveTitle}</DialogTitle><DialogDescription>{mode === "snooze" ? adminV1Sr.dashboardSnoozeReason : adminV1Sr.dashboardResolveNote}</DialogDescription></DialogHeader>
        <label className="grid gap-2 text-sm font-semibold">{mode === "snooze" ? adminV1Sr.dashboardSnoozeReason : adminV1Sr.dashboardResolveNote}<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={mode === "snooze" ? adminV1Sr.dashboardSnoozeReasonPlaceholder : adminV1Sr.dashboardResolveNotePlaceholder} rows={4} className="min-h-24 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-app)] px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-ink)]" /></label>
        {mode === "snooze" ? <label className="grid gap-2 text-sm font-semibold">{adminV1Sr.dashboardSnoozeUntil}<input type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} className="min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-app)] px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-ink)]" /></label> : null}
        {error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{adminV1Sr.dashboardMutationError}</p> : null}
        <DialogFooter><DialogClose asChild><button type="button" className={linkClass}>{adminV1Sr.dashboardCancel}</button></DialogClose><button type="button" disabled={pending || !reason.trim() || (mode === "snooze" && !until)} onClick={() => void submit()} className={cn(linkClass, "justify-center bg-[var(--admin-ink)] text-[var(--admin-on-ink)] disabled:opacity-50")}>{mode === "snooze" ? adminV1Sr.dashboardSnoozeConfirm : adminV1Sr.dashboardResolveConfirm}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionLive() { const data = useQuery(api.adminDashboard.subscriptions); return data ? <SubscriptionWidget data={data} /> : <RingLoading />; }
function SubscriptionWidget({ data }: { data: SubscriptionData }) {
  if (!data.counts) return <SmallUnavailable title={adminV1Sr.dashboardSubscriptionsTitle} />;
  return <RingWidget icon={<WalletCards className="size-5" aria-hidden="true" />} title={adminV1Sr.dashboardSubscriptionsTitle} total={data.counts.total} totalLabel={adminV1Sr.dashboardSubscriptionsTotal} segments={[{ label: adminV1Sr.dashboardSubscriptionsActive, value: data.counts.active, tone: "success" }, { label: adminV1Sr.dashboardSubscriptionsGrace, value: data.counts.grace, tone: "warning" }, { label: adminV1Sr.dashboardSubscriptionsSuspended, value: data.counts.suspended, tone: "danger" }, { label: adminV1Sr.dashboardSubscriptionsInactive, value: data.counts.inactive, tone: "neutral" }]} footer={data.counts.warning ? `${data.counts.warning} · ${adminV1Sr.dashboardSubscriptionsWarning}` : undefined} />;
}

function ProductLive() { const data = useQuery(api.adminDashboard.products); return data ? <ProductWidget data={data} /> : <RingLoading />; }
function ProductWidget({ data }: { data: ProductData }) {
  if (!data.counts) return <SmallUnavailable title={adminV1Sr.dashboardProductsTitle} />;
  return <RingWidget icon={<QrCode className="size-5" aria-hidden="true" />} title={adminV1Sr.dashboardProductsTitle} total={data.counts.total} totalLabel={adminV1Sr.dashboardProductsTotal} segments={[{ label: adminV1Sr.dashboardProductsActive, value: data.counts.active, tone: "success" }, { label: adminV1Sr.dashboardProductsProblem, value: data.counts.problem, tone: "danger" }, { label: adminV1Sr.dashboardProductsInactive, value: data.counts.inactive, tone: "neutral" }]} footer={`${adminV1Sr.dashboardProductsQr} ${data.counts.qr} · ${adminV1Sr.dashboardProductsNfc} ${data.counts.nfc}`} />;
}

function RingWidget({ icon, title, total, totalLabel, segments, footer }: { icon: ReactNode; title: string; total: number; totalLabel: string; segments: { label: string; value: number; tone: "success" | "warning" | "danger" | "neutral" }[]; footer?: string }) {
  const denominator = Math.max(total, 1);
  return (
    <AdminPanel className={cn(panelClass, "h-full min-h-[21rem] p-5")}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-[-0.025em]">{title}</h2><span className="text-[var(--admin-text-muted)]">{icon}</span></div>
      <div className="relative mx-auto mt-5 aspect-square w-36"><svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={`${title}: ${total} ${totalLabel}`}><circle cx="60" cy="60" r="46" fill="none" stroke="var(--admin-surface-muted)" strokeWidth="12" />{segments.map((segment, index) => { const length = (segment.value / denominator) * 289; const offset = segments.slice(0, index).reduce((sum, previous) => sum + (previous.value / denominator) * 289, 0); return <circle key={segment.label} cx="60" cy="60" r="46" fill="none" strokeWidth="12" stroke={toneColor(segment.tone)} strokeDasharray={`${length} ${289 - length}`} strokeDashoffset={-offset} />; })}</svg><div className="absolute inset-0 grid place-content-center text-center"><strong className="font-mono text-4xl tracking-[-0.06em] tabular-nums">{total}</strong><span className="text-xs font-semibold text-[var(--admin-text-muted)]">{totalLabel}</span></div></div>
      <ul className="mt-5 grid gap-2 text-xs">{segments.map((segment) => <li key={segment.label} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: toneColor(segment.tone) }} aria-hidden="true" />{segment.label}</span><strong className="font-mono tabular-nums">{segment.value}</strong></li>)}</ul>
      {footer ? <p className="mt-4 border-t border-[var(--admin-border)] pt-3 text-xs text-[var(--admin-text-muted)]">{footer}</p> : null}
    </AdminPanel>
  );
}

function FinanceLive({ now }: { now: number }) { const data = useQuery(api.adminFinance.overview, { now, collectedPeriod: "month", expectedPeriod: "next_month", filter: "total", profitFilter: "total" }); return data ? <FinanceWidget data={data} /> : <PanelLoading />; }
function FinanceWidget({ data }: { data: FinanceData }) {
  return <AdminPanel className={cn(panelClass, "h-full p-5 sm:p-6")}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-[-0.025em]">{adminV1Sr.dashboardFinanceTitle}</h2><CircleDollarSign className="size-5 text-[var(--admin-text-muted)]" aria-hidden="true" /></div><dl className="mt-6 grid gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3"><MoneyFact label={adminV1Sr.dashboardFinanceCollected} value={data.collected.amount.amountMinor} /><MoneyFact label={adminV1Sr.dashboardFinanceExpected} value={data.expected.amount.amountMinor} /><MoneyFact label={adminV1Sr.dashboardFinanceProfit} value={data.profit.amount?.amountMinor ?? null} hint={!data.profit.complete ? adminV1Sr.dashboardFinanceProfitUnavailable : undefined} /></dl><Link href="/admin/finansije" className={cn(linkClass, "mt-5 px-0")}>{adminV1Sr.dashboardFinanceOpen}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></AdminPanel>;
}
function MoneyFact({ label, value, hint }: { label: string; value: number | null; hint?: string }) { return <div><dt className="text-xs font-semibold text-[var(--admin-text-muted)]">{label}</dt><dd className="mt-1 font-mono text-xl font-semibold tracking-[-0.04em] tabular-nums">{value === null ? "—" : money(value)}</dd>{hint ? <p className="mt-1 text-xs leading-4 text-[var(--admin-warning)]">{hint}</p> : null}</div>; }

function TasksLive({ now, scope }: { now: number; scope: DashboardScope }) { const data = useQuery(api.adminTasks.dashboardAdapter, { now, limit: 4 }); return data ? <TasksWidget data={data} scope={scope} /> : <PanelLoading />; }
function TasksWidget({ data, scope }: { data: TaskData; scope: DashboardScope }) {
  const source = scope === "mine" ? data.mine : { items: [...data.overdue.items, ...data.today.items].filter((item, index, rows) => rows.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 4), capped: data.overdue.capped || data.today.capped || data.overdue.items.length + data.today.items.length > 4 };
  return <AdminPanel className={cn(panelClass, "h-full p-5 sm:p-6")}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-[-0.025em]">{adminV1Sr.dashboardTasksTitle}</h2><CheckSquare2 className="size-5 text-[var(--admin-text-muted)]" aria-hidden="true" /></div>{source.items.length ? <ul className="mt-4 divide-y divide-[var(--admin-border)]">{source.items.map((task) => <li key={task.id} className="py-3"><Link href={task.subjectHref ?? "/admin/zadaci"} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"><span className="line-clamp-2 text-sm font-semibold">{task.title}</span><span className="mt-1 flex items-center gap-2 text-xs text-[var(--admin-text-muted)]"><Clock3 className="size-3.5" aria-hidden="true" />{task.timePhase === "overdue" ? adminV1Sr.dashboardTasksOverdue : task.timePhase === "today" ? adminV1Sr.dashboardTasksToday : task.assigneeName}</span></Link></li>)}</ul> : <p className="mt-8 text-sm text-[var(--admin-text-muted)]">{adminV1Sr.dashboardTasksEmpty}</p>}{source.capped ? <p className="mt-2 text-xs font-semibold text-[var(--admin-text-muted)]">{adminV1Sr.dashboardMoreActions}</p> : null}<Link href="/admin/zadaci" className={cn(linkClass, "mt-3 px-0")}>{adminV1Sr.dashboardTasksOpen}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></AdminPanel>;
}

function InboxLive({ now }: { now: number }) { const data = useQuery(api.adminDashboard.inbox, { limit: 4 }); return data ? <InboxWidget data={data} now={now} /> : <PanelLoading />; }
function InboxWidget({ data, now }: { data: InboxData; now: number }) {
  return <AdminPanel className={cn(panelClass, "h-full p-5 sm:p-6")}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-[-0.025em]">{adminV1Sr.dashboardInboxTitle}</h2><Inbox className="size-5 text-[var(--admin-text-muted)]" aria-hidden="true" /></div>{!data.provider ? <p className="mt-3 rounded-xl bg-[var(--admin-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--admin-warning)]">{adminV1Sr.dashboardInboxProviderUnavailable}</p> : <p className="mt-3 text-xs text-[var(--admin-text-muted)]">{fmt(adminV1Sr.dashboardInboxProviderState, { state: data.provider.operationalState })}</p>}{data.items.length ? <ul className="mt-3 divide-y divide-[var(--admin-border)]">{data.items.map((item) => <li key={item.id} className="py-3"><Link href={item.href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"><span className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{item.contactName}</strong>{item.unreadCount ? <AdminStatus tone="problem" label={fmt(adminV1Sr.dashboardUnread, { count: item.unreadCount })} className="shrink-0" /> : null}</span><span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">{item.accountName} · {relativeTime(item.latestMessageAt, now)}</span><span className="mt-1 line-clamp-1 text-xs text-[var(--admin-text-muted)]">{item.preview}</span></Link></li>)}</ul> : <p className="mt-8 text-sm text-[var(--admin-text-muted)]">{adminV1Sr.dashboardInboxEmpty}</p>}{data.capped ? <p className="mt-2 text-xs font-semibold text-[var(--admin-text-muted)]">{adminV1Sr.dashboardMoreActions}</p> : null}<Link href="/admin/inbox" className={cn(linkClass, "mt-3 px-0")}>{adminV1Sr.dashboardInboxOpen}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></AdminPanel>;
}

function ProjectionUnavailable({ compact = false }: { compact?: boolean }) { return compact ? <AdminPanel className={cn(panelClass, "px-5 py-4")}><p className="font-semibold">{adminV1Sr.dashboardProjectionUnavailableTitle}</p><p className="mt-1 text-sm text-[var(--admin-text-muted)]">{adminV1Sr.dashboardProjectionUnavailableBody}</p></AdminPanel> : <AdminEmptyState title={adminV1Sr.dashboardProjectionUnavailableTitle} body={adminV1Sr.dashboardProjectionUnavailableBody} className="min-h-[28rem]" />; }
function SmallUnavailable({ title }: { title: string }) { return <AdminPanel className={cn(panelClass, "h-full min-h-[21rem] p-5")}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-5 text-sm leading-6 text-[var(--admin-text-muted)]">{adminV1Sr.dashboardProjectionUnavailableBody}</p></AdminPanel>; }
function PanelLoading() { return <AdminPanel className={cn(panelClass, "min-h-64")}><AdminLoadingState /></AdminPanel>; }
function RingLoading() { return <AdminPanel className={cn(panelClass, "min-h-[21rem]")}><AdminLoadingState /></AdminPanel>; }

class DashboardWidgetBoundary extends Component<{ children: ReactNode; contents?: boolean }, { failed: boolean; resetKey: number }> {
  state = { failed: false, resetKey: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {}
  render() {
    if (this.state.failed) return <AdminPanel className={cn(panelClass, "min-h-56")}><AdminErrorState title={adminV1Sr.dashboardWidgetErrorTitle} body={adminV1Sr.dashboardWidgetErrorBody} /><button type="button" onClick={() => this.setState((state) => ({ failed: false, resetKey: state.resetKey + 1 }))} className={cn(linkClass, "mx-auto mb-5 flex")}><RotateCcw className="size-4" aria-hidden="true" />{adminV1Sr.retryAction}</button></AdminPanel>;
    return <div key={this.state.resetKey} className={this.props.contents ? "contents" : "min-w-0"}>{this.props.children}</div>;
  }
}

function FixtureWidgetFailure() {
  const client = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (client) throw new Error("dashboard_fixture_widget_failure");
  return <RingLoading />;
}

function causeTitle(domain: ReactionData["items"][number]["action"]["source"]["domain"]) {
  const labels = { subscription: adminV1Sr.dashboardCauseSubscription, task: adminV1Sr.dashboardCauseTask, order: adminV1Sr.dashboardCauseOrder, physical_product: adminV1Sr.dashboardCauseQrNfc, qr_nfc: adminV1Sr.dashboardCauseQrNfc, inbox: adminV1Sr.dashboardCauseEmail, service_activation_request: adminV1Sr.dashboardCauseActivation, manual_problem: adminV1Sr.dashboardCauseManual } as const;
  return labels[domain] ?? adminV1Sr.dashboardCauseOther;
}
function relativeTime(time: number, now: number) { const minutes = Math.round((time - now) / 60_000); const formatter = new Intl.RelativeTimeFormat("sr-Latn-RS", { numeric: "auto" }); if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute"); const hours = Math.round(minutes / 60); if (Math.abs(hours) < 24) return formatter.format(hours, "hour"); return formatter.format(Math.round(hours / 24), "day"); }
function money(amountMinor: number) { return new Intl.NumberFormat("sr-Latn-RS", { style: "currency", currency: "RSD", maximumFractionDigits: 0 }).format(amountMinor / 100); }
function toneColor(tone: "success" | "warning" | "danger" | "neutral") { if (tone === "success") return "var(--admin-success)"; if (tone === "warning") return "var(--admin-warning)"; if (tone === "danger") return "var(--admin-danger)"; return "var(--admin-text-muted)"; }
