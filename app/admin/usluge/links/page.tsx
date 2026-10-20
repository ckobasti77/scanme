import type { Metadata } from "next";
import { AdminServiceOperations, AdminServiceOperationsErrorBoundary } from "@/components/admin/admin-service-operations";
import { adminServicesSr } from "@/lib/i18n/sr/admin-services";
import { firstSearchParam } from "@/lib/admin-v1/cutover";

export const metadata: Metadata = { title: `${adminServicesSr.titleLinks} | ScanMe Admin`, robots: { index: false, follow: false } };

export default async function LinksServicePage({ searchParams }: { searchParams: Promise<{ profile?: string | string[] }> }) {
  const { profile } = await searchParams;
  return <AdminServiceOperationsErrorBoundary><AdminServiceOperations serviceType="scanme_links" initialServiceProfileId={firstSearchParam(profile)} /></AdminServiceOperationsErrorBoundary>;
}
