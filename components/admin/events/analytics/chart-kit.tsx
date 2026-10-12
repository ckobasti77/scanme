"use client";

import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AdminPanel } from "@/components/admin/admin-primitives";
import { adminSegmentOnClass } from "@/components/admin/admin-ui/admin-controls";
import { nextRadioIndex } from "@/lib/admin-v1/view-mode";
import { formatCount } from "@/lib/admin-v2/analytics/format";
import { CHART_OTHER_COLOR, chartColor } from "@/lib/admin-v2/analytics/palette";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — the shared pieces of the analytics charts (ZADATAK §4, the
// dataviz method): one frame per chart (its title, the question it answers,
// the legend, „Prikaži kao tabelu“), a tooltip on hover, focus and touch, thin
// marks with a 2 px surface gap, medals and rank moves. Text always wears the
// text tokens; a coloured mark beside it carries the identity. Every chart of
// `components/admin/events/analytics/` is built from these.

const d = adminEventsSr.analytics;

export const chartFocusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
export const chartTh = "px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-[var(--admin-text-muted)]";
export const chartThNum = cn(chartTh, "text-right");
export const chartTd = "px-3 py-2 align-middle";
export const chartTdNum = cn(chartTd, "text-right tabular-nums whitespace-nowrap");

// -----------------------------------------------------------------------------
// Frame
// -----------------------------------------------------------------------------

export type ChartTableData = {
  caption: string;
  columns: readonly string[];
  /** One array per row; the first cell is the row header, numbers are formatted and right aligned. */
  rows: ReadonlyArray<ReadonlyArray<string | number | null>>;
};

/** The table twin of a chart: every value the chart shows, readable without colour or hover. */
export function ChartTable({ table }: { table: ChartTableData }) {
  return (
    <details data-chart-table="" className="group text-sm">
      <summary className={cn("-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-1 font-semibold text-[var(--admin-text-muted)] hover:text-[var(--admin-text)] lg:min-h-9", chartFocusRing)}>
        <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-[var(--admin-dur-1)] group-open:rotate-180 motion-reduce:transition-none" />
        {d.tableToggle}
      </summary>
      <div className="relative overflow-x-auto">
        <table className="mt-1 w-full min-w-64 text-left tabular-nums">
          <caption className="sr-only">{table.caption}</caption>
          <thead className="text-xs text-[var(--admin-text-muted)]">
            <tr>{table.columns.map((column, index) => <th key={column} scope="col" className={cn("py-1 pr-3 font-semibold last:pr-0", index > 0 && "text-right")}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-[var(--admin-border)]">
                {row.map((cell, index) => index === 0
                  ? <th key={index} scope="row" className="py-1.5 pr-3 text-left font-normal">{cell}</th>
                  : <td key={index} className="py-1.5 pr-3 text-right last:pr-0">{typeof cell === "number" ? formatCount(cell) : (cell ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * One chart: the small title, the question it answers as the line people
 * read, then the legend, the marks, an optional note and the table twin.
 * `id` is the anchor of „Na ovoj strani“.
 */
export function ChartFrame({ id, title, question, actions, legend, note, table, children, className }: {
  id: string;
  title: string;
  question: string;
  /** Controls of this chart only (a view switch), right of the heading. */
  actions?: ReactNode;
  legend?: ReactNode;
  note?: ReactNode;
  table?: ChartTableData;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <AdminPanel id={id} data-analytics-chart={id} aria-labelledby={headingId} className={cn("@container grid min-w-0 scroll-mt-4 content-start gap-3 p-4 sm:p-5", className)}>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <h2 id={headingId} className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{title}</h2>
          <p className="text-base leading-6 font-semibold tracking-[-0.015em]">{question}</p>
        </div>
        {actions}
      </header>
      {legend}
      {children}
      {note ? <p className="text-xs leading-5 text-[var(--admin-text-muted)]">{note}</p> : null}
      {table ? <ChartTable table={table} /> : null}
    </AdminPanel>
  );
}

export type LegendItem = { key: string; label: string; color: string; shape?: "rect" | "line" };

/** Present for two or more series; a swatch beside the name, the name in a text token. */
export function ChartLegend({ items, label }: { items: readonly LegendItem[]; label?: string }) {
  if (items.length < 2) return null;
  return (
    <ul aria-label={label} className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--admin-text-muted)]">
      {items.map((item) => (
        <li key={item.key} className="inline-flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className={cn("flex-none rounded-[2px]", item.shape === "line" ? "h-0.5 w-3.5" : "size-2.5")} style={{ background: item.color }} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** A switch of one chart (period, 2D | 3D): the same radiogroup as `Tabela | Kartice`, arrows move the choice. */
export function ChartSegmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextRadioIndex(index, event.key, options.length);
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0.5">
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-colors motion-reduce:transition-none lg:min-h-8",
              chartFocusRing,
              checked ? adminSegmentOnClass : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A zero that is a problem: the danger colour never comes alone, always with this icon and its text. */
export function ChartProblem({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="note" data-chart-problem="" className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 gap-y-1 rounded-[var(--admin-radius-control)] border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 text-[var(--admin-danger)]" />
      <p className="font-semibold">{title}</p>
      {children ? <div className="col-start-2 grid min-w-0 gap-2 leading-5 text-[var(--admin-text)]">{children}</div> : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tooltip: hover, keyboard focus and touch show the same readout
// -----------------------------------------------------------------------------

export type ChartTip = { key: string; x: number; y: number; content: ReactNode };

type TipHandlers = {
  onPointerEnter: (event: PointerEvent<Element>) => void;
  onPointerLeave: (event: PointerEvent<Element>) => void;
  onFocus: (event: { currentTarget: Element }) => void;
  onBlur: () => void;
  onClick: (event: { currentTarget: Element }) => void;
};

/**
 * One tooltip per chart. Put `ref` on a `relative` element around the marks,
 * spread `bind(key, content)` on every mark and render `<ChartTipLayer tip />`
 * inside the same element. The mouse shows it on hover, the keyboard on focus,
 * a finger on tap (a second tap or a tap elsewhere hides it). It only
 * repeats what the labels and the table already say.
 */
export function useChartTip<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const show = useCallback((key: string, target: Element, content: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const mark = target.getBoundingClientRect();
    setTip({ key, x: mark.left + mark.width / 2 - box.left, y: mark.top - box.top, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const open = tip !== null;
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) setTip(null);
    };
    // Escape closes the readout (WCAG 1.4.13); it is not stopped, so it still closes a drawer the chart sits in.
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setTip(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const bind = (key: string, content: ReactNode): TipHandlers => ({
    onPointerEnter: (event) => {
      if (event.pointerType === "mouse") show(key, event.currentTarget, content);
    },
    onPointerLeave: (event) => {
      if (event.pointerType === "mouse") hide();
    },
    onFocus: (event) => show(key, event.currentTarget, content),
    onBlur: hide,
    onClick: (event) => {
      if (tip?.key === key) hide();
      else show(key, event.currentTarget, content);
    },
  });
  return { ref, tip, show, hide, bind };
}

/** `align="end"`: for a small mark at the right edge of its row, the readout opens to the left of it. */
export function ChartTipLayer({ tip, align = "center" }: { tip: ChartTip | null; align?: "center" | "end" }) {
  if (!tip) return null;
  const end = align === "end";
  return (
    <span
      aria-hidden="true"
      data-chart-tip=""
      className={cn(
        "pointer-events-none absolute z-10 block w-max -translate-y-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-2.5 py-1.5 text-left text-xs leading-4 font-normal text-[var(--admin-text)] shadow-[var(--admin-shadow-sm)] tabular-nums",
        end ? "right-0 max-w-64" : "max-w-[min(16rem,calc(100%-0.5rem))] -translate-x-1/2",
      )}
      style={end ? { top: Math.round(tip.y) - 6 } : { left: `clamp(4.5rem, ${Math.round(tip.x)}px, calc(100% - 4.5rem))`, top: Math.round(tip.y) - 6 }}
    >
      {tip.content}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Marks
// -----------------------------------------------------------------------------

/** A thin horizontal bar: square at the baseline, a rounded data end, a quiet track. */
export function HBar({ share, color = chartColor(1), className, style }: { share: number; color?: string; className?: string; style?: CSSProperties }) {
  const width = Math.max(0, Math.min(1, share)) * 100;
  return (
    <span aria-hidden="true" className={cn("block h-2 min-w-0 overflow-hidden rounded-r-[4px] bg-[var(--admin-surface-muted)]", className)} style={style}>
      <span className="block h-full rounded-r-[4px]" style={{ width: `${width}%`, minWidth: width > 0 ? 2 : 0, background: color }} />
    </span>
  );
}

export type StackSegment = { key: string; label: string; value: number; color: string; tip?: ReactNode };

/**
 * A part-to-whole bar: segments in the given order with a 2 px gap in the
 * surface colour, each a keyboard stop with its tooltip. `share` scales the
 * whole bar against the longest one of a ranking (default: full width).
 */
export function StackedBar({ segments, share = 1, label, className }: { segments: readonly StackSegment[]; share?: number; label: string; className?: string }) {
  const { ref, tip, bind } = useChartTip();
  const shown = segments.filter((segment) => segment.value > 0);
  return (
    <div ref={ref} className={cn("relative min-w-0", className)}>
      <div role="group" aria-label={label} className="flex h-3 min-w-0 gap-[2px]" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, minWidth: shown.length ? "0.5rem" : 0 }}>
        {shown.map((segment, index) => (
          <button
            key={segment.key}
            type="button"
            aria-label={typeof segment.tip === "string" ? segment.tip : `${segment.label}: ${formatCount(segment.value)}`}
            className={cn("h-full min-w-[3px] cursor-default", chartFocusRing)}
            style={{ flexGrow: segment.value, flexBasis: 0, background: segment.color, borderRadius: index === shown.length - 1 ? "0 4px 4px 0" : 0 }}
            {...bind(segment.key, segment.tip ?? `${segment.label}: ${formatCount(segment.value)}`)}
          />
        ))}
      </div>
      <ChartTipLayer tip={tip} />
    </div>
  );
}

/**
 * The trend of a few fair days as small columns: the highlighted day in the
 * series colour, the others in the quiet one. `label` says the values: it is
 * the text for assistive technology and the readout on hover and on a tap.
 */
export function MiniBars({ values, highlight, label, color = chartColor(1), width = 44, height = 22, className }: {
  values: readonly number[];
  /** Index of the day the row's big number is for. */
  highlight?: number;
  label: string;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const max = Math.max(1, ...values);
  const gap = 2;
  const bar = Math.min(24, (width - gap * (values.length - 1)) / Math.max(1, values.length));
  const used = bar * values.length + gap * (values.length - 1);
  const { ref, tip, bind } = useChartTip<HTMLSpanElement>();
  const { onPointerEnter, onPointerLeave, onClick } = bind("trend", label);
  return (
    <span ref={ref} data-mini-bars="" className={cn("relative inline-flex flex-none", className)} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onClick={onClick}>
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block flex-none">
      {values.map((value, index) => {
        const h = value > 0 ? Math.max(2, (value / max) * (height - 1)) : 1;
        const x = (width - used) / 2 + index * (bar + gap);
        const radius = Math.min(2, h / 2);
        const y = height - h;
        return (
          <path
            key={index}
            d={`M${x},${height} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + bar - radius} Q${x + bar},${y} ${x + bar},${y + radius} V${height} Z`}
            fill={highlight === undefined || index === highlight ? color : CHART_OTHER_COLOR}
            fillOpacity={value > 0 ? 1 : 0.45}
          />
        );
      })}
    </svg>
    <ChartTipLayer tip={tip} align="end" />
    </span>
  );
}

/** A place in a ranking: gold, silver and bronze as a quiet ring around the number, the rest a plain number. */
export function RankMedal({ rank, medal, label }: { rank: number; medal: 1 | 2 | 3 | null; label: string }) {
  if (!medal) return <span role="img" aria-label={label} className="inline-flex size-7 items-center justify-center text-sm text-[var(--admin-text-muted)] tabular-nums">{rank}</span>;
  return (
    <span
      role="img"
      aria-label={label}
      data-medal={medal}
      className="inline-flex size-7 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums"
      style={{ borderColor: `var(--admin-medal-${medal})`, background: `color-mix(in oklab, var(--admin-medal-${medal}) 14%, transparent)` }}
    >
      {rank}
    </span>
  );
}

/** Places gained or lost; an arrow and the number, never the colour alone. */
export function RankMove({ move, isNew, labels }: {
  move: number | null;
  isNew: boolean;
  labels: { up: (places: number) => string; down: (places: number) => string; same: string; isNew: string };
}) {
  if (isNew) return <span className="rounded-full border border-[var(--admin-border)] px-1.5 text-[0.6875rem] leading-5 font-semibold text-[var(--admin-text-muted)]">{labels.isNew}</span>;
  if (move === null) return null;
  // No move is not news: nothing is drawn, the words stay for assistive technology.
  if (move === 0) return <span className="sr-only">{labels.same}</span>;
  const up = move > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums", up ? "text-[var(--admin-success)]" : "text-[var(--admin-text-muted)]")}>
      <Icon aria-hidden="true" className="size-3.5" />
      <span aria-hidden="true">{Math.abs(move)}</span>
      <span className="sr-only">{up ? labels.up(move) : labels.down(-move)}</span>
    </span>
  );
}

/** The width an element really has, so an SVG chart keeps real pixel sizes on a phone. */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
