// ScanMe Menu V1 (K22) — the ONE clock of the waiter panel (plan K19-17): a
// single interval for the whole panel ticks every second, and every timer
// (`18:43 · čeka 08:12`) reads it, so they move together and no row starts
// its own interval. The server renders at its own instant (`pocetnoMs`),
// hydration uses it, then the device clock takes over.
//
// The izlog passes `izlogOd`: its clock starts at a fixed instant (stable
// snapshots) and then runs at real speed, so a Playwright fake clock can move
// it (08:12 → 08:13).

import { createContext, useContext, useState, useSyncExternalStore } from "react";

const SEKUNDA = 1000;
const slusaoci = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | undefined;
let poravnanje: ReturnType<typeof setTimeout> | undefined;

function otkucaj() {
  for (const slusalac of slusaoci) slusalac();
}

function pretplati(promena: () => void) {
  slusaoci.add(promena);
  if (slusaoci.size === 1) {
    // Tick on the second boundary, so `čeka 08:12` changes with the wall clock.
    poravnanje = setTimeout(() => {
      otkucaj();
      interval = setInterval(otkucaj, SEKUNDA);
    }, SEKUNDA - (Date.now() % SEKUNDA) + 5);
  }
  return () => {
    slusaoci.delete(promena);
    if (slusaoci.size === 0) {
      if (poravnanje !== undefined) clearTimeout(poravnanje);
      if (interval !== undefined) clearInterval(interval);
      poravnanje = undefined;
      interval = undefined;
    }
  };
}

const naSekundu = (ms: number) => Math.floor(ms / SEKUNDA) * SEKUNDA;

/**
 * K33: the clock for the leaves that show time (the timers, the badges). A parent that memoises its children
 * puts `sadaMs` here instead of handing it down as a prop, so a tick redraws these leaves and not the cards,
 * tiles and rows around them.
 */
export const SatKontekst = createContext<number | null>(null);

/** The clock of the nearest provider, or `zaPropu` when none gives one (a leaf drawn alone, as in a detail view). */
export function useSatLista(zaPropu: number): number {
  return useContext(SatKontekst) ?? zaPropu;
}

/** The current second (epoch ms, floored), stable between ticks. */
export function useSat(pocetnoMs: number, opcije: { izlogOd?: number } = {}): number {
  const izlogOd = opcije.izlogOd;
  // The izlog's offset from the real clock, fixed when the panel mounts and kept to whole
  // seconds, so the izlog's seconds turn exactly when the shared tick fires.
  const [pomak] = useState(() => (izlogOd === undefined ? 0 : izlogOd - naSekundu(Date.now())));
  return useSyncExternalStore(
    pretplati,
    () => naSekundu(Date.now() + pomak),
    () => naSekundu(izlogOd ?? pocetnoMs),
  );
}
