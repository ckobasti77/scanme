import type { Metadata } from "next";
import { AdminTeamErrorBoundary, AdminTeamWorkspace } from "@/components/admin/admin-team";
import { adminTeamSr } from "@/lib/i18n/sr/admin-team";

export const metadata: Metadata = {
  title: `${adminTeamSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function TeamPage() {
  return <AdminTeamErrorBoundary><AdminTeamWorkspace /></AdminTeamErrorBoundary>;
}
