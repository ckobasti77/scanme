// ADMIN v3 V4 — the calendar of the game. A day, a week and „before noon“ are
// always Belgrade time, whatever the clock of the browser says (the same rule as
// the mission ledger of v2 and the fair counters).

export const DAY_MS = 86_400_000;
const ZONE = "Europe/Belgrade";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const wallFormat = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** `2026-10-13`: the Belgrade day of a moment. */
export const dayKey = (ms: number) => dayFormat.format(ms);

/** The Belgrade wall clock of a moment, read as if it were UTC (ms). */
function wallAsUtc(ms: number): number {
  const parts: Record<string, number> = {};
  for (const part of wallFormat.formatToParts(ms)) if (part.type !== "literal") parts[part.type] = Number(part.value);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** The Belgrade hour of a moment, 0–23. */
export const belgradeHour = (ms: number) => new Date(wallAsUtc(ms)).getUTCHours();

const parseKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

/** The moment a Belgrade day starts (ms), also across a change of the clock. */
export function dayStart(key: string): number {
  const wall = parseKey(key);
  // The offset at the guess; one more step when the guess fell on the other side of a clock change.
  let at = wall - (wallAsUtc(wall) - wall);
  at = wall - (wallAsUtc(at) - at);
  return at;
}

/** The Belgrade day `days` after (or before) `key`. */
export function shiftDay(key: string, days: number): string {
  return new Date(parseKey(key) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 1 Monday … 7 Sunday. */
export function weekdayOf(key: string): number {
  return new Date(parseKey(key)).getUTCDay() || 7;
}

/** Monday to Friday. */
export const isWorkday = (key: string) => weekdayOf(key) <= 5;

/** Monday 00:00 in Belgrade of the week a moment is in (ms). */
export function weekStart(ms: number): number {
  const key = dayKey(ms);
  return dayStart(shiftDay(key, 1 - weekdayOf(key)));
}
