import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTasksPreview } from "@/components/admin/admin-tasks";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export default function AdminTasksPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/zadaci"><AdminTasksPreview /></AdminShell>;
}
