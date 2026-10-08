import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminSettingsWorkspace } from "@/components/admin/admin-settings";
import { adminSettingsSr as dict } from "@/lib/i18n/sr/admin-settings";

export default function AdminSettingsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={dict.previewBadge} activePathname="/admin/podesavanja"><AdminSettingsWorkspace preview /></AdminShell>;
}
