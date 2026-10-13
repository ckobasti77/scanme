"use client";

import { Pause, Play } from "lucide-react";
import type { KeyboardEvent } from "react";
import { adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { ChartSegmented } from "@/components/admin/events/analytics/chart-kit";
import { seekByKey, seekByPosition } from "@/lib/admin-v2/hall/player";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v3 V3 — the controls of the Vremeplov (ZADATAK-V3 §3.2) under the hall
// heat map: the fair day, the clock of the shown moment, „Premotaj dan“ /
// „Pauza“, „Uživo“ and a slider over the hours of the day. Presentational: the
// player state, the clock and the hours come in as props; every moment that
// leaves is a whole hour or the end of the day (`seekByPosition`, `seekByKey`).
// The parent is an `@container`; nothing here moves on its own.

const v = adminEventsSr.analytics.v2.timelapse;

export type TimelapseControlsProps = {
  /** The fair days that have started, in order. */
  days: ReadonlyArray<{ dateKey: string; label: string }>;
  /** The chosen day; null when there is none yet. */
  dateKey: string | null;
  onDay: (dateKey: string) => void;
  /** Belgrade hours of the chosen day's series, e.g. [8, 9, …, 20]; [] while it loads or when the day has none. */
  hours: readonly number[];
  /** Where the series ends, in hours from its first hour (0 … hours.length; a fraction for the open day). */
  end: number;
  /** The shown moment, 0 … end (in the live view it equals `end`). */
  t: number;
  /** "14:20": the clock of the shown moment ("" when there is no series). */
  clock: string;
  mode: "live" | "paused" | "playing";
  /** A moment of the day (already a whole hour or `end`). */
  onSeek: (t: number) => void;
  /** „Premotaj dan“ / „Pauza“. */
  onToggle: () => void;
  onLive: () => void;
  status: "ready" | "loading" | "error" | "empty" | "none";
  onRetry: () => void;
  /** Read by a screen reader (set by the lead on a pause and on a move of the slider). */
  announcement: string;
};

// The native range draws only the thumb; the track is drawn beneath it. The thumb is 20 px and its centre
// travels from 10 px to width - 10 px, so the drawn track is inset by the same 10 px.
const THUMB = 20;
const sliderClass = cn(
  "absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none",
  "[&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:mt-3 [&::-webkit-slider-thumb]:box-border [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-[var(--admin-nav-line)] [&::-webkit-slider-thumb]:bg-[var(--admin-surface-strong)]",
  "[&::-moz-range-track]:h-11 [&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:box-border [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-[var(--admin-nav-line)] [&::-moz-range-thumb]:bg-[var(--admin-surface-strong)]",
);

/** The share of the track a moment sits at (0 … 1). */
const share = (t: number, end: number) => (end > 0 ? Number(Math.min(1, Math.max(0, t / end)).toFixed(4)) : 0);

export function TimelapseControls({ days, dateKey, onDay, hours, end, t, clock, mode, onSeek, onToggle, onLive, status, onRetry, announcement }: TimelapseControlsProps) {
  const ready = status === "ready" && end > 0;
  const none = status === "none";
  const ticks = end > 0 ? hours.map((hour, index) => ({ hour, index })).filter(({ index }) => index < end) : [];

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (ready) onToggle();
      return;
    }
    const next = seekByKey(event.key, t, end);
    if (next === null) return;
    event.preventDefault();
    onSeek(next);
  };

  return (
    <div role="group" aria-label={v.title} data-timelapse="" data-timelapse-mode={mode} className="grid min-w-0 gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 @2xl:flex-nowrap">
        {days.length > 0 ? (
          <div className="min-w-0 @2xl:order-1">
            <ChartSegmented label={v.days} value={dateKey ?? ""} onChange={onDay} options={days.map((day) => ({ value: day.dateKey, label: day.label }))} />
          </div>
        ) : null}
        {none ? null : (
          <>
            <div className="flex min-w-0 flex-none items-baseline gap-2.5 @2xl:order-2 @2xl:ml-auto">
              <p data-timelapse-clock="" className="min-w-[5ch] min-h-9 text-3xl leading-9 font-semibold tracking-[-0.02em] tabular-nums">
                <span key={Math.floor(t)} className="admin-hall-tick">{clock}</span>
              </p>
              {mode === "live" ? (
                <span data-timelapse-live="" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--admin-text-muted)]">
                  <span aria-hidden="true" className="size-2 flex-none rounded-full bg-[var(--admin-success)]" />
                  {v.live}
                </span>
              ) : null}
            </div>
            <div className="flex w-full gap-2 @2xl:order-3 @2xl:w-auto">
              <button
                type="button"
                data-timelapse-action="toggle"
                disabled={!ready}
                onClick={onToggle}
                className={cn(adminPrimaryButtonClass, "min-w-[9.5rem] flex-1 lg:min-h-9 @2xl:flex-none")}
              >
                {mode === "playing" ? <Pause aria-hidden="true" className="size-4 flex-none" /> : <Play aria-hidden="true" className="size-4 flex-none" />}
                {mode === "playing" ? v.pause : v.play}
              </button>
              <button
                type="button"
                data-timelapse-action="live"
                aria-pressed={mode === "live"}
                onClick={onLive}
                className={cn(adminSecondaryButtonClass, "flex-1 lg:min-h-9 @2xl:flex-none", mode === "live" && "border-[var(--admin-text)]")}
              >
                {v.live}
              </button>
            </div>
          </>
        )}
      </div>

      {none ? null : (
        <div className="grid min-w-0 gap-0.5">
          <div className="relative h-11 rounded-lg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--admin-focus)]">
            <div aria-hidden="true" className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[var(--admin-border)]" style={{ insetInline: THUMB / 2 }}>
              <div data-timelapse-fill="" className="absolute inset-0 origin-left rounded-full bg-[var(--admin-nav-line)]" style={{ transform: `scaleX(${share(t, end)})` }} />
              {ticks.map(({ hour, index }) => (
                <span key={hour} data-timelapse-tick={hour} className="absolute top-1/2 -mt-1 h-2 w-px bg-[var(--admin-text-muted)] opacity-60" style={{ left: `${Number((share(index, end) * 100).toFixed(2))}%` }} />
              ))}
            </div>
            <input
              type="range"
              data-timelapse-slider=""
              min={0}
              max={end}
              step="any"
              value={t}
              disabled={!ready}
              aria-label={v.slider}
              aria-valuetext={clock || undefined}
              onChange={(event) => onSeek(seekByPosition(Number(event.target.value), end))}
              onKeyDown={onKeyDown}
              className={sliderClass}
            />
          </div>
          <div aria-hidden="true" className="relative h-4" style={{ marginInline: THUMB / 2 }}>
            {ticks.map(({ hour, index }) => (index % 2 === 0 ? (
              <span key={hour} data-timelapse-tick-label={hour} className="absolute top-0 -translate-x-1/2 text-[0.6875rem] leading-4 text-[var(--admin-text-muted)] tabular-nums" style={{ left: `${Number((share(index, end) * 100).toFixed(2))}%` }}>
                {String(hour).padStart(2, "0")}
              </span>
            ) : null))}
          </div>
        </div>
      )}

      {none ? (
        <p data-timelapse-status="none" className="text-sm text-[var(--admin-text-muted)]">{v.none}</p>
      ) : (
        <div className="min-h-10 text-sm text-[var(--admin-text-muted)] @3xl:min-h-5">
          {status === "loading" ? <p role="status" data-timelapse-status="loading">{v.loading}</p> : null}
          {status === "error" ? (
            <div role="alert" data-timelapse-status="error" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <p>{v.error}</p>
              <button type="button" data-timelapse-action="retry" onClick={onRetry} className={cn(adminSecondaryButtonClass, "lg:min-h-9")}>{v.retry}</button>
            </div>
          ) : null}
          {status === "empty" ? <p data-timelapse-status="empty">{v.empty}</p> : null}
          {status === "ready" ? <p className="text-xs leading-5">{v.help}</p> : null}
        </div>
      )}

      <p className="sr-only" aria-live="polite" data-timelapse-announce="">{announcement}</p>
    </div>
  );
}
