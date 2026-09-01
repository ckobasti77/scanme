import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  LocationAdmin,
  SUBPAGE_ORDER,
  type SubpageKey,
} from "@/components/admin/location-admin";

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
}: {
  params: Promise<{ businessId: string; service: string }>;
}) {
  const { businessId, service } = await params;
  if (!isSubpageKey(service)) notFound();
  return <LocationAdmin businessId={businessId} service={service} />;
}
