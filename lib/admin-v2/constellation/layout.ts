import { orbitTone, starTone } from "./colors";
import { ORBIT_RADIUS, STAR_RADIUS } from "./geometry";
import type {
  BacklogRing,
  CalmDot,
  ConstellationCounts,
  ConstellationItem,
  ConstellationLayout,
  ConstellationPriority,
  OrbitIndex,
  Star,
  StarSize,
} from "./types";

// ADMIN v3 V2 — the layout of the Constellation (plan §3). Pure and
// deterministic: the same items give the same picture in the 3D scene, in the
// 2D fallback and in the text equivalent. The urgency of an item picks its
// orbit, its id picks its place on the orbit (so a star does not jump when
// the others change), its wait picks its size.

/** The outer orbit draws at most this many unnamed calm dots; the rest is only counted. */
export const CALM_DOTS_MAX = 60;

const TAU = Math.PI * 2;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Passes of `spreadAngles` before it gives up and spaces the stars evenly. */
const SPREAD_PASSES = 64;
/** A gap this close to `minGap` counts as kept. */
const GAP_EPSILON = 1e-9;

/** FNV-1a 32-bit over UTF-16 code units; a non-negative integer below 2^32. */
export function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** blocking_or_overdue → 1; due_today → 2; other → 4; everything else → 3. */
export function orbitOf(priority: ConstellationPriority): OrbitIndex {
  if (priority === "blocking_or_overdue") return 1;
  if (priority === "due_today") return 2;
  if (priority === "other") return 4;
  return 3;
}

/** How long an item has waited: up to 1 h small, up to 24 h medium, longer large; negative or NaN is small. */
export function starSize(waitMs: number): StarSize {
  if (!(waitMs > HOUR_MS)) return "small";
  if (waitMs <= DAY_MS) return "medium";
  return "large";
}

/** The smallest angle (radians) between two stars of an orbit, so the largest discs keep a gap of 0.7 radius. */
export function minStarGap(orbit: OrbitIndex): number {
  return 2 * Math.asin(Math.min(1, (STAR_RADIUS.large * 1.7) / ORBIT_RADIUS[orbit]));
}

function normalizeAngle(angle: number): number {
  // An angle already in range is returned bit for bit: wrapping would add rounding noise.
  if (angle >= 0 && angle < TAU) return angle;
  const wrapped = ((angle % TAU) + TAU) % TAU;
  // A tiny negative angle wraps to exactly 2π in floating point.
  return wrapped >= TAU ? 0 : wrapped;
}

/**
 * Moves angles on a circle apart so that every two neighbours are at least
 * `minGap` apart. The result has the same length and index order, angles in
 * [0, 2π), and the circular order is kept. If they cannot all fit
 * (`n * minGap >= 2π`) they are spaced evenly from the smallest angle. Else up
 * to 64 passes: every neighbouring pair (and the last–first pair) closer than
 * `minGap` moves apart by half of the shortfall each; if a shortfall is left
 * after the passes, evenly. A free layout is returned unchanged (normalized).
 */
export function spreadAngles(angles: readonly number[], minGap: number): number[] {
  const count = angles.length;
  if (count === 0) return [];
  const normalized = angles.map(normalizeAngle);
  if (count === 1) return normalized;

  // Indices in circular order; equal angles keep their index order.
  const order = normalized.map((_, index) => index).sort((a, b) => normalized[a] - normalized[b] || a - b);
  const even = () => {
    const result = new Array<number>(count);
    const start = normalized[order[0]];
    order.forEach((original, place) => {
      result[original] = normalizeAngle(start + (place * TAU) / count);
    });
    return result;
  };

  if (count * minGap >= TAU) return even();

  // Unwrapped positions in circular order: they only grow, the last gap closes the circle.
  const places = order.map((original) => normalized[original]);
  const gapAfter = (place: number) => (place === count - 1 ? places[0] + TAU - places[place] : places[place + 1] - places[place]);
  for (let pass = 0; pass < SPREAD_PASSES; pass += 1) {
    let moved = false;
    for (let place = 0; place < count; place += 1) {
      const shortfall = minGap - gapAfter(place);
      if (shortfall <= GAP_EPSILON) continue;
      const next = (place + 1) % count;
      places[place] -= shortfall / 2;
      // For the closing pair `next` is the first place, which sits one turn lower.
      places[next] += shortfall / 2;
      moved = true;
    }
    if (!moved) break;
  }
  for (let place = 0; place < count; place += 1) {
    if (minGap - gapAfter(place) > GAP_EPSILON) return even();
  }

  const result = new Array<number>(count);
  order.forEach((original, place) => {
    result[original] = normalizeAngle(places[place]);
  });
  return result;
}

