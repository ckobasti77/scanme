// ADMIN v2 X3 — the open fair day as a HUD reads it: how far the day is and the
// key numbers of the day. Plain inputs (no Convex types), so the sidebar HUD of
// X4 can read the same function from the same getEventDashboard result.

export type LiveDayInput = {
  phase: { kind: string; dayOpen: boolean; dayIndex: number | null; dayCount: number };
  days: readonly { startsAt: number; endsAt: number }[];
  scansToday: number;
  /** null: no exhibitor has leads on. */
  leadsToday: number | null;
  actions: readonly { tone: "hitno" | "uskoro" | "info" }[];
};

export type LiveDay = {
  dayIndex: number;
  dayCount: number;
  /** Share of the fair day that has passed, 0–1. */
  progress: number;
  /** Milliseconds to the end of the day, never negative. */
  left: number;
  scansToday: number;
  leadsToday: number | null;
  /** Open items that ask for a reaction; an info item is not a task. */
  urgent: number;
  soon: number;
};

/** null unless a fair day is open at `now`. */
export function liveDay(input: LiveDayInput, now: number): LiveDay | null {
  const { phase } = input;
  if (phase.kind !== "sajam" || !phase.dayOpen || !phase.dayIndex) return null;
  const day = input.days[phase.dayIndex - 1];
  if (!day || day.endsAt <= day.startsAt) return null;
  return {
    dayIndex: phase.dayIndex,
    dayCount: phase.dayCount,
    progress: Math.min(1, Math.max(0, (now - day.startsAt) / (day.endsAt - day.startsAt))),
    left: Math.max(0, day.endsAt - now),
    scansToday: input.scansToday,
    leadsToday: input.leadsToday,
    urgent: input.actions.filter((action) => action.tone === "hitno").length,
    soon: input.actions.filter((action) => action.tone === "uskoro").length,
  };
}

/** The share as a whole percent that never reads 100 before the day ends. */
export const liveDayPercent = (progress: number) => Math.min(100, Math.max(0, Math.floor(progress * 100)));
