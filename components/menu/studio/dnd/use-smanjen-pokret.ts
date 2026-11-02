"use client";

// ScanMe Menu V1 — `prefers-reduced-motion` for the editor's drag (K11): no
// lift scale, no layout transition and no drop animation when the person asked
// for less motion. The server render assumes motion is fine (false). One
// MediaQueryList for the whole editor: every row reads it on every render.

import { useSyncExternalStore } from "react";

const UPIT = "(prefers-reduced-motion: reduce)";
let lista: MediaQueryList | null = null;

function upit(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  lista ??= window.matchMedia(UPIT);
  return lista;
}

function pretplati(promena: () => void): () => void {
  const mql = upit();
  if (!mql) return () => undefined;
  mql.addEventListener("change", promena);
  return () => mql.removeEventListener("change", promena);
}

export function useSmanjenPokret(): boolean {
  return useSyncExternalStore(
    pretplati,
    () => upit()?.matches ?? false,
    () => false,
  );
}
