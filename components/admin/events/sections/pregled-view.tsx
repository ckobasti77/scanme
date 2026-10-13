"use client";

import { ArrowRight, Building2, Car, CheckCircle2, FileText, Inbox, MessagesSquare, QrCode, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { ADMIN_URGENCY_ICONS, AdminKpiRow, AdminUrgencyBadge, adminSecondaryButtonClass, type AdminKpi } from "@/components/admin/admin-ui";
import { AdminMissionSummary } from "@/components/admin/admin-ui/admin-missions";
import { AdminOdometer } from "@/components/admin/admin-ui/admin-odometer";
import { useMissionProgress } from "@/components/admin/admin-ui/use-mission-progress";
import { FairChain } from "@/components/admin/game/fair-chain";
import { FairChallenges } from "@/components/admin/game/fair-challenges";
import { useGameApi } from "@/components/admin/game/game-context";
import {
  actionCountText,
  actionText,
  dashboardActionHref,
  dashboardDate,
  dashboardSectionUrgency,
  dashboardShortDate,
  dashboardTime,
  dashboardToneCounts,
  phaseText,
  sortDashboardActions,
  timeLeftText,
  type DashboardAction,
  type EventDashboardData,
  type SectionUrgency,
} from "@/components/admin/events/dashboard-logic";
import { eventSectionHref, type EventSectionPath } from "@/lib/admin-v1/event-sections";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { formatCount } from "@/lib/admin-v2/analytics/format";
import { liveDay, liveDayPercent, type LiveDay } from "@/lib/admin-v2/analytics/live-day";
import { fairChain, fairChallenges, fairReady } from "@/lib/admin-v2/game/fair-missions";
import { belgradeHour } from "@/lib/admin-v2/game/time";
import type { FairChallengeInput } from "@/lib/admin-v2/game/types";
import type { MissionInput } from "@/lib/admin-v2/missions";
import type { AdminUrgencyTone } from "@/lib/admin-v1/subnav";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A10 — `pregled`, the main page of one event: phase and the next
// deadline, „Šta treba da uradim“ (hitno first, each item links to its
// filtered section), the KPI row and one card per section. Presentational:
// everything comes from fairDashboard.getEventDashboard (admin) or a TEST
// fixture (dev preview).
// ADMIN v2 X4 — the items of „Šta treba da uradim“ are missions with the
// progress of the day (the ring and „3 od 5 rešeno“; the ledger is kept in the
// browser), the numbers of the live strip roll when a poll brings new ones, and
// the live strip stays here only below lg (the sidebar is in the drawer then):
// from lg up the HUD „Danas“ of the sidebar shows the day on every page, and
// its numbers are in the KPI row and beside the missions, so nothing is twice.
// ADMIN v3 V4 — before the fair the mission map stands below the work list (a
// node lights up when that part of the preparation is done); while a fair day
// is open the daily challenges stand there, with the progress of every poll.
// Both are rules over the numbers of this page; nothing is invented.

const d = dict.dashboard;

const PHASE_TONE = { pre: "neutral", sajam: "active", posle: "neutral", obrisano: "muted" } as const;
const ROW_TONE: Record<AdminUrgencyTone, string> = {
  hitno: "border-[var(--admin-danger-border)] border-l-[var(--admin-danger)] bg-[var(--admin-danger-soft)]",
  uskoro: "border-[var(--admin-border)] border-l-[var(--admin-warning)] bg-[var(--admin-surface-strong)]",
  info: "border-[var(--admin-border)] border-l-[var(--admin-border)] bg-[var(--admin-surface)]",
};
const ICON_TONE: Record<AdminUrgencyTone, string> = {
  hitno: "text-[var(--admin-danger)]",
  uskoro: "text-[var(--admin-warning)]",
  info: "text-[var(--admin-text-muted)]",
};
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";

const deadlineMoment = (deadline: { kind: string; at: number }) => (deadline.kind === "day_end" ? deadline.at - 1 : deadline.at);

function LiveNumber({ id, label, value, partial, hint }: { id: string; label: string; value: number; partial?: boolean; hint?: string }) {
  return (
    <p data-live-number={id} className="grid min-w-0 content-start gap-0.5">
      <span className="text-xs font-semibold text-[var(--admin-text-muted)]">{label}</span>
      {/* A partial count reads "412+", as in the KPI row. */}
      <AdminOdometer value={value} text={partial ? `${formatCount(value)}+` : undefined} className="text-xl leading-7 font-semibold tracking-[-0.02em]" />
      {hint ? <span className="text-xs text-[var(--admin-text-muted)] tabular-nums">{hint}</span> : null}
    </p>
  );
}

// ADMIN v2 X3 — the small live excerpt of Analitika on Pregled: how far the open fair day is, the key
// numbers of the day and the open items, from the same getEventDashboard result (no new read).
function LiveStrip({ live, capped }: { live: LiveDay; capped: { scans: boolean; leads: boolean } }) {
  const share = `${liveDayPercent(live.progress)} %`;
  const open = live.urgent + live.soon;
  return (
    <div data-live-day="" role="group" aria-label={d.live.region} className="grid min-w-0 grid-cols-3 gap-x-6 gap-y-3 border-t border-[var(--admin-border)] pt-3 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] lg:hidden">
      <div className="col-span-3 grid min-w-0 content-start gap-1.5 sm:col-span-1">
        <p className="flex items-center gap-2 text-xs font-bold tracking-[0.08em] uppercase">
          <span aria-hidden="true" className="size-2 rounded-full bg-[var(--admin-success)]" />
          {d.live.label}
        </p>
        <div
          role="progressbar"
          aria-label={d.live.progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={liveDayPercent(live.progress)}
          aria-valuetext={fmt(d.live.progressText, { share, left: timeLeftText(live.left) })}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--admin-border)]"
        >
          <div className="h-full rounded-full bg-[var(--admin-chart-1)]" style={{ width: `${live.progress * 100}%` }} />
        </div>
        <p className="text-xs text-[var(--admin-text-muted)] tabular-nums">{fmt(d.live.progress, { share })}</p>
      </div>
      <LiveNumber id="scans" label={d.kpi.scans} value={live.scansToday} partial={capped.scans} />
      {live.leadsToday !== null ? <LiveNumber id="leads" label={d.kpi.leads} value={live.leadsToday} partial={capped.leads} /> : null}
      <LiveNumber id="todo" label={d.live.todo} value={open} hint={open ? fmt(d.live.todoHint, { hitno: live.urgent, uskoro: live.soon }) : d.live.todoClear} />
    </div>
  );
}

