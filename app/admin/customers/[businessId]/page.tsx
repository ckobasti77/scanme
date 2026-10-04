import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LocationAdmin } from "@/components/admin/location-admin";
import {
  type AdminSearchParams,
  legacyLocationTarget,
  withSearchParams,
} from "@/lib/admin-v1/cutover";
import { readLegacyAdminLocation } from "@/lib/admin-v1/legacy-admin-route";

export const metadata: Metadata = {
  title: "Lokal | ScanMe Admin",
  robots: { index: false, follow: false },
};

// Per-location overview (TASK-41, RFC-002 §2.6): the subpage nav + the location
// sidebar (Enterprise only). Which subpages exist is decided server-side by
// `api.admin.location`; see components/admin/location-admin.tsx.
export default async function LocationOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const result = await readLegacyAdminLocation(businessId);
  if (result.access === "unauthenticated") {
    const returnTo = withSearchParams(`/admin/customers/${businessId}`, query);
    redirect(`/admin/login?${new URLSearchParams({ returnTo })}`);
  }
  if (result.access === "admin") {
    if (!result.location) notFound();
    const target = legacyLocationTarget({
      accountId: result.location.account?.id ?? null,
      businessId,
    });
    if (target) redirect(withSearchParams(target, query, ["section", "venue"]));
  }
  return <LocationAdmin businessId={businessId} />;
}
