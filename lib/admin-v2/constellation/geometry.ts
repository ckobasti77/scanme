import type { OrbitIndex, StarSize } from "./types";

// ADMIN v3 V2 — the measures of the Constellation, shared by the 3D scene, the
// 2D fallback and the layout. Everything is a share of R, the radius of the
// whole system. The 2D fallback is the same picture without perspective: the
// plane of the orbits seen from the tilt of the 3D camera, so a circle becomes
// an ellipse and the change from 2D to 3D does not move the stars far.

/** The ScanMe core. */
export const CORE_RADIUS = 0.11;
/** The ring of the backlog around the core. */
export const BACKLOG_RADIUS = 0.17;
/** The distance from the core is the urgency. */
export const ORBIT_RADIUS: Record<OrbitIndex, number> = { 1: 0.3, 2: 0.52, 3: 0.74, 4: 0.94 };
/** One full turn of an orbit (seconds): the inner ones are faster. */
export const ORBIT_PERIOD_S: Record<OrbitIndex, number> = { 1: 90, 2: 140, 3: 200, 4: 300 };
/** The disc of a star. */
export const STAR_RADIUS: Record<StarSize, number> = { small: 0.022, medium: 0.03, large: 0.04 };
/** The camera of the scene leans this far from the vertical (degrees). */
export const CONSTELLATION_TILT_DEG = 66;
/**
 * Half of the flat picture (shares of R), with room for the halo of the outer stars. A little taller than
 * the squashed system needs, so the 2D picture is the size of the 3D scene (whose near half is taller).
 */
export const FLAT_VIEW = { halfWidth: 1.06, halfHeight: 0.53 } as const;

const FLAT_SQUASH = Math.cos((CONSTELLATION_TILT_DEG * Math.PI) / 180);

/** A point of the plane of the orbits in the flat picture: x to the right, y down (nearer the viewer). */
export function flatPoint(angle: number, radius: number): [number, number] {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius * FLAT_SQUASH];
}

/** The same point in a box of `width` × `height` px (the picture is centred and fits whole). */
export function flatProject(angle: number, radius: number, width: number, height: number): { x: number; y: number } {
  const scale = Math.min(width / (2 * FLAT_VIEW.halfWidth), height / (2 * FLAT_VIEW.halfHeight));
  const [x, y] = flatPoint(angle, radius);
  return { x: width / 2 + x * scale, y: height / 2 + y * scale };
}

// --- the tap on the 2D picture -------------------------------------------------
// A finger is wider than the transparent hit circle of a star (about 26-29 px on a phone) and the circles of
// neighbours overlap, so on a touch the tap is resolved on the whole picture: the star whose centre is nearest wins,
// within the reach of a 44 px target; a tap farther from every star does nothing. A mouse keeps its per-star hover.

/** The reach of a tap (px): the radius of a 44 px target. */
export const TOUCH_REACH_PX = 22;

/** A star of the flat picture: its centre in view-box units (the centre of the picture is 0, 0). */
export type FlatStar = { id: string; x: number; y: number };

/** Px per view-box unit when the picture is drawn `meet` into a box of `width` × `height` px. */
export function flatScale(width: number, height: number): number {
  return Math.min(width / (2 * FLAT_VIEW.halfWidth), height / (2 * FLAT_VIEW.halfHeight));
}

/** The centres of the stars in view-box units (a „+N“ star counts as any other). */
export function flatStars(stars: readonly { id: string; angle: number; orbit: OrbitIndex }[]): FlatStar[] {
  return stars.map((star) => {
    const [x, y] = flatPoint(star.angle, ORBIT_RADIUS[star.orbit]);
    return { id: star.id, x, y };
  });
}

/**
 * The id of the star nearest to `point` (view-box units) that is at most `reach` away, else null. Of two stars at
 * the same distance the first of `stars` wins, so a tap is never a coin toss.
 */
export function nearestStar(point: { x: number; y: number }, stars: readonly FlatStar[], reach: number): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const star of stars) {
    const distance = Math.hypot(star.x - point.x, star.y - point.y);
    if (distance <= reach && distance < bestDistance) {
      best = star.id;
      bestDistance = distance;
    }
  }
  return best;
}

/** A tap at (`clientX`, `clientY`) on a picture whose box is `box` (client px): the star it is for, else null. */
export function tapStar(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  stars: readonly FlatStar[],
  reachPx: number = TOUCH_REACH_PX,
): string | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const scale = flatScale(box.width, box.height);
  const point = { x: (clientX - box.left - box.width / 2) / scale, y: (clientY - box.top - box.height / 2) / scale };
  return nearestStar(point, stars, reachPx / scale);
}
