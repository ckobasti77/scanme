"use client";

// Sat kioska (A10). Pravila su čista, u lib/auto3d/kiosk.ts; ovde je jedini interval (250 ms) i
// slušaoci dodira, tastera, točkića i pokazivača na prozoru. Petlja kreće kad je 3D spreman. Prvi
// dodir (u fazi „capture“, pre klika na deo) gasi petlju; posle 45 s bez dodira store dobija
// `kioskReset`. Kursor se krije atributom na korenu kioska. Pri izlasku se sve odjavljuje.

import { useEffect, type RefObject } from "react";
import { kioskInput, kioskMove, kioskStart, kioskTick, KIOSK_TICK_MS, type KioskClock, type KioskCommand, type KioskResult } from "@/lib/auto3d/kiosk";
import type { Auto3dStore } from "./store";

const REDUCED = "(prefers-reduced-motion: reduce)";

export function useKioskRunner(store: Auto3dStore, rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!store.getState().kiosk) return;
    const root = rootRef.current;
    const reducedMq = window.matchMedia(REDUCED);
    let clock: KioskClock | null = null;
    let interval = 0;

    const exec = (c: KioskCommand) => {
      switch (c.type) {
        case "reset":
          store.dispatch({ type: "kioskReset" });
          break;
        case "touch":
          store.dispatch({ type: "kioskTouch" });
          break;
        case "phase":
          store.dispatch({ type: "kioskPhase", phase: c.id });
          break;
        case "tourStep":
          store.dispatch({ type: "tourStep", step: c.step });
          break;
        case "cursor":
          if (root) root.dataset.cursor = c.hidden ? "hidden" : "";
          break;
      }
    };
    const run = (r: KioskResult) => {
      clock = r.clock;
      for (const c of r.commands) exec(c);
    };
    const tick = () => {
      if (clock) run(kioskTick(clock, performance.now(), reducedMq.matches));
    };
    const start = () => {
      if (clock) return;
      clock = kioskStart(performance.now(), store.getState().kioskAuto);
      interval = window.setInterval(tick, KIOSK_TICK_MS);
      tick();
    };
    const onInput = () => {
      if (clock) run(kioskInput(clock, performance.now()));
    };
    const onMove = (e: PointerEvent) => {
      if (clock && e.pointerType !== "touch") run(kioskMove(clock, performance.now()));
    };

    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", onInput, opts);
    window.addEventListener("keydown", onInput, opts);
    window.addEventListener("wheel", onInput, opts);
    window.addEventListener("pointermove", onMove, opts);
    const unsubscribe = store.subscribe(() => {
      if (!clock && store.getState().status === "ready") start();
    });
    if (store.getState().status === "ready") start();

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", onInput, opts);
      window.removeEventListener("keydown", onInput, opts);
      window.removeEventListener("wheel", onInput, opts);
      window.removeEventListener("pointermove", onMove, opts);
      if (root) root.dataset.cursor = "";
    };
  }, [store, rootRef]);
}
