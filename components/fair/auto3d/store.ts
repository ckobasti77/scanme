"use client";

// Jedan store stranice /sajam/3d (A03 §4.2, odluka E15): reducer iz lib/auto3d/state.ts,
// pretplata preko useSyncExternalStore, bez paketa.

import { createContext, useContext, useSyncExternalStore } from "react";
import { reduce, type Action, type Auto3dState } from "@/lib/auto3d/state";

export type Auto3dStore = {
  getState(): Auto3dState;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
  readonly initial: Auto3dState;
};

export function createAuto3dStore(initial: Auto3dState): Auto3dStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    initial,
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return;
      state = next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const Auto3dStoreContext = createContext<Auto3dStore | null>(null);

export function useAuto3dStore(): Auto3dStore {
  const store = useContext(Auto3dStoreContext);
  if (!store) throw new Error("Auto3dStoreContext nije postavljen");
  return store;
}

export function useAuto3d<T>(selector: (s: Auto3dState) => T): T {
  const store = useAuto3dStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.initial),
  );
}
