// ADMIN v3 V4 — the streak of days (plan §6.5). Pure: a day is written down when
// work was done on it and the backlog was seen at zero (or the boss was beaten);
// the streak counts working days (Mon–Fri) in a row. A weekend never breaks it
// and a written weekend day makes it longer; today not being written yet does
// not break it either.

import { isWorkday, shiftDay } from "./time";
import type { DayLedger, DayRecord, StreakView } from "./types";

/** Both facts of the day hold. */
export const isDayDone = (record: DayRecord | undefined): boolean => record !== undefined && record.work && record.clear;

/** 0 none; 1 for 1–2 days; 2 for 3–4; 3 for 5–9; 4 for 10–19; 5 from 20. */
export function flameSize(count: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count >= 20) return 5;
  if (count >= 10) return 4;
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

/** The streak as of `today` (a Belgrade day key) over the ledger of this browser. */
export function streakView(days: DayLedger, today: string): StreakView {
  const keys = Object.keys(days).sort();
  if (keys.length === 0) return { count: 0, best: 0, flame: 0, todayDone: false, brokenOn: null, since: null };
  const since = keys[0];
  const todayDone = isDayDone(days[today]);

  // From today back: today counts when written, an unwritten working day before it ends the streak.
  let count = todayDone ? 1 : 0;
  for (let key = shiftDay(today, -1); key >= since; key = shiftDay(key, -1)) {
    if (isDayDone(days[key])) count += 1;
    else if (isWorkday(key)) break;
  }

  // The longest streak of the whole ledger, walked forward by the same rule.
  const last = keys[keys.length - 1] > today ? keys[keys.length - 1] : today;
  let best = 0;
  let run = 0;
  for (let key = since; key <= last; key = shiftDay(key, 1)) {
    if (isDayDone(days[key])) {
      run += 1;
      if (run > best) best = run;
    } else if (isWorkday(key)) run = 0;
  }
  best = Math.max(best, count);

  // The last streak ended on the first working day after the newest written day.
  let brokenOn: string | null = null;
  if (count === 0) {
    const lastDone = keys.filter((key) => key <= today && isDayDone(days[key])).pop();
    if (lastDone !== undefined) {
      for (let key = shiftDay(lastDone, 1); key < today; key = shiftDay(key, 1)) {
        if (isWorkday(key)) {
          brokenOn = key;
          break;
        }
      }
    }
  }

  return { count, best, flame: flameSize(count), todayDone, brokenOn, since };
}
