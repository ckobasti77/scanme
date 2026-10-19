"use client";

// Sat vođene ture na stranici (A10). Jedan tajmer: kad korak počne, zakaže se kraj koraka; pauza
// pamti ostatak, nastavak ga zakazuje ponovo, a „Dalje“ ili prekid samo promene stanje u store-u.
// Tura teče tek kad je 3D spreman; bez 3D prikaza (greška, bez WebGL-a) se gasi. U kiosku turu vodi
// sat kioska (kiosk-runner.ts), pa ovaj sat tamo miruje.

import { useEffect } from "react";
import { isLastStep, TOUR_STEPS } from "@/lib/auto3d/tour";
import type { Auto3dStore } from "./store";

export function useTourRunner(store: Auto3dStore) {
  useEffect(() => {
    let timer = 0;
    let step = -1;
    let paused = false;
    let startedAt = 0;
    let remaining = 0;

    const clear = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    };
    const fire = () => {
      timer = 0;
      const s = store.getState();
      if (!s.tour.active) return;
      store.dispatch(isLastStep(s.tour.step) ? { type: "tourEnd" } : { type: "tourStep", step: s.tour.step + 1 });
    };
    const arm = (ms: number) => {
      clear();
      startedAt = performance.now();
      remaining = ms;
      timer = window.setTimeout(fire, ms);
    };

    const sync = () => {
      const s = store.getState();
      if (s.tour.active && (s.status === "nowebgl" || s.status === "error")) {
        store.dispatch({ type: "tour", active: false });
        return;
      }
      if (!s.tour.active || s.kiosk || s.status !== "ready") {
        clear();
        step = -1;
        return;
      }
      if (s.tour.step !== step) {
        step = s.tour.step;
        paused = s.tour.paused;
        const ms = (TOUR_STEPS[step]?.seconds ?? 0) * 1000;
        if (paused) {
          clear();
          remaining = ms;
        } else arm(ms);
        return;
      }
      if (s.tour.paused !== paused) {
        paused = s.tour.paused;
        if (paused) {
          remaining = Math.max(0, remaining - (performance.now() - startedAt));
          clear();
        } else arm(remaining);
      }
    };

    sync();
    const unsubscribe = store.subscribe(sync);
    return () => {
      unsubscribe();
      clear();
    };
  }, [store]);
}
