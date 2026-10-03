import type { Metadata } from "next";
import { ScanMeVenueAdmin } from "@/components/admin/venue-admin";

export const metadata: Metadata = {
  title: "ScanMe Venue | ScanMe Admin",
  robots: { index: false, follow: false },
};

export default function ScanMeVenueAdminPage() {
  return <ScanMeVenueAdmin />;
}
