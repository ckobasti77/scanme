import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LocationAdmin } from "@/components/admin/location-admin";
import {
  activeSubpageProfile,
  SUBPAGE_ORDER,
  type SubpageKey,
} from "@/components/admin/subpage-keys";
import {
  type AdminSearchParams,
  legacyLocationTarget,
  withSearchParams,
} from "@/lib/admin-v1/cutover";
import { readLegacyAdminLocation } from "@/lib/admin-v1/legacy-admin-route";

export const metadata: Metadata = {
  title: "Lokal — podstranica | ScanMe Admin",
  robots: { index: false, follow: false },
};

function isSubpageKey(value: string): value is SubpageKey {
  return (SUBPAGE_ORDER as readonly string[]).includes(value);
}

// A per-location subpage (Links / Review / Venue / Meni). Two gates:
//   • an UNKNOWN segment 404s here, server-side (a pure literal-set check).
//   • a KNOWN-but-inactive service 404s in LocationAdmin, on the server-
//     authoritative `api.admin.location` verdict (see the component + BLOCKED §1).
export default async function LocationSubpage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; service: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const { businessId, service } = await params;
  if (!isSubpageKey(service)) notFound();
  const query = await searchParams;
  const result = await readLegacyAdminLocation(businessId);
  if (result.access === "unauthenticated") {
    const returnTo = withSearchParams(
      `/admin/customers/${businessId}/${service}`,
      query,
    );
    redirect(`/admin/login?${new URLSearchParams({ returnTo })}`);
  }
  if (result.access === "admin") {
    if (!result.location) notFound();
    const profile = activeSubpageProfile(service, result.location.services);
    if (!profile) notFound();
    const target = legacyLocationTarget({
      accountId: result.location.account?.id ?? null,
      businessId,
      service,
      serviceProfileId: profile.id,
    });
    if (target) redirect(withSearchParams(target, query, ["profile"]));
  }
  return <LocationAdmin businessId={businessId} service={service} />;
}
