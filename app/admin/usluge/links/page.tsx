import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminServiceOperations, AdminServiceOperationsErrorBoundary } from "@/components/admin/admin-service-operations";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminServicesSr } from "@/lib/i18n/sr/admin-services";

export const metadata: Metadata = { title: `${adminServicesSr.titleLinks} | ScanMe Admin`, robots: { index: false, follow: false } };

export default function LinksServicePage() {
  return <AdminGuard><AdminShell><AdminServiceOperationsErrorBoundary><AdminServiceOperations serviceType="scanme_links" /></AdminServiceOperationsErrorBoundary></AdminShell></AdminGuard>;
}
