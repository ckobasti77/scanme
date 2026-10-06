import { notFound } from "next/navigation";
import { AdminQrPreview } from "@/components/admin/admin-qr";
import { AdminShell } from "@/components/admin/admin-shell";
import { getDict } from "@/lib/i18n";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

const dict = getDict("admin-products");

export default async function AdminQrPreviewPage({ searchParams }: { searchParams: Promise<{ prikaz?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { prikaz } = await searchParams;
  return <AdminShell previewIdentity={dict.fixtureIdentity} activePathname="/admin/operativa/qr"><AdminViewModeOverride value={parseViewModeParam(prikaz)}><AdminQrPreview /></AdminViewModeOverride></AdminShell>;
}
