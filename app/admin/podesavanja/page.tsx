import { AdminSettingsErrorBoundary, AdminSettingsWorkspace } from "@/components/admin/admin-settings";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { adminSettingsSr } from "@/lib/i18n/sr/admin-settings";

export const metadata: Metadata = { title: adminTitle(adminSettingsSr.title), robots: { index: false, follow: false } };

export default function SettingsPage() {
  return <AdminSettingsErrorBoundary><AdminSettingsWorkspace /></AdminSettingsErrorBoundary>;
}
