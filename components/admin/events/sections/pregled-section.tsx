"use client";

import { useState } from "react";
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
import { fairReadKey } from "@/lib/admin-v2/game/fair-read";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A10 — container of `pregled`: the event dashboard the frame reads
// (one fairDashboard.getEventDashboard result, polled) and the browser minute
// for the countdown.
// ADMIN v3 V3 — while a fair day is open, the excerpt of the Living hall stands
// below „Šta treba da uradim“. It shows the analytics of the event
// (fairEventAnalytics.getEventAnalytics, the read of Analitika).
// ADMIN v3 V4 — the hours of that read also feed the daily challenges.
// ADMIN v3 V5 — that read lives here, not in the excerpt: it runs once and then
// every 60 s while a fair day is open AND the block „challenges + hall“ is on
// the screen (the view watches it), also for an event without a floor plan,
// which has the challenges but no hall. Off the screen, or outside a fair day,
// nothing is read; the last picture stays (the scene is not torn down by a scroll).

function HallMiniLive({ data }: { data: AnalyticsData | undefined }) {
  const { base, catalog } = useAdminEvent();
  return (
    <div className="min-w-0">
      <HallMini eventCode={catalog.event.code} data={data} href={`${eventSectionHref(base, "analitika")}#mapa`} />
    </div>
  );
}

export function PregledSection() {
  const { eventId, base, dashboard, catalog } = useAdminEvent();
  const now = useMinuteNow();
  const [inView, setInView] = useState(false);
  const dayOpen = dashboard.data?.phase.kind === "sajam" && dashboard.data.phase.dayOpen;
  const analytics = usePolled(fairReadKey({ eventId, dayOpen: dayOpen === true, inView }), (convex) => convex.query(api.fairEventAnalytics.getEventAnalytics, { eventId, at: Date.now() }));
  // Off the screen the read stops and the last picture stays.
  const [kept, setKept] = useState<{ eventId: string; data: AnalyticsData }>();
  if (analytics.data && analytics.data !== kept?.data) setKept({ eventId, data: analytics.data });
  if (dashboard.data === undefined) {
    return dashboard.error
      ? <AdminPanel><AdminErrorState title={dict.dashboard.errorTitle} body={dict.dashboard.errorBody} retryLabel={dict.retry} onRetry={dashboard.refresh} /></AdminPanel>
      : <SectionLoading />;
  }
  const picture = analytics.data ?? (kept?.eventId === eventId ? kept.data : undefined);
  // An event without a floor plan has no hall to show; its challenges still get the hours.
  const hall = dayOpen && fairMapForEventCode(catalog.event.code) !== null;
  return (
    <>
      <EventDashboardView
        dashboard={dashboard.data}
        now={now}
        base={base}
        eventKey={catalog.event.code}
        hall={hall ? <HallMiniLive data={picture} /> : undefined}
        hours={picture?.hours ?? null}
        onBlockView={setInView}
      />
      <PreEventResetCard />
    </>
  );
}
