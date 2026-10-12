import { AdminSettingsErrorBoundary, AdminSettingsWorkspace } from "@/components/admin/admin-settings";

export default function SettingsPage() {
  return <AdminSettingsErrorBoundary><AdminSettingsWorkspace /></AdminSettingsErrorBoundary>;
}
