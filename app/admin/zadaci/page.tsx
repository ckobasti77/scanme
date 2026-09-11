import { AdminPendingPage } from "@/components/admin/admin-pending-page";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export default function TasksPage() {
  return <AdminPendingPage title={adminV1Sr.navTasks} />;
}
