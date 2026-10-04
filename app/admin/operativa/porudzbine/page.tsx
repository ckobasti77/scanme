import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminOrdersErrorBoundary, AdminOrdersWorkspace } from "@/components/admin/admin-orders";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminOrdersSr } from "@/lib/i18n/sr/admin-orders";

export const metadata: Metadata = {
  title: `${adminOrdersSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const query = await searchParams;
  return (
    <AdminGuard>
      <AdminShell>
        <AdminOrdersErrorBoundary>
          <AdminOrdersWorkspace initialOrderId={query.order} />
        </AdminOrdersErrorBoundary>
      </AdminShell>
    </AdminGuard>
  );
}
