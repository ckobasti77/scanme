import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminEventsErrorBoundary, AdminEventsWorkspace } from "@/components/admin/admin-events-workspace";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

export const metadata: Metadata = {
  title: `${adminEventsSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function EventsPage() {
  return <AdminGuard><AdminShell><AdminEventsErrorBoundary><AdminEventsWorkspace /></AdminEventsErrorBoundary></AdminShell></AdminGuard>;
}
