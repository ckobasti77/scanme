import { notFound } from "next/navigation";
import { AdminOrdersPreview } from "@/components/admin/admin-orders";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { adminOrdersSr } from "@/lib/i18n/sr/admin-orders";
import { PREVIEW_GAME } from "@/components/admin/game/game-fixtures";

export const metadata: Metadata = { title: adminTitle(adminOrdersSr.pageTitle), robots: { index: false, follow: false } };

export default function AdminOrdersPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} previewGame={PREVIEW_GAME} activePathname="/admin/operativa/porudzbine">
      <AdminOrdersPreview />
    </AdminShell>
  );
}
