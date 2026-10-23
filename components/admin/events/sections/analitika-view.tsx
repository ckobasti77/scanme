"use client";

import { Download, Flame, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminPanel } from "@/components/admin/admin-primitives";
import { AdminKpiRow, adminSecondaryButtonClass, type AdminKpi } from "@/components/admin/admin-ui";
import {
  analyticsHourDay,
  analyticsHours,
  analyticsModelRows,
  analyticsStandRows,
  formatPercent,
  type EventAnalyticsData,
  type EventAudienceData,
} from "@/components/admin/events/analytics-logic";
import { formatBelgrade } from "@/lib/belgrade-time";
import { fairHeatColor, fairHeatGradientCss, type FairHeatPeriod } from "@/lib/fair-heat";
import { fairMapBounds, fairMapForEventCode, fairMapLabelPoint, fairMapLocationTakesStands, fairMapPointsAttr } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// SAJAM SUPER Korak 4 — `Događaji → Analitika` (presentational): KPI row with
// the three definitions of "unique" side by side, scans per day and per hour
// from 08:00 (SVG, one axis, the series validated by the dataviz checks:
// scans #2f6fe4, unique per model #11aec4, values always also as text), the
// model and stand ranking with conversion, the admin heat map on the public
// scale with the exact count and share, devices, CSV. Everything comes from
// fairEventAnalytics (admin) or a TEST fixture (dev preview).

const d = adminEventsSr.analytics;
const SCANS = "#2f6fe4";
const UNIQUE = "#11aec4";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";
const chipClass = (on: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors",
    focusRing,
    on ? "border-[var(--admin-ink)] bg-[var(--admin-ink)] text-[var(--admin-on-ink)]" : "border-[var(--admin-border)] bg-[var(--admin-surface-strong)] text-[var(--admin-text)]",
  );
const number = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toLocaleString("sr-RS", { maximumFractionDigits: 1 }));

export type AnalyticsViewProps = {
  eventCode: string;
  data: EventAnalyticsData;
  audience: EventAudienceData | undefined;
  hourDay: string | undefined;
  onHourDay: (dateKey: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onExport: () => void;
};

function SectionTitle({ id, children, action }: { id: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{children}</h2>
      {action}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--admin-text-muted)]" aria-hidden="true">
      <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SCANS }} />{d.legendScans}</li>
      <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: UNIQUE }} />{d.legendUnique}</li>
    </ul>
  );
}

type Bar = { key: string; label: string; short: string; scans: number; unique: number };

/** The chart draws at the width it really has, so its text stays at real pixel sizes on a phone. */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
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

const AXIS = 30;
const MIN_SLOT = 26;

