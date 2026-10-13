"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { ChartFrame } from "@/components/admin/events/analytics/chart-kit";
import { countOf } from "@/lib/admin-v2/analytics/format";
import { analyticsInsights } from "@/lib/admin-v2/analytics/insights";
import type { AnalyticsData, AudienceData, EngagementData } from "@/lib/admin-v2/analytics/types";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// ADMIN v2 X3 — „Šta brojevi kažu?“: three to six short sentences computed
// from the numbers of this page by fixed rules (lib/admin-v2/analytics/
// insights.ts), the most important first. A problem wears the danger icon and
// the word; a fact is plain text.

const d = adminEventsSr.analytics;
const v = d.v2.insights;

export function Insights({ data, audience, engagement }: { data: AnalyticsData; audience: AudienceData | undefined; engagement: EngagementData | undefined }) {
  const items = useMemo(
    () => analyticsInsights({ data, audience, engagement }, { tier: (tier) => (d.tiers as Record<string, string>)[tier] ?? tier, and: v.and, otherDays: v.otherDays, scans: (count) => countOf(count, d.v2.units.scans) }),
    [data, audience, engagement],
  );
  return (
    <ChartFrame id="uvidi" title={v.title} question={v.question} note={items.length ? v.note : undefined}>
      {items.length ? (
        <ol data-admin-reveal="rows" className="min-w-0 gap-x-8 @3xl:columns-2">
          {items.map((item) => (
            <li key={item.id} data-insight={item.id} data-tone={item.tone} className="mb-2.5 grid min-w-0 break-inside-avoid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2.5 text-sm leading-5">
              {item.tone === "problem"
                ? <AlertTriangle aria-hidden="true" className="size-5 text-[var(--admin-danger)]" />
                : <span aria-hidden="true" className="mt-[0.4375rem] ml-[0.4375rem] size-1.5 rounded-full bg-[var(--admin-text-muted)]" />}
              <p className={item.tone === "problem" ? "font-semibold" : undefined}>
                {item.tone === "problem" ? <span className="sr-only">{v.problemLabel}: </span> : null}
                {fmt(v.items[item.id], item.values)}
              </p>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{v.empty}</p>}
    </ChartFrame>
  );
}
