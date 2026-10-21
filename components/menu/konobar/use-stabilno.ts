// ScanMe Menu V1 (K33) — a callback with a fixed identity that always calls the latest one. The panel
// ticks every second and builds new closures on every tick; a memoised card, tile or row that got
// them as props would be redrawn by every tick. Handed through this, it is not, and a click still
// reaches the handler of the latest render (never a stale one).

import { useCallback, useEffect, useRef } from "react";

export function useStabilno<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const najnovija = useRef(fn);
  useEffect(() => {
    najnovija.current = fn;
  });
  return useCallback((...args: A) => najnovija.current(...args), []);
}
