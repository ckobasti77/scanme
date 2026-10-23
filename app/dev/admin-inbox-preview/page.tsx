import { notFound } from "next/navigation";
import { AdminInboxPreview } from "@/components/admin/admin-inbox";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export default function AdminInboxPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/inbox"><AdminInboxPreview /></AdminShell>;
}
