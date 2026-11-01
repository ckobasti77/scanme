"use client";

// ScanMe Menu V1 (K23) — the venue's late threshold for every timer of the
// waiter panel (master §10.4 "Tek nakon podešenog praga"). One context, so
// the queue, the detail, the floor and the table view all turn red at the
// same minute without threading the setting through every component. Absent
// provider = the default 15 minutes (K22 behaviour).

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LATE_THRESHOLD_MIN } from "@/lib/menu/thresholds";

const PragKontekst = createContext<number>(DEFAULT_LATE_THRESHOLD_MIN);

export function PragKasnjenja({ minuta, children }: { minuta: number; children: ReactNode }) {
  return <PragKontekst.Provider value={minuta}>{children}</PragKontekst.Provider>;
}

/** Minutes after which a waiting request is late. */
export function usePragKasnjenja(): number {
  return useContext(PragKontekst);
}
