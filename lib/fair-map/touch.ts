import { fairMapPointInPolygon, type FairMapRect } from "./layout";
import { fairMapBounds } from "./shape";
import type { FairMapLocation, FairMapPoint } from "./types";

// D1 (RN N7) — invisible touch zones of the vector map. On a phone the fitted
// map draws small stands at 7–27 px; every occupied location gets a touch zone
// of at least FAIR_MAP_TOUCH_MIN_PX CSS px around its own box, whatever the
// zoom. Nothing is drawn: the map component asks touchLocation() only for a
// finger tap that did not land on a stand. Pure: source-image pixels in,
// a location id out.

/** Smallest touch target on a phone, in CSS px (NOC §0; WCAG 2.5.5). */
export const FAIR_MAP_TOUCH_MIN_PX = 44;

/**
 * The touch zone of one location at `scale` (screen px per image px): its
 * bounding box, grown around its centre to at least `minPx` CSS px per side.
 */
export function fairMapTouchZone(polygon: readonly FairMapPoint[], scale: number, minPx = FAIR_MAP_TOUCH_MIN_PX): FairMapRect {
  const bounds = fairMapBounds(polygon);
  const min = minPx / Math.max(scale, 0.0001);
  const width = Math.max(bounds.maxX - bounds.minX, min);
  const height = Math.max(bounds.maxY - bounds.minY, min);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Distance from `point` to the outline of `polygon` (image px). */
function distanceToOutline([px, py]: FairMapPoint, polygon: readonly FairMapPoint[]): number {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j];
    const [bx, by] = polygon[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = dx || dy ? Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0), 1) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

/**
 * The occupied location a finger at `point` (image px) means: the one under
 * it (`locations` in drawing order: on overlap the last drawn, as on screen),
 * else — among the locations whose touch zone holds the point — the one whose
 * drawing is nearest (ties: the first in `locations`); null when none.
 */
export function fairMapTouchLocation(
  point: FairMapPoint,
  locations: readonly FairMapLocation[],
  scale: number,
  minPx = FAIR_MAP_TOUCH_MIN_PX,
): string | null {
  for (let index = locations.length - 1; index >= 0; index -= 1) {
    if (fairMapPointInPolygon(point, locations[index].polygon)) return locations[index].id;
  }
  const [px, py] = point;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const location of locations) {
    const zone = fairMapTouchZone(location.polygon, scale, minPx);
    if (px < zone.x || px > zone.x + zone.width || py < zone.y || py > zone.y + zone.height) continue;
    const distance = distanceToOutline(point, location.polygon);
    if (distance < bestDistance) {
      best = location.id;
      bestDistance = distance;
    }
  }
  return best;
}
