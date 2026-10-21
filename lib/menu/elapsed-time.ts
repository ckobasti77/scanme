// ScanMe Menu V1 (K22) — the live timer of the waiter panel (master §10.4;
// docs/menu/MENU-UX.md §1.3, the panel's signature detail). Every event shows
// the same pair everywhere (queue, detail, and from K23 the floor and the
// table): the exact time it happened, in Belgrade, and how long it has been
// waiting — `18:43 · čeka 08:12`. Up to an hour the wait is `mm:ss`, after
// that `h:mm:ss`, so it never stops ticking visibly. The device computes it
// from `createdAt` once a second; no query reads the clock.

import { belgradeParts } from "../belgrade-time";

const two = (value: number) => String(value).padStart(2, "0");

/** `18:43` — the Belgrade wall-clock time of an epoch. */
export function clockTime(epoch: number): string {
  const parts = belgradeParts(epoch);
  return `${two(parts.hour)}:${two(parts.minute)}`;
}

/** `18:43:07` — the same with seconds (the header clock). */
export function clockTimeWithSeconds(epoch: number): string {
  const parts = belgradeParts(epoch);
  return `${two(parts.hour)}:${two(parts.minute)}:${two(parts.second)}`;
}

/**
 * K34: `18:43` when `epoch` falls on the same Belgrade date as `now`, else the date in front of it
 * (`20. 10. 18:43`, numbers only). For a mark that never expires (a table's occupancy), where a bare
 * hour would read as fresh the day after.
 */
export function clockTimeOrDate(epoch: number, now: number): string {
  const parts = belgradeParts(epoch);
  const today = belgradeParts(now);
  const sameDay = parts.year === today.year && parts.month === today.month && parts.day === today.day;
  return sameDay ? clockTime(epoch) : `${parts.day}. ${parts.month}. ${clockTime(epoch)}`;
}

/** K34: a device clock this close to the server's is the page's delivery time, not a skew. */
export const CLOCK_SKEW_MIN_MS = 60 * 1000;
/** K34: a difference above this is not a clock skew (a stale page, a device set to a wrong date); it is left alone. */
export const CLOCK_SKEW_MAX_MS = 12 * 60 * 60 * 1000;

/**
 * K34: how far to move the device clock to read server time (`serverMs - deviceMs`), in whole seconds so the
 * corrected second still turns when the shared tick fires. Request times are the server's: a device 20 minutes
 * ahead would show every new request as 20 minutes late, one behind would never turn a late one red. 0 when
 * the two are within a minute (delivery) or more than 12 hours apart (not a skew). Measure it ONCE per page load.
 */
export function clockOffset(serverMs: number, deviceMs: number): number {
  const difference = serverMs - deviceMs;
  const size = Math.abs(difference);
  // Written so that NaN and the infinities (comparisons all false) end up as no correction.
  if (!(size >= CLOCK_SKEW_MIN_MS && size <= CLOCK_SKEW_MAX_MS)) return 0;
  return Math.round(difference / 1000) * 1000;
}

/** Whole seconds from `since` to `now`; never negative (a device clock a little behind the server). */
export function elapsedSeconds(since: number, now: number): number {
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** `08:12` up to 59:59, then `1:05:12`. */
export function formatElapsed(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${two(minutes)}:${two(rest)}`;
}

/** The waiting time of an event as the panel writes it. */
export function waitingFor(createdAt: number, now: number): string {
  return formatElapsed(elapsedSeconds(createdAt, now));
}

/**
 * What a screen reader hears instead of `08:12`: whole minutes, or seconds
 * under a minute ("8 min", "45 s", "1 h 5 min"); the visible timer stays
 * aria-hidden so the reader is not flooded every second.
 */
export function elapsedForReader(seconds: number): { hours: number; minutes: number; seconds: number } {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

/**
 * K22 default of the late threshold (master §10.4: "npr. 15 minuta"). From
 * K23 the venue sets its own (menuServices.settings.panel.lateThresholdMin).
 */
export const DEFAULT_LATE_THRESHOLD_MIN = 15;

/** The wait has passed the venue's threshold: the timer turns red, with an icon and the word "kasni". */
export function isLate(createdAt: number, now: number, thresholdMin: number = DEFAULT_LATE_THRESHOLD_MIN): boolean {
  return now - createdAt >= thresholdMin * 60 * 1000;
}
