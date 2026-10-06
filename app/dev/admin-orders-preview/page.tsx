import { notFound } from "next/navigation";
import { AdminOrdersPreview } from "@/components/admin/admin-orders";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

export default async function AdminOrdersPreviewPage({ searchParams }: { searchParams: Promise<{ prikaz?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { prikaz } = await searchParams;
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/operativa/porudzbine">
      <AdminViewModeOverride value={parseViewModeParam(prikaz)}>
        <AdminOrdersPreview />
      </AdminViewModeOverride>
    </AdminShell>
  );
}
