import type { Metadata } from "next";
import { ScanMeMemoriesAdmin } from "@/components/admin/memories-admin";

export const metadata: Metadata = {
  title: "ScanMe Memories | ScanMe Admin",
  robots: { index: false, follow: false },
};

export default function ScanMeMemoriesAdminPage() {
  return <ScanMeMemoriesAdmin />;
}
