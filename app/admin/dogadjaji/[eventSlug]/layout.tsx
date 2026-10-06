import { Suspense, type ReactNode } from "react";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminEventFrame, AdminEventsErrorBoundary } from "@/components/admin/events/event-frame";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// Admin UX A2 — every section of one event shares this frame (event title,
// event switch, section navigation, the catalog loaded once). The frame reads
// the query string, so it sits in <Suspense>.
export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  return (
    <AdminGuard>
      <AdminShell>
        <AdminEventsErrorBoundary>
          <Suspense fallback={<AdminPanel><AdminLoadingState label={adminEventsSr.loading} /></AdminPanel>}>
            <AdminEventFrame eventSlug={eventSlug}>{children}</AdminEventFrame>
          </Suspense>
        </AdminEventsErrorBoundary>
      </AdminShell>
    </AdminGuard>
  );
}
