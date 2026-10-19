"use client";

// Presek po dužini auta (A10, odluka E13): dugme u donjoj traci uključuje i isključuje presek, a
// klizač iznad trake pomera ravan od spoljne ivice (0) do sredine auta (100). Presek nije u URL-u (E8).

import { Slice, X } from "lucide-react";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { useAuto3d, useAuto3dStore } from "./store";
import styles from "./auto3d.module.css";

/** Ravan pri uključivanju: pola puta do sredine (A03 §6.3, snimak „presek-50“). */
export const SECTION_START = 0.5;

export function SectionToggle() {
  const store = useAuto3dStore();
  const on = useAuto3d((s) => s.section !== null);
  return (
    <button
      type="button"
      className={`${styles.toolButton} ${styles.sectionToggle}`}
      aria-pressed={on}
      title={t.sectionToggle}
      onClick={() => store.dispatch({ type: "section", t: on ? null : SECTION_START })}
    >
      <Slice aria-hidden="true" />
      <span className={styles.sectionToggleLabel}>{t.sectionLabel}</span>
    </button>
  );
}

export function SectionSlider() {
  const store = useAuto3dStore();
  const section = useAuto3d((s) => s.section);
  if (section === null) return null;
  return (
    <div className={styles.sectionBar}>
      <label className={styles.slider}>
        <span className={styles.sliderLabelAlways}>{t.sectionDepth}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(section * 100)}
          onChange={(e) => store.dispatch({ type: "section", t: Number(e.currentTarget.value) / 100 })}
        />
      </label>
      <button type="button" className={styles.iconButton} onClick={() => store.dispatch({ type: "section", t: null })}>
        <X aria-hidden="true" />
        <span className="sr-only">{t.sectionOff}</span>
      </button>
    </div>
  );
}
