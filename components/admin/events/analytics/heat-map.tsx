"use client";

import { X } from "lucide-react";
import { Component, Suspense, lazy, useMemo, useState, type ReactNode } from "react";
import { ChartFrame, ChartSegmented, chartFocusRing } from "@/components/admin/events/analytics/chart-kit";
import { countOf, formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { heatBlocks, heatZoneIds, locationScans } from "@/lib/admin-v2/analytics/heat-blocks";
import type { LeaderRow } from "@/lib/admin-v2/analytics/leaderboard";
import type { StandRank } from "@/lib/admin-v2/analytics/stands";
import type { AnalyticsData, AnalyticsHeatRow } from "@/lib/admin-v2/analytics/types";
import { fairHeatColor, fairHeatGradientCss, type FairHeatPeriod } from "@/lib/fair-heat";
import { fairMapBounds, fairMapForEventCode, fairMapLabelPoint, fairMapLocationTakesStands, fairMapPointsAttr, type FairMapGeometry } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — „Gde je gužva?“: the hall heat map on the scale of the public
// map (lib/fair-heat.ts), with the exact count and share that only the admin
// sees. 2D is the default and the fallback; „3D“ loads the Three.js view on
// demand (a dynamic import, never on the server) where the height of a stand
// is its scans. Both views pick a stand; the list under the map does the same
// from the keyboard, and the picked stand shows its numbers and its models.

const d = adminEventsSr.analytics;
const v = d.v2.heat;

const loadHeatMap3D = () => lazy(() => import("@/components/admin/events/analytics/heat-map-3d"));
// React keeps a rejected import for good, so after a failure the next choice of „3D“ gets a fresh lazy (and a fresh request).
let HeatMap3D = loadHeatMap3D();

/** A 3D chunk that does not load (or a scene that throws) hands the page back to the 2D map instead of taking the frame down. */
class Heat3DBoundary extends Component<{ onFailed: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    HeatMap3D = loadHeatMap3D();
    this.props.onFailed();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type View = "2d" | "3d";

const standLabel = (geometry: FairMapGeometry | null, locationId: string) =>
  geometry?.zones.flatMap((zone) => zone.locations).find((location) => location.id === locationId)?.label ?? locationId;

const zoneName = (zoneId: string) => (v.zones as Record<string, string>)[zoneId] ?? zoneId;

function HeatMap2D({ geometry, zoneIds, rows, picked, onPick, tooltip }: {
  geometry: FairMapGeometry;
  /** The zones to draw (the ones with a scan; all of them while there is none). */
  zoneIds: readonly string[];
  rows: readonly AnalyticsHeatRow[];
  picked: string | null;
  onPick: (locationId: string | null) => void;
  tooltip: (row: AnalyticsHeatRow) => string;
}) {
  const byLocation = useMemo(() => new Map(rows.map((row) => [row.locationId, row])), [rows]);
  const zones = geometry.zones.filter((zone) => zoneIds.includes(zone.id));
  return (
    <div data-heat-2d="" className={cn("grid min-w-0 gap-3", zones.length > 1 ? "@3xl:grid-cols-2" : "mx-auto w-full max-w-3xl")}>
      {zones.map((zone) => (
        <figure key={zone.id} className="m-0 min-w-0 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)]">
          <svg viewBox={`0 0 ${zone.image.width} ${zone.image.height}`} className="block h-auto w-full" role="group" aria-label={zoneName(zone.id)}>
            {zone.outline ? <polygon points={fairMapPointsAttr(zone.outline)} fill="var(--admin-surface-strong)" stroke="var(--admin-border)" strokeWidth={zone.image.width / 300} /> : null}
            {zone.locations.filter(fairMapLocationTakesStands).map((location) => {
              const row = byLocation.get(location.id);
              const [lx, ly] = fairMapLabelPoint(location.polygon);
              const bounds = fairMapBounds(location.polygon);
              const size = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
              const font = Math.max(zone.image.width / 70, Math.min(size * 0.28, zone.image.width / 34));
              const on = picked === location.id;
              return (
                <g
                  key={location.id}
                  tabIndex={row ? 0 : undefined}
                  role={row ? "button" : undefined}
                  aria-label={row ? tooltip(row) : undefined}
                  aria-pressed={row ? on : undefined}
                  // The keyboard focus is drawn on the outline of the stand (an SVG group has no box for a ring).
                  className={cn("outline-none [&:focus-visible>polygon]:stroke-[var(--admin-focus)] [&:focus-visible>polygon]:[stroke-opacity:1] [&:focus-visible>polygon]:[stroke-width:10px]", row && "cursor-pointer")}
                  onClick={() => row && onPick(on ? null : location.id)}
                  onKeyDown={(event) => {
                    if (row && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onPick(on ? null : location.id);
                    }
                  }}
                >
                  {row ? <title>{tooltip(row)}</title> : null}
                  <polygon
                    points={fairMapPointsAttr(location.polygon)}
                    fill={row ? fairHeatColor(row.level) : "var(--admin-surface-strong)"}
                    fillOpacity={row ? 0.9 : 1}
                    stroke={on ? "var(--admin-text)" : "var(--admin-text-muted)"}
                    strokeOpacity={on ? 1 : 0.45}
                    strokeWidth={(on ? 4 : 1.5) * (zone.image.width / 600)}
                  />
                  {row ? (
                    // The count sits on a heat colour: dark ink with a light halo reads on every step of the scale.
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={800} fill="#121413" stroke="#ffffff" strokeWidth={font / 5} paintOrder="stroke">
                      {formatCount(row.count)}
                    </text>
                  ) : (
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={font * 0.8} fill="var(--admin-text-muted)">{location.label}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </figure>
      ))}
    </div>
  );
}

function StandDetail({ stand, heat, models, onOpenModel, onClose }: {
  stand: StandRank;
  heat: AnalyticsHeatRow | undefined;
  models: readonly LeaderRow[];
  onOpenModel: (modelId: string) => void;
  onClose: () => void;
}) {
  const figures: Array<[string, string]> = [
    [d.columns.scans, formatCount(stand.scans)],
    [d.v2.stands.today, formatCount(stand.scansToday)],
    [d.columns.unique, formatCount(stand.uniquePerModel)],
    [d.columns.visitors, formatCount(stand.visitors)],
    [d.columns.leads, formatCount(stand.leads)],
    [d.columns.conversion, formatShare(stand.conversion)],
  ];
  return (
    <section data-stand-detail={stand.standCode} aria-label={fmt(v.standTitle, { stand: stand.standCode })} className="grid min-w-0 gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="text-lg leading-6 font-bold">{fmt(v.standTitle, { stand: stand.standCode })}</h3>
          <p className="text-sm text-[var(--admin-text-muted)] [overflow-wrap:anywhere]">
            {fmt(v.standExhibitors, { exhibitors: stand.exhibitors.join(", ") })}
            {heat ? ` · ${fmt(d.heatTooltip, { stand: stand.standCode, count: formatCount(heat.count), share: formatShare(heat.share) })}` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={v.standClose} className={cn("inline-flex size-11 flex-none items-center justify-center rounded-lg text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)] lg:size-9", chartFocusRing)}>
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <dl className="grid min-w-0 grid-cols-3 gap-x-4 gap-y-2 text-sm @2xl:grid-cols-6">
        {figures.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-[var(--admin-text-muted)]">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid min-w-0 gap-1">
        <h4 className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{v.standModels}</h4>
        {models.length ? (
          <ul className="grid min-w-0 @2xl:grid-cols-2 @2xl:gap-x-4">
            {models.map((model) => {
              const name = `${model.brandName} ${model.name}`.trim();
              return (
                <li key={model.eventModelId} className="min-w-0 border-t border-[var(--admin-border)]">
                  <button
                    type="button"
                    onClick={() => onOpenModel(model.eventModelId)}
                    aria-label={fmt(d.v2.leaderboard.open, { model: name })}
                    className={cn("flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md px-1 text-left text-sm hover:bg-[var(--admin-surface-muted)] lg:min-h-9", chartFocusRing)}
                  >
                    <span className="min-w-0 truncate font-semibold">{name}</span>
                    <span className="flex-none tabular-nums">{formatCount(model.scans.total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{v.standNoModels}</p>}
      </div>
    </section>
  );
}

export function HallHeatMap({ eventCode, data, stands, models, picked, onPick, onOpenModel }: {
  eventCode: string;
  data: AnalyticsData;
  /** The stand ranking and the model leaderboard of the page (the detail of a picked stand reads them). */
  stands: readonly StandRank[];
  models: readonly LeaderRow[];
  picked: string | null;
  onPick: (locationId: string | null) => void;
  onOpenModel: (modelId: string) => void;
}) {
  const [period, setPeriod] = useState<FairHeatPeriod>("today");
  const [view, setView] = useState<View>("2d");
  // Why the 3D view is not shown: the browser cannot draw it, or its code did not load.
  const [fallback, setFallback] = useState<"unavailable" | "failed" | null>(null);
  const geometry = fairMapForEventCode(eventCode);
  const rows = data.heat[period];
  const byLocation = useMemo(() => new Map(rows.map((row) => [row.locationId, row])), [rows]);
  const tooltip = (row: AnalyticsHeatRow) => fmt(d.heatTooltip, { stand: standLabel(geometry, row.locationId), count: formatCount(row.count), share: formatShare(row.share) });
  // Height of a block: today's scans; for the last hour there is no scan count, so the unique count of the hour.
  const heights = useMemo(() => (period === "today" ? locationScans(data.models, "today") : new Map(rows.map((row) => [row.locationId, row.count]))), [period, data.models, rows]);
  // A zone of the map without a scan is not drawn (on a phone it would be a screen of empty stands): it is named under the map.
  const zoneIds = useMemo(() => {
    if (!geometry) return [];
    const hot = heatZoneIds(geometry, rows);
    return hot.length ? hot : geometry.zones.map((zone) => zone.id);
  }, [geometry, rows]);
  const quietZones = geometry ? geometry.zones.filter((zone) => !zoneIds.includes(zone.id)).map((zone) => zoneName(zone.id)) : [];
  const scene = useMemo(() => (geometry ? heatBlocks(geometry, rows, heights, zoneIds) : null), [geometry, rows, heights, zoneIds]);
  const heightUnit = period === "today" ? d.v2.units.scans : d.v2.units.uniques;
  const stand = picked ? stands.find((row) => row.locationId === picked) : undefined;
  const show3d = view === "3d" && scene !== null;

  return (
    <ChartFrame
      id="mapa"
      title={v.title}
      question={v.question}
      actions={(
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ChartSegmented label={d.heatTitle} value={period} onChange={setPeriod} options={[{ value: "today", label: d.heatPeriodToday }, { value: "hour", label: d.heatPeriodHour }]} />
          {geometry ? (
            <ChartSegmented
              label={v.viewLabel}
              value={view}
              onChange={(next) => {
                setFallback(null);
                setView(next);
              }}
              options={[{ value: "2d", label: v.view2d }, { value: "3d", label: v.view3d }]}
            />
          ) : null}
        </div>
      )}
      legend={(
        <p aria-hidden="true" className="flex min-w-0 max-w-80 items-center gap-2 text-xs text-[var(--admin-text-muted)]">
          <span>{d.heatLegendLess}</span>
          <span className="h-2.5 min-w-16 flex-1 rounded-full" style={{ backgroundImage: fairHeatGradientCss() }} />
          <span>{d.heatLegendMore}</span>
        </p>
      )}
      note={d.heatIntro}
      table={rows.length ? {
        caption: v.title,
        columns: [d.columns.stand, d.columns.unique, d.v2.table.share, v.columnHeight],
        rows: rows.map((row) => [standLabel(geometry, row.locationId), row.count, formatShare(row.share), heights.get(row.locationId) ?? null]),
      } : undefined}
    >
      {fallback ? <p role="status" data-heat-fallback="" data-heat-reason={fallback} className="text-sm text-[var(--admin-text-muted)]">{fallback === "failed" ? v.failed3d : v.unavailable3d}</p> : null}
      {rows.length === 0 ? <p className="text-sm text-[var(--admin-text-muted)]">{d.heatEmpty}</p> : null}
      {show3d && scene ? (
        <>
          <Heat3DBoundary onFailed={() => {
            setFallback("failed");
            setView("2d");
          }}>
          <Suspense fallback={<p role="status" className="flex h-[20rem] items-center justify-center rounded-xl border border-[var(--admin-border)] text-sm text-[var(--admin-text-muted)] @2xl:h-[28rem]">{v.loading3d}</p>}>
            <HeatMap3D
              scene={scene}
              picked={picked}
              onPick={onPick}
              onUnavailable={() => {
                setFallback("unavailable");
                setView("2d");
              }}
              label={v.canvasLabel}
              resetLabel={v.reset3d}
              blockLabel={(block) => fmt(v.blockLabel, { stand: block.label, value: countOf(block.value, heightUnit) })}
            />
          </Suspense>
          </Heat3DBoundary>
          <p className="text-xs leading-5 text-[var(--admin-text-muted)]">{fmt(period === "today" ? v.heightToday : v.heightHour, { max: formatCount(scene.maxValue) })} {v.help3d}</p>
        </>
      ) : geometry ? (
        <HeatMap2D geometry={geometry} zoneIds={zoneIds} rows={rows} picked={picked} onPick={onPick} tooltip={tooltip} />
      ) : null}
      {quietZones.length ? <p data-heat-quiet="" className="text-xs text-[var(--admin-text-muted)]">{fmt(v.zonesEmpty, { zones: quietZones.join(", ") })}</p> : null}
      {rows.length ? (
        <div className="grid min-w-0 gap-1.5">
          <h3 className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{v.standsTitle}</h3>
          <ul className="grid min-w-0 gap-1 @2xl:grid-cols-2">
            {rows.map((row) => {
              const on = picked === row.locationId;
              return (
                <li key={row.locationId} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onPick(on ? null : row.locationId)}
                    className={cn("flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1 text-left text-sm tabular-nums lg:min-h-9", on ? "border-[var(--admin-text)]" : "border-transparent hover:bg-[var(--admin-surface-muted)]", chartFocusRing)}
                  >
                    <span aria-hidden="true" className="size-3 flex-none rounded-[2px]" style={{ background: fairHeatColor(row.level) }} />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{fmt(v.standRow, { stand: standLabel(geometry, row.locationId), count: countOf(row.count, d.v2.units.uniques), share: formatShare(row.share) })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {stand ? (
        <StandDetail
          stand={stand}
          heat={byLocation.get(stand.locationId)}
          models={models.filter((model) => (model.mapLocationId || model.standCode) === stand.locationId && model.scans.total > 0)}
          onOpenModel={onOpenModel}
          onClose={() => onPick(null)}
        />
      ) : rows.length ? <p className="text-xs text-[var(--admin-text-muted)]">{v.standPick}</p> : null}
    </ChartFrame>
  );
}
