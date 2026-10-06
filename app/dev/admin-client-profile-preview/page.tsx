import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminClientProfilePreview } from "@/components/admin/admin-client-profile";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

export const dynamic = "force-dynamic";

export default async function AdminClientProfilePreviewPage({ searchParams }: { searchParams: Promise<{ prikaz?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { prikaz } = await searchParams;
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname="/admin/klijenti"><AdminViewModeOverride value={parseViewModeParam(prikaz)}><Suspense fallback={null}><AdminClientProfilePreview /></Suspense></AdminViewModeOverride></AdminShell>;
}
