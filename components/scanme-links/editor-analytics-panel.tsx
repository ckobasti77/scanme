"use client";

import { useQuery } from "convex/react";
import {
  Eye,
  MousePointerClick,
  Percent,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { MetricsBarChart } from "@/components/metrics-bar-chart";
import { MetricsPeriodSelect } from "@/components/metrics-period-select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MetricsRange } from "@/convex/lib/metrics";
import { useRetainedQueryResult } from "@/lib/use-retained-query-result";

const numberFormatter = new Intl.NumberFormat("sr-Latn-RS");
const percentFormatter = new Intl.NumberFormat("sr-Latn-RS", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function EditorAnalyticsPanel({
  businessId,
}: {
  businessId: Id<"businesses">;
}) {
  const [range, setRange] = useState<MetricsRange>("7d");
  const metricsQuery = useQuery(api.scanMeLinks.metrics, { businessId, range });
  const metrics = useRetainedQueryResult(metricsQuery, businessId);

  if (metrics === undefined) {
    return <AnalyticsPanelSkeleton />;
  }

  if (metrics === null) {
    return (
      <section
        className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5"
        role="status"
      >
        <h2 className="text-lg font-semibold tracking-[-0.03em]">Analitika</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Metrika još nije dostupna za ovu ScanMe Links stranicu.
        </p>
      </section>
    );
  }

  return (
    <section
      className="grid gap-5"
      aria-busy={metricsQuery === undefined}
      aria-labelledby="editor-analytics-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="editor-analytics-heading"
            className="text-xl font-semibold tracking-[-0.04em]"
          >
            Analitika
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Rezultati objavljene ScanMe Links stranice.
          </p>
        </div>
        <div className="w-44 shrink-0 rounded-2xl border border-border/70 bg-background/75 px-3">
          <MetricsPeriodSelect
            value={range}
            onChange={setRange}
            ariaLabel="Period prikazane ScanMe Links analitike"
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={ScanLine}
          label="Skeniranja"
          value={numberFormatter.format(metrics.totalScans)}
        />
        <MetricCard
          icon={Eye}
          label="Prikazi"
          value={numberFormatter.format(metrics.totalPageViews)}
        />
        <MetricCard
          icon={MousePointerClick}
          label="Klikovi"
          hint="Sesije sa najmanje jednim klikom"
          value={numberFormatter.format(metrics.totalConvertedSessions)}
        />
        <MetricCard
          icon={Percent}
          label="CTR"
          value={
            metrics.totalPageViews > 0
              ? percentFormatter.format(metrics.ctr)
              : "—"
          }
        />
      </dl>

      <div className="rounded-[1.5rem] border border-border/70 bg-background/75 p-4 shadow-[0_14px_34px_rgba(28,25,23,0.06)]">
        <div>
          <h3 className="text-sm font-semibold">Aktivnost po periodu</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Skeniranja za period: {metrics.rangeLabel.toLocaleLowerCase("sr-Latn-RS")}.
          </p>
        </div>
        <MetricsBarChart
          rows={metrics.daily}
          rangeLabel={metrics.rangeLabel}
          heightClassName="h-48"
          showCounts
          barMinWidth={38}
          variant={metrics.range === "all" ? "line" : "bars"}
        />
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Linkovi</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Ukupan broj klikova po objavljenom linku.
            </p>
          </div>
          <span
            className="text-[11px] font-medium text-muted-foreground"
            aria-label={`${metrics.destinations.length} linkova u analitici`}
          >
            {metrics.destinations.length} linkova
          </span>
        </div>

        {metrics.destinations.length > 0 ? (
          <ul className="mt-3 grid gap-2" aria-label="Klikovi po linkovima">
            {metrics.destinations.map((destination) => {
              const deleted = String(destination.state) === "deleted";

              return (
                <li
                  key={destination.id}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border/65 bg-background/75 px-4 py-3 shadow-[0_8px_22px_rgba(28,25,23,0.045)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {destination.label}
                    </p>
                    {deleted ? (
                      <span className="mt-1 inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-destructive">
                        Obrisano
                      </span>
                    ) : null}
                  </div>
                  <span
                    className="shrink-0 text-sm font-semibold tabular-nums"
                    aria-label={`${numberFormatter.format(destination.totalClicks)} klikova`}
                  >
                    {numberFormatter.format(destination.totalClicks)}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      klikova
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            className="mt-3 rounded-2xl border border-dashed border-border bg-background/55 px-4 py-5 text-center text-xs leading-5 text-muted-foreground"
            role="status"
          >
            Još nema klikova po linkovima.
          </p>
        )}
      </div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-h-28 rounded-[1.35rem] border border-border/65 bg-background/75 p-4 shadow-[0_10px_26px_rgba(28,25,23,0.05)]">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-4 text-2xl font-semibold tracking-[-0.04em] tabular-nums">
        {value}
      </dd>
      {hint ? (
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function AnalyticsPanelSkeleton() {
  return (
    <section className="grid animate-pulse gap-5" aria-label="Učitavanje analitike">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <div className="h-6 w-24 rounded-full bg-foreground/10" />
          <div className="h-3 w-48 rounded-full bg-foreground/5" />
        </div>
        <div className="h-11 w-44 rounded-2xl bg-foreground/8" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 rounded-[1.35rem] border border-border/50 bg-background/55"
          />
        ))}
      </div>
      <div className="h-64 rounded-[1.5rem] border border-border/50 bg-background/55" />
    </section>
  );
}
