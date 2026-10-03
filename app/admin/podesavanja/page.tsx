import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminSettingsErrorBoundary, AdminSettingsWorkspace } from "@/components/admin/admin-settings";
import { AdminShell } from "@/components/admin/admin-shell";

export default function SettingsPage() {
  return <AdminGuard><AdminShell><AdminSettingsErrorBoundary><AdminSettingsWorkspace /></AdminSettingsErrorBoundary></AdminShell></AdminGuard>;
}
