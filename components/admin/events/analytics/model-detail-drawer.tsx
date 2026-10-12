"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { AdminErrorState } from "@/components/admin/admin-primitives";
import { ChartLegend, ChartTable, HBar, RankMedal, StackedBar } from "@/components/admin/events/analytics/chart-kit";
import { HourMatrixGrid, SequentialScale, matrixTable } from "@/components/admin/events/analytics/day-hour-matrix";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import type { LeaderRow } from "@/lib/admin-v2/analytics/leaderboard";
import { hourMatrix } from "@/lib/admin-v2/analytics/matrix";
import { modelComparison, modelDays, ratingBars } from "@/lib/admin-v2/analytics/model-detail";
import { CHART_OTHER_COLOR, chartColor } from "@/lib/admin-v2/analytics/palette";
import type { AnalyticsData, ModelAnalyticsData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// ADMIN v2 X3 — the detail of one model, opened from the leaderboard in a drawer
// from the right: the numbers (from the row, so they are there at once), how the
// model stands against its stand and the fair, its scans per day (first and
// repeated), per hour, its ratings, the audience's vote and its leads. Only the
// parts below the comparison wait for the model's own read (`detail`).

const d = adminEventsSr.analytics;
const v = d.v2.detail;

const modelName = (row: LeaderRow) => `${row.brandName} ${row.name}`;
const tierLabel = (tier: string) => (d.tiers as Record<string, string>)[tier] ?? tier;
const averageText = (average: number | null) => (average === null ? "—" : average.toLocaleString("sr-RS", { maximumFractionDigits: 2 }));

function Section({ title, question, children }: { title: string; question?: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 content-start gap-3 border-t border-[var(--admin-border)] px-5 py-4 first:border-t-0">
      <div className="grid min-w-0 gap-0.5">
        <h3 id={headingId} className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{title}</h3>
        {question ? <p className="text-base leading-6 font-semibold tracking-[-0.015em]">{question}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Figure({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div data-detail-figure="" className="grid min-w-0 content-start gap-0.5">
      <dt className="text-xs text-[var(--admin-text-muted)]">{label}</dt>
      <dd className="text-2xl leading-8 font-bold">{value}</dd>
      {help ? <dd className="text-xs leading-4 text-[var(--admin-text-muted)]">{help}</dd> : null}
    </div>
  );
}

function CompareRow({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  return (
    <li className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
        <span className="flex-none font-semibold tabular-nums">{formatCount(value)}</span>
      </div>
      <HBar share={max > 0 ? value / max : 0} color={color} />
    </li>
  );
}

function ComparisonSection({ row, data }: { row: LeaderRow; data: AnalyticsData }) {
  const cmp = useMemo(() => modelComparison(row, data), [row, data]);
  return (
    <Section title={v.compareTitle} question={v.compareQuestion}>
      <ul className="grid gap-3">
        <CompareRow label={v.compareModel} value={cmp.model} max={cmp.max} />
        {cmp.standAverage !== null ? <CompareRow label={fmt(v.compareStand, { stand: row.standCode, models: cmp.standModels })} value={cmp.standAverage} max={cmp.max} color={CHART_OTHER_COLOR} /> : null}
        <CompareRow label={fmt(v.compareFair, { models: cmp.fairModels })} value={cmp.fairAverage ?? 0} max={cmp.max} color={CHART_OTHER_COLOR} />
      </ul>
      {cmp.standAverage === null ? <p className="text-sm text-[var(--admin-text-muted)]">{v.compareAlone}</p> : null}
    </Section>
  );
}

function DaysSection({ detail }: { detail: ModelAnalyticsData }) {
  const series = useMemo(() => modelDays(detail), [detail]);
  return (
    <Section title={v.daysTitle} question={v.daysQuestion}>
      {series.days.length ? (
        <>
          <ChartLegend
            label={v.daysTitle}
            items={[
              { key: "unique", label: v.legendUnique, color: chartColor(1) },
              { key: "repeated", label: v.legendRepeated, color: chartColor(2) },
            ]}
          />
          <ul className="grid gap-2">
            {series.days.map((day) => {
              const tip = fmt(v.dayTip, { day: day.label, unique: formatCount(day.unique), repeated: formatCount(day.repeated) });
              return (
                <li key={day.dateKey} className="grid min-w-0 grid-cols-[minmax(3.5rem,5rem)_minmax(0,1fr)_2.5rem] items-center gap-x-3">
                  <span className="min-w-0 truncate text-sm">{day.label}</span>
                  <StackedBar
                    share={series.max > 0 ? day.scans / series.max : 0}
                    label={tip}
                    segments={[
                      { key: "unique", label: v.legendUnique, value: day.unique, color: chartColor(1), tip },
                      { key: "repeated", label: v.legendRepeated, value: day.repeated, color: chartColor(2), tip },
                    ]}
                  />
                  <span className="text-right text-sm font-semibold tabular-nums">{formatCount(day.scans)}</span>
                </li>
              );
            })}
          </ul>
          <ChartTable
            table={{
              caption: v.daysTitle,
              columns: [d.v2.table.day, v.legendUnique, v.legendRepeated, d.columns.scans],
              rows: series.days.map((day) => [day.label, day.unique, day.repeated, day.scans]),
            }}
          />
        </>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{d.noData}</p>}
    </Section>
  );
}

function HoursSection({ detail }: { detail: ModelAnalyticsData }) {
  const matrix = useMemo(() => hourMatrix(detail.days, detail.hours.map((hour) => ({ dateKey: hour.dateKey, hour: hour.hour, value: hour.scans }))), [detail]);
  return (
    <Section title={v.hoursTitle} question={v.hoursQuestion}>
      {matrix.hours.length ? (
        <>
          <SequentialScale max={matrix.max} />
          <HourMatrixGrid matrix={matrix} label={`${v.hoursTitle}: ${v.hoursQuestion}`} />
          <ChartTable table={matrixTable(matrix, v.hoursTitle)} />
        </>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{d.v2.matrix.empty}</p>}
    </Section>
  );
}

function RatingsSection({ detail }: { detail: ModelAnalyticsData }) {
  const bars = useMemo(() => ratingBars(detail), [detail]);
  return (
    <Section title={v.ratingsTitle} question={v.ratingsQuestion}>
      {detail.ratings.count === 0 ? <p className="text-sm text-[var(--admin-text-muted)]">{v.ratingsEmpty}</p> : (
        <>
          <p className="text-sm font-semibold">{fmt(v.ratingsSummary, { average: averageText(detail.ratings.average), count: detail.ratings.count })}</p>
          <ul className="grid gap-1.5">
            {bars.map((bar) => {
              const label = v.ratingBuckets[bar.stars - 1];
              return (
                <li key={bar.stars} aria-label={fmt(v.ratingTip, { label, count: bar.count })} className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_2rem] items-center gap-x-3 text-sm">
                  <span className="text-[var(--admin-text-muted)] tabular-nums">{label}</span>
                  <HBar share={bar.share} />
                  <span className="text-right tabular-nums">{formatCount(bar.count)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Section>
  );
}

function VotesSection({ detail }: { detail: ModelAnalyticsData }) {
  return (
    <Section title={v.votesTitle}>
      {detail.votes.questions.length === 0 ? <p className="text-sm text-[var(--admin-text-muted)]">{v.votesEmpty}</p> : (
        <ul className="grid gap-2">
          {detail.votes.questions.map((question) => (
            <li key={question.prompt} className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 [overflow-wrap:anywhere]">{question.prompt}</span>
              <span className="flex-none font-semibold tabular-nums">{fmt(v.votesCount, { votes: formatCount(question.votes) })}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function LeadsSection({ detail }: { detail: ModelAnalyticsData }) {
  return (
    <Section title={v.leadsTitle}>
      <p className="text-sm text-[var(--admin-text-muted)]">
        {detail.leads.total === 0 ? v.leadsEmpty : fmt(v.leadsLine, { interest: formatCount(detail.leads.interest), testDrive: formatCount(detail.leads.testDrive) })}
      </p>
    </Section>
  );
}

/** The scrolling body of the drawer; the drawer is only its frame (a Radix portal draws nothing on the server). */
export function ModelDetailBody({ row, data, detail, error, onRetry }: {
  row: LeaderRow;
  data: AnalyticsData;
  detail: ModelAnalyticsData | undefined;
  error: boolean;
  onRetry: () => void;
}) {
  const repeated = Math.max(0, row.scans.total - row.uniquePerModel.total);
  return (
    <>
      <Section title={d.kpiTitle}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 @md:grid-cols-3">
          <Figure label={v.kpi.scans} value={formatCount(row.scans.total)} />
          <Figure label={v.kpi.unique} value={formatCount(row.uniquePerModel.total)} />
          <Figure label={v.kpi.repeated} value={formatCount(repeated)} help={v.repeatedHelp} />
          <Figure label={v.kpi.leads} value={formatCount(row.leads)} />
          <Figure label={v.kpi.conversion} value={formatShare(row.conversion)} help={v.conversionHelp} />
          <Figure label={v.kpi.votes} value={formatCount(row.votes)} />
          <Figure label={v.kpi.rating} value={row.rating ? `${averageText(row.rating.average)} (${row.rating.count})` : "—"} />
        </dl>
      </Section>
      <ComparisonSection row={row} data={data} />
      {error ? (
        <div className="border-t border-[var(--admin-border)] px-5">
          <AdminErrorState title={v.errorTitle} body={v.errorBody} retryLabel={v.retry} onRetry={onRetry} className="min-h-0 py-6" />
        </div>
      ) : detail === undefined ? (
        <p data-detail-loading="" role="status" className="border-t border-[var(--admin-border)] px-5 py-4 text-sm text-[var(--admin-text-muted)]">{v.loading}</p>
      ) : (
        <>
          <DaysSection detail={detail} />
          <HoursSection detail={detail} />
          <RatingsSection detail={detail} />
          <VotesSection detail={detail} />
          <LeadsSection detail={detail} />
        </>
      )}
      <p className="border-t border-[var(--admin-border)] px-5 py-4 text-xs leading-5 text-[var(--admin-text-muted)]">{v.garageNote}</p>
    </>
  );
}

export function ModelDetailDrawer({ row, data, detail, error, onRetry, onClose }: {
  /** null = closed. */
  row: LeaderRow | null;
  data: AnalyticsData;
  /** undefined = still loading. */
  detail: ModelAnalyticsData | undefined;
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  // The closing animation still shows the model that was open.
  const [last, setLast] = useState(row);
  if (row && row.eventModelId !== last?.eventModelId) setLast(row);
  const shown = row ?? last;
  return (
    <Sheet open={row !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        data-admin-drawer="detail"
        // Focus starts on the panel (its title is read), not on the first bar of a chart.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
        className="admin-v1 w-[min(100vw,34rem)] gap-0 border-[var(--admin-border)] bg-[var(--admin-app)] p-0 text-[var(--admin-text)] shadow-[var(--admin-shadow-lg)] sm:max-w-none"
      >
        {shown ? (
          <>
            <SheetHeader className="shrink-0 gap-1 border-b border-[var(--admin-border)] py-4 pr-14 pl-5 text-left">
              <div className="flex min-w-0 items-center gap-3">
                <RankMedal rank={shown.rank} medal={shown.medal} label={shown.medal ? d.v2.leaderboard.medals[shown.medal] : fmt(d.v2.leaderboard.place, { rank: shown.rank })} />
                <SheetTitle className="min-w-0 text-lg leading-6 font-semibold tracking-[-0.015em] [overflow-wrap:anywhere]">{modelName(shown)}</SheetTitle>
              </div>
              <SheetDescription className="text-sm text-[var(--admin-text-muted)] [overflow-wrap:anywhere]">
                {`${shown.exhibitorName} · ${fmt(v.meta, { stand: shown.standCode, tier: tierLabel(shown.tier) })}`}
              </SheetDescription>
            </SheetHeader>
            <div className="@container relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <ModelDetailBody row={shown} data={data} detail={row ? detail : undefined} error={row ? error : false} onRetry={onRetry} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
