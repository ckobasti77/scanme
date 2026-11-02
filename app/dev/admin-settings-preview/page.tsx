import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminSettingsWorkspace } from "@/components/admin/admin-settings";
import { adminSettingsSr as dict } from "@/lib/i18n/sr/admin-settings";
import type { Metadata } from "next";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { PREVIEW_GAME } from "@/components/admin/game/game-fixtures";

export const metadata: Metadata = { title: adminTitle(dict.title), robots: { index: false, follow: false } };

export default function AdminSettingsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminShell previewIdentity={dict.previewBadge} previewGame={PREVIEW_GAME} activePathname="/admin/podesavanja"><AdminSettingsWorkspace preview /></AdminShell>;
}
