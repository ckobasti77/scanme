"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  ADMIN_VIEW_CHANGE_EVENT,
  createViewModeStore,
  viewModeStorageKey,
  type AdminViewMode,
} from "@/lib/admin-v1/view-mode";

// Admin UX A1 — the saved `Tabela | Kartice` choice of one list, per browser
// (localStorage key `scanme-admin-view:<listKey>`). Follows the theme toggle
// pattern: useSyncExternalStore + the `storage` event for other tabs and a
// local event for this one. The server snapshot is null (= auto).

const store = createViewModeStore(() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
});

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(viewModeStorageKey(""))) onChange();
  };
  window.addEventListener(ADMIN_VIEW_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ADMIN_VIEW_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAdminViewMode(listKey: string): [AdminViewMode | null, (mode: AdminViewMode) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => store.read(listKey),
    () => null,
  );
  const setStored = useCallback(
    (mode: AdminViewMode) => {
      store.write(listKey, mode);
      window.dispatchEvent(new Event(ADMIN_VIEW_CHANGE_EVENT));
    },
    [listKey],
  );
  return [stored, setStored];
}

const WIDE_QUERY = { md: "(min-width: 48rem)", lg: "(min-width: 64rem)" } as const;

/** Whether the viewport is at/above the list's auto breakpoint (server: wide = Tabela). */
export function useIsWideViewport(breakpoint: keyof typeof WIDE_QUERY): boolean {
  const query = WIDE_QUERY[breakpoint];
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const media = window.matchMedia(query);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
      },
      [query],
    ),
    () => window.matchMedia(query).matches,
    () => true,
  );
}
