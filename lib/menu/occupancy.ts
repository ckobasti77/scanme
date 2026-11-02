// ScanMe Menu V1 (K23) — table occupancy, an OPTIONAL module of the venue
// (master §9.4 ZAKLJUČANO; plan docs/meni/planovi/K19.md K19-19):
//
//   - without the module a table is NEUTRAL: the panel shows a dash, never
//     "free", and has no occupancy control at all;
//   - with the module staff set free / occupied / reserved / out of service
//     BY HAND, in the context of the chosen table, and can return it to
//     neutral; a table nobody marked is neutral too;
//   - the system never frees a table and never concludes that guests left.
//
// Pure: the panel, the izlog and Convex (menuWaiter.setOccupancy) agree here.

export const OCCUPANCY_STATES = ["free", "occupied", "reserved", "out_of_service"] as const;
export type OccupancyState = (typeof OCCUPANCY_STATES)[number];

/** What a table shows: one of the four states, or neutral (a dash). */
export type OccupancyView = OccupancyState | "neutral";

export function isOccupancyState(value: unknown): value is OccupancyState {
  return typeof value === "string" && (OCCUPANCY_STATES as readonly string[]).includes(value);
}

/**
 * The occupancy a table shows. Without the module it is ALWAYS neutral,
 * whatever rows exist (rows stay from a time the module was on; they are
 * neither shown nor deleted). With the module, an unmarked table is neutral.
 */
export function occupancyView(moduleOn: boolean, state: OccupancyState | null | undefined): OccupancyView {
  if (!moduleOn) return "neutral";
  return state ?? "neutral";
}
