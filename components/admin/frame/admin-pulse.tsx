"use client";

import { useEffect, useRef } from "react";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { ADMIN_AMBIENT_FPS } from "@/lib/admin-v2/motion";
import { PULSE_HEIGHT, beatPoints, beatShape, beatX, demoBeats, pulseActive, pulseEnergy, pulseStore, visibleBeats } from "@/lib/admin-v2/pulse";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { REDUCED_MOTION_QUERY } from "./use-admin-gsap";

// ADMIN v3 V1 — the Pulse of the system (ZADATAK-V3 §2; plan §3): a thin EKG
// line on the bottom edge of the navbar. Canvas 2D, cheap: it is redrawn (at
// most 30 times a second) only while a beat is on the line, and stops on a
// hidden tab. With reduced motion and in the quiet mode the line is flat and
// stands. It also writes `--admin-energy` (how lively the last minute was) on
// the frame, at most once a second: the live edge of the screen reads it.
// The canvas is decoration; the same numbers are in the HUD and on the
// Dashboard, and the sentence beside it says so to assistive technology.

const FRAME_MS = 1000 / ADMIN_AMBIENT_FPS;

export function AdminPulse() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [quiet] = useQuietMode();

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    const root = canvas?.closest<HTMLElement>(".admin-v1");
    if (!canvas || !context || !root) return;
    const still = quiet || window.matchMedia(REDUCED_MOTION_QUERY).matches;
    // Dev: `?puls=demo` freezes one beat of every kind on the line, `?energija=<0–1>` holds the live edge.
    const params = process.env.NODE_ENV === "production" ? null : new URLSearchParams(window.location.search);
    const frozenAt = params?.get("puls") === "demo" ? Date.now() : null;
    const heldEnergy = params?.has("energija") ? Math.min(1, Math.max(0, Number(params.get("energija")) || 0)) : null;
    if (frozenAt !== null) pulseStore.replace(demoBeats(frozenAt));

    let width = 0;
    let ratio = 1;
    let frame = 0;
    let drawnAt = -Infinity;
    let energyAt = -Infinity;
    let frames = 0;
    const colors = new Map<string, string>();
    const color = (token: string) => {
      let value = colors.get(token);
      if (value === undefined) {
        value = getComputedStyle(root).getPropertyValue(token).trim() || "#6fc05d";
        colors.set(token, value);
      }
      return value;
    };

    const writeEnergy = (now: number, force = false) => {
      const stamp = performance.now();
      if (!force && stamp - energyAt < 1000) return;
      energyAt = stamp;
      const energy = still ? 0 : heldEnergy ?? pulseEnergy(pulseStore.beats(), now);
      root.style.setProperty("--admin-energy", energy.toFixed(2));
    };

    const paint = (now: number) => {
      frames += 1;
      if (process.env.NODE_ENV !== "production") canvas.dataset.pulseFrames = String(frames);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, PULSE_HEIGHT);
      const base = PULSE_HEIGHT - 0.5;
      context.lineWidth = 1;
      context.strokeStyle = color("--admin-border");
      context.beginPath();
      context.moveTo(0, base);
      context.lineTo(width, base);
      context.stroke();
      if (still) return;
      const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      context.lineWidth = 1.5;
      context.lineJoin = "round";
      for (const beat of visibleBeats(pulseStore.beats(), now)) {
        const shape = beatShape(beat.kind, beat.weight, theme);
        const x = beatX(width, now, beat.at);
        context.strokeStyle = color(shape.color);
        context.shadowColor = shape.glow ? color(shape.color) : "transparent";
        context.shadowBlur = shape.glow ? 6 : 0;
        context.beginPath();
        beatPoints(shape.amplitude, shape.spikes).forEach(([dx, height], index) => {
          if (index === 0) context.moveTo(x + dx, base - height);
          else context.lineTo(x + dx, base - height);
        });
        context.stroke();
      }
      context.shadowBlur = 0;
    };

    const loop = (stamp: number) => {
      frame = 0;
      // A hidden tab draws nothing; `visibilitychange` starts the line again.
      if (document.visibilityState !== "visible") return;
      const now = frozenAt ?? Date.now();
      const active = !still && frozenAt === null && pulseActive(pulseStore.beats(), now);
      if (stamp - drawnAt >= FRAME_MS - 1 || !active) {
        drawnAt = stamp;
        paint(now);
        writeEnergy(now, !active);
      }
      // The loop runs only while a beat is on the line; a calm line is drawn once and stands.
      if (active) frame = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const onTheme = () => {
      colors.clear();
      kick();
    };

    const resize = new ResizeObserver(([entry]) => {
      width = Math.floor(entry.contentRect.width);
      ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.round(PULSE_HEIGHT * ratio);
      kick();
    });
    resize.observe(canvas);
    const unsubscribe = pulseStore.subscribe(kick);
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("scanme-theme-change", onTheme);
    return () => {
      resize.disconnect();
      unsubscribe();
      document.removeEventListener("visibilitychange", kick);
      window.removeEventListener("scanme-theme-change", onTheme);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--admin-energy");
    };
  }, [quiet]);

  return (
    <>
      <canvas ref={ref} aria-hidden="true" data-admin-pulse="" className="admin-pulse" />
      <span className="sr-only">{adminUiSr.pulse.description}</span>
    </>
  );
}
