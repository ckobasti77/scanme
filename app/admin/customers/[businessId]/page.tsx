import type { Metadata } from "next";
import { LocationAdmin } from "@/components/admin/location-admin";

export const metadata: Metadata = {
  title: "Lokal | ScanMe Admin",
  robots: { index: false, follow: false },
};

// Per-location overview (TASK-41, RFC-002 §2.6): the subpage nav + the location
// sidebar (Enterprise only). Which subpages exist is decided server-side by
// `api.admin.location`; see components/admin/location-admin.tsx.
export default async function LocationOverviewPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return <LocationAdmin businessId={businessId} />;
}