/** One axis: the scans bar, the unique-per-model bar nested inside it (unique ≤ scans). */
function BarChart({ bars, valueLabels }: { bars: Bar[]; valueLabels: "all" | "max" }) {
  const [active, setActive] = useState<number | null>(null);
  const [ref, measured] = useElementWidth();
  const max = Math.max(1, ...bars.map((bar) => bar.scans));
  const height = 168;
  const top = 18;
  const bottom = 22;
  const plot = height - top - bottom;
  const width = Math.max(measured || 320, AXIS + bars.length * MIN_SLOT);
  const slot = (width - AXIS) / Math.max(bars.length, 1);
  const barWidth = Math.min(40, slot * 0.6);
  const ticks = [0, 0.5, 1].map((part) => Math.round(max * part));
  const maxIndex = bars.reduce((best, bar, index) => (bar.scans > bars[best].scans ? index : best), 0);
  const shown = active ?? null;
  return (
    <div ref={ref} className="relative min-w-0 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block" role="group">
        {ticks.map((tick) => {
          const y = top + plot - (tick / max) * plot;
          return (
            <g key={tick} aria-hidden="true">
              <line x1={AXIS} x2={width} y1={y} y2={y} stroke="var(--admin-border)" strokeWidth={1} />
              <text x={AXIS - 6} y={y} textAnchor="end" dominantBaseline="central" fontSize={10} fill="var(--admin-text-muted)">{tick}</text>
            </g>
          );
        })}
        {bars.map((bar, index) => {
          const x = AXIS + index * slot + (slot - barWidth) / 2;
          const h = (bar.scans / max) * plot;
          const hu = (bar.unique / max) * plot;
          const base = top + plot;
          const radius = Math.min(4, h / 2);
          const outer = h > 0
            ? `M${x},${base} V${base - h + radius} Q${x},${base - h} ${x + radius},${base - h} H${x + barWidth - radius} Q${x + barWidth},${base - h} ${x + barWidth},${base - h + radius} V${base} Z`
            : "";
          const inset = Math.max(3, barWidth * 0.2);
          const innerWidth = barWidth - inset * 2;
          const innerRadius = Math.min(3, hu / 2);
          const ix = x + inset;
          const inner = hu > 0
            ? `M${ix},${base} V${base - hu + innerRadius} Q${ix},${base - hu} ${ix + innerRadius},${base - hu} H${ix + innerWidth - innerRadius} Q${ix + innerWidth},${base - hu} ${ix + innerWidth},${base - hu + innerRadius} V${base} Z`
            : "";
          const labelled = valueLabels === "all" || index === maxIndex || index === shown;
          return (
            <g
              key={bar.key}
              tabIndex={0}
              role="img"
              aria-label={fmt(d.barAria, { label: bar.label, scans: bar.scans, unique: bar.unique })}
              className="outline-none focus-visible:[&>rect:first-child]:stroke-[var(--admin-ink)]"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              <rect x={AXIS + index * slot} y={top} width={slot} height={plot} fill={index === shown ? "var(--admin-skeleton)" : "transparent"} strokeWidth={1.5} rx={4} />
              {outer ? <path d={outer} fill={SCANS} /> : null}
              {inner ? <path d={inner} fill={UNIQUE} stroke="var(--admin-surface-strong)" strokeWidth={2} paintOrder="stroke" /> : null}
              {labelled && bar.scans > 0 ? (
                <text x={x + barWidth / 2} y={base - h - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--admin-text)">{bar.scans}</text>
              ) : null}
              <text x={AXIS + index * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--admin-text-muted)">{bar.short}</text>
            </g>
          );
        })}
      </svg>
      {shown !== null && bars[shown] ? (
        <p role="status" className="pointer-events-none absolute top-0 right-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-2.5 py-1.5 text-xs shadow-[var(--admin-shadow-sm)] tabular-nums">
          <strong>{bars[shown].label}</strong> · {d.legendScans} {bars[shown].scans} · {d.legendUnique} {bars[shown].unique}
        </p>
      ) : null}
    </div>
  );
}

