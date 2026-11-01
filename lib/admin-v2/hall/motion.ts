// ADMIN v3 V3 — the motion of the Living hall (ZADATAK-V3 §3.2), in seconds.
// The camera has a cinematic intro of at most 1.6 s that any input skips; the
// columns rise in its first 0.9 s, the nearest to the camera first. A move of
// the slider and new data settle inside the interaction layer (≤ 250 ms).
// Pure: the scene only reads these.

export const HALL_MOTION = {
  intro: {
    /** The camera comes round to the isometric view. */
    camera: 1.4,
    /** Where it starts: this far round the hall (degrees) and this far out (zoom). */
    azimuthDeg: -35,
    zoom: 0.82,
    /** All the columns have risen by this moment. */
    grow: 0.9,
    /** One column rises this long. */
    column: 0.45,
  },
  /** A returning page: the columns only rise, together. */
  short: 0.4,
  /** A column settles on a new height (a move of the slider, a poll): the time constant of the approach. */
  settle: 0.07,
  /** The ring of a new scan on the top of its stand. */
  ring: 0.6,
  /** The tops flash when the replay crosses a whole hour. */
  flash: 0.25,
  /** The ring that goes out over the floor when the replay crosses a whole hour. */
  hourRing: 0.9,
} as const;

/** The upper limit of the intro of the camera (ZADATAK-V3 §3.2). */
export const HALL_INTRO_MAX = 1.6;

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** GSAP's power3.inOut. */
export function powerInOut(k: number): number {
  const t = clamp01(k);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** GSAP's power3.out: fast, then it settles; no overshoot. */
export function powerOut(k: number): number {
  return 1 - (1 - clamp01(k)) ** 4;
}

/** The camera of the intro at `time`: how far round the hall it still is (radians) and its zoom. At the end: 0 and 1. */
export function introCamera(time: number): { azimuth: number; zoom: number } {
  const left = 1 - powerInOut(time / HALL_MOTION.intro.camera);
  return { azimuth: (HALL_MOTION.intro.azimuthDeg * Math.PI * left) / 180, zoom: 1 - (1 - HALL_MOTION.intro.zoom) * left };
}

/** When the column that is `order`-th nearest to the camera (0 = the nearest) of `count` starts to rise. */
export function introColumnDelay(order: number, count: number): number {
  const room = HALL_MOTION.intro.grow - HALL_MOTION.intro.column;
  if (count <= 1) return 0;
  return (room * Math.min(Math.max(0, order), count - 1)) / (count - 1);
}

/** How far a column of the full intro has risen at `time` (0–1). */
export function introGrow(time: number, order: number, count: number): number {
  return powerOut((time - introColumnDelay(order, count)) / HALL_MOTION.intro.column);
}

/** How far the columns of the short intro have risen at `time` (0–1). */
export function shortGrow(time: number): number {
  return powerOut(time / HALL_MOTION.short);
}

/**
 * The ring of an hour `age` seconds after the replay crossed it: how far it has gone (0–1 of its reach; fast, then
 * it settles) and how visible it is on added light (fades fast) and painted on a light surface (stays readable
 * for most of its life). null once it is over.
 */
export function hourRingAt(age: number): { reach: number; additive: number; painted: number } | null {
  const k = age / HALL_MOTION.hourRing;
  if (!(k >= 0) || k >= 1) return null;
  return { reach: powerOut(k), additive: (1 - k) * (1 - k), painted: (1 - k) * 0.9 };
}

/** A value on its way to `to`: an exponential approach with the time constant `seconds` (a frame rate does not change it). */
export function approach(value: number, to: number, delta: number, seconds: number): number {
  if (!(seconds > 0) || !(delta > 0)) return delta > 0 ? to : value;
  return value + (to - value) * (1 - Math.exp(-delta / seconds));
}
