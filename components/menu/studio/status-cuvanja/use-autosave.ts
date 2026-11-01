"use client";

// ScanMe Menu V1 — the save queue as a React store (K10). One queue per editor;
// components read it through useSyncExternalStore, so a save state change
// re-renders the editor once. Leaving the page with unsaved edits asks first.
// K18: `pripremi` runs once on the new queue (the izlog starts a field in
// conflict), so the very first render already shows it.

import { useEffect, useState, useSyncExternalStore } from "react";
import { AutosaveRed } from "@/lib/menu/studio/autosave-queue";

export function useAutosave(pripremi?: (red: AutosaveRed) => void): AutosaveRed {
  const [red] = useState(() => {
    const novi = new AutosaveRed();
    pripremi?.(novi);
    return novi;
  });
  useSyncExternalStore(
    (slusalac) => red.pretplati(slusalac),
    () => red.snimak(),
    () => 0,
  );
  useEffect(() => {
    const pre = (event: BeforeUnloadEvent) => {
      if (!red.imaNesacuvano()) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", pre);
    return () => window.removeEventListener("beforeunload", pre);
  }, [red]);
  return red;
}
