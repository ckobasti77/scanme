"use client";

// Titl vođene ture (A10). Na stranici je traka u studiju umesto donje trake alata: tačka i naziv
// sistema, korak „3 / 12“, opis iz rečnika delova, pauza, sledeći sistem i izlaz. Napredak je niz
// segmenata, po jedan za korak: prošli su puni, tekući se puni za trajanje koraka (staje na pauzi).
// U kiosku je titl veliki, bez dugmadi (dodir prekida petlju).

import type { CSSProperties } from "react";
import { Pause, Play, SkipForward, X } from "lucide-react";
import { SYSTEM_COLOR } from "@/lib/auto3d/groups";
import { isLastStep, TOUR_STEPS } from "@/lib/auto3d/tour";
import { fmt } from "@/lib/i18n/format";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { tourCaption } from "./copy";
import { useAuto3d, useAuto3dStore } from "./store";
import styles from "./auto3d.module.css";

function Segments({ step, paused }: { step: number; paused: boolean }) {
  return (
    <span className={styles.tourSegments} aria-hidden="true" data-paused={paused ? "" : undefined}>
      {TOUR_STEPS.map((s, i) => (
        <span key={i} data-state={i < step ? "done" : i === step ? "now" : "next"}>
          {i === step ? <i key={step} style={{ "--a3-step": `${s.seconds}s` } as CSSProperties} /> : null}
        </span>
      ))}
    </span>
  );
}

function Title({ step, large = false }: { step: number; large?: boolean }) {
  const c = tourCaption(step);
  return (
    <div className={styles.tourText} key={step}>
      <p className={large ? styles.kioskCaptionTitle : styles.tourTitle}>
        {c.system ? <span className={styles.groupDot} style={{ background: SYSTEM_COLOR[c.system] }} aria-hidden="true" /> : null}
        <span>{c.title}</span>
        {large ? null : (
          <span className={styles.tourPosition}>{fmt(t.tourPosition, { index: step + 1, total: TOUR_STEPS.length })}</span>
        )}
      </p>
      <p className={large ? styles.kioskCaptionText : styles.tourDesc}>{c.text}</p>
    </div>
  );
}

export function TourBar() {
  const store = useAuto3dStore();
  const step = useAuto3d((s) => s.tour.step);
  const paused = useAuto3d((s) => s.tour.paused);
  const last = isLastStep(step);

  return (
    <section className={styles.tourBar} aria-label={t.tourLabel}>
      <Title step={step} />
      <div className={styles.tourControls}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => store.dispatch({ type: "tour", active: true, paused: !paused })}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          <span className="sr-only">{paused ? t.tourResume : t.tourPause}</span>
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => store.dispatch(last ? { type: "tourEnd" } : { type: "tourStep", step: step + 1 })}
        >
          <SkipForward aria-hidden="true" />
          <span className="sr-only">{t.tourNext}</span>
        </button>
        <button type="button" className={styles.iconButton} onClick={() => store.dispatch({ type: "tour", active: false })}>
          <X aria-hidden="true" />
          <span className="sr-only">{t.tourExit}</span>
        </button>
      </div>
      <Segments step={step} paused={paused} />
    </section>
  );
}

export function KioskCaption() {
  const step = useAuto3d((s) => s.tour.step);
  return (
    <div className={styles.kioskCaption}>
      <Title step={step} large />
      <Segments step={step} paused={false} />
    </div>
  );
}
