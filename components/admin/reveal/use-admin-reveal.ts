"use client";

import { useSyncExternalStore } from "react";
import type { RevealMode } from "@/lib/admin-v2/reveal/gate";

// ADMIN v3 V1 — what the open page's entrance is, for components that draw
// themselves (the 3D scenes of V2–V4 run their own intro and only need to know
// whether to play it). The reveal root writes it on every visit.

export type AdminRevealState = {
  mode: RevealMode;
  /** The full entrance: the first visit of this page in the session (or the first after 20 minutes). */
  firstVisit: boolean;
  /** `performance.now()` of the navigation. */
  enteredAt: number;
};

const STILL: AdminRevealState = { mode: "none", firstVisit: false, enteredAt: 0 };

let state = STILL;
const listeners = new Set<() => void>();

export function setAdminRevealState(next: AdminRevealState): void {
  state = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => state;
const serverSnapshot = () => STILL;

export function useAdminReveal(): AdminRevealState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
