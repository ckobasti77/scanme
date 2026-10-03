import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import type { FairMapGeometry, FairMapKey } from "./types";

export type * from "./types";

export const FAIR_MAP_GEOMETRIES: Readonly<Record<FairMapKey, FairMapGeometry>> = {
  "elektromobilnost-2026": ELEKTROMOBILNOST_2026_MAP,
  "auto-moto-fest-2026": AUTO_MOTO_FEST_2026_MAP,
};

/** Geometry of a fair event by its code; a DEV `test-<code>` event uses the real map. */
export function fairMapForEventCode(eventCode: string): FairMapGeometry | null {
  const base = eventCode.startsWith("test-") ? eventCode.slice("test-".length) : eventCode;
  return Object.hasOwn(FAIR_MAP_GEOMETRIES, base) ? FAIR_MAP_GEOMETRIES[base as FairMapKey] : null;
}

/** True when `id` is an exhibitor stand location on the event's map (never the ScanMe location). */
export function isFairMapStandLocation(eventCode: string, id: string): boolean {
  const geometry = fairMapForEventCode(eventCode);
  return geometry !== null && geometry.zones.some((zone) => zone.locations.some((location) => location.kind === "stand" && location.id === id));
}
