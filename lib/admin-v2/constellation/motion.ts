import { ORBIT_RADIUS } from "./geometry";

// ADMIN v3 V2 — the motion of the Constellation as numbers and pure curves, so
// the limits are tested without a canvas. Seconds. The intro of the scene is
// part of the reveal layer (at most 900 ms, and it never blocks a click); what
// answers the pointer is of the interaction layer (at most 250 ms); the ambient
// turn of the orbits and the pulse of the urgent stars stand with reduced
// motion and in the quiet mode.

export const CONSTELLATION_MOTION = {
  /** The full entrance: the core lights up, the orbits and the backlog ring are drawn, the stars come out from the inner orbit. */
  intro: { core: [0, 0.3], orbits: [0.2, 0.6], stars: [0.4, 0.9], star: 0.26, total: 0.9 },
  /** A resolved item: a spiral out to the calm orbit, a third of a turn, with a trail. */
  resolved: { duration: 0.9, turn: (2 * Math.PI) / 3, trail: 24, trailLife: 0.6, fadeFrom: 0.72 },
  /** A new item falls into its orbit from outside the system. */
  arrived: { duration: 0.7, from: 1.3, overshoot: 1.2, trail: 12, sparks: 10, sparkLife: 0.5, ring: 0.5 },
  /** A change of urgency: to another orbit. */
  moved: 0.5,
  shown: 0.24,
  left: 0.24,
  /** The pointer: the star grows, its ring appears. */
  hover: 0.15,
  hoverScale: 1.35,
  /** The backlog ring follows its number. */
  ring: 0.25,
  /** The pulse of an urgent star. */
  pulsePeriod: 1.2,
  /** The camera leans after the cursor (degrees), on a fine pointer only. */
  parallaxDeg: 3,
} as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const powerOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const powerInOut = (t: number) => {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
};
/** GSAP's `back.out(overshoot)`: past the target and back. */
export const backOut = (t: number, overshoot = 1.70158) => {
  const k = clamp01(t) - 1;
  return 1 + k * k * ((overshoot + 1) * k + overshoot);
};

/** Progress 0–1 of a part of the intro that runs in `[from, to]` seconds. */
export const windowProgress = (elapsed: number, [from, to]: readonly [number, number]) => clamp01((elapsed - from) / (to - from));

/**
 * When a star comes out in the intro (seconds from its start): the inner orbit first, the outer one
 * last, each star for `intro.star`; the last one ends exactly with the intro.
 */
export function introStarStart(orbitRadius: number): number {
  const { stars, star } = CONSTELLATION_MOTION.intro;
  const inner = ORBIT_RADIUS[1];
  const outer = ORBIT_RADIUS[4];
  const share = clamp01((orbitRadius - inner) / (outer - inner));
  return stars[0] + share * (stars[1] - stars[0] - star);
}

/**
 * A resolved star at progress `k` (0–1): from its place out to the calm orbit, turning a third of a
 * circle; it dims in the last part and is gone at the end (the item is closed, not calm).
 */
export function spiralPoint(k: number, fromRadius: number, fromAngle: number): { radius: number; angle: number; alpha: number } {
  const { turn, fadeFrom } = CONSTELLATION_MOTION.resolved;
  const progress = powerInOut(k);
  const fade = clamp01((clamp01(k) - fadeFrom) / (1 - fadeFrom));
  return {
    radius: fromRadius + (ORBIT_RADIUS[4] - fromRadius) * progress,
    angle: fromAngle + turn * progress,
    alpha: 1 - fade,
  };
}

/** A new star at progress `k`: from outside the system onto its orbit, a little past it and back. */
export function arrivalRadius(k: number, orbitRadius: number): number {
  const { from, overshoot } = CONSTELLATION_MOTION.arrived;
  return from + (orbitRadius - from) * backOut(k, overshoot);
}

/** The shortest signed way from angle `from` to angle `to` (radians, in (−π, π]). */
export function angleDelta(from: number, to: number): number {
  const full = 2 * Math.PI;
  const delta = (((to - from) % full) + full) % full;
  return delta > Math.PI ? delta - full : delta;
}
