"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { demoHeatAt, demoHeatOrder } from "@/lib/fair-map/demo-heat";

export function useDemoHeat(keys: readonly string[], enabled: boolean) {
  const [levels, setLevels] = useState<ReadonlyMap<string, number>>(() => new Map());
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!enabled || reduced || !keys.length) return;
    const order = demoHeatOrder(keys);
    let elapsed = 0;
    let previous = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = performance.now();
      if (!document.hidden) {
        elapsed += now - previous;
        setLevels(demoHeatAt(order, elapsed));
      }
      previous = now;
      timer = setTimeout(tick, 120);
    };
    const resume = () => { previous = performance.now(); };
    document.addEventListener("visibilitychange", resume);
    timer = setTimeout(tick, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [enabled, keys, reduced]);
  return enabled ? levels : null;
}
