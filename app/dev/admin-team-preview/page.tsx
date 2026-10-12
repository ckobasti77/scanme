import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTeamPreview } from "@/components/admin/admin-team";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { adminTeamSr } from "@/lib/i18n/sr/admin-team";

export const metadata: Metadata = { title: adminTitle(adminTeamSr.pageTitle), robots: { index: false, follow: false } };

export default function AdminTeamPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/tim"><AdminTeamPreview /></AdminShell>;
}
