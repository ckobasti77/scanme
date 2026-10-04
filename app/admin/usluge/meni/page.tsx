import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminServiceOperations, AdminServiceOperationsErrorBoundary } from "@/components/admin/admin-service-operations";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminServicesSr } from "@/lib/i18n/sr/admin-services";
import { firstSearchParam } from "@/lib/admin-v1/cutover";

export const metadata: Metadata = { title: `${adminServicesSr.titleMenu} | ScanMe Admin`, robots: { index: false, follow: false } };

export default async function MenuServicePage({ searchParams }: { searchParams: Promise<{ profile?: string | string[] }> }) {
  const { profile } = await searchParams;
  return <AdminGuard><AdminShell><AdminServiceOperationsErrorBoundary><AdminServiceOperations serviceType="scanme_menu" initialServiceProfileId={firstSearchParam(profile)} /></AdminServiceOperationsErrorBoundary></AdminShell></AdminGuard>;
}
