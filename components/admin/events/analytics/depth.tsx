"use client";

import { useMemo } from "react";
import { ChartFrame, HBar, StackedBar } from "@/components/admin/events/analytics/chart-kit";
import { countOf, formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { depthOfInterest, passportFunnel, type DepthBucketId } from "@/lib/admin-v2/analytics/depth";
import { seqColor, type SeqStep } from "@/lib/admin-v2/analytics/palette";
import type { AnalyticsData, AudienceData, EngagementData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// ADMIN v2 X3 — two small charts about how far a visitor goes.
// „Koliko modela posetilac pogleda?“: visitors split by how many models they
// scanned (1, 2, 3, 4+). The buckets are ordered, so they sit on the one-hue
// sequential ramp, not on category colours; the list under the bar is its
// legend and repeats every value in text. „Koliko njih ide do kraja?“: of the
// visitors who got a stamp, how many completed a passport (people against
// people); the number of stamps is a plain line, it is another unit.

const d = adminEventsSr.analytics;

const BUCKET_STEP: Record<DepthBucketId, SeqStep> = { one: 300, two: 400, three: 500, fourPlus: 600 };

export function DepthOfInterest({ data, audience, engagement }: {
  data: AnalyticsData;
  audience: AudienceData | undefined;
  engagement: EngagementData | undefined;
}) {
  const v = d.v2.depth;
  const depth = useMemo(() => depthOfInterest(data, audience, engagement), [data, audience, engagement]);
  if (!depth) {
    return (
      <ChartFrame id="dubina" title={v.title} question={v.question}>
        <p className="text-sm text-[var(--admin-text-muted)]">{d.v2.loadingPart}</p>
      </ChartFrame>
    );
  }
  const items = depth.buckets.map((bucket) => ({ ...bucket, label: v.buckets[bucket.id], color: seqColor(BUCKET_STEP[bucket.id]) }));
  const value = depth.modelsPerVisitor === null ? null : depth.modelsPerVisitor.toLocaleString("sr-RS", { maximumFractionDigits: 2 });
  // The sentence keeps the dictionary's word order; only the number is big.
  const [before, after] = v.headline.split("{value}");
  const empty = depth.visitors === 0;
  return (
    <ChartFrame
      id="dubina"
      title={v.title}
      question={v.question}
      note={depth.capped ? d.v2.capped : undefined}
      table={empty ? undefined : {
        caption: v.title,
        columns: [v.columnBucket, v.columnVisitors, d.v2.table.share],
        rows: items.map((item) => [item.label, item.visitors, formatShare(item.share)]),
      }}
    >
      {empty ? <p className="text-sm text-[var(--admin-text-muted)]">{v.empty}</p> : (
        <>
          {value ? (
            <div className="grid min-w-0 gap-0.5">
              <p data-depth-headline="" className="text-sm font-semibold">
                {before}
                <span className="text-[2rem] leading-10 font-bold tracking-[-0.03em]">{value}</span>
                {after}
              </p>
              <p className="text-xs text-[var(--admin-text-muted)]">{v.headlineHelp}</p>
            </div>
          ) : null}
          <StackedBar
            label={v.title}
            segments={items.map((item) => ({
              key: item.id,
              label: item.label,
              value: item.visitors,
              color: item.color,
              tip: fmt(v.bucket, { label: item.label, visitors: countOf(item.visitors, d.v2.units.visitors), share: formatShare(item.share) }),
            }))}
          />
          <ul className="grid min-w-0 text-sm">
            {items.map((item) => (
              <li key={item.id} data-bucket={item.id} className="flex min-w-0 items-center gap-x-3 border-t border-[var(--admin-border)] py-1.5 first:border-t-0">
                <span aria-hidden="true" className="size-2.5 flex-none rounded-[2px]" style={{ background: item.color }} />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.label}</span>
                <span className="font-semibold tabular-nums">{formatCount(item.visitors)}</span>
                <span className="w-16 text-right text-[var(--admin-text-muted)] tabular-nums">{formatShare(item.share)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartFrame>
  );
}

export function PassportProgress({ audience, engagement }: { audience: AudienceData | undefined; engagement: EngagementData | undefined }) {
  const v = d.v2.passport;
  const funnel = useMemo(() => passportFunnel(audience, engagement), [audience, engagement]);
  if (!funnel) {
    return (
      <ChartFrame id="pasos" title={v.title} question={v.question} note={v.note}>
        <p className="text-sm text-[var(--admin-text-muted)]">{d.v2.loadingPart}</p>
      </ChartFrame>
    );
  }
  const started = funnel.stampVisitors;
  const steps = [
    { id: "stampVisitors", label: v.steps.stampVisitors, value: started, share: started ? 1 : 0 },
    { id: "completed", label: v.steps.completed, value: funnel.completed, share: started ? Math.min(1, funnel.completed / started) : 0 },
  ];
  const empty = funnel.stamps === 0;
  return (
    <ChartFrame
      id="pasos"
      title={v.title}
      question={v.question}
      note={funnel.capped ? <>{v.note} {d.v2.capped}</> : v.note}
      table={empty ? undefined : {
        caption: v.title,
        columns: [d.v2.funnel.columnStep, d.v2.table.value],
        rows: [[v.steps.stampVisitors, started], [v.steps.stamps, funnel.stamps], [v.steps.completed, funnel.completed]],
      }}
    >
      {empty ? <p className="text-sm text-[var(--admin-text-muted)]">{v.empty}</p> : (
        <>
          <ol className="grid min-w-0 gap-3">
            {steps.map((step) => (
              <li key={step.id} data-step={step.id} className="grid min-w-0 gap-1.5">
                <div className="flex min-w-0 items-baseline justify-between gap-x-4">
                  <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{step.label}</span>
                  <span className="text-lg leading-6 font-bold tabular-nums">{formatCount(step.value)}</span>
                </div>
                {started !== null ? <HBar share={step.share} /> : null}
              </li>
            ))}
          </ol>
          {started === null ? <p className="text-xs text-[var(--admin-text-muted)]">{d.v2.loadingPart}</p> : null}
          {funnel.completion !== null && started !== null ? (
            <p data-passport-summary="" className="text-sm font-semibold">
              {fmt(v.summary, { share: formatShare(funnel.completion), completed: formatCount(funnel.completed), visitors: formatCount(started) })}
            </p>
          ) : null}
          <p data-step="stamps" className="text-sm text-[var(--admin-text-muted)] tabular-nums">{fmt(v.stampsLine, { stamps: formatCount(funnel.stamps) })}</p>
        </>
      )}
    </ChartFrame>
  );
}
