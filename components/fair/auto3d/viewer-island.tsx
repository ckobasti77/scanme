"use client";

// Ostrvo pregledača (A03 §1.4): proveri WebGL2 i kvalitet, posle `load` i u idle vremenu dinamički
// učitaj ./viewer (jedini uvoz three-a) i paralelno sa njim GLB (A12), poveži store ↔ pregledač i
// očisti sve pri izlasku.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { fmt } from "@/lib/i18n/format";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { KIOSK_EXPLODE_MS, kioskRotates } from "@/lib/auto3d/kiosk";
import type { Viewport } from "@/lib/auto3d/manifest";
import { paintById } from "@/lib/auto3d/paints";
import { chooseQuality, isSoftwareRenderer, type QualityPlan } from "@/lib/auto3d/quality";
import type { Auto3dState } from "@/lib/auto3d/state";
import { studioLayout } from "@/lib/auto3d/layout";
import { fetchModel } from "./glb-fetch";
import { useAuto3d, useAuto3dStore } from "./store";
import { probeWebGL2 } from "./webgl-probe";
import type { Viewer } from "./viewer";
import styles from "./auto3d.module.css";

const PHONE = "(max-width: 767px)";
const FINE = "(hover: hover) and (pointer: fine)";
const REDUCED = "(prefers-reduced-motion: reduce)";
/** Rasklapanje na kraju ture traje duže (fokalni momenat ture). */
const TOUR_EXPLODE_MS = 2400;

type NavigatorHints = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

function afterLoadIdle(run: () => void): () => void {
  let idle = 0;
  let timer = 0;
  const go = () => {
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 1500 });
    else timer = window.setTimeout(run, 200);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
  return () => {
    window.removeEventListener("load", go);
    if (idle) window.cancelIdleCallback(idle);
    if (timer) window.clearTimeout(timer);
  };
}

