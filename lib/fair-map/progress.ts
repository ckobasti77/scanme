import type { FairPassportProgress } from "../fair-contract";
import type { FairMapView } from "./view";

/** Visitor progress shown on one occupied map location. */
export type FairMapLocationProgress = {
  state: "loading" | "available" | "started" | "complete";
  stamped: number;
  required: number;
};

/**
 * Aggregates the visitor's existing passport state by map location.
 * A shared location gets one marker even when several active passports live there.
 */
export function fairMapProgressByLocation(
  view: FairMapView,
  progress: readonly FairPassportProgress[] | null,
): ReadonlyMap<string, FairMapLocationProgress> {
  const result = new Map<string, FairMapLocationProgress>();
  const own = progress === null ? null : new Map(progress.map((row) => [row.passportId, row]));

  for (const zone of view.zones) {
    for (const row of zone.locations) {
      const entries = [
        ...new Map(
          row.stands
            .flatMap((placed) => placed.passports)
            .map((entry) => [entry.passportId, entry] as const),
        ).values(),
      ];
      const catalogRequired = entries.reduce((total, entry) => total + entry.models.length, 0);
      if (!entries.length || catalogRequired === 0) continue;

      if (own === null) {
        result.set(row.location.id, { state: "loading", stamped: 0, required: catalogRequired });
        continue;
      }

      let stamped = 0;
      let required = 0;
      let complete = true;
      for (const entry of entries) {
        const value = own.get(entry.passportId);
        const entryRequired = value?.requiredCount ?? entry.models.length;
        required += entryRequired;
        stamped += Math.min(value?.stampedCount ?? 0, entryRequired);
        complete &&= Boolean(value?.completed) && (value?.stampedCount ?? 0) >= entryRequired;
      }
      result.set(row.location.id, {
        state: complete && required > 0 ? "complete" : stamped > 0 ? "started" : "available",
        stamped,
        required,
      });
    }
  }

  return result;
}
