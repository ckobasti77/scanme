import type { Doc } from "../_generated/dataModel";

// =============================================================================
// Pre-event data (JOVAN-DELTA 2026-10-08b). Before the opening everything works
// (setup day, exhibitor demos, sticker tests), but nothing done before
// `event.startsAt` (elektromobilnost-2026: 9 Oct 2026 00:00 Europe/Belgrade)
// counts for an exhibitor: it is left out of exhibitor analytics, reports,
// counters and exports, and the admin "Resetuj pre-event podatke" deletes it.
// No schema flag: a row is pre-event by its own creation time.
// =============================================================================

/** The analytics cutoff of an event: its opening. */
export function fairAnalyticsCutoff(event: Pick<Doc<"fairEvents">, "startsAt">): number {
  return event.startsAt;
}

/** True when `at` is before the event's analytics cutoff. */
export function fairIsPreEvent(at: number, event: Pick<Doc<"fairEvents">, "startsAt">): boolean {
  return at < fairAnalyticsCutoff(event);
}