function Header({ dashboard, now }: { dashboard: EventDashboardData; now: number }) {
  const { phase, days } = dashboard;
  const deadline = phase.nextDeadline;
  const last = days[days.length - 1];
  const openIndex = phase.kind === "sajam" && phase.dayOpen ? (phase.dayIndex ?? 0) - 1 : -1;
  const live = liveDay({ phase, days, scansToday: dashboard.kpis.scans.today, leadsToday: dashboard.kpis.leads?.newToday ?? null, actions: dashboard.actions }, now);
  return (
    <AdminPanel className="grid min-w-0 gap-3 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 gap-1.5">
          <p className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{d.title}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AdminStatus label={phaseText(phase)} tone={PHASE_TONE[phase.kind]} className="min-h-8 px-3 text-sm" />
            <span className="text-sm text-[var(--admin-text-muted)]">
              {fmt(d.dates, { from: dashboardDate(days[0]?.startsAt ?? dashboard.event.startsAt), to: dashboardDate((last?.endsAt ?? dashboard.event.endsAt) - 1) })}
            </span>
          </div>
        </div>
        {deadline ? (
          <p className="grid min-w-0 gap-0.5 text-sm sm:text-right">
            <span className="text-xs font-semibold text-[var(--admin-text-muted)]">{d.deadline[deadline.kind]}</span>
            <span className="text-xl leading-7 font-semibold tracking-[-0.02em] tabular-nums">{timeLeftText(deadline.at - now)}</span>
            {/* An end (of a day, of 15 Nov) is shown as its last minute, 23:59, not as the next day's 00:00. */}
            <span className="text-xs text-[var(--admin-text-muted)] tabular-nums">{`${dashboardDate(deadlineMoment(deadline))} ${dashboardTime(deadlineMoment(deadline))}`}</span>
          </p>
        ) : null}
      </div>
      {days.length ? (
        <ol aria-label={d.daysLabel} className="flex min-w-0 flex-wrap gap-1.5">
          {days.map((day, index) => (
            <li
              key={day.dateKey}
              aria-current={index === openIndex ? "date" : undefined}
              className={cn(
                "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs",
                index === openIndex ? "border-[var(--admin-ink)] bg-[var(--admin-ink)] font-semibold text-[var(--admin-on-ink)]" : "border-[var(--admin-border)] text-[var(--admin-text-muted)]",
              )}
            >
              <span>{day.label}</span>
              <span className="tabular-nums">{dashboardShortDate(day.startsAt)}</span>
              {index === openIndex ? <span>· {d.todayTag}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {live ? <LiveStrip live={live} capped={{ scans: dashboard.kpis.scans.capped, leads: dashboard.kpis.leads?.capped ?? false }} /> : null}
    </AdminPanel>
  );
}

function ActionItem({ action, dashboard, now, href }: { action: DashboardAction; dashboard: EventDashboardData; now: number; href: string }) {
  const Icon = ADMIN_URGENCY_ICONS[action.tone];
  const { title, body } = actionText(action, dashboard, now);
  const count = actionCountText(action);
  const open = d.open[action.section];
  return (
    <li data-rule={action.rule} data-tone={action.tone} className={cn("grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-l-4 p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center", ROW_TONE[action.tone])}>
      <div className="flex flex-col items-center gap-1" aria-hidden="true">
        <Icon className={cn("size-5", ICON_TONE[action.tone])} />
        <span className={cn("text-lg leading-none font-semibold tabular-nums", action.tone === "hitno" && ICON_TONE.hitno)}>{count}</span>
      </div>
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold [overflow-wrap:anywhere]">{title}<span className="sr-only"> ({count})</span></span>
          <AdminUrgencyBadge tone={action.tone} />
        </p>
        <p className="mt-0.5 text-sm leading-5 text-[var(--admin-text-muted)]">{body}</p>
      </div>
      <Link href={href} aria-label={fmt(d.openFor, { action: open, title })} className={cn(adminSecondaryButtonClass, "col-start-2 min-h-9 w-fit px-3 sm:col-start-3")}>
        {open}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** The items as missions: the countdown to the deletion counts as one item, not as its days. */
function actionMissions(dashboard: EventDashboardData, now: number): MissionInput[] {
  return dashboard.actions.map((action) => ({
    id: action.rule,
    label: actionText(action, dashboard, now).title,
    count: action.rule === "pii_purge_countdown" ? 1 : action.count,
    tone: action.tone,
  }));
}

function Todo({ dashboard, now, scope, actionHref }: { dashboard: EventDashboardData; now: number; scope: string; actionHref: (action: DashboardAction) => string }) {
  const headingId = useId();
  const actions = sortDashboardActions(dashboard.actions);
  const tones = dashboardToneCounts(actions);
  const models = dashboard.kpis.models;
  const missions = useMemo(() => actionMissions(dashboard, now), [dashboard, now]);
  // The actions are the whole list: a rule that no longer fires was solved. The ledger is per phase and fair
  // day (`scope`), so a rule that stops only because the day closed is never counted as solved.
  const { board, confirm } = useMissionProgress(scope, missions, true);
  const celebrate = board.clear === "celebrate";
  return (
    <AdminPanel aria-labelledby={headingId} className="grid min-w-0 gap-3 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <h2 id={headingId} className="text-lg font-semibold tracking-[-0.025em]">{d.todoTitle}</h2>
          {actions.length ? <p className="text-xs text-[var(--admin-text-muted)]">{fmt(d.todoSummary, tones)}</p> : null}
        </div>
        {board.total > 0 ? <AdminMissionSummary title={d.todoTitle} board={board} confirm={confirm} className="min-w-[min(100%,22rem)] sm:max-w-md" /> : null}
      </div>
      {actions.length ? (
        <>
          <p className="text-sm text-[var(--admin-text-muted)]">{d.todoHelp}</p>
          <ol data-admin-reveal="rows" className="grid min-w-0 gap-2">
            {actions.map((action) => <ActionItem key={action.rule} action={action} dashboard={dashboard} now={now} href={actionHref(action)} />)}
          </ol>
        </>
      ) : (
        // The green all-clear is the day's first one; after that (and on a day nothing waited) the same facts stand calm.
        <div role="status" data-mission-clear={board.clear} className={cn("flex min-w-0 items-start gap-3 rounded-xl border p-4", celebrate ? "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)]" : "border-[var(--admin-border)] bg-[var(--admin-surface-strong)]")}>
          <CheckCircle2 className={cn("mt-0.5 size-6 shrink-0", celebrate ? "text-[var(--admin-success)]" : "text-[var(--admin-text-muted)]")} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">{d.readyTitle}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--admin-text)]">{fmt(d.readyBody, { published: models.published, total: models.total, qr: dashboard.kpis.qr.assigned })}</p>
          </div>
        </div>
      )}
    </AdminPanel>
  );
}

function kpiItems(dashboard: EventDashboardData, href: (path: EventSectionPath, query?: AdminQueryState) => string): AdminKpi[] {
  const { models, qr, scans, leads, questions, reports } = dashboard.kpis;
  const capped = (value: string, flag: boolean) => (flag ? `${value}+` : value);
  // X4 — the numbers a poll changes roll (the same text as before, „412+“ when partial).
  const rolling = (value: number, flag: boolean) => <AdminOdometer value={value} text={capped(String(value), flag)} />;
  // After the fair nothing happens "today": the totals and the open deliveries lead.
  const after = dashboard.phase.kind === "posle" || dashboard.phase.kind === "obrisano";
  const scansKpi: AdminKpi = after
    ? { id: "scans", label: d.kpi.scansTotal, value: rolling(scans.total, scans.capped), hint: fmt(d.kpi.scansTotalHint, { unique: capped(String(scans.uniqueTotal), scans.capped) }) }
    : { id: "scans", label: d.kpi.scans, value: rolling(scans.today, scans.capped), hint: fmt(d.kpi.scansHint, { total: capped(String(scans.total), scans.capped), unique: capped(String(scans.uniqueTotal), scans.capped) }) };
  const leadsKpi: AdminKpi | null = !leads
    ? null
    : after
      ? { id: "leads", label: d.kpi.leadsUndelivered, value: rolling(leads.undelivered, leads.capped), hint: fmt(d.kpi.leadsUndeliveredHint, { total: capped(String(leads.total), leads.capped) }), tone: leads.undelivered > 0 ? "warning" : "default", href: href("leadovi", { isporuka: "ne" }) }
      : { id: "leads", label: d.kpi.leads, value: rolling(leads.newToday, leads.capped), hint: fmt(d.kpi.leadsHint, { undelivered: capped(String(leads.undelivered), leads.capped), total: capped(String(leads.total), leads.capped) }), href: href("leadovi", { isporuka: "ne" }) };
  const items: (AdminKpi | null)[] = [
    { id: "models", label: d.kpi.models, value: `${models.published}/${models.total}`, hint: fmt(d.kpi.modelsHint, models.byTier), href: href("modeli") },
    {
      id: "qr",
      label: d.kpi.qr,
      value: qr.inventory === null ? String(qr.assigned) : `${qr.assigned}/${capped(String(qr.inventory), qr.inventoryCapped)}`,
      hint: qr.inventory === null ? d.kpi.qrNoInventory : d.kpi.qrHint,
      tone: qr.inventory === null ? "danger" : "default",
      href: href("qr"),
    },
    scansKpi,
    leadsKpi,
    questions
      ? {
          id: "questions",
          label: questions.today ? d.kpi.questionsToday : fmt(d.kpi.questionsDay, { day: questions.label }),
          value: `${questions.covered}/${questions.required}`,
          hint: questions.capped ? `${d.kpi.questionsHint} · ${d.kpi.capped}` : d.kpi.questionsHint,
          tone: questions.covered < questions.required ? "warning" : "default",
          href: href("interakcije", { dan: questions.dateKey }),
        }
      : null,
    reports ? { id: "reports", label: d.kpi.reports, value: String(reports.pendingReview), hint: d.kpi.reportsHint, tone: reports.pendingReview > 0 ? "danger" : "default", href: href("izvestaji", { status: "ceka-odobrenje" }) } : null,
  ];
  return items.filter((item): item is AdminKpi => item !== null);
}

type CardDef = { id: string; title: string; icon: LucideIcon; path: EventSectionPath; covers: readonly EventSectionPath[]; rows: { label: string; value: ReactNode; tone?: "danger" | "warning" }[] | null; note?: string };

function cards(dashboard: EventDashboardData): CardDef[] {
  const s = dashboard.sections;
  const c = d.cards;
  const warn = (value: number, tone: "danger" | "warning" = "danger") => (value > 0 ? tone : undefined);
  return [
    {
      id: "modeli", title: dict.sectionLabels.modeli, icon: Car, path: "modeli", covers: ["modeli"],
      rows: [
        { label: c.modeli.published, value: `${s.modeli.published}` },
        { label: c.modeli.draft, value: s.modeli.draft },
        { label: c.modeli.withErrors, value: s.modeli.withErrors, tone: warn(s.modeli.withErrors) },
      ],
    },
    {
      id: "qr", title: dict.sectionLabels.qr, icon: QrCode, path: "qr", covers: ["qr"],
      rows: [
        { label: c.qr.assigned, value: s.qr.inventory === null ? s.qr.assigned : `${s.qr.assigned}/${s.qr.inventory}` },
        { label: c.qr.withoutQr, value: s.qr.publishedWithoutQr, tone: warn(s.qr.publishedWithoutQr) },
        { label: c.qr.onWithdrawn, value: s.qr.onWithdrawn, tone: warn(s.qr.onWithdrawn) },
      ],
    },
    {
      id: "interakcije", title: dict.sectionLabels.interakcije, icon: MessagesSquare, path: "interakcije", covers: ["interakcije"],
      rows: [
        { label: c.interakcije.questions, value: s.interakcije.questions },
        { label: c.interakcije.passports, value: s.interakcije.passports },
        { label: c.interakcije.forms, value: s.interakcije.formExhibitors },
      ],
    },
    {
      id: "leadovi", title: dict.navLeads, icon: Inbox, path: "leadovi", covers: ["leadovi", "leadovi/follow-up", "leadovi/podesavanja"],
      rows: s.leadovi
        ? [
            { label: c.leadovi.total, value: s.leadovi.total },
            { label: c.leadovi.undelivered, value: s.leadovi.undelivered, tone: warn(s.leadovi.undelivered, "warning") },
            ...(s.leadovi.followUpNeeded ? [{ label: c.leadovi.followUp, value: `${s.leadovi.followUpActive}/${s.leadovi.followUpNeeded}`, tone: s.leadovi.followUpActive < s.leadovi.followUpNeeded ? ("warning" as const) : undefined }] : []),
          ]
        : null,
      note: c.leadovi.none,
    },
    {
      id: "sponzorisano", title: dict.sectionLabels.sponzorisano, icon: Sparkles, path: "sponzorisano", covers: ["sponzorisano"],
      rows: s.sponzorisano
        ? [
            { label: c.sponzorisano.inList, value: `${s.sponzorisano.inList}/${s.sponzorisano.due}`, tone: s.sponzorisano.inList !== s.sponzorisano.due ? "warning" : undefined },
            { label: c.sponzorisano.withoutQuestion, value: s.sponzorisano.withoutQuestion, tone: warn(s.sponzorisano.withoutQuestion, "warning") },
          ]
        : null,
      note: s.sponzorisano ? (s.sponzorisano.autoPublish ? c.sponzorisano.autoOn : c.sponzorisano.autoOff) : c.sponzorisano.none,
    },
    {
      id: "izvestaji", title: dict.sectionLabels.izvestaji, icon: FileText, path: "izvestaji", covers: ["izvestaji"],
      rows: s.izvestaji
        ? [
            { label: c.izvestaji.pending, value: s.izvestaji.pendingReview, tone: warn(s.izvestaji.pendingReview) },
            { label: c.izvestaji.failed, value: s.izvestaji.failed, tone: warn(s.izvestaji.failed) },
            { label: c.izvestaji.sent, value: s.izvestaji.sent },
          ]
        : null,
      note: c.izvestaji.none,
    },
    {
      id: "izlagaci", title: dict.sectionLabels.izlagaci, icon: Building2, path: "izlagaci", covers: ["izlagaci"],
      rows: [
        { label: c.izlagaci.active, value: s.izlagaci.active === s.izlagaci.total ? s.izlagaci.active : `${s.izlagaci.active}/${s.izlagaci.total}` },
        { label: c.izlagaci.withAdvanced, value: s.izlagaci.withAdvanced },
      ],
    },
  ];
}

const VALUE_TONE = { danger: "text-[var(--admin-danger)]", warning: "text-[var(--admin-warning)]" } as const;

function SectionCard({ card, urgency, href }: { card: CardDef; urgency: SectionUrgency | undefined; href: string }) {
  const Icon = card.icon;
  return (
    <article data-card={card.id} className="grid min-w-0 content-start gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 shrink-0 text-[var(--admin-text-muted)]" aria-hidden="true" />
          <span className="[overflow-wrap:anywhere]">{card.title}</span>
        </h3>
        {urgency ? <AdminUrgencyBadge tone={urgency.tone} label={fmt(adminUiSr.urgency[urgency.tone], { count: urgency.count })} /> : null}
      </div>
      {card.rows ? (
        <dl className="grid gap-1.5 text-sm">
          {card.rows.map((row) => (
            <div key={row.label} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="min-w-0 text-[var(--admin-text-muted)]">{row.label}</dt>
              <dd className={cn("shrink-0 font-semibold tabular-nums", row.tone && VALUE_TONE[row.tone])}>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {card.note && (!card.rows || card.id === "sponzorisano") ? <p className="text-xs leading-5 text-[var(--admin-text-muted)]">{card.note}</p> : null}
      <Link href={href} className={cn("inline-flex w-fit items-center gap-1 rounded-sm text-sm font-semibold underline-offset-4 hover:underline", focusRing)}>
        {d.cardOpen}<span className="sr-only">: {card.title}</span>
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </article>
  );
}

/** The daily challenges of the open fair day, from the numbers of the dashboard (and the hours of the analytics when they are in). */
function challengeInput(dashboard: EventDashboardData, now: number, hours: FairChallengeInput["hours"]): FairChallengeInput | null {
  const { phase, days } = dashboard;
  if (phase.kind !== "sajam" || !phase.dayOpen || !phase.dayIndex) return null;
  const today = days[phase.dayIndex - 1];
  if (!today) return null;
  return {
    dayIndex: phase.dayIndex,
    todayKey: today.dateKey,
    yesterdayKey: days[phase.dayIndex - 2]?.dateKey ?? null,
    hour: belgradeHour(now),
    scansToday: dashboard.kpis.scans.today,
    leadsToday: dashboard.kpis.leads?.newToday ?? null,
    urgentOpen: dashboard.actions.reduce((sum, action) => sum + (action.tone === "hitno" ? action.count : 0), 0),
    hours,
  };
}

export function EventDashboardView({ dashboard, now, base, keep = {}, hall, hours = null, eventKey = base, onBlockView }: {
  dashboard: EventDashboardData;
  /** Browser time (minute) for the countdown; at least the query's `at`. */
  now: number;
  /** `/admin/dogadjaji/<slug>` or the preview base. */
  base: string;
  /** Query keys every link keeps (the preview's `?dogadjaj=`). */
  keep?: AdminQueryState;
  /** V3 — the excerpt of the Living hall while a fair day is open; below „Šta treba da uradim“ in the left column. */
  hall?: ReactNode;
  /** V4 — scans per fair day and hour (the analytics of the event) for the daily challenges; null while that read is not in. */
  hours?: FairChallengeInput["hours"];
  /** V5 — the stable key of the event for the game (its code); the base when the page has none (the preview). */
  eventKey?: string;
  /** V5 — told when the block „challenges + hall“ enters or leaves the screen (the section reads the hours only then). */
  onBlockView?: (inView: boolean) => void;
}) {
  const kpiId = useId();
  const cardsId = useId();
  const href = (path: EventSectionPath, query: AdminQueryState = {}) => eventSectionHref(base, path, { ...keep, ...query });
  const urgency = dashboardSectionUrgency(dashboard.actions);
  const cardUrgency = (card: CardDef) =>
    card.covers.reduce<SectionUrgency | undefined>((acc, path) => {
      const next = urgency.get(path);
      if (!acc) return next;
      if (!next) return acc;
      if (acc.tone === next.tone) return { tone: acc.tone, count: acc.count + next.count };
      return acc.tone === "hitno" ? acc : next;
    }, undefined);
  const game = useGameApi();
  const nodes = useMemo(() => (dashboard.phase.kind === "pre" ? fairChain(dashboard) : []), [dashboard]);
  const challenges = useMemo(() => {
    const input = challengeInput(dashboard, Math.max(now, dashboard.at), hours);
    return input ? fairChallenges(input) : [];
  }, [dashboard, now, hours]);
  // The fair badges are facts of the event: the map all lit before the opening, the first lead. Both are told
  // as booleans (false is a known state, so a later true is news) with the event and whether its fair is over.
  const ready = dashboard.phase.kind === "pre" && fairReady(nodes);
  const firstLead = (dashboard.kpis.leads?.total ?? 0) > 0;
  const ended = dashboard.phase.kind === "posle";
  useEffect(() => {
    game.reportFair({ event: eventKey, ended, facts: { ready, firstLead } });
  }, [game, eventKey, ended, ready, firstLead]);
  // The block „challenges + hall“ is watched so that the hours it needs are read only while it is on the screen.
  const hasBlock = challenges.length > 0 || hall !== undefined;
  const block = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasBlock || !onBlockView || !block.current) return;
    const watcher = new IntersectionObserver((entries) => onBlockView(entries.some((entry) => entry.isIntersecting)));
    watcher.observe(block.current);
    return () => watcher.disconnect();
  }, [hasBlock, onBlockView]);
  const todo = <Todo dashboard={dashboard} now={Math.max(now, dashboard.at)} scope={`event:${base}:${dashboard.phase.kind}:${dashboard.phase.dayIndex ?? 0}:${dashboard.phase.dayOpen ? "otvoren" : "zatvoren"}`} actionHref={(action) => dashboardActionHref(base, action, keep)} />;
  return (
    <div className="grid min-w-0 gap-5">
      <Header dashboard={dashboard} now={Math.max(now, dashboard.at)} />
      {/* From 2xl the work list keeps the wide column and the numbers sit beside it, above the fold. */}
      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] 2xl:items-start">
        {/* One wrapper with or without the hall: the work list keeps its place in the tree when a fair day opens or closes. */}
        <div className="grid min-w-0 content-start gap-5">
          {todo}
          <FairChain nodes={nodes} />
          {/* The watched block has the same gap as the column and exists only when it has content (no extra gap). */}
          {hasBlock ? (
            <div ref={block} data-pregled-live-block="" className="grid min-w-0 gap-5">
              <FairChallenges items={challenges} />
              {hall}
            </div>
          ) : null}
        </div>
        <div className="grid min-w-0 gap-5">
          <section aria-labelledby={kpiId} className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={kpiId} className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{d.kpiTitle}</h2>
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--admin-text-muted)] tabular-nums">
                <span>{fmt(d.updated, { time: dashboardTime(dashboard.at) })}</span>
                <Link href={href("analitika")} data-open-analytics="" className={cn("inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-[var(--admin-text)] underline-offset-4 hover:underline", focusRing)}>
                  {d.openAnalytics}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </p>
            </div>
            <AdminKpiRow label={d.kpiTitle} items={kpiItems(dashboard, href)} itemClassName="2xl:flex-[1_1_9.5rem]" />
          </section>
          <section aria-labelledby={cardsId} className="grid min-w-0 gap-2">
            <h2 id={cardsId} className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{d.cardsTitle}</h2>
            <div data-admin-reveal="rows" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2">
              {cards(dashboard).map((card) => <SectionCard key={card.id} card={card} urgency={cardUrgency(card)} href={href(card.path)} />)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
