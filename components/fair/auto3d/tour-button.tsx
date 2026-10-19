"use client";

// Dugme „Vođena tura · 1 min“ u zaglavlju stranice (A10). Pokreće turu (`?tura=1`); dok tura traje
// je pritisnuto i ponovni klik je gasi. Bez 3D prikaza (greška, bez WebGL-a) se ne vidi.

import { Play, Square } from "lucide-react";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { useAuto3d, useAuto3dStore } from "./store";
import styles from "./auto3d.module.css";

export function TourButton() {
  const store = useAuto3dStore();
  const active = useAuto3d((s) => s.tour.active);
  const out = useAuto3d((s) => s.status === "nowebgl" || s.status === "error");
  if (out) return null;
  return (
    <button
      type="button"
      className={styles.tourButton}
      aria-pressed={active}
      onClick={() => store.dispatch({ type: "tour", active: !active })}
    >
      {active ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
      <span>{t.tourStart}</span>
      <small>{t.tourDuration}</small>
    </button>
  );
}
