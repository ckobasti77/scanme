"use client";

import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import type { SidebarLive } from "@/lib/admin-v2/sidebar/types";

// ADMIN v2 — the parts of the sidebar only a page knows (options with counts,
// the event list, badges). The page publishes them with useAdminSidebarLive;
// the sidebar in the frame reads the merged result. More than one component
// of a page may publish (Događaji: the event frame and the open section).
// Without the frame (a component rendered alone in a test) publishing does
// nothing.

type Store = {
  set(id: string, live: SidebarLive): void;
  remove(id: string): void;
  subscribe(listener: () => void): () => void;
  snapshot(): SidebarLive;
};

const EMPTY: SidebarLive = {};

function merge(layers: Iterable<SidebarLive>): SidebarLive {
  let result: SidebarLive = EMPTY;
  for (const layer of layers) {
    result = {
      ...result,
      ...layer,
      ...(result.options || layer.options ? { options: { ...result.options, ...layer.options } } : {}),
      ...(result.custom || layer.custom ? { custom: { ...result.custom, ...layer.custom } } : {}),
    };
  }
  return result;
}

function createStore(): Store {
  const layers = new Map<string, SidebarLive>();
  const listeners = new Set<() => void>();
  let merged = EMPTY;
  const changed = () => {
    merged = merge(layers.values());
    for (const listener of listeners) listener();
  };
  return {
    set(id, live) {
      if (layers.get(id) === live) return;
      layers.set(id, live);
      changed();
    },
    remove(id) {
      if (layers.delete(id)) changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => merged,
  };
}

const StoreContext = createContext<Store | null>(null);

export function AdminSidebarProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/**
 * Publishes the page's live sidebar data while the component is mounted.
 * Pass a memoized object (a new object re-renders the sidebar); null
 * publishes nothing.
 */
export function useAdminSidebarLive(live: SidebarLive | null): void {
  const store = useContext(StoreContext);
  const id = useId();
  // A new object replaces the layer in one step (no moment without the page's options).
  useEffect(() => {
    if (!store) return;
    if (live) store.set(id, live);
    else store.remove(id);
  }, [store, id, live]);
  useEffect(() => () => store?.remove(id), [store, id]);
}

const subscribeNothing = () => () => undefined;
const emptySnapshot = () => EMPTY;

/** The merged live data of the open page (the sidebar reads it). */
export function useAdminSidebarSnapshot(): SidebarLive {
  const store = useContext(StoreContext);
  return useSyncExternalStore(store?.subscribe ?? subscribeNothing, store?.snapshot ?? emptySnapshot, emptySnapshot);
}
