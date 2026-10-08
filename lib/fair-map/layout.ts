import { fairMapBounds } from "./shape";
import type { FairMapLocation, FairMapPoint, FairMapZone } from "./types";

// N4 — pure layout of the vector map in source-image pixels: where the logo
// chips of a stand go, where its number is drawn and how big things are.
// Nothing here knows React or the DOM, so it is unit-tested and shared by the
// public map and the DEV preview.

export type FairMapRect = { x: number; y: number; width: number; height: number };

/** Even-odd point-in-polygon test. */
export function fairMapPointInPolygon([px, py]: FairMapPoint, polygon: readonly FairMapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inscribedCache = new WeakMap<readonly FairMapPoint[], FairMapRect>();

/**
 * The largest axis-aligned rectangle of grid cells lying inside the polygon
 * (cell corners and centre inside, maximal-rectangle-in-histogram over a
 * `resolution`² grid). For an L-shaped stand it is the biggest arm; for a
 * concave area (the rear area) it is always inside, unlike the centroid.
 */
export function fairMapInscribedRect(polygon: readonly FairMapPoint[], resolution = 40): FairMapRect {
  const cached = resolution === 40 ? inscribedCache.get(polygon) : undefined;
  if (cached) return cached;
  const bounds = fairMapBounds(polygon);
  const cw = (bounds.maxX - bounds.minX) / resolution;
  const ch = (bounds.maxY - bounds.minY) / resolution;
  const inset = 0.01;
  const inside = (x: number, y: number) => fairMapPointInPolygon([x, y], polygon);
  const cells: boolean[][] = [];
  for (let row = 0; row < resolution; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < resolution; col++) {
      const x0 = bounds.minX + col * cw;
      const y0 = bounds.minY + row * ch;
      const a = cw * inset;
      const b = ch * inset;
      line.push(
        inside(x0 + a, y0 + b) && inside(x0 + cw - a, y0 + b) && inside(x0 + a, y0 + ch - b) && inside(x0 + cw - a, y0 + ch - b) && inside(x0 + cw / 2, y0 + ch / 2),
      );
    }
    cells.push(line);
  }
  let best = { area: 0, row: 0, col: 0, rows: 0, cols: 0 };
  const heights = new Array<number>(resolution).fill(0);
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) heights[col] = cells[row][col] ? heights[col] + 1 : 0;
    const stack: number[] = [];
    for (let col = 0; col <= resolution; col++) {
      const h = col === resolution ? 0 : heights[col];
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const height = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const width = col - left;
        const area = width * cw * height * ch;
        if (height > 0 && area > best.area) best = { area, row: row - height + 1, col: left, rows: height, cols: width };
      }
      stack.push(col);
    }
  }
  const rect = best.area > 0
    ? { x: bounds.minX + best.col * cw, y: bounds.minY + best.row * ch, width: best.cols * cw, height: best.rows * ch }
    : { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
  if (resolution === 40) inscribedCache.set(polygon, rect);
  return rect;
}

export type FairMapChipOptions = {
  /** Chip width / height. */
  aspect: number;
  gap: number;
  padding: number;
  /** Largest chip width (a lone logo in a big area stays a logo). */
  maxWidth: number;
};

/**
 * `count` equal chips in a centred grid inside `box`: the column count that
 * gives the biggest chip wins (every logo stays readable when zoomed in).
 */
export function fairMapChipGrid(box: FairMapRect, count: number, { aspect, gap, padding, maxWidth }: FairMapChipOptions): FairMapRect[] {
  if (count <= 0) return [];
  const width = Math.max(box.width - 2 * padding, 1);
  const height = Math.max(box.height - 2 * padding, 1);
  let best = { cols: 1, rows: count, chipW: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const chipW = Math.min((width - gap * (cols - 1)) / cols, ((height - gap * (rows - 1)) / rows) * aspect);
    if (chipW > best.chipW) best = { cols, rows, chipW };
  }
  const chipW = Math.max(Math.min(best.chipW, maxWidth), 1);
  const chipH = chipW / aspect;
  const gridW = best.cols * chipW + (best.cols - 1) * gap;
  const gridH = best.rows * chipH + (best.rows - 1) * gap;
  const x0 = box.x + (box.width - gridW) / 2;
  const y0 = box.y + (box.height - gridH) / 2;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / best.cols);
    const col = index % best.cols;
    // The last, shorter row is centred too.
    const inRow = row === best.rows - 1 ? count - row * best.cols : best.cols;
    const rowOffset = ((best.cols - inRow) * (chipW + gap)) / 2;
    return { x: x0 + rowOffset + col * (chipW + gap), y: y0 + row * (chipH + gap), width: chipW, height: chipH };
  });
}

/** Stand-number badge radius for a zone (≈1.6 % of the image width; display mode draws them bigger). */
export function fairMapBadgeRadius(zone: Pick<FairMapZone, "image">, display = false) {
  return Math.round(zone.image.width * 0.016 * (display ? 1.6 : 1));
}

export type FairMapStandLayout = {
  /** Where the stand number goes; null for a partner point, an area and a box of a group. */
  badge: FairMapPoint | null;
  /** Free space for the logo chips. */
  chips: FairMapRect;
};

/**
 * Where a location's number and logos go: the organizer's label position when
 * it prints the number beside the stand (`badge`), else the top-left corner of
 * the inscribed rectangle, with the chips in the space that remains.
 */
export function fairMapStandLayout(location: FairMapLocation, radius: number): FairMapStandLayout {
  const box = fairMapInscribedRect(location.polygon);
  const numbered = (location.kind === "stand" || location.kind === "scanme") && !location.group;
  if (!numbered || location.badge) return { badge: numbered ? (location.badge ?? null) : null, chips: box };
  const band = 2 * radius + radius * 0.5;
  // Tall enough: the number sits in a band on top; otherwise on the left.
  if (box.height >= band * 2.2) {
    return { badge: [box.x + radius * 1.25, box.y + radius * 1.25], chips: { x: box.x, y: box.y + band, width: box.width, height: box.height - band } };
  }
  return { badge: [box.x + radius * 1.25, box.y + box.height / 2], chips: { x: box.x + band, y: box.y, width: Math.max(box.width - band, 1), height: box.height } };
}
