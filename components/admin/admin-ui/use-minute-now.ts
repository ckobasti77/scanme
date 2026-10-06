"use client";

import { useEffect, useState } from "react";

// Admin UX A10 (A0 nalaz 0.6) — the browser time rounded down to the minute,
// renewed at every full minute. Convex queries never read the clock: they
// take this value as `at`, so a result stays the same (and cached) for a minute.

export const minuteFloor = (ms: number) => Math.floor(ms / 60_000) * 60_000;

export function useMinuteNow(): number {
  const [now, setNow] = useState(() => minuteFloor(Date.now()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(minuteFloor(Date.now()));
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}
