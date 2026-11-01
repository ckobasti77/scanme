"use client";

import { useMemo, useState } from "react";
import { ChartFrame, HBar, MiniBars, RankMedal, RankMove, chartFocusRing, type ChartTableData } from "@/components/admin/events/analytics/chart-kit";
import { formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { referenceDayIndex } from "@/lib/admin-v2/analytics/kpi";
import { leaderboard, type LeaderRow } from "@/lib/admin-v2/analytics/leaderboard";
import type { AnalyticsData, AudienceData, EngagementData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — „Ko vodi i ko raste?“: every published model ranked by the scans
// of the whole fair, with medals for the first three, the places gained or lost
// since the end of the day before and the scans of every fair day. One list that
// re-flows with the width of the chart (a wide row is one line of columns, a
// narrow one is three short lines); the name opens the model's detail.

const d = adminEventsSr.analytics;
const v = d.v2.leaderboard;
/** A long fair has a long list: the first places are shown, the rest on demand (the table always has all). */
const LEADER_LIMIT = 10;

// The row is a CSS grid; its cells are placed by area, so the same DOM is both layouts.
const ROW_NARROW = "[grid-template-columns:1.75rem_3rem_minmax(0,1fr)_auto] [grid-template-areas:'rank_move_name_scans'_'bar_bar_bar_bar'_'meta_meta_meta_meta']";
const ROW_WIDE = "@4xl:[grid-template-columns:2rem_3.5rem_minmax(0,1.4fr)_3rem_5rem_3.5rem_minmax(5rem,1fr)_4rem_3.25rem_4rem_5rem] @4xl:[grid-template-areas:'rank_move_name_stand_tier_scans_bar_today_trend_leads_rating']";
const HEAD_WIDE = "@4xl:[grid-template-columns:2rem_3.5rem_minmax(0,1.4fr)_3rem_5rem_3.5rem_minmax(5rem,1fr)_4rem_3.25rem_4rem_5rem] @4xl:[grid-template-areas:'rank_rank_name_stand_tier_scans_scans_today_trend_leads_rating']";

const tierLabel = (tier: string) => (d.tiers as Record<string, string>)[tier] ?? tier;
const ratingText = (row: LeaderRow) => (row.rating ? `${row.rating.average.toLocaleString("sr-RS", { maximumFractionDigits: 2 })} (${row.rating.count})` : null);
const modelName = (row: LeaderRow) => `${row.brandName} ${row.name}`;

function leaderTable(rows: readonly LeaderRow[]): ChartTableData {
  return {
    caption: v.title,
    columns: [v.rank, d.columns.model, d.columns.exhibitor, d.columns.stand, d.columns.tier, d.columns.scans, v.today, d.columns.unique, d.columns.leads, d.columns.conversion, d.columns.votes, d.columns.rating],
    rows: rows.map((row) => [row.rank, modelName(row), row.exhibitorName, row.standCode, tierLabel(row.tier), row.scans.total, row.scans.today, row.uniquePerModel.total, row.leads, formatShare(row.conversion), row.votes, ratingText(row)]),
  };
}

function HeadCell({ area, children, right }: { area: string; children?: string; right?: boolean }) {
  return <span className={cn("min-w-0 truncate", right && "text-right")} style={{ gridArea: area }}>{children}</span>;
}

function LeaderItem({ row, data, onOpen, open }: { row: LeaderRow; data: AnalyticsData; onOpen: (modelId: string) => void; open: boolean }) {
  const model = modelName(row);
  const highlight = referenceDayIndex(data);
  const trendValues = row.trend ? row.trend.map((value, index) => `${data.days[index]?.label ?? index + 1} ${formatCount(value)}`).join(", ") : "";
  const rating = ratingText(row);
  return (
    <li
      data-leader-row=""
      data-open={open ? "" : undefined}
      className={cn("grid items-center gap-x-2 gap-y-1 border-t border-[var(--admin-border)] px-2 py-2 transition-colors duration-100 first:border-t-0 hover:bg-[var(--admin-surface-muted)] data-[open]:bg-[var(--admin-surface-muted)]", ROW_NARROW, ROW_WIDE)}
    >
      <span className="flex items-center" style={{ gridArea: "rank" }}>
        <RankMedal rank={row.rank} medal={row.medal} label={row.medal ? v.medals[row.medal] : fmt(v.place, { rank: row.rank })} />
      </span>
      <span className="flex items-center" style={{ gridArea: "move" }}>
        <RankMove
          move={row.move}
          isNew={row.isNew}
          labels={{ up: (places) => fmt(v.moveUp, { places }), down: (places) => fmt(v.moveDown, { places }), same: v.moveSame, isNew: v.moveNew }}
        />
      </span>
      <div className="min-w-0" style={{ gridArea: "name" }}>
        <button
          type="button"
          aria-label={fmt(v.open, { model })}
          aria-current={open ? "true" : undefined}
          onClick={() => onOpen(row.eventModelId)}
          className={cn("flex min-h-11 w-full min-w-0 items-center rounded-md text-left text-sm font-semibold [overflow-wrap:anywhere] lg:min-h-8", chartFocusRing)}
        >
          {model}
        </button>
        <p className="truncate text-xs text-[var(--admin-text-muted)]">{row.exhibitorName}</p>
      </div>
      <span className="text-right text-sm font-bold tabular-nums" style={{ gridArea: "scans" }}>
        <span className="sr-only">{d.columns.scans}: </span>
        {formatCount(row.scans.total)}
      </span>
      <HBar share={row.share} style={{ gridArea: "bar" }} />
      {/* Narrow: one line under the bar (the `meta` area); wide: its children are cells of the row. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--admin-text-muted)] [grid-area:meta] @4xl:contents">
        <span className="tabular-nums @4xl:text-sm @4xl:text-[var(--admin-text)]" style={{ gridArea: "stand" }}>
          <span className="@4xl:sr-only">{d.columns.stand} </span>
          {row.standCode}
        </span>
        <span className="min-w-0 truncate @4xl:text-sm @4xl:text-[var(--admin-text)]" style={{ gridArea: "tier" }}>
          <span className="sr-only">{d.columns.tier}: </span>
          {tierLabel(row.tier)}
        </span>
        <span className="tabular-nums @4xl:text-right @4xl:text-sm @4xl:text-[var(--admin-text)]" style={{ gridArea: "today" }}>
          <span className="@4xl:sr-only">{v.today} </span>
          {formatCount(row.scans.today)}
        </span>
        {row.trend ? (
          <span className="flex items-center @4xl:justify-center" style={{ gridArea: "trend" }}>
            <MiniBars values={row.trend} highlight={highlight} label={fmt(d.v2.kpi.trendAria, { label: model, values: trendValues })} />
          </span>
        ) : null}
        {/* A zero is quiet, so the rows that have something stand out. */}
        <span className={cn("hidden text-right text-sm tabular-nums @4xl:block", row.leads > 0 && "@4xl:text-[var(--admin-text)]")} style={{ gridArea: "leads" }}>
          <span className="sr-only">{d.columns.leads}: </span>
          {formatCount(row.leads)}
        </span>
        <span className={cn("tabular-nums @4xl:block @4xl:text-right @4xl:text-sm", rating ? "@4xl:text-[var(--admin-text)]" : "hidden")} style={{ gridArea: "rating" }} title={row.rating ? fmt(d.ratingCount, { count: row.rating.count }) : undefined}>
          <span className="@4xl:sr-only">{d.columns.rating} </span>
          {rating ?? "—"}
        </span>
      </div>
    </li>
  );
}

export function ModelLeaderboard({ data, audience, engagement, onOpen, openId }: {
  data: AnalyticsData;
  audience: AudienceData | undefined;
  engagement: EngagementData | undefined;
  onOpen: (modelId: string) => void;
  openId?: string | null;
}) {
  const rows = useMemo(() => leaderboard(data, audience, engagement), [data, audience, engagement]);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LEADER_LIMIT);
  return (
    <ChartFrame id="rang-modela" title={v.title} question={v.question} note={engagement ? v.moveHelp : undefined} table={rows.length ? leaderTable(rows) : undefined}>
      {rows.length ? (
        <div className="min-w-0">
          <div aria-hidden="true" className={cn("hidden gap-x-2 px-2 pb-1 text-xs font-semibold text-[var(--admin-text-muted)] @4xl:grid", HEAD_WIDE)}>
            <HeadCell area="rank">{v.rank}</HeadCell>
            <HeadCell area="name">{d.columns.model}</HeadCell>
            <HeadCell area="stand">{d.columns.stand}</HeadCell>
            <HeadCell area="tier">{d.columns.tier}</HeadCell>
            <HeadCell area="scans">{d.columns.scans}</HeadCell>
            <HeadCell area="today" right>{v.today}</HeadCell>
            <HeadCell area="trend">{v.trend}</HeadCell>
            <HeadCell area="leads" right>{d.columns.leads}</HeadCell>
            <HeadCell area="rating" right>{d.columns.rating}</HeadCell>
          </div>
          <ol data-admin-reveal="rows" className="min-w-0">
            {shown.map((row) => <LeaderItem key={row.eventModelId} row={row} data={data} onOpen={onOpen} open={row.eventModelId === openId} />)}
          </ol>
          {rows.length > LEADER_LIMIT ? (
            <button type="button" data-leader-more="" aria-expanded={all} onClick={() => setAll(!all)} className={cn("mt-1 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold underline underline-offset-4 lg:min-h-9", chartFocusRing)}>
              {all ? fmt(v.showTop, { count: LEADER_LIMIT }) : fmt(v.showAll, { count: rows.length })}
            </button>
          ) : null}
        </div>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{d.emptyRanking}</p>}
    </ChartFrame>
  );
}
