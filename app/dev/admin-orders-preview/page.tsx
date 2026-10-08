import { notFound } from "next/navigation";
import { AdminOrdersPreview } from "@/components/admin/admin-orders";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export default function AdminOrdersPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/operativa/porudzbine">
      <AdminOrdersPreview />
    </AdminShell>
  );
}
