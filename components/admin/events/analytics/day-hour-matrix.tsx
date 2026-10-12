"use client";

import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChartFrame, ChartTipLayer, chartFocusRing, useChartTip, type ChartTableData } from "@/components/admin/events/analytics/chart-kit";
import { countOf, formatCount, hourLabel, lowerFirst } from "@/lib/admin-v2/analytics/format";
import { hourMatrix, type HourMatrix, type MatrixDay, type MatrixHour } from "@/lib/admin-v2/analytics/matrix";
import { SEQ_STEPS, seqColor, seqInk, seqStep } from "@/lib/admin-v2/analytics/palette";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — „Kad je gužva?“: a heat table, one row per fair day and one
// column per hour, on the one-hue sequential scale (more = darker; in the dark
// theme more = lighter). The number is in every cell, so the colour never
// stands alone. On a narrow chart the same cells flow the other way: hours
// down, days across. One keyboard stop; the arrows move through the cells.

const d = adminEventsSr.analytics;
const v = d.v2.matrix;

const cellText = (day: string, hour: number, value: number | null) =>
  value === null ? fmt(v.cellEmpty, { day, hour: hourLabel(hour) }) : fmt(v.cell, { day, hour: hourLabel(hour), scans: countOf(value, d.v2.units.scans) });

/** The grid alone (the fair's chart and the model detail share it). */
export function HourMatrixGrid({ matrix, label }: { matrix: HourMatrix; label: string }) {
  const gridId = useId();
  const hintId = useId();
  const { ref, tip, show, hide, bind } = useChartTip();
  const [active, setActive] = useState<[number, number] | null>(null);
  const cellId = (day: number, hour: number) => `${gridId}-${day}-${hour}`;
  const move = (day: number, hour: number) => {
    const next: [number, number] = [Math.max(0, Math.min(matrix.rows.length - 1, day)), Math.max(0, Math.min(matrix.hours.length - 1, hour))];
    setActive(next);
    const element = document.getElementById(cellId(next[0], next[1]));
    const row = matrix.rows[next[0]];
    if (element && row) show(`${next[0]}-${next[1]}`, element, cellText(row.label, matrix.hours[next[1]], row.cells[next[1]]));
  };
  const start = (): [number, number] => {
    const day = matrix.peak ? matrix.rows.findIndex((row) => row.dateKey === matrix.peak!.dateKey) : 0;
    return [Math.max(0, day), matrix.peak ? Math.max(0, matrix.hours.indexOf(matrix.peak.hour)) : 0];
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const [day, hour] = active ?? start();
    const step: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    move(day + delta[0], hour + delta[1]);
  };
  const header = "flex items-center text-[0.6875rem] leading-4 text-[var(--admin-text-muted)] tabular-nums";
  return (
    <div ref={ref} className="@container relative min-w-0">
      <div
        role="group"
        tabIndex={0}
        aria-label={label}
        aria-describedby={hintId}
        aria-activedescendant={active ? cellId(active[0], active[1]) : undefined}
        onKeyDown={onKeyDown}
        onFocus={() => {
          const [day, hour] = active ?? start();
          move(day, hour);
        }}
        onBlur={() => {
          setActive(null);
          hide();
        }}
        className={cn(
          "grid min-w-0 gap-[2px] rounded-lg",
          "grid-flow-col [grid-template-columns:auto_repeat(var(--days),minmax(0,1fr))] [grid-template-rows:repeat(calc(var(--hours)_+_2),auto)]",
          "@2xl:grid-flow-row @2xl:[grid-template-columns:auto_repeat(var(--hours),minmax(0,1fr))_auto] @2xl:[grid-template-rows:none]",
          chartFocusRing,
        )}
        style={{ "--days": matrix.rows.length, "--hours": matrix.hours.length } as CSSProperties}
      >
        <span aria-hidden="true" />
        {matrix.hours.map((hour) => <span key={hour} aria-hidden="true" className={cn(header, "justify-end pr-2 @2xl:justify-center @2xl:pr-0")}>{String(hour).padStart(2, "0")}</span>)}
        <span aria-hidden="true" className={cn(header, "justify-end pr-2 font-semibold @2xl:pl-2")}>{v.dayTotal}</span>
        {matrix.rows.map((row, dayIndex) => [
          <span key={`${row.dateKey}-label`} aria-hidden="true" className={cn(header, "justify-center px-1 pb-1 font-semibold text-[var(--admin-text)] @2xl:justify-start @2xl:pr-3 @2xl:pb-0")}>{row.label}</span>,
          ...row.cells.map((value, hourIndex) => {
            const step = value === null ? null : seqStep(value, matrix.max);
            const peak = matrix.peak?.dateKey === row.dateKey && matrix.peak.hour === matrix.hours[hourIndex];
            const current = active?.[0] === dayIndex && active[1] === hourIndex;
            const text = cellText(row.label, matrix.hours[hourIndex], value);
            return (
              <span
                key={`${row.dateKey}-${matrix.hours[hourIndex]}`}
                id={cellId(dayIndex, hourIndex)}
                role="img"
                aria-label={text}
                data-peak={peak ? "" : undefined}
                className={cn(
                  "flex h-8 min-w-0 items-center justify-center rounded-[3px] text-[0.6875rem] leading-none font-semibold tabular-nums @2xl:h-9",
                  // No scan: an empty outlined cell, so a zero never looks busier than a small number.
                  step === null && "border border-[var(--admin-border)] font-normal text-[var(--admin-text-muted)]",
                  value === null && "opacity-50",
                  (peak || current) && "outline-2 -outline-offset-2 outline-[var(--admin-text)]",
                )}
                // The ring of the peak and of the keyboard cell takes the ink of its own step, so it shows in both themes.
                style={step === null ? undefined : { background: seqColor(step), color: seqInk(step), outlineColor: seqInk(step) }}
                {...bind(`${dayIndex}-${hourIndex}`, text)}
              >
                {value === null ? "" : value}
              </span>
            );
          }),
          <span key={`${row.dateKey}-total`} aria-hidden="true" className={cn(header, "justify-center pt-1 font-semibold text-[var(--admin-text)] @2xl:justify-end @2xl:pt-0 @2xl:pl-2")}>{formatCount(row.total)}</span>,
        ])}
      </div>
      <p id={hintId} className="sr-only">{v.keyboardHint}</p>
      <ChartTipLayer tip={tip} />
    </div>
  );
}

