"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminErrorState, AdminPanel } from "@/components/admin/admin-primitives";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { usePolled } from "@/components/admin/admin-ui/use-polled-query";
import { useStandHours } from "@/components/admin/events/analytics/use-stand-hours";
import { analyticsCsv } from "@/components/admin/events/analytics-logic";
import { downloadAdminFile } from "@/components/admin/events/download-file";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { SectionLoading } from "@/components/admin/events/sections/loading";
import { EventAnalyticsView } from "@/components/admin/events/sections/analitika-view";
import { eventSectionHref } from "@/lib/admin-v1/event-sections";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// SAJAM SUPER Korak 4 / ADMIN v2 X3 — container of `analitika`. Four admin
// reads (fairEventAnalytics), none a live subscription (they read scan
// counters): the counters and the audience once and then every 60 s while the
// tab is visible, the engagement every 5 minutes (it reads the visitor rows),
// and one model only while its detail is open (`?model=`). „Osveži“ reads all.
// ADMIN v3 V3 adds getEventStandHours (one day per stand and hour), on demand.

const d = adminEventsSr.analytics;
const ENGAGEMENT_INTERVAL_MS = 5 * 60_000;
/** The detail of a model is read when it opens and on „Osveži“, not on a timer. */
const MODEL_INTERVAL_MS = 60 * 60_000;

export function AnalitikaSection() {
  const { eventId, base, catalog } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const analytics = usePolled(`analytics:${eventId}`, (convex) => convex.query(api.fairEventAnalytics.getEventAnalytics, { eventId, at: Date.now() }));
  const audience = usePolled(`audience:${eventId}`, (convex) => convex.query(api.fairEventAnalytics.getEventAudience, { eventId, at: Date.now() }));
  const engagement = usePolled(`engagement:${eventId}`, (convex) => convex.query(api.fairEventAnalytics.getEventEngagement, { eventId, at: Date.now() }), ENGAGEMENT_INTERVAL_MS);
  // Only a model of this analytics is read: an id from an old link opens nothing.
  const modelId = analytics.data?.models.find((row) => row.eventModelId === query.model)?.eventModelId;
  const model = usePolled(
    modelId ? `model:${eventId}:${modelId}` : null,
    (convex) => convex.query(api.fairEventAnalytics.getModelAnalytics, { eventId, eventModelId: modelId as Id<"fairEventModels">, at: Date.now() }),
    MODEL_INTERVAL_MS,
  );
  // V3 — one fair day hour by hour per stand (the Vremeplov): read when the hall asks for a day, never on a timer.
  const standHours = useStandHours(eventId, analytics.data?.todayKey);
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
      engagement={engagement.data}
      modelId={modelId}
      modelDetail={model.data}
      modelError={model.data === undefined && Boolean(model.error)}
      onModel={(next) => setQuery({ model: next })}
      onModelRetry={model.refresh}
      links={{ leadSettings: eventSectionHref(base, "leadovi/podesavanja"), forms: eventSectionHref(base, "interakcije") }}
      standHours={standHours}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshedAt(Date.now());
        analytics.refresh();
        audience.refresh();
        engagement.refresh();
        model.refresh();
        // The hours of the day the hall shows (its layers and the Vremeplov) are read again too.
        if (standHours.dateKey) standHours.request(standHours.dateKey, true);
      }}
      onExport={() => {
        const csv = analyticsCsv({ eventTitle: catalog.event.title, data, audience: audience.data, engagement: engagement.data });
        downloadAdminFile({
          fileName: fmt(d.csvFileName, { event: catalog.event.slug, date: data.todayKey }),
          mimeType: "text/csv;charset=utf-8",
          chunks: [new TextEncoder().encode(csv).buffer as ArrayBuffer],
        });
      }}
    />
  );
}
