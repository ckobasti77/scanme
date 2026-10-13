import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminClientProfilePreview } from "@/components/admin/admin-client-profile";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { PREVIEW_GAME } from "@/components/admin/game/game-fixtures";

export const metadata: Metadata = { title: adminTitle(adminV1Sr.clientsTitle), robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default function AdminClientProfilePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} previewGame={PREVIEW_GAME} activePathname="/admin/klijenti/preview"><Suspense fallback={null}><AdminClientProfilePreview /></Suspense></AdminShell>;
}
