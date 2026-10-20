import { notFound } from "next/navigation";
import { AdminClientsPreview } from "@/components/admin/admin-clients";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { PREVIEW_GAME } from "@/components/admin/game/game-fixtures";

export const metadata: Metadata = { title: adminTitle(adminV1Sr.clientsTitle), robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function AdminClientsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  const mode = state === "loading" || state === "empty" || state === "error"
    ? state
    : "loaded";
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} previewGame={PREVIEW_GAME} activePathname="/admin/klijenti">
      <AdminClientsPreview mode={mode} />
    </AdminShell>
  );
}
