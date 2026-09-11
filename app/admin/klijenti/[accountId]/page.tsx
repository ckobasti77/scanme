import type { Metadata } from "next";
import Link from "next/link";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminEmptyState, AdminPanel } from "@/components/admin/admin-primitives";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export const metadata: Metadata = {
  title: `${adminV1Sr.clientsProfilePendingTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function ClientProfilePendingPage() {
  return (
    <AdminGuard>
      <AdminShell>
        <div className="grid gap-4">
          <AdminPanel className="overflow-hidden">
            <AdminEmptyState
              title={adminV1Sr.clientsProfilePendingTitle}
              body={adminV1Sr.clientsProfilePendingBody}
            />
          </AdminPanel>
          <Link
            href="/admin/klijenti"
            className="w-fit text-sm font-semibold underline underline-offset-4"
          >
            {adminV1Sr.clientsTitle}
          </Link>
        </div>
      </AdminShell>
    </AdminGuard>
  );
}
