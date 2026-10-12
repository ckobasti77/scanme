"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { AdminOdometer } from "@/components/admin/admin-ui/admin-odometer";
import { ChartFrame, MiniBars, type ChartTableData } from "@/components/admin/events/analytics/chart-kit";
import { RecordBadge } from "@/components/admin/events/analytics/records";
import { formatCount, formatShare, formatSigned, hourLabel } from "@/lib/admin-v2/analytics/format";
import { kpiStrip, type KpiDelta, type KpiTile } from "@/lib/admin-v2/analytics/kpi";
import { fairRecords, type FairRecords } from "@/lib/admin-v2/analytics/records";
import type { AnalyticsData, AudienceData, EngagementData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — „Koliko je danas i kuda ide?“: four big numbers (scans, unique
// per model, visitors, leads) for the reference day with a small trend per fair
// day and the difference to the day before, then four quieter totals that have
// no day series. A zero that is a problem (no lead while there are scans) wears
// an icon and a sentence; a fall is muted, never red. A part that has not
// arrived yet reads „—“, never 0.

const d = adminEventsSr.analytics;
const v = d.v2.kpi;
/** Growth from this share on wears the success colour; a point or two up is not news. */
const GROWTH_SHARE = 0.05;

/** The sentence under the number: the difference to the day before, with the share when the day before had something. */
function deltaText(delta: KpiDelta): string {
  const base = delta.basis === "sameTime" && delta.hour !== null
    ? fmt(v.deltaSameTime, { diff: formatSigned(delta.diff), hour: hourLabel(delta.hour) })
    : fmt(v.deltaFullDay, { diff: formatSigned(delta.diff) });
  return delta.ratio === null ? base : `${base} ${fmt(v.deltaPercent, { percent: formatShare(Math.abs(delta.ratio)) })}`;
}

function Delta({ delta }: { delta: KpiDelta }) {
  if (delta.diff === 0) return <p data-kpi-delta="" className="text-xs text-[var(--admin-text-muted)]">{v.deltaNone}</p>;
  const up = delta.diff > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p data-kpi-delta="" className={cn("inline-flex min-w-0 items-center gap-1 text-xs font-semibold", up && (delta.ratio === null || delta.ratio >= GROWTH_SHARE) ? "text-[var(--admin-success)]" : "text-[var(--admin-text-muted)]")}>
      <Icon aria-hidden="true" className="size-3.5 flex-none" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{deltaText(delta)}</span>
    </p>
  );
}

function Tile({ tile, dayIndex, dayLabels, firstLead }: { tile: KpiTile; dayIndex: number; dayLabels: readonly string[]; firstLead: FairRecords["firstLead"] }) {
  const label = d.kpi[tile.id];
  const running = dayIndex >= 0;
  const trend = tile.trend;
  const big = running ? tile.today : tile.total;
  return (
    <div data-kpi-tile={tile.id} className="grid min-w-0 content-start gap-1.5 bg-[var(--admin-surface)] p-3 @md:p-4">
      {/* The one name that says nothing by itself gets its definition on hover. */}
      <dt title={tile.id === "uniquePerModel" ? d.definitions.uniquePerModel : undefined} className="text-xs font-semibold text-[var(--admin-text-muted)]">{label}</dt>
      <dd className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span data-kpi-value="" className="text-[1.75rem] leading-none font-semibold tracking-[-0.02em] @md:text-[2rem]">
              {big === null ? formatCount(big) : <AdminOdometer value={big} />}
            </span>
            {tile.problem ? <AlertTriangle aria-hidden="true" className="size-5 flex-none text-[var(--admin-danger)]" /> : null}
          </div>
          {trend ? (
            <MiniBars
              values={trend}
              highlight={dayIndex >= 0 ? dayIndex : undefined}
              label={fmt(v.trendAria, { label, values: trend.map((value, index) => fmt(v.trendPoint, { day: dayLabels[index], value: formatCount(value) })).join(", ") })}
            />
          ) : null}
        </div>
        <p className="text-xs text-[var(--admin-text-muted)]">
          {running ? `${v.today} · ${fmt(v.totalHint, { total: formatCount(tile.total) })}` : v.total}
        </p>
        {/* A zero that is a problem says so once; "the same as the day before" would say it twice. */}
        {running && tile.delta && !tile.problem ? <Delta delta={tile.delta} /> : null}
        {tile.problem ? <p data-kpi-problem="" className="text-xs font-semibold">{v.leadsZero}</p> : null}
        {tile.capped ? <p className="text-xs text-[var(--admin-text-muted)]">{d.capped}</p> : null}
        {tile.id === "leads" && firstLead ? <RecordBadge label={d.v2.records.firstLead} value={fmt(d.v2.records.firstLeadValue, { day: firstLead.dayLabel })} className="justify-self-start" /> : null}
      </dd>
    </div>
  );
}

export function KpiStrip({ data, audience, engagement, records }: {
  data: AnalyticsData;
  audience: AudienceData | undefined;
  engagement: EngagementData | undefined;
  /** The records of the page (`fairRecords`); worked out here when the caller has none. */
  records?: FairRecords;
}) {
  const strip = useMemo(() => kpiStrip(data, audience, engagement), [data, audience, engagement]);
  const firstLead = useMemo(() => (records ?? fairRecords(data, engagement)).firstLead, [records, data, engagement]);
  const table: ChartTableData = {
    caption: d.kpiTitle,
    columns: [d.kpiTitle, ...strip.dayLabels, d.v2.table.total],
    rows: strip.tiles.map((tile) => [d.kpi[tile.id], ...(tile.trend ?? strip.dayLabels.map(() => null)), tile.total]),
  };
  const more = [
    { key: "votes", label: d.kpi.votes, value: data.kpis.audienceVotes as number | null, hint: d.kpi.votesHint },
    { key: "surveys", label: d.kpi.surveys, value: data.kpis.surveys.total as number | null, hint: d.kpi.surveysHint },
    { key: "stamps", label: d.kpi.stamps, value: audience?.stamps.total ?? null, hint: audience ? fmt(d.kpi.stampsHint, { passports: formatCount(audience.stamps.passportsCompleted) }) : d.v2.loadingPart },
    { key: "shares", label: d.kpi.shares, value: data.kpis.shares.total as number | null, hint: d.kpi.sharesHint },
  ];
  return (
    <ChartFrame id="brojevi" title={d.kpiTitle} question={v.question} table={table}>
      {/* Two by two on a phone, so the fourth number (the leads) is on the first screen. */}
      <dl className="grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-border)] @4xl:grid-cols-4">
        {strip.tiles.map((tile) => <Tile key={tile.id} tile={tile} dayIndex={strip.dayIndex} dayLabels={strip.dayLabels} firstLead={firstLead} />)}
      </dl>
      <dl aria-label={v.moreTitle} className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 @2xl:grid-cols-4">
        {more.map((item) => (
          <div key={item.key} data-kpi-more={item.key} className="grid min-w-0 gap-0.5">
            <dt className="text-xs font-semibold text-[var(--admin-text-muted)]">{item.label}</dt>
            <dd className="grid min-w-0 gap-0.5">
              <span className="text-lg leading-6 font-semibold">{formatCount(item.value)}</span>
              <span className="text-xs text-[var(--admin-text-muted)] [overflow-wrap:anywhere]">{item.hint}</span>
            </dd>
          </div>
        ))}
      </dl>
    </ChartFrame>
  );
}
