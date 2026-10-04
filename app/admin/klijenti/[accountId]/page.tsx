import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminClientProfileErrorBoundary, AdminClientProfileWorkspace } from "@/components/admin/admin-client-profile";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export const metadata: Metadata = {
  title: `${adminV1Sr.clientsTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function ClientProfilePage({ params }: PageProps<"/admin/klijenti/[accountId]">) {
  const { accountId } = await params;
  return (
    <AdminGuard>
      <AdminShell>
        <AdminClientProfileErrorBoundary>
          <Suspense fallback={null}><AdminClientProfileWorkspace accountId={accountId} /></Suspense>
        </AdminClientProfileErrorBoundary>
      </AdminShell>
    </AdminGuard>
  );
}
