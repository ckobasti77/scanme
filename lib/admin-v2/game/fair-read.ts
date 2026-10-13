// ADMIN v3 V5 — when the page of an event reads the hourly analytics (the hours
// feed the daily challenges and the hall excerpt of Pregled). Pure, so the rule
// is written once and tested: the read runs while a fair day is open AND the
// block „challenges + hall“ is on the screen; whether the event has a floor plan
// does not change the answer (an event without one has no hall, only the
// challenges, and the same block).

/** The key of the polled read (the one `usePolled` takes), or null: nothing is read. */
export function fairReadKey({ eventId, dayOpen, inView }: { eventId: string; dayOpen: boolean; inView: boolean }): string | null {
  return dayOpen && inView ? `hall:${eventId}` : null;
}

/**
 * Has the fair of an event ended, by what the analytics read knows: its last fair day is before today (both
 * are `YYYY-MM-DD` keys of Belgrade days, which sort as text). No days is not ended.
 */
export function fairEnded(dayKeys: readonly string[], todayKey: string): boolean {
  if (!dayKeys.length) return false;
  return dayKeys.reduce((last, key) => (key > last ? key : last)) < todayKey;
}
