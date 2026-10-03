"use client";

// The ticking countdown leaf. Hydration-mismatch handling: the clock is a
// useSyncExternalStore whose SERVER snapshot is null, so the server render and
// the hydration render both show the fixed-width "––" placeholder — identical
// markup, no mismatch, no layout shift (tabular numerals + min-width boxes).
// The store's interval then drives one re-render per second; crossing zero
// live honours completedBehavior without a reload.

import { useSyncExternalStore } from "react";
import type { CountdownProps } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

function subscribeToTick(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
// Whole-second snapshot: stable within a second, so React sees a fresh value
// exactly once per interval fire.
function nowSecond() {
  return Math.floor(Date.now() / 1000);
}
function serverSnapshot(): number | null {
  return null;
}

type Labels = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  done: string;
  aria: string;
};

export function CountdownClient({
  target,
  units,
  countdownStyle,
  completedBehavior,
  completedMessage,
  labels,
}: {
  target: number;
  units: CountdownProps["units"];
  countdownStyle: CountdownProps["style"];
  completedBehavior: CountdownProps["completedBehavior"];
  completedMessage?: string;
  labels: Labels;
}) {
  const nowSec = useSyncExternalStore<number | null>(
    subscribeToTick,
    nowSecond,
    serverSnapshot,
  );

  const remainingMs = nowSec === null ? null : Math.max(0, target - nowSec * 1000);

  if (remainingMs === 0) {
    if (completedBehavior === "hide") return null;
    return (
      <p className={styles.countdownDone}>{completedMessage || labels.done}</p>
    );
  }

  // Disabled units cascade into the next enabled one, so the total stays true
  // (e.g. days off ⇒ hours can read 52).
  let rest = remainingMs === null ? null : Math.floor(remainingMs / 1000);
  const segments: Array<{ key: string; value: string; label: string }> = [];
  const takeUnit = (key: string, secondsPer: number, label: string, pad: boolean) => {
    if (rest === null) {
      segments.push({ key, value: "––", label });
      return;
    }
    const value = Math.floor(rest / secondsPer);
    rest -= value * secondsPer;
    segments.push({
      key,
      value: pad ? String(value).padStart(2, "0") : String(value),
      label,
    });
  };
  if (units.days) takeUnit("days", 86_400, labels.days, false);
  if (units.hours) takeUnit("hours", 3_600, labels.hours, true);
  if (units.minutes) takeUnit("minutes", 60, labels.minutes, true);
  if (units.seconds) takeUnit("seconds", 1, labels.seconds, true);
  if (segments.length === 0) return null;

  return (
    <div
      className={styles.countdown}
      data-countdown-style={countdownStyle}
      role="timer"
      aria-label={labels.aria}
    >
      {segments.map((segment) => (
        <div key={segment.key} className={styles.countdownUnit}>
          <span className={styles.countdownValue}>{segment.value}</span>
          <span className={styles.countdownLabel}>{segment.label}</span>
        </div>
      ))}
    </div>
  );
}
