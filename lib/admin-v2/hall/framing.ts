// ADMIN v3 V5 — the frame of the Living hall (RV-PREGLED S7). The home view is
// not the whole floor plan but the stands that have something to show, padded,
// with the rest of the plan peeking in at the edges. Pure: the scene hands in the
// outlines of the stands and the direction of its camera, and gets back where to
// look and how much to see. No imports; nothing here touches `three`.

/** A box on the floor (map pixels; x across, z down the plan). */
export type FrameRect = { minX: number; minZ: number; maxX: number; maxZ: number };

export const HALL_FRAME = {
  /** Each side of the box of the stands grows by this share of the box. */
  pad: 0.11,
  /** The frame is never smaller than this share of the floor on an axis, so a lone stand does not fill the box. */
  minShare: 0.4,
} as const;

const finite = (value: number) => Number.isFinite(value);
const isRect = (rect: FrameRect) => finite(rect.minX) && finite(rect.minZ) && finite(rect.maxX) && finite(rect.maxZ) && rect.maxX >= rect.minX && rect.maxZ >= rect.minZ;

/** Where a span of `size` centred on `middle` sits inside 0 … `limit` (it slides, it does not shrink). */
function place(middle: number, size: number, limit: number): number {
  return Math.min(Math.max(middle - size / 2, 0), limit - size);
}

/**
 * The part of the floor the home view is fitted to: the box of `stands` with a pad on each side, at least
 * `minShare` of the floor on each axis, never larger than the floor and never outside it. No stand: the whole floor.
 */
export function frameRect(floor: { width: number; depth: number }, stands: readonly FrameRect[]): FrameRect {
  const whole: FrameRect = { minX: 0, minZ: 0, maxX: floor.width, maxZ: floor.depth };
  if (!(floor.width > 0) || !(floor.depth > 0)) return whole;
  const valid = stands.filter(isRect);
  if (valid.length === 0) return whole;
  const minX = Math.min(...valid.map((rect) => rect.minX));
  const maxX = Math.max(...valid.map((rect) => rect.maxX));
  const minZ = Math.min(...valid.map((rect) => rect.minZ));
  const maxZ = Math.max(...valid.map((rect) => rect.maxZ));
  const width = Math.min(floor.width, Math.max((maxX - minX) * (1 + 2 * HALL_FRAME.pad), floor.width * HALL_FRAME.minShare));
  const depth = Math.min(floor.depth, Math.max((maxZ - minZ) * (1 + 2 * HALL_FRAME.pad), floor.depth * HALL_FRAME.minShare));
  const left = place((minX + maxX) / 2, width, floor.width);
  const top = place((minZ + maxZ) / 2, depth, floor.depth);
  return { minX: left, maxX: left + width, minZ: top, maxZ: top + depth };
}

type Vec3 = readonly [number, number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The screen axes of a camera that stands `direction` away from what it looks at (it need not be a unit vector):
 * `right` is horizontal, `up` leans back with the camera. The same axes `lookAt` gives a camera with y up.
 */
export function viewAxes(direction: Vec3): { right: Vec3; up: Vec3 } {
  const length = Math.hypot(...direction);
  const [x, y, z] = length > 0 ? ([direction[0] / length, direction[1] / length, direction[2] / length] as const) : ([0, 1, 0] as const);
  const side = Math.hypot(x, z);
  // Looking straight down has no "right" of its own: take the x axis and let the top of the screen point to −z.
  if (side < 1e-9) return { right: [1, 0, 0], up: [0, 0, -1] };
  return { right: [z / side, 0, -x / side], up: [(-x * y) / side, side, (-y * z) / side] };
}

/**
 * What a camera standing `direction` away needs to see `rect` on the floor and `headroom` above it: half the width
 * and half the height of the view, and how far the middle of that view is from the point `look` (x, z on the floor)
 * along the screen axes. The scene moves the camera and its target by `shiftRight · right + shiftUp · up`.
 */
export function projectBox(
  rect: FrameRect,
  headroom: number,
  direction: Vec3,
  look: readonly [number, number],
): { halfWidth: number; halfHeight: number; shiftRight: number; shiftUp: number } {
  const { right, up } = viewAxes(direction);
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (const x of [rect.minX, rect.maxX]) {
    for (const y of [0, headroom]) {
      for (const z of [rect.minZ, rect.maxZ]) {
        const point: Vec3 = [x, y, z];
        minR = Math.min(minR, dot(point, right));
        maxR = Math.max(maxR, dot(point, right));
        minU = Math.min(minU, dot(point, up));
        maxU = Math.max(maxU, dot(point, up));
      }
    }
  }
  const origin: Vec3 = [look[0], 0, look[1]];
  return {
    halfWidth: (maxR - minR) / 2,
    halfHeight: (maxU - minU) / 2,
    shiftRight: (minR + maxR) / 2 - dot(origin, right),
    shiftUp: (minU + maxU) / 2 - dot(origin, up),
  };
}
