"use client";

// Tamni studio (A03 §5): poster kao LCP, canvas preko njega posle učitavanja, traka grupa (desktop),
// prekidač prikaza, donja traka (rasklapanje, presek, početni pogled, „Svi delovi“) i stanja učitavanja.
// Bez canvasa (greška, bez WebGL-a) rasklapanje menja poster sklopljen ↔ rasklopljen.
// A10: u laku se ispod prekidača biraju boje, klizač preseka stoji iznad donje trake, tura menja
// donju traku titlom, a kiosk dobija svoj prekrivač (natpis, legenda, titl, QR).

import { useId, useRef, type ReactNode } from "react";
import { List, Scan } from "lucide-react";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { GroupsList } from "./groups-list";
import { KioskOverlay } from "./kiosk-overlay";
import { ModeSwitch } from "./mode-switch";
import { PaintSwatches } from "./paint-swatches";
import { SectionSlider, SectionToggle } from "./section-slider";
import { useAuto3d, useAuto3dStore } from "./store";
import { PANEL_ID, STUDIO_ID } from "./ui-bits";
import { TourBar } from "./tour-caption";
import { ViewerIsland, type ModelFiles } from "./viewer-island";
import styles from "./auto3d.module.css";

export function Studio({
  poster,
  posterExploded,
  models,
}: {
  poster: ReactNode;
  posterExploded: ReactNode;
  models: ModelFiles;
}) {
  const store = useAuto3dStore();
  const hostRef = useRef<HTMLElement>(null);
  const hintId = useId();
  const status = useAuto3d((s) => s.status);
  const progress = useAuto3d((s) => s.progress);
  const mode = useAuto3d((s) => s.mode);
  const part = useAuto3d((s) => s.part);
  const group = useAuto3d((s) => s.group);
  const explode = useAuto3d((s) => s.explode);
  const hover = useAuto3d((s) => s.hover);
  const listShown = useAuto3d((s) => s.listOpen && (s.part === null || s.tab === "delovi"));
  const touring = useAuto3d((s) => s.tour.active && !s.kiosk);
  const kiosk = useAuto3d((s) => s.kiosk);
  const canvasOut = status === "nowebgl" || status === "error";

  return (
    <section
      ref={hostRef}
      id={STUDIO_ID}
      className={styles.studio}
      data-auto3d-status={status}
      data-auto3d-mode={mode}
      data-auto3d-part={part ?? ""}
      data-auto3d-group={group ?? ""}
      data-auto3d-hover={hover ?? ""}
      tabIndex={0}
      role="group"
      aria-roledescription={t.sceneRole}
      aria-label={t.sceneLabel}
      aria-describedby={hintId}
    >
      <div className={styles.posterLayer}>
        {poster}
        {status !== "ready" && explode >= 0.5 ? <div className={styles.posterAlt}>{posterExploded}</div> : null}
      </div>
      <ViewerIsland hostRef={hostRef} models={models} />
      <p id={hintId} className="sr-only">
        {t.sceneHint}
      </p>

      <div className={styles.rail}>
        <GroupsList variant="rail" />
      </div>

      {canvasOut ? null : (
        <div className={styles.topBar}>
          <ModeSwitch />
          {mode === "lak" ? <PaintSwatches /> : null}
        </div>
      )}
      {kiosk ? <KioskOverlay /> : null}

      {status === "loading" ? (
        <div className={styles.loading} role="status">
          <span>{t.loading}</span>
          <span className={styles.progress} data-indeterminate={progress === null ? "" : undefined}>
            <span style={{ transform: `scaleX(${progress ?? 0.3})` }} />
          </span>
        </div>
      ) : null}
      {status === "lost" ? (
        <p className={styles.notice} role="status">
          {t.contextLost}
        </p>
      ) : null}
      {status === "nowebgl" ? <p className={styles.notice}>{t.noWebgl}</p> : null}

      {canvasOut || touring ? null : <SectionSlider />}
      {touring ? <TourBar /> : null}
      <div className={styles.toolbar} hidden={touring || undefined}>
        <label className={styles.slider}>
          <span className={styles.sliderLabel}>{t.explodeLabel}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(explode * 100)}
            onChange={(e) => store.dispatch({ type: "explode", p: Number(e.currentTarget.value) / 100 })}
          />
        </label>
        <button type="button" className={styles.toolButton} onClick={() => store.dispatch({ type: "explode", p: explode > 0.5 ? 0 : 1 })}>
          {explode > 0.5 ? t.explodeClose : t.explodeOpen}
        </button>
        {canvasOut ? null : <SectionToggle />}
        {status === "ready" ? (
          <button type="button" className={styles.iconButton} onClick={() => store.dispatch({ type: "home" })}>
            <Scan aria-hidden="true" />
            <span className="sr-only">{t.homeView}</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`${styles.toolButton} ${styles.allParts}`}
          aria-controls={PANEL_ID}
          aria-expanded={listShown}
          onClick={() => store.dispatch({ type: "list", open: !listShown })}
        >
          <List aria-hidden="true" />
          <span className={styles.allPartsLabel}>{t.allParts}</span>
        </button>
      </div>
    </section>
  );
}
