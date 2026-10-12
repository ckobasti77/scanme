"use client";

import { useMemo } from "react";
import { ChartFrame, HBar } from "@/components/admin/events/analytics/chart-kit";
import { formatCount } from "@/lib/admin-v2/analytics/format";
import { packageRows } from "@/lib/admin-v2/analytics/stands";
import type { AnalyticsData, EngagementData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// ADMIN v2 X3 — „Šta paket donosi?“: scans per model for each package. One
// series, so every bar is the same colour (colour does not mark the package);
// the name and the numbers are in text. A correlation, not a cause: the note
// is always visible.

const d = adminEventsSr.analytics;
const v = d.v2.packages;

const tierName = (tier: string) => d.tiers[tier as keyof typeof d.tiers] ?? tier;

export function PackageComparison({ data, engagement }: { data: AnalyticsData; engagement: EngagementData | undefined }) {
  const rows = useMemo(() => packageRows(data, engagement), [data, engagement]);
  return (
    <ChartFrame
      id="paketi"
      title={v.title}
      question={v.question}
      note={v.note}
      table={rows.length ? {
        caption: v.title,
        columns: [d.columns.tier, v.columnModels, d.columns.scans, v.perModel],
        rows: rows.map((row) => [tierName(row.tier), row.models, row.scans, row.scansPerModel]),
      } : undefined}
    >
      {rows.length ? (
        <ol className="grid min-w-0 gap-x-8 gap-y-4 @3xl:grid-cols-3">
          {rows.map((row) => (
            <li key={row.tier} data-package={row.tier} className="grid min-w-0 gap-1.5">
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <span className="font-semibold">{tierName(row.tier)}</span>
                <span className="text-right">
                  <span className="text-2xl leading-8 font-bold tracking-[-0.02em]">{formatCount(row.scansPerModel)}</span>
                  {" "}
                  <span className="text-xs text-[var(--admin-text-muted)]">{v.perModel}</span>
                </span>
              </div>
              <HBar share={row.share} />
              <p className="text-xs text-[var(--admin-text-muted)] tabular-nums">
                {fmt(v.row, { models: formatCount(row.models), scans: formatCount(row.scans) })}
                {row.models === 1 ? <span data-package-single=""> · {v.single}</span> : null}
              </p>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{d.emptyRanking}</p>}
    </ChartFrame>
  );
}
