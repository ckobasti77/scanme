// ScanMe Menu V1 (K14, plan K12-12, §6.3) — the clock of an open public menu.
// The server renders at its own instant (`pocetnoMs`, read in the loader);
// once hydrated, the phone moves on minute by minute, so a promotion starts
// and ends on time without a reload (master §7.6: after the end the regular
// price comes back by itself). The server value is used for hydration, so
// the first client render matches. `uzivo: false` (the izlog, the editor
// preview) keeps the given instant.

import { useSyncExternalStore } from "react";

const MINUT_MS = 60_000;

function pretplati(promena: () => void) {
  let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = setTimeout(() => {
    promena();
    interval = setInterval(promena, MINUT_MS);
  }, MINUT_MS - (Date.now() % MINUT_MS) + 50);
  return () => {
    clearTimeout(timeout);
    if (interval !== undefined) clearInterval(interval);
  };
}

/** The current minute (epoch ms, floored), stable between ticks. */
function trenutniMinut(): number {
  return Math.floor(Date.now() / MINUT_MS) * MINUT_MS;
}

const bezPretplate = () => () => {};

export function useMinutniSat(pocetnoMs: number, uzivo: boolean): number {
  return useSyncExternalStore(
    uzivo ? pretplati : bezPretplate,
    // Never behind the server's instant: a promotion the server showed never flickers off.
    uzivo ? () => Math.max(trenutniMinut(), pocetnoMs) : () => pocetnoMs,
    () => pocetnoMs,
  );
}
