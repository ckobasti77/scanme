"use client";

// Prekidač prikaza Rendgen, Lak i Kostur (A03 §4.1). Radio grupa: jedno mesto u redosledu tabova,
// strelice menjaju izbor. Lak i kostur već crta pregledač (A04); boje laka dodaje A10.

import type { KeyboardEvent } from "react";
import { MODES, type Mode } from "@/lib/auto3d/filter";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { MODE_LABEL } from "./copy";
import { useAuto3d, useAuto3dStore } from "./store";
import styles from "./auto3d.module.css";

export function ModeSwitch() {
  const store = useAuto3dStore();
  const mode = useAuto3d((s) => s.mode);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next: Mode = MODES[(MODES.indexOf(mode) + step + MODES.length) % MODES.length];
    store.dispatch({ type: "mode", mode: next });
    e.currentTarget.querySelector<HTMLElement>(`[data-mode="${next}"]`)?.focus();
  };

  return (
    <div role="radiogroup" aria-label={t.modeLabel} className={styles.modeSwitch} onKeyDown={onKey}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          data-mode={m}
          aria-checked={mode === m}
          tabIndex={mode === m ? 0 : -1}
          className={styles.modeButton}
          onClick={() => store.dispatch({ type: "mode", mode: m })}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
