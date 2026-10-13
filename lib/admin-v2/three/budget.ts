// ADMIN v3 V2 — budgets of the 3D kit (plan §4.1–§4.2): how many particles may
// live, what a frame should cost and when the regulator lowers the quality.
// Pure; the stage measures the gaps between drawn frames and asks from here.

import { ADMIN_AMBIENT_FPS } from "@/lib/admin-v2/motion";
import { qualityParams, type DrawQuality, type StageQuality } from "./quality";

/** `off` draws nothing, so it has no particles. */
export function particleBudget(quality: StageQuality): number {
  return quality === "off" ? 0 : qualityParams(quality).particles;
}

/** How many particles may be emitted now: what fits next to the live ones; NaN or negative asks for none. */
export function clampEmit(requested: number, alive: number, budget: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  const free = Number.isFinite(alive) && Number.isFinite(budget) ? budget - alive : 0;
  return Math.max(0, Math.min(Math.floor(requested), free));
}

/** The regulator looks at this many drawn frames. */
export const REGULATOR_FRAMES = 45;
/** The average gap may be this many times the target before the quality drops. */
export const REGULATOR_TOLERANCE = 1.35;
/**
 * A gap longer than this (ms) is a pause, not a slow frame: a tab that was hidden, a shader that was
 * compiled. It says nothing about the device, so the window starts again.
 */
export const REGULATOR_PAUSE_MS = 250;

/** Target gap between two drawn frames (ms): 60 fps while interactive, the ambient rate otherwise. */
export function frameTargetMs(interactive: boolean): number {
  return interactive ? 1000 / 60 : 1000 / ADMIN_AMBIENT_FPS;
}

/** `high` drops to `low` over the tolerance; `low` stays `low`, never up. */
export function nextQuality(averageGapMs: number, targetMs: number, quality: DrawQuality): DrawQuality {
  if (quality === "high" && averageGapMs > targetMs * REGULATOR_TOLERANCE) return "low";
  return quality;
}

/**
 * A sliding window of the last `frames` ratios (gap / target). `ratio()` is
 * their average, or null until the window is full. A gap that is not finite or
 * is ≤ 0, and a target ≤ 0, are skipped; a gap longer than `REGULATOR_PAUSE_MS`
 * empties the window. `reset()` empties it too (after the loop was paused).
 */
export function createRegulator(frames: number = REGULATOR_FRAMES) {
  const size = Math.max(1, Math.floor(frames));
  const ratios: number[] = [];
  return {
    push(gapMs: number, targetMs: number): void {
      if (!Number.isFinite(gapMs) || gapMs <= 0 || !Number.isFinite(targetMs) || targetMs <= 0) return;
      if (gapMs > REGULATOR_PAUSE_MS) {
        ratios.length = 0;
        return;
      }
      ratios.push(gapMs / targetMs);
      if (ratios.length > size) ratios.shift();
    },
    ratio(): number | null {
      if (ratios.length < size) return null;
      let sum = 0;
      for (const value of ratios) sum += value;
      return sum / ratios.length;
    },
    reset(): void {
      ratios.length = 0;
    },
  };
}
