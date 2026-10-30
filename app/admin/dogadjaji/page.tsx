import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminEventsEntry } from "@/components/admin/events/event-entry";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

export const metadata: Metadata = {
  title: `${adminEventsSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

// Admin UX A2 — opens Pregled of the current event (AdminEventsEntry).
export default function EventsPage() {
  return <AdminGuard><AdminShell><AdminEventsEntry /></AdminShell></AdminGuard>;
}
