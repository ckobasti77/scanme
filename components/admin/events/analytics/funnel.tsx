"use client";

import { AlertTriangle, ArrowDown } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { ChartFrame, ChartProblem, HBar, chartFocusRing, type ChartTableData } from "@/components/admin/events/analytics/chart-kit";
import { formatCount, formatShare } from "@/lib/admin-v2/analytics/format";
import { funnelProblem, funnelSteps, type FunnelStep } from "@/lib/admin-v2/analytics/funnel";
import type { AnalyticsData, AudienceData, EngagementData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// ADMIN v2 X3 — „Gde se gubi?“: scans → distinct visitors → engaged → leads as
// four thin bars sized against the first step, with the share that passes each
// step. The first step that loses everyone is marked and explained under the
// list (the danger colour always comes with an icon and a sentence). A step
// whose read has not arrived yet reads „—“ and „Učitava se…“, never 0.

const d = adminEventsSr.analytics;
const v = d.v2.funnel;

const perVisitorText = (value: number) => fmt(v.perVisitor, { value: value.toLocaleString("sr-RS", { maximumFractionDigits: 2 }) });

const linkClass = cn("inline-flex min-h-11 items-center font-semibold underline underline-offset-2 lg:min-h-9", chartFocusRing);

function StepRow({ step }: { step: FunnelStep }) {
  return (
    <li data-funnel-step={step.id} data-funnel-problem={step.problem ? "" : undefined} className="grid min-w-0 gap-1.5">
      {step.perVisitor !== null ? (
        // Not a loss: the same phones scanned again.
        <p data-funnel-ratio="" className="text-xs text-[var(--admin-text-muted)]">{perVisitorText(step.perVisitor)}</p>
      ) : step.rate !== null ? (
        <p data-funnel-rate="" className="inline-flex items-center gap-1 text-xs text-[var(--admin-text-muted)]">
          <ArrowDown aria-hidden="true" className="size-3.5 flex-none" />
          {fmt(v.rate, { share: formatShare(step.rate) })}
        </p>
      ) : null}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 @xl:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_5rem]">
        <div className="grid min-w-0 gap-0.5 @xl:col-start-1 @xl:row-start-1">
          <span className="text-sm font-semibold">{v.steps[step.id]}</span>
          <span className="text-xs text-[var(--admin-text-muted)]">{v.help[step.id]}</span>
          {step.capped ? <span className="text-xs text-[var(--admin-text-muted)]">{d.capped}</span> : null}
        </div>
        <div className="flex items-center justify-end gap-1.5 @xl:col-start-3 @xl:row-start-1">
          {step.problem ? <AlertTriangle aria-hidden="true" className="size-4 flex-none text-[var(--admin-danger)]" /> : null}
          <span data-funnel-value="" className="text-sm font-semibold tabular-nums">{formatCount(step.value)}</span>
        </div>
        <div className="col-span-full min-w-0 @xl:col-span-1 @xl:col-start-2 @xl:row-start-1">
          {step.value === null ? <p className="text-xs text-[var(--admin-text-muted)]">{d.v2.loadingPart}</p> : <HBar share={step.share} />}
        </div>
      </div>
    </li>
  );
}

export function Funnel({ data, audience, engagement, links }: {
  data: AnalyticsData;
  audience: AudienceData | undefined;
  engagement: EngagementData | undefined;
  links: { leadSettings: string; forms: string };
}) {
  const steps = useMemo(() => funnelSteps(data, audience, engagement), [data, audience, engagement]);
  const problem = funnelProblem(steps);
  const visitors = steps.find((step) => step.id === "visitors")?.value ?? null;
  const table: ChartTableData = {
    caption: v.title,
    columns: [v.columnStep, d.v2.table.value, v.columnRate],
    rows: steps.map((step) => [v.steps[step.id], step.value, step.perVisitor !== null ? perVisitorText(step.perVisitor) : formatShare(step.rate)]),
  };
  return (
    <ChartFrame id="levak" title={v.title} question={v.question} note={v.note} table={table}>
      <ol className="grid min-w-0 gap-4">
        {steps.map((step) => <StepRow key={step.id} step={step} />)}
      </ol>
      {problem ? (
        <ChartProblem title={v.zeroTitles[problem.id as keyof typeof v.zeroTitles]}>
          {problem.id === "leads" ? (
            <>
              <p>{fmt(v.leadsZeroBody, { visitors: formatCount(visitors) })}</p>
              <ul className="list-disc pl-5">
                {v.leadsZeroChecks.map((check) => <li key={check}>{check}</li>)}
              </ul>
              <div className="flex min-w-0 flex-wrap gap-x-4">
                <Link href={links.leadSettings} className={linkClass}>{v.openLeadSettings}</Link>
                <Link href={links.forms} className={linkClass}>{v.openForms}</Link>
              </div>
            </>
          ) : problem.id === "engaged" ? <p>{v.engagedZeroBody}</p> : null}
        </ChartProblem>
      ) : null}
    </ChartFrame>
  );
}
