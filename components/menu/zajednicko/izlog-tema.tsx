"use client";

// ScanMe Menu V1 — `?tema=svetla|tamna` of the izlog (K07). While the dev
// route is open, it sets `data-theme` and the `dark` class on <html> (the same
// two switches the app theme uses, app/layout.tsx); on leaving it restores the
// app's own theme: the stored choice, else the system preference. Nothing is
// written to storage. The global theme toggle is told to re-read the DOM.

import { useLayoutEffect } from "react";
import type { IzlogTema as IzlogTemaVrednost } from "@/lib/menu/izlog-params";

const THEME_STORAGE_KEY = "scanme-theme";

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
  window.dispatchEvent(new Event("scanme-theme-change"));
}

function appTheme(): "light" | "dark" {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage may be blocked; the system preference decides then.
  }
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function IzlogTema({ tema }: { tema: IzlogTemaVrednost | null }) {
  useLayoutEffect(() => {
    if (!tema) return;
    applyTheme(tema === "tamna" ? "dark" : "light");
    return () => applyTheme(appTheme());
  }, [tema]);
  return null;
}
