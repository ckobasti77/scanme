"use client";

// ScanMe Menu V1 (K23) — is the waiter panel wide enough for the floor and
// the side pane next to each other (1024 px, MENU-UX §8)? Only words depend on
// it (the table detail's back button says "Radni red" there and "Sala" on a
// phone); the layout itself is CSS. The server and the first render assume a
// phone.

import { useSyncExternalStore } from "react";

const UPIT = "(min-width: 1024px)";

function pretplati(promena: () => void) {
  const upit = window.matchMedia(UPIT);
  upit.addEventListener("change", promena);
  return () => upit.removeEventListener("change", promena);
}

export function useSiroko(): boolean {
  return useSyncExternalStore(
    pretplati,
    () => window.matchMedia(UPIT).matches,
    () => false,
  );
}