function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`;
}

export type ModelFiles = Record<"desktop" | "lite", { url: string; bytes: number }>;

export function ViewerIsland({ hostRef, models }: { hostRef: RefObject<HTMLElement | null>; models: ModelFiles }) {
  const store = useAuto3dStore();
  const slotRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [consented, setConsented] = useState(false);
  const status = useAuto3d((s) => s.status);
  // Save-Data (odluka E16): 3D se učitava tek na dugme; veličina je iz manifesta.
  const saveData = useSyncExternalStore(noop, readSaveData, () => false);
  const consentBytes = useSyncExternalStore(noop, () => (window.innerWidth >= 1024 ? models.desktop.bytes : models.lite.bytes), () => models.lite.bytes);
  // Adrese kao stringovi: novi objekat props-a ne sme da napravi pregledač ponovo.
  const desktopUrl = models.desktop.url;
  const liteUrl = models.lite.url;
  // OrbitControls skida svoj `keydown` sa `canvas.getRootNode()`. Pri uklanjanju ostrva React prvo skida DOM,
  // pa tek onda pušta cleanup iz useEffect-a: tada to nije document i slušalac ostaje (A13). Zato se isti
  // (idempotentan) cleanup pušta i iz useLayoutEffect-a, koji ide pre skidanja DOM-a.
  const teardown = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const ref = teardown;
    return () => ref.current?.();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const slot = slotRef.current;
    if (!host || !slot) return;
    let cancelled = false;
    let viewer: Viewer | null = null;
    let unsubscribe = () => {};
    let stopIdle = () => {};
    let snapshotTimer = 0;
    const fetchAbort = new AbortController();
    const cleanups: Array<() => void> = [];

    const probe = probeWebGL2();
    if (!probe.webgl2) {
      store.dispatch({ type: "status", status: "nowebgl" });
      return;
    }
    const nav = navigator as NavigatorHints;
    const kiosk = store.getState().kiosk;
    const plan: QualityPlan = chooseQuality({
      width: window.innerWidth,
      webgl2: true,
      software: isSoftwareRenderer(probe.renderer),
      cores: nav.hardwareConcurrency || undefined,
      memory: nav.deviceMemory,
      saveData: nav.connection?.saveData === true,
      finePointer: window.matchMedia(FINE).matches,
      kiosk,
      dpr: window.devicePixelRatio || 1,
    });
    const glb = plan.glb;
    if (!glb) {
      store.dispatch({ type: "status", status: "nowebgl" });
      return;
    }
    if (!plan.autoload && !consented) return;

    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("aria-hidden", "true");
    slot.appendChild(canvas);
    host.dataset.auto3dQuality = glb;
    host.dataset.auto3dRenderer = probe.renderer;

    const phoneMq = window.matchMedia(PHONE);
    const reducedMq = window.matchMedia(REDUCED);
    const viewportNow = (): Viewport => (kiosk ? "kiosk" : phoneMq.matches ? "telefon" : "desktop");

    const start = async () => {
      store.dispatch({ type: "status", status: "loading", progress: 0 });
      let lastPct = -1;
      // GLB kreće zajedno sa uvozom modula pregledača (A03 §1.4), oba tek posle `load` (poster je LCP).
      const model = fetchModel(
        glb === "desktop" ? desktopUrl : liteUrl,
        (loaded, total) => {
          const pct = total ? Math.floor((loaded / total) * 100) : null;
          if (cancelled || pct === lastPct) return;
          lastPct = pct ?? -1;
          store.dispatch({ type: "status", status: "loading", progress: pct === null ? null : pct / 100 });
        },
        fetchAbort.signal,
      );
      // Greška preuzimanja se javlja iz viewer.load() (status „error“ i „Pokušaj ponovo“).
      model.catch(() => {});
      try {
        const mod = await import("./viewer");
        if (cancelled) return;
        viewer = await mod.createViewer({
          canvas,
          host,
          plan: { ...plan, glb },
          model,
          reducedMotion: reducedMq.matches,
          touchPanY: viewportNow() === "telefon",
          events: {
            ready: () => store.dispatch({ type: "status", status: "ready", progress: 1 }),
            hover: (part) => store.dispatch({ type: "hover", part }),
            pick: (part, instance) => store.dispatch({ type: "select", part, instance, origin: "canvas" }),
            // Dodir ili prevlačenje po sceni prekida turu (u kiosku petlju gasi sat kioska).
            interact: () => {
              if (store.getState().tour.active && !store.getState().kiosk) store.dispatch({ type: "tour", active: false });
            },
            error: (kind) => store.dispatch({ type: "status", status: kind === "webgl" ? "nowebgl" : "error" }),
            contextLost: () => store.dispatch({ type: "status", status: "lost" }),
            contextRestored: () => store.dispatch({ type: "status", status: "ready" }),
          },
        });
      } catch {
        fetchAbort.abort();
        if (!cancelled) store.dispatch({ type: "status", status: "nowebgl" });
        return;
      }
      if (cancelled) {
        viewer.dispose();
        return;
      }
      const v = viewer;

      const layout = () => {
        const r = host.getBoundingClientRect();
        v.setLayout(studioLayout(Math.round(r.width), Math.round(r.height), viewportNow(), window.innerWidth));
      };
      layout();
      let resizeRaf = 0;
      const ro = new ResizeObserver(() => {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          layout();
        });
      });
      ro.observe(host);
      phoneMq.addEventListener("change", layout);
      const onReduced = () => v.setReducedMotion(reducedMq.matches);
      reducedMq.addEventListener("change", onReduced);
      cleanups.push(() => {
        ro.disconnect();
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        phoneMq.removeEventListener("change", layout);
        reducedMq.removeEventListener("change", onReduced);
      });

      // Most store → pregledač: samo ono što se promenilo.
      let prev: Auto3dState | null = null;
      let rotating = false;
      const explodeMs = (s: Auto3dState): number | undefined => {
        if (s.kiosk && s.kioskAuto && (s.kioskPhase === "rasklapanje" || s.kioskPhase === "sklapanje")) return KIOSK_EXPLODE_MS;
        if (s.tour.active) return TOUR_EXPLODE_MS;
        return undefined;
      };
      const apply = () => {
        const s = store.getState();
        if (!prev || s.mode !== prev.mode) v.setMode(s.mode);
        if (!prev || s.group !== prev.group) v.setFilter(s.group);
        if (!prev || s.explode !== prev.explode) {
          v.setExplode(s.explode, { animate: prev !== null && Math.abs(s.explode - prev.explode) > 0.25, ms: explodeMs(s) });
        }
        if (!prev || s.section !== prev.section) v.setSection(s.section);
        if (!prev || s.paint !== prev.paint) v.setPaint(paintById(s.paint));
        if (!prev || s.part !== prev.part || s.instance !== prev.instance) v.select(s.part, { instance: s.instance, frame: s.origin !== "tour" });
        if (!prev || s.hover !== prev.hover) v.hover(s.hover);
        // Kiosk: auto se sam okreće posle ture (pregledač to ne radi uz reduced motion). Okretanje se gasi
        // pre `frameStart()`, da novi krug ture krene iz kanonskog kadra, a ne iz zaostalog ugla (A13).
        const rotate = s.kiosk && s.kioskAuto && kioskRotates(s.kioskPhase, false);
        if (rotate !== rotating) {
          rotating = rotate;
          v.setAutoRotate(rotate);
        }
        if (prev && s.view !== prev.view) v.frameStart();
        prev = s;
      };
      apply();
      unsubscribe = store.subscribe(apply);

      // Tastatura nad studijem (A03 §3.5); polja i dugmad u studiju zadržavaju svoje tastere.
      const onKey = (e: KeyboardEvent) => {
        if (e.target !== host || e.altKey || e.ctrlKey || e.metaKey) return;
        const map: Record<string, [number, number, number]> = {
          ArrowLeft: [-15, 0, 1],
          ArrowRight: [15, 0, 1],
          ArrowUp: [0, 10, 1],
          ArrowDown: [0, -10, 1],
          "+": [0, 0, 0.85],
          "=": [0, 0, 0.85],
          "-": [0, 0, 1.18],
        };
        if (e.key === "Home" || e.key === "0") {
          e.preventDefault();
          if (store.getState().tour.active && !store.getState().kiosk) store.dispatch({ type: "tour", active: false });
          v.frameStart();
          return;
        }
        const step = map[e.key];
        if (!step) return;
        e.preventDefault();
        if (store.getState().tour.active && !store.getState().kiosk) store.dispatch({ type: "tour", active: false });
        v.orbitBy(step[0], step[1], step[2]);
      };
      host.addEventListener("keydown", onKey);
      cleanups.push(() => host.removeEventListener("keydown", onKey));

      snapshotTimer = window.setInterval(() => {
        const s = v.snapshot();
        host.dataset.auto3dFrames = String(s.frames);
        host.dataset.auto3dCalls = String(s.calls);
        host.dataset.auto3dTriangles = String(s.triangles);
        host.dataset.auto3dDpr = String(s.dpr);
        host.dataset.auto3dExplode = String(s.explode);
        host.dataset.auto3dPickMs = String(s.pickMs);
        host.dataset.auto3dGeometries = String(s.geometries);
        host.dataset.auto3dTextures = String(s.textures);
      }, 250);

      try {
        await v.load();
      } catch {
        // Status „error“ je već javljen iz pregledača.
      }
    };

    stopIdle = afterLoadIdle(() => {
      if (!cancelled) void start();
    });

    const cleanup = () => {
      cancelled = true;
      stopIdle();
      fetchAbort.abort();
      unsubscribe();
      for (const c of cleanups) c();
      if (snapshotTimer) window.clearInterval(snapshotTimer);
      viewer?.dispose();
      viewer = null;
      canvas.remove();
    };
    teardown.current = cleanup;
    return cleanup;
  }, [store, hostRef, desktopUrl, liteUrl, attempt, consented]);

  return (
    <>
      <div ref={slotRef} className={styles.canvasLayer} />
      {saveData && !consented && status === "poster" ? (
        <div className={styles.notice}>
          <button type="button" className={styles.noticeButton} onClick={() => setConsented(true)}>
            {fmt(t.loadButton, { size: formatMb(consentBytes) })}
          </button>
        </div>
      ) : null}
      {status === "error" ? (
        <div className={styles.notice}>
          <p>{t.errorLoad}</p>
          <button
            type="button"
            className={styles.noticeButton}
            onClick={() => {
              store.dispatch({ type: "status", status: "poster", progress: null });
              setAttempt((n) => n + 1);
            }}
          >
            {t.retry}
          </button>
        </div>
      ) : null}
    </>
  );
}

function noop() {
  return () => {};
}

function readSaveData(): boolean {
  return (navigator as NavigatorHints).connection?.saveData === true;
}
