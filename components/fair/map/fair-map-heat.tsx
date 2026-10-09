"use client";

import { Flame } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FAIR_HEAT_PERIODS, FAIR_HEAT_REFRESH_MS, fairHeatGradientCss, fairHeatMinutesAgo, type FairHeatPeriod } from "@/lib/fair-heat";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import styles from "./fair-event-map.module.css";

// SAJAM SUPER Korak 3 — „Gde je gužva“ on the public map: the switch (off by
// default, remembered for this visit), the heat read (the cached
// /api/fair/heat route, at most once a minute while the switch is on and the
// page is visible; no live subscription) and the legend. The map colours come
// from fair-map-canvas.tsx; there are never numbers on the public map.

type HeatValue = {
  at: number;
  today: { enough: boolean; levels: Array<{ locationId: string; level: number }> };
  hour: { enough: boolean; levels: Array<{ locationId: string; level: number }> };
};

export type FairMapHeatView = { enough: boolean; levels: ReadonlyMap<string, number>; at: number };

const PREFERENCE_KEY = "scanme:fair-map-heat";
const listeners = new Set<() => void>();

function readPreference(): string {
  try {
    return window.sessionStorage.getItem(PREFERENCE_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribePreference(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function parsePreference(raw: string): { on: boolean; period: FairHeatPeriod } {
  const [on, period] = raw.split(":");
  return { on: on === "on", period: (FAIR_HEAT_PERIODS as readonly string[]).includes(period) ? (period as FairHeatPeriod) : "today" };
}

function writePreference(value: { on: boolean; period: FairHeatPeriod }) {
  try {
    window.sessionStorage.setItem(PREFERENCE_KEY, `${value.on ? "on" : "off"}:${value.period}`);
  } catch {
    // Private mode without storage: the switch still works for this page.
  }
  listeners.forEach((listener) => listener());
}

/** The switch and the period, kept for this visit (sessionStorage); off on the server and the first paint. */
export function useFairMapHeatPreference() {
  const raw = useSyncExternalStore(subscribePreference, readPreference, () => "");
  const [local, setLocal] = useState<{ on: boolean; period: FairHeatPeriod } | null>(null);
  const preference = local ?? parsePreference(raw);
  const update = useCallback((next: { on: boolean; period: FairHeatPeriod }) => {
    setLocal(next);
    writePreference(next);
  }, []);
  return { ...preference, update };
}

type HeatState = { value: HeatValue | null; failed: boolean };

/** The heat read while `on`: now, then every minute while the page is visible. */
export function useFairMapHeatData(eventSlug: string, on: boolean) {
  const [state, setState] = useState<HeatState>({ value: null, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!on) return;
    let controller: AbortController | null = null;
    let lastAt = 0;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      lastAt = Date.now();
      fetch(`/api/fair/heat/${encodeURIComponent(eventSlug)}`, { signal: current.signal })
        .then(async (response) => {
          const body = (await response.json()) as { ok: boolean; value?: HeatValue };
          if (!response.ok || !body.ok || !body.value) throw new Error("heat");
          setState({ value: body.value, failed: false });
        })
        .catch(() => {
          if (!current.signal.aborted) setState((old) => ({ value: old.value, failed: true }));
        });
    };
    load();
    const timer = window.setInterval(load, FAIR_HEAT_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAt >= FAIR_HEAT_REFRESH_MS) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [eventSlug, on, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}

/** The levels of one period as a map for the canvas, or null before the first answer. */
export function fairMapHeatView(value: HeatValue | null, period: FairHeatPeriod): FairMapHeatView | null {
  if (!value) return null;
  const result = value[period];
  return { enough: result.enough, levels: new Map(result.levels.map((row) => [row.locationId, row.level])), at: value.at };
}

/** A clock for „pre X min“ that ticks every 30 s while mounted. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function FairMapHeatSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={styles.heatSwitch} onClick={() => onChange(!on)}>
      <Flame aria-hidden="true" className={styles.heatFlame} />
      <span>{dict.heatToggle}</span>
      <span className={styles.heatTrack} aria-hidden="true">
        <span className={styles.heatKnob} />
      </span>
    </button>
  );
}

export function FairMapHeatLegend({
  period,
  onPeriod,
  view,
  failed,
  onRetry,
}: {
  period: FairHeatPeriod;
  onPeriod: (period: FairHeatPeriod) => void;
  view: FairMapHeatView | null;
  failed: boolean;
  onRetry: () => void;
}) {
  const now = useMinuteClock();
  const gradient = useMemo(() => fairHeatGradientCss(), []);
  const minutes = view ? fairHeatMinutesAgo(view.at, now) : null;
  const updated = minutes === null ? null : minutes < 1 ? dict.heatUpdatedNow : fmt(dict.heatUpdatedAgo, { minutes });
  return (
    <section className={styles.heatLegend} aria-label={dict.heatLegendLabel}>
      <div className={styles.heatPeriods} role="group" aria-label={dict.heatPeriodLabel}>
        {FAIR_HEAT_PERIODS.map((key) => (
          <button key={key} type="button" aria-pressed={period === key} onClick={() => onPeriod(key)}>
            {key === "today" ? dict.heatPeriodToday : dict.heatPeriodHour}
          </button>
        ))}
      </div>
      <div className={styles.heatBody} aria-live="polite">
        {view === null ? (
          failed ? (
            <p className={styles.heatNote}>
              {dict.heatError}{" "}
              <button type="button" className={styles.heatRetry} onClick={onRetry}>
                {dict.heatRetry}
              </button>
            </p>
          ) : (
            <p className={styles.heatNote}>{dict.heatLoading}</p>
          )
        ) : view.enough ? (
          <div className={styles.heatScale}>
            <span>{dict.heatLegendLess}</span>
            <span className={styles.heatBar} style={{ backgroundImage: gradient }} aria-hidden="true" />
            <span>{dict.heatLegendMore}</span>
          </div>
        ) : (
          <p className={styles.heatNote}>
            <strong>{dict.heatEmpty}</strong>
            <span className={styles.heatHint}>{dict.heatEmptyHint}</span>
          </p>
        )}
        {updated ? <p className={styles.heatUpdated}>{updated}</p> : null}
      </div>
    </section>
  );
}
