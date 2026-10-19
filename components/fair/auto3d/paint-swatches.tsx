"use client";

// Boja laka (A10): šest boja kao u konfiguratoru, samo u režimu Lak. Radio grupa: jedno mesto u
// redosledu tabova, strelice menjaju boju. Naziv izabrane boje stoji pored uzoraka.

import type { CSSProperties, KeyboardEvent } from "react";
import { PAINTS, type PaintId } from "@/lib/auto3d/paints";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { PAINT_LABEL } from "./copy";
import { useAuto3d, useAuto3dStore } from "./store";
import styles from "./auto3d.module.css";

export function PaintSwatches() {
  const store = useAuto3dStore();
  const paint = useAuto3d((s) => s.paint);

  const pick = (id: PaintId) => store.dispatch({ type: "paint", paint: id });

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = PAINTS.findIndex((p) => p.id === paint);
    const next = PAINTS[(i + step + PAINTS.length) % PAINTS.length].id;
    pick(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-paint="${next}"]`)?.focus();
  };

  return (
    <div className={styles.paints}>
      <div role="radiogroup" aria-label={t.paintLabel} className={styles.swatches} onKeyDown={onKey}>
        {PAINTS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            data-paint={p.id}
            aria-checked={paint === p.id}
            aria-label={PAINT_LABEL[p.id]}
            title={PAINT_LABEL[p.id]}
            tabIndex={paint === p.id ? 0 : -1}
            className={styles.swatch}
            style={{ "--a3-swatch": p.hex } as CSSProperties}
            onClick={() => pick(p.id)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <span className={styles.paintName} aria-hidden="true">
        {PAINT_LABEL[paint]}
      </span>
    </div>
  );
}
