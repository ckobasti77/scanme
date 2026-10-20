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
