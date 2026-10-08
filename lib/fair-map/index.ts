import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { fairMapLocationTakesStands, type FairMapGeometry, type FairMapKey, type FairMapLocation, type FairMapZoneId } from "./types";

export type * from "./types";
export { fairMapLocationTakesStands } from "./types";
export * from "./shape";
export * from "./view";
export * from "./rotation";

export const FAIR_MAP_GEOMETRIES: Readonly<Record<FairMapKey, FairMapGeometry>> = {
  "elektromobilnost-2026": ELEKTROMOBILNOST_2026_MAP,
  "auto-moto-fest-2026": AUTO_MOTO_FEST_2026_MAP,
};

/** Geometry of a fair event by its code; a DEV `test-<code>` event uses the real map. */
export function fairMapForEventCode(eventCode: string): FairMapGeometry | null {
  const base = eventCode.startsWith("test-") ? eventCode.slice("test-".length) : eventCode;
  return Object.hasOwn(FAIR_MAP_GEOMETRIES, base) ? FAIR_MAP_GEOMETRIES[base as FairMapKey] : null;
}

/**
 * Event slugs the public map tries, in order. The DEV TEST catalog lives under
 * `test-<slug>` (TEST fixtures must keep the `test-` prefix), so ONLY under
 * `next dev` the real URL (/sajam/elektromobilnost-2026) falls back to its TEST
 * event when no real event exists. Never in a production build.
 */
export function fairMapEventSlugCandidates(slug: string, devTestFallback: boolean): string[] {
  return devTestFallback && !slug.startsWith("test-") ? [slug, `test-${slug}`] : [slug];
}

/** The location `id` of the event's map with its zone, or null. */
export function fairMapLocationById(eventCode: string, id: string): { zoneId: FairMapZoneId; location: FairMapLocation } | null {
  const geometry = fairMapForEventCode(eventCode);
  for (const zone of geometry?.zones ?? []) {
    const location = zone.locations.find((row) => row.id === id);
    if (location) return { zoneId: zone.id, location };
  }
  return null;
}

/**
 * True when a fair stand (fairStands row) may sit on `id` of the event's map:
 * every location the organizer draws (stand box, the ScanMe stand, a partner
 * point, an open area — N3), never a placeholder that is not on the organizer map.
 */
export function isFairMapStandLocation(eventCode: string, id: string): boolean {
  const hit = fairMapLocationById(eventCode, id);
  return hit !== null && fairMapLocationTakesStands(hit.location);
}
