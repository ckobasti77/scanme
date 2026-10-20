// ADMIN v3 V3 — the lit rim of a top of the Living hall, pure: a strip between
// the outline of a stand and the same outline moved inwards. In the dark theme
// the scene draws this strip above the bloom threshold, so every top glows
// while its fill keeps the exact colour of the legend. Stands are irregular
// polygons of the floor plan (x right, y down), wound either way.

export type RimStrip = {
  /** Outer and inner point of every corner, in turn: [x, y, x, y, …] (2 × corners points). */
  points: number[];
  /** Two triangles per edge, as indices into the points. */
  indices: number[];
};

/** A corner sharper than this is not pushed further in (the reach of a bisector grows without limit as the corner closes). */
const SHARPEST = 0.45;

/**
 * The strip of `width` along the inside of `polygon`. A corner moves along its bisector so that both of its
 * edges are `width` away; repeated points are dropped. Fewer than three corners give an empty strip.
 */
export function rimStrip(polygon: ReadonlyArray<readonly [number, number]>, width: number): RimStrip {
  const same = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-6;
  const corners: Array<readonly [number, number]> = [];
  for (const point of polygon) if (!corners.length || !same(point, corners[corners.length - 1])) corners.push(point);
  // An outline that names its first corner again at the end is closed twice.
  if (corners.length > 1 && same(corners[0], corners[corners.length - 1])) corners.pop();
  const count = corners.length;
  if (count < 3 || !(width > 0)) return { points: [], indices: [] };
  let area = 0;
  for (let index = 0; index < count; index += 1) {
    const [x1, y1] = corners[index];
    const [x2, y2] = corners[(index + 1) % count];
    area += x1 * y2 - x2 * y1;
  }
  // The inward side of an edge (dx, dy) is (−dy, dx) when the signed area is positive, else (dy, −dx).
  const side = area > 0 ? 1 : -1;
  const inward = (from: readonly [number, number], to: readonly [number, number]) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy) || 1;
    return [(-dy / length) * side, (dx / length) * side] as const;
  };
  const points: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const corner = corners[index];
    const a = inward(corners[(index + count - 1) % count], corner);
    const b = inward(corner, corners[(index + 1) % count]);
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const length = Math.hypot(mx, my);
    // Two edges that fold back on each other have no bisector: the corner moves along the inward side of the first.
    if (length < 1e-9) {
      mx = a[0];
      my = a[1];
    } else {
      mx /= length;
      my /= length;
    }
    const reach = width / Math.max(SHARPEST, mx * a[0] + my * a[1]);
    points.push(corner[0], corner[1], corner[0] + mx * reach, corner[1] + my * reach);
  }
  const indices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const outer = index * 2;
    const next = ((index + 1) % count) * 2;
    indices.push(outer, outer + 1, next, next, outer + 1, next + 1);
  }
  return { points, indices };
}
