"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChartFrame, ChartSegmented, chartFocusRing, type ChartTableData } from "@/components/admin/events/analytics/chart-kit";
import HeatMap3D from "@/components/admin/events/analytics/heat-map-3d";
import { hallViewStore } from "@/components/admin/events/analytics/hall-view";
import { TimelapseControls } from "@/components/admin/events/analytics/timelapse-controls";
import { TimelapseRank } from "@/components/admin/events/analytics/timelapse-rank";
import { DAY_END, useHallMotion, useHallTimelapse } from "@/components/admin/events/analytics/use-hall-timelapse";
import { countOf, formatCount, formatShare, hourLabel } from "@/lib/admin-v2/analytics/format";
import { heatBlocks, heatZoneIds, locationScans } from "@/lib/admin-v2/analytics/heat-blocks";
import type { LeaderRow } from "@/lib/admin-v2/analytics/leaderboard";
import type { StandRank } from "@/lib/admin-v2/analytics/stands";
import type { AnalyticsData, AnalyticsHeatRow } from "@/lib/admin-v2/analytics/types";
import { ambientRates, scanImpulses } from "@/lib/admin-v2/hall/impulses";
import { clockText, cumulativeAt, dayLevelsAt, hallSeries, hoursAreStale, rankAt, standHoursTable } from "@/lib/admin-v2/hall/timelapse";
import type { HallImpulse, HallRankRow, HallSeries, StandHoursState, TimelapsePlayer, TimelapseStart } from "@/lib/admin-v2/hall/types";
import { formatBelgrade } from "@/lib/belgrade-time";
import { fairHeatColor, fairHeatGradientCss, type FairHeatPeriod } from "@/lib/fair-heat";
import { fairMapBounds, fairMapForEventCode, fairMapLabelPoint, fairMapLocationTakesStands, fairMapPointsAttr, type FairMapGeometry } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 / v3 V3 — „Gde je gužva?“: the hall heat map on the scale of the
// public map (lib/fair-heat.ts), with the exact count and share that only the
// admin sees. On a desktop the Living hall (3D, on the 3D kit) is what opens;
// 2D stays a choice, the fallback and the phone view. Under the map is the
// Vremeplov: a fair day hour by hour, „Premotaj dan“ replays it in about 12
// seconds, and the rank of the stands and the numbers follow in the same
// rhythm. Both views pick a stand; the list under the map does the same from
// the keyboard, and the picked stand shows its numbers and its models.

const d = adminEventsSr.analytics;
const v = d.v2.heat;
const w = d.v2.timelapse;

const NO_IMPULSES: readonly HallImpulse[] = [];

const standLabel = (geometry: FairMapGeometry | null, locationId: string) =>
  geometry?.zones.flatMap((zone) => zone.locations).find((location) => location.id === locationId)?.label ?? locationId;

const zoneName = (zoneId: string) => (v.zones as Record<string, string>)[zoneId] ?? zoneId;

