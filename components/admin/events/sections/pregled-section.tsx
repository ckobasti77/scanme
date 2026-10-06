"use client";

import { AdminErrorState, AdminPanel } from "@/components/admin/admin-primitives";
import { useMinuteNow } from "@/components/admin/admin-ui/use-minute-now";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { SectionLoading } from "@/components/admin/events/sections/loading";
import { EventDashboardView } from "@/components/admin/events/sections/pregled-view";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A10 — container of `pregled`: the event dashboard the frame reads
// (one fairDashboard.getEventDashboard result, polled) and the browser minute
// for the countdown.

export function PregledSection() {
  const { base, dashboard } = useAdminEvent();
  const now = useMinuteNow();
  if (dashboard.data === undefined) {
    return dashboard.error
      ? <AdminPanel><AdminErrorState title={dict.dashboard.errorTitle} body={dict.dashboard.errorBody} retryLabel={dict.retry} onRetry={dashboard.refresh} /></AdminPanel>
      : <SectionLoading />;
  }
  return <EventDashboardView dashboard={dashboard.data} now={now} base={base} />;
}
