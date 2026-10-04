import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminSearchErrorBoundary, AdminSearchWorkspace } from "@/components/admin/admin-search";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminSearchSr } from "@/lib/i18n/sr/admin-search";

export const metadata: Metadata = {
  title: `${adminSearchSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function SearchPage() {
  return (
    <AdminGuard>
      <AdminShell>
        <AdminSearchErrorBoundary>
          <Suspense fallback={null}>
            <AdminSearchWorkspace />
          </Suspense>
        </AdminSearchErrorBoundary>
      </AdminShell>
    </AdminGuard>
  );
}
