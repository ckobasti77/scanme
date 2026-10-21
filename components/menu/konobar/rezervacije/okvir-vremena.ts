// ScanMe Menu V1 (K25) — the time window of the reservations subscription
// (convex/menuReservations.ts forPanel, plan K24-13). The query never reads the
// clock: the device passes `fromMs` = the start of the current Belgrade hour
// minus 12 hours, so the argument changes once an hour and the subscription is
// the same all the time in between. Belgrade's offset from UTC is always whole
// hours (UTC+1 / UTC+2), so a Belgrade hour starts on a UTC hour boundary.

const SAT_MS = 60 * 60 * 1000;
const UNAZAD_SATI = 12;

/** `fromMs` of the reservations query for the instant `sadaMs`. */
export function okvirOd(sadaMs: number): number {
  return Math.floor(sadaMs / SAT_MS) * SAT_MS - UNAZAD_SATI * SAT_MS;
}

/** Milliseconds until the window moves (the next full hour). */
export function msDoSledecegSata(sadaMs: number): number {
  return SAT_MS - (sadaMs % SAT_MS);
}
