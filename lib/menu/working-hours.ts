// ScanMe Menu V1 (K25) — the venue's working hours and the reservation times
// a guest may ask for (master §11.2, §11.6, §13.9; plan
// docs/meni/planovi/K24.md K24-7, K24-8).
//
// The week is seven days, Monday first. A day has up to three intervals in
// minutes from the venue's (Belgrade) midnight; an interval may run past
// midnight up to 30:00 (06:00 the next morning) and then belongs to the day
// it OPENED on. An empty day is closed. The hours live in Podešavanja, always,
// whatever reservation system the venue uses.
//
// A guest asks for a time on the 15-minute grid, inside an interval
// (start ≤ t < end), in the future and at most 60 days ahead. Everything is
// Belgrade wall-clock (lib/belgrade-time.ts), DST-correct, on the server and
// on the phone alike, so the slots the form offers are exactly the ones the
// server accepts.

import { belgradeLocalToEpoch, belgradeParts, epochToBelgradeLocal } from "../belgrade-time";
import { RESERVATION_ERROR, type ReservationErrorCode } from "./errors/reservations";

export type WorkingInterval = { start: number; end: number };
/** `days[0]` is Monday … `days[6]` Sunday. */
export type WorkingHours = { days: WorkingInterval[][] };

export const WORKING_DAYS = 7;
export const MENU_HOURS_MAX_INTERVALS = 3;
export const MINUTES_PER_DAY = 24 * 60;
/** An interval may end at 30:00 at the latest (06:00 the next morning). */
export const MENU_HOURS_END_MAX = 30 * 60;
/** Interval edges are whole five minutes (08:05, 23:30…). */
export const MENU_HOURS_STEP_MIN = 5;
/** The reservation grid: 18:00, 18:15, 18:30… */
export const RESERVATION_SLOT_MIN = 15;
/** How far ahead a guest may ask (K24-8; a proposal to the owner). */
export const RESERVATION_MAX_DAYS_AHEAD = 60;
const DAY_MS = MINUTES_PER_DAY * 60_000;

const two = (value: number) => String(value).padStart(2, "0");

