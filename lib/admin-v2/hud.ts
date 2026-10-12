// ADMIN v2 X4 — the HUD „Danas“ at the bottom of the sidebar (ZADATAK §5.2):
// the fair day as a progress bar („Dan 3 / 3 · do kraja dana 1 h 22 min“), the
// live mark while the day is open and the key number of the day. Pure: which
// event the HUD is for and what it shows come from data the admin already
// reads (the event list, getEventDashboard). Outside a fair there is no HUD.

import { liveDay, type LiveDayInput } from "@/lib/admin-v2/analytics/live-day";

export type HudEvent = { slug: string; title: string; startsAt: number; endsAt: number; status: string };

/** Statuses of an event that can have a fair day (a draft is not a fair yet, an archived one is over). */
const HUD_STATUSES: readonly string[] = ["published", "live"];

/**
 * The event whose fair is on at `now` (its first day has started and its last
 * one has not ended). With more than one, the one that started last.
 */
export function hudEvent<T extends HudEvent>(events: readonly T[], now: number): T | null {
  let found: T | null = null;
  for (const event of events) {
    if (!HUD_STATUSES.includes(event.status) || now < event.startsAt || now >= event.endsAt) continue;
    if (!found || event.startsAt > found.startsAt) found = event;
  }
  return found;
}

export type HudInput = LiveDayInput & {
  phase: LiveDayInput["phase"] & { nextDeadline: { kind: string; at: number } | null };
  /** The scan count of the day is partial (a read limit was hit): it reads „412+“. */
  scansCapped?: boolean;
};

export type HudState =
  | {
      kind: "live";
      dayIndex: number;
      dayCount: number;
      /** Share of the fair day that has passed, 0–1. */
      progress: number;
      /** Milliseconds to the end of the day. */
      left: number;
      scansToday: number;
      scansCapped: boolean;
    }
  | {
      /** Between two fair days: the next one and how long until it opens. */
      kind: "between";
      dayIndex: number;
      dayCount: number;
      left: number;
    };

/** What the HUD shows at `now`; null outside the fair days (before the opening, after the last day). */
export function hudState(input: HudInput, now: number): HudState | null {
  const live = liveDay(input, now);
  if (live) {
    return { kind: "live", dayIndex: live.dayIndex, dayCount: live.dayCount, progress: live.progress, left: live.left, scansToday: live.scansToday, scansCapped: input.scansCapped ?? false };
  }
  const { phase } = input;
  if (phase.kind !== "sajam" || phase.dayOpen || !phase.dayIndex || phase.nextDeadline?.kind !== "day_start") return null;
  return { kind: "between", dayIndex: phase.dayIndex, dayCount: phase.dayCount, left: Math.max(0, phase.nextDeadline.at - now) };
}

/** A read older than this is not called live any more (three missed polls of 60 s). */
export const HUD_STALE_MS = 3 * 60_000;

/** The HUD of one event as the sidebar draws it. */
export type HudData = {
  eventTitle: string;
  href: string;
  state: HudState;
  /** When the numbers were read. */
  readAt: number;
  /** The read is too old to say „Uživo“ (the poll keeps failing): the HUD says from when its number is. */
  stale: boolean;
};

/** The part of fairDashboard.getEventDashboard the HUD reads. */
export type HudDashboard = {
  /** The time of the read. */
  at: number;
  phase: HudInput["phase"];
  days: HudInput["days"];
  kpis: { scans: { today: number; capped: boolean } };
};

/** The HUD of `event` from its dashboard read; null outside the fair days. `href`: the event's Pregled (an admin path). */
export function hudData(event: { title: string; href: string }, dashboard: HudDashboard, now: number): HudData | null {
  const state = hudState({ phase: dashboard.phase, days: dashboard.days, scansToday: dashboard.kpis.scans.today, leadsToday: null, actions: [], scansCapped: dashboard.kpis.scans.capped }, now);
  return state ? { eventTitle: event.title, href: event.href, state, readAt: dashboard.at, stale: now - dashboard.at > HUD_STALE_MS } : null;
}