function ChartTable({ bars, firstColumn }: { bars: Bar[]; firstColumn: string }) {
  return (
    <details className="text-sm">
      <summary className={cn("inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 font-semibold text-[var(--admin-text-muted)]", focusRing)}>{d.tableToggle}</summary>
      <div className="overflow-x-auto">
        <table className="mt-1 w-full min-w-72 text-left tabular-nums">
          <thead className="text-xs text-[var(--admin-text-muted)]"><tr><th className="py-1 pr-3 font-semibold">{firstColumn}</th><th className="py-1 pr-3 font-semibold">{d.legendScans}</th><th className="py-1 font-semibold">{d.legendUnique}</th></tr></thead>
          <tbody>{bars.map((bar) => <tr key={bar.key} className="border-t border-[var(--admin-border)]"><td className="py-1.5 pr-3">{bar.label}</td><td className="py-1.5 pr-3">{bar.scans}</td><td className="py-1.5">{bar.unique}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

function Rating({ rating }: { rating: { average: number; count: number } | null }) {
  if (!rating) return <span className="text-[var(--admin-text-muted)]">—</span>;
  return <span title={fmt(d.ratingCount, { count: rating.count })}>{rating.average.toLocaleString("sr-RS", { maximumFractionDigits: 2 })}<span className="ml-1 text-xs text-[var(--admin-text-muted)]">({rating.count})</span></span>;
}

const th = "px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-[var(--admin-text-muted)]";
const thNum = cn(th, "text-right");
const td = "px-3 py-2.5 align-top";
const tdNum = cn(td, "text-right tabular-nums whitespace-nowrap");

function HeatMap({ eventCode, rows, period, onPeriod }: { eventCode: string; rows: EventAnalyticsData["heat"]["today"]; period: FairHeatPeriod; onPeriod: (period: FairHeatPeriod) => void }) {
  const geometry = fairMapForEventCode(eventCode);
  const byLocation = useMemo(() => new Map(rows.map((row) => [row.locationId, row])), [rows]);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedRow = picked ? byLocation.get(picked) : undefined;
  const labelFor = (locationId: string) => geometry?.zones.flatMap((zone) => zone.locations).find((location) => location.id === locationId)?.label ?? locationId;
  const tooltip = (row: (typeof rows)[number]) => fmt(d.heatTooltip, { stand: labelFor(row.locationId), count: number(row.count), share: formatPercent(row.share) });
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label={d.heatTitle}>
          {(["today", "hour"] as const).map((key) => (
            <button key={key} type="button" aria-pressed={period === key} className={chipClass(period === key)} onClick={() => onPeriod(key)}>
              {key === "today" ? d.heatPeriodToday : d.heatPeriodHour}
            </button>
          ))}
        </div>
        <div className="flex min-w-48 flex-1 items-center gap-2 text-xs text-[var(--admin-text-muted)] sm:max-w-80" aria-hidden="true">
          <span>{d.heatLegendLess}</span>
          <span className="h-2.5 flex-1 rounded-full" style={{ backgroundImage: fairHeatGradientCss() }} />
          <span>{d.heatLegendMore}</span>
        </div>
      </div>
      {rows.length === 0 ? <p className="text-sm text-[var(--admin-text-muted)]">{d.heatEmpty}</p> : null}
      {geometry ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {geometry.zones.map((zone) => (
            <figure key={zone.id} className="m-0 min-w-0 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)]">
              <svg viewBox={`0 0 ${zone.image.width} ${zone.image.height}`} className="block h-auto w-full" role="group" aria-label={zone.id}>
                <rect width={zone.image.width} height={zone.image.height} fill="#f4f5f4" />
                {zone.outline ? <polygon points={fairMapPointsAttr(zone.outline)} fill="#fbfbfa" stroke="#c9ccc9" strokeWidth={zone.image.width / 300} /> : null}
                {zone.locations.filter(fairMapLocationTakesStands).map((location) => {
                  const row = byLocation.get(location.id);
                  const [lx, ly] = fairMapLabelPoint(location.polygon);
                  const bounds = fairMapBounds(location.polygon);
                  const size = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
                  const font = Math.max(zone.image.width / 70, Math.min(size * 0.28, zone.image.width / 34));
                  return (
                    <g
                      key={location.id}
                      tabIndex={row ? 0 : undefined}
                      role={row ? "button" : undefined}
                      aria-label={row ? tooltip(row) : undefined}
                      aria-pressed={row ? picked === location.id : undefined}
                      className={cn("outline-none", row && "cursor-pointer")}
                      onClick={() => row && setPicked(picked === location.id ? null : location.id)}
                      onKeyDown={(event) => {
                        if (row && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          setPicked(picked === location.id ? null : location.id);
                        }
                      }}
                    >
                      {row ? <title>{tooltip(row)}</title> : null}
                      <polygon
                        points={fairMapPointsAttr(location.polygon)}
                        fill={row ? fairHeatColor(row.level) : "#ffffff"}
                        fillOpacity={row ? 0.88 : 1}
                        stroke={picked === location.id ? "var(--admin-ink)" : "#a9aeaa"}
                        strokeWidth={(picked === location.id ? 4 : 1.5) * (zone.image.width / 600)}
                      />
                      {row ? (
                        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={800} fill="#121413" stroke="#ffffff" strokeWidth={font / 5} paintOrder="stroke">
                          {number(row.count)}
                        </text>
                      ) : (
                        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={font * 0.8} fill="#7a7f7c">{location.label}</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </figure>
          ))}
        </div>
      ) : null}
      <p className="min-h-6 text-sm tabular-nums" role="status">{pickedRow ? tooltip(pickedRow) : ""}</p>
      {rows.length ? (
        <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.locationId} className="flex min-w-0 items-center gap-2 tabular-nums">
              <span className="size-3 flex-none rounded-sm" style={{ background: fairHeatColor(row.level) }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{tooltip(row)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function EventAnalyticsView({ eventCode, data, audience, hourDay, onHourDay, onRefresh, refreshing, onExport }: AnalyticsViewProps) {
  const ids = { kpi: useId(), days: useId(), hours: useId(), models: useId(), stands: useId(), heat: useId(), devices: useId() };
  const [heatPeriod, setHeatPeriod] = useState<FairHeatPeriod>("today");
  const models = useMemo(() => analyticsModelRows(data, audience), [data, audience]);
  const stands = useMemo(() => analyticsStandRows(data, audience), [data, audience]);
  const selectedDay = analyticsHourDay(data, hourDay);
  const hourBars: Bar[] = analyticsHours(data, selectedDay).map((row) => ({ key: `${row.dateKey}-${row.hour}`, label: `${String(row.hour).padStart(2, "0")}:00`, short: String(row.hour).padStart(2, "0"), scans: row.scans, unique: row.uniquePerModel }));
  const dayBars: Bar[] = data.days.map((day) => ({ key: day.dateKey, label: `${day.label} (${day.dateKey.slice(8)}. ${day.dateKey.slice(5, 7)}.)`, short: day.label, scans: day.scans, unique: day.uniquePerModel }));
  const k = d.kpi;
  const pair = (today: number | null | undefined, total: number | null | undefined) => fmt(k.pair, { today: number(today), total: number(total) });
  const kpis: AdminKpi[] = [
    { id: "scans", label: k.scans, value: number(data.kpis.scans.today), hint: pair(data.kpis.scans.today, data.kpis.scans.total) },
    { id: "unique", label: k.uniquePerModel, value: number(data.kpis.uniquePerModel.today), hint: pair(data.kpis.uniquePerModel.today, data.kpis.uniquePerModel.total) },
    { id: "visitors", label: k.visitors, value: number(audience?.visitors.today), hint: `${pair(audience?.visitors.today, audience?.visitors.total)}${audience?.visitors.capped ? ` · ${d.capped}` : ""}` },
    { id: "leads", label: k.leads, value: number(data.kpis.leads.total), hint: fmt(k.leadsHint, { interest: data.kpis.leads.interest, testDrive: data.kpis.leads.testDrive }) },
    { id: "votes", label: k.votes, value: number(data.kpis.audienceVotes), hint: k.votesHint },
    { id: "surveys", label: k.surveys, value: number(data.kpis.surveys.total), hint: data.kpis.surveys.capped ? `${k.surveysHint} · ${d.capped}` : k.surveysHint },
    { id: "stamps", label: k.stamps, value: number(audience?.stamps.total), hint: fmt(k.stampsHint, { passports: number(audience?.stamps.passportsCompleted) }) },
    { id: "shares", label: k.shares, value: number(data.kpis.shares.total), hint: k.sharesHint },
  ];
  const devices = audience?.devices;
  const deviceTotal = devices ? devices.mobile + devices.tablet + devices.desktop + devices.unknown : 0;

  return (
    <div className="grid min-w-0 gap-4">
      <AdminPanel className="grid min-w-0 gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.02em]">{d.title}</h1>
            <p className="max-w-2xl text-sm leading-5 text-[var(--admin-text-muted)]">{fmt(d.intro, { cutoff: formatBelgrade(data.cutoff) })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--admin-text-muted)] tabular-nums" aria-live="polite">{refreshing ? d.refreshing : fmt(d.updated, { time: formatBelgrade(data.at).split(" ").at(-1) ?? "" })}</span>
            <button type="button" className={adminSecondaryButtonClass} onClick={onRefresh} disabled={refreshing}>
              <RefreshCw aria-hidden="true" className={cn("size-4", refreshing && "motion-safe:animate-spin")} />
              {d.refresh}
            </button>
            <button type="button" className={adminSecondaryButtonClass} onClick={onExport}>
              <Download aria-hidden="true" className="size-4" />
              {d.exportCsv}
            </button>
          </div>
        </div>
        <section aria-labelledby={ids.kpi} className="grid min-w-0 gap-2">
          <SectionTitle id={ids.kpi}>{d.kpiTitle}</SectionTitle>
          <AdminKpiRow label={d.kpiTitle} items={kpis} />
        </section>
        <details className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm">
          <summary className={cn("min-h-11 cursor-pointer content-center font-semibold", focusRing)}>{d.definitionsTitle}</summary>
          <ul className="grid gap-1.5 pb-3 leading-5 text-[var(--admin-text-muted)]">
            <li>{d.definitions.scans}</li>
            <li>{d.definitions.uniquePerModel}</li>
            <li>{d.definitions.visitors}</li>
            <li>{d.definitions.stand}</li>
            <li>{d.definitions.window}</li>
          </ul>
        </details>
      </AdminPanel>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <AdminPanel className="grid min-w-0 content-start gap-3 p-4 sm:p-5" aria-labelledby={ids.days}>
          <SectionTitle id={ids.days} action={<Legend />}>{d.daysTitle}</SectionTitle>
          {dayBars.some((bar) => bar.scans > 0) ? <BarChart bars={dayBars} valueLabels="all" /> : <p className="text-sm text-[var(--admin-text-muted)]">{d.noData}</p>}
          <ChartTable bars={dayBars} firstColumn={d.dayLabel} />
        </AdminPanel>
        <AdminPanel className="grid min-w-0 content-start gap-3 p-4 sm:p-5" aria-labelledby={ids.hours}>
          <SectionTitle id={ids.hours} action={<Legend />}>{d.hoursTitle}</SectionTitle>
          <div className="flex flex-wrap gap-2" role="group" aria-label={d.hoursDayLabel}>
            {data.days.map((day) => (
              <button key={day.dateKey} type="button" aria-pressed={day.dateKey === selectedDay} className={chipClass(day.dateKey === selectedDay)} onClick={() => onHourDay(day.dateKey)}>
                {day.label}
              </button>
            ))}
          </div>
          {hourBars.some((bar) => bar.scans > 0) ? <BarChart bars={hourBars} valueLabels="max" /> : <p className="text-sm text-[var(--admin-text-muted)]">{d.noData}</p>}
          <ChartTable bars={hourBars} firstColumn={d.hourLabel} />
        </AdminPanel>
      </div>

      <AdminPanel className="grid min-w-0 gap-3 p-4 sm:p-5" aria-labelledby={ids.models}>
        <SectionTitle id={ids.models}>{d.modelsTitle}</SectionTitle>
        {models.length ? (
          <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)]">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-[var(--admin-border)]">
                <tr>
                  <th className={th}>{d.columns.model}</th><th className={th}>{d.columns.stand}</th><th className={th}>{d.columns.tier}</th>
                  <th className={thNum}>{d.columns.scans}</th><th className={thNum}>{d.columns.unique}</th><th className={thNum}>{d.columns.leads}</th>
                  <th className={thNum}>{d.columns.conversion}</th><th className={thNum}>{d.columns.votes}</th><th className={thNum}>{d.columns.rating}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((row) => (
                  <tr key={row.eventModelId} className="border-t border-[var(--admin-border)] first:border-t-0">
                    <td className={td}><span className="font-semibold">{`${row.brandName} ${row.name}`.trim()}</span><span className="block text-xs text-[var(--admin-text-muted)]">{row.exhibitorName}</span></td>
                    <td className={td}>{row.standCode}</td>
                    <td className={td}>{d.tiers[row.tier as keyof typeof d.tiers] ?? row.tier}</td>
                    <td className={tdNum}>{number(row.scans.total)}<span className="block text-xs text-[var(--admin-text-muted)]">{d.today} {number(row.scans.today)}</span></td>
                    <td className={tdNum}>{number(row.uniquePerModel.total)}<span className="block text-xs text-[var(--admin-text-muted)]">{d.today} {number(row.uniquePerModel.today)}</span></td>
                    <td className={tdNum}>{number(row.leads)}</td>
                    <td className={tdNum}>{formatPercent(row.conversion)}</td>
                    <td className={tdNum}>{number(row.votes)}</td>
                    <td className={tdNum}><Rating rating={row.rating} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{d.emptyRanking}</p>}
      </AdminPanel>

      <AdminPanel className="grid min-w-0 gap-3 p-4 sm:p-5" aria-labelledby={ids.stands}>
        <SectionTitle id={ids.stands}>{d.standsTitle}</SectionTitle>
        {stands.length ? (
          <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)]">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-[var(--admin-border)]">
                <tr>
                  <th className={th}>{d.columns.stand}</th><th className={th}>{d.columns.exhibitor}</th>
                  <th className={thNum}>{d.columns.scans}</th><th className={thNum}>{d.columns.unique}</th><th className={thNum}>{d.columns.visitors}</th>
                  <th className={thNum}>{d.columns.leads}</th><th className={thNum}>{d.columns.conversion}</th><th className={thNum}>{d.columns.votes}</th><th className={thNum}>{d.columns.rating}</th>
                </tr>
              </thead>
              <tbody>
                {stands.map((row) => (
                  <tr key={row.locationId} className="border-t border-[var(--admin-border)] first:border-t-0">
                    <td className={cn(td, "font-semibold")}>{row.standCode}</td>
                    <td className={td}>{row.exhibitors.join(", ")}</td>
                    <td className={tdNum}>{number(row.scans)}</td>
                    <td className={tdNum}>{number(row.uniquePerModel)}</td>
                    <td className={tdNum}>{number(row.visitors)}</td>
                    <td className={tdNum}>{number(row.leads)}</td>
                    <td className={tdNum}>{formatPercent(row.conversion)}</td>
                    <td className={tdNum}>{number(row.votes)}</td>
                    <td className={tdNum}><Rating rating={row.rating} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{d.emptyRanking}</p>}
      </AdminPanel>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <AdminPanel className="grid min-w-0 content-start gap-3 p-4 sm:p-5" aria-labelledby={ids.heat}>
          <SectionTitle id={ids.heat} action={<Flame aria-hidden="true" className="size-4 text-[#e0362c]" />}>{d.heatTitle}</SectionTitle>
          <p className="text-sm leading-5 text-[var(--admin-text-muted)]">{d.heatIntro}</p>
          <HeatMap eventCode={eventCode} rows={data.heat[heatPeriod]} period={heatPeriod} onPeriod={setHeatPeriod} />
        </AdminPanel>
        <AdminPanel className="grid min-w-0 content-start gap-3 p-4 sm:p-5" aria-labelledby={ids.devices}>
          <SectionTitle id={ids.devices} action={<Smartphone aria-hidden="true" className="size-4 text-[var(--admin-text-muted)]" />}>{d.devicesTitle}</SectionTitle>
          {devices ? (
            <>
              <ul className="grid gap-2.5">
                {(["mobile", "tablet", "desktop", "unknown"] as const).map((key) => {
                  const share = deviceTotal ? devices[key] / deviceTotal : 0;
                  return (
                    <li key={key} className="grid gap-1 text-sm">
                      <span className="flex items-baseline justify-between gap-2 tabular-nums"><span>{d.devices[key]}</span><span><strong>{devices[key]}</strong> <span className="text-[var(--admin-text-muted)]">{formatPercent(deviceTotal ? share : null)}</span></span></span>
                      <span className="h-2 overflow-hidden rounded-full bg-[var(--admin-surface-muted)]" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: SCANS }} /></span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs leading-5 text-[var(--admin-text-muted)]">{fmt(d.devicesNote, { sample: devices.sample, bots: devices.bots })}</p>
            </>
          ) : <p className="text-sm text-[var(--admin-text-muted)]">{d.refreshing}</p>}
        </AdminPanel>
      </div>
    </div>
  );
}
