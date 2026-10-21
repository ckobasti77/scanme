import { hourAt } from "./timelapse";
import type { HallImpulse, HallSeries } from "./types";

// ADMIN v3 V3 — the scan particles of the hall (ZADATAK-V3 §3.2), pure: what the
// scene emits and when. A new scan of a stand (seen between two polls) sends up
// a few particles from that stand; in the calm state the busiest stands send a
// slow stream; during a replay the stream follows the scans of the running hour.
// The scene only asks "how many particles now" and draws them; nothing here
// touches the DOM or `three`.

export const HALL_PARTICLES = {
  /** The most particles one impulse (one stand, one poll) sends. */
  perStandMax: 12,
  /** They leave the stand spread over this many seconds (s). */
  spreadS: 8,
  /** The ring on the floor under the stand lasts this long (s). */
  ringS: 0.6,
  /** A particle lives this long (s). */
  lifeS: 2.4,
  /** How far a particle rises, in hall heights. */
  rise: 0.12,
  /** Particles per second of the busiest stand in the calm state. */
  ambientRate: 0.8,
  /** Particles per second of the busiest stand-hour of the day in a replay. */
  replayRate: 6,
  /** The most particles one frame emits, whatever the gap since the last one. */
  burstMax: 8,
} as const;

/** New scans per map location between two polls; the first read (prev null) is a state, not news. */
export function scanImpulses(prev: ReadonlyMap<string, number> | null, next: ReadonlyMap<string, number>): HallImpulse[] {
  if (!prev) return [];
  const impulses: HallImpulse[] = [];
  for (const [locationId, value] of next) {
    const added = Math.floor(value - (prev.get(locationId) ?? 0));
    if (added > 0) impulses.push({ locationId, count: added });
  }
  return impulses.sort((a, b) => b.count - a.count || a.locationId.localeCompare(b.locationId));
}

/** Seconds from now at which the particles of one impulse leave the stand: at most 12, spread over 8 s. */
export function impulseDelays(count: number): number[] {
  const n = Number.isFinite(count) && count > 0 ? Math.min(HALL_PARTICLES.perStandMax, Math.floor(count)) : 0;
  return Array.from({ length: n }, (_, index) => (index * HALL_PARTICLES.spreadS) / n);
}

/** Particles per second per location in the calm state: 0.8 × (unique in the last hour) / (the largest such). */
export function ambientRates(lastHour: ReadonlyMap<string, number>): Map<string, number> {
  const rates = new Map<string, number>();
  let max = 0;
  for (const value of lastHour.values()) if (Number.isFinite(value) && value > max) max = value;
  if (max <= 0) return rates;
  for (const [locationId, value] of lastHour) {
    if (Number.isFinite(value) && value > 0) rates.set(locationId, (HALL_PARTICLES.ambientRate * value) / max);
  }
  return rates;
}

/** Particles per second per location during a replay: in proportion to the scans of the hour t is in. */
export function replayRates(series: HallSeries, t: number): Map<string, number> {
  const rates = new Map<string, number>();
  if (!(t > 0) || t >= series.end || series.hours.length === 0) return rates;
  const hour = hourAt(series, t);
  let max = 0;
  for (const stand of series.stands) for (const value of stand.scans) if (Number.isFinite(value) && value > max) max = value;
  if (max <= 0) return rates;
  for (const stand of series.stands) {
    const scans = stand.scans[hour];
    if (Number.isFinite(scans) && scans > 0) rates.set(stand.locationId, (HALL_PARTICLES.replayRate * scans) / max);
  }
  return rates;
}

/** How many particles to emit this frame for a rate, carrying the fraction to the next frame. */
export function emitCount(rate: number, carry: number, deltaS: number): { count: number; carry: number } {
  const kept = Number.isFinite(carry) && carry > 0 ? carry : 0;
  if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(deltaS) || deltaS < 0) return { count: 0, carry: kept };
  const total = kept + rate * deltaS;
  const whole = Math.floor(total);
  // Over the burst cap the surplus is dropped, not carried: a long gap between frames never bursts or piles up.
  return { count: Math.min(HALL_PARTICLES.burstMax, whole), carry: total - whole };
}
