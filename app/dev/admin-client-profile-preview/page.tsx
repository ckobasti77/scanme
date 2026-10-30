import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminClientProfilePreview } from "@/components/admin/admin-client-profile";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export const dynamic = "force-dynamic";

export default function AdminClientProfilePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/klijenti"><Suspense fallback={null}><AdminClientProfilePreview /></Suspense></AdminShell>;
}
