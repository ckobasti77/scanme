import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTasksPreview } from "@/components/admin/admin-tasks";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

export default async function AdminTasksPreviewPage({ searchParams }: { searchParams: Promise<{ prikaz?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { prikaz } = await searchParams;
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/zadaci"><AdminViewModeOverride value={parseViewModeParam(prikaz)}><AdminTasksPreview /></AdminViewModeOverride></AdminShell>;
}
