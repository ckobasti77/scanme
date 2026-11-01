import type { Metadata } from "next";
import { AdminClientsErrorBoundary, AdminClientsWorkspace } from "@/components/admin/admin-clients";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export const metadata: Metadata = {
  title: `${adminV1Sr.clientsTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function ClientsPage() {
  return (
    <AdminClientsErrorBoundary>
      <AdminClientsWorkspace />
    </AdminClientsErrorBoundary>
  );
}
