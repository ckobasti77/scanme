"use client";

import { useMemo } from "react";
import { ChartFrame, ChartLegend, RankMedal, RankMove, StackedBar, chartFocusRing, type LegendItem } from "@/components/admin/events/analytics/chart-kit";
import { RecordBadge } from "@/components/admin/events/analytics/records";
import { countOf, formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { CHART_OTHER_COLOR, entityColors } from "@/lib/admin-v2/analytics/palette";
import type { FairRecords } from "@/lib/admin-v2/analytics/records";
import { standExhibitors, standRanking } from "@/lib/admin-v2/analytics/stands";
import type { AnalyticsData, AudienceData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — „Koji štand privlači i ko je na njemu?“: one row per stand,
// the biggest first. The bar is split by exhibitor (a colour follows the
// exhibitor on every stand); the numbers sit beside it, so no value depends on
// colour or tooltip. A package is a label, not a status, so it has no colour.
// Wide chart: one aligned row with column heads; narrow: numbers under the bar.

const d = adminEventsSr.analytics;
const v = d.v2.stands;
const lb = d.v2.leaderboard;

const numberColumns = "@4xl:[grid-template-columns:minmax(0,1fr)_repeat(5,5.75rem)]";

export function StandRanking({ data, audience, record, onPickStand }: {
  data: AnalyticsData;
  audience: AudienceData | undefined;
  /** The strongest stand of the day (`fairRecords`); its row carries the tag. */
  record?: FairRecords["stand"];
  onPickStand?: (locationId: string) => void;
}) {
  const rows = useMemo(() => standRanking(data, audience), [data, audience]);
  const colors = useMemo(() => entityColors(standExhibitors(data)), [data]);

  const legend = useMemo<LegendItem[]>(() => {
    const items: LegendItem[] = [];
    let hasOther = false;
    for (const [exhibitor, entry] of colors) {
      if (entry.slot === null) hasOther = true;
      else items.push({ key: exhibitor, label: exhibitor, color: entry.color });
    }
    if (hasOther) items.push({ key: "other", label: v.other, color: CHART_OTHER_COLOR });
    return items;
  }, [colors]);

  return (
    <ChartFrame
      id="standovi"
      title={v.title}
      question={v.question}
      legend={<ChartLegend label={v.legendTitle} items={legend} />}
      note={rows.length ? v.rankHelp : undefined}
      table={rows.length ? {
        caption: v.title,
        columns: [d.columns.stand, d.columns.exhibitor, d.columns.scans, d.columns.unique, d.columns.visitors, d.columns.leads, d.columns.conversion],
        rows: rows.map((row) => [row.standCode, row.exhibitors.join(", "), row.scans, row.uniquePerModel, row.visitors, row.leads, formatShare(row.conversion)]),
      } : undefined}
    >
      {rows.length ? (
        <div className="grid min-w-0 gap-1">
          <div aria-hidden="true" className={cn("hidden gap-x-4 px-1 text-xs font-semibold text-[var(--admin-text-muted)] @4xl:grid", numberColumns)}>
            <span>{d.columns.stand}</span>
            <span className="text-right">{d.columns.scans}</span>
            <span className="text-right">{d.columns.unique}</span>
            <span className="text-right">{d.columns.visitors}</span>
            <span className="text-right">{d.columns.leads}</span>
            <span className="text-right">{d.columns.conversion}</span>
          </div>
          <ol data-admin-reveal="rows" className="grid min-w-0">
            {rows.map((row) => (
              <li key={row.locationId} data-stand={row.standCode} className={cn("grid min-w-0 gap-x-4 gap-y-2 border-t border-[var(--admin-border)] px-1 py-3 first:border-t-0 @4xl:items-center", numberColumns)}>
                <div className="grid min-w-0 gap-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex flex-none items-center gap-1">
                      <RankMedal rank={row.rank} medal={row.medal} label={row.medal ? lb.medals[row.medal] : fmt(lb.place, { rank: row.rank })} />
                      <RankMove
                        move={row.move}
                        isNew={row.isNew}
                        labels={{ up: (places) => fmt(lb.moveUp, { places }), down: (places) => fmt(lb.moveDown, { places }), same: lb.moveSame, isNew: lb.moveNew }}
                      />
                    </span>
                    {onPickStand ? (
                      <button
                        type="button"
                        aria-label={fmt(v.open, { stand: row.standCode })}
                        onClick={() => onPickStand(row.locationId)}
                        className={cn("-mx-1 min-h-11 rounded-lg px-1 text-left text-lg leading-6 font-bold lg:min-h-9", "transition-colors duration-100 hover:bg-[var(--admin-surface-muted)]", chartFocusRing)}
                      >
                        {row.standCode}
                      </button>
                    ) : <span className="text-lg leading-6 font-bold">{row.standCode}</span>}
                    <span className="min-w-0 text-sm text-[var(--admin-text-muted)] [overflow-wrap:anywhere]">{row.exhibitors.join(", ")}</span>
                    {row.tiers.map((tier) => (
                      <span key={tier} className="rounded-full border border-[var(--admin-border)] px-1.5 text-[0.6875rem] leading-5 font-semibold text-[var(--admin-text-muted)]">{d.tiers[tier as keyof typeof d.tiers] ?? tier}</span>
                    ))}
                    {record && record.locationId === row.locationId ? (
                      <RecordBadge label={d.v2.records.stand} value={fmt(d.v2.records.standToday, { scans: countOf(record.scansToday, d.v2.units.scans) })} />
                    ) : null}
                  </div>
                  <StackedBar
                    label={`${d.columns.stand} ${row.standCode}`}
                    share={row.share}
                    segments={row.segments.map((segment) => ({
                      key: segment.exhibitor,
                      label: segment.exhibitor,
                      value: segment.scans,
                      color: colors.get(segment.exhibitor)?.color ?? CHART_OTHER_COLOR,
                      tip: fmt(v.segment, { exhibitor: segment.exhibitor, scans: countOf(segment.scans, d.v2.units.scans) }),
                    }))}
                  />
                </div>
                <dl className="grid min-w-0 grid-cols-3 gap-x-4 gap-y-2 text-sm @md:grid-cols-5 @4xl:contents">
                  <div className="min-w-0 @4xl:text-right">
                    <dt className="text-xs text-[var(--admin-text-muted)] @4xl:sr-only">{d.columns.scans}</dt>
                    <dd className="tabular-nums">
                      <span className="font-bold">{formatCount(row.scans)}</span>
                      <span className="block text-xs text-[var(--admin-text-muted)]">{v.today} {formatCount(row.scansToday)}</span>
                    </dd>
                  </div>
                  <div className="min-w-0 @4xl:text-right">
                    <dt className="text-xs text-[var(--admin-text-muted)] @4xl:sr-only">{d.columns.unique}</dt>
                    <dd className="tabular-nums">{formatCount(row.uniquePerModel)}</dd>
                  </div>
                  <div className="min-w-0 @4xl:text-right">
                    <dt className="text-xs text-[var(--admin-text-muted)] @4xl:sr-only">{d.columns.visitors}</dt>
                    <dd className="tabular-nums">{formatCount(row.visitors)}</dd>
                  </div>
                  <div className="min-w-0 @4xl:text-right">
                    <dt className="text-xs text-[var(--admin-text-muted)] @4xl:sr-only">{d.columns.leads}</dt>
                    <dd className={cn("tabular-nums", row.leads === 0 && "text-[var(--admin-text-muted)]")}>{formatCount(row.leads)}</dd>
                  </div>
                  <div className="min-w-0 @4xl:text-right">
                    <dt className="text-xs text-[var(--admin-text-muted)] @4xl:sr-only">{d.columns.conversion}</dt>
                    <dd className={cn("tabular-nums", row.leads === 0 && "text-[var(--admin-text-muted)]")}>{formatShare(row.conversion)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </div>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{d.emptyRanking}</p>}
    </ChartFrame>
  );
}
