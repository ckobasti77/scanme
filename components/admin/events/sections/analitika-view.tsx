"use client";

import { Download, RefreshCw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { AdminPanel } from "@/components/admin/admin-primitives";
import { adminSecondaryButtonClass } from "@/components/admin/admin-ui";
import { chartFocusRing } from "@/components/admin/events/analytics/chart-kit";
import { DayHourMatrix } from "@/components/admin/events/analytics/day-hour-matrix";
import { DepthOfInterest, PassportProgress } from "@/components/admin/events/analytics/depth";
import { Funnel } from "@/components/admin/events/analytics/funnel";
import { HallHeatMap } from "@/components/admin/events/analytics/heat-map";
import { Insights } from "@/components/admin/events/analytics/insights";
import { KpiStrip } from "@/components/admin/events/analytics/kpi-strip";
import { ModelDetailDrawer } from "@/components/admin/events/analytics/model-detail-drawer";
import { ModelLeaderboard } from "@/components/admin/events/analytics/model-leaderboard";
import { PackageComparison } from "@/components/admin/events/analytics/packages";
import { useRecordToasts } from "@/components/admin/events/analytics/records";
import { useEventHeaderActions } from "@/components/admin/events/event-frame-view";
import { StandRanking } from "@/components/admin/events/analytics/stand-ranking";
import type { EventAnalyticsData, EventAudienceData } from "@/components/admin/events/analytics-logic";
import { deviceSummary } from "@/lib/admin-v2/analytics/devices";
import { formatCount, formatShare, lowerFirst } from "@/lib/admin-v2/analytics/format";
import { leaderboard } from "@/lib/admin-v2/analytics/leaderboard";
import { fairRecords } from "@/lib/admin-v2/analytics/records";
import { standRanking } from "@/lib/admin-v2/analytics/stands";
import type { EngagementData, ModelAnalyticsData } from "@/lib/admin-v2/analytics/types";
import type { StandHoursState, TimelapseStart } from "@/lib/admin-v2/hall/types";
import { formatBelgrade } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — `Događaji → Analitika` (presentational). Every part answers
// one question (ZADATAK §4): the numbers of today with their trend, the
// insights, the funnel, when it is busy, the model leaderboard with the model
// detail, the stands and the packages, how far a visitor goes and the devices
// as one sentence. Right after the numbers stands the Living hall (v3 V3): where
// it is busy on the map, in 3D on a desktop, with the Vremeplov under it. The
// charts are in components/admin/events/analytics/, what they draw is computed
// in lib/admin-v2/analytics/. Everything comes from fairEventAnalytics (admin)
// or a TEST fixture (dev preview); the two later reads may still be on the way.

const d = adminEventsSr.analytics;

export type AnalyticsViewProps = {
  eventCode: string;
  data: EventAnalyticsData;
  audience: EventAudienceData | undefined;
  engagement: EngagementData | undefined;
  /** `?model=`: the model whose detail is open. */
  modelId: string | undefined;
  /** The read of that model; undefined while it loads. */
  modelDetail: ModelAnalyticsData | undefined;
  modelError: boolean;
  onModel: (modelId: string | null) => void;
  onModelRetry: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onExport: () => void;
  /** Where the funnel sends the admin when there is no lead. */
  links: { leadSettings: string; forms: string };
  /** V3 — the hourly read of one fair day (the Vremeplov and the layers of the hall); without it the hall is live only. */
  standHours?: StandHoursState;
  /** Dev preview: `?vremeplov=<hour>|auto`. */
  timelapseStart?: TimelapseStart;
};

function Devices({ audience }: { audience: EventAudienceData | undefined }) {
  const headingId = useId();
  const v = d.v2.devices;
  const summary = deviceSummary(audience?.devices);
  return (
    <AdminPanel id="uredjaji" aria-labelledby={headingId} className="grid min-w-0 scroll-mt-4 gap-1.5 p-4 sm:p-5">
      <h2 id={headingId} className="text-xs font-bold tracking-[0.08em] text-[var(--admin-text-muted)] uppercase">{v.title}</h2>
      {!audience ? <p className="text-sm text-[var(--admin-text-muted)]">{d.v2.loadingPart}</p> : !summary ? <p className="text-sm text-[var(--admin-text-muted)]">{v.empty}</p> : (
        <>
          <p data-devices-sentence="" className="text-base leading-6">
            <span className="font-semibold">{fmt(v.top, { kind: d.devices[summary.top.kind], share: formatShare(summary.top.share), count: formatCount(summary.top.count), total: formatCount(summary.total) })}</span>
            {" "}
            {summary.rest.map((row, index) => {
              const text = fmt(v.rest, { kind: d.devices[row.kind], count: formatCount(row.count) });
              return `${index === 0 ? text : `, ${lowerFirst(text)}`}`;
            }).join("")}
            {summary.rest.length ? ". " : ""}
            {fmt(v.bots, { bots: formatCount(summary.bots) })}
          </p>
          <p className="text-xs leading-5 text-[var(--admin-text-muted)]">{v.note}{summary.capped ? ` ${d.v2.capped}` : ""}</p>
        </>
      )}
    </AdminPanel>
  );
}

export function EventAnalyticsView({ eventCode, data, audience, engagement, modelId, modelDetail, modelError, onModel, onModelRetry, onRefresh, refreshing, onExport, links, standHours, timelapseStart }: AnalyticsViewProps) {
  const [stand, setStand] = useState<string | null>(null);
  const models = useMemo(() => leaderboard(data, audience, engagement), [data, audience, engagement]);
  const stands = useMemo(() => standRanking(data, audience), [data, audience]);
  const records = useMemo(() => fairRecords(data, engagement), [data, engagement]);
  useRecordToasts(`${eventCode}:${data.todayKey}`, records, data.kpis.leads.total);
  const openRow = useMemo(() => (modelId ? models.find((row) => row.eventModelId === modelId) ?? null : null), [models, modelId]);
  const hours = useMemo(() => data.hours.map((row) => ({ dateKey: row.dateKey, hour: row.hour, value: row.scans })), [data.hours]);
  const showStand = (locationId: string) => {
    setStand(locationId);
    document.getElementById("mapa")?.scrollIntoView({ block: "start" });
  };
  // „Osveži“ and „Izvezi CSV“ are actions of the page: they stand in its header, on the right (ZADATAK §2).
  // On a phone they are icon buttons (the name stays for a screen reader), so the header keeps one row.
  const actions = useMemo(() => (
    <>
      <button type="button" data-analytics-action="refresh" title={d.refresh} className={cn(adminSecondaryButtonClass, "max-sm:size-11 max-sm:px-0")} onClick={onRefresh} disabled={refreshing}>
        <RefreshCw aria-hidden="true" className={cn("size-4", refreshing && "motion-safe:animate-spin")} />
        <span className="max-sm:sr-only">{d.refresh}</span>
      </button>
      <button type="button" data-analytics-action="export" title={d.exportCsv} className={cn(adminSecondaryButtonClass, "max-sm:size-11 max-sm:px-0")} onClick={onExport}>
        <Download aria-hidden="true" className="size-4" />
        <span className="max-sm:sr-only">{d.exportCsv}</span>
      </button>
    </>
  ), [onRefresh, onExport, refreshing]);
  const inHeader = useEventHeaderActions(actions);

  return (
    <div className="@container grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p data-admin-reveal="text" className="min-w-0 text-sm leading-5 text-[var(--admin-text-muted)]">
          {fmt(d.intro, { cutoff: formatBelgrade(data.cutoff) })}
          {" "}
          <span className="whitespace-nowrap tabular-nums" aria-live="polite">{refreshing ? d.refreshing : fmt(d.updated, { time: formatBelgrade(data.at).split(" ").at(-1) ?? "" })}</span>
        </p>
        {/* Outside an event frame (a test of this view alone) nothing takes the actions: they stay here. */}
        {inHeader ? null : <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <KpiStrip data={data} audience={audience} engagement={engagement} records={records} />

      {/* V3 — the Living hall is the second part: on a fair day „Gde je gužva?“ is among the first questions. */}
      <HallHeatMap eventCode={eventCode} data={data} stands={stands} models={models} picked={stand} onPick={setStand} onOpenModel={onModel} standHours={standHours} timelapseStart={timelapseStart} />

      <Insights data={data} audience={audience} engagement={engagement} />

      {/* Where it is lost, beside how far a visitor goes. */}
      <div className="grid min-w-0 gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Funnel data={data} audience={audience} engagement={engagement} links={links} />
        <div className="grid min-w-0 content-start gap-4">
          <DepthOfInterest data={data} audience={audience} engagement={engagement} />
          <PassportProgress audience={audience} engagement={engagement} />
        </div>
      </div>

      <DayHourMatrix id="dan-sat" days={data.days} hours={hours} running={records.hour?.running ?? false} />

      <ModelLeaderboard data={data} audience={audience} engagement={engagement} onOpen={onModel} openId={openRow?.eventModelId ?? null} />

      <StandRanking data={data} audience={audience} record={records.stand} onPickStand={showStand} />

      <PackageComparison data={data} engagement={engagement} />

      <Devices audience={audience} />

      <details className="rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 text-sm">
        <summary className={cn("min-h-11 cursor-pointer content-center font-semibold", chartFocusRing)}>{d.definitionsTitle}</summary>
        <ul className="grid gap-1.5 pb-3 leading-5 text-[var(--admin-text-muted)]">
          <li>{d.definitions.scans}</li>
          <li>{d.definitions.uniquePerModel}</li>
          <li>{d.definitions.visitors}</li>
          <li>{d.definitions.stand}</li>
          <li>{d.definitions.window}</li>
        </ul>
      </details>

      <ModelDetailDrawer row={openRow} data={data} detail={modelDetail} error={modelError} onRetry={onModelRetry} onClose={() => onModel(null)} />
    </div>
  );
}
