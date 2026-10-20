"use client";

// ScanMe Menu V1 — which editor layout the window width asks for (K10,
// MENU-UX §8; the break is the window width, not the device):
//   desktop  ≥ 1280: structure | work | live preview
//   siroko   1024–1279: structure | work, preview as an overlay
//   usko     768–1023: work, structure in a drawer, preview as an overlay
//   telefon  < 768: one pane, `Struktura / Uredi / Pregled`
// Only the chosen layout is mounted, so a 400-article page is rendered once.

import { useSyncExternalStore } from "react";

export type StudioSirina = "desktop" | "siroko" | "usko" | "telefon";

const UPITI: readonly [StudioSirina, string][] = [
  ["desktop", "(min-width: 1280px)"],
  ["siroko", "(min-width: 1024px)"],
  ["usko", "(min-width: 768px)"],
];

function trenutna(): StudioSirina {
  for (const [sirina, upit] of UPITI) if (window.matchMedia(upit).matches) return sirina;
  return "telefon";
}

function pretplati(promena: () => void): () => void {
  const liste = UPITI.map(([, upit]) => window.matchMedia(upit));
  for (const lista of liste) lista.addEventListener("change", promena);
  return () => {
    for (const lista of liste) lista.removeEventListener("change", promena);
  };
}

export function useSirina(): StudioSirina {
  return useSyncExternalStore(pretplati, trenutna, () => "desktop");
}
