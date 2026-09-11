import { AdminEmptyState, AdminPanel } from "./admin-primitives";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export function AdminDashboardFoundation() {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-[clamp(2.25rem,5vw,4.25rem)] leading-none font-medium tracking-[-0.055em]">
          {adminV1Sr.dashboardTitle}
        </h1>
      </header>
      <AdminPanel className="overflow-hidden">
        <AdminEmptyState
          title={adminV1Sr.dashboardEmptyTitle}
          body={adminV1Sr.dashboardEmptyBody}
          className="min-h-[24rem]"
        />
      </AdminPanel>
    </div>
  );
}
