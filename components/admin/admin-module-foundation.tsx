import { AdminEmptyState, AdminPanel } from "./admin-primitives";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export function AdminModuleFoundation({ title }: { title: string }) {
  return (
    <div className="grid gap-6">
      <h1 className="text-[clamp(2.1rem,4vw,3.75rem)] leading-none font-medium tracking-[-0.05em]">
        {title}
      </h1>
      <AdminPanel className="overflow-hidden">
        <AdminEmptyState
          title={adminV1Sr.moduleUnavailableTitle}
          body={adminV1Sr.moduleUnavailableBody}
        />
      </AdminPanel>
    </div>
  );
}
