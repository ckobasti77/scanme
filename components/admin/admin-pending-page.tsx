import { AdminGuard } from "./admin-guard";
import { AdminModuleFoundation } from "./admin-module-foundation";
import { AdminShell } from "./admin-shell";

export function AdminPendingPage({ title }: { title: string }) {
  return (
    <AdminGuard>
      <AdminShell>
        <AdminModuleFoundation title={title} />
      </AdminShell>
    </AdminGuard>
  );
}
