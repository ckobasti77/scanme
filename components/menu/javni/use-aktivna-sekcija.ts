"use client";

// ScanMe Menu V1 (K13) — which section is in the middle of the screen
// (scroll-spy for the sticky navigation of `Tok` and the bar of `Kompaktno`).
// The band is the middle tenth of the viewport, as in the legacy
// components/menu/menu-nav.tsx. Jumping is a plain anchor link: it works
// without JavaScript, and the smooth scroll obeys prefers-reduced-motion in CSS.

import { useEffect, useState } from "react";

export function useAktivnaSekcija(ids: readonly string[], pocetna: string | null): string | null {
  const [aktivna, setAktivna] = useState<string | null>(pocetna);
  const kljuc = ids.join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elementi = kljuc
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elementi.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setAktivna(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of elementi) observer.observe(el);
    return () => observer.disconnect();
  }, [kljuc]);

  return aktivna;
}
