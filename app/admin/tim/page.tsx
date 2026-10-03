import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTeamErrorBoundary, AdminTeamWorkspace } from "@/components/admin/admin-team";
import { adminTeamSr } from "@/lib/i18n/sr/admin-team";

export const metadata: Metadata = {
  title: `${adminTeamSr.pageTitle} | ScanMe Admin`,
  robots: { index: false, follow: false },
};

export default function TeamPage() {
  return <AdminGuard><AdminShell><AdminTeamErrorBoundary><AdminTeamWorkspace /></AdminTeamErrorBoundary></AdminShell></AdminGuard>;
}
