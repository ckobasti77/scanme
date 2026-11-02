// ScanMe Menu V1 (K14, plan K12 §6.1, §6.2, K12-11) — a small guest choice
// kept in the browser: the search and filters of a page and the marked
// allergens in sessionStorage (they survive the article detail, another page
// and a refresh, and end with the tab), the RSD/EUR choice in localStorage.
// Built on useSyncExternalStore: the server and the first client render use
// `pocetno`, so hydration always matches; the stored value follows right
// after. A blocked storage (private mode) still works for the open page
// through the in-memory copy. `memorija` keeps the value in memory only (the
// izlog, where the address decides the starting state).

import { useCallback, useSyncExternalStore } from "react";

export type Skladiste = "session" | "local" | "memorija";

const DOGADJAJ = "smm-sacuvano";
const memorija = new Map<string, string>();

function skladiste(vrsta: Skladiste): Storage | null {
  if (vrsta === "memorija" || typeof window === "undefined") return null;
  try {
    return vrsta === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function procitaj(vrsta: Skladiste, kljuc: string): string | null {
  const mem = memorija.get(`${vrsta}:${kljuc}`);
  if (mem !== undefined) return mem;
  try {
    return skladiste(vrsta)?.getItem(kljuc) ?? null;
  } catch {
    return null;
  }
}

function pretplati(promena: () => void) {
  window.addEventListener(DOGADJAJ, promena);
  return () => window.removeEventListener(DOGADJAJ, promena);
}

export function useSacuvano(vrsta: Skladiste, kljuc: string, pocetno: string): [string, (vrednost: string) => void] {
  const vrednost = useSyncExternalStore(
    pretplati,
    () => procitaj(vrsta, kljuc) ?? pocetno,
    () => pocetno,
  );
  const postavi = useCallback(
    (nova: string) => {
      memorija.set(`${vrsta}:${kljuc}`, nova);
      try {
        skladiste(vrsta)?.setItem(kljuc, nova);
      } catch {
        // A full or blocked storage: the in-memory copy still serves this page.
      }
      window.dispatchEvent(new Event(DOGADJAJ));
    },
    [vrsta, kljuc],
  );
  return [vrednost, postavi];
}
