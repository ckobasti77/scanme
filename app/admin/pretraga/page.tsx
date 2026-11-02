import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSearchErrorBoundary, AdminSearchWorkspace } from "@/components/admin/admin-search";
import { adminSearchSr } from "@/lib/i18n/sr/admin-search";

export const metadata: Metadata = {
  title: `${adminSearchSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function SearchPage() {
  return (
    <AdminSearchErrorBoundary>
      <Suspense fallback={null}>
        <AdminSearchWorkspace />
      </Suspense>
    </AdminSearchErrorBoundary>
  );
}
