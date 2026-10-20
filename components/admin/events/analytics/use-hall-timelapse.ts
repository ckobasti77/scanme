"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { REDUCED_MOTION_QUERY } from "@/components/admin/frame/use-admin-gsap";
import { TIMELAPSE_TEXT_MS, playerDone, playerReduce, playerT, type PlayerAction } from "@/lib/admin-v2/hall/player";
import type { TimelapsePlayer } from "@/lib/admin-v2/hall/types";

// ADMIN v3 V3 — the player of the Vremeplov on the React side. The 3D scene
// computes the moment from the same player every frame; here the moment is
// sampled four times a second while a replay runs, which is how often the
// numbers, the rank and the slider follow it (plain text, not a frame loop).

/** „The end of the day“ for a parked player, whatever the length of the day turns out to be. */
export const DAY_END = 1e6;

const LIVE: TimelapsePlayer = { mode: "live" };

const watchReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const reducedMotionNow = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;
const noReducedMotion = () => false;

/** false with reduced motion and in the quiet mode: a replay jumps hour by hour and nothing pulses. */
export function useHallMotion(): boolean {
  const [quiet] = useQuietMode();
  const reduced = useSyncExternalStore(watchReducedMotion, reducedMotionNow, noReducedMotion);
  return !quiet && !reduced;
}

export function useHallTimelapse(end: number, motion: boolean) {
  const [player, setPlayer] = useState<TimelapsePlayer>(LIVE);
  /** The sampled moment of a running replay. */
  const [sampled, setSampled] = useState(0);
  const latest = useRef({ player, end, motion });
  useEffect(() => {
    latest.current = { player, end, motion };
  });

  const put = useCallback((next: TimelapsePlayer) => {
    latest.current.player = next;
    setPlayer(next);
    if (next.mode === "playing") setSampled(next.fromT);
    return next;
  }, []);
  /** The player after the action (also returned, for what the caller says about it). */
  const dispatch = useCallback(
    (action: PlayerAction): TimelapsePlayer => put(playerReduce(latest.current.player, action, { now: performance.now(), end: latest.current.end })),
    [put],
  );
  /** A moment of a day whose series may still be on the way (`DAY_END` = its end): it is clamped when shown. */
  const park = useCallback((t: number) => put({ mode: "paused", t }), [put]);

  useEffect(() => {
    if (player.mode !== "playing") return;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const state = latest.current;
      if (playerDone(state.player, now, state.end)) dispatch({ type: "finish" });
      else setSampled(playerT(state.player, now, state.end, state.motion) ?? 0);
    }, TIMELAPSE_TEXT_MS);
    return () => window.clearInterval(timer);
  }, [player, dispatch]);

  const limit = Math.max(0, end);
  /** The shown moment (hours from the start of the first hour); null = the live picture. */
  const t = player.mode === "live" ? null : Math.min(limit, Math.max(0, player.mode === "paused" ? player.t : sampled));
  return { player, t, dispatch, park };
}
