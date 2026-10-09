import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { readFairCount } from "./fairCountShards";
import { fairWindowHourKeys } from "./fairReportDataset";

// =============================================================================
// Pre-event data (JOVAN-DELTA 2026-10-08b). Before the opening everything works
// (setup day, exhibitor demos, sticker tests), but nothing done before the
// event's analytics cutoff counts for an exhibitor: it is left out of exhibitor
// analytics, reports, counters and exports, and the admin "Resetuj pre-event
// podatke" deletes it. No schema flag: a row is pre-event by its own creation
// time.
// =============================================================================

/**
 * The one place the cutoff is configured: per event code, else the event's
 * `startsAt`. Owner decision 9 Oct 2026: the hall opens at 08:00, so the
 * night's setup and sticker tests stay pre-event.
 */
export const FAIR_ANALYTICS_CUTOFF_BY_EVENT_CODE: Readonly<Record<string, number>> = {
  "elektromobilnost-2026": Date.parse("2026-10-09T08:00:00+02:00"),
};

/** The analytics cutoff of an event: its configured hall opening, else its opening. */
export function fairAnalyticsCutoff(event: Pick<Doc<"fairEvents">, "startsAt" | "code">): number {
  return FAIR_ANALYTICS_CUTOFF_BY_EVENT_CODE[event.code] ?? event.startsAt;
}

/** True when `at` is before the event's analytics cutoff. */
export function fairIsPreEvent(at: number, event: Pick<Doc<"fairEvents">, "startsAt" | "code">): boolean {
  return at < fairAnalyticsCutoff(event);
}

/**
 * A day-bucketed counter (`<base>:<dateKey>`, `<base>:<hourKey>`) for one fair
 * day, from the cutoff on: the whole day bucket when the day starts after the
 * cutoff, nothing when it ends before it, else the hour buckets from the
 * cutoff (the cutoff is on a full hour).
 */
export async function fairDayCountFrom(
  ctx: QueryCtx,
  base: string,
  day: Pick<Doc<"fairEventDays">, "dateKey" | "startsAt" | "endsAt">,
  cutoff: number,
): Promise<number> {
  if (cutoff <= day.startsAt) return readFairCount(ctx, `${base}:${day.dateKey}`);
  if (cutoff >= day.endsAt) return 0;
  let total = 0;
  for (const hourKey of fairWindowHourKeys(cutoff, day.endsAt)) total += await readFairCount(ctx, `${base}:${hourKey}`);
  return total;
}
