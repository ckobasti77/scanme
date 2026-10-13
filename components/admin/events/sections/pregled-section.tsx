"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { AdminErrorState, AdminPanel } from "@/components/admin/admin-primitives";
import { useMinuteNow } from "@/components/admin/admin-ui/use-minute-now";
import { usePolled } from "@/components/admin/admin-ui/use-polled-query";
import { HallMini } from "@/components/admin/events/analytics/hall-mini";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { SectionLoading } from "@/components/admin/events/sections/loading";
import { EventDashboardView } from "@/components/admin/events/sections/pregled-view";
import { PreEventResetCard } from "@/components/admin/events/sections/pre-event-reset";
import { eventSectionHref } from "@/lib/admin-v1/event-sections";
import { fairMapForEventCode } from "@/lib/fair-map";
import type { AnalyticsData } from "@/lib/admin-v2/analytics/types";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A10 — container of `pregled`: the event dashboard the frame reads
// (one fairDashboard.getEventDashboard result, polled) and the browser minute
// for the countdown.
// ADMIN v3 V3 — while a fair day is open, the excerpt of the Living hall stands
// below „Šta treba da uradim“. It reads the analytics of the event
// (fairEventAnalytics.getEventAnalytics, the read of Analitika) only while the
// excerpt is on the screen, once and then every 60 s; nothing is read outside a
// fair day.
// ADMIN v3 V4 — the hours of that read also feed the daily challenges; an event
// without a floor plan has none, so its challenges are the ones the dashboard
// alone can count.

function HallMiniLive({ onData }: { onData: (data: AnalyticsData) => void }) {
  const { eventId, base, catalog } = useAdminEvent();
  const host = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const watcher = new IntersectionObserver((entries) => setInView(entries.some((entry) => entry.isIntersecting)));
    watcher.observe(host.current);
    return () => watcher.disconnect();
  }, []);
  const analytics = usePolled(inView ? `hall:${eventId}` : null, (convex) => convex.query(api.fairEventAnalytics.getEventAnalytics, { eventId, at: Date.now() }));
  // Off the screen nothing is read, and the last picture stays (the scene is not torn down by a scroll).
  const [kept, setKept] = useState<AnalyticsData>();
  if (analytics.data && analytics.data !== kept) setKept(analytics.data);
  // V4 — the hours of the same read feed the daily challenges of the page.
  const data = analytics.data;
  useEffect(() => {
    if (data) onData(data);
  }, [data, onData]);
  return (
    <div ref={host} className="min-w-0">
      <HallMini eventCode={catalog.event.code} data={analytics.data ?? kept} href={`${eventSectionHref(base, "analitika")}#mapa`} />
    </div>
  );
}

export function PregledSection() {
  const { base, dashboard, catalog } = useAdminEvent();
  const now = useMinuteNow();
  const [analytics, setAnalytics] = useState<AnalyticsData>();
  if (dashboard.data === undefined) {
    return dashboard.error
      ? <AdminPanel><AdminErrorState title={dict.dashboard.errorTitle} body={dict.dashboard.errorBody} retryLabel={dict.retry} onRetry={dashboard.refresh} /></AdminPanel>
      : <SectionLoading />;
  }
  // An event without a floor plan has no hall to show, so nothing is read for it.
  const dayOpen = dashboard.data.phase.kind === "sajam" && dashboard.data.phase.dayOpen && fairMapForEventCode(catalog.event.code) !== null;
  return (
    <>
      <EventDashboardView dashboard={dashboard.data} now={now} base={base} hall={dayOpen ? <HallMiniLive onData={setAnalytics} /> : undefined} hours={analytics?.hours ?? null} />
      <PreEventResetCard />
    </>
  );
}
