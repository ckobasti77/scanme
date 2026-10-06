import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { leadDeliveryDeadline } from "@/components/admin/events/leads-logic";
import { eventSectionHref, type EventSectionPath } from "@/lib/admin-v1/event-sections";
import { parseAdminQuery, type AdminQueryState } from "@/lib/admin-v1/query-state";
import type { AdminSubnavGroup, AdminSubnavItem, AdminUrgencyTone } from "@/lib/admin-v1/subnav";
import { FAIR_DASHBOARD_SECTIONS, FAIR_DASHBOARD_TONE_RANK, sortFairDashboardActions, type FairDashboardSection } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// Admin UX A10 — pure logic of `pregled`: the dashboard query result
// (fairDashboard.getEventDashboard) → links to the filtered sections, the
// item sentences, the countdown and the urgency badges of the section
// navigation. Shared by the admin, the dev preview and the tests
// (components/admin/events/sections/pregled-view.test.tsx).

const d = adminEventsSr.dashboard;

export type EventDashboardData = FunctionReturnType<typeof api.fairDashboard.getEventDashboard>;
export type DashboardAction = EventDashboardData["actions"][number];

// Every section a rule links to is a `Događaji` route (checked by the compiler).
const DASHBOARD_PATHS: readonly EventSectionPath[] = FAIR_DASHBOARD_SECTIONS satisfies readonly EventSectionPath[];
export const isDashboardSection = (path: string): path is FairDashboardSection => (DASHBOARD_PATHS as readonly string[]).includes(path);

/** The section of an item with its filters (only the query keys the admin knows survive). */
export function dashboardActionHref(base: string, action: Pick<DashboardAction, "section" | "query">, keep: AdminQueryState = {}): string {
  return eventSectionHref(base, action.section, { ...keep, ...parseAdminQuery(action.query) });
}

/** Same order as the backend: hitno → uskoro → info, then the larger count. */
export const sortDashboardActions = <T extends Pick<DashboardAction, "rule" | "tone" | "count">>(actions: readonly T[]) => sortFairDashboardActions(actions);

export function dashboardToneCounts(actions: readonly Pick<DashboardAction, "tone">[]): Record<AdminUrgencyTone, number> {
  const counts = { hitno: 0, uskoro: 0, info: 0 };
  for (const action of actions) counts[action.tone] += 1;
  return counts;
}

// -----------------------------------------------------------------------------
// Section navigation badges (the same query as Pregled)
// -----------------------------------------------------------------------------

export type SectionUrgency = { tone: AdminUrgencyTone; count: number };

/**
 * The most urgent tone of each section and the sum of its items' counts with
 * that tone. Only hitno and uskoro become a badge (info stays on Pregled); the
 * purge countdown counts as one item, not as days.
 */
export function dashboardSectionUrgency(actions: readonly Pick<DashboardAction, "rule" | "tone" | "count" | "section">[]): Map<EventSectionPath, SectionUrgency> {
  const result = new Map<EventSectionPath, SectionUrgency>();
  for (const action of actions) {
    if (action.tone === "info") continue;
    const count = action.rule === "pii_purge_countdown" ? 1 : action.count;
    const current = result.get(action.section);
    if (!current || FAIR_DASHBOARD_TONE_RANK[action.tone] < FAIR_DASHBOARD_TONE_RANK[current.tone]) result.set(action.section, { tone: action.tone, count });
    else if (current.tone === action.tone) current.count += count;
  }
  return result;
}

const moreUrgent = (a: SectionUrgency | undefined, b: SectionUrgency | undefined) => {
  if (!a) return b;
  if (!b) return a;
  if (a.tone === b.tone) return { tone: a.tone, count: a.count + b.count };
  return FAIR_DASHBOARD_TONE_RANK[a.tone] < FAIR_DASHBOARD_TONE_RANK[b.tone] ? a : b;
};

/** The navigation with the badges; a parent (Interakcije, Leadovi) carries the most urgent of its pages for the phone bar. */
export function withNavUrgency(groups: readonly AdminSubnavGroup[], urgency: ReadonlyMap<string, SectionUrgency>): AdminSubnavGroup[] {
  const mark = (item: AdminSubnavItem): AdminSubnavItem => {
    const children = item.children?.map(mark);
    const own = urgency.get(item.id);
    const combined = children ? children.reduce<SectionUrgency | undefined>((acc, child) => moreUrgent(acc, child.urgency), own) : own;
    return { ...item, ...(children ? { children } : {}), ...(combined ? { urgency: combined } : {}) };
  };
  return groups.map((group) => ({ ...group, items: group.items.map(mark) }));
}

// -----------------------------------------------------------------------------
// Text: the sentence of an item, the phase and the countdown
// -----------------------------------------------------------------------------

const BELGRADE = "Europe/Belgrade";
const dateFormat = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", year: "numeric", timeZone: BELGRADE });
const shortDateFormat = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", timeZone: BELGRADE });
const timeFormat = new Intl.DateTimeFormat("sr-Latn-RS", { hour: "2-digit", minute: "2-digit", timeZone: BELGRADE });

export const dashboardDate = (ms: number) => dateFormat.format(ms);
export const dashboardShortDate = (ms: number) => shortDateFormat.format(ms);
export const dashboardTime = (ms: number) => timeFormat.format(ms);

/** „3 d 4 h“ / „2 h 15 min“ / „40 min“ / „sada“. */
export function timeLeftText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes <= 0) return d.left.now;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return fmt(d.left.days, { days, hours });
  if (hours > 0) return fmt(d.left.hours, { hours, minutes: minutes % 60 });
  return fmt(d.left.minutes, { minutes });
}

export function phaseText(phase: EventDashboardData["phase"]): string {
  if (phase.kind === "sajam" && !phase.dayOpen && phase.dayIndex) return fmt(d.phaseNextDay, { day: phase.dayIndex, count: phase.dayCount });
  return fmt(d.phase[phase.kind], { day: phase.dayIndex ?? 0, count: phase.dayCount });
}

/** Title and the one sentence of an item; {day}/{date}/{days} come from the dashboard. */
export function actionText(action: DashboardAction, dashboard: Pick<EventDashboardData, "days" | "event">, now: number): { title: string; body: string } {
  const copy = d.rules[action.rule];
  const day = dashboard.days.find((row) => row.dateKey === action.query.dan);
  const leadDays = leadDeliveryDeadline(now);
  const params = {
    day: day?.label ?? action.query.dan ?? "",
    date: action.rule === "pii_purge_countdown"
      ? dashboardDate(dashboard.event.piiPurgeAt)
      : action.deadlineAt !== undefined ? dashboardDate(action.deadlineAt) : day ? dashboardDate(day.startsAt) : "",
    days: leadDays.kind === "days" ? leadDays.days : 0,
  };
  return { title: fmt(copy.title, params), body: fmt(copy.body, params) };
}

/** The number on the left of an item (the countdown shows days). */
export const actionCountText = (action: Pick<DashboardAction, "rule" | "count">) => (action.rule === "pii_purge_countdown" ? fmt(d.daysBadge, { count: action.count }) : String(action.count));
