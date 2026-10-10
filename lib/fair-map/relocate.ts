import { fairMapForEventCode } from "./index";
import { fairMapLocationTakesStands } from "./types";

// P2 (RN N6) — a stand whose mapLocationId is not on the event's map any
// more (the organizer redrew the area in front of the hall on 7. 10.: S1–S5
// are gone, 20/21/22 are one outline, 12/13/15 are groups of boxes). Pure:
// the locations of today's map that the old id can mean; the caller decides
// (convex fairExhibitorImport.listStandsOffMap never moves anything).

/** `20–22` → [20, 22]; `12` → [12, 12]; anything else (`1A`, `uz 10B`) → null. */
function labelRange(label: string): [number, number] | null {
  const match = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(label.trim());
  return match ? [Number(match[1]), Number(match[2] ?? match[1])] : null;
}

/**
 * The stand locations of today's map an old id can mean: `<zone>-<n>` →
 * every location of that zone whose organizer label covers n (`ispred-21` →
 * `ispred-20-22`; `ispred-13` → its four boxes). A location that still
 * exists, an id without a number (`ispred-s1`, `scanme`) or an unknown zone →
 * none.
 */
export function fairMapRelocationCandidates(eventCode: string, oldId: string): string[] {
  const geometry = fairMapForEventCode(eventCode);
  if (!geometry) return [];
  for (const zone of geometry.zones) {
    if (zone.locations.some((location) => location.id === oldId)) return [];
    const match = new RegExp(`^${zone.id}-(\\d+)$`).exec(oldId);
    if (!match) continue;
    const number = Number(match[1]);
    return zone.locations
      .filter((location) => fairMapLocationTakesStands(location))
      .filter((location) => {
        const range = labelRange(location.label);
        return range !== null && range[0] <= number && number <= range[1];
      })
      .map((location) => location.id);
  }
  return [];
}
