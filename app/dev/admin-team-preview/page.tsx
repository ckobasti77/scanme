import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTeamPreview } from "@/components/admin/admin-team";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export default function AdminTeamPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/tim"><AdminTeamPreview /></AdminShell>;
}
