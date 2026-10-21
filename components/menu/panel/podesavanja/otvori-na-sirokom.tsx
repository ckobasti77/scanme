"use client";

// ScanMe Menu V1 (K28) — Podešavanja from 1280 px shows every block. Browsers
// with `::details-content` do it in CSS (podesavanja.tsx); for the others this
// opens every block of the section once the screen is wide, and leaves the
// phone accordion alone. Renders nothing.

import { useEffect } from "react";

const SIROKO = "(min-width: 1280px)";

export function OtvoriNaSirokom() {
  useEffect(() => {
    if (typeof window.matchMedia !== "function" || CSS.supports("selector(::details-content)")) return;
    const upit = window.matchMedia(SIROKO);
    const otvori = () => {
      if (!upit.matches) return;
      for (const blok of document.querySelectorAll<HTMLDetailsElement>("[data-podesavanja] details")) blok.open = true;
    };
    otvori();
    upit.addEventListener("change", otvori);
    return () => upit.removeEventListener("change", otvori);
  }, []);
  return null;
}
