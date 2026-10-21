"use client";

import { useRef } from "react";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { gsap, useAdminGsap } from "@/components/admin/frame/use-admin-gsap";
import type { ComboView } from "@/lib/admin-v2/game/types";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { cn } from "@/lib/utils";

// ADMIN v3 V4 — the combo counter beside the boss (plan §6.3). `combo` comes
// from the server times of the journal; the ring empties over the time that is
// left of the 120 s window (ComboView.expiresAt): one GSAP tween of a finite
// length per action, linear, on `strokeDashoffset` of a 32 px ring. Under
// reduced motion and in the quiet mode the ring stands at its starting share.

/** The window of a chain (ms); the same value as lib/admin-v2/game/combo.ts, kept here so the two files stay independent. */
const COMBO_WINDOW_MS = 120_000;
const RADIUS = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const share = (combo: ComboView, at: number) => Math.min(1, Math.max(0, (combo.expiresAt - at) / COMBO_WINDOW_MS));
/** `strokeDashoffset` of a ring that shows this share (1: full, 0: empty). */
const offset = (value: number) => CIRCUMFERENCE * (1 - value);

export function ComboMeter({ combo, now, className }: { combo: ComboView | null; now: number; className?: string }) {
  const [quiet] = useQuietMode();
  const ring = useRef<SVGCircleElement>(null);
  /** The meter is drawn from the second action of a chain. */
  const shown = combo !== null && combo.chain >= 2;
  useAdminGsap(
    ({ reduced }) => {
      const circle = ring.current;
      if (!circle || !combo || !shown || reduced || quiet) return;
      // `now` is the clock of the game at this render (a dev preview runs on its own TEST clock, not on the browser's).
      const left = combo.expiresAt - now;
      if (left <= 0) return;
      gsap.fromTo(circle, { strokeDashoffset: offset(share(combo, now)) }, { strokeDashoffset: CIRCUMFERENCE, duration: left / 1000, ease: "none" });
    },
    // Armed again with every action of the chain, and when the meter first appears (its ring exists only then).
    [combo?.lastAt, shown, quiet],
  );
  if (!combo || !shown) return null;
  const multiplier = fmt(d.combo.multiplier, { n: combo.multiplier });
  const color = combo.multiplier >= 2 ? "var(--admin-energy-ink)" : "var(--admin-text-muted)";
  return (
    // Not a live region: the boss line and the ceremony already speak when something happens; this is read on demand.
    <div data-game-combo={combo.multiplier} title={d.combo.help} className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <span className="sr-only">{fmt(d.combo.aria, { n: combo.multiplier, chain: combo.chain })}</span>
      <span aria-hidden="true" className="relative inline-grid size-8 flex-none place-items-center">
        <svg viewBox="0 0 36 36" className="size-full -rotate-90">
          <circle cx="18" cy="18" r={RADIUS} fill="none" stroke="var(--admin-border)" strokeWidth="3.5" />
          <circle ref={ring} cx="18" cy="18" r={RADIUS} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`} strokeDashoffset={offset(share(combo, now))} />
        </svg>
        <span className="absolute text-[0.6875rem] leading-none font-bold tabular-nums">{multiplier}</span>
      </span>
      <span className="grid min-w-0">
        <span className="text-[0.67rem] font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{d.combo.label}</span>
        <span className="text-xs text-[var(--admin-text-muted)] tabular-nums">{combo.toNext !== null ? fmt(d.combo.toNext, { count: combo.toNext, n: combo.multiplier + 1 }) : d.combo.top}</span>
      </span>
    </div>
  );
}
