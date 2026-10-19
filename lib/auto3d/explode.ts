// Rasklapanje po fazama (A01 §2.4, A03 §3.3). Ista formula kao `Exploder` u 3d/auto3d/lib/views.py:
// lokalni napredak t = clamp((p − s) / (e − s)), kriva cubicInOut, pomeraj = dir · dist · k.

import { EXPLODE_WINDOWS } from "./catalog";
import type { Vec3 } from "./manifest";

export type ExplodeWindows = ReadonlyArray<readonly [number, number]>;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function cubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Udeo pomeraja (0–1) za deo u fazi `stage` pri ukupnom napretku `p`. */
export function explodeFactor(p: number, stage: number, windows: ExplodeWindows = EXPLODE_WINDOWS): number {
  const w = windows[stage];
  if (!w) return 0;
  const [s, e] = w;
  return cubicInOut(clamp01((p - s) / (e - s)));
}

/** Pomeraj čvora u glTF prostoru (metri). */
export function explodeOffset(
  dir: Vec3,
  dist: number,
  stage: number,
  p: number,
  windows: ExplodeWindows = EXPLODE_WINDOWS,
): Vec3 {
  const k = dist * explodeFactor(p, stage, windows);
  return [dir[0] * k, dir[1] * k, dir[2] * k];
}