function HeatMap2D({ geometry, zoneIds, rows, picked, onPick, tooltip, pings, fit = false }: {
  geometry: FairMapGeometry;
  /** The zones to draw (the ones with a scan; all of them while there is none). */
  zoneIds: readonly string[];
  rows: readonly AnalyticsHeatRow[];
  picked: string | null;
  onPick: (locationId: string | null) => void;
  tooltip: (row: AnalyticsHeatRow) => string;
  /** The stands with a new scan in the last poll: a ring goes out from each (a new key is a new ring). */
  pings?: { key: number; ids: ReadonlySet<string> };
  /** The picture inside the box of the 3D hall (while it loads): it fits the box and takes no focus. */
  fit?: boolean;
}) {
  const byLocation = useMemo(() => new Map(rows.map((row) => [row.locationId, row])), [rows]);
  const zones = geometry.zones.filter((zone) => zoneIds.includes(zone.id));
  return (
    <div
      data-heat-2d={fit ? undefined : ""}
      data-heat-flat={fit ? "" : undefined}
      aria-hidden={fit || undefined}
      className={fit ? "flex h-full min-w-0 items-stretch justify-center gap-3 p-3" : cn("grid min-w-0 gap-3", zones.length > 1 ? "@3xl:grid-cols-2" : "mx-auto w-full max-w-3xl")}
    >
      {zones.map((zone) => (
        <figure key={zone.id} className={fit ? "relative m-0 min-w-0 flex-1" : "m-0 min-w-0 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)]"}>
          <svg viewBox={`0 0 ${zone.image.width} ${zone.image.height}`} className={fit ? "absolute inset-0 block h-full w-full" : "block h-auto w-full"} role={fit ? undefined : "group"} aria-label={fit ? undefined : zoneName(zone.id)}>
            {zone.outline ? <polygon points={fairMapPointsAttr(zone.outline)} fill={fit ? "var(--admin-surface-muted)" : "var(--admin-surface-strong)"} stroke="var(--admin-border)" strokeWidth={zone.image.width / 300} /> : null}
            {zone.locations.filter(fairMapLocationTakesStands).map((location) => {
              const row = byLocation.get(location.id);
              const [lx, ly] = fairMapLabelPoint(location.polygon);
              const bounds = fairMapBounds(location.polygon);
              const size = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
              const font = Math.max(zone.image.width / 70, Math.min(size * 0.28, zone.image.width / 34));
              const on = picked === location.id;
              const active = row && !fit;
              return (
                <g
                  key={location.id}
                  tabIndex={active ? 0 : undefined}
                  role={active ? "button" : undefined}
                  aria-label={active ? tooltip(row) : undefined}
                  aria-pressed={active ? on : undefined}
                  // The keyboard focus is drawn on the outline of the stand (an SVG group has no box for a ring).
                  className={cn("outline-none [&:focus-visible>polygon]:stroke-[var(--admin-focus)] [&:focus-visible>polygon]:[stroke-opacity:1] [&:focus-visible>polygon]:[stroke-width:10px]", active && "cursor-pointer")}
                  onClick={() => active && onPick(on ? null : location.id)}
                  onKeyDown={(event) => {
                    if (active && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onPick(on ? null : location.id);
                    }
                  }}
                >
                  {active ? <title>{tooltip(row)}</title> : null}
                  <polygon
                    points={fairMapPointsAttr(location.polygon)}
                    fill={row ? fairHeatColor(row.level) : "var(--admin-surface-strong)"}
                    fillOpacity={row ? 0.9 : 1}
                    stroke={on ? "var(--admin-text)" : "var(--admin-text-muted)"}
                    strokeOpacity={on ? 1 : 0.45}
                    strokeWidth={(on ? 4 : 1.5) * (zone.image.width / 600)}
                  />
                  {row && pings?.ids.has(location.id) ? (
                    <circle key={pings.key} aria-hidden="true" className="admin-hall-ping" cx={lx} cy={ly} r={Math.max(size * 0.5, zone.image.width / 24)} fill="none" stroke="var(--admin-nav-line)" strokeWidth={zone.image.width / 150} />
                  ) : null}
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

/**
 * The caption under the 3D scene. It says one of a few texts depending on the mode; the others are laid in the same
 * grid cell, invisible and hidden from a screen reader, so the block is always as high as the longest of them.
 */
export function HallCaption({ shown, reserve }: { shown: string; reserve: readonly string[] }) {
  return (
    <div className="grid text-xs leading-5 text-[var(--admin-text-muted)]">
      <p className="col-start-1 row-start-1">{shown}</p>
      {reserve.filter((text) => text !== shown).map((text) => (
        <p key={text} aria-hidden="true" className="invisible col-start-1 row-start-1">{text}</p>
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

/** The stands of a day at a moment as the rows the 2D map and the lists read: scans so far, their share and the heat of the day so far. */
function momentRows(series: HallSeries, moment: number): AnalyticsHeatRow[] {
  const levels = dayLevelsAt(series, moment);
  // A stand is on the map from its first whole scan (the running hour is spread evenly, so it starts with a fraction).
  const scans = series.stands.map((stand) => ({ stand, value: cumulativeAt(stand.scans, moment, series.end) })).filter((row) => Math.round(row.value) >= 1);
  const total = scans.reduce((sum, row) => sum + row.value, 0);
  return scans.map(({ stand, value }) => ({
    locationId: stand.locationId,
    count: Math.round(value),
    share: total > 0 ? Math.round((value / total) * 1000) / 1000 : 0,
    level: Math.round((levels.get(stand.locationId) ?? 0) * 100) / 100,
  }));
}

/** The rank at a moment: while a replay runs the order changes on the hour and the numbers in between. */
function momentRank(series: HallSeries, moment: number, playing: boolean): HallRankRow[] {
  // A stand enters the rank with its first whole scan. Every stand with a scan is listed: in the Vremeplov the rank
  // is the keyboard path to a stand (the canvas has none).
  const rows = rankAt(series, playing ? Math.floor(moment) : moment).filter((row) => row.scans >= 1);
  if (!playing) return rows;
  const standOf = new Map(series.stands.map((stand) => [stand.locationId, stand]));
  return rows.map((row) => ({ ...row, scans: Math.round(cumulativeAt(standOf.get(row.locationId)?.scans ?? [], moment, series.end)) }));
}

export function HallHeatMap({ eventCode, data, stands, models, picked, onPick, onOpenModel, standHours, timelapseStart }: {
  eventCode: string;
  data: AnalyticsData;
  /** The stand ranking and the model leaderboard of the page (the detail of a picked stand reads them). */
  stands: readonly StandRank[];
  models: readonly LeaderRow[];
  picked: string | null;
  onPick: (locationId: string | null) => void;
  onOpenModel: (modelId: string) => void;
  /** V3 — the hourly read of a fair day; without it there is no Vremeplov and the columns have no layers. */
  standHours?: StandHoursState;
  /** Dev preview: `?vremeplov=<hour>|auto`. */
  timelapseStart?: TimelapseStart;
}) {
  const [period, setPeriod] = useState<FairHeatPeriod>("today");
  const view = useSyncExternalStore(hallViewStore.subscribe, hallViewStore.get, hallViewStore.getServer);
  // Why the 3D view is not shown: the browser cannot draw it, or its code did not load.
  const [unavailable, setUnavailable] = useState(false);
  const motion = useHallMotion();
  const geometry = fairMapForEventCode(eventCode);

  // --- the Vremeplov: the day, its series, the player ---------------------------------------------
  const days = useMemo(() => data.days.filter((day) => day.dateKey <= data.todayKey).map((day) => ({ dateKey: day.dateKey, label: day.label })), [data.days, data.todayKey]);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const dateKey = chosenDay ?? (days.some((day) => day.dateKey === data.todayKey) ? data.todayKey : days.at(-1)?.dateKey ?? null);
  const request = standHours?.request;
  useEffect(() => {
    if (dateKey && request) request(dateKey);
  }, [dateKey, request]);
  const read = standHours && standHours.dateKey === dateKey ? standHours.data : undefined;
  const latest = useMemo(() => (read ? hallSeries(read) : null), [read]);
  // A replay runs on the hours it started with: a fresh read of the open day that arrives meanwhile would move its clock.
  const [held, setHeld] = useState<HallSeries | null>(null);
  const series = held ?? latest;
  const { player, t, dispatch, park } = useHallTimelapse(series?.end ?? 0, motion);
  /** The shown moment of the chosen day; null = the live picture. */
  const moment = series && t !== null ? t : null;
  const playing = player.mode === "playing";
  if (playing && held === null && latest) setHeld(latest);
  if (!playing && held !== null) setHeld(null);
  // The layers of the live hall are the hours of the open day: they are read again when a poll has moved into a
  // new hour (at most once an hour), so a column never shows only the morning in the afternoon.
  const readAt = read?.at;
  useEffect(() => {
    if (!request || !dateKey || dateKey !== data.todayKey || readAt === undefined) return;
    if (hoursAreStale(data.at, readAt)) request(dateKey, true);
  }, [request, dateKey, data.todayKey, data.at, readAt]);
  // „Otvori Vremeplov“ of Pregled leads to `#mapa`: the hall is not in the page until the read arrives, so it is brought up here.
  useEffect(() => {
    if (window.location.hash === "#mapa") document.getElementById("mapa")?.scrollIntoView({ block: "start" });
  }, []);
  // What the 3D scene follows. With motion it computes the moment of a replay itself, every frame; without it
  // (reduced motion, the quiet mode) the replay jumps hour by hour, so the scene is handed each hour as it comes.
  const scenePlayer = useMemo<TimelapsePlayer | undefined>(
    () => (moment === null ? undefined : playing && !motion ? { mode: "paused", t: moment } : player),
    [moment, playing, motion, player],
  );
  const [announcement, setAnnouncement] = useState("");
  const announce = (at: number) => {
    if (!series) return;
    const leader = rankAt(series, at, 1)[0];
    const time = clockText(series, at);
    setAnnouncement(leader && leader.scans >= 1 ? fmt(w.announce, { time, stand: leader.label, count: countOf(leader.scans, d.v2.units.scans) }) : fmt(w.announceEmpty, { time }));
  };
  // Dev preview: `?vremeplov=<hour>` opens the day at that hour, `?vremeplov=auto` replays it; once, when the series is there.
  const started = useRef(false);
  useEffect(() => {
    if (!timelapseStart || !series || series.end <= 0 || started.current) return;
    started.current = true;
    if (timelapseStart === "auto") dispatch({ type: "toggle" });
    else dispatch({ type: "seek", t: timelapseStart.hour - series.hours[0] });
  }, [timelapseStart, series, dispatch]);

  // --- what the map shows ----------------------------------------------------------------------------
  const liveRows = data.heat[period];
  const rows = useMemo(() => (series && moment !== null ? momentRows(series, moment) : liveRows), [series, moment, liveRows]);
  const byLocation = useMemo(() => new Map(rows.map((row) => [row.locationId, row])), [rows]);
  const tooltip = (row: AnalyticsHeatRow) => fmt(d.heatTooltip, { stand: standLabel(geometry, row.locationId), count: formatCount(row.count), share: formatShare(row.share) });
  // Height of a block: today's scans; for the last hour there is no scan count, so the unique count of the hour.
  const heights = useMemo(() => (period === "today" ? locationScans(data.models, "today") : new Map(liveRows.map((row) => [row.locationId, row.count]))), [period, data.models, liveRows]);
  // A zone of the map without a scan is not drawn (on a phone it would be a screen of empty stands): it is named under the map.
  const zoneIds = useMemo(() => {
    if (!geometry) return [];
    const hot = heatZoneIds(geometry, [...liveRows, ...(series?.stands.map((stand) => ({ locationId: stand.locationId, count: 0, share: 0, level: 0 })) ?? [])]);
    return hot.length ? hot : geometry.zones.map((zone) => zone.id);
  }, [geometry, liveRows, series]);
  const quietZones = geometry ? geometry.zones.filter((zone) => !zoneIds.includes(zone.id)).map((zone) => zoneName(zone.id)) : [];
  const scene = useMemo(() => (geometry ? heatBlocks(geometry, liveRows, heights, zoneIds) : null), [geometry, liveRows, heights, zoneIds]);
  const heightUnit = period === "today" ? d.v2.units.scans : d.v2.units.uniques;
  const stand = picked ? stands.find((row) => row.locationId === picked) : undefined;
  const show3d = view === "3d" && scene !== null;
  const rank = useMemo(() => (series && moment !== null ? momentRank(series, moment, playing) : null), [series, moment, playing]);
  const unit = moment !== null ? d.v2.units.scans : d.v2.units.uniques;

  // --- what happens now: the new scans of a poll and the calm state ------------------------------------
  const scansNow = useMemo(() => locationScans(data.models, "today"), [data.models]);
  const [seen, setSeen] = useState<{ day: string; scans: ReadonlyMap<string, number>; impulses: readonly HallImpulse[]; burst: number }>({ day: data.todayKey, scans: scansNow, impulses: NO_IMPULSES, burst: 0 });
  if (seen.scans !== scansNow) {
    // A poll arrived: what grew since the previous one is news (the first read and a new day are a state).
    const next = seen.day === data.todayKey ? scanImpulses(seen.scans, scansNow) : [];
    setSeen({ day: data.todayKey, scans: scansNow, impulses: next.length ? next : seen.impulses, burst: next.length ? seen.burst + 1 : seen.burst });
  }
  const ambient = useMemo(() => ambientRates(new Map(data.heat.hour.map((row) => [row.locationId, row.count]))), [data.heat.hour]);
  const pings = useMemo(() => (motion && moment === null && seen.burst > 0 ? { key: seen.burst, ids: new Set(seen.impulses.map((impulse) => impulse.locationId)) } : undefined), [motion, moment, seen.burst, seen.impulses]);

  // --- the controls ------------------------------------------------------------------------------------
  const status = !dateKey ? "none" : standHours?.error && !series ? "error" : !series ? "loading" : series.end <= 0 || series.stands.length === 0 ? "empty" : "ready";
  const clock = moment !== null && series ? clockText(series, moment) : formatBelgrade(data.at).split(" ").at(-1) ?? "";
  const dayLabel = days.find((day) => day.dateKey === dateKey)?.label ?? "";
  const inTimelapse = moment !== null;
  const table: ChartTableData | undefined = useMemo(() => {
    if (series && inTimelapse) {
      const twin = standHoursTable(series);
      return {
        caption: fmt(w.tableCaption, { day: dayLabel }),
        columns: [w.tableStand, ...twin.hours.map((hour) => fmt(w.tableHour, { hour: String(hour).padStart(2, "0") })), d.v2.table.total],
        rows: twin.rows.map((row) => [row.label, ...row.scans, row.total]),
      };
    }
    if (!liveRows.length) return undefined;
    return {
      caption: v.title,
      columns: [d.columns.stand, d.columns.unique, d.v2.table.share, v.columnHeight],
      rows: liveRows.map((row) => [standLabel(geometry, row.locationId), row.count, formatShare(row.share), heights.get(row.locationId) ?? null]),
    };
  }, [series, inTimelapse, dayLabel, liveRows, geometry, heights]);

  const map2d = (fit: boolean) => (geometry ? <HeatMap2D geometry={geometry} zoneIds={zoneIds} rows={rows} picked={picked} onPick={onPick} tooltip={tooltip} pings={fit ? undefined : pings} fit={fit} /> : null);

  return (
    <ChartFrame
      id="mapa"
      title={v.title}
      question={v.question}
      actions={(
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* A moment of the Vremeplov has no measure to choose: the switch stays in its place, dimmed, so nothing beside it moves. */}
          <ChartSegmented label={d.heatTitle} value={period} onChange={setPeriod} disabled={moment !== null} options={[{ value: "today", label: d.heatPeriodToday }, { value: "hour", label: d.heatPeriodHour }]} />
          {geometry ? (
            <ChartSegmented
              label={v.viewLabel}
              value={view}
              onChange={(next) => {
                setUnavailable(false);
                hallViewStore.set(next);
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
      note={moment === null ? d.heatIntro : undefined}
      table={table}
    >
      {unavailable ? <p role="status" data-heat-fallback="" className="text-sm text-[var(--admin-text-muted)]">{v.unavailable3d}</p> : null}
      {rows.length === 0 && moment === null ? <p className="text-sm text-[var(--admin-text-muted)]">{d.heatEmpty}</p> : null}
      {show3d && scene ? (
        <>
          <HeatMap3D
            scene={scene}
            series={moment !== null ? series : period === "today" && series?.dateKey === data.todayKey ? series : null}
            player={scenePlayer}
            picked={picked}
            onPick={onPick}
            onUnavailable={() => {
              setUnavailable(true);
              hallViewStore.fail();
            }}
            impulses={seen.impulses}
            ambient={ambient}
            label={v.canvasLabel}
            resetLabel={v.reset3d}
            blockLabel={(block) => {
              const value = moment !== null ? byLocation.get(block.locationId)?.count ?? 0 : block.value;
              return value > 0 ? fmt(v.blockLabel, { stand: block.label, value: countOf(value, moment !== null ? d.v2.units.scans : heightUnit) }) : null;
            }}
            fallback={map2d(true)}
            className="h-[20rem] @2xl:h-[24rem] @4xl:h-[28rem] @5xl:h-[30rem]"
          />
          <HallCaption
            shown={moment !== null && series
              ? `${fmt(v.heightMoment, { time: clock, max: formatCount(series.maxTotal) })} ${v.layers} ${v.help3d}`
              : `${fmt(period === "today" ? v.heightToday : v.heightHour, { max: formatCount(scene.maxValue) })}${period === "today" && series?.dateKey === data.todayKey ? ` ${v.layers}` : ""} ${v.help3d}`}
            // Whichever of these is shown, the caption is as high as the longest: a click on „Premotaj dan“ moves nothing.
            reserve={[
              `${fmt(v.heightToday, { max: formatCount(scene.maxValue) })} ${v.layers} ${v.help3d}`,
              `${fmt(v.heightHour, { max: formatCount(scene.maxValue) })} ${v.help3d}`,
              ...(series ? [`${fmt(v.heightMoment, { time: "00:00", max: formatCount(series.maxTotal) })} ${v.layers} ${v.help3d}`] : []),
            ]}
          />
        </>
      ) : map2d(false)}
      {quietZones.length ? <p data-heat-quiet="" className="text-xs text-[var(--admin-text-muted)]">{fmt(v.zonesEmpty, { zones: quietZones.join(", ") })}</p> : null}
      {standHours ? (
        <div data-hall-timelapse="" className="grid min-w-0 gap-3 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-3 @2xl:p-4">
          <TimelapseControls
            days={days}
            dateKey={dateKey}
            onDay={(next) => {
              setChosenDay(next);
              park(DAY_END);
              setAnnouncement("");
            }}
            hours={series?.hours ?? []}
            end={series?.end ?? 0}
            t={moment ?? series?.end ?? 0}
            clock={clock}
            mode={moment === null ? "live" : player.mode}
            onSeek={(at) => {
              dispatch({ type: "seek", t: at });
              announce(at);
            }}
            onToggle={() => {
              // A replay of the open day reads its hours again: scans have arrived since.
              if (!playing && dateKey === data.todayKey) request?.(dateKey, true);
              const next = dispatch({ type: "toggle" });
              if (next.mode === "paused") announce(next.t);
            }}
            onLive={() => {
              dispatch({ type: "live" });
              // The live picture is of the open day: the day switch goes back to it.
              setChosenDay(null);
              setAnnouncement("");
            }}
            status={status}
            onRetry={() => dateKey && request?.(dateKey, true)}
            announcement={announcement}
          />
          {series?.capped && read ? <p data-timelapse-capped="" className="text-xs text-[var(--admin-text-muted)]">{read.unread > 0 ? fmt(w.capped, { unread: formatCount(read.unread) }) : d.v2.capped}</p> : null}
        </div>
      ) : null}
      {rank && series ? (
        <TimelapseRank rows={rank} time={playing && moment !== null ? hourLabel(series.hours[0] + Math.floor(moment)) : clock} max={series.maxTotal} picked={picked} onPick={onPick} />
      ) : rows.length ? (
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
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{fmt(v.standRow, { stand: standLabel(geometry, row.locationId), count: countOf(row.count, unit), share: formatShare(row.share) })}</span>
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
          heat={moment === null ? byLocation.get(stand.locationId) : undefined}
          models={models.filter((model) => (model.mapLocationId || model.standCode) === stand.locationId && model.scans.total > 0)}
          onOpenModel={onOpenModel}
          onClose={() => onPick(null)}
        />
      ) : rows.length ? <p className="text-xs text-[var(--admin-text-muted)]">{v.standPick}</p> : null}
    </ChartFrame>
  );
}
