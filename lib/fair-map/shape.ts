import type { FairMapPoint } from "./types";

export type FairMapBounds = { minX: number; minY: number; maxX: number; maxY: number };

export function fairMapBounds(polygon: readonly FairMapPoint[]): FairMapBounds {
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Area centroid, falling back to the vertex mean for a degenerate polygon. */
export function fairMapLabelPoint(polygon: readonly FairMapPoint[]): FairMapPoint {
  let area = 0;
  let cx = 0;
  let cy = 0;
  polygon.forEach(([x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  });
  if (area === 0) {
    return [polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length, polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

export function fairMapPointsAttr(polygon: readonly FairMapPoint[]) {
  return polygon.map(([x, y]) => `${x},${y}`).join(" ");
}
