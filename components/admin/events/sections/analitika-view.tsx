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
import { StandRanking } from "@/components/admin/events/analytics/stand-ranking";
import type { EventAnalyticsData, EventAudienceData } from "@/components/admin/events/analytics-logic";
import { deviceSummary } from "@/lib/admin-v2/analytics/devices";
import { formatCount, formatShare, lowerFirst } from "@/lib/admin-v2/analytics/format";
import { leaderboard } from "@/lib/admin-v2/analytics/leaderboard";
import { standRanking } from "@/lib/admin-v2/analytics/stands";
import type { EngagementData, ModelAnalyticsData } from "@/lib/admin-v2/analytics/types";
import { formatBelgrade } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — `Događaji → Analitika` (presentational). Every part answers
// one question (ZADATAK §4): the numbers of today with their trend, the
// insights, the funnel, when it is busy, the model leaderboard with the model
// detail, the stands and the packages, how far a visitor goes, where it is
// busy on the map (2D, 3D on demand) and the devices as one sentence. The
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

export function EventAnalyticsView({ eventCode, data, audience, engagement, modelId, modelDetail, modelError, onModel, onModelRetry, onRefresh, refreshing, onExport, links }: AnalyticsViewProps) {
  const [stand, setStand] = useState<string | null>(null);
  const models = useMemo(() => leaderboard(data, audience, engagement), [data, audience, engagement]);
  const stands = useMemo(() => standRanking(data, audience), [data, audience]);
  const openRow = useMemo(() => (modelId ? models.find((row) => row.eventModelId === modelId) ?? null : null), [models, modelId]);
  const hours = useMemo(() => data.hours.map((row) => ({ dateKey: row.dateKey, hour: row.hour, value: row.scans })), [data.hours]);
  const showStand = (locationId: string) => {
    setStand(locationId);
    document.getElementById("mapa")?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="@container grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl min-w-0 text-sm leading-5 text-[var(--admin-text-muted)]">{fmt(d.intro, { cutoff: formatBelgrade(data.cutoff) })}</p>
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

      <KpiStrip data={data} audience={audience} engagement={engagement} />

      <Insights data={data} audience={audience} engagement={engagement} />

      {/* Where it is lost, beside how far a visitor goes. */}
      <div className="grid min-w-0 gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Funnel data={data} audience={audience} engagement={engagement} links={links} />
        <div className="grid min-w-0 content-start gap-4">
          <DepthOfInterest data={data} audience={audience} engagement={engagement} />
          <PassportProgress audience={audience} engagement={engagement} />
        </div>
      </div>

      <DayHourMatrix id="dan-sat" days={data.days} hours={hours} />

      <ModelLeaderboard data={data} audience={audience} engagement={engagement} onOpen={onModel} openId={openRow?.eventModelId ?? null} />

      <StandRanking data={data} audience={audience} onPickStand={showStand} />

      <PackageComparison data={data} engagement={engagement} />

      <HallHeatMap eventCode={eventCode} data={data} stands={stands} models={models} picked={stand} onPick={setStand} onOpenModel={onModel} />

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
