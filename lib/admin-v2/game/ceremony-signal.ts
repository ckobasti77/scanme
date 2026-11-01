// ADMIN v3 V5 — whether a ceremony is on the screen right now. The ceremony
// layer writes it; decoration that would cut across a ceremony (the aim line of
// the Dashboard) reads it and steps aside. No React and no DOM here, so it is a
// plain external store (`useSyncExternalStore`).

let size: "big" | "card" | null = null;
const listeners = new Set<() => void>();

export const ceremonySignal = {
  /** The size of the ceremony on the screen, or null. */
  get: () => size,
  getServer: () => null,
  set(next: "big" | "card" | null) {
    if (next === size) return;
    size = next;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
