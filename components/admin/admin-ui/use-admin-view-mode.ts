"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
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

/** The list's auto breakpoints in rem: the container queries `@2xl` and `@4xl` of AdminDataView. */
const WIDE_REM = { md: 42, lg: 56 } as const;

/**
 * Whether the list (the element of the returned ref) is at/above its auto
 * breakpoint (before the first measure: wide = Tabela). ADMIN v2: the width
 * of the list, not of the window (the sidebar takes part of the screen).
 */
export function useIsWideContainer(breakpoint: keyof typeof WIDE_REM): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE_REM[breakpoint] * rem));
    observer.observe(element);
    return () => observer.disconnect();
  }, [breakpoint]);
  return [ref, wide];
}
