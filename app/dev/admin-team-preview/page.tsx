import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTeamPreview } from "@/components/admin/admin-team";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

export default async function AdminTeamPreviewPage({ searchParams }: { searchParams: Promise<{ prikaz?: string; tab?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { prikaz, tab } = await searchParams;
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/tim"><AdminViewModeOverride value={parseViewModeParam(prikaz)}><AdminTeamPreview tab={tab} /></AdminViewModeOverride></AdminShell>;
}
