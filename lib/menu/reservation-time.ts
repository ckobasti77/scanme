// ScanMe Menu V1 (K25) — how a reservation's date and time read on the
// guest's form, the cancel link and the waiter panel: "Danas · 20:00",
// "Sutra · 19:30", "Sub 25. 10. · 20:00". Belgrade wall-clock, the same on
// the server render and on the phone. The words come from the `menu-domen`
// dictionary (passed in, so this file stays free of the i18n layer).

import { clockTime } from "./elapsed-time";
import { addDays, belgradeDateKey, weekdayOf } from "./working-hours";

export type ReservationDateLabels = {
  /** Monday first. */
  weekdaysShort: readonly string[];
  today: string;
  tomorrow: string;
  /** "{dan} {d}. {m}." */
  shortDate: string;
  /** "{datum} · {vreme}" */
  term: string;
};

/** "Sub 25. 10." of a `YYYY-MM-DD` (no relative words). */
export function shortDateOf(dateKey: string, labels: ReservationDateLabels): string {
  const [, month, day] = dateKey.split("-").map(Number);
  return labels.shortDate
    .replace("{dan}", labels.weekdaysShort[weekdayOf(dateKey)] ?? "")
    .replace("{d}", String(day))
    .replace("{m}", String(month));
}

/** "Danas", "Sutra" or "Sub 25. 10." of a `YYYY-MM-DD`, seen from `now`. */
export function dateKeyLabel(dateKey: string, now: number, labels: ReservationDateLabels): string {
  const today = belgradeDateKey(now);
  if (dateKey === today) return labels.today;
  if (dateKey === addDays(today, 1)) return labels.tomorrow;
  return shortDateOf(dateKey, labels);
}

/** "Danas · 20:00", "Sub 25. 10. · 20:00". */
export function reservationTermText(epoch: number, now: number, labels: ReservationDateLabels): string {
  return labels.term.replace("{datum}", dateKeyLabel(belgradeDateKey(epoch), now, labels)).replace("{vreme}", clockTime(epoch));
}
