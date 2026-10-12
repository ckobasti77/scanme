import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTasksPreview } from "@/components/admin/admin-tasks";
import { PREVIEW_HUD } from "@/components/admin/events/preview-dashboard-fixtures";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { adminTasksSr } from "@/lib/i18n/sr/admin-tasks";

export const metadata: Metadata = { title: adminTitle(adminTasksSr.pageTitle), robots: { index: false, follow: false } };

export default function AdminTasksPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/zadaci" previewHud={PREVIEW_HUD}><AdminTasksPreview /></AdminShell>;
}
