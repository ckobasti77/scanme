import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminInboxErrorBoundary, AdminInboxWorkspace } from "@/components/admin/admin-inbox";
import { AdminShell } from "@/components/admin/admin-shell";
import { communicationsSr } from "@/lib/i18n/sr/communications";

export const metadata: Metadata = {
  title: `${communicationsSr.inboxTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function InboxPage() {
  return (
    <AdminGuard>
      <AdminShell>
        <AdminInboxErrorBoundary><AdminInboxWorkspace /></AdminInboxErrorBoundary>
      </AdminShell>
    </AdminGuard>
  );
}
