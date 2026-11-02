// ScanMe Menu V1 (K23) — the venue's timing of the waiter panel (master
// §8.5, §10.4; plan docs/meni/planovi/K19.md K19-21; MENU-UX §1.3).
//
//   late threshold   after it a waiting request turns red and its chip pulses
//                    gently once every 10 s; with prefers-reduced-motion it
//                    does not move and gets a static emphasis instead (the
//                    colour, the icon and the word "kasni" stay in both cases)
//   reminder         a request still `Novi` repeats a short sound and an
//                    animation of its row or table every N minutes (0 = off)
//
// Stored on menuServices.settings.panel (menuSettings.setPanelTiming, K28 UI).
// Pure and dependency-free: Convex validates writes with the same functions.

import { DEFAULT_LATE_THRESHOLD_MIN, isLate } from "./elapsed-time";

export { DEFAULT_LATE_THRESHOLD_MIN };

export const LATE_THRESHOLD_MIN = 1;
export const LATE_THRESHOLD_MAX = 120;
/** Master §8.5 leaves the interval to the venue; five minutes until it chooses (plan K19-21). */
export const DEFAULT_REMINDER_MIN = 5;
export const REMINDER_MAX = 60;

export type PanelTiming = { lateThresholdMin: number; reminderMin: number };

export const DEFAULT_PANEL_TIMING: PanelTiming = {
  lateThresholdMin: DEFAULT_LATE_THRESHOLD_MIN,
  reminderMin: DEFAULT_REMINDER_MIN,
};

/** A whole number of minutes, 1–120. */
export function isValidLateThreshold(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= LATE_THRESHOLD_MIN && minutes <= LATE_THRESHOLD_MAX;
}

/** 0 (off) or a whole number of minutes, 1–60. */
export function isValidReminder(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= REMINDER_MAX;
}

/** The timing a panel works with: the venue's own when it is valid, otherwise the defaults (field by field). */
export function panelTimingOf(stored: Partial<PanelTiming> | null | undefined): PanelTiming {
  const late = stored?.lateThresholdMin;
  const reminder = stored?.reminderMin;
  return {
    lateThresholdMin: late !== undefined && isValidLateThreshold(late) ? late : DEFAULT_PANEL_TIMING.lateThresholdMin,
    reminderMin: reminder !== undefined && isValidReminder(reminder) ? reminder : DEFAULT_PANEL_TIMING.reminderMin,
  };
}

/** The wait has passed the venue's threshold (the same rule as the K22 timer). */
export function jeKasno(createdAt: number, now: number, pragMin: number): boolean {
  return isLate(createdAt, now, pragMin);
}

/**
 * How a late state is emphasised: `puls` (a gentle pulse once every 10 s),
 * `staticno` (no motion, a stronger static mark: prefers-reduced-motion) or
 * `nema` (not late: nothing).
 */
export type IsticanjeKasnjenja = "puls" | "staticno" | "nema";

export function puls(kasno: boolean, reducedMotion: boolean): IsticanjeKasnjenja {
  if (!kasno) return "nema";
  return reducedMotion ? "staticno" : "puls";
}