/** The scale of the cells: near zero on the left, the maximum on the right. */
export function SequentialScale({ max }: { max: number }) {
  return (
    <p aria-hidden="true" className="flex items-center gap-2 text-xs text-[var(--admin-text-muted)] tabular-nums">
      <span>{d.heatLegendLess}</span>
      <span className="flex gap-[2px]">{SEQ_STEPS.map((step) => <span key={step} className="h-2.5 w-4 rounded-[2px]" style={{ background: seqColor(step) }} />)}</span>
      <span>{fmt(v.scaleMax, { max: formatCount(max) })}</span>
    </p>
  );
}

export function matrixTable(matrix: HourMatrix, caption: string): ChartTableData {
  return {
    caption,
    columns: [d.v2.table.day, ...matrix.hours.map(hourLabel), v.dayTotal],
    rows: matrix.rows.map((row) => [row.label, ...row.cells, row.total]),
  };
}

export function DayHourMatrix({ id, days, hours }: { id: string; days: readonly MatrixDay[]; hours: readonly MatrixHour[] }) {
  const matrix = useMemo(() => hourMatrix(days, hours), [days, hours]);
  const peak = matrix.peak;
  return (
    <ChartFrame id={id} title={v.title} question={v.question} table={matrix.hours.length ? matrixTable(matrix, v.title) : undefined}>
      {matrix.hours.length ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            {peak ? <p data-matrix-peak="" className="text-sm font-semibold">{fmt(v.peak, { day: lowerFirst(peak.label), hour: hourLabel(peak.hour), scans: countOf(peak.value, d.v2.units.scans) })}</p> : <span />}
            <SequentialScale max={matrix.max} />
          </div>
          <HourMatrixGrid matrix={matrix} label={`${v.title}: ${v.question}`} />
        </>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{v.empty}</p>}
    </ChartFrame>
  );
}
