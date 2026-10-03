import type { Metadata } from "next";
import { AdminDashboardFoundation } from "@/components/admin/admin-dashboard-foundation";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export const metadata: Metadata = {
  title: `${adminV1Sr.dashboardTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <AdminGuard>
      <AdminShell>
        <AdminDashboardFoundation />
      </AdminShell>
    </AdminGuard>
  );
}
