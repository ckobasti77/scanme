"use client";

// ScanMe Menu V1 (K23) — the sound of the waiter panel (master §8.5
// ZAKLJUČANO: a new request MAY produce a short sound; the sound is optional
// and can be switched off completely in the waiter panel; it never rings
// continuously until someone takes the request). A DEVICE setting
// (localStorage `smk_zvuk`, plan K19-21), never a venue switch in
// Funkcionalnosti: one tablet at the bar may ring while a waiter's phone stays
// silent. On by default.
//
// The sound itself is the short two-note ping of the ordering panel
// (lib/ordering-panel-alert.ts, Web Audio): browsers allow it only after a
// gesture, so the first tap or key press anywhere in the panel unlocks it.
// Vibration accompanies it only while the page is visible. The izlog passes
// its own starting value and never writes to storage.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { playAlert, unlockAlertAudio, vibrateAlert } from "@/lib/ordering-panel-alert";

export const ZVUK_KLJUC = "smk_zvuk";
const DOGADJAJ = "smk-zvuk";

function procitaj(): boolean {
  try {
    return window.localStorage.getItem(ZVUK_KLJUC) !== "0";
  } catch {
    return true;
  }
}

function pretplati(promena: () => void) {
  window.addEventListener("storage", promena);
  window.addEventListener(DOGADJAJ, promena);
  return () => {
    window.removeEventListener("storage", promena);
    window.removeEventListener(DOGADJAJ, promena);
  };
}

export type Zvuk = {
  ukljucen: boolean;
  prebaci(): void;
  /** One short sound (and a vibration), only when the sound is on. Never repeats by itself. */
  zvoni(): void;
};

export function useZvuk(izlog?: { pocetno: boolean }): Zvuk {
  const sacuvano = useSyncExternalStore(pretplati, procitaj, () => true);
  const [izlogStanje, setIzlogStanje] = useState(izlog?.pocetno ?? true);
  // When storage refuses (private mode), the switch still holds for this page.
  const [bezSkladista, setBezSkladista] = useState<boolean | null>(null);
  const ukljucen = izlog ? izlogStanje : (bezSkladista ?? sacuvano);

  // The first gesture in the panel unlocks audio (browsers block it before one).
  useEffect(() => {
    function otkljucaj() {
      void unlockAlertAudio();
      document.removeEventListener("pointerdown", otkljucaj, true);
      document.removeEventListener("keydown", otkljucaj, true);
    }
    document.addEventListener("pointerdown", otkljucaj, true);
    document.addEventListener("keydown", otkljucaj, true);
    return () => {
      document.removeEventListener("pointerdown", otkljucaj, true);
      document.removeEventListener("keydown", otkljucaj, true);
    };
  }, []);

  const prebaci = useCallback(() => {
    const sledece = !ukljucen;
    if (sledece) void unlockAlertAudio();
    if (izlog) {
      setIzlogStanje(sledece);
      return;
    }
    try {
      window.localStorage.setItem(ZVUK_KLJUC, sledece ? "1" : "0");
      setBezSkladista(null);
    } catch {
      setBezSkladista(sledece);
    }
    window.dispatchEvent(new Event(DOGADJAJ));
  }, [ukljucen, izlog]);

  const zvoni = useCallback(() => {
    if (!ukljucen) return;
    playAlert();
    vibrateAlert();
  }, [ukljucen]);

  return { ukljucen, prebaci, zvoni };
}
