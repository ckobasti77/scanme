"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { AdminErrorState, AdminPanel } from "@/components/admin/admin-primitives";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { usePolled } from "@/components/admin/admin-ui/use-polled-query";
import { analyticsCsv } from "@/components/admin/events/analytics-logic";
import { downloadAdminFile } from "@/components/admin/events/download-file";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { SectionLoading } from "@/components/admin/events/sections/loading";
import { EventAnalyticsView } from "@/components/admin/events/sections/analitika-view";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// SAJAM SUPER Korak 4 — container of `analitika`: the two admin reads
// (fairEventAnalytics), each once, then every 60 s while the tab is visible
// and on „Osveži“ — never a live subscription (they read scan counters).

const d = adminEventsSr.analytics;

export function AnalitikaSection() {
  const { eventId, catalog } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const analytics = usePolled(`analytics:${eventId}`, (convex) => convex.query(api.fairEventAnalytics.getEventAnalytics, { eventId, at: Date.now() }));
  const audience = usePolled(`audience:${eventId}`, (convex) => convex.query(api.fairEventAnalytics.getEventAudience, { eventId, at: Date.now() }));
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  if (analytics.data === undefined) {
    return analytics.error
      ? <AdminPanel><AdminErrorState title={d.errorTitle} body={d.errorBody} retryLabel={adminEventsSr.retry} onRetry={analytics.refresh} /></AdminPanel>
      : <SectionLoading />;
  }
  const data = analytics.data;
  const refreshing = refreshedAt !== null && data.at < refreshedAt;
  return (
    <EventAnalyticsView
      eventCode={catalog.event.code}
      data={data}
      audience={audience.data}
      hourDay={query.dan}
      onHourDay={(dateKey) => setQuery({ dan: dateKey })}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshedAt(Date.now());
        analytics.refresh();
        audience.refresh();
      }}
      onExport={() => {
        const csv = analyticsCsv({ eventTitle: catalog.event.title, data, audience: audience.data });
        downloadAdminFile({
          fileName: fmt(d.csvFileName, { event: catalog.event.slug, date: data.todayKey }),
          mimeType: "text/csv;charset=utf-8",
          chunks: [new TextEncoder().encode(csv).buffer as ArrayBuffer],
        });
      }}
    />
  );
}
