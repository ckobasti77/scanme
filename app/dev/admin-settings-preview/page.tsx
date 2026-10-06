import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminSettingsPreview } from "@/components/admin/admin-settings";
import { adminSettingsSr as dict } from "@/lib/i18n/sr/admin-settings";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

export default async function AdminSettingsPreviewPage({ searchParams }: { searchParams: Promise<{ tab?: string; prikaz?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tab, prikaz } = await searchParams;
  return <AdminShell previewIdentity={dict.previewBadge} activePathname="/admin/podesavanja"><AdminViewModeOverride value={parseViewModeParam(prikaz)}><AdminSettingsPreview tab={tab} /></AdminViewModeOverride></AdminShell>;
}
