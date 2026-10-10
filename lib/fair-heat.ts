// Sajam 2026 SAJAM SUPER — „Gde je gužva“: ONE heat scale for the public map
// (Korak 3) and the admin analytics heat map (Korak 4).
//
// Pure TypeScript (no React, Next or Convex imports): convex/fairHeat.ts and
// convex/fairEventAnalytics.ts normalize with it on the server, the map and the
// admin colour with it in the browser. The public map never receives a count:
// the server sends only these levels (0–1), the admin gets the counts beside them.

export const FAIR_HEAT_PERIODS = ["today", "hour"] as const;
export type FairHeatPeriod = (typeof FAIR_HEAT_PERIODS)[number];

/** The public map reads the heat at most once a minute (and the server caches it as long). */
export const FAIR_HEAT_REFRESH_MS = 60_000;

/**
 * Per period: below `minTotal` (unique scans of all stands together) there is
 * not enough data and the map says so instead of painting everything blue;
 * `minCap` is the least count that reaches the hot end, so one scan never paints
 * a stand red. The hour bucket is smaller, so are its thresholds.
 */
export const FAIR_HEAT_RULES: Readonly<Record<FairHeatPeriod, { minTotal: number; minCap: number }>> = {
  today: { minTotal: 5, minCap: 8 },
  hour: { minTotal: 3, minCap: 4 },
};

/** The hot end is the period's ~95th percentile (one outlier does not wash the rest out). */
export const FAIR_HEAT_PERCENTILE = 0.95;
/** < 1 lifts the lower half a little, so a quieter stand is still visible next to the hottest. */
export const FAIR_HEAT_GAMMA = 0.75;

/**
 * Cold → hot: blue, turquoise, green, yellow, orange, red. The green is a cool
 * emerald on purpose: ScanMe green (#6FC05D) stays on ScanMe things only.
 */
export const FAIR_HEAT_STOPS: ReadonlyArray<{ at: number; color: string }> = [
  { at: 0, color: "#2f6fe4" },
  { at: 0.22, color: "#11aec4" },
  { at: 0.44, color: "#1fae7a" },
  { at: 0.64, color: "#f2c318" },
  { at: 0.82, color: "#f0862a" },
  { at: 1, color: "#e0362c" },
];

export type FairHeatLevel = { locationId: string; level: number };
export type FairHeatResult = { enough: boolean; levels: FairHeatLevel[] };

/** Nearest-rank percentile of ascending `sorted` (non-empty). */
function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** The hot end of a period's counts: ~p95 of the stands with activity, never below `minCap`. */
export function fairHeatCap(counts: Iterable<number>, period: FairHeatPeriod): number {
  const positive = [...counts].filter((value) => value > 0).sort((a, b) => a - b);
  const p95 = positive.length ? percentile(positive, FAIR_HEAT_PERCENTILE) : 0;
  return Math.max(p95, FAIR_HEAT_RULES[period].minCap);
}

/** One count on the shared scale: 0 (none) … 1 (the hot end), two decimals. */
export function fairHeatLevel(count: number, cap: number): number {
  if (!(count > 0) || !(cap > 0)) return 0;
  return Math.round(Math.min(1, count / cap) ** FAIR_HEAT_GAMMA * 100) / 100;
}

/**
 * Counts per map location → levels. Zero stays without a glow; too little
 * activity overall → `enough: false` and no levels at all.
 */
export function fairHeatLevels(counts: ReadonlyMap<string, number>, period: FairHeatPeriod): FairHeatResult {
  let total = 0;
  for (const value of counts.values()) total += Math.max(0, value);
  if (total < FAIR_HEAT_RULES[period].minTotal) return { enough: false, levels: [] };
  const cap = fairHeatCap(counts.values(), period);
  const levels: FairHeatLevel[] = [];
  for (const [locationId, count] of counts) {
    const level = fairHeatLevel(count, cap);
    if (level > 0) levels.push({ locationId, level });
  }
  levels.sort((a, b) => a.locationId.localeCompare(b.locationId));
  return { enough: true, levels };
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The colour of a level, interpolated between the stops (#rrggbb). */
export function fairHeatColor(level: number): string {
  const at = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
  const upper = FAIR_HEAT_STOPS.findIndex((stop) => stop.at >= at);
  if (upper <= 0) return FAIR_HEAT_STOPS[0].color;
  const from = FAIR_HEAT_STOPS[upper - 1];
  const to = FAIR_HEAT_STOPS[upper];
  const t = (at - from.at) / (to.at - from.at);
  const a = channels(from.color);
  const b = channels(to.color);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** The legend bar: the same stops as a CSS gradient (manje → više). */
export function fairHeatGradientCss(direction = "90deg"): string {
  return `linear-gradient(${direction}, ${FAIR_HEAT_STOPS.map((stop) => `${stop.color} ${Math.round(stop.at * 100)}%`).join(", ")})`;
}

/** Whole minutes since `at` (≥ 0) for „ažurirano pre X min“. */
export function fairHeatMinutesAgo(at: number, now: number): number {
  return Math.max(0, Math.floor((now - at) / 60_000));
}