/** `18:00`; minutes past midnight of the next day read as the next day's clock (`26:30` → `02:30`). */
export function hhmm(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${two(Math.floor(wrapped / 60))}:${two(wrapped % 60)}`;
}

/** `18:30` → 1110; null for anything else. */
export function minutesFromHhmm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * An interval from the two clock fields of the settings form: an end at or
 * before the start means "after midnight" (18:00–02:00 → 1080–1560). null =
 * not a valid interval.
 */
export function intervalFromInput(start: string, end: string): WorkingInterval | null {
  const from = minutesFromHhmm(start);
  const to = minutesFromHhmm(end);
  if (from === null || to === null) return null;
  const interval = { start: from, end: to <= from ? to + MINUTES_PER_DAY : to };
  return isValidInterval(interval) ? interval : null;
}

function isValidInterval(interval: WorkingInterval): boolean {
  const { start, end } = interval;
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start < MINUTES_PER_DAY &&
    end > start &&
    end <= MENU_HOURS_END_MAX &&
    start % MENU_HOURS_STEP_MIN === 0 &&
    end % MENU_HOURS_STEP_MIN === 0
  );
}

/**
 * Seven days, at most three valid intervals each, in order and never
 * overlapping — also across midnight into the next day's first interval.
 */
export function isValidWorkingHours(hours: WorkingHours): boolean {
  if (!Array.isArray(hours.days) || hours.days.length !== WORKING_DAYS) return false;
  for (const day of hours.days) {
    if (!Array.isArray(day) || day.length > MENU_HOURS_MAX_INTERVALS) return false;
    for (let index = 0; index < day.length; index += 1) {
      if (!isValidInterval(day[index])) return false;
      if (index > 0 && day[index].start < day[index - 1].end) return false;
    }
  }
  for (let index = 0; index < WORKING_DAYS; index += 1) {
    const day = hours.days[index];
    const last = day[day.length - 1];
    if (!last || last.end <= MINUTES_PER_DAY) continue;
    const next = hours.days[(index + 1) % WORKING_DAYS][0];
    if (next && next.start < last.end - MINUTES_PER_DAY) return false;
  }
  return true;
}

/** True when the week has at least one open interval. */
export function hasAnyHours(hours: WorkingHours | null | undefined): hours is WorkingHours {
  return Boolean(hours && hours.days.some((day) => day.length > 0));
}

/** A closed week (the settings form starts from it). */
export function emptyWorkingHours(): WorkingHours {
  return { days: Array.from({ length: WORKING_DAYS }, () => []) };
}

/** `YYYY-MM-DD` of the Belgrade calendar day an epoch falls on. */
export function belgradeDateKey(epoch: number): string {
  return epochToBelgradeLocal(epoch).slice(0, 10);
}

/** Monday = 0 … Sunday = 6 of a `YYYY-MM-DD`. */
export function weekdayOf(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** The `YYYY-MM-DD` `days` after `dateKey`. */
export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The epoch of `minutes` past the Belgrade midnight of `dateKey` (minutes ≥ 1440 = the next day); null when that wall-clock time does not exist (spring DST gap). */
function epochAt(dateKey: string, minutes: number): number | null {
  const day = minutes >= MINUTES_PER_DAY ? addDays(dateKey, 1) : dateKey;
  const local = `${day}T${hhmm(minutes)}`;
  const epoch = belgradeLocalToEpoch(local);
  return epoch !== null && epochToBelgradeLocal(epoch) === local ? epoch : null;
}

/**
 * The times a guest may choose on the opening day `dateKey`: the 15-minute
 * grid inside each interval (start ≤ t < end), after `now` and at most 60 days
 * ahead. Ascending, without duplicates.
 */
export function slotsFor(dateKey: string, hours: WorkingHours, now: number): number[] {
  const out = new Set<number>();
  const latest = now + RESERVATION_MAX_DAYS_AHEAD * DAY_MS;
  for (const interval of hours.days[weekdayOf(dateKey)] ?? []) {
    const first = Math.ceil(interval.start / RESERVATION_SLOT_MIN) * RESERVATION_SLOT_MIN;
    for (let minutes = first; minutes < interval.end; minutes += RESERVATION_SLOT_MIN) {
      const epoch = epochAt(dateKey, minutes);
      if (epoch !== null && epoch > now && epoch <= latest) out.add(epoch);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * K34: whether the opening day `dateKey` has at least one slot — the same rule as `slotsFor`,
 * but it stops at the first slot (openDates asks it for 61 days on every render of the form;
 * every grid point costs Belgrade-time conversions).
 */
function hasSlot(dateKey: string, hours: WorkingHours, now: number): boolean {
  const latest = now + RESERVATION_MAX_DAYS_AHEAD * DAY_MS;
  for (const interval of hours.days[weekdayOf(dateKey)] ?? []) {
    const first = Math.ceil(interval.start / RESERVATION_SLOT_MIN) * RESERVATION_SLOT_MIN;
    for (let minutes = first; minutes < interval.end; minutes += RESERVATION_SLOT_MIN) {
      const epoch = epochAt(dateKey, minutes);
      if (epoch !== null && epoch > now && epoch <= latest) return true;
    }
  }
  return false;
}

/** The opening days (`YYYY-MM-DD`) from today on that still have a free slot, at most 60 days ahead. */
export function openDates(hours: WorkingHours, now: number): string[] {
  const today = belgradeDateKey(now);
  const out: string[] = [];
  for (let offset = 0; offset <= RESERVATION_MAX_DAYS_AHEAD; offset += 1) {
    const dateKey = addDays(today, offset);
    if (hasSlot(dateKey, hours, now)) out.push(dateKey);
  }
  return out;
}

/** Is `epoch` on the grid and inside an interval (of its own day, or of the day before past midnight)? */
export function isWithinHours(epoch: number, hours: WorkingHours): boolean {
  if (epoch % 60_000 !== 0) return false;
  const parts = belgradeParts(epoch);
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes % RESERVATION_SLOT_MIN !== 0) return false;
  const dateKey = `${parts.year}-${two(parts.month)}-${two(parts.day)}`;
  const today = hours.days[weekdayOf(dateKey)] ?? [];
  if (today.some((interval) => interval.start <= minutes && minutes < interval.end)) return true;
  const yesterday = hours.days[weekdayOf(addDays(dateKey, -1))] ?? [];
  const late = minutes + MINUTES_PER_DAY;
  return yesterday.some((interval) => interval.start <= late && late < interval.end);
}

/** Why a requested time is refused, or null when the venue can take a request for it. */
export function requestedTimeProblem(epoch: number, hours: WorkingHours, now: number): ReservationErrorCode | null {
  if (!Number.isFinite(epoch) || epoch <= now) return RESERVATION_ERROR.inPast;
  if (epoch > now + RESERVATION_MAX_DAYS_AHEAD * DAY_MS) return RESERVATION_ERROR.tooFar;
  return isWithinHours(epoch, hours) ? null : RESERVATION_ERROR.outsideHours;
}
