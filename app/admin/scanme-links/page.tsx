import type { Metadata } from "next";
import { ScanMeLinksAdmin } from "@/components/admin/scanme-links-admin";

export const metadata: Metadata = {
  title: "ScanMe Links | ScanMe Admin",
  robots: { index: false, follow: false },
};

export default function ScanMeLinksAdminPage() {
  return <ScanMeLinksAdmin />;
}