/** 3 × urgent + 2 × needs a reply + 1 × today. */
export function backlogHp(counts: ConstellationCounts): number {
  return 3 * counts.urgent + 2 * counts.needsReply + counts.today;
}

/** null counts → null. `share` is the part of the largest backlog seen that is still open. */
export function backlogRing(counts: ConstellationCounts | null, hpMaxSeen?: number): BacklogRing | null {
  if (!counts) return null;
  const hp = backlogHp(counts);
  const hpMax = Math.max(hp, hpMaxSeen ?? 0);
  return { hp, hpMax, share: hpMax > 0 ? hp / hpMax : 0 };
}

const unit = (text: string) => hash32(text) / 2 ** 32;

const byOrbitAngleId = (a: Star, b: Star) => a.orbit - b.orbit || a.angle - b.angle || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The picture for the items of „Za reakciju“ and the totals of the Dashboard.
 * The totals add what the named items do not show: a „+N“ star on the orbits
 * 1–3, the unnamed calm dots on the outer one and the ring of the backlog.
 * Without counts only the named stars are drawn.
 */
export function orbitLayout(
  items: readonly ConstellationItem[],
  counts: ConstellationCounts | null,
  now: number,
  hpMaxSeen?: number,
): ConstellationLayout {
  const named: Record<OrbitIndex, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const stars: Star[] = items.map((item) => {
    const orbit = orbitOf(item.priority);
    named[orbit] += 1;
    return {
      id: item.id,
      kind: "item",
      orbit,
      angle: unit(item.id) * TAU,
      size: starSize(now - item.relevantAt),
      tone: starTone(item.priority),
      pulse: orbit === 1,
      more: 0,
    };
  });

  let calm: CalmDot[] = [];
  let calmTotal = 0;

  if (counts) {
    const rest: Record<1 | 2 | 3, number> = {
      1: counts.urgent - named[1],
      2: counts.today - named[2],
      3: counts.needsReply + counts.graceOrWarning + counts.waitingScanme + counts.waitingClient - named[3],
    };
    for (const orbit of [1, 2, 3] as const) {
      if (!(rest[orbit] > 0)) continue;
      const id = `more:${orbit}`;
      stars.push({ id, kind: "more", orbit, angle: unit(id) * TAU, size: "medium", tone: orbitTone(orbit), pulse: orbit === 1, more: rest[orbit] });
    }

    calmTotal = Math.max(0, counts.calm - named[4]);
    const dots = Math.min(calmTotal, CALM_DOTS_MAX);
    calm = Array.from({ length: dots }, (_, index) => ({
      angle: normalizeAngle(((index + 0.5) / dots) * TAU + (unit(`calm:${index}`) - 0.5) * (TAU / dots) * 0.6),
      radius: ORBIT_RADIUS[4] + (unit(`calm-r:${index}`) - 0.5) * 0.05,
    }));
  }

  // Every orbit spreads its own stars; the named ones and the „+N“ star share it.
  for (const orbit of [1, 2, 3, 4] as const) {
    const onOrbit = stars.filter((star) => star.orbit === orbit);
    const spread = spreadAngles(onOrbit.map((star) => star.angle), minStarGap(orbit));
    onOrbit.forEach((star, index) => {
      star.angle = spread[index];
    });
  }

  return { stars: stars.sort(byOrbitAngleId), calm, calmTotal, backlog: backlogRing(counts, hpMaxSeen) };
}
